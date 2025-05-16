import moment from "moment";
import dotenv from 'dotenv';
import db from "../../config/db.js";
import emailQueue from "../../emailQueue.js";
import validateFields from "../../validation.js";
import generateUniqueId from 'generate-unique-id';
import { insertRecord, queryDB, getPaginatedData } from '../../dbUtils.js';
import { asyncHandler, createNotification, deleteFile, formatDateInQuery, formatDateTimeInQuery, mergeParam, pushNotification } from "../../utils.js";
dotenv.config();

export const addInsurance = asyncHandler(async (req, resp) => {
    try{
        const fileFields = ['vehicle_registration_img', 'driving_licence', 'car_images', 'car_type_image', 'scretch_image', 'emirates_id'];
        let tempFileNames = {};
        const uploadedFiles = req.files;
        if(req.files && Object.keys(req.files).length > 0){
            fileFields.forEach(field => {
                tempFileNames[field] = uploadedFiles[field]?.map(file => file.filename).join('*') || '';
            });
        }
        
        const { rider_id, owner_name, date_of_birth, country, country_code, mobile_no, email, vehicle, registration_place, car_brand, insurance_expired, bank_loan,
            insurance_expiry, type_of_insurance, bank_name
        } = req.body
        
        const { isValid, errors } = validateFields(req.body, {
            rider_id: ["required"],
            owner_name: ["required"],
            date_of_birth: ["required"],
            country: ["required"],
            country_code: ["required"],
            mobile_no: ["required"],
            email: ["required"],
            vehicle: ["required"],
            registration_place: ["required"],
            car_brand: ["required"],
            insurance_expired: ["required"],
            bank_loan: ["required"],
        });

        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });   
        if (insurance_expired === 'Yes' && !type_of_insurance) resp.json({ status: 0, code: 422, message: ['Type of insurance is required']});
        if (insurance_expired === 'Yes' && !insurance_expiry) resp.json({ status: 0, code: 422, message: ['Insurance expiry is required']});
        if (bank_loan === 'Yes' && !bank_name) return resp.json({ status: 0, code: 422, message: ['Bank name is required']});
        
        let fileNames = {vehicle_registration_img: '',driving_licence: '',car_images: '',car_type_image: '',scretch_image: '',emirates_id: ''};
        if (insurance_expired === 'Yes') {
            Object.keys(tempFileNames).forEach(key => {
                fileNames[key] = tempFileNames[key];
            });
        }
        if(req.files && Object.keys(req.files).length > 0){
            fileFields.forEach(field => {
                uploadedFiles[field]?.forEach(file => {
                    deleteFile('insurance-images', file.filename);
                });
            });
        }
        
        const insuranceId = 'EVI' + generateUniqueId({length:12});
        const fInsuranceExpiry = insurance_expiry ? moment(insurance_expiry, 'YYYY-MM-DD').format('YYYY-MM-DD') : '';
    
        const insert = await insertRecord('ev_insurance', [
            'insurance_id', 'rider_id', 'owner_name', 'date_of_birth', 'country', 'country_code', 'mobile_no', 'email', 'vehicle', 'registration_place', 'car_brand', 
            'bank_loan', 'bank_name', 'type_of_insurance', 'insurance_expiry', 'insurance_expired', 'vehicle_registration_img', 'driving_licence', 'car_images', 
            'car_type_image', 'scretch_image', 'emirates_id', 
        ], [
            insuranceId, rider_id, owner_name, date_of_birth, country, country_code, mobile_no, email, vehicle, registration_place, car_brand, bank_loan, 
            bank_name, type_of_insurance || '', fInsuranceExpiry, insurance_expired, fileNames['vehicle_registration_img'], fileNames['driving_licence'], fileNames['car_images'], 
            fileNames['car_type_image'], fileNames['scretch_image'], fileNames['emirates_id'], 
        ]);
    
        if(insert.affectedRows === 0 ) return resp.json({status:0, code:200, error: true, message: ['Oops! There is something went wrong! Please Try Again']});
    
        const html = `<html>
            <body>
                <h4>Dear ${owner_name},</h4>
                <p>Thank you for selecting PlusX Electric App for your EV insurance requirements. 
                We have successfully received your details, and our EV insurance executive will be reaching out to you shortly.</p><br/>
                <p>We look forward to assisting you with your EV insurance needs.</p> <br /> <br /> 
                <p> Regards,<br/> PlusX Electric App </p>
            </body>
        </html>`;

        emailQueue.addEmail(email, 'Thank You for Choosing PlusX Electric App for Your EV Insurance Needs!', html);
    
        return resp.json({
            status: 1,
            code: 200,
            error: false,
            message: ["Request Submitted! Our customer care team will be in touch with you soon"],
        });

    }catch(err){
        console.log(err);
        return resp.status(500).json({status: 0, code: 500, message: "Oops! There is something went wrong! Please Try Again" });
    }
});

