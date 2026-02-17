// add_filepath.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ชี้เป้าไปที่ไฟล์ Database ในโฟลเดอร์ db
const dbPath = path.resolve(__dirname, 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // คำสั่ง SQL เพิ่มคอลัมน์ file_path
    db.run("ALTER TABLE documents ADD COLUMN file_path TEXT", (err) => {
        if (err) {
            // ถ้ามีอยู่แล้ว มันจะแจ้งเตือน (ซึ่งไม่เป็นไร)
            console.log("ℹ️  แจ้งเตือน: " + err.message);
        } else {
            console.log("✅ เพิ่มคอลัมน์ 'file_path' สำเร็จแล้ว!");
        }
    });
});

db.close();