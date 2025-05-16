import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// const conn = mysql.createConnection({
//     host: process.env.MQTT_DB_HOST,
//     user: process.env.MQTT_DB_USER,
//     password: process.env.MQTT_DB_PASSWORD,
//     database: process.env.MQTT_DB_NAME,
//     port: 3306
// });
const conn = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
});

export default conn;