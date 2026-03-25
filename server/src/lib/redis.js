'use strict';

/**
 * Redis 캐시 레이어 (Phase 5 — Standard 다창구 실시간 최적화)
 *
 * - REDIS_URL 미설정 또는 ioredis 미설치 시: 모든 함수가 no-op (Solo 모드와 호환)
 * - Redis 오류 발생 시: 경고 로그 후 DB 직접 조회로 자동 대체
 * - Redis는 "실시간 캐시", PostgreSQL은 "정본" — 장애 시 DB에서 재구축 가능
 */

const logger = require('./logger');

let client = null;
let enabled = false;

// ── 키 설계 (architecture 2-2 § 7) ──────────────────────────────────
// queue:{tenantId}:status  → 전체 대기 현황 JSON { sessionId, waiting[], currentCalls[] }
// queue:{tenantId}:*       → 테넌트 범위 일괄 삭제 패턴 (resetSession / 재연결 시)
const KEY_STATUS   = (tid) => `queue:${tid}:status`;
const KEY_PATTERN  = (tid) => `queue:${tid}:*`;
const TTL_SECONDS  = 24 * 60 * 60; // 24시간 — resetSession이 명시적으로 무효화

// ── 초기화 ────────────────────────────────────────────────────────────
function init() {
    const url = process.env.REDIS_URL;
    if (!url) {
        logger.info('Redis: REDIS_URL 미설정 — 캐시 비활성화 (DB 직접 조회 모드)');
        return;
    }

    let Redis;
    try {
        Redis = require('ioredis');
    } catch {
        logger.warn('Redis: ioredis 패키지 없음 — npm install 후 재시작 필요');
        return;
    }

    client = new Redis(url, {
        lazyConnect:         false,
        enableReadyCheck:    true,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 300, 3000)),
    });

    client.on('connect', () => logger.info('Redis: 연결 중'));
    client.on('ready',   () => {
        logger.info('Redis: 준비 완료');
        // enabled는 purge 완료 후에 true로 설정.
        // purge 전에 enabled=true가 되면 getStatus()가 stale 키를 반환할 수 있음.
        // 초기 연결 시에는 queue:* 키가 없으므로 무해함.
        client.keys('queue:*').then((staleKeys) => {
            if (staleKeys.length) {
                return client.del(...staleKeys).then(() =>
                    logger.info('Redis: 재연결 후 stale 캐시 제거', { count: staleKeys.length })
                );
            }
        }).catch((err) => {
            logger.warn('Redis: stale 캐시 제거 실패', { err: err.message });
        }).finally(() => {
            enabled = true;
        });
    });
    client.on('close',   () => { enabled = false; logger.warn('Redis: 연결 종료 — DB 직접 조회로 대체'); });
    client.on('error',   (err) => {
        enabled = false;
        logger.warn('Redis: 오류 — DB 직접 조회로 대체', { err: err.message });
    });
}

// ── 캐시 읽기 ─────────────────────────────────────────────────────────

/** 대기 현황 캐시 조회. 캐시 미스 또는 오류 시 null 반환 */
async function getStatus(tenantId) {
    if (!enabled || !client) return null;
    try {
        const raw = await client.get(KEY_STATUS(tenantId));
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        logger.warn('Redis getStatus 실패', { err: err.message });
        return null;
    }
}

// ── 캐시 쓰기 ─────────────────────────────────────────────────────────

/** 대기 현황 캐시 저장 */
async function setStatus(tenantId, data) {
    if (!enabled || !client) return;
    try {
        await client.set(KEY_STATUS(tenantId), JSON.stringify(data), 'EX', TTL_SECONDS);
    } catch (err) {
        logger.warn('Redis setStatus 실패', { err: err.message });
    }
}

// ── 캐시 무효화 ──────────────────────────────────────────────────────

/** 상태 캐시 단일 키 삭제 (write 후 다음 읽기에서 DB 재구축) */
async function invalidate(tenantId) {
    if (!enabled || !client) return;
    try {
        await client.del(KEY_STATUS(tenantId));
    } catch (err) {
        logger.warn('Redis invalidate 실패', { err: err.message });
    }
}

/** 테넌트 전체 캐시 삭제 (세션 리셋 시) */
async function flushTenant(tenantId) {
    if (!enabled || !client) return;
    try {
        const matchedKeys = await client.keys(KEY_PATTERN(tenantId));
        if (matchedKeys.length) await client.del(...matchedKeys);
    } catch (err) {
        logger.warn('Redis flushTenant 실패', { err: err.message });
    }
}

// ── 헬스체크 ─────────────────────────────────────────────────────────

/** 'ok' | 'disabled' | 'error' を返す — disabled は REDIS_URL 未設定、error は接続/ping 失敗 */
async function healthCheck() {
    if (!client) return 'disabled';   // REDIS_URL 미설정
    if (!enabled) return 'error';     // 연결됐으나 ready 아님 (재연결 중 또는 오류)
    try {
        await client.ping();
        return 'ok';
    } catch {
        return 'error';
    }
}

module.exports = { init, getStatus, setStatus, invalidate, flushTenant, healthCheck };
