// backend/services/notificationService.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const nodemailer = require('nodemailer');
const dbPath = path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbPath);

const smtpHost = process.env.SMTP_HOST || '';
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const smtpUser = process.env.SMTP_USER || '';
const smtpPass = process.env.SMTP_PASS || '';
const smtpFrom = process.env.SMTP_FROM || smtpUser || 'no-reply@localhost';

function hasEmailConfig() {
    return Boolean(smtpHost && smtpPort && smtpUser && smtpPass);
}

let mailTransporter = null;

function getMailTransporter() {
    if (!hasEmailConfig()) {
        return null;
    }
    if (!mailTransporter) {
        mailTransporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: {
                user: smtpUser,
                pass: smtpPass,
            },
        });
    }
    return mailTransporter;
}

// Promisify db operations
const run = (sql, params) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const get = (sql, params) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

const all = (sql, params) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

let notificationSchemaReady = false;

async function ensureNotificationSchemaCompatibility() {
    if (notificationSchemaReady) return;

    const cols = await all(`PRAGMA table_info(Notification)`, []);
    const has = (name) => cols.some(c => c.name === name);

    if (!has('metadata')) {
        await run(`ALTER TABLE Notification ADD COLUMN metadata TEXT`, []);
    }
    if (!has('read_at')) {
        await run(`ALTER TABLE Notification ADD COLUMN read_at TIMESTAMP NULL`, []);
    }

    notificationSchemaReady = true;
}

