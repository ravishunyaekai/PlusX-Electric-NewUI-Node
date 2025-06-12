import logger from "../logger.js";

export const errorHandler = (err, req, res, next) => {

    let arrE = err.stack.split(",")
    if (Array.isArray(arrE) && arrE.length ) { 
        let lineArr = arrE[0].split("at");
        if (Array.isArray(lineArr) && lineArr.length ) { 

            logger.error(`${err} at (${lineArr[1]}) On (${req.originalUrl})`);
        } else {
            logger.error(` ${err} at (${arrE[0]}) On (${req.originalUrl})`);
        }
    } else {
        logger.error(`Error : ${err} On (${req.originalUrl})`);
    }
    const message = "Oops! There is something went wrong! Please Try Again."  ;

    return res.json({
        status  : 0,
        code    : err.statusCode || 500,
        message : [message]
    });
};

export const tryCatchErrorHandler = (action, err, res, msg='' ) => {
    
    let arrE = err.stack.split(",")
    if (Array.isArray(arrE) && arrE.length ) { 
        let lineArr = arrE[0].split("at");
        if (Array.isArray(lineArr) && lineArr.length ) { 
            logger.error(` ${err} at (${lineArr[1]}) On (${action})`);
        } else {
            logger.error(` ${err} at (${arrE[0]}) On (${action})`);
        }
    } else {
        logger.error(`Error : ${err} On (${action})`);
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
