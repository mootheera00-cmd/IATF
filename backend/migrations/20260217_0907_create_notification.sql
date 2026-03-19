-- backend/migrations/20260217_0907_create_notification.sql
CREATE TABLE IF NOT EXISTS Notification(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id BIGINT NOT NULL,
  type TEXT CHECK(type IN ('DCR_SUBMITTED', 'DCR_PRE_APPROVED', 'DCR_REJECTED', 'DCR_APPROVED', 'DCR_RETURNED_FOR_REVISION', 'REVISION_UPLOADED')) NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_notification_user_read ON Notification(user_id, is_read);
CREATE INDEX idx_notification_created ON Notification(created_at DESC);
