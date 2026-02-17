// migrations/patch_users_add_missing_columns.js
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.resolve(__dirname, '../db/nskiatf_doccontrol.db');
const db = new sqlite3.Database(DB_PATH);

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
    console.log('📦 DB File :', DB_PATH);
    await run('PRAGMA foreign_keys = ON;');

    // อ่าน column ปัจจุบันของตาราง users
    const cols = await all(`PRAGMA table_info(users);`);
    const names = cols.map(c => String(c.name).toLowerCase());

    // helper: ถ้ายังไม่มีคอลัมน์ ให้เพิ่ม
    const addIfMissing = async (colDef) => {
      const name = colDef.split(/\s+/)[0].replace(/[`"'\[\]]/g, '').toLowerCase();
      if (!names.includes(name)) {
        await run(`ALTER TABLE users ADD COLUMN ${colDef};`);
        console.log(`+ Added column: ${colDef}`);
      } else {
        console.log(`= Column exists: ${name}`);
      }
    };

    // เพิ่มคอลัมน์ที่เราต้องใช้ในระบบนี้ (ถ้าขาด)
    await addIfMissing('password_hash TEXT');
    await addIfMissing('role_id INTEGER');
    await addIfMissing('created_at TEXT');
    await addIfMissing('updated_at TEXT');

    // เติมค่าเวลาเริ่มต้นให้แถวเดิม (ถ้ายังว่าง)
    await run(`UPDATE users SET created_at = COALESCE(created_at, datetime('now'))`);
    await run(`UPDATE users SET updated_at = COALESCE(updated_at, datetime('now'))`);

    console.log('✅ Patch completed.');
  } catch (err) {
    console.error('❌ Patch failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
})();