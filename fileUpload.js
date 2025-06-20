import multer from 'multer';
import path from 'path';
import fs from 'fs';
import AWS from 'aws-sdk';
//  import multerS3 from 'multer-s3';
// import multerS3 from 'multer';

import { S3Client } from "@aws-sdk/client-s3";

import dotenv from 'dotenv';
dotenv.config();


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

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});


const s3 = new AWS.S3();


const uploadFileToS3 = async (file, dirName = 'default') => {
   
  const fileContent = fs.readFileSync(file.path);
  console.log('Reading from disk:', file.path);
  const key = `${dirName}/${Date.now()}-${file.originalname}`;
//   const key = `banner/${Date.now()}-${file.originalname}`;

  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Body: fileContent,
    ACL: 'public-read',
    ContentType: file.mimetype
  };

  const data = await s3.upload(params).promise();
  console.log(' S3 URL:', data);
  return data.Location;
};

export const handleFileUploadOld = (
  dirName,
  fileFields,
  requiredFields = [],
  maxFiles = 10,
  allowedFileTypes = ['png', 'jpeg', 'jpg']
) => {
  const destinationPath = path.join('uploads', dirName);

  if (!fs.existsSync(destinationPath)) {
    fs.mkdirSync(destinationPath, { recursive: true });
  }
//  checkPutObjectPermission();
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, destinationPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${file.originalname}`;
      cb(null, uniqueSuffix);
    },
  });

  const fileFilter = (req, file, cb) => {
    const fileExtension = path.extname(file.originalname).slice(1).toLowerCase();
    if (!allowedFileTypes.includes(fileExtension)) {
      return cb(new Error(`Invalid File Type! Only ${allowedFileTypes.join(', ')} allowed.`), false);
    }
    cb(null, true);
  };

  const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: fileFilter,
  });

  return (req, res, next) => {
    const multerFields = fileFields.map(field => ({
      name: field,
      maxCount: maxFiles
    }));

    const uploadMethod = upload.fields(multerFields);

    uploadMethod(req, res, async (err) => {
      let errorMsg = {};

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

      try {
        const uploadedUrls = {};
        for (const field of Object.keys(req.files)) {
          uploadedUrls[field] = [];

          for (const file of req.files[field]) {
            const url = await uploadFileToS3(file, dirName);
            uploadedUrls[field].push(url);
          }
        }

        console.log(' Uploaded S3 URLs:', uploadedUrls);
        req.uploadedFiles = uploadedUrls;
        next();

      } catch (uploadErr) {
        console.error(' S3 Upload Error:', uploadErr);
        return res.status(500).json({ status: 0, message: 'Failed to upload to S3.' });
      }
    });
  };
};
/*export const handleFileUpload = (dirName, fileFields, requiredFields = [], maxFiles = 10, allowedFileTypes = ['png', 'jpeg', 'jpg']) => {
  const destinationPath = path.join('uploads', dirName);
 if (!fs.existsSync(destinationPath)) {
    fs.mkdirSync(destinationPath, { recursive: true });
  }

    let errorMsg = {};

    const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, destinationPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${file.originalname}`;
      cb(null, uniqueSuffix);
    },
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
*/