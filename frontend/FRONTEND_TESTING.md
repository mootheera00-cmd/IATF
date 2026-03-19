# Frontend Testing Guide

## Canonical Business Rules (Feb 2026)

Use this section as the source of truth when validating UI behavior.

### Role Permissions Matrix

- Engineer: request new document registration, request updates/edits, view published documents
- Leader: request new document registration, request updates/edits, view published documents
- Assistant Manager: request new document registration, request updates/edits, view published documents, check documents for new registrations/edits
- Manager: request new document registration, request updates/edits, view published documents, check documents for new registrations/edits, approve Level 3 and Level 4 documents
- President: request new document registration, request updates/edits, view published documents, approve Level 1 and Level 2 documents
- Document Controller: request new document registration, request updates/edits, view all documents, approve documents for system entry before publish, view old documents

### Document Categories (8)

- Quality Manual
- Procedure
- Work Instruction
- Support Document
- Outside Document
- Operation Standard
- Form
- Report

### Level Mapping

- Level 1: Quality Manual
- Level 2: Procedure
- Level 3: Work Instruction, Support Document, Outside Document, Operation Standard
- Level 4: Form, Report

### End-to-End Workflow Validation

#### New Registration Request
- [ ] Step 1: Engineer/Leader/Assistant Manager/Manager can open new registration request, select category, search/select document number suggestions, fill document name and short reason, then submit request
- [ ] Step 2: Document Controller receives notification/email and sees Approve + Reject actions
- [ ] Step 3: On Reject, Document Controller must provide comment; requester receives notification and can restart from Step 1
- [ ] Step 5: On Approve, requester receives notification, uploads PDF + Word/Excel, selects document checkers (Assistant Manager/Manager), selects approvers (Manager/President for Level 1/2), then submits for checking

#### Document Check Request
- [ ] Step 6: Selected checker (Assistant Manager or Manager) receives notification and can review details, reasons, PDF, and Word/Excel with Approve + Reject actions
- [ ] Step 7: On checker Reject, correction file/comment is provided, requester is notified, and flow returns to Step 5
- [ ] Step 9: On checker Approve, flow moves to approval request

#### Approval Request
- [ ] Step 9: Selected approver (Manager or President per level policy) receives notification and reviews details + attachments
- [ ] Step 10: On approver Reject with file/comment, requester is notified and returns to Step 5
- [ ] Step 12: On approver Approve, request moves to Document Controller storage check

#### Document Storage Request
- [ ] Step 12: Document Controller receives storage request and can Approve/Reject after checking reason and approved attachments
- [ ] Step 13: On controller Reject with file/comment, requester is notified and returns to Step 5

#### Finalization, Versioning, Publishing
- [ ] Effective date is assigned before publish
- [ ] Version auto-increments: new document starts at Rev. 01, next release becomes Rev. 02+
- [ ] When a new revision becomes Active, previous Active revision is automatically set to Obsolete
- [ ] Published views show PDF only (Form exception for watermark behavior), with viewer watermark using Master ID
- [ ] Word/Excel source files remain retained for controlled edits/updates

## 🧪 Testing Checklist

### Authentication Tests

#### Login Page
- [ ] Navigate to `http://localhost:5173/login`
- [ ] Test with invalid credentials (should show error)
- [ ] Test with valid credentials (each test user below)
- [ ] Verify redirect to dashboard on successful login
- [ ] Verify localStorage contains user data
- [ ] Check test credentials display shows all 5 roles
- [ ] Test logout (should redirect to login)

**Test Users:**
```
ADMIN001 / Admin@123 (ADMIN)
MGR001 / Manager@123 (MANAGER)
QMR001 / QMR@123 (QMR)
DOC001 / DocCtrl@123 (DOCUMENT_CONTROL)
CHG001 / Requester@123 (CHANGE_REQUESTER)
```

### Navigation Tests

#### Sidebar Navigation
- [ ] Verify sidebar collapses/expands with toggle button
- [ ] Check all menu items are visible when sidebar expanded
- [ ] Verify active page indicator highlights correctly
- [ ] Click each menu item and verify page changes:
  - [ ] Dashboard
  - [ ] Change Requests
  - [ ] Documents
  - [ ] Admin (only for ADMIN/QMR)
- [ ] Verify user profile shows name and role
- [ ] Click logout and verify redirect to login

### Dashboard Tests

#### Statistics Display
- [ ] Verify statistics cards show correct numbers
- [ ] Cards should display: Submitted, Pending, Approved, Rejected
- [ ] Check color coding of status indicators
- [ ] Verify count updates match actual data

#### Recent DCRs Table
- [ ] Table displays recent change requests
- [ ] Columns show: ID, Document, Status, Date
- [ ] Status badges have correct colors
- [ ] Clicking "View" navigates to DCR detail page
- [ ] Show empty state when no DCRs exist

### Change Request List Tests

#### Filtering & Search
- [ ] Search by DCR ID (e.g., "123")
- [ ] Search by document name
- [ ] Search by reason text
- [ ] Filter by status dropdown:
  - [ ] All
  - [ ] Submitted
  - [ ] Pending Approval
  - [ ] Approved
  - [ ] Rejected
  - [ ] Released
