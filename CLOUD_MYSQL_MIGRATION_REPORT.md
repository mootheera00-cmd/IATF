# Cloud / Internal-Server + MySQL Migration Report

**Project:** NSK IATF 16949 Document Change Request (DCR) Workflow System  
**Current Stack:** Node.js + TypeScript (Express) · React + Vite (TailwindCSS) · **SQLite**  
**Target Stack:** Same backend/frontend · Cloud or internal company server (Linux) · **MySQL 8.0+**  
**Report Date:** 2026-04-02  

---

## Executive Summary

Migration from the current Windows-based, SQLite-backed setup to a cloud/internal server running MySQL is **feasible**, but requires changes across **multiple layers** of the codebase. The most critical areas are:

1. Pervasive SQLite-specific SQL syntax (38+ usages of `lastID`, 20+ `datetime('now')` calls, `AUTOINCREMENT`, `INSERT OR IGNORE`, `ON CONFLICT`, `PRAGMA`, `db.serialize()`, etc.)
2. Windows-only runtime features (`cmd.exe`, `explorer.exe`, hardcoded `G:/` paths)
3. File storage tightly coupled to the local file system
4. Missing environment variables and security configuration needed for production

The table below gives a quick risk overview; detailed findings follow.

---

## Risk Matrix

| Area | Severity | Effort | Notes |
|------|----------|--------|-------|
| SQLite → MySQL SQL syntax | 🔴 Critical | High | Affects every route file |
| Windows-only code (`cmd.exe`, `explorer.exe`, `G:/`) | 🔴 Critical | Medium | Server will crash on Linux |
| `sqlite3` driver → `mysql2` driver | 🔴 Critical | High | Entire `req.db` API changes |
| `this.lastID` → `result.insertId` | 🔴 Critical | Medium | 38 places across codebase |
| Local file storage | 🟠 High | Medium | Files lost on container restart |
| `db.serialize()` (SQLite-only) | 🟠 High | Medium | No equivalent in mysql2 |
| `PRAGMA foreign_keys` | 🟡 Medium | Low | MySQL handles FKs natively |
| CORS hardcoded IPs | 🟡 Medium | Low | Update `.env` |
| `SECRET_KEY` not in `.env.example` | 🟡 Medium | Low | Must be set for JWT |
| Rate-limiting behind reverse proxy | 🟡 Medium | Low | Trust `X-Forwarded-For` |
| `GENERATED ALWAYS … VIRTUAL` column | 🟡 Medium | Low | Syntax differs slightly |
| CHECK constraints | 🟢 Low | None | MySQL 8.0+ supports them |
| Backup & recovery procedures | 🟢 Low | Low | New operational process needed |

---

## 1. Database Layer — SQLite → MySQL

### 1.1 Driver Swap

The project already has `mysql2` in `package.json` but **SQLite is still used everywhere**. The entire `req.db` object is a `sqlite3.Database` instance, and `mysql2` uses a completely different async API.

**Required changes:**
- Replace `sqlite3` with `mysql2` (or a connection pool) in `server.ts`
- Rewrite or wrap all `db.run()`, `db.get()`, `db.all()` callback-style calls to use `mysql2`'s `pool.query()` / promise API
- Remove `const db = new sqlite3.Database(dbPath)` and the entire file-path resolution block

**File:** `backend/server.ts` (lines 72–82, 89–91)

---

### 1.2 `this.lastID` → `result[0].insertId`

`this.lastID` is a SQLite-specific property injected by the `sqlite3` driver into the callback context.  
`mysql2` returns `[ResultSetHeader, ...]`; the new inserted ID is at `result[0].insertId`.

**Count of affected locations: 38 across these files:**

| File | Occurrences |
|------|-------------|
| `routes/riskAssessment.ts` | 8 |
| `routes/incidents.ts` | 3 |
| `routes/training.ts` | 3 |
| `routes/migration.ts` | 2 |
| `routes/admin.ts` | 4 |
| `routes/msa.ts` | 1 |
| `routes/users.ts` | 1 |
| `routes/workflow.ts` | 1 |
| `services/dcrService.ts` | 3 |
| `services/notificationService.ts` | 1 |
| `services/auditService.ts` | 1 |
| `tools/seed_kpi_strict.ts` | 2 |

