// import path from 'path';
import moment from "moment";
import dotenv from 'dotenv';
import 'moment-duration-format';
// import { fileURLToPath } from 'url';
import emailQueue from "../../emailQueue.js";
import validateFields from "../../validation.js";
import { insertRecord, queryDB, getPaginatedData, updateRecord } from '../../dbUtils.js';
import db from "../../config/db.js";
import { createNotification, mergeParam, formatDateTimeInQuery, asyncHandler, formatDateInQuery, checkCoupon } from "../../utils.js";
dotenv.config();

import { tryCatchErrorHandler } from "../../middleware/errorHandler.js";
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

export const getChargingServiceSlotList = asyncHandler(async (req, resp) => {
    const { slot_date } = mergeParam(req);
    if(!slot_date) return resp.json({status:0, code:422, message: ['slot date is required']});
    
    const fSlotDate = moment(slot_date, 'YYYY-MM-DD').format('YYYY-MM-DD');
    let query = `SELECT slot_id, ${formatDateInQuery([('slot_date')])}, start_time, end_time, booking_limit`;
    
    if(fSlotDate >=  moment().format('YYYY-MM-DD')){
        query += `, (SELECT COUNT(id) FROM charging_service AS cs WHERE DATE(cs.slot_date_time) = '${slot_date}' AND TIME(slot_date_time) = pick_drop_slot.start_time AND order_status NOT IN ("C") ) AS slot_booking_count`;
    }
    query += ` FROM pick_drop_slot WHERE status = ? AND slot_date = ? ORDER BY start_time ASC`; //, "PNR" "WC", 

    const [slot] = await db.execute(query, [1, fSlotDate]); 

    return resp.json({ 
        message : "Slot List fetch successfully!",  data: slot, status: 1, code: 200,
        alert2  : "The slots for your selected date are fully booked. Please choose another date to book our EV Pick Up & Drop Off for your EV."
    });
});

