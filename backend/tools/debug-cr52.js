const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db'));
const crId = 52;

const log = (label, data) => {
  console.log(`\n${label}`);
  console.log(JSON.stringify(data, null, 2));
};

db.get(
  'SELECT id, status, latest_working_revision_id, document_id, requester_id FROM ChangeRequest WHERE id = ?',
  [crId],
  (err, row) => {
    if (err) {
      console.error('CR error', err);
      db.close();
      return;
    }
    log('CR', row);
    db.all(
      'SELECT id, decision, step, decided_by, decided_by_role, decided_at FROM ApprovalRecord WHERE cr_id = ? OR change_request_id = ? ORDER BY id DESC',
      [crId, crId],
      (err2, rows) => {
        if (err2) {
          console.error('Approvals error', err2);
          db.close();
          return;
        }
        log('Approvals', rows);
        db.all(
          "SELECT action, actor_id, created_at, metadata FROM AuditEvent WHERE entity_type = 'ChangeRequest' AND entity_id = ? ORDER BY created_at DESC",
          [crId],
          (err3, rows2) => {
            if (err3) {
              console.error('Audit error', err3);
            } else {
              log('Audit', rows2);
            }
            db.close();
          }
        );
      }
    );
  }
);
