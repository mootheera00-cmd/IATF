# Migration Fix Guide — SQLite (Dev) → MySQL (Production)

**Project:** NSK IATF 16949 DCR Workflow System  
**Strategy:** Keep SQLite working **locally for development and testing**, swap to MySQL only in **production/cloud**  
**Related report:** [`CLOUD_MYSQL_MIGRATION_REPORT.md`](./CLOUD_MYSQL_MIGRATION_REPORT.md)

---

## Overview

The fix is built around a **single database adapter layer** (`backend/db/adapter.ts`) that:

- Reads `DB_DRIVER=sqlite` (default, local dev) or `DB_DRIVER=mysql` (production) from `.env`  
- Exposes the **same async API** (`run`, `get`, `all`, `getConnection`) to every route file  
- Lets you keep the current SQLite `.db` file as a dev/test backup with **zero changes to business logic**

```
.env          DB_DRIVER=sqlite  →  SQLite  (local dev / CI / test)
.env.prod     DB_DRIVER=mysql   →  MySQL   (cloud / internal server)
```

---

## Step 0 — Create Two Environment Files

### `backend/.env` (local dev — add this file, never commit it)

```dotenv
# ── Local Development (SQLite) ────────────────────────────────────────────────
NODE_ENV=development
PORT=4550
DB_DRIVER=sqlite
# SQLite file is auto-resolved by server.ts; leave blank or set explicit path:
# SQLITE_PATH=./db/nskiatf_doccontrol.db

# JWT (dev secret — use a real random value in production)
JWT_SECRET=dev-only-secret-change-me
JWT_EXPIRES_IN=8h

# CORS — local frontend
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173

# Report folder (Windows dev machine)
# REPORT_BASE_PATH=G:/02_Folder 5S/DD === APTC ===/06_APTX reports

# SMTP (optional in dev)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=IATF Doc Control <no-reply@localhost>
```

### `backend/.env.prod` (production server — never commit, copy to server manually)

```dotenv
# ── Production (MySQL) ────────────────────────────────────────────────────────
NODE_ENV=production
PORT=4550
DB_DRIVER=mysql

# MySQL connection
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=iatf_app
DB_PASSWORD=STRONG_RANDOM_PASSWORD_HERE
DB_NAME=nskiatf_doccontrol
DB_POOL_SIZE=10

# JWT — generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=REPLACE_WITH_64_BYTE_HEX_SECRET
JWT_EXPIRES_IN=8h

# CORS — actual production domain or IP
CORS_ORIGIN=https://iatf.yourcompany.com

# Report folder (mounted NFS or SMB share on Linux)
REPORT_BASE_PATH=/mnt/reports/APTX

# SMTP
SMTP_HOST=smtp.yourcompany.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=no-reply@yourcompany.com
SMTP_PASS=SMTP_PASSWORD_HERE
SMTP_FROM=IATF Doc Control <no-reply@yourcompany.com>
```

### Fix `.env.example` — add missing variables

Replace the contents of `backend/.env.example` with:

```dotenv
# ── Environment template — copy to .env and fill in values ───────────────────

NODE_ENV=development
PORT=4550

# Database driver: sqlite (local dev) | mysql (production)
DB_DRIVER=sqlite

# MySQL — required when DB_DRIVER=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=iatf_app
DB_PASSWORD=
DB_NAME=nskiatf_doccontrol
DB_POOL_SIZE=10

# JWT — REQUIRED (config/config.ts throws if missing)
JWT_SECRET=dev-only-secret-change-me
JWT_EXPIRES_IN=8h

# CORS
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173

# Report folder
REPORT_BASE_PATH=

# SMTP
SMTP_HOST=smtp.yourmailserver.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-user@company.com
SMTP_PASS=your-password
SMTP_FROM=IATF Doc Control <no-reply@company.com>
```

---

## Step 1 — Fix `config/config.ts` (JWT_SECRET name mismatch)

**Current bug:** `.env.example` defines `SECRET_KEY` but `config.ts` reads `JWT_SECRET` → server crashes on startup.

**File:** `backend/config/config.ts`

```typescript
// BEFORE
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required...');
}
export = {
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  reportBasePath: process.env.REPORT_BASE_PATH || 'G:/02_Folder 5S/DD === APTC ===/06_APTX reports',
};

// AFTER
const secret = process.env.JWT_SECRET || process.env.SECRET_KEY;
if (!secret) {
  throw new Error('JWT_SECRET environment variable is required but not set. Check your .env file.');
}
export = {
  jwtSecret: secret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  // Default is empty string; REPORT_BASE_PATH must be set on Linux servers
  reportBasePath: process.env.REPORT_BASE_PATH || '',
};
```

