// backend/services/dcrService.ts
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dbCandidates = [
  path.resolve(__dirname, '..', '..', 'db', 'nskiatf_doccontrol.db'),
  path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db'),
  path.resolve(process.cwd(), 'db', 'nskiatf_doccontrol.db')
];
const dbPath = dbCandidates.find((candidate: string) => fs.existsSync(candidate)) || dbCandidates[0];
const db = new sqlite3.Database(dbPath);
const signedUrlService = require('./signedUrlService');
const notificationService = require('./notificationService');
const auditService = require('./auditService');
const fileService = require('./fileService');
const { ORIGINAL_DIR, PDF_DIR } = require('../config/storage');

// Promisify db.run and db.get
const run = (sql: string, params?: any[]) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err: any) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const get = (sql: string, params?: any[]) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err: any, row: any) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const all = (sql: string, params?: any[]) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

const safeAddColumn = async (table: string, column: string, definition: string) => {
  try {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, []);
  } catch (error: any) {
    if (String(error?.message || '').includes('duplicate column name')) {
      return;
    }
    throw error;
  }
};

let schemaCompatibilityReady = false;

async function ensureChangeRequestSchemaCompatibility() {
  if (schemaCompatibilityReady) {
    return;
  }

  const crTable: any = await get(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='ChangeRequest'`,
    []
  );
  if (!crTable) {
    await run(
      `CREATE TABLE IF NOT EXISTS ChangeRequest (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        requester_id INTEGER NOT NULL,
        reason TEXT,
        status TEXT DEFAULT 'Draft',
        assigned_manager_id INTEGER,
        submitted_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES Document(id),
        FOREIGN KEY (requester_id) REFERENCES users(id),
        FOREIGN KEY (assigned_manager_id) REFERENCES users(id)
      )`,
      []
    );
  }

  const crCols = (await all(`PRAGMA table_info(ChangeRequest)`, [])) as any[];
  const hasColumn = (name: string) => crCols.some((c: any) => c.name === name);

  if (!hasColumn('manager_id')) {
    await run(`ALTER TABLE ChangeRequest ADD COLUMN manager_id BIGINT`, []);
  }
  if (!hasColumn('latest_working_revision_id')) {
    await run(`ALTER TABLE ChangeRequest ADD COLUMN latest_working_revision_id BIGINT`, []);
  }
  if (!hasColumn('preapproved_at')) {
    await run(`ALTER TABLE ChangeRequest ADD COLUMN preapproved_at TIMESTAMP NULL`, []);
  }
  if (!hasColumn('final_approved_at')) {
    await run(`ALTER TABLE ChangeRequest ADD COLUMN final_approved_at TIMESTAMP NULL`, []);
  }
  if (!hasColumn('rejected_at')) {
    await run(`ALTER TABLE ChangeRequest ADD COLUMN rejected_at TIMESTAMP NULL`, []);
  }
  if (!hasColumn('returned_at')) {
    await run(`ALTER TABLE ChangeRequest ADD COLUMN returned_at TIMESTAMP NULL`, []);
  }
  if (!hasColumn('checker_id')) {
    await run(`ALTER TABLE ChangeRequest ADD COLUMN checker_id BIGINT`, []);
  }
  if (!hasColumn('approver_id')) {
    await run(`ALTER TABLE ChangeRequest ADD COLUMN approver_id BIGINT`, []);
  }
  if (!hasColumn('document_level')) {
    await run(`ALTER TABLE ChangeRequest ADD COLUMN document_level VARCHAR(8)`, []);
  }
  if (!hasColumn('dc_initial_at')) {
    await run(`ALTER TABLE ChangeRequest ADD COLUMN dc_initial_at TIMESTAMP NULL`, []);
  }
  if (!hasColumn('checker_approved_at')) {
    await run(`ALTER TABLE ChangeRequest ADD COLUMN checker_approved_at TIMESTAMP NULL`, []);
  }
  if (!hasColumn('approver_approved_at')) {
    await run(`ALTER TABLE ChangeRequest ADD COLUMN approver_approved_at TIMESTAMP NULL`, []);
  }
  if (!hasColumn('dc_final_approved_at')) {
    await run(`ALTER TABLE ChangeRequest ADD COLUMN dc_final_approved_at TIMESTAMP NULL`, []);
  }
  if (!hasColumn('returned_by_role')) {
    await run(`ALTER TABLE ChangeRequest ADD COLUMN returned_by_role VARCHAR(32)`, []);
  }
  if (!hasColumn('returned_comment')) {
    await run(`ALTER TABLE ChangeRequest ADD COLUMN returned_comment TEXT`, []);
  }
  if (!hasColumn('closed_at')) {
    await safeAddColumn('ChangeRequest', 'closed_at', 'TIMESTAMP');
  }
  if (!hasColumn('dc_source_uri')) {
    await safeAddColumn('ChangeRequest', 'dc_source_uri', 'TEXT');
  }
  if (!hasColumn('dc_source_sha256')) {
    await safeAddColumn('ChangeRequest', 'dc_source_sha256', 'CHAR(64)');
  }
  if (!hasColumn('dc_source_name')) {
    await safeAddColumn('ChangeRequest', 'dc_source_name', 'TEXT');
  }
  if (!hasColumn('delete_requested_at')) {
    await safeAddColumn('ChangeRequest', 'delete_requested_at', 'TIMESTAMP');
  }
  if (!hasColumn('delete_requested_by')) {
    await safeAddColumn('ChangeRequest', 'delete_requested_by', 'BIGINT');
  }
  if (!hasColumn('delete_reason')) {
    await safeAddColumn('ChangeRequest', 'delete_reason', 'TEXT');
  }
  if (!hasColumn('delete_approved_at')) {
    await safeAddColumn('ChangeRequest', 'delete_approved_at', 'TIMESTAMP');
  }
  if (!hasColumn('delete_approved_by')) {
    await safeAddColumn('ChangeRequest', 'delete_approved_by', 'BIGINT');
  }
  if (!hasColumn('delete_approved_comment')) {
    await safeAddColumn('ChangeRequest', 'delete_approved_comment', 'TEXT');
  }
  if (!hasColumn('request_type')) {
    await safeAddColumn('ChangeRequest', 'request_type', 'TEXT');
  }
  if (!hasColumn('reupload_requested_by')) {
    await safeAddColumn('ChangeRequest', 'reupload_requested_by', 'BIGINT');
  }
  if (!hasColumn('reupload_assignee_id')) {
    await safeAddColumn('ChangeRequest', 'reupload_assignee_id', 'BIGINT');
  }
  if (!hasColumn('reupload_target_revision_id')) {
    await safeAddColumn('ChangeRequest', 'reupload_target_revision_id', 'BIGINT');
  }
  if (!hasColumn('reupload_is_current')) {
    await safeAddColumn('ChangeRequest', 'reupload_is_current', 'INTEGER');
  }

  if (hasColumn('assigned_manager_id')) {
    await run(
      `UPDATE ChangeRequest
             SET manager_id = COALESCE(manager_id, assigned_manager_id)
             WHERE assigned_manager_id IS NOT NULL`,
      []
    );
  }

  schemaCompatibilityReady = true;
}

async function ensureApprovalRecordCompatibility() {
  const approvalTable: any = await get(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='ApprovalRecord'`,
    []
  );
  if (!approvalTable) {
    await run(
      `CREATE TABLE IF NOT EXISTS ApprovalRecord (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        change_request_id INTEGER NOT NULL,
        approver_id INTEGER NOT NULL,
        gate TEXT,
        decision TEXT,
        comments TEXT,
        approved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (change_request_id) REFERENCES ChangeRequest(id),
        FOREIGN KEY (approver_id) REFERENCES users(id)
      )`,
      []
    );
  }

  const approvalCols = (await all(`PRAGMA table_info(ApprovalRecord)`, [])) as any[];
  const hasApprovalCol = (name: string) => approvalCols.some((c: any) => c.name === name);

  if (!hasApprovalCol('step')) {
    await run(`ALTER TABLE ApprovalRecord ADD COLUMN step TEXT`, []);
  }
  if (!hasApprovalCol('decided_by')) {
    await run(`ALTER TABLE ApprovalRecord ADD COLUMN decided_by BIGINT`, []);
  }
  if (!hasApprovalCol('decided_by_role')) {
    await run(`ALTER TABLE ApprovalRecord ADD COLUMN decided_by_role VARCHAR(32)`, []);
  }
  if (!hasApprovalCol('decided_at')) {
    await run(`ALTER TABLE ApprovalRecord ADD COLUMN decided_at TIMESTAMP`, []);
    await run(
      `UPDATE ApprovalRecord SET decided_at = COALESCE(approved_at, created_at, CURRENT_TIMESTAMP) WHERE decided_at IS NULL`,
      []
    );
  }
  if (!hasApprovalCol('comment')) {
    await run(`ALTER TABLE ApprovalRecord ADD COLUMN comment TEXT`, []);
  }
  if (!hasApprovalCol('cr_id')) {
    await run(`ALTER TABLE ApprovalRecord ADD COLUMN cr_id BIGINT`, []);
    await run(`UPDATE ApprovalRecord SET cr_id = change_request_id WHERE cr_id IS NULL`, []);
  }
}

