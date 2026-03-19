const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { PDFDocument, rgb, degrees } = require('pdf-lib');
const { authRequired } = require('../middleware/auth');

function insertDocumentAudit(db, documentId, actorId, action, metadataObj = {}) {
    const metadata = JSON.stringify(metadataObj || {});
    db.run(
        `INSERT INTO AuditEvent (entity_type, entity_id, actor_id, action, metadata, created_at)
         VALUES ('Document', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [documentId, actorId || null, action, metadata],
        (logErr) => {
            if (logErr) {
                console.error(`Document ${action} log error:`, logErr.message);
            }
        }
    );
}

// Get Document Metadata
router.get('/:id', authRequired, (req, res) => {
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

    db.get(query, [documentId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Document not found' });
        res.json(row);
    });
});

// Documents View Route
router.get('/:id/view', authRequired, async (req, res) => {
    const db = req.db; 
    const documentId = req.params.id;
    const user = req.user; 

    if (!documentId) return res.status(400).send('Document ID required');

    // Fetch document details
    const query = `
        SELECT d.id, d.title, d.doc_number AS doc_no, r.status, r.revision_number AS revision, r.file_path_pdf
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

    db.get(query, [documentId], async (err, doc) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Database error");
        }
        if (!doc) return res.status(404).send("Document not found");

        // file_path_pdf is relative, e.g., 'doc-pdf/QM-001_Rev00_Controlled.pdf'
        let absolutePath = path.resolve(__dirname, '..', 'uploads', doc.file_path_pdf || '');

        // Log document enter/open for audit and viewer access timeline
        const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        try {
            insertDocumentAudit(db, documentId, user?.id, 'ENTER', {
                doc_no: doc.doc_no,
                revision: doc.revision,
                session_id: sessionId
            });
        } catch (logError) {
            console.error('Document enter log unexpected error:', logError.message);
        }
        
        if (!fs.existsSync(absolutePath)) {
            // Backward-compatible path fallback
            const altPath = path.resolve(__dirname, '..', doc.file_path_pdf || '');
            if (fs.existsSync(altPath)) {
                absolutePath = altPath;
            } else {
                console.error(`File missing: ${absolutePath}`);
                return res.status(404).send("File content not found");
            }
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

            pages.forEach(page => {
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
                    rotate: degrees(45),
                });
                
                // Footer: Traceability (User + Time)
                const footerText = `Downloaded by: ${user ? (user.name || user.employee_code) : 'Unknown'} | ${new Date().toISOString()}`;
                page.drawText(footerText, {
                    x: 20,
                    y: 15,
                    size: 8,
                    font: font,
                    color: rgb(0.5, 0.5, 0.5),
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

        } catch (pdfError) {
            console.error("PDF Processing Error:", pdfError);
            res.status(500).send("Error processing document security features.");
        }
    });
});

router.post('/:id/close', authRequired, (req, res) => {
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

    db.get(query, [documentId], (err, doc) => {
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
        } catch (logError) {
            console.error('Document out log unexpected error:', logError.message);
        }

        return res.json({ message: 'Document close logged' });
    });
});

router.get('/:id/original', authRequired, (req, res) => {
    const db = req.db;
    const documentId = req.params.id;

    const query = `
        SELECT d.doc_number AS doc_no, r.revision_number AS revision, r.file_path_original
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

    db.get(query, [documentId], (err, doc) => {
        if (err) {
            console.error('Original file query error:', err.message);
            return res.status(500).json({ message: 'Database error' });
        }

        if (!doc || !doc.file_path_original) {
            return res.status(404).json({ message: 'Original file not found' });
        }

        const preferredPath = path.resolve(__dirname, '..', 'uploads', doc.file_path_original);
        const fallbackPath = path.resolve(__dirname, '..', doc.file_path_original);
        const absolutePath = fs.existsSync(preferredPath) ? preferredPath : fallbackPath;

        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ message: 'Original file content not found' });
        }

        const extension = path.extname(absolutePath) || '';
        const downloadName = `${doc.doc_no || 'Document'}_Rev${doc.revision || ''}_Original${extension}`;
        return res.download(absolutePath, downloadName);
    });
});

module.exports = router;
