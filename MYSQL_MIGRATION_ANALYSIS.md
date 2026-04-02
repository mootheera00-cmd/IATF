# MySQL Migration Analysis Report

> **Scope:** Migrating the IATF Document Control backend from SQLite (local `.db` file) to MySQL on a cloud/internal company server.  
> **Date:** 2026-04-02  
> **Verdict:** ✅ Migration is feasible, but there are **multiple breaking issues** that must be fixed before or during migration.

---

## Summary Table

| Category | Severity | Count of Issues |
|---|---|---|
| SQLite API / driver change | 🔴 Critical | 6 |
| SQL syntax incompatibilities | 🔴 Critical | 10 |
| Architecture / connection model | 🟠 High | 4 |
| Windows-specific code (will break on Linux server) | 🟠 High | 3 |
| File storage on local disk | 🟠 High | 2 |
| Minor / low-risk | 🟡 Low | 3 |

---

## 🔴 Critical — SQLite Driver & API

### 1. `sqlite3` npm package used everywhere
The entire backend uses the `sqlite3` npm package, which is a file-based driver. It cannot connect to MySQL at all.

**Affected files:**
- `backend/server.ts` — `const db = new sqlite3.Database(dbPath)`
- `backend/services/auditService.ts`
- `backend/services/dcrService.ts`
- `backend/services/notificationService.ts`
- `backend/services/signedUrlService.ts`
- All seed/migration tool scripts

> Note: `mysql2` is already listed in `package.json` but is **not yet used by the app**.

---

### 2. `this.lastID` (SQLite callback context)
After `db.run()` in SQLite, the inserted row ID is read from `this.lastID` inside the callback function. MySQL uses `result.insertId`.

**Files affected (40+ occurrences):**
- `routes/workflow.ts`
- `routes/msa.ts`
- `routes/incidents.ts`
- `routes/maintenance.ts`
- `routes/admin.ts`
- `routes/change_request.ts`
- `routes/migration.ts`
- `routes/calibration.ts`
- `routes/inhouseCalibration.ts`
- `routes/training.ts`
- `routes/calibrationHistory.ts`
- `routes/riskAssessment.ts`
- `server.ts`
- `services/auditService.ts`
- `services/dcrService.ts`
- `services/notificationService.ts`
- `tools/seed_kpi_strict.ts`

---

### 3. `db.run()`, `db.get()`, `db.all()`, `db.serialize()` — SQLite-only methods
The entire query interface is SQLite3-specific. MySQL2 uses `connection.query()` / `connection.execute()` with a completely different callback/promise API.

**All routes and services must be rewritten to use mysql2.**

---

### 4. `db.serialize()` has no MySQL equivalent
SQLite's `db.serialize()` ensures sequential execution of queries. In MySQL, sequential execution is handled by `async/await` chains or transactions.

**Affected files:**
- `backend/db/init_db.ts`
- `backend/routes/msa.ts`
- `backend/routes/migration.ts`
- `backend/routes/training.ts`
- Multiple seed/tool scripts

---

### 5. Multiple isolated SQLite connections
Four services open their **own** SQLite database connection independently, each resolving the `.db` file path:

```
services/auditService.ts    → new sqlite3.Database(dbPath)
services/dcrService.ts      → new sqlite3.Database(dbPath)
services/notificationService.ts → new sqlite3.Database(dbPath)
services/signedUrlService.ts    → new sqlite3.Database(dbPath)
```

This works for SQLite (file lock is shared) but on MySQL you need a **single connection pool** shared across the app.

---

### 6. File-path-based database connection in `server.ts`
```ts
const dbCandidates = [
  path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db'),
  ...
];
const dbPath = dbCandidates.find(candidate => fs.existsSync(candidate)) || dbCandidates[0];
const db = new sqlite3.Database(dbPath);
```
MySQL is not a file — it needs `host`, `port`, `user`, `password`, `database` connection parameters.

---

## 🔴 Critical — SQL Syntax Incompatibilities

### 7. `INTEGER PRIMARY KEY AUTOINCREMENT` → not valid MySQL syntax
MySQL syntax for auto-increment primary key:
```sql
-- SQLite (current)
id INTEGER PRIMARY KEY AUTOINCREMENT

-- MySQL (required)
id INT NOT NULL AUTO_INCREMENT PRIMARY KEY
```
**Affects:** every `CREATE TABLE` in `db/init_db.ts`, `routes/msa.ts`, `routes/incidents.ts`, `routes/maintenance.ts`, `routes/training.ts`, `routes/calibration.ts`, `routes/inhouseCalibration.ts`, `routes/riskAssessment.ts`, all SQL migration files.

---

