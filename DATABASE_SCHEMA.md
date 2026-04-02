# IATF 16949 DCR System - Database Schema Reference

## Overview

This document provides a comprehensive reference for the SQLite database schema used in the IATF 16949 compliant Document Change Request workflow system.

---

## Table: roles

**Purpose:** Define user roles in the system

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | INTEGER | PRIMARY KEY | Role identifier |
| name | TEXT | UNIQUE NOT NULL | Role name (ADMIN, MANAGER, QMR, DOCUMENT_CONTROL, CHANGE_REQUESTER) |

**Indexes:** None

**Sample Data:**
```sql
INSERT INTO roles (name) VALUES ('ADMIN');
INSERT INTO roles (name) VALUES ('MANAGER');
INSERT INTO roles (name) VALUES ('QMR');
INSERT INTO roles (name) VALUES ('DOCUMENT_CONTROL');
INSERT INTO roles (name) VALUES ('CHANGE_REQUESTER');
```

---

## Table: users

**Purpose:** Store user account information and role assignments

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | INTEGER | PRIMARY KEY | User identifier |
| employee_code | TEXT | UNIQUE NOT NULL | Employee ID (e.g., EMP001) |
| name | TEXT | NOT NULL | User's full name |
| password_hash | TEXT | NOT NULL | Hashed password (bcrypt or plain text for dev) |
| role_id | INTEGER | FOREIGN KEY → roles(id) | User's assigned role |
| owning_department | VARCHAR(100) | NULL | Department name for manager assignment |
| is_active | INTEGER | DEFAULT 1 | Active status (1=active, 0=inactive) |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Account creation timestamp |

**Indexes:**
- PRIMARY KEY on id

**Foreign Keys:**
- role_id → roles(id)

---

## Table: Document

**Purpose:** Store master document information

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | INTEGER | PRIMARY KEY | Document identifier |
| doc_number | VARCHAR(64) | UNIQUE NOT NULL | Document number (e.g., DOC-001) |
| title | VARCHAR(255) | NOT NULL | Document title |
| owning_department | VARCHAR(100) | NULL | Department responsible for document |
| current_revision_id | BIGINT | FOREIGN KEY → DocumentRevision(id) | Latest released revision |
| created_by | BIGINT | NOT NULL | User ID who created document |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Document creation timestamp |

**Indexes:**
- PRIMARY KEY on id
- UNIQUE on doc_number

**Foreign Keys:**
- current_revision_id → DocumentRevision(id)

**Notes:**
- current_revision_id links to the latest "Released" revision
- owning_department used for manager assignment logic

---

## Table: DocumentRevision

**Purpose:** Track all document versions including working and released versions

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | INTEGER | PRIMARY KEY | Revision identifier |
| document_id | BIGINT | FOREIGN KEY → Document(id) | Document this revision belongs to |
| rev_code | VARCHAR(16) | NOT NULL | Revision code (e.g., Rev01, Rev02) |
| status | TEXT | CHECK(...) NOT NULL | Status: Working, Pending Approval, Released, Obsolete |
| original_uri | TEXT | NULL | File path to original source file (Word/Excel) |
| original_sha256 | CHAR(64) | NULL | SHA256 hash of original file |
| pdf_uri | TEXT | NULL | File path to PDF version |
| pdf_sha256 | CHAR(64) | NULL | SHA256 hash of PDF file |
| change_summary | TEXT | NULL | Summary of changes in this revision |
| created_by | BIGINT | NOT NULL | User ID who created revision |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Revision creation timestamp |
| released_at | TIMESTAMP | NULL | When revision was released |
| released_by | BIGINT | NULL | User ID who released the revision |
| supersedes_revision_id | BIGINT | FOREIGN KEY → DocumentRevision(id) | Previous revision this supersedes |

**Indexes:**
- PRIMARY KEY on id
- idx_rev_doc_status on (document_id, status)

