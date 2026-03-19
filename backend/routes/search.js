const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

function parseMetadata(raw) {
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch (_) {
        return {};
    }
}

function enrichDocumentRows(db, rows, res) {
    const baseResult = (rows || []).map(row => {
        let file_size = null;
        if (row.file_path_pdf) {
            const absPath = path.resolve(__dirname, '..', 'uploads', row.file_path_pdf);
            if (fs.existsSync(absPath)) {
                file_size = fs.statSync(absPath).size;
            }
        }
        return {
            ...row,
            file_size
        };
    });

    if (!baseResult.length) {
        return res.json(baseResult);
    }

    const docIds = baseResult.map(d => d.id).filter(Boolean);
    if (!docIds.length) {
        return res.json(baseResult);
    }

    const placeholders = docIds.map(() => '?').join(',');
    const viewerSql = `
        SELECT
            ae.entity_id AS doc_id,
                        ae.actor_id,
                        ae.action,
                        ae.metadata,
            ae.created_at,
            u.employee_code AS login_id,
            u.name AS viewer_name
        FROM AuditEvent ae
        LEFT JOIN users u ON u.id = ae.actor_id
        WHERE ae.entity_type = 'Document'
                    AND ae.action IN ('ENTER', 'OUT', 'VIEW')
          AND ae.entity_id IN (${placeholders})
        ORDER BY ae.created_at ASC
    `;

    db.all(viewerSql, docIds, (viewerErr, viewerRows) => {
        if (viewerErr) {
            console.error('Search documents viewer lookup error:', viewerErr);
            return res.json(baseResult);
        }

        const viewerMap = {};
        for (const row of viewerRows || []) {
            if (!viewerMap[row.doc_id]) {
                viewerMap[row.doc_id] = {
                    codes: new Set(),
                    logs: [],
                    openBySession: {},
                    openByUser: {}
                };
            }

            const metadata = parseMetadata(row.metadata);
            const userKey = String(row.actor_id || row.login_id || 'unknown');
            const sessionKey = metadata.session_id ? `${userKey}:${metadata.session_id}` : null;

            if (row.login_id) {
                viewerMap[row.doc_id].codes.add(row.login_id);
            }

            if (row.action === 'ENTER' || row.action === 'VIEW') {
                const entry = {
                    login_id: row.login_id || '-',
                    viewer_name: row.viewer_name || '-',
                    accessed_at: row.created_at,
                    out_at: null
                };
                viewerMap[row.doc_id].logs.push(entry);

                if (!viewerMap[row.doc_id].openByUser[userKey]) {
                    viewerMap[row.doc_id].openByUser[userKey] = [];
                }
                viewerMap[row.doc_id].openByUser[userKey].push(entry);

                if (sessionKey) {
                    viewerMap[row.doc_id].openBySession[sessionKey] = entry;
                }
            } else if (row.action === 'OUT') {
                let matchedEntry = null;

                if (sessionKey && viewerMap[row.doc_id].openBySession[sessionKey]) {
                    matchedEntry = viewerMap[row.doc_id].openBySession[sessionKey];
                } else {
                    const userEntries = viewerMap[row.doc_id].openByUser[userKey] || [];
                    for (let i = userEntries.length - 1; i >= 0; i -= 1) {
                        if (!userEntries[i].out_at) {
                            matchedEntry = userEntries[i];
                            break;
                        }
                    }
                }

                if (matchedEntry) {
                    matchedEntry.out_at = row.created_at;
                } else {
                    viewerMap[row.doc_id].logs.push({
                        login_id: row.login_id || '-',
                        viewer_name: row.viewer_name || '-',
                        accessed_at: null,
                        out_at: row.created_at
                    });
                }
            }
        }

        const enriched = baseResult.map(doc => {
            const viewers = viewerMap[doc.id];
            return {
                ...doc,
                viewer_login_ids: viewers ? Array.from(viewers.codes) : [],
                viewer_access_logs: viewers ? viewers.logs : []
            };
        });

        return res.json(enriched);
    });
}

