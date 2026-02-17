// backend/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpiresIn } = require('../config/config');

function createAccessLog(db, userId, action, detail) {
  db.run(
    `INSERT INTO access_logs (user_id, action, detail) VALUES (?, ?, ?)`,
    [userId, action, detail || null]
  );
}

function login(db) {
  return (req, res) => {
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
      async (err, user) => {
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

        // ส่ง token ทั้งแบบ cookie และ response body
        res
          .cookie('token', token, {
            httpOnly: true,
            secure: false, // เปลี่ยนเป็น true เมื่อใช้ HTTPS จริง
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

function logout(db) {
  return (req, res) => {
    if (req.user?.id) {
      createAccessLog(db, req.user.id, 'LOGOUT', `User ${req.user.employee_code} logged out`);
    }
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
  };
}

module.exports = {
  login,
  logout
};
