// routes/maintenance.ts
// Equipment Maintenance Plan — equipment list + history (plan vs actual events)
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { authRequired, requireRole } = require('../middleware/auth');

const PLAN_ROLES = ['ADMIN', 'LEADER', 'MANAGER', 'SUPERVISOR', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER'];
const plannerOnly = requireRole(PLAN_ROLES);

// ─── Upload storage ──────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads', 'maintenance-docs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, uploadDir),
  filename:    (_req: any, file: any, cb: any) => {
    const ts   = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${ts}_${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`File type not allowed: ${ext}`));
  },
});

// ─── Ensure tables ────────────────────────────────────────────────────────────
function ensureTables(db: any, cb: () => void) {
  db.run(
    `CREATE TABLE IF NOT EXISTS MaintenanceEquipment (
       id               INTEGER PRIMARY KEY AUTOINCREMENT,
       equipment_no     INTEGER NOT NULL,
       equipment_name   TEXT NOT NULL,
       year             INTEGER NOT NULL,
       location         TEXT,
       notes            TEXT,
       status           TEXT DEFAULT 'Active',
       created_at       TEXT DEFAULT (datetime('now')),
       updated_at       TEXT DEFAULT (datetime('now'))
     )`,
    () => {
      db.run(
        `CREATE TABLE IF NOT EXISTS MaintenanceActionCode (
           code        TEXT PRIMARY KEY,
           description TEXT,
           frequency   TEXT
         )`,
        () => {
          db.run(
            `CREATE TABLE IF NOT EXISTS MaintenancePlanEvent (
               id             INTEGER PRIMARY KEY AUTOINCREMENT,
               equipment_id   INTEGER NOT NULL,
               year           INTEGER NOT NULL,
               month          INTEGER NOT NULL,
               action_code    TEXT,
               notes          TEXT,
               created_at     TEXT DEFAULT (datetime('now')),
               FOREIGN KEY (equipment_id) REFERENCES MaintenanceEquipment(id)
             )`,
            () => {
              db.run(
                `CREATE TABLE IF NOT EXISTS MaintenanceHistory (
                   id             INTEGER PRIMARY KEY AUTOINCREMENT,
                   equipment_id   INTEGER NOT NULL,
                   year           INTEGER NOT NULL,
                   month          INTEGER NOT NULL,
                   day            INTEGER,
                   action_code    TEXT,
                   result         TEXT DEFAULT 'Done',
                   performed_by   TEXT,
                   remark         TEXT,
                   file_name      TEXT,
                   file_path      TEXT,
                   created_by     INTEGER,
                   created_at     TEXT DEFAULT (datetime('now')),
                   FOREIGN KEY (equipment_id) REFERENCES MaintenanceEquipment(id)
                 )`,
                () => {
                  db.run(
                    `CREATE TABLE IF NOT EXISTS MaintenanceCalibrationResult (
                       id             INTEGER PRIMARY KEY AUTOINCREMENT,
                       history_id     INTEGER NOT NULL,
                       item_name      TEXT NOT NULL,
                       status         TEXT NOT NULL DEFAULT 'Pass',
                       remark         TEXT,
                       file_name      TEXT,
                       file_path      TEXT,
                       created_at     TEXT DEFAULT (datetime('now')),
                       FOREIGN KEY (history_id) REFERENCES MaintenanceHistory(id) ON DELETE CASCADE
                     )`,
                    () => cb()
                  );
                }
              );
            }
          );
        }
      );
    }
  );
}

// ─── GET /maintenance/equipment  ─────────────────────────────────────────────
// Returns all equipment rows with last actual event info
router.get('/equipment', authRequired, (req: any, res: any) => {
  const db   = req.db;
  const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();

  ensureTables(db, () => {
    db.all(
      `SELECT e.*,
         h.id          AS last_hist_id,
         h.result      AS last_result,
         h.action_code AS last_action_code,
         h.year        AS last_year,
         h.month       AS last_month,
         h.day         AS last_day
       FROM MaintenanceEquipment e
       LEFT JOIN MaintenanceHistory h
         ON h.equipment_id = e.id
         AND h.rowid = (
           SELECT h2.rowid FROM MaintenanceHistory h2
           WHERE h2.equipment_id = e.id
           ORDER BY h2.year DESC, h2.month DESC, h2.day DESC, h2.rowid DESC
           LIMIT 1
         )
       WHERE e.year = ? AND e.status != 'Retired'
       ORDER BY e.equipment_no ASC`,
      [year],
      (err: any, rows: any[]) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ equipment: rows || [] });
      }
    );
  });
});

