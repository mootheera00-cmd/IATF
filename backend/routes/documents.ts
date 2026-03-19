// routes/documents.ts
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { PDFDocument, rgb, degrees } = require('pdf-lib');
const { authRequired, requireRole } = require('../middleware/auth');
const { ORIGINAL_DIR, PDF_DIR } = require('../config/storage');
const auditService = require('../services/auditService');

let revisionHasUnsignedPdf: boolean | null = null;

function isFormCategory(value: any) {
  const text = String(value || '').trim().toUpperCase();
  return text.includes('FORM');
}

async function ensureUnsignedPdfColumn(db: any) {
  if (revisionHasUnsignedPdf !== null) return revisionHasUnsignedPdf;
  return new Promise<boolean>((resolve, reject) => {
    db.all(`PRAGMA table_info(DocumentRevision)`, [], (err: any, rows: any[]) => {
      if (err) {
        revisionHasUnsignedPdf = false;
        return resolve(false);
      }
      revisionHasUnsignedPdf = (rows || []).some((row) => row.name === 'unsigned_pdf_uri');
      resolve(revisionHasUnsignedPdf);
    });
  });
}

function resolveStoredPath(fileUri: string) {
  if (!fileUri) return '';
  const normalized = String(fileUri);
  const isDist = String(__dirname).toLowerCase().includes(`${path.sep}dist`);
  const resolvedBase = isDist ? path.resolve(__dirname, '..', '..') : path.resolve(__dirname, '..');
  const candidates: string[] = [];

  if (path.isAbsolute(normalized)) {
    candidates.push(normalized);
  }

  const posixPath = normalized.replace(/\\/g, '/');
  const uploadsIndex = posixPath.toLowerCase().indexOf('/uploads/');
  if (uploadsIndex >= 0) {
    const relative = posixPath.slice(uploadsIndex + '/uploads/'.length);
    candidates.push(path.resolve(resolvedBase, 'uploads', relative));
  }

  candidates.push(path.resolve(resolvedBase, 'uploads', normalized));
  candidates.push(path.resolve(resolvedBase, normalized));
  candidates.push(path.resolve(PDF_DIR, normalized));
  candidates.push(path.resolve(PDF_DIR, path.basename(normalized)));
  candidates.push(path.resolve(ORIGINAL_DIR, normalized));
  candidates.push(path.resolve(ORIGINAL_DIR, path.basename(normalized)));

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0] || normalized;
}

