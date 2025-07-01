import { numberToWords, formatNumber, mergeParam, asyncHandler, generatePdf, createNotification, pushNotification } from '../utils.js';
import db from "../config/db.js";
import validateFields from "../validation.js";
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from "stripe";
import dotenv from 'dotenv';
import { insertRecord, queryDB, updateRecord } from '../dbUtils.js';
import moment from 'moment/moment.js';
import emailQueue from '../emailQueue.js';
dotenv.config();

import { tryCatchErrorHandler } from "../middleware/errorHandler.js";

const stripe     = new Stripe(process.env.STRIPE_SECRET_KEY);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const pickAndDropInvoice = asyncHandler(async (req, resp) => {
    const {rider_id, request_id, payment_intent_id ='', coupon_code ='', session_id='' } = mergeParam(req);
 
    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id   : ["required"], 
        request_id : ["required"], 
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    // const conn = await startTransaction();
    try { 
        const checkOrder = await queryDB(`
            SELECT 
                cs.name, cs.country_code, cs.contact_no, rd.rider_email, rd.fcm_token, cs.slot_date_time, cs.pickup_address, cs.pickup_latitude, cs.pickup_longitude, cs.vehicle_data 
            FROM 
                charging_service as cs
            LEFT JOIN
                riders AS rd ON rd.rider_id = cs.rider_id
            WHERE 
                cs.request_id = ? AND cs.rider_id = ? AND cs.order_status = 'PNR'
            LIMIT 1
        `,[request_id, rider_id]);
 
        if (!checkOrder) {
            return resp.json({ 
                message : [`We have received your booking. Our team will get in touch with you soon!`], 
                status  : 0, 
                code    : 200 
            });
        }
        const ordHistoryCount = await queryDB(
            'SELECT COUNT(*) as count FROM charging_service_history WHERE service_id = ? AND order_status = "CNF"',[request_id]
        );
        if (ordHistoryCount.count === 0) { 
            
            const insert = await insertRecord('charging_service_history', ['service_id', 'rider_id', 'order_status'], [request_id, rider_id, 'CNF']);
            
            if(insert.affectedRows == 0) return resp.json({status:0, code:200, message: ["Oops! Something went wrong. Please try again."]});
 
            if(coupon_code){
                const coupon = await queryDB(`SELECT coupan_percentage FROM coupon WHERE coupan_code = ? LIMIT 1 `, [ coupon_code ]); 
        
                let coupan_percentage = coupon.coupan_percentage ;
                await insertRecord('coupon_usage', ['coupan_code', 'user_id', 'booking_id', 'coupan_percentage'], [coupon_code, rider_id, request_id, coupan_percentage]);
            }
            let paymentIntentId = payment_intent_id;
            if(session_id){
                const session   = await stripe.checkout.sessions.retrieve(session_id);
                paymentIntentId = session.payment_intent ;
            }
            const updt = await updateRecord('charging_service', { order_status : 'CNF', payment_intent_id : paymentIntentId }, ['request_id', 'rider_id'], [request_id, rider_id] );
 
            const href    = 'charging_service/' + request_id;
            const heading = 'EV Pick Up & Drop Off Booking!';
            const desc    = `Booking Confirmed! (${request_id})`;
            createNotification(heading, desc, 'Charging Service', 'Rider', 'Admin','', rider_id, href);
            createNotification(heading, desc, 'Charging Service', 'Admin', 'Rider', rider_id, '', href);
            pushNotification(checkOrder.fcm_token, heading, desc, 'RDRFCM', href);
        
            const htmlUser = `<html>
                <body>
                    <h4>Dear ${checkOrder.name},</h4>
                    <p>Thank you for choosing our EV Pickup and Drop Off service. We are pleased to confirm that your booking has been successfully received.</p>
                    <p>Booking Details:</p>
                    
                    <p>Booking ID: ${request_id}</p>
                    <p>Service Date and Time : ${moment(checkOrder.slot_date_time, 'YYYY-MM-DD HH:mm:ss').format('D MMM, YYYY, h:mm A')}</p>
                    <p>Address : ${checkOrder.pickup_address}</p>
                    
                    <p>We look forward to serving you and providing a seamless EV experience.</p>   
                    <p>Best Regards,<br/> PlusX Electric Team </p>
                </body>
            </html>`;
            emailQueue.addEmail(checkOrder.rider_email, 'PlusX Electric App: Booking Confirmation for Your EV Pickup and Drop Off Service', htmlUser);
 
            const htmlAdmin = `<html>
                <body>
                    <h4>Dear Admin,</h4>
                    <p>We have received a new booking for our EV Pickup and Drop-Off service. Please find the details below:</p> 
                    <p>Customer Name  : ${checkOrder.name}</p>
                    <p>Contact No. : ${checkOrder.country_code}-${checkOrder.contact_no}</p>
                    <p>Address     : ${checkOrder.pickup_address}</p>
                    <p>Service Date and Time : ${moment(checkOrder.slot_date_time, 'YYYY-MM-DD HH:mm:ss').format('D MMM, YYYY, h:mm A')}</p>
                    <p>Vehicle Details: ${checkOrder.vehicle_data}</p>
                
                    <a href="https://www.google.com/maps?q=${checkOrder.pickup_latitude},${checkOrder.pickup_longitude}">Address Link</a><br>               
                    <p>Best regards,<br/> PlusX Electric Team </p>
                </body>
            </html>`;
            emailQueue.addEmail(process.env.MAIL_CS_ADMIN, `EV Pickup and Drop-Off - ${request_id}`, htmlAdmin);
 
            // await commitTransaction(conn);
            let responseMsg = 'We have received your booking. Our team will get in touch with you soon!';
            return resp.json({ message: [responseMsg], status: 1, code: 200 });
        } else {
            return resp.json({ message: ['Your booking has been already confirmed!'], status: 0, code: 200 });
        }
    } catch(err) {
        // await rollbackTransaction(conn);
        console.error("Transaction failed:", err);
        tryCatchErrorHandler(err, resp);
        
    } finally {
        // if (conn) conn.release();
    }
});

