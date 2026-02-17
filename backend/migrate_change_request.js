const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/nskiatf_doccontrol.db');

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS change_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            requester_id INTEGER NOT NULL, -- CHANGE_REQUESTER
            reason TEXT NOT NULL,
            impact TEXT,
            status TEXT DEFAULT 'CR_SUBMITTED', -- CR_SUBMITTED / CR_REVIEWED / CR_APPROVED / CR_RELEASED
            reviewer_id INTEGER,
            approver_id INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(document_id) REFERENCES documents(id),
            FOREIGN KEY(requester_id) REFERENCES users(id),
            FOREIGN KEY(reviewer_id) REFERENCES users(id),
            FOREIGN KEY(approver_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) console.error("Error creating change_requests:", err.message);
        else console.log("Table 'change_requests' created or already exists.");
    });

});

db.close();
