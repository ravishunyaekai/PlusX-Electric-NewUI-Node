import logger from "../logger.js";

export const errorHandler = (err, req, res, next) => {

    let arrE = err.stack.split(",")
    if (Array.isArray(arrE) && arrE.length ) { 
        let lineArr = arrE[0].split("at");
        if (Array.isArray(lineArr) && lineArr.length ) { 

            logger.error(`${err} at (${lineArr[1]})`);
        } else {
            logger.error(` ${err} at (${arrE[0]})`);
        }
    } else {
        logger.error(`Error : ${err} at (${req.originalUrl})`);
    }
    console.log(err);
    const message    = "Oops! There is something went wrong! Please Try Again."  ;

    return res.json({
        status  : 0,
        code    : err.statusCode || 500,
        message : [message]
    });
};

export const tryCatchErrorHandler = (err, res, msg='' ) => {
    
    let arrE = err.stack.split(",")
    if (Array.isArray(arrE) && arrE.length ) { 
        let lineArr = arrE[0].split("at");
        if (Array.isArray(lineArr) && lineArr.length ) { 
            logger.error(` ${err} at (${lineArr[1]})`);
        } else {
            logger.error(` ${err} at (${arrE[0]})`);
        }
    } else {
        logger.error(`Error : ${err} `);
    }
    const message = msg || "Oops! There is something went wrong! Please Try Again.";

    if(Object.keys(res).length) {
        return res.json({
            status  : 0,
            code    : err.statusCode || 500,
            message : [message]
        });
    } else {
        return false;
    }
    
};
