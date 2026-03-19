// backend/routes/changeRequests.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authRequired, requireRole } = require('../middleware/auth');
const dcrService = require('../services/dcrService');
const fileService = require('../services/fileService');
const signedUrlService = require('../services/signedUrlService');
const auditService = require('../services/auditService');
const { ORIGINAL_DIR, PDF_DIR, STAGING_DIR } = require('../config/storage');

// Configure multer for file uploads
const upload = multer({
    dest: STAGING_DIR,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB max
    }
});

/**
 * 1. CREATE A NEW CHANGE REQUEST (Draft)
 * POST /api/change-requests
 * Body: { document_id, reason }
 */
router.post('/', authRequired, async (req, res) => {
    try {
        const { document_id, reason } = req.body;
        const requester_id = req.user.id;

        // Validate inputs
        if (!document_id) {
            return res.status(400).json({ message: 'document_id is required' });
        }
        if (!reason || reason.trim().length === 0) {
            return res.status(400).json({ message: 'reason is required' });
        }
        const cr_id = await dcrService.createChangeRequest(document_id, requester_id, reason);
        
        res.status(201).json({
            message: 'Change request created in draft status',
            change_request_id: cr_id,
            status: 'Draft'
        });
    } catch (error) {
        console.error('Error creating change request:', error.message);
        res.status(500).json({
            message: 'Error creating change request',
            error: error.message
        });
    }
});

/**
 * LIST APPROVERS (Managers only)
 * GET /api/change-requests/approvers
 */
router.get('/approvers', authRequired, async (req, res) => {
    try {
        const approvers = await dcrService.getManagerApprovers();
        return res.status(200).json({ approvers: approvers || [] });
    } catch (error) {
        console.error('Error fetching approvers:', error.message);
        res.status(500).json({
            message: 'Error fetching approvers',
            error: error.message
        });
    }
});

/**
 * LIST CHECKERS (Assistant Manager / Manager)
 * GET /api/change-requests/checkers
 */
router.get('/checkers', authRequired, async (req, res) => {
    try {
        const checkers = await dcrService.getCheckerCandidates();
        return res.status(200).json({ checkers: checkers || [] });
    } catch (error) {
        console.error('Error fetching checkers:', error.message);
        res.status(500).json({
            message: 'Error fetching checkers',
            error: error.message
        });
    }
});

/**
 * 2. SUBMIT A DRAFT CHANGE REQUEST FOR APPROVAL
 * POST /api/change-requests/:id/submit
 * The system will notify the assigned manager
 */
router.post('/:id/submit', authRequired, async (req, res) => {
    try {
        const cr_id = req.params.id;
        const requester_id = req.user.id;

        const result = await dcrService.submitChangeRequest(cr_id, requester_id);

        res.status(200).json({
            message: 'Change request submitted for approval',
            change_request_id: cr_id,
            assigned_manager_id: result.manager_id,
            status: 'Submitted'
        });
    } catch (error) {
        console.error('Error submitting change request:', error.message);
        
        if (error.message.includes('not in draft state')) {
            return res.status(400).json({ message: error.message });
        }
        if (error.message.includes('not found')) {
            return res.status(404).json({ message: error.message });
        }
        
        res.status(500).json({
            message: 'Error submitting change request',
            error: error.message
        });
    }
});

/**
 * 3. MANAGER: INITIAL DECISION (Pre-Approve or Reject)
 * POST /api/change-requests/:id/decision
 * Body: { decision: 'Approve' or 'Reject', comment: 'optional reason' }
 * Decision 'Approve' = Pre-Approve (Gate A approval)
 * Decision 'Reject' = Reject the change request
 */
router.post('/:id/decision', authRequired, requireRole('MANAGER', 'QMR', 'ADMIN', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'ASSISTANT_MANAGER', 'PRESIDENT'), async (req, res) => {
    try {
        const cr_id = req.params.id;
        const actor_id = req.user.id;
        const { decision, comment } = req.body;

        // Validate inputs
        if (!decision || !['Approve', 'Reject'].includes(decision)) {
            return res.status(400).json({
                message: 'Invalid decision. Must be "Approve" or "Reject"'
            });
        }
        if (decision === 'Reject' && (!comment || !String(comment).trim())) {
            return res.status(400).json({ message: 'comment is required when rejecting' });
        }

        const result = await dcrService.makeWorkflowDecision(cr_id, actor_id, decision, comment || '');

        res.status(200).json({
            message: result.message,
            change_request_id: cr_id,
            status: result.status,
            downloadLink: result.downloadLink || undefined
        });
    } catch (error) {
        console.error('Error making initial decision:', error.message);
        
        if (error.message.includes('not found') || error.message.includes('not pending')) {
            return res.status(400).json({ message: error.message });
        }
        
        res.status(500).json({
            message: 'Error making decision',
            error: error.message
        });
    }
});