---

## Step 2 — Create the Database Adapter (`backend/db/adapter.ts`)

This is the **core of the dual-database strategy**. Create this new file:

**File:** `backend/db/adapter.ts`

```typescript
/**
 * Database Adapter
 * ----------------
 * Provides a unified async interface for both SQLite (dev) and MySQL (production).
 * Set DB_DRIVER=sqlite or DB_DRIVER=mysql in your .env file.
 *
 * Usage in routes:
 *   import { dbRun, dbGet, dbAll, getConnection } from '../db/adapter';
 *
 *   const row  = await dbGet(req.db, 'SELECT * FROM users WHERE id = ?', [id]);
 *   const rows = await dbAll(req.db, 'SELECT * FROM users');
 *   const res  = await dbRun(req.db, 'INSERT INTO users (name) VALUES (?)', ['Alice']);
 *   const insertedId = res.insertId;   // works for both SQLite and MySQL
 */

const driver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();

// ─── SQLite helpers ───────────────────────────────────────────────────────────
function sqliteRun(db: any, sql: string, params: any[] = []): Promise<{ insertId: number; changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (this: any, err: any) {
      if (err) return reject(err);
      resolve({ insertId: this.lastID, changes: this.changes });
    });
  });
}
function sqliteGet(db: any, sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err: any, row: any) => (err ? reject(err) : resolve(row)));
  });
}
function sqliteAll(db: any, sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any[]) => (err ? reject(err) : resolve(rows || [])));
  });
}

// ─── MySQL helpers ────────────────────────────────────────────────────────────
async function mysqlRun(db: any, sql: string, params: any[] = []): Promise<{ insertId: number; changes: number }> {
  const [result] = await db.execute(sql, params);
  return { insertId: (result as any).insertId, changes: (result as any).affectedRows };
}
async function mysqlGet(db: any, sql: string, params: any[] = []): Promise<any> {
  const [rows] = await db.execute(sql, params);
  return (rows as any[])[0] ?? null;
}
async function mysqlAll(db: any, sql: string, params: any[] = []): Promise<any[]> {
  const [rows] = await db.execute(sql, params);
  return (rows as any[]) || [];
}

// ─── Public API ───────────────────────────────────────────────────────────────
export const dbRun  = driver === 'mysql' ? mysqlRun  : sqliteRun;
export const dbGet  = driver === 'mysql' ? mysqlGet  : sqliteGet;
export const dbAll  = driver === 'mysql' ? mysqlAll  : sqliteAll;

/**
 * Returns a connection with beginTransaction/commit/rollback.
 * For SQLite, wraps the shared db handle.
 * For MySQL, gets a connection from the pool.
 */
export async function getConnection(db: any) {
  if (driver === 'mysql') {
    const conn = await db.getConnection();
    return {
      run:  (sql: string, p: any[]) => mysqlRun(conn, sql, p),
      get:  (sql: string, p: any[]) => mysqlGet(conn, sql, p),
      all:  (sql: string, p: any[]) => mysqlAll(conn, sql, p),
      beginTransaction: () => conn.beginTransaction(),
      commit:   () => conn.commit(),
      rollback: () => conn.rollback(),
      release:  () => conn.release(),
    };
  }
  // SQLite — serialize-based transaction shim
  return {
    run:  (sql: string, p: any[]) => sqliteRun(db, sql, p),
    get:  (sql: string, p: any[]) => sqliteGet(db, sql, p),
    all:  (sql: string, p: any[]) => sqliteAll(db, sql, p),
    _pending: [] as Array<() => Promise<any>>,
    beginTransaction() {
      return new Promise<void>((res, rej) => db.run('BEGIN TRANSACTION', (e: any) => e ? rej(e) : res()));
    },
    commit() {
      return new Promise<void>((res, rej) => db.run('COMMIT', (e: any) => e ? rej(e) : res()));
    },
    rollback() {
      return new Promise<void>((res, rej) => db.run('ROLLBACK', (e: any) => e ? rej(e) : res()));
    },
    release() { /* no-op for SQLite */ },
  };
}
```

---

## Step 3 — Fix `server.ts` — Support Both Drivers

**File:** `backend/server.ts` — replace the SQLite-only database initialisation block.

