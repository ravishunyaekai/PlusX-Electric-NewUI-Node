import moment from 'moment';
import db from '../../config/db.js';
import validateFields from "../../validation.js";
import generateUniqueId from 'generate-unique-id';
import { asyncHandler, deleteFile, formatDateTimeInQuery} from '../../utils.js';
import { getPaginatedData, insertRecord, queryDB, updateRecord } from '../../dbUtils.js';

export const guideList = asyncHandler(async (req, resp) => {
    try {
        const { page_no, search_text, start_date, end_date, sort_by = 'd' } = req.body; 

        const whereFields = []
        const whereValues = []
        const whereOperators = []
        const { isValid, errors } = validateFields(req.body, { page_no: ["required"] });
        if (!isValid) {
            return resp.json({ status: 0, code: 422, message: errors });
        }

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
            tableName: 'vehicle',
            columns: `vehicle_id, vehicle_type, vehicle_name, vehicle_model, horse_power, price, image`,
            sortColumn: 'id',
            sortOrder: 'DESC',
            page_no,
            limit: 10,
            liveSearchFields: ['vehicle_id', 'vehicle_type', 'vehicle_name', 'vehicle_model'],
            liveSearchTexts: [search_text, search_text, search_text, search_text],
            whereField: whereFields,
            whereValue: whereValues,
            whereOperator: whereOperators
        });

        return resp.json({
            status: 1,
            code: 200,
            message: ["Ev Guide List fetched successfully!"],
            data: result.data,
            total_page: result.totalPage,
            total: result.total,
            base_url: `https://plusx.s3.ap-south-1.amazonaws.com/uploads/vehicle-image/`
        });

    } catch (error) {
        console.error('Error fetching vehicle list:', error);
        return resp.status(500).json({
            status: 0,
            code: 500,
            message: 'Error fetching vehicle list'
        });
    }
});

export const addGuide = asyncHandler(async (req, resp) => {
    try {
        const uploadedFiles = req.files;
        const{ vehicle_type, vehicle_name, vehicle_model, description, engine, horse_power, max_speed, price, best_feature } = req.body;
        const { isValid, errors } = validateFields(req.body, { 
            vehicle_type : ["required"],
            vehicle_name : ["required"],
            vehicle_model   : ["required"],
            description  : ["required"],
            engine       : ["required"],
            horse_power  : ["required"],
            max_speed   : ["required"],
            price        : ["required"],
            best_feature : ["required"],
        });
        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

        const cover_image = req.files['cover_image'] ? req.files['cover_image'][0].filename : '';
        const galleryImg = uploadedFiles['vehicle_gallery']?.map(file => file.filename) || [];
        const vehicleId = `VH-${generateUniqueId({length:6})}`;
        
        const insert = await insertRecord('vehicle', [
            'vehicle_id', 'vehicle_type', 'vehicle_name', 'vehicle_model', 'description', 'engine', 'horse_power', 'max_speed', 'price', 'best_feature', 'status', 'image'
        ], [
            vehicleId, vehicle_type, vehicle_name, vehicle_model, description, engine, horse_power, max_speed, price, best_feature, 1, cover_image
        ]);

        if(galleryImg.length > 0){
            const values = galleryImg.map(filename => [vehicleId, filename]);
            const placeholders = values.map(() => '(?, ?)').join(', ');
            await db.execute(`INSERT INTO vehicle_gallery (vehicle_id, image_name) VALUES ${placeholders}`, values.flat());
        }
        
        return resp.json({
            status  : insert.affectedRows > 0 ? 1 : 0, 
            code    : 200, 
            message : insert.affectedRows > 0 ? "Vehicle added successfully" : "Failed to create, Please Try Again!", 
        });
    } catch (error) {
        console.error('Something went wrong:', error);
        resp.status(500).json({ message: 'Something went wrong' });
    }
});

