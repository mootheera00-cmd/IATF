// backend/services/signedUrlService.ts
const crypto = require('crypto');
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

const signedUrlService = {
  async generateSignedUrl(cr_id: any, document_id: any, user_id: any, file_uri: any) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date();
    expires_at.setHours(expires_at.getHours() + 24); // Token valid for 24 hours

    const sql = `INSERT INTO SignedUrlToken (cr_id, document_id, user_id, token, file_uri, expires_at) VALUES (?, ?, ?, ?, ?, ?)`;
    await new Promise((resolve, reject) => {
      db.run(sql, [cr_id, document_id, user_id, token, file_uri, expires_at.toISOString()], function (err: any) {
        if (err) reject(err);
        resolve(true);
      });
    });

  return `/api/change-requests/download/${token}`;
  },

  async verifySignedUrl(token: any) {
    const sql = `SELECT * FROM SignedUrlToken WHERE token = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`;
    const row: any = await new Promise((resolve, reject) => {
      db.get(sql, [token], (err: any, row: any) => {
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

export = signedUrlService;
