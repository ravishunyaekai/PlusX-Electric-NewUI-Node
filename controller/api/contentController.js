import db from "../../config/db.js";
import { queryDB } from "../../dbUtils.js";
import { asyncHandler, ResponseData } from "../../utils.js";
import validateFields from "../../validation.js";

export const oldresponseContent = asyncHandler(async (req, resp) => {
 

  try{
 const { module_name } = req.query;
    const { isValid, errors } = validateFields(
    { module_name: ["required"] }
  );

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

const columnMap = {
  'portable-charger': 'portable_price',
  'pick-drop': 'pick_drop_price',
  'road-assistance': 'roadside_assistance_price'
};

const column = columnMap[module_name];
 if(!column) return  ResponseData(resp,0, 400, 'invalid Module name !')



const [responseContent] = await db.execute(`select content from response_content where module_name=? and status=1 `, [module_name]);
  if (!responseContent || responseContent.length === 0) return  ResponseData(resp,0, 400, 'Content not nound !') 

  const [content] = await db.execute(`select (SELECT ${column} FROM booking_price  )AS  price,heading,image from response_module where name=? and status=1 limit 1`, [module_name]);
if(!content) return  ResponseData(resp,0, 400, 'content not found!')
  const { price, heading, image } = content[0];
// let price='', heading='', image='';

const contentArray= responseContent.map(row=>row.content);
let data={}
data.image=image;
data.price=price;
data.heading=heading;
data.conent=contentArray;
return ResponseData(resp,1, 200, 'Response data fetch successfully!', {data})

  }catch(error){
 return  ResponseData(resp,0, 500, ' Something went wrong !')
 
  }

 //return resp.json(response);
});



export const paramjeetresponseContent = asyncHandler(async (req, resp) => {
 

  
 const { module_name } = req.query;
    const { isValid, errors } = validateFields(
    { module_name: ["required"] }
  );

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

const columnMap = {
  'portable-charger': 'portable_price',
  'pick-drop': 'pick_drop_price',
  'road-assistance': 'roadside_assistance_price'
};

const column = columnMap[module_name];
 if(!column) return  ResponseData(resp,0, 400, 'invalid Module name !')



const [responseContent] = await db.execute(`select content from response_content where module_name=? and status=1 `, [module_name]);
  if (!responseContent || responseContent.length === 0) return  ResponseData(resp,0, 400, 'Content not nound !') 


  const [content] = await db.execute(`select (SELECT ${column} FROM booking_price  )AS price, heading,image from response_module where name=? and status=1 limit 1`, [module_name]);
if(!content) return  ResponseData(resp,0, 400, 'content not found!')
  const { price, heading, image } = content[0];
// let price='', heading='', image='';

//const contentArray= responseContent.map(row=>row.content);

const contentArray = responseContent.map(row => {

  return row.content.replace(/AED\s*\d+(\.\d{1,2})?/gi, `AED ${price}`);
});
let data={}
data.image=image;
data.price=price||0;
data.heading=heading;
data.conent=contentArray;
return ResponseData(resp,1, 200, 'Response data fetch successfully!', {data})

  

 //return resp.json(response);
});

export const responseContent = asyncHandler(async (req, resp) => {
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