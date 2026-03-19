// middleware/auth.ts
const jwt = require('jsonwebtoken');
const { jwtSecret: SECRET_KEY } = require('../config/config');

function normalizeRoleName(role: any) {
  return String(role || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function authRequired(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    jwt.verify(token, SECRET_KEY, (err: any, decoded: any) => {
      if (err) return res.status(403).json({ message: 'Invalid token' });
      req.user = decoded;
      next();
    });
  } catch (err) {
    console.error('authRequired error', err);
    return res.status(500).json({ message: 'Auth middleware error' });
  }
}

function requireRole(...allowedRoles: any[]) {
  return (req: any, res: any, next: any) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const currentRole = normalizeRoleName(req.user.role);
    const allowed = allowedRoles
      .flat()
      .map(normalizeRoleName)
      .filter(Boolean);

    if (!allowed.includes(currentRole)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

export = { authRequired, requireRole };
