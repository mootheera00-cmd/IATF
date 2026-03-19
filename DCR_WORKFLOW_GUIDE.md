# IATF 16949 Document Change Request Workflow - Implementation Guide

## Overview

This document describes the complete Document Change Request (DCR) workflow implementation that complies with IATF 16949 document control requirements.

## Canonical Policy Baseline (Feb 2026)

This section defines the required target policy for role permissions, document categories, approval routing, and versioning behavior.

### Roles and Permissions

- Engineer: request new registrations, request updates/edits, view published documents
- Leader: request new registrations, request updates/edits, view published documents
- Assistant Manager: requester permissions + document checker permissions
- Manager: requester/checker permissions + approval permissions for Level 3 and Level 4
- President: requester permissions + approval permissions for Level 1 and Level 2
- Document Controller: requester permissions + view all documents + final storage approval before publish + view old documents

### Categories and Levels

- Level 1: Quality Manual
- Level 2: Procedure
- Level 3: Work Instruction, Support Document, Outside Document, Operation Standard
- Level 4: Form, Report

### Required Workflow Steps

1. Requester (Engineer/Leader/Assistant Manager/Manager) submits new registration request with category, document number, document name, and short reason.
2. Document Controller receives notification/email and performs initial decision.
3. If Document Controller rejects, a rejection comment is mandatory and requester restarts from Step 1.
4. If Document Controller approves, requester uploads PDF + Word/Excel and selects checkers and approvers.
5. Checker stage: Assistant Manager/Manager reviews and approves/rejects.
6. Checker rejection returns to requester for correction and restart from Step 4.
7. Approver stage: Manager/President reviews by level responsibility.
8. Approver rejection returns to requester for correction and restart from Step 4.
9. Storage stage: Document Controller performs final checking/storage approval.
10. Storage rejection returns to requester for correction and restart from Step 4.
11. On successful storage approval, system finalizes revision and publish state.

### Versioning and Obsolescence Rules

- System assigns effective date at release.
- New document starts at Rev. 01.
- Every approved release auto-increments revision.
- New Active revision auto-obsoletes previous Active revision.
- Published distribution is PDF-only for general users.
- Viewer watermark uses viewer Master ID (except Form category behavior).
- Editable source files (Word/Excel) are retained for controlled updates.

## Workflow Stages

### Stage 1: Draft Creation
**Requester Action**
- Create a new change request
- Specify the document and reason for change

**API Endpoint:**
```
POST /api/change-requests
{
  "document_id": 1,
  "reason": "Update process parameters per engineering change order"
}
```

**Status:** Draft
**Database State:** Change request created with Draft status

---

### Stage 2: Submit for Approval
**Requester Action**
- Review draft change request
- Submit for manager approval

**API Endpoint:**
```
POST /api/change-requests/:id/submit
```

**System Actions:**
1. Validates change request is in Draft status
2. Automatically assigns a manager based on document's owning department
3. Updates status to "Submitted"
4. Sends notification to assigned manager
5. Records audit event

**Status:** Submitted
**Notifications:** Manager receives notification of new DCR

---

### Stage 3A: Manager Initial Decision - APPROVE
**Manager Action**
- Reviews the change request
- Approves for revision

**API Endpoint:**
```
POST /api/change-requests/:id/decision
{
  "decision": "Approve",
  "comment": "Approved for revision"
}
```

**System Actions:**
1. Validates manager is assigned to this CR
2. Updates status to "Pre-Approved"
3. Retrieves latest original source file (Word/Excel)
4. Generates time-limited signed URL for download
5. Sends notification to requester with download link
6. Records audit event

**Status:** Pre-Approved
**Notifications:** Requester receives notification with download link
**Files Available:** Original editable file available for download (24-hour limit)

---

### Stage 3B: Manager Initial Decision - REJECT
**Manager Action**
- Reviews the change request
- Rejects the request

**API Endpoint:**
```
POST /api/change-requests/:id/decision
{
  "decision": "Reject",
  "comment": "Does not align with current process strategy"
}
```

**System Actions:**
1. Values manager is assigned to this CR
2. Updates status to "Rejected"
3. Sends notification to requester with rejection reason
4. Records audit event
5. Change request can be resubmitted if needed

**Status:** Rejected
**Notifications:** Requester receives rejection notification
**Process:** Requester can modify and resubmit a new DCR

---

