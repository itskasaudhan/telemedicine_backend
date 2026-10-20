const pool = require('../../db/pool');
const AppError = require('../../utils/AppError');
const schemas = require('./availability.schemas');

// Splits a time range into slots, e.g. 10:00-12:00 with 30 min -> 4 slots
async function createSlots(doctorId, data) {
  const stepMs = data.slotMinutes * 60 * 1000;
  const end = new Date(data.endTime).getTime();
  const starts = [];
  const ends = [];
  for (let t = new Date(data.startTime).getTime(); t + stepMs <= end; t += stepMs) {
    starts.push(new Date(t).toISOString());
    ends.push(new Date(t + stepMs).toISOString());
  }
  if (!starts.length) throw new AppError(400, 'Range too short for one slot');

  // ON CONFLICT DO NOTHING -> re-sending the same request creates no duplicates (idempotent)
  const { rows } = await pool.query(
    `INSERT INTO availability_slots(doctor_id, start_time, end_time)
     SELECT $1, s, e FROM unnest($2::timestamptz[], $3::timestamptz[]) AS t(s, e)
     ON CONFLICT (doctor_id, start_time) DO NOTHING
     RETURNING id, start_time, end_time, status`,
    [doctorId, starts, ends]
  );
  return { created: rows.length, skipped: starts.length - rows.length, slots: rows };
}

async function listOpen(doctorId, query) {
  const { from, to } = schemas.listOpen.parse(query);
  const fromTs = from || new Date().toISOString();
  const toTs = to || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { rows } = await pool.query(
    `SELECT id, start_time, end_time
       FROM availability_slots
      WHERE doctor_id = $1 AND status = 'open'
        AND start_time >= $2 AND start_time < $3
      ORDER BY start_time
      LIMIT 200`,
    [doctorId, fromTs, toTs]
  );
  return rows;
}

async function remove(doctorId, slotId) {
  const { rowCount } = await pool.query(
    `DELETE FROM availability_slots WHERE id = $1 AND doctor_id = $2 AND status = 'open'`,
    [slotId, doctorId]
  );
  if (!rowCount) throw new AppError(404, 'Open slot not found');
}

module.exports = { createSlots, listOpen, remove };