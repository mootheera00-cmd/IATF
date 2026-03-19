// routes/training.ts
const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

// ─── Role constants ───────────────────────────────────────────────────────────
// Editor  : Assistant Manager and above
// Checker : Manager and above
// Approver: President only (+ Admin as super-user)
const EDITOR_ROLES        = ['ASSISTANT_MANAGER','MANAGER','PRESIDENT','ADMIN','DOCUMENT_CONTROLLER'];
const CHECKER_ROLES       = ['MANAGER','PRESIDENT','ADMIN'];
const APPROVER_ROLES      = ['PRESIDENT','ADMIN'];
const EDIT_REVIEWER_ROLES = ['ADMIN','DOCUMENT_CONTROLLER'];

function normalizeRole(r: any): string {
  return String(r||'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}

// Fetch user IDs that hold any of the given normalised role names
function getUserIdsByRoles(db: any, roleNames: string[], cb: (ids: number[]) => void) {
  const ph = roleNames.map(() => '?').join(',');
  db.all(
    `SELECT u.id FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     WHERE COALESCE(u.is_active, 1) = 1
       AND UPPER(REPLACE(TRIM(COALESCE(r.name, '')), ' ', '_')) IN (${ph})`,
    roleNames,
    (_: any, rows: any[]) => cb((rows || []).map((r: any) => r.id).filter(Boolean))
  );
}

function addPlanLog(db: any, year: number, action: string, actor: any, detail?: string) {
  db.run(
    `INSERT INTO TrainingPlanLog (year,action,actor_id,actor_name,detail) VALUES (?,?,?,?,?)`,
    [year, action, actor?.id||null, actor?.name||null, detail||null]
  );
}

function getOrInitApproval(db: any, year: number, cb: (row: any) => void) {
  db.get(`SELECT * FROM TrainingPlanApproval WHERE year=?`, [year], (_: any, row: any) => {
    if (row) return cb(row);
    db.run(`INSERT OR IGNORE INTO TrainingPlanApproval (year, status) VALUES (?, 'draft')`,
      [year], () => {
        db.get(`SELECT * FROM TrainingPlanApproval WHERE year=?`, [year], (_2: any, r: any) =>
          cb(r || { year, status: 'draft' })
        );
      });
  });
}

// ─── helpers ────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function ensureTable(db: any, cb: (err?: any) => void) {
  db.run(
    `CREATE TABLE IF NOT EXISTS TrainingRecord (
       id             INTEGER PRIMARY KEY AUTOINCREMENT,
       employee_id    INTEGER NOT NULL,
       training_title TEXT NOT NULL,
       training_type  TEXT DEFAULT 'General',
       training_date  TEXT NOT NULL,
       due_date       TEXT,
       trainer        TEXT,
       notes          TEXT,
       status         TEXT DEFAULT 'Pending',
       created_by     INTEGER,
       created_at     TEXT DEFAULT (datetime('now')),
       updated_at     TEXT DEFAULT (datetime('now')),
       FOREIGN KEY (employee_id) REFERENCES users(id),
       FOREIGN KEY (created_by)  REFERENCES users(id)
     )`,
    cb
  );
}

function ensurePlanTables(db: any, cb: () => void) {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS TrainingProgram (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      sort_order      INTEGER DEFAULT 0,
      training_name   TEXT NOT NULL,
      level_1         INTEGER DEFAULT 0,
      level_2         INTEGER DEFAULT 0,
      level_3         INTEGER DEFAULT 0,
      level_4         INTEGER DEFAULT 0,
      method_code     TEXT,
      method_name     TEXT,
      duration_hours  REAL,
      budget_plan     REAL,
      budget_actual   REAL,
      trainer_type    TEXT,
      remark          TEXT,
      year            INTEGER NOT NULL DEFAULT (strftime('%Y', 'now')),
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS TrainingSchedule (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id      INTEGER NOT NULL,
      year            INTEGER NOT NULL,
      month           TEXT NOT NULL,
      plan            INTEGER DEFAULT 0,
      actual          INTEGER DEFAULT 0,
      FOREIGN KEY (program_id) REFERENCES TrainingProgram(id) ON DELETE CASCADE
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS TrainingPlanApproval (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      year            INTEGER NOT NULL UNIQUE,
      status          TEXT DEFAULT 'draft',
      submitted_by    INTEGER,
      submitted_at    TEXT,
      checked_by      INTEGER,
      checked_at      TEXT,
      check_comment   TEXT,
      approved_by     INTEGER,
      approved_at     TEXT,
      approve_comment TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS TrainingPlanEditRequest (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      year           INTEGER NOT NULL,
      requested_by   INTEGER NOT NULL,
      reason         TEXT,
      status         TEXT DEFAULT 'pending',
      reviewed_by    INTEGER,
      reviewed_at    TEXT,
      review_comment TEXT,
      created_at     TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS TrainingPlanLog (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      year       INTEGER NOT NULL,
      action     TEXT NOT NULL,
      actor_id   INTEGER,
      actor_name TEXT,
      detail     TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`, cb);
  });
}

// ─── Approval routes ─────────────────────────────────────────────────────────

// GET /training/plan/approval/:year — get approval status + edit requests
router.get('/plan/approval/:year', authRequired, (req: any, res: any) => {
  const db = req.db;
  const year = parseInt(req.params.year, 10);
  ensurePlanTables(db, () => {
    getOrInitApproval(db, year, (approval) => {
      db.all(
        `SELECT er.*, u.name AS requester_name, rv.name AS reviewer_name
         FROM TrainingPlanEditRequest er
         LEFT JOIN users u  ON er.requested_by = u.id
         LEFT JOIN users rv ON er.reviewed_by  = rv.id
         WHERE er.year = ? ORDER BY er.created_at DESC`,
        [year],
        (err: any, reqs: any[]) => {
          res.json({ approval, editRequests: reqs || [] });
        }
      );
    });
  });
});

// GET /training/plan/approval-log/:year — audit log
router.get('/plan/approval-log/:year', authRequired, (req: any, res: any) => {
  const db = req.db;
  const year = parseInt(req.params.year, 10);
  ensurePlanTables(db, () => {
    db.all(`SELECT * FROM TrainingPlanLog WHERE year=? ORDER BY created_at DESC`, [year],
      (err: any, logs: any[]) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ logs: logs || [] });
      }
    );
  });
});

// POST /training/plan/approval/:year/submit — editor submits plan for check
router.post('/plan/approval/:year/submit', authRequired, (req: any, res: any) => {
  const db = req.db;
  const actor = req.user;
  const year  = parseInt(req.params.year, 10);
  if (!EDITOR_ROLES.includes(normalizeRole(actor?.role)))
    return res.status(403).json({ error: 'Assistant Manager or above required' });
  const { comment } = req.body;
  ensurePlanTables(db, () => {
    getOrInitApproval(db, year, (approval) => {
      if (!['draft','edit_unlocked','rejected'].includes(approval.status))
        return res.status(400).json({ error: `Cannot submit from status: ${approval.status}` });
      db.run(
        `UPDATE TrainingPlanApproval SET status='pending_check',submitted_by=?,submitted_at=datetime('now'),updated_at=datetime('now') WHERE year=?`,
        [actor?.id, year], (err: any) => {
          if (err) return res.status(500).json({ error: err.message });
          addPlanLog(db, year, 'submit_for_check', actor, comment || 'Submitted for review');
          res.json({ ok: true, status: 'pending_check' });
          // Notify all Managers (checkers) — fire and forget
          getUserIdsByRoles(db, CHECKER_ROLES, (ids) => {
            const targets = ids.filter((id) => id !== actor?.id);
            notificationService.notifyUsers(
              targets,
              'TRAINING_PLAN_SUBMITTED',
              `Training Plan ${year} was submitted for check by ${actor?.name || 'Someone'}. Your review is required.`,
              { year, action: 'check_required' }
            ).catch(() => {});
          });
        }
      );
    });
  });
});

// POST /training/plan/approval/:year/check — manager checks (approve → pending_approval, reject → rejected)
router.post('/plan/approval/:year/check', authRequired, (req: any, res: any) => {
  const db = req.db;
  const actor = req.user;
  const year  = parseInt(req.params.year, 10);
  if (!CHECKER_ROLES.includes(normalizeRole(actor?.role)))
    return res.status(403).json({ error: 'Manager or above required to check' });
  const { action, comment } = req.body; // action: 'approve' | 'reject'
  ensurePlanTables(db, () => {
    getOrInitApproval(db, year, (approval) => {
      if (approval.status !== 'pending_check')
        return res.status(400).json({ error: `Cannot check from status: ${approval.status}` });
      const newStatus = action === 'approve' ? 'pending_approval' : 'rejected';
      db.run(
        `UPDATE TrainingPlanApproval SET status=?,checked_by=?,checked_at=datetime('now'),check_comment=?,updated_at=datetime('now') WHERE year=?`,
        [newStatus, actor?.id, comment||null, year], (err: any) => {
          if (err) return res.status(500).json({ error: err.message });
          addPlanLog(db, year, `check_${action}`, actor, comment || `Check: ${action}`);
          res.json({ ok: true, status: newStatus });
          // Notifications — fire and forget
          if (action === 'approve') {
            // Notify submitter that plan passed check and awaits president approval
            if (approval.submitted_by) {
              notificationService.createNotification(
                approval.submitted_by,
                'TRAINING_PLAN_CHECKED',
                `Training Plan ${year} passed check by ${actor?.name || 'Manager'} and is now awaiting president approval.`,
                { year, action: 'pending_approval' }
              ).catch(() => {});
            }
            // Notify President approvers
            getUserIdsByRoles(db, APPROVER_ROLES, (ids) => {
              const targets = ids.filter((id) => id !== actor?.id);
              notificationService.notifyUsers(
                targets,
                'TRAINING_PLAN_NEEDS_APPROVAL',
                `Training Plan ${year} has passed manager check by ${actor?.name || 'Manager'} and requires your approval.`,
                { year, action: 'approval_required' }
              ).catch(() => {});
            });
          } else {
            // Notify submitter of rejection
            if (approval.submitted_by) {
              notificationService.createNotification(
                approval.submitted_by,
                'TRAINING_PLAN_REJECTED',
                `Training Plan ${year} was rejected at check stage by ${actor?.name || 'Manager'}. Comment: ${comment || 'No comment'}`,
                { year, action: 'resubmit_required', comment }
              ).catch(() => {});
            }
          }
        }
      );
    });
  });
});

// POST /training/plan/approval/:year/approve — president final approve
router.post('/plan/approval/:year/approve', authRequired, (req: any, res: any) => {
  const db = req.db;
  const actor = req.user;
  const year  = parseInt(req.params.year, 10);
  if (!APPROVER_ROLES.includes(normalizeRole(actor?.role)))
    return res.status(403).json({ error: 'President approval required' });
  const { action, comment } = req.body; // action: 'approve' | 'reject'
  ensurePlanTables(db, () => {
    getOrInitApproval(db, year, (approval) => {
      if (approval.status !== 'pending_approval')
        return res.status(400).json({ error: `Cannot approve from status: ${approval.status}` });
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      db.run(
        `UPDATE TrainingPlanApproval SET status=?,approved_by=?,approved_at=datetime('now'),approve_comment=?,updated_at=datetime('now') WHERE year=?`,
        [newStatus, actor?.id, comment||null, year], (err: any) => {
          if (err) return res.status(500).json({ error: err.message });
          addPlanLog(db, year, `final_${action}`, actor, comment || `Final approval: ${action}`);
          res.json({ ok: true, status: newStatus });
          // Notifications — fire and forget
          const notifyIds: number[] = [];
          if (approval.submitted_by) notifyIds.push(approval.submitted_by);
          if (approval.checked_by)   notifyIds.push(approval.checked_by);
          const uniqueTargets = Array.from(new Set(notifyIds)).filter((id) => id !== actor?.id);
          if (action === 'approve') {
            notificationService.notifyUsers(
              uniqueTargets,
              'TRAINING_PLAN_APPROVED',
              `Training Plan ${year} has been approved by ${actor?.name || 'President'} and is now locked.`,
              { year, action: 'approved' }
            ).catch(() => {});
          } else {
            notificationService.notifyUsers(
              uniqueTargets,
              'TRAINING_PLAN_REJECTED',
              `Training Plan ${year} was rejected by ${actor?.name || 'President'}. Comment: ${comment || 'No comment'}`,
              { year, action: 'resubmit_required', comment }
            ).catch(() => {});
          }
        }
      );
    });
  });
});

// POST /training/plan/edit-request — editor requests unlock of approved plan
router.post('/plan/edit-request', authRequired, (req: any, res: any) => {
  const db = req.db;
  const actor = req.user;
  if (!EDITOR_ROLES.includes(normalizeRole(actor?.role)))
    return res.status(403).json({ error: 'Editor role required' });
  const { year, reason } = req.body;
  if (!year || !reason) return res.status(400).json({ error: 'year and reason required' });
  const yr = parseInt(year, 10);
  ensurePlanTables(db, () => {
    getOrInitApproval(db, yr, (approval) => {
      if (approval.status !== 'approved')
        return res.status(400).json({ error: 'Plan must be in approved state to request an edit' });
      db.get(`SELECT id FROM TrainingPlanEditRequest WHERE year=? AND status='pending'`, [yr],
        (err: any, existing: any) => {
          if (existing) return res.status(400).json({ error: 'An edit request is already pending' });
          db.run(
            `INSERT INTO TrainingPlanEditRequest (year, requested_by, reason, status) VALUES (?,?,?,?)`,
            [yr, actor?.id, reason, 'pending'],
            function (this: any, err2: any) {
              if (err2) return res.status(500).json({ error: err2.message });
              addPlanLog(db, yr, 'edit_request', actor, reason);
              res.json({ ok: true, id: this.lastID });
              // Notify Admin + DC — fire and forget
              getUserIdsByRoles(db, EDIT_REVIEWER_ROLES, (ids) => {
                const targets = ids.filter((id) => id !== actor?.id);
                notificationService.notifyUsers(
                  targets,
                  'TRAINING_PLAN_EDIT_REQUESTED',
                  `${actor?.name || 'Someone'} requested an edit unlock for Training Plan ${yr}. Reason: ${reason}`,
                  { year: yr, action: 'edit_review_required' }
                ).catch(() => {});
              });
            }
          );
        }
      );
    });
  });
});

// POST /training/plan/edit-request/:id/review — admin/DC reviews edit request
router.post('/plan/edit-request/:id/review', authRequired, (req: any, res: any) => {
  const db = req.db;
  const actor  = req.user;
  const reqId  = parseInt(req.params.id, 10);
  if (!EDIT_REVIEWER_ROLES.includes(normalizeRole(actor?.role)))
    return res.status(403).json({ error: 'Admin or Document Controller required' });
  const { action, comment } = req.body; // action: 'approve' | 'reject'
  ensurePlanTables(db, () => {
    db.get(`SELECT * FROM TrainingPlanEditRequest WHERE id=?`, [reqId], (err: any, request: any) => {
      if (!request) return res.status(404).json({ error: 'Edit request not found' });
      if (request.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });
      const newReqStatus = action === 'approve' ? 'approved' : 'rejected';
      db.run(
        `UPDATE TrainingPlanEditRequest SET status=?,reviewed_by=?,reviewed_at=datetime('now'),review_comment=? WHERE id=?`,
        [newReqStatus, actor?.id, comment||null, reqId],
        (err2: any) => {
          if (err2) return res.status(500).json({ error: err2.message });
          if (action === 'approve') {
            db.run(`UPDATE TrainingPlanApproval SET status='edit_unlocked',updated_at=datetime('now') WHERE year=?`,
              [request.year], () => {
                addPlanLog(db, request.year, 'edit_request_approved', actor, comment || 'Edit request approved — plan unlocked');
                res.json({ ok: true, status: 'edit_unlocked' });
                // Notify requester — fire and forget
                notificationService.createNotification(
                  request.requested_by,
                  'TRAINING_PLAN_EDIT_APPROVED',
                  `Your edit request for Training Plan ${request.year} was approved by ${actor?.name || 'Admin'}. The plan is now unlocked for editing.`,
                  { year: request.year, action: 'edit_unlocked' }
                ).catch(() => {});
              }
            );
          } else {
            addPlanLog(db, request.year, 'edit_request_rejected', actor, comment || 'Edit request rejected');
            res.json({ ok: true, status: 'rejected' });
            // Notify requester — fire and forget
            notificationService.createNotification(
              request.requested_by,
              'TRAINING_PLAN_EDIT_REJECTED',
              `Your edit request for Training Plan ${request.year} was rejected by ${actor?.name || 'Admin'}. Comment: ${comment || 'No comment'}`,
              { year: request.year, action: 'edit_rejected', comment }
            ).catch(() => {});
          }
        }
      );
    });
  });
});

// ─── Plan routes ─────────────────────────────────────────────────────────────

// GET /training/plan?year=2026
router.get('/plan', authRequired, (req: any, res: any) => {
  const db = req.db;
  const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();
  ensurePlanTables(db, () => {
    getOrInitApproval(db, year, (approval) => {
      db.all(
        `SELECT * FROM TrainingProgram WHERE year = ? ORDER BY sort_order, id`,
        [year],
        (err: any, programs: any[]) => {
          if (err) return res.status(500).json({ error: err.message });
          if (!programs.length) return res.json({ programs: [], schedules: [], approval });
          const ids = programs.map((p: any) => p.id);
          db.all(
            `SELECT * FROM TrainingSchedule WHERE program_id IN (${ids.map(() => '?').join(',')}) AND year = ?`,
            [...ids, year],
            (err2: any, schedules: any[]) => {
              if (err2) return res.status(500).json({ error: err2.message });
              res.json({ programs, schedules: schedules || [], approval });
            }
          );
        }
      );
    });
  });
});

// GET /training/plan/years
router.get('/plan/years', authRequired, (req: any, res: any) => {
  const db = req.db;
  ensurePlanTables(db, () => {
    db.all(`SELECT DISTINCT year FROM TrainingProgram ORDER BY year DESC`, [], (err: any, rows: any[]) => {
      if (err) return res.status(500).json({ error: err.message });
      const years = rows.map((r: any) => r.year);
      const cur = new Date().getFullYear();
      if (!years.includes(cur)) years.unshift(cur);
      res.json({ years });
    });
  });
});

// POST /training/plan — create program + schedule rows
router.post('/plan', authRequired, (req: any, res: any) => {
  const db    = req.db;
  const actor = req.user;
  if (!EDITOR_ROLES.includes(normalizeRole(actor?.role)))
    return res.status(403).json({ error: 'Assistant Manager or above required to manage Training Plan' });
  const {
    training_name, level_1, level_2, level_3, level_4,
    method_code, method_name, duration_hours, budget_plan, budget_actual,
    trainer_type, remark, year, sort_order, schedule,
  } = req.body;
  if (!training_name) return res.status(400).json({ error: 'training_name required' });
  const yr = parseInt(year, 10) || new Date().getFullYear();
  ensurePlanTables(db, () => {
    getOrInitApproval(db, yr, (approval) => {
      if (['pending_check','pending_approval','approved'].includes(approval.status))
        return res.status(403).json({ error: 'Plan is locked. Request an edit unlock first.' });
      db.run(
        `INSERT INTO TrainingProgram
         (training_name,level_1,level_2,level_3,level_4,method_code,method_name,duration_hours,budget_plan,budget_actual,trainer_type,remark,year,sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [training_name, level_1?1:0, level_2?1:0, level_3?1:0, level_4?1:0,
         method_code||null, method_name||null, duration_hours||null,
         budget_plan||null, budget_actual||null, trainer_type||null, remark||null, yr, sort_order||0],
        function(this: any, err: any) {
          if (err) return res.status(500).json({ error: err.message });
          const pid = this.lastID;
          addPlanLog(db, yr, 'create_program', actor, `Added: ${training_name}`);
          if (!schedule || !schedule.length) return res.json({ id: pid });
          const stmt = db.prepare(
            `INSERT INTO TrainingSchedule (program_id, year, month, plan, actual) VALUES (?,?,?,?,?)`
          );
          for (const s of schedule) {
            stmt.run([pid, yr, s.month, s.plan?1:0, s.actual?1:0]);
          }
          stmt.finalize(() => res.json({ id: pid }));
        }
      );
    });
  });
});

// PUT /training/plan/:id
router.put('/plan/:id', authRequired, (req: any, res: any) => {
  const db    = req.db;
  const actor = req.user;
  const { id } = req.params;
  if (!EDITOR_ROLES.includes(normalizeRole(actor?.role)))
    return res.status(403).json({ error: 'Assistant Manager or above required' });
  const {
    training_name, level_1, level_2, level_3, level_4,
    method_code, method_name, duration_hours, budget_plan, budget_actual,
    trainer_type, remark, sort_order, schedule,
  } = req.body;
  ensurePlanTables(db, () => {
    db.get(`SELECT year FROM TrainingProgram WHERE id=?`, [id], (_: any, prog: any) => {
      if (!prog) return res.status(404).json({ error: 'Program not found' });
      getOrInitApproval(db, prog.year, (approval) => {
        if (['pending_check','pending_approval','approved'].includes(approval.status))
          return res.status(403).json({ error: 'Plan is locked. Use budget-actual endpoint or request an edit unlock.' });
        db.run(
          `UPDATE TrainingProgram SET
           training_name=COALESCE(?,training_name),
           level_1=COALESCE(?,level_1), level_2=COALESCE(?,level_2),
           level_3=COALESCE(?,level_3), level_4=COALESCE(?,level_4),
           method_code=COALESCE(?,method_code), method_name=COALESCE(?,method_name),
           duration_hours=COALESCE(?,duration_hours), budget_plan=COALESCE(?,budget_plan),
           budget_actual=COALESCE(?,budget_actual), trainer_type=COALESCE(?,trainer_type),
           remark=COALESCE(?,remark), sort_order=COALESCE(?,sort_order),
           updated_at=datetime('now')
         WHERE id=?`,
          [training_name, level_1!=null?level_1?1:0:null, level_2!=null?level_2?1:0:null,
           level_3!=null?level_3?1:0:null, level_4!=null?level_4?1:0:null,
           method_code, method_name, duration_hours, budget_plan, budget_actual,
           trainer_type, remark, sort_order, id],
          (err: any) => {
            if (err) return res.status(500).json({ error: err.message });
            addPlanLog(db, prog.year, 'update_program', actor, `Updated program id=${id}`);
            if (!schedule) return res.json({ ok: true });
            db.run(`DELETE FROM TrainingSchedule WHERE program_id=?`, [id], () => {
              const yr = prog.year || new Date().getFullYear();
              const stmt = db.prepare(
                `INSERT INTO TrainingSchedule (program_id,year,month,plan,actual) VALUES (?,?,?,?,?)`
              );
              for (const s of schedule) {
                stmt.run([id, yr, s.month, s.plan?1:0, s.actual?1:0]);
              }
              stmt.finalize(() => res.json({ ok: true }));
            });
          }
        );
      });
    });
  });
});

// PATCH /training/plan/:id/actual — toggle actual for a month (allowed even when locked)
router.patch('/plan/:id/actual', authRequired, (req: any, res: any) => {
  const db    = req.db;
  const actor = req.user;
  if (!EDITOR_ROLES.includes(normalizeRole(actor?.role)))
    return res.status(403).json({ error: 'Editor role required' });
  const { id } = req.params;
  const { month, actual } = req.body;
  db.run(
    `UPDATE TrainingSchedule SET actual=? WHERE program_id=? AND month=?`,
    [actual?1:0, id, month],
    (err: any) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    }
  );
});