### Stage 4: Requester Uploads Revised Documents
**Requester Action**
- Downloads source file
- Makes required edits
- Creates PDF version of updated document
- Uploads both files

**API Endpoint:**
```
POST /api/change-requests/:id/upload
Content-Type: multipart/form-data
- source: [Word/Excel file] (required)
- pdf: [PDF file] (required)
```

**System Actions:**
1. Validates CR is in Pre-Approved or Returned for Revision status
2. Validates file types (source: .doc, .docx, .xls, .xlsx; PDF: .pdf)
3. Validates file sizes (max 50MB each)
4. Stores original file with integrity hash (SHA256)
5. Stores PDF file with integrity hash (SHA256)
6. Creates new DocumentRevision record
7. Updates status to "Pending Approval"
8. Sends notification to manager for final review
9. Records audit event with file hashes

**Status:** Pending Approval
**Stored Files:**
- Original file:    `uploads/doc-original/doc-{docId}-rev-{timestamp}.{ext}`
- PDF file:         `uploads/doc-pdf/doc-{docId}-rev-{timestamp}.pdf`
**File Hashes:** SHA256 computed for integrity verification
**Notifications:** Manager receives upload notification

---

### Stage 5A: Manager Final Review - APPROVE (Release Document)
**Manager Action**
- Reviews updated documents
- Approves final version

**API Endpoint:**
```
POST /api/change-requests/:id/review
{
  "decision": "Approve",
  "comment": "Final review complete, document meets requirements"
}
```

**System Actions:**
1. Validates manager is assigned to this CR
2. Validates CR is in Pending Approval status
3. Updates DocumentRevision status to "Released"
4. Sets released_at timestamp and released_by user
5. Updates Document.current_revision_id to latest revision
6. Marks previous revision as "Obsolete"
7. Updates CR status to "Approved"
8. Sets final_approved_at timestamp
9. Sends notification to requester - document is released
10. Records audit event

**Status:** Approved
**Document Status:** Released (now the current version)
**Notifications:** Requester receives approval notification
**Previous Version:** Marked as Obsolete (for audit trail)

---

### Stage 5B: Manager Final Review - RETURN FOR REVISION
**Manager Action**
- Reviews updated documents
- Requests further revisions

**API Endpoint:**
```
POST /api/change-requests/:id/review
{
  "decision": "Return",
  "comment": "Please clarify process steps in section 3.2"
}
```

**System Actions:**
1. Validates manager is assigned to this CR
2. Validates CR is in Pending Approval status
3. Updates status to "Returned for Revision"
4. Records audit event with comment
5. Sends notification to requester with feedback
6. Document can be downloaded again for revision

**Status:** Returned for Revision
**Notifications:** Requester receives return notification with feedback
**Process:** Requester goes back to Stage 4 (upload revised documents)

---

## Workflow States and Transitions

```
DRAFT
  ↓
  [Submit]
  ↓
SUBMITTED
  ├─ [Manager Rejects]
  │  ↓
  │  REJECTED ← Can create new DCR
  │
  └─ [Manager Pre-Approves]
     ↓
     PRE-APPROVED
       ↓
       [Requester Uploads]
       ↓
       PENDING APPROVAL
         ├─ [Manager Returns]
         │  ↓
         │  RETURNED FOR REVISION
         │    ↓
         │    [Requester Re-uploads]
         │    ↓
         │    PENDING APPROVAL (cycle repeats)
         │
         └─ [Manager Approves]
            ↓
            APPROVED (Document Released)
```

## File Management

### File Storage Locations
- **Original Files:** `backend/uploads/doc-original/`
  - Naming: `doc-{documentId}-rev-{timestamp}.{extension}`
  - Formats: .doc, .docx, .xls, .xlsx
  - Access: Restricted (MANAGER, QMR, ADMIN, DOCUMENT_CONTROL only)

- **PDF Files:** `backend/uploads/doc-pdf/`
  - Naming: `doc-{documentId}-rev-{timestamp}.pdf`
  - Access: All authenticated users can view/download

### File Integrity
- **Hash Algorithm:** SHA256
- **Hash Storage:** DocumentRevision table columns:
  - `original_sha256`: Hash of original file
  - `pdf_sha256`: Hash of PDF file
- **Use Case:** Verify file integrity, prevent tampering

