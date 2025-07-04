import fs from 'fs';
import path from "path";
import moment from "moment";
import crypto from 'crypto';
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import db from "../../config/db.js";
import emailQueue from "../../emailQueue.js";
import validateFields from "../../validation.js";
import generateUniqueId from 'generate-unique-id';
import { insertRecord, queryDB, updateRecord } from '../../dbUtils.js';
import { mergeParam, generateRandomPassword, checkNumber, generateOTP, storeOTP, getOTP, delOTP, sendOtp, formatDateTimeInQuery, formatDateInQuery, asyncHandler } from '../../utils.js';

dotenv.config(); 

import { tryCatchErrorHandler } from "../../middleware/errorHandler.js";
import { deleteImageFromS3 } from "../../fileUpload.js";

/* Rider Auth */
export const login = asyncHandler(async (req, resp) => {
    const { mobile, password ,fcm_token , country_code } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
        mobile: ["required"], password: ["required"], fcm_token: ["required"], country_code: ["required"],
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const [[rider]] = await db.execute(
        `SELECT rider_id, rider_name, rider_email, profile_img, country_code, country, emirates, status, password, rider_mobile FROM riders WHERE rider_mobile = ? AND country_code = ? LIMIT 1`,
        [mobile, country_code]
    );

    if(!rider) return resp.json({ status: 0, code: 422, message: ["The mobile number is not registered with us. Kindly sign up."] });
    const isMatch = await bcrypt.compare(password, rider.password);
    if (!isMatch) return resp.json({ status:0, code:405, error:true, message: ["Password is incorrect"] });
    if (rider.status == 2) return resp.json({ status:0, code:405, error:true, message: ["You can not login as your status is inactive. Kindly contact to customer care"] });
    
    const token = crypto.randomBytes(12).toString('hex');
    const [update] = await db.execute(`UPDATE riders SET access_token = ?, status = ?, fcm_token = ? WHERE rider_mobile = ?`, [token, 1, fcm_token, mobile]);
    if(update.affectedRows > 0){
        const result = {
            image_url    : `${process.env.DIR_UPLOADS}rider_profile/`,
            rider_id     : rider.rider_id,
            rider_name   : rider.rider_name,
            rider_email  : rider.rider_email,
            profile_img  : rider.profile_img,
            country_code : rider.country_code,
            rider_mobile : rider.rider_mobile,
            country      : rider.country,
            emirates     : rider.emirates,
            access_token : token
        };
    
        return resp.json({status:1, code:200, message: ["Login successful"], result: result});
    }else{
        return resp.json({status:0, code:405, message: ["Oops! There is something went wrong! Please Try Again"], error: true});
    }
});

export const register = asyncHandler(async (req, resp) => {
    const { first_name, last_name, rider_email, country_code, rider_mobile, emirates, added_from } = mergeParam(req);
    
    let validationRules = {
        first_name   : ["required"],
        last_name    : ["required"],
        rider_email  : ["required", "email"],
        country_code : ["required"],
        rider_mobile : ["required"],
        emirates     : ["required"],
    };
    const { isValid, errors } = validateFields(mergeParam(req), validationRules);
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const res = checkNumber(country_code, rider_mobile);
    if(res.status == 0) return resp.json({ status:0, code:422, message: res.msg });

    const mobile = country_code + '' + rider_mobile;
    const [[isExist]] = await db.execute(`
        SELECT rider_mobile, 
            (SELECT COUNT(*) FROM riders AS r WHERE r.rider_email = ?) AS check_email,
            (SELECT COUNT(*) FROM riders AS r1 WHERE r1.rider_mobile = ?) AS check_mob,
            (SELECT COUNT(*) FROM rsa WHERE rsa.mobile = ? ) AS rsa_mob
        FROM 
            riders
        LIMIT 1
    `, [ rider_email, rider_mobile, mobile ]);
    const err = [];
    if(isExist.check_mob > 0 || isExist.rsa_mob > 0 ) return resp.json({ status:0, code:422, message: ['The provided number already exists.'] });
    if(isExist.check_email > 0 ) return resp.json({ status:0, code:422, message: ['Email already registered.'] }); 
    
    
    const rider = await insertRecord('riders', [
        'rider_id', 'rider_name', 'last_name', 'rider_email', 'country_code', 'rider_mobile', 'emirates', 'status', 'added_from' 
    ],[ 'ER', first_name, last_name, rider_email, country_code, rider_mobile, emirates,  0, added_from || 'Android' ]);
    
    if(!rider) return resp.json({status:0, code:405, message: ["Failed to register. Please Try Again"], error: true}); 

    const riderId = 'ER' + String(rider.insertId).padStart(4, '0');
    await db.execute('UPDATE riders SET rider_id = ? WHERE id = ?', [riderId, rider.insertId]);
    
    const result = {
        image_url    : `${process.env.DIR_UPLOADS}rider_profile/`,
        rider_id     : riderId,
        rider_name   : first_name,
        last_name    : last_name,
        rider_email  : rider_email,
        profile_img  : null,
        country_code : country_code,
        rider_mobile : rider_mobile,
        emirates     : emirates,
        // access_token : accessToken,
    };
    return resp.json({ status:1, code:200, message: ["Rider registered successfully"], result: result});
});

