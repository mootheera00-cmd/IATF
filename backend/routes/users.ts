// routes/users.ts
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const auditService = require('../services/auditService');
const { jwtSecret: JWT_SECRET } = require('../config/config');

const router = express.Router();
const ALLOWED_ROLES = [
  'ADMIN',
  'ENGINEER',
  'Engineer',
  'LEADER',
  'Leader',
  'ASSISTANT_MANAGER',
  'Assistant Manager',
  'MANAGER',
  'Manager',
  'DOCUMENT_CONTROL',
  'Document Controller',
  'PRESIDENT',
  'President',
  'USER',
  'QMR',
  'CHANGE_REQUESTER'
];

// ---------- Middleware: Auth ----------
function authRequired(req: any, res: any, next: any) {
  try {
    const h = req.headers['authorization'] || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Missing token' });
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // คาดหวัง { id, role, employee_code, ... }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid/Expired token' });
  }
}

function requireAdmin(req: any, res: any, next: any) {
  // กรณี token มี role = 'ADMIN' ก็ผ่านได้เลย
  if (req.user && (req.user.role === 'ADMIN' || req.user.isAdmin === true)) {
    return next();
  }
  // เผื่อ token ไม่มี role: ตรวจใน DB จาก user id/employee_code
  const db = req.db;
  const uid = req.user?.id;
  const emp = req.user?.employee_code;

  if (!db || (!uid && !emp)) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const sql =
    uid
      ? `SELECT r.name AS role FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?`
      : `SELECT r.name AS role FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.employee_code = ?`;
  const param = uid ? [uid] : [emp];

  db.get(sql, param, (err: any, row: any) => {
    if (err) return res.status(500).json({ message: 'DB error', detail: err.message });
    if (row?.role === 'ADMIN') return next();
    return res.status(403).json({ message: 'Admin access required' });
  });
}

// ---------- Helpers ----------
function run(db: any, sql: string, params: any[] = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err: any) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}
function all(db: any, sql: string, params: any[] = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any) => (err ? reject(err) : resolve(rows)));
  });
}
function get(db: any, sql: string, params: any[] = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err: any, row: any) => (err ? reject(err) : resolve(row)));
  });
}

async function ensureRoleId(db: any, { role_id, role }: { role_id?: number; role?: string }) {
  if (role_id) return role_id;
  if (!role) return null;

  if (!ALLOWED_ROLES.includes(role)) {
    throw new Error('Invalid role');
  }

  // ถ้ามีชื่อ role เข้ามา: สร้างถ้าไม่เคยมี
  await run(db, `CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );`);

  const existed: any = await get(db, `SELECT id FROM roles WHERE name = ?`, [role]);
  if (existed?.id) return existed.id;

  const r: any = await run(db, `INSERT INTO roles(name) VALUES (?)`, [role]);
  return r.lastID;
}

// ---------- Routes ----------

// GET /api/users  (ADMIN only)
router.get('/', authRequired, requireAdmin, async (req: any, res: any) => {
  try {
    const db = req.db;
    const rows = await all(
      db,
      `SELECT u.id, u.employee_code, u.name,
              u.email,
              u.role_id, COALESCE(r.name, '') AS role,
              u.created_at, u.updated_at
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
        ORDER BY u.id ASC`
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ message: 'DB error', detail: err.message });
  }
});

// GET /api/users/roles (ADMIN only)
router.get('/roles', authRequired, requireAdmin, async (req: any, res: any) => {
  try {
    const db = req.db;
    const rows = await all(db, `SELECT id, name FROM roles WHERE name IN (${ALLOWED_ROLES.map(() => '?').join(',')}) ORDER BY name ASC`, ALLOWED_ROLES);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ message: 'DB error', detail: err.message });
  }
});

