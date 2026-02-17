-- backend/migrations/20260217_0902_create_change_request.sql
CREATE TABLE IF NOT EXISTS ChangeRequest(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id BIGINT NOT NULL,
  requester_id BIGINT NOT NULL,
  manager_id BIGINT NULL,
  status TEXT CHECK(status IN ('Draft','Submitted','Rejected','Pre-Approved','Pending Approval','Returned for Revision','Approved')) NOT NULL,
  reason TEXT NOT NULL,
  submitted_at TIMESTAMP NULL, preapproved_at TIMESTAMP NULL,
  final_approved_at TIMESTAMP NULL, rejected_at TIMESTAMP NULL, returned_at TIMESTAMP NULL,
  latest_working_revision_id BIGINT NULL,
  FOREIGN KEY (document_id) REFERENCES Document(id)
);
CREATE INDEX idx_cr_doc_status ON ChangeRequest(document_id,status);