export const oldrequestService = asyncHandler(async (req, resp) => {
    
    const { rider_id, name, country_code, contact_no, pickup_address, pickup_latitude, pickup_longitude, parking_number='', parking_floor='', vehicle_id, slot_date_time, slot_id, price = 0, order_status = 'PNR', device_name = '', coupon_code='', address_id } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id         : ["required"],
        name             : ["required"],
        country_code     : ["required"],
        contact_no       : ["required"],
        slot_id          : ["required"],
        pickup_address   : ["required"],
        pickup_latitude  : ["required"],
        pickup_longitude : ["required"],
        vehicle_id       : ["required"],
        // parking_number : ["required"],
        // parking_floor  : ["required"],
        slot_date_time    : ["required"],
        address_id        : ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
    // const conn = await startTransaction();
    try {
        const riderAddress = await queryDB(`
            SELECT 
                landmark, 
                (SELECT count(id) from riders_vehicles where rider_id =? and vehicle_id = ? ) as vehicle_count,
                ( SELECT pick_drop_price FROM booking_price LIMIT 1) as booking_price
            FROM 
                rider_address
            WHERE 
                rider_id =? and address_id = ? order by id desc
            LIMIT 1 `,
        [ rider_id, vehicle_id, rider_id, address_id ]);

       const [vehicleRow] = await db.execute(`
  SELECT CONCAT(
    vehicle_make, ', ',
    vehicle_model, ', ',
    vehicle_specification, ', ',
    emirates, '-', 
    vehicle_code, '-', 
    vehicle_number
  ) AS db_vehicle_data
  FROM riders_vehicles
  WHERE vehicle_id = ?
  LIMIT 1
`, [vehicle_id]);

const vehicle_data = vehicleRow[0]?.db_vehicle_data;


        if(!riderAddress) return resp.json({ message : ["Address Id not valid!"], status: 0, code: 422, error: true });
        if(riderAddress.vehicle_count == 0) return resp.json({ message : ["Vehicle Id not valid!"], status: 0, code: 422, error: true });
    
        const vatAmt       = Math.floor(( parseFloat(riderAddress.booking_price) ) * 5) / 100; 
        const bookingPrice = Math.floor( ( parseFloat(riderAddress.booking_price) + vatAmt ) * 100) ;

        if(parseFloat(price) != bookingPrice && coupon_code == '') { 
            return resp.json({ message : ['coupon_code is required'], status: 0, code: 422, error: true });
        }
        else if(parseFloat(price) != bookingPrice && coupon_code) {
            const servicePrice = parseFloat(price) ;
            
            const couponData   = await checkCoupon(rider_id, 'Valet Charging', coupon_code);
          
            if(couponData.status == 0 ){
                return resp.json({ message : [couponData.message], status: 0, code: 422, error: true });

            } else if(servicePrice != couponData.service_price ){
                return resp.json({ message : ['Booking price is not valid!'], status: 0, code: 422, error: true, bookingPrice : couponData.service_price });
            }
        }  
        const area = riderAddress.landmark;

        const fSlotDateTime = moment(slot_date_time, 'YYYY-MM-DD HH:mm:ss').format('YYYY-MM-DD HH:mm:ss');
        const currDateTime  = moment().utcOffset(4).format('YYYY-MM-DD HH:mm:ss');
        if (fSlotDateTime < currDateTime) return resp.json({status: 0, code: 422, message: ["Invalid slot, Please select another slot"]});
        
        const fSlotDate    = moment(slot_date_time, 'YYYY-MM-DD HH:mm:ss').format('YYYY-MM-DD');
        const slot_time    = moment(slot_date_time, 'YYYY-MM-DD HH:mm:ss').format('HH:mm:ss');
        const slotDateTime = moment(slot_date_time).format('YYYY-MM-DD HH:mm:ss');
        // 1. Lock all bookings for this slot
        const [lockedRows] = await db.execute(
            `SELECT
                id
            FROM 
                charging_service
            WHERE
                slot_date_time = ? AND order_status NOT IN ("C")
            FOR UPDATE`,
            [ slotDateTime ]
        ); //, 'PNR' "WC", 
        const bookingCount = lockedRows.length;

        // 2. Get slot limit 
        const [slotLimitRows] = await db.execute( `
            SELECT
                booking_limit
            FROM 
                pick_drop_slot
            WHERE
                slot_date = ? AND start_time = ? LIMIT 1 
            FOR UPDATE`,
            [fSlotDate, slot_time]
        );
        if (slotLimitRows.length === 0) {
            return resp.json({ message : ["The slot you have selected is invalid!"], status: 0, code: 422, error: true });
        }
        const bookingLimit = slotLimitRows[0].booking_limit;

        // 3.  Double-check limit AFTER locking
        if (bookingCount >= bookingLimit) {
            return resp.json({ message : ["The slot you have selected is already booked. Please select another slot."], status: 0, code: 422, error: true });
        }
        const insert = await insertRecord('charging_service', [
            'request_id','vehicle_data', 'rider_id', 'name', 'country_code', 'contact_no', 'vehicle_id', 'slot', 'slot_date_time', 'pickup_address', 'parking_number', 'parking_floor', 
            'price', 'order_status', 'pickup_latitude', 'pickup_longitude', 'device_name', 'area', 'address_id'
        ], [
            'CS',vehicle_data, rider_id, name, country_code, contact_no, vehicle_id, slot_id, slotDateTime, pickup_address, parking_number, parking_floor, price, order_status, pickup_latitude, pickup_longitude, device_name, area, address_id
        ]);

        if(insert.affectedRows === 0) return resp.json({status:0, code:200, message : ["Oops! Something went wrong. Please try again."]}); 

        const requestId = 'CS' + String( insert.insertId ).padStart(4, '0');
        await updateRecord('charging_service', { request_id : requestId }, ['id'], [insert.insertId] );

        // await commitTransaction(conn);
        return resp.json({
            message    : [ 'We have received your booking. Our team will get in touch with you soon!' ],
            status     : 1,
            service_id : requestId,
            code       : 200,
        });
    }catch(err){
        // await rollbackTransaction(conn);
        console.error("Transaction failed:", err);
        tryCatchErrorHandler(req.originalUrl, err, resp );
    } finally {
        // if (conn) conn.release();
    }
});
export const requestService = asyncHandler(async (req, resp) => {
    
    const { rider_id, name, country_code, contact_no, pickup_address, pickup_latitude, pickup_longitude, parking_number='', parking_floor='', vehicle_id, slot_date_time, slot_id, price = 0, order_status = 'PNR', device_name = '', coupon_code='', address_id } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id         : ["required"],
        name             : ["required"],
        country_code     : ["required"],
        contact_no       : ["required"],
        slot_id          : ["required"],
        pickup_address   : ["required"],
        pickup_latitude  : ["required"],
        pickup_longitude : ["required"],
        vehicle_id       : ["required"],
        // parking_number : ["required"],
        // parking_floor  : ["required"],
        slot_date_time    : ["required"],
        address_id        : ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
    // const conn = await startTransaction();
    try {
        const riderAddress = await queryDB(`
            SELECT 
                landmark, (SELECT CONCAT(
    vehicle_make, ', ',
    vehicle_model, ', ',
    vehicle_specification, ', ',
    emirates, '-', 
    vehicle_code, '-', 
    vehicle_number
  ) 
  FROM riders_vehicles
  WHERE vehicle_id = ?) AS vehicle_data, 
                (SELECT count(id) from riders_vehicles where rider_id =? and vehicle_id = ? ) as vehicle_count,
                ( SELECT pick_drop_price FROM booking_price LIMIT 1) as booking_price
            FROM 
                rider_address
            WHERE 
                rider_id =? and address_id = ? order by id desc
            LIMIT 1 `,
        [ vehicle_id,rider_id, vehicle_id, rider_id, address_id ]);

       const [vehicleRow] = await db.execute(`
  SELECT CONCAT(
    vehicle_make, ', ',
    vehicle_model, ', ',
    vehicle_specification, ', ',
    emirates, '-', 
    vehicle_code, '-', 
    vehicle_number
  ) AS db_vehicle_data
  FROM riders_vehicles
  WHERE vehicle_id = ?
  LIMIT 1
`, [vehicle_id]);

const vehicle_data = vehicleRow[0]?.db_vehicle_data;


        if(!riderAddress) return resp.json({ message : ["Address Id not valid!"], status: 0, code: 422, error: true });
        if(riderAddress.vehicle_count == 0) return resp.json({ message : ["Vehicle Id not valid!"], status: 0, code: 422, error: true });
    
        const vatAmt       = Math.floor(( parseFloat(riderAddress.booking_price) ) * 5) / 100; 
        const bookingPrice = Math.floor( ( parseFloat(riderAddress.booking_price) + vatAmt ) * 100) ;

        if(parseFloat(price) != bookingPrice && coupon_code == '') { 
            return resp.json({ message : ['coupon_code is required'], status: 0, code: 422, error: true });
        }
        else if(parseFloat(price) != bookingPrice && coupon_code) {
            const servicePrice = parseFloat(price) ;
            
            const couponData   = await checkCoupon(rider_id, 'Valet Charging', coupon_code);
          
            if(couponData.status == 0 ){
                return resp.json({ message : [couponData.message], status: 0, code: 422, error: true });

            } else if(servicePrice != couponData.service_price ){
                return resp.json({ message : ['Booking price is not valid!'], status: 0, code: 422, error: true, bookingPrice : couponData.service_price });
            }
        }  
        const area = riderAddress.landmark;

        const fSlotDateTime = moment(slot_date_time, 'YYYY-MM-DD HH:mm:ss').format('YYYY-MM-DD HH:mm:ss');
        const currDateTime  = moment().utcOffset(4).format('YYYY-MM-DD HH:mm:ss');
        if (fSlotDateTime < currDateTime) return resp.json({status: 0, code: 422, message: ["Invalid slot, Please select another slot"]});
        
        const fSlotDate    = moment(slot_date_time, 'YYYY-MM-DD HH:mm:ss').format('YYYY-MM-DD');
        const slot_time    = moment(slot_date_time, 'YYYY-MM-DD HH:mm:ss').format('HH:mm:ss');
        const slotDateTime = moment(slot_date_time).format('YYYY-MM-DD HH:mm:ss');
        // 1. Lock all bookings for this slot
        const [lockedRows] = await db.execute(
            `SELECT
                id
            FROM 
                charging_service
            WHERE
                slot_date_time = ? AND order_status NOT IN ("WC", "C")
            FOR UPDATE`,
            [ slotDateTime ]
        ); //, 'PNR'
        const bookingCount = lockedRows.length;

        // 2. Get slot limit 
        const [slotLimitRows] = await db.execute( `
            SELECT
                booking_limit
            FROM 
                pick_drop_slot
            WHERE
                slot_date = ? AND start_time = ? LIMIT 1 
            FOR UPDATE`,
            [fSlotDate, slot_time]
        );
        if (slotLimitRows.length === 0) {
            return resp.json({ message : ["The slot you have selected is invalid!"], status: 0, code: 422, error: true });
        }
        const bookingLimit = slotLimitRows[0].booking_limit;

        // 3.  Double-check limit AFTER locking
        if (bookingCount >= bookingLimit) {
            return resp.json({ message : ["The slot you have selected is already booked. Please select another slot."], status: 0, code: 422, error: true });
        }
        const insert = await insertRecord('charging_service', [
            'request_id','vehicle_data', 'rider_id', 'name', 'country_code', 'contact_no', 'vehicle_id', 'slot', 'slot_date_time', 'pickup_address', 'parking_number', 'parking_floor', 
            'price', 'order_status', 'pickup_latitude', 'pickup_longitude', 'device_name', 'area', 'address_id'
        ], [
            'CS',riderAddress.vehicle_data, rider_id, name, country_code, contact_no, vehicle_id, slot_id, slotDateTime, pickup_address, parking_number, parking_floor, price, order_status, pickup_latitude, pickup_longitude, device_name, area, address_id
        ]);

        if(insert.affectedRows === 0) return resp.json({status:0, code:200, message : ["Oops! Something went wrong. Please try again."]}); 

        const requestId = 'CS' + String( insert.insertId ).padStart(4, '0');
        await updateRecord('charging_service', { request_id : requestId }, ['id'], [insert.insertId] );

        // await commitTransaction(conn);
        return resp.json({
            message    : [ 'We have received your booking. Our team will get in touch with you soon!' ],
            status     : 1,
            service_id : requestId,
            code       : 200,
        });
    }catch(err){
        // await rollbackTransaction(conn);
        console.error("Transaction failed:", err);
        tryCatchErrorHandler(req.originalUrl, err, resp );
    } finally {
        // if (conn) conn.release();
    }
});
//end requestService