**Foreign Keys:**
- document_id → Document(id)
- supersedes_revision_id → DocumentRevision(id)

**Status Values:**
- **Working**: Document is being edited, not yet approved
- **Pending Approval**: Waiting for final manager approval
- **Released**: Approved and current version
- **Obsolete**: Superseded by newer revision

**Constraints:**
```sql
-- Released documents must have PDF and hash
CONSTRAINT chk_release_pdf 
CHECK (status <> 'Released' OR (pdf_uri IS NOT NULL AND pdf_sha256 IS NOT NULL))
```

**Notes:**
- File hashes ensure integrity verification
- Both original and PDF files stored separately
- Status drives workflow progression

---

## Table: ChangeRequest

**Purpose:** Track document change requests through approval workflow

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | INTEGER | PRIMARY KEY | Change request identifier |
| document_id | BIGINT | FOREIGN KEY → Document(id) | Document being changed |
| requester_id | BIGINT | NOT NULL | User ID requesting change |
| manager_id | BIGINT | NULL | Assigned manager/approver |
| status | TEXT | CHECK(...) NOT NULL | Current status in workflow |
| reason | TEXT | NOT NULL | Reason for change |
| submitted_at | TIMESTAMP | NULL | When requester submitted CR |
| preapproved_at | TIMESTAMP | NULL | When manager pre-approved |
| final_approved_at | TIMESTAMP | NULL | When manager gave final approval |
| rejected_at | TIMESTAMP | NULL | When manager rejected CR |
| returned_at | TIMESTAMP | NULL | When returned for revision |
| latest_working_revision_id | BIGINT | NULL | Working revision being edited |

**Indexes:**
- PRIMARY KEY on id
- idx_cr_doc_status on (document_id, status)

**Foreign Keys:**
- document_id → Document(id)
- latest_working_revision_id → DocumentRevision(id)

**Status Values:**
- **Draft**: Initial creation, not submitted
- **Submitted**: Waiting for manager's initial decision
- **Pre-Approved**: Manager approved for revision, requester editing
- **Pending Approval**: Files uploaded, awaiting manager's final decision
- **Returned for Revision**: Manager wants changes, back to editing
- **Approved**: Final approval, document released
- **Rejected**: Manager rejected the request

**Status Transitions:**
```
Draft → Submitted → {Rejected | Pre-Approved}
                           ↓
                    (Requester edits)
                           ↓
                      Pending Approval → {Returned for Revision | Approved}
                           ↑                         ↓
                           └─────────────────────────┘
                          (Requester edits again)
```

---

## Table: ApprovalRecord

**Purpose:** Track approval decisions at each workflow gate

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | INTEGER | PRIMARY KEY | Record identifier |
| cr_id | BIGINT | FOREIGN KEY → ChangeRequest(id) | Change request being approved |
| step | TEXT | CHECK(...) NOT NULL | Approval gate: GateA or GateB |
| decision | TEXT | CHECK(...) NOT NULL | Decision: Approve, Reject, Return |
| decided_by | BIGINT | NOT NULL | User ID who made decision |
| decided_by_role | VARCHAR(32) | NOT NULL | Role of decision maker |
| decided_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | When decision was made |
| comment | TEXT | NULL | Decision comment/feedback |
| file_hashes | TEXT | NULL | JSON with file hash information |

**Indexes:**
- PRIMARY KEY on id

**Foreign Keys:**
- cr_id → ChangeRequest(id)

**Gate Definitions:**
- **GateA**: Initial manager decision (Pre-Approve or Reject)
- **GateB**: Final manager decision (Approve or Return)

**Decision Values:**
- **Approve**: Approve at this gate
- **Reject**: Reject at GateA only
- **Return**: Return for revision at GateB only

**Notes:**
- file_hashes stores JSON with SHA256 values for audit
- Both gates are recorded for complete audit trail

---

## Table: AuditEvent

