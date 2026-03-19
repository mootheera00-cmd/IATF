// backend/controllers/authController.ts
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpiresIn } = require('../config/config');
const auditService = require('../services/auditService');

function createAccessLog(db: any, userId: any, action: any, detail: any) {
  db.run(`INSERT INTO access_logs (user_id, action, detail) VALUES (?, ?, ?)`, [userId, action, detail || null]);
}

function login(db: any) {
  return (req: any, res: any) => {
    const { employee_code, password } = req.body;

    if (!employee_code || !password) {
      return res.status(400).json({ message: 'employee_code and password are required' });
    }

    db.get(
      `
      SELECT u.id, u.employee_code, u.name, u.password_hash, u.is_active, r.name AS role
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.employee_code = ?
      `,
      [employee_code],
      async (err: any, user: any) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Database error' });
        }
        if (!user) {
          return res.status(401).json({ message: 'Invalid credentials' });
        }
        if (!user.is_active) {
          return res.status(403).json({ message: 'User is inactive' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
          return res.status(401).json({ message: 'Invalid credentials' });
        }

        const payload = {
          id: user.id,
          employee_code: user.employee_code,
          name: user.name,
          role: user.role
        };

        const token = jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn });

        // Log access
        createAccessLog(db, user.id, 'LOGIN', `User ${user.employee_code} logged in`);

        // Also write to main AuditEvent for unified logs
        auditService.recordEvent('User', user.id, user.id, 'LOGIN', {
          employee_code: user.employee_code,
          name: user.name,
          role: user.role
        }).catch(() => {});

        // ส่ง token ทั้งแบบ cookie และ response body
        res
          .cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
          })
          .json({
            message: 'Login successful',
            user: payload,
            token
          });
      }
    );
  };
}

function logout(db: any) {
  return (req: any, res: any) => {
    if (req.user?.id) {
      createAccessLog(db, req.user.id, 'LOGOUT', `User ${req.user.employee_code} logged out`);
      // Also write to main AuditEvent for unified logs
      auditService.recordEvent('User', req.user.id, req.user.id, 'LOGOUT', {
        employee_code: req.user.employee_code,
        name: req.user.name
      }).catch(() => {});
    }
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
  };
}

export = {
  login,
  logout
};
