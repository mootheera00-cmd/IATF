const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
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
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o: string) => o.trim())
);
app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow non-browser requests (e.g. curl, server-to-server) only in development
    if (!origin) return callback(null, process.env.NODE_ENV !== 'production');
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

app.use('/uploads/doc-pdf', express.static(path.join(__dirname, 'uploads', 'doc-pdf')));

runTempCleanup();
setInterval(runTempCleanup, 24 * 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

export {};
