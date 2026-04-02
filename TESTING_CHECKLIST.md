# IATF 16949 DCR Workflow - Verification & Testing Checklist

## Pre-Deployment Verification

### Database Setup
- [ ] All 10 migration files executed in order
- [ ] Database tables created successfully
- [ ] Roles table populated with 5 roles
- [ ] Test users created (Admin, Manager, QMR, Doc Control, Requester)
- [ ] Test document created
- [ ] Initial document revision created and released
- [ ] Database file location: `backend/db/nskiatf_doccontrol.db`

### Directory Structure
- [ ] `backend/uploads/doc-original/` directory exists and writable
- [ ] `backend/uploads/doc-pdf/` directory exists and writable
- [ ] `backend/uploads/staging/` directory exists and writable
- [ ] `backend/config/storage.js` references correct paths
- [ ] All required node_modules installed (`npm install`)

### File Verification
- [ ] `backend/services/dcrService.js` - Complete implementation
- [ ] `backend/services/fileService.js` - File handling
- [ ] `backend/services/notificationService.js` - Notifications
- [ ] `backend/services/auditService.js` - Audit trail
- [ ] `backend/middleware/fileAccess.js` - Access control
- [ ] `backend/routes/changeRequests.js` - DCR endpoints
- [ ] `backend/routes/admin.js` - Admin endpoints
- [ ] All required npm packages in package.json

---

## Server Startup Verification

### Start Server
```bash
cd backend
npm start
```

- [ ] Server starts without errors
- [ ] Server listens on port 4550
- [ ] Database connection successful
- [ ] Upload directories created if missing
- [ ] All routes registered
- [ ] Console shows: "🚀 Server running on http://localhost:4550"

### Health Check
```bash
curl http://localhost:4550/
```
- [ ] Server responds to requests
- [ ] No 404 errors for root path
- [ ] Check server logs for any warnings

---

## Authentication Testing

### User Login (as Requester)
```bash
curl -X POST http://localhost:4550/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"employee_code": "REQ001", "password": "req123"}'
```

- [ ] Returns 200 status
- [ ] Response contains user object with id, name, role
- [ ] Response contains employee_code
- [ ] Token can be used for subsequent requests

### Login as Different Roles
- [ ] ADMIN (ADM001) login successful
- [ ] MANAGER (MGR001) login successful
- [ ] QMR (QMR001) login successful
- [ ] DOCUMENT_CONTROL (DOC001) login successful

---

## Document Change Request Workflow

### Stage 1: Create Draft DCR
```bash
curl -X POST http://localhost:4550/api/change-requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer REQ_TOKEN" \
  -d '{"document_id": 1, "reason": "Update process parameters"}'
```

- [ ] Returns 201 status
- [ ] Response includes change_request_id
- [ ] Status is "Draft"
- [ ] DCR can be retrieved with GET /api/change-requests/:id

### Stage 2: Submit DCR
```bash
curl -X POST http://localhost:4550/api/change-requests/:id/submit \
  -H "Authorization: Bearer REQ_TOKEN"
```

- [ ] Returns 200 status
- [ ] Status changes to "Submitted"
- [ ] Manager assigned (assigned_manager_id returned)
- [ ] Notification created for manager
- [ ] Audit event recorded

### Stage 3: Manager Initial Decision - Approve
```bash
curl -X POST http://localhost:4550/api/change-requests/:id/decision \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MGR_TOKEN" \
  -d '{"decision": "Approve", "comment": "Approved for editing"}'
```

- [ ] Returns 200 status
- [ ] Status changes to "Pre-Approved"
- [ ] Response includes downloadLink with signed URL
- [ ] Notification sent to requester
- [ ] ApprovalRecord created with decision

### Manager Initial Decision - Reject
```bash
curl -X POST http://localhost:4550/api/change-requests/:id2/decision \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MGR_TOKEN" \
  -d '{"decision": "Reject", "comment": "Does not align with strategy"}'
```

