# IATF 16949 DCR Workflow - Setup & Quick Start Guide

## Prerequisites

1. **Node.js** v14+
2. **SQLite3**
3. **npm** or **yarn**

## Installation & Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Initialize Database

Run migrations to create all required tables:

```bash
node db/init_db.js
```

Or manually run migrations in order:
```bash
sqlite3 nskiatf_doccontrol.db < migrations/20260217_0859_create_roles_and_users.sql
sqlite3 nskiatf_doccontrol.db < migrations/20260217_0900_create_document.sql
sqlite3 nskiatf_doccontrol.db < migrations/20260217_0901_create_document_revision.sql
sqlite3 nskiatf_doccontrol.db < migrations/20260217_0902_create_change_request.sql
sqlite3 nskiatf_doccontrol.db < migrations/20260217_0903_create_approval_audit.sql
sqlite3 nskiatf_doccontrol.db < migrations/20260217_0904_fk_current_revision.sql
sqlite3 nskiatf_doccontrol.db < migrations/20260217_0905_chk_released_has_pdf.sql
sqlite3 nskiatf_doccontrol.db < migrations/20260217_0906_signed_url_token.sql
sqlite3 nskiatf_doccontrol.db < migrations/20260217_0907_create_notification.sql
sqlite3 nskiatf_doccontrol.db < migrations/20260217_0908_add_departments_to_users.sql
```

### 3. Create Required Roles

```bash
sqlite3 nskiatf_doccontrol.db << EOF
INSERT INTO roles (name) VALUES ('ADMIN');
INSERT INTO roles (name) VALUES ('MANAGER');
INSERT INTO roles (name) VALUES ('QMR');
INSERT INTO roles (name) VALUES ('DOCUMENT_CONTROL');
INSERT INTO roles (name) VALUES ('CHANGE_REQUESTER');
EOF
```

### 4. Create Test Users

```bash
sqlite3 nskiatf_doccontrol.db << EOF
-- Admin user
INSERT INTO users (employee_code, name, password, role_id, owning_department)
VALUES ('ADM001', 'Admin User', 'admin123', 1, 'Management');

-- Manager user
INSERT INTO users (employee_code, name, password, role_id, owning_department)
VALUES ('MGR001', 'John Manager', 'manager123', 2, 'Engineering');

-- QMR user
INSERT INTO users (employee_code, name, password, role_id, owning_department)
VALUES ('QMR001', 'Jane QMR', 'qmr123', 3, 'Quality');

-- Document Control user
INSERT INTO users (employee_code, name, password, role_id, owning_department)
VALUES ('DOC001', 'Doc Control', 'doc123', 4, 'Management');

-- Change Requester user
INSERT INTO users (employee_code, name, password, role_id, owning_department)
VALUES ('REQ001', 'Request User', 'req123', 5, 'Engineering');
EOF
```

### 5. Create Test Document

```bash
sqlite3 nskiatf_doccontrol.db << EOF
INSERT INTO Document (doc_number, title, owning_department, created_by, created_at)
VALUES ('DOC-001', 'Process Control Procedure', 'Engineering', 1, CURRENT_TIMESTAMP);
EOF
```

### 6. Create Initial Document Revision

```bash
sqlite3 nskiatf_doccontrol.db << EOF
-- Create an initial released revision
INSERT INTO DocumentRevision 
(document_id, rev_code, status, original_uri, original_sha256, pdf_uri, pdf_sha256, created_by, created_at, released_at, released_by)
VALUES (
  1, 
  'Rev01', 
  'Released',
  'uploads/doc-original/doc-1-rev-initial.docx',
  'initial_hash_1234567890abcdef',
  'uploads/doc-pdf/doc-1-rev-initial.pdf',
  'initial_hash_pdf_1234567890abcdef',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  1
);

-- Update document current revision
UPDATE Document SET current_revision_id = 1 WHERE id = 1;
EOF
```

### 7. Create Upload Directories

```bash
mkdir -p backend/uploads/doc-original
mkdir -p backend/uploads/doc-pdf
mkdir -p backend/uploads/staging
```

### 8. Start Server

```bash
cd backend
npm start
```

Server will run on `http://localhost:3000`

---

## Quick Start: Complete DCR Workflow

