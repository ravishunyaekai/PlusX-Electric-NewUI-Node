import winston from "winston";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import moment from "moment-timezone";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const errorLogFilePath = path.join(__dirname, "error.log");
const mysqlLogFilePath = path.join(__dirname, "mysql.log");

if (!fs.existsSync(errorLogFilePath)) {
  fs.writeFileSync(errorLogFilePath, "", { flag: "a+" });
}

if (!fs.existsSync(mysqlLogFilePath)) {
  fs.writeFileSync(mysqlLogFilePath, "", { flag: "a+" });
}


const customFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message }) => {
    let timeZone = moment().tz("Asia/Dubai");
    let currentTime = timeZone.format("YYYY-MM-DD HH:mm:ss");
    return `${currentTime} [${level.toUpperCase()}]: ${message}`;
  })
);


const logger = winston.createLogger({
  format: customFormat,
  transports: [
    new winston.transports.File({
      filename: errorLogFilePath,
      level: "error",
      handleExceptions: true,
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: mysqlLogFilePath,
      level: "info", // <-- for MySQL queries
      handleExceptions: false,
      maxsize: 5242880,
      maxFiles: 3,
    }),
  ],
});

export default logger;
