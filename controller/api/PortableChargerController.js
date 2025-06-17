// import path from 'path';
import moment from "moment-timezone";
import dotenv from 'dotenv';
import 'moment-duration-format';
// import { fileURLToPath } from 'url';
import emailQueue from "../../emailQueue.js";
import validateFields from "../../validation.js";
import { queryDB, getPaginatedData, insertRecord, updateRecord } from '../../dbUtils.js';
import db from "../../config/db.js";
import { asyncHandler, createNotification, formatDateInQuery, formatDateTimeInQuery, mergeParam, pushNotification, checkCoupon } from "../../utils.js";
dotenv.config();
import { tryCatchErrorHandler } from "../../middleware/errorHandler.js";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname  = path.dirname(__filename);

export const chargerList = asyncHandler(async (req, resp) => {
    const {rider_id, page_no } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], page_no: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const result = await getPaginatedData({
        tableName  : 'portable_charger',
        columns    : 'charger_id, charger_name, charger_price, charger_feature, image, charger_type',
        sortColumn : 'id',
        sortOrder  : 'ASC',
        page_no,
        limit      : 10,
        whereField : ['status'],
        whereValue : ['1']
    });

    const [slotData] = await db.execute(`SELECT slot_id, start_time, end_time, booking_limit FROM portable_charger_slot WHERE status = ?`, [1]);

    return resp.json({
        status: 1,
        code: 200,
        message: ["Portable Charger List fetch successfully!"],
        data: result.data,
        slot_data: slotData,
        total_page: result.totalPage,
        total: result.total,
        base_url: `${req.protocol}://${req.get('host')}/uploads/portable-charger/`,
    });
});

export const getPcSlotList = asyncHandler(async (req, resp) => {
    const { slot_date, rider_id } = mergeParam(req);
    if(!slot_date) return resp.json({status:0, code:422, message: ['slot date is required']});
    
    const fSlotDate = moment(slot_date, 'YYYY-MM-DD').format('YYYY-MM-DD');
    
    let query = `SELECT slot_id, ${formatDateInQuery([('slot_date')])}, start_time, end_time, booking_limit`;
    
    if(fSlotDate >=  moment().format('YYYY-MM-DD')){
        query += `, (SELECT COUNT(id) FROM portable_charger_booking AS pod WHERE pod.slot_time = portable_charger_slot.start_time AND pod.slot_date = '${slot_date}' AND status NOT IN ("C")) AS slot_booking_count`;
    }
    query += ` FROM portable_charger_slot WHERE status = ? AND slot_date = ? ORDER BY start_time ASC`;
    // console.log(query) , "PNR"  "PU", "RO"
    const [slot] = await db.execute(query, [1, fSlotDate]);
    
    // const {is_booking} = await queryDB(`SELECT EXISTS (SELECT 1 FROM portable_charger_booking WHERE slot_date=? AND status NOT IN ("C") AND rider_id=? ) AS is_booking`, [fSlotDate, rider_id]);

    if(moment(fSlotDate).day() === 0) { 
        slot.forEach((val) => {
            val.booking_limit      = 0;
            val.slot_booking_count = 0;
        })
    }
    // let timeZone = moment().tz("Asia/Dubai");
    // let prevDay  = timeZone.subtract(28, 'hours').format('YYYY-MM-DD HH:mm:ss');

    // const {last_cancel_booking} = await queryDB(`SELECT EXISTS (SELECT 1 FROM portable_charger_booking WHERE rider_id = ? AND status = 'C' and created_at >= ? ) AS last_cancel_booking`, [rider_id, prevDay]);
    // console.log(slot)
    return resp.json({ 
        message    : "Slot List fetch successfully!",  
        data       : slot, 
        is_booking : 0, 
        status     : 1, 
        code       : 200, 
        alert2     : "The slots for the selected date are fully booked. Please select another date to book the POD for your EV.",
        alert         : "",
        booking_price : 1
        // alert: "To ensure a smooth experience and efficient service, users can make only one booking per day. This helps maintain availability for all. Thank you for your understanding.",
    });
});

