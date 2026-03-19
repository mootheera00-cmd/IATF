// routes/calibrationHistory.ts
// Shared history route for both External Calibration and In-House Calibration.
// source = 'external' → table CalibrationEquipment
// source = 'inhouse'  → table InHouseCalibrationEquipment
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { authRequired } = require('../middleware/auth');

// ─── Upload storage ──────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads', 'calibration-docs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, uploadDir),
  filename: (_req: any, file: any, cb: any) => {
    const ts   = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${ts}_${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`File type not allowed: ${ext}`));
  },
});

// ─── Ensure history table ─────────────────────────────────────────────────────
function ensureHistoryTable(db: any, cb: () => void) {
  db.run(
    `CREATE TABLE IF NOT EXISTS CalibrationHistory (
       id              INTEGER PRIMARY KEY AUTOINCREMENT,
       source          TEXT NOT NULL DEFAULT 'external', -- 'external' | 'inhouse'
       equipment_row_id INTEGER NOT NULL,                -- FK to equipment table id
       equipment_id    TEXT NOT NULL,                    -- human-readable equipment ID
       scheduled_date  TEXT,                             -- auto-generated scheduled date (may differ from performed)
       performed_date  TEXT NOT NULL,
       performed_by    TEXT,
       result          TEXT NOT NULL DEFAULT 'Pass',     -- 'Pass' | 'Not Pass'
       measured_value  REAL,
       error_percent   REAL,
       cal_status      TEXT,                             -- 'OK' | 'Near criteria' | 'Over criteria'
       remark          TEXT,
       file_name       TEXT,
       file_path       TEXT,
       created_by      INTEGER,
       created_at      TEXT DEFAULT (datetime('now')),
       FOREIGN KEY (created_by) REFERENCES users(id)
     )`,
    (err: any) => {
      if (err) console.error('ensureHistoryTable error:', err.message);
      // Migrate: add scheduled_date if missing in older DBs
      db.run(`ALTER TABLE CalibrationHistory ADD COLUMN scheduled_date TEXT`, () => {
        // Migrate: add action if missing in older DBs
        db.run(`ALTER TABLE CalibrationHistory ADD COLUMN action TEXT`, () => cb());
      });
    }
  );
}

// ─── Status helper ────────────────────────────────────────────────────────────
// acceptance_criteria is stored as free text (e.g. "±0.03 g", "± 4 µm", "0.05%")
// We extract the first numeric value and treat it as the tolerance limit.
function extractCriteriaValue(criteria: string | null): number | null {
  if (!criteria) return null;
  const match = criteria.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

function computeCalStatus(errorPercent: number | null, criteria: string | null): string | null {
  if (errorPercent == null) return null;           // no measurement → no status
  const limit = extractCriteriaValue(criteria);
  if (limit == null || limit === 0) return 'OK';   // no criteria → can't judge, mark OK
  const abs = Math.abs(errorPercent);
  if (abs > limit)        return 'Over criteria';  // EXCEEDS limit → over
  if (abs >= limit * 0.8) return 'Near criteria';  // within limit but ≥80% of it → warning
  return 'OK';
}

// ─── GET /calibration-history/all-equipment/:source ─────────────────────────
// Returns all equipment rows (from CalibrationEquipment or InHouseCalibrationEquipment)
// enriched with the latest CalibrationHistory record for each equipment.
router.get('/all-equipment/:source', authRequired, (req: any, res: any) => {
  const db = req.db;
  const { source } = req.params;
  const table = source === 'inhouse' ? 'InHouseCalibrationEquipment' : 'CalibrationEquipment';
  const today = new Date().toISOString().split('T')[0];
  const soon  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  ensureHistoryTable(db, () => {
    db.all(
      `SELECT e.*,
         CASE
           WHEN e.next_due_date < ? THEN 'Overdue'
           WHEN e.next_due_date <= ? THEN 'Due Soon'
           ELSE 'OK'
         END AS calibration_status,
         h.id          AS last_hist_id,
         h.result      AS last_result,
         h.cal_status  AS last_cal_status,
         h.error_percent AS last_error_percent,
         h.performed_date AS last_performed_date
       FROM ${table} e
       LEFT JOIN CalibrationHistory h
         ON h.source = ? AND h.equipment_row_id = e.id
         AND h.performed_date = (
           SELECT MAX(h2.performed_date)
           FROM CalibrationHistory h2
           WHERE h2.source = ? AND h2.equipment_row_id = e.id
         )
       WHERE e.status != 'Retired'
       ORDER BY e.next_due_date ASC`,
      [today, soon, source, source],
      (err: any, rows: any[]) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ equipment: rows || [] });
      }
    );
  });
});

// ─── GET /calibration-history/:source/:equipmentRowId ──────────────────────
router.get('/:source/:equipmentRowId', authRequired, (req: any, res: any) => {
  const db = req.db;
  const { source, equipmentRowId } = req.params;
  ensureHistoryTable(db, () => {
    db.all(
      `SELECT * FROM CalibrationHistory
       WHERE source = ? AND equipment_row_id = ?
       ORDER BY performed_date DESC`,
      [source, equipmentRowId],
      (err: any, rows: any[]) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ history: rows || [] });
      }
    );
  });
});

