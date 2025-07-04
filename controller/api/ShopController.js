import db from "../../config/db.js";
import { queryDB } from '../../dbUtils.js';
import validateFields from "../../validation.js";
import { mergeParam, getOpenAndCloseTimings, asyncHandler} from '../../utils.js';

export const shopList = asyncHandler(async (req, resp) => {
    const {rider_id, page_no, location, latitude, longitude, search_text, service, brand } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], page_no: ["required"], location: ["required"], latitude: ["required"], longitude: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const limit = 10;
    const start = parseInt((page_no * limit) - limit);

    let query = `
        SELECT s.shop_id, s.shop_name, s.contact_no, s.store_email, store_address.address, store_address.area_name, s.cover_image AS shop_image, s.store_website,
            store_address.location, store_address.latitude, store_address.longitude, s.always_open, s.description, brands, services,
            REPLACE(s.open_days, "_", ", ") AS open_days,
            REPLACE(s.open_timing, "_", ", ") AS open_timing, 
            (6367 * ACOS(COS(RADIANS(?)) * COS(RADIANS(store_address.latitude)) * COS(RADIANS(store_address.longitude) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(store_address.latitude)))) AS distance
        FROM store_address
        LEFT JOIN service_shops AS s ON s.shop_id = store_address.store_id
        WHERE s.status = 1 AND store_address.location = ?
    `;
    const queryParams = [latitude, longitude, latitude, location];
    
    if (search_text) {
        query += ' AND s.shop_name LIKE ?';
        queryParams.push(`%${search_text}%`);
    }
    if (service) {
        const serviceArr = service.split(',');
        query += ` AND (FIND_IN_SET(?, services)`;
        queryParams.push(serviceArr[0]);

        if (serviceArr.length > 1) {
            for (let i = 1; i < serviceArr.length; i++) {
                query += ` OR FIND_IN_SET(?, services)`;
                queryParams.push(serviceArr[i]);
            }
        }
        query += ')';
    }
    if (brand) {
        const brandArr = brand.split(',');
        query += ` AND (FIND_IN_SET(?, brands)`;
        queryParams.push(brandArr[0]);

        if (brandArr.length > 1) {
            for (let i = 1; i < brandArr.length; i++) {
                query += ` OR FIND_IN_SET(?, brands)`;
                queryParams.push(brandArr[i]);
            }
        }
        query += ')';
    }

    const totalCountQuery = `SELECT COUNT(*) AS total FROM (${query}) AS total_count`;
    const [totalRows] = await db.execute(totalCountQuery, queryParams);
    const total = totalRows[0].total;
    const totalPage = Math.ceil(total / limit);

    query += ` ORDER BY distance ASC LIMIT ${start}, ${parseInt(limit, 10)}`;

    const [shopsData] = await db.execute(query, queryParams);

    resp.json({
        message: ["Shop List fetched successfully!"],
        data: shopsData,
        total: total,
        total_page: totalPage,
        status: 1,
        code: 200,
        base_url: `${req.protocol}://${req.get('host')}/uploads/shop-images/`,
    });
});

export const shopDetail = asyncHandler(async (req, resp) => {
    const {rider_id, store_id, location, latitude, longitude } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], store_id: ["required"], location: ["required"], latitude: ["required"], longitude: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    let gallery = [];

    const shop = await queryDB(`
        SELECT 
            shop_id, shop_name, contact_no, store_website, store_email, address, cover_image as shop_image, location, latitude, longitude, always_open, description, 
            REPLACE(s.open_days, "_", ", ") AS open_days,
            REPLACE(s.open_timing, "_", ", ") AS open_timing, 
            REPLACE(brands, "_", ", ") as brands,
            REPLACE(services, "_", ", ") as services,
            (6367 * ACOS(COS(RADIANS(?)) * COS(RADIANS(latitude)) * COS(RADIANS(longitude) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(latitude)))) AS distance
        FROM 
            store_address
        WHERE 
            shop_id = ? AND status = ? 
        LIMIT 1
    `, [latitude, longitude, latitude, store_id, 1]);
    
    shop.schedule = getOpenAndCloseTimings(shop);

    const address = queryDB(`
        SELECT
            address, location, area_name, latitude, longitude, 
            (6367 * ACOS(COS(RADIANS(?)) * COS(RADIANS(latitude)) * COS(RADIANS(longitude) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(latitude)))) AS distance
        FROM 
            store_address 
        WHERE 
            store_id=?, location=?
        ORDER BY 
            location ASC
        LIMIT 1
    `, [latitude, longitude, latitude, store_id, location]);

    [gallery] = await queryDB(`SELECT image_name FROM store_gallery WHERE store_id = ? ORDER BY id DESC LIMIT 5`, [store_id]);
    const imgName = gallery.map(row => row.image_name);

    return resp.json({
        message: ["Shop Details fetch successfully!"],
        status: 1,
        code: 200,
        store_data: shop,
        gallery_data: imgName,
        address: address,
        base_url: `${req.protocol}://${req.get('host')}/uploads/shop-images/`,
    });
});