export const portableChargerInvoice = asyncHandler(async (req, resp) => {
    const {rider_id, request_id, payment_intent_id='', coupon_code='', session_id='' } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id   : ["required"], 
        request_id : ["required"]
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    // const conn = await startTransaction();
    try { 
        const checkOrder = await queryDB(`
            SELECT 
                pcb.user_name, pcb.country_code, pcb.contact_no, pcb.slot_date, pcb.slot_time, pcb.address, pcb.latitude, pcb.longitude, pcb.service_type, rd.fcm_token, rd.rider_email, pcb.vehicle_data 
            FROM 
                portable_charger_booking as pcb
            LEFT JOIN
                riders AS rd ON rd.rider_id = pcb.rider_id
            WHERE 
                pcb.booking_id = ? AND pcb.rider_id = ? AND pcb.status = 'PNR'
            LIMIT 1
        `,[request_id, rider_id]);

        if (!checkOrder) {
            let respMsg = "Booking Request Received! Thank you for booking our portable charger service for your EV. Our team will arrive at the scheduled time."; 
            return resp.json({ message : [respMsg], status: 1, code : 200 });
        }
        const ordHistoryCount = await queryDB(
            'SELECT COUNT(*) as count FROM portable_charger_history WHERE booking_id = ? AND order_status = "CNF"',[request_id]
        );
        if (ordHistoryCount.count === 0) { 

            const insert = await insertRecord('portable_charger_history', ['booking_id', 'rider_id', 'order_status'], [request_id, rider_id, 'CNF']); //, conn

            if(insert.affectedRows == 0) return resp.json({status:0, code:200, message: ["Oops! Something went wrong. Please try again."]});

            if(coupon_code){
                const coupon = await queryDB(`SELECT coupan_percentage FROM coupon WHERE coupan_code = ? LIMIT 1 `, [ coupon_code ]); 
        
                let coupan_percentage = coupon.coupan_percentage ;
                await insertRecord('coupon_usage', ['coupan_code', 'user_id', 'booking_id', 'coupan_percentage'], [coupon_code, rider_id, request_id, coupan_percentage]);  //, conn
            }
            if (checkOrder.service_type.toLowerCase() === "get monthly subscription") {
                await db.execute('UPDATE portable_charger_subscriptions SET total_booking = total_booking + 1 WHERE rider_id = ?', [rider_id]);
            }
            let paymentIntentId = payment_intent_id;
            if(session_id){
                const session = await stripe.checkout.sessions.retrieve(session_id);
                paymentIntentId = session.payment_intent ;
            }
            await updateRecord('portable_charger_booking', { status : 'CNF', payment_intent_id: paymentIntentId}, ['booking_id', 'rider_id'], [request_id, rider_id] );  //, conn

            const href    = 'portable_charger_booking/' + request_id;
            const heading = 'Portable Charging Booking!';
            const desc    = `Booking Confirmed! (${request_id})`;
            createNotification(heading, desc, 'Portable Charging Booking', 'Rider', 'Admin','', rider_id, href);
            createNotification(heading, desc, 'Portable Charging Booking', 'Admin', 'Rider',  rider_id, '', href);
            pushNotification(checkOrder.fcm_token, heading, desc, 'RDRFCM', href);
        
            const htmlUser = `<html>
                <body>
                    <h4>Dear ${checkOrder.user_name},</h4>
                    <p>Thank you for choosing our portable charger service for your EV. We are pleased to confirm that your booking has been successfully received.</p> 
                    <p>Booking Details:</p>
                    <p>Booking ID: ${request_id}</p>
                    <p>Date and Time of Service: ${moment(checkOrder.slot_date, 'YYYY MM DD').format('D MMM, YYYY,')} ${moment(checkOrder.slot_time, 'HH:mm').format('h:mm A')}</p>
                    <p>We look forward to serving you and providing a seamless EV charging experience.</p>
                    <p> Best regards,<br/>PlusX Electric Team </p>
                </body>
            </html>`;
            emailQueue.addEmail(checkOrder.rider_email, 'PlusX Electric App: Booking Confirmation for Your Portable EV Charger', htmlUser);

            const htmlAdmin = `<html>
                <body>
                    <h4>Dear Admin,</h4>
                    <p>We have received a new booking for our Portable Charger service. Please find the details below:</p> 
                    <p>Customer Name       : ${checkOrder.user_name}</p>
                    <p>Contact No.         : ${checkOrder.country_code}-${checkOrder.contact_no}</p>
                    <p>Address             : ${checkOrder.address}</p>            
                    <p>Service Date & Time : ${moment(checkOrder.slot_date, 'YYYY MM DD').format('D MMM, YYYY,')} ${moment(checkOrder.slot_time, 'HH:mm').format('h:mm A')}</p>       
                    <p>Vechile Details : ${checkOrder.vehicle_data}</p> 
                    <a href="https://www.google.com/maps?q=${checkOrder.latitude},${checkOrder.longitude}">Address Link</a><br>
                    <p> Best regards,<br/>PlusX Electric Team </p>
                </body>
            </html>`;
            emailQueue.addEmail(process.env.MAIL_POD_ADMIN, `Portable Charger Booking - ${request_id}`, htmlAdmin);
            
            // await commitTransaction(conn);
            let respMsg = "Booking Request Received! Thank you for booking our portable charger service for your EV. Our team will arrive at the scheduled time."; 
            return resp.json({ message: [respMsg], status: 1, code: 200 });
        } else {
            return resp.json({ message: ['Your booking has been already confirmed!'], status: 0, code: 200 });
        }

    } catch(err) {
        // await rollbackTransaction(conn);
        console.error("Transaction failed:", err);
        tryCatchErrorHandler(err, resp);
    } finally {
        // if (conn) conn.release();
    }
});

