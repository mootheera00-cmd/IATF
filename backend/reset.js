const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

// กำหนด employee_code และ password ใหม่
const employeeCode = 'ADMIN001';
const newPassword = '123456';

(async () => {
  try {
    // สร้าง hash ของ password ใหม่
    const hash = await bcrypt.hash(newPassword, 10);

    // เชื่อมต่อ SQLite DB
    const db = new sqlite3.Database('./db/nskiatf_doccontrol.db');

    // Update password_hash
    db.run(
      `UPDATE users SET password_hash = ? WHERE employee_code = ?`,
      [hash, employeeCode],
      function (err) {
        if (err) {
          console.error('Error updating password:', err.message);
        } else {
          console.log(`Password reset for ${employeeCode} successful.`);
        }
      }
    );

    // ปิด DB
    db.close();
  } catch (err) {
    console.error(err);
  }
})();
