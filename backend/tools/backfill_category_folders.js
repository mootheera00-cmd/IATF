const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { ORIGINAL_DIR, PDF_DIR } = require('../config/storage');

const backendRoot = path.resolve(__dirname, '..');
const uploadsRoot = path.join(backendRoot, 'uploads');
const dbPath = path.join(backendRoot, 'db', 'nskiatf_doccontrol.db');
const dryRun = process.argv.includes('--dry-run');

const db = new sqlite3.Database(dbPath);

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function toCategoryFolder(value) {
  const raw = String(value || 'uncategorized').trim().toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'uncategorized';
}

function toUnixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function isAlreadyCategorized(storedPath, kind) {
  const normalized = toUnixPath(storedPath).toLowerCase();

  const relativePrefix = kind === 'pdf' ? 'doc-pdf/' : 'doc-original/';
  if (normalized.startsWith(relativePrefix)) {
    return normalized.split('/').length >= 3;
  }

  const uploadPrefix = kind === 'pdf' ? 'uploads/doc-pdf/' : 'uploads/doc-original/';
  if (normalized.startsWith(uploadPrefix)) {
    return normalized.split('/').length >= 4;
  }

  if (path.isAbsolute(storedPath)) {
    const marker = `${path.sep}${kind === 'pdf' ? 'doc-pdf' : 'doc-original'}${path.sep}`;
    const lowerAbs = storedPath.toLowerCase();
    const markerIndex = lowerAbs.indexOf(marker.toLowerCase());
    if (markerIndex !== -1) {
      const rest = lowerAbs.slice(markerIndex + marker.length);
      return rest.split(path.sep).filter(Boolean).length >= 2;
    }
  }

  return false;
}

