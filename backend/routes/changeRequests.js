// backend/routes/changeRequests.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authRequired, requireRole } = require('../middleware/auth');
const dcrService = require('../services/dcrService');
const signedUrlService = require('../services/signedUrlService');
const { ORIGINAL_DIR, PDF_DIR } = require('../config/storage');

// Configure multer for file uploads with proper storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Determine destination based on field name
        if (file.fieldname === 'source') {
            cb(null, ORIGINAL_DIR);
        } else if (file.fieldname === 'pdf') {
            cb(null, PDF_DIR);
        } else {
            cb(new Error('Invalid field name'));
        }
    },
    filename: function (req, file, cb) {
        // Generate unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.fieldname === 'source') {
            // Accept Word and Excel files
            const allowedExts = ['.doc', '.docx', '.xls', '.xlsx'];
            const ext = path.extname(file.originalname).toLowerCase();
            if (allowedExts.includes(ext)) {
                cb(null, true);
            } else {
                cb(new Error('Only Word (.doc, .docx) and Excel (.xls, .xlsx) files are allowed for source files'));
            }
        } else if (file.fieldname === 'pdf') {
            // Accept only PDF files
            const ext = path.extname(file.originalname).toLowerCase();
            if (ext === '.pdf') {
                cb(null, true);
            } else {
                cb(new Error('Only PDF files are allowed for PDF uploads'));
            }
        } else {
            cb(null, true);
        }
    }
});

// 1. Create a new change request
router.post('/', authRequired, async (req, res) => {
    const { document_id, reason } = req.body;
    const requester_id = req.user.id;
    try {
        const cr_id = await dcrService.createChangeRequest(document_id, requester_id, reason);
        res.status(201).json({ message: 'Change request created in draft state.', cr_id });
    } catch (error) {
        res.status(500).json({ message: 'Error creating change request', error: error.message });
    }
});

// 2. Submit a draft change request
router.post('/:id/submit', authRequired, async (req, res) => {
    const { id: cr_id } = req.params;
    const requester_id = req.user.id;
    try {
        await dcrService.submitChangeRequest(cr_id, requester_id);
        res.status(200).json({ message: 'Change request submitted for pre-approval.' });
    } catch (error) {
        res.status(500).json({ message: 'Error submitting change request', error: error.message });
    }
});

// 3. Manager makes initial decision (Pre-Approve / Reject)
router.post('/:id/decision', authRequired, requireRole('MANAGER', 'QMR'), async (req, res) => {
    const { id: cr_id } = req.params;
    const manager_id = req.user.id;
    const { decision, comment } = req.body; // 'Pre-Approve' or 'Reject'
    try {
        const result = await dcrService.makeInitialDecision(cr_id, manager_id, decision, comment);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: 'Error making initial decision', error: error.message });
    }
});

// 4. Requester uploads revised documents
router.post('/:id/upload', authRequired, upload.fields([{ name: 'source', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
    const { id: cr_id } = req.params;
    const requester_id = req.user.id;
    try {
        await dcrService.uploadRevision(cr_id, requester_id, req.files);
        res.status(200).json({ message: 'Files uploaded, pending final approval.' });
    } catch (error) {
        res.status(500).json({ message: 'Error uploading files', error: error.message });
    }
});

// 5. Manager makes final review (Approve / Return for Revision)
router.post('/:id/review', authRequired, requireRole('MANAGER', 'QMR'), async (req, res) => {
    const { id: cr_id } = req.params;
    const manager_id = req.user.id;
    const { decision, comment } = req.body; // 'Approve' or 'Return'
    try {
        await dcrService.makeFinalReview(cr_id, manager_id, decision, comment);
        res.status(200).json({ message: `Change request has been ${decision.toLowerCase()}.` });
    } catch (error) {
        res.status(500).json({ message: 'Error making final review', error: error.message });
    }
});

// Endpoint for downloading files using a signed URL (for original files only)
router.get('/download/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const tokenData = await signedUrlService.verifySignedUrl(token);
        if (!tokenData) {
            return res.status(404).send('Invalid or expired download link.');
        }
        // Resolve the file path - file_uri should be relative path like 'uploads/doc-original/file.docx'
        const filePath = path.resolve(__dirname, '..', tokenData.file_uri);
        
        // Security check: ensure the file is within allowed directories
        const normalizedPath = path.normalize(filePath);
        const originalDirResolved = path.resolve(__dirname, '..', 'uploads', 'doc-original');
        
        if (!normalizedPath.startsWith(originalDirResolved)) {
            return res.status(403).send('Access denied.');
        }
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found.');
        }
        
        res.download(filePath);
    } catch (error) {
        res.status(500).json({ message: 'Error downloading file', error: error.message });
    }
});

// Endpoint for viewing PDF files (restricted to authorized users)
router.get('/pdf/:document_id/:revision_id', authRequired, async (req, res) => {
    const { document_id, revision_id } = req.params;
    try {
        // Get the revision
        const revision = await dcrService.getRevision(revision_id);
        if (!revision || revision.document_id != document_id) {
            return res.status(404).send('Revision not found.');
        }
        
        // Only allow viewing of Released or Pending Approval revisions
        if (!['Released', 'Pending Approval'].includes(revision.status)) {
            return res.status(403).send('This revision is not available for viewing.');
        }
        
        if (!revision.pdf_uri) {
            return res.status(404).send('PDF not available for this revision.');
        }
        
        const filePath = path.resolve(__dirname, '..', revision.pdf_uri);
        
        // Security check
        const normalizedPath = path.normalize(filePath);
        const pdfDirResolved = path.resolve(__dirname, '..', 'uploads', 'doc-pdf');
        
        if (!normalizedPath.startsWith(pdfDirResolved)) {
            return res.status(403).send('Access denied.');
        }
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found.');
        }
        
        // Set headers for PDF viewing
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        res.status(500).json({ message: 'Error viewing PDF', error: error.message });
    }
});

// Get CR details
router.get('/:id', authRequired, async (req, res) => {
    const { id: cr_id } = req.params;
    try {
        const cr = await dcrService.getChangeRequest(cr_id);
        if (!cr) {
            return res.status(404).json({ message: 'Change request not found.' });
        }
        res.status(200).json(cr);
    } catch (error) {
        res.status(500).json({ message: 'Error getting change request details', error: error.message });
    }
});

// List all change requests (optionally filter by status or user)
router.get('/', authRequired, async (req, res) => {
    const { status, requester_id, manager_id } = req.query;
    try {
        const crs = await dcrService.listChangeRequests({ status, requester_id, manager_id });
        res.status(200).json(crs);
    } catch (error) {
        res.status(500).json({ message: 'Error listing change requests', error: error.message });
    }
});

module.exports = router;