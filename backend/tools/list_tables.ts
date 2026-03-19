const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbPath, (err: any) => {
  if (err) {
    console.error('❌ Cannot open database:', err.message);
    process.exit(1);
  }
});

db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err: any, rows: any[]) => {
  if (err) {
    console.error('❌ Error listing tables:', err.message);
    process.exit(1);
  }
  console.log(rows);
  db.close();
});

export {};