export const forgotPassword = asyncHandler(async (req, resp) => {
    const { email } = mergeParam(req);
    if (!email) return resp.status(400).json({ status: 0, code: 405, error: true, message: ['Email is required'] });
    const [[rider]] = await db.execute('SELECT rider_name FROM riders WHERE rider_email=?', [email]);
    
    if(!rider){
        return resp.json({status: 0, code: 400, message: 'Oops! Invalid Email Address'});
    }
    const password = generateRandomPassword(6);
    const hashedPswd = await bcrypt.hash(password, 10);
    await db.execute('UPDATE riders SET password=? WHERE rider_email=?', [hashedPswd, email]);
    
    try {
        const html = `<html>
          <body>
            <h4>Dear ${rider.rider_name},</h4>
            <p>We have generated a new password for you <b>'${password}'</b> Please use this temporary password to log in to your account.</p> 
            <p>Once logged in, we highly recommend that you change your password to something more memorable. You can do this by following these simple steps: </p>
            <p>Log in to your account using the provided temporary password.</p>
            <p>Navigate to the "Profile" section.</p> 
            <p>Look for the "Reset Password" option within the profile settings.</p>                         
            <p>Enter your new password and confirm it.</p> 
            <p>Save the changes.</p> 
            <p>Regards,<br/>PlusX Electric Team </p>
          </body>
        </html>`;
        emailQueue.addEmail(email, `Forgot Password Request - PlusX Electric App`, html);
    
        return resp.status(200).json({ status: 1, code: 200, message: "Password Reset Request! We have sent the new password to your registered email." });
    } catch (error) {
        console.log(error)
       tryCatchErrorHandler(req.originalUrl, error, resp );
        // resp.status(500).json({ status: 0, code: 500, message: "Failed to send email." });
    }
});

