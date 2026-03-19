// routes/calibration.ts
const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');

const PAGE_KEY = 'external_calibration'; // unique key for this page's PIC setting

function ensureTable(db: any, cb: (err?: any) => void) {
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
    (err: any) => {
      if (err) return cb(err);
      const newCols: [string, string][] = [
        ['phone',                'TEXT'],
        ['fax',                  'TEXT'],
        ['receive_date',         'TEXT'],
        ['calibration_method',   'TEXT'],
        ['calibration_interval', 'TEXT'],
        ['acceptance_criteria',  'TEXT'],
        ['serial_number',        'TEXT'],
      ];
      let pending = newCols.length;
      newCols.forEach(([col, type]) => {
        db.run(`ALTER TABLE CalibrationEquipment ADD COLUMN ${col} ${type}`, () => {
          if (--pending === 0) ensurePageSettings(db, cb);
        });
      });
    }
  );
}

function ensurePageSettings(db: any, cb: (err?: any) => void) {
  db.run(
    `CREATE TABLE IF NOT EXISTS PageSettings (
       page_key    TEXT PRIMARY KEY,
       pic_user_id INTEGER,
       updated_at  TEXT DEFAULT (datetime('now')),
       FOREIGN KEY (pic_user_id) REFERENCES users(id)
     )`,
    cb
  );
}

// helper: normalize role string
function normalizeRole(role: string | undefined): string {
  return String(role || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

// helper: is admin or DC role
function isPrivileged(role: string | undefined): boolean {
  const r = normalizeRole(role);
  return ['ADMIN', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER'].includes(r);
}

// ─── GET page PIC ─────────────────────────────────────────────────────────────
router.get('/pic', authRequired, (req: any, res: any) => {
  const db = req.db;
  ensurePageSettings(db, () => {
    db.get(
      `SELECT ps.pic_user_id, u.name AS pic_name, u.employee_code AS pic_employee_code
       FROM PageSettings ps LEFT JOIN users u ON ps.pic_user_id = u.id
       WHERE ps.page_key = ?`,
      [PAGE_KEY],
      (err: any, row: any) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ pic: row || null });
      }
    );
  });
});

// ─── PUT assign page PIC (admin / DC only) ───────────────────────────────────
router.put('/pic', authRequired, (req: any, res: any) => {
  if (!isPrivileged(req.user?.role)) {
    return res.status(403).json({ error: 'Admin or Document Control access required.' });
  }
  const db = req.db;
  const picUserId = req.body.pic_user_id ?? null;
  ensurePageSettings(db, () => {
    db.run(
      `INSERT INTO PageSettings (page_key, pic_user_id, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(page_key) DO UPDATE SET pic_user_id = excluded.pic_user_id, updated_at = datetime('now')`,
      [PAGE_KEY, picUserId],
      function (this: any, err: any) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Person In Charge updated' });
      }
    );
  });
});

// ─── GET available users for PIC selection (admin / DC only) ─────────────────
router.get('/pic-users', authRequired, (req: any, res: any) => {
  if (!isPrivileged(req.user?.role)) {
    return res.status(403).json({ error: 'Admin or Document Control access required.' });
  }
  const db = req.db;
  db.all(
    `SELECT id, name, employee_code, role FROM users WHERE is_active = 1 OR is_active IS NULL ORDER BY name ASC`,
    [],
    (err: any, rows: any[]) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ users: rows || [] });
    }
  );
});

// ─── GET all equipment ────────────────────────────────────────────────────────
router.get('/', authRequired, (req: any, res: any) => {
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
      (err: any, rows: any[]) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ equipment: rows || [] });
      }
    );
  });
});

