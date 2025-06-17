import moment from "moment";
import db from "../../config/db.js";
import emailQueue from "../../emailQueue.js";
import validateFields from "../../validation.js";
import generateUniqueId from 'generate-unique-id';
import { asyncHandler, deleteFile, mergeParam } from '../../utils.js';
import { queryDB, getPaginatedData, insertRecord, updateRecord } from '../../dbUtils.js';

import { tryCatchErrorHandler } from "../../middleware/errorHandler.js";

export const vehicleList = asyncHandler(async (req, resp) => {
    const {vehicle_type, page_no, vehicle_name, vehicle_model } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {vehicle_type: ["required"], page_no: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const result = await getPaginatedData({
        tableName: 'vehicle',
        columns: 'vehicle_id, vehicle_name, vehicle_model, horse_power, price, image',
        searchFields: ['vehicle_name', 'vehicle_model'],
        searchTexts: [vehicle_name, vehicle_model],
        sortColumn: 'id',
        sortOrder: 'DESC',
        page_no,
        limit: 10,
        whereField: ['vehicle_type'],
        whereValue: [vehicle_type]
    });

    return resp.json({
        status: 1,
        code: 200,
        message: ["Vehicle List fetched successfully!"],
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
        base_url: `${req.protocol}://${req.get('host')}/uploads/vehicle-image/`
    });
});

export const vehicleDetail = asyncHandler(async (req, resp) => {
    const { vehicle_id } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {vehicle_id: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    let gallery = [];

    const vehicleData = await queryDB(`SELECT * FROM vehicle WHERE vehicle_id= ? LIMIT 1`, [vehicle_id]);
    [gallery] = await db.execute(`SELECT image_name FROM vehicle_gallery WHERE vehicle_id = ? ORDER BY id DESC LIMIT 5`, [vehicle_id]);
    const imgName = gallery.map(row => row.image_name);
    
    return resp.json({
        status: 1,
        code: 200,
        message: ["Charging Station Details fetched successfully!"],
        data: vehicleData,
        gallery_data: imgName,
        base_url: `${req.protocol}://${req.get('host')}/uploads/vehicle-image/`,
    });

});

export const interestedPeople = asyncHandler(async (req, resp) => {
    const {rider_id, name, country_code, mobile, address, vehicle, region_specification } = req.body;
        
    const { isValid, errors } = validateFields(req.body, {
        rider_id: ["required"],
        name: ["required"],
        country_code: ["required"],
        mobile: ["required"],
        address: ["required"],
        vehicle: ["required"],
        region_specification: ["required"],
    });
    
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const userId = 'PI-' + generateUniqueId({length:13});

    const insert = await insertRecord('interested_people', [
        'user_id', 'rider_id', 'name', 'country_code', 'mobile', 'address', 'vehicle', 'status', 'region_specification'
    ],[
        userId, rider_id, name, country_code, mobile, address, vehicle, 1, region_specification 
    ]);
    
    return resp.json({
        status: insert.affectedRows > 0 ? 1 : 0,
        code: 200,
        message: insert.affectedRows > 0 ? ["Charging Station Details fetched successfully!"] : ["Oops! Something went wrong. Please try again."]
    });
});

export const sellVehicle = asyncHandler(async (req, resp) => {
    try{
        const { rider_id, vehicle_id, region, milage, price, interior_color, exterior_color, doors, body_type, owner_type='', seat_capacity, engine_capacity, 
            warrenty, description, horse_power
        } = req.body;
            
        const { isValid, errors } = validateFields(req.body, {
            rider_id: ["required"],
            vehicle_id: ["required"],
            region: ["required"],
            milage: ["required"],
            price: ["required"],
            interior_color: ["required"],
            doors: ["required"],
            body_type: ["required"],
            seat_capacity: ["required"],
            engine_capacity: ["required"],
            warrenty: ["required"],
            description: ["required"],
            horse_power: ["required"],
        });
        
        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });    
        if (!req.files || !req.files['car_images']) return resp.json({ status: 0, code: 422, message: ["car_images is required."] });
        if (!req.files || !req.files['car_tyre_image']) return resp.json({ status: 0, code: 422, message: ["car_tyre_image is required."] });

        const car_images = req.files['car_images'] ? req.files['car_images'].map(file => file.filename).join('*') : '';
        const car_tyre_image = req.files['car_tyre_image'] ? req.files['car_tyre_image'].map(file => file.filename).join('*') : '';
        const other_images = req.files['other_images'] ? req.files['other_images'].map(file => file.filename).join('*') : '';
        
        const sellId = 'SL-' + generateUniqueId({length:13});
    
        const insert = await insertRecord('vehicle_sell', [
            'sell_id', 'rider_id', 'vehicle_id', 'region', 'milage', 'price', 'interior_color', 'exterior_color', 'doors', 'body_type', 'owner_type', 'seat_capacity', 
            'engine_capacity', 'warrenty', 'horse_power', 'description', 'car_images', 'car_tyre_image', 'other_images', 'status'
        ], [
            sellId, rider_id, vehicle_id, region, milage, price, interior_color, exterior_color, doors, body_type, owner_type, seat_capacity, engine_capacity,
            warrenty, horse_power, description, car_images, car_tyre_image, other_images, 0
        ]);
    
        if(insert.affectedRows == 0) return resp.json({status: 0, code: 200, error: true, message: ['Failed to Add car. Please Try Again']});
    
        const rider = await queryDB(`SELECT rider_name, rider_email FROM riders WHERE rider_id = ?`, [rider_id]);
    
        const html = `<html>
            <body>
                <h4>Dear ${rider.rider_name},</h4>
                <p>Greetings from the PlusX Electric App.</p><br />
                <p>We are pleased to inform you that your listing for the sale of your EV car on the PlusX Electric App is now live and available for potential buyers to view. </p>
                <p>Thank you for choosing the PlusX Electric App to list your EV for sale. We wish you the best of luck in finding the perfect buyer for your car!</p> <br /> <br /> 
                <p> Best regards,<br/> PlusX Electric App </p>
            </body>
        </html>`;

        emailQueue.addEmail(rider.rider_email, `Your EV Car Sale Listing Is Now Live on PlusX Electric App!`, html);
    
        return resp.json({
            status: 1, 
            code: 200, 
            error: false,
            message: ["Thank you! Your request for Sell Car has been submitted. Our team will get back to you."],
        });    
    }catch(err){
        console.log(err);
        tryCatchErrorHandler(req.originalUrl, err, resp );
    }
});

