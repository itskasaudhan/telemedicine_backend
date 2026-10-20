const { z } = require('zod');
const pool = require('../../db/pool');

async function analytics() {
  // 1. consultations status ke hisaab se
  const byStatus = await pool.query(
    'SELECT status, COUNT(*)::int AS count FROM consultations GROUP BY status'
  );

  // 2. total revenue (sirf succeeded payments)
  const revenue = await pool.query(
    `SELECT COALESCE(SUM(amount), 0)::float AS total, COUNT(*)::int AS payments
       FROM payments WHERE status = 'succeeded'`
  );

  // 3. top 5 doctors (confirmed/completed consultations ke hisaab se)
  const topDoctors = await pool.query(
    `SELECT p.full_name, d.specialty, COUNT(*)::int AS consultations
       FROM consultations c
       JOIN doctors d ON d.user_id = c.doctor_id
       JOIN profiles p ON p.user_id = c.doctor_id
      WHERE c.status IN ('confirmed','in_progress','completed')
      GROUP BY p.full_name, d.specialty
      ORDER BY consultations DESC
      LIMIT 5`
  );

  // 4. pichle 7 din ki daily consultations
  const daily = await pool.query(
    `SELECT TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS count
       FROM consultations
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY day ORDER BY day`
  );

  return {
    consultationsByStatus: byStatus.rows,
    revenue: revenue.rows[0],
    topDoctors: topDoctors.rows,
    last7Days: daily.rows,
  };
}

const auditQuery = z.object({
  action: z.string().max(100).optional(),
  actorId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

async function auditLogs(query) {
  const f = auditQuery.parse(query);
  const { rows } = await pool.query(
    `SELECT id, actor_id, action, entity, entity_id, ip, created_at
       FROM audit_logs
      WHERE ($1::text IS NULL OR action = $1)
        AND ($2::uuid IS NULL OR actor_id = $2)
      ORDER BY id DESC
      LIMIT $3 OFFSET $4`,
    [f.action || null, f.actorId || null, f.limit, (f.page - 1) * f.limit]
  );
  return { page: f.page, limit: f.limit, data: rows };
}

module.exports = { analytics, auditLogs };