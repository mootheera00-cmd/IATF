-- backend/migrations/20260217_0906_signed_url_token.sql
CREATE TABLE IF NOT EXISTS SignedUrlToken(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cr_id BIGINT NOT NULL, document_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE, file_uri TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL, used_at TIMESTAMP NULL
);
CREATE INDEX idx_token_lookup ON SignedUrlToken(token);