// routes/users.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');

dotenv.config();
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// ---------- Middleware: Auth ----------
function authRequired(req, res, next) {
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

function requireAdmin(req, res, next) {
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

  db.get(sql, param, (err, row) => {
    if (err) return res.status(500).json({ message: 'DB error', detail: err.message });
    if (row?.role === 'ADMIN') return next();
    return res.status(403).json({ message: 'Admin access required' });
  });
}

// ---------- Helpers ----------
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

async function ensureRoleId(db, { role_id, role }) {
  if (role_id) return role_id;
  if (!role) return null;

  // ถ้ามีชื่อ role เข้ามา: สร้างถ้าไม่เคยมี
  await run(db, `CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );`);

  const existed = await get(db, `SELECT id FROM roles WHERE name = ?`, [role]);
  if (existed?.id) return existed.id;

  const r = await run(db, `INSERT INTO roles(name) VALUES (?)`, [role]);
  return r.lastID;
}

// ---------- Routes ----------

// GET /api/users  (ADMIN only)
router.get('/', authRequired, requireAdmin, async (req, res) => {
  try {
    const db = req.db;
    const rows = await all(
      db,
      `SELECT u.id, u.employee_code, u.name,
              u.role_id, COALESCE(r.name, '') AS role,
              u.created_at, u.updated_at
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
        ORDER BY u.id ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'DB error', detail: err.message });
  }
});

// GET /api/users/roles (ADMIN only)
router.get('/roles', authRequired, requireAdmin, async (req, res) => {
  try {
    const db = req.db;
    const rows = await all(db, `SELECT id, name FROM roles ORDER BY name ASC`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'DB error', detail: err.message });
  }
});

// POST /api/users (ADMIN only)
// Body: { employee_code, name, password, role_id? or role? }
router.post('/', authRequired, requireAdmin, async (req, res) => {
  try {
    const db = req.db;
    let { employee_code, name, password, role_id, role } = req.body;

    if (!employee_code || !name || !password) {
      return res.status(400).json({ message: 'employee_code, name, password are required' });
    }

    // สร้าง/ดึง role_id จาก role (string) หากส่งมา
    const rid = await ensureRoleId(db, { role_id, role });

    const hash = await bcrypt.hash(password, 10);

    await run(
      db,
      `INSERT INTO users (employee_code, name, password_hash, role_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [employee_code.trim(), name.trim(), hash, rid || null]
    );

    const row = await get(
      db,
      `SELECT u.id, u.employee_code, u.name, u.role_id, COALESCE(r.name,'') AS role
         FROM users u LEFT JOIN roles r ON u.role_id=r.id
        WHERE u.employee_code = ?`,
      [employee_code.trim()]
    );

    res.status(201).json({ message: 'User created', user: row });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ message: 'employee_code already exists' });
    }
    res.status(500).json({ message: 'DB error', detail: err.message });
  }
});

module.exports = router;