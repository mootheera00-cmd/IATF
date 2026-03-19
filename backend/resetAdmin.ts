// backend/resetAdmin.ts
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./db/nskiatf_doccontrol.db');

const newPassword = 'Admin@123';
const hash = bcrypt.hashSync(newPassword, 10);

db.run("UPDATE users SET password=?, password_hash=? WHERE employee_code='ADMIN001'", [newPassword, hash], function (err: any) {
  if (err) {
    console.error('Error resetting admin password:', err.message);
  } else {
    console.log('Admin password reset to Admin@123');
  }
  db.close();
});

export {};