function insertDocumentAudit(db: any, documentId: any, actorId: any, action: any, metadataObj: any = {}) {
  const metadata = JSON.stringify(metadataObj || {});
  db.run(
    `INSERT INTO AuditEvent (entity_type, entity_id, actor_id, action, metadata, created_at)
         VALUES ('Document', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [documentId, actorId || null, action, metadata],
    (logErr: any) => {
      if (logErr) {
        console.error(`Document ${action} log error:`, logErr.message);
      }
    }
  );
}

async function buildPrintedPdf(absolutePath: string, printedBy: string, options: { isObsolete?: boolean; label?: string } = {}) {
  const pdfBytes = fs.readFileSync(absolutePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const font = await pdfDoc.embedFont('Helvetica-Bold');
  const pages = pdfDoc.getPages();
  const printedAt = new Date().toISOString();

  pages.forEach((page: any) => {
    const { width, height } = page.getSize();
    const isObsolete = Boolean(options.isObsolete);
    const cornerLabel = isObsolete ? 'OBSOLETE' : 'COPY';

    const rectWidth = 110;
    const rectHeight = 32;
    const rectX = width - rectWidth - 24;
    const rectY = height - rectHeight - 24;

    page.drawRectangle({
      x: rectX,
      y: rectY,
      width: rectWidth,
      height: rectHeight,
      borderWidth: 2,
      borderColor: rgb(0.85, 0.1, 0.1),
      color: rgb(1, 1, 1),
      opacity: 0
    });

    page.drawText(cornerLabel, {
      x: rectX + 8,
      y: rectY + 8,
      size: 16,
      font: font,
      color: rgb(0.85, 0.1, 0.1)
    });

    if (isObsolete) {
      const centerText = 'UNCONTROLLED DOCUMENT';
      const centerSize = 36;
      const centerWidth = font.widthOfTextAtSize(centerText, centerSize);
      page.drawText(centerText, {
        x: width / 2 - centerWidth / 2,
        y: height / 2,
        size: centerSize,
        font: font,
        color: rgb(0.85, 0.1, 0.1),
        opacity: 0.2,
        rotate: degrees(0)
      });
    }

    const footerLabel = options.label || 'Printed by';
    const footerText = `${footerLabel}: ${printedBy || 'Unknown'} | Print date: ${printedAt}`;
    page.drawText(footerText, {
      x: 20,
      y: 12,
      size: 8,
      font: font,
      color: rgb(0.4, 0.4, 0.4)
    });
  });

  return pdfDoc.save();
}

// Get Document Metadata
router.get('/:id', authRequired, (req: any, res: any) => {
  const db = req.db;
  const documentId = req.params.id;

  // Select document + latest revision info
  const query = `
        SELECT 
            d.id,
            d.doc_number AS doc_no,
            d.title,
            d.document_type,
            r.revision_number AS revision,
            r.status,
            r.created_at AS rev_date,
            u.name AS owner_name
        FROM Document d
        LEFT JOIN DocumentRevision r 
            ON r.id = COALESCE(
                d.current_revision_id,
                (
                    SELECT id 
                    FROM DocumentRevision r2 
                    WHERE r2.document_id = d.id 
                    ORDER BY r2.id DESC 
                    LIMIT 1
                )
            )
        LEFT JOIN users u ON u.id = r.released_by_id
        WHERE d.id = ?
        LIMIT 1
    `;

  db.get(query, [documentId], (err: any, row: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Document not found' });
    res.json(row);
  });
});

// Documents View Route
router.get('/:id/view', authRequired, async (req: any, res: any) => {
  const db = req.db;
  const documentId = req.params.id;
  const user = req.user;

  if (!documentId) return res.status(400).send('Document ID required');

  // Fetch document details
  const query = `
        SELECT d.id, d.title, d.doc_number AS doc_no, r.status, r.revision_number AS revision,
               r.pdf_uri, r.file_path_pdf
        FROM Document d
        JOIN DocumentRevision r 
            ON r.id = COALESCE(
                d.current_revision_id,
                (
                    SELECT id 
                    FROM DocumentRevision r2 
                    WHERE r2.document_id = d.id 
                    ORDER BY r2.id DESC 
                    LIMIT 1
                )
            )
        WHERE d.id = ?
        LIMIT 1
    `;

  db.get(query, [documentId], async (err: any, doc: any) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send('Database error');
    }
    if (!doc) return res.status(404).send('Document not found');

    const pdfUri = doc.pdf_uri || doc.file_path_pdf || '';
    let absolutePath = resolveStoredPath(pdfUri);

    // Log document enter/open for audit and viewer access timeline
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      insertDocumentAudit(db, documentId, user?.id, 'ENTER', {
        doc_no: doc.doc_no,
        revision: doc.revision,
        session_id: sessionId
      });
    } catch (logError: any) {
      console.error('Document enter log unexpected error:', logError.message);
    }

    if (!fs.existsSync(absolutePath)) {
      console.error(`File missing: ${absolutePath}`);
      return res.status(404).send('File content not found');
    }

    // Standard Watermark Text
    const watermarkText = 'Original';

    try {
      // Only watermark PDF files
      if (!absolutePath.toLowerCase().endsWith('.pdf')) {
        return res.download(absolutePath);
      }

      const pdfBytes = fs.readFileSync(absolutePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // Embed Standard Font
      const font = await pdfDoc.embedFont('Helvetica-Bold');
      const pages = pdfDoc.getPages();

      pages.forEach((page: any) => {
        const { width, height } = page.getSize();

        // Draw Main Watermark (Diagonal)
        const fontSize = 50;
        const textWidth = font.widthOfTextAtSize(watermarkText.split('\n')[0], fontSize);

        page.drawText(watermarkText, {
          x: width / 2 - textWidth / 2,
          y: height / 2,
          size: fontSize,
          font: font,
          color: rgb(0.8, 0.2, 0.2), // Reddish
          opacity: 0.15, // Subtle
          rotate: degrees(45)
        });

        // Footer: Traceability (User + Time)
        const footerText = `Downloaded by: ${user ? (user.name || user.employee_code) : 'Unknown'} | ${new Date().toISOString()}`;
        page.drawText(footerText, {
          x: 20,
          y: 15,
          size: 8,
          font: font,
          color: rgb(0.5, 0.5, 0.5)
        });
      });

      const modifiedPdfBytes = await pdfDoc.save();

      res.setHeader('Access-Control-Expose-Headers', 'X-Access-Session');
      res.setHeader('X-Access-Session', sessionId);
      res.setHeader('Content-Type', 'application/pdf');
      // Inline means "display in browser", Attachment means "download"
      // For IATF, usually "view only/inline" is preferred, but browser PDF viewer allows download.
      // Watermark protects it in both cases.
      res.setHeader('Content-Disposition', `inline; filename="${doc.doc_no}_Rev${doc.revision}.pdf"`);
      res.send(Buffer.from(modifiedPdfBytes));
    } catch (pdfError: any) {
      console.error('PDF Processing Error:', pdfError);
      res.status(500).send('Error processing document security features.');
    }
  });
});

// Print current document with copy watermark
router.get(
  '/:id/print',
  authRequired,
  async (req: any, res: any) => {
  const db = req.db;
  const documentId = req.params.id;
  const user = req.user;

  if (!documentId) return res.status(400).send('Document ID required');

  const hasUnsignedPdf = await ensureUnsignedPdfColumn(db);
  const unsignedSelect = hasUnsignedPdf ? 'r.unsigned_pdf_uri' : 'NULL as unsigned_pdf_uri';
  const query = `
    SELECT d.id, d.title, d.doc_number AS doc_no, d.document_type, r.status, r.revision_number AS revision,
         r.pdf_uri, r.file_path_pdf, ${unsignedSelect}
    FROM Document d
    JOIN DocumentRevision r 
      ON r.id = COALESCE(
        d.current_revision_id,
        (
          SELECT id 
          FROM DocumentRevision r2 
          WHERE r2.document_id = d.id 
          ORDER BY r2.id DESC 
          LIMIT 1
        )
      )
    WHERE d.id = ?
    LIMIT 1
  `;

  db.get(query, [documentId], async (err: any, doc: any) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send('Database error');
    }
    if (!doc) return res.status(404).send('Document not found');

  const useUnsigned = isFormCategory(doc.document_type) && doc.unsigned_pdf_uri;
  const pdfUri = (useUnsigned ? doc.unsigned_pdf_uri : doc.pdf_uri) || doc.file_path_pdf || '';
    let absolutePath = resolveStoredPath(pdfUri);

    if (!fs.existsSync(absolutePath)) {
      console.error(`File missing: ${absolutePath}`);
      return res.status(404).send('File content not found');
    }

    try {
      if (!absolutePath.toLowerCase().endsWith('.pdf')) {
        return res.download(absolutePath);
      }

      const printedBy = user ? (user.name || user.employee_code) : 'Unknown';
      const isObsolete = String(doc.status || '').toLowerCase() === 'obsolete';
      const modifiedPdfBytes = await buildPrintedPdf(absolutePath, printedBy, { isObsolete });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${doc.doc_no}_Rev${doc.revision}_PRINT.pdf"`);
      res.send(Buffer.from(modifiedPdfBytes));
    } catch (pdfError: any) {
      console.error('PDF Processing Error:', pdfError);
      res.status(500).send('Error processing document security features.');
    }
  });
}
);