export const insuranceList = asyncHandler(async (req, resp) => {
    const {rider_id, page_no, mobile_no, vehicle } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], page_no: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    let whereField = ['rider_id'];
    let whereValue = [rider_id];

    if(mobile_no){
        whereField.push('mobile_no');
        whereValue.push(`%${mobile_no}%`);
    }
    if(vehicle){
        whereField.push('vehicle');
        whereValue.push(`%${vehicle}%`);
    }

    const result = await getPaginatedData({
        tableName: 'ev_insurance',
        columns: `insurance_id, owner_name, country, country_code, mobile_no, vehicle, car_brand, emirates_id,
            ${formatDateTimeInQuery(['created_at'])}, ${formatDateInQuery(['date_of_birth'])},
            (select concat(vehicle_model, "-", vehicle_make) from riders_vehicles as rv where rv.vehicle_id = ev_insurance.vehicle) 
            AS vehicle_data`,
        sortColumn: 'id',
        sortOrder: 'DESC',
        page_no,
        limit: 10,
        whereField,
        whereValue,
        whereOperator: ['=', 'LIKE', 'LIKE'],
    });

    return resp.json({
        status: 1,
        code: 200,
        message: ["Insurance list fetch successfully!"],
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
        base_url: `${req.protocol}://${req.get('host')}/uploads/pick-drop-invoice/`,
    });
});

export const insuranceDetails = asyncHandler(async (req, resp) => {
    const {rider_id, insurance_id } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], insurance_id: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const insurance = await queryDB(`
        SELECT 
            ev.*, ${formatDateTimeInQuery(['ev.created_at', 'ev.updated_at'])}, ${formatDateInQuery(['ev.insurance_expiry', 'ev.date_of_birth'])},
            (select concat(vehicle_model, "-", vehicle_make) from riders_vehicles as rv where rv.vehicle_id = ev.vehicle) as vehicle_data
        FROM 
            ev_insurance AS ev
        WHERE
            rider_id = ? AND insurance_id = ?
        LIMIT 1
    `, [rider_id, insurance_id]);

    return resp.json({
        message: [ "Insurance details fetch successfully!" ],
        insurance_data: insurance,
        status: 1, 
        code: 200, 
    });
});

