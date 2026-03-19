// routes/notifications.ts
const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

function parseMetadata(raw: any) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

router.get('/', authRequired, async (req: any, res: any) => {
  try {
    const unreadOnly = String(req.query.unread_only || 'false').toLowerCase() === 'true';
    const notifications = await notificationService.getNotifications(req.user.id, unreadOnly);

    const result = (notifications || []).map((item: any) => {
      const metadata = parseMetadata(item.metadata);
      return {
        ...item,
        metadata,
        cr_id: metadata.cr_id || null
      };
    });

    return res.status(200).json({ notifications: result });
  } catch (error: any) {
    console.error('Error listing notifications:', error.message);
    return res.status(500).json({ message: 'Error fetching notifications' });
  }
});

router.post('/:id/read', authRequired, async (req: any, res: any) => {
  try {
    const notificationId = Number(req.params.id);
    if (!notificationId) {
      return res.status(400).json({ message: 'Invalid notification id' });
    }

    const ok = await notificationService.markAsRead(notificationId);
    if (!ok) {
      return res.status(500).json({ message: 'Failed to mark notification as read' });
    }

    return res.status(200).json({ message: 'Notification marked as read' });
  } catch (error: any) {
    console.error('Error marking notification as read:', error.message);
    return res.status(500).json({ message: 'Error updating notification' });
  }
});

router.post('/mark-all-read', authRequired, async (req: any, res: any) => {
  try {
    const ok = await notificationService.markAllAsRead(req.user.id);
    if (!ok) {
      return res.status(500).json({ message: 'Failed to mark all notifications as read' });
    }
    return res.status(200).json({ message: 'All notifications marked as read' });
  } catch (error: any) {
    console.error('Error marking all notifications as read:', error.message);
    return res.status(500).json({ message: 'Error updating notifications' });
  }
});

export = router;
