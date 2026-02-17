const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/nskiatf_doccontrol.db');

db.serialize(() => {

    // ตารางเอกสารหลัก
    db.run(`
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_no TEXT NOT NULL,
            title TEXT NOT NULL,
            level TEXT NOT NULL, -- Manual / Procedure / WI / Form / External
            owner_id INTEGER NOT NULL, -- DOCUMENT_OWNER
            process_owner_id INTEGER,
            revision INTEGER DEFAULT 0,
            current_status TEXT DEFAULT 'DRAFT', -- DRAFT / REVIEW / APPROVE / RELEASED / EFFECTIVE / OBSOLETE
            effective_date TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(owner_id) REFERENCES users(id),
            FOREIGN KEY(process_owner_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) console.error("Error creating documents:", err.message);
        else console.log("Table 'documents' created or already exists.");
    });

    // ตารางประวัติสถานะเอกสาร (Audit Trail)
    db.run(`
        CREATE TABLE IF NOT EXISTS document_status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            old_status TEXT,
            new_status TEXT NOT NULL,
            changed_by INTEGER NOT NULL,
            changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
            remark TEXT,
            FOREIGN KEY(document_id) REFERENCES documents(id),
            FOREIGN KEY(changed_by) REFERENCES users(id)
        )
    `, (err) => {
        if (err) console.error("Error creating document_status_history:", err.message);
        else console.log("Table 'document_status_history' created or already exists.");
    });

});

db.close();
