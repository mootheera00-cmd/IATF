// backend/services/dcrService.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dbPath = path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbPath);
const signedUrlService = require('./signedUrlService');
const notificationService = require('./notificationService');
const auditService = require('./auditService');
const fileService = require('./fileService');
const { ORIGINAL_DIR, PDF_DIR } = require('../config/storage');

// Promisify db.run and db.get
const run = (sql, params) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const get = (sql, params) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

const all = (sql, params) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

let schemaCompatibilityReady = false;

async function ensureChangeRequestSchemaCompatibility() {
    if (schemaCompatibilityReady) {
        return;
    }

    const crCols = await all(`PRAGMA table_info(ChangeRequest)`, []);
    const hasColumn = (name) => crCols.some(c => c.name === name);

    if (!hasColumn('manager_id')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN manager_id BIGINT`, []);
    }
    if (!hasColumn('latest_working_revision_id')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN latest_working_revision_id BIGINT`, []);
    }
    if (!hasColumn('preapproved_at')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN preapproved_at TIMESTAMP NULL`, []);
    }
    if (!hasColumn('final_approved_at')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN final_approved_at TIMESTAMP NULL`, []);
    }
    if (!hasColumn('rejected_at')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN rejected_at TIMESTAMP NULL`, []);
    }
    if (!hasColumn('returned_at')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN returned_at TIMESTAMP NULL`, []);
    }
    if (!hasColumn('checker_id')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN checker_id BIGINT`, []);
    }
    if (!hasColumn('approver_id')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN approver_id BIGINT`, []);
    }
    if (!hasColumn('document_level')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN document_level VARCHAR(8)`, []);
    }
    if (!hasColumn('dc_initial_at')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN dc_initial_at TIMESTAMP NULL`, []);
    }
    if (!hasColumn('checker_approved_at')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN checker_approved_at TIMESTAMP NULL`, []);
    }
    if (!hasColumn('approver_approved_at')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN approver_approved_at TIMESTAMP NULL`, []);
    }
    if (!hasColumn('dc_final_approved_at')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN dc_final_approved_at TIMESTAMP NULL`, []);
    }
    if (!hasColumn('returned_by_role')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN returned_by_role VARCHAR(32)`, []);
    }
    if (!hasColumn('returned_comment')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN returned_comment TEXT`, []);
    }
    if (!hasColumn('closed_at')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN closed_at TIMESTAMP`, []);
    }
    if (!hasColumn('delete_requested_at')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN delete_requested_at TIMESTAMP`, []);
    }
    if (!hasColumn('delete_requested_by')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN delete_requested_by BIGINT`, []);
    }
    if (!hasColumn('delete_reason')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN delete_reason TEXT`, []);
    }
    if (!hasColumn('delete_approved_at')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN delete_approved_at TIMESTAMP`, []);
    }
    if (!hasColumn('delete_approved_by')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN delete_approved_by BIGINT`, []);
    }
    if (!hasColumn('delete_approved_comment')) {
        await run(`ALTER TABLE ChangeRequest ADD COLUMN delete_approved_comment TEXT`, []);
    }

    if (hasColumn('assigned_manager_id')) {
        await run(
            `UPDATE ChangeRequest
             SET manager_id = COALESCE(manager_id, assigned_manager_id)
             WHERE assigned_manager_id IS NOT NULL`,
            []
        );
    }

    schemaCompatibilityReady = true;
}

async function ensureApprovalRecordCompatibility() {
    const approvalCols = await all(`PRAGMA table_info(ApprovalRecord)`, []);
    const hasApprovalCol = (name) => approvalCols.some(c => c.name === name);

    if (!hasApprovalCol('step')) {
        await run(`ALTER TABLE ApprovalRecord ADD COLUMN step TEXT`, []);
    }
    if (!hasApprovalCol('decided_by')) {
        await run(`ALTER TABLE ApprovalRecord ADD COLUMN decided_by BIGINT`, []);
    }
    if (!hasApprovalCol('decided_by_role')) {
        await run(`ALTER TABLE ApprovalRecord ADD COLUMN decided_by_role VARCHAR(32)`, []);
    }
    if (!hasApprovalCol('decided_at')) {
        await run(`ALTER TABLE ApprovalRecord ADD COLUMN decided_at TIMESTAMP`, []);
        await run(`UPDATE ApprovalRecord SET decided_at = COALESCE(approved_at, created_at, CURRENT_TIMESTAMP) WHERE decided_at IS NULL`, []);
    }
    if (!hasApprovalCol('comment')) {
        await run(`ALTER TABLE ApprovalRecord ADD COLUMN comment TEXT`, []);
    }
    if (!hasApprovalCol('cr_id')) {
        await run(`ALTER TABLE ApprovalRecord ADD COLUMN cr_id BIGINT`, []);
        await run(`UPDATE ApprovalRecord SET cr_id = change_request_id WHERE cr_id IS NULL`, []);
    }
}

async function ensureDocumentRevisionSchemaCompatibility() {
    const drCols = await all(`PRAGMA table_info(DocumentRevision)`, []);
    const hasDrCol = (name) => drCols.some(c => c.name === name);

    if (!hasDrCol('rev_code')) {
        await run(`ALTER TABLE DocumentRevision ADD COLUMN rev_code VARCHAR(32)`, []);
    }
    if (!hasDrCol('original_uri')) {
        await run(`ALTER TABLE DocumentRevision ADD COLUMN original_uri TEXT`, []);
    }
    if (!hasDrCol('original_sha256')) {
        await run(`ALTER TABLE DocumentRevision ADD COLUMN original_sha256 CHAR(64)`, []);
    }
    if (!hasDrCol('pdf_uri')) {
        await run(`ALTER TABLE DocumentRevision ADD COLUMN pdf_uri TEXT`, []);
    }
    if (!hasDrCol('pdf_sha256')) {
        await run(`ALTER TABLE DocumentRevision ADD COLUMN pdf_sha256 CHAR(64)`, []);
    }
    if (!hasDrCol('change_summary')) {
        await run(`ALTER TABLE DocumentRevision ADD COLUMN change_summary TEXT`, []);
    }
    if (!hasDrCol('created_by')) {
        await run(`ALTER TABLE DocumentRevision ADD COLUMN created_by BIGINT`, []);
    }
    if (!hasDrCol('released_by')) {
        await run(`ALTER TABLE DocumentRevision ADD COLUMN released_by BIGINT`, []);
    }
    if (!hasDrCol('released_at')) {
        await run(`ALTER TABLE DocumentRevision ADD COLUMN released_at TIMESTAMP NULL`, []);
    }
    if (!hasDrCol('supersedes_revision_id')) {
        await run(`ALTER TABLE DocumentRevision ADD COLUMN supersedes_revision_id BIGINT`, []);
    }

    if (hasDrCol('file_path_original')) {
        await run(`UPDATE DocumentRevision SET original_uri = COALESCE(original_uri, file_path_original)`, []);
    }
    if (hasDrCol('file_path_pdf')) {
        await run(`UPDATE DocumentRevision SET pdf_uri = COALESCE(pdf_uri, file_path_pdf)`, []);
    }
    if (hasDrCol('hash_original')) {
        await run(`UPDATE DocumentRevision SET original_sha256 = COALESCE(original_sha256, hash_original)`, []);
    }
    if (hasDrCol('hash_pdf')) {
        await run(`UPDATE DocumentRevision SET pdf_sha256 = COALESCE(pdf_sha256, hash_pdf)`, []);
    }
    if (hasDrCol('released_by_id')) {
        await run(`UPDATE DocumentRevision SET released_by = COALESCE(released_by, released_by_id)`, []);
    }
    if (hasDrCol('revision_number')) {
        await run(`UPDATE DocumentRevision SET rev_code = COALESCE(rev_code, 'Rev' || revision_number) WHERE revision_number IS NOT NULL`, []);
    }
}

/**
 * Helper function to compute SHA256 hash of a file
 */
async function computeFileHash(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('error', reject);
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

/**
 * Helper function to move file to permanent storage
 */
async function moveToStorage(sourceFile, targetDir, fileName) {
    const targetPath = path.join(targetDir, fileName);
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    return new Promise((resolve, reject) => {
        fs.rename(sourceFile.path, targetPath, (err) => {
            if (err) reject(err);
            else resolve(targetPath);
        });
    });
}

function toCategoryFolder(input) {
    const raw = String(input || 'uncategorized').trim().toLowerCase();
    return raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'uncategorized';
}

function normalizeRoleName(value) {
    return String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function detectDocumentLevel(doc = {}) {
    const haystack = [doc.document_type, doc.level, doc.title, doc.doc_number]
        .map((item) => String(item || '').toLowerCase())
        .join(' ');

    if (/\bl1\b|level\s*1|quality\s*manual|\bqm\b/.test(haystack)) return 'L1';
    if (/\bl2\b|level\s*2|procedure|\bqp\b/.test(haystack)) return 'L2';
    if (/\bl3\b|level\s*3|work\s*instruction|operation\s*standard|\bwi\b/.test(haystack)) return 'L3';
    return 'L4';
}

/**
 * Assign manager to a change request based on document department
 */
async function assignManager(document_id) {
    try {
        // Get document department from live schema
        const doc = await get(`SELECT department FROM Document WHERE id = ?`, [document_id]);
        if (!doc || !doc.department) {
            // Fallback: assign to first QMR/MANAGER user
            const manager = await get(`SELECT id FROM users WHERE role_id IN (SELECT id FROM roles WHERE name IN ('MANAGER', 'QMR')) LIMIT 1`, []);
            return manager ? manager.id : null;
        }
        
        // Find manager from the same department
        const manager = await get(`SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE u.department = ? AND r.name IN ('MANAGER', 'QMR') LIMIT 1`, [doc.department]);
        return manager ? manager.id : null;
    } catch (error) {
        console.error('Error assigning manager:', error);
        return null;
    }
}

async function isManagerUser(user_id) {
        if (!user_id) return false;
        const row = await get(
                `SELECT u.id
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE u.id = ?
             AND UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) LIKE '%MANAGER%'
                 LIMIT 1`,
                [user_id]
        );
        return !!row;
}

async function getUserRoleNormalized(user_id) {
    if (!user_id) return '';
    const row = await get(
        `SELECT UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) as role_name
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.id = ?
         LIMIT 1`,
        [user_id]
    );
    return row?.role_name || '';
}

async function getUsersByRoleNames(roleNames, department = null) {
    const normalized = (roleNames || []).map(normalizeRoleName).filter(Boolean);
    if (!normalized.length) {
        return [];
    }

    const placeholders = normalized.map(() => '?').join(',');
    const baseSql = `
        SELECT u.id, u.employee_code, u.name, u.department,
               UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) as role_name
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE COALESCE(u.is_active, 1) = 1
          AND UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) IN (${placeholders})
    `;

    if (department) {
        return all(`${baseSql} AND TRIM(COALESCE(u.department, '')) = TRIM(?) ORDER BY u.name ASC`, [...normalized, department]);
    }

    return all(`${baseSql} ORDER BY u.name ASC`, normalized);
}

async function pickSingleUserByRole(roleNames, preferredDepartment = null) {
    const preferred = await getUsersByRoleNames(roleNames, preferredDepartment);
    if (preferred && preferred.length > 0) {
        return preferred[0];
    }
    const fallback = await getUsersByRoleNames(roleNames, null);
    return fallback && fallback.length > 0 ? fallback[0] : null;
}

async function insertApprovalRecord({ cr_id, step, decision, decided_by, decided_by_role, comment = '' }) {
    await ensureApprovalRecordCompatibility();
    const approvalCols = await all(`PRAGMA table_info(ApprovalRecord)`, []);
    const has = (name) => approvalCols.some((column) => column.name === name);
    const normalizedStep = ['DC_INITIAL', 'GATE_A'].includes(String(step || '').toUpperCase()) ? 'GateA' : 'GateB';

    const columns = [];
    const values = [];

    if (has('cr_id')) {
        columns.push('cr_id');
        values.push(cr_id);
    }
    if (has('change_request_id')) {
        columns.push('change_request_id');
        values.push(cr_id);
    }

    if (has('step')) {
        columns.push('step');
        values.push(normalizedStep);
    }
    if (has('gate')) {
        columns.push('gate');
        values.push(normalizedStep);
    }

    if (has('decision')) {
        columns.push('decision');
        values.push(decision);
    }

    if (has('decided_by')) {
        columns.push('decided_by');
        values.push(decided_by);
    }
    if (has('approver_id')) {
        columns.push('approver_id');
        values.push(decided_by);
    }

    if (has('decided_by_role')) {
        columns.push('decided_by_role');
        values.push(decided_by_role || null);
    }

    if (has('comment')) {
        columns.push('comment');
        values.push(comment || null);
    }
    if (has('comments')) {
        columns.push('comments');
        values.push(comment || null);
    }

    if (has('decided_at')) {
        columns.push('decided_at');
        values.push(new Date().toISOString());
    }
    if (has('approved_at')) {
        columns.push('approved_at');
        values.push(new Date().toISOString());
    }

    if (!columns.length) {
        return;
    }

    const placeholders = columns.map(() => '?').join(', ');
    try {
        await run(
            `INSERT INTO ApprovalRecord (${columns.join(', ')}) VALUES (${placeholders})`,
            values
        );
    } catch (error) {
        const message = String(error?.message || '');
        if (message.includes('CHECK constraint failed') && (columns.includes('step') || columns.includes('gate'))) {
            const safePairs = columns
                .map((column, index) => ({ column, value: values[index] }))
                .filter((item) => item.column !== 'step' && item.column !== 'gate');
            const safeColumns = safePairs.map((item) => item.column);
            const safeValues = safePairs.map((item) => item.value);
            if (!safeColumns.length) {
                return;
            }
            const safePlaceholders = safeColumns.map(() => '?').join(', ');
            await run(
                `INSERT INTO ApprovalRecord (${safeColumns.join(', ')}) VALUES (${safePlaceholders})`,
                safeValues
            );
            return;
        }
        throw error;
    }
}

const dcrService = {
    async getManagerApprovers() {
        try {
            return await all(
                `SELECT u.id, u.employee_code, u.name,
                        UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) as role_name
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) LIKE '%MANAGER%'
                   AND COALESCE(u.is_active, 1) = 1
                 ORDER BY u.name ASC`,
                []
            );
        } catch (error) {
            console.error('Error fetching manager approvers:', error);
            throw error;
        }
    },

    /**
     * Create a new change request in draft status
     */
    async createChangeRequest(document_id, requester_id, reason) {
        try {
            await ensureChangeRequestSchemaCompatibility();
            const doc = await get(`SELECT * FROM Document WHERE id = ?`, [document_id]);
            if (!doc) {
                throw new Error('Document not found');
            }

            const documentLevel = detectDocumentLevel(doc);
            const assignedApprover = documentLevel === 'L1' || documentLevel === 'L2'
                ? await pickSingleUserByRole(['PRESIDENT'])
                : await pickSingleUserByRole(['MANAGER']);

            const sql = `
                INSERT INTO ChangeRequest (document_id, requester_id, manager_id, approver_id, reason, status, document_level)
                VALUES (?, ?, NULL, ?, ?, 'Draft', ?)
            `;
            const result = await run(sql, [document_id, requester_id, assignedApprover?.id || null, reason, documentLevel]);
            
            // Record in audit trail
            await auditService.recordEvent('ChangeRequest', result.lastID, requester_id, 'CREATE_DRAFT', {
                document_id,
                reason,
                document_level: documentLevel,
                auto_approver_id: assignedApprover?.id || null
            });

            return result.lastID;
        } catch (error) {
            console.error('Error creating change request:', error);
            throw error;
        }
    },

    /**
     * Submit a draft change request for approval
     */
    async submitChangeRequest(cr_id, requester_id) {
        try {
            await ensureChangeRequestSchemaCompatibility();
            const cr = await get(
                `SELECT cr.*, d.title as document_title FROM ChangeRequest cr 
                 JOIN Document d ON cr.document_id = d.id 
                 WHERE cr.id = ? AND cr.requester_id = ? AND cr.status = 'Draft'`,
                [cr_id, requester_id]
            );
            
            if (!cr) {
                throw new Error('Change Request not found or not in draft state');
            }

            // Update CR status for Document Control initial decision
            await run(
                `UPDATE ChangeRequest SET status = 'Submitted', submitted_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [cr_id]
            );

            const requester = await get(`SELECT id, name FROM users WHERE id = ?`, [requester_id]);

            // Send notification to all Document Controllers
            await notificationService.notifyDCRSubmittedToDocumentControllers({ id: cr_id, ...cr }, requester);

            // Record in audit trail
            await auditService.recordEvent('ChangeRequest', cr_id, requester_id, 'SUBMIT', {
                first_step: 'DOCUMENT_CONTROL_REVIEW'
            });

            return { cr_id, manager_id: null };
        } catch (error) {
            console.error('Error submitting change request:', error);
            throw error;
        }
    },

    async getCheckerCandidates() {
        return getUsersByRoleNames(['ASSISTANT_MANAGER', 'MANAGER']);
    },

    async closeChangeRequest(cr_id, requester_id, reason = null) {
        try {
            await ensureChangeRequestSchemaCompatibility();
            const cr = await get(
                `SELECT * FROM ChangeRequest WHERE id = ? AND requester_id = ?`,
                [cr_id, requester_id]
            );

            if (!cr) {
                throw new Error('Change Request not found or not owned by requester');
            }

            if (!['Pending Revision', 'Returned for Revision'].includes(cr.status)) {
                throw new Error('Change Request cannot be closed in the current state');
            }

            await run(
                `UPDATE ChangeRequest
                 SET status = 'Closed', closed_at = CURRENT_TIMESTAMP, returned_comment = COALESCE(?, returned_comment)
                 WHERE id = ?`,
                [reason || null, cr_id]
            );

            const dcIds = await notificationService.getDocumentControllerUserIds();
            const adminIds = await notificationService.getAdminUserIds();
            const notifyIds = Array.from(new Set([
                ...dcIds,
                ...adminIds,
                cr.checker_id,
                cr.approver_id,
                cr.manager_id,
                cr.requester_id
            ].filter(Boolean)));
            if (notifyIds.length > 0) {
                await notificationService.notifyDCRClosed(notifyIds, cr, { id: requester_id }, reason || null);
            }

            await auditService.recordEvent('ChangeRequest', cr_id, requester_id, 'CLOSE_REQUEST', {
                reason: reason || null,
                from_status: cr.status,
                to_status: 'Closed'
            });

            return { status: 'Closed' };
        } catch (error) {
            console.error('Error closing change request:', error);
            throw error;
        }
    },

    async requestDeleteChangeRequest(cr_id, requester_id, reason = null) {
        try {
            await ensureChangeRequestSchemaCompatibility();
            const cr = await get(
                `SELECT * FROM ChangeRequest WHERE id = ? AND requester_id = ?`,
                [cr_id, requester_id]
            );

            if (!cr) {
                throw new Error('Change Request not found or not owned by requester');
            }

            if (cr.status === 'Deleted') {
                throw new Error('Change Request already deleted');
            }

            await run(
                `UPDATE ChangeRequest
                 SET status = 'Delete Requested',
                     delete_requested_at = CURRENT_TIMESTAMP,
                     delete_requested_by = ?,
                     delete_reason = COALESCE(?, delete_reason)
                 WHERE id = ?`,
                [requester_id, reason || null, cr_id]
            );

            const requester = await get(`SELECT id, name, employee_code FROM users WHERE id = ?`, [requester_id]);
            await notificationService.notifyDCRDeleteRequested(cr, requester, reason || null);

            await auditService.recordEvent('ChangeRequest', cr_id, requester_id, 'DELETE_REQUESTED', {
                reason: reason || null,
                from_status: cr.status,
                to_status: 'Delete Requested'
            });

            return { status: 'Delete Requested' };
        } catch (error) {
            console.error('Error requesting delete change request:', error);
            throw error;
        }
    },

    async approveDeleteChangeRequest(cr_id, admin_id, reason = null) {
        try {
            await ensureChangeRequestSchemaCompatibility();
            const cr = await get(`SELECT * FROM ChangeRequest WHERE id = ?`, [cr_id]);

            if (!cr) {
                throw new Error('Change Request not found');
            }

            const previousStatus = cr.status;
            await run(
                `UPDATE ChangeRequest
                 SET status = 'Deleted',
                     delete_approved_at = CURRENT_TIMESTAMP,
                     delete_approved_by = ?,
                     delete_approved_comment = COALESCE(?, delete_approved_comment)
                 WHERE id = ?`,
                [admin_id, reason || null, cr_id]
            );

            const actor = await get(`SELECT id, name FROM users WHERE id = ?`, [admin_id]);
            const dcIds = await notificationService.getDocumentControllerUserIds();
            const notifyIds = new Set();
            if (cr.requester_id) notifyIds.add(Number(cr.requester_id));

            if (['Pending DC Review', 'Pending Final DC Release'].includes(previousStatus)) {
                dcIds.forEach((id) => notifyIds.add(Number(id)));
            } else if (['Pending Checker', 'Pending Approval'].includes(previousStatus)) {
                if (cr.checker_id) notifyIds.add(Number(cr.checker_id));
            } else if (previousStatus === 'Pending Approver') {
                if (cr.approver_id) notifyIds.add(Number(cr.approver_id));
            }

            await notificationService.notifyDCRDeleted(Array.from(notifyIds), cr, actor, reason || null, previousStatus);

            await auditService.recordEvent('ChangeRequest', cr_id, admin_id, 'DELETE_APPROVED', {
                reason: reason || null,
                from_status: previousStatus,
                to_status: 'Deleted'
            });

            return { status: 'Deleted' };
        } catch (error) {
            console.error('Error approving delete change request:', error);
            throw error;
        }
    },

    async makeWorkflowDecision(cr_id, actor_id, decision, comment = '') {
        try {
            await ensureChangeRequestSchemaCompatibility();
            await ensureDocumentRevisionSchemaCompatibility();
            const normalizedDecision = String(decision || '').trim();
            if (!['Approve', 'Reject'].includes(normalizedDecision)) {
                throw new Error('Invalid decision. Must be "Approve" or "Reject"');
            }

            const cr = await get(
                `SELECT cr.*, d.title as document_title, d.document_type, d.doc_number, d.department
                 FROM ChangeRequest cr
                 JOIN Document d ON cr.document_id = d.id
                 WHERE cr.id = ?`,
                [cr_id]
            );

            if (!cr) {
                throw new Error('Change Request not found');
            }

            const actorRole = normalizeRoleName(await getUserRoleNormalized(actor_id));
            const actor = await get(`SELECT id, name FROM users WHERE id = ?`, [actor_id]);
            const requester = await get(`SELECT id, name FROM users WHERE id = ?`, [cr.requester_id]);

            const isDcRole = ['DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER', 'ADMIN'].includes(actorRole);
            const isChecker = Number(cr.checker_id) === Number(actor_id);
            const isApprover = Number(cr.approver_id) === Number(actor_id);

            let nextStatus = cr.status;
            let message = 'Decision recorded';
            let action = 'WORKFLOW_DECISION';
            let step = 'General';
            let downloadLink = null;

            if (cr.status === 'Submitted') {
                if (!isDcRole) {
                    throw new Error('Only Document Control can review this request at this stage');
                }

                step = 'DC_INITIAL';
                if (normalizedDecision === 'Reject') {
                    nextStatus = 'Rejected';
                    action = 'REJECT_DC_INITIAL';
                    message = 'Change request rejected by Document Control';
                    await run(
                        `UPDATE ChangeRequest
                         SET status = 'Rejected', rejected_at = CURRENT_TIMESTAMP, returned_by_role = 'DOCUMENT_CONTROL', returned_comment = ?
                         WHERE id = ?`,
                        [comment || null, cr_id]
                    );
                    if (requester) {
                        await notificationService.notifyDCRRejectedByRole(cr.requester_id, cr, actor, 'Document Control', comment);
                    }
                } else {
                    nextStatus = 'DC Approved';
                    action = 'APPROVE_DC_INITIAL';
                    message = 'Change request approved by Document Control';
                    const latestRev = await get(
                        `SELECT * FROM DocumentRevision WHERE document_id = ? ORDER BY id DESC LIMIT 1`,
                        [cr.document_id]
                    );
                    if (latestRev && latestRev.original_uri) {
                        downloadLink = await signedUrlService.generateSignedUrl(
                            cr_id,
                            cr.document_id,
                            cr.requester_id,
                            latestRev.original_uri
                        );
                    }
                    await run(
                        `UPDATE ChangeRequest
                         SET status = 'DC Approved', dc_initial_at = CURRENT_TIMESTAMP, preapproved_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [cr_id]
                    );
                    if (requester) {
                        await notificationService.notifyDCRDcApproved(cr.requester_id, cr, downloadLink, actor);
                    }
                }
            } else if (cr.status === 'Pending Checker Approval' || cr.status === 'Pending Approval') {
                if (!isChecker && !isDcRole) {
                    throw new Error('Only selected checker can review this request at this stage');
                }

                step = 'CHECKER';
                if (normalizedDecision === 'Reject') {
                    nextStatus = 'Returned for Revision';
                    action = 'REJECT_CHECKER';
                    message = 'Change request returned by checker';
                    await run(
                        `UPDATE ChangeRequest
                         SET status = 'Returned for Revision', returned_at = CURRENT_TIMESTAMP, returned_by_role = 'CHECKER', returned_comment = ?
                         WHERE id = ?`,
                        [comment || null, cr_id]
                    );
                    if (requester) {
                        await notificationService.notifyDCRReturnedByRole(cr.requester_id, cr, actor, 'Checker', comment);
                    }
                } else {
                    nextStatus = 'Pending Approver Approval';
                    action = 'APPROVE_CHECKER';
                    message = 'Checker approved. Sent to approver.';
                    await run(
                        `UPDATE ChangeRequest
                         SET status = 'Pending Approver Approval', checker_approved_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [cr_id]
                    );
                    if (cr.approver_id) {
                        await notificationService.notifyDCRNeedsApproverDecision(cr.approver_id, cr, actor);
                    }
                }
            } else if (cr.status === 'Pending Approver Approval') {
                if (!isApprover && !isDcRole) {
                    throw new Error('Only assigned approver can review this request at this stage');
                }

                step = 'APPROVER';
                if (normalizedDecision === 'Reject') {
                    nextStatus = 'Returned for Revision';
                    action = 'REJECT_APPROVER';
                    message = 'Change request returned by approver';
                    await run(
                        `UPDATE ChangeRequest
                         SET status = 'Returned for Revision', returned_at = CURRENT_TIMESTAMP, returned_by_role = 'APPROVER', returned_comment = ?
                         WHERE id = ?`,
                        [comment || null, cr_id]
                    );
                    if (requester) {
                        await notificationService.notifyDCRReturnedByRole(cr.requester_id, cr, actor, 'Approver', comment);
                    }
                } else {
                    nextStatus = 'Pending DC Final Approval';
                    action = 'APPROVE_APPROVER';
                    message = 'Approver approved. Sent to Document Control for final release.';
                    await run(
                        `UPDATE ChangeRequest
                         SET status = 'Pending DC Final Approval', approver_approved_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [cr_id]
                    );
                    await notificationService.notifyDCRPendingDcFinal(cr, actor);
                }
            } else if (cr.status === 'Pending DC Final Approval') {
                if (!isDcRole) {
                    throw new Error('Only Document Control can complete final release');
                }

                step = 'DC_FINAL';
                if (normalizedDecision === 'Reject') {
                    nextStatus = 'Returned for Revision';
                    action = 'REJECT_DC_FINAL';
                    message = 'Final release rejected by Document Control';
                    await run(
                        `UPDATE ChangeRequest
                         SET status = 'Returned for Revision', returned_at = CURRENT_TIMESTAMP, returned_by_role = 'DOCUMENT_CONTROL', returned_comment = ?
                         WHERE id = ?`,
                        [comment || null, cr_id]
                    );
                    if (requester) {
                        await notificationService.notifyDCRReturnedByRole(cr.requester_id, cr, actor, 'Document Control', comment);
                    }
                } else {
                    if (!cr.latest_working_revision_id) {
                        throw new Error('No revision associated with this request');
                    }
                    const current = await get(`SELECT current_revision_id FROM Document WHERE id = ?`, [cr.document_id]);
                    const previousRevisionId = current?.current_revision_id || null;

                    await run(
                        `UPDATE DocumentRevision
                         SET status = 'Released', released_at = CURRENT_TIMESTAMP, released_by = ?
                         WHERE id = ?`,
                        [actor_id, cr.latest_working_revision_id]
                    );
                    await run(
                        `UPDATE Document
                         SET current_revision_id = ?
                         WHERE id = ?`,
                        [cr.latest_working_revision_id, cr.document_id]
                    );

                    if (previousRevisionId && Number(previousRevisionId) !== Number(cr.latest_working_revision_id)) {
                        await run(
                            `UPDATE DocumentRevision
                             SET status = 'Obsolete'
                             WHERE id = ?`,
                            [previousRevisionId]
                        );
                    }

                    nextStatus = 'Released';
                    action = 'APPROVE_DC_FINAL_RELEASE';
                    message = 'Document released successfully';
                    await run(
                        `UPDATE ChangeRequest
                         SET status = 'Released', final_approved_at = CURRENT_TIMESTAMP, dc_final_approved_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [cr_id]
                    );
                    if (requester) {
                        await notificationService.notifyDCRApproved(cr.requester_id, cr, actor);
                    }
                }
            } else {
                throw new Error(`Change Request is not in a reviewable state (${cr.status})`);
            }

            await insertApprovalRecord({
                cr_id,
                step,
                decision: normalizedDecision,
                decided_by: actor_id,
                decided_by_role: actorRole,
                comment
            });

            await auditService.recordEvent('ChangeRequest', cr_id, actor_id, action, {
                decision: normalizedDecision,
                comment,
                from_status: cr.status,
                to_status: nextStatus,
                step,
                download_link: downloadLink
            });

            return {
                message,
                status: nextStatus,
                downloadLink
            };
        } catch (error) {
            console.error('Error making workflow decision:', error);
            throw error;
        }
    },

    /**
     * Requester uploads revised documents (source + PDF)
     */
    async uploadRevision(cr_id, requester_id, files, checker_id) {
        try {
            await ensureChangeRequestSchemaCompatibility();
            await ensureDocumentRevisionSchemaCompatibility();
            // Validate CR state
            const cr = await get(
                `SELECT cr.*, d.title as document_title, d.document_type FROM ChangeRequest cr 
                 JOIN Document d ON cr.document_id = d.id 
                 WHERE cr.id = ? AND cr.requester_id = ? AND (cr.status = 'DC Approved' OR cr.status = 'Pre-Approved' OR cr.status = 'Returned for Revision')`,
                [cr_id, requester_id]
            );

            if (!cr) {
                throw new Error('Change Request not found or not in a state to accept uploads');
            }

            if (!files || !files.source || !files.pdf) {
                throw new Error('Both source file and PDF file are required');
            }

            if (!checker_id) {
                throw new Error('checker_id is required');
            }

            const checker = await get(
                `SELECT u.id, u.name,
                        UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) as role_name
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE u.id = ?` ,
                [checker_id]
            );

            if (!checker || !['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN'].includes(checker.role_name)) {
                throw new Error('Selected checker must be Assistant Manager or Manager');
            }

            const documentLevel = cr.document_level || detectDocumentLevel(cr);
            const approverRoleNeeded = (documentLevel === 'L1' || documentLevel === 'L2') ? ['PRESIDENT'] : ['MANAGER'];
            let autoApprover = await pickSingleUserByRole(approverRoleNeeded, cr.department || null);
            if (autoApprover && Number(autoApprover.id) === Number(checker_id)) {
                const alternatives = await getUsersByRoleNames(approverRoleNeeded, null);
                autoApprover = (alternatives || []).find((item) => Number(item.id) !== Number(checker_id)) || autoApprover;
            }

            const sourceFile = files.source[0];
            const pdfFile = files.pdf[0];

            // Generate unique file names with timestamp
            const timestamp = Date.now();
            const sourceFileName = `doc-${cr.document_id}-source-${timestamp}${path.extname(sourceFile.originalname)}`;
            const pdfFileName = `doc-${cr.document_id}-pdf-${timestamp}.pdf`;
            const categoryFolder = toCategoryFolder(cr.document_type);
            const sourceTargetDir = path.join(ORIGINAL_DIR, categoryFolder);
            const pdfTargetDir = path.join(PDF_DIR, categoryFolder);

            // Move files to permanent storage
            const original_uri = await moveToStorage(sourceFile, sourceTargetDir, sourceFileName);
            const pdf_uri = await moveToStorage(pdfFile, pdfTargetDir, pdfFileName);

            // Compute file hashes for integrity verification
            const original_sha256 = await computeFileHash(original_uri);
            const pdf_sha256 = await computeFileHash(pdf_uri);

            // Create new document revision
            const revResult = await run(`
                INSERT INTO DocumentRevision 
                (document_id, rev_code, status, original_uri, original_sha256, pdf_uri, pdf_sha256, change_summary, created_by)
                VALUES (?, ?, 'Pending Approval', ?, ?, ?, ?, ?, ?)
            `, [
                cr.document_id,
                `Rev${Date.now()}`,
                original_uri,
                original_sha256,
                pdf_uri,
                pdf_sha256,
                cr.reason || 'Updated document',
                requester_id
            ]);

            const newRevisionId = revResult.lastID;

            // Update CR to Pending Approval
            await run(
                `UPDATE ChangeRequest
                 SET status = 'Pending Checker Approval',
                     latest_working_revision_id = ?,
                     checker_id = ?,
                     approver_id = ?,
                     document_level = ?,
                     returned_by_role = NULL,
                     returned_comment = NULL
                 WHERE id = ?`,
                [newRevisionId, checker_id, autoApprover?.id || null, documentLevel, cr_id]
            );

            // Record in audit
            await auditService.recordEvent('ChangeRequest', cr_id, requester_id, 'UPLOAD_REVISION', {
                revision_id: newRevisionId,
                original_uri,
                original_hash: original_sha256,
                pdf_uri,
                pdf_hash: pdf_sha256,
                checker_id,
                approver_id: autoApprover?.id || null,
                document_level: documentLevel
            });

            const requester = await get(`SELECT id, name FROM users WHERE id = ?`, [requester_id]);

            if (checker) {
                await notificationService.notifyDCRNeedsCheckerDecision(checker.id, cr, requester);
            }

            return {
                message: 'Files uploaded successfully, pending checker approval',
                revision_id: newRevisionId,
                status: 'Pending Checker Approval',
                approver_id: autoApprover?.id || null,
                document_level: documentLevel
            };
        } catch (error) {
            console.error('Error uploading revision:', error);
            throw error;
        }
    },

    async makeInitialDecision(cr_id, manager_id, decision, comment = '') {
        return this.makeWorkflowDecision(cr_id, manager_id, decision, comment);
    },

    async makeFinalReview(cr_id, manager_id, decision, comment = '') {
        const normalized = decision === 'Return' ? 'Reject' : decision;
        return this.makeWorkflowDecision(cr_id, manager_id, normalized, comment);
    },

    /**
     * Get change request details with full information
     */
    async getChangeRequest(cr_id) {
        try {
            await ensureChangeRequestSchemaCompatibility();
            const drCols = await all(`PRAGMA table_info(DocumentRevision)`, []);
            const hasDrCol = (name) => drCols.some(c => c.name === name);
            const revisionCodeExpr = hasDrCol('rev_code')
                ? 'dr.rev_code'
                : (hasDrCol('revision_number') ? 'dr.revision_number' : 'NULL');
            const approvalCols = await all(`PRAGMA table_info(ApprovalRecord)`, []);
            const hasApprovalCol = (name) => approvalCols.some(c => c.name === name);
            const approvalCrCol = hasApprovalCol('cr_id') ? 'cr_id' : (hasApprovalCol('change_request_id') ? 'change_request_id' : null);
            const approvalSortCol = hasApprovalCol('decided_at')
                ? 'decided_at'
                : (hasApprovalCol('approved_at') ? 'approved_at' : (hasApprovalCol('created_at') ? 'created_at' : 'id'));

            const cr = await get(`
                SELECT cr.*, 
                      d.id as doc_id, d.doc_number, d.title as document_title, d.document_type as document_category, d.department as owning_department,
                       u1.name as requester_name, u2.name as manager_name,
                       u3.name as checker_name, u4.name as approver_name,
                       dr.id as revision_id, ${revisionCodeExpr} as rev_code, dr.status as revision_status
                FROM ChangeRequest cr
                LEFT JOIN Document d ON cr.document_id = d.id
                LEFT JOIN users u1 ON cr.requester_id = u1.id
                LEFT JOIN users u2 ON cr.manager_id = u2.id
                LEFT JOIN users u3 ON cr.checker_id = u3.id
                LEFT JOIN users u4 ON cr.approver_id = u4.id
                LEFT JOIN DocumentRevision dr ON cr.latest_working_revision_id = dr.id
                WHERE cr.id = ?
            `, [cr_id]);

            if (!cr) return null;

            // Get approval records
            const approvals = approvalCrCol
                ? await all(
                    `SELECT * FROM ApprovalRecord WHERE ${approvalCrCol} = ? ORDER BY ${approvalSortCol} DESC`,
                    [cr_id]
                )
                : [];

            // Get all revisions for this document
            const revisions = await all(`
                SELECT * FROM DocumentRevision WHERE document_id = ? ORDER BY id DESC
            `, [cr.document_id || cr.doc_id]);

            return {
                ...cr,
                approvals: approvals || [],
                revisions: revisions || []
            };
        } catch (error) {
            console.error('Error getting change request:', error);
            throw error;
        }
    },

    /**
     * Get all change requests for a user (as requester or manager)
     */
    async getUserChangeRequests(user_id, role) {
        try {
            await ensureChangeRequestSchemaCompatibility();
            const roleValue = String(role || '').toLowerCase();
            let sql = `
                                SELECT cr.*, d.title as document_title, d.title as title,
                                             d.doc_number as doc_no, d.doc_number,
                                             d.document_type as level, d.document_type as document_category,
                                             dr.revision_number as revision,
                                             u1.name as requester_name, u1.employee_code as requester_id,
                                             u2.name as manager_name, u2.employee_code as manager_employee_code,
                                             u3.name as checker_name, u3.employee_code as checker_employee_code,
                                             u4.name as approver_name, u4.employee_code as approver_id
                FROM ChangeRequest cr
                LEFT JOIN Document d ON cr.document_id = d.id
                                LEFT JOIN DocumentRevision dr
                                    ON dr.id = COALESCE(
                                        d.current_revision_id,
                                        (
                                            SELECT id
                                            FROM DocumentRevision r2
                                            WHERE r2.document_id = d.id
                                            ORDER BY r2.id DESC
                                            LIMIT 1
                                        )
                                    )
                LEFT JOIN users u1 ON cr.requester_id = u1.id
                LEFT JOIN users u2 ON cr.manager_id = u2.id
                LEFT JOIN users u3 ON cr.checker_id = u3.id
                LEFT JOIN users u4 ON cr.approver_id = u4.id
                WHERE 1=1
            `;

            const queryParams = [];

            if (roleValue === 'requester' || roleValue === 'change_requester') {
                sql += ` AND cr.requester_id = ?`;
                queryParams.push(user_id);
            } else if (roleValue === 'manager' || roleValue === 'mgr' || roleValue === 'qmr') {
                sql += ` AND cr.manager_id = ?`;
                queryParams.push(user_id);
            } else if (roleValue === 'checker') {
                sql += ` AND cr.checker_id = ?`;
                queryParams.push(user_id);
            } else if (roleValue === 'approver') {
                sql += ` AND cr.approver_id = ?`;
                queryParams.push(user_id);
            }

            sql += ` ORDER BY cr.submitted_at DESC, cr.created_at DESC`;

            const results = await all(sql, queryParams);
            if (!results || results.length === 0) {
                return [];
            }

            const crIds = results.map((item) => item.id);
            const placeholders = crIds.map(() => '?').join(',');
            const viewerRows = await all(
                `SELECT
                    ae.entity_id as cr_id,
                    ae.created_at,
                    u.employee_code,
                    u.name as viewer_name
                 FROM AuditEvent ae
                 LEFT JOIN users u ON u.id = ae.actor_id
                 WHERE ae.entity_type = 'ChangeRequest'
                   AND ae.action = 'VIEW'
                   AND ae.entity_id IN (${placeholders})
                 ORDER BY ae.created_at ASC`,
                crIds
            );

            const viewerMap = {};
            for (const row of viewerRows || []) {
                if (!viewerMap[row.cr_id]) {
                    viewerMap[row.cr_id] = {
                        codes: new Set(),
                        logs: []
                    };
                }
                if (row.employee_code) {
                    viewerMap[row.cr_id].codes.add(row.employee_code);
                }
                viewerMap[row.cr_id].logs.push({
                    login_id: row.employee_code || '-',
                    viewer_name: row.viewer_name || '-',
                    accessed_at: row.created_at
                });
            }

            return results.map((item) => {
                const viewers = viewerMap[item.id];
                return {
                    ...item,
                    viewer_login_ids: viewers ? Array.from(viewers.codes) : [],
                    viewer_access_logs: viewers ? viewers.logs : []
                };
            });
        } catch (error) {
            console.error('Error fetching user change requests:', error);
            throw error;
        }
    },

    /**
     * Get change request history (audit trail)
     */
    async getChangeRequestHistory(cr_id) {
        try {
            const approvalCols = await all(`PRAGMA table_info(ApprovalRecord)`, []);
            const hasApprovalCol = (name) => approvalCols.some(c => c.name === name);
            const approvalCrCol = hasApprovalCol('cr_id') ? 'cr_id' : (hasApprovalCol('change_request_id') ? 'change_request_id' : null);
            const approverIdCol = hasApprovalCol('decided_by') ? 'decided_by' : (hasApprovalCol('approver_id') ? 'approver_id' : null);
            const stepCol = hasApprovalCol('step') ? 'step' : (hasApprovalCol('gate') ? 'gate' : null);
            const commentCol = hasApprovalCol('comment') ? 'comment' : (hasApprovalCol('comments') ? 'comments' : null);
            const decidedAtCol = hasApprovalCol('decided_at') ? 'decided_at' : (hasApprovalCol('approved_at') ? 'approved_at' : (hasApprovalCol('created_at') ? 'created_at' : null));

            const approvals = await all(`
                SELECT id,
                       ${stepCol ? stepCol : 'NULL'} as step,
                       decision,
                       ${approverIdCol ? approverIdCol : 'NULL'} as decided_by,
                       ${approverIdCol ? `(SELECT name FROM users WHERE id = ApprovalRecord.${approverIdCol})` : 'NULL'} as decided_by_name,
                       ${decidedAtCol ? decidedAtCol : 'NULL'} as decided_at,
                       ${commentCol ? commentCol : 'NULL'} as comment
                FROM ApprovalRecord 
                WHERE ${approvalCrCol ? approvalCrCol : '1=0'} = ? 
                ORDER BY ${decidedAtCol ? decidedAtCol : 'id'} DESC
            `, [cr_id]);

            const events = await all(`
                SELECT ae.id, ae.action, ae.created_at,
                       (SELECT name FROM users WHERE id = ae.actor_id) as actor_name,
                       ae.metadata
                FROM AuditEvent ae
                WHERE ae.entity_type = 'ChangeRequest' AND ae.entity_id = ?
                ORDER BY ae.created_at DESC
            `, [cr_id]);

            return {
                approvals: approvals || [],
                events: events || []
            };
        } catch (error) {
            console.error('Error fetching change request history:', error);
            throw error;
        }
    }
};

module.exports = dcrService;
