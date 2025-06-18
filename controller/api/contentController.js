import db from "../../config/db.js";
import { queryDB } from "../../dbUtils.js";
import { asyncHandler, mergeParam, ResponseData } from "../../utils.js";
import validateFields from "../../validation.js";


export const oldresponseContent = asyncHandler(async (req, resp) => {
 const {module_name}=req.query;
    // const module_name = 'pick-drop'
    const columnMap   = {
        'portable-charger' : 'portable_price',
        'pick-drop'        : 'pick_drop_price',
        'road-assistance'  : 'roadside_assistance_price'
    };
    const column = columnMap[module_name];
    if(!column) return resp.json({resp : 0, code : 400, msg : 'invalid Module name !'} );
 
    const [responseContent] = await db.execute(`select content from response_content where module_name=? and status=1 `, [module_name]);
    if (!responseContent || responseContent.length === 0) return  resp.json({resp : 0, code : 400, msg : 'content not found!'} ); 
 
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
 
    if(!contentdata) return  resp.json({resp : 0, code : 400, msg : 'content not found!'} );
    const { price, heading, image } = contentdata;
 
    const contentArray = responseContent.map(row => {
        return row.content.replace(/AED\s*\d+(\.\d{1,2})?/gi, `AED ${price}`);
    });
 
    let data = {
    
        image   : image,
        price   : price || 0,
        heading : heading,
        content  : contentArray
    }
  return resp.json({   status: 1,
    code: 200,
    message: [
        "Response data fetch successfully!"
    ],
    data} );
   
});

export const responseContent = asyncHandler(async (req, resp) => {
 const {module_name}=mergeParam(req)
 const { isValid, errors } = validateFields(mergeParam(req), {
        module_name         : ["required"],

    });
     if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    // const module_name = 'pick-drop'
    const columnMap   = {
        'portable-charger' : 'portable_price',
        'pick-drop'        : 'pick_drop_price',
        'road-assistance'  : 'roadside_assistance_price'
    };
    const column = columnMap[module_name];
    if(!column) return resp.json({resp : 0, code : 400, msg : 'invalid Module name !'} );
 
    const [responseContent] = await db.execute(`select content from response_content where module_name=? and status=1 `, [module_name]);
    if (!responseContent || responseContent.length === 0) return  resp.json({resp : 0, code : 400, msg : 'content not found!'} ); 
 
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
 
    if(!contentdata) return  resp.json({resp : 0, code : 400, msg : 'content not found!'} );
    const { price, heading, image } = contentdata;
 
    const contentArray = responseContent.map(row => {
        return row.content.replace(/AED\s*\d+(\.\d{1,2})?/gi, `AED ${price}`);
    });
 
    let data = {
    
        image   : image,
        price   : price || 0,
        heading : heading,
        content  : contentArray
    }
  return resp.json({   status: 1,
    code: 200,
    message: [
        "Response data fetch successfully!"
    ],
    data} );
   
});