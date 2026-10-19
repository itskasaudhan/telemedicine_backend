const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const pool = require('../../db/pool');
const config = require('../../config');
const AppError = require('../../utils/AppError');

function issueTokens(user) {
  const accessToken = jwt.sign({ role: user.role }, config.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: '15m',
  });
  const refreshToken = jwt.sign({}, config.JWT_REFRESH_SECRET, {
    subject: user.id,
    expiresIn: '7d',
  });
  return { accessToken, refreshToken };
}

async function register(data) {
  if (data.role === 'doctor' && (!data.specialty || !data.fee || !data.licenseNo)) {
    throw new AppError(400, 'Doctors need specialty, fee and licenseNo');
  }

  const hash = await bcrypt.hash(data.password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO users(email, password_hash, role) VALUES ($1,$2,$3) RETURNING id, email, role',
      [data.email, hash, data.role]
    );
    const user = rows[0];
    await client.query('INSERT INTO profiles(user_id, full_name) VALUES ($1,$2)', [user.id, data.fullName]);
    if (data.role === 'doctor') {
      await client.query(
        'INSERT INTO doctors(user_id, specialty, fee, license_no) VALUES ($1,$2,$3,$4)',
        [user.id, data.specialty, data.fee, data.licenseNo]
      );
    }
    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw new AppError(409, 'Email or license already registered');
    throw err;
  } finally {
    client.release();
  }
}

async function login({ email, password, otp }) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 AND is_active = TRUE', [email]);
  const user = rows[0];
  // same error for wrong email / wrong password, so attackers can't tell which one was wrong
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) throw new AppError(401, 'Invalid credentials');

  if (user.mfa_enabled) {
    if (!otp) throw new AppError(401, 'OTP required', 'MFA_REQUIRED');
    if (!authenticator.check(otp, user.mfa_secret)) throw new AppError(401, 'Invalid OTP');
  }
  return issueTokens(user);
}

async function refresh(refreshToken) {
  try {
    const payload = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET);
    const { rows } = await pool.query('SELECT id, role FROM users WHERE id = $1 AND is_active = TRUE', [payload.sub]);
    if (!rows[0]) throw new Error('no user');
    return issueTokens(rows[0]);
  } catch {
    throw new AppError(401, 'Invalid refresh token');
  }
}

async function mfaSetup(userId) {
  const secret = authenticator.generateSecret();
  await pool.query('UPDATE users SET mfa_secret = $1, mfa_enabled = FALSE WHERE id = $2', [secret, userId]);
  const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
  return { secret, otpauthUrl: authenticator.keyuri(rows[0].email, 'Amrutam', secret) };
}

async function mfaVerify(userId, otp) {
  const { rows } = await pool.query('SELECT mfa_secret FROM users WHERE id = $1', [userId]);
  if (!rows[0]?.mfa_secret) throw new AppError(400, 'Run MFA setup first');
  if (!authenticator.check(otp, rows[0].mfa_secret)) throw new AppError(400, 'Invalid OTP');
  await pool.query('UPDATE users SET mfa_enabled = TRUE WHERE id = $1', [userId]);
  return { mfaEnabled: true };
}

module.exports = { register, login, refresh, mfaSetup, mfaVerify };