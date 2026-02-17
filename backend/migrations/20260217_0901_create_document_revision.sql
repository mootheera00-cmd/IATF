-- backend/migrations/20260217_0901_create_document_revision.sql
CREATE TABLE IF NOT EXISTS DocumentRevision(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id BIGINT NOT NULL,
  rev_code VARCHAR(16) NOT NULL,
  status TEXT CHECK(status IN ('Working','Pending Approval','Released','Obsolete')) NOT NULL,
  original_uri TEXT, original_sha256 CHAR(64),
  pdf_uri TEXT, pdf_sha256 CHAR(64),
  change_summary TEXT,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMP NULL, released_by BIGINT NULL,
  supersedes_revision_id BIGINT NULL,
  FOREIGN KEY (document_id) REFERENCES Document(id),
  CONSTRAINT chk_release_pdf CHECK (status <> 'Released' OR (pdf_uri IS NOT NULL AND pdf_sha256 IS NOT NULL))
);
CREATE INDEX idx_rev_doc_status ON DocumentRevision(document_id,status);