async function ensureDocumentRevisionSchemaCompatibility() {
  const revisionTable: any = await get(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='DocumentRevision'`,
    []
  );
  if (!revisionTable) {
    await run(
      `CREATE TABLE IF NOT EXISTS DocumentRevision (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        revision_number INTEGER,
        file_path_original TEXT,
        file_path_pdf TEXT,
        status TEXT DEFAULT 'Draft',
        hash_original TEXT,
        hash_pdf TEXT,
        released_by_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES Document(id),
        FOREIGN KEY (released_by_id) REFERENCES users(id)
      )`,
      []
    );
  }

  const drCols = (await all(`PRAGMA table_info(DocumentRevision)`, [])) as any[];
  const hasDrCol = (name: string) => drCols.some((c: any) => c.name === name);

  if (!hasDrCol('rev_code')) {
    await run(`ALTER TABLE DocumentRevision ADD COLUMN rev_code VARCHAR(32)`, []);
  }
  if (!hasDrCol('original_uri')) {
    await run(`ALTER TABLE DocumentRevision ADD COLUMN original_uri TEXT`, []);
  }
  if (!hasDrCol('unsigned_pdf_uri')) {
    await safeAddColumn('DocumentRevision', 'unsigned_pdf_uri', 'TEXT');
  }
  if (!hasDrCol('unsigned_pdf_sha256')) {
    await safeAddColumn('DocumentRevision', 'unsigned_pdf_sha256', 'CHAR(64)');
  }
  if (!hasDrCol('original_sha256')) {
    await run(`ALTER TABLE DocumentRevision ADD COLUMN original_sha256 CHAR(64)`, []);
  }
  if (!hasDrCol('pdf_uri')) {
    await run(`ALTER TABLE DocumentRevision ADD COLUMN pdf_uri TEXT`, []);
  }
  if (!hasDrCol('pdf_sha256')) {
    await run(`ALTER TABLE DocumentRevision ADD COLUMN pdf_sha256 CHAR(64)`, []);
  }
  if (!hasDrCol('change_summary')) {
    await run(`ALTER TABLE DocumentRevision ADD COLUMN change_summary TEXT`, []);
  }
  if (!hasDrCol('created_by')) {
    await run(`ALTER TABLE DocumentRevision ADD COLUMN created_by BIGINT`, []);
  }
  if (!hasDrCol('released_by')) {
    await run(`ALTER TABLE DocumentRevision ADD COLUMN released_by BIGINT`, []);
  }
  if (!hasDrCol('released_at')) {
    await run(`ALTER TABLE DocumentRevision ADD COLUMN released_at TIMESTAMP NULL`, []);
  }
  if (!hasDrCol('supersedes_revision_id')) {
    await run(`ALTER TABLE DocumentRevision ADD COLUMN supersedes_revision_id BIGINT`, []);
  }

  // DocumentRevisionHistory — permanent log of purged revision effective dates
  // so the Master List can still display them in red after the revision row is deleted
  await run(`
    CREATE TABLE IF NOT EXISTS DocumentRevisionHistory (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id  INTEGER NOT NULL,
      revision_number INTEGER,
      rev_code     TEXT,
      effective_date DATETIME,
      purged_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      purge_reason TEXT DEFAULT 'retention_rule'
    )
  `, []);

  if (hasDrCol('file_path_original')) {
    await run(`UPDATE DocumentRevision SET original_uri = COALESCE(original_uri, file_path_original)`, []);
  }
  if (hasDrCol('file_path_pdf')) {
    await run(`UPDATE DocumentRevision SET pdf_uri = COALESCE(pdf_uri, file_path_pdf)`, []);
  }
  if (hasDrCol('hash_original')) {
    await run(`UPDATE DocumentRevision SET original_sha256 = COALESCE(original_sha256, hash_original)`, []);
  }
  if (hasDrCol('hash_pdf')) {
    await run(`UPDATE DocumentRevision SET pdf_sha256 = COALESCE(pdf_sha256, hash_pdf)`, []);
  }
  if (hasDrCol('released_by_id')) {
    await run(`UPDATE DocumentRevision SET released_by = COALESCE(released_by, released_by_id)`, []);
  }
  if (hasDrCol('revision_number')) {
    await run(`UPDATE DocumentRevision SET rev_code = COALESCE(rev_code, 'Rev' || revision_number) WHERE revision_number IS NOT NULL`, []);
  }
}

/**
 * Purge excess DocumentRevision rows per retention rule:
 *   Form → keep last 1 released revision
 *   All others → keep last 2 released revisions
 * Before deleting, logs each purged revision into DocumentRevisionHistory
 * so the master list can still show its effective date in red.
 */
async function purgeExcessRevisions(document_id: any, document_type: any) {
  const isForm = String(document_type || '').trim().toUpperCase().includes('FORM');
  const keepCount = isForm ? 1 : 2;

  // Only consider Released / Obsolete revisions (not Draft / Pending)
  const revs = (await all(
    `SELECT id, revision_number, rev_code, COALESCE(released_at, created_at) AS effective_date
     FROM DocumentRevision
     WHERE document_id = ?
       AND status IN ('Released', 'Obsolete')
     ORDER BY id ASC`,
    [document_id]
  )) as any[];

  if (revs.length <= keepCount) return; // nothing to purge

  const toDelete = revs.slice(0, revs.length - keepCount);
  for (const rev of toDelete) {
    // Log into history before deleting
    await run(
      `INSERT INTO DocumentRevisionHistory (document_id, revision_number, rev_code, effective_date, purge_reason)
       VALUES (?, ?, ?, ?, 'retention_rule')`,
      [document_id, rev.revision_number, rev.rev_code, rev.effective_date]
    );
    await run(`DELETE FROM DocumentRevision WHERE id = ?`, [rev.id]);
  }
}

/**
 * Helper function to compute SHA256 hash of a file
 */
async function computeFileHash(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (data: any) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Helper function to move file to permanent storage
 */
async function moveToStorage(sourceFile: any, targetDir: string, fileName: string) {
  const targetPath = path.join(targetDir, fileName);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return new Promise((resolve, reject) => {
    fs.rename(sourceFile.path, targetPath, (err: any) => {
      if (err) reject(err);
      else resolve(targetPath);
    });
  });
}

async function storeDecisionPdf(file: any, cr: any, label: string) {
  const timestamp = Date.now();
  const fileName = `doc-${cr.document_id}-${label}-${timestamp}.pdf`;
  const categoryFolder = toCategoryFolder(cr.document_type);
  const pdfTargetDir = path.join(PDF_DIR, categoryFolder);
  const pdf_uri = await moveToStorage(file, pdfTargetDir, fileName);
  const pdf_sha256 = await computeFileHash(String(pdf_uri));
  return { pdf_uri, pdf_sha256 };
}

function toCategoryFolder(input: any) {
  const raw = String(input || 'uncategorized').trim().toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'uncategorized';
}

function normalizeRoleName(value: any) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function detectDocumentLevel(doc: any = {}) {
  const haystack = [doc.document_type, doc.level, doc.title, doc.doc_number]
    .map((item) => String(item || '').toLowerCase())
    .join(' ');

  if (/\bl1\b|level\s*1|quality\s*manual|\bqm\b/.test(haystack)) return 'L1';
  if (/\bl2\b|level\s*2|procedure|\bqp\b/.test(haystack)) return 'L2';
  if (/\bl3\b|level\s*3|work\s*instruction|operation\s*standard|\bwi\b/.test(haystack)) return 'L3';
  return 'L4';
}

const NEW_DOCUMENT_PATTERNS: Record<string, Record<string, string>> = {
  FORM: {
    INVESTIGATION: 'F-01-INV-XXX',
    TEST: 'F-01-TES-XXX',
    'DOC LAB CONTROL': 'F-01-DOC-XXX',
    CALIBRATION: 'F-02-CAL-XXX',
    DOCUMENT: 'F-03-DOC-XXX',
    TRANING: 'F-04-TRA-XXX',
    TRAINING: 'F-04-TRA-XXX'
  },
  PROCEDURE: {
    PROCEDURE: 'P-APTC-XX'
  },
  SUPPORT: {
    INVESTIGATION: 'S-01-INV-XXX',
    TEST: 'S-01-TES-XXX',
    'DOC LAB CONTROL': 'S-01-DOC-XXX',
    CALIBRATION: 'S-02-CAL-XXX',
    TRANING: 'S-04-TRA-XXX',
    TRAINING: 'S-04-TRA-XXX'
  },
  'WORK INSTRUCTION': {
    INVESTIGATION: 'W-01-INV-XXX',
    TEST: 'W-01-TES-XXX',
    'DOC LAB CONTROL': 'W-01-DOC-XXX',
    CALIBRATION: 'W-02-CAL-XXX'
  }
};

const DOCUMENT_LEVEL_MAP: Record<string, string> = {
  'QUALITY MANUAL': 'L1',
  PROCEDURE: 'L2',
  'WORK INSTRUCTION': 'L3',
  'SUPPORT DOCUMENT': 'L3',
  SUPPORT: 'L3',
  'OUTSIDE DOCUMENT': 'L3',
  'OPERATION STANDARD': 'L3',
  FORM: 'L4',
  REPORT: 'L4'
};

const normalizeKey = (value: any) => String(value || '').trim().toUpperCase();

const isFormCategory = (value: any) => normalizeKey(value).includes('FORM');

const resolveDocumentPattern = (category: string, subCategory: string) => {
  const normalizedCategory = normalizeKey(category);
  const normalizedSub = normalizeKey(subCategory);
  return NEW_DOCUMENT_PATTERNS[normalizedCategory]?.[normalizedSub] || '';
};

const resolveDocumentLevel = (category: string) => {
  const normalizedCategory = normalizeKey(category);
  return DOCUMENT_LEVEL_MAP[normalizedCategory] || 'L4';
};

const padNumber = (value: number, digits: number) => String(value).padStart(digits, '0');

const extractTrailingNumber = (value: string, digits: number) => {
  const match = new RegExp(`(?:^|\\D)(\\d{${digits}})$`).exec(value || '');
  return match ? Number(match[1]) : 0;
};

async function ensureDocumentSchemaCompatibility() {
  const docTable: any = await get(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='Document'`,
    []
  );
  if (!docTable) {
    await run(
      `CREATE TABLE IF NOT EXISTS Document(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_number VARCHAR(64) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        owning_department VARCHAR(100),
        current_revision_id BIGINT NULL,
        created_by BIGINT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      []
    );
  }

  const docCols = (await all(`PRAGMA table_info(Document)`, [])) as any[];
  const hasDocCol = (name: string) => docCols.some((c: any) => c.name === name);

  if (!hasDocCol('document_type')) {
    await safeAddColumn('Document', 'document_type', 'TEXT');
  }
  if (!hasDocCol('level')) {
    await safeAddColumn('Document', 'level', 'TEXT');
  }
  if (!hasDocCol('department')) {
    await safeAddColumn('Document', 'department', 'TEXT');
  }
  if (!hasDocCol('owning_department')) {
    await safeAddColumn('Document', 'owning_department', 'TEXT');
  }
  if (!hasDocCol('sub_category')) {
    await safeAddColumn('Document', 'sub_category', 'TEXT');
  }
}

async function getNextDocumentNumber(pattern: string) {
  if (!pattern || !pattern.includes('X')) {
    throw new Error('Invalid document pattern');
  }

  const digits = pattern.startsWith('P-APTC-') ? 2 : 3;
  const likePattern = pattern.replace(/X+$/, '%');
  const rows = (await all(`SELECT doc_number FROM Document WHERE doc_number LIKE ?`, [likePattern])) as any[];

  let maxValue = 0;
  rows.forEach((row) => {
    const current = extractTrailingNumber(String(row?.doc_number || ''), digits);
    if (current > maxValue) maxValue = current;
  });

  const nextValue = maxValue + 1;
  const maxAllowed = digits === 2 ? 99 : 999;
  if (nextValue > maxAllowed) {
    throw new Error('Document number reached maximum for this pattern');
  }

  const docNumber = pattern.replace(/X+$/, padNumber(nextValue, digits));
  return { docNumber, digits, nextValue };
}

function resolveStoredPath(fileUri: string) {
  if (!fileUri) return '';
  const normalized = String(fileUri);
  const isDist = String(__dirname).toLowerCase().includes(`${path.sep}dist`);
  const resolvedBase = isDist ? path.resolve(__dirname, '..', '..') : path.resolve(__dirname, '..');
  const candidates: string[] = [];

  if (path.isAbsolute(normalized)) {
    candidates.push(normalized);
  }

  const posixPath = normalized.replace(/\\/g, '/');
  const uploadsIndex = posixPath.toLowerCase().indexOf('/uploads/');
  if (uploadsIndex >= 0) {
    const relative = posixPath.slice(uploadsIndex + '/uploads/'.length);
    candidates.push(path.resolve(resolvedBase, 'uploads', relative));
  }

  candidates.push(path.resolve(resolvedBase, 'uploads', normalized));
  candidates.push(path.resolve(resolvedBase, normalized));

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0] || normalized;
}

/**
 * Assign manager to a change request based on document department
 */
async function assignManager(document_id: any) {
  try {
    // Get document department from live schema
    const doc: any = await get(`SELECT department FROM Document WHERE id = ?`, [document_id]);
    if (!doc || !doc.department) {
      // Fallback: assign to first QMR/MANAGER user
      const manager: any = await get(
        `SELECT id FROM users WHERE role_id IN (SELECT id FROM roles WHERE name IN ('MANAGER', 'QMR')) LIMIT 1`,
        []
      );
      return manager ? manager.id : null;
    }

    // Find manager from the same department
    const manager: any = await get(
      `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE u.department = ? AND r.name IN ('MANAGER', 'QMR') LIMIT 1`,
      [doc.department]
    );
    return manager ? manager.id : null;
  } catch (error) {
    console.error('Error assigning manager:', error);
    return null;
  }
}

async function isManagerUser(user_id: any) {
  if (!user_id) return false;
  const row: any = await get(
    `SELECT u.id
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE u.id = ?
             AND UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) LIKE '%MANAGER%'
                 LIMIT 1`,
    [user_id]
  );
  return !!row;
}

async function getUserRoleNormalized(user_id: any) {
  if (!user_id) return '';
  const row: any = await get(
    `SELECT UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) as role_name
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.id = ?
         LIMIT 1`,
    [user_id]
  );
  return row?.role_name || '';
}

async function getUsersByRoleNames(roleNames: any[], department: any = null) {
  const normalized = (roleNames || []).map(normalizeRoleName).filter(Boolean);
  if (!normalized.length) {
    return [];
  }

  const placeholders = normalized.map(() => '?').join(',');
  const baseSql = `
        SELECT u.id, u.employee_code, u.name, u.department,
               UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) as role_name
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE COALESCE(u.is_active, 1) = 1
          AND UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) IN (${placeholders})
    `;

  if (department) {
    return all(`${baseSql} AND TRIM(COALESCE(u.department, '')) = TRIM(?) ORDER BY u.name ASC`, [...normalized, department]);
  }

  return all(`${baseSql} ORDER BY u.name ASC`, normalized);
}

async function pickSingleUserByRole(roleNames: any[], preferredDepartment: any = null) {
  const preferred: any = await getUsersByRoleNames(roleNames, preferredDepartment);
  if (preferred && preferred.length > 0) {
    return preferred[0];
  }
  const fallback: any = await getUsersByRoleNames(roleNames, null);
  return fallback && fallback.length > 0 ? fallback[0] : null;
}

async function insertApprovalRecord({ cr_id, step, decision, decided_by, decided_by_role, comment = '' }: any) {
  await ensureApprovalRecordCompatibility();
  const approvalCols = (await all(`PRAGMA table_info(ApprovalRecord)`, [])) as any[];
  const has = (name: string) => approvalCols.some((column: any) => column.name === name);
  const normalizedStep = ['DC_INITIAL', 'GATE_A'].includes(String(step || '').toUpperCase()) ? 'GateA' : 'GateB';

  const columns: string[] = [];
  const values: any[] = [];

  if (has('cr_id')) {
    columns.push('cr_id');
    values.push(cr_id);
  }
  if (has('change_request_id')) {
    columns.push('change_request_id');
    values.push(cr_id);
  }

  if (has('step')) {
    columns.push('step');
    values.push(normalizedStep);
  }
  if (has('gate')) {
    columns.push('gate');
    values.push(normalizedStep);
  }

  if (has('decision')) {
    columns.push('decision');
    values.push(decision);
  }

  if (has('decided_by')) {
    columns.push('decided_by');
    values.push(decided_by);
  }
  if (has('approver_id')) {
    columns.push('approver_id');
    values.push(decided_by);
  }

  if (has('decided_by_role')) {
    columns.push('decided_by_role');
    values.push(decided_by_role || null);
  }

  if (has('comment')) {
    columns.push('comment');
    values.push(comment || null);
  }
  if (has('comments')) {
    columns.push('comments');
    values.push(comment || null);
  }

  if (has('decided_at')) {
    columns.push('decided_at');
    values.push(new Date().toISOString());
  }
  if (has('approved_at')) {
    columns.push('approved_at');
    values.push(new Date().toISOString());
  }

  if (!columns.length) {
    return;
  }

  const placeholders = columns.map(() => '?').join(', ');
  try {
    await run(`INSERT INTO ApprovalRecord (${columns.join(', ')}) VALUES (${placeholders})`, values);
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.includes('CHECK constraint failed') && (columns.includes('step') || columns.includes('gate'))) {
      const safePairs = columns
        .map((column, index) => ({ column, value: values[index] }))
        .filter((item) => item.column !== 'step' && item.column !== 'gate');
      const safeColumns = safePairs.map((item) => item.column);
      const safeValues = safePairs.map((item) => item.value);
      if (!safeColumns.length) {
        return;
      }
      const safePlaceholders = safeColumns.map(() => '?').join(', ');
      await run(`INSERT INTO ApprovalRecord (${safeColumns.join(', ')}) VALUES (${safePlaceholders})`, safeValues);
      return;
    }
    throw error;
  }
}

const dcrService = {
  async getNewDocumentPreview(category: string, subCategory: string) {
    await ensureDocumentSchemaCompatibility();
    const pattern = resolveDocumentPattern(category, subCategory);
    if (!pattern) {
      throw new Error('Unsupported category or sub-category');
    }

    const level = resolveDocumentLevel(category);
    const { docNumber } = await getNextDocumentNumber(pattern);

    return {
      documentNo: docNumber,
      level,
      pattern
    };
  },

  async createNewDocumentChangeRequest(
    category: string,
    subCategory: string,
    requester_id: any,
    reason: any,
    docName?: string,
    options: { allowDcRequester?: boolean } = {}
  ) {
    await ensureChangeRequestSchemaCompatibility();
    await ensureDocumentSchemaCompatibility();

    const requesterRole = normalizeRoleName(await getUserRoleNormalized(requester_id));
    if (['DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER'].includes(requesterRole) && !options.allowDcRequester) {
      throw new Error('Document Control users can only create re-upload requests.');
    }

    const pattern = resolveDocumentPattern(category, subCategory);
    if (!pattern) {
      throw new Error('Unsupported category or sub-category');
    }

    const level = resolveDocumentLevel(category);
    const { docNumber } = await getNextDocumentNumber(pattern);

    const exists: any = await get(`SELECT id FROM Document WHERE doc_number = ?`, [docNumber]);
    if (exists) {
      throw new Error('Document number already exists');
    }

    const requester: any = await get(`SELECT id, name, department FROM users WHERE id = ?`, [requester_id]);
    const title = String(docName || '').trim()
      || `${String(category || '').trim()} ${String(subCategory || '').trim()}`.trim()
      || docNumber;

    const columns = (await all(`PRAGMA table_info(Document)`, [])) as any[];
    const hasColumn = (name: string) => columns.some((col) => col.name === name);

    const payload: Record<string, any> = {
      doc_number: docNumber,
      title,
      created_by: requester_id,
      document_type: category,
      level,
      department: requester?.department || null,
      owning_department: requester?.department || null,
      sub_category: subCategory
    };

    const insertColumns = Object.keys(payload).filter((key) => hasColumn(key));
    const insertValues = insertColumns.map((key) => payload[key]);
    const placeholders = insertColumns.map(() => '?').join(', ');

    const docResult: any = await run(
      `INSERT INTO Document (${insertColumns.join(', ')}) VALUES (${placeholders})`,
      insertValues
    );

    const assignedApprover = level === 'L1' || level === 'L2'
      ? await pickSingleUserByRole(['PRESIDENT'])
      : await pickSingleUserByRole(['MANAGER']);

    const crResult: any = await run(
      `INSERT INTO ChangeRequest (document_id, requester_id, manager_id, approver_id, reason, status, document_level)
       VALUES (?, ?, NULL, ?, ?, 'Draft', ?)`,
      [docResult.lastID, requester_id, assignedApprover?.id || null, reason, level]
    );

    await auditService.recordEvent('ChangeRequest', crResult.lastID, requester_id, 'CREATE_NEW_DOCUMENT_DRAFT', {
      document_id: docResult.lastID,
      document_no: docNumber,
      category,
      sub_category: subCategory,
      document_level: level
    });

    return {
      change_request_id: crResult.lastID,
      document_id: docResult.lastID,
      document_no: docNumber,
      level
    };
  },

  async getManagerApprovers() {
    try {
      return await all(
        `SELECT u.id, u.employee_code, u.name,
                        UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) as role_name
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) LIKE '%MANAGER%'
                   AND COALESCE(u.is_active, 1) = 1
                 ORDER BY u.name ASC`,
        []
      );
    } catch (error) {
      console.error('Error fetching manager approvers:', error);
      throw error;
    }
  },

  /**
   * Create a new change request in draft status
   */
  async createChangeRequest(
    document_id: any,
    requester_id: any,
    reason: any,
    options: { allowDcRequester?: boolean } = {}
  ) {
    try {
      await ensureChangeRequestSchemaCompatibility();
      const requesterRole = normalizeRoleName(await getUserRoleNormalized(requester_id));
      if (['DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER'].includes(requesterRole) && !options.allowDcRequester) {
        throw new Error('Document Control users can only create re-upload requests.');
      }
      const doc: any = await get(`SELECT * FROM Document WHERE id = ?`, [document_id]);
      if (!doc) {
        throw new Error('Document not found');
      }

      const documentLevel = detectDocumentLevel(doc);
      const assignedApprover = documentLevel === 'L1' || documentLevel === 'L2' ? await pickSingleUserByRole(['PRESIDENT']) : await pickSingleUserByRole(['MANAGER']);

      const sql = `
                INSERT INTO ChangeRequest (document_id, requester_id, manager_id, approver_id, reason, status, document_level)
                VALUES (?, ?, NULL, ?, ?, 'Draft', ?)
            `;
      const result: any = await run(sql, [document_id, requester_id, assignedApprover?.id || null, reason, documentLevel]);

      // Record in audit trail
      await auditService.recordEvent('ChangeRequest', result.lastID, requester_id, 'CREATE_DRAFT', {
        document_id,
        reason,
        document_level: documentLevel,
        auto_approver_id: assignedApprover?.id || null
      });

      return result.lastID;
    } catch (error) {
      console.error('Error creating change request:', error);
      throw error;
    }
  },

  async getReuploadOptions(document_id: any) {
    try {
      await ensureChangeRequestSchemaCompatibility();
      await ensureDocumentRevisionSchemaCompatibility();

      const doc: any = await get(
        `SELECT id, doc_number, title, document_type, current_revision_id
                 FROM Document WHERE id = ?`,
        [document_id]
      );

      if (!doc) {
        throw new Error('Document not found');
      }

      const revisions = await all(
        `SELECT dr.id, dr.rev_code, dr.revision_number, dr.status, dr.created_at, dr.created_by,
                        u.name as created_by_name, u.employee_code as created_by_code
                 FROM DocumentRevision dr
                 LEFT JOIN users u ON u.id = dr.created_by
                 WHERE dr.document_id = ?
                 ORDER BY dr.id DESC`,
        [document_id]
      );

  const revisionList = (revisions as any[]) || [];
  const currentRevisionId = doc.current_revision_id || (revisionList?.[0] as any)?.id || null;
  const currentRevision = revisionList.find((rev: any) => String(rev.id) === String(currentRevisionId));
      const defaultAssigneeId = currentRevision?.created_by || null;

      const users = await all(
        `SELECT u.id, u.employee_code, u.name, COALESCE(r.name, '') as role
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE COALESCE(u.is_active, 1) = 1
                 ORDER BY u.employee_code ASC`,
        []
      );

      return {
        document: doc,
        revisions: revisions || [],
        current_revision_id: currentRevisionId,
        default_assignee_id: defaultAssigneeId,
        users: users || []
      };
    } catch (error) {
      console.error('Error getting reupload options:', error);
      throw error;
    }
  },

  async createReuploadRequest(document_id: any, requested_by: any, assignee_id: any, target_revision_id: any, reason: any) {
    try {
      await ensureChangeRequestSchemaCompatibility();
      await ensureDocumentRevisionSchemaCompatibility();

      if (!reason || !String(reason).trim()) {
        throw new Error('reason is required');
      }

      const doc: any = await get(
        `SELECT id, doc_number, title, document_type, current_revision_id
                 FROM Document WHERE id = ?`,
        [document_id]
      );

      if (!doc) {
        throw new Error('Document not found');
      }

      let targetRevisionId = target_revision_id || doc.current_revision_id || null;
      if (!targetRevisionId) {
        const latest: any = await get(
          `SELECT id FROM DocumentRevision WHERE document_id = ? ORDER BY id DESC LIMIT 1`,
          [document_id]
        );
        targetRevisionId = latest?.id || null;
      }

      if (!targetRevisionId) {
        throw new Error('No revision found for selected document');
      }

      const targetRevision: any = await get(
        `SELECT id, created_by, rev_code, revision_number, status
                 FROM DocumentRevision WHERE id = ?`,
        [targetRevisionId]
      );

      if (!targetRevision) {
        throw new Error('Selected revision not found');
      }

      const assignedUploaderId = assignee_id || targetRevision.created_by || null;
      if (!assignedUploaderId) {
        throw new Error('Assignee is required');
      }

      const isCurrent = doc.current_revision_id && String(doc.current_revision_id) === String(targetRevisionId);
      const documentLevel = detectDocumentLevel(doc);

      const result: any = await run(
        `INSERT INTO ChangeRequest
                   (document_id, requester_id, manager_id, approver_id, reason, status, document_level,
                    request_type, reupload_requested_by, reupload_assignee_id, reupload_target_revision_id,
                    reupload_is_current, latest_working_revision_id, submitted_at)
                 VALUES (?, ?, NULL, NULL, ?, 'Pending Revision', ?,
                         'REUPLOAD', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          document_id,
          assignedUploaderId,
          reason,
          documentLevel,
          requested_by,
          assignedUploaderId,
          targetRevisionId,
          isCurrent ? 1 : 0,
          targetRevisionId
        ]
      );

      const requester: any = await get(`SELECT id, name FROM users WHERE id = ?`, [requested_by]);
      await notificationService.notifyReuploadRequested(assignedUploaderId, {
        id: result.lastID,
        document_id: document_id,
        document_title: doc.title,
        doc_number: doc.doc_number,
        target_revision_id: targetRevisionId
      }, requester);

      await auditService.recordEvent('ChangeRequest', result.lastID, requested_by, 'REUPLOAD_REQUESTED', {
        document_id,
        target_revision_id: targetRevisionId,
        assignee_id: assignedUploaderId,
        is_current_revision: isCurrent
      });

      return {
        change_request_id: result.lastID,
        status: 'Pending Revision'
      };
    } catch (error) {
      console.error('Error creating reupload request:', error);
      throw error;
    }
  },

  /**
   * Submit a draft change request for approval
   */
  async submitChangeRequest(cr_id: any, requester_id: any, options: { allowDcRequester?: boolean } = {}) {
    try {
      await ensureChangeRequestSchemaCompatibility();
      const requesterRole = normalizeRoleName(await getUserRoleNormalized(requester_id));
      if (['DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER'].includes(requesterRole) && !options.allowDcRequester) {
        throw new Error('Document Control users cannot submit change requests.');
      }
      const cr: any = await get(
        `SELECT cr.*, d.title as document_title FROM ChangeRequest cr 
                 JOIN Document d ON cr.document_id = d.id 
                 WHERE cr.id = ? AND cr.requester_id = ? AND cr.status = 'Draft'`,
        [cr_id, requester_id]
      );

      if (!cr) {
        throw new Error('Change Request not found or not in draft state');
      }

      // Update CR status for Document Control initial decision
  await run(`UPDATE ChangeRequest SET status = 'Pending DC Review', submitted_at = CURRENT_TIMESTAMP WHERE id = ?`, [cr_id]);

      const requester: any = await get(`SELECT id, name FROM users WHERE id = ?`, [requester_id]);

      // Send notification to all Document Controllers
      await notificationService.notifyDCRSubmittedToDocumentControllers({ id: cr_id, ...cr }, requester);

      // Record in audit trail
      await auditService.recordEvent('ChangeRequest', cr_id, requester_id, 'SUBMIT', {
        first_step: 'DOCUMENT_CONTROL_REVIEW'
      });

      return { cr_id, manager_id: null };
    } catch (error) {
      console.error('Error submitting change request:', error);
      throw error;
    }
  },

  async getCheckerCandidates() {
    return getUsersByRoleNames(['ASSISTANT_MANAGER', 'MANAGER']);
  },

  async getApproverCandidates(documentLevel: any) {
    const level = String(documentLevel || '').toUpperCase();
    if (level === 'L1' || level === 'L2') {
      return getUsersByRoleNames(['PRESIDENT']);
    }
    return getUsersByRoleNames(['ASSISTANT_MANAGER', 'MANAGER']);
  },

  async makeWorkflowDecision(cr_id: any, actor_id: any, decision: any, comment = '', decisionFiles: any = {}) {
    try {
      await ensureChangeRequestSchemaCompatibility();
      await ensureDocumentRevisionSchemaCompatibility();
      const normalizedDecision = String(decision || '').trim();
      if (!['Approve', 'Reject'].includes(normalizedDecision)) {
        throw new Error('Invalid decision. Must be "Approve" or "Reject"');
      }

      const cr: any = await get(
        `SELECT cr.*, d.title as document_title, d.document_type, d.doc_number, d.department
                 FROM ChangeRequest cr
                 JOIN Document d ON cr.document_id = d.id
                 WHERE cr.id = ?`,
        [cr_id]
      );

      if (!cr) {
        throw new Error('Change Request not found');
      }

      const actorRole = normalizeRoleName(await getUserRoleNormalized(actor_id));
      const actor: any = await get(`SELECT id, name FROM users WHERE id = ?`, [actor_id]);
      const requester: any = await get(`SELECT id, name FROM users WHERE id = ?`, [cr.requester_id]);

      const isDcRole = ['DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'ADMIN'].includes(actorRole);
      const isChecker = Number(cr.checker_id) === Number(actor_id);
      const isApprover = Number(cr.approver_id) === Number(actor_id);

  let nextStatus = cr.status;
      let message = 'Decision recorded';
      let action = 'WORKFLOW_DECISION';
      let step = 'General';
      let downloadLink: any = null;
  let decisionFileMeta: any = {};

      let dcSource: any = null;
      if (decisionFiles?.source) {
        const sourceFile = decisionFiles.source;
        fileService.validateFileType(sourceFile.originalname, sourceFile.mimetype);
        const timestamp = Date.now();
        const sourceFileName = `doc-${cr.document_id}-dc-source-${timestamp}${path.extname(sourceFile.originalname)}`;
        const categoryFolder = toCategoryFolder(cr.document_type);
        const sourceTargetDir = path.join(ORIGINAL_DIR, categoryFolder);
        const original_uri = await moveToStorage(sourceFile, sourceTargetDir, sourceFileName);
        const original_sha256 = await computeFileHash(String(original_uri));
        dcSource = {
          original_uri,
          original_sha256,
          original_name: sourceFile.originalname
        };
      }

      if (cr.status === 'Pending DC Review') {
        if (!isDcRole) {
          throw new Error('Only Document Control can review this request at this stage');
        }

        step = 'DC_INITIAL';
        if (normalizedDecision === 'Reject') {
          nextStatus = 'Rejected';
          action = 'REJECT_DC_INITIAL';
          message = 'Change request rejected by Document Control';
          await run(
            `UPDATE ChangeRequest
                         SET status = 'Rejected', rejected_at = CURRENT_TIMESTAMP, returned_by_role = 'DOCUMENT_CONTROL', returned_comment = ?
                         WHERE id = ?`,
            [comment || null, cr_id]
          );
          if (requester) {
            await notificationService.notifyDCRRejectedByRole(cr.requester_id, cr, actor, 'Document Control', comment);
          }
        } else {
          nextStatus = 'Pending Revision';
          action = 'APPROVE_DC_INITIAL';
          message = 'Change request approved by Document Control; revision requested';
          const latestRev: any = await get(`SELECT * FROM DocumentRevision WHERE document_id = ? ORDER BY id DESC LIMIT 1`, [cr.document_id]);
          if (!dcSource && latestRev?.original_uri) {
            const resolvedSource = resolveStoredPath(latestRev.original_uri);
            let originalHash: any = null;
            if (resolvedSource && fs.existsSync(resolvedSource)) {
              try {
                originalHash = await computeFileHash(String(resolvedSource));
              } catch (hashError) {
                console.warn('Failed to hash existing source file:', hashError?.message || hashError);
              }
            }
            dcSource = {
              original_uri: latestRev.original_uri,
              original_sha256: originalHash,
              original_name: path.basename(latestRev.original_uri)
            };
          }
          const sourceUri = dcSource?.original_uri || cr.dc_source_uri || latestRev?.original_uri;
          if (sourceUri) {
            downloadLink = await signedUrlService.generateSignedUrl(cr_id, cr.document_id, cr.requester_id, sourceUri);
          }
          await run(
            `UPDATE ChangeRequest
                         SET status = 'Pending Revision',
                             dc_initial_at = CURRENT_TIMESTAMP,
                             preapproved_at = CURRENT_TIMESTAMP,
                             dc_source_uri = COALESCE(?, dc_source_uri),
                             dc_source_sha256 = COALESCE(?, dc_source_sha256),
                             dc_source_name = COALESCE(?, dc_source_name)
                         WHERE id = ?`,
            [dcSource?.original_uri || null, dcSource?.original_sha256 || null, dcSource?.original_name || null, cr_id]
          );
          if (dcSource) {
            decisionFileMeta = {
              ...decisionFileMeta,
              dc_source_uri: dcSource.original_uri,
              dc_source_sha256: dcSource.original_sha256,
              dc_source_name: dcSource.original_name
            };
          }
          if (requester) {
            await notificationService.notifyDCRDcApproved(cr.requester_id, cr, downloadLink, actor);
          }
        }
  } else if (cr.status === 'Pending Checker' || cr.status === 'Pending Approval') {
        if (!isChecker && !isDcRole) {
          throw new Error('Only selected checker can review this request at this stage');
        }

        step = 'CHECKER';
        if (normalizedDecision === 'Reject') {
          if (decisionFiles?.marked_pdf) {
            const stored = await storeDecisionPdf(decisionFiles.marked_pdf, cr, 'checker-reject');
            decisionFileMeta = { decision_marked_pdf_uri: stored.pdf_uri, decision_marked_pdf_sha256: stored.pdf_sha256 };
          }
          nextStatus = 'Returned for Revision';
          action = 'REJECT_CHECKER';
          message = 'Change request returned by checker';
          await run(
            `UPDATE ChangeRequest
                         SET status = 'Returned for Revision', returned_at = CURRENT_TIMESTAMP, returned_by_role = 'CHECKER', returned_comment = ?
                         WHERE id = ?`,
            [comment || null, cr_id]
          );
          if (requester) {
            await notificationService.notifyDCRReturnedByRole(cr.requester_id, cr, actor, 'Checker', comment);
          }
        } else {
          if (!decisionFiles?.signed_pdf) {
            throw new Error('signed_pdf is required when checker approves');
          }
          if (!cr.latest_working_revision_id) {
            throw new Error('No revision associated with this request');
          }
          const stored = await storeDecisionPdf(decisionFiles.signed_pdf, cr, 'checker-approve');
          await run(
            `UPDATE DocumentRevision
                         SET pdf_uri = ?, pdf_sha256 = ?
                         WHERE id = ?`,
            [stored.pdf_uri, stored.pdf_sha256, cr.latest_working_revision_id]
          );
          decisionFileMeta = { decision_signed_pdf_uri: stored.pdf_uri, decision_signed_pdf_sha256: stored.pdf_sha256 };
          nextStatus = 'Pending Approver';
          action = 'APPROVE_CHECKER';
          message = 'Checker approved. Sent to approver.';
          await run(
            `UPDATE ChangeRequest
                         SET status = 'Pending Approver', checker_approved_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
            [cr_id]
          );
          if (cr.approver_id) {
            await notificationService.notifyDCRNeedsApproverDecision(cr.approver_id, cr, actor);
          }
        }
  } else if (cr.status === 'Pending Approver') {
        if (!isApprover && !isDcRole) {
          throw new Error('Only assigned approver can review this request at this stage');
        }

        step = 'APPROVER';
        if (normalizedDecision === 'Reject') {
          if (decisionFiles?.marked_pdf) {
            const stored = await storeDecisionPdf(decisionFiles.marked_pdf, cr, 'approver-reject');
            decisionFileMeta = { decision_marked_pdf_uri: stored.pdf_uri, decision_marked_pdf_sha256: stored.pdf_sha256 };
          }
          nextStatus = 'Returned for Revision';
          action = 'REJECT_APPROVER';
          message = 'Change request returned by approver';
          await run(
            `UPDATE ChangeRequest
                         SET status = 'Returned for Revision', returned_at = CURRENT_TIMESTAMP, returned_by_role = 'APPROVER', returned_comment = ?
                         WHERE id = ?`,
            [comment || null, cr_id]
          );
          if (requester) {
            await notificationService.notifyDCRReturnedByRole(cr.requester_id, cr, actor, 'Approver', comment);
          }
        } else {
          if (!decisionFiles?.signed_pdf) {
            throw new Error('signed_pdf is required when approver approves');
          }
          if (!cr.latest_working_revision_id) {
            throw new Error('No revision associated with this request');
          }
          const stored = await storeDecisionPdf(decisionFiles.signed_pdf, cr, 'approver-approve');
          await run(
            `UPDATE DocumentRevision
                         SET pdf_uri = ?, pdf_sha256 = ?
                         WHERE id = ?`,
            [stored.pdf_uri, stored.pdf_sha256, cr.latest_working_revision_id]
          );
          decisionFileMeta = { decision_signed_pdf_uri: stored.pdf_uri, decision_signed_pdf_sha256: stored.pdf_sha256 };
          if (isFormCategory(cr.document_type)) {
            nextStatus = 'Pending Non-Sign PDF';
            action = 'APPROVE_APPROVER_FORM';
            message = 'Approver approved. Requester must upload non-signed PDF.';
            await run(
              `UPDATE ChangeRequest
                           SET status = 'Pending Non-Sign PDF', approver_approved_at = CURRENT_TIMESTAMP
                           WHERE id = ?`,
              [cr_id]
            );
            if (requester) {
              await notificationService.notifyDCRNonSignPdfRequired(cr.requester_id, cr, actor);
            }
          } else {
            nextStatus = 'Pending Final DC Release';
            action = 'APPROVE_APPROVER';
            message = 'Approver approved. Sent to Document Control for final release.';
            await run(
              `UPDATE ChangeRequest
                           SET status = 'Pending Final DC Release', approver_approved_at = CURRENT_TIMESTAMP
                           WHERE id = ?`,
              [cr_id]
            );
            await notificationService.notifyDCRPendingDcFinal(cr, actor);
          }
        }
      } else if (cr.status === 'Pending Final DC Release') {
        if (!isDcRole) {
          throw new Error('Only Document Control can complete final release');
        }

        step = 'DC_FINAL';
        if (normalizedDecision === 'Reject') {
          if (decisionFiles?.marked_pdf) {
            const stored = await storeDecisionPdf(decisionFiles.marked_pdf, cr, 'dc-reject');
            decisionFileMeta = { decision_marked_pdf_uri: stored.pdf_uri, decision_marked_pdf_sha256: stored.pdf_sha256 };
          }
          nextStatus = 'Returned for Revision';
          action = 'REJECT_DC_FINAL';
          message = 'Final release rejected by Document Control';
          await run(
            `UPDATE ChangeRequest
                         SET status = 'Returned for Revision', returned_at = CURRENT_TIMESTAMP, returned_by_role = 'DOCUMENT_CONTROL', returned_comment = ?
                         WHERE id = ?`,
            [comment || null, cr_id]
          );
          if (requester) {
            await notificationService.notifyDCRReturnedByRole(cr.requester_id, cr, actor, 'Document Control', comment);
          }
        } else {
          if (!cr.latest_working_revision_id) {
            throw new Error('No revision associated with this request');
          }
          const isReupload = String(cr.request_type || '').trim().toUpperCase() === 'REUPLOAD';
          const reuploadIsCurrent = Number(cr.reupload_is_current || 0) === 1;
          if (isReupload && cr.reupload_target_revision_id && !reuploadIsCurrent) {
            await run(
              `UPDATE DocumentRevision
                         SET status = 'Obsolete'
                         WHERE id = ?`,
              [cr.reupload_target_revision_id]
            );

            nextStatus = 'Released';
            action = 'APPROVE_DC_FINAL_REUPLOAD';
            message = 'Re-upload approved. Obsolete revision updated.';
            await run(
              `UPDATE ChangeRequest
                         SET status = 'Released', final_approved_at = CURRENT_TIMESTAMP, dc_final_approved_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
              [cr_id]
            );

            const notifyIds = Array.from(new Set([
              cr.requester_id,
              cr.reupload_requested_by,
              cr.reupload_assignee_id
            ].filter(Boolean)));
            if (notifyIds.length > 0) {
              await notificationService.notifyReuploadCompleted(notifyIds, cr, actor);
            }
          } else {
          const current: any = await get(`SELECT current_revision_id FROM Document WHERE id = ?`, [cr.document_id]);
          const previousRevisionId = current?.current_revision_id || null;

          await run(
            `UPDATE DocumentRevision
                         SET status = 'Released', released_at = CURRENT_TIMESTAMP, released_by = ?
                         WHERE id = ?`,
            [actor_id, cr.latest_working_revision_id]
          );
          await run(`UPDATE Document
                         SET current_revision_id = ?
                         WHERE id = ?`, [cr.latest_working_revision_id, cr.document_id]);

          if (previousRevisionId && Number(previousRevisionId) !== Number(cr.latest_working_revision_id)) {
            await run(
              `UPDATE DocumentRevision
                             SET status = 'Obsolete'
                             WHERE id = ?`,
              [previousRevisionId]
            );
          }

          await run(
            `UPDATE DocumentRevision
                       SET status = CASE WHEN id = ? THEN 'Released' ELSE 'Obsolete' END
                       WHERE document_id = ?`,
            [cr.latest_working_revision_id, cr.document_id]
          );

          nextStatus = 'Released';
          action = 'APPROVE_DC_FINAL_RELEASE';
          message = 'Document released successfully';
          await run(
            `UPDATE ChangeRequest
                         SET status = 'Released', final_approved_at = CURRENT_TIMESTAMP, dc_final_approved_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
            [cr_id]
          );
          // Apply retention rule: purge excess old revisions, logging dates to history
          await purgeExcessRevisions(cr.document_id, cr.document_type);
          if (requester) {
            await notificationService.notifyDCRApproved(cr.requester_id, cr, actor);
          }
          }
        }
      } else {
        throw new Error(`Change Request is not in a reviewable state (${cr.status})`);
      }

      await insertApprovalRecord({
        cr_id,
        step,
        decision: normalizedDecision,
        decided_by: actor_id,
        decided_by_role: actorRole,
        comment
      });

      await auditService.recordEvent('ChangeRequest', cr_id, actor_id, action, {
        decision: normalizedDecision,
        comment,
        from_status: cr.status,
        to_status: nextStatus,
        step,
        download_link: downloadLink,
        ...decisionFileMeta
      });

      return {
        message,
        status: nextStatus,
        downloadLink
      };
    } catch (error) {
      console.error('Error making workflow decision:', error);
      throw error;
    }
  },

  async getDcSourceDownloadLink(cr_id: any, user_id: any) {
    try {
      await ensureChangeRequestSchemaCompatibility();
      await ensureDocumentRevisionSchemaCompatibility();

      const cr: any = await get(
        `SELECT cr.*, d.document_type
                 FROM ChangeRequest cr
                 JOIN Document d ON cr.document_id = d.id
                 WHERE cr.id = ?`,
        [cr_id]
      );

      if (!cr) {
        throw new Error('Change Request not found');
      }

      const roleName = normalizeRoleName(await getUserRoleNormalized(user_id));
      const isDcRole = ['DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'ADMIN'].includes(roleName);
      if (Number(cr.requester_id) !== Number(user_id) && !isDcRole) {
        throw new Error('Not authorized to download the source document');
      }

      const latestRev: any = await get(
        `SELECT original_uri FROM DocumentRevision WHERE document_id = ? ORDER BY id DESC LIMIT 1`,
        [cr.document_id]
      );

      const sourceUri = cr.dc_source_uri || latestRev?.original_uri;
      if (!sourceUri) {
        throw new Error('No source document available for download');
      }

      const downloadLink = await signedUrlService.generateSignedUrl(cr_id, cr.document_id, cr.requester_id, sourceUri);
      return { downloadLink };
    } catch (error) {
      console.error('Error generating DC source download link:', error);
      throw error;
    }
  },

  async getRevisionDownloadLinks(cr_id: any, user_id: any) {
    try {
      await ensureChangeRequestSchemaCompatibility();
      await ensureDocumentRevisionSchemaCompatibility();

      const cr: any = await get(
        `SELECT cr.*, d.document_type
                 FROM ChangeRequest cr
                 JOIN Document d ON cr.document_id = d.id
                 WHERE cr.id = ?`,
        [cr_id]
      );

      if (!cr) {
        throw new Error('Change Request not found');
      }

      const roleName = normalizeRoleName(await getUserRoleNormalized(user_id));
      const isDcRole = ['DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'ADMIN'].includes(roleName);
      const isChecker = Number(cr.checker_id) === Number(user_id);
      const isApprover = Number(cr.approver_id) === Number(user_id);

      if (!isDcRole && !isChecker && !isApprover) {
        throw new Error('Not authorized to download revision files');
      }

      const revisionId = cr.latest_working_revision_id || null;
      const revision: any = revisionId
        ? await get(`SELECT * FROM DocumentRevision WHERE id = ?`, [revisionId])
        : await get(
          `SELECT * FROM DocumentRevision WHERE document_id = ? ORDER BY id DESC LIMIT 1`,
          [cr.document_id]
        );

      if (!revision) {
        throw new Error('No revision available for download');
      }

      const links: any = {};
      if (revision.original_uri) {
        links.source = await signedUrlService.generateSignedUrl(cr_id, cr.document_id, cr.requester_id, revision.original_uri);
      }
      if (revision.pdf_uri) {
        links.pdf = await signedUrlService.generateSignedUrl(cr_id, cr.document_id, cr.requester_id, revision.pdf_uri);
      }
      if (revision.unsigned_pdf_uri) {
        links.unsigned_pdf = await signedUrlService.generateSignedUrl(
          cr_id,
          cr.document_id,
          cr.requester_id,
          revision.unsigned_pdf_uri
        );
      }

      if (!links.source && !links.pdf && !links.unsigned_pdf) {
        throw new Error('No revision files available for download');
      }

      return links;
    } catch (error) {
      console.error('Error generating revision download links:', error);
      throw error;
    }
  },

  async closeChangeRequest(cr_id: any, requester_id: any, reason: any = null) {
    try {
      await ensureChangeRequestSchemaCompatibility();
      const cr: any = await get(
        `SELECT * FROM ChangeRequest WHERE id = ? AND requester_id = ?`,
        [cr_id, requester_id]
      );

      if (!cr) {
        throw new Error('Change Request not found or not owned by requester');
      }

      if (!['Pending Revision', 'Returned for Revision'].includes(cr.status)) {
        throw new Error('Change Request cannot be closed in the current state');
      }

      await run(
        `UPDATE ChangeRequest
                 SET status = 'Closed', closed_at = CURRENT_TIMESTAMP, returned_comment = COALESCE(?, returned_comment)
                 WHERE id = ?`,
        [reason || null, cr_id]
      );

      const dcIds = await notificationService.getDocumentControllerUserIds();
      const adminIds = await notificationService.getAdminUserIds();
      const notifyIds = Array.from(new Set([
        ...dcIds,
        ...adminIds,
        cr.checker_id,
        cr.approver_id,
        cr.manager_id,
        cr.requester_id
      ].filter(Boolean)));
      if (notifyIds.length > 0) {
        await notificationService.notifyDCRClosed(notifyIds, cr, { id: requester_id }, reason || null);
      }

      await auditService.recordEvent('ChangeRequest', cr_id, requester_id, 'CLOSE_REQUEST', {
        reason: reason || null,
        from_status: cr.status,
        to_status: 'Closed'
      });

      return { status: 'Closed' };
    } catch (error) {
      console.error('Error closing change request:', error);
      throw error;
    }
  },

  async requestDeleteChangeRequest(cr_id: any, requester_id: any, reason: any = null) {
    try {
      await ensureChangeRequestSchemaCompatibility();
      const cr: any = await get(
        `SELECT * FROM ChangeRequest WHERE id = ? AND requester_id = ?`,
        [cr_id, requester_id]
      );

      if (!cr) {
        throw new Error('Change Request not found or not owned by requester');
      }

      if (cr.status === 'Deleted') {
        throw new Error('Change Request already deleted');
      }

      await run(
        `UPDATE ChangeRequest
                 SET status = 'Delete Requested',
                     delete_requested_at = CURRENT_TIMESTAMP,
                     delete_requested_by = ?,
                     delete_reason = COALESCE(?, delete_reason)
                 WHERE id = ?`,
        [requester_id, reason || null, cr_id]
      );

      const requester: any = await get(`SELECT id, name, employee_code FROM users WHERE id = ?`, [requester_id]);
      await notificationService.notifyDCRDeleteRequested(cr, requester, reason || null);

      await auditService.recordEvent('ChangeRequest', cr_id, requester_id, 'DELETE_REQUESTED', {
        reason: reason || null,
        from_status: cr.status,
        to_status: 'Delete Requested'
      });

      return { status: 'Delete Requested' };
    } catch (error) {
      console.error('Error requesting delete change request:', error);
      throw error;
    }
  },

  async approveDeleteChangeRequest(cr_id: any, admin_id: any, reason: any = null) {
    try {
      await ensureChangeRequestSchemaCompatibility();
      const cr: any = await get(
        `SELECT * FROM ChangeRequest WHERE id = ?`,
        [cr_id]
      );

      if (!cr) {
        throw new Error('Change Request not found');
      }

      const previousStatus = cr.status;
      await run(
        `UPDATE ChangeRequest
                 SET status = 'Deleted',
                     delete_approved_at = CURRENT_TIMESTAMP,
                     delete_approved_by = ?,
                     delete_approved_comment = COALESCE(?, delete_approved_comment)
                 WHERE id = ?`,
        [admin_id, reason || null, cr_id]
      );

      // Soft-delete the linked Document so it appears as disposed in the master list
      if (cr.document_id) {
        // Ensure deleted_at column exists (safe to run repeatedly)
        await run(`ALTER TABLE Document ADD COLUMN deleted_at DATETIME NULL`, []).catch(() => {});
        await run(
          `UPDATE Document SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND is_active = 1`,
          [cr.document_id]
        );
      }

      const actor: any = await get(`SELECT id, name FROM users WHERE id = ?`, [admin_id]);
      const dcIds = await notificationService.getDocumentControllerUserIds();
      const notifyIds = new Set<number>();
      if (cr.requester_id) notifyIds.add(Number(cr.requester_id));

      if (['Pending DC Review', 'Pending Final DC Release'].includes(previousStatus)) {
        dcIds.forEach((id: any) => notifyIds.add(Number(id)));
      } else if (['Pending Checker', 'Pending Approval'].includes(previousStatus)) {
        if (cr.checker_id) notifyIds.add(Number(cr.checker_id));
      } else if (previousStatus === 'Pending Approver') {
        if (cr.approver_id) notifyIds.add(Number(cr.approver_id));
      }

      await notificationService.notifyDCRDeleted(Array.from(notifyIds), cr, actor, reason || null, previousStatus);

      await auditService.recordEvent('ChangeRequest', cr_id, admin_id, 'DELETE_APPROVED', {
        reason: reason || null,
        from_status: previousStatus,
        to_status: 'Deleted'
      });

      return { status: 'Deleted' };
    } catch (error) {
      console.error('Error approving delete change request:', error);
      throw error;
    }
  },

  /**
   * Requester uploads revised documents (source + PDF)
   */
  async uploadRevision(
    cr_id: any,
    requester_id: any,
    files: any,
    checker_id: any,
    targetRevisionId: any = null,
    approver_id: any = null
  ) {
    try {
      await ensureChangeRequestSchemaCompatibility();
      await ensureDocumentRevisionSchemaCompatibility();
      // Validate CR state
      const cr: any = await get(
        `SELECT cr.*, d.title as document_title, d.document_type FROM ChangeRequest cr 
                 JOIN Document d ON cr.document_id = d.id 
                 WHERE cr.id = ? AND cr.requester_id = ? AND (cr.status = 'Pending Revision' OR cr.status = 'Pre-Approved' OR cr.status = 'Returned for Revision')`,
        [cr_id, requester_id]
      );

      if (!cr) {
        throw new Error('Change Request not found or not in a state to accept uploads');
      }

      if (!files || !files.source || !files.pdf) {
        throw new Error('Both source file and PDF file are required');
      }

      if (!checker_id) {
        throw new Error('checker_id is required');
      }

      const checker: any = await get(
        `SELECT u.id, u.name,
                        UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) as role_name
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE u.id = ?`,
        [checker_id]
      );

      if (!checker || !['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN'].includes(checker.role_name)) {
        throw new Error('Selected checker must be Assistant Manager or Manager');
      }

      const documentLevel = cr.document_level || detectDocumentLevel(cr);
      const approverRoleNeeded = documentLevel === 'L1' || documentLevel === 'L2'
        ? ['PRESIDENT']
        : ['MANAGER', 'ASSISTANT_MANAGER'];

      if (!approver_id) {
        throw new Error('approver_id is required');
      }

      const approverUser: any = await get(
        `SELECT u.id, u.name,
                        UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) as role_name
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE u.id = ?`,
        [approver_id]
      );

      if (!approverUser || !approverRoleNeeded.includes(approverUser.role_name)) {
        throw new Error('Selected approver does not match required role');
      }

      const sourceFile = files.source[0];
      const pdfFile = files.pdf[0];

      // Generate unique file names with timestamp
      const timestamp = Date.now();
      const sourceFileName = `doc-${cr.document_id}-source-${timestamp}${path.extname(sourceFile.originalname)}`;
      const pdfFileName = `doc-${cr.document_id}-pdf-${timestamp}.pdf`;
      const categoryFolder = toCategoryFolder(cr.document_type);
      const sourceTargetDir = path.join(ORIGINAL_DIR, categoryFolder);
      const pdfTargetDir = path.join(PDF_DIR, categoryFolder);

      // Move files to permanent storage
      const original_uri = await moveToStorage(sourceFile, sourceTargetDir, sourceFileName);
      const pdf_uri = await moveToStorage(pdfFile, pdfTargetDir, pdfFileName);

      // Compute file hashes for integrity verification
      const original_sha256 = await computeFileHash(String(original_uri));
      const pdf_sha256 = await computeFileHash(String(pdf_uri));

  const isReupload = String(cr.request_type || '').trim().toUpperCase() === 'REUPLOAD';
      let newRevisionId: any = null;

      if (isReupload) {
        const resolvedTargetId = targetRevisionId || cr.reupload_target_revision_id || cr.latest_working_revision_id;
        if (!resolvedTargetId) {
          throw new Error('No target revision specified for re-upload request');
        }

        await run(
          `UPDATE DocumentRevision
                     SET original_uri = ?, original_sha256 = ?,
                         pdf_uri = ?, pdf_sha256 = ?,
                         change_summary = COALESCE(?, change_summary),
                         created_by = ?
                     WHERE id = ?`,
          [
            original_uri,
            original_sha256,
            pdf_uri,
            pdf_sha256,
            cr.reason || 'Re-uploaded document',
            requester_id,
            resolvedTargetId
          ]
        );

        newRevisionId = resolvedTargetId;
      } else {
        const currentRevision: any = await get(
          `SELECT r.revision_number
             FROM Document d
             LEFT JOIN DocumentRevision r ON r.id = d.current_revision_id
             WHERE d.id = ?`,
          [cr.document_id]
        );
        const currentNumber = Number(currentRevision?.revision_number || 0) || 0;
        const nextRevisionNumber = currentNumber + 1;

        // Create new document revision
        const revResult: any = await run(
          `
                  INSERT INTO DocumentRevision 
                  (document_id, revision_number, rev_code, status, original_uri, original_sha256, pdf_uri, pdf_sha256, change_summary, created_by)
                  VALUES (?, ?, ?, 'Pending Approval', ?, ?, ?, ?, ?, ?)
              `,
          [
            cr.document_id,
            nextRevisionNumber,
            `Rev${String(nextRevisionNumber).padStart(2, '0')}`,
            original_uri,
            original_sha256,
            pdf_uri,
            pdf_sha256,
            cr.reason || 'Updated document',
            requester_id
          ]
        );

        newRevisionId = revResult.lastID;
      }

      // Update CR to Pending Approval
      await run(
        `UPDATE ChangeRequest
                 SET status = 'Pending Checker',
                     latest_working_revision_id = ?,
                     checker_id = ?,
                     approver_id = ?,
                     document_level = ?,
                     returned_by_role = NULL,
                     returned_comment = NULL
                 WHERE id = ?`,
        [newRevisionId, checker_id, approverUser?.id || null, documentLevel, cr_id]
      );

      // Record in audit
      await auditService.recordEvent('ChangeRequest', cr_id, requester_id, isReupload ? 'UPLOAD_REUPLOAD' : 'UPLOAD_REVISION', {
        revision_id: newRevisionId,
        original_uri,
        original_hash: original_sha256,
        pdf_uri,
        pdf_hash: pdf_sha256,
        checker_id,
        approver_id: approverUser?.id || null,
        document_level: documentLevel
      });

      const requester: any = await get(`SELECT id, name FROM users WHERE id = ?`, [requester_id]);

      if (checker) {
        await notificationService.notifyDCRNeedsCheckerDecision(checker.id, cr, requester);
      }

      return {
        message: 'Files uploaded successfully, pending checker approval',
        revision_id: newRevisionId,
  status: 'Pending Checker',
        approver_id: approverUser?.id || null,
        document_level: documentLevel
      };
    } catch (error) {
      console.error('Error uploading revision:', error);
      throw error;
    }
  },

  /**
   * Requester uploads non-signed PDF after approver approval (Form category only)
   */
  async uploadNonSignedPdf(cr_id: any, requester_id: any, pdfFile: any) {
    try {
      await ensureChangeRequestSchemaCompatibility();
      await ensureDocumentRevisionSchemaCompatibility();

      const cr: any = await get(
        `SELECT cr.*, d.document_type
                 FROM ChangeRequest cr
                 JOIN Document d ON cr.document_id = d.id
                 WHERE cr.id = ? AND cr.requester_id = ?`,
        [cr_id, requester_id]
      );

      if (!cr) {
        throw new Error('Change Request not found or not owned by requester');
      }

      if (cr.status !== 'Pending Non-Sign PDF') {
        throw new Error('Change Request is not awaiting non-signed PDF');
      }

      if (!isFormCategory(cr.document_type)) {
        throw new Error('Non-signed PDF upload is only required for Form category');
      }

      if (!pdfFile) {
        throw new Error('non_signed_pdf is required');
      }

      if (!cr.latest_working_revision_id) {
        throw new Error('No revision associated with this request');
      }

      const stored = await storeDecisionPdf(pdfFile, cr, 'non-signed');
      await run(
        `UPDATE DocumentRevision
                   SET unsigned_pdf_uri = ?, unsigned_pdf_sha256 = ?
                   WHERE id = ?`,
        [stored.pdf_uri, stored.pdf_sha256, cr.latest_working_revision_id]
      );

      await run(
        `UPDATE ChangeRequest
                   SET status = 'Pending Final DC Release'
                   WHERE id = ?`,
        [cr_id]
      );

      const actor: any = await get(`SELECT id, name FROM users WHERE id = ?`, [requester_id]);
      await notificationService.notifyDCRPendingDcFinal(cr, actor);

      await auditService.recordEvent('ChangeRequest', cr_id, requester_id, 'UPLOAD_NON_SIGN_PDF', {
        revision_id: cr.latest_working_revision_id
      });

      return { status: 'Pending Final DC Release' };
    } catch (error) {
      console.error('Error uploading non-signed PDF:', error);
      throw error;
    }
  },

  async makeInitialDecision(cr_id: any, manager_id: any, decision: any, comment = '') {
    return this.makeWorkflowDecision(cr_id, manager_id, decision, comment);
  },

  async makeFinalReview(cr_id: any, manager_id: any, decision: any, comment = '') {
    const normalized = decision === 'Return' ? 'Reject' : decision;
    return this.makeWorkflowDecision(cr_id, manager_id, normalized, comment);
  },

  /**
   * Get change request details with full information
   */
  async getChangeRequest(cr_id: any) {
    try {
      await ensureChangeRequestSchemaCompatibility();
      const drCols = (await all(`PRAGMA table_info(DocumentRevision)`, [])) as any[];
      const hasDrCol = (name: string) => drCols.some((c: any) => c.name === name);
      const revisionCodeExpr = hasDrCol('rev_code') ? 'dr.rev_code' : hasDrCol('revision_number') ? 'dr.revision_number' : 'NULL';
      const approvalCols = (await all(`PRAGMA table_info(ApprovalRecord)`, [])) as any[];
      const hasApprovalCol = (name: string) => approvalCols.some((c: any) => c.name === name);
      const approvalCrCol = hasApprovalCol('cr_id') ? 'cr_id' : hasApprovalCol('change_request_id') ? 'change_request_id' : null;
      const approvalSortCol = hasApprovalCol('decided_at')
        ? 'decided_at'
        : hasApprovalCol('approved_at')
          ? 'approved_at'
          : hasApprovalCol('created_at')
            ? 'created_at'
            : 'id';

      const cr: any = await get(
        `
                SELECT cr.*, 
                      d.id as doc_id, d.doc_number, d.title as document_title, d.document_type as document_category, d.department as owning_department,
                       u1.name as requester_name, u2.name as manager_name,
        u3.name as checker_name, u4.name as approver_name,
        u5.name as reupload_requested_by_name, u6.name as reupload_assignee_name,
                       dr.id as revision_id, ${revisionCodeExpr} as rev_code, dr.status as revision_status
                FROM ChangeRequest cr
                LEFT JOIN Document d ON cr.document_id = d.id
                LEFT JOIN users u1 ON cr.requester_id = u1.id
                LEFT JOIN users u2 ON cr.manager_id = u2.id
                LEFT JOIN users u3 ON cr.checker_id = u3.id
                LEFT JOIN users u4 ON cr.approver_id = u4.id
      LEFT JOIN users u5 ON cr.reupload_requested_by = u5.id
      LEFT JOIN users u6 ON cr.reupload_assignee_id = u6.id
                LEFT JOIN DocumentRevision dr ON cr.latest_working_revision_id = dr.id
                WHERE cr.id = ?
            `,
        [cr_id]
      );

      if (!cr) return null;

      // Get approval records
      let approvals: any[] = approvalCrCol
        ? await all(
          `SELECT ar.*, u.name as approver_name, u.employee_code as approver_code, ar.decided_by_role as approver_role
                 FROM ApprovalRecord ar
                 LEFT JOIN users u ON u.id = ar.decided_by
                 WHERE ar.${approvalCrCol} = ?
                 ORDER BY ar.${approvalSortCol} DESC`,
          [cr_id]
        ) as any[]
        : [];

      const approvalActions = [
        'APPROVE_CHECKER',
        'REJECT_CHECKER',
        'APPROVE_APPROVER',
        'APPROVE_APPROVER_FORM',
        'REJECT_APPROVER',
        'APPROVE_DC_FINAL_RELEASE',
        'REJECT_DC_FINAL',
        'APPROVE_DC_INITIAL',
        'REJECT_DC_INITIAL'
      ];

      const approvalEventRows: any[] = approvalActions.length
        ? await all(
          `SELECT action, actor_id, metadata, created_at
             FROM AuditEvent
             WHERE entity_type = 'ChangeRequest'
               AND entity_id = ?
               AND action IN (${approvalActions.map(() => '?').join(',')})
             ORDER BY created_at DESC`,
          [cr_id, ...approvalActions]
        ) as any[]
        : [];

      const approvalEvents = await Promise.all((approvalEventRows || []).map(async (row: any) => {
        let metadata: any = null;
        try {
          metadata = row?.metadata ? JSON.parse(row.metadata) : null;
        } catch {
          metadata = null;
        }
        const signedUri = metadata?.decision_signed_pdf_uri || null;
        const markedUri = metadata?.decision_marked_pdf_uri || null;
        const signedDownload = signedUri
          ? await signedUrlService.generateSignedUrl(cr_id, cr.document_id || cr.doc_id, cr.requester_id, signedUri)
          : null;
        const markedDownload = markedUri
          ? await signedUrlService.generateSignedUrl(cr_id, cr.document_id || cr.doc_id, cr.requester_id, markedUri)
          : null;
        return {
          ...row,
          signed_download: signedDownload,
          marked_download: markedDownload
        };
      }));

      const resolveActionsForApproval = (approval: any) => {
        const decision = String(approval?.decision || '').toLowerCase();
        const roleLabel = String(
          approval?.approver_role || approval?.decided_by_role || approval?.stage || approval?.step || ''
        ).toUpperCase();

        const isChecker = roleLabel.includes('CHECKER');
        const isApprover = roleLabel.includes('APPROVER');
        const isDc = roleLabel.includes('DOCUMENT_CONTROL') || roleLabel.includes('DC');

        if (isChecker && decision === 'approve') return ['APPROVE_CHECKER'];
        if (isChecker && decision === 'reject') return ['REJECT_CHECKER'];
        if (isApprover && decision === 'approve') return ['APPROVE_APPROVER_FORM', 'APPROVE_APPROVER'];
        if (isApprover && decision === 'reject') return ['REJECT_APPROVER'];
        if (isDc && decision === 'approve') return ['APPROVE_DC_FINAL_RELEASE', 'APPROVE_DC_INITIAL'];
        if (isDc && decision === 'reject') return ['REJECT_DC_FINAL', 'REJECT_DC_INITIAL'];

        const step = String(approval?.step || '').toUpperCase();
        if (step === 'CHECKER' && decision === 'approve') return ['APPROVE_CHECKER'];
        if (step === 'CHECKER' && decision === 'reject') return ['REJECT_CHECKER'];
        if (step === 'APPROVER' && decision === 'approve') return ['APPROVE_APPROVER_FORM', 'APPROVE_APPROVER'];
        if (step === 'APPROVER' && decision === 'reject') return ['REJECT_APPROVER'];
        if (step === 'DC_FINAL' && decision === 'approve') return ['APPROVE_DC_FINAL_RELEASE'];
        if (step === 'DC_FINAL' && decision === 'reject') return ['REJECT_DC_FINAL'];
        if (step === 'DC_INITIAL' && decision === 'approve') return ['APPROVE_DC_INITIAL'];
        if (step === 'DC_INITIAL' && decision === 'reject') return ['REJECT_DC_INITIAL'];
        return [];
      };

      const pickBestApprovalEvent = (approval: any) => {
        const actions = resolveActionsForApproval(approval);
        const actorId = approval?.decided_by ? Number(approval.decided_by) : null;
        const decidedAt = approval?.decided_at ? new Date(approval.decided_at).getTime() : null;
        const decisionLabel = String(approval?.decision || '').toLowerCase();

        let matches = actions.length
          ? approvalEvents.filter((event: any) => actions.includes(event.action))
          : approvalEvents.filter((event: any) => {
            if (decisionLabel === 'approve' || decisionLabel === 'approved') {
              return String(event.action || '').toUpperCase().startsWith('APPROVE_');
            }
            if (decisionLabel === 'reject' || decisionLabel === 'rejected') {
              return String(event.action || '').toUpperCase().startsWith('REJECT_');
            }
            return false;
          });

        if (actorId) {
          matches = matches.filter((event: any) => Number(event.actor_id) === actorId);
        }
        if (!matches.length) return null;
        if (!decidedAt) return matches[0];
        let best = matches[0];
        let bestDiff = Math.abs(new Date(matches[0].created_at).getTime() - decidedAt);
        for (const candidate of matches.slice(1)) {
          const diff = Math.abs(new Date(candidate.created_at).getTime() - decidedAt);
          if (diff < bestDiff) {
            best = candidate;
            bestDiff = diff;
          }
        }
        return best;
      };

      // Get all revisions for this document
      const revisions = await all(`
                SELECT * FROM DocumentRevision WHERE document_id = ? ORDER BY id DESC
            `,
      [cr.document_id || cr.doc_id]);

      const latestRevision = Array.isArray(revisions)
        ? (revisions.find((rev: any) => Number(rev.id) === Number(cr.latest_working_revision_id)) || revisions[0])
        : null;

      const checkerFallbackSignedDownload = cr.status === 'Pending Approver' && latestRevision?.pdf_uri
        ? await signedUrlService.generateSignedUrl(cr_id, cr.document_id || cr.doc_id, cr.requester_id, latestRevision.pdf_uri)
        : null;

      approvals = (approvals || []).map((approval: any) => {
        const match = pickBestApprovalEvent(approval);
        const isCheckerApproval = String(approval?.step || '').toUpperCase() === 'CHECKER'
          && String(approval?.decision || '').toLowerCase() === 'approve';
        return {
          ...approval,
          decision_signed_pdf_download: match?.signed_download || (isCheckerApproval ? checkerFallbackSignedDownload : null),
          decision_marked_pdf_download: match?.marked_download || null
        };
      });

      let dcSourceDownload: any = null;
      const candidateSourceUri = cr.dc_source_uri || (revisions?.[0] as any)?.original_uri || null;
      if (candidateSourceUri && ['Pending Revision', 'Returned for Revision'].includes(cr.status)) {
        dcSourceDownload = await signedUrlService.generateSignedUrl(
          cr.id,
          cr.document_id || cr.doc_id,
          cr.requester_id,
          candidateSourceUri
        );
      }

      const markedRows = (await all(
        `SELECT action, metadata, created_at
           FROM AuditEvent
           WHERE entity_type = 'ChangeRequest'
             AND entity_id = ?
             AND action IN ('REJECT_CHECKER', 'REJECT_APPROVER', 'REJECT_DC_FINAL')
           ORDER BY created_at DESC`,
        [cr_id]
      )) as any[];

      const markedDownloads: any = {};
      for (const row of markedRows || []) {
        let metadata: any = null;
        try {
          metadata = row?.metadata ? JSON.parse(row.metadata) : null;
        } catch {
          metadata = null;
        }
        const uri = metadata?.decision_marked_pdf_uri;
        if (!uri) continue;
        const link = await signedUrlService.generateSignedUrl(cr_id, cr.document_id || cr.doc_id, cr.requester_id, uri);
        if (row.action === 'REJECT_CHECKER' && !markedDownloads.checker) {
          markedDownloads.checker = link;
        } else if (row.action === 'REJECT_APPROVER' && !markedDownloads.approver) {
          markedDownloads.approver = link;
        } else if (row.action === 'REJECT_DC_FINAL' && !markedDownloads.dc) {
          markedDownloads.dc = link;
        }
      }

      return {
        ...cr,
        dc_source_download: dcSourceDownload,
        approvals: approvals || [],
        revisions: revisions || [],
        marked_pdf_downloads: markedDownloads
      };
    } catch (error) {
      console.error('Error getting change request:', error);
      throw error;
    }
  },

  /**
   * Get all change requests for a user (as requester or manager)
   */
  async getUserChangeRequests(user_id: any, role: any) {
    try {
      await ensureChangeRequestSchemaCompatibility();
      const roleValue = String(role || '').toLowerCase();
      let sql = `
                                SELECT cr.*, d.title as document_title, d.title as title,
                                             d.doc_number as doc_no, d.doc_number,
                                             d.document_type as level, d.document_type as document_category,
                                             dr.revision_number as revision,
                                             u1.name as requester_name, u1.employee_code as requester_id,
                                             u2.name as manager_name, u2.employee_code as manager_employee_code,
                                             u3.name as checker_name, u3.employee_code as checker_employee_code,
                                             u4.name as approver_name, u4.employee_code as approver_id
                FROM ChangeRequest cr
                LEFT JOIN Document d ON cr.document_id = d.id
                                LEFT JOIN DocumentRevision dr
                                    ON dr.id = COALESCE(
                                        d.current_revision_id,
                                        (
                                            SELECT id
                                            FROM DocumentRevision r2
                                            WHERE r2.document_id = d.id
                                            ORDER BY r2.id DESC
                                            LIMIT 1
                                        )
                                    )
                LEFT JOIN users u1 ON cr.requester_id = u1.id
                LEFT JOIN users u2 ON cr.manager_id = u2.id
                LEFT JOIN users u3 ON cr.checker_id = u3.id
                LEFT JOIN users u4 ON cr.approver_id = u4.id
                WHERE 1=1
            `;

      const queryParams: any[] = [];

      if (roleValue === 'requester' || roleValue === 'change_requester') {
        sql += ` AND (cr.requester_id = ? OR cr.reupload_requested_by = ?)`;
        queryParams.push(user_id, user_id);
      } else if (roleValue === 'manager' || roleValue === 'mgr' || roleValue === 'qmr') {
        sql += ` AND cr.manager_id = ?`;
        queryParams.push(user_id);
      } else if (roleValue === 'checker') {
        sql += ` AND cr.checker_id = ?`;
        queryParams.push(user_id);
      } else if (roleValue === 'approver') {
        sql += ` AND cr.approver_id = ?`;
        queryParams.push(user_id);
      }

      sql += ` ORDER BY cr.submitted_at DESC, cr.created_at DESC`;

      const results: any[] = (await all(sql, queryParams)) as any[];
      if (!results || results.length === 0) {
        return [];
      }

      const crIds = results.map((item: any) => item.id);
      const placeholders = crIds.map(() => '?').join(',');
      const viewerRows = (await all(
        `SELECT
                    ae.entity_id as cr_id,
                    ae.created_at,
                    u.employee_code,
                    u.name as viewer_name
                 FROM AuditEvent ae
                 LEFT JOIN users u ON u.id = ae.actor_id
                 WHERE ae.entity_type = 'ChangeRequest'
                   AND ae.action = 'VIEW'
                   AND ae.entity_id IN (${placeholders})
                 ORDER BY ae.created_at ASC`,
        crIds
      )) as any[];

      const viewerMap: any = {};
      for (const row of viewerRows || []) {
        if (!viewerMap[row.cr_id]) {
          viewerMap[row.cr_id] = {
            codes: new Set(),
            logs: []
          };
        }
        if (row.employee_code) {
          viewerMap[row.cr_id].codes.add(row.employee_code);
        }
        viewerMap[row.cr_id].logs.push({
          login_id: row.employee_code || '-',
          viewer_name: row.viewer_name || '-',
          accessed_at: row.created_at
        });
      }

      return results.map((item: any) => {
        const viewers = viewerMap[item.id];
        return {
          ...item,
          viewer_login_ids: viewers ? Array.from(viewers.codes) : [],
          viewer_access_logs: viewers ? viewers.logs : []
        };
      });
    } catch (error) {
      console.error('Error fetching user change requests:', error);
      throw error;
    }
  },

  /**
   * Get change request history (audit trail)
   */
  async getChangeRequestHistory(cr_id: any) {
    try {
      const approvalCols = (await all(`PRAGMA table_info(ApprovalRecord)`, [])) as any[];
      const hasApprovalCol = (name: string) => approvalCols.some((c: any) => c.name === name);
      const approvalCrCol = hasApprovalCol('cr_id') ? 'cr_id' : hasApprovalCol('change_request_id') ? 'change_request_id' : null;
      const approverIdCol = hasApprovalCol('decided_by') ? 'decided_by' : hasApprovalCol('approver_id') ? 'approver_id' : null;
      const stepCol = hasApprovalCol('step') ? 'step' : hasApprovalCol('gate') ? 'gate' : null;
      const commentCol = hasApprovalCol('comment') ? 'comment' : hasApprovalCol('comments') ? 'comments' : null;
      const decidedAtCol = hasApprovalCol('decided_at')
        ? 'decided_at'
        : hasApprovalCol('approved_at')
          ? 'approved_at'
          : hasApprovalCol('created_at')
            ? 'created_at'
            : null;

      const approvals = await all(
        `
                SELECT id,
                       ${stepCol ? stepCol : 'NULL'} as step,
                       decision,
                       ${approverIdCol ? approverIdCol : 'NULL'} as decided_by,
                       ${approverIdCol ? `(SELECT name FROM users WHERE id = ApprovalRecord.${approverIdCol})` : 'NULL'} as decided_by_name,
                       ${decidedAtCol ? decidedAtCol : 'NULL'} as decided_at,
                       ${commentCol ? commentCol : 'NULL'} as comment
                FROM ApprovalRecord 
                WHERE ${approvalCrCol ? approvalCrCol : '1=0'} = ? 
                ORDER BY ${decidedAtCol ? decidedAtCol : 'id'} DESC
            `,
        [cr_id]
      );

      const events = await all(
        `
                SELECT ae.id, ae.action, ae.created_at,
                       (SELECT name FROM users WHERE id = ae.actor_id) as actor_name,
                       ae.metadata
                FROM AuditEvent ae
                WHERE ae.entity_type = 'ChangeRequest' AND ae.entity_id = ?
                ORDER BY ae.created_at DESC
            `,
        [cr_id]
      );

      return {
        approvals: approvals || [],
        events: events || []
      };
    } catch (error) {
      console.error('Error fetching change request history:', error);
      throw error;
    }
  }
};

export = dcrService;
