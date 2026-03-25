-- Phase 1: 기반 스키마
-- 실행: DATABASE_SUPERUSER_URL 기준으로 npm run migrate (CREATEROLE 권한 필요)
-- 런타임 역할: counter_app (strict RLS), counter_auth (auth 전용, 오픈 RLS)
-- 슈퍼유저 연결은 마이그레이션 시에만 사용, PM2/런타임에 포함하지 않음

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Roles
-- ============================================================

DO $$
BEGIN
    -- 런타임 API 역할 (authenticated 경로, strict RLS)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'counter_app') THEN
        CREATE ROLE counter_app LOGIN PASSWORD 'change_this_app_password';
    END IF;
    -- 런타임 auth 역할 (signup/login/refresh 전용, 오픈 RLS, BYPASSRLS 아님)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'counter_auth') THEN
        CREATE ROLE counter_auth LOGIN PASSWORD 'change_this_auth_password';
    END IF;
END$$;

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS tenants (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          VARCHAR(64)  NOT NULL,
    name          VARCHAR(255) NOT NULL,
    industry_type VARCHAR(64),
    status        VARCHAR(32)  NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'suspended', 'deleted')),
    timezone      VARCHAR(64)  NOT NULL DEFAULT 'Asia/Seoul',
    sandbox_mode  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT tenants_slug_unique UNIQUE (slug),
    CONSTRAINT tenants_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$')
);

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email         VARCHAR(255) NOT NULL,
    password_hash TEXT         NOT NULL,
    role          VARCHAR(32)  NOT NULL DEFAULT 'owner'
                      CHECK (role IN ('owner', 'admin', 'staff')),
    status        VARCHAR(32)  NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'inactive', 'suspended')),
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash TEXT        NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id              UUID    PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    counter_count          INTEGER NOT NULL DEFAULT 1,
    ticket_digits          INTEGER NOT NULL DEFAULT 3,
    phone_input_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    qr_join_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    menu_selection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    message_channel_mode   VARCHAR(32) NOT NULL DEFAULT 'platform_shared'
                               CHECK (message_channel_mode IN ('platform_shared', 'tenant_owned')),
    sms_fallback_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_code            VARCHAR(64) NOT NULL DEFAULT 'solo_trial',
    status               VARCHAR(32) NOT NULL DEFAULT 'trial'
                             CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'suspended')),
    trial_ends_at        TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    billing_method       VARCHAR(32),
    activated_at         TIMESTAMPTZ,
    last_paid_at         TIMESTAMPTZ,
    memo                 TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_tenant_id     ON users(tenant_id);
-- 글로벌 이메일 유니크: LOWER() 기반 (대소문자 무관, 전역 중복 방지)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_global ON users(LOWER(email));

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ============================================================
-- Permissions
-- ============================================================

-- counter_app: 모든 테이블 읽기/쓰기 (RLS가 실제 접근 범위를 제한)
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants         TO counter_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON users           TO counter_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens  TO counter_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_settings TO counter_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions   TO counter_app;

-- counter_auth: 실제 auth 흐름에서 사용하는 최소 권한만
-- tenants:         SELECT(slug 조회·중복 확인), INSERT(signup)
-- users:           SELECT(login·refresh), INSERT(signup), UPDATE(last_login_at)
-- refresh_tokens:  SELECT(refresh), INSERT(login·signup·refresh), DELETE(refresh·logout)
-- tenant_settings: INSERT(signup 기본값 생성)
-- subscriptions:   SELECT(slug 조회), INSERT(signup trial 생성)
GRANT SELECT, INSERT          ON tenants         TO counter_auth;
GRANT SELECT, INSERT, UPDATE  ON users           TO counter_auth;
GRANT SELECT, INSERT, DELETE  ON refresh_tokens  TO counter_auth;
GRANT INSERT                  ON tenant_settings TO counter_auth;
GRANT SELECT, INSERT          ON subscriptions   TO counter_auth;

-- ============================================================
-- Row-Level Security
-- ============================================================

ALTER TABLE tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions   ENABLE ROW LEVEL SECURITY;

-- ── counter_app: strict RLS (context 미설정 시 전체 차단) ──────────

DROP POLICY IF EXISTS tenants_app ON tenants;
CREATE POLICY tenants_app ON tenants FOR ALL TO counter_app
    USING  (id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (id::text = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS users_app ON users;
CREATE POLICY users_app ON users FOR ALL TO counter_app
    USING  (tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS refresh_tokens_app ON refresh_tokens;
CREATE POLICY refresh_tokens_app ON refresh_tokens FOR ALL TO counter_app
    USING  (tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS tenant_settings_app ON tenant_settings;
CREATE POLICY tenant_settings_app ON tenant_settings FOR ALL TO counter_app
    USING  (tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS subscriptions_app ON subscriptions;
CREATE POLICY subscriptions_app ON subscriptions FOR ALL TO counter_app
    USING  (tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

-- ── counter_auth: 오픈 RLS (BYPASSRLS 없이 정책으로 전체 허용) ────
-- signup/login/refresh/slug 공개 조회 전용. 다른 경로에서는 사용 금지.

DROP POLICY IF EXISTS tenants_auth ON tenants;
CREATE POLICY tenants_auth ON tenants FOR ALL TO counter_auth
    USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS users_auth ON users;
CREATE POLICY users_auth ON users FOR ALL TO counter_auth
    USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS refresh_tokens_auth ON refresh_tokens;
CREATE POLICY refresh_tokens_auth ON refresh_tokens FOR ALL TO counter_auth
    USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS tenant_settings_auth ON tenant_settings;
CREATE POLICY tenant_settings_auth ON tenant_settings FOR ALL TO counter_auth
    USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS subscriptions_auth ON subscriptions;
CREATE POLICY subscriptions_auth ON subscriptions FOR ALL TO counter_auth
    USING (TRUE) WITH CHECK (TRUE);

-- ============================================================
-- Migration tracking (슈퍼유저 전용)
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
