// backend/seeds/seed_roles.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    const roles = ['ADMIN', 'MANAGER', 'USER', 'QMR'];
    const sql = `INSERT OR IGNORE INTO roles (name) VALUES (?)`;
    roles.forEach(role => {
        db.run(sql, [role], (err) => {
            if (err) {
                console.error(`Error inserting role ${role}:`, err.message);
            } else {
                console.log(`Role ${role} inserted or already exists.`);
            }
        });
    });
});

db.close();