export const evPreSaleBooking = asyncHandler(async (req, resp) => {
    const { rider_id, owner_name, country, country_code, mobile_no, email, vehicle, pickup_address, reason_of_testing, pickup_latitude, pickup_longitude, 
        slot_date, slot_time_id 
    } = req.body;
    const { isValid, errors } = validateFields(req.body, {
        rider_id: ["required"],
        owner_name: ["required"],
        country: ["required"],
        country_code: ["required"],
        mobile_no: ["required"],
        email: ["required"],
        vehicle: ["required"],
        pickup_address: ["required"],
        reason_of_testing: ["required"],
        pickup_latitude: ["required"],
        pickup_longitude: ["required"],
        slot_date: ["required"],
        slot_time_id: ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const bookingId = 'EPTS' + generateUniqueId({length:11});
    const fSlotDate = moment(slot_date, "DD-MM-YYYY").format('YYYY-MM-DD');

    const insert = await insertRecord('ev_pre_sale_testing', [
        "booking_id", "rider_id", "owner_name", "country", "country_code", "mobile_no", "email", "vehicle", "pickup_address", "reason_of_testing", "pickup_latitude", 
        "pickup_longitude", "slot_date", "slot_time_id" 
    ],[
        bookingId, rider_id, owner_name, country, country_code, mobile_no, email, vehicle, pickup_address, reason_of_testing, pickup_latitude, pickup_longitude, 
        fSlotDate, slot_time_id 
    ])

    if(insert.affectedRows === 0) return resp.json({status:0, code:200, error: true, message: ["Oops! Something went wrong. Please try again."]});

    const rider = await queryDB(`SELECT fcm_token, rider_name, rider_email FROM riders WHERE rider_id = ?`, [rider_id]);

    const href = 'pre_sale_testing/' + bookingId;
    const heading = 'EV-pre Sale booked!';
    const desc = `Your request for EV-pre sale testing booking_id: ${bookingId} has been placed.`;
    createNotification(heading, desc, 'EV-pre Sale', 'Rider', 'Admin','', rider_id, href);
    pushNotification(rider.fcm_token, heading, desc, 'RDRFCM', href);

    const formattedDateTime = moment().format('DD MM YYYY hh:mm A');

    const htmlUser = `<html>
        <body>
            <h4>Dear ${rider.rider_name},</h4>
            <p>Thank you for using the PlusX Electric App for your Valet Charging service. We have successfully received your booking request. 
            Below are the details of your roadside assistance booking:</p> <br />
            <p>Booking Reference: ${bookingId}</p>
            <p>Date & Time of Request: ${formattedDateTime}</p> 
            <p>Pick Up Address: ${pickup_address}</p>                         
            <p>Reason: ${reason_of_testing}</p><br/><br/>  
            <p> Regards,<br/> The Friendly PlusX Electric Team </p>
        </body>
    </html>`;
    const htmlAdmin = `<html>
        <body>
            <h4>Dear Admin,</h4>
            <p>We have received a new booking for our Valet Charging service. Below are the details:</p> 
            <p>Customer Name : ${rider.rider_name}</p>
            <p>Pickup & Drop Address : ${pickup_address}</p>
            <p>Booking Date & Time : ${formattedDateTime}</p> <br/>                        
            <p> Best regards,<br/> PlusX Electric App </p>
        </body>
    </html>`;

    emailQueue.addEmail(rider.rider_email, 'Your EV-pre Sale Booking Confirmation - PlusX Electric App', htmlUser);
    emailQueue.addEmail(process.env.MAIL_ADMIN, `EV-pre Sale Booking - ${bookingId}`, htmlAdmin);

    return resp.json({
        status: 1,
        code: 200,
        error: false,
        message: ["Thanks for Booking EV Pre Sale Testing! We`ll be in touch shortly. We appreciate your trust in PlusX electric"],
        request_id: bookingId,
    });
});

export const evPreSaleList = asyncHandler(async (req, resp) => {
    const {rider_id, page_no, mobile_no, vehicle } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], page_no: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    let whereField = ['rider_id'];
    let whereValue = [rider_id];

    if(mobile_no){
        whereField.push('mobile_no');
        whereValue.push(`%${mobile_no}%`);
    }
    if(vehicle){
        whereField.push('vehicle');
        whereValue.push(`%${vehicle}%`);
    }

    const result = await getPaginatedData({
        tableName: 'ev_pre_sale_testing',
        columns: `booking_id, owner_name, country, country_code, mobile_no, vehicle,
            ${formatDateTimeInQuery(['created_at'])}, ${formatDateInQuery(['date_of_birth', 'slot_date'])},
            (select concat(vehicle_model, "-", vehicle_make) from riders_vehicles as rv where rv.vehicle_id = ev_pre_sale_testing.vehicle) AS vehicle_data,
            (select concat(start_time, "-", end_time) from ev_pre_sale_testing_slot as slt where slt.slot_id = ev_pre_sale_testing.slot_time_id) AS slot_time
            `,
        sortColumn: 'id',
        sortOrder: 'DESC',
        page_no,
        limit: 10,
        whereField,
        whereValue,
        whereOperator: ['=', 'LIKE', 'LIKE'],
    });

    return resp.json({
        status: 1,
        code: 200,
        message: ["Ev pre sale booking list fetch successfully!"],
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
    });
});

export const evPreSaleDetails = asyncHandler(async (req, resp) => {
    const {rider_id, booking_id } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], booking_id: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const sale = await queryDB(`
        SELECT 
            evpst.*, ${formatDateTimeInQuery(['evpst.created_at', 'evpst.updated_at'])}, ${formatDateInQuery(['evpst.date_of_birth', 'evpst.slot_date'])},
            (select concat(vehicle_model, "-", vehicle_make) from riders_vehicles as rv where rv.vehicle_id = evpst.vehicle) as vehicle_data,
            (select concat(start_time, "-", end_time) from ev_pre_sale_testing_slot as slt where slt.slot_id = evpst.slot_time_id) AS slot_time
        FROM 
            ev_pre_sale_testing AS evpst
        WHERE
            rider_id = ? AND booking_id = ?
        LIMIT 1
    `, [rider_id, booking_id]);

    return resp.json({
        message: [ "Ev pre sale booking details fetch successfully!" ],
        sale_data: sale,
        status: 1, 
        code: 200, 
    });
});

