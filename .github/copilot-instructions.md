# Project Guidelines — NSK IATF Document Control System

IATF 16949 Document Control & Quality Management System. Production v1.0.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express 5.2 (TypeScript) |
| Frontend | React 19 + Vite 7.3 (TypeScript, Tailwind CSS 3.4) |
| Database | SQLite3 (file-based, migrations-driven) |
| Auth | JWT + bcryptjs, role-based access control |
| Integration | Plan HUB & Plan PT (Flask/Python), proxied via Vite |

## Build and Run

```bash
# Backend (port 4550)
cd backend && npm run dev          # Dev with tsx hot-reload
cd backend && npm run build        # Compile TS → dist/
cd backend && npm start            # Run compiled output

# Frontend (port 5173)
cd frontend && npm run dev         # Vite dev server
cd frontend && npm run build       # Production build
cd frontend && npm run lint        # ESLint

# Database
cd backend && node db/init_db.js   # Initialize/migrate database

# Full stack orchestration (PowerShell)
./scripts/start-all.ps1            # Starts all 4 services
./scripts/stop-local.ps1           # Stops all
./scripts/security-audit.ps1       # Security verification
```

**Ports:** Backend 4550 · Frontend 5173 · Plan HUB 8000 · Plan PT 4019

## Architecture

Monolithic REST API + React SPA with clean layered separation:

```
backend/
  routes/        → API endpoints (14+ route files, feature-based)
  middleware/     → Auth, validation, permissions, audit, file access
  services/      → Business logic (DCR, File, Audit, Notification, Watermark, SignedUrl, Revision)
  controllers/   → Auth controller
  db/            → Database init
  migrations/    → Date-versioned SQL files (YYYYMMDD_HHMM_description.sql)
  config/        → App config, storage paths
  uploads/       → File storage (original/, pdf/, staging/)
  secure_storage/ → Restricted file storage

frontend/src/
  pages/         → 35+ route pages (feature per file)
  components/    → Reusable UI (Layout, DCRStepper, PdfViewer, modals)
  contexts/      → AuthContext (user/token state, localStorage-backed)
  hooks/         → Custom React hooks
  api.ts         → Axios client with namespace exports (authAPI, dcrAPI, documentAPI…)
  utils/         → Helpers
```

**Request flow:** Route → middleware (auth → permissions → validation) → service → DB

## Conventions

- **TypeScript source + compiled JS coexist** — edit `.ts` files, never `.js` directly
- **Routes:** camelCase, feature-based (e.g., `changeRequests.ts`, `calibration.ts`)
- **Services:** `<Feature>Service` suffix (e.g., `dcrService.ts`, `fileService.ts`)
- **Middleware:** descriptive names (e.g., `auth.ts`, `permissions.ts`, `validateUpload.ts`)
- **Migrations:** `YYYYMMDD_HHMM_description.sql` in `backend/migrations/`
- **Frontend pages:** PascalCase, one component per file (e.g., `CreateDCR.tsx`, `DCRList.tsx`)
- **Frontend components:** PascalCase, reusable across pages
- **API client:** Namespace pattern — `authAPI.login()`, `dcrAPI.create()`, etc.

## Database

SQLite3 with 12+ tables. Key entities: `roles`, `users`, `Document`, `DocumentRevision`, `ChangeRequest`, `ApprovalRecord`, `AuditEvent`, `Notification`, `MsaStudy`.

- Migrations are plain SQL files run in order
- See [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) for full schema reference
- 5 roles: ADMIN, MANAGER, QMR, DOCUMENT_CONTROL, CHANGE_REQUESTER

## Security (Mandatory)

- **JWT:** Required on all protected routes via `authRequired` middleware. Secret ≥64 chars.
- **Passwords:** bcryptjs hashing only. Never store plaintext.
- **Roles:** Always uppercase, non-alphanumeric → `_`. Use `requireRole()` or `requirePermission()`.
- **File access:** Role-gated via `fileAccess` middleware. PDF-only for general users. Watermark PDFs with viewer ID.
- **Audit trail:** Every mutation (CREATE, UPDATE, DELETE, APPROVE, REJECT, DOWNLOAD) must be logged to `AuditEvent`.
- **Rate limiting:** Login endpoint limited to 10 attempts.
- **CORS:** Whitelist specific origins only.
- **Signed URLs:** Temporary tokens with expiration for secure file downloads.
- **Env vars:** `JWT_SECRET`, `JWT_EXPIRES_IN`, `REPORT_BASE_PATH`, `PLAN_API_KEY` — never hardcode secrets.

## DCR Workflow

Document Change Request (DCR) is the core workflow with 11 stages and Gate A/B approvals. Status transitions are strictly enforced.

See [DCR_WORKFLOW_GUIDE.md](../DCR_WORKFLOW_GUIDE.md) for complete workflow rules, policies, and API endpoints.

## Key Documentation

| File | Covers |
|------|--------|
| [SETUP_GUIDE.md](../SETUP_GUIDE.md) | Installation, DB init, role creation, test data, CURL examples |
| [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) | Full schema: tables, columns, constraints, indexes |
| [DCR_WORKFLOW_GUIDE.md](../DCR_WORKFLOW_GUIDE.md) | DCR policies, roles, stages, status transitions, file rules |
| [INTEGRATION_GUIDE.md](../INTEGRATION_GUIDE.md) | Architecture diagram, module descriptions, Plan HUB/PT integration |
| [TESTING_CHECKLIST.md](../TESTING_CHECKLIST.md) | Pre-deployment verification steps |

## Workspace Notes

- **`IATF/`** — Archived snapshot; do not modify. Primary development is in root `backend/` and `frontend/`.
- **`Plan HUB/`** and **`Plan PT/`** — Flask apps with API key auth (`X-API-Key` header). Proxied through Vite.
- **`Program Report Check V1/`** — Placeholder with venv only; ignore.
- **`scripts/`** — PowerShell orchestration and security audit tools.