### 8. `datetime('now')` — SQLite function, not valid in MySQL
```sql
-- SQLite (current)
created_at TEXT DEFAULT (datetime('now'))
updated_at = datetime('now')

-- MySQL (required)
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at = NOW()
```
**Affects:** `routes/msa.ts`, `routes/maintenance.ts`, `routes/users.ts`, `routes/calibration.ts`, `routes/inhouseCalibration.ts`, `routes/training.ts`, `routes/calibrationHistory.ts`

---

### 9. `strftime('%Y', 'now')` — SQLite function, not valid in MySQL
```sql
-- SQLite (current)
year INTEGER NOT NULL DEFAULT (strftime('%Y', 'now'))

-- MySQL (required)
year INT NOT NULL DEFAULT (YEAR(CURRENT_TIMESTAMP))
-- Note: MySQL 8.0.13+ required for expression defaults
```
**Affects:** `routes/training.ts` (`TrainingProgram` table)

---

### 10. `INSERT OR IGNORE` → MySQL: `INSERT IGNORE`
```sql
-- SQLite (current)
INSERT OR IGNORE INTO roles (name) VALUES (?)

-- MySQL (required)
INSERT IGNORE INTO roles (name) VALUES (?)
```
**Affects:** `routes/incidents.ts`, `routes/training.ts`, `init-db.ts`, seeds, tools

---

### 11. `INSERT OR REPLACE` → MySQL: `REPLACE INTO` or `INSERT ... ON DUPLICATE KEY UPDATE`
```sql
-- SQLite (current)
INSERT OR REPLACE INTO users (...)

-- MySQL (required)
REPLACE INTO users (...) 
-- or:
INSERT INTO users (...) ON DUPLICATE KEY UPDATE col=VALUES(col)
```
**Affects:** `init-db.ts`

---

### 12. `ON CONFLICT(col) DO UPDATE SET excluded.col` — PostgreSQL/SQLite upsert syntax
```sql
-- SQLite (current)
INSERT INTO ... ON CONFLICT(page_key) DO UPDATE SET pic_user_id = excluded.pic_user_id, updated_at = datetime('now')

-- MySQL (required)
INSERT INTO ... ON DUPLICATE KEY UPDATE pic_user_id = VALUES(pic_user_id), updated_at = NOW()
```
**Affects:** `routes/calibration.ts`, `routes/inhouseCalibration.ts`, `server.ts` (kpi_csv_data upsert)

---

### 13. `id INTEGER PRIMARY KEY CHECK (id = 1)` — custom CHECK constraint (kpi_csv_data)
```sql
-- SQLite (current)
id INTEGER PRIMARY KEY CHECK (id = 1)

-- MySQL (required)
id INT NOT NULL PRIMARY KEY CHECK (id = 1)
-- CHECK constraints are only enforced in MySQL 8.0.16+
```
**Affects:** `backend/db/init_db.ts`

---

### 14. `TEXT CHECK(val IN (...))` — inline CHECK constraint
```sql
-- SQLite (current)
study_type TEXT NOT NULL CHECK(study_type IN ('bias','grr','stability'))

-- MySQL (required, only MySQL 8.0.16+)
study_type ENUM('bias','grr','stability') NOT NULL
-- or use VARCHAR + application-level validation
```
**Affects:** `routes/msa.ts`, `routes/migration.ts` (ChangeRequest status)

---

### 15. `REAL` data type → MySQL: `DOUBLE`
```sql
-- SQLite (current)
reference_value REAL, alpha REAL DEFAULT 0.05

-- MySQL (required)
reference_value DOUBLE, alpha DOUBLE DEFAULT 0.05
```
**Affects:** `routes/msa.ts` (many columns), `routes/training.ts` (budget/duration)

---

### 16. `TEXT` columns used for dates → should use `DATETIME`
Many tables store timestamps as `TEXT`. While this still works in MySQL, it's best practice to use `DATETIME` or `TIMESTAMP` columns for proper indexing and date functions.

**Affects:** `routes/msa.ts`, `routes/maintenance.ts`, `routes/training.ts`, `routes/calibration.ts`, `routes/inhouseCalibration.ts`, `routes/calibrationHistory.ts`

---

## 🟠 High — Architecture Issues

### 17. No connection pool
SQLite uses a single file handle. MySQL requires a **connection pool** (e.g., `mysql2/promise` pool) to handle concurrent requests efficiently. Without this, the app will fail under multiple simultaneous users.

---

### 18. `req.db` middleware pattern passes single SQLite connection
`server.ts` attaches the db connection to each request:
```ts
app.use((req, res, next) => { req.db = db; next(); });
```
This works with SQLite (single shared connection) but with MySQL the pool must be properly managed.

---