### File Access Control
**PDF Files (for viewing/printing):**
- ✅ All authenticated users
- ✅ Can download via signed URL
- ✅ Can print

**Original Files (Word/Excel):**
- ✅ ADMIN
- ✅ DOCUMENT_CONTROL
- ✅ MANAGER
- ✅ QMR
- ❌ CHANGE_REQUESTER (except via signed URL during revision)
- ✅ Signed URLs: Available only during Pre-Approved phase (24-hour expiry)

### Signed URL System
**For Secure Downloads:**
- Generated during Pre-Approve phase
- 24-hour expiration
- Single-use token system
- Each download tracked in audit log

**API Endpoint:**
```
GET /api/change-requests/download/:token
```

---

## Notifications

The system sends notifications at critical workflow stages:

### Notification Types

1. **DCR_SUBMITTED** → Manager
   - Trigger: Requester submits DCR
   - Message: New DCR waiting for approval

2. **DCR_PRE_APPROVED** → Requester
   - Trigger: Manager approves for revision
   - Message: Download link for source file

3. **DCR_REJECTED** → Requester
   - Trigger: Manager rejects DCR
   - Message: Rejection reason

4. **DCR_RETURNED_FOR_REVISION** → Requester
   - Trigger: Manager returns updated document
   - Message: Feedback and revision request

5. **REVISION_UPLOADED** → Manager
   - Trigger: Requester uploads revised files
   - Message: Files ready for final review

6. **DCR_APPROVED** → Requester
   - Trigger: Manager approves final revision
   - Message: Document is now released

**Current Implementation:**
- Console logging (for development)
- Notification records stored in database
- Email integration ready (placeholder for future implementation)

---

## Audit Trail & Compliance

### Audit Events Recorded

Every action in the DCR workflow is recorded with:
- **Actor ID:** Who performed the action
- **Action:** What was performed
- **Timestamp:** When it occurred
- **Entity Type:** ChangeRequest, Document, Revision
- **Metadata:** Additional action details

### Audit Event Types

- **CREATE_DRAFT:** DCR created
- **SUBMIT:** DCR submitted for approval
- **PRE_APPROVE_GATE_A:** Manager approved for revision
- **REJECT_GATE_A:** Manager rejected DCR
- **UPLOAD_REVISION:** Requester uploaded files
- **RETURN_FOR_REVISION_GATE_B:** Manager returned for revision
- **FINAL_APPROVE_GATE_B:** Manager approved final version
- **FILE_ACCESS_ALLOWED:** Audit of file access
- **FILE_ACCESS_DENIED:** Audit of denied access

### Approval Records

The ApprovalRecord table (2-gate system):
- **Gate A:** Initial decision (Pre-Approve or Reject)
- **Gate B:** Final decision (Approve or Return)

Each record includes:
- Decision made
- Decided by (Manager ID)
- Timestamp of decision
- Comment/feedback
- File hashes (for version tracking)

---

## API Endpoints Reference

### Change Request Management

| Method | Endpoint | Role | Purpose |
|--------|----------|------|---------|
| POST | /api/change-requests | Any | Create draft DCR |
| POST | /api/change-requests/:id/submit | Requester | Submit for approval |
| POST | /api/change-requests/:id/decision | Manager/QMR | Initial decision |
| POST | /api/change-requests/:id/upload | Requester | Upload revised files |
| POST | /api/change-requests/:id/review | Manager/QMR | Final review decision |
| GET | /api/change-requests | Any | List user's DCRs |
| GET | /api/change-requests/:id | Any | Get DCR details |
| GET | /api/change-requests/:id/history | Any | Get approval history |
| GET | /api/change-requests/download/:token | Any | Download file |

### Admin & Compliance

| Method | Endpoint | Role | Purpose |
|--------|----------|------|---------|
| POST | /api/admin/roles | Admin | Create role |
| POST | /api/admin/positions | Admin | Create position |
| PUT | /api/admin/users/:id/role | Admin | Assign role to user |
| GET | /api/admin/audit/:type/:id | Admin/QMR | Get entity audit trail |
| GET | /api/admin/audit/user/:id | Admin/QMR | Get user activities |
| GET | /api/admin/compliance-report | Admin/QMR | Generate compliance report |
| GET | /api/admin/change-request/:id/approvals | Admin/QMR | Get approval history |
| GET | /api/admin/document/:id/revisions | Admin/DOCUMENT_CONTROL/QMR | Get revision history |

