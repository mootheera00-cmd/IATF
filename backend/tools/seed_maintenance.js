/**
 * seed_maintenance.js
 *
 * Seeds MaintenanceEquipment, MaintenanceActionCode, MaintenancePlanEvent,
 * and MaintenanceHistory from the CSV data.
 *
 * Run from IATF/backend:
 *   node tools/seed_maintenance.js
 */

const path    = require('path');
const fs      = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '..', 'db', 'nskiatf_doccontrol.db');
const CSV_DIR = path.join(__dirname, '..', '..', '..', 'CSV');

const EQUIPMENT_CSV    = path.join(CSV_DIR, 'equipment_master.csv');
const PLAN_CSV         = path.join(CSV_DIR, 'plan_actions.csv');
const ACTUAL_CSV       = path.join(CSV_DIR, 'actual_events.csv');
const ACTION_CODE_CSV  = path.join(CSV_DIR, 'action_code_legend.csv');

for (const f of [EQUIPMENT_CSV, PLAN_CSV, ACTUAL_CSV, ACTION_CODE_CSV]) {
  if (!fs.existsSync(f)) { console.error('❌  Missing CSV:', f); process.exit(1); }
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(filePath) {
  const raw   = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const header = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    const obj = {};
    header.forEach((h, i) => obj[h] = (cols[i] || '').trim());
    return obj;
  });
}

const db = new sqlite3.Database(DB_PATH, err => {
  if (err) { console.error('❌  Cannot open DB:', err.message); process.exit(1); }
  console.log('✅  Opened DB:', DB_PATH);
  run();
});

