// routes/admin.ts
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const auditService = require('../services/auditService');
const { getFileAccessLogs } = require('../middleware/fileAccess');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbCandidates = [
  path.resolve(__dirname, '..', '..', 'db', 'nskiatf_doccontrol.db'),
  path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db'),
  path.resolve(process.cwd(), 'db', 'nskiatf_doccontrol.db')
];
const dbPath = dbCandidates.find((candidate: string) => fs.existsSync(candidate)) || dbCandidates[0];
const db = new sqlite3.Database(dbPath);

// Promisify db operations
const get = (sql: string, params?: any[]) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err: any, row: any) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const all = (sql: string, params?: any[]) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

const run = (sql: string, params?: any[]) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err: any) {
      if (err) reject(err);
      else resolve(this);
    });
  });

/**
 * CREATE ROLE
 * POST /api/admin/roles
 */
router.post('/roles', authRequired, requireRole('ADMIN'), async (req: any, res: any) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Role name is required' });
    }

    const result: any = await run('INSERT INTO roles (name) VALUES (?)', [name]);

    // Log in audit trail
    await auditService.recordEvent('Role', result.lastID, req.user.id, 'CREATE', { name });

    res.status(201).json({
      message: 'Role created successfully',
      role_id: result.lastID,
      role_name: name
    });
  } catch (error: any) {
    if (error.message.includes('UNIQUE')) {
      return res.status(400).json({ message: 'Role name already exists' });
    }
    res.status(500).json({
      message: 'Error creating role',
      error: error.message
    });
  }
});

/**
 * CREATE POSITION
 * POST /api/admin/positions
 */
router.post('/positions', authRequired, requireRole('ADMIN'), async (req: any, res: any) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Position name is required' });
    }

    const result: any = await run('INSERT INTO positions (name, description) VALUES (?, ?)', [name, description || '']);

    // Log in audit trail
    await auditService.recordEvent('Position', result.lastID, req.user.id, 'CREATE', { name, description });

    res.status(201).json({
      message: 'Position created successfully',
      position_id: result.lastID,
      position_name: name
    });
  } catch (error: any) {
    res.status(500).json({
      message: 'Error creating position',
      error: error.message
    });
  }
});

/**
 * ASSIGN ROLE TO USER
 * PUT /api/admin/users/:id/role
 * Body: { role_id }
 */
router.put('/users/:id/role', authRequired, requireRole('ADMIN'), async (req: any, res: any) => {
  try {
    const userId = req.params.id;
    const { role_id } = req.body;

    if (!role_id) {
      return res.status(400).json({ message: 'role_id is required' });
    }

    // Verify user exists
    const user: any = await get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify role exists
    const role: any = await get('SELECT * FROM roles WHERE id = ?', [role_id]);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    await run('UPDATE users SET role_id = ? WHERE id = ?', [role_id, userId]);

    // Log in audit trail
    await auditService.recordEvent('User', userId, req.user.id, 'ASSIGN_ROLE', {
      role_id,
      role_name: role.name,
      by_user: req.user.id
    });

    res.json({
      message: 'User role updated successfully',
      user_id: userId,
      role_id: role_id,
      role_name: role.name
    });
  } catch (error: any) {
    res.status(500).json({
      message: 'Error updating user role',
      error: error.message
    });
  }
});

/**
 * GET AUDIT TRAIL FOR ENTITY
 * GET /api/admin/audit/:entity_type/:entity_id
 * Returns: Complete audit log for a change request or document
 */
router.get('/audit/:entity_type/:entity_id', authRequired, requireRole('ADMIN', 'QMR', 'DOCUMENT_CONTROL'), async (req: any, res: any) => {
  try {
    const { entity_type, entity_id } = req.params;

    const events = await auditService.getEventLog(entity_type, entity_id);

    res.json({
      entity_type,
      entity_id,
      event_count: events.length,
      events
    });
  } catch (error: any) {
    res.status(500).json({
      message: 'Error fetching audit trail',
      error: error.message
    });
  }
});

/**
 * GET USER AUDIT EVENTS (Compliance Report)
 * GET /api/admin/audit/user/:user_id
 * Query params: start_date, end_date (ISO format)
 */
router.get('/audit/user/:user_id', authRequired, requireRole('ADMIN', 'QMR'), async (req: any, res: any) => {
  try {
    const user_id = req.params.user_id;
    const { start_date, end_date } = req.query as any;

    const events = await auditService.getEventsByUser(user_id, start_date, end_date);
    const fileAccessLogs = await getFileAccessLogs(user_id, start_date, end_date);

    res.json({
      user_id,
      period: {
        start_date: start_date || 'all time',
        end_date: end_date || 'all time'
      },
      operation_count: events.length,
      file_access_count: fileAccessLogs.length,
      events,
      file_access_logs: fileAccessLogs
    });
  } catch (error: any) {
    res.status(500).json({
      message: 'Error fetching user audit events',
      error: error.message
    });
  }
});

