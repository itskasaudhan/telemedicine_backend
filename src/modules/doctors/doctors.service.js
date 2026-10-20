const { z } = require('zod');
const pool = require('../../db/pool');

const listQuery = z.object({
  specialty: z.string().max(100).optional(),
  q: z.string().max(100).optional(), // search by doctor name
  maxFee: z.coerce.number().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

async function list(query) {
  const f = listQuery.parse(query);
  const { rows } = await pool.query(
    `SELECT d.user_id AS id, p.full_name, d.specialty, d.experience_yrs, d.fee
       FROM doctors d
       JOIN profiles p ON p.user_id = d.user_id
      WHERE ($1::text IS NULL OR d.specialty ILIKE $1)
        AND ($2::text IS NULL OR p.full_name ILIKE '%' || $2 || '%')
        AND ($3::numeric IS NULL OR d.fee <= $3)
      ORDER BY d.experience_yrs DESC, p.full_name
      LIMIT $4 OFFSET $5`,
    [f.specialty || null, f.q || null, f.maxFee || null, f.limit, (f.page - 1) * f.limit]
  );
  return { page: f.page, limit: f.limit, data: rows };
}

module.exports = { list };