const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

const accessLogPath = path.join(logDir, 'access.log');
const errorLogPath = path.join(logDir, 'error.log');

function logToFile(filePath, message) {
    fs.appendFile(filePath, message + '\n', (err) => {
        if (err) {
            console.error('Failed to write log:', err.message);
        }
    });
}

function requestLogger(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logLine = `[${new Date().toISOString()}] ${req.method} ${
            req.originalUrl
        } ${res.statusCode} ${duration}ms`;
        console.log(logLine);
        logToFile(accessLogPath, logLine);
    });
    next();
}

function errorLogger(err, req, res, next) {
    const logLine = `[${new Date().toISOString()}] ERROR ${req.method} ${
        req.originalUrl
    } - ${err.message}`;
    console.error(logLine);
    logToFile(errorLogPath, logLine);
    next(err);
}

module.exports = {
    requestLogger,
    errorLogger,
};
