// routes/changeRequests.js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { logAction } = require('../middleware/audit');

// Create change request
router.post('/request', authRequired, (req, res) => {
  const db = req.db;
  const { document_id, reason } = req.body;
  const requester_id = req.user.id;
  const sql = `INSERT INTO change_requests (document_id, requester_id, reason) VALUES (?, ?, ?)`;
  db.run(sql, [document_id, requester_id, reason], function(err) {
    if (err) {
      console.error('create change request error', err);
      return res.status(500).json({ message: 'DB error' });
    }
    const changeId = this.lastID;
    logAction(db, requester_id, 'REQUEST_CHANGE', 'change_request', changeId, reason);
    // TODO: notify manager(s) via notifications table / socket
    res.json({ message: 'Change request created', change_request_id: changeId });
  });
});

// Manager decision (approve/reject)
router.post('/:id/decision', authRequired, requireRole('MANAGER','QMR'), (req, res) => {
  const db = req.db;
  const changeId = req.params.id;
  const { decision, note } = req.body; // decision: APPROVED or REJECTED
  const managerId = req.user.id;
  const sql = `UPDATE change_requests SET manager_id = ?, manager_decision = ?, manager_decision_at = CURRENT_TIMESTAMP, status = ? WHERE id = ?`;
  const status = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
  db.run(sql, [managerId, decision, status, changeId], function(err) {
    if (err) {
      console.error('manager decision error', err);
      return res.status(500).json({ message: 'DB error' });
    }
    logAction(db, managerId, `MANAGER_${decision}`, 'change_request', changeId, note || '');
    // TODO: notify requester
    res.json({ message: `Change request ${decision.toLowerCase()}` });
  });
});

module.exports = router;
