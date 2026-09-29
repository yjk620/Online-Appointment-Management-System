CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('client', 'provider', 'admin'))
);

CREATE TABLE IF NOT EXISTS provider_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS availability (
    id INTEGER PRIMARY KEY,
    provider_id INTEGER NOT NULL REFERENCES users(id),
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    CHECK (starts_at < ends_at),
    UNIQUE (provider_id, starts_at)
);

CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES users(id),
    availability_id INTEGER NOT NULL REFERENCES availability(id),
    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no-show'))
);

CREATE INDEX IF NOT EXISTS idx_availability_provider_start
    ON availability(provider_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_client
    ON appointments(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_appointment_slot
    ON appointments(availability_id)
    WHERE status != 'cancelled';

CREATE TABLE IF NOT EXISTS pending_providers (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