// View a specific revision (Admin/Document Control)
router.get(
  '/:id/revisions/:revisionId/view',
  authRequired,
  requireRole('ADMIN', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'QMR'),
  async (req: any, res: any) => {
    const db = req.db;
    const documentId = req.params.id;
    const revisionId = req.params.revisionId;
    const user = req.user;

    if (!documentId || !revisionId) return res.status(400).send('Document ID and revision ID required');

    const query = `
        SELECT d.id, d.title, d.doc_number AS doc_no, d.current_revision_id,
               r.id as revision_id, r.revision_number AS revision, r.status, r.pdf_uri, r.file_path_pdf
        FROM Document d
        JOIN DocumentRevision r ON r.id = ? AND r.document_id = d.id
        WHERE d.id = ?
        LIMIT 1
    `;

    db.get(query, [revisionId, documentId], async (err: any, doc: any) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).send('Database error');
      }
      if (!doc) return res.status(404).send('Document revision not found');

      const pdfUri = doc.pdf_uri || doc.file_path_pdf || '';
      let absolutePath = resolveStoredPath(pdfUri);

      const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const isObsolete = doc.current_revision_id && String(doc.revision_id) !== String(doc.current_revision_id);
      try {
        insertDocumentAudit(db, documentId, user?.id, 'ENTER', {
          doc_no: doc.doc_no,
          revision: doc.revision,
          revision_id: doc.revision_id,
          obsolete: Boolean(isObsolete),
          session_id: sessionId
        });
      } catch (logError: any) {
        console.error('Document enter log unexpected error:', logError.message);
      }

      if (!fs.existsSync(absolutePath)) {
        console.error(`File missing: ${absolutePath}`);
        return res.status(404).send('File content not found');
      }

      const watermarkText = isObsolete ? 'OBSOLETE' : 'Original';

      try {
        if (!absolutePath.toLowerCase().endsWith('.pdf')) {
          return res.download(absolutePath);
        }

        const pdfBytes = fs.readFileSync(absolutePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);

        const font = await pdfDoc.embedFont('Helvetica-Bold');
        const pages = pdfDoc.getPages();

        pages.forEach((page: any) => {
          const { width, height } = page.getSize();

          const fontSize = 50;
          const textWidth = font.widthOfTextAtSize(watermarkText.split('\n')[0], fontSize);

          page.drawText(watermarkText, {
            x: width / 2 - textWidth / 2,
            y: height / 2,
            size: fontSize,
            font: font,
            color: rgb(0.8, 0.2, 0.2),
            opacity: 0.15,
            rotate: degrees(45)
          });

          const footerText = `Downloaded by: ${user ? (user.name || user.employee_code) : 'Unknown'} | ${new Date().toISOString()}`;
          page.drawText(footerText, {
            x: 20,
            y: 15,
            size: 8,
            font: font,
            color: rgb(0.5, 0.5, 0.5)
          });
        });

        const modifiedPdfBytes = await pdfDoc.save();

        res.setHeader('Access-Control-Expose-Headers', 'X-Access-Session');
        res.setHeader('X-Access-Session', sessionId);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${doc.doc_no}_Rev${doc.revision}.pdf"`);
        res.send(Buffer.from(modifiedPdfBytes));
      } catch (pdfError: any) {
        console.error('PDF Processing Error:', pdfError);
        res.status(500).send('Error processing document security features.');
      }
    });
  }
);

