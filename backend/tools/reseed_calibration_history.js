/**
 * reseed_calibration_history.js
 *
 * What this script does:
 *  1. Moves INV-SC-02 from CalibrationEquipment (external) → InHouseCalibrationEquipment
 *     (CAL INTERNAL.csv marks it as INTERNAL CALIBRATION)
 *  2. Clears ALL existing CalibrationHistory records
 *  3. Re-seeds history ONLY for tools that:
 *       a. Exist in CalibrationEquipment   (source = 'external')
 *       b. Exist in InHouseCalibrationEquipment (source = 'inhouse')
 *     from instrument_events_full.csv  (columns: sheet_name, instrument_no, date, action, result, remark)
 *  4. Deduplicates entries by (instrument_no, date) — keeps the one with a remark
 *  5. Normalises results: "Paass" / "Use correction" → "Pass"
 *  6. Prints a full report of what was inserted vs skipped
 *
 * Run from IATF/backend:
 *   node tools/reseed_calibration_history.js
 */

const path    = require('path');
const fs      = require('fs');
const sqlite3 = require('sqlite3').verbose();

// ─── Paths ────────────────────────────────────────────────────────────────────
const DB_PATH  = path.join(__dirname, '..', 'db', 'nskiatf_doccontrol.db');
const CSV_PATH = path.join(__dirname, '..', '..', '..', 'instrument_events_full.csv');

if (!fs.existsSync(CSV_PATH)) {
  console.error('❌  CSV not found at:', CSV_PATH);
  process.exit(1);
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(filePath) {
  const raw  = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const header = lines[0].split(',');
  return lines.slice(1).map(line => {
    // Handle quoted fields containing commas
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    const obj = {};
    header.forEach((h, i) => obj[h.trim()] = (cols[i] || '').trim());
    return obj;
  });
}

// ─── Normalise result ─────────────────────────────────────────────────────────
function normaliseResult(raw) {
  const s = (raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (s === 'pass' || s === 'paass' || s === 'use correction') return 'Pass';
  if (s === 'not pass' || s === 'fail') return 'Not Pass';
  return 'Pass'; // default
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) { console.error('❌  Cannot open DB:', err.message); process.exit(1); }
  console.log('✅  Opened DB:', DB_PATH);
  run();
});

function run() {
  db.serialize(() => {

    // ── Step 1: Check if INV-SC-02 is in CalibrationEquipment ─────────────────
    db.get(
      `SELECT * FROM CalibrationEquipment WHERE equipment_id = 'INV-SC-02'`,
      (err, row) => {
        if (err) console.error('Step 1 error:', err.message);
        if (row) {
          console.log('\n📦  INV-SC-02 found in CalibrationEquipment (external) → moving to InHouseCalibrationEquipment');
          moveToInhouse(row, afterMove);
        } else {
          console.log('\nℹ️   INV-SC-02 not in CalibrationEquipment — checking InHouseCalibrationEquipment');
          db.get(`SELECT id FROM InHouseCalibrationEquipment WHERE equipment_id = 'INV-SC-02'`, (e2, r2) => {
            if (r2) console.log('✅  INV-SC-02 already in InHouseCalibrationEquipment (id=' + r2.id + ')');
            else    console.log('⚠️   INV-SC-02 not found anywhere — skipping move');
            afterMove();
          });
        }
      }
    );
  });
}

