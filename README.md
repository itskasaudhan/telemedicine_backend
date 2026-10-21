# Amrutam Telemedicine Backend

Backend for a telemedicine platform: patients book video consultations with doctors, doctors publish availability, consultations end with encrypted prescriptions, and admins get analytics and audit trails.

Built for scalability, reliability, security and observability.

## Tech stack

- Node.js 20, Express, JavaScript
- PostgreSQL 16 (transactions, row locks, partial unique indexes)
- Redis (reserved for caching / rate-limit store / job queue)
- Zod (input validation), bcrypt (password hashing), JWT (access + refresh), TOTP MFA
- AES-256-GCM (prescription encryption at rest)
- Prometheus + Grafana (metrics), pino (structured JSON logs, request IDs)
- Jest + Supertest (tests), Docker + docker-compose, GitHub Actions (CI)

## Features

- User lifecycle: register, login, JWT access/refresh tokens, TOTP MFA, roles (patient, doctor, admin)
- Doctor availability: create slots from a time range (idempotent)
- Search and filter doctors (specialty, name, max fee, pagination)
- Booking with `Idempotency-Key`, row locking, 10-minute slot hold
- Payment saga: confirm on success, compensate (release slot) on failure or timeout
- Consultation lifecycle: confirmed -> in_progress -> completed
- Encrypted prescriptions, readable only by the consultation's patient and doctor
- Audit logs on every sensitive action, admin analytics
- Metrics endpoint, request IDs, rate limiting, input validation, helmet

## Project structure

```
src/
  config/        env validation (fails fast)
  db/            pool, migration runner, SQL migrations, admin seed
  middleware/    auth + RBAC, validation, errors, metrics
  modules/       auth, doctors, availability, consultations,
                 payments, prescriptions, audit, admin
  jobs/          hold-expiry job
  utils/         AppError, async wrapper, crypto
tests/           concurrency, idempotency, RBAC tests
infra/           prometheus.yml
.github/workflows/ci.yml
```

## Setup (local, without Docker)

Requirements: Node 20+, PostgreSQL 16.

```bash
git clone <repo-url>
cd telemedicine_backend
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Generate three secrets and put them in `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use one each for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` (must be 64 hex chars).

Create the database and run migrations:

```bash
psql -U postgres -c "CREATE DATABASE telemedicine;"
npm run migrate
npm run seed:admin          # creates admin@example.com (override with ADMIN_EMAIL / ADMIN_PASSWORD)
npm run dev
```

Check: `http://localhost:3000/health`

## Setup (Docker)

```bash
docker compose up --build -d
docker compose exec app node src/db/seedAdmin.js
```

| Service | URL |
|---|---|
| API | http://localhost:3000 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (admin / admin) |
| Postgres (host) | localhost:5433 |

Stop: `docker compose down`

## Environment variables

| Variable | Description |
|---|---|
| NODE_ENV | development / test / production |
| PORT | HTTP port (default 3000) |
| DATABASE_URL | PostgreSQL connection string |
| REDIS_URL | Redis connection string |
| JWT_ACCESS_SECRET | min 32 chars |
| JWT_REFRESH_SECRET | min 32 chars |
| ENCRYPTION_KEY | 64 hex chars (32 bytes) |

Secrets are only read from environment variables. `.env` is git-ignored.

## API overview

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | /auth/register | public | patient or doctor |
| POST | /auth/login | public | `otp` required if MFA enabled |
| POST | /auth/refresh | public | |
| POST | /auth/mfa/setup, /auth/mfa/verify | any | TOTP |
| GET | /doctors | any | filters: specialty, q, maxFee, page, limit |
| GET | /doctors/:id/slots | any | open slots, `from` / `to` |
| POST | /availability | doctor | splits range into slots, idempotent |
| DELETE | /availability/:id | doctor | open slots only |
| POST | /consultations | patient | needs `Idempotency-Key` header |
| GET | /consultations/:id | patient / doctor / admin | participants only |
| PATCH | /consultations/:id/start, /complete | doctor | |
| POST | /payments | patient | needs `Idempotency-Key` header |
| POST | /prescriptions | doctor | encrypted at rest |
| GET | /prescriptions/consultation/:id | patient / doctor | audited |
| GET | /admin/analytics | admin | |
| GET | /admin/audit-logs | admin | filters: action, actorId |
| GET | /health, /metrics | public | |

Authenticated routes use `Authorization: Bearer <accessToken>`.

### Example flow

```bash
# register + login
curl -X POST localhost:3000/auth/register -H "Content-Type: application/json" \
  -d '{"email":"p@example.com","password":"password123","role":"patient","fullName":"Pawan"}'

# book (idempotent: same key returns same booking)
curl -X POST localhost:3000/consultations \
  -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: book-0001" \
  -H "Content-Type: application/json" -d '{"slotId":"<slot-uuid>"}'

# pay
curl -X POST localhost:3000/payments \
  -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: pay-0001" \
  -H "Content-Type: application/json" -d '{"consultationId":"<id>"}'
```

## Key design decisions

- **No double booking:** `SELECT ... FOR UPDATE` on the slot row, plus a partial unique index (`one active consultation per slot`) as a second safety net.
- **Idempotency:** `Idempotency-Key` on booking and payment; unique `(patient_id, key)` and `(consultation_id, key)` constraints; replays return the original result.
- **Saga:** reserve slot (held) -> pay -> confirm, or compensate (release slot). Gateway call happens outside DB transactions. A background job releases expired holds.
- **Security:** bcrypt, short-lived JWTs, RBAC middleware, TOTP MFA, Zod validation, rate limiting on auth, helmet, AES-256-GCM for prescriptions, append-only audit log, ownership checks (404 instead of 403 to avoid leaking existence).

## Tests

```bash
createdb telemedicine_test            # once; then migrate it using .env.test
npm test
```

Covers: 10 concurrent bookings for one slot (exactly one wins), idempotent replay, RBAC.
Test config lives in `.env.test` (git-ignored).

## CI

`.github/workflows/ci.yml`: starts Postgres, runs migrations and tests, runs `npm audit`, builds the Docker image.

## Observability

- `GET /metrics`: Prometheus format (request count, latency histogram, Node stats)
- p95 latency query: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))`
- Structured JSON logs with `X-Request-Id` on every request

## Documentation

- `docs/architecture.md`
- `docs/security.md` (checklist and threat model)
- `docs/openapi.yaml`