---

### 1.3 SQL Syntax Incompatibilities

Every occurrence of the patterns below must be rewritten before running on MySQL.

#### a) `AUTOINCREMENT` → `AUTO_INCREMENT`

SQLite uses `AUTOINCREMENT`; MySQL uses `AUTO_INCREMENT` (two words, no space in practice but correct keyword form).

```sql
-- SQLite (current)
id INTEGER PRIMARY KEY AUTOINCREMENT

-- MySQL (required)
id INT NOT NULL AUTO_INCREMENT PRIMARY KEY
```

**Affects:** All `CREATE TABLE` statements in `db/init_db.ts`, all route-level `ensureTables()` functions, and all `.sql` migration files.

---

#### b) `datetime('now')` → `NOW()` / `CURRENT_TIMESTAMP`

SQLite's `datetime('now')` is not valid MySQL.

```sql
-- SQLite (current)
created_at TEXT DEFAULT (datetime('now'))
updated_at = datetime('now')

-- MySQL (required)
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at = NOW()
```

**Affected files:** `routes/msa.ts`, `routes/calibration.ts`, `routes/inhouseCalibration.ts`, `routes/training.ts`, `routes/maintenance.ts`, `routes/users.ts`, `migrations/migrate_init.ts`, `migrations/patch_users_add_missing_columns.ts`

---

#### c) `INSERT OR IGNORE` → `INSERT IGNORE`

```sql
-- SQLite (current)
INSERT OR IGNORE INTO roles (name) VALUES (?)

-- MySQL (required)
INSERT IGNORE INTO roles (name) VALUES (?)
```

**Affected files:** `routes/incidents.ts` (3 occurrences), `routes/training.ts` (1 occurrence), `db/init_db.ts`

---

#### d) `ON CONFLICT(…) DO UPDATE SET` → `ON DUPLICATE KEY UPDATE`

```sql
-- SQLite (current)
INSERT INTO kpi_csv_data (id, file_name, …)
VALUES (1, ?, …)
ON CONFLICT(id) DO UPDATE SET file_name = excluded.file_name, …

-- MySQL (required)
INSERT INTO kpi_csv_data (id, file_name, …)
VALUES (1, ?, …)
ON DUPLICATE KEY UPDATE file_name = VALUES(file_name), …
```

**Affected files:** `server.ts` (kpi-csv endpoint), `routes/calibration.ts`, `routes/inhouseCalibration.ts`

---

#### e) `PRAGMA foreign_keys = ON` → Remove

MySQL enforces foreign keys by default on InnoDB tables. Remove all `PRAGMA` statements.

**Affected files:** `migrations/migrate_init.ts`, `migrations/patch_users_add_missing_columns.ts`

---

#### f) `GENERATED ALWAYS AS (…) VIRTUAL` — Syntax adjustment

SQLite and MySQL both support virtual generated columns, but MySQL requires the column type before `GENERATED ALWAYS`:

```sql
-- SQLite (current)
risk_score INTEGER GENERATED ALWAYS AS (severity * occurrence) VIRTUAL

-- MySQL (required)
risk_score INT GENERATED ALWAYS AS (severity * occurrence) VIRTUAL
```

**Affected file:** `routes/riskAssessment.ts` (line 49)

---

#### g) `TEXT` column type with length — MySQL requires VARCHAR for indexed/unique columns

SQLite's `TEXT` has no length limit and can be used on `UNIQUE` columns. MySQL requires a prefix length for indexing `TEXT` columns. Best practice: use `VARCHAR(255)` for short strings and `TEXT` for long content.

**Affected files:** All migration SQL files and route-level `CREATE TABLE` statements.

---

#### h) `CHECK (id = 1)` as primary key constraint

```sql
-- SQLite (current)
id INTEGER PRIMARY KEY CHECK (id = 1)

-- MySQL (required, remove CHECK from PRIMARY KEY definition)
id INT NOT NULL DEFAULT 1,
PRIMARY KEY (id),
CHECK (id = 1)
```

**Affected file:** `db/init_db.ts` (`kpi_csv_data` table)

---