/**
 * GENERATE COMPLIANCE REPORT
 * GET /api/admin/compliance-report
 * Query params: start_date, end_date (ISO format)
 * Returns: IATF 16949 compliant audit report
 */
router.get('/compliance-report', authRequired, requireRole('ADMIN', 'QMR'), async (req: any, res: any) => {
  try {
    const { start_date, end_date } = req.query as any;

    if (!start_date || !end_date) {
      return res.status(400).json({
        message: 'start_date and end_date query parameters are required (ISO format)'
      });
    }

    // Verify dates are valid
    const start = new Date(start_date);
    const end = new Date(end_date);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        message: 'Invalid date format. Use ISO format (YYYY-MM-DD or ISO 8601)'
      });
    }

    const report = await auditService.getComplianceReport(start_date, end_date);

    res.json({
      report_type: 'IATF 16949 Document Control Compliance Report',
      generated_at: new Date().toISOString(),
      generated_by: req.user.id,
      ...report
    });
  } catch (error: any) {
    res.status(500).json({
      message: 'Error generating compliance report',
      error: error.message
    });
  }
});

/**
 * GET CHANGE REQUEST APPROVAL HISTORY
 * GET /api/admin/change-request/:cr_id/approvals
 * Returns: All approval records and decision history
 */
router.get('/change-request/:cr_id/approvals', authRequired, requireRole('ADMIN', 'QMR'), async (req: any, res: any) => {
  try {
    const cr_id = req.params.cr_id;

    // Get change request
    const cr: any = await get(
      `
            SELECT cr.*, d.title as document_title, d.doc_number,
                   u1.name as requester_name, u2.name as manager_name
            FROM ChangeRequest cr
            LEFT JOIN Document d ON cr.document_id = d.id
            LEFT JOIN users u1 ON cr.requester_id = u1.id
            LEFT JOIN users u2 ON cr.manager_id = u2.id
            WHERE cr.id = ?
        `,
      [cr_id]
    );

    if (!cr) {
      return res.status(404).json({ message: 'Change request not found' });
    }

    // Get all approval records
    const approvalRecords = (await all(
      `
            SELECT ar.*, u.name as decided_by_name
            FROM ApprovalRecord ar
            LEFT JOIN users u ON ar.decided_by = u.id
            WHERE ar.cr_id = ?
            ORDER BY ar.decided_at DESC
        `,
      [cr_id]
    )) as any[];

    // Get audit events
    const auditEvents = (await all(
      `
            SELECT ae.* FROM AuditEvent ae
            WHERE ae.entity_type = 'ChangeRequest' AND ae.entity_id = ?
            ORDER BY ae.created_at DESC
        `,
      [cr_id]
    )) as any[];

    res.json({
      change_request: cr,
      approval_history: approvalRecords || [],
      audit_events: auditEvents || [],
      summary: {
        total_approvals: (approvalRecords || []).length,
        total_events: (auditEvents || []).length,
        current_status: cr.status
      }
    });
  } catch (error: any) {
    res.status(500).json({
      message: 'Error fetching approval history',
      error: error.message
    });
  }
});

/**
 * GET ALL DOCUMENT REVISIONS WITH STATUS
 * GET /api/admin/document/:doc_id/revisions
 * Returns: Complete revision history with approvals
 */
router.get('/document/:doc_id/revisions', authRequired, requireRole('ADMIN', 'DOCUMENT_CONTROL', 'QMR'), async (req: any, res: any) => {
  try {
    const doc_id = req.params.doc_id;

    // Get document
    const doc: any = await get(
      `
            SELECT * FROM Document WHERE id = ?
        `,
      [doc_id]
    );

    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Get all revisions
    const revisions = (await all(
      `
            SELECT dr.*, u1.name as created_by_name, u2.name as released_by_name
            FROM DocumentRevision dr
            LEFT JOIN users u1 ON dr.created_by = u1.id
            LEFT JOIN users u2 ON dr.released_by = u2.id
            WHERE dr.document_id = ?
            ORDER BY dr.id DESC
        `,
      [doc_id]
    )) as any[];

    // Get change requests for this document
    const changeRequests = (await all(
      `
            SELECT cr.*, u1.name as requester_name, u2.name as manager_name
            FROM ChangeRequest cr
            LEFT JOIN users u1 ON cr.requester_id = u1.id
            LEFT JOIN users u2 ON cr.manager_id = u2.id
            WHERE cr.document_id = ?
            ORDER BY cr.created_at DESC
        `,
      [doc_id]
    )) as any[];

    res.json({
      document: doc,
      revisions: revisions || [],
      change_requests: changeRequests || [],
      summary: {
        total_revisions: (revisions || []).length,
        current_revision_id: doc.current_revision_id,
        total_change_requests: (changeRequests || []).length
      }
    });
  } catch (error: any) {
    res.status(500).json({
      message: 'Error fetching document revisions',
      error: error.message
    });
  }
});

export = router;