---

## Compliance Features (IATF 16949)

### Document Control
✅ Version control with revision codes
✅ Release status tracking (Working, Pending Approval, Released, Obsolete)
✅ Current revision identification
✅ Supersedes tracking for revision history

### Change Request Process
✅ Two-gate approval system
✅ Mandatory requester and manager identification
✅ Approval timestamps and decision records
✅ Rejection capability with reason documentation
✅ Return for revision capability

### Traceability
✅ Complete audit trail of all changes
✅ Actor identification (who made each decision)
✅ Timestamp for every action
✅ Comment/feedback recording
✅ File integrity verification (SHA256 hashes)

### File Control
✅ Original file storage with integrity
✅ PDF release file separation
✅ Access control by user role
✅ Download tracking and audit
✅ Signed URL with expiration for secure access

### Compliance Reporting
✅ Change request audit trail
✅ Approval record history
✅ User action history
✅ File access logs
✅ Periodic compliance reports

---

## Database Schema

### ChangeRequest Table
```sql
id, document_id, requester_id, manager_id, status, reason,
submitted_at, preapproved_at, final_approved_at, rejected_at, returned_at,
latest_working_revision_id
```

### DocumentRevision Table
```sql
id, document_id, rev_code, status, original_uri, original_sha256,
pdf_uri, pdf_sha256, change_summary, created_by, created_at,
released_at, released_by, supersedes_revision_id
```

### ApprovalRecord Table
```sql
id, cr_id, step (GateA/GateB), decision, decided_by, decided_by_role,
decided_at, comment, file_hashes
```

### AuditEvent Table
```sql
id, entity_type, entity_id, actor_id, action, metadata, created_at
```

### Notification Table
```sql
id, user_id, type, message, metadata, is_read, created_at, read_at
```

---

## Error Handling & Validation

### Input Validation
- Required field validation
- File type validation (Word, Excel, PDF)
- File size limits (max 50MB)
- Status transition validation

### Business Logic Validation
- Change request state validation
- Permission/role validation
- Manager assignment validation
- File integrity validation

### Error Response Format
```json
{
  "message": "User-friendly error message",
  "error": "Technical error details"
}
```

---

## Future Enhancements

1. **Email Notifications**
   - SMTP configuration
   - Email template system
   - Notification preferences

2. **Workflow Customization**
   - Configurable approval gates
   - Optional review stages
   - Department-specific workflows

3. **Integration**
   - Microsoft Teams notifications
   - Slack integration
   - ERP system integration

4. **Advanced Reporting**
   - Custom report builder
   - Export to PDF/Excel
   - Dashboards and analytics

5. **Advanced Access Control**
   - Document-level permissions
   - Custom role definitions
   - Department-based access

---

## Testing Checklist

- [ ] Create DCR in Draft status
- [ ] Submit DCR and verify manager assignment
- [ ] Manager rejects DCR
- [ ] Manager pre-approves DCR
- [ ] Requester downloads source file
- [ ] Requester uploads revised files
- [ ] Manager returns for revision
- [ ] Requester re-uploads files
- [ ] Manager approves final version
- [ ] Verify document status is Released
- [ ] Verify previous revision marked Obsolete
- [ ] Verify audit trail is complete
- [ ] Verify notifications are sent
- [ ] Test file access control (PDF vs Original)
- [ ] Verify signed URL expires after 24 hours
- [ ] Test compliance report generation
- [ ] Verify file integrity hashes

---

## Troubleshooting

### Manager Not Assigned
**Cause:** No manager with matching department
**Solution:** Ensure users have role (MANAGER/QMR) and owning_department set

### File Download Fails
**Cause:** Signed URL expired or invalid
**Solution:** Generate new signed URL from Pre-Approved phase

### Notification Not Received
**Cause:** Current implementation logs to console
**Solution:** Check server logs or implement email/Teams integration

### File Access Denied
**Cause:** User role not authorized for original files
**Solution:** Ensure user has ADMIN, MANAGER, QMR, or DOCUMENT_CONTROL role

---

## Support & Contact

For issues or questions regarding the DCR workflow implementation, please contact the Document Control team.

## Version History

- **v1.0** (Feb 17, 2026): Initial IATF 16949 compliant implementation
  - Two-gate approval system
  - File integrity verification
  - Complete audit trail
  - Role-based access control
  - Comprehensive notification system
