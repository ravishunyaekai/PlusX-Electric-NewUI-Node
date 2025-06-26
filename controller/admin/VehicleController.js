import { getPaginatedData, queryDB } from '../../dbUtils.js';
import { asyncHandler, formatDateTimeInQuery } from '../../utils.js';

import dotenv from 'dotenv';
dotenv.config();

export const sellVehicleList = asyncHandler(async (req, resp) => {
    const { search_text, page_no } = req.body;

    const result = await getPaginatedData({
        tableName : 'vehicle_sell',
        columns   : `sell_id, region, milage, price, body_type, engine_capacity, car_images, vehicle_id,
            (select concat(vehicle_model, "-", vehicle_make) from riders_vehicles as rv 
            where rv.vehicle_id = vehicle_sell.vehicle_id) as vehicle_data,
            (select concat(rider_name, ",", country_code, "-", rider_mobile) from riders as r 
            where r.rider_id = vehicle_sell.rider_id) as rider_data`,
        joinTable: 'riders',
        joinCondition: 'vehicle_sell.rider_id = riders.rider_id',
        liveSearchFields: ['riders.rider_name', 'vehicle_sell.body_type'],
        liveSearchTexts: [search_text, search_text],
        sortColumn: 'sell_id',
        sortOrder: 'DESC',
        page_no,
        limit: 10,
    });
    return resp.json({
        message: ["Car Sell list fetched successfully!"],
        data: result.data,
        total: result.total,
        total_page: result.totalPage,
        status: 1,
        code: 200,
        image_path: `${process.env.DIR_UPLOADS}/vehicle-image/`
    });
});

export const sellVehicleDetail = asyncHandler(async (req, resp) => {
    const { sell_id } = req.body;
    if (!sell_id) return resp.json({ status: 0, code: 422, message: "Sell Id is required." });

    const data = await queryDB(`
        SELECT 
            vehicle_sell.*,
            ${formatDateTimeInQuery(['vehicle_sell.created_at', 'vehicle_sell.updated_at'])},
            (SELECT CONCAT(vehicle_make, "-", vehicle_model, ",", year_manufacture) FROM riders_vehicles AS rv WHERE rv.vehicle_id = vehicle_sell.vehicle_id) AS vehicle_data,
            r.rider_name AS rider_name,
            r.country_code AS country_code,
            r.rider_mobile AS rider_mobile
        FROM 
            vehicle_sell
        JOIN 
            riders AS r ON r.rider_id = vehicle_sell.rider_id
        WHERE 
            vehicle_sell.sell_id = ?
        LIMIT 1
    `, [sell_id]);
    
    return resp.json({
        status: 1,
        code: 200,
        message: ["Car Sell detail fetched successfully!"],
        data: data,
        base_url: `${process.env.DIR_UPLOADS}/vehicle-images/`,
    });
});