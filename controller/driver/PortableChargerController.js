import path from 'path';
import moment from "moment";
import dotenv from 'dotenv';
import 'moment-duration-format';
import { fileURLToPath } from 'url';
import emailQueue from "../../emailQueue.js";
import validateFields from "../../validation.js";
import { queryDB, insertRecord, updateRecord } from '../../dbUtils.js';
import db from "../../config/db.js";
import { asyncHandler, createNotification, formatNumber, generatePdf, mergeParam, numberToWords, pushNotification } from "../../utils.js";
import { getTotalAmountFromService } from '../PaymentController.js';
dotenv.config();

import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const getActivePodList = asyncHandler(async (req, resp) => {
    const { booking_id, booking_type } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), { booking_id: ["required"], booking_type: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    if (!['PCB', 'CS', 'RSA'].includes(booking_type)) return resp.json({status:0, code:422, message:"Booking type should be PCB, RSA or CS"});

    let query;
    let active_pod_id;
    if(booking_type === 'PCB'){
        query = `SELECT latitude AS lat, longitude AS lon FROM portable_charger_booking WHERE booking_id = ?`;
        const [[{pod_id}]] = await db.execute(`SELECT pod_id FROM portable_charger_booking where booking_id = ?`, [booking_id]);
        active_pod_id = pod_id;

    } else if(booking_type === 'CS') { 
        query = `SELECT pickup_latitude AS lat, pickup_longitude AS lon FROM charging_service WHERE request_id = ?`;

    } else if(booking_type === 'RSA') {
        query = `SELECT pickup_latitude AS lat, pickup_longitude AS lon FROM road_assistance WHERE request_id = ?`;
        const [[{pod_id}]] = await db.execute(`SELECT pod_id FROM road_assistance where request_id = ?`, [booking_id]);
        active_pod_id = pod_id;
    }
    const data = await queryDB(query, [booking_id]);
    if(!data) return resp.json({ status : 0, code :422, message : ["Invalid booking id."]});
    
    const [result] = await db.execute(`SELECT 
        pod_id, pod_name, design_model,
        (6367 * ACOS(COS(RADIANS(?)) * COS(RADIANS(latitude)) * COS(RADIANS(longitude) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(latitude)))) AS distance 
        FROM pod_devices
        ORDER BY CAST(SUBSTRING(pod_name, LOCATE(' ', pod_name) + 1) AS UNSIGNED)
    `, [data.lat, data.lon, data.lat]);

    return resp.json({ status:1, code:200, message:["POD List fetch successfully!"], active_pod_id, data: result });
    // return resp.json({status:1, code:200, message:["POD List fetch successfully!"], data: result });
});

