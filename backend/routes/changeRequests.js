// backend/routes/changeRequests.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authRequired, requireRole } = require('../middleware/auth');
const dcrService = require('../services/dcrService');
const signedUrlService = require('../services/signedUrlService');

const upload = multer({ dest: 'uploads/tmp/' });

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

// Endpoint for downloading files using a signed URL
router.get('/download/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const tokenData = await signedUrlService.verifySignedUrl(token);
        if (!tokenData) {
            return res.status(404).send('Invalid or expired download link.');
        }
        // Assuming file_uri is a path relative to the project root
        const filePath = path.resolve(__dirname, '..', tokenData.file_uri);
        res.download(filePath);
    } catch (error) {
        res.status(500).json({ message: 'Error downloading file', error: error.message });
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

module.exports = router;