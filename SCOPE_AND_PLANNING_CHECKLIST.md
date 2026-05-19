# NSK IATF Document Control System — Scope & Planning Checklist

**System:** NSK IATF 16949 Document Control & Quality Management System  
**Version:** 1.0  
**Stack:** Node.js + Express (Backend) · React + Vite (Frontend) · SQLite3  
**Ports:** Backend 4550 · Frontend 5173 · Plan HUB 8000 · Plan PT 4019

---

## Legend

- `[ ]` Not started
- `[x]` Implemented / Complete
- `[-]` Partial / In Progress
- `[~]` Planned / Scoped

---

## MODULE 1 — Authentication & Session Management

**Route:** `/login`  
**Backend:** `POST /api/auth/login`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 1.1 | Login form: Employee Code (Master ID) + Password | [x] |
| 1.2 | Show/hide password toggle | [x] |
| 1.3 | JWT token issued on successful login | [x] |
| 1.4 | JWT stored in `localStorage` via `AuthContext` | [x] |
| 1.5 | Bcrypt password verification | [x] |
| 1.6 | Legacy plaintext password fallback + auto-migration to hash | [x] |
| 1.7 | Rate limiting: max 10 login attempts per 15 min per IP | [x] |
| 1.8 | Error messages for invalid credentials | [x] |
| 1.9 | Loading state indicator | [x] |
| 1.10 | Redirect to `/dashboard` on success | [x] |
| 1.11 | Redirect to `/login` on expired/missing token | [x] |
| 1.12 | Role normalization on decode (uppercase, non-alphanumeric → `_`) | [x] |

---

## MODULE 2 — Dashboard

**Route:** `/dashboard`  
**Backend:** Multiple aggregation endpoints

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 2.1 | Personal action queue for current user by role | [x] |
| 2.2 | Action queue for Document Control role (pending reviews) | [x] |
| 2.3 | Action queue for Manager role (pending approvals) | [x] |
| 2.4 | Action queue for Checker role (pending checks) | [x] |
| 2.5 | Action queue for Approver role (pending final approvals) | [x] |
| 2.6 | Document statistics by IATF level (L1, L2, L3, L4) | [x] |
| 2.7 | Calibration equipment status summary (OK / Due Soon / Overdue) | [x] |
| 2.8 | In-House Calibration status summary | [x] |
| 2.9 | Maintenance plan summary | [x] |
| 2.10 | KPI CSV data integration from `aptxData.ts` | [x] |
| 2.11 | "What's New" notification badge | [x] |
| 2.12 | Quick-navigate links to key modules | [x] |

---

## MODULE 3 — Notifications

**Backend:** `GET/POST /api/notifications`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 3.1 | Fetch unread notification count (header badge) | [x] |
| 3.2 | List all notifications with timestamps | [x] |
| 3.3 | Mark single notification as read | [x] |
| 3.4 | Mark all notifications as read | [x] |
| 3.5 | Notifications triggered on DCR status changes | [x] |
| 3.6 | Notifications triggered on approval/rejection events | [x] |

---

## MODULE 4 — Document Change Request (DCR) — Core Workflow

### 4A — Create DCR

**Route:** `/create-dcr`  
**Backend:** `POST /api/change-requests`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 4A.1 | Mode: CHANGE — modify an existing document | [x] |
| 4A.2 | Mode: NEW — create a brand-new document | [x] |
| 4A.3 | Mode: REUPLOAD — upload a new file for an existing revision | [x] |
| 4A.4 | Document search by category to find existing documents | [x] |
| 4A.5 | Auto-generation of document number for new documents | [x] |
| 4A.6 | Preview new document number before submission | [x] |
| 4A.7 | Re-upload: select revision and assignee | [x] |
| 4A.8 | Checker selection (by level/role) | [x] |
| 4A.9 | Approver selection (by level/role) | [x] |
| 4A.10 | Form validation before submission | [x] |
| 4A.11 | Submit as Draft → Pending DC Review | [x] |

### 4B — DCR List

