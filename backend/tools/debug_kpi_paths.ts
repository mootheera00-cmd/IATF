// tools/debug_kpi_paths.ts
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db'));

db.all('PRAGMA table_info(DocumentRevision)', [], (schemaErr: any, cols: any[]) => {
  if (schemaErr) {
    console.error(schemaErr.message);
    process.exit(1);
  }

  const colNames = new Set((cols || []).map((c: any) => c.name));
  const optional = ['file_path_original', 'file_path_pdf', 'original_uri', 'pdf_uri'];
  const selectOptional = optional.filter((name) => colNames.has(name)).map((name) => `r.${name}`);

  const sql = `
SELECT
  d.id,
  d.doc_number,
  d.title,
  d.document_type,
  r.id AS rev_id
  ${selectOptional.length ? ', ' + selectOptional.join(', ') : ''}
FROM Document d
LEFT JOIN DocumentRevision r ON r.id = d.current_revision_id
WHERE UPPER(TRIM(COALESCE(d.doc_number, ''))) = 'KPI-01-001'
`;

  db.all(sql, [], (err: any, rows: any[]) => {
    if (err) {
      console.error(err.message);
      process.exit(1);
    }
    console.log(JSON.stringify(rows, null, 2));
    db.close();
  });
});

export {};
