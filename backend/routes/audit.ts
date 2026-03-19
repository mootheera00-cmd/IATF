// routes/audit.ts
const express = require('express');
const router = express.Router();

const { authRequired } = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');

// Create audit record → INTERNAL_AUDITOR หรือ ADMIN เท่านั้น
router.post('/', authRequired, requireRole(['INTERNAL_AUDITOR', 'ADMIN']), (req: any, res: any) => {
  res.json({ message: 'Audit record created' });
});

// View audits → USER, INTERNAL_AUDITOR, ADMIN
router.get('/', authRequired, requireRole(['USER', 'INTERNAL_AUDITOR', 'ADMIN']), (req: any, res: any) => {
  res.json({ message: 'Audit list' });
});

export = router;