### Step 1: User Login (as Requester)
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"employee_code": "REQ001", "password": "req123"}'

# Response:
{
  "message": "Login สำเร็จ",
  "user": {
    "id": 5,
    "name": "Request User",
    "role": "CHANGE_REQUESTER",
    "employee_code": "REQ001"
  }
}
```

### Step 2: Create Draft Change Request
```bash
curl -X POST http://localhost:3000/api/change-requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "document_id": 1,
    "reason": "Update quality control parameters per engineering change order ECN-2026-001"
  }'

# Response:
{
  "message": "Change request created in draft status",
  "change_request_id": 1,
  "status": "Draft"
}
```

### Step 3: Submit Change Request
```bash
curl -X POST http://localhost:3000/api/change-requests/1/submit \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response:
{
  "message": "Change request submitted for approval",
  "change_request_id": 1,
  "assigned_manager_id": 2,
  "status": "Submitted"
}

# Manager receives notification
```

### Step 4: Manager Pre-Approves (Manager Login First)
```bash
# Login as Manager
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"employee_code": "MGR001", "password": "manager123"}'
```

```bash
# Manager makes decision
curl -X POST http://localhost:3000/api/change-requests/1/decision \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MANAGER_TOKEN" \
  -d '{
    "decision": "Approve",
    "comment": "Approved for revision, please update section 3.2"
  }'

# Response:
{
  "message": "Change request pre-approved",
  "change_request_id": 1,
  "status": "Pre-Approved",
  "downloadLink": "/api/download/TOKEN_HERE"
}

# Requester receives notification with download link
```

### Step 5: Requester Downloads Source File
```bash
# Requester uses signed URL from notification
curl -X GET http://localhost:3000/api/change-requests/download/SIGNED_TOKEN \
  -H "Authorization: Bearer REQUESTER_TOKEN" \
  -o updated_procedure.docx
```

**Note:** File is available for 24 hours from generation time

### Step 6: Requester Uploads Revised Documents
```bash
# Create/prepare:
# - updated_procedure.docx (edited source file)
# - updated_procedure.pdf (PDF version)

curl -X POST http://localhost:3000/api/change-requests/1/upload \
  -H "Authorization: Bearer REQUESTER_TOKEN" \
  -F "source=@updated_procedure.docx" \
  -F "pdf=@updated_procedure.pdf"

# Response:
{
  "message": "Files uploaded successfully, pending final approval",
  "change_request_id": 1,
  "revision_id": 2,
  "status": "Pending Approval"
}

# Manager receives notification for final review
```

### Step 7: Manager Final Review - Approve
```bash
curl -X POST http://localhost:3000/api/change-requests/1/review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MANAGER_TOKEN" \
  -d '{
    "decision": "Approve",
    "comment": "Final review complete, document meets all requirements"
  }'

# Response:
{
  "message": "Change request approved and document released",
  "change_request_id": 1,
  "status": "Approved"
}

