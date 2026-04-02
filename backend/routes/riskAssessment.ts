// routes/riskAssessment.ts — Risk Assessment (IATF 16949)
const express = require('express');
const router  = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
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

  // Risk assessment categories (Output, Input, How, ...)
  await dbRun(db, `CREATE TABLE IF NOT EXISTS RiskAssessmentCategory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Risk items in each category
  await dbRun(db, `CREATE TABLE IF NOT EXISTS RiskAssessmentItem (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    item_no INTEGER NOT NULL,
    risk_opportunity TEXT NOT NULL,
    impact TEXT,
    existing_control TEXT,
    type_risk INTEGER NOT NULL DEFAULT 0,
    type_opportunity INTEGER NOT NULL DEFAULT 0,
    severity INTEGER NOT NULL DEFAULT 1,
    occurrence INTEGER NOT NULL DEFAULT 1,
    risk_score INTEGER GENERATED ALWAYS AS (severity * occurrence) VIRTUAL,
    measure_accept INTEGER NOT NULL DEFAULT 0,
    measure_procedure INTEGER NOT NULL DEFAULT 0,
    measure_kpi INTEGER NOT NULL DEFAULT 0,
    measure_preventive INTEGER NOT NULL DEFAULT 0,
    detail TEXT,
    responsibility TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES RiskAssessmentCategory(id)
  )`);

  // Revision history (P1 of the form)
  await dbRun(db, `CREATE TABLE IF NOT EXISTS RiskAssessmentRevision (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rev_no TEXT NOT NULL,
    effective_date TEXT NOT NULL,
    detail TEXT NOT NULL,
    remark TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Edit requests with approval flow
  await dbRun(db, `CREATE TABLE IF NOT EXISTS RiskAssessmentEditRequest (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER,
    request_type TEXT NOT NULL DEFAULT 'EDIT',
    category_id INTEGER,
    field_changes TEXT,
    reason TEXT NOT NULL,
    requester_id INTEGER NOT NULL,
    requester_name TEXT NOT NULL,
    approver_id INTEGER NOT NULL,
    approver_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'PENDING',
    reject_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME,
    FOREIGN KEY (item_id) REFERENCES RiskAssessmentItem(id),
    FOREIGN KEY (category_id) REFERENCES RiskAssessmentCategory(id)
  )`);

  // Edit history
  await dbRun(db, `CREATE TABLE IF NOT EXISTS RiskAssessmentEditHistory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER,
    request_id INTEGER,
    editor_name TEXT NOT NULL,
    approver_name TEXT NOT NULL,
    changes TEXT,
    edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES RiskAssessmentItem(id),
    FOREIGN KEY (request_id) REFERENCES RiskAssessmentEditRequest(id)
  )`);

  // Seed default categories if empty
  const count = await dbGet(db, 'SELECT COUNT(*) as cnt FROM RiskAssessmentCategory');
  if (!count || count.cnt === 0) {
    const cats = [
      { name: 'Output', sort_order: 1 },
      { name: 'Input', sort_order: 2 },
      { name: 'How', sort_order: 3 },
      { name: 'Interested Party Need & Expectation', sort_order: 4 },
      { name: 'With/What', sort_order: 5 },
      { name: 'With Who', sort_order: 6 },
      { name: 'Support Process', sort_order: 7 },
    ];
    for (const c of cats) {
      await dbRun(db, 'INSERT INTO RiskAssessmentCategory (name, sort_order) VALUES (?,?)', [c.name, c.sort_order]);
    }
  }

  tablesReady = true;
}

// ─── Auth ────────────────────────────────────────────────────────────────────
router.use(authRequired);

// ─── Categories ──────────────────────────────────────────────────────────────

// GET /categories
router.get('/categories', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const rows = await dbAll(req.db, 'SELECT * FROM RiskAssessmentCategory ORDER BY sort_order, id');
    res.json({ categories: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /categories
router.post('/categories', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const { name, sort_order } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Category name required' });
    const maxOrder = await dbGet(req.db, 'SELECT MAX(sort_order) as mx FROM RiskAssessmentCategory');
    const order = sort_order ?? ((maxOrder?.mx || 0) + 1);
    const result = await dbRun(req.db, 'INSERT INTO RiskAssessmentCategory (name, sort_order) VALUES (?,?)',
      [name.trim(), order]);
    try { await auditService.recordEvent('RiskAssessment', result.lastID, req.user.id, 'CREATE_RA_CATEGORY', { name: name.trim() }); } catch { /* */ }
    const row = await dbGet(req.db, 'SELECT * FROM RiskAssessmentCategory WHERE id = ?', [result.lastID]);
    res.json({ category: row });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PUT /categories/:id
router.put('/categories/:id', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const { name, sort_order } = req.body;
    const cat = await dbGet(req.db, 'SELECT * FROM RiskAssessmentCategory WHERE id = ?', [req.params.id]);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    if (name?.trim()) await dbRun(req.db, 'UPDATE RiskAssessmentCategory SET name = ? WHERE id = ?', [name.trim(), cat.id]);
    if (sort_order != null) await dbRun(req.db, 'UPDATE RiskAssessmentCategory SET sort_order = ? WHERE id = ?', [sort_order, cat.id]);
    const updated = await dbGet(req.db, 'SELECT * FROM RiskAssessmentCategory WHERE id = ?', [cat.id]);
    res.json({ category: updated });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /categories/:id
router.delete('/categories/:id', requireRole('ADMIN'), async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const cat = await dbGet(req.db, 'SELECT * FROM RiskAssessmentCategory WHERE id = ?', [req.params.id]);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    // Check for items
    const itemCount = await dbGet(req.db, 'SELECT COUNT(*) as cnt FROM RiskAssessmentItem WHERE category_id = ?', [cat.id]);
    if (itemCount?.cnt > 0) return res.status(400).json({ error: 'Category has items; remove them first' });
    await dbRun(req.db, 'DELETE FROM RiskAssessmentCategory WHERE id = ?', [cat.id]);
    try { await auditService.recordEvent('RiskAssessment', cat.id, req.user.id, 'DELETE_RA_CATEGORY', { name: cat.name }); } catch { /* */ }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Items ───────────────────────────────────────────────────────────────────

// GET /items — all items grouped by category
router.get('/items', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const { category_id, status } = req.query;
    let where = '1=1';
    const params: any[] = [];
    if (category_id) { where += ' AND i.category_id = ?'; params.push(category_id); }
    if (status) { where += ' AND i.status = ?'; params.push(status); }
    else { where += " AND i.status = 'ACTIVE'"; }
    const items = await dbAll(req.db,
      `SELECT i.*, c.name as category_name, c.sort_order as category_sort
       FROM RiskAssessmentItem i
       JOIN RiskAssessmentCategory c ON i.category_id = c.id
       WHERE ${where}
       ORDER BY c.sort_order, i.item_no`, params);
    res.json({ items });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /items/:id
router.get('/items/:id', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const item = await dbGet(req.db,
      `SELECT i.*, c.name as category_name FROM RiskAssessmentItem i
       JOIN RiskAssessmentCategory c ON i.category_id = c.id WHERE i.id = ?`, [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const editHistory = await dbAll(req.db,
      'SELECT * FROM RiskAssessmentEditHistory WHERE item_id = ? ORDER BY edited_at DESC', [req.params.id]);
    res.json({ item, editHistory });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /items — add new risk item
router.post('/items', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const { category_id, risk_opportunity, impact, existing_control,
            type_risk, type_opportunity, severity, occurrence,
            measure_accept, measure_procedure, measure_kpi, measure_preventive,
            detail, responsibility, insert_after } = req.body;
    if (!category_id || !risk_opportunity?.trim()) {
      return res.status(400).json({ error: 'Category and risk/opportunity description are required' });
    }
    // Determine item_no
    let item_no: number;
    if (insert_after != null) {
      // Insert after a specific item — shift subsequent items
      item_no = insert_after + 1;
      await dbRun(req.db,
        'UPDATE RiskAssessmentItem SET item_no = item_no + 1 WHERE category_id = ? AND item_no >= ? AND status = ?',
        [category_id, item_no, 'ACTIVE']);
    } else {
      // Append to end
      const maxNo = await dbGet(req.db,
        "SELECT MAX(item_no) as mx FROM RiskAssessmentItem WHERE category_id = ? AND status = 'ACTIVE'",
        [category_id]);
      item_no = (maxNo?.mx || 0) + 1;
    }

    const result = await dbRun(req.db,
      `INSERT INTO RiskAssessmentItem
        (category_id, item_no, risk_opportunity, impact, existing_control,
         type_risk, type_opportunity, severity, occurrence,
         measure_accept, measure_procedure, measure_kpi, measure_preventive,
         detail, responsibility, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [category_id, item_no, risk_opportunity.trim(), (impact || '').trim(),
       (existing_control || '').trim(),
       type_risk ? 1 : 0, type_opportunity ? 1 : 0,
       severity || 1, occurrence || 1,
       measure_accept ? 1 : 0, measure_procedure ? 1 : 0,
       measure_kpi ? 1 : 0, measure_preventive ? 1 : 0,
       (detail || '').trim(), (responsibility || '').trim(), req.user.id]);

    try { await auditService.recordEvent('RiskAssessment', result.lastID, req.user.id, 'CREATE_RA_ITEM', { risk_opportunity: risk_opportunity.trim(), category_id }); } catch { /* */ }

    const item = await dbGet(req.db,
      `SELECT i.*, c.name as category_name FROM RiskAssessmentItem i
       JOIN RiskAssessmentCategory c ON i.category_id = c.id WHERE i.id = ?`, [result.lastID]);
    res.json({ item });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PUT /items/:id — direct edit (for admin/manager)
router.put('/items/:id', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const item = await dbGet(req.db, 'SELECT * FROM RiskAssessmentItem WHERE id = ?', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const { risk_opportunity, impact, existing_control,
            type_risk, type_opportunity, severity, occurrence,
            measure_accept, measure_procedure, measure_kpi, measure_preventive,
            detail, responsibility } = req.body;

    await dbRun(req.db,
      `UPDATE RiskAssessmentItem SET
        risk_opportunity = COALESCE(?, risk_opportunity),
        impact = COALESCE(?, impact),
        existing_control = COALESCE(?, existing_control),
        type_risk = ?, type_opportunity = ?,
        severity = COALESCE(?, severity),
        occurrence = COALESCE(?, occurrence),
        measure_accept = ?, measure_procedure = ?,
        measure_kpi = ?, measure_preventive = ?,
        detail = COALESCE(?, detail),
        responsibility = COALESCE(?, responsibility),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [risk_opportunity?.trim() || null, impact?.trim() || null, existing_control?.trim() || null,
       type_risk ? 1 : 0, type_opportunity ? 1 : 0,
       severity || null, occurrence || null,
       measure_accept ? 1 : 0, measure_procedure ? 1 : 0,
       measure_kpi ? 1 : 0, measure_preventive ? 1 : 0,
       detail?.trim() || null, responsibility?.trim() || null,
       item.id]);

    try { await auditService.recordEvent('RiskAssessment', item.id, req.user.id, 'EDIT_RA_ITEM', { risk_opportunity: risk_opportunity || item.risk_opportunity }); } catch { /* */ }

    const updated = await dbGet(req.db,
      `SELECT i.*, c.name as category_name FROM RiskAssessmentItem i
       JOIN RiskAssessmentCategory c ON i.category_id = c.id WHERE i.id = ?`, [item.id]);
    res.json({ item: updated });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /items/:id — soft delete (set status to DELETED)
router.delete('/items/:id', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const item = await dbGet(req.db, 'SELECT * FROM RiskAssessmentItem WHERE id = ?', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    await dbRun(req.db, "UPDATE RiskAssessmentItem SET status = 'DELETED', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [item.id]);
    // Re-sequence remaining items in category
    const remaining = await dbAll(req.db,
      "SELECT id FROM RiskAssessmentItem WHERE category_id = ? AND status = 'ACTIVE' ORDER BY item_no",
      [item.category_id]);
    for (let i = 0; i < remaining.length; i++) {
      await dbRun(req.db, 'UPDATE RiskAssessmentItem SET item_no = ? WHERE id = ?', [i + 1, remaining[i].id]);
    }
    try { await auditService.recordEvent('RiskAssessment', item.id, req.user.id, 'DELETE_RA_ITEM', { risk_opportunity: item.risk_opportunity }); } catch { /* */ }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Edit Requests (approval flow) ──────────────────────────────────────────

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

// GET /edit-requests
router.get('/edit-requests', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const { status } = req.query;
    let where = '1=1';
    const params: any[] = [];
    if (status) { where += ' AND er.status = ?'; params.push(status); }
    const requests = await dbAll(req.db,
      `SELECT er.*, i.risk_opportunity, i.category_id as item_category_id,
              c.name as category_name
       FROM RiskAssessmentEditRequest er
       LEFT JOIN RiskAssessmentItem i ON er.item_id = i.id
       LEFT JOIN RiskAssessmentCategory c ON COALESCE(er.category_id, i.category_id) = c.id
       WHERE ${where}
       ORDER BY er.created_at DESC`, params);
    res.json({ requests });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /edit-requests — submit request for edit
router.post('/edit-requests', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const { item_id, request_type, category_id, field_changes, reason, approver_id, approver_name } = req.body;
    if (!reason?.trim() || !approver_id) {
      return res.status(400).json({ error: 'Reason and approver are required' });
    }
    const validTypes = ['EDIT', 'ADD', 'DELETE', 'ADD_CATEGORY'];
    const rtype = validTypes.includes(request_type) ? request_type : 'EDIT';
    if (rtype === 'EDIT' && !item_id) return res.status(400).json({ error: 'item_id required for EDIT request' });

    const requester_name = req.user.name || req.user.employee_code || '';
    const result = await dbRun(req.db,
      `INSERT INTO RiskAssessmentEditRequest
        (item_id, request_type, category_id, field_changes, reason,
         requester_id, requester_name, approver_id, approver_name, status)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [item_id || null, rtype, category_id || null,
       field_changes ? JSON.stringify(field_changes) : null,
       reason.trim(), req.user.id, requester_name,
       approver_id, (approver_name || '').trim(), 'PENDING']);

    try {
      await notificationService.createNotification(
        approver_id, 'RA_EDIT_PENDING',
        `Risk Assessment edit request requires your approval.`,
        { request_id: result.lastID, request_type: rtype });
    } catch { /* */ }

    try { await auditService.recordEvent('RiskAssessment', result.lastID, req.user.id, 'CREATE_RA_EDIT_REQUEST', { request_type: rtype, reason: reason.trim() }); } catch { /* */ }

    const row = await dbGet(req.db, 'SELECT * FROM RiskAssessmentEditRequest WHERE id = ?', [result.lastID]);
    res.json({ request: row });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /edit-requests/:id/approve
router.post('/edit-requests/:id/approve', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const er = await dbGet(req.db, 'SELECT * FROM RiskAssessmentEditRequest WHERE id = ?', [req.params.id]);
    if (!er) return res.status(404).json({ error: 'Request not found' });
    if (er.status !== 'PENDING') return res.status(400).json({ error: 'Request is not pending' });
    if (er.approver_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the designated approver can approve' });
    }

    // Apply changes based on request type
    if (er.request_type === 'EDIT' && er.item_id && er.field_changes) {
      const changes = JSON.parse(er.field_changes);
      const fields = ['risk_opportunity', 'impact', 'existing_control', 'type_risk', 'type_opportunity',
                      'severity', 'occurrence', 'measure_accept', 'measure_procedure',
                      'measure_kpi', 'measure_preventive', 'detail', 'responsibility'];
      const sets: string[] = [];
      const vals: any[] = [];
      for (const f of fields) {
        if (changes[f] !== undefined) {
          sets.push(`${f} = ?`);
          vals.push(changes[f]);
        }
      }
      if (sets.length > 0) {
        sets.push('updated_at = CURRENT_TIMESTAMP');
        vals.push(er.item_id);
        await dbRun(req.db, `UPDATE RiskAssessmentItem SET ${sets.join(', ')} WHERE id = ?`, vals);
      }
      // Record edit history
      await dbRun(req.db,
        `INSERT INTO RiskAssessmentEditHistory (item_id, request_id, editor_name, approver_name, changes)
         VALUES (?,?,?,?,?)`,
        [er.item_id, er.id, er.requester_name, req.user.name || req.user.employee_code || '',
         Object.keys(JSON.parse(er.field_changes)).join(', ')]);
    } else if (er.request_type === 'ADD' && er.field_changes) {
      const changes = JSON.parse(er.field_changes);
      const catId = er.category_id || changes.category_id;
      const maxNo = await dbGet(req.db,
        "SELECT MAX(item_no) as mx FROM RiskAssessmentItem WHERE category_id = ? AND status = 'ACTIVE'",
        [catId]);
      await dbRun(req.db,
        `INSERT INTO RiskAssessmentItem
          (category_id, item_no, risk_opportunity, impact, existing_control,
           type_risk, type_opportunity, severity, occurrence,
           measure_accept, measure_procedure, measure_kpi, measure_preventive,
           detail, responsibility, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [catId, (maxNo?.mx || 0) + 1,
         changes.risk_opportunity || '', changes.impact || '', changes.existing_control || '',
         changes.type_risk ? 1 : 0, changes.type_opportunity ? 1 : 0,
         changes.severity || 1, changes.occurrence || 1,
         changes.measure_accept ? 1 : 0, changes.measure_procedure ? 1 : 0,
         changes.measure_kpi ? 1 : 0, changes.measure_preventive ? 1 : 0,
         changes.detail || '', changes.responsibility || '', er.requester_id]);
    } else if (er.request_type === 'DELETE' && er.item_id) {
      await dbRun(req.db, "UPDATE RiskAssessmentItem SET status = 'DELETED', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [er.item_id]);
    } else if (er.request_type === 'ADD_CATEGORY' && er.field_changes) {
      const changes = JSON.parse(er.field_changes);
      const maxOrder = await dbGet(req.db, 'SELECT MAX(sort_order) as mx FROM RiskAssessmentCategory');
      await dbRun(req.db, 'INSERT INTO RiskAssessmentCategory (name, sort_order) VALUES (?,?)',
        [changes.name || 'New Category', (maxOrder?.mx || 0) + 1]);
    }

    await dbRun(req.db,
      "UPDATE RiskAssessmentEditRequest SET status = 'APPROVED', decided_at = CURRENT_TIMESTAMP WHERE id = ?",
      [er.id]);

    try {
      await notificationService.createNotification(
        er.requester_id, 'RA_EDIT_APPROVED',
        `Your Risk Assessment edit request has been approved.`,
        { request_id: er.id, request_type: er.request_type });
    } catch { /* */ }

    try { await auditService.recordEvent('RiskAssessment', er.id, req.user.id, 'APPROVE_RA_EDIT_REQUEST', { request_type: er.request_type }); } catch { /* */ }

    res.json({ success: true, message: 'Edit request approved and changes applied' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /edit-requests/:id/reject
router.post('/edit-requests/:id/reject', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'Rejection reason required' });
    const er = await dbGet(req.db, 'SELECT * FROM RiskAssessmentEditRequest WHERE id = ?', [req.params.id]);
    if (!er) return res.status(404).json({ error: 'Request not found' });
    if (er.status !== 'PENDING') return res.status(400).json({ error: 'Request is not pending' });
    if (er.approver_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the designated approver can reject' });
    }
    await dbRun(req.db,
      "UPDATE RiskAssessmentEditRequest SET status = 'REJECTED', reject_reason = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?",
      [reason.trim(), er.id]);

    try {
      await notificationService.createNotification(
        er.requester_id, 'RA_EDIT_REJECTED',
        `Your Risk Assessment edit request has been rejected. Reason: ${reason.trim()}`,
        { request_id: er.id });
    } catch { /* */ }

    try { await auditService.recordEvent('RiskAssessment', er.id, req.user.id, 'REJECT_RA_EDIT_REQUEST', { reason: reason.trim() }); } catch { /* */ }

    res.json({ success: true, message: 'Edit request rejected' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Revisions ───────────────────────────────────────────────────────────────

// GET /revisions
router.get('/revisions', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const rows = await dbAll(req.db, 'SELECT * FROM RiskAssessmentRevision ORDER BY id DESC');
    res.json({ revisions: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /revisions
router.post('/revisions', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const { rev_no, effective_date, detail, remark } = req.body;
    if (!rev_no?.trim() || !effective_date || !detail?.trim()) {
      return res.status(400).json({ error: 'Revision number, date, and detail are required' });
    }
    const result = await dbRun(req.db,
      'INSERT INTO RiskAssessmentRevision (rev_no, effective_date, detail, remark, created_by) VALUES (?,?,?,?,?)',
      [rev_no.trim(), effective_date, detail.trim(), (remark || '').trim(), req.user.id]);
    try { await auditService.recordEvent('RiskAssessment', result.lastID, req.user.id, 'CREATE_RA_REVISION', { rev_no: rev_no.trim() }); } catch { /* */ }
    const row = await dbGet(req.db, 'SELECT * FROM RiskAssessmentRevision WHERE id = ?', [result.lastID]);
    res.json({ revision: row });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Seed from Excel data ────────────────────────────────────────────────────

// POST /seed — seed initial data from the Excel form (one-time setup)
router.post('/seed', requireRole('ADMIN'), async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const existing = await dbGet(req.db, "SELECT COUNT(*) as cnt FROM RiskAssessmentItem WHERE status = 'ACTIVE'");
    if (existing?.cnt > 0) return res.status(400).json({ error: 'Data already exists. Clear items first to re-seed.' });

    // Get category IDs
    const cats = await dbAll(req.db, 'SELECT * FROM RiskAssessmentCategory ORDER BY sort_order');
    const catMap: Record<string, number> = {};
    for (const c of cats) catMap[c.name] = c.id;

    // Seed items from the Excel F-01-DOC-002 Rev.02-2026
    const seedData: Array<{ cat: string; items: Array<any> }> = [
      { cat: 'Output', items: [
        { risk_opportunity: 'Missing of info. / wrong info.', impact: 'Type I/II error', existing_control: 'Investigation & Testing data sheet / Verification by Group Manager', type_risk: 1, severity: 5, occurrence: 1, measure_procedure: 1, detail: 'P-APTC-01', responsibility: 'Group manager' },
        { risk_opportunity: 'Work is not on plan', impact: 'Customer dissatisfy', existing_control: 'Work order log', type_risk: 1, severity: 5, occurrence: 2, measure_procedure: 1, measure_kpi: 1, measure_preventive: 1, detail: 'P-APTC-01, KPI of lead time, Weekly group meeting', responsibility: 'Group manager' },
        { risk_opportunity: 'Lost of record', impact: 'Cannot trace back to machine/device', existing_control: 'Store in file server with backup', type_risk: 1, severity: 4, occurrence: 1, measure_procedure: 1, detail: "Follow NBMT's policy", responsibility: 'NBMT IT' },
        { risk_opportunity: 'Mis-handling of sample parts after investigation/testing', impact: 'Cannot trace back to sample parts', existing_control: 'P-APTC-01', type_risk: 1, severity: 4, occurrence: 1, measure_procedure: 1, detail: 'P-APTC-01', responsibility: 'Asst. Manager' },
        { risk_opportunity: 'Mis-handling of calibration/training record', impact: 'Lost of record', existing_control: 'Store in file server with backup', type_risk: 1, severity: 4, occurrence: 1, measure_procedure: 1, detail: "Follow NBMT's policy", responsibility: 'NBMT IT' },
        { risk_opportunity: 'Calibration is not on plan.', impact: 'Lack of measurement reliability', existing_control: 'P-APTC-02', type_risk: 1, severity: 5, occurrence: 1, measure_procedure: 1, detail: 'P-APTC-02', responsibility: 'Aunchittha' },
        { risk_opportunity: 'Training is not on plan.', impact: 'Personal cannot perform work', existing_control: 'P-APTC-04', type_risk: 1, severity: 5, occurrence: 1, measure_procedure: 1, detail: 'P-APTC-04', responsibility: 'Group manager' },
      ]},
      { cat: 'Input', items: [
        { risk_opportunity: 'Quality of sample not meet specification', impact: 'High variation of testing result', existing_control: 'Confirm by dimension/appearance', type_risk: 1, severity: 5, occurrence: 1, measure_procedure: 1, detail: 'P-APTC-01', responsibility: 'Asst. Manager' },
        { risk_opportunity: 'Quality of material supply (for exp. out of expire date)', impact: 'High variation of investigation/testing result', existing_control: 'Inventory control (FIFO)', type_risk: 1, severity: 5, occurrence: 1, measure_procedure: 1, detail: 'Inventory control log', responsibility: 'Pastraporn' },
      ]},
      { cat: 'How', items: [
        { risk_opportunity: 'Document is out of date', impact: 'Redo of paper work to conform current document', existing_control: 'P-APTC-03', type_risk: 1, severity: 2, occurrence: 2, measure_procedure: 1, detail: 'P-APTC-03', responsibility: 'Sukanya' },
      ]},
      { cat: 'Interested Party Need & Expectation', items: [
        { risk_opportunity: 'Employees lack safety awareness', impact: 'Work is not on plan due to accident leave', existing_control: 'Training of safety as P-APTC-04', type_risk: 1, severity: 5, occurrence: 1, measure_procedure: 1, measure_preventive: 1, detail: 'Risk assessment, Safety news TV, training of safety for specific topic (crane, confine space)', responsibility: 'Peerapat' },
        { risk_opportunity: 'Aged machines frequent trouble', impact: 'Work is not on plan due to machine breakdown', existing_control: 'P-APTC-01', type_risk: 1, severity: 5, occurrence: 2, measure_kpi: 1, measure_preventive: 1, detail: 'KPI, maintenance plan, Action plan to replace aged machines [4-5 ton test rig (FY25)]', responsibility: 'Asst. Manager' },
      ]},
      { cat: 'With/What', items: [
        { risk_opportunity: 'Machine trouble', impact: 'Cannot perform task', existing_control: 'P-APTC-01', type_risk: 1, severity: 5, occurrence: 2, measure_kpi: 1, measure_preventive: 1, detail: 'KPI, maintenance plan', responsibility: 'Asst. Manager' },
        { risk_opportunity: 'Measuring device trouble', impact: 'Measuring result is invalid.', existing_control: 'P-APTC-02', type_risk: 1, severity: 5, occurrence: 1, measure_procedure: 1, measure_preventive: 1, detail: 'P-APTC-02, Action plan to replace aged devices Surfcom (FY25), Hardness vicker(FY26), Microphone of noise room (FY25)', responsibility: 'Pastraporn, Sukit, Sukanya' },
        { risk_opportunity: 'Investigation/Testing room is inappropriate condition', impact: 'Variation of investigation/testing result', existing_control: 'Temperature control, Ambient Noise level', type_risk: 1, severity: 3, occurrence: 2, measure_procedure: 1, measure_preventive: 1, detail: 'P-APTC-01, keep condition of temp', responsibility: 'Asst. Manager, Sukit' },
        { risk_opportunity: 'Computer trouble', impact: 'Lost of data, Cyber attack', existing_control: 'Store in file server with backup', type_risk: 1, severity: 5, occurrence: 1, measure_procedure: 1, measure_preventive: 1, detail: "Follow NBMT's and AOHQ policy (Install Desktop Central, etc.)", responsibility: 'NBMT IT, Sukit' },
        { risk_opportunity: 'Obsolete of software/hardware', impact: 'Difficult to maintenance', existing_control: 'Periodic renewal', type_risk: 1, severity: 4, occurrence: 1, measure_procedure: 1, measure_preventive: 1, detail: 'Update list of all hardware/software (Make a list /Auto CAD 2004, etc.)', responsibility: 'Sukit' },
      ]},
      { cat: 'With Who', items: [
        { risk_opportunity: 'Employees lack of skill', impact: 'Variation of investigation/testing result', existing_control: 'On the job training (P-APTC-004)', type_risk: 1, severity: 4, occurrence: 1, measure_procedure: 1, detail: 'P-APTC-04', responsibility: 'Group manager' },
        { risk_opportunity: 'Number of employee is insufficient.', impact: 'Delay of investigation/testing report', existing_control: 'Ask employee to do an overtime', type_risk: 1, severity: 4, occurrence: 1, measure_procedure: 1, detail: 'During recruitment to fulfill manpower as MTP (2022-2026)', responsibility: 'Group manager' },
      ]},
      { cat: 'Support Process', items: [
        { risk_opportunity: 'Out of acceptable level of calibration result', impact: 'Variation of investigation/testing result', existing_control: 'P-APTC-02', type_risk: 1, severity: 5, occurrence: 1, measure_procedure: 1, detail: 'P-APTC-02', responsibility: 'Pastraporn' },
        { risk_opportunity: 'Out of accuracy of jig/fixture', impact: 'Variation of investigation/testing result', existing_control: '1) Receiving check of jig/fixture\n2) Check sheet for testing', type_risk: 1, severity: 5, occurrence: 1, measure_procedure: 1, detail: 'W-01-TES, F-01-TES', responsibility: 'Asst. Manager' },
        { risk_opportunity: 'Shortage/discontinuity of spare parts', impact: 'Work is not on plan due to machine breakdown', existing_control: 'P-APTC-01', type_risk: 1, severity: 5, occurrence: 2, measure_kpi: 1, measure_preventive: 1, detail: 'KPI, maintenance plan, calibration plan (availability of critical spare part check)', responsibility: 'Asst. Manager' },
      ]},
    ];

    for (const group of seedData) {
      const catId = catMap[group.cat];
      if (!catId) continue;
      for (let i = 0; i < group.items.length; i++) {
        const it = group.items[i];
        await dbRun(req.db,
          `INSERT INTO RiskAssessmentItem
            (category_id, item_no, risk_opportunity, impact, existing_control,
             type_risk, type_opportunity, severity, occurrence,
             measure_accept, measure_procedure, measure_kpi, measure_preventive,
             detail, responsibility, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [catId, i + 1, it.risk_opportunity, it.impact || '', it.existing_control || '',
           it.type_risk || 0, it.type_opportunity || 0, it.severity || 1, it.occurrence || 1,
           it.measure_accept || 0, it.measure_procedure || 0, it.measure_kpi || 0, it.measure_preventive || 0,
           it.detail || '', it.responsibility || '', req.user.id]);
      }
    }

    // Seed revisions
    const revs = [
      { rev_no: 'Rev.01', effective_date: '2018-04-18', detail: 'Risk assessment of APTC' },
      { rev_no: 'Rev.02', effective_date: '2019-04-01', detail: 'Update the annual of risk assessment' },
      { rev_no: 'Rev.03', effective_date: '2020-02-03', detail: 'Update the annual of risk assessment' },
      { rev_no: 'Rev.04', effective_date: '2021-02-03', detail: 'Update the annual of risk assessment' },
      { rev_no: 'Rev.05', effective_date: '2022-02-01', detail: 'Update the annual of risk assessment' },
      { rev_no: 'Rev.06', effective_date: '2022-12-19', detail: 'Update the annual of risk assessment' },
      { rev_no: 'Rev.07', effective_date: '2024-01-22', detail: 'Update the annual of risk assessment' },
      { rev_no: 'Rev.08', effective_date: '2025-02-06', detail: 'Update the annual of risk assessment' },
      { rev_no: 'Rev.09', effective_date: '2026-01-29', detail: 'Update the annual of risk assessment' },
    ];
    const existingRevs = await dbGet(req.db, 'SELECT COUNT(*) as cnt FROM RiskAssessmentRevision');
    if (!existingRevs || existingRevs.cnt === 0) {
      for (const r of revs) {
        await dbRun(req.db,
          'INSERT INTO RiskAssessmentRevision (rev_no, effective_date, detail, created_by) VALUES (?,?,?,?)',
          [r.rev_no, r.effective_date, r.detail, req.user.id]);
      }
    }

    try { await auditService.recordEvent('RiskAssessment', 0, req.user.id, 'SEED_RA_DATA', { items_count: seedData.reduce((a, g) => a + g.items.length, 0) }); } catch { /* */ }

    res.json({ success: true, message: 'Risk assessment data seeded from Excel form' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Summary / Stats ─────────────────────────────────────────────────────────

// GET /stats
router.get('/stats', async (req: any, res: any) => {
  try {
    await ensureTables(req.db);
    const totalItems = await dbGet(req.db, "SELECT COUNT(*) as cnt FROM RiskAssessmentItem WHERE status = 'ACTIVE'");
    const categories = await dbAll(req.db,
      `SELECT c.id, c.name, c.sort_order, COUNT(i.id) as item_count,
              COALESCE(AVG(i.severity * i.occurrence), 0) as avg_risk_score,
              COALESCE(MAX(i.severity * i.occurrence), 0) as max_risk_score
       FROM RiskAssessmentCategory c
       LEFT JOIN RiskAssessmentItem i ON c.id = i.category_id AND i.status = 'ACTIVE'
       GROUP BY c.id ORDER BY c.sort_order`);
    const pendingRequests = await dbGet(req.db, "SELECT COUNT(*) as cnt FROM RiskAssessmentEditRequest WHERE status = 'PENDING'");
    const highRisks = await dbGet(req.db, "SELECT COUNT(*) as cnt FROM RiskAssessmentItem WHERE status = 'ACTIVE' AND (severity * occurrence) >= 10");
    res.json({
      total_items: totalItems?.cnt || 0,
      pending_requests: pendingRequests?.cnt || 0,
      high_risk_count: highRisks?.cnt || 0,
      categories,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export = router;