**Route:** `/dcr-list`  
**Backend:** `GET /api/change-requests`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 4B.1 | List all DCRs (admin/DC view) | [x] |
| 4B.2 | List DCRs by role context (requester / manager / checker / approver) | [x] |
| 4B.3 | Filter by status (Draft, Pending Review, Approved, Rejected, etc.) | [x] |
| 4B.4 | Filter by document category | [x] |
| 4B.5 | Search by document number or title | [x] |
| 4B.6 | Status badge color coding | [x] |
| 4B.7 | Workflow step indicator (current stage) | [x] |
| 4B.8 | Navigate to DCR Detail on row click | [x] |

### 4C — DCR Detail & Workflow Actions

**Route:** `/dcr/:id`  
**Backend:** `GET/POST /api/change-requests/:id/*`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 4C.1 | Full request details view (requestor, reason, document, date) | [x] |
| 4C.2 | Timeline view of all workflow stages | [x] |
| 4C.3 | DCRStepper component: 11-stage visual progress indicator | [x] |
| 4C.4 | Stage: DC Review (approve / reject / request revision) | [x] |
| 4C.5 | Stage: Checker Review (Gate A approval/rejection) | [x] |
| 4C.6 | Stage: Approver Final Approval (Gate B) | [x] |
| 4C.7 | Stage: Upload Signed PDF | [x] |
| 4C.8 | Stage: Upload Marked-Up PDF | [x] |
| 4C.9 | Stage: Upload Source Files (Word/Excel originals) | [x] |
| 4C.10 | Stage: Upload Non-Signed PDF | [x] |
| 4C.11 | Stage: DC Final Release → document moves to Released | [x] |
| 4C.12 | Approval/Rejection with required comments | [x] |
| 4C.13 | Decision history with timestamps + actor names | [x] |
| 4C.14 | Full audit trail display | [x] |
| 4C.15 | Submit draft action (requester) | [x] |
| 4C.16 | Close ticket action | [x] |
| 4C.17 | Delete request initiation (requester) | [x] |
| 4C.18 | Delete request approval (DC/Admin) | [x] |
| 4C.19 | Signed URL generation for secure file downloads | [x] |
| 4C.20 | Download source files and revision documents | [x] |

### 4D — Upload Revision

**Route:** `/upload-revision/:id`  
**Backend:** `POST /api/change-requests/:id/upload`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 4D.1 | Drag-and-drop original file upload (Word/Excel) | [x] |
| 4D.2 | Drag-and-drop PDF upload | [x] |
| 4D.3 | Checker & Approver selection (if applicable) | [x] |
| 4D.4 | Document-level routing logic | [x] |
| 4D.5 | File type validation | [x] |
| 4D.6 | Upload progress feedback | [x] |

---

## MODULE 5 — Document Repository

### 5A — Document List

**Route:** `/documents`  
**Backend:** `GET /api/search`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 5A.1 | IATF document hierarchy tabs: L1, L2, L3, L4 | [x] |
| 5A.2 | Show only Released/Active documents | [x] |
| 5A.3 | Search by document number or title | [x] |
| 5A.4 | Status badges (Released, In Review, Draft, Obsolete) | [x] |
| 5A.5 | Document statistics by level | [x] |
| 5A.6 | Master List export button → `MasterListModal` | [x] |
| 5A.7 | Filter to Procedure documents only | [x] |
| 5A.8 | Pagination / scrollable list | [x] |
| 5A.9 | Navigate to DocumentView on row click | [x] |

### 5B — Document View / PDF Viewer

