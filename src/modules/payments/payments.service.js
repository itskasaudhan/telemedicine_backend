const pool = require('../../db/pool');
const AppError = require('../../utils/AppError');
const audit = require('../audit/audit.service');
const gateway = require('./gateway.mock');

async function pay({ patientId, consultationId, idempotencyKey, simulate, ip }) {
  // STEP 1: validate + create a 'pending' payment (short transaction)
  let payment;
  const c1 = await pool.connect();
  try {
    await c1.query('BEGIN');
    const { rows } = await c1.query(
      `SELECT c.id, c.patient_id, c.status, s.held_until, d.fee
         FROM consultations c
         JOIN availability_slots s ON s.id = c.slot_id
         JOIN doctors d ON d.user_id = c.doctor_id
        WHERE c.id = $1
          FOR UPDATE OF c`,
      [consultationId]
    );
    const c = rows[0];
    if (!c || c.patient_id !== patientId) throw new AppError(404, 'Consultation not found');

    // Idempotency: same key already finished -> return the same result
    const existing = await c1.query(
      'SELECT * FROM payments WHERE consultation_id = $1 AND idempotency_key = $2',
      [consultationId, idempotencyKey]
    );
    if (existing.rows[0] && existing.rows[0].status !== 'pending') {
      await c1.query('COMMIT');
      return { replayed: true, payment: existing.rows[0] };
    }

    if (c.status !== 'pending_payment') throw new AppError(409, 'Consultation not payable');
    if (new Date(c.held_until) < new Date()) throw new AppError(409, 'Slot hold expired, book again');

    payment = existing.rows[0] || (await c1.query(
      `INSERT INTO payments(consultation_id, amount, idempotency_key) VALUES ($1,$2,$3) RETURNING *`,
      [consultationId, c.fee, idempotencyKey]
    )).rows[0];
    await c1.query('COMMIT');
  } catch (err) {
    await c1.query('ROLLBACK');
    throw err;
  } finally {
    c1.release();
  }

  // STEP 2: call the gateway (outside any DB transaction, so no locks held while waiting)
  let result;
  try {
    result = await gateway.charge({ amount: payment.amount, idempotencyKey, simulate });
  } catch {
    result = { ok: false };
  }

  // STEP 3: finish the saga (confirm or compensate) in one transaction
  const c2 = await pool.connect();
  try {
    await c2.query('BEGIN');
    const up = await c2.query(
      'UPDATE payments SET status = $1, provider_ref = $2 WHERE id = $3 RETURNING *',
      [result.ok ? 'succeeded' : 'failed', result.providerRef || null, payment.id]
    );
    if (result.ok) {
      await c2.query(`UPDATE consultations SET status = 'confirmed', updated_at = NOW() WHERE id = $1`, [consultationId]);
      await c2.query(
        `UPDATE availability_slots SET status = 'booked', held_until = NULL
          WHERE id = (SELECT slot_id FROM consultations WHERE id = $1)`,
        [consultationId]
      );
    } else {
      await c2.query(`UPDATE consultations SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [consultationId]);
      await c2.query(
        `UPDATE availability_slots SET status = 'open', held_until = NULL
          WHERE id = (SELECT slot_id FROM consultations WHERE id = $1)`,
        [consultationId]
      );
    }
    await audit.log({
      actorId: patientId,
      action: result.ok ? 'payment.succeeded' : 'payment.failed',
      entity: 'payment',
      entityId: payment.id,
      ip,
    }, c2);
    await c2.query('COMMIT');
    return { replayed: false, payment: up.rows[0] };
  } catch (err) {
    await c2.query('ROLLBACK');
    throw err;
  } finally {
    c2.release();
  }
}

module.exports = { pay };