export const listServices = asyncHandler(async (req, resp) => {
    const {rider_id, page_no, bookingStatus } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], page_no: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const limit = 10;
    const start = (page_no[0] * limit) - limit;

    // const statusCondition = (history && history == 1) ? `order_status IN (?, ?)` : `order_status NOT IN (?, ?)`;
    // const statusParams = ['WC', 'C'];
    let statusCondition = `order_status IN (?)`;
    let statusParams    =  (bookingStatus == 'C' ) ? ['C'] : ['WC'];
    statusParams        =  (bookingStatus == 'S' ) ? ['CNF'] : statusParams;
    const orderBy       = 'ORDER BY id ASC'; //(bookingStatus == 'CM' ) ? 'ORDER BY slot_date_time ASC' : 'ORDER BY id DESC';

    const totalQuery = `SELECT COUNT(*) AS total FROM charging_service WHERE rider_id = ? AND ${statusCondition}`;
    const [totalRows] = await db.execute(totalQuery, [rider_id, ...statusParams]);
    const total = totalRows[0].total;
    const totalPage = Math.max(Math.ceil(total / limit), 1);
    
    const formatCols = ['slot_date_time', 'created_at'];
    const servicesQuery = `SELECT request_id, name, country_code, contact_no, slot, ROUND(charging_service.price / 100, 2) AS price, pickup_address, order_status, ${formatDateTimeInQuery(formatCols)} 
    FROM charging_service WHERE rider_id = ? AND ${statusCondition} ${orderBy} LIMIT ${parseInt(start)}, ${parseInt(limit)}
    `;
    const [serviceList] = await db.execute(servicesQuery, [rider_id, ...statusParams]);

    const inProcessQuery = `SELECT request_id, name, country_code, contact_no, slot, ROUND(charging_service.price / 100, 2) AS price, pickup_address, order_status, ${formatDateTimeInQuery(formatCols)} 
    FROM charging_service WHERE rider_id = ? AND order_status NOT IN ('CNF', 'C', 'WC', 'PNR') ${orderBy} LIMIT ${parseInt(start)}, ${parseInt(limit)} `;
    // const inProcessParams        = ['CNF', 'C', 'WC'];
    const [inProcessBookingList] = await db.execute(inProcessQuery, [rider_id]);
    // console.log(inProcessQuery);
    return resp.json({
        message    : ["Charging Service List fetch successfully!"],
        data       : serviceList,
        total_page : totalPage,
        inProcessBookingList,
        total,
        status : 1,
        code   : 200,
        noResultMsg : 'There are no recent bookings. Please schedule your booking now.'
    });
});

