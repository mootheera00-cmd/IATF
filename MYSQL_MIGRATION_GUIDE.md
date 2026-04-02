# MySQL Migration Guide — How to Fix & Keep SQLite for Local Dev

> **Goal:** Run MySQL on the cloud/company server in production, while keeping SQLite as the database for local development and testing — with zero code duplication.

---

## Table of Contents

1. [Strategy Overview](#1-strategy-overview)
2. [Step 1 — Environment Variables Setup](#2-step-1--environment-variables-setup)
3. [Step 2 — Create a Database Abstraction Layer](#3-step-2--create-a-database-abstraction-layer)
4. [Step 3 — Fix SQL Syntax Incompatibilities](#4-step-3--fix-sql-syntax-incompatibilities)
5. [Step 4 — Fix `lastID` → `insertId`](#5-step-4--fix-lastid--insertid)
6. [Step 5 — Fix INSERT OR IGNORE / ON CONFLICT syntax](#6-step-5--fix-insert-or-ignore--on-conflict-syntax)
7. [Step 6 — Move Inline CREATE TABLE to Migration Scripts](#7-step-6--move-inline-create-table-to-migration-scripts)
8. [Step 7 — Fix Services (auditService, dcrService, etc.)](#8-step-7--fix-services-auditservice-dcrservice-etc)
9. [Step 8 — Fix Windows-Specific Code](#9-step-8--fix-windows-specific-code)
10. [Step 9 — Fix File Storage for Cloud](#10-step-9--fix-file-storage-for-cloud)
11. [Step 10 — Fix kpi_csv_data TEXT → MEDIUMTEXT](#11-step-10--fix-kpi_csv_data-text--mediumtext)
12. [Step 11 — Run Migration on MySQL](#12-step-11--run-migration-on-mysql)
13. [Step 12 — Keeping SQLite for Local Dev/Test](#13-step-12--keeping-sqlite-for-local-devtest)
14. [Quick Reference: SQL Syntax Differences](#14-quick-reference-sql-syntax-differences)

---

## 1. Strategy Overview

The key principle is **database abstraction via environment variables**:

- Set `DB_DRIVER=mysql` on the cloud server
- Set `DB_DRIVER=sqlite` (or leave unset) on local dev machines
- All routes use a shared database adapter that talks to the correct driver

```
Cloud/Company Server
  └── DB_DRIVER=mysql → connects to MySQL server

Local Dev Machine
  └── DB_DRIVER=sqlite (default) → uses local .db file
```

This requires:
- A **thin db adapter** module (`backend/db/db.ts`) that wraps both drivers
- Fixing SQL syntax so it is compatible with both (where possible), or branching per dialect
- Using environment variables for all secrets and paths

---

## 2. Step 1 — Environment Variables Setup

### Update `.env.example`

Add the following to `backend/.env.example`:

```env
# ─── Application ───────────────────────────────
NODE_ENV=development
PORT=4550
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=8h

# ─── Database driver: "sqlite" or "mysql" ──────
DB_DRIVER=sqlite

# SQLite (used when DB_DRIVER=sqlite)
SQLITE_PATH=./db/nskiatf_doccontrol.db

# MySQL (used when DB_DRIVER=mysql)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=iatf_user
MYSQL_PASSWORD=your-password
MYSQL_DATABASE=iatf_doccontrol
MYSQL_CONNECTION_LIMIT=10

# ─── CORS ──────────────────────────────────────
CORS_ORIGIN=http://localhost:5173

# ─── File storage ──────────────────────────────
REPORT_BASE_PATH=/mnt/reports/aptx-reports
# On Windows dev: REPORT_BASE_PATH=G:/02_Folder 5S/...

# ─── SMTP ──────────────────────────────────────
SMTP_HOST=smtp.yourmailserver.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-user@company.com
SMTP_PASS=your-password
SMTP_FROM=IATF Doc Control <no-reply@company.com>
```

### Create separate `.env` files

| File | Purpose |
|---|---|
| `backend/.env` | Local dev — **do NOT commit** |
| `backend/.env.production` | Cloud server — **do NOT commit** |
| `backend/.env.example` | Template — **safe to commit** |

Add to `.gitignore`:
```
backend/.env
backend/.env.production
```

---

## 3. Step 2 — Create a Database Abstraction Layer

Create `backend/db/db.ts` — a single module the whole app imports instead of `sqlite3` directly:

```typescript
// backend/db/db.ts
import path from 'path';
import fs from 'fs';

const driver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();

let pool: any;

if (driver === 'mysql') {
  const mysql = require('mysql2/promise');
  pool = mysql.createPool({
    host:               process.env.MYSQL_HOST     || 'localhost',
    port:         Number(process.env.MYSQL_PORT     || 3306),
    user:               process.env.MYSQL_USER     || 'root',
    password:           process.env.MYSQL_PASSWORD || '',
    database:           process.env.MYSQL_DATABASE || 'iatf_doccontrol',
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    waitForConnections: true,
    timezone:           'Z',
  });
} else {
  // SQLite — wrap callback API in promise-based interface
  const sqlite3 = require('sqlite3').verbose();
  const dbCandidates = [
    process.env.SQLITE_PATH,
    path.resolve(__dirname, '..', '..', 'db', 'nskiatf_doccontrol.db'),
    path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db'),
    path.resolve(process.cwd(), 'db', 'nskiatf_doccontrol.db'),
  ].filter(Boolean) as string[];

  const dbPath = dbCandidates.find(p => fs.existsSync(p)) || dbCandidates[1];
  const _db = new sqlite3.Database(dbPath);

  // Wrap SQLite in a pool-like promise interface
  pool = {
    execute: (sql: string, params: any[] = []) =>
      new Promise<[any[], any]>((resolve, reject) => {
        const isSelect = /^\s*SELECT/i.test(sql);
        if (isSelect) {
          _db.all(sql, params, (err: any, rows: any[]) =>
            err ? reject(err) : resolve([rows, undefined])
          );
        } else {
          _db.run(sql, params, function (this: any, err: any) {
            if (err) return reject(err);
            resolve([{ insertId: this.lastID, affectedRows: this.changes }, undefined]);
          });
        }
      }),
    query: (sql: string, params: any[] = []) => pool.execute(sql, params),
    // For compatibility with code that needs a raw connection
    getConnection: async () => ({
      execute: pool.execute.bind(pool),
      query:   pool.query.bind(pool),
      release: () => {},
      beginTransaction: () => Promise.resolve(),
      commit:           () => Promise.resolve(),
      rollback:         () => Promise.resolve(),
    }),
  };
}

export const db = pool;
export const isMySQL = driver === 'mysql';
export const isSQLite = driver === 'sqlite';

// Helper: return appropriate "now" expression for the active dialect
export const sqlNow = () => isMySQL ? 'NOW()' : "datetime('now')";
export const sqlYear = () => isMySQL ? 'YEAR(NOW())' : "strftime('%Y', 'now')";
```

### Update `server.ts` to use the new module

Replace the sqlite3 initialization block in `server.ts`:

```typescript
// REMOVE these lines:
const sqlite3 = require('sqlite3').verbose();
const dbCandidates = [...];
const dbPath = ...;
const db = new sqlite3.Database(dbPath);

// REPLACE WITH:
import { db } from './db/db';
```

The `req.db = db` middleware line stays the same.

---

## 4. Step 3 — Fix SQL Syntax Incompatibilities

### 4a. `AUTOINCREMENT` → `AUTO_INCREMENT`

**Find & replace in all CREATE TABLE statements:**

| SQLite | MySQL |
|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `INT NOT NULL AUTO_INCREMENT PRIMARY KEY` |

In code that must support both, use the `isMySQL` flag:

```typescript
import { isMySQL } from '../db/db';

const idCol = isMySQL
  ? 'id INT NOT NULL AUTO_INCREMENT PRIMARY KEY'
  : 'id INTEGER PRIMARY KEY AUTOINCREMENT';
```

### 4b. `datetime('now')` → `NOW()` / `CURRENT_TIMESTAMP`

**In column defaults:** replace `TEXT DEFAULT (datetime('now'))` with `DATETIME DEFAULT CURRENT_TIMESTAMP` — works in both SQLite and MySQL.

**In UPDATE statements:** use the `sqlNow()` helper:

```typescript
import { sqlNow } from '../db/db';

// Before:
`UPDATE users SET updated_at = datetime('now') WHERE id = ?`

// After:
`UPDATE users SET updated_at = ${sqlNow()} WHERE id = ?`
```

### 4c. `strftime('%Y', 'now')` → `YEAR(NOW())`

```typescript
import { sqlYear } from '../db/db';

// Before:
`year INTEGER NOT NULL DEFAULT (strftime('%Y', 'now'))`

// After:
`year INT NOT NULL DEFAULT (${sqlYear()})`
```

### 4d. `REAL` → `DOUBLE`

Replace `REAL` with `DOUBLE` in all CREATE TABLE DDL. `DOUBLE` works in both MySQL and SQLite (SQLite accepts `DOUBLE` as an alias for `REAL`).

### 4e. `TEXT` date columns → `DATETIME`

Change date/time columns from `TEXT` to `DATETIME`. SQLite stores DATETIME as text internally but recognises the type name.

---

## 5. Step 4 — Fix `lastID` → `insertId`

With the abstraction layer in Step 2, `result.insertId` already works for both drivers (the SQLite wrapper maps `this.lastID` → `insertId`).

**Required changes in all routes and services:**

```typescript
// BEFORE (SQLite callback pattern):
db.run(`INSERT INTO ...`, params, function(this: any, err: any) {
  if (err) return res.status(500).json({ error: err.message });
  res.json({ id: this.lastID });
});

// AFTER (promise pattern, works with both drivers):
const [result] = await db.execute(`INSERT INTO ...`, params);
res.json({ id: result.insertId });
```

> All routes using `this.lastID` must be converted from callback style to `async/await`.

---

## 6. Step 5 — Fix INSERT OR IGNORE / ON CONFLICT syntax

These need per-dialect handling. Use helper functions:

```typescript
import { isMySQL } from '../db/db';

// INSERT OR IGNORE
export const insertIgnore = (table: string, cols: string, vals: string) =>
  isMySQL
    ? `INSERT IGNORE INTO ${table} (${cols}) VALUES (${vals})`
    : `INSERT OR IGNORE INTO ${table} (${cols}) VALUES (${vals})`;

// UPSERT (ON CONFLICT ... DO UPDATE)
// Example: upsert for kpi_csv_data
export const upsertKpiCsv = () =>
  isMySQL
    ? `INSERT INTO kpi_csv_data (id, file_name, csv_json, uploaded_by, uploaded_at)
       VALUES (1, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         file_name = VALUES(file_name),
         csv_json = VALUES(csv_json),
         uploaded_by = VALUES(uploaded_by),
         uploaded_at = NOW()`
    : `INSERT INTO kpi_csv_data (id, file_name, csv_json, uploaded_by, uploaded_at)
       VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         file_name = excluded.file_name,
         csv_json = excluded.csv_json,
         uploaded_by = excluded.uploaded_by,
         uploaded_at = CURRENT_TIMESTAMP`;
```

**Files to update:**
- `server.ts` (kpi_csv_data upsert)
- `routes/calibration.ts` (PageSettings upsert)
- `routes/inhouseCalibration.ts` (PageSettings upsert)
- `routes/incidents.ts` (INSERT OR IGNORE machine options)
- `routes/training.ts` (INSERT OR IGNORE plan approval)
- `init-db.ts` (INSERT OR IGNORE roles, INSERT OR REPLACE users)
- `seeds/seed_roles.ts`
- `seeds/seed_admin.ts`
- `db/init_db.ts`

---

## 7. Step 6 — Move Inline CREATE TABLE to Migration Scripts

**Problem:** Several routes call `CREATE TABLE IF NOT EXISTS` on every request, which is a performance issue in MySQL and causes race conditions.

**Fix:** Move all DDL into `backend/migrations/` SQL files and run them once at startup or deploy time.

### Files requiring DDL extraction:

| Route file | Tables to extract |
|---|---|
| `routes/msa.ts` | MsaStudy, MsaBias, MsaGrr, MsaStability |
| `routes/incidents.ts` | AbnormalSituation, AbnormalSituationMachineOption, AbnormalSituationEditHistory, AbnormalSituationAttachment |
| `routes/maintenance.ts` | MaintenanceEquipment, MaintenanceActionCode, MaintenancePlanEvent, MaintenanceHistory, MaintenanceCalibrationResult |
| `routes/training.ts` | TrainingRecord, TrainingProgram, TrainingSchedule, TrainingPlanApproval, TrainingPlanEditRequest, TrainingPlanLog |
| `routes/calibration.ts` | CalibrationEquipment, PageSettings |
| `routes/inhouseCalibration.ts` | InHouseCalibrationEquipment, PageSettings |
| `routes/riskAssessment.ts` | RiskAssessmentCategory, RiskAssessmentItem, RiskAssessmentRevision, RiskAssessmentEditRequest, RiskAssessmentEditHistory |
| `routes/users.ts` | roles |

### Create a migration runner

Create `backend/db/runMigrations.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import { db } from './db';

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');

export async function runMigrations() {
  // Create tracking table if it doesn't exist
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [applied] = await db.execute(`SELECT filename FROM _schema_migrations`);
  const appliedSet = new Set((applied as any[]).map((r: any) => r.filename));

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    // Run each statement separately
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await db.execute(stmt);
    }
    await db.execute(`INSERT INTO _schema_migrations (filename) VALUES (?)`, [file]);
    console.log(`✅ Migration applied: ${file}`);
  }
}
```

Call it in `server.ts` before starting the HTTP listener:

```typescript
import { runMigrations } from './db/runMigrations';

async function main() {
  await runMigrations();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  });
}
main();
```

---

## 8. Step 7 — Fix Services (auditService, dcrService, etc.)

The four services currently open their **own** independent SQLite connections. Replace with the shared pool:

```typescript
// BEFORE (each service opens its own db connection):
const sqlite3 = require('sqlite3').verbose();
const dbPath = dbCandidates.find(p => fs.existsSync(p)) || dbCandidates[0];
const db = new sqlite3.Database(dbPath);

// AFTER (import shared pool):
import { db } from '../db/db';
```

**Files to update:**
- `services/auditService.ts`
- `services/dcrService.ts`
- `services/notificationService.ts`
- `services/signedUrlService.ts`

---

## 9. Step 8 — Fix Windows-Specific Code

### `server.ts` — `/api/open-folder` endpoint

This endpoint (`server.ts` lines 219–237) uses `cmd.exe` and only accepts Windows paths. On Linux/cloud this endpoint should be **disabled** or return a clear error.

```typescript
app.post('/api/open-folder', authRequired, (req: any, res: any) => {
  // This feature only works when the server runs on the same Windows machine as the client.
  // On cloud/Linux deployments, this endpoint is not available.
  if (process.platform !== 'win32') {
    return res.status(501).json({
      error: 'The open-folder feature is only available on a local Windows server.'
    });
  }
  // ... rest of existing code
});
```

### `config/config.ts` — `REPORT_BASE_PATH`

Remove the hardcoded Windows path default:

```typescript
// BEFORE:
reportBasePath: process.env.REPORT_BASE_PATH || 'G:/02_Folder 5S/DD === APTC ===/06_APTX reports',

// AFTER:
reportBasePath: process.env.REPORT_BASE_PATH || '',
```

On cloud servers, set `REPORT_BASE_PATH` in the environment to a mounted Linux path (e.g., `/mnt/shares/aptx-reports`).

---

## 10. Step 9 — Fix File Storage for Cloud

Uploaded documents are stored in local directories. In cloud/multi-server environments, **use a shared storage solution**.

### Options (choose one):

| Option | Description | Complexity |
|---|---|---|
| **NFS / SMB shared mount** | Mount a shared network folder to the same path on all servers | Low — no code changes needed |
| **MinIO (self-hosted S3)** | Host an S3-compatible object store on your internal server | Medium |
| **AWS S3 / Azure Blob** | Cloud object storage | Medium |

### For minimal code changes: use a network-mounted shared folder

On the cloud server, mount the shared drive to `/mnt/iatf-uploads` and set environment variables:

```env
# In .env.production on cloud server
STORAGE_ORIGINAL_DIR=/mnt/iatf-uploads/doc-original
STORAGE_PDF_DIR=/mnt/iatf-uploads/doc-pdf
STORAGE_STAGING_DIR=/mnt/iatf-uploads/staging
```

Update `config/storage.ts`:

```typescript
export = {
  ORIGINAL_DIR: process.env.STORAGE_ORIGINAL_DIR
    || path.join(__dirname, '..', 'secure_storage', 'doc-original'),
  PDF_DIR:      process.env.STORAGE_PDF_DIR
    || path.join(__dirname, '..', 'uploads', 'doc-pdf'),
  STAGING_DIR:  process.env.STORAGE_STAGING_DIR
    || path.join(__dirname, '..', 'uploads', 'staging'),
};
```

For local dev, the existing relative paths still work with no change.

---

## 11. Step 10 — Fix `kpi_csv_data` TEXT → MEDIUMTEXT

In the migration SQL for `kpi_csv_data`, change:

```sql
-- SQLite (current)
csv_json TEXT NOT NULL DEFAULT '[]'

-- MySQL (required for large CSV data)
csv_json MEDIUMTEXT NOT NULL
```

`MEDIUMTEXT` holds up to 16 MB, which is sufficient for KPI CSV data.

---

## 12. Step 11 — Run Migration on MySQL

### One-time setup on the MySQL server

```sql
-- Run as MySQL root user
CREATE DATABASE IF NOT EXISTS iatf_doccontrol CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'iatf_user'@'%' IDENTIFIED BY 'your-password';
GRANT ALL PRIVILEGES ON iatf_doccontrol.* TO 'iatf_user'@'%';
FLUSH PRIVILEGES;
```

### Export existing SQLite data (one-time data migration)

```bash
# Install sqlite3 command line tool if not present
# Export each table to CSV, then import to MySQL

# Example using sqlite3 CLI:
sqlite3 db/nskiatf_doccontrol.db ".mode csv" ".output /tmp/users.csv" "SELECT * FROM users;"

# Then import into MySQL:
mysqlimport --ignore-lines=1 --fields-terminated-by=',' \
  --local -u iatf_user -p iatf_doccontrol /tmp/users.csv
```

Or use a GUI tool like **DBeaver** or **MySQL Workbench** with the SQLite → MySQL data transfer wizard.

### Start the server with MySQL

```bash
# Set environment variables for production
export DB_DRIVER=mysql
export MYSQL_HOST=your-mysql-server
export MYSQL_USER=iatf_user
export MYSQL_PASSWORD=your-password
export MYSQL_DATABASE=iatf_doccontrol
export JWT_SECRET=your-production-secret
export NODE_ENV=production

npm start
```

---

## 13. Step 12 — Keeping SQLite for Local Dev/Test

This is the **zero-friction** local development setup.

### `.env` for local dev (not committed)

```env
NODE_ENV=development
DB_DRIVER=sqlite
SQLITE_PATH=./db/nskiatf_doccontrol.db
JWT_SECRET=dev-only-secret
PORT=4550
CORS_ORIGIN=http://localhost:5173
```

### Running locally

```bash
# No DB setup needed — SQLite file is created automatically
npm run dev
```

The `db.ts` abstraction layer automatically uses SQLite when `DB_DRIVER=sqlite` (the default).

### Dev workflow

```
┌─────────────────────────────────┐
│ Local Dev (any machine)         │
│  DB_DRIVER=sqlite               │
│  Uses: db/nskiatf_doccontrol.db │
│  File created on first run      │
└─────────────────────────────────┘
          │ code push
          ▼
┌─────────────────────────────────┐
│ Company Server (cloud/internal) │
│  DB_DRIVER=mysql                │
│  Connects to MySQL server       │
└─────────────────────────────────┘
```

### Backup SQLite for testing

Keep a "golden" SQLite snapshot for reproducible tests:

```bash
# Save a known-good dev database snapshot
cp db/nskiatf_doccontrol.db db/nskiatf_doccontrol.dev-backup.db

# Restore when needed
cp db/nskiatf_doccontrol.dev-backup.db db/nskiatf_doccontrol.db
```

Add to `.gitignore`:
```
backend/db/*.db
backend/db/*.db-backup
# Keep the backup file if you want to share it with the team:
# !backend/db/nskiatf_doccontrol.dev-backup.db
```

---

## 14. Quick Reference: SQL Syntax Differences

| Feature | SQLite (local dev) | MySQL (production) |
|---|---|---|
| Auto increment | `INTEGER PRIMARY KEY AUTOINCREMENT` | `INT NOT NULL AUTO_INCREMENT PRIMARY KEY` |
| Current timestamp default | `DATETIME DEFAULT CURRENT_TIMESTAMP` ✅ | `DATETIME DEFAULT CURRENT_TIMESTAMP` ✅ |
| Current time in query | `datetime('now')` | `NOW()` |
| Current year in query | `strftime('%Y', 'now')` | `YEAR(NOW())` |
| Insert ignore | `INSERT OR IGNORE INTO ...` | `INSERT IGNORE INTO ...` |
| Insert or replace | `INSERT OR REPLACE INTO ...` | `REPLACE INTO ...` |
| Upsert | `ON CONFLICT(col) DO UPDATE SET excluded.col` | `ON DUPLICATE KEY UPDATE col = VALUES(col)` |
| Float type | `REAL` | `DOUBLE` or `FLOAT` |
| Large text | `TEXT` (unlimited) | `TEXT` (64KB), `MEDIUMTEXT` (16MB), `LONGTEXT` (4GB) |
| Check constraint | `CHECK(val IN ('a','b'))` | `CHECK(...)` (MySQL 8.0.16+) or `ENUM('a','b')` |
| Last insert ID | `this.lastID` (callback) | `result.insertId` |
| Boolean | `INTEGER` (0/1) | `TINYINT(1)` or `BOOLEAN` |
| Serialize execution | `db.serialize(() => {...})` | `async/await` or transactions |
| Connection model | Single file handle | Connection pool (`mysql2/promise` pool) |

---

## Migration Checklist

- [ ] Update `.env.example` with all new variables
- [ ] Create `backend/db/db.ts` abstraction layer
- [ ] Update `server.ts` to use `db` from `db/db.ts`
- [ ] Fix all services to import shared `db` (auditService, dcrService, notificationService, signedUrlService)
- [ ] Convert all callback-style `db.run/get/all` to `async/await` using `db.execute()`
- [ ] Replace `this.lastID` → `result.insertId` everywhere
- [ ] Replace `datetime('now')` with `CURRENT_TIMESTAMP` or `sqlNow()` helper
- [ ] Replace `strftime('%Y', 'now')` with `sqlYear()` helper
- [ ] Replace `AUTOINCREMENT` → `AUTO_INCREMENT` or use dialect flag
- [ ] Replace `INSERT OR IGNORE` → `INSERT IGNORE` for MySQL
- [ ] Replace `ON CONFLICT DO UPDATE SET excluded.` → `ON DUPLICATE KEY UPDATE VALUES()`
- [ ] Replace `REAL` type with `DOUBLE`
- [ ] Change `kpi_csv_data.csv_json` to `MEDIUMTEXT`
- [ ] Extract inline `CREATE TABLE` from routes into migration SQL files
- [ ] Create `backend/db/runMigrations.ts` and call it on startup
- [ ] Update `config/storage.ts` to read from environment variables
- [ ] Remove Windows path default from `config/config.ts`
- [ ] Guard `/api/open-folder` with `process.platform === 'win32'` check
- [ ] Create MySQL database, user, and grant permissions on server
- [ ] Set up `.env.production` on cloud server
- [ ] Run one-time SQLite → MySQL data export/import
- [ ] Test all routes against MySQL in staging environment
- [ ] Set up SQLite backup snapshot for local dev team (`dev-backup.db`)