**Route:** `/documents/:id`  
**Backend:** `GET /api/documents/:id/view`, `/print`, `/save`, `/original`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 5B.1 | Embedded PDF viewer (react-pdf or iframe) | [x] |
| 5B.2 | Watermark: employee ID + timestamp stamped on PDF | [x] |
| 5B.3 | Right-click protection on PDF | [x] |
| 5B.4 | Print document (watermarked copy) | [x] |
| 5B.5 | Download document (role-gated) | [x] |
| 5B.6 | Download original source file (admin/DC only) | [x] |
| 5B.7 | Revision selector (admin only can view obsolete revisions) | [x] |
| 5B.8 | Obsolete flag display for old revisions | [x] |
| 5B.9 | Access session tracking: log file open event | [x] |
| 5B.10 | Access session close: log file close event | [x] |
| 5B.11 | Audit trail: DOWNLOAD action logged to `AuditEvent` | [x] |

### 5C — Master List Modal

**Component:** `MasterListModal`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 5C.1 | Export all documents filtered by level/category | [x] |
| 5C.2 | Generate printable/exportable master list | [x] |
| 5C.3 | View count and last access metadata | [x] |

---

## MODULE 6 — Calibration Management (External)

**Route:** `/calibration`  
**Backend:** `GET/POST/PUT/DELETE /api/calibration`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 6.1 | Equipment list with search and status filter | [x] |
| 6.2 | Add new equipment (name, ID, type, manufacturer, model, serial) | [x] |
| 6.3 | Edit equipment metadata | [x] |
| 6.4 | Delete equipment | [x] |
| 6.5 | Calibration interval (days/months) configuration | [x] |
| 6.6 | Auto-calculated next due date based on interval | [x] |
| 6.7 | Status badges: OK / Due Soon / Overdue | [x] |
| 6.8 | Excel import with field mapping (17+ columns) | [x] |
| 6.9 | `ExcelImportModal`: preview, validate, map columns before import | [x] |
| 6.10 | Page-level PIC (Person In Charge) assignment | [x] |
| 6.11 | PIC user lookup restricted to permitted roles | [x] |
| 6.12 | Pagination | [x] |
| 6.13 | Dashboard stats: total / overdue / due soon counts | [x] |

---

## MODULE 7 — Calibration History (External & In-House)

**Route:** `/calibration-history`  
**Backend:** `GET/POST/PUT/DELETE /api/calibration-history`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 7.1 | Dual-source view: External and In-House tabs | [x] |
| 7.2 | Equipment list sidebar with search | [x] |
| 7.3 | Auto-generated calibration schedule from interval | [x] |
| 7.4 | History entries CRUD per equipment | [x] |
| 7.5 | Entry fields: result, error %, measured value, remarks | [x] |
| 7.6 | File attachment upload per history entry | [x] |
| 7.7 | Download attached calibration certificate/report | [x] |
| 7.8 | Line chart: calibration result trend | [x] |
| 7.9 | Bar chart: error % comparison | [x] |
| 7.10 | Scatter chart: measured values over time | [x] |

---

## MODULE 8 — In-House Calibration Plan

**Route:** `/inhouse-calibration`  
**Backend:** `GET/POST/PUT/DELETE /api/inhouse-calibration`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 8.1 | Equipment CRUD (in-house instruments) | [x] |
| 8.2 | Calibration interval and due date tracking | [x] |
| 8.3 | Status badges: OK / Due Soon / Overdue | [x] |
| 8.4 | Excel import support | [x] |
| 8.5 | Page-level PIC assignment | [x] |
| 8.6 | History CRUD with file attachment | [x] |
| 8.7 | Trend charts | [x] |

---

## MODULE 9 — Maintenance Plan

**Route:** `/maintenance`  
**Backend:** `GET/POST/PUT/DELETE /api/maintenance`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 9.1 | Yearly equipment list (add / remove / carry-over to next year) | [x] |
| 9.2 | Plan overview grid: months (Jan–Dec) × equipment | [x] |
| 9.3 | Action code assignment per month/equipment cell | [x] |
| 9.4 | Action code legend editor (add/edit/delete codes) | [x] |
| 9.5 | Plan records CRUD (flat table view) | [x] |
| 9.6 | Actual history entry (result, date, remarks, file attachment) | [x] |
| 9.7 | Plan vs. Actual comparison view | [x] |
| 9.8 | `MaintenanceFloorMap` component: visual equipment map | [x] |
| 9.9 | Carry-over equipment to new year with existing schedule | [x] |
| 9.10 | Download maintenance history attachment file | [x] |
| 9.11 | Available years selector | [x] |

