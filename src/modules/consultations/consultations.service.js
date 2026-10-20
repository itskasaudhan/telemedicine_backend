const pool = require('../../db/pool');
const AppError = require('../../utils/AppError');
const audit = require('../audit/audit.service');

const HOLD_MINUTES = 10;

async function book({ patientId, slotId, idempotencyKey, ip }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Idempotency: same patient + same key -> return the earlier booking
    const existing = await client.query(
      'SELECT * FROM consultations WHERE patient_id = $1 AND idempotency_key = $2',
      [patientId, idempotencyKey]
    );
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return { replayed: true, consultation: existing.rows[0] };
    }

    // 2. Lock the slot row. A second request for the same slot waits here until we commit.
    const slotRes = await client.query(
      'SELECT id, doctor_id, status, held_until FROM availability_slots WHERE id = $1 FOR UPDATE',
      [slotId]
    );
    const slot = slotRes.rows[0];
    if (!slot) throw new AppError(404, 'Slot not found');

    const holdExpired = slot.status === 'held' && slot.held_until < new Date();
    if (slot.status !== 'open' && !holdExpired) throw new AppError(409, 'Slot not available');

       // Expired hold: cancel the stale pending consultation so the slot can be re-booked
    if (holdExpired) {
      await client.query(
        `UPDATE consultations SET status = 'cancelled' WHERE slot_id = $1 AND status = 'pending_payment'`,
        [slotId]
      );
    }
    
    // 3. Hold the slot and create the consultation
    await client.query(
      `UPDATE availability_slots SET status = 'held', held_until = NOW() + ($2 || ' minutes')::interval WHERE id = $1`,
      [slotId, String(HOLD_MINUTES)]
    );
    const ins = await client.query(
      `INSERT INTO consultations(patient_id, doctor_id, slot_id, idempotency_key)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [patientId, slot.doctor_id, slotId, idempotencyKey]
    );

    await audit.log({ actorId: patientId, action: 'consultation.book', entity: 'consultation', entityId: ins.rows[0].id, ip }, client);
    await client.query('COMMIT');
    return { replayed: false, consultation: ins.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    // unique violation on slot_id = lost the race
    if (err.code === '23505') throw new AppError(409, 'Slot not available');
    throw err;
  } finally {
    client.release();
  }
}

async function getById(user, id) {
  const { rows } = await pool.query('SELECT * FROM consultations WHERE id = $1', [id]);
  const c = rows[0];
  // same 404 whether it doesn't exist or isn't yours (no information leak)
  if (!c || (user.role !== 'admin' && c.patient_id !== user.id && c.doctor_id !== user.id)) {
    throw new AppError(404, 'Consultation not found');
  }
  return c;
}
const ALLOWED = {
  start: { from: 'confirmed', to: 'in_progress' },
  complete: { from: 'in_progress', to: 'completed' },
};

async function transition({ doctorId, id, action, ip }) {
  const t = ALLOWED[action];
  // ek hi query me check + update: sahi doctor, sahi purana status, tabhi badlo
  const { rows } = await pool.query(
    `UPDATE consultations SET status = $1, updated_at = NOW()
      WHERE id = $2 AND doctor_id = $3 AND status = $4 RETURNING *`,
    [t.to, id, doctorId, t.from]
  );
  if (!rows[0]) throw new AppError(409, `Cannot ${action}: consultation not found or not in '${t.from}' state`);
  await audit.log({ actorId: doctorId, action: `consultation.${action}`, entity: 'consultation', entityId: id, ip });
  return rows[0];
}

module.exports = { book, getById, transition };