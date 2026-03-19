const express = require('express');
const cors = require('cors');
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const changeRequestsRoutes = require('./routes/changeRequests'); 
const adminRoutes = require('./routes/admin'); 
const workflowRoutes = require('./routes/workflow');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const searchRoutes = require('./routes/search');
const documentRoutes = require('./routes/documents'); // Fixed relative path
const migrationRoutes = require('./routes/migration'); // IATF Migration Module
const notificationsRoutes = require('./routes/notifications');
const trainingRoutes = require('./routes/training');
const calibrationRoutes = require('./routes/calibration');

const app = express();
const PORT = Number(process.env.PORT) || 4550;
const { ORIGINAL_DIR, PDF_DIR, STAGING_DIR } = require('./config/storage');
[ORIGINAL_DIR, PDF_DIR, STAGING_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
// เชื่อมต่อ Database
const dbPath = path.resolve(__dirname, 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbPath);

// Middleware
app.use(cors()); 
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// ส่ง db ไปให้ routes (MUST come before routes)
app.use((req, res, next) => {
  req.db = db;
  next();
});

app.use('/api/change-requests', changeRequestsRoutes); 
app.use('/api/admin', adminRoutes); 
app.use('/api/admin', migrationRoutes); // Mount at /api/admin/migrate
app.use('/api/workflow', workflowRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/documents', documentRoutes); // Mount at /api/documents
app.use('/api/notifications', notificationsRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/calibration', calibrationRoutes);

// Open access ONLY to PDF files (Controlled Copies)
// Master Source files in 'doc-original' must remain secure/hidden
app.use('/uploads/doc-pdf', express.static(path.join(__dirname, 'uploads', 'doc-pdf')));
// app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // BLOCKED: Do not expose root uploads

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});