export const allSellVehicleList = asyncHandler(async (req, resp) => {
    const { rider_id, page_no, search_text, sort_col, sort_by } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], page_no: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const result = await getPaginatedData({
        tableName: 'vehicle_sell AS vs LEFT JOIN riders_vehicles AS rv ON rv.vehicle_id = vs.vehicle_id',
        columns: 'sell_id, region, milage, price, interior_color, doors, body_type, seat_capacity, engine_capacity, car_images, rv.vehicle_model, rv.vehicle_make',
        searchFields: ['rv.vehicle_model', 'rv.vehicle_make'],
        searchTexts: [search_text, search_text],
        sortColumn: sort_col === 'p' ? 'vs.price' : 'vs.id',
        sortOrder: sort_by === 'd' ? 'DESC' : 'ASC',
        page_no,
        limit: 10,
        whereField: ['vs.status', 'rv.vehicle_id'],
        whereValue: [1, 'NULL'],
        whereOperator: ['!=', '!=']
    });

    return resp.json({
        message: ["Car Sell list fetched successfully!"],
        data: result.data,
        total: result.total,
        total_page: result.totalPage,
        status: 1,
        code: 200,
        image_path: `${req.protocol}://${req.get('host')}/uploads/vehicle-image/`
    });

});

export const sellVehicleList = asyncHandler(async (req, resp) => {
    const {rider_id, page_no, search_text, sort_col, sort_by } = mergeParam(req);  
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], page_no: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const result = await getPaginatedData({
        tableName: 'vehicle_sell AS vs LEFT JOIN riders_vehicles AS rv ON rv.vehicle_id = vs.vehicle_id',
        columns: 'sell_id, region, milage, price, interior_color, doors, body_type, seat_capacity, engine_capacity, car_images, rv.vehicle_model, rv.vehicle_make',
        searchFields: ['rv.vehicle_model', 'rv.vehicle_make'],
        searchTexts: [search_text, search_text],
        sortColumn: sort_col === 'p' ? 'vs.price' : 'vs.id',
        sortOrder: sort_by === 'd' ? 'DESC' : 'ASC',
        page_no,
        limit: 10,
        whereField: ['status', 'vs.rider_id', 'rv.vehicle_id'],
        whereValue: [1, rider_id, 'NULL'],
        whereOperator: ['!=', '=', '!='],
    });

    return resp.json({
        message: ["Car Sell list fetched successfully!"],
        data: result.data,
        total: result.total,
        total_page: result.totalPage,
        status: 1,
        code: 200,
        image_path: `${req.protocol}://${req.get('host')}/uploads/vehicle-image/`
    });

});

