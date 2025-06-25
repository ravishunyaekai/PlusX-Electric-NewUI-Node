import generateUniqueId from 'generate-unique-id';
import moment from 'moment';
import db from '../../config/db.js';
import { getPaginatedData, insertRecord, queryDB, updateRecord } from '../../dbUtils.js';
import validateFields from "../../validation.js";
import { deleteFile,asyncHandler, formatDateTimeInQuery } from '../../utils.js';

export const carsList = asyncHandler(async (req, resp) => {
    const { search_text, start_date, end_date, page_no } = req.body;
    const whereFields    = []
    const whereValues    = []
    const whereOperators = []

    if (start_date && end_date) {
        // const start = moment(start_date, "YYYY-MM-DD").startOf('day').format("YYYY-MM-DD HH:mm:ss");
        // const end = moment(end_date, "YYYY-MM-DD").endOf('day').format("YYYY-MM-DD HH:mm:ss");
        const startToday         = new Date(start_date);
        const startFormattedDate = `${startToday.getFullYear()}-${(startToday.getMonth() + 1).toString()
            .padStart(2, '0')}-${startToday.getDate().toString().padStart(2, '0')}`;
                    
        const givenStartDateTime    = startFormattedDate+' 00:00:01'; // Replace with your datetime string
        const modifiedStartDateTime = moment(givenStartDateTime).subtract(4, 'hours'); // Subtract 4 hours
        const start                 = modifiedStartDateTime.format('YYYY-MM-DD HH:mm:ss')
        
        const endToday         = new Date(end_date);
        const formattedEndDate = `${endToday.getFullYear()}-${(endToday.getMonth() + 1).toString()
            .padStart(2, '0')}-${endToday.getDate().toString().padStart(2, '0')}`;
        const end = formattedEndDate+' 19:59:59';

        whereFields.push('created_at', 'created_at');
        whereValues.push(start, end);
        whereOperators.push('>=', '<=');
    }
    const result = await getPaginatedData({
        tableName: 'electric_car_rental',
        columns: `rental_id, car_name, available_on, car_type, price, contract`,
        sortColumn: 'id',
        sortOrder: 'DESC',
        page_no,
        limit: 10,
        liveSearchFields: ['rental_id', 'car_name', 'available_on', 'car_type'],
        liveSearchTexts: [search_text, search_text, search_text, search_text],
        whereField: whereFields,
        whereValue: whereValues,
        whereOperator: whereOperators
    });

    return resp.json({
        status: 1,
        code: 200,
        message: ["Car List fetch successfully!"],
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
    });    
});

export const carDetail = asyncHandler(async (req, resp) => {
    const { rental_id } = req.body;
    if(!rental_id) return resp.json({status: 0, message: "Rental Id is required"});

    const car = await queryDB(`SELECT *, ${formatDateTimeInQuery(['created_at', 'updated_at'])} FROM electric_car_rental WHERE rental_id = ?`, [rental_id]);
    const [gallery] = await db.execute(`SELECT id, image_name FROM electric_car_rental_gallery WHERE rental_id = ? ORDER BY id DESC`, [rental_id]);
    const imgName = gallery.map(image => image.image_name);
    const imgId= gallery.map(image => image.id);

    return resp.status(200).json({
         status: 1, 
         code: 200,
         message: "Car Detail fetch successfully",
         car, 
         galleryData : imgName,
         galleryId   : imgId,
         base_url    : `https://plusx.s3.ap-south-1.amazonaws.com/uploads/car-rental-images/`
        });
});

export const carData = asyncHandler(async (req, resp) => {
    const {rental_id} = req.body;
    const contract = [ '1 Month', '6 Months', '1 Year'];
    const bikeType = [ 'Lease', 'Rent'];
    const feature = [ '5 Seater', 'Electric', 'Fully Automatic' ];

    const result = {
        status: 1, message: "Bike data fetch",
        contract: contract, car_type: bikeType, feature: feature,
    };

    if(rental_id){
        const rentalData = await queryDB('SELECT * FROM electric_bike_rental WHERE rental_id = ?', [rental_id]);
        result.rental_data = rentalData; 
    }

    return resp.json(result);
});