// ─── GET /maintenance/plan-overview/:year  ────────────────────────────────────
// Returns all plan events + all history for every equipment in a year
// Used by the MaintenancePlan overview page (avoids N+1 requests)
router.get('/plan-overview/:year', authRequired, (req: any, res: any) => {
  const db   = req.db;
  const year = parseInt(req.params.year);
  ensureTables(db, () => {
    db.all(
      `SELECT * FROM MaintenancePlanEvent WHERE year = ? ORDER BY equipment_id ASC, month ASC`,
      [year],
      (err: any, planRows: any[]) => {
        if (err) return res.status(500).json({ error: err.message });
        db.all(
          `SELECT h.*, ac.description AS action_description
           FROM MaintenanceHistory h
           LEFT JOIN MaintenanceActionCode ac ON ac.code = h.action_code
           WHERE h.year = ?
           ORDER BY h.equipment_id ASC, h.month ASC, h.day ASC`,
          [year],
          (err2: any, histRows: any[]) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ plan: planRows || [], history: histRows || [] });
          }
        );
      }
    );
  });
});

// ─── GET /maintenance/equipment/years  ────────────────────────────────────────
router.get('/equipment/years', authRequired, (req: any, res: any) => {
  const db = req.db;
  ensureTables(db, () => {
    db.all(
      `SELECT DISTINCT year FROM MaintenanceEquipment ORDER BY year DESC`,
      (err: any, rows: any[]) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ years: (rows || []).map((r: any) => r.year) });
      }
    );
  });
});

// ─── GET /maintenance/action-codes  ──────────────────────────────────────────
router.get('/action-codes', authRequired, (req: any, res: any) => {
  const db = req.db;
  ensureTables(db, () => {
    db.all(`SELECT * FROM MaintenanceActionCode ORDER BY code ASC`, (err: any, rows: any[]) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ actionCodes: rows || [] });
    });
  });
});

// ─── POST /maintenance/action-code  ──────────────────────────────────────────
router.post('/action-code', authRequired, plannerOnly, (req: any, res: any) => {
  const db = req.db;
  const { code, description, frequency } = req.body;
  if (!code) return res.status(400).json({ error: 'code is required.' });
  ensureTables(db, () => {
    db.run(
      `INSERT INTO MaintenanceActionCode (code, description, frequency) VALUES (?, ?, ?)`,
      [code.toUpperCase().trim(), description || null, frequency || null],
      function (this: any, err: any) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ code: code.toUpperCase().trim() });
      }
    );
  });
});

// ─── PUT /maintenance/action-code/:code  ─────────────────────────────────────
router.put('/action-code/:code', authRequired, plannerOnly, (req: any, res: any) => {
  const db = req.db;
  const { code } = req.params;
  const { description, frequency } = req.body;
  ensureTables(db, () => {
    db.run(
      `UPDATE MaintenanceActionCode SET description = ?, frequency = ? WHERE code = ?`,
      [description ?? null, frequency ?? null, code],
      function (this: any, err: any) {
        if (err) return res.status(500).json({ error: err.message });
        if ((this as any).changes === 0) return res.status(404).json({ error: 'Code not found' });
        res.json({ code });
      }
    );
  });
});

// ─── DELETE /maintenance/action-code/:code  ──────────────────────────────────
router.delete('/action-code/:code', authRequired, plannerOnly, (req: any, res: any) => {
  const db = req.db;
  const { code } = req.params;
  ensureTables(db, () => {
    db.run(`DELETE FROM MaintenanceActionCode WHERE code = ?`, [code], (err: any) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Deleted' });
    });
  });
});