export const chargerBooking = asyncHandler(async (req, resp) => {

    const { rider_id, user_name, country_code, contact_no, address, latitude, longitude, parking_number='',
        parking_floor='', vehicle_id, slot_date, slot_time, slot_id, service_name, service_type, service_feature, service_price = 0, address_id, device_name ='', coupon_code=''
    } = mergeParam(req); //, area

    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id        : ["required"],
        user_name       : ["required"],
        country_code    : ["required"],
        contact_no      : ["required"],
        address         : ["required"],
        latitude        : ["required"],
        longitude       : ["required"],
        // parking_number  : ["required"],
        // parking_floor   : ["required"],
        vehicle_id      : ["required"],
        slot_date       : ["required"],
        slot_time       : ["required"],
        slot_id         : ["required"],
        service_name    : ["required"],
        service_type    : ["required"],
        service_feature : ["required"],
        address_id      : ["required"],
        // area            : ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
    // const conn = await startTransaction();
    try {
        // await conn.beginTransaction(); 
        // (SELECT count(id) from riders_vehicles where rider_id =? and vehicle_id = ? ) as vehicle_count,
        const riderAddress = await queryDB(`
            SELECT 
                landmark, (SELECT address_alert from portable_charger_booking where rider_id =? and address = ? order by id desc LIMIT 1) as address_alert,
                (SELECT CONCAT(vehicle_make, ", ", vehicle_model, ", ", vehicle_specification, ", ", emirates, "-", vehicle_code, "-", vehicle_number) FROM riders_vehicles where rider_id =? and vehicle_id = ? ) AS vehicle_data,
                ( SELECT portable_price FROM booking_price LIMIT 1) as booking_price,
                
            FROM 
                rider_address
            WHERE 
                rider_id =? and address_id = ? order by id desc
            LIMIT 1 `,
        [ rider_id, address, rider_id, vehicle_id, rider_id, address_id ]);

        if(!riderAddress) return resp.json({ message : ["Address Id not valid!"], status: 0, code: 422, error: true });
        if(riderAddress.vehicle_data == '') return resp.json({ message : ["Vehicle Id not valid!"], status: 0, code: 422, error: true });

        const vatAmt       = Math.floor(( parseFloat(riderAddress.booking_price) ) * 5) / 100; 
        const bookingPrice = Math.floor( ( parseFloat(riderAddress.booking_price) + vatAmt ) * 100) ;

        if(parseFloat(service_price) != bookingPrice && coupon_code == '') { 
            return resp.json({ message : ['coupon_code is required'], status: 0, code: 422, error: true });
        }
        else if(parseFloat(service_price) != bookingPrice && coupon_code) {
            const servicePrice = parseFloat(service_price) ;
            const couponData   = await checkCoupon(rider_id, 'POD-On Demand Service', coupon_code);
            
            if(couponData.status == 0 ){
                return resp.json({ message : [couponData.message], status: 0, code: 422, error: true });

            } else if(servicePrice != couponData.service_price ){
                return resp.json({ message : ['Booking price is not valid!'], status: 0, code: 422, error: true, bookingPrice : couponData.service_price });
            }
        }  
        // return resp.json({ message : ['Service price Sahi hai!'], status: 1, bookingPrice });

        const addressAlert = riderAddress.address_alert || '';
        const area         = riderAddress.landmark;
        const vehicle_data = riderAddress.vehicle_data;

        const fSlotDateTime = moment(slot_date + ' ' + slot_time, 'YYYY-MM-DD HH:mm:ss').format('YYYY-MM-DD HH:mm:ss')
        const currDateTime  = moment().utcOffset(4).format('YYYY-MM-DD HH:mm:ss');
        if (fSlotDateTime < currDateTime) return resp.json({status: 0, code: 422, message: ["Invalid slot, Please select another slot"]});

        const fSlotDate = moment(slot_date, 'YYYY-MM-DD').format('YYYY-MM-DD');
        const currDate  = moment().format('YYYY-MM-DD');

        // 1. Lock all bookings for this slot
        const [lockedRows] = await db.execute(
            `SELECT
                id
            FROM portable_charger_booking
            WHERE
                slot_time = ? AND slot_date = ? AND status NOT IN ('C')
            FOR UPDATE`,
            [slot_time, fSlotDate]
        ); //, 'PNR', 'RO',  'PU', 
        const bookingCount = lockedRows.length;

        // 2. Get slot limit , current_count 
        const [slotLimitRows] = await db.execute( `
            SELECT
                booking_limit
            FROM 
                portable_charger_slot
            WHERE
                slot_date = ? AND start_time = ? LIMIT 1 
            FOR UPDATE`,
            [fSlotDate, slot_time]
        );
        if (slotLimitRows.length === 0) {
            return resp.json({ message : ["The slot you have selected is invalid!"], status: 0, code: 422, error: true });
        }
        const bookingLimit = slotLimitRows[0].booking_limit;
        // /console.log("Booking Count:", bookingCount, "Limit:", bookingLimit);

        // 3.  Double-check limit AFTER locking
        if (bookingCount >= bookingLimit) {
            // await conn.rollback(); // Rollback before returning! The slot you selected has already been booked. Please select another slot  The slot you have selected is already booked. Please select another slot
            return resp.json({ message : ["The slot you selected has already been booked. Please select another slot"], status: 0, code: 422, error: true });
        }
        if (service_type.toLowerCase() === "get monthly subscription") {
            const [subsCountRows] = await db.execute(`SELECT COUNT(*) AS count FROM portable_charger_subscription WHERE rider_id = ? AND (total_booking >= 10 OR expiry_date < ?) `,
                [rider_id, currDate]
            );
            const subsCount = subsCountRows[0].count;
            if (subsCount > 0) {
                // await conn.rollback();
                return resp.json({ message: ["Subscription limit exceeded or expired!"], status: 0, code: 422, error: true });
            }
        }
        const insert = await insertRecord('portable_charger_booking', [
            'booking_id', 'rider_id', 'vehicle_id', 'service_name', 'service_price', 'service_type', 'service_feature', 'user_name', 'country_code', 'contact_no', 'slot', 'slot_date', 'slot_time', 'address', 'latitude', 'longitude', 'status', 'address_alert', 'parking_number', 'parking_floor', 'address_id', 'device_name', 'area', 'vehicle_data'
        ], [
            'PCB', rider_id, vehicle_id, service_name, service_price, service_type, service_feature, user_name, country_code, contact_no, slot_id, fSlotDate, slot_time, address, latitude, longitude, 'PNR', addressAlert, parking_number, parking_floor, address_id, device_name, area, vehicle_data
        ]); 

        if(insert.affectedRows == 0) {
            // await conn.rollback(); // Rollback before returning!
           return resp.json({status:0, code:200, message: ["Oops! Something went wrong. Please try again."]});
        }
        const booking_id = 'PCB' + String( insert.insertId ).padStart(4, '0');
        await updateRecord('portable_charger_booking', { booking_id : booking_id }, ['id'], [insert.insertId] );

        // await conn.commit();
        return resp.json({
            status        : 1,
            code          : 200,
            booking_id    : booking_id,
            service_price : service_price,
            message       : ["Booking Request Received!."]
        });

    } catch(err) {
        // await conn.rollback();
        console.log("Transaction failed:", err);
        tryCatchErrorHandler(req.originalUrl, err, resp);

    } finally {
        // if (conn) conn.release();
    }
});

