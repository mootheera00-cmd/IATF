// routes/training.js
const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');

// Helper: ensure TrainingRecord table exists
function ensureTable(db, cb) {
  db.run(
    `CREATE TABLE IF NOT EXISTS TrainingRecord (
       id             INTEGER PRIMARY KEY AUTOINCREMENT,
       employee_id    INTEGER NOT NULL,
       training_title TEXT NOT NULL,
       training_type  TEXT DEFAULT 'General',
       training_date  TEXT NOT NULL,
       due_date       TEXT,
       trainer        TEXT,
       notes          TEXT,
       status         TEXT DEFAULT 'Pending',
       created_by     INTEGER,
       created_at     TEXT DEFAULT (datetime('now')),
       updated_at     TEXT DEFAULT (datetime('now')),
       FOREIGN KEY (employee_id) REFERENCES users(id),
       FOREIGN KEY (created_by)  REFERENCES users(id)
     )`,
    cb
  );
}

// ─── GET all training records ────────────────────────────────────────────────
router.get('/', authRequired, (req, res) => {
  const db = req.db;
  ensureTable(db, () => {
    db.all(
      `SELECT tr.*, u.name AS employee_name, u.employee_code, r.name AS role_name,
              creator.name AS created_by_name
       FROM TrainingRecord tr
       LEFT JOIN users u ON tr.employee_id = u.id
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN users creator ON tr.created_by = creator.id
       ORDER BY tr.training_date DESC`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ records: rows || [] });
      }
    );
  });
});

// ─── GET training summary per employee ──────────────────────────────────────
router.get('/summary', authRequired, (req, res) => {
  const db = req.db;
  ensureTable(db, () => {
    db.all(
      `SELECT u.id AS employee_id, u.name AS employee_name, u.employee_code,
              r.name AS role_name,
              COUNT(tr.id)                                                AS total_trainings,
              SUM(CASE WHEN tr.status = 'Completed' THEN 1 ELSE 0 END)   AS completed,
              SUM(CASE WHEN tr.status = 'Pending'   THEN 1 ELSE 0 END)   AS pending,
              SUM(CASE WHEN tr.status = 'Overdue'   THEN 1 ELSE 0 END)   AS overdue,
              MAX(tr.training_date)                                       AS last_training_date
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN TrainingRecord tr ON tr.employee_id = u.id
       WHERE COALESCE(u.is_active, 1) = 1
       GROUP BY u.id
       ORDER BY u.name ASC`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ summary: rows || [] });
      }
    );
  });
});

// ─── CREATE training record ──────────────────────────────────────────────────
router.post('/', authRequired, (req, res) => {
  const db = req.db;
  const { employee_id, training_title, training_type, training_date, due_date, trainer, notes } = req.body;
  if (!employee_id || !training_title || !training_date) {
    return res.status(400).json({ error: 'employee_id, training_title, and training_date are required.' });
  }
  const created_by = req.user?.id;
  ensureTable(db, () => {
    db.run(
      `INSERT INTO TrainingRecord (employee_id, training_title, training_type, training_date, due_date, trainer, notes, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
      [employee_id, training_title, training_type || 'General', training_date, due_date || null, trainer || null, notes || null, created_by],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Training record created', id: this.lastID });
      }
    );
  });
});

// ─── UPDATE training record ───────────────────────────────────────────────────
router.put('/:id', authRequired, (req, res) => {
  const db = req.db;
  const { training_title, training_type, training_date, due_date, trainer, notes, status } = req.body;
  db.run(
    `UPDATE TrainingRecord SET
       training_title = COALESCE(?, training_title),
       training_type  = COALESCE(?, training_type),
       training_date  = COALESCE(?, training_date),
       due_date       = COALESCE(?, due_date),
       trainer        = COALESCE(?, trainer),
       notes          = COALESCE(?, notes),
       status         = COALESCE(?, status),
       updated_at     = datetime('now')
     WHERE id = ?`,
    [training_title, training_type, training_date, due_date, trainer, notes, status, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Updated', changes: this.changes });
    }
  );
});

// ─── DELETE training record ───────────────────────────────────────────────────
router.delete('/:id', authRequired, (req, res) => {
  const db = req.db;
  db.run(`DELETE FROM TrainingRecord WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deleted', changes: this.changes });
  });
});

module.exports = router;
