const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/nskiatf_doccontrol.db');

db.serialize(() => {
    // 1. ลบตารางเก่า (ถ้ามี)
    db.run("DROP TABLE IF EXISTS documents");

    // 2. สร้างตารางใหม่ให้ครบทุกคอลัมน์ที่ App เราต้องใช้
    const sql = `
    CREATE TABLE documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_no TEXT NOT NULL,
        title TEXT NOT NULL,
        level TEXT,
        file_path_pdf TEXT,
        file_path_source TEXT,
        revision INTEGER DEFAULT 0,
        status TEXT DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`;

    db.run(sql, (err) => {
        if (err) console.error("❌ Error:", err.message);
        else console.log("✅ สร้างตาราง Documents ใหม่สำเร็จแล้ว!");
    });
});

db.close();