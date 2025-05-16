    import db from '../../config/db.js';
    import dotenv from 'dotenv';
    import bcrypt from "bcryptjs";
    // import crypto from 'crypto';
    // import { mergeParam, getOpenAndCloseTimings, convertTo24HourFormat} from '../../utils.js';
    import { queryDB, getPaginatedData, insertRecord, updateRecord } from '../../dbUtils.js';
    import validateFields from "../../validation.js";
    dotenv.config();

    export const driverList = async (req, resp) => {
        try {
            
            const { page_no } = req.body;
            const { isValid, errors } = validateFields(req.body, {page_no: ["required"]});
            if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

            const result = await getPaginatedData({
                tableName: 'rsa',
                columns: 'rsa_id, rsa_name, email, country_code, mobile, profile_img, status, booking_type',
                sortColumn: 'created_at',
                sortOrder: 'DESC',
                page_no,
                limit: 10,
                whereField: 'status',
                whereValue: 1
            });
            // 'rsa_id', 'rsa_name', 'email', 'country_code', 'mobile', 'profile_img', 'status', 'booking_type'
            const [slotData] = await db.execute(`SELECT rsa_id, rsa_name, email, country_code, mobile, profile_img, status, booking_type FROM rsa`);

            return resp.json({
                status     : 1,
                code       : 200,
                message    : ["Driver List fetch successfully!"],
                data       : result.data,
                // slot_data  : slotData,
                total_page : result.totalPage,
                total      : result.total,
                base_url   : `${req.protocol}://${req.get('host')}/uploads/driver-images/`,
            });
        } catch (error) {
            console.error('Error fetching charger list:', error);
            resp.status(500).json({ message: 'Error fetching charger lists' });
        }
    };
    export const addDriver = async (req, resp) => {
        try {
            const { rsa_name, rsa_email, mobile, service_type, password, status = 0 } = req.body;   // profile_image
            
            // Validation
            const { isValid, errors } = validateFields({ 
                rsa_name, rsa_email, mobile, service_type, password
            }, {
                rsa_name     : ["required"],
                rsa_email        : ["required"],
                mobile       : ["required"],
                service_type : ["required"], 
                password     : ["required"]
            });
            if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
        
            const [[isExist]] = await db.execute(`
                SELECT 
                    (SELECT COUNT(*) FROM riders AS r WHERE r.rider_mobile = ?) AS check_mob,
                    (SELECT COUNT(*) FROM riders AS r WHERE r.rider_email = ?) AS check_email,

                    (SELECT COUNT(*) FROM rsa WHERE rsa.mobile = ?) AS rsa_mob,
                    (SELECT COUNT(*) FROM rsa WHERE rsa.email = ?) AS rsa_email
                FROM users LIMIT 1
            `, [mobile, rsa_email, mobile, rsa_email]);
            
            const err = [];
            if( isExist.check_mob > 0 || isExist.rsa_mob > 0 ) err.push('Mobile number is already registered.');
            if( isExist.check_email > 0 || isExist.rsa_email > 0 ) err.push('Email alreday exits.');
            if(err.length > 0) return resp.json({ status:0, code:422, message: err });

            // const last      = await queryDB(`SELECT id FROM rsa ORDER BY id DESC LIMIT 1`);
            // const start     = last ? last.id : 0;
            // const nextId    = start + 1;
            // const chargerId = 'DRV' + String(nextId).padStart(4, '0');
            const hashedPswd = await bcrypt.hash(password, 10);
            // const insert = await insertRecord('rsa', [
            //     'rsa_name', 'email', 'country_code', 'mobile', 'booking_type', 'password', 'status'
            // ],[
            //     rsa_name, rsa_email, '+971', mobile, service_type, hashedPswd, status
            // ]);
            return resp.status(500).json({ message: 'Something went wrong', isExist });
            // return resp.json({
            //     message: insert.affectedRows > 0 ? ['Driver added successfully!'] : ['Oops! Something went wrong. Please try again.'],
            //     status: insert.affectedRows > 0 ? 1 : 0
            // });
        } catch (error) {
            console.error('Something went wrong:', error);
            resp.status(500).json({ message: 'Something went wrong' });
        }
    };
    export const editDriver = async (req, resp) => {
        try {
            const { charger_id, charger_name, charger_price, charger_feature, charger_type, status } = req.body;
            const charger_image = req.files && req.files['charger_image'] ? req.files['charger_image'][0].filename : null;

            const { isValid, errors } = validateFields({ 
                charger_id, charger_name, charger_price, charger_feature, charger_type, status, charger_image
            }, {
                charger_id: ["required"],
                charger_name: ["required"],
                charger_price: ["required"],
                charger_feature: ["required"],
                charger_type: ["required"], 
                charger_image: ["required"], 
                status : ["required"]
            });

            if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

            const updates = {
                charger_name, 
                charger_price, 
                charger_feature, 
                charger_type,
                status
            };

            if (charger_image) {
                updates.image = charger_image;
            }

            const update = await updateRecord('portable_charger', updates, ['charger_id'], [charger_id]);

            return resp.json({
                status: update.affectedRows > 0 ? 1 : 0,
                code: 200,
                message: update.affectedRows > 0 ? ['Charger updated successfully!'] : ['Oops! Something went wrong. Please try again.'],
            });

        } catch (error) {
            console.error('Something went wrong:', error);
            resp.status(500).json({ message: 'Something went wrong' });
        }
    };
    export const deleteDriver = async (req, resp) => {
        try {
            const { charger_id } = req.body; 

            const { isValid, errors } = validateFields(req.body, {
                charger_id: ["required"]
            });

            if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

            const [del] = await db.execute(`DELETE FROM portable_charger WHERE charger_id = ?`, [charger_id]);

            return resp.json({
                message: del.affectedRows > 0 ? ['Charger deleted successfully!'] : ['Oops! Something went wrong. Please try again.'],
                status: del.affectedRows > 0 ? 1 : 0
            });
        } catch (err) {
            console.error('Error deleting portable charger', err);
            return resp.json({ status: 0, message: 'Error deleting portable charger' });
        }
    };