export const rsaInvoice = asyncHandler(async (req, resp) => {
    const {rider_id, request_id, payment_intent_id='', coupon_code='', session_id='' } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id   : ["required"], 
        request_id : ["required"]
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    // const conn = await startTransaction();
    try { 
        const checkOrder = await queryDB(`
            SELECT 
                rsa.name, rsa.country_code, rsa.contact_no, rsa.pickup_address, rsa.pickup_latitude, 
                rsa.pickup_longitude, rd.fcm_token, rd.rider_email, 
                (SELECT CONCAT(vehicle_make, "-", vehicle_model) FROM riders_vehicles as rv WHERE rv.vehicle_id = rsa.vehicle_id ) AS vehicle_data
            FROM 
                road_assistance as rsa
            LEFT JOIN
                riders AS rd ON rd.rider_id = rsa.rider_id
            WHERE 
                rsa.request_id = ? AND rsa.rider_id = ? AND rsa.order_status = 'PNR'
            LIMIT 1
        `,[request_id, rider_id]);

        if (!checkOrder) {
            let respMsg = 'We have received your booking and our team will reach out to you soon.'; 
            return resp.json({ message : [respMsg], status: 1, code : 200 });
        }
        const ordHistoryCount = await queryDB(
            'SELECT COUNT(*) as count FROM order_history WHERE order_id = ? AND order_status = "CNF"',[request_id]
        );
        if (ordHistoryCount.count === 0) { 

            const insert = await insertRecord('order_history', ['order_id', 'order_status', 'rider_id'], [request_id, 'CNF', rider_id]); //, conn

            if(insert.affectedRows == 0) return resp.json({status:0, code:200, message: ["Oops! Something went wrong. Please try again."]});

            if(coupon_code){
                const coupon = await queryDB(`SELECT coupan_percentage FROM coupon WHERE coupan_code = ? LIMIT 1 `, [ coupon_code ]); 
                // (SELECT count(id) FROM coupon_usage AS cu WHERE cu.coupan_code = coupon.coupan_code AND user_id = ?) as use_count
                // if(coupon.use_count >= coupon.user_per_user){
                //     return resp.json({ errors: {coupon_code: ["Coupon per user limit exceeded."]} });
                // }
        
                let coupan_percentage = coupon.coupan_percentage ;
                await insertRecord('coupon_usage', ['coupan_code', 'user_id', 'booking_id', 'coupan_percentage'], [coupon_code, rider_id, request_id, coupan_percentage]); //, conn
            }
            let paymentIntentId = payment_intent_id;
            if(session_id){
                const session = await stripe.checkout.sessions.retrieve(session_id);
                paymentIntentId = session.payment_intent ;
            }
            await updateRecord('road_assistance', { order_status : 'CNF', payment_intent_id : paymentIntentId}, ['request_id', 'rider_id'], [request_id, rider_id] ); //, conn

            const href    = 'road_assistance/' + request_id;
            const heading = 'EV Roadside Assistance';
            const desc    = `Booking Confirmed! ID: ( ${request_id} )`;
            createNotification(heading, desc, 'Roadside Assistance', 'Rider', 'Admin','', rider_id, href);
            
            createNotification(heading, desc, 'Roadside Assistance', 'Admin', 'Rider', rider_id, '', href);
            pushNotification(checkOrder.fcm_token, heading, desc, 'RDRFCM', href);
        
            const htmlUser = `<html>
                <body>
                    <h4>Dear ${checkOrder.name},</h4>
                    <p>Thank you for choosing our Roadside Assistance service for your EV. We are pleased to confirm that your booking has been successfully received.</p>
                    <p>Booking Details:</p>
                    <p>Booking ID: ${request_id}</p>
                    <p>Address: ${checkOrder.pickup_address}</p>    
                    <p>We look forward to serving you and providing a seamless EV charging experience.</p>
                    <p>Best regards,<br/> PlusX Electric Team </p>
                </body>
            </html>`;
            emailQueue.addEmail(checkOrder.rider_email, 'PlusX Electric App: Booking Confirmation for EV Roadside Assistance Service', htmlUser);
            const htmlAdmin = `<html>
                <body>
                    <h4>Dear Admin,</h4>
                    <p>We have received a new booking for the EV Roadside Assistance service. Please find the details below:</p>
                    <p>Customer Name   : ${checkOrder.name}</p>
                    <p>Contact No.     : ${checkOrder.country_code}-${checkOrder.contact_no}</p>
                    <p>Address         : ${checkOrder.pickup_address}</p>
                    <p>Vechile Details : ${checkOrder.vehicle_data}</p>
                    <a href="https://www.google.com/maps?q=${checkOrder.pickup_latitude},${checkOrder.pickup_longitude}">Address Link</a><br>           
                    <p>Best regards,<br/> PlusX Electric Team </p>
                </body>
            </html>`;
            const adminEmails = [process.env.MAIL_POD_ADMIN, process.env.MAIL_CHINTAN, process.env.MAIL_NADIA];
            emailQueue.addEmail(adminEmails, `EV Roadside Assistance Booking - ${request_id}`, htmlAdmin);
            
            // await commitTransaction(conn);
            let respMsg = 'We have received your booking and our team will reach out to you soon.'; 
            return resp.json({ message: [respMsg], status: 1, code: 200 });
        } else {
            return resp.json({ message: ['Your booking has been already confirmed!'], status: 0, code: 200 });
        }
    } catch(err) {
        // await rollbackTransaction(conn);
        console.error("Transaction failed:", err);
        tryCatchErrorHandler(err, resp);
    } finally {
        // if (conn) conn.release();
    }
});