export const chargerBookingList = asyncHandler(async (req, resp) => {
    const {rider_id, page_no, bookingStatus } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id      : ["required"], 
        page_no       : ["required"],
        bookingStatus : ["required"]
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const limit           = 10;
    const start           = ( page_no * limit ) - limit;

    let statusCondition = (bookingStatus == 'CM' ) ? `status IN (?, ?, ?)` : `status IN (?)`;
    let statusParams    = (bookingStatus == 'C' ) ? ['C'] : ['RO', 'PU', 'CC'];
    statusParams        = (bookingStatus == 'S' ) ? ['CNF'] : statusParams;

    // const statusCondition = (history && history == 1) ? `status IN (?, ?, ?)` : `status NOT IN (?, ?, ?)`;
    // const statusParams    = ['PU', 'C', 'RO'];
    const orderBy = 'ORDER BY id ASC'; //(bookingStatus == 'CM' ) ? 'ORDER BY slot_date ASC, slot_time ASC' : 'ORDER BY id DESC';

    const totalQuery = `SELECT COUNT(*) AS total FROM portable_charger_booking WHERE rider_id = ? AND ${statusCondition}`;
    
    const [totalRows] = await db.execute(totalQuery, [rider_id, ...statusParams]);
    const total       = totalRows[0].total;
    const totalPage   = Math.max(Math.ceil(total / limit), 1);

    const bookingsQuery = `SELECT rescheduled_booking, booking_id, service_name, ROUND(portable_charger_booking.service_price/100, 2) AS service_price, service_type, user_name, country_code, contact_no, slot_time, status, 
        ${formatDateTimeInQuery(['created_at'])}, ${formatDateInQuery(['slot_date'])}
        FROM portable_charger_booking WHERE rider_id = ? AND ${statusCondition} ${orderBy} LIMIT ${parseInt(start)}, ${parseInt(limit)}
    `;
    const [bookingList] = await db.execute(bookingsQuery, [rider_id, ...statusParams]);

    const inProcessQuery = `SELECT rescheduled_booking, booking_id, service_name, ROUND(portable_charger_booking.service_price/100, 2) AS service_price, service_type, user_name, country_code, contact_no, slot_time, status, 
        ${formatDateTimeInQuery(['created_at'])}, ${formatDateInQuery(['slot_date'])}
        FROM portable_charger_booking WHERE rider_id = ? AND status NOT IN (?, ?, ?, ?, ?, ?) ${orderBy} LIMIT ${parseInt(start)}, ${parseInt(limit)}
    `;
    const inProcessParams    = ['CNF', 'C', 'PU', 'RO', 'PNR', 'CC'];
    const [inProcessBookingList] = await db.execute(inProcessQuery, [rider_id, ...inProcessParams]);

    return resp.json({
        message    : ["Portable Charger Booking List fetched successfully!"],
        data       : bookingList,
        total_page : totalPage,
        inProcessBookingList,
        status     : 1,
        code       : 200,
        base_url   : `${req.protocol}://${req.get('host')}/uploads/portable-charger/`,
        noResultMsg : 'There are no recent bookings. Please schedule your booking now.'
    });
});

