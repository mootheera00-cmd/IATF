const express = require('express');
const router = express.Router();
const authRouter = require('./auth');
const authRequired = authRouter.authRequired;

// Search documents
router.get('/', authRequired, (req, res) => {
    const db = req.app.locals.db;
    const { doc_no, title, level, status, owner_id } = req.query;

    let sql = "SELECT * FROM documents WHERE 1=1";
    const params = [];

    if (doc_no) { sql += " AND doc_no LIKE ?"; params.push(`%${doc_no}%`); }
    if (title) { sql += " AND title LIKE ?"; params.push(`%${title}%`); }
    if (level) { sql += " AND level=?"; params.push(level); }
    if (status) { sql += " AND current_status=?"; params.push(status); }
    if (owner_id) { sql += " AND owner_id=?"; params.push(owner_id); }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ message: "Error searching documents" });
        res.json(rows);
    });
});

module.exports = router;
