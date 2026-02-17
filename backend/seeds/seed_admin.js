// seeds/seed_admin.js
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const DB_PATH = path.resolve(__dirname, '../db/nskiatf_doccontrol.db');
const db = new sqlite3.Database(DB_PATH);

const ADMIN_CODE = 'ADMIN001';
const ADMIN_NAME = 'System Admin';
// <<<<< แก้รหัสผ่านแอดมินได้ที่นี่
const ADMIN_PASSWORD_PLAIN = 'Admin@123';

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

(async () => {
  try {
    console.log('📦 DB File :', DB_PATH);
    await run('PRAGMA foreign_keys = ON;');

    // 1) Ensure base roles
    const baseRoles = ['ADMIN', 'MANAGER', 'USER'];
    for (const r of baseRoles) {
      await run(
        `INSERT OR IGNORE INTO roles (name) VALUES (?)`,
        [r]
      );
    }

    // 2) get ADMIN role id
    const adminRole = await get(`SELECT id FROM roles WHERE name = 'ADMIN'`);
    if (!adminRole) throw new Error('ADMIN role not found after seeding roles.');

    // 3) check existing admin
    const existed = await get(
      `SELECT id, employee_code FROM users WHERE employee_code = ?`,
      [ADMIN_CODE]
    );

    if (existed) {
      console.log(`ℹ️  Admin "${ADMIN_CODE}" already exists. Skipping create.`);
    } else {
      const hash = await bcrypt.hash(ADMIN_PASSWORD_PLAIN, 10);
      await run(
        `INSERT INTO users (employee_code, name, password_hash, role_id) VALUES (?, ?, ?, ?)`,
        [ADMIN_CODE, ADMIN_NAME, hash, adminRole.id]
      );
      console.log(`✅ Admin created: ${ADMIN_CODE} / password="${ADMIN_PASSWORD_PLAIN}"`);
    }

    console.log('✅ Seed completed.');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
})();