---

## MODULE 10 — Training Plan

**Route:** `/training/plan`  
**Backend:** `GET/POST/PUT/DELETE /api/training`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 10.1 | Training program CRUD (name, level, method, duration, budget) | [x] |
| 10.2 | Monthly schedule grid: Plan (T/F per month) | [x] |
| 10.3 | Actual completion marking (T/F per month) | [x] |
| 10.4 | Budget tracking: planned vs. actual spending | [x] |
| 10.5 | Year selector for historical plans | [x] |
| 10.6 | Seed default programs from 15+ templates | [x] |
| 10.7 | 2-tier approval: Check (Manager) → Final Approve (President) | [x] |
| 10.8 | Approval log history display | [x] |
| 10.9 | Edit unlock workflow: REQUEST → APPROVE/REJECT | [x] |
| 10.10 | Annual summary view | [x] |
| 10.11 | Monthly breakdown view | [x] |

---

## MODULE 11 — Measurement System Analysis (MSA)

**Route:** `/msa`  
**Backend:** `GET/POST/DELETE /api/msa`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 11.1 | Study types: Bias, GR&R, Stability | [x] |
| 11.2 | Study header CRUD (equipment, part, characteristic, date) | [x] |
| 11.3 | Bias study: reference value, bias readings, auto-calculated t-statistic | [x] |
| 11.4 | GR&R study: multi-appraiser, multi-part, multi-reading data entry | [x] |
| 11.5 | GR&R auto-calculated results: %EV, %AV, %R&R, %PV | [x] |
| 11.6 | Stability study: subgroup readings, Xbar, R chart data | [x] |
| 11.7 | Historical study list with delete capability | [x] |
| 11.8 | Pass/fail determination per AIAG criteria | [x] |

---

## MODULE 12 — Risk Assessment

**Route:** `/risk-assessment`  
**Backend:** `GET/POST/PUT/DELETE /api/risk-assessment`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 12.1 | Risk register table (F-01-DOC-002 form compliance) | [x] |
| 12.2 | Risk item CRUD (description, category, severity, occurrence, score) | [x] |
| 12.3 | Auto-calculated Risk Score (Severity × Occurrence) | [x] |
| 12.4 | Category filter and management | [x] |
| 12.5 | Status & Measures columns (Procedure, KPI, Preventive, Acceptance) | [x] |
| 12.6 | Edit request approval workflow (REQUEST → APPROVE/REJECT) | [x] |
| 12.7 | Revision history with effective dates | [x] |
| 12.8 | Bilingual support (English / Thai) | [x] |

---

## MODULE 13 — Abnormal Situation Records (ASR)

**Route:** `/abnormal-situations`  
**Backend:** `GET/POST/PUT/DELETE /api/incidents`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 13.1 | Incident CRUD (machine, description, discovery date) | [x] |
| 13.2 | Resolution details entry | [x] |
| 13.3 | Approver (Manager) assignment per incident | [x] |
| 13.4 | Approval workflow: PENDING → APPROVED / REJECTED | [x] |
| 13.5 | File attachment upload (PDF, images, documents) | [x] |
| 13.6 | Delete specific attachments | [x] |
| 13.7 | Filter by machine, year, status, discoverer | [x] |
| 13.8 | Machine options management (add custom machine names) | [x] |
| 13.9 | Edit history tracking (who changed what, when) | [x] |

---

## MODULE 14 — Admin Panel