/* RSA - Booking Action */
export const rsaBookingStage = asyncHandler(async (req, resp) => {
    const {rsa_id, booking_id } = mergeParam(req);
    const { isValid, errors }   = validateFields(mergeParam(req), {rsa_id: ["required"], booking_id: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const booking = await queryDB(`SELECT status, created_at, updated_at FROM portable_charger_booking WHERE booking_id=?`, [booking_id]);
    if(!booking) return resp.json({status:0, code:200, message: "Sorry no data found with given order id: " + booking_id});

    const orderStatus  = ['A', 'ER', 'RL', 'CS', 'CC', 'PU', 'C'];
    const placeholders = orderStatus.map(() => '?').join(', ');

    const [bookingTracking] = await db.execute(`SELECT order_status, remarks, image, cancel_reason, cancel_by, longitude, latitude FROM portable_charger_history 
        WHERE booking_id = ? AND rsa_id = ? AND order_status IN (${placeholders})
    `, [booking_id, rsa_id, ...orderStatus]);

    const seconds = Math.floor((booking.updated_at - booking.created_at) / 1000);
    const humanReadableDuration = moment.duration(seconds, 'seconds').format('h [hours], m [minutes]');
    
    return resp.json({
        status: 1,
        code: 200,
        message: ["Booking stage fetch successfully."],
        booking_status: booking.status,
        execution_time: humanReadableDuration,
        booking_history: bookingTracking,
        image_path: `${process.env.DIR_UPLOADS}portable-charger/`
    });
    
});

export const bookingAction = asyncHandler(async (req, resp) => {  
    const {rsa_id, booking_id, reason, latitude, longitude, booking_status, pod_id} = req.body;
    let validationRules = {
        rsa_id         : ["required"], 
        booking_id     : ["required"], 
        latitude       : ["required"], 
        longitude      : ["required"], 
        booking_status : ["required"],
    };
    if (booking_status == "C")  validationRules = { ...validationRules, reason  : ["required"] };
    if (booking_status == "CS") validationRules = { ...validationRules, pod_id  : ["required"] };

    const { isValid, errors } = validateFields(req.body, validationRules);
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    switch (booking_status) {
        case 'A' : return await acceptBooking(req, resp);
        case 'ER': return await driverEnroute(req, resp);
        case 'RL': return await reachedLocation(req, resp);
        case 'CS': return await chargingStart(req, resp);
        case 'CC': return await chargingComplete(req, resp);
        case 'PU': return await chargerPickedUp(req, resp);
        case 'RO': return await reachedOffice(req, resp);
        default: return resp.json({status: 0, code: 200, message: ['Invalid booking status.']});
    }
});

export const rejectBooking = asyncHandler(async (req, resp) => {
    const {rsa_id, booking_id, reason } = mergeParam(req); // latitude, longitude,
    const { isValid, errors } = validateFields(mergeParam(req), {rsa_id: ["required"], booking_id: ["required"], reason: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const checkOrder = await queryDB(`
        SELECT rider_id, 
            (SELECT fcm_token FROM riders WHERE rider_id = portable_charger_booking_assign.rider_id limit 1) AS fcm_token
        FROM 
            portable_charger_booking_assign
        WHERE 
            order_id = ? AND rsa_id = ? AND status = 0
        LIMIT 1
    `,[booking_id, rsa_id]);

    if (!checkOrder) {
        return resp.json({ message: [`Sorry no booking found with this booking id ${booking_id}`], status: 0, code: 404 });
    }

    const insert = await db.execute(
        'INSERT INTO portable_charger_history (booking_id, rider_id, order_status, rsa_id) VALUES (?, ?, "C", ?)',
        [booking_id, checkOrder.rider_id, rsa_id ]
    );
    if(insert.affectedRows == 0) return resp.json({ message: ['Oops! Something went wrong! Please Try Again'], status: 0, code: 200 });

    await insertRecord('portable_charger_booking_rejected', ['booking_id', 'rsa_id', 'rider_id', 'reason'],[booking_id, rsa_id, checkOrder.rider_id, reason]);
    await db.execute(`DELETE FROM portable_charger_booking_assign WHERE order_id=? AND rsa_id=?`, [booking_id, rsa_id]);

    const href    = `portable_charger_booking/${booking_id}`;
    const title   = 'Booking Rejected';
    const message = `Driver has rejected the portable charger booking with booking id: ${booking_id}`;
    await createNotification(title, message, 'Portable Charging Booking', 'Admin', 'RSA', rsa_id, '', href);

    const html = `<html>
        <body>
            <h4>Dear Admin,</h4>
            <p>Driver has rejected the portable charger booking. please assign one Driver on this booking</p> <br />
            <p>Booking ID: ${booking_id}</p>
            <p>Best Regards,<br/> The PlusX Electric Team </p>
        </body>
    </html>`;
    emailQueue.addEmail(process.env.MAIL_POD_ADMIN, `POD Service Booking rejected - ${booking_id}`, html);

    return resp.json({ message: ['Booking has been rejected successfully!'], status: 1, code: 200 });
});

/* POD booking action helper */
const acceptBooking = async (req, resp) => {
    const { booking_id, rsa_id, latitude, longitude } = mergeParam(req);

    //, (SELECT COUNT(id) FROM portable_charger_booking_assign WHERE rsa_id = ? AND status = 1) AS pod_count
    const checkOrder = await queryDB(`
        SELECT rider_id, 
            (SELECT fcm_token FROM riders WHERE rider_id = portable_charger_booking_assign.rider_id limit 1) AS fcm_token
        FROM 
            portable_charger_booking_assign
        WHERE 
            order_id = ? AND rsa_id = ? AND status = 0
        LIMIT 1
    `,[booking_id, rsa_id]);

    if (!checkOrder) {
        return resp.json({ message: [`Sorry no booking found with this booking id ${booking_id}`], status: 0, code: 404 });
    }
    const ordHistoryCount = await queryDB(
        'SELECT COUNT(*) as count FROM portable_charger_history WHERE rsa_id = ? AND order_status = "A" AND booking_id = ?',[rsa_id, booking_id]
    );

    if (ordHistoryCount.count === 0) {
        await updateRecord('portable_charger_booking', {status: 'A', rsa_id}, ['booking_id'], [booking_id]);

        const href    = `portable_charger_booking/${booking_id}`;
        const title   = 'Portable Charging Booking!';
        const message = `Booking Accepted! (${booking_id})`;
        await createNotification(title, message, 'Portable Charging Booking', 'Rider', 'RSA', rsa_id, checkOrder.rider_id, href);
      //  await createNotification(title, message, 'Portable Charging Booking', 'Admin', 'RSA', rsa_id, '', href);
        await pushNotification(checkOrder.fcm_token, title, message, 'RDRFCM', href);

        await db.execute('UPDATE portable_charger_booking_assign SET status = 1 WHERE order_id = ? AND rsa_id = ?', [booking_id, rsa_id]);
        const insert = await insertRecord('portable_charger_history', [
            'booking_id', 'rider_id', 'order_status', 'rsa_id', 'latitude', 'longitude'
        ],[
            booking_id, checkOrder.rider_id, "A", rsa_id, latitude, longitude
        ]);
        if(insert.affectedRows == 0) return resp.json({ message: ['Oops! Something went wrong! Please Try Again'], status: 0, code: 200 });

        // await db.execute('UPDATE rsa SET running_order = running_order + 1 WHERE rsa_id = ?', [rsa_id]);

        return resp.json({ message: ['POD Booking accepted successfully!'], status: 1, code: 200 });
    } else {
        return resp.json({ message: ['Sorry this is a duplicate entry!'], status: 0, code: 200 });
    }
};
const driverEnroute = async (req, resp) => {
    
    const { booking_id, rsa_id, latitude, longitude } = mergeParam(req);

    const checkOrder = await queryDB(`
        SELECT rider_id, 
            (SELECT fcm_token FROM riders WHERE rider_id = portable_charger_booking_assign.rider_id limit 1) AS fcm_token
        FROM 
            portable_charger_booking_assign
        WHERE 
            order_id = ? AND rsa_id = ? AND status = 1
        LIMIT 1
    `,[booking_id, rsa_id]);

    if (!checkOrder) {
        return resp.json({ message: [`Sorry no booking found with this booking id ${booking_id}`], status: 0, code: 404 });
    }
    const ordHistoryCount = await queryDB(
        'SELECT COUNT(*) as count FROM portable_charger_history WHERE rsa_id = ? AND order_status = "ER" AND booking_id = ?', [rsa_id, booking_id]
    );
    if (ordHistoryCount.count === 0) {
        const insert = await db.execute(
            'INSERT INTO portable_charger_history (booking_id, rider_id, order_status, rsa_id, latitude, longitude) VALUES (?, ?, "ER", ?, ?, ?)',
            [booking_id, checkOrder.rider_id, rsa_id, latitude, longitude]
        );
        if(insert.affectedRows == 0) return resp.json({ message: ['Oops! Something went wrong! Please Try Again'], status: 0, code: 200 });

        await updateRecord('portable_charger_booking', {status: 'ER'}, ['booking_id' ], [booking_id ]);

        const href    = `portable_charger_booking/${booking_id}`;
        const title   = 'Portable Charging Booking!';
        const message = `PlusX Electric team is on the way!`;
        await createNotification(title, message, 'Portable Charging Booking', 'Rider', 'RSA', rsa_id, checkOrder.rider_id, href);
        //await createNotification(title, message, 'Portable Charging Booking', 'Admin', 'RSA', rsa_id, '', href);
        await pushNotification(checkOrder.fcm_token, title, message, 'RDRFCM', href);

        return resp.json({ message : ['PlusX Electric team is on the way!  Please have your EV ready for charging.'], status: 1, code: 200 });
    } else {
        return resp.json({ message : ['Sorry this is a duplicate entry!'], status: 0, code: 200 });
    }
};
const reachedLocation = async (req, resp) => {
    const { booking_id, rsa_id, latitude, longitude } = mergeParam(req);

    const checkOrder = await queryDB(`
        SELECT rider_id, 
            (SELECT fcm_token FROM riders WHERE rider_id = portable_charger_booking_assign.rider_id limit 1) AS fcm_token
        FROM 
            portable_charger_booking_assign
        WHERE 
            order_id = ? AND rsa_id = ? AND status = 1
        LIMIT 1
    `,[booking_id, rsa_id]);

    if (!checkOrder) {
        return resp.json({ message: [`Sorry no booking found with this booking id ${booking_id}`], status: 0, code: 404 });
    }
    const ordHistoryCount = await queryDB(
        'SELECT COUNT(*) as count FROM portable_charger_history WHERE rsa_id = ? AND order_status = "RL" AND booking_id = ?',[rsa_id, booking_id]
    );
    if (ordHistoryCount.count === 0) {
        const insert = await db.execute(
            'INSERT INTO portable_charger_history (booking_id, rider_id, order_status, rsa_id, latitude, longitude) VALUES (?, ?, "RL", ?, ?, ?)',
            [booking_id, checkOrder.rider_id, rsa_id, latitude, longitude]
        );
        if(insert.affectedRows == 0) return resp.json({ message: ['Oops! Something went wrong! Please Try Again'], status: 0, code: 200 });

        await updateRecord('portable_charger_booking', {status: 'RL', rsa_id}, ['booking_id'], [booking_id] );

        const href    = `portable_charger_booking/${booking_id}`;
        const title   = 'Portable Charging Booking!';
        const message = `The POD has arrived. Please unlock your EV.`;
        await createNotification(title, message, 'Portable Charging Booking', 'Rider', 'RSA', rsa_id, checkOrder.rider_id, href);
        // await createNotification(title, message, 'Portable Charging Booking', 'Admin', 'RSA', rsa_id, '', href);
        await pushNotification(checkOrder.fcm_token, title, message, 'RDRFCM', href);

        return resp.json({ message: ['The Portable Power Pod has arrived. Please unlock your EV.'], status: 1, code: 200 });
    } else {
        return resp.json({ message: ['Sorry this is a duplicate entry!'], status: 0, code: 200 });
    }
};
const chargingStart = async (req, resp) => {
    const { booking_id, rsa_id, latitude, longitude, pod_id='', guideline='', remark='' } = mergeParam(req);

    if (!req.files || !req.files['image']) return resp.status(405).json({ message: ["Vehicle Image is required"], status: 0, code: 405, error: true });

    const checkOrder = await queryDB(`
        SELECT rider_id, 
            (SELECT fcm_token FROM riders WHERE rider_id = portable_charger_booking_assign.rider_id limit 1) AS fcm_token
        FROM 
            portable_charger_booking_assign
        WHERE 
            order_id = ? AND rsa_id = ? AND status = 1
        LIMIT 1
    `,[booking_id, rsa_id]);
    
    const images = req.files['image'] ? req.files['image'].map(file => file.filename).join('*') : '';

    if (!checkOrder) {
        return resp.json({ message: [`Sorry no booking found with this booking id ${booking_id}`], status: 0, code: 404 });
    }
    const ordHistoryCount = await queryDB(
        'SELECT COUNT(*) as count FROM portable_charger_history WHERE rsa_id = ? AND order_status = "CS" AND booking_id = ?',[rsa_id, booking_id]
    );
    if (ordHistoryCount.count === 0) {
        const podBatteryData = await getPodBatteryData(pod_id);
        const podData        = podBatteryData.data.length > 0 ? JSON.stringify(podBatteryData.data) : null;
        const sumOfLevel     = podBatteryData.sum ?  podBatteryData.sum : '';
        
        const insert = await db.execute(
            'INSERT INTO portable_charger_history (booking_id, rider_id, order_status, rsa_id, latitude, longitude, pod_data, image, guideline, remarks) VALUES (?, ?, "CS", ?, ?, ?, ?, ?, ?, ?)',
            [booking_id, checkOrder.rider_id, rsa_id, latitude, longitude, podData, images, guideline, remark]
        );
        if(insert.affectedRows == 0) return resp.json({ message: ['Oops! Something went wrong! Please Try Again'], status: 0, code: 200 });

        let addressAlert = ( parseInt(guideline) > 0 ) ? remark : '';
        await updateRecord('portable_charger_booking', {status: 'CS', rsa_id, pod_id, start_charging_level: sumOfLevel, address_alert : addressAlert }, ['booking_id'], [booking_id] );
        await updateRecord('pod_devices', { charging_status : 1, latitude, longitude}, ['pod_id'], [pod_id] );

        const href    = `portable_charger_booking/${booking_id}`;
        const title   = 'Portable Charging Booking!';
        const message = `The POD has started charging your EV!`;
        await createNotification(title, message, 'Portable Charging Booking', 'Rider', 'RSA', rsa_id, checkOrder.rider_id, href);
        // await createNotification(title, message, 'Portable Charging Booking', 'Admin', 'RSA', rsa_id, '', href);
        await pushNotification(checkOrder.fcm_token, title, message, 'RDRFCM', href);

        return resp.json({ message: ['Charging has started. The Pod is now powering your EV!'], status: 1, code: 200 });
    } else {
        return resp.json({ message: ['Sorry this is a duplicate entry!'], status: 0, code: 200 });
    }
};
const chargingComplete = async (req, resp) => {
    const { booking_id, rsa_id, latitude, longitude } = mergeParam(req);
    
    const checkOrder = await queryDB(`
        SELECT rider_id, 
            (SELECT fcm_token FROM riders WHERE rider_id = portable_charger_booking_assign.rider_id limit 1) AS fcm_token,
            (SELECT pod_id FROM portable_charger_booking as pcb WHERE pcb.booking_id = portable_charger_booking_assign.order_id limit 1) AS pod_id
        FROM 
            portable_charger_booking_assign
        WHERE 
            order_id = ? AND rsa_id = ? AND status = 1
        LIMIT 1
    `,[booking_id, rsa_id]);

    if (!checkOrder) {
        return resp.json({ message: [`Sorry no booking found with this booking id ${booking_id}`], status: 0, code: 404 });
    }
    const ordHistoryCount = await queryDB(
        'SELECT COUNT(*) as count FROM portable_charger_history WHERE rsa_id = ? AND order_status = "CC" AND booking_id = ?',[rsa_id, booking_id]
    );
    if (ordHistoryCount.count === 0) {

        const podBatteryData = await getPodBatteryData(checkOrder.pod_id);  //POD ID nikalana hoga 
        const podData        = podBatteryData.data ? JSON.stringify(podBatteryData.data) : [];
        const sumOfLevel     = podBatteryData.sum ? podBatteryData.sum : 0;

        const insert = await db.execute(
            'INSERT INTO portable_charger_history (booking_id, rider_id, order_status, rsa_id, latitude, longitude, pod_data) VALUES (?, ?, "CC", ?, ?, ?, ?)',
            [booking_id, checkOrder.rider_id, rsa_id, latitude, longitude, podData]
        );
        if(insert.affectedRows == 0) return resp.json({ message: ['Oops! Something went wrong! Please Try Again'], status: 0, code: 200 });

        await updateRecord('portable_charger_booking', {status: 'CC', rsa_id, end_charging_level:sumOfLevel }, ['booking_id'], [booking_id] );
        await updateRecord('pod_devices', { charging_status : 0 }, ['pod_id'], [checkOrder.pod_id] );

        const href    = `portable_charger_booking/${booking_id}`;
        const title   = 'Portable Charging Booking!';
        const message = `Charging complete. Please lock your EV.`;

        await createNotification(title, message, 'Portable Charging Booking', 'Rider', 'RSA', rsa_id, checkOrder.rider_id, href);
        // await createNotification(title, message, 'Portable Charging Booking', 'Admin', 'RSA', rsa_id, '', href);
       
        await pushNotification(checkOrder.fcm_token, title, message, 'RDRFCM', href);

        const html = `<html>
            <body>
                <h4>Dear ${checkOrder.rider_name}</h4>
                <p>Thank you for choosing PlusX Electric for your Portable EV Charger service. We're pleased to inform you that the service has been successfully completed.</p>
                <p>We truly appreciate your trust in us and look forward to serving you again in the future.</p>
                <p>Best Regards,<br/>PlusX Electric Team </p>
            </body>
        </html>`;
        emailQueue.addEmail(checkOrder.rider_email, 'PlusX Electric: Your Portable EV Charger Service is Now Complete', html); 



        return resp.json({ message: [`Charging complete. Don't forget to lock your EV.`], status: 1, code: 200 });
    } else {
        return resp.json({ message: ['Sorry this is a duplicate entry!'], status: 0, code: 200 });
    }
};
const chargerPickedUp = async (req, resp) => {
    const { booking_id, rsa_id, latitude, longitude, remark='' } = mergeParam(req);
    if (!req.files || !req.files['image']) return resp.status(405).json({ message: ["Vehicle Image is required"], status: 0, code: 405, error: true });
    
    const checkOrder = await queryDB(`
        SELECT rider_id, 
            (SELECT fcm_token FROM riders WHERE rider_id = portable_charger_booking_assign.rider_id limit 1) AS fcm_token,
            (select pod_id from portable_charger_booking as pb where pb.booking_id = portable_charger_booking_assign.order_id limit 1) as pod_id
        FROM 
            portable_charger_booking_assign
        WHERE 
            order_id = ? AND rsa_id = ? AND status = 1
        LIMIT 1
    `,[booking_id, rsa_id]);

    const images = req.files['image'] ? req.files['image'].map(file => file.filename).join('*') : '';
    
    if (!checkOrder) {
        return resp.json({ message: [`Sorry no booking found with this booking id ${booking_id}`], status: 0, code: 404 });
    }
    const ordHistoryCount = await queryDB(
        'SELECT COUNT(*) as count FROM portable_charger_history WHERE rsa_id = ? AND order_status = "PU" AND booking_id = ?',[rsa_id, booking_id]
    );
    if (ordHistoryCount.count === 0) {
        const insert = await db.execute(
            'INSERT INTO portable_charger_history (booking_id, rider_id, order_status, rsa_id, latitude, longitude, image, remarks) VALUES (?, ?, "PU", ?, ?, ?, ?, ?)',
            [booking_id, checkOrder.rider_id, rsa_id, latitude, longitude, images, remark]
        );
        if(insert.affectedRows == 0) return resp.json({ message: ['Oops! Something went wrong! Please Try Again'], status: 0, code: 200 });

        await updateRecord('portable_charger_booking', {status: 'PU', rsa_id}, ['booking_id'], [booking_id] );
        if(checkOrder.pod_id) {
            await updateRecord('pod_devices', { latitude, longitude}, ['pod_id'], [checkOrder.pod_id] );
        }
        // const invoiceId   = booking_id.replace('PCB', 'INVPC');
        // const bookingData = await getTotalAmountFromService(booking_id, 'PCB');
       
        // const data = {
        //     invoice_id   : invoiceId,
        //     booking_id   : booking_id,
        //     rider_name   : bookingData.data.rider_name,
        //     invoice_date : moment().utcOffset('+04:00').format('MMM D, YYYY'),
        //     kw          : bookingData.data.kw,
        //     currency    : 'AED',
        //     kw_dewa_amt : bookingData.data.kw_dewa_amt,
        //     kw_cpo_amt  : bookingData.data.kw_cpo_amt,
        //     delv_charge : (bookingData.data.delv_charge - (bookingData.data.kw_dewa_amt + bookingData.data.kw_cpo_amt) ),
        //     t_vat_amt   : ( bookingData.data.delv_charge * 5) / 100, //bookingData.data.t_vat_amt,
        //     total_amt   : bookingData.data.delv_charge,
        //     dis_price   : 0
        // };
        // if( bookingData.data.discount > 0 ) {
        //     const dis_price = ( data.total_amt  * bookingData.data.discount ) /100;
        //     const total_amt  = (data.total_amt - dis_price) ? (data.total_amt - dis_price) : 0;
            
        //     data.dis_price  = dis_price;
        //     data.t_vat_amt  = Math.floor(( total_amt ) * 5) / 100;
        //     data.total_amt  = total_amt + ( Math.floor(( total_amt ) * 5) / 100 );
        // } else {
        //     data.total_amt  = bookingData.data.kw_dewa_amt + bookingData.data.kw_cpo_amt + data.delv_charge + data.t_vat_amt;
        // }
        
        // const invoiceData  = { data, numberToWords, formatNumber  };
        // const templatePath = path.join(__dirname, '../../views/mail/portable-charger-invoice.ejs');
        // const filename     = `${invoiceId}-invoice.pdf`;
        // const savePdfDir   = 'portable-charger-invoice';
        // const pdf          = await generatePdf(templatePath, invoiceData, filename, savePdfDir, req);

        // if(!pdf || !pdf.success){
        //     return resp.json({ message: ['Failed to generate invoice. Please Try Again!'], status: 0, code: 200 });
        // }
        // if(pdf.success){
            // const html = `<html>
            //     <body>
            //         <h4>Dear ${bookingData.data.rider_name}</h4>
            //         <p>We hope you're doing well!</p>
            //         <p>Thank you for choosing PlusX Electric for your Portable EV Charger service. We're pleased to inform you that the service has been successfully completed.</p>
            //         <p>We truly appreciate your trust in us and look forward to serving you again in the future.</p>
            //         <p> Regards,<br/>PlusX Electric Team </p>
            //     </body>
            // </html>`;
            // , and the details of your invoice are attached
            // const attachment = {
            //     filename: `${invoiceId}-invoice.pdf`, path: pdf.pdfPath, contentType: 'application/pdf'
            // };
        
            // emailQueue.addEmail(bookingData.data.rider_email, 'PlusX Electric: Your Portable EV Charger Service is Now Complete', html); // , attachment
        // }
        await portableChargerInvoice(checkOrder.rider_id, booking_id); 
        return resp.json({ message: ['Portable Charger picked-up successfully!'], status: 1, code: 200 });
    } else {
        return resp.json({ message: ['Sorry this is a duplicate entry!'], status: 0, code: 200 });
    }
};
const reachedOffice = async (req, resp) => {
    const { booking_id, rsa_id, latitude, longitude } = mergeParam(req);
    
    const checkOrder = await queryDB(`
        SELECT rider_id, 
            (select pod_id from portable_charger_booking as pb where pb.booking_id = portable_charger_booking_assign.order_id limit 1) as pod_id
        FROM 
            portable_charger_booking_assign
        WHERE 
            order_id = ? AND rsa_id = ? AND status = 1
        LIMIT 1
    `,[booking_id, rsa_id]);

    if (!checkOrder) {
        return resp.json({ message: [`Sorry no booking found with this booking id ${booking_id}`], status: 0, code: 404 });
    }
    const ordHistoryCount = await queryDB(
        'SELECT COUNT(*) as count FROM portable_charger_history WHERE rsa_id = ? AND order_status = "RO" AND booking_id = ?', [rsa_id, booking_id]
    );
    if (ordHistoryCount.count === 0) {
        const insert = await db.execute(
            'INSERT INTO portable_charger_history (booking_id, rider_id, order_status, rsa_id, latitude, longitude) VALUES (?, ?, "RO", ?, ?, ? )',
            [booking_id, checkOrder.rider_id, rsa_id, latitude, longitude]
        );
        if(insert.affectedRows == 0) return resp.json({ message: ['Oops! Something went wrong! Please Try Again'], status: 0, code: 200 });

        await updateRecord('portable_charger_booking', {status: 'RO', rsa_id}, ['booking_id'], [booking_id] );
        await db.execute(`DELETE FROM portable_charger_booking_assign WHERE rsa_id = ? and order_id = ?`, [rsa_id, booking_id]);
        
        if(checkOrder.pod_id) {
            await updateRecord('pod_devices', { latitude, longitude}, ['pod_id'], [checkOrder.pod_id] );
        }
        return resp.json({ message: ['POD reached the office successfully!'], status: 1, code: 200 });
    } else {
        return resp.json({ message: ['Sorry this is a duplicate entry!'], status: 0, code: 200 });
    }
};

/* Save POD Charging History */
export const storePodChargerHistory = asyncHandler(async (req, resp) => {
    const { rsa_id, pod_id, charging_status, latitude, longitude } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rsa_id: ["required"], pod_id: ["required"], charging_status: ["required"], latitude: ["required"], longitude: ["required"] });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    if (!['CS', 'CE'].includes(charging_status)) return resp.json({status:0, code:422, message:"Status should be CS or CE"});

    const podBatteryData = await getPodBatteryData(pod_id);
    const podData        = podBatteryData.data.length > 0 ? JSON.stringify(podBatteryData.data) : null;
    const sumOfLevel     = podBatteryData.sum ?  podBatteryData.sum : '';
    const status         = charging_status === 'CS' ? 1 : 2;
    let   isStored       = 0;
    
    if(charging_status === 'CS'){
        const insert = await insertRecord('pod_charge_history', 
            ['pod_id', 'start_charging_level', 'pod_data_start', 'status', 'longitude', 'latitude'],
            [pod_id, sumOfLevel, podData, status, latitude, longitude]
        );
        isStored = insert.affectedRows > 0 ? 1 : 0;
    }
    if(charging_status === 'CE'){
        const update = await updateRecord('pod_charge_history', {end_charging_level: sumOfLevel, pod_data_end: podData, status, latitude, longitude}, ['pod_id'], [pod_id]);
        isStored = update.affectedRows > 0 ? 1 : 0;
    }

    return resp.json({
        status: isStored ? 1 : 0,
        message: isStored ? 'POD charger history saved successfully' : 'Failed to store, Please Try Again.'
    });

});

/* POD Battery */
const getPodBatteryData = async (pod_id) => {
    try {
        // const { pod_id, } = req.body;
        // const { isValid, errors } = validateFields(req.body, {
        //     pod_id : ["required"]
        // });
        // if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

        const [chargerDetails] = await db.execute(`
            SELECT 
                battery_id, capacity, rssi, cells, temp1, temp2, temp3, current, voltage, percentage, charge_cycle, latitude, longitude, cells 
            FROM 
                pod_device_battery 
            WHERE 
                pod_id = ?`, 
            [pod_id]
        );
        const sum = chargerDetails.map( obj  => (obj.percentage || 0).toFixed(2) ) ;
        const returnObj = {
            sum  : sum.join(','),
            data : chargerDetails,
        };
        return returnObj;
    } catch (error) {
    
        const returnObj = {
            sum  : '',
            data : [],
        };
        return returnObj ;
    }
}

// ye new bana hai 
const portableChargerInvoice = async (rider_id, request_id ) => {
    try {
        const checkOrder = await queryDB(` SELECT payment_intent_id
            FROM 
                portable_charger_booking 
            WHERE 
                booking_id = ? AND rider_id = ?
            LIMIT 1
        `,[request_id, rider_id]);

        if (!checkOrder) {
            return { status : 0  };
        }
        const payment_intent_id = checkOrder.payment_intent_id;
        const invoiceId         = request_id.replace('PCB', 'INVPC');
        const createObj = {
            invoice_id     : invoiceId,
            request_id     : request_id,
            rider_id       : rider_id,
            invoice_date   : moment().format('YYYY-MM-DD HH:mm:ss'),
            payment_status : 'Approved'
        }
        if(payment_intent_id && payment_intent_id.trim() != '' ){
            const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
            // console.log(paymentIntent)
            const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
            const cardData = {
                brand     : charge.payment_method_details.card.brand,
                country   : charge.payment_method_details.card.country,
                exp_month : charge.payment_method_details.card.exp_month,
                exp_year  : charge.payment_method_details.card.exp_year,
                last_four : charge.payment_method_details.card.last4,
            };
            createObj.amount            = charge.amount;  
            createObj.payment_intent_id = charge.payment_intent;  
            createObj.payment_method_id = charge.payment_method;  
            createObj.payment_cust_id   = charge.customer;  
            createObj.charge_id         = charge.id;  
            createObj.transaction_id    = charge.payment_method_details.card.three_d_secure?.transaction_id || null;  
            createObj.payment_type      = charge.payment_method_details.type;  
            createObj.currency          = charge.currency;  
            createObj.invoice_date      = moment.unix(charge.created).format('YYYY-MM-DD HH:mm:ss');
            createObj.receipt_url       = charge.receipt_url;
            createObj.card_data         = cardData;
        }
        // console.log(createObj);
        const columns = Object.keys(createObj);
        const values  = Object.values(createObj);
        const insert  = await insertRecord('portable_charger_invoice', columns, values);
        
        return { status: (insert.affectedRows > 0) ? 1 : 0 };
        
    } catch (error) {
        console.log(error);
        return { status:0  };
    }
};