export const chargerBookingDetail = asyncHandler(async (req, resp) => {
    const {rider_id, booking_id } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], booking_id: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    const booking = await queryDB(`
        SELECT 
            booking_id, rescheduled_booking, rider_id, rsa_id, charger_id, vehicle_id, vehicle_data, service_name, service_type, service_feature, status, user_name, country_code, contact_no, slot, slot_date, slot_time, address, pod_id, parking_number, parking_floor, payment_intent_id, address_id, area, device_name, ROUND(portable_charger_booking.service_price / 100, 2) AS service_price, 
            ${formatDateTimeInQuery(['created_at', 'updated_at'])}, ${formatDateInQuery(['slot_date'])} 
        FROM 
            portable_charger_booking 
        WHERE 
            rider_id = ? AND booking_id = ? 
        LIMIT 1`, 
    [rider_id, booking_id]);

    if (booking && ( booking.status == 'CS' || booking.status == 'PU' || booking.status == 'RO' ) ) {
        const invoice_id = booking.booking_id.replace('PCB', 'INVPC');
        booking.invoice_url = `${req.protocol}://${req.get('host')}/public/portable-charger-invoice/${invoice_id}-invoice.pdf`;
    }
    if(booking.vehicle_data == '' || booking.vehicle_data == null) {
        const vehicledata = await queryDB(`
            SELECT                 
                vehicle_make, vehicle_model, vehicle_specification, emirates, vehicle_code, vehicle_number
            FROM 
                riders_vehicles
            WHERE 
                rider_id = ? and vehicle_id = ? 
            LIMIT 1 `,
        [ rider_id, booking.vehicle_id ]);
        if(vehicledata) {
            booking.vehicle_data = vehicledata.vehicle_make + ", " + vehicledata.vehicle_model+ ", "+ vehicledata.vehicle_specification+ ", "+ vehicledata.emirates+ "-" + vehicledata.vehicle_code + "-"+ vehicledata.vehicle_number ;
        }
    }
    const [history] = await db.execute(`
        SELECT 
            order_status, cancel_by, cancel_reason as reason, rsa_id, ${formatDateTimeInQuery(['created_at'])}, image, remarks,   
            (select rsa.rsa_name from rsa where rsa.rsa_id = portable_charger_history.rsa_id) as rsa_name
        FROM 
            portable_charger_history 
        WHERE 
            booking_id = ? order by id asc`, 
        [booking_id]
    );
    // let seen = 0;
    // const updated = history.map(e => e.order_status === "CNF" && ++seen === 2 ? { ...e, order_status: "RS" } : e);
    const order_status = history.filter(item => item.order_status === 'CNF');
    if(order_status.length > 1) {

        const matchingIndexes = history.map((item, index) => item.order_status === 'CNF' ? index : -1)
            .filter(index => index !== -1);

        const lastValue                 = matchingIndexes[matchingIndexes.length - 1];
        history[lastValue].order_status = 'RS'
    }
    return resp.json({
        message         : ["POD Booking Details Service fetched successfully!"],
        data            : booking,
        service_history : history,
        status          : 1,
        code            : 200,
    });
});