### 19. Inline `CREATE TABLE IF NOT EXISTS` inside route handlers
Many routes create their own tables on first request:
- `routes/msa.ts` — MsaStudy, MsaBias, MsaGrr, MsaStability
- `routes/incidents.ts` — AbnormalSituation, AbnormalSituationMachineOption, etc.
- `routes/maintenance.ts` — MaintenanceEquipment, etc.
- `routes/training.ts` — TrainingRecord, TrainingProgram, etc.
- `routes/riskAssessment.ts` — RiskAssessmentCategory, etc.
- `routes/calibration.ts`, `routes/inhouseCalibration.ts`

This "lazy migration" pattern causes race conditions in concurrent environments and is not acceptable for production MySQL. All DDL should be in proper migration scripts run before startup.

---

### 20. No formal migration runner
The `backend/migrations/` folder has SQL files but there is no automated migration runner. For MySQL production, a migration tool (e.g., Flyway, Liquibase, or a Node.js runner with `migrate-init.ts`) must be used to track and apply schema changes reliably.

---

## 🟠 High — Windows-Specific Code (Will Break on Linux Cloud Server)

### 21. `cmd.exe` spawn in `server.ts` — Windows only
```ts
const child = spawn('cmd.exe', ['/c', 'start', '', normalized], { detached: true, stdio: 'ignore' });
```
This endpoint opens Windows Explorer. On Linux/cloud server this will fail completely.

**Note:** The `/api/report/open-folder` route in `routes/report.ts` handles cross-platform correctly with `explorer.exe` / `open` / `xdg-open`, but `/api/open-folder` in `server.ts` is Windows-only.

---

### 22. Windows-only folder path validation in `server.ts`
```ts
if (!/^([A-Za-z]:\\|\\\\)/.test(normalized)) {
  return res.status(400).json({ error: 'Invalid folder path format. Use a Windows absolute path...' });
}
```
This rejects all Linux/Unix paths and is not suitable for a cloud deployment.

---

### 23. `REPORT_BASE_PATH` defaults to a Windows drive letter path
```ts
// config/config.ts
reportBasePath: process.env.REPORT_BASE_PATH || 'G:/02_Folder 5S/DD === APTC ===/06_APTX reports',
```
On Linux, this path doesn't exist. Must be configured via environment variable pointing to a mounted/cloud storage path.

---

## 🟠 High — File Storage

### 24. Document files stored on local disk
Uploaded documents are stored in:
- `backend/secure_storage/doc-original/`
- `backend/uploads/doc-pdf/`
- `backend/uploads/staging/`

On a cloud/multi-instance server, local file storage means files uploaded on one instance won't be visible to other instances. Cloud storage (AWS S3, Azure Blob, GCS, or an NFS-mounted shared volume) is required.

---

### 25. KPI CSV stored as JSON blob in TEXT column
```ts
csv_json TEXT NOT NULL DEFAULT '[]'
```
MySQL's `TEXT` type has a **65,535 byte (64 KB) limit**. Large KPI CSV files will silently truncate or fail. Must be changed to `MEDIUMTEXT` (16 MB) or `LONGTEXT` (4 GB).

---

## 🟡 Low Risk

### 26. `BOOLEAN` stored as `INTEGER` (0/1) — low risk
SQLite doesn't have BOOLEAN; MySQL does. Current code stores `is_active INTEGER DEFAULT 1`. In MySQL you can keep this as `TINYINT(1)` or migrate to `BOOLEAN`/`TINYINT`.

---

### 27. `BIGINT` vs `INTEGER` — type inconsistency in migration SQL files
Migration SQL files (`20260217_0900_create_document.sql`) use `BIGINT` for IDs but `db/init_db.ts` uses `INTEGER`. These must be consistent for MySQL foreign keys.

---

### 28. No database-level indexes on frequently queried columns
The current schema has few indexes. MySQL production deployments need indexes on foreign key columns and frequently filtered columns (e.g., `status`, `document_id`, `user_id`, `created_at`). The only index found is `idx_cr_doc_status` in the migration SQL.

---

## Conclusion

You **will** encounter serious problems if you migrate to MySQL without addressing the above. The most critical path is:

1. Replace the `sqlite3` driver with `mysql2` (connection pool)
2. Fix all SQL syntax incompatibilities (AUTOINCREMENT, datetime, INSERT OR IGNORE, ON CONFLICT, etc.)
3. Rewrite the db query layer (`.run()`, `.get()`, `.all()`, `this.lastID`)
4. Move inline CREATE TABLE DDL into proper migration scripts
5. Set `REPORT_BASE_PATH` to a Linux-compatible path
6. Replace local file storage with shared/cloud storage for uploaded documents
7. Decide on the `cmd.exe` open-folder feature (disable or adapt for cloud)

See **MYSQL_MIGRATION_GUIDE.md** for step-by-step fix instructions and how to keep SQLite for local development.
