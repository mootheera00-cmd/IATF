// backend/services/auditService.js
const db=require('../db/connection');
exports.log=async(t,id,actor,action,meta=null)=>db.query(
  'INSERT INTO AuditEvent (entity_type,entity_id,actor_id,action,metadata) VALUES (?,?,?,?,?)',
  [t,id,actor,action,meta?JSON.stringify(meta):null]
);

// backend/services/notificationService.js (stub; replace with email/Teams later)
exports.notifyUser    = async (userId, subject, payload)=>console.log('[NotifyUser]', {userId,subject,payload});
exports.notifyManager = async (mgrId, subject, payload)=>console.log('[NotifyManager]', {mgrId,subject,payload});