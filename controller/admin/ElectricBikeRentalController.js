import generateUniqueId from 'generate-unique-id';
import db from '../../config/db.js';
import { getPaginatedData, insertRecord, queryDB, updateRecord } from '../../dbUtils.js';
import validateFields from "../../validation.js";
import { deleteFile, asyncHandler, formatDateTimeInQuery } from '../../utils.js';

export const bikesList = asyncHandler(async (req, resp) => {
    const { search_text, page_no } = req.body;
    const result = await getPaginatedData({
        tableName: 'electric_bike_rental',
        columns: `rental_id, bike_name, available_on, bike_type, price, contract`,
        liveSearchFields : ['bike_name', 'rental_id'],
        liveSearchTexts  : [search_text, search_text],
        sortColumn: 'id',
        sortOrder: 'DESC',
        page_no,
        limit: 10,
    });

    return resp.json({
        status: 1,
        code: 200,
        message: ["Bike List fetch successfully!"],
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
    });    
});

export const bikeDetail = asyncHandler(async (req, resp) => {
    const { rental_id } = req.body;
    if(!rental_id) return resp.json({status: 0, message: "Rental Id is required"});

    const bike = await queryDB(`SELECT *, ${formatDateTimeInQuery(['created_at', 'updated_at'])} FROM electric_bike_rental WHERE rental_id = ?`, [rental_id]);
    const [gallery] = await db.execute(`SELECT id, image_name FROM electric_bike_rental_gallery WHERE rental_id = ? ORDER BY id DESC`, [rental_id]);
    const imgName = gallery.map(image => image.image_name);
    const imgId= gallery.map(image => image.id);
   console.log(gallery);
   
    return resp.status(200).json({
        status: 1,
        code: 200, 
        message: "Bike Detail fetch successfully", 
        bike, 
        galleryData : imgName,
        galleryId : imgId,
        base_url: `${req.protocol}://${req.get('host')}/uploads/bike-rental-images/`
    });
});

export const bikeData = asyncHandler(async (req, resp) => {
    const {rental_id} = req.body;
    const contract = [ '1 Month', '6 Months', '1 Year'];
    const bikeType = [ 'Lease', 'Rent'];
    const feature = [ '5 Seater', 'Electric', 'Fully Automatic' ];

    const result = {
        status: 1, message: "Bike data fetch",
        contract: contract, bike_type: bikeType, feature: feature,
    };

    if(rental_id){
        const rentalData = await queryDB('SELECT * FROM electric_bike_rental WHERE rental_id = ?', [rental_id]);
        result.rental_data = rentalData; 
    }

    return resp.json(result);
});