### 1.4 `db.serialize()` — No Equivalent in mysql2

`db.serialize()` is SQLite-specific; it forces sequential execution of all queued operations. MySQL connections are inherently sequential per connection. All `db.serialize()` wrappers must be removed and logic rewritten to use `async/await` with `mysql2`'s promise API.

**Affected files:** `routes/msa.ts`, `routes/migration.ts`, `routes/training.ts`, `migrate.ts`, `recreate_table.ts`, `add_filepath.ts`, `migrate_change_request.ts`, `migrate_documents.ts`, `seeds/seed_roles.ts`, `check_admin.ts`

---

### 1.5 Transaction Handling

The current code uses `db.run('BEGIN TRANSACTION')` / `db.run('COMMIT')` / `db.run('ROLLBACK')` inside `db.serialize()`. With `mysql2`, transactions are done using `connection.beginTransaction()`, `connection.commit()`, `connection.rollback()` on the same connection object.

**Affected files:** `migrate.ts`, `routes/migration.ts`

---

### 1.6 Schema-Level Changes Summary

The following table consolidates all SQL changes required per feature area:

| Table / Feature | SQLite | MySQL Equivalent |
|-----------------|--------|-----------------|
| Auto-increment PK | `INTEGER PRIMARY KEY AUTOINCREMENT` | `INT NOT NULL AUTO_INCREMENT PRIMARY KEY` |
| Default timestamp | `DEFAULT (datetime('now'))` | `DEFAULT CURRENT_TIMESTAMP` |
| Update timestamp | `= datetime('now')` | `= NOW()` |
| Upsert by PK | `ON CONFLICT(id) DO UPDATE SET …` | `ON DUPLICATE KEY UPDATE …` |
| Ignore duplicate | `INSERT OR IGNORE INTO …` | `INSERT IGNORE INTO …` |
| FK enforcement | `PRAGMA foreign_keys = ON` | Remove (InnoDB default) |
| String columns | `TEXT` for all strings | `VARCHAR(n)` for short, `TEXT` for long |
| Generated column | `INTEGER GENERATED ALWAYS AS … VIRTUAL` | `INT GENERATED ALWAYS AS … VIRTUAL` |
| Boolean-like | `INTEGER DEFAULT 0/1` | `TINYINT(1) DEFAULT 0` or `BOOLEAN` |
| File-path columns | `TEXT` | `VARCHAR(1024)` |

---

## 2. Backend Application Layer

### 2.1 Windows-Specific Code — Will **Crash** on Linux

The server contains code that hard-wires Windows APIs. This will cause runtime errors on any Linux cloud host.

#### a) `cmd.exe /c start` — Opens Windows Explorer (`server.ts`)

```typescript
// CURRENT — Windows only
const child = spawn('cmd.exe', ['/c', 'start', '', normalized], { detached: true, stdio: 'ignore' });
```

The `/api/open-folder` endpoint uses `cmd.exe` to open a Windows Explorer window on the **server**. In a cloud/Linux environment:
- `cmd.exe` does not exist → the `spawn()` call will throw.
- Even if it were replaced with `xdg-open`, the server has no GUI session to open a window in.
- **This feature must either be removed or redesigned** (e.g., emit a message to the client to handle the open-folder action locally via a browser extension or Electron wrapper).

#### b) `explorer.exe` — Opens Report Folder (`routes/report.ts`)

```typescript
const child = spawn('explorer.exe', [folderPath], { detached: true, stdio: 'ignore' });
```

Same problem. The `report.ts` route does check `process.platform` and falls back to `xdg-open` on Linux, but `xdg-open` requires a desktop session — a background cloud server will not have one. This feature should be disabled or redirected on cloud.

#### c) Hardcoded Windows Drive Path (`config/config.ts`)

```typescript
reportBasePath: process.env.REPORT_BASE_PATH || 'G:/02_Folder 5S/DD === APTC ===/06_APTX reports',
```

`G:/` is a Windows drive letter. On Linux this path is invalid. **The `REPORT_BASE_PATH` environment variable must be set** and point to a valid UNC share or mounted NFS/SMB path on the server.

#### d) Windows Path Validation (`server.ts`)

