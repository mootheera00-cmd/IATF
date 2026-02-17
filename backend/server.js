const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const changeRequestsRoutes = require('./routes/changeRequests'); 
const adminRoutes = require('./routes/admin'); 
const workflowRoutes = require('./routes/workflow');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = 3000;
const { ORIGINAL_DIR, PDF_DIR, STAGING_DIR } = require('./config/storage');
[ORIGINAL_DIR, PDF_DIR, STAGING_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
// เชื่อมต่อ Database
const dbPath = path.resolve(__dirname, 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbPath);

// Middleware
app.use(cors()); 
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

// ส่ง db ไปให้ routes (must be before route registration)
app.use((req, res, next) => {
  req.db = db;
  next();
});

// เปิดให้เข้าถึงไฟล์ PDF ในโฟลเดอร์ uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Register routes
app.use('/api/change-requests', changeRequestsRoutes); 
app.use('/api/admin', adminRoutes); 
app.use('/api/workflow', workflowRoutes);
app.use('/api/auth', authRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});