```typescript
// ─── BEFORE (SQLite only) ─────────────────────────────────────────────────────
const sqlite3 = require('sqlite3').verbose();
// ... (dbCandidates / dbPath resolution) ...
const db = new sqlite3.Database(dbPath);
app.use((req, res, next) => { req.db = db; next(); });

// ─── AFTER (supports both SQLite and MySQL) ────────────────────────────────────
const DB_DRIVER = (process.env.DB_DRIVER || 'sqlite').toLowerCase();
let db: any;

if (DB_DRIVER === 'mysql') {
  const mysql = require('mysql2/promise');
  db = mysql.createPool({
    host:            process.env.DB_HOST     || '127.0.0.1',
    port:     Number(process.env.DB_PORT)    || 3306,
    user:            process.env.DB_USER     || 'iatf_app',
    password:        process.env.DB_PASSWORD || '',
    database:        process.env.DB_NAME     || 'nskiatf_doccontrol',
    waitForConnections: true,
    connectionLimit:  Number(process.env.DB_POOL_SIZE) || 10,
    charset: 'utf8mb4',
  });
  console.log(`✅ Using MySQL: ${process.env.DB_HOST}/${process.env.DB_NAME}`);
} else {
  const sqlite3 = require('sqlite3').verbose();
  const path = require('path');
  const fs   = require('fs');
  const dbCandidates = [
    path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db'),
    path.resolve(__dirname, 'db', 'nskiatf_doccontrol.db'),
    path.resolve(process.cwd(), 'db', 'nskiatf_doccontrol.db'),
  ];
  const dbPath = dbCandidates.find(fs.existsSync) || dbCandidates[0];
  if (!fs.existsSync(dbPath)) console.warn(`⚠️ SQLite DB not found, creating: ${dbPath}`);
  else console.log(`✅ Using SQLite DB: ${dbPath}`);
  db = new sqlite3.Database(dbPath);
}

app.use((req: any, _res: any, next: any) => { req.db = db; next(); });
```

---

## Step 4 — SQL Syntax Fixes (apply to every affected file)

All SQL must be written to be compatible with **both** SQLite and MySQL, or you must use conditional SQL. The simplest approach: use the MySQL-compatible syntax everywhere — it is also valid SQLite **except** for the specific items listed below. Use the adapter from Step 2 and make these targeted text replacements.

### 4.1 `AUTOINCREMENT` → `AUTO_INCREMENT`

SQLite uses `AUTOINCREMENT`; MySQL uses `AUTO_INCREMENT`.

> **Tip for dual support:** Use a SQL helper that replaces the keyword based on `DB_DRIVER`:

Add to `backend/db/adapter.ts`:

```typescript
/** Normalise CREATE TABLE SQL for the current driver */
export function normalizeSql(sql: string): string {
  if ((process.env.DB_DRIVER || 'sqlite').toLowerCase() === 'mysql') {
    return sql
      .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'INT NOT NULL AUTO_INCREMENT PRIMARY KEY')
      .replace(/\bAUTOINCREMENT\b/gi, 'AUTO_INCREMENT')
      .replace(/\bdatetime\('now'\)/gi, 'NOW()')
      .replace(/\bstrftime\('%Y',\s*'now'\)/gi, 'YEAR(NOW())')
      .replace(/\bstrftime\('%Y',\s*(\w+)\)/gi, 'YEAR($1)')
      .replace(/\bstrftime\('%m',\s*(\w+)\)/gi, 'MONTH($1)')
      .replace(/TEXT\s+DEFAULT\s+\(datetime\('now'\)\)/gi, 'DATETIME DEFAULT CURRENT_TIMESTAMP')
      .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT IGNORE INTO')
      .replace(/ON\s+CONFLICT\s*\(([^)]+)\)\s*DO\s+UPDATE\s+SET/gi,
               'ON DUPLICATE KEY UPDATE');
  }
  return sql;
}
```

Then in every route file, wrap every SQL string passed to `dbRun` / `dbGet` / `dbAll`:

```typescript
// Add this import at the top of each route file
import { dbRun, dbGet, dbAll, normalizeSql } from '../db/adapter';

// Usage:
await dbRun(db, normalizeSql(`
  CREATE TABLE IF NOT EXISTS MyTable (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`));
```

> **Note:** The `normalizeSql` helper handles the most common patterns automatically. Review complex `ON CONFLICT` → `ON DUPLICATE KEY UPDATE` rewrites manually (see §4.5).

---

### 4.2 `datetime('now')` in queries (not just DDL)

In `UPDATE` and `INSERT` statements that call `datetime('now')` inline:

```sql
-- SQLite (current) — in routes/users.ts, training.ts, calibration.ts, etc.
updated_at = datetime('now')
VALUES (?, ?, datetime('now'), datetime('now'))

-- MySQL / universal fix
updated_at = NOW()
VALUES (?, ?, NOW(), NOW())
```

Or use a JavaScript timestamp string to avoid any database function:

```typescript
// Universal: pass ISO timestamp as a parameter
const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
await dbRun(db, `INSERT INTO users (name, created_at) VALUES (?, ?)`, [name, now]);
```

**Affected files:** `routes/users.ts`, `routes/training.ts`, `routes/calibration.ts`, `routes/inhouseCalibration.ts`, `routes/msa.ts`, `routes/calibrationHistory.ts`

---

### 4.3 `strftime` → MySQL date functions

`strftime` is SQLite-only. Replace with MySQL equivalents or use JavaScript-side filtering.

| SQLite | MySQL |
|--------|-------|
| `strftime('%Y', col)` | `YEAR(col)` |
| `strftime('%m', col)` | `MONTH(col)` |
| `strftime('%Y', 'now')` | `YEAR(NOW())` |

```sql
-- SQLite (current) — routes/training.ts
SELECT DISTINCT CAST(strftime('%Y', training_date) AS INTEGER) AS year FROM TrainingRecord

-- MySQL fix
SELECT DISTINCT YEAR(training_date) AS year FROM TrainingRecord

-- Universal (safest): extract year in JavaScript after fetching all rows
```

**Affected file:** `routes/training.ts` (lines 659, 688, 711, 742, 746) and `routes/training.ts` DDL (line 94):

```sql
-- SQLite DDL (line 94):
year  INTEGER NOT NULL DEFAULT (strftime('%Y', 'now'))

-- MySQL DDL:
year  INT NOT NULL DEFAULT (YEAR(NOW()))

-- Universal — remove the DB default, set the value in application code:
year  INT NOT NULL   -- set value explicitly in INSERT: new Date().getFullYear()
```

---

### 4.4 `INSERT OR IGNORE` → `INSERT IGNORE`

```sql
-- SQLite (current) — routes/incidents.ts, training.ts, db/init_db.ts
INSERT OR IGNORE INTO roles (name) VALUES (?)

-- MySQL fix
INSERT IGNORE INTO roles (name) VALUES (?)
```

`normalizeSql()` handles this automatically. Files to verify manually:  
`routes/incidents.ts` (×3), `routes/training.ts` (×1), `db/init_db.ts`

---

### 4.5 `ON CONFLICT … DO UPDATE SET` → `ON DUPLICATE KEY UPDATE`

The `excluded.column` reference syntax differs.

```sql
-- SQLite (current) — server.ts kpi-csv, routes/calibration.ts, routes/inhouseCalibration.ts
INSERT INTO PageSettings (page_key, pic_user_id, updated_at)
VALUES (?, ?, datetime('now'))
ON CONFLICT(page_key) DO UPDATE SET
  pic_user_id = excluded.pic_user_id,
  updated_at  = datetime('now')

-- MySQL fix
INSERT INTO PageSettings (page_key, pic_user_id, updated_at)
VALUES (?, ?, NOW())
ON DUPLICATE KEY UPDATE
  pic_user_id = VALUES(pic_user_id),
  updated_at  = NOW()
```

> `excluded.column_name` (SQLite) → `VALUES(column_name)` (MySQL)

**Affected locations:**
- `server.ts` — `kpi_csv_data` upsert
- `routes/calibration.ts` — `PageSettings` upsert
- `routes/inhouseCalibration.ts` — `PageSettings` upsert

---

### 4.6 `this.lastID` → `result.insertId`

The adapter from Step 2 already normalises this: `dbRun()` always returns `{ insertId, changes }`.

```typescript
// BEFORE (SQLite callback)
db.run(sql, params, function (this: any, err: any) {
  if (err) return handleErr(err);
  const newId = this.lastID;
  // ...
});

// AFTER (using adapter — works for both SQLite and MySQL)
const result = await dbRun(db, sql, params);
const newId = result.insertId;
```

**Files to update (38 occurrences):**

| File | Lines |
|------|-------|
| `routes/riskAssessment.ts` | 151, 152, 264, 268, 396, 399, 401, 539, 540 |
| `routes/incidents.ts` | 224, 227, 299 |
| `routes/training.ts` | 477, 636 |
| `routes/migration.ts` | 229, 282 |
| `routes/admin.ts` | 59, 63, 92, 96 |
| `routes/msa.ts` | 205 |
| `routes/users.ts` | 107 |
| `routes/workflow.ts` | 18 |
| `services/dcrService.ts` | 853, 856, 857 |
| `services/notificationService.ts` | 207 |
| `services/auditService.ts` | 106 |
| `tools/seed_kpi_strict.ts` | 60, 96 |

---

### 4.7 Remove `PRAGMA` Statements

`PRAGMA` is SQLite-only. MySQL manages foreign keys on InnoDB tables by default.

```typescript
// Remove or skip these lines in migrations/migrate_init.ts
// and migrations/patch_users_add_missing_columns.ts:
await run('PRAGMA foreign_keys = ON;');  // DELETE THIS LINE
```

Add a `DB_DRIVER` guard if you want to keep SQLite PRAGMA for local dev:

```typescript
if ((process.env.DB_DRIVER || 'sqlite') === 'sqlite') {
  await dbRun(db, 'PRAGMA foreign_keys = ON');
}
```

---

### 4.8 `GENERATED ALWAYS AS … VIRTUAL` — Syntax Fix

Both SQLite and MySQL support virtual generated columns, but the type keyword differs.

```sql
-- SQLite (current) — routes/riskAssessment.ts line 49
risk_score INTEGER GENERATED ALWAYS AS (severity * occurrence) VIRTUAL

-- MySQL syntax (also accepted by SQLite 3.31+)
risk_score INT GENERATED ALWAYS AS (severity * occurrence) VIRTUAL
```

`normalizeSql()` does not handle this automatically. Change `INTEGER GENERATED ALWAYS` → `INT GENERATED ALWAYS` in `routes/riskAssessment.ts`.

---

### 4.9 `db.serialize()` — Remove All Usages

`db.serialize()` is SQLite-specific. Replace each usage with `async/await` using the adapter.

```typescript
// BEFORE (SQLite db.serialize)
function ensureTable(db: any, cb: () => void) {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS Foo (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS Bar (id INTEGER PRIMARY KEY AUTOINCREMENT, foo_id INTEGER)`);
    cb();
  });
}