const notificationService = {
    async sendEmail(to, subject, text) {
        const transporter = getMailTransporter();
        if (!transporter) {
            return { sent: false, reason: 'smtp_not_configured' };
        }

        try {
            const info = await transporter.sendMail({
                from: smtpFrom,
                to,
                subject,
                text,
            });

            return { sent: true, messageId: info.messageId || null };
        } catch (error) {
            console.error('Error sending email notification:', error.message);
            return { sent: false, reason: error.message };
        }
    },

    async getDocumentControllerContacts() {
        try {
            const rows = await all(
                `SELECT u.id, u.name, u.email
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE COALESCE(u.is_active, 1) = 1
                   AND UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) IN ('DOCUMENT_CONTROLLER', 'DOCUMENT_CONTROL')`,
                []
            );

            return rows || [];
        } catch (error) {
            console.error('Error finding Document Controller contacts:', error.message);
            return [];
        }
    },

    async getDocumentControllerUserIds() {
        try {
            const rows = await all(
                `SELECT u.id
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE COALESCE(u.is_active, 1) = 1
                   AND UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) IN ('DOCUMENT_CONTROLLER', 'DOCUMENT_CONTROL')`,
                []
            );

            return (rows || []).map((row) => row.id).filter(Boolean);
        } catch (error) {
            console.error('Error finding Document Controller users:', error.message);
            return [];
        }
    },

    async getAdminUserIds() {
        try {
            const rows = await all(
                `SELECT u.id
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE COALESCE(u.is_active, 1) = 1
                   AND UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) = 'ADMIN'`,
                []
            );

            return (rows || []).map((row) => row.id).filter(Boolean);
        } catch (error) {
            console.error('Error finding Admin users:', error.message);
            return [];
        }
    },

    async notifyUsers(userIds, type, message, metadata = {}) {
        if (!Array.isArray(userIds) || userIds.length === 0) return [];
        const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
        return Promise.all(uniqueIds.map((id) => this.createNotification(id, type, message, metadata)));
    },

    async getAdminUserIds() {
        try {
            const rows = await all(
                `SELECT u.id
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE COALESCE(u.is_active, 1) = 1
                   AND UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) = 'ADMIN'`,
                []
            );

            return (rows || []).map((row) => row.id).filter(Boolean);
        } catch (error) {
            console.error('Error finding Admin users:', error.message);
            return [];
        }
    },

    async notifyUsers(userIds, type, message, metadata = {}) {
        if (!Array.isArray(userIds) || userIds.length === 0) return [];
        const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
        return Promise.all(uniqueIds.map((id) => this.createNotification(id, type, message, metadata)));
    },

    /**
     * Create notification record in database
     * @param {number} user_id - User to notify
     * @param {string} type - Notification type (DCR_SUBMITTED, DCR_APPROVED, DCR_REJECTED, DCR_RETURNED)
     * @param {string} message - Notification message
     * @param {object} metadata - Additional data (cr_id, document_id, etc.)
     */
    async createNotification(user_id, type, message, metadata = {}) {
        try {
            await ensureNotificationSchemaCompatibility();
            const sql = `
                INSERT INTO Notification (user_id, type, message, metadata, created_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;
            const result = await run(sql, [user_id, type, message, JSON.stringify(metadata)]);
            console.log(`✓ Notification created: User ${user_id}, Type: ${type}`);
            return result.lastID;
        } catch (error) {
            console.error('Error creating notification:', error.message);
            throw error;
        }
    },

    /**
     * Send DCR submission notification to manager
     * @param {number} manager_id - Manager to notify
     * @param {object} dcr - Document Change Request data
     * @param {object} requester - Requester user data
     */
    async notifyDCRSubmitted(manager_id, dcr, requester) {
        const message = `Document Change Request #${dcr.id} submitted by ${requester.name} for document "${dcr.document_title || 'Document'}"`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            requester_id: dcr.requester_id,
            action: 'review_required'
        };
        return this.createNotification(manager_id, 'DCR_SUBMITTED', message, metadata);
    },

    async notifyDCRSubmittedToDocumentControllers(dcr, requester) {
        const controllers = await this.getDocumentControllerContacts();
        if (!controllers.length) {
            return [];
        }

        const message = `Document Change Request #${dcr.id} submitted by ${requester.name} for document "${dcr.document_title || 'Document'}"`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            requester_id: dcr.requester_id,
            action: 'document_controller_review_required'
        };

        const notificationResults = await Promise.all(
            controllers.map((controller) => this.createNotification(controller.id, 'DCR_SUBMITTED', message, metadata))
        );

        const emailSubject = `[IATF] DCR #${dcr.id} requires Document Controller review`;
        const emailBody = `${message}\n\nPlease review in the system.`;

        const emailResults = await Promise.all(
            controllers
                .filter((controller) => String(controller.email || '').includes('@'))
                .map((controller) => this.sendEmail(controller.email, emailSubject, emailBody))
        );

        return {
            notifications: notificationResults,
            emails: emailResults,
        };
    },

    /**
     * Send DCR pre-approval notification to requester
     * @param {number} requester_id - Requester to notify
     * @param {object} dcr - Document Change Request data
     * @param {string} downloadLink - Link to download source file
     * @param {object} manager - Manager/approver data
     */
    async notifyDCRPreApproved(requester_id, dcr, downloadLink, manager) {
        const message = downloadLink
            ? `Your Document Change Request #${dcr.id} has been pre-approved by ${manager.name}. Click the link to download the source file for editing: ${downloadLink}`
            : `Your Document Change Request #${dcr.id} has been pre-approved by ${manager.name}. Please upload required files to continue the workflow.`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            manager_id: dcr.manager_id,
            download_link: downloadLink,
            action: 'edit_required'
        };
        return this.createNotification(requester_id, 'DCR_PRE_APPROVED', message, metadata);
    },

    /**
     * Send DCR rejection notification to requester
     * @param {number} requester_id - Requester to notify
     * @param {object} dcr - Document Change Request data
     * @param {object} manager - Manager/approver data
     * @param {string} comment - Rejection reason/comment
     */
    async notifyDCRRejected(requester_id, dcr, manager, comment) {
        const message = `Your Document Change Request #${dcr.id} has been rejected by ${manager.name}. Reason: ${comment || 'No reason provided'}`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            manager_id: dcr.manager_id,
            comment: comment,
            action: 'resubmit_required'
        };
        return this.createNotification(requester_id, 'DCR_REJECTED', message, metadata);
    },

    /**
     * Send revision upload notification to manager
     * @param {number} manager_id - Manager to notify
     * @param {object} dcr - Document Change Request data
     * @param {object} requester - Requester user data
     */
    async notifyRevisionUploaded(manager_id, dcr, requester) {
        const message = `New revision for Document Change Request #${dcr.id} has been uploaded by ${requester.name} and is pending your approval.`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            requester_id: dcr.requester_id,
            action: 'final_review_required'
        };
        return this.createNotification(manager_id, 'REVISION_UPLOADED', message, metadata);
    },

    /**
     * Send final approval notification to requester
     * @param {number} requester_id - Requester to notify
     * @param {object} dcr - Document Change Request data
     * @param {object} manager - Manager/approver data
     */
    async notifyDCRApproved(requester_id, dcr, manager) {
        const message = `Your Document Change Request #${dcr.id} has been approved by ${manager.name}. The updated document is now released.`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            manager_id: dcr.manager_id,
            action: 'approved'
        };
        return this.createNotification(requester_id, 'DCR_APPROVED', message, metadata);
    },

    /**
     * Send return for revision notification to requester
     * @param {number} requester_id - Requester to notify
     * @param {object} dcr - Document Change Request data
     * @param {object} manager - Manager/approver data
     * @param {string} comment - Revision request comment
     */
    async notifyDCRReturnedForRevision(requester_id, dcr, manager, comment) {
        const message = `Your Document Change Request #${dcr.id} has been returned for revision by ${manager.name}. Comment: ${comment || 'Please review and resubmit'}`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            manager_id: dcr.manager_id,
            comment: comment,
            action: 'revision_required'
        };
        return this.createNotification(requester_id, 'DCR_RETURNED_FOR_REVISION', message, metadata);
    },

    async notifyDCRRejectedByRole(requester_id, dcr, actor, actorLabel, comment) {
        const message = `Your Document Change Request #${dcr.id} has been rejected by ${actorLabel} (${actor?.name || '-' }). Reason: ${comment || 'No reason provided'}`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            actor_id: actor?.id || null,
            actor_role: actorLabel,
            comment,
            action: 'resubmit_required'
        };
        return this.createNotification(requester_id, 'DCR_REJECTED', message, metadata);
    },

    async notifyDCRDcApproved(requester_id, dcr, downloadLink, actor) {
        const message = downloadLink
            ? `Your Document Change Request #${dcr.id} has been approved by Document Control (${actor?.name || '-'}). Download the current source file here: ${downloadLink}`
            : `Your Document Change Request #${dcr.id} has been approved by Document Control (${actor?.name || '-'}). Please upload revised source and PDF files.`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            actor_id: actor?.id || null,
            download_link: downloadLink,
            action: 'upload_revision_required'
        };
        return this.createNotification(requester_id, 'DCR_DC_APPROVED', message, metadata);
    },

    async notifyDCRNeedsCheckerDecision(checker_id, dcr, requester) {
        const message = `DCR #${dcr.id} for document "${dcr.document_title || 'Document'}" has revised files uploaded by ${requester?.name || 'requester'} and needs your checker decision.`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            requester_id: dcr.requester_id,
            action: 'checker_decision_required'
        };
        return this.createNotification(checker_id, 'DCR_CHECKER_REVIEW_REQUIRED', message, metadata);
    },

    async notifyDCRNeedsApproverDecision(approver_id, dcr, checkerActor) {
        const message = `DCR #${dcr.id} has been approved by checker ${checkerActor?.name || '-'} and now needs your approver decision.`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            checker_id: checkerActor?.id || null,
            action: 'approver_decision_required'
        };
        return this.createNotification(approver_id, 'DCR_APPROVER_REVIEW_REQUIRED', message, metadata);
    },

    async notifyDCRPendingDcFinal(dcr, approverActor) {
        const controllerIds = await this.getDocumentControllerUserIds();
        if (!controllerIds.length) return [];

        return Promise.all(
            controllerIds.map((controllerId) => this.createNotification(
                controllerId,
                'DCR_DC_FINAL_REQUIRED',
                `DCR #${dcr.id} was approved by ${approverActor?.name || '-'} and requires final Document Control release decision.`,
                {
                    cr_id: dcr.id,
                    document_id: dcr.document_id,
                    approver_id: approverActor?.id || null,
                    action: 'dc_final_decision_required'
                }
            ))
        );
    },

    async notifyDCRReturnedByRole(requester_id, dcr, actor, actorLabel, comment) {
        const message = `DCR #${dcr.id} was returned by ${actorLabel} (${actor?.name || '-'}). Comment: ${comment || 'Please revise and resubmit.'}`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            actor_id: actor?.id || null,
            actor_role: actorLabel,
            comment,
            action: 'revision_required'
        };
        return this.createNotification(requester_id, 'DCR_RETURNED_FOR_REVISION', message, metadata);
    },

    async notifyDCRDeleteRequested(dcr, requester, reason) {
        const adminIds = await this.getAdminUserIds();
        if (!adminIds.length) return [];

        const message = `Delete request for DCR #${dcr.id} by ${requester?.name || 'Requester'} (${requester?.employee_code || '-' }). Reason: ${reason || 'No reason provided'}`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            requester_id: dcr.requester_id,
            reason: reason || null,
            action: 'delete_request_review'
        };

        return this.notifyUsers(adminIds, 'DCR_DELETE_REQUESTED', message, metadata);
    },

    async notifyDCRDeleted(userIds, dcr, actor, reason, previousStatus) {
        const message = `DCR #${dcr.id} was deleted by ${actor?.name || 'Admin'}. Reason: ${reason || 'No reason provided'}`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            actor_id: actor?.id || null,
            previous_status: previousStatus || null,
            reason: reason || null,
            action: 'deleted'
        };

        return this.notifyUsers(userIds, 'DCR_DELETED', message, metadata);
    },

    async notifyDCRClosed(userIds, dcr, requester, reason) {
        const message = `DCR #${dcr.id} was closed by ${requester?.name || 'Requester'}. Reason: ${reason || 'No reason provided'}`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            requester_id: dcr.requester_id,
            reason: reason || null,
            action: 'closed'
        };

        return this.notifyUsers(userIds, 'DCR_CLOSED', message, metadata);
    },

    async notifyDCRDeleteRequested(dcr, requester, reason) {
        const adminIds = await this.getAdminUserIds();
        if (!adminIds.length) return [];

        const message = `Delete request for DCR #${dcr.id} by ${requester?.name || 'Requester'} (${requester?.employee_code || '-' }). Reason: ${reason || 'No reason provided'}`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            requester_id: dcr.requester_id,
            reason: reason || null,
            action: 'delete_request_review'
        };

        return this.notifyUsers(adminIds, 'DCR_DELETE_REQUESTED', message, metadata);
    },

    async notifyDCRDeleted(userIds, dcr, actor, reason, previousStatus) {
        const message = `DCR #${dcr.id} was deleted by ${actor?.name || 'Admin'}. Reason: ${reason || 'No reason provided'}`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            actor_id: actor?.id || null,
            previous_status: previousStatus || null,
            reason: reason || null,
            action: 'deleted'
        };

        return this.notifyUsers(userIds, 'DCR_DELETED', message, metadata);
    },

    async notifyDCRClosed(userIds, dcr, requester, reason) {
        const message = `DCR #${dcr.id} was closed by ${requester?.name || 'Requester'}. Reason: ${reason || 'No reason provided'}`;
        const metadata = {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            requester_id: dcr.requester_id,
            reason: reason || null,
            action: 'closed'
        };

        return this.notifyUsers(userIds, 'DCR_CLOSED', message, metadata);
    },

    /**
     * Get all notifications for a user
     * @param {number} user_id - User ID
     * @param {boolean} unread_only - Get only unread notifications
     */
    async getNotifications(user_id, unread_only = false) {
        try {
            await ensureNotificationSchemaCompatibility();
            let sql = 'SELECT * FROM Notification WHERE user_id = ?';
            if (unread_only) {
                sql += ' AND is_read = 0';
            }
            sql += ' ORDER BY created_at DESC';
            const notifications = await all(sql, [user_id]);
            return notifications || [];
        } catch (error) {
            console.error('Error fetching notifications:', error.message);
            return [];
        }
    },

    /**
     * Mark notification as read
     * @param {number} notification_id - Notification ID
     */
    async markAsRead(notification_id) {
        try {
            await ensureNotificationSchemaCompatibility();
            const sql = 'UPDATE Notification SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE id = ?';
            await run(sql, [notification_id]);
            return true;
        } catch (error) {
            console.error('Error marking notification as read:', error.message);
            return false;
        }
    },

    /**
     * Mark all notifications as read for a user
     * @param {number} user_id - User ID
     */
    async markAllAsRead(user_id) {
        try {
            await ensureNotificationSchemaCompatibility();
            const sql = 'UPDATE Notification SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0';
            await run(sql, [user_id]);
            return true;
        } catch (error) {
            console.error('Error marking all notifications as read:', error.message);
            return false;
        }
    }
};

module.exports = notificationService;