- [ ] Returns 200 status
- [ ] Status changes to "Rejected"
- [ ] Notification sent to requester with comment
- [ ] ApprovalRecord created with Reject decision
- [ ] No download link provided

### File Access via Signed URL
- [ ] Generate signed URL in Pre-Approved state
- [ ] URL format: `/api/change-requests/download/:token`
- [ ] Token valid for 24 hours
- [ ] Can download file without authentication
- [ ] Access logged in AuditEvent

### Stage 4: Upload Revised Files
```bash
curl -X POST http://localhost:4550/api/change-requests/1/upload \
  -H "Authorization: Bearer REQ_TOKEN" \
  -F "source=@updated_doc.docx" \
  -F "pdf=@updated_doc.pdf"
```

- [ ] Returns 200 status
- [ ] Status changes to "Pending Approval"
- [ ] Response includes revision_id
- [ ] Files verified with hash computation
- [ ] Original file stored in doc-original directory
- [ ] PDF file stored in doc-pdf directory
- [ ] Notification sent to manager
- [ ] AuditEvent created with file hashes

### Stage 5: Manager Final Review - Approve
```bash
curl -X POST http://localhost:4550/api/change-requests/1/review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MGR_TOKEN" \
  -d '{"decision": "Approve", "comment": "Final approval granted"}'
```

- [ ] Returns 200 status
- [ ] Status changes to "Approved"
- [ ] DocumentRevision status changes to "Released"
- [ ] Document.current_revision_id updated to new revision
- [ ] Previous revision marked "Obsolete"
- [ ] Notification sent to requester
- [ ] ApprovalRecord created with final decision
- [ ] AuditEvent recorded

### Manager Final Review - Return for Revision
```bash
curl -X POST http://localhost:4550/api/change-requests/1/review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MGR_TOKEN" \
  -d '{"decision": "Return", "comment": "Please clarify section 3.2"}'
```

- [ ] Returns 200 status
- [ ] Status changes to "Returned for Revision"
- [ ] Notification sent to requester with comment
- [ ] Requester can upload again (goes back to Stage 4)
- [ ] ApprovalRecord created with Return decision

---

## List and Retrieve Operations

### Get User's Change Requests
```bash
curl -X GET http://localhost:4550/api/change-requests \
  -H "Authorization: Bearer REQ_TOKEN"
```

- [ ] Returns list of user's DCRs
- [ ] Can filter by role (requester/manager)
- [ ] Can filter by status
- [ ] Includes document information

### Get DCR Details
```bash
curl -X GET http://localhost:4550/api/change-requests/1 \
  -H "Authorization: Bearer REQ_TOKEN"
```

- [ ] Returns complete DCR information
- [ ] Includes approvals array
- [ ] Includes revisions array
- [ ] Contains manager and requester names

### Get Approval History
```bash
curl -X GET http://localhost:4550/api/change-requests/1/history \
  -H "Authorization: Bearer REQ_TOKEN"
```

- [ ] Returns approval records
- [ ] Returns audit events
- [ ] Shows decision history
- [ ] Shows timestamps and actors

---

## File Access Control Testing

### Test PDF Access (All Users)
- [ ] Regular CHANGE_REQUESTER can view PDF
- [ ] User can see PDFs in document list
- [ ] PDF download works for all users
- [ ] PDF file can be opened

### Test Original File Access (Restricted)
- [ ] CHANGE_REQUESTER cannot view original files
- [ ] MANAGER can view original files
- [ ] QMR can view original files
- [ ] ADMIN can view original files
- [ ] DOCUMENT_CONTROL can view original files
- [ ] Access attempt logged in AuditEvent

### Test File Integrity
- [ ] Original file SHA256 hash computed
- [ ] PDF file SHA256 hash computed
- [ ] Hashes stored in DocumentRevision table
- [ ] Hashes do not change on read access
- [ ] Can verify file integrity by comparing hashes

