'use strict';

const { authQuery, withTenant } = require('../../lib/db');
const { AppError } = require('../../lib/errors');

const VALID_STATUSES = ['trial', 'active', 'past_due', 'cancelled', 'suspended'];

/** 전체 테넌트 목록 + 구독 상태 */
async function listTenants() {
    const res = await authQuery(
        `SELECT t.id, t.slug, t.name, t.industry_type, t.status,
                t.sandbox_mode, t.created_at,
                s.status        AS subscription_status,
                s.plan_code,
                s.trial_ends_at,
                s.current_period_end,
                s.last_paid_at,
                s.memo
         FROM tenants t
         LEFT JOIN subscriptions s ON s.tenant_id = t.id
         ORDER BY t.created_at DESC`
    );
    return res.rows;
}

/**
 * 수동 구독 상태 변경
 * status = 'active' 시 sandbox_mode 자동 해제 + activated_at 기록
 */
async function updateTenantSubscription(tenantId, { status, memo }) {
    if (!VALID_STATUSES.includes(status)) {
        throw new AppError(400, `유효하지 않은 status: ${status}`, 'INVALID_STATUS');
    }

    return withTenant(tenantId, async (client) => {
        const res = await client.query(
            `UPDATE subscriptions
             SET status       = $2,
                 memo         = COALESCE($3, memo),
                 activated_at = CASE
                                    WHEN $4 AND activated_at IS NULL
                                    THEN NOW()
                                    ELSE activated_at
                                END,
                 updated_at   = NOW()
             WHERE tenant_id = $1
             RETURNING *`,
            [tenantId, status, memo || null, status === 'active']
        );
        if (!res.rows.length) throw new AppError(404, '구독 정보가 없습니다.', 'NOT_FOUND');

        if (status === 'active') {
            await client.query(
                'UPDATE tenants SET sandbox_mode = FALSE WHERE id = $1',
                [tenantId]
            );
        }

        return res.rows[0];
    });
}

/**
 * 수동 정산 이력 생성
 * - 계좌이체 확인 후 superadmin이 수동으로 기록
 * - 실제 PG 연동 없음 (Solo MVP 수동 처리)
 */
async function createBillingLog(tenantId, {
    yearMonth, planAmount = 0, messageAmount = 0,
    paymentMethod = 'bank_transfer', status = 'confirmed', memo, createdBy,
}) {
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
        throw new AppError(400, 'yearMonth 형식 오류 (YYYY-MM)', 'INVALID_YEAR_MONTH');
    }

    const totalAmount = (planAmount || 0) + (messageAmount || 0);

    return withTenant(tenantId, async (client) => {
        const res = await client.query(
            `INSERT INTO billing_logs
                (tenant_id, year_month, plan_amount, message_amount, total_amount,
                 payment_method, status, memo, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                tenantId, yearMonth, planAmount, messageAmount, totalAmount,
                paymentMethod, status, memo || null, createdBy || null,
            ]
        );
        return res.rows[0];
    });
}

/**
 * 특정 테넌트의 정산 이력 조회 (superadmin용)
 */
async function listBillingLogs(tenantId) {
    return withTenant(tenantId, async (client) => {
        const res = await client.query(
            `SELECT id, year_month, plan_amount, message_amount, total_amount,
                    payment_method, status, memo, created_by, created_at
             FROM billing_logs
             WHERE tenant_id = $1
             ORDER BY created_at DESC
             LIMIT 20`,
            [tenantId]
        );
        return res.rows;
    });
}

module.exports = {
    listTenants,
    updateTenantSubscription,
    createBillingLog,
    listBillingLogs,
};