// AFTER (async, works with both drivers)
async function ensureTable(db: any): Promise<void> {
  await dbRun(db, normalizeSql(`CREATE TABLE IF NOT EXISTS Foo (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`));
  await dbRun(db, normalizeSql(`CREATE TABLE IF NOT EXISTS Bar (id INTEGER PRIMARY KEY AUTOINCREMENT, foo_id INTEGER)`));
}
```

**Files that contain `db.serialize()`:**  
`routes/msa.ts`, `routes/migration.ts`, `routes/training.ts`, `migrate.ts`, `recreate_table.ts`, `add_filepath.ts`, `migrate_change_request.ts`, `migrate_documents.ts`, `seeds/seed_roles.ts`, `check_admin.ts`

---

### 4.10 `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK`

Replace manual string-based transactions with the `getConnection()` helper from the adapter.

```typescript
// BEFORE (routes/migration.ts — SQLite only)
db.serialize(() => {
  db.run('BEGIN TRANSACTION');
  db.run(sql1, params1, (err: any) => {
    if (err) { db.run('ROLLBACK'); return; }
    db.run(sql2, params2, (err2: any) => {
      if (err2) { db.run('ROLLBACK'); return; }
      db.run('COMMIT');
    });
  });
});

// AFTER (using adapter getConnection — works for both drivers)
import { getConnection } from '../db/adapter';

const conn = await getConnection(req.db);
try {
  await conn.beginTransaction();
  await conn.run(sql1, params1);
  await conn.run(sql2, params2);
  await conn.commit();
} catch (err) {
  await conn.rollback();
  throw err;
} finally {
  conn.release();
}
```

---

## Step 5 — Fix Windows-Only Code

### 5.1 Remove `cmd.exe` from `/api/open-folder` (`server.ts`)

The `/api/open-folder` endpoint spawns `cmd.exe` to open a folder in Windows Explorer on the **server**. This cannot work on Linux. Replace the spawn call with a response that tells the **client** to handle it instead (or simply disable the feature on non-Windows servers).

```typescript
// BEFORE (server.ts ~line 231)
const child = spawn('cmd.exe', ['/c', 'start', '', normalized], { detached: true, stdio: 'ignore' });
child.unref();
res.json({ success: true });