export const createOTP = asyncHandler(async (req, resp) => {
    const { mobile, country_code } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {mobile: ["required"], country_code: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const res = checkNumber(country_code, mobile);
    if(res.status == 0) return resp.json({ status:0, code:422, message: res.msg });
    
    let checkCountQuery = 'SELECT COUNT(id) AS count FROM riders WHERE rider_mobile =? AND country_code =?';
    
    const [rows]     = await db.execute(checkCountQuery, [mobile, country_code]);
    const checkCount = rows[0].count;
    
    if (checkCount == 0) return resp.json({ status: 0, code: 422, message: ['The provided mobile number is not registered.'] });
    
    const fullMobile = `${country_code}${mobile}`;
    // let otp          = generateOTP(4);
    let otp          = ( mobile == 508509508 || mobile == '508509508') ? "2404" : generateOTP(4);
    storeOTP(fullMobile, otp);
    // storeOTP(fullMobile, '0587');
    // if( mobile == 508509508 || mobile == '508509508') {
        return resp.json({ status: 1, code: 200, data: otp, message: ['OTP sent successfully!'] });
        
    // } else {
    //     sendOtp( fullMobile,
    //         `Your One-Time Password (OTP) for sign-up is: ${otp}. Do not share this OTP with anyone. Thank you for choosing PlusX Electric App!. A6NKWsZKgrz`
    //     )
    //     .then(result => {
    //         if (result.status === 0) return resp.json(result);
    //         return resp.json({ status: 1, code: 200, data: '', message: ['OTP sent successfully!'] });
    //     })
    //     .catch(err => {
    //         console.error('Error in otpController:', err.message);
    //         return resp.json({ status: 'error', msg: 'Failed to send OTP' });
    //     }); 
    // }
    // 
    
    
});

export const verifyOTP = asyncHandler(async (req, resp) => {
    const { mobile, country_code, fcm_token, otp, device_name ='' } = mergeParam(req);
    
    const { isValid, errors } = validateFields(mergeParam(req), { 
        mobile       : ["required"], 
        country_code : ["required"], 
        fcm_token    : ["required"], 
        otp          : ["required"] 
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const riderData = await queryDB(`SELECT rider_id, rider_name, last_name, rider_email, profile_img, country, emirates, status FROM riders WHERE rider_mobile =? AND country_code =? LIMIT 1`, [mobile, country_code]);

    if(!riderData) return resp.json({ 
        status  : 0, code: 422, 
        message : ["The mobile number is not registered with us. Kindly sign up."] 
    });
    if(riderData.status == 2){
        return resp.json({status: 1, code: 422, message: ["You can not login as your status is inactive. Kindly contact to customer care"]});
    }
    const fullMobile = `${country_code}${mobile}`;
    const cachedOtp  = getOTP(fullMobile);
    
    if (!cachedOtp || cachedOtp !== otp) return resp.json({ status: 0, code: 422, message: ["OTP invalid!"] });

    const token  = crypto.randomBytes(12).toString('hex');
    await updateRecord('riders', { access_token: token, status : 1, fcm_token, device_name }, ['rider_mobile', 'country_code'], [mobile, country_code]);

    // let profileImg = riderData.profile_img ? `${process.env.DIR_UPLOADS}rider_profile/${riderData.profile_img}` : '';
    delOTP(fullMobile);
    let respResult = {
        image_url     : `${process.env.DIR_UPLOADS}rider_profile/`,
        rider_id      : riderData.rider_id,
        rider_name    : riderData.rider_name,
        last_name     : riderData.last_name,
        rider_email   : riderData.rider_email,
        profile_img   : riderData.profile_img,
        rider_mobile  : mobile,
        country_code  : country_code,        
        emirates      : riderData.emirates,
        access_token  : token
    };
    return resp.json({message: [ "Login successful!" ], status: 1, code: 200, is_login: 1, result: respResult});
});

export const logout = asyncHandler(async (req, resp) => {
    const {rider_id} = mergeParam(req);
    if (!rider_id) return resp.json({ status: 0, code: 422, message: ["Rider Id is required"] });
    
    const rider = queryDB(`SELECT EXISTS (SELECT 1 FROM riders WHERE rider_id = ?) AS rider_exists`, [rider_id]);
    if(!rider) return resp.json({status:0, code:400, message: 'Rider ID Invalid!'});

    const update = await updateRecord('riders', {status:0, access_token: ""},['rider_id'], [rider_id]);
    
    if(update.affectedRows > 0){
        return resp.json({status: 1, code: 200, message: 'Logged out sucessfully'});
    }else{
        return resp.json({status: 0, code: 405, message: 'Oops! There is something went wrong! Please Try Again'});
    }

});

export const updatePassword = asyncHandler(async (req, resp) => {
    const { rider_id, old_password, new_password, confirm_password} = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id: ["required"], old_password: ["required"], new_password: ["required"], confirm_password: ["required"]
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    if(new_password != confirm_password) return resp.json({ status: 0, code: 422, message: ['New password and confirm password not matched!'] });
    
    const rider = await queryDB(`SELECT password FROM riders WHERE rider_id=?`, [rider_id]);
    
    const isMatch = await bcrypt.compare(old_password, rider.password);  
    if (!isMatch) return resp.json({ status: 0, code: 422, message: ["Please enter correct current password."] });

    const hashedPswd = await bcrypt.hash(new_password, 10);
    const update = await updateRecord('riders', {password: hashedPswd}, ['rider_id'], [rider_id]);

    return resp.json({
        status: update.affectedRows > 0 ? 1 : 0, 
        code: update.affectedRows > 0 ? 200 : 422, 
        message: update.affectedRows > 0 ? ['Password changed successfully'] : ['Failed to updated password. Please Try Again']
    });
});

/* Rider Info */
export const home = asyncHandler(async (req, resp) => {
    const {rider_id} = mergeParam(req);
    if (!rider_id) return resp.json({ status: 0, code: 422, message: ["Rider Id is required"] });
    
    const riderQuery = `SELECT rider_id, rider_name, 
        (SELECT COUNT(*) FROM notifications AS n WHERE n.panel_to = 'Rider' AND n.receive_id = rider_id AND status = '0') AS notification_count
        FROM riders WHERE rider_id = ?
    `;
    const riderData = await queryDB(riderQuery, [rider_id]);

    if (!riderData) {
        return resp.status(404).json({ message: "Rider not found", status: 0 });
    }
    const result = {
        rider_id           : riderData.rider_id,
        rider_name         : riderData.rider_name,
        notification_count : riderData.notification_count
    };
    const orderData = await queryDB(
        `SELECT request_id, (SELECT CONCAT(rsa_name, ',', country_code, ' ', mobile) FROM rsa WHERE rsa_id = road_assistance.rsa_id) AS rsaDetails, created_at 
        FROM road_assistance WHERE rider_id = ? AND order_status NOT IN ('PNR', 'CNF', 'A', 'PU', 'C', 'RO', 'CC') ORDER BY id DESC LIMIT 1
    `, [rider_id]);
    
    if (orderData) orderData.eta_time = '12 Min.';
    
    const pickDropData = await queryDB(
        `SELECT request_id, (SELECT CONCAT(rsa_name, ',', country_code, ' ', mobile) FROM rsa WHERE rsa_id = charging_service.rsa_id) AS rsaDetails, created_at 
        FROM charging_service WHERE rider_id = ? AND order_status NOT IN ('CNF', 'A', 'WC', 'C', 'PNR', 'DO') ORDER BY id DESC LIMIT 1
    `, [rider_id]);
    
    if (pickDropData) pickDropData.eta_time = '11 Min.';
    
    const podBookingData = await queryDB(
        `SELECT booking_id AS request_id, (SELECT CONCAT(rsa_name, ',', country_code, ' ', mobile) FROM rsa WHERE rsa_id = portable_charger_booking.rsa_id) AS rsaDetails, created_at 
        FROM portable_charger_booking WHERE rider_id = ? AND status NOT IN ('PNR', 'CNF', 'A', 'PU', 'C', 'RO', 'CC') ORDER BY id DESC LIMIT 1
    `, [rider_id]);
    //  created_at >= NOW() - INTERVAL 30 MINUTE

    if (podBookingData) podBookingData.eta_time = '11 Min.';
    
    const priceQry  = `SELECT roadside_assistance_price, portable_price, pick_drop_price FROM booking_price LIMIT 1`;
    const priceData = await queryDB(priceQry, []);

    return resp.json({
        message                   : ["Rider Home Data fetched successfully!"],
        rider_data                : result,
        order_data                : orderData || null,
        pick_drop_order           : pickDropData || null,
        pod_booking               : podBookingData || null,
        roadside_assistance_price : priceData.roadside_assistance_price,
        portable_price            : priceData.portable_price,
        pick_drop_price           : priceData.pick_drop_price,
        status                    : 1,
        code                      : 200
    });
});

export const getRiderData = asyncHandler(async(req, resp) => {
    const {rider_id} = mergeParam(req);
    if (!rider_id) return resp.json({ status: 0, code: 422, message: ["Rider Id is required"] });
    
    const rider = await queryDB(`SELECT *, ${formatDateTimeInQuery(['created_at', 'updated_at'])}, ${formatDateInQuery(['date_of_birth'])} FROM riders WHERE rider_id=?`, [rider_id]);
    rider.image_url = `${process.env.DIR_UPLOADS}rider_profile/`;

    return resp.json({
        status  : 1, 
        code    : 200, 
        message : ['Rider Data fetch successfully!'], 
        data    : rider, 
    });
});

export const updateProfile = asyncHandler(async (req, resp) => {
    try {
        let profile_image = '';
        // console.log(req.files);
        // console.log(req.files['profile_image']);
        if(req.files && req.files['profile_image']) { 
            const files   = req.files;
            profile_image = files ? files['profile_image'][0].filename : '';
        }
        const { rider_id, first_name, last_name, rider_email, country_code, rider_mobile, emirates} = mergeParam(req);
        const riderId = rider_id;
        const { isValid, errors } = validateFields(mergeParam(req), {
            rider_id     : ["required"], 
            first_name   : ["required"], 
            last_name    : ["required"], 
            rider_email  : ["required"], 
            country_code : ["required"], 
            rider_mobile : ["required"], 
            emirates     : ["required"]
        });
        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
        const rider = await queryDB(`SELECT profile_img FROM riders WHERE rider_id=?`, [riderId]);

        if(req.files && req.files['profile_image']) { 

            const oldImagePath = path.join('_uploads', 'rider_profile', rider.profile_img || '').replace(/\\/g, '/');
            await deleteImageFromS3(oldImagePath);
            
            // fs.unlink(oldImagePath, (err) => {
            //     if (err) {
            //         console.error(`Failed to delete rider old image: ${oldImagePath}`, err);
            //     }
            // });
        }
        const updates = {
            rider_name : first_name, 
            last_name, 
            rider_email, 
            // country_code, 
            // rider_mobile, 
            emirates, 
            profile_img : profile_image
        };
        await updateRecord('riders', updates, ['rider_id'], [riderId]);
        
        return resp.json({status: 1, code: 200, message: ["Rider profile updated successfully"]});
    } catch(err) {
        console.log(err);
        tryCatchErrorHandler(req.originalUrl, err, resp );
    }
});

export const deleteImg = asyncHandler(async (req, resp) => {
    const {rider_id} = mergeParam(req);
    if (!rider_id) return resp.json({ status: 0, code: 422, message: ["Rider Id is required"] });
    
    const rider = await queryDB(`SELECT profile_img FROM riders WHERE rider_id = ?`, [rider_id]);
    if(!rider) return resp.json({status:0, code:400, message: 'Rider ID Invalid!'});
    
    const update       = await updateRecord('riders', {profile_img: ''}, ['rider_id'], [rider_id]);
    const oldImagePath = path.join('_uploads', 'rider_profile', rider.profile_img || '').replace(/\\/g, '/');
    await deleteImageFromS3(oldImagePath);
    
    // fs.unlink(oldImagePath, (err) => {
    //     if (err) {
    //         console.error(`Failed to delete rider old image: ${oldImagePath}`, err);
    //     }
    // });

    return resp.json({
        status: update.affectedRows > 0 ? 1 : 0,
        code: 200,
        message: update.affectedRows > 0 ? ['Rider profile image deleted successfully!'] : ['Oops! Something went wrong. Please try again.'],
    });
});
 
export const deleteAccount = asyncHandler(async (req, resp) => {
    const {rider_id} = mergeParam(req);
    const riderId    = rider_id;
    if (!riderId) return resp.json({ status: 0, code: 422, message: ["Rider Id is required"] });

    // const connection = await db.getConnection();
    try {
        // await connection.beginTransaction();
        
        const rider = await queryDB('SELECT profile_img, rider_name, last_name, rider_email, country_code, rider_mobile, emirates, area, country, date_of_birth, added_from FROM riders WHERE rider_id = ?', [riderId]);
        if(!rider) return resp.json({status:0, message: 'Rider not found.'});
        // if(rider.profile_img) deleteFile('rider_profile', rider.profile_img);

        // 'DELETE FROM notifications                         WHERE receive_id = ?',
        // 'DELETE FROM road_assistance                       WHERE rider_id   = ?',
        // 'DELETE FROM order_assign                          WHERE rider_id   = ?',
        // 'DELETE FROM order_history                         WHERE rider_id   = ?',
        // 'DELETE FROM charging_installation_service         WHERE rider_id   = ?',
        // 'DELETE FROM charging_installation_service_history WHERE rider_id   = ?',
        // 'DELETE FROM charging_service                      WHERE rider_id   = ?',
        // 'DELETE FROM charging_service_history              WHERE rider_id   = ?',
        // 'DELETE FROM portable_charger_booking              WHERE rider_id   = ?',
        // 'DELETE FROM portable_charger_booking_assign       WHERE rider_id   = ?',
        // 'DELETE FROM portable_charger_booking_rejected     WHERE rider_id   = ?',
        // 'DELETE FROM portable_charger_history              WHERE rider_id   = ?',
        // 'DELETE FROM discussion_board                      WHERE rider_id   = ?',
        // 'DELETE FROM board_comment                         WHERE rider_id   = ?',
        // 'DELETE FROM board_comment_reply                   WHERE rider_id   = ?',
        // 'DELETE FROM board_likes                           WHERE rider_id   = ?',
        // 'DELETE FROM board_poll                            WHERE rider_id   = ?',
        // 'DELETE FROM board_poll_vote                       WHERE rider_id   = ?',
        // 'DELETE FROM board_share                           WHERE sender_id  = ?',
        // 'DELETE FROM board_views                           WHERE rider_id   = ?',    
        const deleteQueries = [
            'DELETE FROM riders                                WHERE rider_id   = ?'
        ];
        for (const query of deleteQueries) {
            await db.execute(query, [rider_id]);
        }
        await insertRecord('deleted_riders', [
            'rider_id', 'rider_name', 'last_name', 'rider_email', 'country_code', 'rider_mobile', 'emirates', 'area', 'country', 'profile_img', 'date_of_birth', 'added_from' 
        ],[
            riderId, rider.rider_name, rider.last_name, rider.rider_email, rider.country_code, rider.rider_mobile,  rider.emirates, rider.area, rider.country, rider.profile_img, rider.date_of_birth, rider.added_from 
        ]);
        // await connection.commit();

        return resp.json({status: 1, code: 200, error: false, message: ['Rider Account deleted successfully!']});
    } catch(err) {
        // await connection.rollback();
        console.error('Error deleting rider account:', err.message);
        tryCatchErrorHandler(req.originalUrl, err, resp );
    } finally {
        // connection.release();
    }
});

export const locationList = asyncHandler(async (req, resp) => {
    const [list] = await db.execute(`SELECT location_id, location_name, latitude, longitude, plat_code as emirates_code FROM locations ORDER BY location_name ASC`);
    return resp.json({status: 1, code: 200, message: '', data: list});
});

export const locationAdd = asyncHandler(async (req, resp) => {
    const { location_name, latitude, longitude, status } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), { location_name: ["required"], latitude: ["required"], longitude: ["required"], status: ["required"] });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    if (![1, 2].includes(status)) return resp.json({status:0, code:422, message:"Status should be 1 or 2"});

    const {last_index} = await queryDB(`SELECT MAX(id) AS last_index FROM locations`);
    const nextId = (!last_index) ? 0 : last_index + 1;
    const locId = 'Loc' + String(nextId).padStart(4, '0');

    const insert = await insertRecord('locations', ['location_id', 'location_name', 'latitude', 'longitude', 'status'], [locId, location_name, latitude, longitude, status]);

    return resp.json({
        message: insert.affectedRows > 0 ? ['Location added successfully!'] : ['Oops! Something went wrong. Please try again.'],
        status: insert.affectedRows > 0 ? 1 : 0,
        code: 200,
    });
});

export const notificationList = asyncHandler(async (req, resp) => {
    const { rider_id, page_no} = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id: ["required"], page_no: ["required"],
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const limit = 10;
    const start = parseInt((page_no * limit) - limit, 10);

    const totalRows = await queryDB(`SELECT COUNT(*) AS total FROM notifications WHERE panel_to = ? AND receive_id = ?`, ['Rider', rider_id]);
    const total_page = Math.ceil(totalRows.total / limit) || 1; 
    
    const [rows] = await db.execute(`SELECT id, heading, description, module_name, panel_to, panel_from, receive_id, status, ${formatDateTimeInQuery(['created_at'])}, href_url
        FROM notifications WHERE panel_to = 'Rider' AND receive_id = ? ORDER BY id DESC LIMIT ${start}, ${parseInt(limit)} 
    `, [rider_id]);
    
    const notifications = rows;
    
    await db.execute(`UPDATE notifications SET status=? WHERE status=? AND panel_to=? AND receive_id=?`, ['1', '0', 'Rider', rider_id]);
    
    return resp.json({status:1, code: 200, message: "Notification list fetch successfully", data: notifications, total_page: total_page, totalRows: totalRows.total});
});

/* Rider Address */
export const riderAddressList = asyncHandler(async (req, resp) => {
    try{
        const { rider_id, address_type, booking_for, emirate } = mergeParam(req);

        let query = `SELECT *, ${formatDateTimeInQuery(['created_at', 'updated_at'])} FROM rider_address WHERE rider_id = ?`;
        let queryParams = [rider_id];
        
        if(emirate && emirate.trim() && emirate.toLowerCase() == 'dubai'){
            query += ` AND emirate = '${emirate}'`;
        }

        if (address_type) {
            const types = address_type.split(",").map(type => type.trim());
            if (types.length > 0) {
                query += ` AND nick_name IN (${types.map(() => '?').join(', ')})`;
                queryParams.push(...types);
            }
        }

        if (booking_for) {
            query += ` AND booking_for = ?`;
            queryParams.push(booking_for);
        }

        query += ` ORDER BY id DESC`;
        const [result] = await db.execute(query, queryParams);
        return resp.json({message: ['We apologize! Our services are currently unavailable in JLT'], status: 1, code: 200, data: result});
    }catch(err){
        console.error('Error fetching rider addresses:', err);
        tryCatchErrorHandler(req.originalUrl, err, resp );
    }
});

export const addRiderAddress = asyncHandler(async (req, resp) => {

    const { rider_id, building_name, flat_no, street_name='', landmark, emirates, nick_name, latitude, longitude, booking_for, area } = mergeParam(req);
    // console.log(req.area:);
    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id      : ["required"], 
        building_name : ["required"], 
        flat_no       : ["required"], 
        // street_name   : ["required"],
        landmark      : ["required"], 
        emirates      : ["required"],
        nick_name     : ["required"],  
        latitude      : ["required"], 
        longitude     : ["required"], 
        booking_for   : ["required"],
        area          : ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const last      = await queryDB(`SELECT id FROM rider_address ORDER BY id DESC LIMIT 1`);
    const start     = last ? last.id : 0;
    const nextId    = start + 1;
    const addressId = 'ADDR' + String(nextId).padStart(4, '0');
    
    await updateRecord('rider_address', {default_add : 0}, ['rider_id' ], [rider_id ]);
    const default_add = 1; //, ( SELECT count(id) FROM rider_address where rider_id = '${rider_id}') as address_count
    // last.address_count ? 0 : 
    
    const insert = await insertRecord('rider_address', [
        'address_id', 'rider_id', 'building_name', 'unit_no', 'street_name', 'landmark', 'emirate', 'nick_name',  'latitude', 'longitude', 'booking_for', 'area', 'default_add' 
    ],[
        addressId, rider_id, building_name, flat_no, street_name, landmark, emirates, nick_name, latitude, longitude, booking_for, area, default_add
    ]);
    return resp.json({
        message: insert.affectedRows > 0 ? ['Address added successfully!'] : ['Oops! Something went wrong. Please try again.'],
        status: insert.affectedRows > 0 ? 1 : 0
    });
    
});
export const editRiderAddress = asyncHandler(async (req, resp) => {

    const { rider_id, address_id, building_name, flat_no, street_name='', landmark, emirates, nick_name, latitude, longitude, booking_for='', area } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id      : ["required"], 
        address_id    : ["required"], 
        building_name : ["required"], 
        flat_no       : ["required"],
        landmark      : ["required"], 
        emirates      : ["required"],
        nick_name     : ["required"],  
        latitude      : ["required"], 
        longitude     : ["required"],
        area          : ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const updates = {building_name, unit_no : flat_no, street_name, landmark, emirate : emirates, nick_name, latitude, longitude, booking_for, area };

    const update = await updateRecord('rider_address', updates, ['rider_id', 'address_id'], [rider_id, address_id]);
    return resp.json({
        status  : update.affectedRows > 0 ? 1 : 0,
        code    : 200,
        message : update.affectedRows > 0 ? ['Rider Address updated successfully!'] : ['Oops! Something went wrong. Please try again.'],
    }); 
    
});

export const deleteRiderAddress = asyncHandler(async (req, resp) => {
    try{
        const {rider_id, address_id} = mergeParam(req);
        // console.log(rider_id, address_id);
        const { isValid, errors } = validateFields(mergeParam(req), {
            rider_id: ["required"], address_id: ["required"]
        });
        
        if (!isValid) return resp.json({ status: 0, code: 422, message: errors }); 
        
        const [del] = await db.execute(`DELETE FROM rider_address WHERE rider_id=? AND address_id=?`,[rider_id, address_id]);
        
        return resp.json({
            message: del.affectedRows > 0 ? ['Address deleted successfully!'] : ['Oops! Something went wrong. Please try again.'],
            status: del.affectedRows > 0 ? 1 : 0
        });
    }catch(err){
        // console.log('Error deleting record', err);
        tryCatchErrorHandler(req.originalUrl, err, resp );
    }
});

/* Rider Vehicle  */
export const riderVehicleList = asyncHandler(async (req, resp) => {
    try{
        const { rider_id, vehicle_type  } = mergeParam(req);
        if (!rider_id) return resp.json({ status: 0, code: 422, message: ["Rider Id is required"]});
        
        let query = ` SELECT vehicle_id, vehicle_type, vehicle_number as plate_number, vehicle_code as plate_code, vehicle_model, vehicle_make as vehicle_brand, vehicle_specification, emirates, default_vehicle FROM riders_vehicles WHERE rider_id = ? `;
        let queryParams = [rider_id];
    
        if (vehicle_type && vehicle_type.trim() !== '') {
            query += ' AND vehicle_type = ?';
            queryParams.push(vehicle_type);
        }
        query += ` ORDER BY id DESC`;
        const [result] = await db.execute(query, queryParams);
        return resp.json({status: 1, code: 200, message: 'List fecth', data: result});
    } catch(err) {
        console.error('Error fetching rider vehicles:', err);
        tryCatchErrorHandler(req.originalUrl, err, resp );
    }
});

export const addRiderVehicle = asyncHandler(async (req, resp) => {
    // const {rider_id, vehicle_type, vehicle_make, vehicle_model, year_manufacture, owner_type, emirates, vehicle_code='', vehicle_number='', leased_from='', vehicle_specification='', owner='', regional_specification=''} 

    const {rider_id, vehicle_type, vehicle_brand, vehicle_model, vehicle_specification, emirates, plate_code, plate_number } = mergeParam(req);
        
    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id              : ["required"], 
        vehicle_type          : ["required"], 
        vehicle_brand         : ["required"], 
        vehicle_model         : ["required"], 
        vehicle_specification : ["required"], 
        emirates              : ["required"],
        plate_code            : ["required"], 
        plate_number          : ["required"], 
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors }); 
    
    // const {is_vehicle} = await queryDB(`SELECT EXISTS (SELECT 1 FROM riders_vehicles WHERE rider_id = ? ) AS is_vehicle`, [rider_id]);
    // const default_vehicle = is_vehicle ? 0 : 1;
    await updateRecord('riders_vehicles', {default_vehicle : 0 }, ['rider_id' ], [rider_id ]);

    const insert = await insertRecord('riders_vehicles', [
        'vehicle_id', 'rider_id', 'vehicle_type', 'vehicle_make', 'vehicle_model', 'vehicle_specification', 'emirates', 'vehicle_code', 'vehicle_number', 'default_vehicle'  
    ],[
        'RDV'+generateUniqueId({length:13}), rider_id, vehicle_type, vehicle_brand, vehicle_model, vehicle_specification, emirates, plate_code, plate_number, 1  
    ]);
    return resp.json({
        status: insert.affectedRows > 0 ? 1 : 0,
        code: 200,
        message: insert.affectedRows > 0 ? ['Rider vehicle added successfully!'] : ['Oops! Something went wrong. Please try again.'],
    }); 
});