// ─── GET stats ────────────────────────────────────────────────────────────────
router.get('/stats', authRequired, (req: any, res: any) => {
  const db = req.db;
  ensureTable(db, () => {
    const today = new Date().toISOString().split('T')[0];
    const soon  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    db.get(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN next_due_date < ? THEN 1 ELSE 0 END) AS overdue,
        SUM(CASE WHEN next_due_date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS due_soon,
        SUM(CASE WHEN next_due_date > ? THEN 1 ELSE 0 END) AS ok
       FROM CalibrationEquipment WHERE status != 'Retired'`,
      [today, today, soon, soon],
      (err: any, row: any) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ stats: row || { total: 0, overdue: 0, due_soon: 0, ok: 0 } });
      }
    );
  });
});

// ─── POST create ──────────────────────────────────────────────────────────────
router.post('/', authRequired, (req: any, res: any) => {
  const db = req.db;
  const {
    equipment_name, equipment_id, equipment_type,
    manufacturer, model, serial_number,
    phone, fax, receive_date, location,
    calibration_method, calibration_interval,
    calibrated_by, acceptance_criteria,
    calibration_date, next_due_date, certificate_number, notes,
  } = req.body;

  if (!equipment_name || !equipment_id || !next_due_date) {
    return res.status(400).json({ error: 'equipment_name, equipment_id and next_due_date are required.' });
  }

  ensureTable(db, () => {
    db.run(
      `INSERT INTO CalibrationEquipment
         (equipment_name, equipment_id, equipment_type, manufacturer, model, serial_number,
          phone, fax, receive_date, location, calibration_method, calibration_interval,
          calibrated_by, acceptance_criteria, calibration_date, next_due_date, certificate_number, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        equipment_name, equipment_id, equipment_type || 'Instrument',
        manufacturer || null, model || null, serial_number || null,
        phone || null, fax || null, receive_date || null, location || null,
        calibration_method || null, calibration_interval || null,
        calibrated_by || null, acceptance_criteria || null,
        calibration_date || null, next_due_date, certificate_number || null, notes || null,
        req.user?.id,
      ],
      function (this: any, err: any) {
        if (err) {
          if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: `Equipment ID "${equipment_id}" already exists.` });
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Equipment created', id: this.lastID });
      }
    );
  });
});

// ─── PUT update ───────────────────────────────────────────────────────────────
router.put('/:id', authRequired, (req: any, res: any) => {
  const db = req.db;
  const userId = req.user?.id;
  const userRole = req.user?.role;

  if (!isPrivileged(userRole)) {
    // Check if user is the page-level PIC
    return db.get(
      `SELECT pic_user_id FROM PageSettings WHERE page_key = ?`,
      [PAGE_KEY],
      (err: any, row: any) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row?.pic_user_id || row.pic_user_id !== userId) {
          return res.status(403).json({ error: 'Only Admin, Document Control, or the Person In Charge can edit.' });
        }
        doUpdate(db, req, res);
      }
    );
  }
  doUpdate(db, req, res);
});

function doUpdate(db: any, req: any, res: any) {
  const {
    equipment_name, equipment_id, equipment_type,
    manufacturer, model, serial_number,
    phone, fax, receive_date, location,
    calibration_method, calibration_interval,
    calibrated_by, acceptance_criteria,
    calibration_date, next_due_date, certificate_number, notes, status,
  } = req.body;

  db.run(
    `UPDATE CalibrationEquipment SET
       equipment_name       = COALESCE(?, equipment_name),
       equipment_id         = COALESCE(?, equipment_id),
       equipment_type       = COALESCE(?, equipment_type),
       manufacturer         = COALESCE(?, manufacturer),
       model                = COALESCE(?, model),
       serial_number        = COALESCE(?, serial_number),
       phone                = COALESCE(?, phone),
       fax                  = COALESCE(?, fax),
       receive_date         = COALESCE(?, receive_date),
       location             = COALESCE(?, location),
       calibration_method   = COALESCE(?, calibration_method),
       calibration_interval = COALESCE(?, calibration_interval),
       calibrated_by        = COALESCE(?, calibrated_by),
       acceptance_criteria  = COALESCE(?, acceptance_criteria),
       calibration_date     = COALESCE(?, calibration_date),
       next_due_date        = COALESCE(?, next_due_date),
       certificate_number   = COALESCE(?, certificate_number),
       notes                = COALESCE(?, notes),
       status               = COALESCE(?, status),
       updated_at           = datetime('now')
     WHERE id = ?`,
    [
      equipment_name, equipment_id, equipment_type,
      manufacturer, model, serial_number,
      phone, fax, receive_date, location,
      calibration_method, calibration_interval,
      calibrated_by, acceptance_criteria,
      calibration_date, next_due_date, certificate_number, notes, status,
      req.params.id,
    ],
    function (this: any, err: any) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Updated', changes: this.changes });
    }
  );
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:id', authRequired, (req: any, res: any) => {
  const db = req.db;
  const userId = req.user?.id;
  const userRole = req.user?.role;

  if (!isPrivileged(userRole)) {
    return db.get(
      `SELECT pic_user_id FROM PageSettings WHERE page_key = ?`,
      [PAGE_KEY],
      (err: any, row: any) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row?.pic_user_id || row.pic_user_id !== userId) {
          return res.status(403).json({ error: 'Only Admin, Document Control, or the Person In Charge can delete.' });
        }
        db.run(`DELETE FROM CalibrationEquipment WHERE id = ?`, [req.params.id], function (this: any, err2: any) {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ message: 'Deleted', changes: this.changes });
        });
      }
    );
  }
  db.run(`DELETE FROM CalibrationEquipment WHERE id = ?`, [req.params.id], function (this: any, err: any) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deleted', changes: this.changes });
  });
});

export = router;
