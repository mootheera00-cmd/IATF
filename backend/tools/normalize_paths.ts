const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbCandidates = [
  path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db'),
  path.resolve(__dirname, '..', '..', 'db', 'nskiatf_doccontrol.db'),
  path.resolve(process.cwd(), 'db', 'nskiatf_doccontrol.db')
];

const dbPath = dbCandidates.find((candidate: string) => fs.existsSync(candidate)) || dbCandidates[0];
const db = new sqlite3.Database(dbPath, (err: any) => {
  if (err) {
    console.error('❌ Cannot open database:', err.message);
    process.exit(1);
  }
});

const backendRoot = path.resolve(__dirname, '..');
const uploadsRoot = path.join(backendRoot, 'uploads');
const secureRoot = path.join(backendRoot, 'secure_storage');

const all = (sql: string, params: any[] = []) =>
  new Promise<any[]>((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any[]) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

const run = (sql: string, params: any[] = []) =>
  new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });

function listFilesRecursive(dir: string, results: string[] = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFilesRecursive(full, results);
    } else {
      results.push(full);
    }
  }
  return results;
}

const uploadsIndex = listFilesRecursive(uploadsRoot);
const secureIndex = listFilesRecursive(secureRoot);

function normalizeSeparators(value: string) {
  return String(value || '').replace(/\\/g, '/');
}

function stripUploadsPrefix(value: string) {
  const normalized = normalizeSeparators(value);
  const lower = normalized.toLowerCase();
  const idx = lower.indexOf('/uploads/');
  if (idx >= 0) {
    return normalized.slice(idx + '/uploads/'.length);
  }
  return null;
}

function stripSecurePrefix(value: string) {
  const normalized = normalizeSeparators(value);
  const lower = normalized.toLowerCase();
  const idx = lower.indexOf('/secure_storage/');
  if (idx >= 0) {
    const rest = normalized.slice(idx + '/secure_storage/'.length);
    return `secure_storage/${rest}`;
  }
  return null;
}

function findByBasename(fileName: string, pool: string[]) {
  const matches = pool.filter((candidate) => path.basename(candidate).toLowerCase() === fileName.toLowerCase());
  if (matches.length === 1) return matches[0];
  return null;
}

function resolveCandidate(value: string) {
  if (!value) return { normalized: value, exists: false, resolvedPath: '' };

  const normalized = String(value);
  if (path.isAbsolute(normalized) && fs.existsSync(normalized)) {
    const rel = path.relative(backendRoot, normalized);
    return { normalized: normalizeSeparators(rel), exists: true, resolvedPath: normalized };
  }

  const uploadsRel = stripUploadsPrefix(normalized);
  if (uploadsRel) {
    const candidate = path.join(uploadsRoot, uploadsRel);
    if (fs.existsSync(candidate)) {
      return { normalized: normalizeSeparators(uploadsRel), exists: true, resolvedPath: candidate };
    }
  }

  const secureRel = stripSecurePrefix(normalized);
  if (secureRel) {
    const candidate = path.join(backendRoot, secureRel);
    if (fs.existsSync(candidate)) {
      return { normalized: normalizeSeparators(secureRel), exists: true, resolvedPath: candidate };
    }
  }

  if (!path.isAbsolute(normalized)) {
    const directUploads = path.join(uploadsRoot, normalized);
    if (fs.existsSync(directUploads)) {
      return { normalized: normalizeSeparators(normalized), exists: true, resolvedPath: directUploads };
    }

    const directSecure = path.join(backendRoot, normalized);
    if (fs.existsSync(directSecure)) {
      return { normalized: normalizeSeparators(normalized), exists: true, resolvedPath: directSecure };
    }
  }

  const baseName = path.basename(normalized);
  const uploadMatch = findByBasename(baseName, uploadsIndex);
  if (uploadMatch) {
    const rel = path.relative(uploadsRoot, uploadMatch);
    return { normalized: normalizeSeparators(rel), exists: true, resolvedPath: uploadMatch };
  }

  const secureMatch = findByBasename(baseName, secureIndex);
  if (secureMatch) {
    const rel = path.relative(backendRoot, secureMatch);
    return { normalized: normalizeSeparators(rel), exists: true, resolvedPath: secureMatch };
  }

  return { normalized: normalizeSeparators(normalized), exists: false, resolvedPath: '' };
}

async function normalizeTable(table: string, column: string, idColumn = 'id') {
  const rows = await all(`SELECT ${idColumn} as id, ${column} as value FROM ${table}`);
  const updates: { id: number; value: string; exists: boolean; resolvedPath: string }[] = [];

  for (const row of rows) {
    if (!row.value) continue;
    const result = resolveCandidate(row.value);
    if (result.normalized && result.normalized !== row.value) {
      updates.push({ id: row.id, value: result.normalized, exists: result.exists, resolvedPath: result.resolvedPath });
    }
  }

  for (const update of updates) {
    await run(`UPDATE ${table} SET ${column} = ? WHERE ${idColumn} = ?`, [update.value, update.id]);
  }

  return {
    table,
    column,
    updated: updates.length,
    missing: updates.filter((u) => !u.exists).length
  };
}

async function main() {
  console.log(`✅ Normalizing paths in DB: ${dbPath}`);

  const targets = [
    { table: 'DocumentRevision', column: 'pdf_uri' },
    { table: 'DocumentRevision', column: 'original_uri' },
    { table: 'DocumentRevision', column: 'file_path_pdf' },
    { table: 'DocumentRevision', column: 'file_path_original' },
    { table: 'ChangeRequest', column: 'dc_source_uri' },
    { table: 'SignedUrlToken', column: 'file_uri' }
  ];

  const results = [];
  for (const target of targets) {
    try {
      const stats = await normalizeTable(target.table, target.column);
      results.push(stats);
    } catch (error: any) {
      console.warn(`⚠️ Skipped ${target.table}.${target.column}: ${error.message}`);
    }
  }

  console.table(results);
  db.close();
}

main().catch((err: any) => {
  console.error('❌ Normalize failed:', err.message || err);
  db.close();
  process.exit(1);
});

export {};
