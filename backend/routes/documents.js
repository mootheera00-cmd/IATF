// routes/documents.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authRequired, requireRole } = require('../middleware/auth');
const { logAction } = require('../middleware/audit');

const tmpUpload = multer({ dest: path.join(__dirname, '..', 'uploads', 'tmp') });

// Register new document (if doc_no duplicate -> create new document and versions will increment)
router.post('/register', authRequired, requireRole('ADMIN','MANAGER'), (req, res) => {
  const db = req.db;
  const { doc_no, title, category } = req.body;
  const sql = `INSERT INTO documents (doc_no, title, category, status) VALUES (?, ?, ?, 'DRAFT')`;
  db.run(sql, [doc_no, title, category], function(err) {
    if (err) {
      console.error('register document error', err);
      return res.status(500).json({ message: 'DB error' });
    }
    const docId = this.lastID;
    logAction(db, req.user.id, 'REGISTER_DOCUMENT', 'document', docId, `${doc_no} ${title}`);
    res.json({ message: 'Document registered', document_id: docId });
  });
});

// Upload new version (requires manager approval flow)
router.post('/:id/upload-version', authRequired, tmpUpload.fields([{ name: 'pdf' }, { name: 'source' }]), (req, res) => {
  const db = req.db;
  const documentId = req.params.id;
  const pdfFile = req.files['pdf']?.[0];
  const sourceFile = req.files['source']?.[0];
  const changeRequestId = req.body.change_request_id || null;

  if (!pdfFile || !sourceFile) return res.status(400).json({ message: 'Both PDF and source required' });

  db.get('SELECT MAX(version_no) as maxv FROM document_versions WHERE document_id = ?', [documentId], (err, row) => {
    if (err) {
      console.error('get max version error', err);
      return res.status(500).json({ message: 'DB error' });
    }
    const nextVersion = (row?.maxv || 0) + 1;
    const uploadsDir = path.join(__dirname, '..', 'uploads', `doc_${documentId}`);
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const pdfPath = path.join('uploads', `doc_${documentId}`, `v${nextVersion}.pdf`);
    const srcExt = path.extname(sourceFile.originalname);
    const srcPath = path.join('uploads', `doc_${documentId}`, `v${nextVersion}_source${srcExt}`);

    // move files
    fs.renameSync(pdfFile.path, path.join(__dirname, '..', pdfPath));
    fs.renameSync(sourceFile.path, path.join(__dirname, '..', srcPath));

    const insertSql = `INSERT INTO document_versions (document_id, version_no, file_pdf_path, file_source_path, uploaded_by, status, change_request_id) VALUES (?, ?, ?, ?, ?, 'PENDING_APPROVAL', ?)`;
    db.run(insertSql, [documentId, nextVersion, pdfPath, srcPath, req.user.id, changeRequestId], function(err) {
      if (err) {
        console.error('insert version error', err);
        return res.status(500).json({ message: 'DB error' });
      }
      const versionId = this.lastID;
      logAction(db, req.user.id, 'UPLOAD_VERSION', 'document_version', versionId, `v${nextVersion}`);
      // TODO: notify manager/reviewer
      res.json({ message: 'Version uploaded', version_id: versionId, version_no: nextVersion });
    });
  });
});

// Manager approve version
router.post('/versions/:versionId/approve', authRequired, requireRole('MANAGER','QMR'), (req, res) => {
  const db = req.db;
  const versionId = req.params.versionId;
  const approverId = req.user.id;
  db.get('SELECT * FROM document_versions WHERE id = ?', [versionId], (err, version) => {
    if (err || !version) {
      console.error('get version error', err);
      return res.status(404).json({ message: 'Version not found' });
    }
    db.run('UPDATE document_versions SET status = ? WHERE id = ?', ['APPROVED', versionId], function(err) {
      if (err) {
        console.error('approve version error', err);
        return res.status(500).json({ message: 'DB error' });
      }
      // update documents.current_version_id and status
      db.run('UPDATE documents SET current_version_id = ?, status = ? WHERE id = ?', [versionId, 'RELEASED', version.document_id], function(err) {
        if (err) console.error('update document current_version error', err);
        logAction(db, approverId, 'APPROVE_VERSION', 'document_version', versionId, `approved v${version.version_no}`);
        res.json({ message: 'Version approved and released' });
      });
    });
  });
});

// Reject version (request revision)
router.post('/versions/:versionId/reject', authRequired, requireRole('MANAGER','QMR'), (req, res) => {
  const db = req.db;
  const versionId = req.params.versionId;
  const { note } = req.body;
  db.run('UPDATE document_versions SET status = ? WHERE id = ?', ['REJECTED', versionId], function(err) {
    if (err) {
      console.error('reject version error', err);
      return res.status(500).json({ message: 'DB error' });
    }
    logAction(db, req.user.id, 'REJECT_VERSION', 'document_version', versionId, note || '');
    // TODO: notify uploader
    res.json({ message: 'Version rejected' });
  });
});

// Print/download current PDF only
router.get('/:id/print', authRequired, (req, res) => {
  const db = req.db;
  const documentId = req.params.id;
  db.get('SELECT current_version_id FROM documents WHERE id = ?', [documentId], (err, doc) => {
    if (err || !doc) return res.status(404).json({ message: 'Document not found' });
    if (!doc.current_version_id) return res.status(403).json({ message: 'No released version to print' });
    db.get('SELECT file_pdf_path FROM document_versions WHERE id = ? AND status = ?', [doc.current_version_id, 'APPROVED'], (err, version) => {
      if (err || !version) return res.status(403).json({ message: 'No approved version to print' });
      const filePath = path.join(__dirname, '..', version.file_pdf_path);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found' });
      logAction(db, req.user.id, 'PRINT_DOCUMENT', 'document', documentId, `version ${doc.current_version_id}`);
      res.download(filePath, `${path.basename(filePath)}`);
    });
  });
});

// List documents by category with counts
router.get('/by-category', authRequired, (req, res) => {
  const db = req.db;
  const sql = `SELECT category, COUNT(*) as count FROM documents GROUP BY category`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('by-category error', err);
      return res.status(500).json({ message: 'DB error' });
    }
    res.json(rows);
  });
});

module.exports = router;
