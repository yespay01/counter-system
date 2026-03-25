-- Phase 2: 대기열 + 메시지 스키마
-- 실행: npm run migrate (DATABASE_SUPERUSER_URL 필요)

-- tenant_settings에 메시지 설정 컬럼 추가
ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS solapi_pfid           TEXT,
    ADD COLUMN IF NOT EXISTS solapi_sender         VARCHAR(20),
    ADD COLUMN IF NOT EXISTS solapi_template_issue VARCHAR(64),
    ADD COLUMN IF NOT EXISTS solapi_template_ready VARCHAR(64),
    ADD COLUMN IF NOT EXISTS solapi_template_call  VARCHAR(64);

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code          VARCHAR(32) NOT NULL,
    name          VARCHAR(255) NOT NULL,
    display_order INTEGER     NOT NULL DEFAULT 0,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS menu_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code          VARCHAR(32) NOT NULL,
    name          VARCHAR(255) NOT NULL,
    display_order INTEGER     NOT NULL DEFAULT 0,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS queue_sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    business_date DATE  NOT NULL,
    status        VARCHAR(16) NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'closed')),
    opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at     TIMESTAMPTZ,
    UNIQUE (tenant_id, business_date)
);

CREATE TABLE IF NOT EXISTS queue_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id     UUID        NOT NULL REFERENCES queue_sessions(id) ON DELETE CASCADE,
    ticket_number  VARCHAR(32) NOT NULL,
    category_code  VARCHAR(32) NOT NULL,
    customer_phone VARCHAR(20),
    entry_channel  VARCHAR(32) NOT NULL DEFAULT 'solo_tablet'
                       CHECK (entry_channel IN ('solo_tablet', 'qr_self')),
    menu_code      VARCHAR(32),
    menu_label     VARCHAR(255),
    channel        VARCHAR(16) NOT NULL DEFAULT 'sms'
                       CHECK (channel IN ('paper', 'sms')),
    status         VARCHAR(16) NOT NULL DEFAULT 'waiting'
                       CHECK (status IN ('waiting', 'called', 'done', 'skipped', 'cancelled')),
    issued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    called_at      TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,
    UNIQUE (session_id, ticket_number)
);

-- 창구당 1개. UPSERT로 관리.
CREATE TABLE IF NOT EXISTS current_calls (
    tenant_id     UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    counter_no    INTEGER NOT NULL,
    queue_item_id UUID    REFERENCES queue_items(id) ON DELETE SET NULL,
    call_type     VARCHAR(16) NOT NULL DEFAULT 'normal'
                      CHECK (call_type IN ('normal', 'recall', 'direct')),
    called_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, counter_no)
);

CREATE TABLE IF NOT EXISTS sms_logs (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    queue_item_id        UUID        REFERENCES queue_items(id) ON DELETE SET NULL,
    phone                VARCHAR(20) NOT NULL,
    message_type         VARCHAR(16) NOT NULL CHECK (message_type IN ('issue', 'ready', 'call')),
    channel              VARCHAR(8)  NOT NULL DEFAULT 'ata'
                             CHECK (channel IN ('ata', 'sms', 'lms')),
    provider_status_code VARCHAR(16),
    status               VARCHAR(16) NOT NULL DEFAULT 'queued'
                             CHECK (status IN ('previewed', 'queued', 'sent', 'failed')),
    sandbox              BOOLEAN     NOT NULL DEFAULT FALSE,
    error_message        TEXT,
    requested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at              TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS usage_monthly (
    id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    year_month CHAR(7) NOT NULL,  -- 'YYYY-MM'
    ata_sent   INTEGER NOT NULL DEFAULT 0,
    sms_sent   INTEGER NOT NULL DEFAULT 0,
    lms_sent   INTEGER NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, year_month)
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_categories_tenant    ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant    ON menu_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_date ON queue_sessions(tenant_id, business_date);
CREATE INDEX IF NOT EXISTS idx_queue_items_session  ON queue_items(session_id);
CREATE INDEX IF NOT EXISTS idx_queue_items_status   ON queue_items(tenant_id, status, issued_at);
CREATE INDEX IF NOT EXISTS idx_sms_logs_tenant      ON sms_logs(tenant_id, requested_at);
CREATE INDEX IF NOT EXISTS idx_usage_monthly_tenant ON usage_monthly(tenant_id, year_month);

-- ============================================================
-- Permissions (counter_app only — counter_auth는 대기열 불필요)
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON categories    TO counter_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON menu_items    TO counter_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON queue_sessions TO counter_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON queue_items   TO counter_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON current_calls TO counter_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sms_logs      TO counter_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON usage_monthly TO counter_app;

-- ============================================================
-- Row-Level Security (counter_app strict)
-- ============================================================

ALTER TABLE categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE current_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY categories_app ON categories FOR ALL TO counter_app
    USING  (tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY menu_items_app ON menu_items FOR ALL TO counter_app
    USING  (tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY queue_sessions_app ON queue_sessions FOR ALL TO counter_app
    USING  (tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY queue_items_app ON queue_items FOR ALL TO counter_app
    USING  (tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY current_calls_app ON current_calls FOR ALL TO counter_app
    USING  (tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY sms_logs_app ON sms_logs FOR ALL TO counter_app
    USING  (tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY usage_monthly_app ON usage_monthly FOR ALL TO counter_app
    USING  (tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