export const carAdd = asyncHandler(async (req, resp) => {
    try {
        const { car_name, available_on, description, car_type, price, contract, feature, lease_url } = req.body;
    const { isValid, errors } = validateFields(req.body, { 
        car_name: ["required"], 
        available_on: ["required"], 
        description: ["required"], 
        car_type: ["required"], 
        price: ["required"], 
        contract: ["required"], 
        feature: ["required"], 
        lease_url: ["required"], 
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
    const coverImg = req.files?.['cover_image']?.[0]?.filename || '';
    const rentalGallery = req.files?.['rental_gallery']?.map(file => file.filename) || [];

    const rentalId = `TRQ${generateUniqueId({ length:6 })}`;
    const insert = await insertRecord('electric_car_rental', [
        'rental_id', 'car_name', 'available_on', 'description', 'price', 'car_type', 'contract', 'feature', 'image', 'status', 'lease_url', 
    ], [
        rentalId, car_name, available_on, description, price, car_type, contract, feature, coverImg, 1, lease_url
    ]);

    if(rentalGallery.length > 0){
        const values = rentalGallery.map(filename => [rentalId, filename]);
        const placeholders = values.map(() => '(?, ?)').join(', ');
        await db.execute(`INSERT INTO electric_car_rental_gallery (rental_id, image_name) VALUES ${placeholders}`, values.flat());
    }

    return resp.json({
        status: insert.affectedRows > 0 ? 1 : 0,
        message: insert.affectedRows > 0 ? "Car rental added successfully" : "Failed to insert, Please try again.",
    });
    } catch (error) {
        console.log(error);
        
    }
    
});

export const carEdit = asyncHandler(async (req, resp) => {
    const { rental_id, car_name, available_on, description, car_type, price, contract, feature, lease_url, status } = req.body;
    const { isValid, errors } = validateFields(req.body, { 
        rental_id: ["required"], 
        car_name: ["required"], 
        available_on: ["required"], 
        description: ["required"], 
        car_type: ["required"], 
        price: ["required"], 
        contract: ["required"], 
        feature: ["required"], 
        lease_url: ["required"], 
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const car = await queryDB(`SELECT image FROM electric_car_rental WHERE rental_id = ?`, [rental_id]);
    if(!car) return resp.json({status:0, message: "Car Leasing Data can not edit, or invalid rental Id"});
    
    const [gallery] = await db.execute(`SELECT image_name FROM electric_car_rental_gallery WHERE rental_id = ?`, [rental_id]);
    const galleryData = gallery.map(img => img.image_name);

    const updates = {car_name, available_on, description, car_type, price, contract, feature, lease_url, status};

    let coverImg = req.files?.['cover_image']?.[0]?.filename || '';
    let rentalGallery = req.files?.['rental_gallery']?.map(file => file.filename) || [];
    
    if (coverImg) updates.image = coverImg;

    if (car.image) deleteFile('car-rental-images', car.image);
    if (req.files['rental_gallery'] && galleryData.length > 0) {
        galleryData.forEach(img => img && deleteFile('car-rental-images', img));
    }
    
    const update = await updateRecord('electric_car_rental', updates, ['rental_id'], [rental_id]);

    if(rentalGallery.length > 0){
        const values = rentalGallery.map(filename => [rental_id, filename]);
        const placeholders = values.map(() => '(?, ?)').join(', ');
        await db.execute(`INSERT INTO electric_car_rental_gallery (rental_id, image_name) VALUES ${placeholders}`, values.flat());
    }

    return resp.json({
        status: update.affectedRows > 0 ? 1 : 0,
        message: update.affectedRows > 0 ? "Car rental updated successfully" : "Failed to update, Please try again.",
    });
});

export const carDelete = asyncHandler(async (req, resp) => {
    const { rental_id } = req.body;
    if (!rental_id) return resp.json({ status: 0, code: 422, message: "Rental Id is required" });
    
    const car = await queryDB(`SELECT image FROM electric_car_rental WHERE rental_id = ?`, [rental_id]);
    if(!car) return resp.json({status:0, message: "Bike Leasing Data can not be deleted, or invalid rental Id"});
    
    const [gallery] = await db.execute(`SELECT image_name FROM electric_car_rental_gallery WHERE rental_id = ?`, [rental_id]);
    const galleryData = gallery.map(img => img.image_name);

    if (car.image) deleteFile('car-rental-images', car.image);
    if (galleryData.length > 0) {
        galleryData.forEach(img => img && deleteFile('car-rental-images', img));
    }

    await db.execute(`DELETE FROM electric_car_rental WHERE rental_id = ?`, [rental_id]);
    await db.execute(`DELETE FROM electric_car_rental_gallery WHERE rental_id = ?`, [rental_id]);

    return resp.json({ status: 1, code: 200, message: "Car deleted successfully!" });
});

export const carGalleryDelete = asyncHandler(async (req, resp) => {
    const { gallery_id } = req.body;
    if(!gallery_id) return resp.json({status:0, message: "Gallery Id is required"});

    const galleryData = await queryDB(`SELECT image_name FROM electric_car_rental_gallery WHERE id = ? LIMIT 1`, [gallery_id]);
    
    if(galleryData){
        deleteFile('car-rental-images', galleryData.image_name);
        await db.execute('DELETE FROM electric_car_rental_gallery WHERE id = ?', [gallery_id]);
    }

    return resp.json({status: 1, code: 200, message: "Gallery image deleted successfully"});
});