// ─── POST /calibration-history/:source/:equipmentRowId ──────────────────────
router.post(
  '/:source/:equipmentRowId',
  authRequired,
  upload.single('file'),
  (req: any, res: any) => {
    const db = req.db;
    const { source, equipmentRowId } = req.params;
    const {
      equipment_id,
      performed_date,
      performed_by,
      result,
      measured_value,
      error_percent,
      remark,
      scheduled_date,
      action,
    } = req.body;

    if (!performed_date || !result) {
      return res.status(400).json({ error: 'performed_date and result are required.' });
    }

    // Determine equipment table
    const table = source === 'inhouse' ? 'InHouseCalibrationEquipment' : 'CalibrationEquipment';

    ensureHistoryTable(db, () => {
      // Fetch acceptance_criteria from equipment row
      db.get(
        `SELECT acceptance_criteria FROM ${table} WHERE id = ?`,
        [equipmentRowId],
        (err: any, equip: any) => {
          if (err) return res.status(500).json({ error: err.message });

          const criteria        = equip?.acceptance_criteria ?? null;
          const errPctNum       = error_percent   != null && error_percent   !== '' ? parseFloat(error_percent)   : null;
          const measValueNum    = measured_value  != null && measured_value  !== '' ? parseFloat(measured_value)  : null;
          const calStatus       = computeCalStatus(errPctNum, criteria);
          const filePath        = req.file ? req.file.filename : null;
          const fileName        = req.file ? req.file.originalname : null;

          db.run(
            `INSERT INTO CalibrationHistory
               (source, equipment_row_id, equipment_id, scheduled_date, performed_date, performed_by,
                result, measured_value, error_percent, cal_status, remark, action,
                file_name, file_path, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              source,
              equipmentRowId,
              equipment_id   || '',
              scheduled_date || null,
              performed_date,
              performed_by   || null,
              result,
              measValueNum,
              errPctNum,
              calStatus,
              remark         || null,
              action         || null,
              fileName,
              filePath,
              req.user?.id   || null,
            ],
            function (this: any, err2: any) {
              if (err2) return res.status(500).json({ error: err2.message });
              res.json({ id: this.lastID, cal_status: calStatus });
            }
          );
        }
      );
    });
  }
);

// ─── DELETE /calibration-history/entry/:id ───────────────────────────────────
router.delete('/entry/:id', authRequired, (req: any, res: any) => {
  const db = req.db;
  const id = req.params.id;
  ensureHistoryTable(db, () => {
    // Delete associated file if present
    db.get(`SELECT file_path FROM CalibrationHistory WHERE id = ?`, [id], (err: any, row: any) => {
      if (!err && row?.file_path) {
        const full = path.join(uploadDir, row.file_path);
        if (fs.existsSync(full)) {
          try { fs.unlinkSync(full); } catch {}
        }
      }
      db.run(`DELETE FROM CalibrationHistory WHERE id = ?`, [id], (err2: any) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ message: 'Deleted' });
      });
    });
  });
});

// ─── PUT /calibration-history/entry/:id ──────────────────────────────────────
router.put('/entry/:id', authRequired, upload.single('file'), (req: any, res: any) => {
  const db  = req.db;
  const { id } = req.params;
  const {
    performed_date, performed_by, result,
    measured_value, error_percent, remark, scheduled_date, action,
  } = req.body;

  ensureHistoryTable(db, () => {
    db.get(`SELECT * FROM CalibrationHistory WHERE id = ?`, [id], (err: any, existing: any) => {
      if (err || !existing) return res.status(404).json({ error: 'Record not found' });

      const table = existing.source === 'inhouse'
        ? 'InHouseCalibrationEquipment'
        : 'CalibrationEquipment';

      db.get(
        `SELECT acceptance_criteria FROM ${table} WHERE id = ?`,
        [existing.equipment_row_id],
        (e2: any, equip: any) => {
          const criteria   = equip?.acceptance_criteria ?? null;
          // Use null when user explicitly cleared the field (sent '' or omitted)
          // but only fall back to existing value if the key was NOT present in the request at all.
          const errPctNum  = (error_percent  != null && error_percent  !== '')
            ? parseFloat(error_percent)
            : ('error_percent'  in req.body ? null : existing.error_percent);
          const measValNum = (measured_value != null && measured_value !== '')
            ? parseFloat(measured_value)
            : ('measured_value' in req.body ? null : existing.measured_value);
          const calStatus  = computeCalStatus(errPctNum, criteria);

          // Keep existing file if no new file uploaded
          const filePath = req.file ? req.file.filename          : existing.file_path;
          const fileName = req.file ? req.file.originalname       : existing.file_name;

          // If a new file was uploaded, delete the old one
          if (req.file && existing.file_path) {
            const oldFull = path.join(uploadDir, existing.file_path);
            if (fs.existsSync(oldFull)) {
              try { fs.unlinkSync(oldFull); } catch {}
            }
          }

          db.run(
            `UPDATE CalibrationHistory
               SET performed_date = ?,
                   performed_by   = ?,
                   result         = ?,
                   measured_value = ?,
                   error_percent  = ?,
                   cal_status     = ?,
                   remark         = ?,
                   action         = ?,
                   scheduled_date = ?,
                   file_name      = ?,
                   file_path      = ?
             WHERE id = ?`,
            [
              performed_date  || existing.performed_date,
              performed_by    != null ? (performed_by  || null) : existing.performed_by,
              result          || existing.result,
              measValNum,
              errPctNum,
              calStatus,
              remark          != null ? (remark        || null) : existing.remark,
              action          != null ? (action        || null) : existing.action,
              scheduled_date  || existing.scheduled_date,
              fileName,
              filePath,
              id,
            ],
            function (e3: any) {
              if (e3) return res.status(500).json({ error: e3.message });
              res.json({ id: Number(id), cal_status: calStatus });
            }
          );
        }
      );
    });
  });
});

// ─── GET /calibration-history/file/:id ───────────────────────────────────────
router.get('/file/:id', authRequired, (req: any, res: any) => {
  const db = req.db;
  db.get(
    `SELECT file_name, file_path FROM CalibrationHistory WHERE id = ?`,
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
