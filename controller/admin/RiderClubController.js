import generateUniqueId from 'generate-unique-id';
import db from '../../config/db.js';
import { getPaginatedData, insertRecord, queryDB, updateRecord } from '../../dbUtils.js';
import validateFields from "../../validation.js";
import { asyncHandler, deleteFile, formatDateTimeInQuery } from '../../utils.js';

export const clubList = asyncHandler(async (req, resp) => {
    const { search_text, page_no } = req.body;
    const result = await getPaginatedData({
        tableName: 'clubs',
        columns: `club_id, club_name, location, no_of_members, cover_img`,
        liveSearchFields: ['club_name', 'club_id'],
        liveSearchTexts: [search_text, search_text],
        sortColumn: 'id',
        sortOrder: 'DESC',
        page_no,
        limit: 10,
    });

    return resp.json({
        status: 1,
        code: 200,
        message: ["Club List fetch successfully!"],
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
    });    
});

export const clubData = asyncHandler(async (req, resp) => {
    const { club_id } = req.body;
    const club = await queryDB(`SELECT *, ${formatDateTimeInQuery(['created_at', 'updated_at'])} FROM clubs WHERE club_id = ?`, [club_id]);
    const [gallery] = await db.execute(`SELECT id, image_name FROM club_gallery WHERE club_id = ? ORDER BY id DESC`, [club_id]);
    const imgName = gallery.map(image => image.image_name);
    const imgId= gallery.map(image => image.id);
    const location = await db.execute(`SELECT location_name FROM locations WHERE status = 1 ORDER BY location_name ASC`);
    const clubCategory = ['Women`s Cycling Club', 'Junior Cycling Club', 'Mountain Cycling Club', 'Road Cycling Club', 'Emirates Group Staff'];
    const ageGroup = ['17 & Younger', 'Above 18', 'All age group'];

    const result = {
        status: 1,
        code: 200,
        location,
        ageGroup,
        clubCategory,
        base_url: `${req.protocol}://${req.get('host')}/uploads/club-images/`
    }
    if(club_id){
        result.club = club;
        result.galleryData = imgName;
        result.galleryId = imgId;
    }

    return resp.status(200).json(result);
});

export const clubCreate = asyncHandler(async (req, resp) => {
    try{
        const uploadedFiles = req.files;
        const { club_name, location, description, club_url, category, age_group, no_of_members='', url_link='', preference='' } = req.body;
        const { isValid, errors } = validateFields(req.body, {
            club_name: ["required"],
            location: ["required"],
            description: ["required"],
            // club_url: ["required"],
            category: ["required"],
            age_group: ["required"],

        });
        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

        const clubId = `CLB${generateUniqueId({length:6})}`;

        const cover_img = req.files['cover_image'] ? req.files['cover_image'][0].filename : '' ;
        const clubGallery = uploadedFiles['club_gallery']?.map(file => file.filename) || [];

        const insert = await insertRecord('clubs', [
            'club_id', 'club_name', 'location', 'no_of_members', 'description', 'url_link', 'cover_img', 'category', 'age_group', 'preference', 'status'
        ], [
            clubId, club_name, location, no_of_members, description, url_link, cover_img, category, age_group, preference, 1
        ]);

        if(insert.affectedRows == 0) return resp.json({status:0, message: "Something went wrong! Please try again after some time."});

        if(clubGallery.length > 0){
            const values = clubGallery.map(filename => [clubId, filename]);
            const placeholders = values.map(() => '(?, ?)').join(', ');
            await db.execute(`INSERT INTO club_gallery (club_id, image_name) VALUES ${placeholders}`, values.flat());
        }

        return resp.json({status: 1, message: "Club added successfully."});

    }catch(err){
        console.log(err);
        
        return resp.status(500).json({status: 0, code: 500, message: "Oops! There is something went wrong! Please Try Again" });
    }
});

export const clubUpdate = asyncHandler(async (req, resp) => {      
    const uploadedFiles = req.files;  
    const { club_id, club_name, location, description, club_url, category, age_group, no_of_members='', url_link='', preference='', status=1 } = req.body;
    const { isValid, errors } = validateFields(req.body, {
        club_name: ["required"],
        location: ["required"],
        description: ["required"],
        // club_url: ["required"],
        category: ["required"],
        age_group: ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
    const club = await queryDB(`SELECT cover_img FROM clubs WHERE club_id = ?`, [club_id]);
    if(!club) return resp.json({status:0, message: "Club Data can not edit, or invalid club Id"});
    
    const cover_img = req.files['cover_image'] ? req.files['cover_image'][0].filename : club.cover_img ;
    const clubGallery = uploadedFiles['club_gallery']?.map(file => file.filename) || [];

    const updates = { club_name, location, no_of_members, description, url_link, category, age_group, preference, status, cover_img };
    const update = await updateRecord('clubs', updates, ['club_id'], [club_id]);
    if(update.affectedRows == 0) return resp.json({status:0, message: "Failed to update! Please try again after some time."});

    if(clubGallery.length > 0){
        const values = clubGallery.map(filename => [club_id, filename]);
        const placeholders = values.map(() => '(?, ?)').join(', ');
        await db.execute(`INSERT INTO club_gallery (club_id, image_name) VALUES ${placeholders}`, values.flat());
    }

    if (club.cover_img) deleteFile('club-images', club.cover_img);

    return resp.json({status:1, code: 200, message: "Club updated successfully"});
});

export const clubDelete = asyncHandler(async (req, resp) => {
    const {club_id} = req.body;
    if(!club_id) return resp.json({status:0, code:422, message:"Club Id is required"});

    const club = await queryDB(`SELECT cover_img FROM clubs WHERE club_id = ?`, [club_id]);
    if (!club) return resp.json({ status: 0, msg: "Club Data cannot be deleted, or invalid" });

    if (club.cover_image) deleteFile('club-images', club.cover_image);
    await db.execute(`DELETE FROM clubs WHERE club_id = ?`, [club_id]);

    return resp.json({ status: 1, code:200, message: "Club deleted successfully!" });
});

export const clubDeleteImg = asyncHandler(async (req, resp) => {
    const { gallery_id } = req.body;
    if(!gallery_id) return resp.json({status:0, code:422, message:"Gallery Id is required"});

    const gallery = await queryDB(`SELECT image_name FROM club_gallery WHERE id = ? LIMIT 1`, [gallery_id]);
    if(gallery){
        deleteFile('club-images', gallery.image_name);
        await db.execute(`DELETE FROM club_gallery WHERE id = ?`, [gallery_id]);
    } 

    return resp.json({ status: 1, code: 200, message: "Club Image deleted successfully!" });
});