# Requester receives approval notification
# Document is now RELEASED and available for use
```

### Step 8: Get Change Request Details
```bash
curl -X GET http://localhost:3000/api/change-requests/1 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response includes full CR details with status, approvals, revisions
```

### Step 9: Get Approval History
```bash
curl -X GET http://localhost:3000/api/change-requests/1/history \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response includes approval records and audit events
```

---

## Admin Compliance Functions

### Generate Compliance Report
```bash
curl -X GET "http://localhost:3000/api/admin/compliance-report?start_date=2026-02-01&end_date=2026-02-28" \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Response: Complete IATF 16949 compliance report with:
# - All change request events
# - Approval records
# - Summary statistics
```

### Get User Audit Events
```bash
curl -X GET "http://localhost:3000/api/admin/audit/user/5?start_date=2026-02-01&end_date=2026-02-28" \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Response: User activity history for compliance audit
```

### Get Document Revision History
```bash
curl -X GET http://localhost:3000/api/admin/document/1/revisions \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Response: Complete revision and change request history for document
```

---

## File Structure

```
backend/
├── migrations/
│   ├── 20260217_0859_create_roles_and_users.sql
│   ├── 20260217_0900_create_document.sql
│   ├── 20260217_0901_create_document_revision.sql
│   ├── 20260217_0902_create_change_request.sql
│   ├── 20260217_0903_create_approval_audit.sql
│   ├── 20260217_0904_fk_current_revision.sql
│   ├── 20260217_0905_chk_released_has_pdf.sql
│   ├── 20260217_0906_signed_url_token.sql
│   ├── 20260217_0907_create_notification.sql
│   └── 20260217_0908_add_departments_to_users.sql
├── services/
│   ├── dcrService.js (Document Change Request logic)
│   ├── fileService.js (File storage & validation)
│   ├── notificationService.js (Notifications & alerts)
│   ├── auditService.js (Audit trail & compliance)
│   ├── signedUrlService.js (Secure file downloads)
│   └── revisionService.js (Document revision management)
├── middleware/
│   ├── auth.js (Authentication)
│   ├── fileAccess.js (File access control)
│   ├── auditService.js (File access logging)
│   └── validation.js (Input validation)
├── routes/
│   ├── changeRequests.js (DCR endpoints)
│   ├── admin.js (Admin & compliance endpoints)
│   ├── auth.js (Authentication endpoints)
│   └── workflow.js (Workflow endpoints)
├── uploads/
│   ├── doc-original/ (Original Word/Excel files)
│   ├── doc-pdf/ (PDF files for release)
│   └── staging/ (Temporary upload location)
├── config/
│   ├── storage.js (Storage path configuration)
│   └── config.js (Application configuration)
└── db/
    ├── init_db.js (Database initialization)
    └── nskiatf_doccontrol.db (SQLite database)
```

---

## Key Features Implemented

✅ **Two-Gate Approval System**
- Gate A: Manager pre-approval (Approve/Reject)
- Gate B: Manager final review (Approve/Return for Revision)

✅ **File Control**
- Original files (Word/Excel): Restricted access
- PDF files: Available for viewing and printing
- File integrity: SHA256 verification
- Signed URLs: 24-hour expiration for secure downloads

✅ **Audit Trail & Compliance**
- Every action logged with actor, timestamp, and details
- Complete change request history
- Approval record tracking
- File access logging
- Compliance reports

✅ **Notification System**
- DCR submitted notification (to manager)
- Pre-approval notification (to requester with download link)
- Rejection notification (to requester)
- Revision upload notification (to manager)
- Final approval notification (to requester)
- Return for revision notification (to requester)

✅ **Role-Based Access Control**
- ADMIN: Full system access
- MANAGER: Approve/reject DCRs, access original files
- QMR: Approve/reject DCRs, access original files
- DOCUMENT_CONTROL: View all documents and revisions
- CHANGE_REQUESTER: Submit DCRs, upload revisions

✅ **Status Tracking**
- Draft → Submitted → Pre-Approved → Pending Approval → Approved
- Rejection to any submitted status
- Return for revision from Pending Approval

---

## Troubleshooting

### Setup Issues

**Issue:** Database not found
```bash
# Solution:
node db/init_db.js
```

**Issue:** Upload directories don't exist
```bash
# Solution:
mkdir -p backend/uploads/{doc-original,doc-pdf,staging}
```

**Issue:** Port already in use
```bash
# Solution: Change PORT in server.js or kill process:
# Linux/Mac: lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill
# Windows: netstat -ano | findstr :3000
```

### Runtime Issues

**Issue:** Manager not assigned
- Ensure manager user has role_id for MANAGER or QMR role
- Ensure manager has owning_department set matching document's department

**Issue:** File upload fails
- Check file format (Word/Excel/PDF)
- Check file size (< 50MB)
- Verify upload directories exist and are writable

**Issue:** Notifications not appearing
- Current implementation logs to console
- For production: Configure email in notificationService.js

---

## Next Steps

1. Configure production deploymentdetails
2. Set up email notifications
3. Configure database backups
4. Implement user authentication (currently basic)
5. Configure role-based access at frontend
6. Set up compliance report scheduling
7. Implement team notifications (Teams/Slack)

---

## Support

For questions or issues with the DCR workflow implementation, refer to:
- **Implementation Guide:** DCR_WORKFLOW_GUIDE.md
- **API Documentation:** Routes in /routes/changeRequests.js and /routes/admin.js
- **Database Schema:** Migrations in /migrations/

---

**Version:** 1.0
**Last Updated:** February 17, 2026
**IATF 16949 Compliant:** ✅