// ─── Move INV-SC-02 to InHouseCalibrationEquipment ───────────────────────────
function moveToInhouse(row, cb) {
  db.serialize(() => {
    // Insert into InHouseCalibrationEquipment (copy all columns)
    db.run(
      `INSERT OR IGNORE INTO InHouseCalibrationEquipment (
         equipment_name, equipment_id, equipment_type, manufacturer, model,
         serial_number, location, calibration_method, calibration_interval,
         calibrated_by, acceptance_criteria, calibration_date, next_due_date,
         certificate_number, notes
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        row.equipment_name, row.equipment_id, row.equipment_type,
        row.manufacturer,   row.model,        row.serial_number,
        row.location,       row.calibration_method, row.calibration_interval,
        row.calibrated_by,  row.acceptance_criteria, row.calibration_date,
        row.next_due_date,  row.certificate_number,  row.notes,
      ],
      function(e) {
        if (e) { console.error('  ❌  Insert InHouse error:', e.message); }
        else   { console.log('  ✅  Inserted INV-SC-02 into InHouseCalibrationEquipment (id=' + this.lastID + ')'); }
        // Delete from CalibrationEquipment
        db.run(`DELETE FROM CalibrationEquipment WHERE equipment_id = 'INV-SC-02'`, (e2) => {
          if (e2) console.error('  ❌  Delete external error:', e2.message);
          else    console.log('  🗑️   Deleted INV-SC-02 from CalibrationEquipment');
          cb();
        });
      }
    );
  });
}

// ─── After move: clear history + reseed ──────────────────────────────────────
function afterMove() {
  db.serialize(() => {

    // ── Step 2: Clear all existing CalibrationHistory ─────────────────────────
    db.run(`DELETE FROM CalibrationHistory`, (err) => {
      if (err) { console.error('❌  Clear history error:', err.message); return; }
      console.log('\n🗑️   Cleared all existing CalibrationHistory records\n');
      reseed();
    });
  });
}

function reseed() {
  db.serialize(() => {

    // ── Step 3: Load equipment maps ────────────────────────────────────────────
    db.all(`SELECT id, equipment_id FROM CalibrationEquipment`, (e1, extRows) => {
      if (e1) { console.error('❌  Load external error:', e1.message); return; }

      db.all(`SELECT id, equipment_id FROM InHouseCalibrationEquipment`, (e2, inhRows) => {
        if (e2) { console.error('❌  Load inhouse error:', e2.message); return; }

        // Build lookup: equipment_id → { rowId, source }
        const lookup = {};
        (extRows || []).forEach(r => { lookup[r.equipment_id] = { rowId: r.id, source: 'external' }; });
        (inhRows || []).forEach(r => { lookup[r.equipment_id] = { rowId: r.id, source: 'inhouse'  }; });

        console.log(`📋  Equipment in DB: ${extRows.length} external, ${inhRows.length} inhouse`);

        // ── Step 4: Parse CSV ─────────────────────────────────────────────────
        const rows = parseCSV(CSV_PATH);
        console.log(`📄  CSV rows loaded: ${rows.length}`);

        // Deduplicate by (instrument_no, date) — prefer row with remark
        const dedupMap = new Map();
        for (const r of rows) {
          const instrNo = (r['instrument_no'] || '').trim();
          const calDate = (r['date']          || '').trim();
          if (!instrNo || !calDate) continue;
          const key = `${instrNo}||${calDate}`;
          const existing = dedupMap.get(key);
          // Keep if no existing, or if this row has a remark and existing doesn't
          if (!existing || (!existing.remark && r['remark'])) {
            dedupMap.set(key, {
              instrument_no: instrNo,
              cal_date:      calDate,
              cal_result:    normaliseResult(r['result']),
              action:        (r['action'] || '').trim() || null,
              remark:        (r['remark'] || '').trim() || null,
            });
          }
        }

        const deduped = [...dedupMap.values()];
        console.log(`🔍  Unique (instrument_no, date) pairs: ${deduped.length}`);

        // ── Step 5: Insert ────────────────────────────────────────────────────
        let inserted = 0, skipped = 0;
        const skippedIds = new Set();

        const stmt = db.prepare(
          `INSERT INTO CalibrationHistory
             (source, equipment_row_id, equipment_id, performed_date, scheduled_date,
              result, action, cal_status, remark, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 1)`
        );

        for (const row of deduped) {
          const eq = lookup[row.instrument_no];
          if (!eq) {
            skippedIds.add(row.instrument_no);
            skipped++;
            continue;
          }
          stmt.run(
            eq.source, eq.rowId, row.instrument_no,
            row.cal_date, row.cal_date,
            row.cal_result, row.action, row.remark
          );
          inserted++;
        }

        stmt.finalize((err) => {
          if (err) console.error('❌  Finalize error:', err.message);

          console.log(`\n✅  Inserted: ${inserted} records`);
          console.log(`⏭️   Skipped (no equipment in DB): ${skipped}`);
          if (skippedIds.size > 0) {
            console.log(`\n📋  Skipped instrument IDs (not in DB):`);
            [...skippedIds].sort().forEach(id => console.log('    ', id));
          }

          // Final verification
          db.get(`SELECT COUNT(*) as cnt FROM CalibrationHistory`, (e, r) => {
            console.log(`\n🗄️   Total CalibrationHistory records now: ${r?.cnt}`);

            db.all(
              `SELECT source, COUNT(*) as cnt FROM CalibrationHistory GROUP BY source`,
              (e2, r2) => {
                (r2 || []).forEach(x => console.log(`   ${x.source}: ${x.cnt} records`));
                db.close();
                console.log('\n✅  Done!');
              }
            );
          });
        });
      });
    });
  });
}
