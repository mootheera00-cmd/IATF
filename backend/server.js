const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
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
const incidentRoutes = require('./routes/incidents');

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
app.use('/api/incidents', incidentRoutes);

// POST /api/open-folder — opens a local folder path in Windows Explorer
const { authRequired } = require('./middleware/auth');

// ─── Shared Buttons API (all logged-in users share these) ───
app.get('/api/shared-buttons', authRequired, (req, res) => {
  req.db.all('SELECT id, label, path FROM shared_buttons ORDER BY created_at ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/shared-buttons', authRequired, (req, res) => {
  const { label, path } = req.body;
  if (!label || typeof label !== 'string' || !label.trim()) {
    return res.status(400).json({ error: 'label is required' });
  }
  const trimLabel = label.trim();
  const trimPath = (path && typeof path === 'string') ? path.trim() : '';
  req.db.run(
    'INSERT INTO shared_buttons (label, path, created_by) VALUES (?, ?, ?)',
    [trimLabel, trimPath, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, label: trimLabel, path: trimPath });
    }
  );
});

app.delete('/api/shared-buttons/:id', authRequired, (req, res) => {
  const btnId = Number(req.params.id);
  if (!btnId) return res.status(400).json({ error: 'Invalid button id' });
  req.db.run('DELETE FROM shared_buttons WHERE id = ?', [btnId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ─── KPI CSV Data API (shared across all users) ───
app.get('/api/kpi-csv', authRequired, (req, res) => {
  req.db.get('SELECT file_name, csv_json FROM kpi_csv_data WHERE id = 1', [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.json({ fileName: '', data: null });
    try {
      res.json({ fileName: row.file_name, data: JSON.parse(row.csv_json) });
    } catch {
      res.json({ fileName: row.file_name, data: null });
    }
  });
});

app.post('/api/kpi-csv', authRequired, (req, res) => {
  const { fileName, data } = req.body;
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'data (array) is required' });
  }
  const jsonStr = JSON.stringify(data);
  const name = (fileName && typeof fileName === 'string') ? fileName.trim() : '';
  req.db.run(
    `INSERT INTO kpi_csv_data (id, file_name, csv_json, uploaded_by, uploaded_at)
     VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET file_name = excluded.file_name, csv_json = excluded.csv_json, uploaded_by = excluded.uploaded_by, uploaded_at = CURRENT_TIMESTAMP`,
    [name, jsonStr, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.delete('/api/kpi-csv', authRequired, (req, res) => {
  req.db.run('DELETE FROM kpi_csv_data WHERE id = 1', [], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/open-folder', authRequired, (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath || typeof folderPath !== 'string') {
    return res.status(400).json({ error: 'folderPath is required' });
  }
  const normalized = folderPath.replace(/\//g, '\\');
  if (!/^([A-Za-z]:\\|\\\\)/.test(normalized)) {
    return res.status(400).json({ error: 'Invalid folder path format. Use a Windows absolute path, e.g. G:\\FolderName' });
  }
  try {
    // Use cmd /c start so Explorer opens in the foreground (not behind the browser)
    const child = spawn('cmd.exe', ['/c', 'start', '', normalized], { detached: true, stdio: 'ignore' });
    child.unref();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to open folder' });
  }
});

// Open access ONLY to PDF files (Controlled Copies)
// Master Source files in 'doc-original' must remain secure/hidden
app.use('/uploads/doc-pdf', express.static(path.join(__dirname, 'uploads', 'doc-pdf')));

// ─── Download open-folder setup files (for remote PCs) ───
app.get('/api/download-setup/openfolder.vbs', authRequired, (_req, res) => {
  const file = path.resolve(__dirname, '..', 'tools', 'openfolder.vbs');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Setup file not found' });
  res.download(file);
});
app.get('/api/download-setup/setup-openfolder.ps1', authRequired, (_req, res) => {
  const file = path.resolve(__dirname, '..', 'tools', 'setup-openfolder.ps1');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Setup file not found' });
  res.download(file);
});
// app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // BLOCKED: Do not expose root uploads

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});