**Purpose:** Complete audit trail for all system actions

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | INTEGER | PRIMARY KEY | Event identifier |
| entity_type | VARCHAR(32) | NOT NULL | Type of entity (ChangeRequest, Document, User, File) |
| entity_id | BIGINT | NOT NULL | ID of entity being acted upon |
| actor_id | BIGINT | NOT NULL | User ID performing action |
| action | VARCHAR(64) | NOT NULL | Action performed |
| metadata | TEXT | NULL | JSON additional information |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Action timestamp |

**Indexes:**
- PRIMARY KEY on id
- idx_audit_entity on (entity_type, entity_id)

**Action Examples:**
- CREATE_DRAFT
- SUBMIT
- PRE_APPROVE_GATE_A
- REJECT_GATE_A
- UPLOAD_REVISION
- RETURN_FOR_REVISION_GATE_B
- FINAL_APPROVE_GATE_B
- FILE_ACCESS_ALLOWED
- FILE_ACCESS_DENIED
- ASSIGN_ROLE
- CREATE (for roles/positions)

**Metadata Examples:**
```json
{
  "document_id": 1,
  "reason": "Update quality parameters",
  "assigned_manager": 2,
  "comment": "Approved for revision",
  "file_path": "uploads/doc-original/...",
  "file_type": "original",
  "access_status": "ALLOWED|DENIED",
  "user_role": "MANAGER"
}
```

---

## Table: Notification

**Purpose:** Store user notifications for workflow events

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | INTEGER | PRIMARY KEY | Notification identifier |
| user_id | BIGINT | FOREIGN KEY → users(id) | User being notified |
| type | TEXT | CHECK(...) NOT NULL | Notification type |
| message | TEXT | NOT NULL | Notification message |
| metadata | TEXT | NULL | JSON with additional context |
| is_read | INTEGER | DEFAULT 0 | Read status (1=read, 0=unread) |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | When notification was created |
| read_at | TIMESTAMP | NULL | When user read notification |

**Indexes:**
- PRIMARY KEY on id
- idx_notification_user_read on (user_id, is_read)
- idx_notification_created on (created_at DESC)

**Foreign Keys:**
- user_id → users(id)

**Notification Types:**
- DCR_SUBMITTED
- DCR_PRE_APPROVED
- DCR_REJECTED
- DCR_APPROVED
- DCR_RETURNED_FOR_REVISION
- REVISION_UPLOADED

**Metadata Examples:**
```json
{
  "cr_id": 1,
  "document_id": 1,
  "action": "review_required|edit_required|approval_required",
  "download_link": "/api/download/TOKEN",
  "comment": "Please clarify section 3.2"
}
```

---

## Table: SignedUrlToken

**Purpose:** Manage secure, time-limited file download tokens

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | INTEGER | PRIMARY KEY | Token record ID |
| cr_id | BIGINT | NOT NULL | Change request ID |
| document_id | BIGINT | NOT NULL | Document ID |
| user_id | BIGINT | NOT NULL | User requesting download |
| token | VARCHAR(255) | UNIQUE NOT NULL | Unique token string |
| file_uri | TEXT | NOT NULL | Path to file to download |
| expires_at | TIMESTAMP | NOT NULL | When token expires |
| used_at | TIMESTAMP | NULL | When token was used |

**Indexes:**
- PRIMARY KEY on id
- idx_token_lookup on (token)

**Notes:**
- Token valid for 24 hours from generation
- Single-use only (used_at timestamp set after use)
- Prevents unauthorized file access

---

## Table: MsaStudy

