import multer from 'multer';
// import moment from "moment";
import dotenv from 'dotenv';
import emailQueue from "../../emailQueue.js";
import validateFields from "../../validation.js";
import { insertRecord, queryDB, getPaginatedData, updateRecord } from '../../dbUtils.js';
import db from "../../config/db.js";
import { asyncHandler, createNotification, formatDateTimeInQuery, mergeParam, checkCoupon } from '../../utils.js';
dotenv.config();
import { tryCatchErrorHandler } from "../../middleware/errorHandler.js";

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const destinationPath = path.join(__dirname, 'public', 'uploads', 'order_file');
        cb(null, destinationPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename     = `${uniqueSuffix}-${file.originalname}`;
        cb(null, filename);
    }
});
export const upload = multer({ storage: storage });

export const addRoadAssistance = asyncHandler(async (req, resp) => {
    // const { rider_id, name, country_code, contact_no, types_of_issue, pickup_address, drop_address, price, pickup_latitude, pickup_longitude, drop_latitude, drop_longitude, order_status=''} = mergeParam(req);

    const { rider_id, user_name, country_code, contact_no, address, latitude, longitude, vehicle_id, address_id,  parking_number = '', parking_floor = '', service_price = 0, device_name = '', coupon_code=''
    } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id      : ["required"], 
        user_name     : ["required"], 
        country_code  : ["required"], 
        contact_no    : ["required"], 
        address       : ["required"], 
        latitude      : ["required"], 
        longitude     : ["required"],
        vehicle_id    : ["required"], 
        address_id    : ["required"]
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    // const conn = await startTransaction();
    try {

        const riderAddress = await queryDB(`
            SELECT 
                landmark,
                (SELECT count(id) from riders_vehicles where rider_id =? and vehicle_id = ? ) as vehicle_count,
                ( SELECT roadside_assistance_price FROM booking_price LIMIT 1) as booking_price
            FROM 
                rider_address
            WHERE 
                rider_id =? and address_id = ? order by id desc
            LIMIT 1 `,
        [ rider_id, vehicle_id, rider_id, address_id ]);

        if(!riderAddress) return resp.json({ message : ["Address Id not valid!"], status: 0, code: 422, error: true });
        if(riderAddress.vehicle_count == 0) return resp.json({ message : ["Vehicle Id not valid!"], status: 0, code: 422, error: true });

        const vatAmt       = Math.floor(( parseFloat(riderAddress.booking_price) ) * 5) / 100; 
        const bookingPrice = Math.floor( ( parseFloat(riderAddress.booking_price) + vatAmt ) * 100) ;

        if(parseFloat(service_price) != bookingPrice && coupon_code == '') { 
            return resp.json({ message : ['coupon_code is required'], status: 0, code: 422, error: true });
        }
        else if(parseFloat(service_price) != bookingPrice && coupon_code) {
            const servicePrice = parseFloat(service_price) ;
            const couponData   = await checkCoupon(rider_id, 'Roadside Assistance', coupon_code);
            console.log(couponData)
            if(couponData.status == 0 ){
                return resp.json({ message : [couponData.message], status: 0, code: 422, error: true });

            } else if(servicePrice != couponData.service_price ){
                return resp.json({ message : ['Booking price is not valid!'], status: 0, code: 422, error: true, bookingPrice, servicePrice, couponprice : couponData.service_price });
            }
        }  
        // return resp.json({ message : ['Service price Sahi hai!'], status: 1, bookingPrice });
        const area   = riderAddress.landmark;
        const insert = await insertRecord('road_assistance', [
            'request_id', 'rider_id', 'name', 'country_code', 'contact_no', 'address_id', 'pickup_address', 'pickup_latitude', 'pickup_longitude', 'parking_number', 'parking_floor', 'vehicle_id', 'price', 'order_status', 'device_name', 'area'
        ], [
            'RAO', rider_id, user_name, country_code, contact_no, address_id, address, latitude, longitude, parking_number, parking_floor, vehicle_id, service_price, 'PNR', device_name, area
        ]); //, conn

        if(insert.affectedRows === 0) return resp.json({status:0, code:200, message: ['Oops! There is something went wrong! Please Try Again.']});

        const requestId = 'RAO' + String(insert.insertId).padStart(4, '0');
        await updateRecord('road_assistance', { request_id : requestId }, ['id'], [insert.insertId] );

        // await commitTransaction(conn);
        return resp.json({
            status     : 1, 
            code       : 200, 
            message    : ['We have received your booking and our team will reach out to you soon.'],
            request_id : requestId,
        });
    } catch(err) {
        // await rollbackTransaction(conn);
        console.error("Transaction failed:", err);
        tryCatchErrorHandler(req.originalUrl, err, resp );
    } finally {
        // if (conn) conn.release();
    } 
});

