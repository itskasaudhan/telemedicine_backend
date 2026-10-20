// Ek baar chalao: admin user banata hai (email/password env se, warna default dev wale)
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'admin12345';
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO users(email, password_hash, role) VALUES ($1,$2,'admin')
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email, hash]
  );
  if (rows[0]) {
    await pool.query('INSERT INTO profiles(user_id, full_name) VALUES ($1,$2)', [rows[0].id, 'Admin']);
    console.log('Admin created:', email);
  } else {
    console.log('Admin already exists');
  }
  await pool.end();
}

main();