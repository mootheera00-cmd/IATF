const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('--- กำลังเริ่มสร้างตารางข้อมูล (Migration) ---');

    // 1. ตาราง Users (เหมือนเดิม)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_code TEXT UNIQUE,
        password TEXT,
        name TEXT,
        role TEXT,
        department TEXT
    )`);

    // 2. ตาราง Documents (แก้ใหม่: เอา UNIQUE ออกจาก doc_no เพื่อเก็บประวัติได้)
    db.run(`CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_no TEXT,              -- ⚠️ เอา UNIQUE ออกแล้ว
        title TEXT,
        level TEXT,
        revision INTEGER DEFAULT 0,
        current_status TEXT DEFAULT 'DRAFT', -- DRAFT, APPROVED, OBSOLETE
        
        file_path_pdf TEXT,
        file_path_source TEXT,
        
        owner_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 3. เพิ่ม Admin
    db.run(`INSERT OR IGNORE INTO users (employee_code, password, name, role, department) 
            VALUES ('ADMIN001', 'admin123', 'System Admin', 'Admin', 'IT')`);

    console.log('✅ สร้างตารางข้อมูลสำเร็จ (รองรับ Revision แล้ว)');
});

db.close();