export const roadAssistanceList = asyncHandler(async (req, resp) => {
    const {rider_id, page_no, bookingStatus } = mergeParam(req); 
        
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], page_no: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const limit           = 10;
    const start           = ( page_no * limit ) - limit;

    let statusCondition = `order_status IN (?)`;
    let statusParams    = (bookingStatus == 'C' ) ? ['C'] : ['RO'];
    statusParams        = (bookingStatus == 'S' ) ? ['CNF'] : statusParams;
    const orderBy       = 'ORDER BY id ASC'; //(bookingStatus == 'CM' ) ? 'ORDER BY slot_date ASC, slot_time ASC' : 'ORDER BY id DESC';
    
    const totalQuery = `SELECT COUNT(*) AS total FROM road_assistance WHERE rider_id = ? AND ${statusCondition}`;
    
    const [totalRows] = await db.execute(totalQuery, [rider_id, ...statusParams]);
    const total       = totalRows[0].total;
    const totalPage   = Math.max(Math.ceil(total / limit), 1);

    const bookingsQuery = `SELECT request_id, ROUND(road_assistance.price/100, 2) AS price, name, country_code, contact_no, order_status, ${formatDateTimeInQuery(['created_at'])}, pickup_address
        FROM road_assistance WHERE rider_id = ? AND ${statusCondition} ${orderBy} LIMIT ${parseInt(start)}, ${parseInt(limit)}
    `;
    const [bookingList] = await db.execute(bookingsQuery, [rider_id, ...statusParams]);

    const inProcessQuery = `SELECT request_id, ROUND(road_assistance.price/100, 2) AS price, name, country_code, contact_no, order_status, ${formatDateTimeInQuery(['created_at'])}, pickup_address
        FROM road_assistance WHERE rider_id = ? AND order_status NOT IN (?, ?, ?, ?, ?) ${orderBy} LIMIT ${parseInt(start)}, ${parseInt(limit)}
    `;
    const inProcessParams    = ['CNF', 'C', 'PU', 'RO', 'PNR'];
    const [inProcessBookingList] = await db.execute(inProcessQuery, [rider_id, ...inProcessParams]);

    return resp.json({
        status     : 1,
        code       : 200,
        message    : ["Road Assistance List fetch successfully!"],
        data       : bookingList,
        total_page : totalPage,
        total      : total,
        inProcessBookingList,
        base_url   : `${req.protocol}://${req.get('host')}/uploads/road-assistance/`,       
    });
});

export const roadAssistanceDetail = asyncHandler(async (req, resp) => {
    const { rider_id, order_id } = mergeParam(req);
        
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], order_id: ["required"]});
    
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const [roadAssistance] = await db.execute(`
        SELECT 
            request_id, name, country_code, contact_no, pickup_address, ROUND(road_assistance.price/100, 2) AS price, order_status, 
            ${formatDateTimeInQuery(['created_at'])},
            (select concat(rsa_name, ",", country_code, " ", mobile) from rsa where rsa.rsa_id = road_assistance.rsa_id) as rsa_data,
            (select concat(vehicle_make, ", ", vehicle_model, ", ", vehicle_specification, ", ", emirates, "-", vehicle_code, "-", vehicle_number) from riders_vehicles as rv where rv.vehicle_id = road_assistance.vehicle_id limit 1) as vehicle_data
        FROM 
            road_assistance 
        WHERE 
            rider_id = ? AND request_id = ? 
        LIMIT 1
    `, [rider_id, order_id]);

    const [history] = await db.execute(`
        SELECT 
            order_status, cancel_by, cancel_reason as reason, rsa_id, ${formatDateTimeInQuery(['created_at'])}, 
            (select rsa.rsa_name from rsa where rsa.rsa_id = order_history.rsa_id) as rsa_name
        FROM 
            order_history 
        WHERE 
            order_id = ?
        ORDER BY id DESC
    `,[order_id]);

    if(roadAssistance.length > 0){
        roadAssistance[0].invoice_url = '';
        if (roadAssistance[0].order_status == 'PU' || roadAssistance[0].order_status == 'RO') {
            const invoice_id              = roadAssistance[0].request_id.replace('RAO', 'INVR');
            roadAssistance[0].invoice_url = `${req.protocol}://${req.get('host')}/public/road-side-invoice/${invoice_id}-invoice.pdf`;
        }
    }
    return resp.json({
        message       : ["Road Assistance Details fetched successfully!"],
        order_data    : roadAssistance[0],
        order_history : history,
        status        : 1,
        code          : 200,
    });
});

