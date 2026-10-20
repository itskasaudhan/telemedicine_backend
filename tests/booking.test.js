const request = require('supertest');
const { app } = require('../src/app');
const pool = require('../src/db/pool');

const api = request(app);
const stamp = Date.now();
let doctorToken;
let slotId;
const patients = [];

async function register(email, role, extra = {}) {
  await api.post('/auth/register').send({ email, password: 'password123', role, fullName: 'Test', ...extra });
  const res = await api.post('/auth/login').send({ email, password: 'password123' });
  return res.body.accessToken;
}

beforeAll(async () => {
  doctorToken = await register(`doc${stamp}@t.com`, 'doctor', {
    specialty: 'Ayurveda', fee: 500, licenseNo: `LIC${stamp}`,
  });
  for (let i = 0; i < 10; i++) patients.push(await register(`p${i}_${stamp}@t.com`, 'patient'));

  const start = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const res = await api.post('/availability').set('Authorization', `Bearer ${doctorToken}`)
    .send({ startTime: start.toISOString(), endTime: end.toISOString(), slotMinutes: 30 });
  slotId = res.body.slots[0].id;
}, 60000);

afterAll(async () => { await pool.end(); });

test('10 patients book the same slot at once: exactly 1 wins', async () => {
  const results = await Promise.all(
    patients.map((t, i) =>
      api.post('/consultations').set('Authorization', `Bearer ${t}`)
        .set('Idempotency-Key', `race-key-${stamp}-${i}`).send({ slotId })
    )
  );
  const codes = results.map((r) => r.status);
  expect(codes.filter((c) => c === 201)).toHaveLength(1);
  expect(codes.filter((c) => c === 409)).toHaveLength(9);
});

test('same Idempotency-Key returns the same booking', async () => {
  const start = new Date(Date.now() + 4 * 24 * 3600 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const s = await api.post('/availability').set('Authorization', `Bearer ${doctorToken}`)
    .send({ startTime: start.toISOString(), endTime: end.toISOString(), slotMinutes: 30 });
  const id = s.body.slots[0].id;

  const send = () => api.post('/consultations').set('Authorization', `Bearer ${patients[0]}`)
    .set('Idempotency-Key', `idem-key-${stamp}`).send({ slotId: id });
  const first = await send();
  const second = await send();

  expect(first.status).toBe(201);
  expect(second.status).toBe(200);
  expect(second.body.id).toBe(first.body.id);
});

test('patient cannot create slots (RBAC)', async () => {
  const res = await api.post('/availability').set('Authorization', `Bearer ${patients[0]}`)
    .send({ startTime: new Date().toISOString(), endTime: new Date(Date.now() + 3600000).toISOString() });
  expect(res.status).toBe(403);
});