router.get('/procedure', authRequired, (req, res) => {
    const db = req.db;

    const sql = `
        SELECT
            d.id,
            d.doc_number AS doc_no,
            d.title,
            d.document_type AS level,
            dr.revision_number AS revision,
            dr.status,
            dr.created_at AS approved_date,
            dr.file_path_pdf,
            dr.released_by_id
        FROM Document d
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
        WHERE d.is_active = 1
          AND LOWER(TRIM(COALESCE(d.document_type, ''))) IN (
              'procedure',
              'procedures',
              'qp',
              'qp - procedure',
              'level 2 - procedures'
          )
        ORDER BY COALESCE(dr.created_at, d.created_at) DESC
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Procedure filter error:', err);
            return res.status(500).json({ message: 'Error loading Procedure documents' });
        }
        return enrichDocumentRows(db, rows, res);
    });
});

router.get('/kpi/latest', authRequired, (req, res) => {
    const db = req.db;

    const sql = `
        SELECT
            d.id,
            d.doc_number AS doc_no,
            d.title,
            d.document_type AS level,
            dr.revision_number AS revision,
            dr.status,
            dr.created_at AS approved_date,
            dr.file_path_pdf,
            dr.released_by_id
        FROM Document d
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
        WHERE d.is_active = 1
          AND (
              UPPER(TRIM(COALESCE(d.doc_number, ''))) = 'KPI-01-001'
              OR UPPER(TRIM(COALESCE(d.title, ''))) = 'KPI KPI-01-001'
          )
        ORDER BY COALESCE(dr.created_at, d.created_at) DESC
        LIMIT 1
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('KPI filter error:', err);
            return res.status(500).json({ message: 'Error loading KPI document' });
        }
        return enrichDocumentRows(db, rows, res);
    });
});

// Master List: all docs with all their revision dates (up to 7 revisions)
router.get('/master-list', authRequired, (req, res) => {
    const db = req.db;

    const docSql = `
        SELECT
            d.id,
            d.doc_number AS doc_no,
            d.title,
            d.document_type AS level,
            d.sub_category,
            dr.revision_number AS revision,
            dr.status,
            dr.created_at AS approved_date
        FROM Document d
        LEFT JOIN DocumentRevision dr
            ON dr.id = COALESCE(
                d.current_revision_id,
                (SELECT id FROM DocumentRevision r2 WHERE r2.document_id = d.id ORDER BY r2.id DESC LIMIT 1)
            )
        WHERE d.is_active = 1
        ORDER BY d.doc_number ASC
    `;

    const revSql = `
        SELECT
            r.document_id,
            r.revision_number,
            r.created_at AS effective_date,
            r.status
        FROM DocumentRevision r
        INNER JOIN Document d ON d.id = r.document_id
        WHERE d.is_active = 1
        ORDER BY r.document_id ASC, r.id ASC
    `;

    db.all(docSql, [], (err, docs) => {
        if (err) return res.status(500).json({ message: 'Error loading master list documents' });

        db.all(revSql, [], (err2, revs) => {
            if (err2) return res.status(500).json({ message: 'Error loading master list revisions' });

            const revMap = {};
            for (const r of (revs || [])) {
                if (!revMap[r.document_id]) revMap[r.document_id] = [];
                revMap[r.document_id].push({
                    revision_number: r.revision_number,
                    effective_date: r.effective_date,
                    status: r.status,
                });
            }

            const result = (docs || []).map((doc, idx) => ({
                no: idx + 1,
                id: doc.id,
                doc_no: doc.doc_no,
                title: doc.title,
                level: doc.level,
                sub_category: doc.sub_category,
                revision: doc.revision,
                status: doc.status,
                revisions: revMap[doc.id] || [],
            }));

            res.json(result);
        });
    });
});

// Search documents
router.get('/', authRequired, (req, res) => {
    const db = req.db;
    const { doc_no, title, level, status, owner_id } = req.query;

    let sql = `
        SELECT
            d.id,
            d.doc_number AS doc_no,
            d.title,
            d.document_type AS level,
            dr.revision_number AS revision,
            dr.status,
            dr.created_at AS approved_date,
            dr.file_path_pdf,
            dr.released_by_id
        FROM Document d
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
        WHERE d.is_active = 1
    `;
    const params = [];

    if (doc_no) { sql += " AND d.doc_number LIKE ?"; params.push(`%${doc_no}%`); }
    if (title) { sql += " AND title LIKE ?"; params.push(`%${title}%`); }
    if (level) { sql += " AND d.document_type = ?"; params.push(level); }
    if (status) { sql += " AND dr.status = ?"; params.push(status); }
    if (owner_id) { sql += " AND dr.released_by_id = ?"; params.push(owner_id); }

    sql += " ORDER BY d.id DESC";

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Search documents error:', err);
            return res.status(500).json({ message: "Error searching documents" });
        }
        return enrichDocumentRows(db, rows, res);
    });
});

module.exports = router;
