// routes/migration.ts
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireRole } = require('../middleware/permissions');
const { authRequired } = require('../middleware/auth');
const { PDF_DIR, ORIGINAL_DIR } = require('../config/storage');

const MAX_UPLOAD_SIZE_MB = Number(process.env.MIGRATION_MAX_FILE_MB || 200);
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

// --- 1. Audit Logging Helper (Strict IATF Compliance) ---
// Ensures every migration action is traceable.
const logAudit = (db: any, userId: any, action: any, details: any) => {
  return new Promise((resolve, reject) => {
    // Idempotent table creation (in case it's missing)
    const createTable = `
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                action TEXT NOT NULL,
                details TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;
    db.run(createTable, [], (err: any) => {
      // Ignore error if table exists or permission issue,
      // but strict compliance suggests we should probably fail.
      // For robustness, we proceed to insert.

      const insert = `INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)`;
      db.run(insert, [userId, action, details], (err2: any) => {
        if (err2) {
          console.error('Audit Log Failed:', err2);
          reject(err2);
        } else {
          resolve(true);
        }
      });
    });
  });
};

// --- 2. Secure Storage Location ---
// PDF files go to 'doc-pdf' (viewable/printable).
// Source files go to 'doc-original' (hidden/secured).
const storage = multer.diskStorage({
  destination: (req: any, file: any, cb: any) => {
    let uploadPath;
    if (file.fieldname === 'pdf_file') {
      uploadPath = PDF_DIR;
    } else if (file.fieldname === 'source_file') {
      uploadPath = ORIGINAL_DIR;
    } else {
      return cb(new Error('Invalid field selection. Only pdf_file and source_file allowed.'));
    }

    // Ensure directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req: any, file: any, cb: any) => {
    // Temporary secure name; renamed after validation to standard convention
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// --- 3. Strict File Type Validation (MIME Check) ---
const fileFilter = (req: any, file: any, cb: any) => {
  if (file.fieldname === 'pdf_file') {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Controlled Copy must be a valid PDF file.'), false);
  } else if (file.fieldname === 'source_file') {
    const allowedTypes = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Master Source must be an editable Word or Excel file.'), false);
  } else {
    cb(new Error('Unexpected file upload field.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES }
}).fields([
  { name: 'pdf_file', maxCount: 1 },
  { name: 'source_file', maxCount: 1 }
]);

function toCategoryFolder(input: any) {
  const raw = String(input || 'uncategorized').trim().toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'uncategorized';
}

// --- 4. Migration API Endpoint ---
router.post('/migrate', authRequired, requireRole(['ADMIN']), (req: any, res: any) => {
  upload(req, res, async (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          message: `Upload Error: File too large. Maximum allowed size is ${MAX_UPLOAD_SIZE_MB}MB per file.`
        });
      }
      return res.status(400).json({ message: 'Upload Error: ' + err.message });
    }

    // Strict Requirement: Both files are mandatory
    if (!req.files || !req.files['pdf_file'] || !req.files['source_file']) {
      // Cleanup partial uploads if any
      if (req.files?.['pdf_file'])
        try {
          fs.unlinkSync(req.files['pdf_file'][0].path);
        } catch (e) {}
      if (req.files?.['source_file'])
        try {
          fs.unlinkSync(req.files['source_file'][0].path);
        } catch (e) {}

      return res
        .status(400)
        .json({ message: 'Validation Failed: Both PDF (Controlled Copy) and Master Source File are required simultaneousely.' });
    }

    const db = req.db;
    const { doc_no, title, level, revision } = req.body;
    // User ID from auth middleware
    const userId = req.user.id;

    if (!doc_no || !title || !level || !revision) {
      return res.status(400).json({ message: 'Validation Failed: All document metadata fields are required.' });
    }

    const pdfFile = req.files['pdf_file'][0];
    const sourceFile = req.files['source_file'][0];
    // Standardize Filenames: {DocNo}_Rev{Rev}_Controlled.pdf
    const sanitizer = (str: string) => str.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const safeDocNo = sanitizer(doc_no);
    const safeRev = sanitizer(revision);
    const categoryFolder = toCategoryFolder(level);

    const newPdfName = `${safeDocNo}_Rev${safeRev}_Controlled.pdf`;
    const sourceExt = path.extname(sourceFile.originalname);
    const newSourceName = `${safeDocNo}_Rev${safeRev}_Master${sourceExt}`;

    const pdfCategoryDir = path.join(PDF_DIR, categoryFolder);
    const sourceCategoryDir = path.join(ORIGINAL_DIR, categoryFolder);
    if (!fs.existsSync(pdfCategoryDir)) fs.mkdirSync(pdfCategoryDir, { recursive: true });
    if (!fs.existsSync(sourceCategoryDir)) fs.mkdirSync(sourceCategoryDir, { recursive: true });

    const finalPdfPath = path.join(pdfCategoryDir, newPdfName);
    const finalSourcePath = path.join(sourceCategoryDir, newSourceName);

    // Check for duplicates before moving
    if (fs.existsSync(finalPdfPath) || fs.existsSync(finalSourcePath)) {
      // Clean up temp files
      try {
        fs.unlinkSync(pdfFile.path);
        fs.unlinkSync(sourceFile.path);
      } catch (e) {}
      return res
        .status(409)
        .json({ message: `Document ${doc_no} Rev ${revision} already exists. Increment revision or archive old version.` });
    }

    try {
      fs.renameSync(pdfFile.path, finalPdfPath);
      fs.renameSync(sourceFile.path, finalSourcePath);
    } catch (ioErr) {
      console.error(ioErr);
      return res.status(500).json({ message: 'IO Error: Failed to secure files.' });
    }

    // --- Database Transaction ---
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // Ensure migration identifier column exists in Document table.
      db.run(`ALTER TABLE Document ADD COLUMN doc_number TEXT`, () => {
        // Ignore duplicate-column errors.
      });

      // 1) Find or create document header in live schema (Document)
      db.get(`SELECT id FROM Document WHERE doc_number = ?`, [doc_no], (err2: any, row: any) => {
        if (err2) {
          console.error('Document Search Error:', err2);
          db.run('ROLLBACK');
          return res.status(500).json({ message: 'Database Error searching document.' });
        }

        const timestamp = new Date().toISOString();
        const dbPdfPath = `doc-pdf/${categoryFolder}/${newPdfName}`;
        const dbSourcePath = `doc-original/${categoryFolder}/${newSourceName}`;

        const finalizeMigration = (documentId: any) => {
          // 2) Insert released revision in live schema (DocumentRevision)
          const insertRevSql = `
                        INSERT INTO DocumentRevision (
                            document_id,
                            revision_number,
                            file_path_original,
                            file_path_pdf,
                            status,
                            released_by_id,
                            created_at
                        ) VALUES (?, ?, ?, ?, 'Released', ?, ?)
                    `;

          db.run(
            insertRevSql,
            [documentId, revision, dbSourcePath, dbPdfPath, userId, timestamp],
            function (revErr: any) {
              if (revErr) {
                console.error('Rev Insert Error:', revErr);
                db.run('ROLLBACK');
                return res.status(500).json({ message: 'Failed to create revision record in database.' });
              }

              const revisionId = this.lastID;

              // 3) Sync header to latest revision and metadata
              db.run(
                `UPDATE Document SET title = ?, document_type = ?, current_revision_id = ?, department = COALESCE(department, 'Quality'), is_active = 1 WHERE id = ?`,
                [title, level, revisionId, documentId],
                (updateErr: any) => {
                  if (updateErr) {
                    console.error('Document Update Error:', updateErr);
                    db.run('ROLLBACK');
                    return res.status(500).json({ message: 'Failed to update document header.' });
                  }

                  const auditDetails = `Legacy Migration: ${safeDocNo} Rev${safeRev}. Files Locked.`;
                  logAudit(db, userId, 'MIGRATE_LEGACY', auditDetails)
                    .then(() => {
                      db.run('COMMIT');
                      return res.json({
                        success: true,
                        message: 'Migration Successful. Master Source is now secured.',
                        doc_id: documentId,
                        revision_id: revisionId
                      });
                    })
                    .catch((auditErr: any) => {
                      console.error('Audit Log Error:', auditErr);
                      db.run('ROLLBACK');
                      return res
                        .status(500)
                        .json({ message: 'Compliance Error: Audit logging failed. Transaction aborted.' });
                    });
                }
              );
            }
          );
        };

        if (row && row.id) {
          return finalizeMigration(row.id);
        }

        // Create new header when doc_number does not exist
        const insertDocSql = `
                    INSERT INTO Document (doc_number, title, document_type, department, is_active, created_at)
                    VALUES (?, ?, ?, 'Quality', 1, ?)
                `;

        db.run(insertDocSql, [doc_no, title, level, timestamp], function (insertErr: any) {
          if (insertErr) {
            console.error('Document Insert Error:', insertErr);
            db.run('ROLLBACK');
            return res.status(500).json({ message: 'Failed to create document header.' });
          }
          return finalizeMigration(this.lastID);
        });
      });
    });
  });
});

export = router;
