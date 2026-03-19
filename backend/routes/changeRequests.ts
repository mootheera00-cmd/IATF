// backend/routes/changeRequests.ts
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

  return candidates.find((candidate) => require('fs').existsSync(candidate)) || candidates[0] || normalized;
}

// Configure multer for file uploads
const upload = multer({
  dest: STAGING_DIR,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  }
});

const decisionUpload = upload.fields([
  { name: 'signed_pdf', maxCount: 1 },
  { name: 'marked_pdf', maxCount: 1 },
  { name: 'source', maxCount: 1 }
]);

/**
 * 1. CREATE A NEW CHANGE REQUEST (Draft)
 * POST /api/change-requests
 * Body: { document_id, reason }
 */
router.post('/', authRequired, async (req: any, res: any) => {
  try {
    const { document_id, reason } = req.body;
    const requester_id = req.user.id;
    const allowDcRequester = String(req.headers['x-role-mode'] || '').toLowerCase() === 'user';

    // Validate inputs
    if (!document_id) {
      return res.status(400).json({ message: 'document_id is required' });
    }
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ message: 'reason is required' });
    }
  const cr_id = await dcrService.createChangeRequest(document_id, requester_id, reason, { allowDcRequester });

    // Audit log
    await auditService.recordEvent('ChangeRequest', cr_id, requester_id, 'CR_CREATED', {
      document_id, reason
    });

    res.status(201).json({
      message: 'Change request created in draft status',
      change_request_id: cr_id,
      status: 'Draft'
    });
  } catch (error: any) {
    console.error('Error creating change request:', error.message);
    res.status(500).json({
      message: 'Error creating change request',
      error: error.message
    });
  }
});

/**
 * PREVIEW NEW DOCUMENT NUMBER
 * POST /api/change-requests/new-document/preview
 * Body: { category, subCategory }
 */
router.post('/new-document/preview', authRequired, async (req: any, res: any) => {
  try {
    const { category, subCategory } = req.body || {};
    if (!category || !subCategory) {
      return res.status(400).json({ message: 'category and subCategory are required' });
    }

    const preview = await dcrService.getNewDocumentPreview(category, subCategory);
    return res.status(200).json(preview);
  } catch (error: any) {
    console.error('Error previewing new document:', error.message);
    return res.status(400).json({ message: error.message || 'Unable to preview document number' });
  }
});

/**
 * CREATE NEW DOCUMENT CHANGE REQUEST (Draft)
 * POST /api/change-requests/new-document
 * Body: { category, subCategory, reason }
 */
router.post('/new-document', authRequired, async (req: any, res: any) => {
  try {
    const { category, subCategory, reason, documentName } = req.body || {};
    const requester_id = req.user.id;
    const allowDcRequester = String(req.headers['x-role-mode'] || '').toLowerCase() === 'user';

    if (!category || !subCategory) {
      return res.status(400).json({ message: 'category and subCategory are required' });
    }
    if (!documentName || !String(documentName).trim()) {
      return res.status(400).json({ message: 'documentName is required' });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: 'reason is required' });
    }

    const result = await dcrService.createNewDocumentChangeRequest(
      category,
      subCategory,
      requester_id,
      reason,
      documentName,
      { allowDcRequester }
    );

    // Audit log
    await auditService.recordEvent('ChangeRequest', result.change_request_id, requester_id, 'CR_NEW_DOC_CREATED', {
      category, subCategory, documentName, reason
    });

    return res.status(201).json({
      message: 'New document change request created in draft status',
      ...result,
      status: 'Draft'
    });
  } catch (error: any) {
    console.error('Error creating new document request:', error.message);
    return res.status(400).json({ message: error.message || 'Unable to create new document request' });
  }
});

/**
 * LIST APPROVERS (Managers only)
 * GET /api/change-requests/approvers
 */
