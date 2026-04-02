# NSK IATF 16949 – Complete Page Outlines & Feature Report

> **System:** NSK APTC IATF 16949 Document Control & Change Management System  
> **Frontend:** React 19 + Vite 7 + Tailwind CSS 3.4 (port 5173)  
> **Backend:** Node.js + Express v5 + TypeScript + SQLite3 (port 4550)  
> **Generated:** 2026-03-30  
> **Branch:** `2026/03/30-Modification`

---

## Table of Contents

| # | Page | Route | Role Access |
|---|------|-------|-------------|
| 1 | [Login](#1-login) | `/login` | Public |
| 2 | [Dashboard](#2-dashboard) | `/` | All |
| 3 | [Document Repository](#3-document-repository) | `/documents` | All |
| 4 | [Document View](#4-document-view) | `/documents/:id` | All |
| 5 | [DCR List](#5-dcr-list) | `/dcr` | All |
| 6 | [Create DCR](#6-create-dcr) | `/dcr/create` | All / DC |
| 7 | [DCR Detail](#7-dcr-detail) | `/dcr/:id` | Role-contextual |
| 8 | [Upload Revision](#8-upload-revision) | `/dcr/:id/upload` | Requester |
| 9 | [Workflow Flowchart](#9-workflow-flowchart) | `/flowchart` | All |
| 10 | [KPI Flowchart](#10-kpi-flowchart) | `/flowchart/kpi` | All |
| 11 | [Procedure Flowchart](#11-procedure-flowchart) | `/flowchart/procedure` | All |
| 12 | [Plan Hub](#12-plan-hub) | `/plan` | All |
| 13 | [Training Plan](#13-training-plan) | `/plan/training` | All / Approvers |
| 14 | [Calibration Plan](#14-calibration-plan) | `/plan/calibration` | All / DC |
| 15 | [In-House Calibration Plan](#15-in-house-calibration-plan) | `/plan/inhouse-calibration` | All / DC |
| 16 | [Calibration History](#16-calibration-history) | `/plan/calibration/history` | All |
| 17 | [Maintenance Plan](#17-maintenance-plan) | `/plan/maintenance` | All / DC |
| 18 | [Maintenance History](#18-maintenance-history) | `/plan/maintenance/history` | All |
| 19 | [Power Transmission Plan](#19-power-transmission-plan) | `/plan/power-transmission` | All |
| 20 | [Report Hub](#20-report-hub) | `/report` | All |
| 21 | [Report Search (APTX)](#21-report-search-aptx) | `/report/aptx` | All |
| 22 | [Quality Hub](#22-quality-hub) | `/quality` | All |
| 23 | [MSA](#23-msa-measurement-system-analysis) | `/quality/msa` | All |
| 24 | [Safety / Risk Assessment](#24-safety--risk-assessment) | `/safety` | All |
| 25 | [Admin](#25-admin) | `/admin` | Admin only |
| 26 | [Admin – Migrate](#26-admin--migrate) | `/admin/migrate` | Admin only |
| 27 | [Logs](#27-logs) | `/logs` | Admin / DC |

---

## 1. Login

**Route:** `/login`  
**Access:** Public (unauthenticated users only; authenticated users are redirected to Dashboard)  
**File:** `frontend/src/pages/Login.tsx`

### What you can do
- Enter **Employee Code** and **Password** to authenticate.
- Toggle password visibility (show/hide).
- View login error messages (wrong credentials, account inactive, etc.).
- Automatically redirected to `/dashboard` upon successful login.

### UI Elements
- NSK branded split layout (left: branding panel with feature list; right: login card).
- Animated gradient background.
- "NSK APTC : IATF 16949" system name displayed.

---

## 2. Dashboard

**Route:** `/` (also `/dashboard` redirects here)  
**Access:** All authenticated users  
**File:** `frontend/src/pages/Dashboard.tsx`

### What you can do
- **My Tickets panel** — view your own open/closed DCR tickets with live status badges.
  - Filter by: All / Open / Finished.
  - Click a ticket row to navigate directly to DCR Detail.
- **Action Required panel** (for DC / Manager / Checker / Approver / Admin roles) — see all tickets that require your action at each approval gate.
- **Document Statistics** — total released documents broken down by IATF Level (L1–L4).
- **Quick navigation cards** — one-click links to: Document Repository, DCR List, Flowcharts, Plans (Calibration, Maintenance, Training), Quality, Safety.
- **What's New badge** — pulsing badge on New items (documents/tickets) that you haven't seen yet; opens a "What's New" drawer.
- **Mark as seen** — items automatically marked seen when you visit them.

### Role Differences
| Role | Extra Action Panels |
|------|---------------------|
| Document Control | "Pending DC Review" + "Pending Final DC Release" queues |
| Manager / QMR | "Pending Approver" queue |
| Assistant Manager | "Pending Checker" queue |
| President | "Pending Approver" queue |
| Admin | All queues |

---

## 3. Document Repository

**Route:** `/documents`  
**Access:** All authenticated users  
**File:** `frontend/src/pages/DocumentRepository.tsx`

### What you can do
- **Browse all released documents** organized by IATF 16949 document level.
- **Filter by level tab:** All Documents | L1: Quality Manual | L2: Procedure | L3: WI/Support/Outside/Ops Std. | L4: Form/Report.
- **Search** by document title or document number.
- **View document card** showing: doc number, title, level badge, revision, category, last updated date, and change request activity indicator.
- **Click any document** to open the full Document View page (`/documents/:id`).
- **Open Master List modal** — download or view the full controlled document master list.
- **New badge** — unread documents since your last visit are flagged with a "NEW" badge.
- **Toggle view** — list or grid layout.

---

## 4. Document View

**Route:** `/documents/:id`  
**Access:** All authenticated users (role-gated: some revisions restricted to DC/Admin)  
**File:** `frontend/src/pages/DocumentView.tsx`

### What you can do
- **Inline PDF viewer** — view the controlled PDF copy of the selected document directly in the browser without downloading.
- **Revision selector** — if you are DC or Admin, you can switch between all historical revisions of a document. Regular users see only the current released revision.
- **Print** — open a print-friendly view of the current PDF.
- **Download** — download the PDF to your local machine (access is logged).
- **Obsolete revision warning** — a warning banner is shown if you are viewing an older (superseded) revision.
- **View document metadata:** doc number, title, document level, current revision, approved date, responsible department.
- **Audit trail:** the system automatically logs every time a user opens or closes the document view (access session tracking).

---

## 5. DCR List

**Route:** `/dcr`  
**Access:** All authenticated users  
**File:** `frontend/src/pages/DCRList.tsx`

### What you can do
- **View all DCR tickets** relevant to your role (requester view shows your own tickets; DC/Admin/Manager see all).
- **Filter by category** (All, L1, L2, L3, L4, by document type) and **search** by title or document number.
- **Filter by role context** via URL query parameters (e.g. `?role=checker` or `?status=pending`).
- **New badge** — DCR tickets with recent activity you haven't viewed are flagged.
- **Click any row** to navigate to the full DCR Detail page.
- **Create New DCR** button — shortcut to `/dcr/create`.
- **View history drawer** — click a history icon on a ticket to see a summary of its status journey without leaving the list.

---

## 6. Create DCR

**Route:** `/dcr/create`  
**Access:** All users (mode adapts by role)  
**File:** `frontend/src/pages/CreateDCR.tsx`

### What you can do
Three creation modes (selected by tab):

#### CHANGE REQUEST (default for non-DC users)
- Select an existing released document from the dropdown.
- Enter the **reason for change**.
- Submit a change request ticket — DC is notified for review.

#### NEW DOCUMENT (available to all users)
- Select a **category** (existing catalog or type a new one).
- Enter **sub-category** and **document name**.
- System auto-generates a **document number** and assigns the **IATF level** based on category.
- Preview the generated doc number before submitting.
- Submit — ticket is created in Draft status and sent to DC for review.

#### RE-UPLOAD (default for Document Control role)
- Search for an existing released document by doc number.
- Select the specific **revision** to re-upload.
- Assign a **requester** (the person who will upload the revised files).
- Submit — skips DC Review gate; goes directly to Revision step.

---

## 7. DCR Detail

**Route:** `/dcr/:id`  
**Access:** Role-contextual (each role sees different action buttons)  
**File:** `frontend/src/pages/DCRDetail.tsx`

### What you can do
- **View full DCR ticket details:** request type, document info, requester, status, reason, timestamps.
- **Approval stepper** (DCRStepper component) — visual progress bar showing all workflow stages with completion status.
- **Timeline tab** — full chronological history of every approval/rejection action taken on this ticket.
- **Take action** (role-gated):
  - **Document Control:** Approve (proceed) or Reject (close ticket) at DC Review gate; at Final DC Release gate, approve to publish or reject back to revision.
  - **Checker:** Approve or Reject (return to Revision) at the Checker gate; can optionally attach a Signed PDF or Marked PDF as review evidence.
  - **Approver:** Approve or Reject (return to Revision) at the Approver gate; can optionally attach a Signed PDF.
  - **Requester (DC-only flow):** Upload Non-Signed PDF for Form-type documents after Approver approval.
- **Upload files inline** — drag-and-drop or click-to-browse for Signed PDF, Marked PDF, source file.
- **Download original files** — download the Word/Excel source or the current PDF from within the ticket.
- **Admin/DC delete** — request deletion of a ticket with a mandatory reason field. DC can directly approve deletion.
- **Rejection comments** — all decision actions require a comment when rejecting.

---

## 8. Upload Revision

**Route:** `/dcr/:id/upload`  
**Access:** Requester (the person assigned to the ticket)  
**File:** `frontend/src/pages/UploadRevision.tsx`

### What you can do
- **Upload the revised Word/Excel source file** (Word `.doc`/`.docx` or Excel `.xls`/`.xlsx`).
- **Upload the corresponding PDF** (the controlled copy generated from the source).
- **Drag-and-drop** upload areas for both files.
- **Select a Checker** from a dropdown of eligible checker-role users.
- **Select an Approver** from a dropdown of eligible approver-role users.
- For **Re-upload** tickets, the system displays pre-filled document info (no Checker/Approver selection needed as they may be pre-assigned).
- **Document level display** — shown to confirm which IATF level the document belongs to.
- Submit to advance the ticket to the Checker review stage.

---

## 9. Workflow Flowchart

**Route:** `/flowchart` and `/flowchart/workflow`  
**Access:** All authenticated users  
**File:** `frontend/src/pages/WorkflowFlowchart.tsx`

### What you can do
- **View three DCR workflows** via tabs:
  1. **New Document** — full flow from Requester → DC Review → Revision → Checker → Approver → (Non-Signed PDF) → Final DC Release → Released → Stored in DB.
  2. **Change Request** — same as New Document but includes a "Send Original File" step after DC Review.
  3. **Re-upload** — abbreviated flow starting from Revision (no DC Review gate).
- **Interactive nodes** — click any step node to open a **detail popup** showing:
  - Who holds that role.
  - Responsibilities.
  - Pre-step checklist.
  - System security controls.
- **Status Flow strip** — color-coded legend of all DCR ticket statuses in order.
- **Shape Legend** — key for: Start, Process, Decision, Released, Rejected, Stored in DB shapes.
- **Document Level reference** — table of IATF Level 1–4 definitions.
- **Key Notes** — rule summaries (e.g. "DC Review rejection permanently closes the ticket").
- **Zoom** — diagram is rendered at 85% scale with horizontal scroll for wide screens.
- **Reject-back loop arrows** — dashed red arrows show which decision nodes loop back to the Revision step.

---

## 10. KPI Flowchart

**Route:** `/flowchart/kpi`  
**Access:** All authenticated users  
**File:** `frontend/src/pages/KPIFlowchart.tsx`

### What you can do
- **Auto-extract KPI data** from Level 4 documents in the Document Repository (Excel-based KPI reports).
- **View KPI cards:** each shows Metric name, Target, Actual, and Achievement Rate %.
- **Color-coded status:** Green (≥ target), Red (below target), with icons.
- **Trend chart** — for each KPI, display a trend line chart over months.
- **Reference links** — click through to the source document in the Document Repository.
- **Refresh** — manually reload KPI data from documents.
- Handles cases where no KPI documents are found gracefully (empty state message).

---

## 11. Procedure Flowchart

**Route:** `/flowchart/procedure`  
**Access:** All authenticated users  
**File:** `frontend/src/pages/ProcedureFlowchart.tsx`

### What you can do
- **View an editable terminology/abbreviation table** — inline editable rows for terms (DCR, QMR, etc.) with columns for DC / Manager / Owner review status.
- **Add rows** to the abbreviation/terminology table.
- **Show/hide Procedure References panel** — a collapsible section that:
  - Lists all Level 2 Procedure documents from the Document Repository.
  - Shows the last approved date of each.
  - Click a document link to open its Document View.
- **Mark as Reviewed** — stamp a "last reviewed at" timestamp (stored in `localStorage`) to track when the procedure references were last verified.
- **Refresh** — reload procedure documents from the backend.
- **Review status indicator** — shows when the references were last reviewed vs. when the latest document was updated (flags if a document was updated after the last review).

---

## 12. Plan Hub

**Route:** `/plan`  
**Access:** All authenticated users  
**File:** `frontend/src/pages/Plan.tsx`

### What you can do
- **Navigate launch cards** for all planning modules:
  - **HUB Equipment Plan** — external link to Flask app (port 8000).
  - **Powertrain Equipment Plan** — external link to Flask app (port 4019).
  - **Calibration Plan** → `/plan/calibration` (with IATF 7.1.5 badge).
  - **In-House Calibration Plan** → `/plan/inhouse-calibration`.
  - **Maintenance Planning** → `/plan/maintenance`.
  - **Training Plan** → `/plan/training`.
- **History shortcut buttons** on calibration and in-house calibration cards → jump directly to history pages.
- Visual icons and emoji artwork per module for quick recognition.

---

## 13. Training Plan

**Route:** `/plan/training`  
**Access:** All users; approval actions role-gated  
**File:** `frontend/src/pages/TrainingPlan.tsx`

### What you can do
- **View annual training programs** in a spreadsheet-style grid (rows = programs, columns = months).
- **Year selector** — switch between years.
- **Add training program** (only when plan is editable):
  - Training name, method code, method name, duration (hours), budget (plan/actual), trainer type (internal/external), remark.
  - Check employee level applicability (Level 1–4).
  - Set planned months and actual completion months.
- **Edit / delete** individual training program rows (when plan unlocked).
- **Drag to reorder** rows by sort order.
- **Upload Excel** — bulk import training programs from an Excel template.
- **Download Excel** — export the full training plan to Excel.
- **Approval workflow** (multi-stage):
  - **Submit for Check** (Requester/DC) → status: `Pending Check`.
  - **Checker approves or rejects** → status: `Pending Approval` or back to `Draft`.
  - **Approver approves or rejects** → status: `Approved` or `Rejected`.
- **Approved plans are locked** — no edits after approval.
- **Request to Unlock / Edit** — approved plans can be unlocked via a request with a reason; DC/Admin reviews and approves/rejects unlock requests.
- **Approval status banner** — displays current approval state with reviewer details and timestamps.

---

## 14. Calibration Plan

**Route:** `/plan/calibration`  
**Access:** All users; add/edit/delete gated for DC/Admin  
**File:** `frontend/src/pages/CalibrationPlan.tsx`

### What you can do

#### View
- **Default: Calendar view** — monthly visual calendar showing equipment calibration due dates as colored event chips. Navigate forward/backward by month. Color-coded by status (OK / Due Soon / Overdue).
- **Switch to Table view** — sortable tabular list of all calibration equipment.
- **Status summary bar** — count of OK / Due Soon / Overdue equipment at a glance.
- **Search** by equipment name, ID, or serial number.

#### Equipment CRUD (DC / Admin only)
- **Add equipment** via modal form with fields: Equipment Name, ID, Type, Manufacturer, Model, Serial Number, Location, Calibration Method, Interval, Calibrated By, Acceptance Criteria, Last Calibration Date, Certificate Number, Status, Notes.
- **Edit** existing equipment details.
- **Delete** equipment with confirmation.

#### Bulk Import
- **Import from Excel** — upload an Excel file; the system maps columns to fields, previews the data, and bulk-inserts equipment records.

#### Assign Person-in-Charge (PIC)
- Assign a registered user as PIC for the entire calibration plan page.
- PIC is shown in the header with their employee code.
- Remove PIC assignment.

#### Navigation
- **History button** in the header toolbar → navigate to `/plan/calibration/history`.

---

## 15. In-House Calibration Plan

**Route:** `/plan/inhouse-calibration`  
**Access:** All users; add/edit/delete gated for DC/Admin  
**File:** `frontend/src/pages/InHouseCalibrationPlan.tsx`

### What you can do
- Identical feature set to [Calibration Plan](#14-calibration-plan), but specifically for **in-house calibration instruments** managed on-site.
- **Default: Calendar view** (same month navigation and color coding).
- **Import from Excel** for bulk in-house equipment setup.
- **PIC assignment** for the in-house calibration plan page.
- **History button** in header → navigate to `/plan/inhouse-calibration/history`.
- Uses teal color theme (as opposed to indigo for external calibration).

---

## 16. Calibration History

**Route:** `/plan/calibration/history` and `/plan/inhouse-calibration/history`  
**Access:** All authenticated users  
**File:** `frontend/src/pages/CalibrationHistory.tsx`

### What you can do
- **Left panel — Equipment list:**
  - Shows all calibration equipment (external or in-house depending on entry route).
  - Color-coded calibration status badge per equipment.
  - Search/filter equipment by name or ID.
  - Click equipment to load its full history on the right.
- **Right panel — Equipment history detail:**
  - **Equipment metadata** summary card (interval, next due date, last cal date, certificate number, calibrated by).
  - **History table** — auto-generated schedule rows based on calibration interval; each row has: Date, Result (Pass/Fail/etc.), Error %, Measured Value, Remark.
  - **Add history record** — fill in a scheduled row's results (date, result, error %, measured value, remark).
  - **Edit** existing history record.
  - **Delete** history record.
  - **Download** history as Excel export.
  - **Upload** history from Excel.
  - **Charts (3 types):**
    - **Line chart** — measured value trend over time.
    - **Bar chart** — error % per calibration session.
    - **Scatter chart** — calibration results plotted.
  - **Chart tabs** — switch between Line / Bar / Scatter view.
  - Back button → return to Calibration Plan page.

---

## 17. Maintenance Plan

**Route:** `/plan/maintenance`  
**Access:** All users; CRUD gated for DC/Admin  
**File:** `frontend/src/pages/MaintenancePlan.tsx`

### What you can do

Three tab views:

#### Overview (Default)
- **Excel-style grid** — rows are equipment, columns are Jan–Dec, cells show the planned action code for each month.
- **Year selector** — view the plan for any year.
- **Color-coded cells** — shows whether maintenance is planned, completed, or missed based on history data.
- **Click a cell** to open the plan event editor (add/edit action code and notes for that month).
- Export grid data.

#### Plan Records
- **Flat CRUD table** of all plan events.
- **Add plan event** — specify equipment, year, month, action code, notes.
- **Edit / delete** plan events.
- **Add equipment** to the master equipment list (equipment number, name, year).
- **Manage action codes** — add / edit / delete maintenance action codes with descriptions and frequency labels.
- **Attach files** to plan events.
- **Lock/unlock** plan events to prevent accidental changes.

#### Floormap
- **Visual equipment floormap** (uses `MaintenanceFloorMap` component).
- Drag equipment icons onto a floor plan image.
- View equipment positions spatially.
- Click an equipment icon on the map to see its maintenance schedule status.

#### Navigation
- **History button** in the toolbar → navigate to `/plan/maintenance/history`.

---

## 18. Maintenance History

**Route:** `/plan/maintenance/history`  
**Access:** All authenticated users  
**File:** `frontend/src/pages/MaintenanceHistory.tsx`

### What you can do
- **Left panel — Equipment list:**
  - All maintenance equipment with their last maintenance result and status.
  - Search/filter by name.
  - Click to load history.
- **Right panel — History detail:**
  - **Equipment metadata** card (equipment number, name, year, location, notes).
  - **History table** — records of each maintenance event: Year, Month, Day, Action Code, Result.
  - **Add history record** — log a completed maintenance event with date, action code, result, notes.
  - **Edit / delete** history records.
  - **Attach files** (photo evidence, maintenance reports) per history record.
  - **Download** history as Excel.
  - **Charts:**
    - **Bar chart** — maintenance results by month.
    - **Line chart** — maintenance trend over time.
  - **Chart / list toggle** — switch between chart view and table view.

---

## 19. Power Transmission Plan

**Route:** `/plan/power-transmission`  
**Access:** All authenticated users  
**File:** `frontend/src/pages/PowerTransmissionPlan.tsx`

### Current State
- **Placeholder / Coming Soon** page.
- Displays module title: "Test Equipment Planning — Powertrain".
- Shows a "Module Coming Soon" card with description of planned scope.
- No interactive functionality yet.

> **Planned scope:** Test equipment planning, scheduling, and tracking for the Powertrain product line.

---

## 20. Report Hub

**Route:** `/report`  
**Access:** All authenticated users  
**File:** `frontend/src/pages/Report.tsx`

### What you can do
- **Navigate to external/internal reports** via launch cards:
  - **Work Log Management** — opens the external Work Log Management system at `aptc150-096.asia.ad.nsk.com/signin.php` in a new browser tab.
  - **Report (APTX)** — navigates to the internal APTX Report Search page at `/report/aptx`.
- Simple hub-style card layout with icons and descriptions.

---

## 21. Report Search (APTX)

**Route:** `/report/aptx`  
**Access:** All authenticated users  
**File:** `frontend/src/pages/ReportSearch.tsx`

### What you can do
- **Search APTX reports** by keyword (minimum 6 characters).
- **Inline PDF preview** — the found report is immediately displayed in a full-height PDF iframe (82vh).
- **Two report types** found simultaneously:
  - **Standard report** — the standard measurement result.
  - **Zero report** — the zeroed/calibrated baseline version.
- **Toggle between Standard and Zero viewer** via tabs below the search bar.
- **Open in new tab** — fetches the PDF fresh and opens it in a browser tab.
- **Download PDF** — fetches the PDF and triggers a browser download.
- **Right-click context menu** on the PDF viewer — additional open/download options.
- **Status indicator** — shows Ready / Searching… / Found / Not Found.
- **Back button** → return to Report Hub.
- Search is debounced; 6-character minimum enforced.

---

## 22. Quality Hub

**Route:** `/quality`  
**Access:** All authenticated users  
**File:** `frontend/src/pages/Quality.tsx`

### What you can do
- **Navigate to Quality sub-modules** via launch cards:
  - **MSA (Measurement System Analysis)** → `/quality/msa` — IATF 7.1.5.1 badge.
- Hub-style grid layout. Additional modules will be added here as they are built.

---

## 23. MSA (Measurement System Analysis)

**Route:** `/quality/msa`  
**Access:** All authenticated users  
**File:** `frontend/src/pages/MSA.tsx`

### Current State
- **Fully Implemented** — 3 study types with live calculations and CRUD.

### What you can do

#### Study List (default view)
- View all MSA studies in a searchable table (equipment, type, date, result, created by).
- Filter by study type (Bias / GR&R / Stability).
- Search by equipment number, equipment name, or part number.
- Color-coded result badges: green = ACCEPTABLE, yellow = MARGINAL, red = NOT ACCEPTABLE.
- View study detail in a read-only modal.
- Delete studies (privileged roles only).
- Click **+ New Study** to open the creation form.

#### Bias Study Form
- Select study type → **Bias**.
- Enter header info: Equipment No, Equipment Name, Resolution, Part No, Part Name, Characteristic, Specification, Date, Area.
- Enter appraiser info: Appraiser Name, Department.
- Enter reference value, unit, α (default 0.05), sample count (default 15).
- Enter individual readings in a grid.
- **Live calculation** of: Mean, Std Dev, Range, Bias, t-Statistic, Degrees of Freedom, Significant t (t-critical), 95% CI Lower/Upper.
- Automatic result: ACCEPTABLE if |t| < t-critical, otherwise NOT ACCEPTABLE.

#### GR&R Study Form
- Select study type → **GR&R**.
- Configure: number of Appraisers (default 3), Trials (default 3), Parts (default 6).
- Enter readings in an Appraiser × Trial × Part grid.
- **Live calculation** of: R̄, X̄ Diff, UCL(R), EV (K1×R̄), AV, GRR = √(EV²+AV²), PV (K3×Rp), TV = √(GRR²+PV²), %EV, %AV, %GRR, %PV, NDC.
- Automatic result: ACCEPTABLE (≤10%), MARGINAL (10–30%), NOT ACCEPTABLE (>30%).
- Uses MSA 4th edition constants (K1, K2, K3, D4, d2).

#### Stability Study Form
- Select study type → **Stability**.
- Enter inspector name, tolerance, unit, reference value.
- Configure subgroups (default 20) and readings per subgroup (default 3).
- Enter readings in a subgroup × reading grid.
- **Live calculation** of: X̄ values, Range values, X̄ chart (UCL/CL/LCL), R chart (UCL/CL/LCL), σ (R̄/d2), 6σ, %Stability = ((X̄max − X̄min)/6σ)×100.
- Automatic result: ACCEPTABLE if %Stability ≤ 10%, otherwise NOT ACCEPTABLE.

#### DocControlSection (embedded)
- View related MSA controlled documents by keyword filter (msa, measurement system, gauge, gage, r&r, linearity, bias, 7.1.5).
- Launch a DCR for MSA-related documents directly from this page.
- Extra new-document categories pre-filled: `MSA > Gauge R&R | Bias | Linearity | Stability | Attribute MSA`.

---

## 24. Safety / Risk Assessment

**Route:** `/safety`  
**Access:** All authenticated users  
**File:** `frontend/src/pages/RiskAssessment.tsx`

### Current State
- **Placeholder / Coming Soon** page.
- Shown scope: "Hazard identification, risk scoring (likelihood × severity), control measures and risk register management aligned with ISO 45001."
- **DocControlSection** component embedded — users can:
  - View related Risk/Safety controlled documents (keywords: risk, hazard, safety, iso 45001, risk assessment).
  - Launch a DCR for safety-related documents from this page.

> Note: Route `/safety/risk-assessment` redirects to `/safety`.

---

## 25. Admin

**Route:** `/admin`  
**Access:** Admin role only (all other roles are redirected)  
**File:** `frontend/src/pages/Admin.tsx`

### What you can do

#### User Management Table
- **View all registered users** in a table with columns: Employee Code, Name, Email, Role, Master ID, Actions.
- **Search/filter** users by name or employee code.

#### Create New User
- Form fields: Employee Code, Display Name, Email, Master ID, Password, Role.
- Role options: Engineer, Leader, Assistant Manager, Manager, Admin, Document Controller, President.
- Submit to create the user in the system.

#### Edit User
- Click the **Edit (pencil)** icon on any user row.
- Update any field: name, email, master ID, password, role.
- Save changes.

#### Delete User
- Click the **Delete (trash)** icon on any user row.
- Confirmation step before deletion.

#### Normalize Roles
- Button to normalize all user role values in the database (fixes legacy inconsistencies like "Document Controller" → "DOCUMENT_CONTROL").

---

## 26. Admin – Migrate

**Route:** `/admin/migrate`  
**Access:** Admin role only  
**File:** `frontend/src/pages/Migration.tsx`

### What you can do
- **Import legacy documents** into the document control system without going through the full DCR workflow.
- Form fields:
  - **Document Number** — the existing controlled document number.
  - **Title** — the document title.
  - **Document Level** — select from Work Instruction / Procedure / Form / Quality Manual / etc.
  - **Revision** — starting revision number (default: `00`).
- **Upload two files:**
  - **Controlled Copy (PDF)** — the already-approved PDF version.
  - **Source File (Word/Excel)** — the editable source document.
- Submit to register the document directly as Released in the system.
- Used for **one-time migration** of historical/pre-existing documents.

---

## 27. Logs

**Route:** `/logs`  
**Access:** Admin / Document Control (all authenticated users can be scoped by backend)  
**File:** `frontend/src/pages/Logs.tsx`

### What you can do
- **View system audit log** — a complete history of all significant actions taken in the system.
- **Log entry fields displayed:** Date/Time, Actor Name, Action Type, Entity Type, Entity ID, Metadata detail.
- **Action type badges** with color coding and emoji labels:
  - 🔑 Login / 🚪 Logout
  - 👤 User Created / Updated / Deleted
  - 📝 Ticket Created (Change / New Doc / Re-upload)
  - ✅ Approved / ❌ Rejected (at each gate)
  - 📎 Files Uploaded / Non-Signed PDF Uploaded
  - 🔒 Ticket Closed
  - 👁️ File Viewed / 🚫 File Access Denied
  - 🏷️ Role Assigned
  - ⚠️ System Wipe
- **Search** log entries by actor name, action, or entity.
- **Sort** by: Date, Action, Entity, Actor.
- **Refresh** to pull the latest log entries.
- **Pagination / virtualization** for large log sets.

---

## Summary Report

### Page Count by Category

| Category | Count | Pages |
|----------|-------|-------|
| Authentication | 1 | Login |
| Core Workflow (DCR) | 4 | Dashboard, DCR List, Create DCR, DCR Detail |
| Document Management | 3 | Document Repository, Document View, Upload Revision |
| Flowcharts | 3 | Workflow, KPI, Procedure |
| Planning Modules | 7 | Plan Hub, Training, Calibration, In-House Calibration, Calibration History, Maintenance, Maintenance History |
| Reports | 3 | Plan Hub, Report Hub, Report Search |
| Quality & Safety | 3 | Quality Hub, MSA, Risk Assessment |
| System Administration | 3 | Admin, Migrate, Logs |
| Placeholder (Coming Soon) | 1 | Risk Assessment (partial) |

**Total Routes:** 27  
**Total Page Files:** 29 (including `Flowchart.tsx` hub — unused, and `Safety.tsx` — unused; both superseded by direct routing)

---

### Feature Matrix by Role

| Feature | Engineer | Leader | Asst. Manager | Manager | DC | Admin | President |
|---------|----------|--------|---------------|---------|-----|-------|-----------|
| View Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| View Documents | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| View Historical Revisions | — | — | — | — | ✓ | ✓ | — |
| Create Change/New DCR | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create Re-upload DCR | — | — | — | — | ✓ | ✓ | — |
| Upload Revision Files | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ | ✓ | ✓ (own) |
| DC Review Gate | — | — | — | — | ✓ | ✓ | — |
| Checker Gate | — | — | ✓ | ✓ | — | ✓ | — |
| Approver Gate | — | — | — | ✓ | — | ✓ | ✓ |
| Final DC Release | — | — | — | — | ✓ | ✓ | — |
| Add/Edit Equipment (Cal.) | — | — | — | — | ✓ | ✓ | — |
| Add/Edit Equipment (Maint.) | — | — | — | — | ✓ | ✓ | — |
| Training Plan Approval | — | — | ✓ (check) | ✓ (approve) | ✓ | ✓ | — |
| User Management | — | — | — | — | — | ✓ | — |
| Document Migration | — | — | — | — | — | ✓ | — |
| View Audit Logs | — | — | — | — | ✓ | ✓ | — |

---

### IATF 16949 Clause Coverage

| IATF Clause | Module |
|-------------|--------|
| 7.1.5 — Monitoring & Measurement Resources | Calibration Plan, In-House Calibration Plan, Calibration History |
| 7.1.5.1 — Measurement System Analysis | MSA (Bias, GR&R, Stability — Implemented) |
| 7.2 — Competence | Training Plan |
| 7.5 — Documented Information | Document Repository, DCR Workflow, Document View |
| 9.1 — Monitoring, Measurement, Analysis | KPI Flowchart |
| ISO 45001 — OH&S | Risk Assessment (Coming Soon) |

---

*End of Page Outlines & Feature Report*