- [ ] Combine search + filter
- [ ] Show "No results" when no matches
- [ ] Clear filters returns all results

#### create Button (Requester Only)
- [ ] Button visible only for CHANGE_REQUESTER role
- [ ] Clicking button navigates to /dcr/create
- [ ] Button hidden for MANAGER/ADMIN/QMR roles

#### Table Actions
- [ ] Click "View" on any DCR
- [ ] Verify navigation to detail page
- [ ] Check all DCR data loads correctly

### Create DCR Tests

#### Form Validation
- [ ] Attempt submit without selecting document → error
- [ ] Attempt submit without reason → error
- [ ] Enter reason text and verify character count display
- [ ] Select document and verify selection persists
- [ ] Clear selection and re-select different document

#### Submission
- [ ] Fill form with valid data
  - Document: "Assembly Process Documentation"
  - Reason: "Update assembly procedure for new equipment"
- [ ] Click "Create Change Request"
- [ ] Verify loading state shows during submission
- [ ] Verify success message appears
- [ ] Check redirect to DCR detail page
- [ ] Verify new DCR appears in DCRList

#### Workflow Overview
- [ ] View the 5-step workflow description
- [ ] Verify correct order: Submit → Pre-Approval → Upload → Final → Released

#### Cancel Button
- [ ] Click Cancel
- [ ] Verify redirect to /dcr list

### DCR Detail Tests

#### View Details
- [ ] Page displays CR ID, status, document title
- [ ] Requester name visible
- [ ] Submitted date shows correctly
- [ ] Reason text displays in gray box
- [ ] Status badge shows correct color and text

#### Expand/Collapse Sections
- [ ] Click "Request Details" header to collapse
- [ ] Click again to expand
- [ ] Same for "Approval History" section
- [ ] Sections remember collapsed state on page

#### Manager Decision Panel (MANAGER/QMR only)
- [ ] Panel visible when status = "Submitted" or "Revision Pending"
- [ ] Text area for comments available
- [ ] "Approve" button visible and clickable
- [ ] "Reject" button visible and clickable
- [ ] Click Approve without comments → should succeed
- [ ] Click Reject without comments → error message
- [ ] Add comment and click Approve → loading state then success
- [ ] DCR status updates to new state
- [ ] Approval appears in history

#### Upload Revision Button (Pre-Approved CRs)
- [ ] Button visible for pre-approved CRs
- [ ] Blue info box explains what to do
- [ ] Clicking button navigates to /dcr/:id/upload
- [ ] Button hidden for non-approved CRs

#### Approval Timeline
- [ ] Each approval shows:
  - [ ] Decision (Approved/Rejected)
  - [ ] Approver name
  - [ ] Date/time
  - [ ] Comments (if provided)
- [ ] Chronological order (oldest first)
- [ ] Green checkmark for approvals, red X for rejections

### Upload Revision Tests

#### File Upload
- [ ] Try upload non-.docx file → error message
- [ ] Try upload non-.pdf in PDF field → error message
- [ ] Select valid .docx file → displays filename
- [ ] Select valid .pdf file → displays filename
- [ ] Upload button disabled until both files selected
- [ ] Click Submit Revision with valid files
- [ ] Verify loading state during upload
- [ ] Verify success message appears
- [ ] Check redirect to DCR detail page
- [ ] Status should now be "Awaiting Final Approval"

#### Info Box
- [ ] Verify all 4 notes about file requirements visible
- [ ] Text is clear and helpful

#### File Drag & Drop (Nice to Have)
- [ ] Drag .docx file into upload area
- [ ] Drag .pdf file into upload area
- [ ] Verify files are set and ready to upload

### Documents Page Tests

#### Browse Documents
- [ ] Page loads and displays document cards
- [ ] Each card shows:
  - [ ] File icon
  - [ ] Document title
  - [ ] Revision number
  - [ ] Status badge
  - [ ] File size
  - [ ] Approval date
- [ ] Responsive grid (1 column mobile, 2 tablet, 3 desktop)

#### Search Functionality
- [ ] Type in search box
- [ ] Results filter in real-time
- [ ] Empty search shows all documents
- [ ] Search is case-insensitive

#### Status Filter
- [ ] Filter by "Released" shows only released documents
- [ ] Filter by "Pending" shows pending documents
- [ ] Filter by "All Statuses" shows everything

#### Combine Search + Filter
- [ ] Enter search term + select status
- [ ] Results show only matching documents

#### Document Actions
- [ ] "Download" button visible and clickable
- [ ] "History" button visible and clickable
- [ ] No results message when search has no matches

### Admin Panel Tests

#### Tab Navigation
- [ ] Three tabs visible: Audit Trail, Users, Compliance Report
- [ ] Each tab can be clicked
- [ ] Content changes when switching tabs
- [ ] Current tab is highlighted

#### Audit Trail Tab
- [ ] Activity feed shows recent system activities
- [ ] Each entry shows:
  - [ ] Icon (checkmark/warning)
  - [ ] Activity description
  - [ ] Timestamp
  - [ ] User who took action