export const guideDetail = asyncHandler(async (req, resp) => {
    try {
        const { vehicle_id } = req.body;

        const { isValid, errors } = validateFields(req.body, { vehicle_id: ["required"] });
        if (!isValid) {
            return resp.json({ status: 0, code: 422, message: errors });
        }
        const [vehicleDetails] = await db.execute(` SELECT *, ${formatDateTimeInQuery(['created_at', 'updated_at'])} FROM vehicle WHERE vehicle_id = ?`, [vehicle_id] );

        if (!vehicleDetails.length) {
            return resp.status(404).json({
                status: 0,
                code: 404,
                message: 'Vehicle not found.',
            });
        }
        const [galleryImages] = await db.execute(`SELECT id, image_name FROM vehicle_gallery WHERE vehicle_id = ? ORDER BY id DESC`, [vehicle_id]);
        const imgName = galleryImages?.map(row => row.image_name);
        const imgId= galleryImages?.map(image => image.id);

        return resp.json({
            status       : 1,
            code         : 200,
            message      : ["Ev Guide Details fetched successfully!"],
            data         : vehicleDetails[0],
            gallery_data : imgName,
            gallery_id   : imgId,
            base_url     : `https://plusx.s3.ap-south-1.amazonaws.com/uploads/vehicle-image/`
        });

    } catch (error) {
        console.error('Error fetching station details:', error);
        return resp.status(500).json({
            status: 0,
            code: 500,
            message: 'Error fetching station details'
        });
    }
});

export const editGuide = asyncHandler(async (req, resp) => {
    const{ vehicle_id, vehicle_type, vehicle_name, vehicle_model, description, engine, horse_power, max_speed, price, best_feature, status } = req.body;
    const { isValid, errors } = validateFields(req.body, { 
        vehicle_id : ["required"],
        vehicle_type : ["required"],
        vehicle_name : ["required"],
        vehicle_model   : ["required"],
        description  : ["required"],
        engine       : ["required"],
        horse_power  : ["required"],
        max_speed   : ["required"],
        price        : ["required"],
        best_feature : ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const vehicle = await queryDB(`SELECT image FROM vehicle WHERE vehicle_id = ?`, [vehicle_id]);
    const cover_image = req.files['cover_image'] ? req.files['cover_image'][0].filename : vehicle.image;
    
    const updates = {vehicle_type, vehicle_name, vehicle_model, description, engine, horse_power, max_speed, price, status, best_feature, image : cover_image};
    const update = await updateRecord('vehicle', updates, ['vehicle_id'], [vehicle_id]);

    deleteFile('vehicle-image', vehicle.image);
    
    return resp.json({
        status  : update.affectedRows > 0 ? 1 : 0, 
        code    : 200, 
        message : update.affectedRows > 0 ? "Vehicle updated successfully!" : "Failed to create, Please Try Again!", 
    });
});

export const deleteGuide = asyncHandler(async (req, resp) => {
    const { vehicle_id } = req.body;
    if (!vehicle_id) return resp.json({ status: 0, code: 422, message: "Vehicle Id is required" });
    
    const vehicle = await queryDB(`SELECT image FROM vehicle WHERE vehicle_id = ?`, [vehicle_id]);
    if(!vehicle) return resp.json({ status: 0, code: 422, message: "Invalid Vehicle Id. Please Try Again." });
    
    const [gallery] = await db.execute(`SELECT image_name FROM vehicle_gallery WHERE vehicle_id = ?`, [vehicle_id]);
    const galleryData = gallery.map(img => img.image_name);

    if (vehicle.image) deleteFile('vehicle-image', vehicle.image);
    if (galleryData.length > 0) {
        galleryData.forEach(img => img && deleteFile('vehicle-image', img));
    }

    await db.execute(`DELETE FROM vehicle WHERE vehicle_id = ?`, [vehicle_id]);
    await db.execute(`DELETE FROM vehicle_gallery WHERE vehicle_id = ?`, [vehicle_id]);

    return resp.json({ status: 1, code: 200, message: "Vehicle deleted successfully!" });
});

export const deleteEvGuideGallery = asyncHandler(async (req, resp) => {  
    const { gallery_id } = req.body;
    if(!gallery_id) return resp.json({status:0, message: "Gallery Id is required"});

    const galleryData = await queryDB(`SELECT image_name FROM vehicle_gallery WHERE id = ? LIMIT 1`, [gallery_id]);
    
    if(galleryData){
        deleteFile('vehicle-image', galleryData.image_name);
        await db.execute('DELETE FROM vehicle_gallery WHERE id = ?', [gallery_id]);
    } 

    return resp.json({status: 1, code: 200, message: "Vehicle image deleted successfully"});
});