```typescript
if (!/^([A-Za-z]:\\|\\\\)/.test(normalized)) {
  return res.status(400).json({ error: 'Invalid folder path format. Use a Windows absolute path, e.g. G:\\FolderName' });
}
```

This validator only accepts Windows paths (`C:\…` or `\\server\share`). It must be updated to also accept Linux absolute paths (`/mnt/…`).

---

### 2.2 File Storage — Local Filesystem

All uploaded files are stored on the local filesystem:

```
backend/uploads/doc-pdf/
backend/uploads/staging/
backend/secure_storage/doc-original/
backend/uploads/maintenance-docs/
backend/uploads/Abnormal Situations Record/
```

**Problems in a cloud environment:**
- Container restarts or redeploys will **delete all uploaded files**.
- Multiple server instances (horizontal scaling) cannot share local storage.
- Disaster recovery requires manual filesystem backup.

**Recommended solution:**
- Mount a persistent volume (e.g., NFS, Ceph, or cloud object storage like S3-compatible MinIO) at the upload paths.
- Or refactor to use a storage service SDK (AWS S3, Azure Blob, MinIO).

---

### 2.3 CORS Configuration — Hardcoded IP

```typescript
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173,http://133.124.150.22:5173').split(',')
);
```

The IP `133.124.150.22` is hardcoded. In the cloud, the server IP and frontend URL will change. **Always set `CORS_ORIGIN` via environment variable** and remove the hardcoded fallback IP.

---

### 2.4 Missing Environment Variables

The current `.env.example` is incomplete. The following variables must be added:

| Variable | Purpose | Current Status |
|----------|---------|----------------|
| `SECRET_KEY` / `JWT_SECRET` | JWT signing | ❌ Missing from `.env.example` (causes startup crash) |
| `DB_HOST` | MySQL host | ❌ Not defined |
| `DB_PORT` | MySQL port | ❌ Not defined |
| `DB_USER` | MySQL user | ❌ Not defined |
| `DB_PASSWORD` | MySQL password | ❌ Not defined |
| `DB_NAME` | MySQL database name | ❌ Not defined |
| `CORS_ORIGIN` | Allowed frontend origins | ⚠️ Defined but has insecure fallback |
| `REPORT_BASE_PATH` | Network path for APTX reports | ⚠️ Defaults to a Windows path |
| `NODE_ENV` | `production` / `development` | ⚠️ Not in `.env.example` |
| `PORT` | Server port | ⚠️ Not in `.env.example` |

> **Note:** `config/config.ts` throws if `JWT_SECRET` is not set, but the variable is called `SECRET_KEY` in `.env.example`. This inconsistency will cause the server to **crash on startup** unless fixed.

---

### 2.5 Rate Limiting Behind a Reverse Proxy

The login endpoint uses `express-rate-limit` keyed by IP. When running behind Nginx, Caddy, or a cloud load balancer, the apparent IP will be `127.0.0.1` for all clients, breaking the per-IP limit.

**Fix:** Add `app.set('trust proxy', 1)` to `server.ts` when deploying behind a reverse proxy.

---

### 2.6 `bcryptjs` and Plaintext Password Legacy Code

`routes/auth.ts` still contains legacy code that compares and migrates plaintext passwords stored in `password_hash`. In production (cloud), this code is a **security risk** and should be removed. All users must have bcrypt hashes before migration.

---

## 3. Frontend Layer

### 3.1 API Base URL

The frontend likely uses `http://localhost:4550` or `http://133.124.150.22:4550` as the API base. After deployment, the backend will be at a different URL (domain or new IP). Update `vite.config.mjs` proxy settings and any hardcoded API base URLs to use the production server URL.

### 3.2 Static File Serving

The frontend (`dist/` after `npm run build`) must be served by a web server (Nginx recommended) or by the Express backend via `express.static`. Add a `dist` build to the deployment pipeline.

---

## 4. Operational / Infrastructure

### 4.1 Data Migration

Before switching to MySQL, all existing SQLite data must be migrated:

1. **Export SQLite data** using `sqlite3 nskiatf_doccontrol.db .dump` or a migration tool (e.g., `pgloader`, `sqlite-to-mysql`, or a custom Node.js script).
2. **Transform** any SQLite-specific data types (e.g., `1`/`0` booleans → `TRUE`/`FALSE`, date strings → `DATETIME`).
3. **Import** into MySQL and verify row counts and foreign key integrity.
4. **Test** all application features against the MySQL database before going live.

### 4.2 Backup Strategy

| Aspect | SQLite (current) | MySQL (required) |
|--------|-----------------|-----------------|
| Backup | Copy `.db` file | `mysqldump` or binary log + snapshot |
| Point-in-time recovery | Manual copy | Enable binary logging (`binlog`) |
| Automated backups | None configured | Schedule via `cron` + `mysqldump`, or use managed backup service |

### 4.3 MySQL Configuration Recommendations

```ini
[mysqld]
character-set-server = utf8mb4
collation-server     = utf8mb4_unicode_ci
sql_mode             = STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION
innodb_file_per_table = ON
```

- Use **`utf8mb4`** charset to support Thai characters (the codebase uses Thai in error messages and labels).
- Enable `STRICT_TRANS_TABLES` to catch data truncation early.

### 4.4 Security Hardening for Production

| Item | Recommendation |
|------|---------------|
| MySQL user privileges | Create a dedicated user with only `SELECT, INSERT, UPDATE, DELETE` on the app database — no `CREATE`, `DROP`, `SUPER` |
| MySQL network | Bind MySQL to `127.0.0.1` or a private VLAN; never expose port 3306 publicly |
| TLS | Enable `ssl-mode=REQUIRED` for all MySQL connections |
| JWT secret | Use a 256-bit random secret; store in a secrets manager, not in a `.env` file on disk |
| File uploads | Validate MIME type server-side (not just file extension); already partially done, but double-check all upload routes |
| Helmet CSP | Add `Content-Security-Policy` header via `helmet()` configuration |
| `bcryptjs` rounds | Currently using 10 rounds — acceptable, but consider 12 for production |

---

## 5. Effort Estimation

| Phase | Tasks | Estimated Effort |
|-------|-------|-----------------|
| 1. MySQL driver integration | Swap `sqlite3` → `mysql2` pool in `server.ts`; rewrite `req.db` middleware | 1–2 days |
| 2. SQL syntax migration | Fix all SQL in 16 route files + 8 migration files | 3–5 days |
| 3. API compatibility fixes | `this.lastID` → `result[0].insertId` (38 places); `db.serialize()` removal | 2–3 days |
| 4. Windows-code removal | Disable/redesign `open-folder`, fix path validation, fix config defaults | 1 day |
| 5. File storage | Mount persistent volume or integrate object storage | 1–2 days |
| 6. Environment configuration | Complete `.env.example`; verify all env vars; fix `SECRET_KEY` vs `JWT_SECRET` | 0.5 day |
| 7. Data migration | Export SQLite → transform → import MySQL | 0.5–1 day |
| 8. Testing | Full regression test of all workflows | 2–3 days |
| **Total** | | **≈ 11–17 working days** |

---

## 6. Migration Checklist

Use this checklist when executing the migration:

### Database
- [ ] Add MySQL connection pool in `server.ts` (replace `sqlite3` block)
- [ ] Update `req.db` middleware to pass MySQL pool/connection
- [ ] Convert all `db.run()` / `db.get()` / `db.all()` to `mysql2` promise API
- [ ] Replace all `this.lastID` with `result[0].insertId` (38 occurrences)
- [ ] Replace all `AUTOINCREMENT` with `AUTO_INCREMENT`
- [ ] Replace all `datetime('now')` with `NOW()` or `CURRENT_TIMESTAMP`
- [ ] Replace all `INSERT OR IGNORE` with `INSERT IGNORE`
- [ ] Replace all `ON CONFLICT(…) DO UPDATE SET` with `ON DUPLICATE KEY UPDATE`
- [ ] Remove all `PRAGMA` statements
- [ ] Fix `GENERATED ALWAYS AS … VIRTUAL` syntax in `riskAssessment.ts`
- [ ] Change `TEXT` to `VARCHAR(n)` for indexed/unique string columns
- [ ] Remove all `db.serialize()` wrappers
- [ ] Rewrite `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK` using mysql2 connection transactions
- [ ] Create and run MySQL schema migration scripts

