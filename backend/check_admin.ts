// backend/check_admin.ts
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/nskiatf_doccontrol.db');

db.serialize(() => {
  console.log('--- ตรวจสอบรายชื่อ Users ---');
  db.each(
    'SELECT id, employee_code, password, name FROM users',
    (err: any, row: any) => {
      console.log(`👤 User: ${row.employee_code} | Pass: ${row.password} | Name: ${row.name}`);
    },
    (err: any, count: number) => {
      console.log(`\nรวมทั้งหมด: ${count} คน`);
      if (count === 0) console.log('⚠️ ไม่มี User ในระบบ! (ต้องรัน node migrate.js ใหม่)');
    }
  );
});

db.close();

export {};