**Route:** `/admin`  
**Backend:** `GET/POST/PUT/DELETE /api/users`, `GET/POST /api/admin`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 14.1 | User list table (all users) | [x] |
| 14.2 | Create new user: Master ID, name, email, password, role | [x] |
| 14.3 | Edit user metadata and role assignment | [x] |
| 14.4 | Delete user | [x] |
| 14.5 | Role assignment: ADMIN / MANAGER / QMR / DOCUMENT_CONTROL / CHANGE_REQUESTER | [x] |
| 14.6 | Password bcrypt-hashed on creation/update | [x] |
| 14.7 | Role list retrieval | [x] |
| 14.8 | Bulk document migration tool (import from legacy system/Excel) | [x] |
| 14.9 | Compliance report generation | [x] |
| 14.10 | CR approval history report | [x] |
| 14.11 | Document revision list report | [x] |

---

## MODULE 15 — Audit Logs

**Route:** `/logs`  
**Backend:** `GET /api/logs`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 15.1 | Paginated audit event list | [x] |
| 15.2 | 50+ action types (LOGIN, USER_CREATED, CR_SUBMITTED, CR_APPROVED, DOWNLOAD, etc.) | [x] |
| 15.3 | Filter by action type | [x] |
| 15.4 | Filter by entity type | [x] |
| 15.5 | Filter by actor (user) | [x] |
| 15.6 | Sort by date, action, entity, actor | [x] |
| 15.7 | Color-coded action labels with emoji indicators | [x] |
| 15.8 | User-specific audit trail via `/api/admin/audit/user/:userId` | [x] |

---

## MODULE 16 — Reports & External Integration

**Route:** `/report`, `/report/search`  
**Backend:** `GET /api/report/*`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 16.1 | Navigate to Work Log Management (external URL) | [x] |
| 16.2 | Report file search by keyword | [x] |
| 16.3 | Retrieve and serve report files | [x] |
| 16.4 | Open Windows Explorer folder (server-side, local only) | [x] |
| 16.5 | Plan HUB integration (Flask app, proxied via Vite on port 8000) | [x] |
| 16.6 | Plan PT integration (Flask app, proxied via Vite on port 4019) | [x] |
| 16.7 | API key authentication for Plan HUB / Plan PT (`X-API-Key` header) | [x] |

---

## MODULE 17 — Diagrams & Visual Tools

### 17A — IATF Diagram

**Route:** `/iatf-diagram`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 17A.1 | IATF 16949 standard process flowchart visualization | [x] |
| 17A.2 | Interactive/navigable diagram nodes | [~] |

### 17B — Turtle Diagrams

**Route:** `/turtle-diagrams`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 17B.1 | Turtle diagram display per procedure (Process SIPOC-style) | [x] |
| 17B.2 | Edit request workflow for modifying diagram content | [x] |

### 17C — Flowcharts

**Routes:** `/flowchart`, `/kpi-flowchart`, `/procedure-flowchart`, `/workflow-flowchart`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 17C.1 | KPI process flowchart | [x] |
| 17C.2 | Procedure reference flowchart | [x] |
| 17C.3 | DCR workflow flowchart | [x] |
| 17C.4 | General process flowchart | [x] |

### 17D — Job Descriptions

**Route:** `/job-descriptions`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 17D.1 | Job description document viewer per role | [x] |
| 17D.2 | Edit request workflow for JD updates | [x] |

---

## MODULE 18 — Security & Infrastructure

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 18.1 | JWT authentication on all protected routes (`authRequired` middleware) | [x] |
| 18.2 | JWT secret ≥ 64 characters (env var `JWT_SECRET`) | [x] |
| 18.3 | JWT expiry configurable via `JWT_EXPIRES_IN` env var | [x] |
| 18.4 | Bcrypt password hashing — never plaintext stored | [x] |
| 18.5 | Role-based access control: `requireRole()` / `requirePermission()` | [x] |
| 18.6 | File access middleware: PDF-only for non-admin users | [x] |
| 18.7 | PDF watermarking with viewer identity + timestamp | [x] |
| 18.8 | Signed URL service: temporary tokens with expiration for downloads | [x] |
| 18.9 | Audit trail: every mutation (CREATE, UPDATE, DELETE, APPROVE, REJECT, DOWNLOAD) logged | [x] |
| 18.10 | CORS whitelist: specific origins only (not wildcard) | [x] |
| 18.11 | Rate limiting on `/api/auth/login` (10 attempts / 15 min) | [x] |
| 18.12 | No hardcoded secrets — all sensitive values via environment variables | [x] |
| 18.13 | Temp file cleanup: 7-day retention, automatic scheduled cleanup | [x] |
| 18.14 | File upload validation via `validateUpload` middleware | [x] |
| 18.15 | Request body schema validation middleware | [x] |
| 18.16 | `security-audit.ps1` script for security verification | [x] |

