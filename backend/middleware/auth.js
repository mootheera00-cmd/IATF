// middleware/auth.js
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.SECRET_KEY || 'dev-secret';

function authRequired(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
      if (err) return res.status(403).json({ message: 'Invalid token' });
      req.user = decoded;
      next();
    });
  } catch (err) {
    console.error('authRequired error', err);
    return res.status(500).json({ message: 'Auth middleware error' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}

module.exports = { authRequired, requireRole, SECRET_KEY };
