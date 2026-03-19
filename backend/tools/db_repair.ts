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

function run(sql: string, params: any[] = []) {
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function all(sql: string, params: any[] = []) {
  return new Promise<any[]>((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any[]) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function ensureTable(table: string, ddl: string) {
  await run(`CREATE TABLE IF NOT EXISTS ${table} ${ddl}`);
}

async function ensureColumn(table: string, column: string, definition: string) {
  const cols = await all(`PRAGMA table_info(${table})`);
  if (!cols.some((c: any) => c.name === column)) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`➕ Added ${table}.${column}`);
  }
}

async function main() {
  await ensureTable('roles', '(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)');

  await ensureTable(
    'users',
    `(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password TEXT,
      password_hash TEXT,
      role_id INTEGER NOT NULL,
      department TEXT,
      email TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (role_id) REFERENCES roles(id)
    )`
  );

  await ensureTable(
    'Document',
    `(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      document_type TEXT,
      doc_number TEXT,
      current_revision_id INTEGER,
      department TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await ensureTable(
    'DocumentRevision',
    `(
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
    )`
  );

  await ensureTable(
    'ChangeRequest',
    `(
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
    )`
  );

  await ensureTable(
    'ApprovalRecord',
    `(
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
    )`
  );

  await ensureTable(
    'AuditEvent',
    `(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT,
      entity_id INTEGER,
      event_type TEXT,
      user_id INTEGER,
      old_value TEXT,
      new_value TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`
  );

  await ensureTable(
    'Notification',
    `(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT,
      related_cr_id INTEGER,
      message TEXT,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (related_cr_id) REFERENCES ChangeRequest(id)
    )`
  );

  await ensureTable(
    'SignedUrlToken',
    `(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      cr_id INTEGER,
      file_type TEXT,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cr_id) REFERENCES ChangeRequest(id)
    )`
  );

  await ensureTable(
    'Positions',
    `(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_name TEXT,
      department TEXT,
      assigned_user_id INTEGER,
      FOREIGN KEY (assigned_user_id) REFERENCES users(id)
    )`
  );

  await ensureTable(
    'audit_logs',
    `(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT,
      target_type TEXT,
      target_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await ensureTable(
    'access_logs',
    `(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT,
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await ensureColumn('Document', 'doc_number', 'TEXT');

  await ensureColumn('DocumentRevision', 'rev_code', 'VARCHAR(32)');
  await ensureColumn('DocumentRevision', 'original_uri', 'TEXT');
  await ensureColumn('DocumentRevision', 'original_sha256', 'CHAR(64)');
  await ensureColumn('DocumentRevision', 'pdf_uri', 'TEXT');
  await ensureColumn('DocumentRevision', 'pdf_sha256', 'CHAR(64)');
  await ensureColumn('DocumentRevision', 'change_summary', 'TEXT');
  await ensureColumn('DocumentRevision', 'created_by', 'BIGINT');
  await ensureColumn('DocumentRevision', 'released_by', 'BIGINT');
  await ensureColumn('DocumentRevision', 'released_at', 'TIMESTAMP');
  await ensureColumn('DocumentRevision', 'supersedes_revision_id', 'BIGINT');

  await ensureColumn('ChangeRequest', 'manager_id', 'BIGINT');
  await ensureColumn('ChangeRequest', 'latest_working_revision_id', 'BIGINT');
  await ensureColumn('ChangeRequest', 'preapproved_at', 'TIMESTAMP');
  await ensureColumn('ChangeRequest', 'final_approved_at', 'TIMESTAMP');
  await ensureColumn('ChangeRequest', 'rejected_at', 'TIMESTAMP');
  await ensureColumn('ChangeRequest', 'returned_at', 'TIMESTAMP');
  await ensureColumn('ChangeRequest', 'checker_id', 'BIGINT');
  await ensureColumn('ChangeRequest', 'approver_id', 'BIGINT');
  await ensureColumn('ChangeRequest', 'document_level', 'VARCHAR(8)');
  await ensureColumn('ChangeRequest', 'dc_initial_at', 'TIMESTAMP');
  await ensureColumn('ChangeRequest', 'checker_approved_at', 'TIMESTAMP');
  await ensureColumn('ChangeRequest', 'approver_approved_at', 'TIMESTAMP');
  await ensureColumn('ChangeRequest', 'dc_final_approved_at', 'TIMESTAMP');
  await ensureColumn('ChangeRequest', 'returned_by_role', 'VARCHAR(32)');
  await ensureColumn('ChangeRequest', 'returned_comment', 'TEXT');
  await ensureColumn('ChangeRequest', 'closed_at', 'TIMESTAMP');
  await ensureColumn('ChangeRequest', 'dc_source_uri', 'TEXT');
  await ensureColumn('ChangeRequest', 'dc_source_sha256', 'CHAR(64)');
  await ensureColumn('ChangeRequest', 'dc_source_name', 'TEXT');

  await ensureColumn('ApprovalRecord', 'step', 'TEXT');
  await ensureColumn('ApprovalRecord', 'decided_by', 'BIGINT');
  await ensureColumn('ApprovalRecord', 'decided_by_role', 'VARCHAR(32)');
  await ensureColumn('ApprovalRecord', 'decided_at', 'TIMESTAMP');
  await ensureColumn('ApprovalRecord', 'comment', 'TEXT');
  await ensureColumn('ApprovalRecord', 'cr_id', 'BIGINT');

  await ensureColumn('AuditEvent', 'actor_id', 'BIGINT');
  await ensureColumn('AuditEvent', 'action', 'TEXT');
  await ensureColumn('AuditEvent', 'metadata', 'TEXT');
  await ensureColumn('AuditEvent', 'created_at', 'TIMESTAMP');

  await ensureColumn('Notification', 'metadata', 'TEXT');
  await ensureColumn('Notification', 'read_at', 'TIMESTAMP');

  await ensureColumn('SignedUrlToken', 'document_id', 'INTEGER');
  await ensureColumn('SignedUrlToken', 'user_id', 'INTEGER');
  await ensureColumn('SignedUrlToken', 'file_uri', 'TEXT');
  await ensureColumn('SignedUrlToken', 'used_at', 'TIMESTAMP');

  await ensureColumn('audit_logs', 'target_type', 'TEXT');
  await ensureColumn('audit_logs', 'target_id', 'INTEGER');
  await ensureColumn('audit_logs', 'created_at', 'DATETIME');

  console.log('✅ Database repair complete.');
  db.close();
}

main().catch((err: any) => {
  console.error('❌ Repair failed:', err.message);
  db.close();
  process.exit(1);
});

export {};
