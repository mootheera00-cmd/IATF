// backend/services/revisionService.js
const db=require('../db/connection');
exports.promoteToReleased = async (revisionId, actorId)=>{
  const [[rev]] = await db.query('SELECT * FROM DocumentRevision WHERE id=?',[revisionId]);
  const [[old]] = await db.query('SELECT * FROM DocumentRevision WHERE document_id=? AND status="Released"',[rev.document_id]);
  await db.query('UPDATE DocumentRevision SET status="Released", released_at=NOW(), released_by=? WHERE id=?',[actorId,revisionId]);
  if(old) await db.query('UPDATE DocumentRevision SET status="Obsolete" WHERE id=?',[old.id]);
  await db.query('UPDATE Document SET current_revision_id=? WHERE id=?',[revisionId,rev.document_id]);
  return { released: revisionId, obsolete: old?.id };
};