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

const requiredTables: Record<string, string[]> = {
  roles: ['id', 'name'],
  users: ['id', 'employee_code', 'name', 'role_id', 'password', 'password_hash', 'department', 'email', 'is_active', 'created_at'],
  Document: ['id', 'title', 'document_type', 'doc_number', 'current_revision_id', 'department', 'is_active', 'created_at'],
  DocumentRevision: [
    'id',
    'document_id',
    'revision_number',
    'rev_code',
    'status',
    'file_path_original',
    'file_path_pdf',
    'hash_original',
    'hash_pdf',
    'original_uri',
    'original_sha256',
    'pdf_uri',
    'pdf_sha256',
    'change_summary',
    'created_by',
    'released_by',
    'released_at',
    'supersedes_revision_id',
    'created_at'
  ],
  ChangeRequest: [
    'id',
    'document_id',
    'requester_id',
    'reason',
    'status',
    'assigned_manager_id',
    'manager_id',
    'latest_working_revision_id',
    'preapproved_at',
    'final_approved_at',
    'rejected_at',
    'returned_at',
    'checker_id',
    'approver_id',
    'document_level',
    'dc_initial_at',
    'checker_approved_at',
    'approver_approved_at',
    'dc_final_approved_at',
    'returned_by_role',
    'returned_comment',
  'closed_at',
    'dc_source_uri',
    'dc_source_sha256',
    'dc_source_name',
    'submitted_at',
    'created_at'
  ],
  ApprovalRecord: ['id', 'decision', 'comments', 'comment', 'gate', 'step', 'approved_at', 'decided_at', 'approver_id', 'decided_by', 'decided_by_role', 'cr_id', 'change_request_id', 'created_at'],
  AuditEvent: ['id', 'entity_type', 'entity_id', 'actor_id', 'action', 'metadata', 'created_at', 'event_type', 'user_id', 'old_value', 'new_value', 'timestamp'],
  Notification: ['id', 'user_id', 'type', 'related_cr_id', 'message', 'is_read', 'created_at', 'metadata', 'read_at'],
  SignedUrlToken: ['id', 'token', 'cr_id', 'document_id', 'user_id', 'file_uri', 'expires_at', 'used_at', 'created_at'],
  Positions: ['id', 'position_name', 'department', 'assigned_user_id'],
  audit_logs: ['id', 'user_id', 'action', 'target_type', 'target_id', 'details', 'created_at'],
  access_logs: ['id', 'user_id', 'action', 'detail', 'created_at']
};

function all(sql: string, params: any[] = []) {
  return new Promise<any[]>((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any[]) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function main() {
  const tables = await all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tableNames = new Set(tables.map((t: any) => t.name));

  const missingTables = Object.keys(requiredTables).filter((table) => !tableNames.has(table));
  if (missingTables.length) {
    console.log('❌ Missing tables:', missingTables);
  } else {
    console.log('✅ All required tables present.');
  }

  for (const [table, expectedCols] of Object.entries(requiredTables)) {
    if (!tableNames.has(table)) continue;
    const cols = await all(`PRAGMA table_info(${table})`);
    const colNames = cols.map((c: any) => c.name);
    const missingCols = expectedCols.filter((col) => !colNames.includes(col));
    if (missingCols.length) {
      console.log(`⚠️ Table ${table} missing columns:`, missingCols);
    }
  }

  db.close();
}

main().catch((err: any) => {
  console.error('❌ Audit failed:', err.message);
  db.close();
  process.exit(1);
});

export {};