---

## Admin & Compliance Functions

### Create Role
```bash
curl -X POST http://localhost:4550/api/admin/roles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"name": "REVIEWER"}'
```

- [ ] Returns 201 status
- [ ] New role created
- [ ] Duplicate role names rejected
- [ ] AuditEvent recorded

### Assign Role to User
```bash
curl -X PUT http://localhost:4550/api/admin/users/5/role \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"role_id": 3}'
```

- [ ] Returns 200 status
- [ ] User role updated
- [ ] AuditEvent recorded
- [ ] User's permissions change on next request

### Get Audit Trail
```bash
curl -X GET http://localhost:4550/api/admin/audit/ChangeRequest/1 \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

- [ ] Returns list of events
- [ ] Events include action, actor, timestamp
- [ ] Metadata includes relevant details
- [ ] Events sorted by timestamp descending

### Get User Audit Events
```bash
curl -X GET "http://localhost:4550/api/admin/audit/user/5?start_date=2026-02-01&end_date=2026-02-28" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

- [ ] Returns user's activities
- [ ] Can filter by date range
- [ ] Includes file access logs
- [ ] Shows operation count

### Generate Compliance Report
```bash
curl -X GET "http://localhost:4550/api/admin/compliance-report?start_date=2026-02-01&end_date=2026-02-28" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

- [ ] Returns IATF 16949 compliant report
- [ ] Includes change request events
- [ ] Includes approval records
- [ ] Contains summary statistics
- [ ] Shows generated timestamp

### Get Document Revisions
```bash
curl -X GET http://localhost:4550/api/admin/document/1/revisions \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

- [ ] Returns document information
- [ ] Lists all revisions
- [ ] Lists change requests
- [ ] Shows current revision
- [ ] Shows revision status

### Get Change Request Approvals
```bash
curl -X GET http://localhost:4550/api/admin/change-request/1/approvals \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

- [ ] Returns approval history
- [ ] Lists all approval records
- [ ] Shows decision history
- [ ] Includes audit events

---

## Notification System

### Verify Notifications Created
- [ ] Notification table has records
- [ ] Notifications linked to correct users
- [ ] Message content is appropriate
- [ ] Metadata includes CR ID and document ID
- [ ] Timestamps are accurate

### Verify Notification Types
- [ ] DCR_SUBMITTED notification created on submit
- [ ] DCR_PRE_APPROVED notification sent on pre-approve
- [ ] DCR_REJECTED notification sent on reject
- [ ] REVISION_UPLOADED notification sent on upload
- [ ] DCR_RETURNED_FOR_REVISION notification sent on return
- [ ] DCR_APPROVED notification sent on final approve

### Notification Metadata
- [ ] Download link included in PRE_APPROVED
- [ ] Comment included in rejection/return notifications
- [ ] Action field indicates what requester/manager should do
- [ ] Metadata parseable as JSON

---

## Database Integrity

### Verify Foreign Keys
- [ ] ChangeRequest.document_id references valid Document
- [ ] ChangeRequest.requester_id references valid user
- [ ] ChangeRequest.manager_id references valid user
- [ ] DocumentRevision.document_id references valid Document
- [ ] ApprovalRecord.cr_id references valid ChangeRequest

### Verify Constraints
- [ ] Cannot create DCR without reason
- [ ] Cannot submit DCR not in Draft state
- [ ] Cannot approve if already in different state
- [ ] File releases require both PDF and hash
- [ ] Status values are valid

### Verify Indexes
- [ ] Query performance acceptable
- [ ] No SELECT queries timeout
- [ ] Batch operations complete in reasonable time

---

## Error Handling

### Invalid Input Handling
```bash
curl -X POST http://localhost:4550/api/change-requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer REQ_TOKEN" \
  -d '{"document_id": 1}'