/**
 * 4. REQUESTER: UPLOAD REVISED DOCUMENTS
 * POST /api/change-requests/:id/upload
 * Files required: source (Word/Excel), pdf (PDF version)
 * Status transition: Pre-Approved or Returned for Revision -> Pending Approval
 */
router.post('/:id/upload',
    authRequired,
    upload.fields([
        { name: 'source', maxCount: 1 },
        { name: 'pdf', maxCount: 1 }
    ]),
    async (req, res) => {
        try {
            const cr_id = req.params.id;
            const requester_id = req.user.id;
            const checker_id = Number(req.body?.checker_id || 0);

            // Validate files are provided
            if (!req.files || !req.files.source || !req.files.pdf) {
                return res.status(400).json({
                    message: 'Both source file and PDF file are required'
                });
            }

            const sourceFile = req.files.source[0];
            const pdfFile = req.files.pdf[0];

            // Validate file types
            try {
                fileService.validateFileType(sourceFile.originalname, sourceFile.mimetype);
                fileService.validatePdfFile(pdfFile.originalname);
            } catch (validationError) {
                return res.status(400).json({ message: validationError.message });
            }

            const result = await dcrService.uploadRevision(cr_id, requester_id, req.files, checker_id);

            res.status(200).json({
                message: result.message,
                change_request_id: cr_id,
                revision_id: result.revision_id,
                status: result.status
            });
        } catch (error) {
            console.error('Error uploading revision:', error.message);
            
            if (error.message.includes('not found') || error.message.includes('not in a state')) {
                return res.status(400).json({ message: error.message });
            }
            
            res.status(500).json({
                message: 'Error uploading files',
                error: error.message
            });
        }
    }
);

/**
 * 5. MANAGER: FINAL REVIEW (Approve or Return for Revision)
 * POST /api/change-requests/:id/review
 * Body: { decision: 'Approve' or 'Return', comment: 'optional' }
 * Decision 'Approve' = Final approval, document is released
 * Decision 'Return' = Return to requester for revision
 */
router.post('/:id/review', authRequired, requireRole('MANAGER', 'QMR', 'ADMIN', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'ASSISTANT_MANAGER', 'PRESIDENT'), async (req, res) => {
    try {
        const cr_id = req.params.id;
        const actor_id = req.user.id;
        const { decision, comment } = req.body;

        // Validate inputs
        if (!decision || !['Approve', 'Return', 'Reject'].includes(decision)) {
            return res.status(400).json({
                message: 'Invalid decision. Must be "Approve", "Reject", or "Return"'
            });
        }
        if ((decision === 'Reject' || decision === 'Return') && (!comment || !String(comment).trim())) {
            return res.status(400).json({ message: 'comment is required when rejecting/returning' });
        }

        const normalizedDecision = decision === 'Return' ? 'Reject' : decision;
        const result = await dcrService.makeWorkflowDecision(cr_id, actor_id, normalizedDecision, comment || '');

        res.status(200).json({
            message: result.message,
            change_request_id: cr_id,
            status: result.status
        });
    } catch (error) {
        console.error('Error making final review:', error.message);
        
        if (error.message.includes('not found') || error.message.includes('not pending')) {
            return res.status(400).json({ message: error.message });
        }
        
        res.status(500).json({
            message: 'Error making final review',
            error: error.message
        });
    }
});

/**
 * 6. GET CHANGE REQUEST DETAILS
 * GET /api/change-requests/:id
 * Returns: Full CR details including status, approvals, revisions, audit trail
 */
