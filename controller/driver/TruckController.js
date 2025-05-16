
import db from '../../config/db.js';
import validateFields from "../../validation.js";
import { insertRecord, queryDB } from '../../dbUtils.js';
import { asyncHandler, mergeParam } from "../../utils.js";

import { tryCatchErrorHandler } from "../../middleware/errorHandler.js";

export const truckFuelAction = asyncHandler(async (req, resp) => {
    try {         
        const { rsa_id, truck_id, fuel_litter, meter_reading, amount } = mergeParam(req);
        const { isValid, errors } = validateFields(mergeParam(req), { 
            rsa_id        : ["required"], 
            truck_id      : ["required"],
            fuel_litter   : ["required"],  
            amount         : ["required"],
            meter_reading : ["required"],
        });
        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
        console.log(req.files)
        if (!req.files || !req.files['truck_image']) return resp.json({ message: ["Truck Image is required"], status: 0, code: 405, error: true });

        if (!req.files || !req.files['invoice_image']) return resp.json({ message: ["Invoice Image is required"], status: 0, code: 405, error: true });

        const checkOrder = await queryDB(`
            SELECT 
                truck_id 
            FROM 
                truck
            WHERE 
                truck_id = ? AND status = 1
            LIMIT 1
        `,[truck_id]);

        if (!checkOrder) {
            return resp.json({ message: [`Sorry no Truck found with this truck id ${truck_id}`], status: 0, code: 422 });
        }
        const truck_image = req.files['truck_image'] ? req.files['truck_image'].map(file => file.filename).join('*') : '';
        const invoice_image = req.files['invoice_image'] ? req.files['invoice_image'].map(file => file.filename).join('*') : '';
        
        const insert = await insertRecord('truck_fuel_history', 
            ['truck_id', 'driver_id', 'meter_reading', 'fuel_litter', 'truck_image', 'invoice_image', 'amount'],
            [truck_id, rsa_id, meter_reading, fuel_litter, truck_image, invoice_image, amount]
        );
        if(insert.affectedRows == 0) return resp.json({ message: ['Oops! Something went wrong! Please Try Again'], status: 0, code: 422 });
        
        return resp.json({
            status  : 1, 
            code    : 200, 
            message : ["Fuel data added successfully"],
            // image_url: `${req.protocol}://${req.get('host')}/uploads/truck-images/${profile_image}`
        });

    } catch(err) {
        console.log(err);
        tryCatchErrorHandler(err, resp, 'Oops! There is something went wrong! while profile update');
    }
});

export const truckList = asyncHandler(async (req, resp) => {
    const { rsa_id  } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), { rsa_id: ["required"] });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
    const [result] = await db.execute(`
        SELECT 
            truck_id, truck_name, truck_number
        FROM 
            truck
        WHERE
            status = 1
        ORDER BY 
            id 
        DESC
    `, []);

    return resp.json({ status:1, code:200, message:["Truck List fetch successfully!"], data: result });
    // return resp.json({status:1, code:200, message:["POD List fetch successfully!"], data: result });
});