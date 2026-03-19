// tools/seed_kpi_strict.ts
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db');
const sourcePath = path.resolve(__dirname, '..', 'uploads', 'doc-original', 'KPI_KPI-01-001_Rev01_Source.xlsx');

if (!fs.existsSync(sourcePath)) {
  console.error('seed_kpi_strict: source Excel file not found at', sourcePath);
  process.exit(1);
}

const db = new sqlite3.Database(dbPath);

function run(sql: string, params: any[] = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err: any) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql: string, params: any[] = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err: any, row: any) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function seed() {
  await run('ALTER TABLE Document ADD COLUMN doc_number TEXT').catch(() => {});

  const admin: any = await get('SELECT id FROM users WHERE employee_code = ? LIMIT 1', ['ADMIN001']);
  if (!admin) throw new Error('ADMIN001 user not found. Seed users first.');

  const docNumber = 'KPI-01-001';
  const title = 'KPI KPI-01-001';
  const sourceRelativePath = 'doc-original/KPI_KPI-01-001_Rev01_Source.xlsx';
  const now = new Date().toISOString();

  let doc: any = await get(
    `SELECT id, current_revision_id
     FROM Document
     WHERE UPPER(TRIM(COALESCE(doc_number, ''))) = ?
        OR UPPER(TRIM(COALESCE(title, ''))) = ?
     LIMIT 1`,
    [docNumber, title.toUpperCase()]
  );

  if (!doc) {
    const insertDoc: any = await run(
      `INSERT INTO Document (doc_number, title, document_type, department, is_active, created_at)
       VALUES (?, ?, 'KPI', 'Quality', 1, ?)`,
      [docNumber, title, now]
    );
    doc = { id: insertDoc.lastID, current_revision_id: null };
  } else {
    await run(
      `UPDATE Document
       SET doc_number = ?,
           title = ?,
           document_type = 'KPI',
           department = COALESCE(department, 'Quality'),
           is_active = 1
       WHERE id = ?`,
      [docNumber, title, doc.id]
    );
  }

  let revision: any = await get(
    `SELECT id
     FROM DocumentRevision
     WHERE document_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [doc.id]
  );

  if (!revision) {
    const insertRevision: any = await run(
      `INSERT INTO DocumentRevision (
          document_id,
          revision_number,
          file_path_original,
          file_path_pdf,
          status,
          released_by_id,
          created_at
       ) VALUES (?, ?, ?, NULL, 'Released', ?, ?)`,
      [doc.id, 1, sourceRelativePath, admin.id, now]
    );
    revision = { id: insertRevision.lastID };
  } else {
    await run(
      `UPDATE DocumentRevision
       SET revision_number = ?,
           file_path_original = ?,
           status = 'Released',
           released_by_id = ?,
           created_at = ?
       WHERE id = ?`,
      [1, sourceRelativePath, admin.id, now, revision.id]
    );
  }

  await run(
    `UPDATE Document
     SET current_revision_id = ?
     WHERE id = ?`,
    [revision.id, doc.id]
  );

  console.log(
    JSON.stringify({
      ok: true,
      document_id: doc.id,
      revision_id: revision.id,
      doc_number: docNumber,
      title,
      source_path: sourceRelativePath
    })
  );
}

seed()
  .then(() => db.close())
  .catch((err: any) => {
    console.error('seed_kpi_strict error:', err.message);
    db.close(() => process.exit(1));
  });

export {};