// AFTER — disable on non-Windows
app.post('/api/open-folder', authRequired, (req: any, res: any) => {
  if (process.platform !== 'win32') {
    return res.status(400).json({ error: 'open-folder is only supported when the server runs on Windows.' });
  }
  const { folderPath } = req.body;
  if (!folderPath || typeof folderPath !== 'string') {
    return res.status(400).json({ error: 'folderPath is required' });
  }
  const normalized = folderPath.replace(/\//g, '\\');
  if (!/^([A-Za-z]:\\|\\\\)/.test(normalized)) {
    return res.status(400).json({ error: 'Invalid Windows path' });
  }
  const child = spawn('cmd.exe', ['/c', 'start', '', normalized], { detached: true, stdio: 'ignore' });
  child.unref();
  res.json({ success: true });
});
```

### 5.2 `explorer.exe` in `routes/report.ts`

The `report.ts` route already handles `darwin` and falls through to `xdg-open` on Linux, but a headless server has no desktop. The route will not crash but will silently fail. Add a clear response:

```typescript
// AFTER — routes/report.ts openFolder function
const openFolder = (folderPath: string) => {
  if (process.platform === 'win32') {
    const child = spawn('explorer.exe', [folderPath], { detached: true, stdio: 'ignore' });
    child.unref();
    return;
  }
  // On Linux/macOS servers without a desktop session, return an error
  throw new Error('open-folder is not supported on headless Linux servers.');
};
```

### 5.3 Remove Hardcoded `G:/` Path (`config/config.ts`)

Already covered in Step 1 — replace with empty string and require `REPORT_BASE_PATH` via `.env.prod`.

---

## Step 6 — File Storage (for Cloud Deployment)

Local file storage works fine for development. For production, mount a **persistent volume**.

### Option A — Mounted NFS / SMB Volume (simplest)

```bash
# On the Linux server, mount company NAS:
sudo mount -t cifs //nas.yourcompany.com/iatf /mnt/iatf-uploads \
  -o username=iatf_app,password=...,uid=1000,gid=1000

# Update backend/config/storage.ts to use the mounted path:
```

```typescript
// backend/config/storage.ts
const path = require('path');
const UPLOAD_BASE = process.env.UPLOAD_BASE_PATH || path.join(__dirname, '..', 'uploads');
export = {
  ORIGINAL_DIR: path.join(UPLOAD_BASE, 'doc-original'),
  PDF_DIR:      path.join(UPLOAD_BASE, 'doc-pdf'),
  STAGING_DIR:  path.join(UPLOAD_BASE, 'staging'),
};
```

Add to `.env.prod`:
```dotenv
UPLOAD_BASE_PATH=/mnt/iatf-uploads
```

### Option B — MinIO (S3-compatible, self-hosted)

1. Run MinIO on the same server or on a NAS:
   ```bash
   docker run -p 9000:9000 -p 9001:9001 \
     -v /data/minio:/data \
     -e MINIO_ROOT_USER=iatf -e MINIO_ROOT_PASSWORD=STRONG_PASS \
     minio/minio server /data --console-address ":9001"
   ```
2. Install the AWS SDK: `npm install @aws-sdk/client-s3`
3. Create `backend/services/storageService.ts` that uploads/downloads using the SDK
4. Replace `fs.writeFileSync` / `res.sendFile` calls with storage service calls

---

## Step 7 — MySQL Schema Setup (Production Only)

Run these commands on the production MySQL server **before** starting the app:

```sql
-- 1. Create database
CREATE DATABASE IF NOT EXISTS nskiatf_doccontrol
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 2. Create application user (least privilege)
CREATE USER 'iatf_app'@'127.0.0.1' IDENTIFIED BY 'STRONG_RANDOM_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON nskiatf_doccontrol.* TO 'iatf_app'@'127.0.0.1';
FLUSH PRIVILEGES;

-- 3. Apply schema (run the migration script, see Step 8)
```

### MySQL-Compatible Schema for All Tables

Below is the MySQL-equivalent DDL for the main tables. Run this once on first deployment via `npm run migrate:mysql` (add this script after creating a migration file).

```sql
-- MySQL schema (utf8mb4, InnoDB)
-- Run on production: mysql -u iatf_app -p nskiatf_doccontrol < schema_mysql.sql

CREATE TABLE IF NOT EXISTS roles (
  id   INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  employee_code VARCHAR(50) NOT NULL UNIQUE,
  name          VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_id       INT,
  is_active     TINYINT(1) DEFAULT 1,
  email         VARCHAR(255),
  owning_department VARCHAR(100),
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Document (
  id                  INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  doc_number          VARCHAR(64) UNIQUE NOT NULL,
  title               VARCHAR(255) NOT NULL,
  owning_department   VARCHAR(100),
  current_revision_id BIGINT NULL,
  created_by          BIGINT NOT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS DocumentRevision (
  id                   INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  document_id          BIGINT NOT NULL,
  rev_code             VARCHAR(16) NOT NULL,
  status               ENUM('Working','Pending Approval','Released','Obsolete') NOT NULL,
  original_uri         TEXT,
  original_sha256      CHAR(64),
  pdf_uri              TEXT,
  pdf_sha256           CHAR(64),
  change_summary       TEXT,
  created_by           BIGINT NOT NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at          DATETIME NULL,
  released_by          BIGINT NULL,
  supersedes_revision_id BIGINT NULL,
  FOREIGN KEY (document_id) REFERENCES Document(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ChangeRequest (
  id                         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  document_id                BIGINT NOT NULL,
  requester_id               BIGINT NOT NULL,
  manager_id                 BIGINT NULL,
  status                     ENUM('Draft','Submitted','Rejected','Pre-Approved','Pending Approval','Returned for Revision','Approved') NOT NULL,
  reason                     TEXT NOT NULL,
  submitted_at               DATETIME NULL,
  preapproved_at             DATETIME NULL,
  final_approved_at          DATETIME NULL,
  rejected_at                DATETIME NULL,
  returned_at                DATETIME NULL,
  latest_working_revision_id BIGINT NULL,
  FOREIGN KEY (document_id) REFERENCES Document(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Notification (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT NOT NULL,
  type       ENUM('DCR_SUBMITTED','DCR_PRE_APPROVED','DCR_REJECTED','DCR_APPROVED','DCR_RETURNED_FOR_REVISION','REVISION_UPLOADED') NOT NULL,
  message    TEXT NOT NULL,
  metadata   TEXT,
  is_read    TINYINT(1) DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at    DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add remaining tables (RiskAssessment*, Training*, Calibration*, etc.)
-- following the same pattern: INTEGER → INT, AUTOINCREMENT → AUTO_INCREMENT,
-- datetime('now') → CURRENT_TIMESTAMP, TEXT for long text, VARCHAR(n) for short strings.
```

---

## Step 8 — Migrate Existing SQLite Data to MySQL

Run this **once** before switching to MySQL in production.

### Option A — Using `sqlite3` CLI + MySQL import

```bash
# 1. Export all data from SQLite as CSV per table
cd backend/db
sqlite3 nskiatf_doccontrol.db ".separator ','" ".headers on" ".output roles.csv" "SELECT * FROM roles;"
sqlite3 nskiatf_doccontrol.db ".separator ','" ".headers on" ".output users.csv" "SELECT * FROM users;"
# ... repeat for each table

# 2. Import into MySQL using LOAD DATA INFILE
# mysql> LOAD DATA INFILE '/path/to/roles.csv' INTO TABLE roles FIELDS TERMINATED BY ',' ...
```

### Option B — Node.js migration script (recommended)

```typescript
// backend/tools/migrate_sqlite_to_mysql.ts
// Run: tsx tools/migrate_sqlite_to_mysql.ts
import sqlite3 from 'sqlite3';
import mysql from 'mysql2/promise';
import path from 'path';

const TABLES = ['roles', 'users', 'Document', 'DocumentRevision', 'ChangeRequest', 'Notification',
  /* add all table names */];

async function migrate() {
  const sqliteDb = new (sqlite3.verbose().Database)(
    path.resolve(__dirname, '../db/nskiatf_doccontrol.db')
  );
  const pool = await mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });

  for (const table of TABLES) {
    const rows: any[] = await new Promise((res, rej) =>
      sqliteDb.all(`SELECT * FROM ${table}`, [], (err, r) => err ? rej(err) : res(r))
    );
    if (!rows.length) { console.log(`⚪ ${table}: empty`); continue; }

    const cols = Object.keys(rows[0]);
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const row of rows) {
        await conn.execute(sql, cols.map(c => row[c]));
      }
      await conn.commit();
      console.log(`✅ ${table}: ${rows.length} rows migrated`);
    } catch (err) {
      await conn.rollback();
      console.error(`❌ ${table}: FAILED`, err);
    } finally {
      conn.release();
    }
  }
  pool.end();
}

migrate().catch(console.error);
```

Add script to `backend/package.json`:
```json
"scripts": {
  "migrate:sqlite-to-mysql": "tsx tools/migrate_sqlite_to_mysql.ts"
}
```

---

## Step 9 — CORS and Reverse Proxy Fix

```typescript
// server.ts — add BEFORE app.use(cors(...))
// Required when running behind Nginx, Caddy, or any cloud load balancer
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
```

Remove hardcoded IP from CORS origin default:

```typescript
// BEFORE
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173,http://133.124.150.22:5173').split(',')
);

// AFTER
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(o => o.trim())
);
```

---

## Step 10 — Remove Legacy Plaintext Password Code (`routes/auth.ts`)

Before going to production, ensure all users have bcrypt hashes, then remove the legacy comparison branches.

```typescript
// REMOVE these blocks from routes/auth.ts login handler:

// Legacy: compare plaintext in password_hash
if (!isBcryptHash) {
  passwordMatch = (user.password_hash === password) || (user.password === password);
  // ...
}

// Legacy: sync password column
if (passwordMatch && user.password !== password) {
  db.run(`UPDATE users SET password = ? WHERE id = ?`, [password, user.id], ...);
}
```

Run this query to verify all users have bcrypt hashes before removing:
```sql
SELECT id, employee_code FROM users WHERE password_hash NOT LIKE '$2%';
```

---

## Development Workflow (Daily Use)

### Start local dev (SQLite — no MySQL needed)

```bash
cd backend
# Ensure .env has DB_DRIVER=sqlite (default)
npm run dev
```

### Start production server (MySQL)

```bash
cd backend
# Copy .env.prod as .env on the server, or:
NODE_ENV=production DB_DRIVER=mysql \
  DB_HOST=127.0.0.1 DB_USER=iatf_app DB_PASSWORD=... DB_NAME=nskiatf_doccontrol \
  JWT_SECRET=... node dist/server.js
```

### Keep SQLite as a backup snapshot before switching

```bash
# Create a dated backup of the current SQLite DB
cp backend/db/nskiatf_doccontrol.db \
   backend/db/nskiatf_doccontrol_backup_$(date +%Y%m%d).db

# To restore (overwrite current DB with backup):
cp backend/db/nskiatf_doccontrol_backup_20260402.db \
   backend/db/nskiatf_doccontrol.db
```

### Automated daily SQLite backup (development machine, Windows Task Scheduler or cron)

```bash
# cron (Linux/macOS) — add via crontab -e
0 18 * * * cp /path/to/backend/db/nskiatf_doccontrol.db \
  /path/to/backups/nskiatf_$(date +\%Y\%m\%d).db

# Windows Task Scheduler — create a .bat file:
# xcopy /Y "C:\iatf\backend\db\nskiatf_doccontrol.db" "C:\iatf\backups\nskiatf_%DATE:~-4,4%%DATE:~-7,2%%DATE:~0,2%.db"
```

---

## Summary Checklist

### Environment & Config
- [ ] Replace `backend/.env.example` with complete template (Step 0)
- [ ] Create `backend/.env` for local dev with `DB_DRIVER=sqlite`
- [ ] Create `backend/.env.prod` for production with `DB_DRIVER=mysql` and all DB variables
- [ ] Fix `config/config.ts` — accept both `JWT_SECRET` and `SECRET_KEY` (Step 1)
- [ ] Remove `G:/` default from `config/config.ts`

### Database Adapter
- [ ] Create `backend/db/adapter.ts` with `dbRun`, `dbGet`, `dbAll`, `getConnection`, `normalizeSql` (Step 2)
- [ ] Update `server.ts` to support both SQLite and MySQL via `DB_DRIVER` env var (Step 3)

### SQL Fixes (all route files)
- [ ] Wrap all `CREATE TABLE` DDL with `normalizeSql()` (Step 4.1)
- [ ] Replace `datetime('now')` in queries with `NOW()` or JS timestamp (Step 4.2)
- [ ] Replace `strftime(...)` with MySQL date functions or JS-side logic (Step 4.3)
- [ ] Replace `INSERT OR IGNORE` with `INSERT IGNORE` (Step 4.4)
- [ ] Rewrite `ON CONFLICT … DO UPDATE SET` → `ON DUPLICATE KEY UPDATE` (Step 4.5)
- [ ] Replace all `this.lastID` with `result.insertId` via adapter (Step 4.6)
- [ ] Remove/guard all `PRAGMA` statements (Step 4.7)
- [ ] Fix `GENERATED ALWAYS AS … VIRTUAL` in `riskAssessment.ts` (Step 4.8)
- [ ] Remove all `db.serialize()` — use `async/await` (Step 4.9)
- [ ] Rewrite all `BEGIN TRANSACTION`/`COMMIT`/`ROLLBACK` — use `getConnection()` (Step 4.10)

### Windows Code Fixes
- [ ] Gate `cmd.exe` in `/api/open-folder` with `process.platform === 'win32'` (Step 5.1)
- [ ] Gate `explorer.exe` in `routes/report.ts` (Step 5.2)

### Production Deployment
- [ ] Decide on file storage strategy — NFS mount or MinIO (Step 6)
- [ ] Create MySQL database, user, and apply schema (Step 7)
- [ ] Run data migration from SQLite → MySQL (Step 8)
- [ ] Add `trust proxy` and fix CORS defaults (Step 9)
- [ ] Remove legacy plaintext password code (Step 10)
- [ ] Take a SQLite `.db` backup before switching to MySQL
