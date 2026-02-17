const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const changeRequestsRoutes = require('./routes/changeRequests'); 
const documentsRoutes = require('./routes/documents'); 
const adminRoutes = require('./routes/admin'); 
const workflowRoutes = require('./routes/workflow');

const app = express();
const PORT = 3000;

// เชื่อมต่อ Database
const dbPath = path.resolve(__dirname, 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbPath);

// Middleware
app.use(cors()); 
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
app.use('/api/change-requests', changeRequestsRoutes); 
app.use('/api/documents', documentsRoutes); 
app.use('/api/admin', adminRoutes); 
app.use('/api/workflow', workflowRoutes);

// เปิดให้เข้าถึงไฟล์ PDF ในโฟลเดอร์ uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ส่ง db ไปให้ routes
app.use((req, res, next) => {
  req.db = db;
  next();
});

// นำเข้า Routes
const documentRoutes = require('./routes/documents');
const authRoutes = require('./routes/auth');

app.use('/api/documents', documentRoutes);
app.use('/api/auth', authRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});