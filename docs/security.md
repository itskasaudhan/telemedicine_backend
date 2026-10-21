# Security: Checklist and Threat Model

## 1. Data classification

| Class | Examples | Controls |
|---|---|---|
| Restricted (PHI) | Prescription content | AES-256-GCM at rest (random IV + auth tag per record), access limited to the consultation's patient and doctor, every read audited, never logged |
| Confidential | Password hashes, MFA secrets, JWT secrets, encryption key | bcrypt (cost 12), secrets only via environment variables, never returned by the API or logged |
| Internal | Audit logs, payments, consultations | Admin-only read (audit), ownership checks (consultations, payments) |
| Public | Doctor name, specialty, fee, open slots | Authenticated read only |

## 2. Attack surface

| Entry point | Risks | Mitigation |
|---|---|---|
| `/auth/*` | Credential stuffing, brute force, user enumeration | Rate limit (10/min/IP), bcrypt, identical error for wrong email or password, TOTP MFA |
| Protected REST routes | Broken access control, IDOR | JWT verify + role middleware; `doctorId` / `patientId` always taken from the token, never from the body; non-participants get 404 |
| Booking / payment writes | Duplicate charges, double booking, replay | `Idempotency-Key`, row lock, unique constraints |
| `/admin/*` | Privilege escalation | Admin role cannot be self-registered (only via seed script); router-level `authorize('admin')` |
| `/metrics` | Information disclosure | Must be reachable only from the internal network (see checklist) |
| Database | SQL injection, data theft | Parameterized queries only, least-privilege DB user (deployment), encrypted prescriptions |
| Dependencies / image | Known CVEs | `npm audit` in CI, minimal `node:20-alpine` image, non-root user |

## 3. OWASP Top 10 mapping

| OWASP (2021) | Status | How |
|---|---|---|
| A01 Broken access control | Mitigated | RBAC middleware, ownership checks, IDs from token, 404 instead of 403 for foreign resources |
| A02 Cryptographic failures | Mitigated | bcrypt, AES-256-GCM, short-lived JWT, HSTS via helmet; TLS terminated at load balancer (deployment) |
| A03 Injection | Mitigated | Parameterized SQL everywhere, Zod validation on all bodies and queries |
| A04 Insecure design | Mitigated | Idempotency, saga with compensation, state-machine checks on consultation status |
| A05 Security misconfiguration | Partly | helmet headers, env validation at startup (fails fast), non-root container. To do: restrict CORS origins and `/metrics` in production |
| A06 Vulnerable components | Mitigated | `npm audit` in CI, pinned lockfile |
| A07 Authentication failures | Mitigated | bcrypt, MFA, rate limiting, 15 min access tokens. Gap: refresh token revocation (see section 6) |
| A08 Integrity failures | Partly | CI builds from lockfile (`npm ci`). To do: image signing |
| A09 Logging and monitoring failures | Mitigated | Audit log on booking, payment, lifecycle, prescription read/write; structured logs with request IDs |
| A10 SSRF | Low risk | The server makes no requests to user-supplied URLs |

## 4. Threat model (STRIDE)

| Threat | Example | Mitigation |
|---|---|---|
| Spoofing | Stolen password | MFA, rate limit, short token life |
| Tampering | Patient edits another patient's booking; altered ciphertext | Ownership checks; GCM auth tag makes tampered ciphertext fail to decrypt |
| Repudiation | "I never read that prescription" | Append-only audit log with actor, action, entity, IP, time |
| Information disclosure | DB dump leaked | Prescriptions encrypted; passwords hashed; no PHI in logs |
| Denial of service | Request flooding, slot hoarding | Rate limits, 100 KB body limit, slot hold expires in 10 min, pagination caps |
| Elevation of privilege | Patient calls admin or doctor API | Role middleware on every route, admin only via seed |

## 5. Encryption and key rotation

- **In transit:** TLS at the load balancer; HSTS header set.
- **At rest:** prescriptions use AES-256-GCM, format `iv.tag.ciphertext`.
- **Key rotation plan:**
  1. Store keys in a secrets manager with ids (`k1`, `k2`).
  2. Prefix each ciphertext with its key id (`k1:iv.tag.ct`); decrypt picks the key by id.
  3. Rotate: add `k2` as the active key for new writes, keep `k1` for reads.
  4. Background job re-encrypts old rows to `k2`, then retire `k1`.
  5. Rotate JWT secrets the same way (accept old and new for one access-token lifetime).
  Rotate on a schedule (for example every 90 days) and immediately after any suspected leak.
  Current code uses a single key (no key id yet); this is the documented next step.

## 6. Security checklist

Implemented:
- [x] Passwords hashed with bcrypt (cost 12)
- [x] JWT access (15 min) and refresh (7 days) tokens, separate secrets
- [x] TOTP MFA (setup, verify, enforced at login)
- [x] RBAC on every protected route; admin cannot self-register
- [x] Zod validation on bodies and queries; body size limit
- [x] Parameterized SQL only
- [x] Rate limiting on auth endpoints
- [x] helmet security headers
- [x] Idempotency on booking, payment, slot creation
- [x] Row locking and unique constraints against double booking
- [x] Prescriptions encrypted at rest, reads audited
- [x] Audit logs written in the same transaction as the change
- [x] Secrets only from environment variables, `.env` git-ignored, startup validation
- [x] Non-root Docker user, slim base image, `.dockerignore` excludes `.env`
- [x] `npm audit` in CI
- [x] Mock-failure switch disabled when `NODE_ENV=production`

Known gaps (honest list):
- [ ] Refresh tokens cannot be revoked yet (plan: store token ids in Redis, delete on logout/rotation)
- [ ] Rate limiter is in-memory per instance (plan: Redis store)
- [ ] MFA secret stored as plain text in DB (plan: encrypt with the AES key)
- [ ] MFA recovery codes and brute-force lockout per account
- [ ] `/metrics` is public (restrict to internal network or add auth)
- [ ] CORS is open (restrict to known origins in production)
- [ ] Single encryption key, no key id yet (see section 5)
- [ ] Audit log is append-only by convention; production should revoke UPDATE/DELETE on it for the app DB user
- [ ] Default admin password in seed script is for dev only; set `ADMIN_PASSWORD` in deployment
- [ ] OpenTelemetry tracing not yet added