// POST /api/users (ADMIN only)
// Body: { employee_code, name, password, role_id? or role? }
router.post('/', authRequired, requireAdmin, async (req: any, res: any) => {
  try {
    const db = req.db;
    let { employee_code, name, email, password, role_id, role } = req.body;

    if (!employee_code || !name || !password) {
      return res.status(400).json({ message: 'employee_code, name, password are required' });
    }

    if (role && !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // สร้าง/ดึง role_id จาก role (string) หากส่งมา
    const rid = await ensureRoleId(db, { role_id, role });

    const hash = await bcrypt.hash(password, 10);

    await run(
      db,
      `INSERT INTO users (employee_code, name, email, password_hash, role_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [employee_code.trim(), name.trim(), (email || '').trim() || null, hash, rid || null]
    );

    const row = await get(
      db,
      `SELECT u.id, u.employee_code, u.name, u.email, u.role_id, COALESCE(r.name,'') AS role
         FROM users u LEFT JOIN roles r ON u.role_id=r.id
        WHERE u.employee_code = ?`,
      [employee_code.trim()]
    );

    // Audit log
    await auditService.recordEvent('User', (row as any)?.id ?? 0, req.user.id, 'USER_CREATED', {
      employee_code: employee_code.trim(),
      name: name.trim(),
      role: (row as any)?.role || null,
      created_by: req.user.employee_code || req.user.id
    });

    res.status(201).json({ message: 'User created', user: row });
  } catch (err: any) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ message: 'employee_code already exists' });
    }
    res.status(500).json({ message: 'DB error', detail: err.message });
  }
});

// PUT /api/users/:id (ADMIN only)
// Body: { employee_code, name, email, password?, role_id? or role? }
router.put('/:id', authRequired, requireAdmin, async (req: any, res: any) => {
  try {
    const db = req.db;
    const userId = Number(req.params.id);
    let { employee_code, name, email, password, role_id, role } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    if (!employee_code || !name) {
      return res.status(400).json({ message: 'employee_code and name are required' });
    }
    if (role && !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const existing: any = await get(db, `SELECT id FROM users WHERE id = ?`, [userId]);
    if (!existing) {
      return res.status(404).json({ message: 'User not found' });
    }

    const rid = await ensureRoleId(db, { role_id, role });

    if (password && String(password).trim().length > 0) {
      const hash = await bcrypt.hash(password, 10);
      await run(
        db,
        `UPDATE users
            SET employee_code = ?,
                name = ?,
                email = ?,
                password_hash = ?,
                role_id = ?,
                updated_at = datetime('now')
          WHERE id = ?`,
        [employee_code.trim(), name.trim(), (email || '').trim() || null, hash, rid || null, userId]
      );
    } else {
      await run(
        db,
        `UPDATE users
            SET employee_code = ?,
                name = ?,
                email = ?,
                role_id = ?,
                updated_at = datetime('now')
          WHERE id = ?`,
        [employee_code.trim(), name.trim(), (email || '').trim() || null, rid || null, userId]
      );
    }

    const row = await get(
      db,
      `SELECT u.id, u.employee_code, u.name, u.email, u.role_id, COALESCE(r.name,'') AS role
         FROM users u LEFT JOIN roles r ON u.role_id=r.id
        WHERE u.id = ?`,
      [userId]
    );

    // Audit log
    await auditService.recordEvent('User', userId, req.user.id, 'USER_UPDATED', {
      employee_code: employee_code.trim(),
      name: name.trim(),
      role: (row as any)?.role || null,
      password_changed: !!(password && String(password).trim().length > 0),
      updated_by: req.user.employee_code || req.user.id
    });

    res.json({ message: 'User updated', user: row });
  } catch (err: any) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ message: 'employee_code already exists' });
    }
    if (String(err.message).includes('Invalid role')) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    res.status(500).json({ message: 'DB error', detail: err.message });
  }
});

// DELETE /api/users/:id (ADMIN only)
router.delete('/:id', authRequired, requireAdmin, async (req: any, res: any) => {
  try {
    const db = req.db;
    const userId = Number(req.params.id);

    if (!userId) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    if (req.user?.id && Number(req.user.id) === userId) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const existing: any = await get(db, `SELECT id, employee_code, name FROM users WHERE id = ?`, [userId]);
    if (!existing) {
      return res.status(404).json({ message: 'User not found' });
    }

    await run(db, `DELETE FROM users WHERE id = ?`, [userId]);

    // Audit log
    await auditService.recordEvent('User', userId, req.user.id, 'USER_DELETED', {
      employee_code: existing.employee_code,
      name: existing.name,
      deleted_by: req.user.employee_code || req.user.id
    });

    return res.json({ message: 'User deleted', user: existing });
  } catch (err: any) {
    if (String(err.message).includes('FOREIGN KEY') || String(err.message).includes('constraint')) {
      return res.status(409).json({ message: 'Cannot delete user because related records exist' });
    }
    return res.status(500).json({ message: 'DB error', detail: err.message });
  }
});

export = router;