export const preSaleTestingInvoice = asyncHandler(async (req, resp) => {
    const {rider_id, request_id, payment_intent_id = '' } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], request_id: ["required"], /* payment_intent_id: ["required"] */ });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const invoiceId = request_id.replace('PCB', 'INVPC');

    const createObj = {
        invoice_id: invoiceId,
        request_id: request_id,
        rider_id: rider_id,
        invoice_date: moment().format('YYYY-MM-DD HH:mm:ss'),
    }

    if(payment_intent_id && payment_intent_id.trim() != '' ){
        const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
        const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
        const cardData = {
            brand:     charge.payment_method_details.card.brand,
            country:   charge.payment_method_details.card.country,
            exp_month: charge.payment_method_details.card.exp_month,
            exp_year:  charge.payment_method_details.card.exp_year,
            last_four: charge.payment_method_details.card.last4,
        };

        createObj.amount = charge.amount;  
        createObj.payment_intent_id = charge.payment_intent;  
        createObj.payment_method_id = charge.payment_method;  
        createObj.payment_cust_id = charge.customer;  
        createObj.charge_id = charge.id;  
        createObj.transaction_id = charge.payment_method_details.card.three_d_secure?.transaction_id || null;  
        createObj.payment_type = charge.payment_method_details.type;  
        createObj.payment_status = charge.status;  
        createObj.currency = charge.currency;  
        createObj.invoice_date = moment(charge.created).format('YYYY-MM-DD HH:mm:ss');
        createObj.receipt_url = charge.receipt_url;
        createObj.card_data = cardData;
    }

    const columns = Object.keys(createObj);
    const values = Object.values(createObj);
    const insert = await insertRecord('ev_pre_sale_testing_invoice', columns, values);

    const data = await queryDB(`
        SELECT 
            psti.invoice_id, psti.amount as price, psti.payment_status, psti.invoice_date, psti.currency, psti.payment_type,  
            evsl.owner_name, evsl.country_code, evsl.mobile_no, evsl.email, evsl.vehicle, evsl.pickup_address, evsl.booking_id, evsl.slot_date, evsl.slot_time_id, 
            (SELECT CONCAT(vehicle_make, "-", vehicle_model) FROM riders_vehicles AS rv WHERE rv.vehicle_id = evsl.vehicle) AS vehicle_data
        FROM 
            ev_pre_sale_testing_invoice AS psti
        LEFT JOIN
            ev_pre_sale_testing AS evsl ON evsl.booking_id = psti.request_id
        WHERE 
            psti.invoice_id = ?
        LIMIT 1
    `, [invoiceId]);

    const invoiceData = { data, numberToWords, formatNumber  };
    const templatePath = path.join(__dirname, '../views/mail/ev-pre-sale-invoice.ejs'); 
    const pdfSavePath = path.join(__dirname, '../public', 'ev-pre-sale-invoice');
    const filename = `${invoiceId}-invoice.pdf`;

    const pdf = await generatePdf(templatePath, invoiceData, filename, pdfSavePath);

    if(pdf.success){
        const html = `<html>
            <body>
                <h4>Dear ${data.owner_name}</h4>
                <p>Thank you for choosing PlusX Electric's EV-pre sale testing. We are pleased to inform you that your booking has been successfully completed. Please find your invoice attached to this email.</p> 
                <p> Regards,<br/> PlusX Electric App Team </p>
            </body>
        </html>`;
        const attachment = {
            filename: `${invoiceId}-invoice.pdf`, path: pdfPath, contentType: 'application/pdf'
        };
    
        emailQueue.addEmail(data.email, 'Your EV-pre Sale Booking Invoice - PlusX Electric App', html, attachment);
    }
    
    if(insert.affectedRows > 0){
        return resp.json({ message: ["Pre-sale Testing Invoice created successfully!"], status:1, code:200 });
    }else{
        return resp.json({ message: ["Oops! Something went wrong! Please Try Again."], status:0, code:200 });
    }
});

