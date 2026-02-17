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

    // In a real system, you'd look up the manager based on department, etc.
    // For now, let's assume a manager is assigned or we'll pick one.
    // This part of the logic is complex and depends on business rules.
    // Let's just notify a hardcoded manager (e.g., user with ID 2) for now.
    const manager_id = 2; 

    await run(`UPDATE ChangeRequest SET status = 'Submitted', manager_id = ? WHERE id = ?`, [manager_id, cr_id]);
    notificationService.notify(manager_id, `Change Request #${cr_id} has been submitted for your approval.`);
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
        } else if (decision === 'Pre-Approve') {
            await run(`UPDATE ChangeRequest SET status = 'Pre-Approved', preapproved_at = CURRENT_TIMESTAMP WHERE id = ?`, [cr_id]);
            
            const doc = await get(`SELECT d.*, dr.original_uri FROM Document d JOIN DocumentRevision dr ON d.current_revision_id = dr.id WHERE d.id = ?`, [cr.document_id]);
            if (!doc || !doc.original_uri) throw new Error('Could not find original file for the latest revision.');
            
            const downloadLink = await signedUrlService.generateSignedUrl(cr_id, cr.document_id, cr.requester_id, doc.original_uri);

            await run(`INSERT INTO ApprovalRecord (cr_id, step, decision, decided_by, decided_by_role, comment) VALUES (?, 'GateA', 'Approve', ?, 'Manager', ?)`, [cr_id, manager_id, comment]);
            notificationService.notify(cr.requester_id, `Your Change Request #${cr_id} has been pre-approved. You can download the source file here: ${downloadLink}`);
            return { message: 'Change request pre-approved.', downloadLink };
        } else {
            throw new Error('Invalid decision.');
        }
    },

    async uploadRevision(cr_id, requester_id, files) {
        const cr = await get(`SELECT * FROM ChangeRequest WHERE id = ? AND requester_id = ? AND (status = 'Pre-Approved' OR status = 'Returned for Revision')`, [cr_id, requester_id]);
        if (!cr) throw new Error('Change Request not found or not in a state to accept uploads.');

        const sourceFile = files.source[0];
        const pdfFile = files.pdf[0];

        // In a real implementation, you would move these files to a secure location and get their URIs
        const original_uri = sourceFile.path;
        const pdf_uri = pdfFile.path;

        const revResult = await run(`INSERT INTO DocumentRevision (document_id, rev_code, status, original_uri, pdf_uri, created_by) VALUES (?, ?, 'Working', ?, ?, ?)`, [cr.document_id, 'NewRev', requester_id, original_uri, pdf_uri]);
        const newRevisionId = revResult.lastID;

        await run(`UPDATE ChangeRequest SET status = 'Pending Approval', latest_working_revision_id = ? WHERE id = ?`, [newRevisionId, cr_id]);
        notificationService.notify(cr.manager_id, `New revision for Change Request #${cr_id} has been uploaded and is pending your final approval.`);
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
  }
};

module.exports = dcrService;