// ─── POST /maintenance/plan-event  ───────────────────────────────────────────
router.post('/plan-event', authRequired, plannerOnly, (req: any, res: any) => {
  const db = req.db;
  const { equipment_id, year, month, action_code, notes } = req.body;
  if (!equipment_id || !year || !month) {
    return res.status(400).json({ error: 'equipment_id, year, and month are required.' });
  }
  ensureTables(db, () => {
    db.run(
      `INSERT INTO MaintenancePlanEvent (equipment_id, year, month, action_code, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [
        parseInt(equipment_id),
        parseInt(year),
        parseInt(month),
        action_code || null,
        notes || null,
      ],
      function (this: any, err: any) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });
});

// ─── PUT /maintenance/plan-event/:id  ────────────────────────────────────────
router.put('/plan-event/:id', authRequired, plannerOnly, (req: any, res: any) => {
  const db = req.db;
  const { id } = req.params;
  const { equipment_id, year, month, action_code, notes } = req.body;
  ensureTables(db, () => {
    db.get(`SELECT * FROM MaintenancePlanEvent WHERE id = ?`, [id], (err: any, existing: any) => {
      if (err || !existing) return res.status(404).json({ error: 'Plan event not found' });
      db.run(
        `UPDATE MaintenancePlanEvent
           SET equipment_id = ?,
               year         = ?,
               month        = ?,
               action_code  = ?,
               notes        = ?
         WHERE id = ?`,
        [
          equipment_id ? parseInt(equipment_id) : existing.equipment_id,
          year         ? parseInt(year)         : existing.year,
          month        ? parseInt(month)        : existing.month,
          action_code  != null ? (action_code  || null) : existing.action_code,
          notes        != null ? (notes        || null) : existing.notes,
          id,
        ],
        (e2: any) => {
          if (e2) return res.status(500).json({ error: e2.message });
          res.json({ id: Number(id) });
        }
      );
    });
  });
});

// ─── DELETE /maintenance/plan-event/:id  ─────────────────────────────────────
router.delete('/plan-event/:id', authRequired, plannerOnly, (req: any, res: any) => {
  const db = req.db;
  const { id } = req.params;
  ensureTables(db, () => {
    db.run(`DELETE FROM MaintenancePlanEvent WHERE id = ?`, [id], (err: any) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Deleted' });
    });
  });
});

// ─── GET /maintenance/plan/:equipmentId  ─────────────────────────────────────
router.get('/plan/:equipmentId', authRequired, (req: any, res: any) => {
  const db = req.db;
  const { equipmentId } = req.params;
  const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
  ensureTables(db, () => {
    db.all(
      `SELECT * FROM MaintenancePlanEvent
       WHERE equipment_id = ? AND year = ?
       ORDER BY month ASC`,
      [equipmentId, year],
      (err: any, rows: any[]) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ plan: rows || [] });
      }
    );
  });
});

// ─── GET /maintenance/history/:equipmentId  ───────────────────────────────────
router.get('/history/:equipmentId', authRequired, (req: any, res: any) => {
  const db = req.db;
  const { equipmentId } = req.params;
  ensureTables(db, () => {
    db.all(
      `SELECT h.*, ac.description AS action_description
       FROM MaintenanceHistory h
       LEFT JOIN MaintenanceActionCode ac ON ac.code = h.action_code
       WHERE h.equipment_id = ?
       ORDER BY h.year DESC, h.month DESC, h.day DESC, h.id DESC`,
      [equipmentId],
      (err: any, rows: any[]) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ history: rows || [] });
      }
    );
  });
});

// ─── POST /maintenance/history/:equipmentId  ─────────────────────────────────
router.post('/history/:equipmentId', authRequired, upload.single('file'), (req: any, res: any) => {
  const db = req.db;
  const { equipmentId } = req.params;
  const { year, month, day, action_code, result, performed_by, remark } = req.body;

  if (!year || !month) return res.status(400).json({ error: 'year and month are required.' });

  ensureTables(db, () => {
    const filePath = req.file ? req.file.filename       : null;
    const fileName = req.file ? req.file.originalname   : null;

    db.run(
      `INSERT INTO MaintenanceHistory
         (equipment_id, year, month, day, action_code, result, performed_by, remark, file_name, file_path, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        equipmentId,
        parseInt(year),
        parseInt(month),
        (day != null && day !== '') ? day : null,
        action_code || null,
        result || 'Done',
        performed_by || null,
        remark || null,
        fileName,
        filePath,
        req.user?.id || null,
      ],
      function (this: any, err: any) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });
});

// ─── PUT /maintenance/history/entry/:id  ─────────────────────────────────────
router.put('/history/entry/:id', authRequired, upload.single('file'), (req: any, res: any) => {
  const db = req.db;
  const { id } = req.params;
  const { year, month, day, action_code, result, performed_by, remark } = req.body;

  ensureTables(db, () => {
    db.get(`SELECT * FROM MaintenanceHistory WHERE id = ?`, [id], (err: any, existing: any) => {
      if (err || !existing) return res.status(404).json({ error: 'Record not found' });

      const filePath = req.file ? req.file.filename     : existing.file_path;
      const fileName = req.file ? req.file.originalname : existing.file_name;

      if (req.file && existing.file_path) {
        const oldFull = path.join(uploadDir, existing.file_path);
        if (fs.existsSync(oldFull)) { try { fs.unlinkSync(oldFull); } catch {} }
      }

      db.run(
        `UPDATE MaintenanceHistory
           SET year         = ?,
               month        = ?,
               day          = ?,
               action_code  = ?,
               result       = ?,
               performed_by = ?,
               remark       = ?,
               file_name    = ?,
               file_path    = ?
         WHERE id = ?`,
        [
          year          ? parseInt(year)  : existing.year,
          month         ? parseInt(month) : existing.month,
          (day != null && day !== '') ? day : existing.day,
          action_code   != null ? (action_code  || null) : existing.action_code,
          result        || existing.result,
          performed_by  != null ? (performed_by || null) : existing.performed_by,
          remark        != null ? (remark       || null) : existing.remark,
          fileName,
          filePath,
          id,
        ],
        (e3: any) => {
          if (e3) return res.status(500).json({ error: e3.message });
          res.json({ id: Number(id) });
        }
      );
    });
  });
});

// ─── DELETE /maintenance/history/entry/:id  ───────────────────────────────────
router.delete('/history/entry/:id', authRequired, (req: any, res: any) => {
  const db = req.db;
  const { id } = req.params;
  ensureTables(db, () => {
    db.get(`SELECT file_path FROM MaintenanceHistory WHERE id = ?`, [id], (err: any, row: any) => {
      if (!err && row?.file_path) {
        const full = path.join(uploadDir, row.file_path);
        if (fs.existsSync(full)) { try { fs.unlinkSync(full); } catch {} }
      }
      db.run(`DELETE FROM MaintenanceHistory WHERE id = ?`, [id], (e2: any) => {
        if (e2) return res.status(500).json({ error: e2.message });
        res.json({ message: 'Deleted' });
      });
    });
  });
});

// ─── GET /maintenance/history/file/:id  ──────────────────────────────────────
router.get('/history/file/:id', authRequired, (req: any, res: any) => {
  const db = req.db;
  db.get(
    `SELECT file_name, file_path FROM MaintenanceHistory WHERE id = ?`,
    [req.params.id],
    (err: any, row: any) => {
      if (err || !row?.file_path) return res.status(404).json({ error: 'File not found' });
      const full = path.join(uploadDir, row.file_path);
      if (!fs.existsSync(full)) return res.status(404).json({ error: 'File missing on disk' });
      res.download(full, row.file_name || row.file_path);
    }
  );
});

// ─── POST /maintenance/equipment  ─────────────────────────────────────────────
// Add a single piece of equipment to a specific year
router.post('/equipment', authRequired, plannerOnly, (req: any, res: any) => {
  const db = req.db;
  const { equipment_no, equipment_name, year, location, notes } = req.body;
  if (!equipment_no || !equipment_name || !year) {
    return res.status(400).json({ error: 'equipment_no, equipment_name, and year are required.' });
  }
  ensureTables(db, () => {
    db.run(
      `INSERT INTO MaintenanceEquipment (equipment_no, equipment_name, year, location, notes, status)
       VALUES (?, ?, ?, ?, ?, 'Active')`,
      [parseInt(equipment_no), equipment_name.trim(), parseInt(year), location || null, notes || null],
      function (this: any, err: any) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });
});

// ─── DELETE /maintenance/equipment/:id  ───────────────────────────────────────
// Remove equipment from a specific year (does NOT affect other years)
router.delete('/equipment/:id', authRequired, plannerOnly, (req: any, res: any) => {
  const db  = req.db;
  const { id } = req.params;
  ensureTables(db, () => {
    // Hard-delete only the equipment row for this year.
    // Plan events and history for this equipment_id remain (historical record).
    db.run(
      `DELETE FROM MaintenanceEquipment WHERE id = ?`,
      [id],
      function (this: any, err: any) {
        if (err) return res.status(500).json({ error: err.message });
        if ((this as any).changes === 0) return res.status(404).json({ error: 'Equipment not found' });
        res.json({ message: 'Removed' });
      }
    );
  });
});

// ─── POST /maintenance/equipment/carryover  ────────────────────────────────────
// Copy all equipment from sourceYear into targetYear (skip duplicates).
// Returns the list of newly created equipment rows for targetYear.
router.post('/equipment/carryover', authRequired, plannerOnly, (req: any, res: any) => {
  const db = req.db;
  const { source_year, target_year } = req.body;
  if (!source_year || !target_year) {
    return res.status(400).json({ error: 'source_year and target_year are required.' });
  }
  const src = parseInt(source_year);
  const tgt = parseInt(target_year);
  ensureTables(db, () => {
    // Fetch all active equipment from source year
    db.all(
      `SELECT equipment_no, equipment_name, location, notes
       FROM MaintenanceEquipment
       WHERE year = ? AND status != 'Retired'
       ORDER BY equipment_no ASC`,
      [src],
      (err: any, rows: any[]) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!rows || rows.length === 0) {
          return res.json({ carried: 0, equipment: [] });
        }
        // Check which equipment_no already exists in target year (avoid duplicates)
        db.all(
          `SELECT equipment_no FROM MaintenanceEquipment WHERE year = ?`,
          [tgt],
          (err2: any, existing: any[]) => {
            if (err2) return res.status(500).json({ error: err2.message });
            const existingNos = new Set((existing || []).map((r: any) => r.equipment_no));
            const toInsert = rows.filter(r => !existingNos.has(r.equipment_no));
            if (toInsert.length === 0) {
              return res.json({ carried: 0, equipment: [] });
            }
            // Bulk insert
            const placeholders = toInsert.map(() => `(?, ?, ?, ?, ?, 'Active')`).join(', ');
            const values: any[] = [];
            toInsert.forEach(r => {
              values.push(r.equipment_no, r.equipment_name, tgt, r.location, r.notes);
            });
            db.run(
              `INSERT INTO MaintenanceEquipment (equipment_no, equipment_name, year, location, notes, status)
               VALUES ${placeholders}`,
              values,
              function (this: any, err3: any) {
                if (err3) return res.status(500).json({ error: err3.message });
                // Return the newly inserted rows
                db.all(
                  `SELECT * FROM MaintenanceEquipment WHERE year = ? AND status != 'Retired' ORDER BY equipment_no ASC`,
                  [tgt],
                  (err4: any, newRows: any[]) => {
                    if (err4) return res.status(500).json({ error: err4.message });
                    res.json({ carried: toInsert.length, equipment: newRows || [] });
                  }
                );
              }
            );
          }
        );
      }
    );
  });
});