export const editRiderVehicle = asyncHandler(async (req, resp) => {
    // const {rider_id, vehicle_id, vehicle_type, vehicle_make, vehicle_model, year_manufacture, owner_type, emirates, vehicle_code='', vehicle_number='', leased_from='', vehicle_specification='', owner='', regional_specification=''} = mergeParam(req);

    const {rider_id, vehicle_id, vehicle_type, vehicle_brand, vehicle_model, vehicle_specification, emirates, plate_code, plate_number } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id              : ["required"], 
        vehicle_id            : ["required"], 
        vehicle_type          : ["required"], 
        vehicle_brand         : ["required"], 
        vehicle_model         : ["required"], 
        vehicle_specification : ["required"], 
        emirates              : ["required"],
        plate_code            : ["required"], 
        plate_number          : ["required"], 
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors }); 
    
    const updates = {vehicle_type, vehicle_make : vehicle_brand, vehicle_model, vehicle_specification, emirates, vehicle_code : plate_code, vehicle_number : plate_number };

    const update = await updateRecord('riders_vehicles', updates, ['rider_id', 'vehicle_id'], [rider_id, vehicle_id]);

    return resp.json({
        status: update.affectedRows > 0 ? 1 : 0,
        code: 200,
        message: update.affectedRows > 0 ? ['Rider vehicle updated successfully!'] : ['Oops! Something went wrong. Please try again.'],
    }); 
});

