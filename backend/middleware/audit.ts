// middleware/audit.ts
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbCandidates = [
  path.resolve(__dirname, '..', '..', 'db', 'nskiatf_doccontrol.db'),
  path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db'),
  path.resolve(process.cwd(), 'db', 'nskiatf_doccontrol.db')
];
const dbFile = dbCandidates.find((candidate: string) => fs.existsSync(candidate)) || dbCandidates[0];
const db = new sqlite3.Database(dbFile);

function ensureAuditLogsTable(dbInstance: any) {
  (dbInstance || db).run(
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT,
      target_type TEXT,
      target_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );
}

// middleware/audit.js
function logAction(dbInstance: any, userId: any, action: any, targetType: any, targetId: any, details = '') {
  try {
    ensureAuditLogsTable(dbInstance);
    const sql = `INSERT INTO audit_logs (user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)`;
    (dbInstance || db).run(sql, [userId, action, targetType, targetId, details], function (err: any) {
      if (err) console.error('logAction DB error', err);
    });
  } catch (err) {
    console.error('logAction error', err);
  }
}

export = { logAction };
