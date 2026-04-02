// routes/msa.ts — MSA (Measurement System Analysis) CRUD
const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');

/* ================================================================
   DB bootstrap — auto-create tables on first request
   ================================================================ */
let tablesReady = false;

function ensureTables(db: any, cb: (err?: any) => void) {
  if (tablesReady) return cb();
  db.serialize(() => {
    // ── parent study header ────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS MsaStudy (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      study_type            TEXT NOT NULL CHECK(study_type IN ('bias','grr','stability')),
      equipment_no          TEXT NOT NULL,
      equipment_name        TEXT,
      equipment_resolution  TEXT,
      part_no               TEXT,
      part_name             TEXT,
      characteristic        TEXT,
      specification         TEXT,
      studied_date          TEXT,
      area                  TEXT,
      status                TEXT DEFAULT 'Active',
      result                TEXT,
      created_by            INTEGER,
      created_at            TEXT DEFAULT (datetime('now')),
      updated_at            TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // ── Bias detail ────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS MsaBias (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      study_id          INTEGER NOT NULL,
      appraiser_name    TEXT,
      appraiser_dept    TEXT,
      reference_value   REAL,
      reference_unit    TEXT DEFAULT 'mm',
      alpha             REAL DEFAULT 0.05,
      sample_count      INTEGER DEFAULT 15,
      readings          TEXT,
      mean              REAL,
      std_dev           REAL,
      range_val         REAL,
      bias              REAL,
      t_statistic       REAL,
      degrees_of_freedom REAL,
      significant_t     REAL,
      ci_lower          REAL,
      ci_upper          REAL,
      result            TEXT,
      FOREIGN KEY (study_id) REFERENCES MsaStudy(id) ON DELETE CASCADE
    )`);

    // ── GR&R detail ────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS MsaGrr (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      study_id         INTEGER NOT NULL,
      num_appraisers   INTEGER DEFAULT 3,
      num_trials       INTEGER DEFAULT 3,
      num_parts        INTEGER DEFAULT 6,
      appraiser_data   TEXT,
      part_averages    TEXT,
      r_bar            REAL,
      x_diff           REAL,
      ucl_r            REAL,
      ev               REAL,
      av               REAL,
      grr              REAL,
      pv               REAL,
      tv               REAL,
      percent_ev       REAL,
      percent_av       REAL,
      percent_grr      REAL,
      percent_pv       REAL,
      ndc              INTEGER,
      result           TEXT,
      FOREIGN KEY (study_id) REFERENCES MsaStudy(id) ON DELETE CASCADE
    )`);

    // ── Stability detail ───────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS MsaStability (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      study_id               INTEGER NOT NULL,
      inspector_name         TEXT,
      tolerance              REAL,
      tolerance_unit         TEXT DEFAULT 'g',
      reference_value        REAL,
      num_subgroups          INTEGER DEFAULT 20,
      readings_per_subgroup  INTEGER DEFAULT 3,
      readings               TEXT,
      x_bar_values           TEXT,
      range_values           TEXT,
      x_bar_ucl              REAL,
      x_bar_cl               REAL,
      x_bar_lcl              REAL,
      r_ucl                  REAL,
      r_cl                   REAL,
      r_lcl                  REAL,
      sigma                  REAL,
      six_sigma              REAL,
      percent_stability      REAL,
      result                 TEXT,
      FOREIGN KEY (study_id) REFERENCES MsaStudy(id) ON DELETE CASCADE
    )`, (err: any) => {
      if (!err) tablesReady = true;
      cb(err);
    });
  });
}

/* ================================================================
   Helpers
   ================================================================ */
function normalizeRole(role: string | undefined): string {
  return String(role || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}
function isPrivileged(role: string | undefined): boolean {
  const r = normalizeRole(role);
  return ['ADMIN', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER'].includes(r);
}

/* ================================================================
   ROUTES
   ================================================================ */

// ─── LIST all studies (with optional ?type=bias|grr|stability) ──
router.get('/', authRequired, (req: any, res: any) => {
  const db = req.db;
  ensureTables(db, (err: any) => {
    if (err) return res.status(500).json({ error: err.message });
    const type = req.query.type;
    const sql = type
      ? `SELECT s.*, u.name AS created_by_name FROM MsaStudy s LEFT JOIN users u ON s.created_by = u.id WHERE s.study_type = ? ORDER BY s.studied_date DESC, s.id DESC`
      : `SELECT s.*, u.name AS created_by_name FROM MsaStudy s LEFT JOIN users u ON s.created_by = u.id ORDER BY s.studied_date DESC, s.id DESC`;
    const params = type ? [type] : [];
    db.all(sql, params, (err2: any, rows: any[]) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json(rows || []);
    });
  });
});

// ─── GET single study with detail ─────────────────────────────
router.get('/:id', authRequired, (req: any, res: any) => {
  const db = req.db;
  const { id } = req.params;
  ensureTables(db, (err: any) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get(
      `SELECT s.*, u.name AS created_by_name FROM MsaStudy s LEFT JOIN users u ON s.created_by = u.id WHERE s.id = ?`,
      [id],
      (err2: any, study: any) => {
        if (err2) return res.status(500).json({ error: err2.message });
        if (!study) return res.status(404).json({ error: 'Study not found' });

        const detailTable: Record<string, string> = {
          bias: 'MsaBias',
          grr: 'MsaGrr',
          stability: 'MsaStability',
        };
        const table = detailTable[study.study_type];
        if (!table) return res.json({ study, detail: null });

        db.get(`SELECT * FROM ${table} WHERE study_id = ?`, [id], (err3: any, detail: any) => {
          if (err3) return res.status(500).json({ error: err3.message });
          res.json({ study, detail });
        });
      }
    );
  });
});

// ─── CREATE study ─────────────────────────────────────────────
router.post('/', authRequired, (req: any, res: any) => {
  const db = req.db;
  ensureTables(db, (err: any) => {
    if (err) return res.status(500).json({ error: err.message });

    const {
      study_type, equipment_no, equipment_name, equipment_resolution,
      part_no, part_name, characteristic, specification,
      studied_date, area, result, detail,
    } = req.body;

    if (!study_type || !equipment_no) {
      return res.status(400).json({ error: 'study_type and equipment_no are required' });
    }
    if (!['bias', 'grr', 'stability'].includes(study_type)) {
      return res.status(400).json({ error: 'study_type must be bias, grr, or stability' });
    }

    db.run(
      `INSERT INTO MsaStudy (study_type, equipment_no, equipment_name, equipment_resolution, part_no, part_name, characteristic, specification, studied_date, area, result, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [study_type, equipment_no, equipment_name || null, equipment_resolution || null,
       part_no || null, part_name || null, characteristic || null, specification || null,
       studied_date || null, area || null, result || null, req.user?.id || null],
      function (this: any, err2: any) {
        if (err2) return res.status(500).json({ error: err2.message });
        const studyId = this.lastID;

        if (!detail) return res.json({ id: studyId, message: 'Study created' });

        insertDetail(db, study_type, studyId, detail, (err3: any) => {
          if (err3) return res.status(500).json({ error: err3.message });
          res.json({ id: studyId, message: 'Study created with detail' });
        });
      }
    );
  });
});