### Environment
- [ ] Add `JWT_SECRET` to `.env.example` (fix `SECRET_KEY` vs `JWT_SECRET` mismatch)
- [ ] Add `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` to `.env.example`
- [ ] Add `CORS_ORIGIN`, `NODE_ENV`, `PORT` to `.env.example`
- [ ] Set `REPORT_BASE_PATH` to a valid Linux/UNC path

### Windows Code
- [ ] Disable or redesign `/api/open-folder` (remove `cmd.exe` dependency)
- [ ] Remove or gate `explorer.exe` call in `routes/report.ts`
- [ ] Remove Windows path validator (`/^([A-Za-z]:\\|\\\\)/` regex) from `server.ts`
- [ ] Remove `G:/` default in `config/config.ts`

### Security
- [ ] Remove legacy plaintext password comparison code from `routes/auth.ts`
- [ ] Add `app.set('trust proxy', 1)` for reverse proxy deployments
- [ ] Configure MySQL user with least-privilege permissions
- [ ] Enable TLS for MySQL connection

### File Storage
- [ ] Mount persistent storage volume at upload directories, OR
- [ ] Integrate object storage (MinIO / S3-compatible)

### Frontend
- [ ] Update API base URL for production
- [ ] Configure Nginx to serve `frontend/dist/` and proxy `/api/` to the backend

### Data Migration
- [ ] Export all data from SQLite
- [ ] Transform data types (dates, booleans)
- [ ] Import and verify in MySQL
- [ ] Run full regression test suite

---

## 7. Quick Reference — Most Common SQL Fix Patterns

```typescript
// ─── BEFORE (SQLite) ──────────────────────────────────────────────────────────
db.run(
  `INSERT INTO foo (name, created_at) VALUES (?, datetime('now'))`,
  [name],
  function (this: any, err: any) {
    if (err) return cb(err);
    cb(null, this.lastID);
  }
);

// ─── AFTER (MySQL via mysql2 promise pool) ─────────────────────────────────────
const [result] = await pool.execute(
  `INSERT INTO foo (name, created_at) VALUES (?, NOW())`,
  [name]
);
const insertedId = result.insertId;
```

```typescript
// ─── BEFORE (SQLite upsert) ───────────────────────────────────────────────────
`INSERT INTO kpi_csv_data (id, file_name, csv_json) VALUES (1, ?, ?)
 ON CONFLICT(id) DO UPDATE SET file_name = excluded.file_name, csv_json = excluded.csv_json`

// ─── AFTER (MySQL upsert) ──────────────────────────────────────────────────────
`INSERT INTO kpi_csv_data (id, file_name, csv_json) VALUES (1, ?, ?)
 ON DUPLICATE KEY UPDATE file_name = VALUES(file_name), csv_json = VALUES(csv_json)`
```

```typescript
// ─── BEFORE (SQLite transaction) ─────────────────────────────────────────────
db.serialize(() => {
  db.run('BEGIN TRANSACTION');
  db.run(sql1, params1);
  db.run(sql2, params2);
  db.run('COMMIT');
});

// ─── AFTER (MySQL transaction) ────────────────────────────────────────────────
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  await conn.execute(sql1, params1);
  await conn.execute(sql2, params2);
  await conn.commit();
} catch (err) {
  await conn.rollback();
  throw err;
} finally {
  conn.release();
}
```

---

## 8. Conclusion

Migrating the NSK IATF system to a cloud/internal Linux server with MySQL is **achievable** but requires a **systematic code-level migration effort** — it is not a configuration-only change. The codebase currently uses SQLite in a deeply integrated, callback-style pattern that must be rewritten throughout the entire backend.

**Key risks if not addressed before migration:**
- The server will **crash on startup** (`JWT_SECRET` env var missing).
- The server will **crash at runtime** when any route tries to open a folder via `cmd.exe`.
- Every database write operation will produce SQL errors due to syntax incompatibilities.
- All uploaded files will be lost unless persistent storage is configured.

Following the checklist in Section 6 in order will ensure a smooth migration with no data loss and no downtime beyond the planned maintenance window.
