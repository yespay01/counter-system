'use strict';

const { authQuery, withTenant } = require('../../lib/db');
const { AppError } = require('../../lib/errors');
const logger = require('../../lib/logger');

/**
 * slug로 tenant 조회 — 공개 API용 (RLS 컨텍스트 없음)
 */
async function findBySlug(slug) {
    const res = await authQuery(
        `SELECT t.id, t.slug, t.name, t.industry_type, t.status, t.sandbox_mode,
                s.status AS subscription_status, s.trial_ends_at
         FROM tenants t
         LEFT JOIN subscriptions s ON s.tenant_id = t.id
         WHERE t.slug = $1 AND t.status = 'active'
         LIMIT 1`,
        [slug]
    );
    if (res.rows.length === 0) {
        throw new AppError(404, '존재하지 않는 업체입니다.', 'TENANT_NOT_FOUND');
    }
    return res.rows[0];
}

/**
 * tenant 기본 설정 조회
 */
async function getSettings(tenantId) {
    return withTenant(tenantId, async (client) => {
        const res = await client.query(
            'SELECT * FROM tenant_settings WHERE tenant_id = $1',
            [tenantId]
        );
        return res.rows[0] || null;
    });
}

/**
 * tenant 기본 설정 업데이트
 */
async function updateSettings(tenantId, updates) {
    const allowed = [
        'counter_count', 'ticket_digits', 'phone_input_enabled',
        'qr_join_enabled', 'menu_selection_enabled',
    ];
    const fields = Object.keys(updates).filter((k) => allowed.includes(k));
    if (fields.length === 0) {
        throw new AppError(400, '업데이트할 항목이 없습니다.', 'NO_UPDATE_FIELDS');
    }

    const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const values = fields.map((f) => updates[f]);

    return withTenant(tenantId, async (client) => {
        const res = await client.query(
            `UPDATE tenant_settings
             SET ${setClauses}, updated_at = NOW()
             WHERE tenant_id = $1
             RETURNING *`,
            [tenantId, ...values]
        );
        return res.rows[0];
    });
}

// ── Categories ─────────────────────────────────────────────────

async function getCategories(tenantId) {
    return withTenant(tenantId, async (client) => {
        const res = await client.query(
            `SELECT code, name, display_order, is_active
             FROM categories WHERE tenant_id = $1
             ORDER BY display_order, name`,
            [tenantId]
        );
        return res.rows;
    });
}

async function upsertCategory(tenantId, { code, name, displayOrder, isActive }) {
    if (!code || !name) throw new AppError(400, 'code, name 필요', 'MISSING_FIELDS');
    return withTenant(tenantId, async (client) => {
        const res = await client.query(
            `INSERT INTO categories (tenant_id, code, name, display_order, is_active)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (tenant_id, code)
             DO UPDATE SET name = EXCLUDED.name,
                           display_order = EXCLUDED.display_order,
                           is_active = EXCLUDED.is_active
             RETURNING *`,
            [tenantId, code.toUpperCase(), name, displayOrder ?? 0, isActive ?? true]
        );
        return res.rows[0];
    });
}

// ── Menu Items ─────────────────────────────────────────────────

async function getMenuItems(tenantId) {
    return withTenant(tenantId, async (client) => {
        const res = await client.query(
            `SELECT code, name, display_order, is_active
             FROM menu_items WHERE tenant_id = $1
             ORDER BY display_order, name`,
            [tenantId]
        );
        return res.rows;
    });
}

async function upsertMenuItem(tenantId, { code, name, displayOrder, isActive }) {
    if (!code || !name) throw new AppError(400, 'code, name 필요', 'MISSING_FIELDS');
    return withTenant(tenantId, async (client) => {
        const res = await client.query(
            `INSERT INTO menu_items (tenant_id, code, name, display_order, is_active)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (tenant_id, code)
             DO UPDATE SET name = EXCLUDED.name,
                           display_order = EXCLUDED.display_order,
                           is_active = EXCLUDED.is_active
             RETURNING *`,
            [tenantId, code.toUpperCase(), name, displayOrder ?? 0, isActive ?? true]
        );
        return res.rows[0];
    });
}

// ── Dashboard Stats ────────────────────────────────────────────

async function getDashboardStats(tenantId) {
    return withTenant(tenantId, async (client) => {
        const sessionRes = await client.query(
            `SELECT id FROM queue_sessions
             WHERE tenant_id = $1 AND status = 'open'
             ORDER BY opened_at DESC LIMIT 1`,
            [tenantId]
        );
        const sessionId = sessionRes.rows[0]?.id || null;

        const [itemStats, msgStats, subRes, usageRes] = await Promise.all([
            sessionId
                ? client.query(
                    `SELECT
                         COUNT(*) FILTER (WHERE status != 'cancelled') AS total_issued,
                         COUNT(*) FILTER (WHERE status = 'waiting')    AS waiting_count,
                         COUNT(*) FILTER (WHERE status = 'called')     AS called_count,
                         COUNT(*) FILTER (WHERE status = 'done')       AS done_count
                     FROM queue_items WHERE session_id = $1`,
                    [sessionId]
                )
                : Promise.resolve({ rows: [{ total_issued: '0', waiting_count: '0', called_count: '0', done_count: '0' }] }),
            client.query(
                `SELECT
                     COUNT(*) FILTER (WHERE status = 'sent'    AND sandbox = FALSE) AS sent_count,
                     COUNT(*) FILTER (WHERE status = 'failed'  AND sandbox = FALSE) AS failed_count,
                     COUNT(*) FILTER (WHERE sandbox = TRUE)                         AS preview_count
                 FROM sms_logs
                 WHERE tenant_id = $1 AND requested_at >= CURRENT_DATE`,
                [tenantId]
            ),
            client.query(
                `SELECT status, trial_ends_at, current_period_end, plan_code
                 FROM subscriptions WHERE tenant_id = $1`,
                [tenantId]
            ),
            client.query(
                `SELECT year_month, ata_sent, sms_sent, lms_sent,
                        issue_sent, ready_sent, call_sent,
                        billable_count, billed_amount
                 FROM usage_monthly WHERE tenant_id = $1
                 ORDER BY year_month DESC LIMIT 3`,
                [tenantId]
            ),
        ]);

        return {
            session:      sessionId ? { id: sessionId } : null,
            items:        itemStats.rows[0],
            messages:     msgStats.rows[0],
            subscription: subRes.rows[0] || null,
            usageMonthly: usageRes.rows,
        };
    });
}