function run() {
  db.serialize(() => {
    // ── Create tables ──────────────────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS MaintenanceEquipment (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_no   INTEGER NOT NULL,
      equipment_name TEXT NOT NULL,
      year           INTEGER NOT NULL,
      location       TEXT,
      notes          TEXT,
      status         TEXT DEFAULT 'Active',
      created_at     TEXT DEFAULT (datetime('now')),
      updated_at     TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS MaintenanceActionCode (
      code        TEXT PRIMARY KEY,
      description TEXT,
      frequency   TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS MaintenancePlanEvent (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,
      year         INTEGER NOT NULL,
      month        INTEGER NOT NULL,
      action_code  TEXT,
      notes        TEXT,
      created_at   TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS MaintenanceHistory (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,
      year         INTEGER NOT NULL,
      month        INTEGER NOT NULL,
      day          INTEGER,
      action_code  TEXT,
      result       TEXT DEFAULT 'Done',
      performed_by TEXT,
      remark       TEXT,
      file_name    TEXT,
      file_path    TEXT,
      created_by   INTEGER,
      created_at   TEXT DEFAULT (datetime('now'))
    )`);

    // ── Clear existing data ────────────────────────────────────────────────────
    db.run(`DELETE FROM MaintenanceHistory`);
    db.run(`DELETE FROM MaintenancePlanEvent`);
    db.run(`DELETE FROM MaintenanceEquipment`);
    db.run(`DELETE FROM MaintenanceActionCode`);

    db.run(`DELETE FROM sqlite_sequence WHERE name IN ('MaintenanceHistory','MaintenancePlanEvent','MaintenanceEquipment')`, () => {

      // ── Seed action codes ──────────────────────────────────────────────────
      const actionRows = parseCSV(ACTION_CODE_CSV);
      const acStmt = db.prepare(`INSERT OR REPLACE INTO MaintenanceActionCode (code, description, frequency) VALUES (?,?,?)`);
      for (const r of actionRows) {
        if (!r.ActionCode || !r.ActionCode.trim()) continue;
        acStmt.run(r.ActionCode.trim(), r.CheckingItem || null, r.Frequency || null);
      }
      acStmt.finalize(() => {
        console.log(`✅  Action codes seeded`);

        // ── Seed equipment ─────────────────────────────────────────────────────
        const equipRows = parseCSV(EQUIPMENT_CSV);
        // Deduplicate by (year, equipmentNo, equipmentName)
        const equipMap = new Map(); // key = `year||no||name` → row
        for (const r of equipRows) {
          const key = `${r.Year}||${r.EquipmentNo}||${r.EquipmentName}`;
          if (!equipMap.has(key)) equipMap.set(key, r);
        }

        const eqStmt = db.prepare(
          `INSERT INTO MaintenanceEquipment (equipment_no, equipment_name, year) VALUES (?,?,?)`
        );
        for (const r of equipMap.values()) {
          eqStmt.run(parseInt(r.EquipmentNo), r.EquipmentName, parseInt(r.Year));
        }
        eqStmt.finalize(() => {
          // Build lookup: `year||no||name` → id
          db.all(`SELECT id, year, equipment_no, equipment_name FROM MaintenanceEquipment`, (err, eqRows) => {
            const eqLookup = new Map();
            for (const eq of eqRows) {
              const key = `${eq.year}||${eq.equipment_no}||${eq.equipment_name}`;
              eqLookup.set(key, eq.id);
              // Also index by year+no (for cases where name may shift slightly)
              const keyByNo = `${eq.year}||${eq.equipment_no}`;
              if (!eqLookup.has(keyByNo)) eqLookup.set(keyByNo, eq.id);
            }
            console.log(`✅  Equipment seeded: ${eqRows.length} rows`);

            // ── Seed plan events ─────────────────────────────────────────────
            const planRows = parseCSV(PLAN_CSV);
            const planStmt = db.prepare(
              `INSERT INTO MaintenancePlanEvent (equipment_id, year, month, action_code) VALUES (?,?,?,?)`
            );
            let planIns = 0, planSkip = 0;
            for (const r of planRows) {
              const key  = `${r.Year}||${r.EquipmentNo}||${r.EquipmentName}`;
              const keyNo = `${r.Year}||${r.EquipmentNo}`;
              const eqId = eqLookup.get(key) || eqLookup.get(keyNo);
              if (!eqId) { planSkip++; continue; }
              planStmt.run(eqId, parseInt(r.Year), parseInt(r.Month), r.ActionCode || null);
              planIns++;
            }
            planStmt.finalize(() => {
              console.log(`✅  Plan events seeded: ${planIns} (skipped: ${planSkip})`);

              // ── Seed actual history ─────────────────────────────────────────
              const actualRows = parseCSV(ACTUAL_CSV);
              const histStmt = db.prepare(
                `INSERT INTO MaintenanceHistory (equipment_id, year, month, day, action_code, result) VALUES (?,?,?,?,?,?)`
              );
              let histIns = 0, histSkip = 0;
              for (const r of actualRows) {
                const key   = `${r.Year}||${r.EquipmentNo}||${r.EquipmentName}`;
                const keyNo = `${r.Year}||${r.EquipmentNo}`;
                const eqId  = eqLookup.get(key) || eqLookup.get(keyNo);
                if (!eqId) { histSkip++; continue; }
                const day = r.Day && r.Day.trim() ? parseInt(r.Day) : null;
                // If no day and has action code → it's a special action (E = postpone, etc.)
                const actionCode = r.ActionCode && r.ActionCode.trim() ? r.ActionCode.trim() : null;
                // Result: if ActionCode = 'E' → 'Postponed', 'B' → 'Breakdown', else 'Done'
                let result = 'Done';
                if (actionCode === 'E') result = 'Postponed';
                else if (actionCode === 'B') result = 'Breakdown';
                histStmt.run(eqId, parseInt(r.Year), parseInt(r.Month), day, actionCode, result);
                histIns++;
              }
              histStmt.finalize(() => {
                console.log(`✅  History seeded: ${histIns} (skipped: ${histSkip})`);

                // Final counts
                db.get(`SELECT COUNT(*) as cnt FROM MaintenanceEquipment`, (e, r) => console.log(`🗄️   MaintenanceEquipment: ${r?.cnt}`));
                db.get(`SELECT COUNT(*) as cnt FROM MaintenancePlanEvent`,  (e, r) => console.log(`🗄️   MaintenancePlanEvent: ${r?.cnt}`));
                db.get(`SELECT COUNT(*) as cnt FROM MaintenanceHistory`,    (e, r) => console.log(`🗄️   MaintenanceHistory: ${r?.cnt}`));
                db.get(`SELECT COUNT(*) as cnt FROM MaintenanceActionCode`, (e, r) => {
                  console.log(`🗄️   MaintenanceActionCode: ${r?.cnt}`);
                  db.close();
                  console.log('\n✅  Done!');
                });
              });
            });
          });
        });
      });
    });
  });
}
