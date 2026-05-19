const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
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
const documentRoutes = require('./routes/documents');
const migrationRoutes = require('./routes/migration');
const notificationsRoutes = require('./routes/notifications');
const logsRoutes = require('./routes/logs');
const reportRoutes = require('./routes/report');
const trainingRoutes = require('./routes/training');
const calibrationRoutes = require('./routes/calibration');
const inhouseCalibrationRoutes = require('./routes/inhouseCalibration');
const calibrationHistoryRoutes = require('./routes/calibrationHistory');
const maintenanceRoutes = require('./routes/maintenance');
const incidentRoutes = require('./routes/incidents');
const msaRoutes = require('./routes/msa');
const riskAssessmentRoutes = require('./routes/riskAssessment');
const editRequestsRoutes = require('./routes/editRequests');

const app = express();
const PORT = Number(process.env.PORT) || 4550;
const { ORIGINAL_DIR, PDF_DIR, STAGING_DIR } = require('./config/storage');
[ORIGINAL_DIR, PDF_DIR, STAGING_DIR].forEach((d: string) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
const TEMP_DIRS = [STAGING_DIR, path.resolve(__dirname, 'tmp-test')];
const TEMP_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const cleanupTempDirectory = (dirPath: string, cutoff: number) => {
  if (!fs.existsSync(dirPath)) return { scanned: 0, deleted: 0 };
  let scanned = 0;
  let deleted = 0;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = cleanupTempDirectory(entryPath, cutoff);
      scanned += nested.scanned;
      deleted += nested.deleted;
      const remaining = fs.readdirSync(entryPath);
      if (remaining.length === 0) {
        try {
          fs.rmdirSync(entryPath);
        } catch (err) {
          console.warn('Failed to remove empty temp folder:', entryPath, err?.message || err);
        }
      }
      continue;
    }

    scanned += 1;
    try {
      const stats = fs.statSync(entryPath);
      if (stats.mtimeMs < cutoff) {
        fs.rmSync(entryPath, { force: true });
        deleted += 1;
      }
    } catch (err) {
      console.warn('Failed to cleanup temp file:', entryPath, err?.message || err);
    }
  }

  return { scanned, deleted };
};

const runTempCleanup = () => {
  const cutoff = Date.now() - TEMP_RETENTION_MS;
  TEMP_DIRS.forEach((dirPath) => {
    const result = cleanupTempDirectory(dirPath, cutoff);
    if (result.deleted > 0) {
      console.log(`🧹 Temp cleanup: ${dirPath} (deleted ${result.deleted}/${result.scanned})`);
    }
  });
};

const dbCandidates = [
  path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db'),
  path.resolve(__dirname, 'db', 'nskiatf_doccontrol.db'),
  path.resolve(process.cwd(), 'db', 'nskiatf_doccontrol.db')
];

const dbPath = dbCandidates.find((candidate: string) => fs.existsSync(candidate)) || dbCandidates[0];
if (!fs.existsSync(dbPath)) {
  console.warn(`⚠️ SQLite DB not found, creating new file at: ${dbPath}`);
} else {
  console.log(`✅ Using SQLite DB: ${dbPath}`);
}

const db = new sqlite3.Database(dbPath);

app.use(helmet());
const isDev = process.env.NODE_ENV !== 'production';
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173,http://133.124.150.22:5173').split(',').map((o: string) => o.trim())
);
app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow non-browser requests (e.g. curl, server-to-server) only in development
    if (!origin) return callback(null, isDev);
    // In development, allow all origins so LAN access works freely
    if (isDev) return callback(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    return callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req: any, res: any, next: any) => {
  req.db = db;
  next();
});