**Purpose:** Parent header for all MSA (Measurement System Analysis) studies

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Study record ID |
| study_type | TEXT | NOT NULL CHECK(IN 'bias','grr','stability') | Type of MSA study |
| equipment_no | TEXT | NOT NULL | Equipment / gage number |
| equipment_name | TEXT | | Equipment description |
| equipment_resolution | TEXT | | Measurement resolution |
| part_no | TEXT | | Part number measured |
| part_name | TEXT | | Part description |
| characteristic | TEXT | | Measured characteristic |
| specification | TEXT | | Specification / tolerance |
| studied_date | TEXT | | Date study was performed |
| area | TEXT | | Department / area |
| status | TEXT | DEFAULT 'Active' | Record status |
| result | TEXT | | Overall result (ACCEPTABLE / NOT ACCEPTABLE) |
| created_by | INTEGER | FK → users(id) | User who created the study |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | DEFAULT datetime('now') | Last update timestamp |

---

## Table: MsaBias

**Purpose:** Detail data for Bias studies (t-test, 95% CI)

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Record ID |
| study_id | INTEGER | NOT NULL FK → MsaStudy(id) ON DELETE CASCADE | Parent study |
| appraiser_name | TEXT | | Appraiser who performed the study |
| appraiser_dept | TEXT | | Appraiser department |
| reference_value | REAL | | Known reference / master value |
| reference_unit | TEXT | DEFAULT 'mm' | Unit of measurement |
| alpha | REAL | DEFAULT 0.05 | Significance level |
| sample_count | INTEGER | DEFAULT 15 | Number of readings |
| readings | TEXT | | JSON array of individual readings |
| mean | REAL | | Calculated mean of readings |
| std_dev | REAL | | Standard deviation |
| range_val | REAL | | Max − Min |
| bias | REAL | | Mean − Reference Value |
| t_statistic | REAL | | |bias| / (σ / √n) |
| degrees_of_freedom | REAL | | n − 1 |
| significant_t | REAL | | t-critical at α/2 |
| ci_lower | REAL | | Lower bound of 95% CI |
| ci_upper | REAL | | Upper bound of 95% CI |
| result | TEXT | | ACCEPTABLE or NOT ACCEPTABLE |

---

## Table: MsaGrr

**Purpose:** Detail data for Gauge R&R studies (EV, AV, GRR, PV, TV, %GRR, NDC)

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Record ID |
| study_id | INTEGER | NOT NULL FK → MsaStudy(id) ON DELETE CASCADE | Parent study |
| num_appraisers | INTEGER | DEFAULT 3 | Number of appraisers |
| num_trials | INTEGER | DEFAULT 3 | Number of trials per appraiser |
| num_parts | INTEGER | DEFAULT 6 | Number of parts measured |
| appraiser_data | TEXT | | JSON: per-appraiser trial×part readings |
| part_averages | TEXT | | JSON: overall part averages |
| r_bar | REAL | | Average range across appraisers |
| x_diff | REAL | | Max appraiser avg − Min appraiser avg |
| ucl_r | REAL | | Upper control limit for ranges (D4 × R̄) |
| ev | REAL | | Equipment Variation (R̄ × K1) |
| av | REAL | | Appraiser Variation |
| grr | REAL | | Gauge R&R = √(EV² + AV²) |
| pv | REAL | | Part Variation (Rp × K3) |
| tv | REAL | | Total Variation = √(GRR² + PV²) |
| percent_ev | REAL | | %EV = (EV / TV) × 100 |
| percent_av | REAL | | %AV = (AV / TV) × 100 |
| percent_grr | REAL | | %GRR = (GRR / TV) × 100 |
| percent_pv | REAL | | %PV = (PV / TV) × 100 |
| ndc | INTEGER | | Number of Distinct Categories |
| result | TEXT | | ACCEPTABLE (≤10%), MARGINAL (10-30%), NOT ACCEPTABLE (>30%) |

---

## Table: MsaStability