export const preSaleSlotList = asyncHandler(async (req, resp) => {
    const [slot] = await db.execute(`SELECT slot_id, slot_name, start_time, end_time, booking_limit FROM ev_pre_sale_testing_slot WHERE status = ? ORDER BY id ASC`, [1]);

    let result = {};
    
    slot.forEach((element) => {
        if (!result[element.slot_name]) result[element.slot_name] = [];

        result[element.slot_name].push({
            slot_id: element.slot_id,
            slot_name: element.slot_name,
            slot_time: `${moment(element.start_time, 'HH:mm:ss').format('hh:mm A')} - ${moment(element.end_time, 'HH:mm:ss').format('hh:mm A')}`,
            booking_limit: element.booking_limit,
            total_booking: 0,
            start_time: moment(element.start_time, 'HH:mm:ss').format('HH:mm:ss'),
            end_time: moment(element.end_time, 'HH:mm:ss').format('HH:mm:ss')
        });
    });

    return resp.json({
        message: ["Slot List fetched successfully!"],
        data: result,
        status: 1,
        code: 200
    });

    /* const { slot_date } = mergeParam(req);
    if(!slot_date) return resp.json({status:0, code:422, message: 'slot date is required'});
    const fSlotDate = moment(slot_date, 'YYYY-MM-DD').format('YYYY-MM-DD');
    let query = `SELECT slot_id, slot_date, start_time, end_time, booking_limit`;
    if(fSlotDate >=  moment().format('YYYY-MM-DD')){
        query += `,(SELECT COUNT(id) FROM ev_pre_sale_testing AS evpst WHERE evpst.slot_time_id=ev_pre_sale_testing_slot.slot_id AND evpst.slot_date='${slot_date}') AS slot_booking_count`;
    }
    query += ` FROM ev_pre_sale_testing_slot WHERE status = ? ORDER BY id ASC`;
    const [slot] = await db.execute(query, [1]);
    return resp.json({ message: [ "Slot List fetch successfully!" ],  data: slot, status: 1, code: 200 }); */
});