export const getPcSubscriptionList = asyncHandler(async (req, resp) => {
    const { rider_id } = mergeParam(req);
    if(!rider_id) return resp.json({status: 0, code: 200, error: true, message: ["Rider Id is required"]});

    const data = await queryDB(`
        SELECT subscription_id, amount, expiry_date, booking_limit, total_booking, payment_date 
        FROM portable_charger_subscriptions WHERE rider_id = ? ORDER BY id DESC
    `, [rider_id]);

    if(data?.amount){
        data.amount /= 100; 
    }
    const sPrice = (data && data.expiry_date > moment().format("YYYY-MM-DD") && data.total_booking >= 10) ? 75 : 750;

    return resp.json({
        message: [ "Subscription Details fetch successfully!" ],
        data: data,
        status: 1,
        subscription_price: sPrice,
        code: 200,
        subscription_img: `${req.protocol}://${req.get('host')}/public/pod-no-subscription.jpeg`,
    });
});

/* Invoice */
export const invoiceList = asyncHandler(async (req, resp) => {
    const {rider_id, page_no, orderStatus } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], page_no: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    let whereField = ['rider_id'];
    let whereValue = [rider_id];

    if(orderStatus){
        whereField.push('payment_status');
        whereValue.push(orderStatus);
    }
    const result = await getPaginatedData({
        tableName : 'portable_charger_invoice',
        columns   : `invoice_id, amount, payment_status, invoice_date, currency, 
            (select concat(name, ",", country_code, "-", contact_no) from portable_charger_booking as pcb where pcb.booking_id = portable_charger_invoice.request_id limit 1)
            AS riderDetails`,
        sortColumn : 'id',
        sortOrder  : 'DESC',
        page_no,
        limit   : 10,
        whereField,
        whereValue
    });

    return resp.json({
        status     : 1,
        code       : 200,
        message    : ["Pick & Drop Invoice List fetch successfully!"],
        data       : result.data,
        total_page : result.totalPage,
        total      : result.total,
        base_url   : `${req.protocol}://${req.get('host')}/uploads/offer/`,
    });
});
export const invoiceDetails = asyncHandler(async (req, resp) => {
    const {rider_id, invoice_id } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], invoice_id: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const invoice = await queryDB(`
        SELECT 
            invoice_id, amount as price, payment_status, invoice_date, currency, payment_type, pcb.user_name, pcb.country_code, pcb.contact_no, pcb.address, pcb.booking_id, 
            cs.slot_date, pcb.slot_time, (select rider_email from riders as rd where rd.rider_id = portable_charger_invoice.rider_id limit 1) as rider_email'
        FROM 
            portable_charger_invoice AS pci
        LEFT JOIN
            portable_charger_booking AS pcb ON pcb.booking_id = pci.request_id
        LEFT JOIN 
            portable_charger_slot AS cs ON cs.slot_id = pcb.slot
        WHERE 
            pci.invoice_id = ?
    `, [invoice_id]);

    invoice.invoice_url = `${req.protocol}://${req.get('host')}/uploads/portable-charger-invoice/${invoice_id}-invoice.pdf`;

    return resp.json({
        message : ["Pick & Drop Invoice Details fetch successfully!"],
        data    : invoice,
        status  : 1,
        code    : 200,
    });
});

