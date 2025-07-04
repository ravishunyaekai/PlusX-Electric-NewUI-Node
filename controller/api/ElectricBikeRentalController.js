import db from "../../config/db.js";
import validateFields from "../../validation.js";
import { queryDB, getPaginatedData } from '../../dbUtils.js';
import { asyncHandler, formatDateTimeInQuery, mergeParam } from '../../utils.js';

export const bikeList = asyncHandler(async (req, resp) => {
    const {rider_id, page_no, search_text, sort_by } = mergeParam(req);
        
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], page_no: ["required"]});
    
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const sortOrder = sort_by === 'd' ? 'DESC' : 'ASC';

    const result = await getPaginatedData({
        tableName: 'electric_bike_rental',
        columns: `rental_id, bike_name, available_on, bike_type, image, price, contract, ${formatDateTimeInQuery(['created_at', 'updated_at'])}`,
        searchField: 'bike_name',
        searchText: search_text,
        sortColumn: 'id',
        sortOrder,
        page_no,
        limit: 10,
        whereField: 'status',
        whereValue: 1
    });

    return resp.json({
        status: 1,
        code: 200,
        message: ["Bike Rental List fetched successfully!"],
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
        base_url: `${req.protocol}://${req.get('host')}/uploads/bike-rental-images/`,
    });
});

export const bikeDetail = asyncHandler(async (req, resp) => {
    const {rider_id, rental_id } = mergeParam(req);
    const { isValid, errors } = validateFields(mergeParam(req), {rider_id: ["required"], rental_id: ["required"]});
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    let gallery = [];

    const rentalData = await queryDB(`SELECT *, ${formatDateTimeInQuery(['created_at', 'updated_at'])} FROM electric_bike_rental WHERE status = ? AND rental_id= ? LIMIT 1`, [1, rental_id]);
    [gallery] = await db.execute(`SELECT * FROM electric_bike_rental_gallery WHERE rental_id = ? ORDER BY id DESC LIMIT 5`, [rental_id]);
    const imgName = gallery.map(row => row.image_name);
    
    return resp.json({
        status: 1,
        code: 200,
        message: ["Bike Rental Details fetched successfully!"],
        data: rentalData,
        gallery_data: imgName,
        base_url: `${req.protocol}://${req.get('host')}/uploads/bike-rental-images/`,
    });
});