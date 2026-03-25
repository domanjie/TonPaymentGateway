-- TonPaymentGateway Database Schema
-- PostgreSQL 15+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- MERCHANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS merchants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id     BIGINT UNIQUE NOT NULL,
    username        VARCHAR(255),
    wallet_address  VARCHAR(512),
    name            VARCHAR(255),
    webhook_url     TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- API KEYS
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    key             VARCHAR(256) UNIQUE NOT NULL,
    key_type        VARCHAR(20) NOT NULL CHECK (key_type IN ('pk_live', 'sk_live', 'pk_test', 'sk_test')),
    name            VARCHAR(255),
    permissions     JSONB DEFAULT '["payments:read","payments:write"]'::jsonb,
    last_used_at    TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
CREATE INDEX IF NOT EXISTS idx_api_keys_merchant ON api_keys(merchant_id);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    amount          NUMERIC(20, 9) NOT NULL,
    currency        VARCHAR(10) NOT NULL DEFAULT 'TON',
    description     TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'awaiting_payment', 'confirmed', 'failed', 'expired', 'refunded')),
    memo            VARCHAR(512) UNIQUE NOT NULL,
    wallet_address  VARCHAR(512),
    tx_hash         VARCHAR(512),
    metadata        JSONB DEFAULT '{}'::jsonb,
    webhook_url     TEXT,
    expires_at      TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ,
    refunded_at     TIMESTAMPTZ,
    failed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_merchant ON payments(merchant_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_memo ON payments(memo);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);

-- ============================================================
-- WEBHOOKS (configurations)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhooks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    secret          VARCHAR(256) NOT NULL,
    events          TEXT[] DEFAULT ARRAY['payment.confirmed','payment.failed','payment.refunded'],
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_merchant ON webhooks(merchant_id);

-- ============================================================
-- WEBHOOK DELIVERIES (delivery log)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id      UUID REFERENCES webhooks(id) ON DELETE SET NULL,
    payment_id      UUID REFERENCES payments(id) ON DELETE CASCADE,
    event           VARCHAR(50) NOT NULL,
    payload         JSONB NOT NULL,
    status          VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending', 'delivered', 'failed')),
    attempt_count   INT DEFAULT 0,
    next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
    last_response   TEXT,
    last_status_code INT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    delivered_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_del_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_del_payment ON webhook_deliveries(payment_id);

-- ============================================================
-- FRAUD FLAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS fraud_flags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id      UUID REFERENCES payments(id) ON DELETE CASCADE,
    wallet_address  VARCHAR(512),
    reason          TEXT,
    score           NUMERIC(5, 2) DEFAULT 0,
    reviewed        BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID REFERENCES merchants(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(50),
    entity_id       UUID,
    data            JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_merchant ON audit_log(merchant_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
