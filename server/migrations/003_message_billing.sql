-- Phase 4: 메시지 과금 구조 확장
-- 실행: npm run migrate (DATABASE_SUPERUSER_URL 필요)

-- ============================================================
-- sms_logs 컬럼 추가 (billing 관련)
-- ============================================================

ALTER TABLE sms_logs
    ADD COLUMN IF NOT EXISTS channel_mode       VARCHAR(16) NOT NULL DEFAULT 'platform_shared'
                                                    CHECK (channel_mode IN ('platform_shared', 'tenant_owned')),
    ADD COLUMN IF NOT EXISTS billable           BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS provider_unit_cost INTEGER,   -- 원가 (원, NULL = 비과금)
    ADD COLUMN IF NOT EXISTS billing_unit_price INTEGER,   -- 청구 단가 (원)
    ADD COLUMN IF NOT EXISTS billing_amount     INTEGER;   -- 청구 금액 (원, 1건 × 단가)

-- ============================================================
-- usage_monthly 컬럼 추가 (메시지 타입별 + 정산)
-- ============================================================

ALTER TABLE usage_monthly
    ADD COLUMN IF NOT EXISTS issue_sent           INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ready_sent           INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS call_sent            INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS billable_count       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS provider_cost_amount INTEGER NOT NULL DEFAULT 0,  -- 원가 합계 (원)
    ADD COLUMN IF NOT EXISTS billed_amount        INTEGER NOT NULL DEFAULT 0,  -- 청구 합계 (원)
    ADD COLUMN IF NOT EXISTS margin_amount        INTEGER NOT NULL DEFAULT 0;  -- 마진 합계 (원)

-- ============================================================
-- billing_logs 테이블 (수동 정산 이력)
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_logs (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    year_month     CHAR(7)     NOT NULL,      -- 'YYYY-MM'
    plan_amount    INTEGER     NOT NULL DEFAULT 0,   -- 구독료 (원)
    message_amount INTEGER     NOT NULL DEFAULT 0,   -- 메시지 청구액 (원)
    total_amount   INTEGER     NOT NULL DEFAULT 0,   -- 합계 (원)
    payment_method VARCHAR(32) NOT NULL DEFAULT 'bank_transfer',
    status         VARCHAR(16) NOT NULL DEFAULT 'confirmed'
                       CHECK (status IN ('confirmed', 'pending', 'cancelled')),
    memo           TEXT,
    created_by     TEXT,       -- superadmin 식별자
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 인덱스
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_billing_logs_tenant ON billing_logs(tenant_id, year_month);
CREATE INDEX IF NOT EXISTS idx_sms_logs_billable   ON sms_logs(tenant_id, billable, requested_at);

-- ============================================================
-- 권한
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON billing_logs TO counter_app;
GRANT SELECT                         ON billing_logs TO counter_auth;

-- ============================================================
-- Row-Level Security
-- ============================================================

ALTER TABLE billing_logs ENABLE ROW LEVEL SECURITY;

-- counter_app: 자기 테넌트만 (strict RLS)
CREATE POLICY billing_logs_app ON billing_logs FOR ALL TO counter_app
    USING  (tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

-- counter_auth: SELECT 전체 허용 (superadmin 교차 테넌트 조회용)
CREATE POLICY billing_logs_auth ON billing_logs FOR SELECT TO counter_auth
    USING (TRUE);