```

- [ ] Returns 400 status
- [ ] Error message indicates missing reason
- [ ] Response is valid JSON

### Missing Required Fields
- [ ] DCR without document_id rejected
- [ ] DCR without reason rejected
- [ ] Decision without decision type rejected
- [ ] Upload without files rejected

### Invalid State Transitions
- [ ] Cannot approve draft (must submit first)
- [ ] Cannot upload to Draft CR
- [ ] Cannot review before upload
- [ ] Cannot submit already-submitted CR
- [ ] Appropriate error messages returned

### Role-Based Access Control
- [ ] Non-manager cannot make decisions
- [ ] Non-requester cannot upload for other requester
- [ ] Non-admin cannot create roles
- [ ] Non-owner cannot access other's files (general)

---

## Performance & Stress Testing

### Basic Load Test
- [ ] Server handles 10 concurrent requests
- [ ] Response time under 1 second per request
- [ ] No memory leaks detected
- [ ] CPU usage stays reasonable

### Large File Upload
- [ ] Can upload 50MB file successfully
- [ ] Rejects files > 50MB
- [ ] File integrity maintained after upload
- [ ] Timeout doesn't occur

### Database Performance
- [ ] Listing 100 DCRs executes quickly
- [ ] Compliance report generation completes
- [ ] Audit trail queries efficient
- [ ] No query timeout errors

---

## Documentation Verification

### Guide Completeness
- [ ] DCR_WORKFLOW_GUIDE.md covers all stages
- [ ] SETUP_GUIDE.md has working examples
- [ ] DATABASE_SCHEMA.md documents all tables
- [ ] IMPLEMENTATION_SUMMARY.md accurate

### API Documentation
- [ ] All endpoints documented
- [ ] Request/response examples provided
- [ ] Error codes documented
- [ ] Status codes explained

### Troubleshooting Guides
- [ ] Common issues covered
- [ ] Solutions are correct
- [ ] Commands tested and working

---

## Security Verification

### Authentication
- [ ] JWT tokens required for protected endpoints
- [ ] Invalid tokens rejected
- [ ] Expired tokens rejected
- [ ] Token payload contains user info

### Authorization
- [ ] Role checks enforced
- [ ] Unauthorized users get 403 status
- [ ] Admin-only endpoints protected
- [ ] Manager-only endpoints protected

### File Access
- [ ] Original files restricted by role
- [ ] PDF files accessible to all authenticated
- [ ] Signed URLs expire after 24 hours
- [ ] Expired URLs rejected

### Input Validation
- [ ] SQL injection attempts fail
- [ ] XSS payloads sanitized where needed
- [ ] File type validation enforced
- [ ] File size limits enforced

---

## Production Readiness

### Code Quality
- [ ] No console.log statements in critical paths
- [ ] Error handling comprehensive
- [ ] No hardcoded credentials
- [ ] No TODO comments in production code
- [ ] Code follows consistent style

### Configuration
- [ ] Environment variables can be set
- [ ] Database connection configurable
- [ ] Upload paths configurable
- [ ] No hardcoded paths

### Monitoring
- [ ] Server logs errors
- [ ] Request logging available
- [ ] Error tracking functional
- [ ] Database errors visible

### Backup & Recovery
- [ ] Database can be backed up
- [ ] File uploads can be backed up
- [ ] Recovery procedures documented
- [ ] Restore tested

---

## MSA (Measurement System Analysis) Testing

### MSA API Endpoints
- [ ] `GET /api/msa` returns empty list initially
- [ ] `POST /api/msa` creates a Bias study with detail
- [ ] `POST /api/msa` creates a GR&R study with detail
- [ ] `POST /api/msa` creates a Stability study with detail
- [ ] `GET /api/msa?type=bias` filters by study type
- [ ] `GET /api/msa/:id` returns study with correct detail
- [ ] `PUT /api/msa/:id` updates study header and upserts detail
- [ ] `DELETE /api/msa/:id` removes study and cascades to detail
- [ ] `GET /api/msa/stats/summary` returns correct counts and result breakdown
- [ ] 400 returned when study_type or equipment_no missing
- [ ] 400 returned when study_type is invalid
- [ ] 404 returned for non-existent study ID
- [ ] Requires JWT authentication (401 without token)

### Bias Study
- [ ] Can enter 15 readings against a reference value
- [ ] Mean, Std Dev, Range calculated correctly
- [ ] Bias = Mean − Reference Value
- [ ] t-Statistic = |Bias| / (σ / √n)
- [ ] 95% CI Lower/Upper calculated correctly
- [ ] Result = ACCEPTABLE when |t| < t-critical
- [ ] Result = NOT ACCEPTABLE when |t| ≥ t-critical
- [ ] Badge color green for ACCEPTABLE, red for NOT ACCEPTABLE

### GR&R Study
- [ ] Can configure appraisers (default 3), trials (3), parts (6)
- [ ] Readings grid renders correctly for all appraisers × trials × parts
- [ ] R̄ (average range) calculated correctly
- [ ] EV = K1 × R̄ computed correctly per MSA 4th edition constants
- [ ] AV = √((X̄diff × K2)² − (EV² / (n × r))) computed correctly
- [ ] GRR = √(EV² + AV²) computed correctly
- [ ] PV = Rp × K3 computed correctly
- [ ] TV = √(GRR² + PV²) computed correctly
- [ ] %GRR = (GRR / TV) × 100 displayed correctly
- [ ] NDC = floor(1.41 × PV / GRR) displayed correctly
- [ ] ACCEPTABLE (≤10%), MARGINAL (10–30%), NOT ACCEPTABLE (>30%) badges correct

### Stability Study
- [ ] Can configure subgroups (default 20) and readings per subgroup (default 3)
- [ ] Readings grid renders correctly
- [ ] X̄ values and Range values calculated per subgroup
- [ ] X̄ chart CL = grand mean, UCL/LCL = CL ± A2 × R̄
- [ ] R chart CL = R̄, UCL = D4 × R̄, LCL = 0 (for n ≤ 6)
- [ ] σ = R̄ / d2 computed correctly
- [ ] %Stability = ((X̄max − X̄min) / 6σ) × 100 computed correctly
- [ ] ACCEPTABLE when %Stability ≤ 10%, otherwise NOT ACCEPTABLE

### MSA Frontend
- [ ] Study list table loads and displays all studies
- [ ] Search by equipment number/name/part works
- [ ] Filter dropdown for study type works
- [ ] New Study button opens form
- [ ] Tab switching between Bias / GR&R / Stability works
- [ ] Detail modal opens with read-only data for each study type
- [ ] Delete confirmation works (privileged roles only)
- [ ] Form validation prevents empty required fields

---

## Final Sign-Off

### Functional Requirements
- [ ] All workflow stages implemented
- [ ] All APIs functional
- [ ] All database operations working
- [ ] File management complete
- [ ] Notifications functional
- [ ] Audit trail complete
- [ ] Compliance reporting working

### Non-Functional Requirements
- [ ] IATF 16949 compliant
- [ ] Performance acceptable
- [ ] Security measures in place
- [ ] Error handling comprehensive
- [ ] Documentation complete
- [ ] Code quality high
- [ ] Scalability considered

### Ready for Production
- [ ] ✅ All tests passed
- [ ] ✅ All documentation complete
- [ ] ✅ Security review completed
- [ ] ✅ Performance verified
- [ ] ✅ Backup procedures in place
- [ ] ✅ Team trained
- [ ] ✅ **APPROVED FOR DEPLOYMENT**

---

## Deployment Approval

**Tested By:** ________________  
**Date:** ________________  
**Approved By:** ________________  
**Deployment Date:** ________________  

---

**Testing Complete: IATF 16949 DCR Workflow Implementation Ready for Production**
