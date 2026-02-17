// backend/seed_admin.js
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbFile = path.join(__dirname, 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbFile);

async function createAdmin() {
  const password = 'Admin@123'; // เปลี่ยนได้หลังจาก login
  const hash = await bcrypt.hash(password, 10);

  db.get(`SELECT id FROM roles WHERE name = 'ADMIN'`, (err, role) => {
    if (err) return console.error(err);

    db.run(
      `
      INSERT INTO users (employee_code, name, password_hash, role_id)
      VALUES (?, ?, ?, ?)
      `,
      ['ADMIN001', 'System Administrator', hash, role.id],
      function (err2) {
        if (err2) {
          console.error("Error creating admin:", err2.message);
        } else {
          console.log("Admin created successfully!");
          console.log("Login with:");
          console.log("employee_code: ADMIN001");
          console.log("password: Admin@123");
        }
        db.close();
      }
    );
  });
}

createAdmin();
