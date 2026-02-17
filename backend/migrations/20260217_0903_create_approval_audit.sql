-- backend/migrations/20260217_0903_create_approval_audit.sql
CREATE TABLE IF NOT EXISTS ApprovalRecord(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cr_id BIGINT NOT NULL,
  step TEXT CHECK(step IN ('GateA','GateB')) NOT NULL,
  decision TEXT CHECK(decision IN ('Approve','Reject','Return')) NOT NULL,
  decided_by BIGINT NOT NULL, decided_by_role VARCHAR(32) NOT NULL,
  decided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  comment TEXT, file_hashes TEXT,
  FOREIGN KEY (cr_id) REFERENCES ChangeRequest(id)
);

CREATE TABLE IF NOT EXISTS AuditEvent(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type VARCHAR(32) NOT NULL,
  entity_id BIGINT NOT NULL,
  actor_id BIGINT NOT NULL,
  action VARCHAR(64) NOT NULL,
  metadata TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_entity ON AuditEvent(entity_type,entity_id);