/* User Cancel Booking */
export const userCancelPCBooking = asyncHandler(async (req, resp) => {
    const { rider_id, booking_id, reason='' } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], booking_id: ["required"] });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
 
    const checkOrder = await queryDB(`
        SELECT  
            pcb.rsa_id, pcb.address, pcb.slot_time, pcb.user_name, DATE_FORMAT(pcb.slot_date, '%Y-%m-%d') AS slot_date, concat( pcb.country_code, "-", pcb.contact_no) as contact_no, riders.rider_email , riders.rider_name, riders.fcm_token, rsa.fcm_token as rsa_fcm_token
        FROM  
            portable_charger_booking pcb
        LEFT JOIN  
            riders on riders.rider_id=pcb.rider_id 
        LEFT JOIN 
            rsa ON  rsa.rsa_id = pcb.rsa_id 
        WHERE 
            pcb.booking_id =? AND pcb.rider_id = ? AND pcb.status IN ('CNF', 'A') 
    `, [booking_id, rider_id]);
 
    if (!checkOrder) {
        return resp.json({ message: [`Sorry no booking found with this booking id ${booking_id}`], status: 0, code: 404 });
    }
    let slotDateTime = moment(`${checkOrder.slot_date} ${checkOrder.slot_time}`).format('YYYY-MM-DD HH:mm:ss');
    let dubaiTime    = moment.tz("Asia/Dubai").format('YYYY-MM-DD HH:mm:ss');
    
    let cancellationDeadline = moment(slotDateTime).subtract(1, 'hours').format('YYYY-MM-DD HH:mm:ss');
    if (dubaiTime > cancellationDeadline) {
        return resp.json({
            status  : 0,
            code    : 422,
            message: ['Please note: Cancellations aren`t allowed within 1 hours of the scheduled time.']
        });
    }
    const insert = await db.execute(
        'INSERT INTO portable_charger_history (booking_id, rider_id, order_status, rsa_id, cancel_by, cancel_reason) VALUES (?, ?, "C", ?, "User", ?)',
        [booking_id, rider_id, checkOrder.rsa_id, reason]
    );
    if (insert.affectedRows == 0) return resp.json({ message: ['Oops! Something went wrong! Please Try Again'], status: 0, code: 200 });
 
    await updateRecord('portable_charger_booking', { status : 'C' }, ['booking_id'], [booking_id]);
 
    const href    = `portable_charger_booking/${booking_id}`;
    const title   = 'Portable Charger Cancel!';
    const message = `Portable Charger: Booking ID ${booking_id} - ${checkOrder.rider_name} cancelled the booking.`;
    await createNotification(title, message, 'Portable Charging Booking', 'Admin', 'Rider',  rider_id, '', href);
 
    if(checkOrder.rsa_id) {
        await db.execute(`DELETE FROM portable_charger_booking_assign WHERE order_id=? AND rider_id=?`, [booking_id, rider_id]);
        pushNotification(checkOrder.rsa_fcm_token, title, message, 'RSAFCM', href); 
    }
    const html = `<html>
        <body>
            <h4>Dear ${checkOrder.user_name},</h4>
            <p>We would like to inform you that your booking for the portable charger has been successfully cancelled. Below are the details of your cancelled booking:</p>
            Booking ID    : ${booking_id}<br>
            Date and Time : ${moment(checkOrder.slot_date, 'YYYY MM DD').format('D MMM, YYYY,')} ${moment(checkOrder.slot_time, 'HH:mm').format('h:mm A')}
            <p>If this cancellation was made in error or if you wish to reschedule, please feel free to reach out to us. We're happy to assist you.</p>
            <p>Thank you for using PlusX Electric. We hope to serve you again soon.</p>
            <p>Best regards,<br/>PlusX Electric Team </p>
        </body>
    </html>`;
    emailQueue.addEmail(checkOrder.rider_email, `Portable Charger Service Booking Cancellation (Booking ID: ${booking_id})`, html);
 
    const adminHtml = `<html>
        <body>
            <h4>Dear Admin,</h4>
            <p>This is to inform you that a user has cancelled their booking for the Portable EV Charging Service. Please find the details below:</p>
            <p>Booking Details:</p>
            Booking ID    : ${booking_id}</br>
            Customer Name : ${checkOrder.user_name}</br>
            Contact No    : ${checkOrder.contact_no}</br>
            Address       :    ${checkOrder.contact_no}</br>
            Date & Time   : ${checkOrder.slot_date} - ${checkOrder.slot_time}</br> 
            ${reason ? `Cancellation Reason : ${reason}</br>` : ''}
            Location      : ${checkOrder.address}</br>
            <p>Thank you for using PlusX Electric. We look forward to serving you again soon.</p>
            <p>Best regards,<br/>PlusX Electric Team </p>
        </body>
    </html>`;
    emailQueue.addEmail(process.env.MAIL_POD_ADMIN, `Portable Charger Service Booking Cancellation ( :Booking ID : ${booking_id} )`, adminHtml); 
    return resp.json({ message: ['Your booking has been successfully cancelled.'], status: 1, code: 200 });
});

