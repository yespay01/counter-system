-- 003b: billing 컬럼 백필 (003 마이그레이션 이전에 발송된 데이터가 있을 경우 사용)
-- 현재(2026-03-17) 파일럿 전이므로 대상 데이터 없음. 실발송 이력 생기기 전에 이미 적용됨.
-- 필요 시 수동 실행: psql $DATABASE_URL -f migrations/003b_backfill_billing.sql

-- ATA 기본 단가 기준 (env와 일치시킬 것)
-- ATA: provider=14, billing=18
-- SMS: provider=20, billing=25

-- 1. sms_logs: sent + billable 미설정 행 백필
UPDATE sms_logs
SET
    billable           = TRUE,
    provider_unit_cost = CASE channel WHEN 'ata' THEN 14 WHEN 'lms' THEN 40 ELSE 20 END,
    billing_unit_price = CASE channel WHEN 'ata' THEN 18 WHEN 'lms' THEN 50 ELSE 25 END,
    billing_amount     = CASE channel WHEN 'ata' THEN 18 WHEN 'lms' THEN 50 ELSE 25 END
WHERE status = 'sent'
  AND sandbox = FALSE
  AND billable = FALSE
  AND provider_unit_cost IS NULL;

-- 2. usage_monthly: ata_sent/sms_sent > 0 이지만 billable_count = 0 인 행 재집계
UPDATE usage_monthly um
SET
    billable_count       = (um.ata_sent + um.sms_sent + um.lms_sent),
    provider_cost_amount = (um.ata_sent * 14 + um.sms_sent * 20 + um.lms_sent * 40),
    billed_amount        = (um.ata_sent * 18 + um.sms_sent * 25 + um.lms_sent * 50),
    margin_amount        = (um.ata_sent * 4  + um.sms_sent * 5  + um.lms_sent * 10)
WHERE billable_count = 0
  AND (ata_sent > 0 OR sms_sent > 0 OR lms_sent > 0);
