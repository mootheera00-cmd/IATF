-- backend/migrations/20260217_0900_create_document.sql
CREATE TABLE IF NOT EXISTS Document(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_number VARCHAR(64) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  owning_department VARCHAR(100),
  current_revision_id BIGINT NULL,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);