export const bikeAdd = asyncHandler(async (req, resp) => {
    const { bike_name, available_on, description, bike_type, price, contract, feature, lease_url } = req.body;
    const { isValid, errors } = validateFields(req.body, { 
        bike_name: ["required"], 
        available_on: ["required"], 
        description: ["required"], 
        bike_type: ["required"], 
        price: ["required"], 
        contract: ["required"], 
        feature: ["required"], 
        lease_url: ["required"], 
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
    const coverImg = req.files?.['cover_image']?.[0]?.filename || '';
    const rentalGallery = req.files?.['rental_gallery']?.map(file => file.filename) || [];

    const rentalId = `TRQ${generateUniqueId({ length:6 })}`;
    const insert = await insertRecord('electric_bike_rental', [
        'rental_id', 'bike_name', 'available_on', 'description', 'price', 'bike_type', 'contract', 'feature', 'image', 'status', 'lease_url', 
    ], [
        rentalId, bike_name, available_on, description, price, bike_type, contract, feature, coverImg, 1, lease_url
    ]);

    if(rentalGallery.length > 0){
        const values = rentalGallery.map(filename => [rentalId, filename]);
        const placeholders = values.map(() => '(?, ?)').join(', ');
        await db.execute(`INSERT INTO electric_bike_rental_gallery (rental_id, image_name) VALUES ${placeholders}`, values.flat());
    }

    return resp.json({
        status: insert.affectedRows > 0 ? 1 : 0,
        message: insert.affectedRows > 0 ? "Bike rental added successfully" : "Failed to insert, Please try again.",
    });
});

export const bikeEdit = asyncHandler(async (req, resp) => {
    const { rental_id, bike_name, available_on, description, bike_type, price, contract, feature, lease_url } = req.body;
    const { isValid, errors } = validateFields(req.body, { 
        rental_id: ["required"], 
        bike_name: ["required"], 
        available_on: ["required"], 
        description: ["required"], 
        bike_type: ["required"], 
        price: ["required"], 
        contract: ["required"], 
        feature: ["required"], 
        lease_url: ["required"], 
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const bike = await queryDB(`SELECT image FROM electric_bike_rental WHERE rental_id = ?`, [rental_id]);
    if(!bike) return resp.json({status:0, message: "Bike Leasing Data can not edit, or invalid rental Id"});
    
    const [gallery] = await db.execute(`SELECT image_name FROM electric_bike_rental_gallery WHERE rental_id = ?`, [rental_id]);
    const galleryData = gallery.map(img => img.image_name);

    const updates = {bike_name, available_on, description, bike_type, price, contract, feature, lease_url,};

    let coverImg = req.files?.['cover_image']?.[0]?.filename || '';
    let rentalGallery = req.files?.['rental_gallery']?.map(file => file.filename) || [];
    
    if (coverImg) updates.image = coverImg;

    if (bike.image) deleteFile('bike-rental-images', bike.image);
    if (req.files['rental_gallery'] && galleryData.length > 0) {
        galleryData.forEach(img => img && deleteFile('bike-rental-images', img));
    }
    
    const update = await updateRecord('electric_bike_rental', updates, ['rental_id'], [rental_id]);

    if(rentalGallery.length > 0){
        const values = rentalGallery.map(filename => [rental_id, filename]);
        const placeholders = values.map(() => '(?, ?)').join(', ');
        await db.execute(`INSERT INTO electric_bike_rental_gallery (rental_id, image_name) VALUES ${placeholders}`, values.flat());
    }

    return resp.json({
        status: update.affectedRows > 0 ? 1 : 0,
        message: update.affectedRows > 0 ? "Bike rental updated successfully" : "Failed to update, Please try again.",
    });
});

export const bikeDelete = async (req, resp) => {
    const { rental_id } = req.body;
    if (!rental_id) return resp.json({ status: 0, code: 422, message: "Rental Id is required" });
    
    const bike = await queryDB(`SELECT image FROM electric_bike_rental WHERE rental_id = ?`, [rental_id]);
    if(!bike) return resp.json({status:0, message: "Bike Leasing Data can not be deleted, or invalid rental Id"});
    
    const [gallery] = await db.execute(`SELECT image_name FROM electric_bike_rental_gallery WHERE rental_id = ?`, [rental_id]);
    const galleryData = gallery.map(img => img.image_name);

    if (bike.image) deleteFile('bike-rental-images', bike.image);
    if (galleryData.length > 0) {
        galleryData.forEach(img => img && deleteFile('bike-rental-images', img));
    }

    await db.execute(`DELETE FROM electric_bike_rental WHERE rental_id = ?`, [rental_id]);
    await db.execute(`DELETE FROM electric_bike_rental_gallery WHERE rental_id = ?`, [rental_id]);

    return resp.json({ status: 1, code: 200, message: "Bike deleted successfully!" });
};

export const bikeGalleryDelete = asyncHandler(async (req, resp) => {
    const { gallery_id } = req.body;
    if(!gallery_id) return resp.json({status:0, message: "Gallery Id is required"});

    const galleryData = await queryDB(`SELECT image_name FROM electric_bike_rental_gallery WHERE id = ? LIMIT 1`, [gallery_id]);
    
    if(galleryData){
        deleteFile('bike-rental-images', galleryData.image_name);
        await db.execute('DELETE FROM electric_bike_rental_gallery WHERE id = ?', [gallery_id]);
    }

    return resp.json({status: 1, code: 200, message: "Gallery image deleted successfully"});
});