export const userFeedbackPCBooking = asyncHandler(async (req, resp) => {
    const { rider_id, booking_id, description ='', rating } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id   : ["required"], 
        booking_id : ["required"],
        rating     : ["required"],  
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const checkOrder = await queryDB(`
        SELECT 
            rsa_id, user_name 
        FROM 
            portable_charger_booking
        WHERE 
            booking_id = ? AND rider_id = ? AND status IN ('CS', 'PU', 'RO') 
        LIMIT 1
    `,[booking_id, rider_id]);

    if (!checkOrder) {
        return resp.json({ message: [`Sorry no booking found with this booking id ${booking_id}`], status: 0, code: 404 });
    }
    const feedbackCount = await queryDB(
        'SELECT COUNT(*) as count FROM portable_charger_booking_feedback WHERE rider_id = ? AND booking_id = ?',[rider_id, booking_id]
    );
    if (feedbackCount.count === 0) {
       
        const insert = await insertRecord('portable_charger_booking_feedback', [
            'booking_id', 'rider_id', 'rsa_id', 'rating', 'description'
        ],[
            booking_id, rider_id, checkOrder.rsa_id, parseInt(rating), description
        ]);
        if(insert.affectedRows == 0) return resp.json({ message: ['Oops! Something went wrong! Please Try Again'], status: 0, code: 200 });

        const href    = `portable_charger_booking/${booking_id}`;
        const title   = 'Portable Charger Feedback!';
        const message = `Feedback Received - Booking ID: ${booking_id}.`;
        await createNotification(title, message, 'Portable Charging Booking', 'Admin', 'Rider', rider_id, '', href);

        const adminHtml = `<html>
            <body>
                <h4>Dear Admin,</h4>
                <p>You have received feedback from a customer via the PlusX app.</p>
                Customer Name : ${checkOrder.user_name}<br>
                Booking ID    : ${booking_id}<br>
                <p>Rating   :  ${ parseInt(rating) }</p> 
                <p>Feedback :  ${description}</p>
                <p>Please review the feedback and take any necessary actions.</p>
                <p>Best regards,<br/>PlusX Electric Team</p>
            </body>
        </html>`;
        emailQueue.addEmail(process.env.MAIL_POD_ADMIN, `Customer Feedback Received - Booking ID: ${booking_id}`, adminHtml); 

        return resp.json({ message: ['Feedback added successfully!'], status: 1, code: 200 });
    } else {
        return resp.json({ message: ['Feedback already submitted!'], status: 0, code: 200 });
    }
});

