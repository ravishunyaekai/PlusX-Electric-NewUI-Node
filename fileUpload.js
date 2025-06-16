import multer from 'multer';
import path from 'path';
import fs from 'fs';

export const v1handleFileUpload = (dirName, fileFields, requiredFields = [], maxFiles = 10, allowedFileTypes = ['png', 'jpeg', 'jpg']) => {
    const destinationPath = path.join('uploads', dirName);
    let errorMsg = {};

    if (!fs.existsSync(destinationPath)) {
        fs.mkdirSync(destinationPath, { recursive: true });
    }

    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, destinationPath);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now();
            const filename = `${uniqueSuffix}-${file.originalname}`;
            cb(null, filename);
        }
    });

    const fileFilter = (req, file, cb) => {
        const fileExtension = path.extname(file.originalname).slice(1).toLowerCase();
        console.log(fileExtension)
        if (!allowedFileTypes.includes(fileExtension)) {
            return cb(new Error(`Invalid File Type! Only ${allowedFileTypes.join(', ')} file types are allowed.`), false);
        }
        cb(null, true);
    };

    const upload = multer({ 
        storage: storage,
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: fileFilter
    });

    return (req, res, next) => {
        const multerFields = fileFields.map(field => ({
            name: field,
            maxCount: maxFiles
        }));

        const uploadMethod = upload.fields(multerFields);

        uploadMethod(req, res, (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        errorMsg['limit'] = 'File size should not exceed 10 MB.';
                    } else {
                        errorMsg['multer'] = err.message;
                    }
                } else {
                    errorMsg[err.field || 'unknown'] = err.message || 'An unknown error occurred.';
                }
                return res.status(422).json({ status: 0, code: 422, message: errorMsg });
            }

            if (Object.keys(errorMsg).length > 0) {
                return res.status(422).json({ status: 0, code: 422, message: errorMsg });
            }

            req.uploadedFiles = req.files || [];
            next();
        });
    };
};

export const handleFileUpload = (dirName, fileFields, requiredFields = [], maxFiles = 10, allowedFileTypes = ['png', 'jpeg', 'jpg']) => {
    const destinationPath = path.join('uploads', dirName);
    let errorMsg = {};

    if (!fs.existsSync(destinationPath)) {
        fs.mkdirSync(destinationPath, { recursive: true });
    }

    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, destinationPath);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now();
            const filename = `${uniqueSuffix}-${file.originalname}`;
            cb(null, filename);
        }
    });

    const fileFilter = (req, file, cb) => {
        const fileExtension = path.extname(file.originalname).slice(1).toLowerCase();
        console.log(fileExtension)
        if (!allowedFileTypes.includes(fileExtension)) {
            return cb(new Error(`Invalid File Type! Only ${allowedFileTypes.join(', ')} file types are allowed.`), false);
        }
        cb(null, true);
    };

    const upload = multer({ 
        storage: storage,
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: fileFilter
    });

    return (req, res, next) => {
        const multerFields = fileFields.map(field => ({
            name: field,
            maxCount: maxFiles
        }));

        const uploadMethod = upload.fields(multerFields);

        uploadMethod(req, res, (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        errorMsg['limit'] = 'File size should not exceed 10 MB.';
                    } else {
                        errorMsg['multer'] = err.message;
                    }
                } else {
                    errorMsg[err.field || 'unknown'] = err.message || 'An unknown error occurred.';
                }
                return res.status(422).json({ status: 0, code: 422, message: errorMsg });
            }

            if (Object.keys(errorMsg).length > 0) {
                return res.status(422).json({ status: 0, code: 422, message: errorMsg });
            }

            req.uploadedFiles = req.files || [];
            next();
        });
    };
};