router.get('/approvers', authRequired, async (req: any, res: any) => {
  try {
    const { level } = req.query || {};
    const approvers = level
      ? await dcrService.getApproverCandidates(level)
      : await dcrService.getManagerApprovers();
    return res.status(200).json({ approvers: approvers || [] });
  } catch (error: any) {
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
router.get('/checkers', authRequired, async (req: any, res: any) => {
  try {
    const checkers = await dcrService.getCheckerCandidates();
    return res.status(200).json({ checkers: checkers || [] });
  } catch (error: any) {
    console.error('Error fetching checkers:', error.message);
    res.status(500).json({
      message: 'Error fetching checkers',
      error: error.message
    });
  }
});

/**
 * RE-UPLOAD OPTIONS
 * GET /api/change-requests/reupload/options?document_id=123
 */
router.get('/reupload/options', authRequired, async (req: any, res: any) => {
  try {
    const documentId = req.query?.document_id;
    if (!documentId) {
      return res.status(400).json({ message: 'document_id is required' });
    }

    const result = await dcrService.getReuploadOptions(documentId);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error fetching reupload options:', error.message);
    return res.status(400).json({ message: error.message || 'Unable to fetch reupload options' });
  }
});

/**
 * CREATE RE-UPLOAD REQUEST
 * POST /api/change-requests/reupload
 * Body: { document_id, target_revision_id?, assignee_id?, reason }
 */
router.post('/reupload', authRequired, async (req: any, res: any) => {
  try {
    const requester_id = req.user.id;
    const { document_id, target_revision_id, assignee_id, reason } = req.body || {};

    if (!document_id) {
      return res.status(400).json({ message: 'document_id is required' });
    }

    const result = await dcrService.createReuploadRequest(
      document_id,
      requester_id,
      assignee_id || null,
      target_revision_id || null,
      reason
    );

    // Audit log
    await auditService.recordEvent('ChangeRequest', result.change_request_id, requester_id, 'CR_REUPLOAD_CREATED', {
      document_id, assignee_id: assignee_id || null, reason
    });

    return res.status(201).json({
      message: 'Re-upload request created successfully',
      ...result
    });
  } catch (error: any) {
    console.error('Error creating reupload request:', error.message);
    return res.status(400).json({ message: error.message || 'Unable to create reupload request' });
  }
});

/**
 * 2. SUBMIT A DRAFT CHANGE REQUEST FOR APPROVAL
 * POST /api/change-requests/:id/submit
 * The system will notify the assigned manager
 */
router.post('/:id/submit', authRequired, async (req: any, res: any) => {
  try {
    const cr_id = req.params.id;
    const requester_id = req.user.id;
    const allowDcRequester = String(req.headers['x-role-mode'] || '').toLowerCase() === 'user';

    const result = await dcrService.submitChangeRequest(cr_id, requester_id, { allowDcRequester });

    // Audit log
    await auditService.recordEvent('ChangeRequest', cr_id, requester_id, 'CR_SUBMITTED', {
      assigned_manager_id: result.manager_id
    });

    res.status(200).json({
      message: 'Change request submitted for approval',
      change_request_id: cr_id,
      assigned_manager_id: result.manager_id,
      status: 'Submitted'
    });
  } catch (error: any) {
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
router.post(
  '/:id/decision',
  authRequired,
  decisionUpload,
  requireRole('MANAGER', 'QMR', 'ADMIN', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'ASSISTANT_MANAGER', 'PRESIDENT'),
  async (req: any, res: any) => {
    try {
      const cr_id = req.params.id;
      const actor_id = req.user.id;
      const { decision, comment } = req.body;
      const signedPdf = req.files?.signed_pdf ? req.files.signed_pdf[0] : null;
      const markedPdf = req.files?.marked_pdf ? req.files.marked_pdf[0] : null;
  const sourceDoc = req.files?.source ? req.files.source[0] : null;

      // Validate inputs
      if (!decision || !['Approve', 'Reject'].includes(decision)) {
        return res.status(400).json({
          message: 'Invalid decision. Must be "Approve" or "Reject"'
        });
      }
      if (decision === 'Reject' && (!comment || !String(comment).trim())) {
        return res.status(400).json({ message: 'comment is required when rejecting' });
      }

      if (signedPdf) {
        try {
          fileService.validatePdfFile(signedPdf.originalname);
        } catch (validationError: any) {
          return res.status(400).json({ message: validationError.message });
        }
      }

      if (markedPdf) {
        try {
          fileService.validatePdfFile(markedPdf.originalname);
        } catch (validationError: any) {
          return res.status(400).json({ message: validationError.message });
        }
      }

      if (sourceDoc) {
        try {
          fileService.validateFileType(sourceDoc.originalname, sourceDoc.mimetype);
        } catch (validationError: any) {
          return res.status(400).json({ message: validationError.message });
        }
      }

      const result = await dcrService.makeWorkflowDecision(cr_id, actor_id, decision, comment || '', {
        signed_pdf: signedPdf,
        marked_pdf: markedPdf,
        source: sourceDoc
      });

      // Audit log
      await auditService.recordEvent('ChangeRequest', cr_id, actor_id, `CR_DECISION_${decision.toUpperCase()}`, {
        decision, comment: comment || null, step: 'GateA',
        has_signed_pdf: !!signedPdf, has_marked_pdf: !!markedPdf, has_source: !!sourceDoc,
        new_status: result.status
      });

      res.status(200).json({
        message: result.message,
        change_request_id: cr_id,
        status: result.status,
        downloadLink: result.downloadLink || undefined
      });
    } catch (error: any) {
      console.error('Error making initial decision:', error.message);

      if (
        error.message.includes('not found') ||
        error.message.includes('not pending') ||
        error.message.includes('signed_pdf is required') ||
        error.message.includes('No revision associated')
      ) {
        return res.status(400).json({ message: error.message });
      }

      res.status(500).json({
        message: 'Error making decision',
        error: error.message
      });
    }
  }
);

/**
 * 4. REQUESTER: UPLOAD REVISED DOCUMENTS
 * POST /api/change-requests/:id/upload
 * Files required: source (Word/Excel), pdf (PDF version)
 * Status transition: Pre-Approved or Returned for Revision -> Pending Approval
 */
router.post(
  '/:id/upload',
  authRequired,
  upload.fields([
    { name: 'source', maxCount: 1 },
    { name: 'pdf', maxCount: 1 }
  ]),
  async (req: any, res: any) => {
    try {
      const cr_id = req.params.id;
      const requester_id = req.user.id;
      const checker_id = Number(req.body?.checker_id || 0);
  const targetRevisionId = req.body?.target_revision_id ? Number(req.body.target_revision_id) : null;
  const approver_id = req.body?.approver_id ? Number(req.body.approver_id) : null;

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
      } catch (validationError: any) {
        return res.status(400).json({ message: validationError.message });
      }

  const result = await dcrService.uploadRevision(cr_id, requester_id, req.files, checker_id, targetRevisionId, approver_id);

      // Audit log
      await auditService.recordEvent('ChangeRequest', cr_id, requester_id, 'CR_FILES_UPLOADED', {
        checker_id: checker_id || null,
        approver_id: approver_id || null,
        source_file: req.files.source[0].originalname,
        pdf_file: req.files.pdf[0].originalname,
        new_status: result.status
      });

      res.status(200).json({
        message: result.message,
        change_request_id: cr_id,
        revision_id: result.revision_id,
        status: result.status
      });
    } catch (error: any) {
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
 * 4b. REQUESTER: UPLOAD NON-SIGNED PDF (Form category)
 * POST /api/change-requests/:id/non-signed-pdf
 * File required: non_signed_pdf (PDF version)
 * Status transition: Pending Non-Sign PDF -> Pending Final DC Release
 */
router.post(
  '/:id/non-signed-pdf',
  authRequired,
  upload.single('non_signed_pdf'),
  async (req: any, res: any) => {
    try {
      const cr_id = req.params.id;
      const requester_id = req.user.id;

      if (!req.file) {
        return res.status(400).json({ message: 'non_signed_pdf is required' });
      }

      try {
        fileService.validatePdfFile(req.file.originalname);
      } catch (validationError: any) {
        return res.status(400).json({ message: validationError.message });
      }

      const result = await dcrService.uploadNonSignedPdf(cr_id, requester_id, req.file);

      // Audit log
      await auditService.recordEvent('ChangeRequest', cr_id, requester_id, 'CR_NON_SIGNED_PDF_UPLOADED', {
        file_name: req.file.originalname,
        new_status: result.status
      });

      return res.status(200).json({
        message: 'Non-signed PDF uploaded successfully',
        change_request_id: cr_id,
        status: result.status
      });
    } catch (error: any) {
      console.error('Error uploading non-signed PDF:', error.message);

      if (error.message.includes('not found') || error.message.includes('awaiting')) {
        return res.status(400).json({ message: error.message });
      }

      return res.status(500).json({
        message: 'Error uploading non-signed PDF',
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
router.post(
  '/:id/review',
  authRequired,
  requireRole('MANAGER', 'QMR', 'ADMIN', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'ASSISTANT_MANAGER', 'PRESIDENT'),
  async (req: any, res: any) => {
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

      // Audit log
      await auditService.recordEvent('ChangeRequest', cr_id, actor_id, `CR_REVIEW_${decision.toUpperCase()}`, {
        decision, comment: comment || null, step: 'GateB', new_status: result.status
      });

      res.status(200).json({
        message: result.message,
        change_request_id: cr_id,
        status: result.status
      });
    } catch (error: any) {
      console.error('Error making final review:', error.message);

      if (error.message.includes('not found') || error.message.includes('not pending')) {
        return res.status(400).json({ message: error.message });
      }

      res.status(500).json({
        message: 'Error making final review',
        error: error.message
      });
    }
  }
);

/**
 * 6. GET CHANGE REQUEST DETAILS
 * GET /api/change-requests/:id
 * Returns: Full CR details including status, approvals, revisions, audit trail
 */
router.get('/:id', authRequired, async (req: any, res: any) => {
  try {
    const cr_id = req.params.id;
    const cr = await dcrService.getChangeRequest(cr_id);

    if (!cr) {
      return res.status(404).json({ message: 'Change request not found' });
    }

    res.status(200).json({
      ...cr,
      change_request: cr,
      approval_history: cr.approvals || []
    });
  } catch (error: any) {
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
router.get('/', authRequired, async (req: any, res: any) => {
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
      crs = crs.filter((cr: any) => cr.status === status);
    }

    res.status(200).json({
      count: crs.length,
      change_requests: crs
    });
  } catch (error: any) {
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
router.get('/:id/history', authRequired, async (req: any, res: any) => {
  try {
    const cr_id = req.params.id;
    const history = await dcrService.getChangeRequestHistory(cr_id);

    res.status(200).json(history);
  } catch (error: any) {
    console.error('Error fetching history:', error.message);
    res.status(500).json({
      message: 'Error fetching change request history',
      error: error.message
    });
  }
});

/**
 * 9. GET DC SOURCE DOWNLOAD LINK
 * GET /api/change-requests/:id/source-link
 * Returns signed download link for requester/DC to download source document
 */
router.get('/:id/source-link', authRequired, async (req: any, res: any) => {
  try {
    const cr_id = req.params.id;
    const user_id = req.user.id;
    const result = await dcrService.getDcSourceDownloadLink(cr_id, user_id);
    res.status(200).json(result);
  } catch (error: any) {
    console.error('Error generating source download link:', error.message);
    if (error.message.includes('not authorized') || error.message.includes('not found')) {
      return res.status(403).json({ message: error.message });
    }
    res.status(400).json({ message: error.message });
  }
});

/**
 * 10. CLOSE CHANGE REQUEST (Requester only)
 * POST /api/change-requests/:id/close
 * Body: { reason?: string }
 */
router.post('/:id/close', authRequired, async (req: any, res: any) => {
  try {
    const cr_id = req.params.id;
    const requester_id = req.user.id;
    const { reason } = req.body || {};
    const result = await dcrService.closeChangeRequest(cr_id, requester_id, reason || null);

    // Audit log
    await auditService.recordEvent('ChangeRequest', cr_id, requester_id, 'CR_CLOSED', {
      reason: reason || null
    });

    res.status(200).json({ message: 'Change request closed', ...result });
  } catch (error: any) {
    console.error('Error closing change request:', error.message);
    if (error.message.includes('not found') || error.message.includes('current state')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error closing change request', error: error.message });
  }
});

/**
 * 10.1 REQUEST DELETE CHANGE REQUEST (Requester)
 * POST /api/change-requests/:id/delete-request
 * Body: { reason?: string }
 */
router.post('/:id/delete-request', authRequired, async (req: any, res: any) => {
  try {
    const cr_id = req.params.id;
    const requester_id = req.user.id;
    const { reason } = req.body || {};
    const result = await dcrService.requestDeleteChangeRequest(cr_id, requester_id, reason || null);

    // Audit log
    await auditService.recordEvent('ChangeRequest', cr_id, requester_id, 'CR_DELETE_REQUESTED', {
      reason: reason || null
    });

    res.status(200).json({ message: 'Delete request submitted', ...result });
  } catch (error: any) {
    console.error('Error requesting delete change request:', error.message);
    if (error.message.includes('not found') || error.message.includes('current state')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error requesting delete change request', error: error.message });
  }
});

/**
 * 10.2 APPROVE DELETE CHANGE REQUEST (Admin)
 * POST /api/change-requests/:id/delete-approve
 * Body: { reason?: string }
 */
router.post('/:id/delete-approve', authRequired, async (req: any, res: any) => {
  try {
    const cr_id = req.params.id;
    const admin_id = req.user.id;
    const userRole = String(req.user.role || '').toUpperCase();
    if (userRole !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    const { reason } = req.body || {};
    const result = await dcrService.approveDeleteChangeRequest(cr_id, admin_id, reason || null);

    // Audit log
    await auditService.recordEvent('ChangeRequest', cr_id, admin_id, 'CR_DELETE_APPROVED', {
      reason: reason || null
    });

    res.status(200).json({ message: 'Change request deleted', ...result });
  } catch (error: any) {
    console.error('Error approving delete change request:', error.message);
    if (error.message.includes('not found') || error.message.includes('current state')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error approving delete change request', error: error.message });
  }
});

/**
 * 10. GET REVISION DOWNLOAD LINKS (Checker/Approver/DC)
 * GET /api/change-requests/:id/revision-links
 * Returns signed download links for latest revision source/pdf
 */
router.get('/:id/revision-links', authRequired, async (req: any, res: any) => {
  try {
    const cr_id = req.params.id;
    const user_id = req.user.id;
    const result = await dcrService.getRevisionDownloadLinks(cr_id, user_id);
    res.status(200).json(result);
  } catch (error: any) {
    console.error('Error generating revision download links:', error.message);
    if (error.message.includes('authorized') || error.message.includes('not found')) {
      return res.status(403).json({ message: error.message });
    }
    res.status(400).json({ message: error.message });
  }
});

/**
 * 12. DOWNLOAD FILE WITH SIGNED URL
 * GET /api/change-requests/download/:token
 * Downloads a file using a signed URL (requires valid token)
 * Only allows downloading if user has access to the file
 */
router.get('/download/:token', async (req: any, res: any) => {
  try {
    const token = req.params.token;
    const tokenData = await signedUrlService.verifySignedUrl(token);

    if (!tokenData) {
      return res.status(404).json({ message: 'Invalid or expired download link' });
    }

  const filePath = resolveStoredPath(tokenData.file_uri);

    // Verify file exists
    if (!require('fs').existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    const disposition = String(req.query?.disposition || 'attachment').toLowerCase();
    const fileName = path.basename(filePath);
    const isPdf = fileName.toLowerCase().endsWith('.pdf');

    if (disposition === 'inline' && isPdf) {
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      return res.sendFile(filePath);
    }

    // Send file for download
    res.download(filePath, fileName);
  } catch (error: any) {
    console.error('Error downloading file:', error.message);
    res.status(500).json({
      message: 'Error downloading file',
      error: error.message
    });
  }
});

export = router;
