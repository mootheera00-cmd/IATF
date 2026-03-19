# Complete IATF DCR System - Integration & Architecture Guide

## 📋 Project Overview

**NSK IATF 16949 Document Change Request (DCR) System**
- **Type**: Web Application for document control and change management
- **Compliance**: IATF 16949 (Automotive Quality Management)
- **Status**: Production Ready (v1.0)
- **Architecture**: Monolithic web app with REST API backend
- **Tech Stack**: Node.js/Express (Backend) + React/Vite (Frontend)

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React 19)                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Pages: Login, Dashboard, DCRList, CreateDCR,        │  │
│  │        DCRDetail, UploadRevision, Documents, Admin  │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ API Client (Axios) + Auth Context + Layout          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────┬──────────────────────────────────────────────────┘
          │ HTTP/REST (http://localhost:3000/api)
          │
┌─────────▼──────────────────────────────────────────────────┐
│                 Backend (Node.js/Express)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Routes: auth, dcr, admin, audit, notifications      │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Services: DCR, File, Audit, Notification, SignedUrl │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Middleware: Auth, Logger, Permissions, Validation   │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Database: SQLite3 (12 tables, ACID compliant)        │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ File Storage: /uploads (original/ + pdf/)            │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## 📊 Database Schema (12 Tables)

### Core Tables

**roles**
- `id`, `name` (ADMIN, MANAGER, QMR, CHANGE_REQUESTER, DOCUMENT_CONTROL)
- Timestamps

**users**
- `id`, `employee_code`, `name`, `password_hash`, `role_id`
- `department`, `email`, `is_active`
- Timestamps

**Document**
- `id`, `title`, `document_type`, `current_revision_id`
- `department`, `is_active`
- Timestamps

**DocumentRevision**
- `id`, `document_id`, `revision_number`, `file_path_original`, `file_path_pdf`
- `status` (Draft, Released), `hash_original`, `hash_pdf`, `released_by_id`
- Timestamps

### Workflow Tables

**ChangeRequest**
- `id`, `document_id`, `requester_id`, `reason`
- `status` (Draft, Submitted, Pending Approval, Pre-Approved, Revision Pending, Approved, Released, Rejected)
- `assigned_manager_id` (auto-calculated from document department)
- Timestamps

**ApprovalRecord**
- `id`, `change_request_id`, `approver_id`
- `gate` (A = Pre-Approval, B = Final), `decision` (Approved/Rejected)
- `comments`, `approved_at`

### Support Tables

**AuditEvent**
- `id`, `entity_type`, `entity_id`, `event_type`, `user_id`
- `old_value`, `new_value`, `timestamp`

**Notification**
- `id`, `user_id`, `type`, `related_cr_id`
- `message`, `is_read`, `created_at`

**SignedUrlToken**
- `id`, `token`, `cr_id`, `file_type`, `expires_at`

**Positions** (for department->manager mapping)
- `id`, `position_name`, `department`, `assigned_user_id`

---

## 🔄 Workflow Stages

### The 5-Gate Approval Process

```
┌─ Stage 1: INITIAL SUBMISSION ─┐
│ User creates DCR              │
│ Status: Draft → Submitted     │
│ Event: DCR_SUBMITTED          │
└──────────────┬────────────────┘

┌─ Stage 2: MANAGER PRE-APPROVAL ─┐
│ Manager reviews reason           │
│ Decision: Approve/Reject         │
│ Status: Submitted → Pre-Approved │
│          OR Rejected             │
│ Event: DCR_PRE_APPROVED/REJECTED │
└──────────────┬────────────────┘
          [IF REJECTED]
         (Workflow Ends)
               │
          [IF APPROVED]
               ▼
┌─ Stage 3: REVISION UPLOAD ─┐
│ Requester uploads:          │
│  - .docx (original)         │
│  - .pdf (release version)   │
│ SHA256 hash computed        │
│ Status: Pre-Approved →      │
│   Revision Pending          │
│ Event: REVISION_UPLOADED    │
└──────────────┬────────────┘

┌─ Stage 4: QMR FINAL REVIEW ─┐
│ QMR/Admin reviews files     │
│ Decision: Approve/Return    │
│ Status: Revision Pending →  │
│   Approved OR → Returned    │
│ Event: DCR_APPROVED/RETURNED│
└──────────────┬────────────┘
          [IF RETURNED]
      (Back to Stage 3)
               │
          [IF APPROVED]
               ▼
┌─ Stage 5: DOCUMENT RELEASE ─┐
│ Document control publishes  │
│ Update current_revision_id  │
│ Status: Approved → Released │
│ Event: DOCUMENT_RELEASED    │
└─────────────────────────────┘
```

---

## 👥 Role-Based Access Control

| Role | Create CR | Approve Gate A | Approve Gate B | Upload Files | Release Docs | View Audit |
|------|-----------|---|---|---|---|---|
| CHANGE_REQUESTER | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| DOCUMENT_CONTROL | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| MANAGER | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| QMR | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 🔐 Authentication & Security

### Login Flow
1. User submits `employee_code` + `password`
2. Backend validates against `users` table (bcrypt)
3. Issue JWT token (valid 24 hours)
4. Frontend stores token in localStorage
5. Frontend includes token in all API requests

### Request Security
```
Header: Authorization: Bearer <JWT_TOKEN>
```

### Token Validation
- Checked on every protected route
- Invalid/expired → redirect to login
- Roles verified for each endpoint

### File Security
- SHA256 hashing for integrity verification
- Separate storage: `original/` (restricted) vs `pdf/` (release)
- Signed URLs with 24-hour expiry for downloads
- File type validation (only .docx and .pdf)
- File size limits enforced

---

## 📡 API Endpoints (17 Total)

### Authentication (3)
```
POST /auth/login
POST /auth/logout (client-side only)
GET /auth/me (verify current user) - ready
```

### Change Requests (9)
```
POST /change_requests                    [Create DCR]
POST /change_requests/:id/submit         [Submit after creation]
GET /change_requests                     [List by role]
GET /change_requests/:id                 [View details]
POST /change_requests/:id/decision       [Approve/Reject Gate A]
POST /change_requests/:id/upload-revision [Upload files]
POST /change_requests/:id/final-review   [Approve/Return Gate B]
GET /change_requests/:id/download/:type  [Download file]
GET /change_requests/:id/history         [Timeline data]
```

### Notifications (3)
```
GET /notifications                       [List unread]
POST /notifications/:id/read             [Mark as read]
GET /notifications/unread-count          [Badge count]
```

### Admin & Audit (6)
```
GET /admin/audit-trail/:entity/:id       [Audit trail]
GET /admin/user-audit/:user_id           [User activity]
POST /admin/compliance-report            [Generate report]
GET /admin/cr-approvals/:status          [Report data]
GET /admin/document-revisions/:doc_id    [History]
POST /admin/roles/:role_id/assign        [User assignment]
```

---

## 📁 File Structure

### Backend
```
backend/
├── server.js                    # Entry point
├── package.json                 # Dependencies
├── config/
│   ├── config.js               # Database config
│   └── storage.js              # File storage config
├── db/
│   └── init_db.js              # Database initialization
├── controllers/
│   └── authController.js       # Auth logic
├── routes/
│   ├── auth.js                 # Auth endpoints
│   ├── changeRequests.js       # DCR endpoints (9)
│   ├── admin.js                # Admin endpoints (8)
│   ├── audit.js                # Audit endpoints
│   └── ...                     # Other routes
├── services/
│   ├── dcrService.js           # DCR workflow (568 lines)
│   ├── fileService.js          # File handling
│   ├── auditService.js         # Audit logging
│   ├── notificationService.js  # Notifications
│   └── signedUrlService.js     # Secure downloads
├── middleware/
│   ├── auth.js                 # JWT verification
│   ├── permissions.js          # Role checking
│   ├── logger.js               # Request logging
│   ├── validateUpload.js       # File validation
│   └── validation.js           # Input validation
├── migrations/
│   ├── 20260217_0859_create_roles_and_users.sql
│   ├── 20260217_0900_create_document.sql
│   ├── 20260217_0901_create_document_revision.sql
│   ├── 20260217_0902_create_change_request.sql
│   ├── 20260217_0903_create_approval_audit.sql
│   ├── 20260217_0904_fk_current_revision.sql
│   ├── 20260217_0905_chk_released_has_pdf.sql
│   └── ... (more migrations)
├── seeds/
│   ├── seed_admin.js           # Create test users
│   ├── seed_documents.js       # Create test docs
│   └── ...
├── tools/
│   ├── hash.js                 # Password hashing
│   ├── reset_admin_password.js # Admin reset utility
│   └── ...
└── uploads/                    # File storage
    ├── doc-original/           # .docx files
    └── doc-pdf/                # .pdf files
```

### Frontend
```
frontend/
├── src/
│   ├── components/
│   │   └── Layout.jsx          # Main layout
│   ├── contexts/
│   │   └── AuthContext.jsx     # Auth state
│   ├── pages/
│   │   ├── Login.jsx           # 1. Entry
│   │   ├── Dashboard.jsx       # 2. Overview
│   │   ├── DCRList.jsx         # 3. List CRs
│   │   ├── CreateDCR.jsx       # 4. Create CR
│   │   ├── DCRDetail.jsx       # 5. View/Approve
│   │   ├── UploadRevision.jsx  # 6. Upload files
│   │   ├── Documents.jsx       # 7. Browse docs
│   │   └── Admin.jsx           # 8. Admin panel
│   ├── api.js                  # API client
│   ├── App.jsx                 # Router
│   ├── main.jsx                # Entry
│   └── index.css               # Tailwind
├── FRONTEND_SETUP.md           # Setup guide
├── FRONTEND_TESTING.md         # Test checklist
├── IMPLEMENTATION_SUMMARY.md   # Feature list
└── package.json                # Dependencies
```

---

## 🚀 Getting Started - Complete Setup

### Prerequisites
- Node.js 16+
- npm or yarn
- Windows/MacOS/Linux terminal access

### 1. Clone Repository
```bash
git clone <repo>
cd IATF
```

### 2. Setup Backend

```bash
cd backend
npm install

# Configure database
npm run init-db
npm run seed-db

# Start backend server
npm run dev
```

Backend will run on `http://localhost:3000`

Verify:
```bash
curl http://localhost:3000/api/auth/login
# Should return 400 (missing credentials)
```

### 3. Setup Frontend

```bash
cd frontend
npm install

# Start dev server
npm run dev
```

Frontend will run on `http://localhost:5173`

### 4. Test the System

1. Open browser to `http://localhost:5173`
2. Login with test credentials:
   ```
   Employee Code: ADMIN001
   Password: Admin@123
   ```
3. You should be redirected to dashboard

---

## 🧪 Testing Workflow

### Prerequisites for Testing
- Backend: Running on port 3000
- Frontend: Running on port 5173
- Test users seeded in database
- Test documents and CRs created

### Quick Test Path

1. **Login as Requester**
   - Employee Code: `CHG001`
   - Password: `Requester@123`
   - Expected: Dashboard shows 0 CRs

2. **Create Change Request**
   - Go to Change Requests → New CR
   - Select document: "Assembly Process Documentation"
   - Reason: "Update assembly procedure for new equipment"
   - Click Create
   - Expected: Redirect to CR detail page

3. **Login as Manager**
   - Logout
   - Employee Code: `MGR001`
   - Password: `Manager@123`
   - Go to Change Requests
   - Expected: See the CR you just created

4. **Approve Change Request**
   - Click View on the CR
   - Scroll to "Your Decision"
   - Add comment: "Looks good"
   - Click Approve
   - Expected: Status changes to Pre-Approved

5. **Upload Revision (as Requester)**
   - Logout and login as `CHG001`
   - Go to Change Requests
   - Find your CR (now Pre-Approved)
   - Click View
   - Click "Upload Files"
   - Upload sample .docx and .pdf
   - Expected: Status changes to Awaiting Final Approval

6. **Final Approval (as QMR)**
   - Logout and login as `QMR001`
   - Go to Change Requests
   - Find your CR
   - Click View
   - Add comment: "Files verified"
   - Click Approve
   - Expected: Status changes to Approved

7. **Verify Audit Trail (as Admin)**
   - Logout and login as `ADMIN001`
   - Go to Admin → Audit Trail
   - Expected: See all events for this CR

---

## 📊 Database Initialization

### Automatic Setup
```bash
cd backend
npm run init-db    # Creates schema
npm run seed-db    # Creates test data
```

### Manual Setup
```sql
sqlite3 nsk_iatf.db < migrations/20260217_0859_create_roles_and_users.sql
sqlite3 nsk_iatf.db < migrations/20260217_0900_create_document.sql
# ... run all migrations in order
```

### Test Data
- 5 users (1 per role)
- 3 documents
- 5 sample change requests in various states
- Sample audit events
- Approval records

---

## 🔍 Troubleshooting

### Backend Issues

**Port 3000 already in use**
```bash
# Windows
netstat -ano | findstr :3000

# Mac/Linux
lsof -i :3000
```

**Database locked error**
```bash
# Delete database and reseed
rm nsk_iatf.db
npm run init-db
npm run seed-db
```

**Module not found**
```bash
rm -rf node_modules package-lock.json
npm install
```

### Frontend Issues

**Cannot connect to backend**
- Check backend running on port 3000
- Verify API_URL in `src/api.js`
- Check browser console for CORS errors

**Login fails but backend seems OK**
- Check test users created in database
- Check password hashes correct
- Review backend console for auth errors

**Styles not working**
- Clear browser cache
- Restart dev server
- Check tailwind.config.js paths

---

## 📈 Performance & Scaling

### Current Setup
- Single SQLite database (fine for <1000 CRs)
- File storage on local disk
- No caching layer
- Single-threaded Node.js

### For Production (10,000+ users)
1. Migrate to PostgreSQL
2. Add Redis for caching
3. Implement load balancing (PM2, Nginx)
4. Move files to cloud storage (S3)
5. Add CDN for static assets
6. Implement WebSocket for real-time updates
7. Add logging aggregation (ELK, Datadog)

---

## 📚 Documentation Files

In the repository:
1. **BACKEND_SETUP.md** - Backend installation
2. **SCHEMA_REFERENCE.md** - Database tables
3. **IATF_WORKFLOW.md** - Detailed workflow explanation
4. **IMPLEMENTATION_SUMMARY.md** - Backend feature list
5. **TESTING_CHECKLIST.md** - Backend test cases
6. **FRONTEND_SETUP.md** - Frontend installation
7. **FRONTEND_TESTING.md** - Frontend test cases
8. **IMPLEMENTATION_SUMMARY.md** (frontend) - Frontend features
9. **This File** - Complete integration guide

---

## ✅ Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Environment variables set (.env file)
- [ ] Database backed up
- [ ] File uploads location verified
- [ ] CORS configured for frontend domain
- [ ] JWT secret set securely
- [ ] Email notifications configured
- [ ] File size limits appropriate

### Deployment
- [ ] Backend: `npm run build` or `npm start`
- [ ] Frontend: `npm run build` → host dist/ folder
- [ ] Verify API connectivity
- [ ] Test login with production users
- [ ] Check file uploads working
- [ ] Run smoke tests
- [ ] Monitor error logs
- [ ] Set up backups

### Post-Deployment
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify email notifications
- [ ] Test all user roles
- [ ] Run full test suite
- [ ] Document deployment date/version
- [ ] Set up monitoring/alerts

---

## 📞 Support & Maintenance

### Regular Maintenance
1. **Weekly**: Check error logs, verify backups
2. **Monthly**: Clean up old audit logs, optimize DB
3. **Quarterly**: Security patches, dependency updates
4. **Yearly**: Compliance audit, capacity planning

### Getting Help
- Check documentation files first
- Review error messages in console
- Check database integrity
- Verify all dependencies installed
- Re-read workflow documentation

---

## 🎯 Summary

**✅ Completed:**
- Full IATF 16949 compliant backend (v1.0)
- Complete React frontend (v1.0)
- Database schema with 12 tables
- All 17 API endpoints
- 5-stage approval workflow
- File management with integrity checking
- Role-based access control
- Comprehensive audit trail
- Notification system
- Complete documentation
- Testing guides for both frontend and backend

**Project Ready for:** Testing, Training, Production Deployment

**Estimated Setup Time:** 15-30 minutes
**Estimated Testing Time:** 4-8 hours
**Estimated Production Deploy:** 1-2 hours

---

**System Version**: 1.0
**Last Updated**: February 2026
**Status**: Production Ready ✅
