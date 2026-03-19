/**
 * restore_revision_history.ts
 *
 * One-time script to:
 * 1. Create the DocumentRevisionHistory table (if not yet created by the server)
 * 2. Re-insert the 17 revision dates that were permanently deleted by the
 *    earlier purge_old_revisions.ts --commit run (before the history table existed)
 *
 * These rows will appear as red dates in the Master List.
 *
 * Run: npx tsx tools/restore_revision_history.ts
 */

const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');

const dbCandidates = [
  path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db'),
  path.resolve(__dirname, '..', '..', 'db', 'nskiatf_doccontrol.db'),
];
const dbPath = dbCandidates.find((c: string) => fs.existsSync(c)) || dbCandidates[0];
console.log(`\n📂 DB: ${dbPath}\n`);

const restoreDb = new sqlite3.Database(dbPath, (err: any) => {
  if (err) { console.error('❌ Cannot open DB:', err.message); process.exit(1); }
});

function run(sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) =>
    restoreDb.run(sql, params, (err: any) => err ? reject(err) : resolve()));
}

function get(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) =>
    restoreDb.get(sql, params, (err: any, row: any) => err ? reject(err) : resolve(row)));
}

async function main() {
  // ── 1. Create DocumentRevisionHistory if it doesn't exist ─────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS DocumentRevisionHistory (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id    INTEGER NOT NULL,
      revision_number INTEGER,
      rev_code       TEXT,
      effective_date DATETIME,
      purged_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      purge_reason   TEXT DEFAULT 'retention_rule'
    )
  `);
  console.log('✅ DocumentRevisionHistory table ready');

  // ── 2. Look up document IDs by doc_number ─────────────────────────────────
  const docNos = ['F-01-INV-024', 'F-01-INV-031', 'F-01-TES-001', 'F-01-TES-002'];
  const docMap: Record<string, number> = {};
  for (const dn of docNos) {
    const row = await get('SELECT id FROM Document WHERE doc_number = ?', [dn]);
    if (row) {
      docMap[dn] = row.id;
      console.log(`  ${dn} → id=${row.id}`);
    } else {
      console.warn(`  ⚠️  ${dn} not found in Document table`);
    }
  }

  // ── 3. Data from the purge dry-run output ─────────────────────────────────
  // (dates are as printed by the purge script — these were the deleted rows)
  const lost = [
    { doc: 'F-01-INV-024', rev: 2,    date: '2026-02-23T06:45:28.757Z' },
    { doc: 'F-01-INV-024', rev: 3,    date: '2026-02-25 07:13:59' },
    { doc: 'F-01-INV-024', rev: 4,    date: '2026-02-25 07:51:02' },
    { doc: 'F-01-INV-024', rev: 5,    date: '2026-02-25 08:00:09' },
    { doc: 'F-01-INV-024', rev: 6,    date: '2026-02-25 08:15:57' },
    { doc: 'F-01-INV-031', rev: 2,    date: '2026-02-23T09:27:57.719Z' },
    { doc: 'F-01-INV-031', rev: null, date: '2026-02-24 09:49:45' },
    { doc: 'F-01-INV-031', rev: 1,    date: '2026-02-27 03:10:27' },
    { doc: 'F-01-TES-001', rev: 1,    date: '2026-02-26 03:44:49' },
    { doc: 'F-01-TES-001', rev: 2,    date: '2026-02-26 09:33:29' },
    { doc: 'F-01-TES-001', rev: 3,    date: '2026-02-26 09:39:08' },
    { doc: 'F-01-TES-001', rev: 4,    date: '2026-02-26 09:51:57' },
    { doc: 'F-01-TES-001', rev: 5,    date: '2026-02-27 04:16:25' },
    { doc: 'F-01-TES-001', rev: 6,    date: '2026-02-27 05:05:49' },
    { doc: 'F-01-TES-001', rev: 6,    date: '2026-02-27 05:09:20' },
    { doc: 'F-01-TES-002', rev: 1,    date: '2026-03-04 03:46:47' },
    { doc: 'F-01-TES-002', rev: 2,    date: '2026-03-10 07:53:43' },
  ];

  // ── 4. Insert only rows not already present ────────────────────────────────
  let inserted = 0;
  let skipped  = 0;
  for (const entry of lost) {
    const docId = docMap[entry.doc];
    if (!docId) { skipped++; continue; }

    // Check for duplicate
    const exists = await get(
      `SELECT id FROM DocumentRevisionHistory
       WHERE document_id = ? AND COALESCE(revision_number,-1) = COALESCE(?,-1) AND effective_date = ?`,
      [docId, entry.rev, entry.date]
    );
    if (exists) { skipped++; continue; }

    const revCode = entry.rev != null ? `Rev${entry.rev}` : null;
    await run(
      `INSERT INTO DocumentRevisionHistory (document_id, revision_number, rev_code, effective_date, purge_reason)
       VALUES (?, ?, ?, ?, 'retention_rule')`,
      [docId, entry.rev, revCode, entry.date]
    );
    console.log(`  ✅ Inserted ${entry.doc} Rev${entry.rev ?? '?'} → ${entry.date}`);
    inserted++;
  }

  console.log(`\n✅ Done. Inserted: ${inserted}  Skipped (already exists or doc not found): ${skipped}`);
  restoreDb.close();
}

main().catch((err) => {
  console.error('❌', err);
  restoreDb.close();
  process.exit(1);
});

export {};