export const sellVehicleDetail = asyncHandler(async (req, resp) => {
    const { rider_id, sell_id } = mergeParam(req);    
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], sell_id: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const data = await queryDB(`
        SELECT 
            vehicle_sell.*, 
            (SELECT CONCAT(vehicle_make, "-", vehicle_model, ",", year_manufacture) FROM riders_vehicles AS rv WHERE rv.vehicle_id = vehicle_sell.vehicle_id) AS vehicle_data,
            r.profile_img, 
            r.rider_name, 
            CONCAT(r.country_code, "-", r.rider_mobile) AS rider_mobile, 
            r.fcm_token 
        FROM 
            vehicle_sell 
        LEFT JOIN 
            riders AS r 
        ON 
            r.rider_id = vehicle_sell.rider_id 
        WHERE 
            vehicle_sell.sell_id = ? 
        LIMIT 1
    `,[sell_id]);
    
    return resp.json({
        status: 1,
        code: 200,
        message: ["Charging Station Details fetched successfully!"],
        sale_data: data,
        image_path: `${req.protocol}://${req.get('host')}/uploads/vehicle-image/`,
    });

});

export const updateSellVehicle = asyncHandler(async (req, resp) => {
    try{   
        const { 
            sell_id, rider_id, vehicle_id, region, milage, price, interior_color, exterior_color, doors, body_type, owner_type='', seat_capacity, engine_capacity, warrenty, 
            description, horse_power, old_img
        } = req.body; 
        const { isValid, errors } = validateFields(req.body, {
            sell_id: ["required"],
            rider_id: ["required"],
            vehicle_id: ["required"],
            region: ["required"],
            milage: ["required"],
            price: ["required"],
            interior_color: ["required"],
            doors: ["required"],
            body_type: ["required"],
            seat_capacity: ["required"],
            engine_capacity: ["required"],
            warrenty: ["required"],
            description: ["required"],
            horse_power: ["required"],
        });
        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

        const vehicle = await queryDB(`SELECT car_images, car_tyre_image, other_images FROM vehicle_sell WHERE sell_id = ? AND rider_id = ?`, [sell_id, rider_id]);
        if(!vehicle) return resp.json({status: 0, code:422, message: "Invalid sell id"});
        
        const newCarImg     = req.files['car_images']?.map(file => file.filename).join('*') || vehicle.car_images;
        const newCarTyreImg = req.files['car_tyre_image']?.map(file => file.filename).join('*') || vehicle.car_tyre_image;
        const newOtherImg   = req.files['other_images']?.map(file => file.filename).join('*') || vehicle.other_images;

        const updates = { 
            vehicle_id, region, milage, price, interior_color, exterior_color, doors, body_type, owner_type, seat_capacity, engine_capacity, warrenty, description, horse_power, 
            car_images: newCarImg, car_tyre_image: newCarTyreImg, other_images: newOtherImg 
        };
        
        const update = await updateRecord('vehicle_sell', updates, ['sell_id', 'rider_id'], [sell_id, rider_id]);
    
        return resp.json({
            status: update.affectedRows > 0 ? 1 : 0,
            code: 200,
            error: update.affectedRows > 0 ? false : true,
            message: update.affectedRows > 0 ? ["Thank you! Your request for Edit Car has been submitted."] : ["Failed to update. Please try again."]
        });
    }catch(err){
        console.log(err);
        tryCatchErrorHandler(req.originalUrl, err, resp );
    }
});

