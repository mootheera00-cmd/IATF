// tools/reset_admin_password.js
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt'); // ถ้า build ไม่ผ่าน ให้ใช้ 'bcryptjs'

const DB_PATH = path.resolve(__dirname, '../db/nskiatf_doccontrol.db');

// ปรับได้ตามต้องการ
const ADMIN_CODE    = 'ADMIN001';
const ADMIN_NAME    = 'System Admin';
const NEW_PASSWORD  = 'Admin@123';

const db = new sqlite3.Database(DB_PATH);

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
      if (err) return reject(err);
      resolve(this);
    });
  });
}

(async () => {
  try {
    console.log('📦 DB :', DB_PATH);
    await run(`PRAGMA foreign_keys = ON;`);

    // ให้แน่ใจว่า roles มี ADMIN
    await run(`CREATE TABLE IF NOT EXISTS roles (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );`);
    await run(`INSERT OR IGNORE INTO roles(name) VALUES ('ADMIN')`);
    const role = await get(`SELECT id FROM roles WHERE name = 'ADMIN'`);
    if (!role) throw new Error('ADMIN role not found');

    // กัน schema เก่า: เติมคอลัมน์ที่จำเป็นถ้ายังไม่มี
    const cols = await all(`PRAGMA table_info(users)`);
    const names = cols.map(c => String(c.name).toLowerCase());
    async function addIfMissing(def) {
      const n = def.split(/\s+/)[0].toLowerCase();
      if (!names.includes(n)) {
        await run(`ALTER TABLE users ADD COLUMN ${def};`);
        console.log(`+ Added column: ${def}`);
      }
    }
    await addIfMissing('password_hash TEXT');
    await addIfMissing('role_id INTEGER');
    await addIfMissing('created_at TEXT');
    await addIfMissing('updated_at TEXT');

    // แฮชรหัสใหม่
    const hash = await bcrypt.hash(NEW_PASSWORD, 10);

    // ถ้าไม่มี ADMIN001 → สร้างใหม่, ถ้ามีแล้ว → อัปเดตรหัส + เติม role_id หากว่าง
    const admin = await get(`SELECT * FROM users WHERE employee_code = ?`, [ADMIN_CODE]);
    if (!admin) {
      await run(`CREATE TABLE IF NOT EXISTS users (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_code  TEXT NOT NULL UNIQUE,
        name           TEXT NOT NULL,
        password_hash  TEXT,
        role_id        INTEGER,
        created_at     TEXT DEFAULT (datetime('now')),
        updated_at     TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL ON UPDATE CASCADE
      );`);
      await run(
        `INSERT INTO users (employee_code, name, password_hash, role_id)
         VALUES (?, ?, ?, ?)`,
        [ADMIN_CODE, ADMIN_NAME, hash, role.id]
      );
      console.log(`✅ Created admin user: ${ADMIN_CODE}`);
    } else {
      await run(
        `UPDATE users
           SET password_hash = ?,
               role_id       = COALESCE(role_id, ?),
               updated_at    = datetime('now')
         WHERE employee_code = ?`,
        [hash, role.id, ADMIN_CODE]
      );
      console.log(`✅ Updated admin password for: ${ADMIN_CODE}`);
    }

    console.log(`🎯 ADMIN login: ${ADMIN_CODE} / ${NEW_PASSWORD}`);
    console.log('✅ Done.');
  } catch (err) {
    console.error('❌ Reset failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
})();