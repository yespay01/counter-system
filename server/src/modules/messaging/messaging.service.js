'use strict';

const { withTenant } = require('../../lib/db');
const solapi = require('./solapi.client');
const logger = require('../../lib/logger');

// ── 플랫폼 공유 채널 (테넌트 미설정 시 기본) ─────────────────────
const PLATFORM_PFID             = process.env.SOLAPI_PLATFORM_PFID;
const PLATFORM_SENDER           = process.env.SOLAPI_PLATFORM_SENDER;
const PLATFORM_TEMPLATE_ISSUE   = process.env.SOLAPI_PLATFORM_TEMPLATE_ISSUE;
const PLATFORM_TEMPLATE_READY   = process.env.SOLAPI_PLATFORM_TEMPLATE_READY;
const PLATFORM_TEMPLATE_CALL    = process.env.SOLAPI_PLATFORM_TEMPLATE_CALL;

// ── 채널별 단가 정책 ─────────────────────────────────────────────
// env 오버라이드 가능. 기본값은 일반 알림톡/SMS 시장 단가 기준.
// 발송 시점에 sms_logs에 스냅샷 저장 → 나중에 단가가 바뀌어도 과거 정산 불변.
const PRICING = {
    ata: {
        providerUnitCost: parseInt(process.env.PRICE_ATA_PROVIDER || '13', 10),
        billingUnitPrice: parseInt(process.env.PRICE_ATA_BILLING  || '18', 10),
    },
    sms: {
        providerUnitCost: parseInt(process.env.PRICE_SMS_PROVIDER || '20', 10),
        billingUnitPrice: parseInt(process.env.PRICE_SMS_BILLING  || '25', 10),
    },
    lms: {
        providerUnitCost: parseInt(process.env.PRICE_LMS_PROVIDER || '40', 10),
        billingUnitPrice: parseInt(process.env.PRICE_LMS_BILLING  || '50', 10),
    },
};

// ── 헬퍼 ─────────────────────────────────────────────────────────

function _getTemplateId(messageType, settings) {
    if (messageType === 'issue') return settings?.solapi_template_issue || PLATFORM_TEMPLATE_ISSUE;
    if (messageType === 'ready') return settings?.solapi_template_ready || PLATFORM_TEMPLATE_READY;
    if (messageType === 'call')  return settings?.solapi_template_call  || PLATFORM_TEMPLATE_CALL;
    return null;
}