export const updateSellVehicleImg = asyncHandler(async (req, resp) => {
    const { sell_id, rider_id, image_name, image_type, image } = req.body; 
    const { isValid, errors } = validateFields(req.body, {sell_id: ["required"], rider_id: ["required"], image_name: ["required"], image_type: ["required"] });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const vehicle = await queryDB(`SELECT car_images, car_tyre_image, other_images FROM vehicle_sell WHERE sell_id = ? AND rider_id = ?`, [sell_id, rider_id]);
    if(!vehicle) return resp.json({status: 0, code:422, message: "Invalid sell id"});
    let imgArr = vehicle.car_images ? vehicle.car_images.split('*').filter(Boolean) : [];
    
    const imgIndex = imgArr.indexOf(image_name);
    const newImg = req.files['image'][0].filename;
    imgArr[imgIndex] = newImg;
    deleteFile('vehicle-image', image_name);
    
    const updates = {};
    if(image_type === 'car_images') updates.car_images = imgArr.filter(Boolean).join('*');
    
    const update = await updateRecord('vehicle_sell', updates, ['sell_id', 'rider_id'], [sell_id, rider_id]);

    return resp.json({
        status: update.affectedRows > 0 ? 1 : 0,
        code: 200,
        error: update.affectedRows > 0 ? false : true,
        message: update.affectedRows > 0 ? ["Image updated successfully"] : ["Failed to update. Please try again."]
    });

});

export const deleteSellVehicle = asyncHandler(async (req, resp) => {
    const {rider_id, sell_id} = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], sell_id: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors }); 

    try{
        const vehicle = await queryDB(`SELECT car_images, car_tyre_image, other_images FROM vehicle_sell WHERE rider_id=? AND sell_id=?`,[rider_id, sell_id]);
        let del;

        if(vehicle){
            const carImgArr = vehicle.car_images ? vehicle.car_images.split('*') : [];
            const carTyreImgArr = vehicle.car_tyre_image ? vehicle.car_tyre_image.split('*') : [];
            const otherImgArr = vehicle.other_images ? vehicle.other_images.split('*') : [];
            const allOldImages = [...carImgArr, ...carTyreImgArr, ...otherImgArr].filter(Boolean);
            allOldImages.forEach(img => {
                deleteFile('vehicle-image', img);
            });
        }

        [del] = await db.execute(`DELETE FROM vehicle_sell WHERE rider_id=? AND sell_id=?`,[rider_id, sell_id]);
        
        return resp.json({
            message: del.affectedRows > 0 ? ['Your Car for Sale deleted successfully!'] : ['Failed to delete. Please try again.'],
            status: del.affectedRows > 0 ? 1 : 0,
            code:200
        });

    }catch(err){
        console.error('Error deleting sell vehicle account:', err);
        tryCatchErrorHandler(req.originalUrl, err, resp);
    }

});

export const soldSellVehicle = asyncHandler(async (req, resp) => {
    const {rider_id, sell_id} = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], sell_id: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors }); 

    const sellData = await queryDB('SELECT COUNT(*) as count FROM vehicle_sell WHERE sell_id = ? AND rider_id = ?', [sell_id, rider_id]); 

    if (sellData.count === 0) {
        return resp.json({status: 0, code: 422, error: true, message: ['Car for sale data invalid']});
    }

    const update = await updateRecord('vehicle_sell', {status: 1}, ['sell_id', 'rider_id'], [sell_id, rider_id]);
    
    return resp.json({
        status: update.affectedRows > 0 ? 1 : 0,
        code: 200,
        error: update.affectedRows > 0 ? false : true,
        message: update.affectedRows > 0 ? ['Your Car for Sale Sold Successful!'] : ['Something went wrong, please try again!'],
    });
});

