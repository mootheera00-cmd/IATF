// routes/workflow.js (แก้ให้ใช้ req.db)
const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const { logAction } = require('../middleware/audit');

// Submit Document (Draft)
router.post('/submit', authRequired, (req, res) => {
  const db = req.db;
  const { document_id } = req.body;

  db.run(
    `INSERT INTO workflow (document_id, status, updated_by) VALUES (?, ?, ?)`,
    [document_id, 'DRAFT', req.user.id],
    function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });

      logAction(db, req.user.id, 'SUBMIT_WORKFLOW', 'workflow', this.lastID, `Document ${document_id} submitted`);
      
      res.json({ message: 'Document submitted to workflow', workflow_id: this.lastID });
    }
  );
});

// Review Document
router.post('/review', authRequired, (req, res) => {
  const db = req.db;
  const { document_id, decision } = req.body; // APPROVE / REJECT

  db.run(
    `UPDATE workflow SET status = ?, updated_by = ? WHERE document_id = ?`,
    [decision === 'APPROVE' ? 'REVIEWED' : 'REJECTED', req.user.id, document_id],
    function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });

      logAction(db, req.user.id, 'REVIEW_WORKFLOW', 'workflow', document_id, `Document ${document_id} reviewed`);

      res.json({ message: `Document ${decision.toLowerCase()} by reviewer` });
    }
  );
});

// Approve Document (QMR)
router.post('/approve', authRequired, (req, res) => {
  const db = req.db;
  const { document_id, decision } = req.body;

  db.run(
    `UPDATE workflow SET status = ?, updated_by = ? WHERE document_id = ?`,
    [decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', req.user.id, document_id],
    function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });

      logAction(db, req.user.id, 'APPROVE_WORKFLOW', 'workflow', document_id, `Document ${document_id} approved`);

      res.json({ message: `Document ${decision.toLowerCase()} by QMR` });
    }
  );
});

// Check Workflow Status
router.get('/status/:id', authRequired, (req, res) => {
  const db = req.db;
  const docId = req.params.id;

  db.get(
    `SELECT * FROM workflow WHERE document_id = ? ORDER BY updated_at DESC LIMIT 1`,
    [docId],
    (err, row) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (!row) return res.status(404).json({ message: 'Workflow not found' });
      res.json(row);
    }
  );
});

module.exports = router;