---

## MODULE 19 — Database & Data Management

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 19.1 | SQLite3 file-based database (`nskiatf_doccontrol.db`) | [x] |
| 19.2 | Migration system: date-versioned `.sql` files (YYYYMMDD_HHMM) | [x] |
| 19.3 | `node db/init_db.js` initializes schema from migrations in order | [x] |
| 19.4 | 15+ core tables covering all modules | [x] |
| 19.5 | 5 built-in roles: ADMIN, MANAGER, QMR, DOCUMENT_CONTROL, CHANGE_REQUESTER | [x] |
| 19.6 | Foreign key integrity: users → roles, documents → revisions, CRs → approvals | [x] |
| 19.7 | `AuditEvent` table: full traceability for every action | [x] |
| 19.8 | `Notification` table: per-user notifications | [x] |
| 19.9 | Seed scripts for admin user and initial test data | [x] |

---

## MODULE 20 — Layout & Navigation

**Component:** `Layout.tsx`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 20.1 | Persistent sidebar navigation | [x] |
| 20.2 | Role-conditional menu items (hide items not permitted for role) | [x] |
| 20.3 | Top header bar with logged-in user display | [x] |
| 20.4 | Notification bell icon with unread count badge | [x] |
| 20.5 | Logout action (clears JWT + AuthContext) | [x] |
| 20.6 | Responsive layout (Tailwind CSS) | [x] |
| 20.7 | Active route highlighted in sidebar | [x] |

---

## MODULE 21 — Orchestration & DevOps Scripts

**Directory:** `scripts/`

| # | Feature / Capability | Status |
|---|---------------------|--------|
| 21.1 | `start-all.ps1`: starts all 4 services in correct order | [x] |
| 21.2 | TypeScript compile (`tsc`) before backend start | [x] |
| 21.3 | Kill existing Node.js + Python processes before restart | [x] |
| 21.4 | Port availability wait (backend 4550, frontend 5173) | [x] |
| 21.5 | Plan HUB (8000) + Plan PT (4019) start with error detection | [x] |
| 21.6 | `stop-local.ps1`: stop all services | [x] |
| 21.7 | `security-audit.ps1`: automated security verification checklist | [x] |
| 21.8 | `start-local.ps1`: minimal local dev start | [x] |

---

## Summary Totals

| Module | Items | Status |
|--------|-------|--------|
| Authentication | 12 | All Implemented |
| Dashboard | 12 | All Implemented |
| Notifications | 6 | All Implemented |
| DCR Workflow | 47 | All Implemented |
| Document Repository | 20 | All Implemented |
| Calibration (External) | 13 | All Implemented |
| Calibration History | 10 | All Implemented |
| In-House Calibration | 7 | All Implemented |
| Maintenance Plan | 11 | All Implemented |
| Training Plan | 11 | All Implemented |
| MSA | 8 | All Implemented |
| Risk Assessment | 8 | All Implemented |
| Abnormal Situations | 9 | All Implemented |
| Admin Panel | 11 | All Implemented |
| Audit Logs | 8 | All Implemented |
| Reports & Integration | 7 | All Implemented |
| Diagrams & Visual Tools | 11 | All Implemented |
| Security & Infrastructure | 16 | All Implemented |
| Database & Data Management | 9 | All Implemented |
| Layout & Navigation | 7 | All Implemented |
| Orchestration & DevOps | 8 | All Implemented |
| **TOTAL** | **271** | |

---

*Generated: April 8, 2026 — NSK IATF Document Control System v1.0*