// PATCH /training/plan/:id/budget-actual — update budget_actual only (allowed even when plan is approved)
router.patch('/plan/:id/budget-actual', authRequired, (req: any, res: any) => {
  const db    = req.db;
  const actor = req.user;
  if (!EDITOR_ROLES.includes(normalizeRole(actor?.role)))
    return res.status(403).json({ error: 'Editor role required' });
  const { id } = req.params;
  const { budget_actual } = req.body;
  db.run(
    `UPDATE TrainingProgram SET budget_actual=?, updated_at=datetime('now') WHERE id=?`,
    [budget_actual != null ? budget_actual : null, id],
    (err: any) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    }
  );
});

// DELETE /training/plan/:id
router.delete('/plan/:id', authRequired, (req: any, res: any) => {
  const db    = req.db;
  const actor = req.user;
  if (!EDITOR_ROLES.includes(normalizeRole(actor?.role)))
    return res.status(403).json({ error: 'Assistant Manager or above required' });
  ensurePlanTables(db, () => {
    db.get(`SELECT year FROM TrainingProgram WHERE id=?`, [req.params.id], (_: any, prog: any) => {
      if (!prog) return res.status(404).json({ error: 'Program not found' });
      getOrInitApproval(db, prog.year, (approval) => {
        if (['pending_check','pending_approval','approved'].includes(approval.status))
          return res.status(403).json({ error: 'Plan is locked. Request an edit unlock first.' });
        db.run(`DELETE FROM TrainingProgram WHERE id=?`, [req.params.id], function(this: any, err: any) {
          if (err) return res.status(500).json({ error: err.message });
          db.run(`DELETE FROM TrainingSchedule WHERE program_id=?`, [req.params.id], () => {
            addPlanLog(db, prog.year, 'delete_program', actor, `Deleted program id=${req.params.id}`);
            res.json({ ok: true });
          });
        });
      });
    });
  });
});