**Purpose:** Detail data for Stability studies (X̄/R control charts, %Stability)

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Record ID |
| study_id | INTEGER | NOT NULL FK → MsaStudy(id) ON DELETE CASCADE | Parent study |
| inspector_name | TEXT | | Inspector who performed the study |
| tolerance | REAL | | Process tolerance |
| tolerance_unit | TEXT | DEFAULT 'g' | Unit of measurement |
| reference_value | REAL | | Reference / nominal value |
| num_subgroups | INTEGER | DEFAULT 20 | Number of subgroups |
| readings_per_subgroup | INTEGER | DEFAULT 3 | Readings per subgroup |
| readings | TEXT | | JSON: 2D array [subgroup][reading] |
| x_bar_values | TEXT | | JSON: subgroup means |
| range_values | TEXT | | JSON: subgroup ranges |
| x_bar_ucl | REAL | | X̄ chart upper control limit |
| x_bar_cl | REAL | | X̄ chart center line |
| x_bar_lcl | REAL | | X̄ chart lower control limit |
| r_ucl | REAL | | R chart upper control limit |
| r_cl | REAL | | R chart center line |
| r_lcl | REAL | | R chart lower control limit (0 for n≤6) |
| sigma | REAL | | Estimated sigma (R̄ / d2) |
| six_sigma | REAL | | 6σ spread |
| percent_stability | REAL | | %Stability = ((X̄_max − X̄_min) / 6σ) × 100 |
| result | TEXT | | ACCEPTABLE or NOT ACCEPTABLE |

---

## Relationships Diagram

```
roles (1)─────┬─────(n) users
              │
              └─────(n) ApprovalRecord (decided_by_role)

users (1)─────┬─────(n) Document (created_by)
              │
              ├─────(n) ChangeRequest (requester_id)
              │
              ├─────(n) ChangeRequest (manager_id)
              │
              ├─────(n) DocumentRevision (created_by)
              │
              ├─────(n) DocumentRevision (released_by)
              │
              ├─────(n) AuditEvent (actor_id)
              │
              └─────(n) Notification (user_id)

Document (1)──┬─────(1) DocumentRevision (current_revision_id)
              │
              ├─────(n) DocumentRevision (document_id)
              │
              ├─────(n) ChangeRequest (document_id)
              │
              └─────(n) SignedUrlToken (document_id)

DocumentRevision (1)─┬─────(1) ChangeRequest (latest_working_revision_id)
                     │
                     └─────(1) DocumentRevision (supersedes_revision_id)

ChangeRequest (1)────┬─────(n) ApprovalRecord (cr_id)
                     │
                     ├─────(n) AuditEvent (entity_id where entity_type='ChangeRequest')
                     │
                     └─────(n) SignedUrlToken (cr_id)

MsaStudy (1)─────────┬─────(0..1) MsaBias (study_id)
                      │
                      ├─────(0..1) MsaGrr (study_id)
                      │
                      └─────(0..1) MsaStability (study_id)

users (1)─────────────(n) MsaStudy (created_by)
```

---

## Data Flow: Complete DCR Lifecycle

### 1. Document Creation
```
users (ID: 1) creates → Document (ID: 1)
                          ↓
                     DocumentRevision (ID: 1, status: Released)
                          ↓
                     Document.current_revision_id = 1
```

### 2. Change Request Submission
```
users (ID: 5) creates → ChangeRequest (ID: 1, status: Draft)
                              ↓
                        (Submit action)
                              ↓
                        Status: Submitted
                        manager_id assigned
                              ↓
                        Notification → users (ID: manager_id)
                              ↓
                        AuditEvent recorded
```

### 3. Manager Pre-Approval
```
users (ID: 2) PreApproves → ChangeRequest (ID: 1, status: Pre-Approved)
                                 ↓
                        ApprovalRecord created (step: GateA, decision: Approve)
                                 ↓
                        SignedUrlToken generated
                                 ↓
                        Notification → users (ID: requester_id)
                                 ↓
                        AuditEvent recorded
```

