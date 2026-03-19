// routes/logs.ts
const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const auditService = require('../services/auditService');

router.get('/', authRequired, async (req: any, res: any) => {
  try {
    const { sort, order, limit, entity_type, action, actor_id } = req.query as any;
    const events = await auditService.getAllEvents({
      sortBy: sort,
      order,
      limit: limit ? Number(limit) : undefined,
      entity_type: entity_type || undefined,
      action: action || undefined,
      actor_id: actor_id ? Number(actor_id) : undefined
    });

    res.json({ logs: events, total: events.length });
  } catch (error: any) {
    console.error('Error fetching logs:', error.message);
    res.status(500).json({ message: 'Failed to load logs' });
  }
});

export = router;
