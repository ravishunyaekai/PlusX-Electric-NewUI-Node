import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import logger from "../logger.js";
dotenv.config();

const pool = mysql.createPool({
    host               : process.env.DB_HOST,
    user               : process.env.DB_USER,
    password           : process.env.DB_PASSWORD,
    database           : process.env.DB_NAME,
    port               : 3306,
    waitForConnections : true,
    // connectionLimit    : 20,
    // queueLimit         : 0
    // connectTimeout     : 10000,
});
const retryConnection = async (retries, delay) => {
    for (let i = 0; i <= retries; i++) {

        try {
            const connection = await pool.getConnection();
            console.log("Connected to the MySQL database.");
            connection.release();
            return;
        } catch (err) {
            logger.error(`Error connecting to the database (attempt ${i + 1}):`, err);

            if (err.code === 'ECONNREFUSED') {
                logger.error(`Connection refused, retrying...`);
            }

            if (i < retries) {
                await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
                logger.error(`All retry attempts failed.`);
                throw err;
            }
        }
    }
};

const testConnectionOld = async () => {
  const maxRetries = 5;
  const retryDelay = 2000;
  await retryConnection(maxRetries, retryDelay);
};

const connectDB = async () => {
    try {
        const connection = await pool.getConnection();
        // console.log('connection', connection)
        console.log("Connected to the MySQL database.");
        connection.release();
    } catch (err) {
        setTimeout(connectDB, 2000);
        console.error("Error connecting to the database:", err);
    }
    
    // pool.getConnection((err, connection) => {
    //     console.log('err', err)
    //     console.log('connection', connection)
        
    //     if (err) {
    //         console.log("Database connection failed:", err);
    //         setTimeout(connectDB, 2000); // Retry after 2 seconds
    //     } else {
    //         console.log("Database connected!");
    //         connection.release();
    //     }
    // });
};
connectDB();

pool.originalQuery = pool.query.bind(pool);

const logQuery = async (sql, params = []) => {
    const formatted = mysql.format(sql, params);
    const start = process.hrtime();

    const [rows, fields] = await pool.originalQuery(sql, params);

    const [sec, nano] = process.hrtime(start);
    const durationMs = (sec * 1000 + nano / 1e6).toFixed(2);

    logger.info(`SQL (${durationMs} ms): ${formatted}`);
    return [rows, fields];
};

pool.query = logQuery;
pool.logQuery = logQuery;


export const startTransaction = async () => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    return connection;
};

export const commitTransaction = async (connection) => {
    await connection.commit();
    connection.release();
};

export const rollbackTransaction = async (connection) => {
    await connection.rollback();
    connection.release();
};


export default pool;
