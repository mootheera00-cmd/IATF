// backend/middleware/fileAccess.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { ORIGINAL_DIR, PDF_DIR } = require('../config/storage');

const dbPath = path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbPath);

// Promisify db operations
const get = (sql, params) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

const run = (sql, params) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

/**
 * Middleware to control file access based on user role and file type
 * IATF 16949 Compliance:
 * - Only authorized users can view original source files (Word/Excel)
 * - PDF files can be viewed by any authenticated user
 * - All access attempts are logged for audit trail
 */
function fileAccessControl(req, res, next) {
    const user = req.user;
    const filePath = req.filePath || req.query.file;

    // Skip if no file path
    if (!filePath) {
        return next();
    }

    // Check if it's an original file
    const isOriginalFile = filePath.includes(ORIGINAL_DIR);
    const isPdfFile = filePath.includes(PDF_DIR);

    // PDF files: Allow all authenticated users
    if (isPdfFile) {
        logFileAccess(user.id, filePath, 'pdf', 'ALLOWED', user.role);
        req.fileAccessAllowed = true;
        return next();
    }

    // Original files: Restrict to specific roles
    if (isOriginalFile) {
        const allowedRoles = ['ADMIN', 'DOCUMENT_CONTROL', 'QMR', 'MANAGER'];
        
        if (allowedRoles.includes(user.role)) {
            logFileAccess(user.id, filePath, 'original', 'ALLOWED', user.role);
            req.fileAccessAllowed = true;
            return next();
        } else {
            logFileAccess(user.id, filePath, 'original', 'DENIED', user.role);
            return res.status(403).json({
                message: 'Access denied: You do not have permission to view original source files',
                reason: 'Original files are restricted to Document Control and Management roles'
            });
        }
    }

    // Default: Allow access
    req.fileAccessAllowed = true;
    next();
}

/**
 * Log file access for audit trail
 */
async function logFileAccess(user_id, file_path, file_type, access_status, user_role) {
    try {
        const fileName = path.basename(file_path);
        const sql = `
            INSERT INTO AuditEvent (entity_type, entity_id, actor_id, action, metadata, created_at)
            VALUES ('File', 0, ?, 'FILE_ACCESS_' || ?, ?, CURRENT_TIMESTAMP)
        `;
        const metadata = JSON.stringify({
            file_name: fileName,
            file_type: file_type,
            access_status: access_status,
            user_role: user_role,
            file_path: file_path
        });

        await run(sql, [user_id, access_status, metadata]);
    } catch (error) {
        console.error('Error logging file access:', error.message);
        // Don't fail the request if logging fails
    }
}

/**
 * Middleware to verify file permission before download
 * Used specifically for change request file downloads
 */
async function verifyFilePermission(req, res, next) {
    try {
        const user = req.user;
        const filePath = req.filePath;

        if (!filePath) {
            return next();
        }

        const isOriginalFile = filePath.includes(ORIGINAL_DIR);
        const isPdfFile = filePath.includes(PDF_DIR);

        // PDF files: Always allowed for authenticated users
        if (isPdfFile) {
            await logFileAccess(user.id, filePath, 'pdf', 'DOWNLOAD_ALLOWED', user.role);
            req.canDownload = true;
            return next();
        }

        // Original files: Only managers, QMR, and admin
        if (isOriginalFile) {
            const allowedRoles = ['ADMIN', 'DOCUMENT_CONTROL', 'QMR', 'MANAGER'];
            
            if (allowedRoles.includes(user.role)) {
                await logFileAccess(user.id, filePath, 'original', 'DOWNLOAD_ALLOWED', user.role);
                req.canDownload = true;
                return next();
            } else {
                await logFileAccess(user.id, filePath, 'original', 'DOWNLOAD_DENIED', user.role);
                return res.status(403).json({
                    message: 'Access denied: Cannot download original source files',
                    reason: 'Original files are restricted to Document Control and Management roles. Only PDF files are available for download.'
                });
            }
        }

        req.canDownload = true;
        next();
    } catch (error) {
        console.error('Error verifying file permission:', error.message);
        res.status(500).json({
            message: 'Error verifying file access permission',
            error: error.message
        });
    }
}

/**
 * Get file access logs for a specific user (for compliance reporting)
 */
async function getFileAccessLogs(user_id, start_date, end_date) {
    try {
        let sql = `
            SELECT ae.id, ae.action, ae.created_at, ae.metadata
            FROM AuditEvent ae
            WHERE ae.entity_type = 'File' AND ae.actor_id = ?
        `;
        const params = [user_id];

        if (start_date) {
            sql += ` AND ae.created_at >= ?`;
            params.push(start_date);
        }

        if (end_date) {
            sql += ` AND ae.created_at <= ?`;
            params.push(end_date);
        }

        sql += ` ORDER BY ae.created_at DESC`;

        const logs = await new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        return logs || [];
    } catch (error) {
        console.error('Error fetching file access logs:', error.message);
        return [];
    }
}

module.exports = {
    fileAccessControl,
    verifyFilePermission,
    getFileAccessLogs
};
