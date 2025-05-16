import express from 'express';
import bodyParser from 'body-parser';
import adminRoutes from './routes/admin.js';
import apiRoutes from './routes/api.js';
import webRoutes from './routes/web.js';
import driverRoutes from './routes/driver.js';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { errorHandler } from './middleware/errorHandler.js';
import dotenv from 'dotenv';
dotenv.config();

import cron from 'node-cron';
import { failedPODBooking, failedValetBooking, failedRSABooking } from './controller/TestController.js';

const app  = express();
const PORT = process.env.PORT || 3435;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const corsOptions = {
    origin : [
        'http://192.168.43.223:1112',
        'http://192.168.43.223:3434',
        'http://localhost:1112',
        'http://localhost:8000/',
        'https://plusxmail.shunyaekai.com/',
        'http://supro.shunyaekai.tech:8801/',
        'http://localhost:1113',
        'https://plusx.shunyaekai.com/'
    ],
    // origin : "*",
    methods     : 'GET, POST, PUT, DELETE',
    credentials : true
};

app.use(cors(corsOptions));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(bodyParser.json());
app.use(cookieParser());

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);
app.use('/web', webRoutes);
app.use('/driver', driverRoutes);

app.get('/.well-known/apple-app-site-association', (req, resp) => {
    return resp.json({
        "applinks"    : {
            "apps"    : [],
            "details" : [
                {
                    "appID" : "5X456GQ4TF.com.shunyaekaitechnologies.PLUSXELECTRIC",
                    "paths" : ["/redirect/*", "/pod/*", "/payment-success", "/payment-success/*", "/payment-cancel", "/payment-cancel/*" ] 
                }
            ]
        }
    });
});
app.get('/pod/id6503144034', (req,res, resp) => {
res.redirect('https://www.plusxelectric.com');
});

app.get('/payment-success', (req, res) => {
    res.redirect(`plusxelectric://payment-success`); 
});
app.get('/payment-cancel', (req, res) => {
    res.redirect(`plusxelectric://payment-cancel`); 
});

// // React build
// app.use(express.static(path.join(__dirname, 'build')));
// app.get('/*', function (req, res) {
//     res.sendFile(path.join(__dirname, 'build', 'index.html'));
// });

// cron.schedule('*/10 * * * *', async () => {
//     await failedPODBooking()
//     await failedValetBooking() 
//     await failedRSABooking()
//     console.log('This runs every 10 minutes', new Date().toISOString());
// });
app.use(errorHandler);


app.listen(PORT, ()=>{
    console.log(`Server is running on port ${PORT}`);
});