// ── Subscription ───────────────────────────────────────────────

/**
 * 구독 정보 + 월별 사용량 + 정산 이력 (Phase 4 확장)
 */
async function getSubscription(tenantId) {
    return withTenant(tenantId, async (client) => {
        const subRes = await client.query(
            `SELECT id, plan_code, status, trial_ends_at,
                    current_period_start, current_period_end,
                    billing_method, activated_at, last_paid_at, memo
             FROM subscriptions WHERE tenant_id = $1`,
            [tenantId]
        );
        const usageRes = await client.query(
            `SELECT year_month,
                    ata_sent, sms_sent, lms_sent,
                    issue_sent, ready_sent, call_sent,
                    billable_count, provider_cost_amount, billed_amount, margin_amount
             FROM usage_monthly WHERE tenant_id = $1
             ORDER BY year_month DESC LIMIT 6`,
            [tenantId]
        );
        const billingRes = await client.query(
            `SELECT id, year_month, plan_amount, message_amount, total_amount,
                    payment_method, status, memo, created_at
             FROM billing_logs WHERE tenant_id = $1
             ORDER BY created_at DESC LIMIT 12`,
            [tenantId]
        );
        return {
            subscription: subRes.rows[0] || null,
            usageMonthly: usageRes.rows,
            billingLogs:  billingRes.rows,
        };
    });
}

// ── Message Settings ───────────────────────────────────────────

async function getMessageSettings(tenantId) {
    return withTenant(tenantId, async (client) => {
        const res = await client.query(
            `SELECT message_channel_mode, sms_fallback_enabled,
                    solapi_pfid, solapi_sender,
                    solapi_template_issue, solapi_template_ready, solapi_template_call
             FROM tenant_settings WHERE tenant_id = $1`,
            [tenantId]
        );
        return res.rows[0] || null;
    });
}

async function updateMessageSettings(tenantId, updates) {
    const allowed = [
        'solapi_pfid', 'solapi_sender',
        'solapi_template_issue', 'solapi_template_ready', 'solapi_template_call',
        'message_channel_mode', 'sms_fallback_enabled',
    ];
    const fields = Object.keys(updates).filter((k) => allowed.includes(k));
    if (fields.length === 0) throw new AppError(400, '업데이트할 항목이 없습니다.', 'NO_UPDATE_FIELDS');

    const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const values = fields.map((f) => updates[f]);

    return withTenant(tenantId, async (client) => {
        const res = await client.query(
            `UPDATE tenant_settings
             SET ${setClauses}, updated_at = NOW()
             WHERE tenant_id = $1
             RETURNING message_channel_mode, sms_fallback_enabled,
                       solapi_pfid, solapi_sender,
                       solapi_template_issue, solapi_template_ready, solapi_template_call`,
            [tenantId, ...values]
        );
        return res.rows[0];
    });
}

// ── Message Logs ───────────────────────────────────────────────

/**
 * 발송 로그 조회 (Phase 4: billable/billing_amount/channel_mode 포함)
 */
async function getMessageLogs(tenantId, { limit = 50, offset = 0, status = null } = {}) {
    return withTenant(tenantId, async (client) => {
        const params = [tenantId];
        let statusClause = '';
        if (status) {
            params.push(status);
            statusClause = ` AND sl.status = $${params.length}`;
        }
        params.push(limit, offset);
        const limitIdx  = params.length - 1;
        const offsetIdx = params.length;
        const res = await client.query(
            `SELECT sl.id, sl.phone, sl.message_type, sl.channel, sl.channel_mode,
                    sl.status, sl.sandbox, sl.billable, sl.billing_amount,
                    sl.error_message, sl.sent_at, sl.requested_at,
                    qi.ticket_number
             FROM sms_logs sl
             LEFT JOIN queue_items qi ON qi.id = sl.queue_item_id
             WHERE sl.tenant_id = $1${statusClause}
             ORDER BY sl.requested_at DESC
             LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
            params
        );
        return res.rows;
    });
}

/**
 * 월별 사용량 요약 (admin/messages 사용량 탭용)
 */
async function getMonthlyUsage(tenantId, { months = 6 } = {}) {
    return withTenant(tenantId, async (client) => {
        const res = await client.query(
            `SELECT year_month,
                    ata_sent, sms_sent, lms_sent,
                    issue_sent, ready_sent, call_sent,
                    billable_count, provider_cost_amount, billed_amount, margin_amount
             FROM usage_monthly WHERE tenant_id = $1
             ORDER BY year_month DESC LIMIT $2`,
            [tenantId, months]
        );
        return res.rows;
    });
}

module.exports = {
    findBySlug, getSettings, updateSettings,
    getCategories, upsertCategory,
    getMenuItems, upsertMenuItem,
    getDashboardStats, getSubscription,
    getMessageSettings, updateMessageSettings,
    getMessageLogs, getMonthlyUsage,
};