/* Invoice */
export const roadAssistanceInvoiceList = asyncHandler(async (req, resp) => {
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
        tableName: 'road_assistance_invoice',
        columns: `invoice_id, amount, payment_status, invoice_date, currency,
            (select concat(name, ",", country_code, "-", contact_no) from road_assistance as rs where rs.rider_id = road_assistance_invoice.rider_id limit 1) AS riderDetails,
            (select types_of_issue from road_assistance as rs where rs.rider_id = road_assistance_invoice.rider_id limit 1) as types_of_issue
        `,
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
        message: ["Road Assistance Invoice List fetch successfully!"],
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
        base_url: `${req.protocol}://${req.get('host')}/uploads/road-side-invoice/`,
    });

});

export const roadAssistanceInvoiceDetail = asyncHandler(async (req, resp) => {
    const {rider_id, invoice_id } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], invoice_id: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const invoice = await queryDB(`SELECT 
        rsi.invoice_id, rsi.amount as price, rsi.payment_status, rsi.invoice_date, rsi.currency, rsi.payment_type, r.name, r.country_code, r.contact_no, r.types_of_issue, 
        r.pickup_address, r.drop_address, r.price, r.request_id
        FROM 
            road_assistance_invoice AS rsi
        LEFT JOIN
            road_assistance AS r ON r.request_id = rsi.request_id
        WHERE 
            rsi.invoice_id = ?
    `, [invoice_id]);

    invoice.invoice_url = `${req.protocol}://${req.get('host')}/public/road-side-invoice/${invoice_id}-invoice.pdf`;

    return resp.json({
        message: ["Road Assistance Invoice Details fetch successfully!"],
        data: invoice,
        status: 1,
        code: 200,
    });
});

export const userFeedbacRSABooking = asyncHandler(async (req, resp) => {
    const { rider_id, booking_id, description ='', rating } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id   : ["required"], 
        booking_id : ["required"],
        rating     : ["required"],  
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const checkOrder = await queryDB(`
        SELECT 
            rsa_id, name
        FROM 
            road_assistance
        WHERE 
            request_id = ? AND rider_id = ? AND order_status IN ('PU', 'RO') 
        LIMIT 1
    `,[booking_id, rider_id]);

    if (!checkOrder) {
        return resp.json({ message: [`Sorry no booking found with this booking id ${booking_id}`], status: 0, code: 404 });
    }
    const feedbackCount = await queryDB(
        'SELECT COUNT(*) as count FROM road_assistance_feedback WHERE rider_id = ? AND request_id = ?',[rider_id, booking_id]
    );
    if (feedbackCount.count === 0) {
       
        const insert = await insertRecord('road_assistance_feedback', [
            'request_id', 'rider_id', 'rsa_id', 'rating', 'description'
        ],[
            booking_id, rider_id, checkOrder.rsa_id, rating, description
        ]);
        if(insert.affectedRows == 0) return resp.json({ message: ['Oops! Something went wrong! Please Try Again'], status: 0, code: 200 });

        const href    = `road_assistance/${booking_id}`;
        const title   = 'Roadside Assistance Feedback!';
        const message = `Feedback Received - Booking ID: ${booking_id}.`;
        await createNotification(title, message, 'Roadside Assistance', 'Admin', 'Rider', rider_id, '', href);

        const adminHtml = `<html>
            <body>
                <h4>Dear Admin,</h4>
                <p>You have received feedback from a customer via the PlusX app.</p>
                Customer Name : ${checkOrder.name}<br>
                Booking ID    : ${booking_id}<br>
                <p>Rating   : ${rating}</p> 
                <p>Feedback : ${description}</p>
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