function _toKST(date) {
    const d = date instanceof Date ? date : new Date(date || Date.now());
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const hh = String(kst.getUTCHours()).padStart(2, '0');
    const mm = String(kst.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

function _buildVariables(messageType, queueItem) {
    const timeValue = _toKST(messageType === 'call' ? new Date() : queueItem.issued_at);
    if (messageType === 'issue') {
        return {
            '#{ticketNumber}':   queueItem.ticket_number,
            '#{courseName}':     queueItem.category_name || queueItem.category_code,
            '#{issueTime}':      timeValue,
            '#{waitingCount}':   String(queueItem.waiting_count ?? ''),
            '#{estimatedTime}':  '',
        };
    }
    // call / ready
    return {
        '#{ticketNumber}':   queueItem.ticket_number,
        '#{courseName}':     queueItem.category_name || queueItem.category_code,
        '#{callTime}':       timeValue,
        '#{counterNumber}':  queueItem.counter_no ? String(queueItem.counter_no) : '',
    };
}

function _buildSmsText(messageType, queueItem) {
    if (messageType === 'issue') {
        return `[대기번호 발급] ${queueItem.ticket_number} — 호출 시 알림을 보내드립니다.`;
    }
    if (messageType === 'ready') {
        return `[준비 안내] ${queueItem.ticket_number}번 곧 차례가 됩니다.`;
    }
    if (messageType === 'call') {
        const counter = queueItem.counter_no ? ` (${queueItem.counter_no}번 창구)` : '';
        return `[호출 안내] ${queueItem.ticket_number}번 호출되었습니다.${counter}`;
    }
    return `[순번 안내] ${queueItem.ticket_number}번 안내입니다.`;
}

// ── 핵심 발송 함수 ────────────────────────────────────────────────

/**
 * 메시지 발송 공통 로직
 * - sandboxMode: previewed 로그만 기록, 실제 발송 없음, billable=FALSE
 * - real: ATA 우선 → 실패 시 SMS fallback → sent 건만 billable=TRUE
 * - 발송 시점 단가 스냅샷 저장 → 이후 단가 변경 시에도 과거 정산 불변
 *
 * @param {string}  tenantId
 * @param {object}  queueItem - { id, ticket_number, category_code, customer_phone, counter_no? }
 * @param {string}  messageType - 'issue' | 'ready' | 'call'
 * @param {boolean} sandboxMode
 * @param {object}  settings   - tenant_settings 행 (없으면 플랫폼 공유 채널 사용)
 */
async function sendMessage(tenantId, queueItem, messageType, sandboxMode, settings) {
    if (!queueItem?.customer_phone) return;

    const phone     = queueItem.customer_phone;
    const yearMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    // ── 샌드박스: 실제 발송 없음, previewed 로그 ──────────────────
    if (sandboxMode) {
        await withTenant(tenantId, async (client) => {
            await client.query(
                `INSERT INTO sms_logs
                    (tenant_id, queue_item_id, phone, message_type, channel,
                     channel_mode, status, sandbox, billable)
                 VALUES ($1, $2, $3, $4, 'ata', 'platform_shared', 'previewed', TRUE, FALSE)`,
                [tenantId, queueItem.id, phone, messageType]
            );
        });
        logger.info('messaging: sandbox preview', {
            tenantId, messageType, ticketNumber: queueItem.ticket_number,
        });
        return;
    }

    // ── 채널 결정 ──────────────────────────────────────────────────
    // message_channel_mode가 명시적으로 'tenant_owned'일 때만 테넌트 설정 사용.
    // 기본값 'platform_shared' → 플랫폼 공유 채널만 사용.
    const channelMode = settings?.message_channel_mode || 'platform_shared';
    let pfId, sender, templateId;
    if (channelMode === 'tenant_owned') {
        // 테넌트 설정 우선, 미설정 시 플랫폼 채널 fallback
        pfId       = settings?.solapi_pfid   || PLATFORM_PFID;
        sender     = settings?.solapi_sender || PLATFORM_SENDER;
        templateId = _getTemplateId(messageType, settings);
    } else {
        // platform_shared: 플랫폼 공유 채널만 사용 (테넌트 설정 무시)
        pfId       = PLATFORM_PFID;
        sender     = PLATFORM_SENDER;
        templateId = _getTemplateId(messageType, null);
    }
    const fallbackEnabled = settings?.sms_fallback_enabled !== false;

    // ── ATA 발송 시도 ─────────────────────────────────────────────
    let channel = 'ata';
    let result;

    if (pfId && templateId && sender) {
        const vars = _buildVariables(messageType, queueItem);
        logger.info('messaging: variables', { vars });
        result = await solapi.sendAta({
            to: phone,
            pfId,
            templateId,
            from: sender,
            variables: vars,
        });
    } else {
        result = { success: false, error: 'ATA 설정 미완료 (PFID/templateId/sender 없음)' };
    }

    // ── SMS fallback ──────────────────────────────────────────────
    if (!result.success && fallbackEnabled && sender) {
        logger.warn('messaging: ATA 실패, SMS fallback 시도', {
            tenantId, messageType, error: result.error,
        });
        channel = 'sms';
        result  = await solapi.sendSms({
            to:   phone,
            from: sender,
            text: _buildSmsText(messageType, queueItem),
        });
    }

    // ── billing 스냅샷 계산 ───────────────────────────────────────
    const status            = result.success ? 'sent'  : 'failed';
    const sentAt            = result.success ? new Date() : null;
    const billable          = result.success;
    const pricing           = PRICING[channel] || PRICING.sms;
    const providerUnitCost  = billable ? pricing.providerUnitCost : null;
    const billingUnitPrice  = billable ? pricing.billingUnitPrice : null;
    const billingAmount     = billable ? pricing.billingUnitPrice : null; // 건당 1건 × 단가

    // ── DB 기록 ────────────────────────────────────────────────────
    await withTenant(tenantId, async (client) => {
        // sms_logs INSERT
        await client.query(
            `INSERT INTO sms_logs
                (tenant_id, queue_item_id, phone, message_type, channel, channel_mode,
                 provider_status_code, status, sandbox, error_message, sent_at,
                 billable, provider_unit_cost, billing_unit_price, billing_amount)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,$9,$10,$11,$12,$13,$14)`,
            [
                tenantId, queueItem.id, phone, messageType, channel, channelMode,
                result.statusCode || null, status,
                result.error || null, sentAt,
                billable, providerUnitCost, billingUnitPrice, billingAmount,
            ]
        );

        // usage_monthly 집계 — sent 성공 건만 반영
        if (billable) {
            // channel → column: ata_sent / sms_sent / lms_sent
            const channelCol = channel === 'ata' ? 'ata_sent' : (channel === 'lms' ? 'lms_sent' : 'sms_sent');
            // messageType → column: issue_sent / ready_sent / call_sent
            const typeCol    = `${messageType}_sent`;

            // 컬럼명은 코드가 통제하는 리터럴 — SQL injection 위험 없음
            await client.query(
                `INSERT INTO usage_monthly
                    (tenant_id, year_month,
                     ${channelCol}, ${typeCol},
                     billable_count, provider_cost_amount, billed_amount, margin_amount)
                 VALUES ($1, $2, 1, 1, 1, $3, $4, $5)
                 ON CONFLICT (tenant_id, year_month) DO UPDATE SET
                     ${channelCol}        = usage_monthly.${channelCol} + 1,
                     ${typeCol}           = usage_monthly.${typeCol} + 1,
                     billable_count       = usage_monthly.billable_count + 1,
                     provider_cost_amount = usage_monthly.provider_cost_amount + EXCLUDED.provider_cost_amount,
                     billed_amount        = usage_monthly.billed_amount + EXCLUDED.billed_amount,
                     margin_amount        = usage_monthly.margin_amount + EXCLUDED.margin_amount`,
                [
                    tenantId, yearMonth,
                    providerUnitCost,
                    billingUnitPrice,
                    billingUnitPrice - providerUnitCost,
                ]
            );
        }
    });

    logger.info('messaging: sendMessage', {
        tenantId, messageType, ticketNumber: queueItem.ticket_number,
        channel, status, billable,
    });
}

// ── 공개 API ──────────────────────────────────────────────────────

/** 번호 발급 시 알림 */
async function sendIssueMessage(tenantId, queueItem, sandboxMode, settings) {
    return sendMessage(tenantId, queueItem, 'issue', sandboxMode, settings);
}

/**
 * 준비됨 알림
 * NOTE: 현재 제품 흐름에 ready 트리거 이벤트가 없음.
 *       함수 구현은 완료됐으나 호출부가 없음 → Phase 5 이후 적용.
 *       (예: 대기 1명 남았을 때 자동 발송 등)
 */
async function sendReadyMessage(tenantId, queueItem, sandboxMode, settings) {
    return sendMessage(tenantId, queueItem, 'ready', sandboxMode, settings);
}

/** 호출 시 알림 */
async function sendCallMessage(tenantId, queueItem, sandboxMode, settings) {
    return sendMessage(tenantId, queueItem, 'call', sandboxMode, settings);
}

module.exports = { sendIssueMessage, sendReadyMessage, sendCallMessage };
