const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/nskiatf_doccontrol.db');

db.all("SELECT employee_code, name, role FROM users", [], (err, rows) => {
    if (err) return console.error(err.message);
    console.log("--- รายชื่อพนักงานในระบบ ---");
    console.table(rows);
    db.close();
});