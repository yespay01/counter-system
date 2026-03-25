'use strict';

const { withTenant } = require('../../lib/db');
const { AppError }   = require('../../lib/errors');
const messaging      = require('../messaging/messaging.service');
const logger         = require('../../lib/logger');
const redis          = require('../../lib/redis');

/** 테넌트 timezone 기준 오늘 날짜 (YYYY-MM-DD) */
function getBusinessDate(timezone) {
    try {
        return new Intl.DateTimeFormat('sv', { timeZone: timezone || 'Asia/Seoul' }).format(new Date());
    } catch {
        return new Intl.DateTimeFormat('sv', { timeZone: 'Asia/Seoul' }).format(new Date());
    }
}

/** 오늘 세션 조회 또는 생성 (withTenant 트랜잭션 내에서 호출)
 *  INSERT ON CONFLICT DO NOTHING + 재조회로 동시 첫 발급 race condition 방지 */
async function getOrCreateSession(tenantId, businessDate, client) {
    await client.query(
        `INSERT INTO queue_sessions (tenant_id, business_date, status, opened_at)
         VALUES ($1, $2, 'open', NOW())
         ON CONFLICT (tenant_id, business_date) DO NOTHING`,
        [tenantId, businessDate]
    );
    const res = await client.query(
        `SELECT id, status FROM queue_sessions
         WHERE tenant_id = $1 AND business_date = $2`,
        [tenantId, businessDate]
    );
    return res.rows[0];
}

/**
 * 세션+카테고리 단위 advisory lock + 다음 번호 계산
 * ticket_number 형식: "{CATEGORY_CODE}-{NNN}"
 */
async function nextTicketNumber(sessionId, categoryCode, ticketDigits, client) {
    await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        [`${sessionId}:${categoryCode}`]
    );
    const res = await client.query(
        `SELECT COALESCE(
             MAX(CAST(SPLIT_PART(ticket_number, '-', 2) AS INTEGER)), 0
         ) + 1 AS next_num
         FROM queue_items
         WHERE session_id = $1 AND category_code = $2`,
        [sessionId, categoryCode]
    );
    const num = res.rows[0].next_num;
    return `${categoryCode}-${String(num).padStart(ticketDigits || 3, '0')}`;
}

/**
 * 호출 이벤트용 메시지 설정 조회 (withTenant 내부에서 호출)
 * sandbox_mode + solapi 설정 최솟값만 가져옴
 */
async function _getMessagingContext(tenantId, client) {
    const res = await client.query(
        `SELECT t.sandbox_mode,
                ts.solapi_pfid, ts.solapi_sender,
                ts.solapi_template_call, ts.sms_fallback_enabled,
                ts.message_channel_mode
         FROM tenants t
         LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id
         WHERE t.id = $1`,
        [tenantId]
    );
    return res.rows[0] || {};
}

