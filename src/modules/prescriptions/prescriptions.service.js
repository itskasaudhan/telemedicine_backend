const pool = require('../../db/pool');
const AppError = require('../../utils/AppError');
const audit = require('../audit/audit.service');
const { encrypt, decrypt } = require('../../utils/crypto');

// Doctor prescription likhta hai
async function create({ doctorId, consultationId, content, ip }) {
  // 1. Ye consultation isi doctor ki hai? Aur chal rahi hai ya ho chuki?
  const c = await pool.query('SELECT doctor_id, status FROM consultations WHERE id = $1', [consultationId]);
  if (!c.rows[0] || c.rows[0].doctor_id !== doctorId) throw new AppError(404, 'Consultation not found');
  if (!['in_progress', 'completed'].includes(c.rows[0].status)) {
    throw new AppError(409, 'Consultation must be in progress or completed');
  }
  try {
    // 2. Encrypt karke save
    const { rows } = await pool.query(
      'INSERT INTO prescriptions(consultation_id, content_enc) VALUES ($1,$2) RETURNING id, consultation_id, created_at',
      [consultationId, encrypt(content)]
    );
    // 3. Audit log
    await audit.log({ actorId: doctorId, action: 'prescription.create', entity: 'prescription', entityId: rows[0].id, ip });
    return rows[0];
  } catch (err) {
    // ek consultation ki ek hi prescription (UNIQUE)
    if (err.code === '23505') throw new AppError(409, 'Prescription already exists for this consultation');
    throw err;
  }
}

// Patient ya doctor padhta hai
async function getByConsultation({ user, consultationId, ip }) {
  const { rows } = await pool.query(
    `SELECT p.id, p.content_enc, p.created_at, c.patient_id, c.doctor_id
       FROM prescriptions p JOIN consultations c ON c.id = p.consultation_id
      WHERE p.consultation_id = $1`,
    [consultationId]
  );
  const p = rows[0];
  // koi aur user ho to bhi "not found" (pata hi nahi chalne dete ki exist karti hai)
  if (!p || (p.patient_id !== user.id && p.doctor_id !== user.id)) throw new AppError(404, 'Prescription not found');
  await audit.log({ actorId: user.id, action: 'prescription.read', entity: 'prescription', entityId: p.id, ip });
  return { id: p.id, consultationId, content: decrypt(p.content_enc), createdAt: p.created_at };
}

module.exports = { create, getByConsultation };