function resolveExistingPath(storedPath, kind) {
  const normalized = toUnixPath(storedPath);

  if (path.isAbsolute(storedPath) && fs.existsSync(storedPath)) {
    return storedPath;
  }

  const baseName = path.basename(normalized);
  const withoutUploadsPrefix = normalized.replace(/^uploads\//i, '');
  const withoutKindPrefix = normalized.replace(new RegExp(`^${kind === 'pdf' ? 'doc-pdf' : 'doc-original'}/`, 'i'), '');
  const candidates = [
    path.resolve(backendRoot, normalized),
    path.resolve(uploadsRoot, normalized),
    path.resolve(uploadsRoot, withoutUploadsPrefix),
    path.join(kind === 'pdf' ? PDF_DIR : ORIGINAL_DIR, withoutKindPrefix),
    path.join(kind === 'pdf' ? PDF_DIR : ORIGINAL_DIR, baseName),
    path.join(uploadsRoot, kind === 'pdf' ? 'doc-pdf' : 'doc-original', baseName),
    path.join(uploadsRoot, baseName),
    path.resolve(backendRoot, baseName)
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function getRootForColumn(column, kind) {
  if (column === 'file_path_pdf') return path.join(uploadsRoot, 'doc-pdf');
  if (column === 'file_path_original') return path.join(uploadsRoot, 'doc-original');
  return kind === 'pdf' ? PDF_DIR : ORIGINAL_DIR;
}

function buildTargetPath(sourceAbsolutePath, kind, categoryFolder, revisionId, column) {
  const root = getRootForColumn(column, kind);
  const categoryDir = path.join(root, categoryFolder);
  if (!fs.existsSync(categoryDir) && !dryRun) {
    fs.mkdirSync(categoryDir, { recursive: true });
  }

  const sourceName = path.basename(sourceAbsolutePath);
  let targetPath = path.join(categoryDir, sourceName);

  if (fs.existsSync(targetPath) && path.resolve(sourceAbsolutePath) !== path.resolve(targetPath)) {
    const ext = path.extname(sourceName);
    const nameOnly = path.basename(sourceName, ext);
    targetPath = path.join(categoryDir, `${nameOnly}-rev${revisionId}${ext}`);
  }

  return targetPath;
}

function moveFile(sourcePath, targetPath) {
  if (dryRun) return;
  if (path.resolve(sourcePath) === path.resolve(targetPath)) return;

  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (err) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(sourcePath, targetPath);
      fs.unlinkSync(sourcePath);
      return;
    }
    throw err;
  }
}

function makeStoredValue(column, originalValue, targetAbsolutePath, kind, categoryFolder) {
  const kindFolder = kind === 'pdf' ? 'doc-pdf' : 'doc-original';
  const fileName = path.basename(targetAbsolutePath);

  if (column === 'file_path_pdf' || column === 'file_path_original') {
    return `${kindFolder}/${categoryFolder}/${fileName}`;
  }

  if (path.isAbsolute(originalValue)) {
    return targetAbsolutePath;
  }

  if (toUnixPath(originalValue).toLowerCase().startsWith('uploads/')) {
    return targetAbsolutePath;
  }

  return targetAbsolutePath;
}

async function main() {
  const docRevColumns = await all('PRAGMA table_info(DocumentRevision)');
  const hasColumn = (name) => docRevColumns.some((col) => col.name === name);

  const selectableColumns = ['id', 'document_id'];
  if (hasColumn('file_path_pdf')) selectableColumns.push('file_path_pdf');
  if (hasColumn('file_path_original')) selectableColumns.push('file_path_original');
  if (hasColumn('pdf_uri')) selectableColumns.push('pdf_uri');
  if (hasColumn('original_uri')) selectableColumns.push('original_uri');

  if (selectableColumns.length <= 2) {
    console.log('No file path columns found in DocumentRevision, nothing to migrate.');
    return;
  }

  const rows = await all(
    `SELECT ${selectableColumns.map((c) => `r.${c}`).join(', ')}, d.document_type
     FROM DocumentRevision r
     LEFT JOIN Document d ON d.id = r.document_id
     ORDER BY r.id ASC`
  );

  let updatedRows = 0;
  let movedFiles = 0;
  let skipped = 0;
  let missing = 0;

  for (const row of rows) {
    const categoryFolder = toCategoryFolder(row.document_type);
    const updates = [];
    const params = [];

    const fields = [
      { column: 'file_path_pdf', kind: 'pdf' },
      { column: 'pdf_uri', kind: 'pdf' },
      { column: 'file_path_original', kind: 'original' },
      { column: 'original_uri', kind: 'original' }
    ].filter((item) => hasColumn(item.column));

    for (const field of fields) {
      const currentValue = row[field.column];
      if (!currentValue) continue;

      const sourceAbsolutePath = resolveExistingPath(currentValue, field.kind);
      if (!sourceAbsolutePath) {
        missing += 1;
        continue;
      }

      const precomputedTargetPath = buildTargetPath(sourceAbsolutePath, field.kind, categoryFolder, row.id, field.column);
      const categorized = isAlreadyCategorized(currentValue, field.kind);
      const isInExpectedRoot = path.resolve(sourceAbsolutePath) === path.resolve(precomputedTargetPath);
      if (categorized && isInExpectedRoot) {
        skipped += 1;
        continue;
      }

      const targetAbsolutePath = precomputedTargetPath;
      moveFile(sourceAbsolutePath, targetAbsolutePath);
      if (path.resolve(sourceAbsolutePath) !== path.resolve(targetAbsolutePath)) {
        movedFiles += 1;
      }

      const nextValue = makeStoredValue(field.column, currentValue, targetAbsolutePath, field.kind, categoryFolder);
      if (nextValue !== currentValue) {
        updates.push(`${field.column} = ?`);
        params.push(nextValue);
      }
    }

    if (updates.length > 0) {
      params.push(row.id);
      if (!dryRun) {
        await run(`UPDATE DocumentRevision SET ${updates.join(', ')} WHERE id = ?`, params);
      }
      updatedRows += 1;
    }
  }

  console.log(
    JSON.stringify({
      ok: true,
      dry_run: dryRun,
      revisions_scanned: rows.length,
      revisions_updated: updatedRows,
      files_moved: movedFiles,
      paths_skipped_already_categorized: skipped,
      paths_missing_source_file: missing
    })
  );
}

main()
  .then(() => db.close())
  .catch((err) => {
    console.error('backfill_category_folders error:', err.message);
    db.close(() => process.exit(1));
  });