export const getServiceOrderDetail = asyncHandler(async (req, resp) => {
    const {rider_id, service_id } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], service_id: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const formatCols = ['created_at', 'updated_at']; // 'slot_date_time', 
    
    const order = await queryDB(`
        SELECT 
            charging_service.*, 
            ROUND(charging_service.price / 100, 2) AS price, 
            (select concat(vehicle_make, ", ", vehicle_model, ", ", vehicle_specification, ", ", emirates, "-", vehicle_code, "-", vehicle_number) from riders_vehicles as rv where rv.vehicle_id = charging_service.vehicle_id limit 1) as vehicle_data,
            ${formatDateTimeInQuery(formatCols)} 
        FROM charging_service 
        WHERE request_id = ? 
        LIMIT 1
    `, [service_id]);
    // formatCols.shift();
    const [history] = await db.execute(`SELECT *, ${formatDateTimeInQuery(formatCols)} FROM charging_service_history WHERE service_id = ?`, [service_id]);

    if(order){
        order.invoice_url = '';
        order.slot = 'Schedule';
        if (order.order_status == 'WC') {
            const invoiceId = order.request_id.replace('CS', 'INVCS');
            order.invoice_url = `${req.protocol}://${req.get('host')}/public/pick-drop-invoice/${invoiceId}-invoice.pdf`;
        }
    }
    order.slot_date_time = moment(order.slot_date_time ).format('YYYY-MM-DD HH:mm:ss');
    return resp.json({
        message: ["Service Order Details fetched successfully!"],
        order_data: order,
        order_history: history,
        status: 1,
        code: 200,
    });
});