// Print a specific revision with copy watermark (Admin/Document Control)
router.get(
  '/:id/revisions/:revisionId/print',
  authRequired,
  requireRole('ADMIN', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'QMR'),
  async (req: any, res: any) => {
    const db = req.db;
    const documentId = req.params.id;
    const revisionId = req.params.revisionId;
    const user = req.user;

    if (!documentId || !revisionId) return res.status(400).send('Document ID and revision ID required');

  const hasUnsignedPdf = await ensureUnsignedPdfColumn(db);
  const unsignedSelect = hasUnsignedPdf ? 'r.unsigned_pdf_uri' : 'NULL as unsigned_pdf_uri';
  const query = `
    SELECT d.id, d.title, d.doc_number AS doc_no, d.document_type,
         r.id as revision_id, r.revision_number AS revision, r.pdf_uri, r.file_path_pdf, ${unsignedSelect}
    FROM Document d
    JOIN DocumentRevision r ON r.id = ? AND r.document_id = d.id
    WHERE d.id = ?
    LIMIT 1
  `;

    db.get(query, [revisionId, documentId], async (err: any, doc: any) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).send('Database error');
      }
      if (!doc) return res.status(404).send('Document revision not found');

  const useUnsigned = isFormCategory(doc.document_type) && doc.unsigned_pdf_uri;
  const pdfUri = (useUnsigned ? doc.unsigned_pdf_uri : doc.pdf_uri) || doc.file_path_pdf || '';
      let absolutePath = resolveStoredPath(pdfUri);

      if (!fs.existsSync(absolutePath)) {
        console.error(`File missing: ${absolutePath}`);
        return res.status(404).send('File content not found');
      }

      try {
        if (!absolutePath.toLowerCase().endsWith('.pdf')) {
          return res.download(absolutePath);
        }

        const printedBy = user ? (user.name || user.employee_code) : 'Unknown';
        const modifiedPdfBytes = await buildPrintedPdf(absolutePath, printedBy, { isObsolete: true });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${doc.doc_no}_Rev${doc.revision}_PRINT.pdf"`);
        res.send(Buffer.from(modifiedPdfBytes));
      } catch (pdfError: any) {
        console.error('PDF Processing Error:', pdfError);
        res.status(500).send('Error processing document security features.');
      }
    });
  }
);