router.get('/:id', authRequired, async (req, res) => {
    try {
        const cr_id = req.params.id;
        await auditService.recordEvent('ChangeRequest', cr_id, req.user.id, 'VIEW', {
            source: 'dcr_detail_page'
        });
        const cr = await dcrService.getChangeRequest(cr_id);

        if (!cr) {
            return res.status(404).json({ message: 'Change request not found' });
        }

        res.status(200).json({
            ...cr,
            change_request: cr,
            approval_history: cr.approvals || []
        });
    } catch (error) {
        console.error('Error fetching change request:', error.message);
        res.status(500).json({
            message: 'Error fetching change request',
            error: error.message
        });
    }
});

/**
 * 7. GET USER'S CHANGE REQUESTS
 * GET /api/change-requests
 * Returns: All CRs for the current user (as requester or manager)
 * Query params: role (requester|manager), status
 */
router.get('/', authRequired, async (req, res) => {
    try {
        const user_id = req.user.id;
        const user_role = req.user.role;
        const { role, status } = req.query;

        // Determine role context
        let roleContext = role || 'requester';
        if (['MANAGER', 'QMR', 'ADMIN'].includes(user_role)) {
            roleContext = role || 'manager';
        }

        let crs = await dcrService.getUserChangeRequests(user_id, roleContext);

        // Filter by status if requested
        if (status) {
            crs = crs.filter(cr => cr.status === status);
        }

        res.status(200).json({
            count: crs.length,
            change_requests: crs
        });
    } catch (error) {
        console.error('Error fetching user change requests:', error.message);
        res.status(500).json({
            message: 'Error fetching change requests',
            error: error.message
        });
    }
});

/**
 * 8. GET CHANGE REQUEST HISTORY (Audit Trail)
 * GET /api/change-requests/:id/history
 * Returns: Approval records and audit events
 */
router.get('/:id/history', authRequired, async (req, res) => {
    try {
        const cr_id = req.params.id;
        const history = await dcrService.getChangeRequestHistory(cr_id);

        res.status(200).json(history);
    } catch (error) {
        console.error('Error fetching history:', error.message);
        res.status(500).json({
            message: 'Error fetching change request history',
            error: error.message
        });
    }
});

/**
 * 9. REQUEST DELETE CHANGE REQUEST (Requester)
 * POST /api/change-requests/:id/delete-request
 * Body: { reason?: string }
 */
router.post('/:id/delete-request', authRequired, async (req, res) => {
    try {
        const cr_id = req.params.id;
        const requester_id = req.user.id;
        const { reason } = req.body || {};
        const result = await dcrService.requestDeleteChangeRequest(cr_id, requester_id, reason || null);
        res.status(200).json({ message: 'Delete request submitted', ...result });
    } catch (error) {
        console.error('Error requesting delete change request:', error.message);
        if (error.message.includes('not found') || error.message.includes('current state')) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error requesting delete change request', error: error.message });
    }
});

/**
 * 10. APPROVE DELETE CHANGE REQUEST (Admin)
 * POST /api/change-requests/:id/delete-approve
 * Body: { reason?: string }
 */
router.post('/:id/delete-approve', authRequired, async (req, res) => {
    try {
        const cr_id = req.params.id;
        const admin_id = req.user.id;
        const userRole = String(req.user.role || '').toUpperCase();
        if (userRole !== 'ADMIN') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        const { reason } = req.body || {};
        const result = await dcrService.approveDeleteChangeRequest(cr_id, admin_id, reason || null);
        res.status(200).json({ message: 'Change request deleted', ...result });
    } catch (error) {
        console.error('Error approving delete change request:', error.message);
        if (error.message.includes('not found') || error.message.includes('current state')) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error approving delete change request', error: error.message });
    }
});

/**
 * 9. DOWNLOAD FILE WITH SIGNED URL
 * GET /api/change-requests/download/:token
 * Downloads a file using a signed URL (requires valid token)
 * Only allows downloading if user has access to the file
 */
router.get('/download/:token', async (req, res) => {
    try {
        const token = req.params.token;
        const tokenData = await signedUrlService.verifySignedUrl(token);

        if (!tokenData) {
            return res.status(404).json({ message: 'Invalid or expired download link' });
        }

        const filePath = path.resolve(__dirname, '..', tokenData.file_uri);

        // Verify file exists
        if (!require('fs').existsSync(filePath)) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Send file for download
        res.download(filePath, path.basename(filePath));
    } catch (error) {
        console.error('Error downloading file:', error.message);
        res.status(500).json({
            message: 'Error downloading file',
            error: error.message
        });
    }
});

module.exports = router;