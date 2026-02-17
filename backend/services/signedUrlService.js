// backend/services/signedUrlService.js
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbPath);

const signedUrlService = {
  async generateSignedUrl(cr_id, document_id, user_id, file_uri) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date();
    expires_at.setHours(expires_at.getHours() + 24); // Token valid for 24 hours

    const sql = `INSERT INTO SignedUrlToken (cr_id, document_id, user_id, token, file_uri, expires_at) VALUES (?, ?, ?, ?, ?, ?)`;
    await new Promise((resolve, reject) => {
      db.run(sql, [cr_id, document_id, user_id, token, file_uri, expires_at.toISOString()], function(err) {
        if (err) reject(err);
        resolve();
      });
    });

    return `/api/download/${token}`;
  },

  async verifySignedUrl(token) {
    const sql = `SELECT * FROM SignedUrlToken WHERE token = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`;
    const row = await new Promise((resolve, reject) => {
      db.get(sql, [token], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (row) {
      // Mark token as used
      const updateSql = `UPDATE SignedUrlToken SET used_at = CURRENT_TIMESTAMP WHERE id = ?`;
      db.run(updateSql, [row.id]);
    }

    return row;
  }
};

module.exports = signedUrlService;