/** 현재 대기 현황 조회 (Redis 캐시 우선 → 미스 시 DB 조회 + 캐시 재구성) */
async function getQueueStatus(tenantId) {
    // 1. Redis 캐시 우선
    const cached = await redis.getStatus(tenantId);
    if (cached) return cached;

    // 2. DB 조회
    const result = await withTenant(tenantId, async (client) => {
        const sessionRes = await client.query(
            `SELECT id FROM queue_sessions
             WHERE tenant_id = $1 AND status = 'open'
             ORDER BY opened_at DESC LIMIT 1`,
            [tenantId]
        );
        if (!sessionRes.rows.length) {
            return { sessionId: null, waiting: [], currentCalls: [] };
        }

        const sessionId = sessionRes.rows[0].id;
        const waitingRes = await client.query(
            `SELECT id, ticket_number, category_code, issued_at
             FROM queue_items
             WHERE session_id = $1 AND status = 'waiting'
             ORDER BY issued_at ASC`,
            [sessionId]
        );
        const callsRes = await client.query(
            `SELECT cc.counter_no, cc.call_type, cc.called_at,
                    qi.ticket_number, qi.category_code
             FROM current_calls cc
             JOIN queue_items qi ON qi.id = cc.queue_item_id
             WHERE cc.tenant_id = $1`,
            [tenantId]
        );

        return {
            sessionId,
            waiting:      waitingRes.rows,
            currentCalls: callsRes.rows,
        };
    });

    // 3. Redis에 저장 (비동기 — 실패해도 응답에 영향 없음)
    redis.setStatus(tenantId, result).catch(() => {});
    return result;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * 공개 설정 조회 (/:slug/join-config)
 * counter_auth → resolveSlug로 tenant를 이미 얻은 뒤 호출
 */
async function getJoinConfig(tenantId) {
    return withTenant(tenantId, async (client) => {
        const tenantRes   = await client.query(`SELECT name FROM tenants WHERE id = $1`, [tenantId]);
        const catRes      = await client.query(
            `SELECT code, name, display_order FROM categories
             WHERE tenant_id = $1 AND is_active = TRUE
             ORDER BY display_order, name`,
            [tenantId]
        );
        const menuRes     = await client.query(
            `SELECT code, name, display_order FROM menu_items
             WHERE tenant_id = $1 AND is_active = TRUE
             ORDER BY display_order, name`,
            [tenantId]
        );
        const settingsRes = await client.query(
            `SELECT phone_input_enabled, qr_join_enabled,
                    menu_selection_enabled, counter_count, ticket_digits
             FROM tenant_settings WHERE tenant_id = $1`,
            [tenantId]
        );
        return {
            tenantName:  tenantRes.rows[0]?.name || null,
            categories:  catRes.rows,
            menuItems:   menuRes.rows,
            settings:    settingsRes.rows[0] || {},
        };
    });
}

/**
 * 번호 발급
 * entry_channel: 'solo_tablet' | 'qr_self'
 */
async function issueTicket(tenantId, { categoryCode, customerPhone, entryChannel, menuCode, menuLabel }) {
    if (!categoryCode) throw new AppError(400, 'categoryCode가 필요합니다.', 'MISSING_CATEGORY');

    let queueItem;
    let sandboxMode;
    let settings;
    let categoryName;

    await withTenant(tenantId, async (client) => {
        // tenant + settings 조회 (검증용 컬럼 포함)
        const tenantRow = await client.query(
            `SELECT t.sandbox_mode, t.timezone,
                    ts.ticket_digits, ts.sms_fallback_enabled,
                    ts.phone_input_enabled, ts.qr_join_enabled, ts.menu_selection_enabled,
                    ts.message_channel_mode,
                    ts.solapi_pfid, ts.solapi_sender, ts.solapi_template_issue
             FROM tenants t
             LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id
             WHERE t.id = $1`,
            [tenantId]
        );
        const row = tenantRow.rows[0];
        sandboxMode = row.sandbox_mode;
        settings    = row;

        // ── 설정 기반 입력 검증 ─────────────────────────────────
        if (entryChannel === 'qr_self' && !row.qr_join_enabled) {
            throw new AppError(403, 'QR 셀프 접수가 비활성화됐습니다.', 'QR_JOIN_DISABLED');
        }
        if (customerPhone && !row.phone_input_enabled) {
            throw new AppError(403, '전화번호 입력이 비활성화됐습니다.', 'PHONE_INPUT_DISABLED');
        }
        if (menuCode && !row.menu_selection_enabled) {
            throw new AppError(403, '메뉴 선택이 비활성화됐습니다.', 'MENU_SELECTION_DISABLED');
        }

        // categoryCode: 실제 카테고리 존재·활성 여부 확인
        const catRes = await client.query(
            `SELECT id, name FROM categories
             WHERE tenant_id = $1 AND code = $2 AND is_active = TRUE`,
            [tenantId, categoryCode]
        );
        if (!catRes.rows.length) {
            throw new AppError(400, '유효하지 않은 카테고리입니다.', 'INVALID_CATEGORY');
        }
        categoryName = catRes.rows[0].name;

        // menuCode: menu_selection_enabled 활성 상태에서만 검증
        let resolvedMenuLabel = menuLabel || null;
        if (menuCode && row.menu_selection_enabled) {
            const menuRes = await client.query(
                `SELECT name FROM menu_items
                 WHERE tenant_id = $1 AND code = $2 AND is_active = TRUE`,
                [tenantId, menuCode]
            );
            if (!menuRes.rows.length) {
                throw new AppError(400, '유효하지 않은 메뉴입니다.', 'INVALID_MENU');
            }
            resolvedMenuLabel = menuLabel || menuRes.rows[0].name;
        }

        const businessDate = getBusinessDate(row.timezone);
        const session      = await getOrCreateSession(tenantId, businessDate, client);

        if (session.status === 'closed') {
            throw new AppError(409, '오늘 세션이 마감됐습니다.', 'SESSION_CLOSED');
        }

        const ticketNumber = await nextTicketNumber(session.id, categoryCode, row.ticket_digits, client);
        const channel      = customerPhone ? 'sms' : 'paper';

        const ins = await client.query(
            `INSERT INTO queue_items
                (tenant_id, session_id, ticket_number, category_code,
                 customer_phone, entry_channel, menu_code, menu_label, channel)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING *`,
            [
                tenantId, session.id, ticketNumber, categoryCode,
                customerPhone || null, entryChannel || 'solo_tablet',
                menuCode || null, resolvedMenuLabel, channel,
            ]
        );
        queueItem = { ...ins.rows[0], category_name: categoryName };
    });

    // 메시지 발송 (트랜잭션 외부 — DB 커밋 후 진행)
    if (customerPhone) {
        messaging.sendIssueMessage(tenantId, queueItem, sandboxMode, settings)
            .catch((err) => {
                logger.error('messaging: sendIssueMessage 실패', { err: err.message, tenantId });
            });
    }

    // Redis 무효화 → 다음 getQueueStatus에서 DB 재구성 후 캐시 재저장
    await redis.invalidate(tenantId);
    const queueStatus = await getQueueStatus(tenantId);
    return { ticket: queueItem, queueStatus };
}

// ── Staff API ─────────────────────────────────────────────────────

/** 다음 호출 */
async function callNext(tenantId, counterNo, categoryCode) {
    let item;
    let msgCtx;

    await withTenant(tenantId, async (client) => {
        // 메시지 발송용 설정 (트랜잭션 내에서 미리 조회)
        msgCtx = await _getMessagingContext(tenantId, client);

        const sessionRes = await client.query(
            `SELECT id FROM queue_sessions
             WHERE tenant_id = $1 AND status = 'open'
             ORDER BY opened_at DESC LIMIT 1`,
            [tenantId]
        );
        if (!sessionRes.rows.length) throw new AppError(409, '열린 세션이 없습니다.', 'NO_SESSION');

        const sessionId = sessionRes.rows[0].id;

        let sql = `SELECT id, ticket_number, category_code, customer_phone
                   FROM queue_items
                   WHERE session_id = $1 AND status = 'waiting'`;
        const params = [sessionId];
        if (categoryCode) {
            sql += ` AND category_code = $2`;
            params.push(categoryCode);
        }
        sql += ` ORDER BY issued_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;

        const itemRes = await client.query(sql, params);
        if (!itemRes.rows.length) throw new AppError(404, '대기 중인 번호가 없습니다.', 'QUEUE_EMPTY');

        item = itemRes.rows[0];
        await client.query(
            `UPDATE queue_items SET status = 'called', called_at = NOW() WHERE id = $1`,
            [item.id]
        );
        await client.query(
            `INSERT INTO current_calls (tenant_id, counter_no, queue_item_id, call_type, called_at)
             VALUES ($1, $2, $3, 'normal', NOW())
             ON CONFLICT (tenant_id, counter_no)
             DO UPDATE SET queue_item_id = EXCLUDED.queue_item_id,
                           call_type     = 'normal',
                           called_at     = NOW()`,
            [tenantId, counterNo, item.id]
        );
    });

    // 호출 메시지 발송 (트랜잭션 외부)
    if (item.customer_phone) {
        messaging.sendCallMessage(
            tenantId,
            { ...item, counter_no: counterNo },
            msgCtx.sandbox_mode,
            msgCtx
        ).catch((err) => logger.error('messaging: sendCallMessage 실패', { err: err.message, tenantId }));
    }

    await redis.invalidate(tenantId);
    return item;
}

/** 재호출 */
async function recall(tenantId, counterNo) {
    let item;
    let msgCtx;

    await withTenant(tenantId, async (client) => {
        msgCtx = await _getMessagingContext(tenantId, client);

        const res = await client.query(
            `SELECT cc.counter_no, cc.called_at,
                    qi.id, qi.ticket_number, qi.category_code, qi.customer_phone
             FROM current_calls cc
             JOIN queue_items qi ON qi.id = cc.queue_item_id
             WHERE cc.tenant_id = $1 AND cc.counter_no = $2`,
            [tenantId, counterNo]
        );
        if (!res.rows.length) throw new AppError(404, '현재 호출 중인 번호가 없습니다.', 'NO_CURRENT_CALL');

        item = res.rows[0];
        await client.query(
            `UPDATE current_calls SET call_type = 'recall', called_at = NOW()
             WHERE tenant_id = $1 AND counter_no = $2`,
            [tenantId, counterNo]
        );
    });

    // 재호출 메시지 발송 (트랜잭션 외부)
    if (item.customer_phone) {
        messaging.sendCallMessage(
            tenantId,
            { ...item, counter_no: counterNo },
            msgCtx.sandbox_mode,
            msgCtx
        ).catch((err) => logger.error('messaging: sendCallMessage(recall) 실패', { err: err.message, tenantId }));
    }

    await redis.invalidate(tenantId);
    return item;
}

/** 완료 처리 */
async function complete(tenantId, counterNo) {
    const result = await withTenant(tenantId, async (client) => {
        const res = await client.query(
            `SELECT queue_item_id FROM current_calls
             WHERE tenant_id = $1 AND counter_no = $2`,
            [tenantId, counterNo]
        );
        if (!res.rows.length) throw new AppError(404, '현재 호출 중인 번호가 없습니다.', 'NO_CURRENT_CALL');

        const queueItemId = res.rows[0].queue_item_id;
        if (queueItemId) {
            await client.query(
                `UPDATE queue_items SET status = 'done', completed_at = NOW() WHERE id = $1`,
                [queueItemId]
            );
        }
        await client.query(
            `DELETE FROM current_calls WHERE tenant_id = $1 AND counter_no = $2`,
            [tenantId, counterNo]
        );
        return { counterNo, queueItemId };
    });
    await redis.invalidate(tenantId);
    return result;
}

/** 직접 호출 */
async function callDirect(tenantId, ticketNumber, counterNo) {
    let item;
    let msgCtx;

    await withTenant(tenantId, async (client) => {
        msgCtx = await _getMessagingContext(tenantId, client);

        const res = await client.query(
            `SELECT qi.id, qi.ticket_number, qi.category_code, qi.customer_phone
             FROM queue_items qi
             JOIN queue_sessions qs ON qs.id = qi.session_id
             WHERE qi.tenant_id = $1
               AND qi.ticket_number = $2
               AND qs.status = 'open'
               AND qi.status IN ('waiting', 'called')
             LIMIT 1`,
            [tenantId, ticketNumber]
        );
        if (!res.rows.length) throw new AppError(404, '해당 번호를 찾을 수 없습니다.', 'TICKET_NOT_FOUND');

        item = res.rows[0];
        await client.query(
            `UPDATE queue_items SET status = 'called', called_at = NOW() WHERE id = $1`,
            [item.id]
        );
        await client.query(
            `INSERT INTO current_calls (tenant_id, counter_no, queue_item_id, call_type, called_at)
             VALUES ($1, $2, $3, 'direct', NOW())
             ON CONFLICT (tenant_id, counter_no)
             DO UPDATE SET queue_item_id = EXCLUDED.queue_item_id,
                           call_type     = 'direct',
                           called_at     = NOW()`,
            [tenantId, counterNo, item.id]
        );
    });

    // 직접 호출 메시지 발송 (트랜잭션 외부)
    if (item.customer_phone) {
        messaging.sendCallMessage(
            tenantId,
            { ...item, counter_no: counterNo },
            msgCtx.sandbox_mode,
            msgCtx
        ).catch((err) => logger.error('messaging: sendCallMessage(direct) 실패', { err: err.message, tenantId }));
    }

    await redis.invalidate(tenantId);
    return item;
}

/** 세션 초기화 (당일 마감) */
async function resetSession(tenantId) {
    const result = await withTenant(tenantId, async (client) => {
        await client.query(
            `UPDATE queue_items SET status = 'cancelled'
             WHERE tenant_id = $1 AND status = 'waiting'`,
            [tenantId]
        );
        await client.query(
            `DELETE FROM current_calls WHERE tenant_id = $1`,
            [tenantId]
        );
        const res = await client.query(
            `UPDATE queue_sessions SET status = 'closed', closed_at = NOW()
             WHERE tenant_id = $1 AND status = 'open'
             RETURNING id`,
            [tenantId]
        );
        return { closedSessions: res.rowCount };
    });
    await redis.flushTenant(tenantId);
    return result;
}

module.exports = {
    getJoinConfig,
    issueTicket,
    callNext,
    recall,
    complete,
    callDirect,
    resetSession,
    getQueueStatus,
};
