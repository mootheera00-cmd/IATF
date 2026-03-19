// seeds/seed_sample_users.ts
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const DB_PATH = path.resolve(__dirname, '../db/nskiatf_doccontrol.db');
const db = new sqlite3.Database(DB_PATH);

function run(sql: string, params: any[] = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err: any) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}
function get(sql: string, params: any[] = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err: any, row: any) => (err ? reject(err) : resolve(row)));
  });
}

(async () => {
  try {
    console.log('📦 DB File :', DB_PATH);
    await run('PRAGMA foreign_keys = ON;');

    // หา role Manager / Engineer
    const manager: any = await get(`SELECT id FROM roles WHERE name = 'Manager'`);
    const user: any = await get(`SELECT id FROM roles WHERE name = 'Engineer'`);

    if (!manager || !user) throw new Error('Roles not seeded yet. Run seed_admin.js first.');

    const samples = [
      { code: 'EMP001', name: 'Jane Manager', pass: 'Pass@123', role_id: manager.id },
      { code: 'EMP002', name: 'John User', pass: 'Pass@123', role_id: user.id }
    ];

    for (const s of samples) {
      const existed: any = await get(`SELECT id FROM users WHERE employee_code = ?`, [s.code]);
      if (existed) {
        console.log(`ℹ️  Skip existed: ${s.code}`);
        continue;
      }
      const hash = await bcrypt.hash(s.pass, 10);
      await run(`INSERT INTO users (employee_code, name, password_hash, role_id) VALUES (?, ?, ?, ?)`, [
        s.code,
        s.name,
        hash,
        s.role_id
      ]);
      console.log(`✅ Seeded user ${s.code} / password="${s.pass}"`);
    }

    console.log('✅ Sample users seeded.');
  } catch (err: any) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
})();

export {};