app.use('/api/change-requests', changeRequestsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', migrationRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/calibration', calibrationRoutes);
app.use('/api/inhouse-calibration', inhouseCalibrationRoutes);
app.use('/api/calibration-history', calibrationHistoryRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/msa', msaRoutes);
app.use('/api/risk-assessment', riskAssessmentRoutes);
app.use('/api/generic', editRequestsRoutes);

// POST /api/open-folder — opens a local folder path in Windows Explorer (server-local only)
const { authRequired } = require('./middleware/auth');

// ─── Shared Buttons API (all logged-in users share these) ───
app.get('/api/shared-buttons', authRequired, (req: any, res: any) => {
  req.db.all('SELECT id, label, path FROM shared_buttons ORDER BY created_at ASC', [], (err: any, rows: any[]) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/shared-buttons', authRequired, (req: any, res: any) => {
  const { label, path } = req.body;
  if (!label || typeof label !== 'string' || !label.trim()) {
    return res.status(400).json({ error: 'label is required' });
  }
  const trimLabel = label.trim();
  const trimPath = (path && typeof path === 'string') ? path.trim() : '';
  req.db.run(
    'INSERT INTO shared_buttons (label, path, created_by) VALUES (?, ?, ?)',
    [trimLabel, trimPath, req.user.id],
    function (this: any, err: any) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, label: trimLabel, path: trimPath });
    }
  );
});

app.delete('/api/shared-buttons/:id', authRequired, (req: any, res: any) => {
  const btnId = Number(req.params.id);
  if (!btnId) return res.status(400).json({ error: 'Invalid button id' });
  req.db.run('DELETE FROM shared_buttons WHERE id = ?', [btnId], function (this: any, err: any) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ─── KPI CSV Data API (shared across all users) ───
const auditService = require('./services/auditService');

app.get('/api/kpi-csv', authRequired, (req: any, res: any) => {
  req.db.get('SELECT file_name, csv_json FROM kpi_csv_data WHERE id = 1', [], (err: any, row: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.json({ fileName: '', data: null });
    try {
      res.json({ fileName: row.file_name, data: JSON.parse(row.csv_json) });
    } catch {
      res.json({ fileName: row.file_name, data: null });
    }
  });
});

app.post('/api/kpi-csv', authRequired, (req: any, res: any) => {
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
    function (this: any, err: any) {
      if (err) return res.status(500).json({ error: err.message });
      auditService.recordEvent('KPIData', 1, req.user.id, 'KPI_CSV_UPLOADED', {
        file_name: name,
        record_count: data.length,
      }).catch(() => {});
      res.json({ success: true });
    }
  );
});

app.delete('/api/kpi-csv', authRequired, (req: any, res: any) => {
  req.db.run('DELETE FROM kpi_csv_data WHERE id = 1', [], function (this: any, err: any) {
    if (err) return res.status(500).json({ error: err.message });
    auditService.recordEvent('KPIData', 1, req.user.id, 'KPI_CSV_RESET', {}).catch(() => {});
    res.json({ success: true });
  });
});

app.post('/api/open-folder', authRequired, (req: any, res: any) => {
  const { folderPath } = req.body;
  if (!folderPath || typeof folderPath !== 'string') {
    return res.status(400).json({ error: 'folderPath is required' });
  }
  // Accept both backslash and forward-slash Windows paths
  const normalized = folderPath.replace(/\//g, '\\');
  if (!/^([A-Za-z]:\\|\\\\)/.test(normalized)) {
    return res.status(400).json({ error: 'Invalid folder path format. Use a Windows absolute path, e.g. G:\\FolderName' });
  }
  try {
    // Use cmd /c start so Explorer opens in the foreground (not behind the browser)
    const child = spawn('cmd.exe', ['/c', 'start', '', normalized], { detached: true, stdio: 'ignore' });
    child.unref();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to open folder' });
  }
});

app.use('/uploads/doc-pdf', express.static(path.join(__dirname, 'uploads', 'doc-pdf')));

// ─── Download open-folder setup files (for remote PCs) ───
app.get('/api/download-setup/openfolder.vbs', authRequired, (_req: any, res: any) => {
  const file = path.resolve(__dirname, '..', 'tools', 'openfolder.vbs');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Setup file not found' });
  res.download(file);
});
app.get('/api/download-setup/setup-openfolder.ps1', authRequired, (_req: any, res: any) => {
  const file = path.resolve(__dirname, '..', 'tools', 'setup-openfolder.ps1');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Setup file not found' });
  res.download(file);
});

runTempCleanup();
setInterval(runTempCleanup, 24 * 60 * 60 * 1000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});

export {};