// ─── GET /maintenance/calibration-result/:historyId  ─────────────────────────
// Get all calibration result rows for a history entry
router.get('/calibration-result/:historyId', authRequired, (req: any, res: any) => {
  const db = req.db;
  const { historyId } = req.params;
  ensureTables(db, () => {
    db.all(
      `SELECT * FROM MaintenanceCalibrationResult WHERE history_id = ? ORDER BY id ASC`,
      [historyId],
      (err: any, rows: any[]) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ results: rows || [] });
      }
    );
  });
});

// ─── POST /maintenance/calibration-result/:historyId  ────────────────────────
// Add a calibration result row  (with optional file)
router.post('/calibration-result/:historyId', authRequired, upload.single('file'), (req: any, res: any) => {
  const db = req.db;
  const { historyId } = req.params;
  const { item_name, status, remark } = req.body;
  if (!item_name) return res.status(400).json({ error: 'item_name is required.' });
  ensureTables(db, () => {
    const filePath = req.file ? req.file.filename     : null;
    const fileName = req.file ? req.file.originalname : null;
    db.run(
      `INSERT INTO MaintenanceCalibrationResult (history_id, item_name, status, remark, file_name, file_path)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [historyId, item_name.trim(), status || 'Pass', remark || null, fileName, filePath],
      function (this: any, err: any) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });
});

// ─── PUT /maintenance/calibration-result/entry/:id  ──────────────────────────
// Update a calibration result row (with optional new file)
router.put('/calibration-result/entry/:id', authRequired, upload.single('file'), (req: any, res: any) => {
  const db = req.db;
  const { id } = req.params;
  const { item_name, status, remark } = req.body;
  ensureTables(db, () => {
    db.get(`SELECT * FROM MaintenanceCalibrationResult WHERE id = ?`, [id], (err: any, existing: any) => {
      if (err || !existing) return res.status(404).json({ error: 'Record not found' });
      const filePath = req.file ? req.file.filename     : existing.file_path;
      const fileName = req.file ? req.file.originalname : existing.file_name;
      if (req.file && existing.file_path) {
        const oldFull = path.join(uploadDir, existing.file_path);
        if (fs.existsSync(oldFull)) { try { fs.unlinkSync(oldFull); } catch {} }
      }
      db.run(
        `UPDATE MaintenanceCalibrationResult
           SET item_name = ?, status = ?, remark = ?, file_name = ?, file_path = ?
         WHERE id = ?`,
        [
          item_name  ? item_name.trim()  : existing.item_name,
          status     || existing.status,
          remark     != null ? (remark || null) : existing.remark,
          fileName, filePath, id,
        ],
        (e2: any) => {
          if (e2) return res.status(500).json({ error: e2.message });
          res.json({ id: Number(id) });
        }
      );
    });
  });
});

// ─── DELETE /maintenance/calibration-result/entry/:id  ───────────────────────
router.delete('/calibration-result/entry/:id', authRequired, (req: any, res: any) => {
  const db = req.db;
  const { id } = req.params;
  ensureTables(db, () => {
    db.get(`SELECT file_path FROM MaintenanceCalibrationResult WHERE id = ?`, [id], (err: any, row: any) => {
      if (!err && row?.file_path) {
        const full = path.join(uploadDir, row.file_path);
        if (fs.existsSync(full)) { try { fs.unlinkSync(full); } catch {} }
      }
      db.run(`DELETE FROM MaintenanceCalibrationResult WHERE id = ?`, [id], (e2: any) => {
        if (e2) return res.status(500).json({ error: e2.message });
        res.json({ message: 'Deleted' });
      });
    });
  });
});

// ─── GET /maintenance/calibration-result/file/:id  ───────────────────────────
router.get('/calibration-result/file/:id', authRequired, (req: any, res: any) => {
  const db = req.db;
  db.get(
    `SELECT file_name, file_path FROM MaintenanceCalibrationResult WHERE id = ?`,
    [req.params.id],
    (err: any, row: any) => {
      if (err || !row?.file_path) return res.status(404).json({ error: 'File not found' });
      const full = path.join(uploadDir, row.file_path);
      if (!fs.existsSync(full)) return res.status(404).json({ error: 'File missing on disk' });
      res.download(full, row.file_name || row.file_path);
    }
  );
});

export = router;
