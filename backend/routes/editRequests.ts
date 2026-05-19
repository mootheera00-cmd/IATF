// routes/editRequests.ts — Generic Edit Requests (Turtle Diagram & Job Description)
const express = require('express');
const router  = express.Router();
const { authRequired } = require('../middleware/auth');
const auditService = require('../services/auditService');
const notificationService = require('../services/notificationService');

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

  await dbRun(db, `CREATE TABLE IF NOT EXISTS GenericEditRequest (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module TEXT NOT NULL,
    section TEXT,
    item_label TEXT,
    request_type TEXT NOT NULL DEFAULT 'EDIT',
    field_changes TEXT,
    reason TEXT NOT NULL,
    requester_id INTEGER NOT NULL,
    requester_name TEXT NOT NULL,
    approver_id INTEGER NOT NULL,
    approver_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'PENDING',
    reject_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME
  )`);

  tablesReady = true;
}

// ─── Auth ────────────────────────────────────────────────────────────────────
router.use(authRequired);

// ─── GET /managers ───────────────────────────────────────────────────────────
router.get('/managers', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const rows = await dbAll(req.db,
      `SELECT u.id, u.name AS display_name, u.employee_code, r.name AS role_name
       FROM users u JOIN roles r ON u.role_id = r.id
       WHERE UPPER(r.name) IN ('MANAGER','PRESIDENT')
         AND u.is_active = 1
       ORDER BY u.name`);
    res.json({ managers: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /edit-requests?module=TurtleDiagram|JobDescription&status=... ──────
router.get('/edit-requests', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const { module, status } = req.query;
    let where = '1=1';
    const params: any[] = [];
    if (module) { where += ' AND module = ?'; params.push(module); }
    if (status) { where += ' AND status = ?'; params.push(status); }
    const requests = await dbAll(req.db,
      `SELECT * FROM GenericEditRequest WHERE ${where} ORDER BY created_at DESC`, params);
    res.json({ requests });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── POST /edit-requests — submit request ────────────────────────────────────
router.post('/edit-requests', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const { module, section, item_label, request_type, field_changes, reason, approver_id, approver_name } = req.body;
    if (!reason?.trim() || !approver_id) {
      return res.status(400).json({ error: 'Reason and approver are required' });
    }
    const validModules = ['TurtleDiagram', 'JobDescription'];
    if (!validModules.includes(module)) {
      return res.status(400).json({ error: 'Invalid module' });
    }
    const rtype = ['EDIT', 'ADD', 'DELETE'].includes(request_type) ? request_type : 'EDIT';
    const requester_name = req.user.name || req.user.employee_code || '';

    const result = await dbRun(req.db,
      `INSERT INTO GenericEditRequest
        (module, section, item_label, request_type, field_changes, reason,
         requester_id, requester_name, approver_id, approver_name, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [module, section || null, item_label || null, rtype,
       field_changes ? JSON.stringify(field_changes) : null,
       reason.trim(), req.user.id, requester_name,
       approver_id, (approver_name || '').trim(), 'PENDING']);

    const actionPrefix = module === 'TurtleDiagram' ? 'TD' : 'JD';
    try {
      await notificationService.createNotification(
        approver_id, `${actionPrefix}_EDIT_PENDING`,
        `${module === 'TurtleDiagram' ? 'Turtle Diagram' : 'Job Description'} change request requires your approval.`,
        { request_id: result.lastID, request_type: rtype });
    } catch { /* */ }

    try {
      await auditService.recordEvent(module, result.lastID, req.user.id,
        `CREATE_${actionPrefix}_EDIT_REQUEST`,
        { request_type: rtype, section, reason: reason.trim() });
    } catch { /* */ }

    const row = await dbGet(req.db, 'SELECT * FROM GenericEditRequest WHERE id = ?', [result.lastID]);
    res.json({ request: row });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── POST /edit-requests/:id/approve ─────────────────────────────────────────
router.post('/edit-requests/:id/approve', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const er = await dbGet(req.db, 'SELECT * FROM GenericEditRequest WHERE id = ?', [req.params.id]);
    if (!er) return res.status(404).json({ error: 'Request not found' });
    if (er.status !== 'PENDING') return res.status(400).json({ error: 'Request is not pending' });
    if (er.approver_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the designated approver can approve' });
    }
    // Only MANAGER and PRESIDENT roles may approve
    const approverRole = await dbGet(req.db,
      `SELECT r.name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?`,
      [req.user.id]);
    if (!approverRole || !['MANAGER', 'PRESIDENT'].includes(approverRole.name?.toUpperCase())) {
      return res.status(403).json({ error: 'Only Manager or President can approve change requests' });
    }

    await dbRun(req.db,
      "UPDATE GenericEditRequest SET status = 'APPROVED', decided_at = CURRENT_TIMESTAMP WHERE id = ?",
      [er.id]);

    const actionPrefix = er.module === 'TurtleDiagram' ? 'TD' : 'JD';
    try {
      await notificationService.createNotification(
        er.requester_id, `${actionPrefix}_EDIT_APPROVED`,
        `Your ${er.module === 'TurtleDiagram' ? 'Turtle Diagram' : 'Job Description'} change request has been approved.`,
        { request_id: er.id, request_type: er.request_type });
    } catch { /* */ }

    try {
      await auditService.recordEvent(er.module, er.id, req.user.id,
        `APPROVE_${actionPrefix}_EDIT_REQUEST`,
        { request_type: er.request_type });
    } catch { /* */ }

    res.json({ success: true, message: 'Change request approved' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── POST /edit-requests/:id/reject ──────────────────────────────────────────
router.post('/edit-requests/:id/reject', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'Rejection reason required' });
    const er = await dbGet(req.db, 'SELECT * FROM GenericEditRequest WHERE id = ?', [req.params.id]);
    if (!er) return res.status(404).json({ error: 'Request not found' });
    if (er.status !== 'PENDING') return res.status(400).json({ error: 'Request is not pending' });
    if (er.approver_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the designated approver can reject' });
    }

    await dbRun(req.db,
      "UPDATE GenericEditRequest SET status = 'REJECTED', reject_reason = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?",
      [reason.trim(), er.id]);

    const actionPrefix = er.module === 'TurtleDiagram' ? 'TD' : 'JD';
    try {
      await notificationService.createNotification(
        er.requester_id, `${actionPrefix}_EDIT_REJECTED`,
        `Your ${er.module === 'TurtleDiagram' ? 'Turtle Diagram' : 'Job Description'} change request has been rejected. Reason: ${reason.trim()}`,
        { request_id: er.id });
    } catch { /* */ }

    try {
      await auditService.recordEvent(er.module, er.id, req.user.id,
        `REJECT_${actionPrefix}_EDIT_REQUEST`,
        { reason: reason.trim() });
    } catch { /* */ }

    res.json({ success: true, message: 'Change request rejected' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