// POST /training/plan/seed — seed from CSV data
router.post('/plan/seed', authRequired, (req: any, res: any) => {
  const db    = req.db;
  const actor = req.user;
  if (!EDITOR_ROLES.includes(normalizeRole(actor?.role)))
    return res.status(403).json({ error: 'Assistant Manager or above required' });
  const { programs, year } = req.body; // [{ ...program, schedule: [{month,plan,actual}] }]
  if (!programs?.length) return res.status(400).json({ error: 'programs array required' });
  const yr = parseInt(year, 10) || new Date().getFullYear();
  ensurePlanTables(db, () => {
    getOrInitApproval(db, yr, (approval) => {
      if (['pending_check','pending_approval','approved'].includes(approval.status))
        return res.status(403).json({ error: 'Plan is locked. Cannot load default data.' });
      let inserted = 0;
      const doInsert = (i: number) => {
        if (i >= programs.length) {
          addPlanLog(db, yr, 'seed', actor, `Loaded ${inserted} default programs`);
          return res.json({ inserted });
        }
        const p = programs[i];
        db.run(
          `INSERT INTO TrainingProgram
             (training_name,level_1,level_2,level_3,level_4,method_code,method_name,duration_hours,budget_plan,budget_actual,trainer_type,remark,year,sort_order)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [p.training_name, p.level_1?1:0, p.level_2?1:0, p.level_3?1:0, p.level_4?1:0,
           p.method_code||null, p.method_name||null, p.duration_hours||null,
           p.budget_plan||null, p.budget_actual||null, p.trainer_type||null, p.remark||null, yr, i],
          function(this: any, err: any) {
            if (err) { doInsert(i+1); return; }
            const pid = this.lastID;
            inserted++;
            if (!p.schedule?.length) { doInsert(i+1); return; }
            const stmt = db.prepare(
              `INSERT INTO TrainingSchedule (program_id,year,month,plan,actual) VALUES (?,?,?,?,?)`
            );
            for (const s of p.schedule) stmt.run([pid, yr, s.month, s.plan?1:0, s.actual?1:0]);
            stmt.finalize(() => doInsert(i+1));
          }
        );
      };
      doInsert(0);
    });
  });
});

// ─── Legacy TrainingRecord routes (kept for backward compat) ─────────────────

// GET /years — distinct years present in training records
router.get('/years', authRequired, (req: any, res: any) => {
  const db = req.db;
  ensureTable(db, () => {
    db.all(
      `SELECT DISTINCT CAST(strftime('%Y', training_date) AS INTEGER) AS year
       FROM TrainingRecord
       WHERE training_date IS NOT NULL
       ORDER BY year DESC`,
      [],
      (err: any, rows: any[]) => {
        if (err) return res.status(500).json({ error: err.message });
        const years: number[] = rows.map((r: any) => r.year).filter(Boolean);
        const cur = new Date().getFullYear();
        if (!years.includes(cur)) years.unshift(cur);
        res.json({ years });
      }
    );
  });
});

// GET all — optional ?year= filter
router.get('/', authRequired, (req: any, res: any) => {

  const db = req.db;
  const year = req.query.year ? parseInt(req.query.year as string, 10) : null;
  ensureTable(db, () => {
    const sql = year
      ? `SELECT tr.*, u.name AS employee_name, u.employee_code, r.name AS role_name,
                creator.name AS created_by_name
         FROM TrainingRecord tr
         LEFT JOIN users u ON tr.employee_id = u.id
         LEFT JOIN roles r ON u.role_id = r.id
         LEFT JOIN users creator ON tr.created_by = creator.id
         WHERE strftime('%Y', tr.training_date) = ?
         ORDER BY tr.training_date DESC`
      : `SELECT tr.*, u.name AS employee_name, u.employee_code, r.name AS role_name,
                creator.name AS created_by_name
         FROM TrainingRecord tr
         LEFT JOIN users u ON tr.employee_id = u.id
         LEFT JOIN roles r ON u.role_id = r.id
         LEFT JOIN users creator ON tr.created_by = creator.id
         ORDER BY tr.training_date DESC`;
    const params = year ? [String(year)] : [];
    db.all(sql, params, (err: any, rows: any[]) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ records: rows || [] });
    });
  });
});

// GET /summary — per-employee totals, optional ?year=
router.get('/summary', authRequired, (req: any, res: any) => {
  const db = req.db;
  const year = req.query.year ? parseInt(req.query.year as string, 10) : null;
  ensureTable(db, () => {
    const yearClause = year
      ? `AND strftime('%Y', tr.training_date) = '${year}'`
      : '';
    db.all(
      `SELECT u.id AS employee_id, u.name AS employee_name, u.employee_code,
              r.name AS role_name,
              COUNT(tr.id)                                                AS total_trainings,
              SUM(CASE WHEN tr.status = 'Completed' THEN 1 ELSE 0 END)   AS completed,
              SUM(CASE WHEN tr.status = 'Pending'   THEN 1 ELSE 0 END)   AS pending,
              SUM(CASE WHEN tr.status = 'Overdue'   THEN 1 ELSE 0 END)   AS overdue,
              MAX(tr.training_date)                                       AS last_training_date
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN TrainingRecord tr ON tr.employee_id = u.id ${yearClause}
       WHERE COALESCE(u.is_active, 1) = 1
       GROUP BY u.id
       ORDER BY u.name ASC`,
      [],
      (err: any, rows: any[]) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ summary: rows || [] });
      }
    );
  });
});

// GET /monthly — monthly completion counts for charts, optional ?year=
router.get('/monthly', authRequired, (req: any, res: any) => {
  const db = req.db;
  const year = req.query.year ? parseInt(req.query.year as string, 10) : new Date().getFullYear();
  ensureTable(db, () => {
    db.all(
      `SELECT CAST(strftime('%m', training_date) AS INTEGER) AS month,
              status,
              COUNT(*) AS cnt
       FROM TrainingRecord
       WHERE strftime('%Y', training_date) = ?
       GROUP BY month, status`,
      [String(year)],
      (err: any, rows: any[]) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ monthly: rows || [] });
      }
    );
  });
});

// POST create
router.post('/', authRequired, (req: any, res: any) => {
  const db = req.db;
  const { employee_id, training_title, training_type, training_date, due_date, trainer, notes, status } = req.body;
  if (!employee_id || !training_title || !training_date) {
    return res.status(400).json({ error: 'employee_id, training_title, and training_date are required.' });
  }
  const created_by = req.user?.id;
  const initStatus = status || 'Pending';
  ensureTable(db, () => {
    db.run(
      `INSERT INTO TrainingRecord (employee_id, training_title, training_type, training_date, due_date, trainer, notes, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [employee_id, training_title, training_type || 'General', training_date, due_date || null, trainer || null, notes || null, initStatus, created_by],
      function (this: any, err: any) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Training record created', id: this.lastID });
      }
    );
  });
});

// PUT update
router.put('/:id', authRequired, (req: any, res: any) => {
  const db = req.db;
  const { training_title, training_type, training_date, due_date, trainer, notes, status } = req.body;
  db.run(
    `UPDATE TrainingRecord SET
       training_title = COALESCE(?, training_title),
       training_type  = COALESCE(?, training_type),
       training_date  = COALESCE(?, training_date),
       due_date       = COALESCE(?, due_date),
       trainer        = COALESCE(?, trainer),
       notes          = COALESCE(?, notes),
       status         = COALESCE(?, status),
       updated_at     = datetime('now')
     WHERE id = ?`,
    [training_title, training_type, training_date, due_date ?? null, trainer ?? null, notes ?? null, status, req.params.id],
    function (this: any, err: any) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Updated', changes: this.changes });
    }
  );
});

// DELETE
router.delete('/:id', authRequired, (req: any, res: any) => {
  const db = req.db;
  db.run(`DELETE FROM TrainingRecord WHERE id = ?`, [req.params.id], function (this: any, err: any) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deleted', changes: this.changes });
  });
});

export = router;