### 4. File Upload
```
Requester uploads files → DocumentRevision (ID: 2, status: Pending Approval)
                              + original_uri, original_sha256
                              + pdf_uri, pdf_sha256
                                 ↓
                        ChangeRequest → latest_working_revision_id = 2
                                 ↓
                        Notification → users (ID: manager_id)
                                 ↓
                        AuditEvent recorded (with file hashes)
```

### 5. Manager Final Approval
```
users (ID: 2) Approves → ChangeRequest (status: Approved)
                               ↓
                        DocumentRevision (ID: 2, status: Released)
                        released_at, released_by set
                               ↓
                        Document.current_revision_id = 2
                               ↓
                        DocumentRevision (ID: 1, status: Obsolete)
                               ↓
                        ApprovalRecord created (step: GateB, decision: Approve)
                               ↓
                        Notification → users (ID: requester_id)
                               ↓
                        AuditEvent recorded
```

---

## Query Examples

### Get Change Request Status History
```sql
SELECT 
    cr.id, cr.status, cr.submitted_at, cr.preapproved_at,
    cr.final_approved_at, cr.rejected_at, cr.returned_at
FROM ChangeRequest cr
WHERE cr.id = 1
ORDER BY cr.created_at DESC;
```

### Get Approval Records for a CR
```sql
SELECT 
    ar.id, ar.step, ar.decision, u.name as decided_by,
    ar.decided_at, ar.comment
FROM ApprovalRecord ar
JOIN users u ON ar.decided_by = u.id
WHERE ar.cr_id = 1
ORDER BY ar.decided_at DESC;
```

### Get Audit Trail for DCR
```sql
SELECT 
    ae.action, u.name as actor, ae.created_at, ae.metadata
FROM AuditEvent ae
LEFT JOIN users u ON ae.actor_id = u.id
WHERE ae.entity_type = 'ChangeRequest' AND ae.entity_id = 1
ORDER BY ae.created_at DESC;
```

### Get Document Revision History
```sql
SELECT 
    dr.id, dr.rev_code, dr.status, u1.name as created_by,
    dr.created_at, u2.name as released_by, dr.released_at
FROM DocumentRevision dr
LEFT JOIN users u1 ON dr.created_by = u1.id
LEFT JOIN users u2 ON dr.released_by = u2.id
WHERE dr.document_id = 1
ORDER BY dr.created_at DESC;
```

### Get File Access Logs
```sql
SELECT 
    ae.action, u.name as actor, ae.created_at, ae.metadata
FROM AuditEvent ae
LEFT JOIN users u ON ae.actor_id = u.id
WHERE ae.entity_type = 'File'
  AND ae.action LIKE 'FILE_ACCESS%'
  AND ae.actor_id = 5
ORDER BY ae.created_at DESC;
```

### Get Pending Approvals
```sql
SELECT 
    cr.id, d.doc_number, d.title, u.name as requester,
    cr.submitted_at, cr.status
FROM ChangeRequest cr
JOIN Document d ON cr.document_id = d.id
JOIN users u ON cr.requester_id = u.id
WHERE cr.manager_id = 2
  AND cr.status IN ('Submitted', 'Pending Approval')
ORDER BY cr.submitted_at ASC;
```

---

## Compliance & Audit Considerations

### Audit Trail Completeness
- Every action is recorded with actor ID and timestamp
- File modifications tracked with hash values
- Approval decisions logged in ApprovalRecord
- Rejections and returns documented with comments

### Data Integrity
- File hashes (SHA256) prevent tampering
- Foreign key constraints maintain referential integrity
- Status checks ensure valid state transitions
- Timestamps in UTC for global consistency

### Security
- Passwords should be hashed (bcrypt recommended)
- Signed URLs expire after 24 hours
- File access controlled by user role
- Audit logs immutable (no delete/update operations)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-17 | Initial IATF 16949 schema |

---

## References

- IATF 16949:2016 Document Control Requirements
- DCR_WORKFLOW_GUIDE.md - Workflow implementation details
- SETUP_GUIDE.md - Setup and installation instructions
