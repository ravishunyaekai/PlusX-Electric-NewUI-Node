import db from "../../config/db.js";
import { queryDB } from "../../dbUtils.js";
import { asyncHandler, ResponseData, mergeParam } from "../../utils.js";
import validateFields from "../../validation.js";


export const responseContentOld = asyncHandler(async (req, resp) => {
    const { module_name, response_type, sub_module } = mergeParam(req);
 
    const { isValid, errors } = validateFields(mergeParam(req), {
        module_name: ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
 
    let queryParams = [module_name];
    let query       = `select content  from response_content  where module_name=? and status=1  `;
 
    if (response_type != null && sub_module != null) {
        query += ` and sub_module=?  AND response_type = ? `;
        queryParams.push(sub_module);
        queryParams.push(response_type);
    }
    const [responseContent] = await db.execute(query, queryParams);
 
    if (!responseContent || responseContent.length === 0) return resp.json({ resp: 0, code: 400, msg: 'content not found!' });
 
    let data = {}
    let contentArray
    if (response_type != null && sub_module != null) {

        // data.content = [responseContent[0].content];
        contentArray = responseContent.map(row => row.content); 
        data.content = contentArray;    
        
        return resp.json({ message: ["single response content fetch successfully"], status: 1, code: 200, data });
    }
    const columnMap = {
        'portable-charger' : 'portable_price',
        'pick-drop'        : 'pick_drop_price',
        'road-assistance'  : 'roadside_assistance_price'
    };
    const column = columnMap[module_name];
    if (!column) return resp.json({ resp: 0, code: 400, msg: 'invalid Module name !' });
    const [[contentdata]] = await db.execute(`
        Select 
        (SELECT ${column} FROM booking_price ) AS price, 
            heading, image 
        FROM 
            response_module 
        WHERE 
            name = ? and status = 1 
        LIMIT 1`,
        [module_name]);
 
    if (!contentdata) return resp.json({ resp: 0, code: 400, msg: 'content not found!' });

    const { price, heading, image } = contentdata;
    contentArray = responseContent.map(row => {
        return row.content.replace(/AED\s*\d+(\.\d{1,2})?/gi, `AED ${price}`);
    });
    data = {
        content : contentArray,
        image,
        heading,
        price
    };
    return resp.json({ message: ["Response data fetch successfully"], status: 1, code: 200, data });
});
export const responseContent = asyncHandler(async (req, resp) => {
        const  normalize = val => (!val || val === 'null' || val === '') ? null : val;
 
        let { module_name, response_type, sub_module } = mergeParam(req);
 
        module_name = normalize(module_name);
        sub_module = normalize(sub_module);
        response_type = normalize(response_type);
 
        const { isValid, errors } = validateFields(mergeParam(req), {
            module_name: ["required"],
 
        });
        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
 
        
    
        let query = `select content , sub_module from response_content  where module_name=? and status=1  `;
        let queryParams = [module_name];
    
        if (response_type != null && sub_module != null) {
    // if (normalized_sub_module !== null && normalized_response_type !== null) {         
        let subModules = Array.isArray(sub_module)? sub_module : sub_module.split(',').map(s => s.trim());
 
            query += `  and sub_module IN (${subModules.map(() => '?').join(', ')})  AND response_type = ? `;
            // queryParams.push(sub_module);
            queryParams.push(...subModules)
            queryParams.push(response_type);
        }
 
 
        // console.log("query",query ,'queryParams',queryParams)
        const [responseContent] = await db.execute(query, queryParams);
 
        if (!responseContent || responseContent.length === 0) return resp.json({ resp: 0, code: 400, msg: 'content not found!' });
 
        let data = {}
    let contentArray ;
        if (response_type !== null && sub_module !== null) {
        // if (normalized_sub_module !== null && normalized_response_type !== null) {  
 
 
            // data.content = [responseContent[0].content];
            const contentMap = {};
    for (const row of responseContent) {
    if (row.sub_module) {
        contentMap[row.sub_module] = row.content;
    }
    }
            
            
        
 
            return resp.json({ message: ["single response content fetch successfully"], status: 1, code: 200, data: contentMap });
        }
 
 
        const columnMap = {
            'portable-charger': 'portable_price',
            'pick-drop': 'pick_drop_price',
            'road-assistance': 'roadside_assistance_price'
        };
 
 
    const column = columnMap[module_name];
 
    let selectQuery = `
    SELECT heading, image ${column ? `, (SELECT ${column} FROM booking_price) AS price` : ``}
    FROM response_module
    WHERE name = ? AND status = 1
    LIMIT 1
    `;
        
 
        // if (!column) return resp.json({ resp: 0, code: 400, msg: 'invalid Module name !' });
 
        const [[contentdata]] = await db.execute(selectQuery,[module_name]);
 
        if (!contentdata) return resp.json({ resp: 0, code: 400, msg: 'content not found!' });
        // const { price, heading, image } = contentdata;
    const { heading, image ,price} = contentdata;
 
 
 
        contentArray = responseContent.map(row => {
            // return row.content.replace(/AED\s*\d+(\.\d{1,2})?/gi, `AED ${price}`);
            return row.content;
        });
 
        data = {
            content: contentArray,
        
            image :image || null,
            heading : heading ||null,
            price:price || null
        };
 
        return resp.json({ message: ["Response data fetch successfully"], status: 1, code: 200, data });
 
    });