/* Dynamic Data */
export const areaList = asyncHandler(async (req, resp) => {
    const { location_id, area_name } = mergeParam(req);

    let query = `SELECT id AS loc_id, location_id, area_name FROM locations_area_list WHERE location_id = ? AND status = ?`;
    const queryParams = [location_id, 1];

    if(area_name){
        query += ` AND area_name LIKE ?`;
        queryParams.push(`%${area_name}%`);
    }

    query += ` ORDER BY area_name ASC`;

    const [result] = await db.execute(query, queryParams);

    return resp.json({
        status: 1, 
        code: 200,
        message: ["Area List fetch successfully!"],
        area_data: result
    });
});

export const reminder_sell_vehicle_list = asyncHandler(async (req, resp) => {
    const date = moment().subtract(15, 'days').format('YYYY-MM-DD');

    const [sellData] = await db.execute(`
        SELECT 
            sell_id, 
            (SELECT fcm_token FROM riders AS r WHERE r.rider_id = vehicle_sell.rider_id) AS fcm_token, 
            (SELECT CONCAT(vehicle_make, '-', vehicle_model) FROM riders_vehicles AS rv WHERE rv.vehicle_id = vehicle_sell.vehicle_id) AS vehicle_data
        FROM 
            vehicle_sell 
        WHERE 
            status != 1 AND DATE(created_at) = ?
    
    `, [date]);

    for (const val of sellData) {
        const title = `PlusX Electric App : ${val.vehicle_data}`;
        const msg = 'Has your car been sold?';
        const href = `sell_vehicle/${val.sell_id}`;
        
        await pushNotification([val.fcm_token], title, msg, 'RDRFCM', href);
    }

    return resp.json({ status: 1, code: 200, message: "Notification Sent!" });
});

export const vehicleModelList = asyncHandler(async (req, resp) => {
    const {vehicle_type, make_name} = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {vehicle_type: ["required"], make_name: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
    let modelData = [];

    if(vehicle_type === 'Car'){
        const [rows] = await db.execute('SELECT model FROM vehicle_brand_list WHERE status = ? AND make = ?', [1, make_name]);
        modelData = rows.map(row => row.model);
    } else {
        const [rows] = await db.execute('SELECT model FROM vehicle_bike_brand_list WHERE status = ? AND make = ?', [1, make_name]);
        modelData = rows.map(row => row.model);
    }
    if (make_name !== 'Other') modelData.push('Other');

    return resp.json({
        message   : ["Model List fetch successfully!"],
        area_data : modelData,
        status    : 1,
        code      : 200,
    });
});

export const vehicleBrandList = asyncHandler(async (req, resp) => {
    const {vehicle_type} = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {vehicle_type: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
    let modelData = [];

    if(vehicle_type === 'Car'){
        const [rows] = await db.execute('SELECT make FROM vehicle_brand_list WHERE status = ? GROUP BY make',[1]);
        modelData = rows.map(row => row.make);
    } else {
        const [rows] = await db.execute('SELECT make FROM vehicle_bike_brand_list WHERE status = ? GROUP BY make',[1]);
        modelData = rows.map(row => row.make);
    }
    return resp.json({
        message: ["Make List fetch successfully!"],
        area_data: modelData,
        status: 1,
        code: 200,
    });
});


export const dubaiAreaList = asyncHandler(async (req, resp) => {
    const { area_name = "", page=1,} = mergeParam(req);
    const pageSize = 20;

    const [countRows] = await db.execute(`
        SELECT 
            COUNT(id) AS total_count
        FROM 
            dubai_area
        WHERE 
            status = '1'
    `);
    const totalCount  = countRows[0].total_count;
    const total_pages = Math.ceil(totalCount / pageSize);

    let query       = "SELECT area_name as area, id from dubai_area where status='1'";
    let queryParams = [];
    
    if(area_name) {
        query +=' AND area_name like ?'
        queryParams.push(`%${area_name}%`);
    }
    query +=' ORDER BY area_name ASC';

    if(area_name == '' && page != '') {  
        const offset = (page - 1) * pageSize;
        query += ` LIMIT ${offset}, ${pageSize}`;
    }
    const [dataResult] = await db.execute(query, queryParams);

    return resp.json({
        status: 1,
        code: 200,
        message: ["Dubai Area List fetched successfully!"],
        total_pages:total_pages,
        current_page:page,
        data: dataResult
    
    });
});