// Confirm print completion for current document
router.post(
  '/:id/print-complete',
  authRequired,
  requireRole('ADMIN', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'QMR'),
  async (req: any, res: any) => {
    const db = req.db;
    const documentId = req.params.id;
    const user = req.user;

    if (!documentId) return res.status(400).send('Document ID required');

    const hasUnsignedPdf = await ensureUnsignedPdfColumn(db);
    const unsignedSelect = hasUnsignedPdf ? 'r.unsigned_pdf_uri' : 'NULL as unsigned_pdf_uri';
    const query = `
        SELECT d.id, d.doc_number AS doc_no, d.document_type, r.status, r.revision_number AS revision,
               r.pdf_uri, r.file_path_pdf, ${unsignedSelect}
        FROM Document d
        JOIN DocumentRevision r
            ON r.id = COALESCE(
                d.current_revision_id,
                (
                    SELECT id
                    FROM DocumentRevision r2
                    WHERE r2.document_id = d.id
                    ORDER BY r2.id DESC
                    LIMIT 1
                )
            )
        WHERE d.id = ?
        LIMIT 1
    `;

    db.get(query, [documentId], async (err: any, doc: any) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!doc) return res.status(404).json({ error: 'Document not found' });

      const usedUnsigned = isFormCategory(doc.document_type) && doc.unsigned_pdf_uri;
      const isObsolete = String(doc.status || '').toLowerCase() === 'obsolete';

      await auditService.recordEvent('Document', documentId, user?.id || null, 'PRINT', {
        doc_no: doc.doc_no,
        revision: doc.revision,
        obsolete: isObsolete,
        source: 'print_dialog',
        used_unsigned_pdf: Boolean(usedUnsigned)
      });

      return res.status(200).json({ ok: true });
    });
  }
);

