import db from '../../config/db.js';
import dotenv from 'dotenv';
import moment from "moment";
import { queryDB, getPaginatedData, insertRecord, updateRecord } from '../../dbUtils.js';
import validateFields from "../../validation.js";
import generateUniqueId from 'generate-unique-id';
import { formatDateInQuery, formatDateTimeInQuery } from '../../utils.js';
dotenv.config();

export const truckList = async (req, resp) => {
    try {
        const {page_no, search_text = '' } = req.body;
        const { isValid, errors } = validateFields(req.body, {page_no: ["required"]});
        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

        const result = await getPaginatedData({
            tableName        : 'truck',
            columns          : `truck_id, truck_name, truck_number, status, ${formatDateTimeInQuery(['created_at'])}`,
            sortColumn       : 'id',
            sortOrder        : 'DESC',
            page_no,
            limit            : 10,
            liveSearchFields : ['truck_name', 'truck_number'],
            liveSearchTexts  : [search_text, search_text],
            whereField       : 'status',
            whereValue       : 1
        });
        return resp.json({
            status     : 1,
            code       : 200,
            message    : ["Truck List fetch successfully!"],
            data       : result.data,
            total_page : result.totalPage,
            total      : result.total,
        });
    } catch (error) {
        console.error('Error fetching device list:', error);
        resp.status(500).json({ message: 'Error fetching device lists' });
    }
};

export const truckDetails = async (req, resp) => {
    try {
        const { truck_id, } = req.body;

        const { isValid, errors } = validateFields(req.body, {
            truck_id : ["required"]
        });

        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

        const truckDetails = await queryDB(`
            SELECT 
                truck_id, truck_name, truck_number, status, ${formatDateTimeInQuery(['created_at'])}
            FROM 
                truck 
            WHERE 
                truck_id = ?`, 
            [truck_id]
        );

        return resp.json({
            status  : 1,
            code    : 200,
            message : ["Truck Details fetched successfully!"],
            data    : truckDetails,
        });
    } catch (error) {
        console.error('Error fetching device details:', error);
        return resp.status(500).json({ status: 0, message: 'Error fetching device details' });
    }
};

export const addtruck = async (req, resp) => {
    
    try {
        const { truckName, truckNumber } = req.body;
        
        const { isValid, errors } = validateFields({ 
            truckName, truckNumber
        }, {
            truckName   : ["required"],
            truckNumber : ["required"] 
        });
        if (!isValid) return resp.json({ status : 0, code : 422, message : errors });

        const [[isExist]] = await db.execute(`
            SELECT 
                (SELECT COUNT(id) FROM truck where truck_number = ? ) AS check_truck
            FROM 
                users
            LIMIT 1
        `, [truckNumber]);

        if( isExist.check_truck ) return resp.json({ status : 0, code : 422, message : 'Truck Number is already registered.'});
        
        const insert = await insertRecord('truck', [
            'truck_id', 'truck_name', 'truck_number', 'status'
        ],[
            `TRK-${generateUniqueId({length:8})}`, truckName, truckNumber, 1
        ]);
        return resp.json({
            code    : 200,
            message : insert.affectedRows > 0 ? ['Truck added successfully!'] : ['Oops! Something went wrong. Please try again.'],
            status : insert.affectedRows > 0 ? 1 : 0
        });
    } catch (error) {
        console.error('Something went wrong:', error);
        resp.status(500).json({ message: 'Something went wrong' });
    }
};

