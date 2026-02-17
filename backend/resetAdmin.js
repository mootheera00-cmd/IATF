const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./db/nskiatf_doccontrol.db');

const newPassword = "admin123";
const hash = bcrypt.hashSync(newPassword, 10);

db.run(
    "UPDATE users SET password_hash=? WHERE employee_code='ADMIN001'",
    [hash],
    function (err) {
        if (err) {
            console.error("Error resetting admin password:", err.message);
        } else {
            console.log("Admin password reset to admin123");
        }
        db.close();
    }
);