// Confirm print completion for a specific revision
router.post(
  '/:id/revisions/:revisionId/print-complete',
  authRequired,
  requireRole('ADMIN', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'QMR'),
  async (req: any, res: any) => {
    const db = req.db;
    const documentId = req.params.id;
    const revisionId = req.params.revisionId;
    const user = req.user;

    if (!documentId || !revisionId) return res.status(400).send('Document ID and revision ID required');

    const hasUnsignedPdf = await ensureUnsignedPdfColumn(db);
    const unsignedSelect = hasUnsignedPdf ? 'r.unsigned_pdf_uri' : 'NULL as unsigned_pdf_uri';
    const query = `
        SELECT d.id, d.doc_number AS doc_no, d.document_type, d.current_revision_id,
               r.id as revision_id, r.revision_number AS revision, r.status, r.pdf_uri, r.file_path_pdf, ${unsignedSelect}
        FROM Document d
        JOIN DocumentRevision r ON r.id = ? AND r.document_id = d.id
        WHERE d.id = ?
        LIMIT 1
    `;

    db.get(query, [revisionId, documentId], async (err: any, doc: any) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!doc) return res.status(404).json({ error: 'Document revision not found' });

      const usedUnsigned = isFormCategory(doc.document_type) && doc.unsigned_pdf_uri;
      const isObsolete = doc.current_revision_id && String(doc.revision_id) !== String(doc.current_revision_id);

      await auditService.recordEvent('Document', documentId, user?.id || null, 'PRINT', {
        doc_no: doc.doc_no,
        revision: doc.revision,
        revision_id: doc.revision_id,
        obsolete: Boolean(isObsolete),
        source: 'print_dialog',
        used_unsigned_pdf: Boolean(usedUnsigned)
      });

      return res.status(200).json({ ok: true });
    });
  }
);

// ── SAVE (download with copy watermark) ─────────────────────────────────────

// Save current document – same as print but returns a download attachment
router.get(
  '/:id/save',
  authRequired,
  async (req: any, res: any) => {
    const db = req.db;
    const documentId = req.params.id;
    const user = req.user;

    if (!documentId) return res.status(400).send('Document ID required');

    const hasUnsignedPdf = await ensureUnsignedPdfColumn(db);
    const unsignedSelect = hasUnsignedPdf ? 'r.unsigned_pdf_uri' : 'NULL as unsigned_pdf_uri';
    const query = `
      SELECT d.id, d.title, d.doc_number AS doc_no, d.document_type, r.status, r.revision_number AS revision,
             r.pdf_uri, r.file_path_pdf, ${unsignedSelect}
      FROM Document d
      JOIN DocumentRevision r
        ON r.id = COALESCE(
          d.current_revision_id,
          (SELECT id FROM DocumentRevision r2 WHERE r2.document_id = d.id ORDER BY r2.id DESC LIMIT 1)
        )
      WHERE d.id = ?
      LIMIT 1
    `;

    db.get(query, [documentId], async (err: any, doc: any) => {
      if (err) { console.error('Database error:', err); return res.status(500).send('Database error'); }
      if (!doc) return res.status(404).send('Document not found');

      const useUnsigned = isFormCategory(doc.document_type) && doc.unsigned_pdf_uri;
      const pdfUri = (useUnsigned ? doc.unsigned_pdf_uri : doc.pdf_uri) || doc.file_path_pdf || '';
      const absolutePath = resolveStoredPath(pdfUri);

      if (!fs.existsSync(absolutePath)) {
        console.error(`File missing: ${absolutePath}`);
        return res.status(404).send('File content not found');
      }

      try {
        if (!absolutePath.toLowerCase().endsWith('.pdf')) {
          return res.download(absolutePath);
        }

        const savedBy = user ? (user.name || user.employee_code) : 'Unknown';
        const isObsolete = String(doc.status || '').toLowerCase() === 'obsolete';
        const modifiedPdfBytes = await buildPrintedPdf(absolutePath, savedBy, { isObsolete, label: 'Saved by' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${doc.doc_no}_Rev${doc.revision}_COPY.pdf"`);
        res.send(Buffer.from(modifiedPdfBytes));
      } catch (pdfError: any) {
        console.error('PDF Processing Error:', pdfError);
        res.status(500).send('Error processing document security features.');
      }
    });
  }
);

// Log save completion for current document
router.post(
  '/:id/save-complete',
  authRequired,
  async (req: any, res: any) => {
    const db = req.db;
    const documentId = req.params.id;
    const user = req.user;

    if (!documentId) return res.status(400).send('Document ID required');

    const hasUnsignedPdf = await ensureUnsignedPdfColumn(db);
    const unsignedSelect = hasUnsignedPdf ? 'r.unsigned_pdf_uri' : 'NULL as unsigned_pdf_uri';
    const query = `
        SELECT d.id, d.doc_number AS doc_no, d.document_type, r.status, r.revision_number AS revision,
               r.pdf_uri, r.file_path_pdf, ${unsignedSelect}
        FROM Document d
        JOIN DocumentRevision r
            ON r.id = COALESCE(
                d.current_revision_id,
                (SELECT id FROM DocumentRevision r2 WHERE r2.document_id = d.id ORDER BY r2.id DESC LIMIT 1)
            )
        WHERE d.id = ?
        LIMIT 1
    `;

    db.get(query, [documentId], async (err: any, doc: any) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!doc) return res.status(404).json({ error: 'Document not found' });

      const usedUnsigned = isFormCategory(doc.document_type) && doc.unsigned_pdf_uri;
      const isObsolete = String(doc.status || '').toLowerCase() === 'obsolete';

      await auditService.recordEvent('Document', documentId, user?.id || null, 'SAVE', {
        doc_no: doc.doc_no,
        revision: doc.revision,
        obsolete: isObsolete,
        source: 'save_download',
        used_unsigned_pdf: Boolean(usedUnsigned)
      });

      return res.status(200).json({ ok: true });
    });
  }
);

