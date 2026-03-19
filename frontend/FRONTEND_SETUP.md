# IATF DCR Frontend Setup & Running Guide

## 📋 Prerequisites

- **Node.js** 16+ and npm
- **Backend API** running on `http://localhost:3000/api`

## 🚀 Getting Started

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Configure Backend URL

Update `frontend/src/api.js` if your backend is running on a different URL:

```javascript
const API_URL = 'http://localhost:3000/api'; // Change this if needed
```

### 3. Start Development Server

```bash
npm run dev
```

The frontend will be available at: `http://localhost:5173`

### 4. Login with Test Credentials

The system supports 5 user roles. Use these test credentials:

| Role | Employee Code | Password |
|------|---|---|
| Admin | ADMIN001 | Admin@123 |
| Manager | MGR001 | Manager@123 |
| QMR | QMR001 | QMR@123 |
| Document Control | DOC001 | DocCtrl@123 |
| Change Requester | CHG001 | Requester@123 |

## 📁 Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   └── Layout.jsx           # Main layout with sidebar & header
│   ├── contexts/
│   │   └── AuthContext.jsx      # Authentication state management
│   ├── pages/
│   │   ├── Login.jsx            # Login page
│   │   ├── Dashboard.jsx        # Dashboard with stats
│   │   ├── DCRList.jsx          # List of change requests
│   │   ├── CreateDCR.jsx        # Create new change request
│   │   ├── DCRDetail.jsx        # View & manage change request
│   │   ├── UploadRevision.jsx   # Upload revised files
│   │   ├── Documents.jsx        # Browse documents
│   │   └── Admin.jsx            # Admin panel
│   ├── api.js                   # API client with Axios
│   ├── App.jsx                  # Main app with routing
│   ├── main.jsx                 # React DOM entry point
│   └── index.css                # Tailwind styles
├── package.json
├── tailwind.config.js
├── postcss.config.js
└── vite.config.mjs
```

## 🎯 Feature Overview

### Pages & Components

#### 1. **Login Page** (`Login.jsx`)
- Employee code & password authentication
- Test credentials display for reference
- Error handling with visual feedback
- Automatic navigation to dashboard on success

#### 2. **Dashboard** (`Dashboard.jsx`)
- Welcome message personalized by role
- Statistics cards (Submitted, Pending, Approved, Rejected)
- Recent change requests table
- Responsive layout for all screen sizes

#### 3. **Change Requests** (`DCRList.jsx`)
- List all change requests with filtering
- Search by ID, document name, or reason
- Filter by status (All, Submitted, Pending Approval, etc.)
- Quick view links to details
- "New Change Request" button for requesters

#### 4. **Create DCR** (`CreateDCR.jsx`)
- Select document from dropdown
- Enter reason for change
- Form validation with error display
- Workflow overview with 5 stages
- Success notification with redirect

#### 5. **DCR Details** (`DCRDetail.jsx`)
- View full change request information
- Approval history timeline
- Manager decision panel (Approve/Reject)
- Comment section for feedback
- Status tracking with color coding
- Upload revision button for pre-approved CRs

#### 6. **Upload Revision** (`UploadRevision.jsx`)
- Upload original document (.docx)
- Upload PDF version
- File validation before submission
- Important notes about file requirements
- Success notification

#### 7. **Documents** (`Documents.jsx`)
- Browse all controlled documents
- Search functionality
- Filter by status
- View revision history
- Download documents
- Responsive grid layout

#### 8. **Admin Dashboard** (`Admin.jsx`)
- **Audit Trail Tab**: View system activities for compliance
- **Users Tab**: Manage user accounts and roles
- **Compliance Report Tab**: Generate IATF reports by date range

#### 9. **Layout Component** (`Layout.jsx`)
- Responsive sidebar with collapsible menu
- Role-based navigation
- User profile section
- Notification bell (extensible)
- Header with current page title
- Logout functionality

### API Integration (`api.js`)

Axios-based API client with:
- **Request Interceptor**: Automatically adds JWT token from localStorage
- **Response Interceptor**: Handles 401 errors and redirects to login
- **Error Handling**: Consistent error messages across the app
- **Multipart Support**: File upload with FormData

**Available Endpoints:**

```javascript
// Authentication
authAPI.login(employee_code, password)

// Change Requests
dcrAPI.create(data)
dcrAPI.submit(id)
dcrAPI.list(role)
dcrAPI.getDetail(id)
dcrAPI.makeDecision(id, action, comments)
dcrAPI.uploadRevision(id, formData)
dcrAPI.getHistory(id)

// Notifications
notificationAPI.getAll()
notificationAPI.markAsRead(id)
notificationAPI.getUnreadCount()

// Admin
adminAPI.getAuditTrail(entity_id, entity_type)
adminAPI.getUserAudit(user_id)
adminAPI.getComplianceReport(date_range)
```

## 🔐 Authentication Flow

1. User enters credentials on **Login page**
2. API validates and returns JWT token + user data
3. Token stored in **localStorage** (key: `nsk_user`)
4. **AuthContext** manages user state globally
5. Protected routes redirect unauthorized users to login
6. Token automatically injected in all API requests
7. Invalid/expired tokens trigger automatic logout

## 🎨 Styling

- **Tailwind CSS 3.4**: Utility-first CSS framework
- **Responsive Design**: Works on mobile, tablet, desktop
- **Color Scheme**:
  - Primary: Indigo (`indigo-600`, `indigo-700`)
  - Success: Green
  - Warning: Orange/Yellow
  - Danger: Red
  - Neutral: Gray
- **Icons**: Lucide React icons throughout UI

## 🔄 Role-Based Features

### ADMIN
- Access to /admin dashboard
- View all change requests
- Approve/reject at any stage
- Generate compliance reports
- Manage users

### MANAGER
- View pending change requests
- Make pre-approval decisions
- Request revisions if needed
- Approve final submissions

### QMR (Quality Management Representative)
- Same as MANAGER
- Additional compliance reporting access

### CHANGE_REQUESTER
- Create new change requests
- Upload revision files
- Track status of own requests
- View document library

### DOCUMENT_CONTROL
- View approved documents
- Manage release process
- Browse document history

## 🚧 Building for Production

```bash
npm run build
npm run preview
```

Output will be in `dist/` directory.

## 🐛 Common Issues & Solutions

### "Cannot find module" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### Backend not accessible
- Check backend is running on port 3000
- Verify API_URL in `api.js` is correct
- Check CORS is enabled in backend

### Login not working
- Verify backend database has test users seeded
- Check credentials match backend configuration
- Review console for API error messages

### Styling not applied
- Ensure `npm run dev` is building CSS properly
- Clear browser cache (Ctrl+Shift+Delete)
- Check tailwind.config.js has correct content paths

## 📱 Responsive Breakpoints

- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

All components use Tailwind responsive classes (`md:`, `lg:`)

## 🔗 Related Documentation

- [Backend Setup Guide](/backend/BACKEND_SETUP.md)
- [Database Schema](/backend/SCHEMA_REFERENCE.md)
- [API Endpoints](/backend/IMPLEMENTATION_SUMMARY.md)
- [Workflow Guide](/backend/IATF_WORKFLOW.md)

## 📞 Support

For frontend-specific issues:
1. Check browser console for errors
2. Review network tab in DevTools for API issues
3. Verify localStorage contains valid token
4. Check that backend API is responding correctly
