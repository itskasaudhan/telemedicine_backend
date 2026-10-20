const pool = require('../db/pool');

async function releaseExpiredHolds() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE consultations c SET status = 'cancelled', updated_at = NOW()
         FROM availability_slots s
        WHERE c.slot_id = s.id AND c.status = 'pending_payment'
          AND s.status = 'held' AND s.held_until < NOW()`
    );
    const { rowCount } = await client.query(
      `UPDATE availability_slots SET status = 'open', held_until = NULL
        WHERE status = 'held' AND held_until < NOW()`
    );
    await client.query('COMMIT');
    return rowCount;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function start(logger) {
  const timer = setInterval(async () => {
    try {
      const n = await releaseExpiredHolds();
      if (n) logger.info({ released: n }, 'released expired slot holds');
    } catch (err) {
      logger.error(err, 'hold expiry job failed');
    }
  }, 60 * 1000);
  timer.unref();
}

module.exports = { start, releaseExpiredHolds };