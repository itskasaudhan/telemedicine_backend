const pool = require('../../db/pool');

// Pass a transaction `client` to make the audit row commit/rollback with the business change.
// Without a client it uses the pool directly.
async function log({ actorId, action, entity, entityId, ip, metadata }, client = pool) {
  await client.query(
    `INSERT INTO audit_logs(actor_id, action, entity, entity_id, ip, metadata)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [actorId || null, action, entity, entityId ? String(entityId) : null, ip || null, metadata ? JSON.stringify(metadata) : null]
  );
}

module.exports = { log };