export const reScheduleBooking = asyncHandler(async (req, resp) => {
    
    const { rider_id, booking_id, slot_date, slot_time, slot_id, device_name } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id        : ["required"],
        booking_id      : ["required"],
        slot_date       : ["required"],
        slot_time       : ["required"],
        slot_id         : ["required"],
        device_name     : ["required"],
    });  
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
    // const conn = await startTransaction();
    try {
        const fSlotDateTime = moment(slot_date + ' ' + slot_time, 'YYYY-MM-DD HH:mm:ss').format('YYYY-MM-DD HH:mm:ss')
        const currDateTime  = moment().utcOffset(4).format('YYYY-MM-DD HH:mm:ss');
        if (fSlotDateTime < currDateTime) return resp.json({status: 0, code: 422, message: ["Invalid slot, Please select another slot"]});

        const fSlotDate = moment(slot_date, 'YYYY-MM-DD').format('YYYY-MM-DD');

        // 1. Lock all bookings for this slot
        const [lockedRows] = await db.execute(
            `SELECT
                id
            FROM 
                portable_charger_booking
            WHERE
                slot_time = ? AND slot_date = ?  AND  status NOT IN ('C')
            FOR UPDATE`,
            [slot_time, fSlotDate]  // 'PU', 'RO' 
        ); //, 'PNR'
        const bookingCount = lockedRows.length;

        const [slotLimitRows] = await db.execute( `
            SELECT
                booking_limit
            FROM 
                portable_charger_slot
            WHERE
                slot_date = ? AND start_time = ? LIMIT 1 
            FOR UPDATE`,
            [fSlotDate, slot_time]
        );
        if (slotLimitRows.length === 0) {
            return resp.json({ message : ["Invalid Slot!"], status: 0, code: 422, error: true });
        }
        const bookingLimit = slotLimitRows[0].booking_limit;
        if (bookingCount >= bookingLimit) {
            return resp.json({ message : ["The slot you have selected is already booked. Please select another slot."], status: 0, code: 422, error: true });
        }
        const checkOrder = await queryDB(`
            SELECT
                pcb.user_name, pcb.country_code, pcb.contact_no, pcb.address, pcb.latitude, pcb.longitude,
                pcb.rescheduled_booking, pcb.slot_date, pcb.slot_time, rd.fcm_token, rd.rider_email, 
                pcb.vehicle_data
            FROM 
                portable_charger_booking as pcb
            LEFT JOIN
                riders AS rd ON rd.rider_id = pcb.rider_id
            WHERE 
                pcb.booking_id = ? AND pcb.rider_id = ?
            LIMIT 1
        `,[
            booking_id, rider_id
        ]);
        if (!checkOrder) {
            return resp.json({ message: [`Sorry no booking found with this booking id ${booking_id}`], status: 0, code: 404 });
        }
        if (checkOrder.rescheduled_booking) {
            return resp.json({ message: [`This booking has already been rescheduled.`], status: 0, code: 404 });
        }
        const oldSlotDateTime = moment(checkOrder.slot_date + ' ' + checkOrder.slot_time, 'YYYY-MM-DD HH:mm:ss'); 
        //.format('YYYY-MM-DD HH:mm:ss');
        let prevDay  = oldSlotDateTime.subtract(24, 'hours').format('YYYY-MM-DD HH:mm:ss');

        // console.log(currDateTime,  prevDay) ;
        if (currDateTime > prevDay ) {
            return resp.json({
                message: ["Apologies, rescheduling is only allowed up to 24 hours before the scheduled service time."],
                status : 0,
                code   : 405,
                error  : true
            })
        }    
        const updtFields = {
            status              : 'CNF', 
            slot                : slot_id, 
            slot_date           : fSlotDate, 
            slot_time           : slot_time,
            device_name         : device_name,
            rescheduled_booking : 1
        }
        await updateRecord('portable_charger_booking', updtFields, ['booking_id', 'rider_id'], [booking_id, rider_id]); //, conn 
        const insert = await insertRecord('portable_charger_history', ['booking_id', 'rider_id', 'order_status'], [booking_id, rider_id, 'CNF']);  //, conn
        
        if(insert.affectedRows == 0) return resp.json({status:0, code:200, message: ["Oops! Something went wrong. Please try again."]});

        const href    = 'portable_charger_booking/' + booking_id;
        const heading = 'Portable Charging Rescheduled Booking!';
        const desc    = `Rescheduled Booking Confirmed! ID: ${booking_id}.`;
        createNotification(heading, desc, 'Portable Charging Booking', 'Rider', 'Admin','', rider_id, href);
        createNotification(heading, desc, 'Portable Charging Booking', 'Admin', 'Rider',  rider_id, '', href);
        pushNotification(checkOrder.fcm_token, heading, desc, 'RDRFCM', href);
    
        const htmlUser = `<html>
            <body>
                <h4>Hi ${checkOrder.user_name},</h4>
                <p>Thank you for choosing PlusX App! Your booking has been successfully rescheduled. Please find your updated booking details below:</p> <br>
                
                Booking ID: ${booking_id}<br>
                Scheduled Service Date & Time: ${moment(fSlotDate, 'YYYY MM DD').format('D MMM, YYYY,')} ${moment(slot_time, 'HH:mm').format('h:mm A')}<br>
                <p>If you have any questions or need assistance, feel free to reach out to us via the app or contact our support team.</p>                  
                <p> We look forward to serving you soon! </p><br/>
                <p> Warm regards,<br/>PlusX Electric Team</p>
            </body>
        </html>`;
        emailQueue.addEmail(checkOrder.rider_email, 'Your Rescheduled PlusX Booking Details', htmlUser);
        const formattedDateTime =  moment().utcOffset('+04:00').format('DD MMM YYYY hh:mm A');
        const htmlAdmin = `<html>
            <body>
                <h4>Dear Admin,</h4>
                <p>We have received a new booking for our Portable Charger service. Below are the details:</p> 
                Customer Name : ${checkOrder.user_name}<br>
                Contact No.   : ${checkOrder.country_code}-${checkOrder.contact_no}<br>
                Address       : ${checkOrder.address}<br>
                Booking Time  : ${formattedDateTime}<br> 
                Schedule Time : ${moment(fSlotDate, 'YYYY MM DD').format('D MMM, YYYY,')} ${moment(slot_time, 'HH:mm').format('h:mm A')}<br>       
                Vechile Details : ${checkOrder.vehicle_data}<br> 
                <a href="https://www.google.com/maps?q=${checkOrder.latitude},${checkOrder.longitude}">Address Link</a><br>
                <p> Best regards,<br/>PlusX Electric Team </p>
            </body>
        </html>`;
        emailQueue.addEmail(process.env.MAIL_POD_ADMIN, `Portable Charger Booking - ${booking_id}`, htmlAdmin);
        
        let respMsg = "Booking request received! Your booking has been successfully rescheduled. Our team will arrive at the updated time.";

        // await commitTransaction(conn);
        return resp.json({
            status        : 1, 
            code          : 200,
            booking_id    : booking_id,
            message       : [respMsg] 
        });

    } catch(err) {
        console.error("Transaction failed:", err);
        // await rollbackTransaction(conn);
        tryCatchErrorHandler(req.originalUrl, err, resp);
        
    } finally {
        // if (conn) conn.release();
    }
});