export const chargerInstallationInvoice = asyncHandler(async (req, resp) => {
    const {rider_id, request_id, payment_intent_id = '' } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], request_id: ["required"], /* payment_intent_id: ["required"] */ });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const invoiceId = request_id.replace('CIS', 'INVCIS');

    const createObj = {
        invoice_id   : invoiceId,
        request_id   : request_id,
        rider_id     : rider_id,
        invoice_date : moment().format('YYYY-MM-DD HH:mm:ss'),
    }
    if(payment_intent_id && payment_intent_id.trim() != '' ){
        const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
        const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
        const cardData = {
            brand:     charge.payment_method_details.card.brand,
            country:   charge.payment_method_details.card.country,
            exp_month: charge.payment_method_details.card.exp_month,
            exp_year:  charge.payment_method_details.card.exp_year,
            last_four: charge.payment_method_details.card.last4,
        };

        createObj.amount = charge.amount;  
        createObj.payment_intent_id = charge.payment_intent;  
        createObj.payment_method_id = charge.payment_method;  
        createObj.payment_cust_id = charge.customer;  
        createObj.charge_id = charge.id;  
        createObj.transaction_id = charge.payment_method_details.card.three_d_secure?.transaction_id || null;  
        createObj.payment_type = charge.payment_method_details.type;  
        createObj.payment_status = charge.status;  
        createObj.currency = charge.currency;  
        createObj.invoice_date = moment(charge.created).format('YYYY-MM-DD HH:mm:ss');
        createObj.receipt_url = charge.receipt_url;
        createObj.card_data = cardData;
    }

    const columns = Object.keys(createObj);
    const values = Object.values(createObj);
    const insert = await insertRecord('portable_charger_invoice', columns, values);

    const data = await queryDB(`
        SELECT 
            cii.invoice_id, cii.amount AS price, cii.payment_status, cii.invoice_date, cii.currency, cii.payment_type, 
            ci.name, ci.country_code, ci.contact_no, ci.email, ci.request_id, ci.service_type, ci.company_name, ci.resident_type, 
            ci.address, ci.vehicle_model, ci.no_of_charger
        FROM 
            charging_installation_invoice AS cii
        LEFT JOIN
            charging_installation_service AS ci ON cii.request_id = ci.request_id
        WHERE 
            pci.invoice_id = ?
        LIMIT 1
    `, [invoiceId]);

    const invoiceData = { data, numberToWords, formatNumber  };
    const templatePath = path.join(__dirname, '../views/mail/charger-installation-invoice.ejs'); 
    const pdfSavePath = path.join(__dirname, '../public', 'charger-installation-invoice');
    const filename = `${invoiceId}-invoice.pdf`;

    const pdf = await generatePdf(templatePath, invoiceData, filename, pdfSavePath, req);

    if(pdf.success){
        const html = `<html>
            <body>
                <h4>Dear ${data.name}</h4>
                <p>Thank you for choosing PlusX Electric's Charging Installation. We are pleased to inform you that your booking has been successfully completed. Please find your invoice attached to this email.</p> 
                <p> Regards,<br/> PlusX Electric App Team </p>
            </body>
        </html>`;
        const attachment = {
            filename: `${invoiceId}-invoice.pdf`, path: pdfPath, contentType: 'application/pdf'
        };
        emailQueue.addEmail(email.email, 'Your Charging Installation Booking Invoice - PlusX Electric App', html, attachment);
    }
    
    if(insert.affectedRows > 0){
        return resp.json({ message: ["Charger Installation Invoice created successfully!"], status:1, code:200 });
    }else{
        return resp.json({ message: ["Oops! Something went wrong! Please Try Again."], status:0, code:200 });
    }
});