export const editTruck = async (req, resp) => {
    try {
        const { truck_id, truckName, truckNumber } = req.body;
       
        const { isValid, errors } = validateFields({ 
            truck_id, truckName, truckNumber
        }, {
            truck_id    : ["required"],
            truckName   : ["required"],
            truckNumber : ["required"]
        });
        if (!isValid) return resp.json({ status : 0, code : 422, message : errors });

        const [[isExist]] = await db.execute(`
            SELECT 
                (SELECT COUNT(id) FROM truck where truck_number = ? and truck_id != ? ) AS check_truck
            FROM 
                truck
            WHERE 
                truck_id = ? 
            LIMIT 1
        `, [truckNumber, truck_id, truck_id]);

        if( isExist.length == 0 ) return resp.json({ status : 0, code : 422, message : 'Truck Id is not registered.'});
        if( isExist.check_truck ) return resp.json({ status : 0, code : 422, message : 'Truck Number is already registered.'});

        const updates = { 
            truck_name   : truckName,
            truck_number : truckNumber,
        };
        const update = await updateRecord('truck', updates, ['truck_id'], [truck_id]);

        return resp.json({
            status  : update.affectedRows > 0 ? 1 : 0,
            code    : 200,
            message : update.affectedRows > 0 ? ['Truck updated successfully!'] : ['Oops! Something went wrong. Please try again.'],
        });

    } catch (error) {
        console.error('Something went wrong:', error);
        resp.status(500).json({ message: 'Something went wrong' });
    }
};

export const deleteTruck = async (req, resp) => {
    try {
        const { deviceId }        = req.body; 
        const { isValid, errors } = validateFields(req.body, {
            deviceId : ["required"]
        });
        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

        const [del] = await db.execute(`DELETE FROM pod_devices WHERE device_id = ?`, [deviceId]);
        return resp.json({
            code    : 200,
            message : del.affectedRows > 0 ? ['POD Device deleted successfully!'] : ['Oops! Something went wrong. Please try again.'],
            status: del.affectedRows > 0 ? 1 : 0
        });
    } catch (err) {
        console.error('Error deleting portable charger', err);
        return resp.json({ status: 0, message: 'Error deleting portable charger' });
    }
};

export const truckFuelHhistory = async (req, resp) => {
    try {
        const { truckId, page_no, search_text = '', start_date='', end_date='' } = req.body;
        const { isValid, errors } = validateFields(req.body, {truckId: ["required"], page_no: ["required"]});
        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

        const params = {
            tableName        : 'truck_fuel_history',
            columns          : `truck_id, amount, fuel_litter, meter_reading, ${formatDateTimeInQuery(['created_at'])}, 
            (select rsa.rsa_name from rsa where rsa.rsa_id = truck_fuel_history.driver_id) as rsa_name, truck_image, invoice_image`,
            sortColumn       : 'created_at',
            sortOrder        : 'DESC',
            page_no,
            limit            : 10,
            liveSearchFields : [], 
            liveSearchTexts  : [],
            whereField       : [],  
            whereValue       : [],
            whereOperator    : []
        };
        if (start_date && end_date) {
            
            const startToday = new Date(start_date);
            const startFormattedDate = `${startToday.getFullYear()}-${(startToday.getMonth() + 1).toString()
                .padStart(2, '0')}-${startToday.getDate().toString().padStart(2, '0')}`;
                        
            const givenStartDateTime    = startFormattedDate+' 00:00:01'; // Replace with your datetime string
            const modifiedStartDateTime = moment(givenStartDateTime).subtract(4, 'hours'); // Subtract 4 hours
            const start        = modifiedStartDateTime.format('YYYY-MM-DD HH:mm:ss')
            
            const endToday = new Date(end_date);
            const formattedEndDate = `${endToday.getFullYear()}-${(endToday.getMonth() + 1).toString()
                .padStart(2, '0')}-${endToday.getDate().toString().padStart(2, '0')}`;
            const end = formattedEndDate+' 19:59:59';

            params.whereField.push('created_at', 'created_at');
            params.whereValue.push(start, end);
            params.whereOperator.push('>=', '<=');
        }
        const result = await getPaginatedData(params);
        return resp.json({
            status     : 1,
            code       : 200,
            message    : ["Fuel History List fetch successfully!"],
            data       : result.data,
            total_page : result.totalPage,
            total      : result.total,
            image_url: `https://plusx.s3.ap-south-1.amazonaws.com/uploads/truck-images/`
        });
    } catch (error) {
        console.error('Error fetching device list:', error);
        resp.status(500).json({ message: 'Error fetching device lists' });
    }
};