// ─── UPDATE study ─────────────────────────────────────────────
router.put('/:id', authRequired, (req: any, res: any) => {
  const db = req.db;
  const { id } = req.params;
  ensureTables(db, (err: any) => {
    if (err) return res.status(500).json({ error: err.message });

    const {
      equipment_no, equipment_name, equipment_resolution,
      part_no, part_name, characteristic, specification,
      studied_date, area, result, detail,
    } = req.body;

    db.run(
      `UPDATE MsaStudy SET equipment_no=?, equipment_name=?, equipment_resolution=?,
       part_no=?, part_name=?, characteristic=?, specification=?,
       studied_date=?, area=?, result=?, updated_at=datetime('now')
       WHERE id=?`,
      [equipment_no, equipment_name, equipment_resolution,
       part_no, part_name, characteristic, specification,
       studied_date, area, result, id],
      function (this: any, err2: any) {
        if (err2) return res.status(500).json({ error: err2.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Study not found' });

        if (!detail) return res.json({ message: 'Study updated' });

        // Get study type to know which detail table
        db.get('SELECT study_type FROM MsaStudy WHERE id=?', [id], (err3: any, row: any) => {
          if (err3 || !row) return res.status(500).json({ error: err3?.message || 'Not found' });
          upsertDetail(db, row.study_type, Number(id), detail, (err4: any) => {
            if (err4) return res.status(500).json({ error: err4.message });
            res.json({ message: 'Study updated with detail' });
          });
        });
      }
    );
  });
});

// ─── DELETE study ─────────────────────────────────────────────
router.delete('/:id', authRequired, (req: any, res: any) => {
  const db = req.db;
  const { id } = req.params;
  ensureTables(db, (err: any) => {
    if (err) return res.status(500).json({ error: err.message });
    // Delete detail first, then parent
    db.run('DELETE FROM MsaBias WHERE study_id=?', [id]);
    db.run('DELETE FROM MsaGrr WHERE study_id=?', [id]);
    db.run('DELETE FROM MsaStability WHERE study_id=?', [id]);
    db.run('DELETE FROM MsaStudy WHERE id=?', [id], function (this: any, err2: any) {
      if (err2) return res.status(500).json({ error: err2.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Study not found' });
      res.json({ message: 'Study deleted' });
    });
  });
});

// ─── STATS endpoint ───────────────────────────────────────────
router.get('/stats/summary', authRequired, (req: any, res: any) => {
  const db = req.db;
  ensureTables(db, (err: any) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all(
      `SELECT study_type, COUNT(*) AS count,
              SUM(CASE WHEN result IN ('ACCEPTABLE','VERY_GOOD') THEN 1 ELSE 0 END) AS pass_count
       FROM MsaStudy GROUP BY study_type`,
      [],
      (err2: any, rows: any[]) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json(rows || []);
      }
    );
  });
});

/* ================================================================
   Detail insert / upsert helpers
   ================================================================ */
function insertDetail(db: any, type: string, studyId: number, d: any, cb: (err?: any) => void) {
  if (type === 'bias') {
    db.run(
      `INSERT INTO MsaBias (study_id, appraiser_name, appraiser_dept, reference_value, reference_unit, alpha, sample_count, readings, mean, std_dev, range_val, bias, t_statistic, degrees_of_freedom, significant_t, ci_lower, ci_upper, result)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [studyId, d.appraiser_name, d.appraiser_dept, d.reference_value, d.reference_unit || 'mm',
       d.alpha ?? 0.05, d.sample_count ?? 15, JSON.stringify(d.readings || []),
       d.mean, d.std_dev, d.range_val, d.bias, d.t_statistic, d.degrees_of_freedom,
       d.significant_t, d.ci_lower, d.ci_upper, d.result], cb);
  } else if (type === 'grr') {
    db.run(
      `INSERT INTO MsaGrr (study_id, num_appraisers, num_trials, num_parts, appraiser_data, part_averages, r_bar, x_diff, ucl_r, ev, av, grr, pv, tv, percent_ev, percent_av, percent_grr, percent_pv, ndc, result)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [studyId, d.num_appraisers ?? 3, d.num_trials ?? 3, d.num_parts ?? 6,
       JSON.stringify(d.appraiser_data || []), JSON.stringify(d.part_averages || []),
       d.r_bar, d.x_diff, d.ucl_r, d.ev, d.av, d.grr, d.pv, d.tv,
       d.percent_ev, d.percent_av, d.percent_grr, d.percent_pv, d.ndc, d.result], cb);
  } else if (type === 'stability') {
    db.run(
      `INSERT INTO MsaStability (study_id, inspector_name, tolerance, tolerance_unit, reference_value, num_subgroups, readings_per_subgroup, readings, x_bar_values, range_values, x_bar_ucl, x_bar_cl, x_bar_lcl, r_ucl, r_cl, r_lcl, sigma, six_sigma, percent_stability, result)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [studyId, d.inspector_name, d.tolerance, d.tolerance_unit || 'g', d.reference_value,
       d.num_subgroups ?? 20, d.readings_per_subgroup ?? 3,
       JSON.stringify(d.readings || []), JSON.stringify(d.x_bar_values || []),
       JSON.stringify(d.range_values || []),
       d.x_bar_ucl, d.x_bar_cl, d.x_bar_lcl, d.r_ucl, d.r_cl, d.r_lcl,
       d.sigma, d.six_sigma, d.percent_stability, d.result], cb);
  } else {
    cb();
  }
}

function upsertDetail(db: any, type: string, studyId: number, d: any, cb: (err?: any) => void) {
  const detailTable: Record<string, string> = {
    bias: 'MsaBias', grr: 'MsaGrr', stability: 'MsaStability',
  };
  const table = detailTable[type];
  if (!table) return cb();
  db.run(`DELETE FROM ${table} WHERE study_id = ?`, [studyId], (err: any) => {
    if (err) return cb(err);
    insertDetail(db, type, studyId, d, cb);
  });
}

module.exports = router;
