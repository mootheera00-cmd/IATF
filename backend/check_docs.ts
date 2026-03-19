// backend/check_docs.ts
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/nskiatf_doccontrol.db');

db.all('SELECT * FROM documents', [], (err: any, rows: any[]) => {
  if (err) throw err;
  console.log('--- รายชื่อเอกสารใน Database ---');
  console.table(rows); // จะแสดงเป็นตารางสวยงามใน Terminal
  db.close();
});

export {};
