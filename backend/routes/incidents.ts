// routes/incidents.ts — Abnormal Situations Record
const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { authRequired, requireRole } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const auditService = require('../services/auditService');

// ─── File upload config ──────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads', 'Abnormal Situations Record');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, uploadDir),
  filename: (_req: any, file: any, cb: any) => {
    const ts   = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${ts}_${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.xlsx', '.doc', '.xls', '.csv', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`File type not allowed: ${ext}`));
  },
});

// ─── DB helpers ──────────────────────────────────────────────────────────────
const dbRun = (db: any, sql: string, params: any[] = []) =>
  new Promise<any>((resolve, reject) => {
    db.run(sql, params, function (this: any, err: any) {
      if (err) reject(err); else resolve(this);
    });
  });
const dbGet = (db: any, sql: string, params: any[] = []) =>
  new Promise<any>((resolve, reject) => {
    db.get(sql, params, (err: any, row: any) => { if (err) reject(err); else resolve(row); });
  });
const dbAll = (db: any, sql: string, params: any[] = []) =>
  new Promise<any[]>((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any) => { if (err) reject(err); else resolve(rows || []); });
  });

// ─── Table init ──────────────────────────────────────────────────────────────
let tablesReady = false;
async function ensureTables(db: any) {
  if (tablesReady) return;
  await dbRun(db, `CREATE TABLE IF NOT EXISTS AbnormalSituation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_no TEXT NOT NULL,
    machine_name TEXT NOT NULL,
    incident_details TEXT NOT NULL,
    incident_date TEXT NOT NULL,
    discoverer TEXT NOT NULL,
    discovery_date TEXT NOT NULL,
    resolution TEXT NOT NULL,
    reporter_id INTEGER NOT NULL,
    reporter_name TEXT NOT NULL,
    approver_id INTEGER NOT NULL,
    approver_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'PENDING',
    reject_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // Add edit_count column if missing (migration for existing tables)
  try { await dbRun(db, `ALTER TABLE AbnormalSituation ADD COLUMN edit_count INTEGER NOT NULL DEFAULT 0`); } catch { /* column already exists */ }

  await dbRun(db, `CREATE TABLE IF NOT EXISTS AbnormalSituationMachineOption (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS AbnormalSituationEditHistory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER NOT NULL,
    editor_name TEXT NOT NULL,
    approver_name TEXT NOT NULL,
    changes TEXT,
    edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (record_id) REFERENCES AbnormalSituation(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS AbnormalSituationAttachment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    uploaded_by TEXT NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (record_id) REFERENCES AbnormalSituation(id)
  )`);

  const defaults = ['Dual long', '4-5ton', 'Semi', 'Mud'];
  for (const name of defaults) {
    await dbRun(db, `INSERT OR IGNORE INTO AbnormalSituationMachineOption (name) VALUES (?)`, [name]);
  }
  tablesReady = true;
}

// ─── Auth ────────────────────────────────────────────────────────────────────
router.use(authRequired);

// ─── Static routes BEFORE /:id ───────────────────────────────────────────────

// GET /machine-options
router.get('/machine-options', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const options = await dbAll(req.db, 'SELECT id, name FROM AbnormalSituationMachineOption ORDER BY name');
    res.json({ options });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /machine-options
router.post('/machine-options', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
    await dbRun(req.db, 'INSERT OR IGNORE INTO AbnormalSituationMachineOption (name) VALUES (?)', [name.trim()]);
    const row = await dbGet(req.db, 'SELECT id, name FROM AbnormalSituationMachineOption WHERE name = ?', [name.trim()]);
    res.json({ option: row });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /managers
router.get('/managers', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const rows = await dbAll(req.db,
      `SELECT u.id, u.name AS display_name, u.employee_code
       FROM users u JOIN roles r ON u.role_id = r.id
       WHERE UPPER(r.name) IN ('MANAGER','QMR','ADMIN')
       ORDER BY u.name`);
    res.json({ managers: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── CRUD ────────────────────────────────────────────────────────────────────

// GET / — list with filters
router.get('/', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    let where = '1=1';
    const params: any[] = [];
    if (req.query.status) { where += ' AND s.status = ?'; params.push(req.query.status); }
    if (req.query.machine) { where += ' AND s.machine_name = ?'; params.push(req.query.machine); }
    if (req.query.search) {
      const t = `%${req.query.search}%`;
      where += ` AND (s.record_no LIKE ? OR s.machine_name LIKE ? OR s.incident_details LIKE ?
                  OR s.discoverer LIKE ? OR s.resolution LIKE ? OR s.reporter_name LIKE ?
                  OR s.approver_name LIKE ?)`;
      params.push(t, t, t, t, t, t, t);
    }
    const sortCols: Record<string, string> = {
      id: 's.id', record_no: 's.record_no', machine_name: 's.machine_name',
      incident_date: 's.incident_date', status: 's.status',
    };
    const sortBy = sortCols[req.query.sort_by as string] || 's.id';
    const sortOrder = req.query.sort_order === 'ASC' ? 'ASC' : 'DESC';
    const records = await dbAll(req.db,
      `SELECT s.* FROM AbnormalSituation s WHERE ${where} ORDER BY ${sortBy} ${sortOrder}`, params);
    res.json({ records });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /:id
router.get('/:id', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const record = await dbGet(req.db, 'SELECT * FROM AbnormalSituation WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ error: 'Not found' });
    const attachments = await dbAll(req.db, 'SELECT * FROM AbnormalSituationAttachment WHERE record_id = ? ORDER BY uploaded_at DESC', [req.params.id]);
    const editHistory = await dbAll(req.db, 'SELECT * FROM AbnormalSituationEditHistory WHERE record_id = ? ORDER BY edited_at DESC', [req.params.id]);
    res.json({ record, attachments, editHistory });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST / — create
router.post('/', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const { machine_name, incident_details, incident_date, discoverer, discovery_date,
            resolution, approver_id, approver_name } = req.body;
    if (!machine_name?.trim() || !incident_details?.trim() || !incident_date
        || !discoverer?.trim() || !discovery_date || !resolution?.trim() || !approver_id) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const year = new Date().getFullYear();
    const last = await dbGet(req.db,
      `SELECT record_no FROM AbnormalSituation WHERE record_no LIKE ? ORDER BY id DESC LIMIT 1`,
      [`ASR-${year}-%`]);
    let seq = 1;
    if (last?.record_no) { const p = last.record_no.split('-'); seq = parseInt(p[2], 10) + 1; }
    const record_no = `ASR-${year}-${String(seq).padStart(4, '0')}`;
    const reporter_id = req.user.id;
    const reporter_name = req.user.name || req.user.employee_code || '';

    const result = await dbRun(req.db,
      `INSERT INTO AbnormalSituation
        (record_no,machine_name,incident_details,incident_date,discoverer,discovery_date,
         resolution,reporter_id,reporter_name,approver_id,approver_name,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'PENDING')`,
      [record_no, machine_name.trim(), incident_details.trim(), incident_date, discoverer.trim(),
       discovery_date, resolution.trim(), reporter_id, reporter_name,
       approver_id, (approver_name || '').trim()]);

    // Auto-add machine name to dropdown options
    try { await dbRun(req.db, 'INSERT OR IGNORE INTO AbnormalSituationMachineOption (name) VALUES (?)', [machine_name.trim()]); } catch { /* non-blocking */ }

    try {
      await notificationService.createNotification(
        approver_id, 'ASR_PENDING_APPROVAL',
        `New abnormal situation report ${record_no} requires your approval.`,
        { record_no, situation_id: result.lastID });
    } catch { /* non-blocking */ }

    try { await auditService.recordEvent('AbnormalSituation', result.lastID, req.user.id, 'CREATE_INCIDENT', { record_no }); } catch { /* non-blocking */ }
    res.json({ id: result.lastID, record_no });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PUT /:id — edit record
router.put('/:id', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const rec = await dbGet(req.db, 'SELECT * FROM AbnormalSituation WHERE id = ?', [req.params.id]);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    const { machine_name, incident_details, incident_date, discoverer, discovery_date,
            resolution, approver_id, approver_name, editor_name, edit_approver_name } = req.body;
    if (!editor_name?.trim() || !edit_approver_name?.trim()) {
      return res.status(400).json({ error: 'Editor name and Approver name are required' });
    }
    if (!machine_name?.trim() || !incident_details?.trim() || !incident_date
        || !discoverer?.trim() || !discovery_date || !resolution?.trim() || !approver_id) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    // Build change summary
    const changes: string[] = [];
    if (rec.machine_name !== machine_name.trim()) changes.push(`Machine: "${rec.machine_name}" → "${machine_name.trim()}"`);
    if (rec.incident_details !== incident_details.trim()) changes.push('Incident details updated');
    if (rec.incident_date !== incident_date) changes.push(`Incident date: ${rec.incident_date} → ${incident_date}`);
    if (rec.discoverer !== discoverer.trim()) changes.push(`Discoverer: "${rec.discoverer}" → "${discoverer.trim()}"`);
    if (rec.discovery_date !== discovery_date) changes.push(`Discovery date: ${rec.discovery_date} → ${discovery_date}`);
    if (rec.resolution !== resolution.trim()) changes.push('Resolution updated');
    if (rec.approver_id !== approver_id) changes.push('Approver changed');
    if (changes.length === 0) changes.push('No field changes');

    await dbRun(req.db,
      `UPDATE AbnormalSituation SET machine_name=?, incident_details=?, incident_date=?,
       discoverer=?, discovery_date=?, resolution=?, approver_id=?, approver_name=?,
       status='PENDING', edit_count = edit_count + 1, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [machine_name.trim(), incident_details.trim(), incident_date, discoverer.trim(),
       discovery_date, resolution.trim(), approver_id, (approver_name || '').trim(), rec.id]);

    // Auto-add machine name to dropdown options
    try { await dbRun(req.db, 'INSERT OR IGNORE INTO AbnormalSituationMachineOption (name) VALUES (?)', [machine_name.trim()]); } catch { /* non-blocking */ }

    await dbRun(req.db,
      `INSERT INTO AbnormalSituationEditHistory (record_id, editor_name, approver_name, changes) VALUES (?,?,?,?)`,
      [rec.id, editor_name.trim(), edit_approver_name.trim(), changes.join('; ')]);

    try { await auditService.recordEvent('AbnormalSituation', rec.id, req.user.id, 'EDIT_INCIDENT', { record_no: rec.record_no, changes: changes.join('; ') }); } catch { /* non-blocking */ }

    try {
      await notificationService.createNotification(
        approver_id, 'ASR_EDIT_PENDING',
        `Abnormal situation report ${rec.record_no} has been edited and requires your approval.`,
        { record_no: rec.record_no, situation_id: rec.id });
    } catch { /* non-blocking */ }

    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /:id/attachments — upload files
router.post('/:id/attachments', upload.array('files', 10), async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const rec = await dbGet(req.db, 'SELECT * FROM AbnormalSituation WHERE id = ?', [req.params.id]);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    const files = req.files as any[];
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files provided' });
    const uploaderName = req.user.name || req.user.employee_code || '';
    const inserted: any[] = [];
    for (const file of files) {
      const result = await dbRun(req.db,
        `INSERT INTO AbnormalSituationAttachment (record_id, filename, original_name, file_size, uploaded_by) VALUES (?,?,?,?,?)`,
        [rec.id, file.filename, file.originalname, file.size, uploaderName]);
      inserted.push({ id: result.lastID, filename: file.filename, original_name: file.originalname, file_size: file.size, uploaded_by: uploaderName });
    }
    try { await auditService.recordEvent('AbnormalSituation', rec.id, req.user.id, 'UPLOAD_INCIDENT_ATTACHMENT', { record_no: rec.record_no, file_count: inserted.length }); } catch { /* non-blocking */ }
    res.json({ attachments: inserted });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /:id/attachments
router.get('/:id/attachments', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const attachments = await dbAll(req.db, 'SELECT * FROM AbnormalSituationAttachment WHERE record_id = ? ORDER BY uploaded_at DESC', [req.params.id]);
    res.json({ attachments });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /:id/attachments/:attachmentId/download
router.get('/:id/attachments/:attachmentId/download', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const att = await dbGet(req.db, 'SELECT * FROM AbnormalSituationAttachment WHERE id = ? AND record_id = ?',
      [req.params.attachmentId, req.params.id]);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });
    const filePath = path.join(uploadDir, att.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
    res.download(filePath, att.original_name);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /:id/attachments/:attachmentId
router.delete('/:id/attachments/:attachmentId', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const att = await dbGet(req.db, 'SELECT * FROM AbnormalSituationAttachment WHERE id = ? AND record_id = ?',
      [req.params.attachmentId, req.params.id]);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });
    const filePath = path.join(uploadDir, att.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await dbRun(req.db, 'DELETE FROM AbnormalSituationAttachment WHERE id = ?', [att.id]);
    try { await auditService.recordEvent('AbnormalSituation', parseInt(req.params.id), req.user.id, 'DELETE_INCIDENT_ATTACHMENT', { original_name: att.original_name }); } catch { /* non-blocking */ }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /:id/edit-history
router.get('/:id/edit-history', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const history = await dbAll(req.db, 'SELECT * FROM AbnormalSituationEditHistory WHERE record_id = ? ORDER BY edited_at DESC', [req.params.id]);
    res.json({ history });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /:id/approve — only the designated approver can approve
router.post('/:id/approve', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const rec = await dbGet(req.db, 'SELECT * FROM AbnormalSituation WHERE id = ?', [req.params.id]);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    if (rec.status !== 'PENDING') return res.status(400).json({ error: 'Not in PENDING status' });
    if (rec.approver_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the designated approver can approve this record' });
    }
    await dbRun(req.db, `UPDATE AbnormalSituation SET status='APPROVED', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [rec.id]);
    try { await auditService.recordEvent('AbnormalSituation', rec.id, req.user.id, 'APPROVE_INCIDENT', { record_no: rec.record_no }); } catch { /* non-blocking */ }
    try {
      await notificationService.createNotification(rec.reporter_id, 'ASR_APPROVED',
        `Your abnormal situation report ${rec.record_no} has been approved by ${req.user.name || req.user.employee_code}.`,
        { record_no: rec.record_no, situation_id: rec.id });
    } catch { /* non-blocking */ }
    res.json({ success: true, message: `Record ${rec.record_no} approved successfully` });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /:id — admin only
router.delete('/:id', requireRole('ADMIN'), async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const rec = await dbGet(req.db, 'SELECT * FROM AbnormalSituation WHERE id = ?', [req.params.id]);
    if (!rec) return res.status(404).json({ error: 'Not found' });

    // Delete associated attachments from disk
    const attachments = await dbAll(req.db, 'SELECT filename FROM AbnormalSituationAttachment WHERE record_id = ?', [rec.id]);
    for (const att of attachments) {
      const filePath = path.join(uploadDir, att.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    // Delete related rows then the record
    await dbRun(req.db, 'DELETE FROM AbnormalSituationAttachment WHERE record_id = ?', [rec.id]);
    await dbRun(req.db, 'DELETE FROM AbnormalSituationEditHistory WHERE record_id = ?', [rec.id]);
    await dbRun(req.db, 'DELETE FROM AbnormalSituation WHERE id = ?', [rec.id]);

    try { await auditService.recordEvent('AbnormalSituation', rec.id, req.user.id, 'DELETE_INCIDENT', { record_no: rec.record_no }); } catch { /* non-blocking */ }
    res.json({ success: true, message: `Record ${rec.record_no} deleted` });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /:id/reject — only the designated approver can reject, reason required
router.post('/:id/reject', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const { reason } = req.body;
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'Rejection reason is required' });
    const rec = await dbGet(req.db, 'SELECT * FROM AbnormalSituation WHERE id = ?', [req.params.id]);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    if (rec.status !== 'PENDING') return res.status(400).json({ error: 'Not in PENDING status' });
    if (rec.approver_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the designated approver can reject this record' });
    }
    await dbRun(req.db,
      `UPDATE AbnormalSituation SET status='REJECTED', reject_reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [reason.trim(), rec.id]);
    try { await auditService.recordEvent('AbnormalSituation', rec.id, req.user.id, 'REJECT_INCIDENT', { record_no: rec.record_no, reason: reason.trim() }); } catch { /* non-blocking */ }
    try {
      await notificationService.createNotification(rec.reporter_id, 'ASR_REJECTED',
        `Your abnormal situation report ${rec.record_no} has been rejected by ${req.user.name || req.user.employee_code}. Reason: ${reason.trim()}`,
        { record_no: rec.record_no, situation_id: rec.id });
    } catch { /* non-blocking */ }
    res.json({ success: true, message: `Record ${rec.record_no} rejected` });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export = router;
