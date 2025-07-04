import db from '../../config/db.js';
import validateFields from "../../validation.js";
import generateUniqueId from 'generate-unique-id';
import { getPaginatedData, insertRecord, queryDB, updateRecord } from '../../dbUtils.js';
import { formatOpenAndCloseTimings, asyncHandler, deleteFile, getOpenAndCloseTimings, formatDateTimeInQuery } from '../../utils.js';

export const storeList = asyncHandler(async (req, resp) => {
    const { search_text, page_no } = req.body;
    const result = await getPaginatedData({
        tableName: 'service_shops',
        columns: `shop_id, shop_name, contact_no, cover_image AS shop_image, store_website, 
            (SELECT GROUP_CONCAT(location) FROM store_address AS sa WHERE sa.store_id = service_shops.shop_id ) AS location
        `,
        liveSearchFields: ['shop_id', 'shop_name'],
        liveSearchTexts: [search_text, search_text],
        sortColumn: 'id',
        sortOrder: 'DESC',
        page_no,
        limit: 10,
    });

    return resp.json({
        status: 1,
        code: 200,
        message: ["Shop List fetch successfully!"],
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
    });
});

export const storeData = asyncHandler(async (req, resp) => {
    const { shop_id } = req.body;
    const shop = await queryDB(`SELECT * FROM service_shops WHERE shop_id = ? LIMIT 1`, [shop_id]); 
    //  shop.schedule = getOpenAndCloseTimings(shop);
    const days = [ 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday' ];
    const location = await db.execute(`SELECT location_name FROM locations WHERE status = 1 ORDER BY location_name ASC`);
    const [services] = await db.execute(`SELECT service_name FROM store_services ORDER BY service_name ASC`);
    const serviceNames = services.map(service => service.service_name);
    const [brands] = await db.execute(`SELECT brand_name FROM store_brands ORDER BY brand_name ASC`);
    const brandNames = brands.map(brand => brand.brand_name);
    const [address] = await db.execute(`SELECT address, area_name, location, latitude, longitude FROM store_address WHERE store_id = ?`, [shop_id]);
    const [gallery] = await db.execute(`SELECT * FROM store_gallery WHERE store_id = ? ORDER BY id DESC`, [shop_id]);
    
    const imgName = gallery.map(image => image.image_name);
    const imgId= gallery?.map(image => image.id);

    const result = {
        status: 1,
        code: 200,
        days: days,
        location: location,
        services: serviceNames,
        brands: brandNames,
        galleryData: imgName,
        galleryId: imgId,
        base_url: `${req.protocol}://${req.get('host')}/uploads/shop-images/`,
    }
    if(shop_id){
        result.shop = shop;
        result.address = address
    }

    return resp.status(200).json(result);
});

export const storeAdd = asyncHandler(async (req, resp) => {
    const { shop_name, contact_no ,address='', store_website, store_email, always_open='', description='', brands='', services='', days='' } = req.body;
    const { isValid, errors } = validateFields(req.body, { shop_name: ["required"], contact_no: ["required"], address: ["required"], });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
    const data             = req.body;
    const coverImg         = req.files?.['cover_image']?.[0]?.filename || '';
    const shopGallery      = req.files?.['shop_gallery']?.map(file => file.filename) || [];
    const {fDays, fTiming} = formatOpenAndCloseTimings(always_open, data);
    const storeId          = `STOR${generateUniqueId({length:6})}`;
    const brandsArr        = (brands && brands.trim !== '') ? brands : '';
    const servicesArr      = (services && services.trim !== '') ? services : '';
    console.log(req.body);
    
// return false
    const insert = await insertRecord('service_shops', [
        'shop_id', 'shop_name', 'contact_no', 'store_website', 'store_email', 'cover_image', 'status', 'always_open', 'open_days', 'open_timing', 'description', 'brands', 'services', 
    ], [
        storeId, shop_name, contact_no, store_website, store_email, coverImg, 1, always_open , fDays, fTiming, description, brandsArr, servicesArr
    ]);

    if(insert.affectedRows == 0) return resp.json({status:0, message: "Something went wrong! Please try again after some time."});

    if(shopGallery.length > 0){
        const values = shopGallery.map(filename => [storeId, filename]);
        const placeholders = values.map(() => '(?, ?)').join(', ');
        await db.execute(`INSERT INTO store_gallery (store_id, image_name) VALUES ${placeholders}`, values.flat());
    }
    
    
    const allAddress = data.address ? data.address.filter(Boolean) : [];
    if(allAddress.length > 0){
        const values = [];
        const placeholders = [];
        for (let k = 0; k < allAddress.length; k++) {
            if (data.address[k]) {
                values.push(storeId);
                values.push(data.address[k]);
                values.push(data.area_name[k] || '');
                values.push(data.location[k]  || '');
                values.push(data.latitude[k]  || '');
                values.push(data.longitude[k] || '');
                
                placeholders.push('(?, ?, ?, ?, ?, ?)');
            }
        }
        await db.execute(`INSERT INTO store_address (store_id, address, area_name, location, latitude, longitude) VALUES ${placeholders.join(', ')}`, values);
    }
    return resp.json({status: 1, message: "Store added successfully."});
});

export const storeView = asyncHandler(async (req, resp) => {
    const { shop_id } = req.body;
    const location = await db.execute(`SELECT location_name FROM locations WHERE status = 1 ORDER BY location_name ASC`);
    const store = await queryDB(`SELECT * FROM service_shops WHERE shop_id = ? LIMIT 1`, [shop_id]);
    store.schedule = getOpenAndCloseTimings(store);
    if(!store) return resp.json({status:0, message:"Shop Id is invalid"});

    const [address] = await db.execute(`SELECT address, area_name, location, latitude, longitude FROM store_address WHERE store_id = ?`, [shop_id]);
    const [gallery] = await db.execute(`SELECT * FROM store_gallery WHERE store_id = ? ORDER BY id DESC`, [shop_id]);
    
    const galleryData = gallery.map(image => image.image_name);
      
    return resp.json({
        status:1,
        code: 200,
        message:"Shop Detail fetch successfully",
        store,
        location,
        galleryData,
        address,
        base_url: `${req.protocol}://${req.get('host')}/uploads/shop-images/`,
    });
});

export const storeUpdate = asyncHandler(async (req, resp) => {
    const { shop_name, contact_no , address='', store_website, store_email, always_open='', description='', brands='', services='', days='', shop_id, status } = req.body;
    const { isValid, errors } = validateFields(req.body, {
        shop_name: ["required"], contact_no: ["required"], shop_id: ["required"], 
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
    const data = req.body;
    const shop = await queryDB(`SELECT cover_image FROM service_shops WHERE shop_id = ? LIMIT 1`, [shop_id]);
    if(!shop) return resp.json({status:0, message: "Shop Data can not edit, or invalid shop Id"});
    const brandsArr = (brands && brands.trim !== '') ? data.brands : '';
    const servicesArr = (services && services.trim !== '') ? data.services : '';
    const { fDays, fTiming } = formatOpenAndCloseTimings(always_open, data);

    const coverImg = req.files['cover_image'] ? req.files['cover_image'][0].filename : shop.cover_image;
    const shopGallery = req.files['shop_gallery']?.map(file => file.filename) || [];
    
    const updates = {
        shop_name, 
        contact_no, 
        store_website, 
        store_email, 
        description,
        status, 
        always_open: always_open, 
        open_days: fDays, 
        open_timing: fTiming, 
        brands: brandsArr,
        services: servicesArr,
        cover_image: coverImg
    };

    const update = await updateRecord('service_shops', updates, ['shop_id'], [shop_id]);
    if(update.affectedRows == 0) return resp.json({status:0, message: "Failed to update! Please try again after some time."});

    if(shopGallery.length > 0){
        const values = shopGallery.map(filename => [shop_id, filename]);
        const placeholders = values.map(() => '(?, ?)').join(', ');
        await db.execute(`INSERT INTO store_gallery (store_id, image_name) VALUES ${placeholders}`, values.flat());
    }

    if (shop.cover_image) deleteFile('shop-images', shop.cover_image);

    const allAddress = data.address ? data.address.filter(Boolean) : [];
    if (allAddress.length > 0) {
        await db.execute(`DELETE FROM store_address WHERE store_id = ?`, [shop_id]);
        const values = [];
        const placeholders = [];
        for (let k = 0; k < allAddress.length; k++) {
            if (data.address[k]) {
                values.push(shop_id);
                values.push(data.address[k]);
                values.push(data.area_name[k] || '');
                values.push(data.location[k]  || '');
                values.push(data.latitude[k]  || '');
                values.push(data.longitude[k] || '');
                
                placeholders.push('(?, ?, ?, ?, ?, ?)');
            }
        }
        await db.execute(`INSERT INTO store_address (store_id, address, area_name, location, latitude, longitude) VALUES ${placeholders.join(', ')}`, values);
    }

    return resp.json({status:1, message: "Store updated successfully"});
});

export const storeDelete = asyncHandler(async (req, resp) => {
    const {shop_id} = req.body;

    const shop = await queryDB(`SELECT cover_image FROM service_shops WHERE shop_id = ?`, [shop_id]);
    if (!shop) return resp.json({ status: 0, msg: "Shop Data cannot be deleted, or invalid" });
    const [gallery] = await db.execute(`SELECT image_name FROM store_gallery WHERE store_id = ?`, [shop_id]);
    const galleryData = gallery.map(img => img.image_name);

    if (shop.cover_image) {
        deleteFile('shop-images', shop.cover_image);
    }
    if (galleryData.length > 0) {
        galleryData.forEach(img => img && deleteFile('shop-images', img));
    }
    
    await db.execute(`DELETE FROM store_gallery WHERE store_id = ?`, [shop_id]);
    await db.execute(`DELETE FROM store_address WHERE store_id = ?`, [shop_id]);
    await db.execute(`DELETE FROM service_shops WHERE shop_id = ?`, [shop_id]);

    return resp.json({ status: 1, code: 200, message: "Shop deleted successfully!" });
});

export const deleteStoreGallery = asyncHandler(async (req, resp) => {
    const { gallery_id } = req.body;
    if(!gallery_id) return resp.json({status:0, message: "Gallery Id is required"});

    const galleryData = await queryDB(`SELECT image_name FROM store_gallery WHERE id = ? LIMIT 1`, [gallery_id]);
    
    if(galleryData){
        deleteFile('shop-images', galleryData.image_name);
        await db.execute('DELETE FROM store_gallery WHERE id = ?', [gallery_id]);
    }

    return resp.json({status: 1, code: 200,  message: "Gallery image deleted successfully"});
});

/* Shop Service */
export const serviceList = asyncHandler(async (req, resp) => {
    const { search_text, page_no } = req.body;
    const result = await getPaginatedData({
        tableName: 'store_services',
        columns: `service_id, service_name, ${formatDateTimeInQuery(['created_at'])}`,
        liveSearchFields: ['service_name', 'service_id'],
        liveSearchTexts: [search_text, search_text],
        sortColumn: 'id',
        sortOrder: 'DESC',
        page_no,
        limit: 10,
    });

    return resp.json({
        status: 1,
        code: 200,
        message: ["Shop Service List fetch successfully!"],
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
    });
});
export const serviceCreate = asyncHandler(async (req, resp) => {
    const { service_name } = req.body;
    const { isValid, errors } = validateFields(req.body, { service_name: ["required"] });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    if(service_name.length > 250) return resp.json({ status: 0, code: 422, message: "Max 250 character allowed." });

    const insert = await insertRecord('store_services', ['service_id', 'service_name'], [`STRC${generateUniqueId({length:6})}`, service_name]);

    return resp.json({
        status: insert.affectedRows > 0 ? 1 : 0 ,
        code: 200 ,
        message: insert.affectedRows > 0 ? "Store Service Added successfully." : "Failed to insert, Please Try Again." ,
    });

});
export const serviceUpdate = asyncHandler(async (req, resp) => {
    const { service_name, service_id } = req.body;
    const { isValid, errors } = validateFields(req.body, { service_name: ["required"], service_id: ["required"] });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    if(service_name.length > 250) return resp.json({ status: 0, code: 422, message: "Max 250 character allowed." });

    const update = await updateRecord('store_services', {service_name}, ['service_id'], [service_id]);

    return resp.json({
        status: update.affectedRows > 0 ? 1 : 0 ,
        code: 200 ,
        message: update.affectedRows > 0 ? "Store Service Updated successfully." : "Failed to update, Please Try Again." ,
    });
});
export const serviceDelete = asyncHandler(async (req, resp) => {
    const { service_id } = req.body;
    const { isValid, errors } = validateFields(req.body, { service_id: ["required"] });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const [del] = await db.execute(`DELETE FROM store_services WHERE service_id = ?`, [service_id]);

    return resp.json({
        status: del.affectedRows > 0 ? 1 : 0 ,
        code: 200 ,
        message: del.affectedRows > 0 ? "Store Service Deleted successfully." : "Failed to delete, Please Try Again." ,
    });
});

/* Shop Brand */
export const brandList = asyncHandler(async (req, resp) => {
    const { search_text, page_no } = req.body;
    const result = await getPaginatedData({
        tableName: 'store_brands',
        columns: `brand_id, brand_name`,
        liveSearchFields: ['brand_name', 'brand_id'],
        liveSearchTexts: [search_text, search_text],
        sortColumn: 'id',
        sortOrder: 'DESC',
        page_no,
        limit: 10,
    });

    return resp.json({
        status: 1,
        code: 200,
        message: ["Shop Brand List fetch successfully!"],
        data: result.data,
        total_page: result.totalPage,
        total: result.total,
    });
});
export const brandCreate = asyncHandler(async (req, resp) => {
    const { brand_name } = req.body;
    const { isValid, errors } = validateFields(req.body, { brand_name: ["required"] });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    if(brand_name.length > 250) return resp.json({ status: 0, code: 422, message: "Max 250 character allowed." });

    const insert = await insertRecord('store_brands', ['brand_id', 'brand_name'], [`STB${generateUniqueId({length:6})}`, brand_name]);

    return resp.json({
        status: insert.affectedRows > 0 ? 1 : 0 ,
        code: 200 ,
        message: insert.affectedRows > 0 ? "Store Brand Added successfully." : "Failed to insert, Please Try Again." ,
    });

});
export const brandUpdate = asyncHandler(async (req, resp) => {
    const { brand_name, brand_id } = req.body;
    const { isValid, errors } = validateFields(req.body, { brand_name: ["required"], brand_id: ["required"] });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    if(brand_name.length > 250) return resp.json({ status: 0, code: 422, message: "Max 250 character allowed." });

    const update = await updateRecord('store_brands', {brand_name}, ['brand_id'], [brand_id]);

    return resp.json({
        status: update.affectedRows > 0 ? 1 : 0 ,
        code: 200 ,
        message: update.affectedRows > 0 ? "Store Brand Updated successfully." : "Failed to update, Please Try Again." ,
    });
});
export const brandDelete = asyncHandler(async (req, resp) => {
    const { brand_id } = req.body;
    const { isValid, errors } = validateFields(req.body, { brand_id: ["required"] });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const [del] = await db.execute(`DELETE FROM store_brands WHERE brand_id = ?`, [brand_id]);

    return resp.json({
        status: del.affectedRows > 0 ? 1 : 0 ,
        code: 200 ,
        message: del.affectedRows > 0 ? "Store Brand Deleted successfully." : "Failed to delete, Please Try Again." ,
    });
});