// Save a specific revision (Admin/Document Control)
router.get(
  '/:id/revisions/:revisionId/save',
  authRequired,
  requireRole('ADMIN', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'QMR'),
  async (req: any, res: any) => {
    const db = req.db;
    const documentId = req.params.id;
    const revisionId = req.params.revisionId;
    const user = req.user;

    if (!documentId || !revisionId) return res.status(400).send('Document ID and revision ID required');

    const hasUnsignedPdf = await ensureUnsignedPdfColumn(db);
    const unsignedSelect = hasUnsignedPdf ? 'r.unsigned_pdf_uri' : 'NULL as unsigned_pdf_uri';
    const query = `
      SELECT d.id, d.title, d.doc_number AS doc_no, d.document_type,
             r.id as revision_id, r.revision_number AS revision, r.pdf_uri, r.file_path_pdf, ${unsignedSelect}
      FROM Document d
      JOIN DocumentRevision r ON r.id = ? AND r.document_id = d.id
      WHERE d.id = ?
      LIMIT 1
    `;

    db.get(query, [revisionId, documentId], async (err: any, doc: any) => {
      if (err) { console.error('Database error:', err); return res.status(500).send('Database error'); }
      if (!doc) return res.status(404).send('Document revision not found');

      const useUnsigned = isFormCategory(doc.document_type) && doc.unsigned_pdf_uri;
      const pdfUri = (useUnsigned ? doc.unsigned_pdf_uri : doc.pdf_uri) || doc.file_path_pdf || '';
      const absolutePath = resolveStoredPath(pdfUri);

      if (!fs.existsSync(absolutePath)) {
        console.error(`File missing: ${absolutePath}`);
        return res.status(404).send('File content not found');
      }

      try {
        if (!absolutePath.toLowerCase().endsWith('.pdf')) {
          return res.download(absolutePath);
        }

        const savedBy = user ? (user.name || user.employee_code) : 'Unknown';
        const modifiedPdfBytes = await buildPrintedPdf(absolutePath, savedBy, { isObsolete: true, label: 'Saved by' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${doc.doc_no}_Rev${doc.revision}_COPY.pdf"`);
        res.send(Buffer.from(modifiedPdfBytes));
      } catch (pdfError: any) {
        console.error('PDF Processing Error:', pdfError);
        res.status(500).send('Error processing document security features.');
      }
    });
  }
);

// Log save completion for a specific revision
router.post(
  '/:id/revisions/:revisionId/save-complete',
  authRequired,
  requireRole('ADMIN', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'QMR'),
  async (req: any, res: any) => {
    const db = req.db;
    const documentId = req.params.id;
    const revisionId = req.params.revisionId;
    const user = req.user;

    if (!documentId || !revisionId) return res.status(400).send('Document ID and revision ID required');

    const hasUnsignedPdf = await ensureUnsignedPdfColumn(db);
    const unsignedSelect = hasUnsignedPdf ? 'r.unsigned_pdf_uri' : 'NULL as unsigned_pdf_uri';
    const query = `
        SELECT d.id, d.doc_number AS doc_no, d.document_type, d.current_revision_id,
               r.id as revision_id, r.revision_number AS revision, r.status, r.pdf_uri, r.file_path_pdf, ${unsignedSelect}
        FROM Document d
        JOIN DocumentRevision r ON r.id = ? AND r.document_id = d.id
        WHERE d.id = ?
        LIMIT 1
    `;

    db.get(query, [revisionId, documentId], async (err: any, doc: any) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!doc) return res.status(404).json({ error: 'Document revision not found' });

      const usedUnsigned = isFormCategory(doc.document_type) && doc.unsigned_pdf_uri;
      const isObsolete = doc.current_revision_id && String(doc.revision_id) !== String(doc.current_revision_id);

      await auditService.recordEvent('Document', documentId, user?.id || null, 'SAVE', {
        doc_no: doc.doc_no,
        revision: doc.revision,
        revision_id: doc.revision_id,
        obsolete: Boolean(isObsolete),
        source: 'save_download',
        used_unsigned_pdf: Boolean(usedUnsigned)
      });

      return res.status(200).json({ ok: true });
    });
  }
);