/* Invoice */
export const getInvoiceList = asyncHandler(async (req, resp) => {
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
        tableName: 'charging_service_invoice',
        columns: `invoice_id, amount, payment_status, invoice_date, currency, 
            (select concat(name, ",", country_code, "-", contact_no) from charging_service as cs where cs.request_id = charging_service_invoice.request_id limit 1)
            AS riderDetails`,
        sortColumn: 'id',
        sortOrder: 'DESC',
        page_no,
        limit: 10,
        whereField,
        whereValue
    });

    return resp.json({
        status: 1,
        code: 200,
        message: ["Pick & Drop Invoice List fetch successfully!"],
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
        base_url: `${req.protocol}://${req.get('host')}/uploads/pick-drop-invoice/`,
    });
});
export const getInvoiceDetail = asyncHandler(async (req, resp) => {
    const {rider_id, invoice_id } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], invoice_id: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const invoice = await queryDB(`SELECT 
        invoice_id, amount as price, payment_status, invoice_date, currency, payment_type, cs.name, cs.country_code, cs.contact_no, cs.pickup_address, cs.vehicle_id, 
        cs.request_id, cs.slot_date_time, (select concat(vehicle_make, "-", vehicle_model) from riders_vehicles as rv where rv.vehicle_id = cs.vehicle_id limit 1) as vehicle_data
        FROM 
            charging_service_invoice AS csi
        LEFT JOIN
            charging_service AS cs ON cs.request_id = csi.request_id
        WHERE 
            csi.invoice_id = ?
    `, [invoice_id]);

    invoice.invoice_url = `${req.protocol}://${req.get('host')}/public/pick-drop-invoice/${invoice_id}-invoice.pdf`;

    return resp.json({
        message: ["Pick & Drop Invoice Details fetch successfully!"],
        data: invoice,
        status: 1,
        code: 200,
    });
});

