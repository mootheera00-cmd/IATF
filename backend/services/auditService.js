// backend/services/auditService.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbPath);

// Promisify db operations
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

let auditSchemaReady = false;

async function ensureAuditSchemaCompatibility() {
    if (auditSchemaReady) return;

    const cols = await all(`PRAGMA table_info(AuditEvent)`, []);
    const has = (name) => cols.some(c => c.name === name);

    if (!has('actor_id')) {
        await run(`ALTER TABLE AuditEvent ADD COLUMN actor_id BIGINT`, []);
    }
    if (!has('action')) {
        await run(`ALTER TABLE AuditEvent ADD COLUMN action TEXT`, []);
    }
    if (!has('metadata')) {
        await run(`ALTER TABLE AuditEvent ADD COLUMN metadata TEXT`, []);
    }
    if (!has('created_at')) {
        await run(`ALTER TABLE AuditEvent ADD COLUMN created_at TIMESTAMP`, []);
    }

    if (has('user_id')) {
        await run(`UPDATE AuditEvent SET actor_id = COALESCE(actor_id, user_id) WHERE user_id IS NOT NULL`, []);
    }
    if (has('event_type')) {
        await run(`UPDATE AuditEvent SET action = COALESCE(action, event_type) WHERE event_type IS NOT NULL`, []);
    }
    if (has('timestamp')) {
        await run(`UPDATE AuditEvent SET created_at = COALESCE(created_at, timestamp) WHERE timestamp IS NOT NULL`, []);
    }

    auditSchemaReady = true;
}

const auditService = {
    /**
     * Record an audit event for IATF 16949 compliance
     */
    async recordEvent(entity_type, entity_id, actor_id, action, metadata = {}) {
        try {
            await ensureAuditSchemaCompatibility();
            const sql = `
                INSERT INTO AuditEvent (entity_type, entity_id, actor_id, action, metadata, created_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;
            const result = await run(sql, [entity_type, entity_id, actor_id, action, JSON.stringify(metadata)]);
            console.log(`✓ Audit event recorded: ${entity_type} ${entity_id} - ${action} by user ${actor_id}`);
            return result.lastID;
        } catch (error) {
            console.error('Error recording audit event:', error.message);
            throw error;
        }
    },

    /**
     * Get audit trail for a specific entity
     */
    async getEventLog(entity_type, entity_id) {
        try {
            await ensureAuditSchemaCompatibility();
            const events = await all(`
                SELECT ae.id, ae.entity_type, ae.entity_id, ae.actor_id, ae.action, ae.metadata, ae.created_at,
                       u.name as actor_name
                FROM AuditEvent ae
                LEFT JOIN users u ON ae.actor_id = u.id
                WHERE ae.entity_type = ? AND ae.entity_id = ?
                ORDER BY ae.created_at DESC
            `, [entity_type, entity_id]);

            return events || [];
        } catch (error) {
            console.error('Error fetching audit trail:', error.message);
            return [];
        }
    },

    /**
     * Get all events for a user (for compliance reporting)
     */
    async getEventsByUser(user_id, start_date, end_date) {
        try {
            await ensureAuditSchemaCompatibility();
            let sql = `
                SELECT ae.id, ae.entity_type, ae.entity_id, ae.actor_id, ae.action, ae.metadata, ae.created_at,
                       u.name as actor_name
                FROM AuditEvent ae
                LEFT JOIN users u ON ae.actor_id = u.id
                WHERE ae.actor_id = ?
            `;
            const params = [user_id];

            if (start_date) {
                sql += ` AND ae.created_at >= ?`;
                params.push(start_date);
            }

            if (end_date) {
                sql += ` AND ae.created_at <= ?`;
                params.push(end_date);
            }

            sql += ` ORDER BY ae.created_at DESC`;

            const events = await all(sql, params);
            return events || [];
        } catch (error) {
            console.error('Error fetching user events:', error.message);
            return [];
        }
    },

    /**
     * Generate audit report for IATF compliance
     */
    async getComplianceReport(start_date, end_date) {
        try {
            await ensureAuditSchemaCompatibility();
            const crEvents = await all(`
                SELECT ae.*, u.name as actor_name, cr.status, d.title as document_title
                FROM AuditEvent ae
                LEFT JOIN users u ON ae.actor_id = u.id
                LEFT JOIN ChangeRequest cr ON ae.entity_type = 'ChangeRequest' AND ae.entity_id = cr.id
                LEFT JOIN Document d ON cr.document_id = d.id
                WHERE ae.entity_type = 'ChangeRequest'
                  AND ae.created_at >= ? 
                  AND ae.created_at <= ?
                ORDER BY ae.created_at DESC
            `, [start_date, end_date]);

            const approvalRecords = await all(`
                SELECT ar.*, u.name as decided_by_name
                FROM ApprovalRecord ar
                LEFT JOIN users u ON ar.decided_by = u.id
                WHERE ar.decided_at >= ? 
                  AND ar.decided_at <= ?
                ORDER BY ar.decided_at DESC
            `, [start_date, end_date]);

            return {
                period: {
                    start_date,
                    end_date
                },
                change_request_events: crEvents || [],
                approval_records: approvalRecords || [],
                summary: {
                    total_events: (crEvents || []).length,
                    total_approvals: (approvalRecords || []).length
                }
            };
        } catch (error) {
            console.error('Error generating compliance report:', error.message);
            throw error;
        }
    }
};

module.exports = auditService;