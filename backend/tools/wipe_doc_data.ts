/**
 * wipe_doc_data.ts
 *
 * Wipes all document, change request, approval, and log data for a fresh start.
 * Preserves: users, roles, positions (and the admin account).
 * Also preserves: Calibration, Training, Maintenance data (separate modules).
 *
 * Run: npx tsx tools/wipe_doc_data.ts
 * Add flag --confirm to actually commit (otherwise dry-run).
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const isDryRun = !process.argv.includes('--confirm');

const dbCandidates = [
  path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db'),
  path.resolve(__dirname, '..', '..', 'db', 'nskiatf_doccontrol.db'),
];
const dbPath = dbCandidates.find((c: string) => fs.existsSync(c)) || dbCandidates[0];
console.log(`\n📂 DB: ${dbPath}`);
console.log(isDryRun ? '🔍 DRY RUN — pass --confirm to actually wipe\n' : '⚠️  LIVE RUN — changes will be committed\n');

const wipeDb = new sqlite3.Database(dbPath, (err: any) => {
  if (err) { console.error('❌ Cannot open DB:', err.message); process.exit(1); }
});

function runSql(sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) =>
    wipeDb.run(sql, params, (err: any) => err ? reject(err) : resolve()));
}

function getSql(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) =>
    wipeDb.get(sql, params, (err: any, row: any) => err ? reject(err) : resolve(row)));
}

function allSql(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) =>
    wipeDb.all(sql, params, (err: any, rows: any[]) => err ? reject(err) : resolve(rows || [])));
}

async function countTable(tableName: string): Promise<number> {
  try {
    const row = await getSql(`SELECT COUNT(*) as n FROM ${tableName}`);
    return row?.n ?? 0;
  } catch {
    return -1; // table doesn't exist
  }
}

// Upload folders to wipe
const UPLOAD_DIRS = [
  path.resolve(__dirname, '..', 'uploads', 'doc-original'),
  path.resolve(__dirname, '..', 'uploads', 'doc-pdf'),
  path.resolve(__dirname, '..', 'uploads', 'doc-unsigned-pdf'),
  path.resolve(__dirname, '..', 'uploads', 'staging'),
  path.resolve(__dirname, '..', 'secure_storage'),
];

function wipeDirectory(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    console.log(`  ⏩ (skip, not found) ${dirPath}`);
    return 0;
  }
  const files = fs.readdirSync(dirPath);
  let count = 0;
  for (const file of files) {
    if (file === '.gitkeep' || file === '.gitignore') continue;
    const full = path.join(dirPath, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      // recurse
      count += wipeDirectoryContents(full);
    } else {
      count++;
      if (!isDryRun) fs.unlinkSync(full);
    }
  }
  return count;
}

function wipeDirectoryContents(dirPath: string): number {
  let count = 0;
  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    const full = path.join(dirPath, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      count += wipeDirectoryContents(full);
      if (!isDryRun) try { fs.rmdirSync(full); } catch {}
    } else {
      count++;
      if (!isDryRun) fs.unlinkSync(full);
    }
  }
  return count;
}

async function main() {
  // ─── 1. Count current data ────────────────────────────────────────────────
  const tables = [
    'Document', 'DocumentRevision', 'DocumentRevisionHistory',
    'ChangeRequest', 'ApprovalRecord',
    'AuditEvent', 'audit_logs', 'access_logs',
    'Notification', 'SignedUrlToken',
  ];
  console.log('📊 Current row counts:');
  for (const t of tables) {
    const n = await countTable(t);
    console.log(`  ${t}: ${n < 0 ? '(table not found)' : n} rows`);
  }

  // ─── 2. Count upload files ────────────────────────────────────────────────
  console.log('\n📁 Upload file counts:');
  for (const dir of UPLOAD_DIRS) {
    const n = wipeDirectory(dir);
    if (isDryRun) console.log(`  Would delete ${n} file(s) from: ${dir}`);
    else console.log(`  Deleted ${n} file(s) from: ${dir}`);
  }

  if (isDryRun) {
    console.log('\n✅ Dry-run complete. Pass --confirm to actually wipe data.');
    wipeDb.close();
    return;
  }

  // ─── 3. Wipe DB tables (order matters for FK) ────────────────────────────
  console.log('\n🗑️  Wiping database tables...');

  // Logs & tokens
  await runSql('DELETE FROM AuditEvent').then(() => console.log('  ✅ AuditEvent cleared'));
  await runSql('DELETE FROM audit_logs').catch(() => console.log('  ⏩ audit_logs (skip)'));
  await runSql('DELETE FROM access_logs').catch(() => console.log('  ⏩ access_logs (skip)'));
  await runSql('DELETE FROM Notification').then(() => console.log('  ✅ Notification cleared'));
  await runSql('DELETE FROM SignedUrlToken').then(() => console.log('  ✅ SignedUrlToken cleared'));

  // Approval & change requests
  await runSql('DELETE FROM ApprovalRecord').then(() => console.log('  ✅ ApprovalRecord cleared'));
  await runSql('DELETE FROM ChangeRequest').then(() => console.log('  ✅ ChangeRequest cleared'));

  // Documents
  await runSql('DELETE FROM DocumentRevisionHistory').catch(() => console.log('  ⏩ DocumentRevisionHistory (skip)'));
  await runSql('DELETE FROM DocumentRevision').then(() => console.log('  ✅ DocumentRevision cleared'));
  await runSql('DELETE FROM Document').then(() => console.log('  ✅ Document cleared'));

  // Reset auto-increment sequences
  const seqTables = [
    'Document', 'DocumentRevision', 'DocumentRevisionHistory',
    'ChangeRequest', 'ApprovalRecord',
    'AuditEvent', 'Notification', 'SignedUrlToken',
  ];
  for (const t of seqTables) {
    await runSql('DELETE FROM sqlite_sequence WHERE name = ?', [t]).catch(() => {});
  }
  console.log('  ✅ Auto-increment sequences reset');

  // ─── 4. Write a "SYSTEM_WIPE" audit event ────────────────────────────────
  // Find first ADMIN user
  const admin: any = await getSql(`
    SELECT u.id FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE r.name = 'ADMIN'
    ORDER BY u.id ASC LIMIT 1
  `);
  const actorId = admin?.id ?? null;

  await runSql(
    `INSERT INTO AuditEvent (entity_type, entity_id, actor_id, action, metadata, created_at)
     VALUES ('System', 0, ?, 'SYSTEM_WIPE', ?, CURRENT_TIMESTAMP)`,
    [actorId, JSON.stringify({ reason: 'Fresh start wipe via tools/wipe_doc_data.ts', wiped_tables: seqTables })]
  );
  console.log('  ✅ System wipe audit event recorded');

  console.log('\n✅ Wipe complete — database is fresh!');
  wipeDb.close();
}

main().catch((err) => {
  console.error('❌', err);
  wipeDb.close();
  process.exit(1);
});

export {};
