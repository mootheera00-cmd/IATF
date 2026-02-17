// routes/admin.js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');

// Create role
router.post('/roles', authRequired, requireRole('ADMIN'), (req, res) => {
  const db = req.db;
  const { name } = req.body;
  db.run('INSERT INTO roles (name) VALUES (?)', [name], function(err) {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json({ message: 'Role created', role_id: this.lastID });
  });
});

// Create position
router.post('/positions', authRequired, requireRole('ADMIN'), (req, res) => {
  const db = req.db;
  const { name, description } = req.body;
  db.run('INSERT INTO positions (name, description) VALUES (?, ?)', [name, description], function(err) {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json({ message: 'Position created', position_id: this.lastID });
  });
});

// Assign role to user
router.put('/users/:id/role', authRequired, requireRole('ADMIN'), (req, res) => {
  const db = req.db;
  const userId = req.params.id;
  const { role_id } = req.body;
  db.run('UPDATE users SET role_id = ? WHERE id = ?', [role_id, userId], function(err) {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json({ message: 'User role updated' });
  });
});

module.exports = router;