- [ ] Can scroll through activities

#### Users Tab
- [ ] User table displays
- [ ] Columns: Employee, Code, Role, Status
- [ ] Shows all active users
- [ ] Role badges have correct colors
- [ ] Status badges show "Active" in green

#### Compliance Report Tab
- [ ] Date range selection inputs visible
- [ ] "Generate Report" button clickable
- [ ] "Last Report Generated" section shows latest date
- [ ] "Download PDF" link visible

### Notification Bell Tests

#### Notification Bell
- [ ] Bell icon visible in header
- [ ] Red dot indicator visible
- [ ] Click bell to open dropdown
- [ ] Dropdown shows "No new notifications" when none exist
- [ ] Click outside to close dropdown
- [ ] Bell should display notifications when available (backend integration)

### Responsive Design Tests

#### Mobile (< 768px)
- [ ] Sidebar can be toggled collapsed
- [ ] Grid layouts stack to 1 column
- [ ] Tables become scrollable
- [ ] Forms are full width
- [ ] Buttons stack vertically
- [ ] Text is readable without horizontal scroll

#### Tablet (768px - 1024px)
- [ ] 2-column grids work properly
- [ ] Sidebar visible but can collapse
- [ ] Tables are readable
- [ ] Touch targets are appropriately sized

#### Desktop (> 1024px)
- [ ] 3-column grids display correctly
- [ ] Sidebar fully expanded
- [ ] All content visible without scrolling (when appropriate)
- [ ] Hover states work on interactive elements

### API Integration Tests

#### Network Requests
- [ ] Open DevTools Network tab
- [ ] Login → verify POST to /auth/login
- [ ] Dashboard → verify GET to /dcr/list
- [ ] Create DCR → verify POST to /dcr/create
- [ ] View DCR → verify GET to /dcr/:id
- [ ] Make decision → verify POST to /dcr/:id/decision
- [ ] Upload files → verify POST with multipart/form-data
- [ ] Check all requests include Authorization header with token

#### Error Handling
- [ ] Stop backend server
- [ ] Try to load dashboard → verify error message
- [ ] Try to create DCR → verify error message
- [ ] Verify error UI is clear and helpful
- [ ] Start backend again → verify recovery

### Local Storage Tests

#### Token Persistence
- [ ] Login as user
- [ ] Refresh page
- [ ] Verify still logged in (no redirect to login)
- [ ] Check localStorage for user data
- [ ] Clear localStorage
- [ ] Refresh page
- [ ] Verify redirected to login page

#### Token Expiration (if implemented)
- [ ] Login and note token time
- [ ] Wait for token expiry
- [ ] Try to access protected page
- [ ] Verify automatic logout and redirect to login

### Performance Tests

#### Page Load Times
- [ ] Dashboard should load in < 2 seconds
- [ ] DCR List with 10+ items should load in < 2 seconds
- [ ] Admin panel should load in < 1 second
- [ ] Network requests are batched (not waterfall)

#### Rendering Performance
- [ ] Tables with 50+ rows scroll smoothly
- [ ] Search/filter updates instantly
- [ ] No noticeable lag when typing in forms

### Accessibility Tests

#### Keyboard Navigation
- [ ] Tab through all interactive elements
- [ ] Buttons receive focus indicator
- [ ] Form inputs are properly labeled
- [ ] Menus are keyboard accessible

#### Color Contrast
- [ ] Text on colored backgrounds has sufficient contrast
- [ ] Form labels are readable
- [ ] Error messages use text + icon (not color alone)

#### Screen Reader (Optional)
- [ ] Headings are semantic (h1, h2, h3)
- [ ] Images have alt text
- [ ] Buttons have descriptive labels
- [ ] Form inputs have associated labels

### Cross-Browser Tests

- [ ] Chrome/Chromium (latest)
- [ ] Firefox (latest)
- [ ] Safari (if available)
- [ ] Edge (if available)

## Test Data Preparation

Before testing, ensure backend has:
- [x] 5 test users (one per role)
- [x] 3+ mock documents
- [x] 5+ mock change requests in various statuses
- [x] Sample approval records
- [x] Audit trail entries

## Regression Testing

After any code changes:
1. Run through "Critical Path" tests below
2. Then run full checklist

### Critical Path (Must Test)
- [ ] Login with each role
- [ ] Create new DCR
- [ ] View DCR detail
- [ ] Make approval decision
- [ ] Upload revision
- [ ] Navigate all pages
- [ ] Logout and login again

## Performance Benchmarks

| Operation | Target | Actual |
|-----------|--------|--------|
| Page load | < 2s | |
| Search filter | < 500ms | |
| Form submission | < 1s | |
| API response | < 500ms | |
| Route navigation | < 300ms | |

## Notes for Testers

- Use browser DevTools for investigating issues
- Screenshots helpful for documenting bugs
- Test on multiple browsers if possible
- Clear browser cache between major tests
- Keep backend logs open during testing
- Report issues with: Environment, Steps to Reproduce, Expected vs Actual