/* User Booking Cancel */
export const cancelValetBooking = asyncHandler(async (req, resp) => {
    const { rider_id, booking_id, reason='' } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], booking_id: ["required"] });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
    const checkOrder = await queryDB(`
        SELECT 
            name, vehicle_data,rsa_id,pickup_address, DATE_FORMAT(slot_date_time, '%Y-%m-%d %H:%i:%s') AS slot_date_time,
            CONCAT( country_code, "-", contact_no) as contact_no, 
            (SELECT rd.rider_email FROM riders AS rd WHERE rd.rider_id = cs.rider_id) AS rider_email,
            (SELECT rd.rider_name FROM riders AS rd WHERE rd.rider_id = cs.rider_id) AS rider_name,
            (SELECT fcm_token FROM riders WHERE rider_id = cs.rider_id) AS fcm_token,
            (select fcm_token from rsa where rsa.rsa_id = cs.rsa_id ) as rsa_fcm_token
        FROM 
            charging_service AS cs
        WHERE 
            request_id = ? AND rider_id = ? AND order_status IN ('CNF','A','ER') 
        LIMIT 1
    `,[booking_id, rider_id]);

    if (!checkOrder) {
        return resp.json({ message: [`Sorry no booking found with this booking id ${booking_id}`], status: 0, code: 404 });
    }
    var slotDateTime = moment(`${checkOrder.slot_date_time}`).format('YYYY-MM-DD HH:mm:ss');
    let dubaiTime    = new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" });
    dubaiTime        = moment(dubaiTime).add(1, 'hours').format('YYYY-MM-DD HH:mm:ss');

    if (slotDateTime <= dubaiTime) {
        return resp.json({
            status  : 0,
            code    : 422,
            message : ['Please note : Cancellations aren not allowed within 2 hours of the scheduled time.']
        });
    }
    const insert = await db.execute(
        'INSERT INTO charging_service_history (service_id, rider_id, order_status, rsa_id, cancel_by, cancel_reason) VALUES (?, ?, "C", ?, "User", ?)',
        [booking_id, rider_id, checkOrder.rsa_id, reason]
    );
    if(insert.affectedRows == 0) return resp.json({ message: ['Oops! Something went wrong! Please Try Again'], status: 0, code: 200 });

    await updateRecord('charging_service', {order_status: 'C'}, ['request_id'], [booking_id]);
    
    const href    = `charging_service/${booking_id}`;
    const title   = 'EV Pick Up & Drop Off Cancel!';
    const message = `EV Pick Up & Drop Off Charging : Booking ID ${booking_id} - ${checkOrder.rider_name} cancelled the booking.`;
    await createNotification(title, message, 'Charging Service', 'Admin', 'Rider', rider_id, '', href);

    if( checkOrder.rsa_id) {
        await db.execute(`DELETE FROM charging_service_assign WHERE rider_id=? AND order_id = ?`, [rider_id, booking_id]);
    }
    const html = `<html>
        <body>
            <h4>Dear ${checkOrder.rider_name},</h4>
            <p>We would like to inform you that your booking for the EV Pickup and Drop-Off charging service has been successfully cancelled. Please find the details of your cancelled booking below:</p>
            Booking ID    : ${booking_id}<br>
            Date and Time : ${moment(checkOrder.slot_date_time, 'YYYY-MM-DD HH:mm:ss').format('D MMM, YYYY, h:mm A')}
            <p>If this cancellation was made in error or if you wish to reschedule, please feel free to reach out to us. We're happy to assist you.</p>
            <p>Thank you for using PlusX Electric. We look forward to serving you again soon.</p>
            <p>Best regards,<br/>PlusX Electric Team </p>
        </body>
    </html>`;
    emailQueue.addEmail(checkOrder.rider_email, `PlusX Electric App – Booking Cancellation`, html);

    const adminHtml = `<html>
        <body>
            <h4>Dear Admin,</h4>
            <p>This is to inform you that a user has cancelled their booking for the EV Pickup and Drop-Off Service. Please find the booking details below:</p>
            <p>Booking Details:</p>
           Customer Name :        ${checkOrder.name}<br>
            Contact No     : ${checkOrder.contact_no}<br>
            Address:   ${checkOrder.address}<br>
           Service Date & Time: ${checkOrder.slot_date_time}<br> 
            Vehicle Details:${checkOrder.pickup_address}<br>
            <p>Thank you for your attention to this update.<br/> Best regards,<br>   PlusX Electric Team </p>
        </body>
    </html>`;
    emailQueue.addEmail(process.env.MAIL_CS_ADMIN, `EV Pickup & Drop-Off Service Booking Cancellation (${booking_id}) `, adminHtml);

    return resp.json({ message: ['Booking has been cancelled successfully!'], status: 1, code: 200 });
});


