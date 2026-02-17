// migrations/migrate_init.js
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.resolve(__dirname, '../db/nskiatf_doccontrol.db');
const db = new sqlite3.Database(DB_PATH);

function run(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => (err ? reject(err) : resolve()));
  });
}

(async () => {
  try {
    console.log('📦 DB File :', DB_PATH);
    await run('PRAGMA foreign_keys = ON;');

    // ROLES
    await run(`
      CREATE TABLE IF NOT EXISTS roles (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );
    `);

    // USERS
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_code  TEXT NOT NULL UNIQUE,
        name           TEXT NOT NULL,
        password_hash  TEXT NOT NULL,
        role_id        INTEGER,
        created_at     TEXT DEFAULT (datetime('now')),
        updated_at     TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL ON UPDATE CASCADE
      );
    `);

    // DOCUMENTS (พื้นฐานสำหรับระบบควบคุมเอกสาร)
    await run(`
      CREATE TABLE IF NOT EXISTS documents (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT NOT NULL,
        category    TEXT,                     -- Quality | HR | Finance | Safety
        version     TEXT,
        filepath    TEXT,
        created_by  INTEGER,
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // CHANGE REQUESTS (พื้นฐานสำหรับ workflow อนุมัติ)
    await run(`
      CREATE TABLE IF NOT EXISTS change_requests (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id   INTEGER NOT NULL,
        requested_by  INTEGER,
        remark        TEXT,
        status        TEXT DEFAULT 'pending', -- pending | approved | rejected
        created_at    TEXT DEFAULT (datetime('now')),
        updated_at    TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    console.log('✅ Migration completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
})();