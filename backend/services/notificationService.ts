// backend/services/notificationService.ts
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const dbCandidates = [
  path.resolve(__dirname, '..', '..', 'db', 'nskiatf_doccontrol.db'),
  path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db'),
  path.resolve(process.cwd(), 'db', 'nskiatf_doccontrol.db')
];
const dbPath = dbCandidates.find((candidate: string) => fs.existsSync(candidate)) || dbCandidates[0];
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

let mailTransporter: any = null;

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
        pass: smtpPass
      }
    });
  }
  return mailTransporter;
}

// Promisify db operations
const run = (sql: string, params?: any[]) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err: any) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const get = (sql: string, params?: any[]) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err: any, row: any) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const all = (sql: string, params?: any[]) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

let notificationSchemaReady = false;

async function ensureNotificationSchemaCompatibility() {
  if (notificationSchemaReady) return;

  const notificationTable: any = await get(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='Notification'`,
    []
  );
  if (!notificationTable) {
    await run(
      `CREATE TABLE IF NOT EXISTS Notification (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT,
        related_cr_id INTEGER,
        message TEXT,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (related_cr_id) REFERENCES ChangeRequest(id)
      )`,
      []
    );
  }

  const cols = (await all(`PRAGMA table_info(Notification)`, [])) as any[];
  const has = (name: string) => cols.some((c: any) => c.name === name);

  if (!has('metadata')) {
    await run(`ALTER TABLE Notification ADD COLUMN metadata TEXT`, []);
  }
  if (!has('read_at')) {
    await run(`ALTER TABLE Notification ADD COLUMN read_at TIMESTAMP NULL`, []);
  }

  notificationSchemaReady = true;
}

const notificationService = {
  async sendEmail(to: any, subject: any, text: any) {
    const transporter = getMailTransporter();
    if (!transporter) {
      return { sent: false, reason: 'smtp_not_configured' };
    }

    try {
      const info = await transporter.sendMail({
        from: smtpFrom,
        to,
        subject,
        text
      });

      return { sent: true, messageId: info.messageId || null };
    } catch (error: any) {
      console.error('Error sending email notification:', error.message);
      return { sent: false, reason: error.message };
    }
  },

  async getDocumentControllerContacts() {
    try {
      const rows = (await all(
        `SELECT u.id, u.name, u.email
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE COALESCE(u.is_active, 1) = 1
                   AND UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) IN ('DOCUMENT_CONTROLLER', 'DOCUMENT_CONTROL')`,
        []
      )) as any[];

      return rows || [];
    } catch (error: any) {
      console.error('Error finding Document Controller contacts:', error.message);
      return [];
    }
  },

  async getDocumentControllerUserIds() {
    try {
      const rows = (await all(
        `SELECT u.id
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE COALESCE(u.is_active, 1) = 1
                   AND UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) IN ('DOCUMENT_CONTROLLER', 'DOCUMENT_CONTROL')`,
        []
      )) as any[];

      return (rows || []).map((row) => row.id).filter(Boolean);
    } catch (error: any) {
      console.error('Error finding Document Controller users:', error.message);
      return [];
    }
  },

  async getAdminUserIds() {
    try {
      const rows = (await all(
        `SELECT u.id
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE COALESCE(u.is_active, 1) = 1
                   AND UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) = 'ADMIN'`,
        []
      )) as any[];

      return (rows || []).map((row) => row.id).filter(Boolean);
    } catch (error: any) {
      console.error('Error finding Admin users:', error.message);
      return [];
    }
  },

  async notifyUsers(userIds: any[], type: any, message: any, metadata: any = {}) {
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
  async createNotification(user_id: any, type: any, message: any, metadata: any = {}) {
    try {
      await ensureNotificationSchemaCompatibility();
      const sql = `
                INSERT INTO Notification (user_id, type, message, metadata, created_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;
      const result: any = await run(sql, [user_id, type, message, JSON.stringify(metadata)]);
      console.log(`✓ Notification created: User ${user_id}, Type: ${type}`);
      return result.lastID;
    } catch (error: any) {
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
  async notifyDCRSubmitted(manager_id: any, dcr: any, requester: any) {
    const message = `Document Change Request #${dcr.id} submitted by ${requester.name} for document "${dcr.document_title || 'Document'}"`;
    const metadata = {
      cr_id: dcr.id,
      document_id: dcr.document_id,
      requester_id: dcr.requester_id,
      action: 'review_required'
    };
    return this.createNotification(manager_id, 'DCR_SUBMITTED', message, metadata);
  },

  async notifyDCRSubmittedToDocumentControllers(dcr: any, requester: any) {
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
      controllers.map((controller: any) => this.createNotification(controller.id, 'DCR_SUBMITTED', message, metadata))
    );

    const emailSubject = `[IATF] DCR #${dcr.id} requires Document Controller review`;
    const emailBody = `${message}\n\nPlease review in the system.`;

    const emailResults = await Promise.all(
      controllers
        .filter((controller: any) => String(controller.email || '').includes('@'))
        .map((controller: any) => this.sendEmail(controller.email, emailSubject, emailBody))
    );

    return {
      notifications: notificationResults,
      emails: emailResults
    };
  },

  /**
   * Send DCR pre-approval notification to requester
   * @param {number} requester_id - Requester to notify
   * @param {object} dcr - Document Change Request data
   * @param {string} downloadLink - Link to download source file
   * @param {object} manager - Manager/approver data
   */
  async notifyDCRPreApproved(requester_id: any, dcr: any, downloadLink: any, manager: any) {
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
  async notifyDCRRejected(requester_id: any, dcr: any, manager: any, comment: any) {
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
  async notifyRevisionUploaded(manager_id: any, dcr: any, requester: any) {
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
  async notifyDCRApproved(requester_id: any, dcr: any, manager: any) {
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
  async notifyDCRReturnedForRevision(requester_id: any, dcr: any, manager: any, comment: any) {
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

  async notifyDCRRejectedByRole(requester_id: any, dcr: any, actor: any, actorLabel: any, comment: any) {
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

  async notifyDCRDcApproved(requester_id: any, dcr: any, downloadLink: any, actor: any) {
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

  async notifyDCRNeedsCheckerDecision(checker_id: any, dcr: any, requester: any) {
    const message = `DCR #${dcr.id} for document "${dcr.document_title || 'Document'}" has revised files uploaded by ${requester?.name || 'requester'} and needs your checker decision.`;
    const metadata = {
      cr_id: dcr.id,
      document_id: dcr.document_id,
      requester_id: dcr.requester_id,
      action: 'checker_decision_required'
    };
    return this.createNotification(checker_id, 'DCR_CHECKER_REVIEW_REQUIRED', message, metadata);
  },

  async notifyDCRNeedsApproverDecision(approver_id: any, dcr: any, checkerActor: any) {
    const message = `DCR #${dcr.id} has been approved by checker ${checkerActor?.name || '-'} and now needs your approver decision.`;
    const metadata = {
      cr_id: dcr.id,
      document_id: dcr.document_id,
      checker_id: checkerActor?.id || null,
      action: 'approver_decision_required'
    };
    return this.createNotification(approver_id, 'DCR_APPROVER_REVIEW_REQUIRED', message, metadata);
  },

  async notifyDCRNonSignPdfRequired(requester_id: any, dcr: any, approverActor: any) {
    const message = `DCR #${dcr.id} for document "${dcr.document_title || 'Document'}" was approved by ${approverActor?.name || '-'} and now requires your non-signed PDF upload.`;
    const metadata = {
      cr_id: dcr.id,
      document_id: dcr.document_id,
      approver_id: approverActor?.id || null,
      action: 'non_signed_pdf_required'
    };
    return this.createNotification(requester_id, 'DCR_NON_SIGN_PDF_REQUIRED', message, metadata);
  },

  async notifyReuploadRequested(assignee_id: any, dcr: any, requester: any) {
    const message = `Re-upload request for document "${dcr.document_title || 'Document'}" (DCR #${dcr.id}) was created by ${requester?.name || 'Requester'}. Please upload the updated files.`;
    const metadata = {
      cr_id: dcr.id,
      document_id: dcr.document_id,
      requested_by: requester?.id || null,
      action: 'reupload_required'
    };
    return this.createNotification(assignee_id, 'DCR_REUPLOAD_REQUESTED', message, metadata);
  },

  async notifyReuploadCompleted(userIds: any[], dcr: any, actor: any) {
    const message = `Re-upload request #${dcr.id} was approved by Document Control (${actor?.name || '-'}).`;
    const metadata = {
      cr_id: dcr.id,
      document_id: dcr.document_id,
      actor_id: actor?.id || null,
      action: 'reupload_completed'
    };
    return this.notifyUsers(userIds, 'DCR_REUPLOAD_COMPLETED', message, metadata);
  },

  async notifyDCRPendingDcFinal(dcr: any, approverActor: any) {
    const controllerIds = await this.getDocumentControllerUserIds();
    if (!controllerIds.length) return [];

    return Promise.all(
      controllerIds.map((controllerId: any) =>
        this.createNotification(
          controllerId,
          'DCR_DC_FINAL_REQUIRED',
          `DCR #${dcr.id} was approved by ${approverActor?.name || '-'} and requires final Document Control release decision.`,
          {
            cr_id: dcr.id,
            document_id: dcr.document_id,
            approver_id: approverActor?.id || null,
            action: 'dc_final_decision_required'
          }
        )
      )
    );
  },

  async notifyDCRReturnedByRole(requester_id: any, dcr: any, actor: any, actorLabel: any, comment: any) {
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

  async notifyDCRDeleteRequested(dcr: any, requester: any, reason: any) {
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

  async notifyDCRDeleted(userIds: any[], dcr: any, actor: any, reason: any, previousStatus: any) {
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

  async notifyDCRClosed(userIds: any[], dcr: any, requester: any, reason: any) {
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
  async getNotifications(user_id: any, unread_only = false) {
    try {
      await ensureNotificationSchemaCompatibility();
      let sql = 'SELECT * FROM Notification WHERE user_id = ?';
      if (unread_only) {
        sql += ' AND is_read = 0';
      }
      sql += ' ORDER BY created_at DESC';
      const notifications = (await all(sql, [user_id])) as any[];
      return notifications || [];
    } catch (error: any) {
      console.error('Error fetching notifications:', error.message);
      return [];
    }
  },

  /**
   * Mark notification as read
   * @param {number} notification_id - Notification ID
   */
  async markAsRead(notification_id: any) {
    try {
      await ensureNotificationSchemaCompatibility();
      const sql = 'UPDATE Notification SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE id = ?';
      await run(sql, [notification_id]);
      return true;
    } catch (error: any) {
      console.error('Error marking notification as read:', error.message);
      return false;
    }
  },

  /**
   * Mark all notifications as read for a user
   * @param {number} user_id - User ID
   */
  async markAllAsRead(user_id: any) {
    try {
      await ensureNotificationSchemaCompatibility();
      const sql = 'UPDATE Notification SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0';
      await run(sql, [user_id]);
      return true;
    } catch (error: any) {
      console.error('Error marking all notifications as read:', error.message);
      return false;
    }
  }
};

export = notificationService;
