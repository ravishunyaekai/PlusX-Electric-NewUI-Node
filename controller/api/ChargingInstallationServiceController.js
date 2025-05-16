import dotenv from 'dotenv';
import db from "../../config/db.js";
import emailQueue from "../../emailQueue.js";
import validateFields from "../../validation.js";
import { insertRecord, queryDB, getPaginatedData } from '../../dbUtils.js';
import { asyncHandler, createNotification, formatDateTimeInQuery, mergeParam, pushNotification } from "../../utils.js";
dotenv.config();

export const serviceRequest = asyncHandler(async (req, resp) => {

    const { rider_id, name, country_code, contact_no, email, looking_for, used_for, address, latitude, longitude, description } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id      : ["required"], 
        name          : ["required"], 
        country_code  : ["required"], 
        contact_no    : ["required"], 
        email         : ["required"], 
        looking_for   : ["required"], 
        used_for      : ["required"], 
        address       : ["required"], 
        latitude      : ["required"], 
        longitude     : ["required"], 
        description   : ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const rider = await queryDB(`SELECT fcm_token, (SELECT MAX(id) FROM charging_installation_service) AS last_index FROM riders WHERE rider_id = ? LIMIT 1`, [rider_id]);

    const start     = (!rider.last_index) ? 0 : rider.last_index; 
    const nextId    = start + 1;
    const requestId = 'CIS' + String(nextId).padStart(4, '0');
    
    const insert = await insertRecord('charging_installation_service', [
        'request_id', 'rider_id', 'name', 'country_code', 'contact_no', 'email', 'looking_for', 'resident_type', 'address', 'latitude', 'longitude', 'description', 'order_status'
    ], [
        requestId, rider_id, name, country_code, contact_no, email, looking_for, used_for, address, latitude, longitude, description, 'P' 
    ]);
    
    if(insert.affectedRows > 0){
        await insertRecord('charging_installation_service_history', ['service_id', 'rider_id', 'order_status'], [requestId, rider_id, 'P']);
        
        const href    = 'charging_installation_service/' + requestId;
        const heading = 'Order Created!';
        const desc    = `New Booking: EV Charger Installation. ID: ${requestId}, User: ${name}`;
        createNotification(heading, desc, 'Charging Installation Service', 'Admin', 'Rider', rider_id, '', href);

        const now               = new Date();
        const formattedDateTime = now.toISOString().replace('T', ' ').substring(0, 19);
        
        const htmlUser = `<html>
            <body>
                <h4>Dear ${name},</h4>
                <p>Thank you for booking our Charger Installation service. We are pleased to confirm that we have successfully received your booking.</p>
                <p>Booking Details:</p>
                Service: EV Charger Installation<br>
                Booking ID: ${requestId}
                <p>Our team will get in touch with you shortly to coordinate the installation and ensure a smooth experience.</p>
                <p>If you have any questions or need assistance, feel free to reach out to us. We're here to help!</p>
                <p>Thank you for choosing PlusX Electric. We look forward to serving you soon.</p>
                <p>Best Regards,<br/>PlusX Electric Team </p>
            </body>
        </html>`;
        emailQueue.addEmail(email, 'PlusX Electric App: EV Charger Installation Booking Confirmation', htmlUser);

        const htmlAdmin = `<html>
            <body>
                <h4>Dear Admin,</h4>
                <p>We have received a new booking for our Charging Installation service. Below are the details:</p> <br/>
                <p>Customer Name  : ${name}</p>
                <p>Address : ${address}</p>
                <p>Booking Time   : ${formattedDateTime}</p> <br/>                        
                <p> Best regards,<br/>PlusX Electric Team </p>
            </body>
        </html>`;
        emailQueue.addEmail(process.env.MAIL_ADMIN, `Charging Installation Booking - ${requestId}`, htmlAdmin);

        return resp.json({
            status  : 1, 
            code    : 200, 
            message : ['Thank you! We have received your booking for EV Charger Installation. Our team will get in touch with you soon.'],
            service_id : requestId,
            rsa_id     : ''
        });       
    } else {
        return resp.json({status:0, code:200, message: ['Oops! There is something went wrong! Please Try Again']});
    }
});

export const requestList = asyncHandler(async (req, resp) => {
    const {rider_id, page_no, sort_by } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], page_no: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const result = await getPaginatedData({
        tableName: 'charging_installation_service',
        columns: `request_id, name, email, country_code, contact_no, service_type, company_name, address, charger_for, vehicle_model, latitude, longitude, 
            order_status,  ${formatDateTimeInQuery(['created_at'])}`,
        sortColumn: 'id',
        sortOrder: 'DESC',
        page_no, 
        limit: 10,
        whereField: ['rider_id'],
        whereValue: [rider_id]
    });
    return resp.json({
        status: 1,
        code: 200,
        message: ["Charging Installation Service List fetch successfully!"],
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
    });

});

export const requestDetails = asyncHandler(async (req, resp) => { 
    const {rider_id, request_id } = mergeParam(req);     
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], request_id: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const [orderData] = await db.execute(`
        SELECT *, ${formatDateTimeInQuery(['created_at', 'updated_at'])} FROM charging_installation_service WHERE request_id = ? LIMIT 1
    `, [request_id]);

    orderData[0].invoice_url = '';
    if (orderData[0].order_status == 'ES') {
        const invoice_id = orderData[0].request_id.replace('CS', 'INVCS');
        orderData[0].invoice_url = `${req.protocol}://${req.get('host')}/public/charger-installation-invoice/${invoice_id}-invoice.pdf`;
    }

    const [history] = await db.execute(`
        SELECT *, ${formatDateTimeInQuery(['created_at', 'updated_at'])} FROM charging_installation_service_history WHERE service_id = ?
    `, [request_id]);

    return resp.json({
        message: ["Charging Installation Service fetched successfully!"],
        service_data: orderData[0],
        order_history: history,
        status: 1,
        code: 200,
    });
});