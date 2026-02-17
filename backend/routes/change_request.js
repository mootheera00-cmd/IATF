const express = require('express');
const router = express.Router();
const authRouter = require('./auth');
const authRequired = authRouter.authRequired;
const requireRole = authRouter.requireRole;

// Create Change Request
router.post('/', authRequired, requireRole(['CHANGE_REQUESTER', 'ADMIN']), (req, res) => {
    const db = req.app.locals.db;
    const { document_id, reason, impact } = req.body;

    const sql = `
        INSERT INTO change_requests (document_id, requester_id, reason, impact, status)
        VALUES (?, ?, ?, ?, 'CR_SUBMITTED')
    `;
    db.run(sql, [document_id, req.user.id, reason, impact], function(err) {
        if (err) return res.status(500).json({ message: "Error creating change request" });
        res.json({ message: "Change request submitted", id: this.lastID });
    });
});

// Review Change Request
router.post('/:id/review', authRequired, requireRole(['REVIEWER', 'PROCESS_OWNER', 'ADMIN']), (req, res) => {
    const db = req.app.locals.db;
    const crId = req.params.id;
    db.run("UPDATE change_requests SET status='CR_REVIEWED', reviewer_id=? WHERE id=?", [req.user.id, crId], function(err) {
        if (err) return res.status(500).json({ message: "Error reviewing change request" });
        res.json({ message: "Change request reviewed" });
    });
});

// Approve Change Request
router.post('/:id/approve', authRequired, requireRole(['APPROVER', 'ADMIN']), (req, res) => {
    const db = req.app.locals.db;
    const crId = req.params.id;
    db.run("UPDATE change_requests SET status='CR_APPROVED', approver_id=? WHERE id=?", [req.user.id, crId], function(err) {
        if (err) return res.status(500).json({ message: "Error approving change request" });
        res.json({ message: "Change request approved" });
    });
});

// Release Change Request
router.post('/:id/release', authRequired, requireRole(['DOCUMENT_CONTROL', 'ADMIN']), (req, res) => {
    const db = req.app.locals.db;
    const crId = req.params.id;
    db.run("UPDATE change_requests SET status='CR_RELEASED' WHERE id=?", [crId], function(err) {
        if (err) return res.status(500).json({ message: "Error releasing change request" });
        res.json({ message: "Change request released" });
    });
});

module.exports = router;
