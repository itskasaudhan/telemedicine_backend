CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- USERS
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('patient','doctor','admin')),
  mfa_secret    TEXT,
  mfa_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PROFILES (one per user)
CREATE TABLE profiles (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name  VARCHAR(150) NOT NULL,
  phone      VARCHAR(20),
  dob        DATE,
  gender     VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DOCTORS (one per doctor user)
CREATE TABLE doctors (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  specialty      VARCHAR(100) NOT NULL,
  experience_yrs INT NOT NULL DEFAULT 0,
  fee            NUMERIC(10,2) NOT NULL,
  license_no     VARCHAR(100) NOT NULL UNIQUE,
  is_verified    BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_doctors_specialty ON doctors(specialty);

-- AVAILABILITY SLOTS
CREATE TABLE availability_slots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  UUID NOT NULL REFERENCES doctors(user_id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time   TIMESTAMPTZ NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','held','booked')),
  held_until TIMESTAMPTZ,
  CHECK (end_time > start_time),
  UNIQUE (doctor_id, start_time)
);
CREATE INDEX idx_slots_doctor_time ON availability_slots(doctor_id, start_time) WHERE status = 'open';

-- CONSULTATIONS
CREATE TABLE consultations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES users(id),
  doctor_id       UUID NOT NULL REFERENCES doctors(user_id),
  slot_id         UUID NOT NULL UNIQUE REFERENCES availability_slots(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending_payment'
                  CHECK (status IN ('pending_payment','confirmed','in_progress','completed','cancelled')),
  notes           TEXT,
  idempotency_key VARCHAR(100) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (patient_id, idempotency_key)
);
CREATE INDEX idx_consult_patient ON consultations(patient_id, created_at DESC);
CREATE INDEX idx_consult_doctor  ON consultations(doctor_id, created_at DESC);

-- PRESCRIPTIONS (content stored encrypted)
CREATE TABLE prescriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL UNIQUE REFERENCES consultations(id),
  content_enc     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PAYMENTS
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES consultations(id),
  amount          NUMERIC(10,2) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','succeeded','failed','refunded')),
  provider_ref    VARCHAR(100),
  idempotency_key VARCHAR(100) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (consultation_id, idempotency_key)
);

-- AUDIT LOGS (append-only)
CREATE TABLE audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   UUID,
  action     VARCHAR(100) NOT NULL,
  entity     VARCHAR(50)  NOT NULL,
  entity_id  VARCHAR(100),
  ip         VARCHAR(64),
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);