router.post('/:id/close', authRequired, (req: any, res: any) => {
  const db = req.db;
  const documentId = req.params.id;
  const user = req.user;
  const sessionId = req.body?.session_id || null;

  if (!documentId) {
    return res.status(400).json({ message: 'Document ID required' });
  }

  const query = `
        SELECT d.doc_number AS doc_no, r.revision_number AS revision
        FROM Document d
        LEFT JOIN DocumentRevision r
          ON r.id = COALESCE(
            d.current_revision_id,
            (
                SELECT id
                FROM DocumentRevision r2
                WHERE r2.document_id = d.id
                ORDER BY r2.id DESC
                LIMIT 1
            )
          )
        WHERE d.id = ?
        LIMIT 1
    `;

  db.get(query, [documentId], (err: any, doc: any) => {
    if (err) {
      console.error('Document close query error:', err.message);
      return res.status(500).json({ message: 'Database error' });
    }

    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }

    try {
      insertDocumentAudit(db, documentId, user?.id, 'OUT', {
        doc_no: doc.doc_no,
        revision: doc.revision,
        session_id: sessionId
      });
    } catch (logError: any) {
      console.error('Document out log unexpected error:', logError.message);
    }

    return res.json({ message: 'Document close logged' });
  });
});

router.get('/:id/original', authRequired, (req: any, res: any) => {
  const db = req.db;
  const documentId = req.params.id;

  const query = `
    SELECT d.doc_number AS doc_no, r.revision_number AS revision, r.original_uri, r.file_path_original
        FROM Document d
        JOIN DocumentRevision r
            ON r.id = COALESCE(
                d.current_revision_id,
                (
                    SELECT id
                    FROM DocumentRevision r2
                    WHERE r2.document_id = d.id
                    ORDER BY r2.id DESC
                    LIMIT 1
                )
            )
        WHERE d.id = ?
        LIMIT 1
    `;

  db.get(query, [documentId], (err: any, doc: any) => {
    if (err) {
      console.error('Original file query error:', err.message);
      return res.status(500).json({ message: 'Database error' });
    }

    if (!doc || (!doc.file_path_original && !doc.original_uri)) {
      return res.status(404).json({ message: 'Original file not found' });
    }

    const sourceUri = doc.original_uri || doc.file_path_original || '';
    const absolutePath = resolveStoredPath(sourceUri);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: 'Original file content not found' });
    }

    const extension = path.extname(absolutePath) || '';
    const downloadName = `${doc.doc_no || 'Document'}_Rev${doc.revision || ''}_Original${extension}`;
    return res.download(absolutePath, downloadName);
  });
});

export = router;
