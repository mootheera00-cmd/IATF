// routes/calibration.js
const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');

// Helper: ensure CalibrationEquipment table exists (all 17 Excel columns supported)
function ensureTable(db, cb) {
  db.run(
    `CREATE TABLE IF NOT EXISTS CalibrationEquipment (
       id                   INTEGER PRIMARY KEY AUTOINCREMENT,
       equipment_name       TEXT NOT NULL,
       equipment_id         TEXT NOT NULL UNIQUE,
       equipment_type       TEXT DEFAULT 'Instrument',
       manufacturer         TEXT,
       model                TEXT,
       serial_number        TEXT,
       phone                TEXT,
       fax                  TEXT,
       receive_date         TEXT,
       location             TEXT,
       calibration_method   TEXT,
       calibration_interval TEXT,
       calibrated_by        TEXT,
       acceptance_criteria  TEXT,
       calibration_date     TEXT,
       next_due_date        TEXT NOT NULL,
       certificate_number   TEXT,
       status               TEXT DEFAULT 'Active',
       notes                TEXT,
       created_by           INTEGER,
       created_at           TEXT DEFAULT (datetime('now')),
       updated_at           TEXT DEFAULT (datetime('now')),
       FOREIGN KEY (created_by) REFERENCES users(id)
     )`,
    (err) => {
      if (err) return cb(err);
      // Migrate: add new columns to existing tables that may not have them
      const newCols = [
        ['phone',               'TEXT'],
        ['fax',                 'TEXT'],
        ['receive_date',        'TEXT'],
        ['calibration_method',  'TEXT'],
        ['calibration_interval','TEXT'],
        ['acceptance_criteria', 'TEXT'],
      ];
      let pending = newCols.length;
      if (pending === 0) return cb();
      newCols.forEach(([col, type]) => {
        db.run(`ALTER TABLE CalibrationEquipment ADD COLUMN ${col} ${type}`, () => {
          // ignore "duplicate column" errors — that's expected on re-run
          if (--pending === 0) cb();
        });
      });
    }
  );
}

// ─── GET all equipment ───────────────────────────────────────────────────────
router.get('/', authRequired, (req, res) => {
  const db = req.db;
  ensureTable(db, () => {
    const today = new Date().toISOString().split('T')[0];
    const soon  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    db.all(
      `SELECT *,
        CASE
          WHEN next_due_date < ? THEN 'Overdue'
          WHEN next_due_date <= ? THEN 'Due Soon'
          ELSE 'OK'
        END AS calibration_status
       FROM CalibrationEquipment
       WHERE status != 'Retired'
       ORDER BY next_due_date ASC`,
      [today, soon],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ equipment: rows || [] });
      }
    );
  });
});

// ─── GET summary stats ───────────────────────────────────────────────────────
router.get('/stats', authRequired, (req, res) => {
  const db = req.db;
  ensureTable(db, () => {
    const today = new Date().toISOString().split('T')[0];
    const soon  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    db.all(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN next_due_date < ? THEN 1 ELSE 0 END) AS overdue,
         SUM(CASE WHEN next_due_date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS due_soon,
         SUM(CASE WHEN next_due_date > ? THEN 1 ELSE 0 END) AS ok
       FROM CalibrationEquipment WHERE status != 'Retired'`,
      [today, today, soon, soon],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ stats: rows[0] || { total: 0, overdue: 0, due_soon: 0, ok: 0 } });
      }
    );
  });
});

// ─── CREATE equipment ────────────────────────────────────────────────────────
router.post('/', authRequired, (req, res) => {
  const db = req.db;
  const {
    equipment_name, equipment_id, equipment_type, manufacturer, model,
    serial_number, phone, fax, receive_date, location,
    calibration_method, calibration_interval, calibrated_by,
    acceptance_criteria, calibration_date, next_due_date,
    certificate_number, notes
  } = req.body;
  if (!equipment_name || !equipment_id || !next_due_date) {
    return res.status(400).json({ error: 'equipment_name, equipment_id, and next_due_date are required.' });
  }
  ensureTable(db, () => {
    db.run(
      `INSERT INTO CalibrationEquipment
         (equipment_name, equipment_id, equipment_type, manufacturer, model, serial_number,
          phone, fax, receive_date, location, calibration_method, calibration_interval,
          calibrated_by, acceptance_criteria, calibration_date, next_due_date,
          certificate_number, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        equipment_name, equipment_id, equipment_type || 'Instrument',
        manufacturer, model, serial_number,
        phone || null, fax || null, receive_date || null, location || null,
        calibration_method || null, calibration_interval || null,
        calibrated_by || null, acceptance_criteria || null,
        calibration_date || null, next_due_date,
        certificate_number || null, notes || null,
        req.user?.id
      ],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Equipment ID already exists.' });
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Equipment created', id: this.lastID });
      }
    );
  });
});

// ─── UPDATE equipment ────────────────────────────────────────────────────────
router.put('/:id', authRequired, (req, res) => {
  const db = req.db;
  const {
    equipment_name, equipment_type, manufacturer, model, serial_number,
    phone, fax, receive_date, location,
    calibration_method, calibration_interval, calibrated_by,
    acceptance_criteria, calibration_date, next_due_date,
    certificate_number, notes, status
  } = req.body;
  db.run(
    `UPDATE CalibrationEquipment SET
       equipment_name       = COALESCE(?, equipment_name),
       equipment_type       = COALESCE(?, equipment_type),
       manufacturer         = COALESCE(?, manufacturer),
       model                = COALESCE(?, model),
       serial_number        = COALESCE(?, serial_number),
       phone                = ?,
       fax                  = ?,
       receive_date         = ?,
       location             = ?,
       calibration_method   = ?,
       calibration_interval = ?,
       calibrated_by        = ?,
       acceptance_criteria  = ?,
       calibration_date     = ?,
       next_due_date        = COALESCE(?, next_due_date),
       certificate_number   = ?,
       notes                = ?,
       status               = COALESCE(?, status),
       updated_at           = datetime('now')
     WHERE id = ?`,
    [
      equipment_name, equipment_type, manufacturer, model, serial_number,
      phone || null, fax || null, receive_date || null, location || null,
      calibration_method || null, calibration_interval || null,
      calibrated_by || null, acceptance_criteria || null,
      calibration_date || null, next_due_date,
      certificate_number || null, notes || null,
      status, req.params.id
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Updated', changes: this.changes });
    }
  );
});

// ─── DELETE equipment ────────────────────────────────────────────────────────
router.delete('/:id', authRequired, (req, res) => {
  const db = req.db;
  db.run(`DELETE FROM CalibrationEquipment WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deleted', changes: this.changes });
  });
});

module.exports = router;