export const deleteRiderVehicle = asyncHandler(async (req, resp) => {
    const {rider_id, vehicle_id} = mergeParam(req);
        
    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id: ["required"], vehicle_id: ["required"]
    });
    
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors }); 
    
    const [del] = await db.execute(`DELETE FROM riders_vehicles WHERE rider_id=? AND vehicle_id=?`,[rider_id, vehicle_id]);
        
    return resp.json({
        message: del.affectedRows > 0 ? ['Rider vehicle deleted successfully!'] : ['Oops! Something went wrong. Please try again.'],
        status: del.affectedRows > 0 ? 1 : 0,
        code: 200
    });
});

export const defaultAddress = asyncHandler(async (req, resp) => {

    const { rider_id, address_id, default_address } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id        : ["required"], 
        address_id      : ["required"], 
        default_address : ["required"], 
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    await updateRecord('rider_address', {default_add : 0}, ['rider_id' ], [rider_id ]);

    const updates = { default_add : 1 };
    const update  = await updateRecord('rider_address', updates, ['rider_id', 'address_id'], [rider_id, address_id]);
    return resp.json({
        status  : update.affectedRows > 0 ? 1 : 0,
        code    : 200,
        message : update.affectedRows > 0 ? ['Default Address set successfully!'] : ['Oops! Something went wrong. Please try again.'],
    }); 
    
}); //
export const defaultVehicle = asyncHandler(async (req, resp) => {
    
    const {rider_id, vehicle_id, default_vehicle } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
        rider_id        : ["required"], 
        vehicle_id      : ["required"], 
        default_vehicle : ["required"], 
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors }); 
    
    await updateRecord('riders_vehicles', {default_vehicle : 0 }, ['rider_id' ], [rider_id ]);

    const updates = {default_vehicle : 1 };
    const update  = await updateRecord('riders_vehicles', updates, ['rider_id', 'vehicle_id'], [rider_id, vehicle_id]);

    return resp.json({
        status: update.affectedRows > 0 ? 1 : 0,
        code: 200,
        message: update.affectedRows > 0 ? ['Rider vehicle updated successfully!'] : ['Oops! Something went wrong. Please try again.'],
    }); 
});