export const userFeedbackValetBooking = asyncHandler(async (req, resp) => {
    const { rider_id, booking_id, description ='', rating } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id   : ["required"], 
        booking_id : ["required"],
        rating     : ["required"],  
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const checkOrder = await queryDB(`
        SELECT 
            name, rsa_id
        FROM 
            charging_service
        WHERE 
            request_id = ? AND rider_id = ? AND order_status IN ('WC') 
        LIMIT 1
    `,[booking_id, rider_id]);

    if (!checkOrder) {
        return resp.json({ message: [`Sorry no booking found with this booking id ${booking_id}`], status: 0, code: 404 });
    }
    const feedbackCount = await queryDB(
        'SELECT COUNT(*) as count FROM charging_service_feedback WHERE rider_id = ? AND booking_id = ?',[rider_id, booking_id]
    );
    if (feedbackCount.count === 0) {
       
        const insert = await insertRecord('charging_service_feedback', [
            'booking_id', 'rider_id', 'rsa_id', 'rating', 'description'
        ],[
            booking_id, rider_id, checkOrder.rsa_id, rating, description
        ]);
        if(insert.affectedRows == 0) return resp.json({ message: ['Oops! Something went wrong! Please Try Again'], status: 0, code: 200 });

        const href    = `charging_service/${booking_id}`;
        const title   = 'EV Pick Up & Drop Off Feedback!';
        const message = `Feedback Received - Booking ID: ${booking_id}.`;
        await createNotification(title, message, 'Charging Service', 'Admin', 'Rider', rider_id, '', href);

        const adminHtml = `<html>
            <body>
                <h4>Dear Admin,</h4>
                <p>You have received feedback from a customer via the PlusX app.</p>
                Customer Name : ${checkOrder.name}<br>
                Booking ID    : ${booking_id}<br>
                <p>Rating   :  ${rating}</p>
                <p>Feedback :  ${description}</p>
                <p>Please review the feedback and take any necessary actions.</p>
                <p>Best regards,<br/>PlusX Electric Team</p>
            </body>
        </html>`;
        emailQueue.addEmail(process.env.MAIL_CS_ADMIN, `Customer Feedback Received - Booking ID: ${booking_id}`, adminHtml);

        return resp.json({ message: ['Feedback added successfully!'], status: 1, code: 200 });
    } else {
        return resp.json({ message: ['Feedback already submitted!'], status: 0, code: 200 });
    }
});