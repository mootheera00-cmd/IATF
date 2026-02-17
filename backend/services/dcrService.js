// backend/services/dcrService.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbPath);
const signedUrlService = require('./signedUrlService');

// Promisify db.run and db.get
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


// TODO: Implement a more robust notification system
const notificationService = {
  notify: (user_id, message) => {
    console.log(`Notification for user ${user_id}: ${message}`);
  }
};

const dcrService = {
  async createChangeRequest(document_id, requester_id, reason) {
    const sql = `INSERT INTO ChangeRequest (document_id, requester_id, reason, status) VALUES (?, ?, ?, 'Draft')`;
    const result = await run(sql, [document_id, requester_id, reason]);
    return result.lastID;
  },

  async submitChangeRequest(cr_id, requester_id) {
    const cr = await get(`SELECT * FROM ChangeRequest WHERE id = ? AND requester_id = ? AND status = 'Draft'`, [cr_id, requester_id]);
    if (!cr) throw new Error('Change Request not found or not in draft state.');

    // Get the document's owning department to find the appropriate manager
    const doc = await get(`SELECT owning_department FROM Document WHERE id = ?`, [cr.document_id]);
    
    // For now, assign to any manager. In production, this would use department-based logic
    const manager = await get(`SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name IN ('MANAGER', 'QMR') LIMIT 1`);
    
    if (!manager) {
      throw new Error('No manager found to assign the change request.');
    }
    
    const manager_id = manager.id;

    await run(`UPDATE ChangeRequest SET status = 'Submitted', manager_id = ?, submitted_at = CURRENT_TIMESTAMP WHERE id = ?`, [manager_id, cr_id]);
    notificationService.notify(manager_id, `Change Request #${cr_id} has been submitted for your approval.`);
    
    return { message: 'Change request submitted successfully', manager_id };
  },

    async makeInitialDecision(cr_id, manager_id, decision, comment) {
        const cr = await get(`SELECT * FROM ChangeRequest WHERE id = ? AND manager_id = ? AND status = 'Submitted'`, [cr_id, manager_id]);
        if (!cr) throw new Error('Change Request not found or not pending your approval.');

        if (decision === 'Reject') {
            await run(`UPDATE ChangeRequest SET status = 'Rejected', rejected_at = CURRENT_TIMESTAMP WHERE id = ?`, [cr_id]);
            // Record in audit
            await run(`INSERT INTO ApprovalRecord (cr_id, step, decision, decided_by, decided_by_role, comment) VALUES (?, 'GateA', 'Reject', ?, 'Manager', ?)`, [cr_id, manager_id, comment]);
            notificationService.notify(cr.requester_id, `Your Change Request #${cr_id} has been rejected.`);
            return { message: 'Change request rejected.' };
        } else if (decision === 'Approve') {
            await run(`UPDATE ChangeRequest SET status = 'Pre-Approved', preapproved_at = CURRENT_TIMESTAMP WHERE id = ?`, [cr_id]);
            
            // Get the latest revision's original file
            const doc = await get(`
                SELECT d.*, dr.original_uri 
                FROM Document d 
                LEFT JOIN DocumentRevision dr ON d.current_revision_id = dr.id 
                WHERE d.id = ?
            `, [cr.document_id]);
            
            if (!doc) throw new Error('Document not found.');
            
            let downloadLink = null;
            if (doc.original_uri) {
                // Generate a signed URL for downloading the original file
                downloadLink = await signedUrlService.generateSignedUrl(cr_id, cr.document_id, cr.requester_id, doc.original_uri);
            }

            await run(`INSERT INTO ApprovalRecord (cr_id, step, decision, decided_by, decided_by_role, comment) VALUES (?, 'GateA', 'Approve', ?, 'Manager', ?)`, [cr_id, manager_id, comment]);
            
            const message = downloadLink 
                ? `Your Change Request #${cr_id} has been approved. You can download the source file to edit.`
                : `Your Change Request #${cr_id} has been approved. You can now upload the revised documents.`;
            
            notificationService.notify(cr.requester_id, message);
            return { message: 'Change request approved. Requester can now edit and upload files.', downloadLink };
        } else {
            throw new Error('Invalid decision. Use "Approve" or "Reject".');
        }
    },

    async uploadRevision(cr_id, requester_id, files) {
        const cr = await get(`SELECT * FROM ChangeRequest WHERE id = ? AND requester_id = ? AND (status = 'Pre-Approved' OR status = 'Returned for Revision')`, [cr_id, requester_id]);
        if (!cr) throw new Error('Change Request not found or not in a state to accept uploads.');

        if (!files.source || !files.source[0]) {
            throw new Error('Source file (Word/Excel) is required.');
        }
        if (!files.pdf || !files.pdf[0]) {
            throw new Error('PDF file is required.');
        }

        const sourceFile = files.source[0];
        const pdfFile = files.pdf[0];

        // Store file paths relative to uploads directory
        const original_uri = `uploads/doc-original/${sourceFile.filename}`;
        const pdf_uri = `uploads/doc-pdf/${pdfFile.filename}`;

        // Get the document info to generate proper revision code
        const doc = await get(`SELECT * FROM Document WHERE id = ?`, [cr.document_id]);
        if (!doc) throw new Error('Document not found.');
        
        // Get the current highest revision to increment
        const currentRev = await get(`
            SELECT rev_code FROM DocumentRevision 
            WHERE document_id = ? 
            ORDER BY id DESC LIMIT 1
        `, [cr.document_id]);
        
        // Generate next revision code (simple incrementing: A -> B -> C, etc.)
        let newRevCode = 'A';
        if (currentRev && currentRev.rev_code) {
            const currentCode = currentRev.rev_code.charCodeAt(0);
            newRevCode = String.fromCharCode(currentCode + 1);
        }

        const revResult = await run(`
            INSERT INTO DocumentRevision 
            (document_id, rev_code, status, original_uri, pdf_uri, created_by) 
            VALUES (?, ?, 'Working', ?, ?, ?)
        `, [cr.document_id, newRevCode, original_uri, pdf_uri, requester_id]);
        
        const newRevisionId = revResult.lastID;

        await run(`UPDATE ChangeRequest SET status = 'Pending Approval', latest_working_revision_id = ? WHERE id = ?`, [newRevisionId, cr_id]);
        notificationService.notify(cr.manager_id, `New revision for Change Request #${cr_id} has been uploaded and is pending your final approval.`);
        
        return { message: 'Files uploaded successfully. Pending final approval.', revision_id: newRevisionId };
    },

    async makeFinalReview(cr_id, manager_id, decision, comment) {
        const cr = await get(`SELECT * FROM ChangeRequest WHERE id = ? AND manager_id = ? AND status = 'Pending Approval'`, [cr_id, manager_id]);
        if (!cr) throw new Error('Change Request not found or not pending your final approval.');

        if (decision === 'Return') {
            await run(`UPDATE ChangeRequest SET status = 'Returned for Revision', returned_at = CURRENT_TIMESTAMP WHERE id = ?`, [cr_id]);
            await run(`INSERT INTO ApprovalRecord (cr_id, step, decision, decided_by, decided_by_role, comment) VALUES (?, 'GateB', 'Return', ?, 'Manager', ?)`, [cr_id, manager_id, comment]);
            notificationService.notify(cr.requester_id, `Your Change Request #${cr_id} has been returned for revision.`);
        } else if (decision === 'Approve') {
            await run(`UPDATE ChangeRequest SET status = 'Approved', final_approved_at = CURRENT_TIMESTAMP WHERE id = ?`, [cr_id]);
            await run(`UPDATE DocumentRevision SET status = 'Released', released_at = CURRENT_TIMESTAMP, released_by = ? WHERE id = ?`, [manager_id, cr.latest_working_revision_id]);

            const doc = await get(`SELECT current_revision_id FROM Document WHERE id = ?`, [cr.document_id]);
            
            await run(`UPDATE Document SET current_revision_id = ? WHERE id = ?`, [cr.latest_working_revision_id, cr.document_id]);
            
            if(doc.current_revision_id) {
                await run(`UPDATE DocumentRevision SET status = 'Obsolete' WHERE id = ?`, [doc.current_revision_id]);
            }

            await run(`INSERT INTO ApprovalRecord (cr_id, step, decision, decided_by, decided_by_role, comment) VALUES (?, 'GateB', 'Approve', ?, 'Manager', ?)`, [cr_id, manager_id, comment]);
            notificationService.notify(cr.requester_id, `Your Change Request #${cr_id} has been approved and the document is released.`);
        } else {
            throw new Error('Invalid decision.');
        }
    },

  async getChangeRequest(cr_id) {
    const cr = await get(`SELECT * FROM ChangeRequest WHERE id = ?`, [cr_id]);
    if (!cr) return null;
    const revisions = await all(`SELECT * FROM DocumentRevision WHERE document_id = ? ORDER BY id DESC`, [cr.document_id]);
    return { ...cr, revisions };
  },

  async listChangeRequests(filters = {}) {
    let sql = `
      SELECT cr.*, 
             d.doc_number, d.title as document_title,
             u1.name as requester_name,
             u2.name as manager_name
      FROM ChangeRequest cr
      JOIN Document d ON cr.document_id = d.id
      JOIN users u1 ON cr.requester_id = u1.id
      LEFT JOIN users u2 ON cr.manager_id = u2.id
      WHERE 1=1
    `;
    const params = [];
    
    if (filters.status) {
      sql += ` AND cr.status = ?`;
      params.push(filters.status);
    }
    if (filters.requester_id) {
      sql += ` AND cr.requester_id = ?`;
      params.push(filters.requester_id);
    }
    if (filters.manager_id) {
      sql += ` AND cr.manager_id = ?`;
      params.push(filters.manager_id);
    }
    
    sql += ` ORDER BY cr.id DESC`;
    
    const crs = await all(sql, params);
    return crs;
  },

  async getRevision(revision_id) {
    const revision = await get(`SELECT * FROM DocumentRevision WHERE id = ?`, [revision_id]);
    return revision;
  }
};

module.exports = dcrService;
