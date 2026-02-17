const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbFile = path.join(__dirname, '..', 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbFile);

// middleware/audit.js
function logAction(db, userId, action, targetType, targetId, details = '') {
  try {
    const sql = `INSERT INTO audit_logs (user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [userId, action, targetType, targetId, details], function(err) {
      if (err) console.error('logAction DB error', err);
    });
  } catch (err) {
    console.error('logAction error', err);
  }
}

module.exports = { logAction };
