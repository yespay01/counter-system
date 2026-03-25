'use strict';

const { Pool } = require('pg');
const logger = require('./logger');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUUID(value, name) {
    if (!UUID_RE.test(value)) {
        throw new Error(`Invalid UUID for ${name}: ${value}`);
    }
}

// ── 런타임 API 풀 (counter_app, strict RLS) ───────────────────────
// withTenant()를 통해서만 사용. 직접 query 금지.
const appPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

// ── Auth 전용 풀 (counter_auth, 오픈 RLS) ──────────────────────────
// signup / login / refresh / 공개 slug 조회 전용.
// BYPASSRLS 없음 — DB 레벨 오픈 정책으로 동작.
// DATABASE_SUPERUSER_URL은 포함하지 않음 (마이그레이션 전용).
const authPool = new Pool({
    connectionString: process.env.DATABASE_AUTH_URL,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

appPool.on('error',  (err) => logger.error('appPool error',  { err: err.message }));
authPool.on('error', (err) => logger.error('authPool error', { err: err.message }));

// ── Public API ───────────────────────────────────────────────────

/**
 * Auth 전용 단순 쿼리 (counter_auth)
 * 사용처: login, refresh, slug 공개 조회
 */
async function authQuery(sql, params) {
    return authPool.query(sql, params);
}

/**
 * Auth 전용 트랜잭션 (counter_auth)
 * 사용처: signup (멀티스텝 INSERT)
 */
async function withAuthTransaction(callback) {
    const client = await authPool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * RLS 강제 트랜잭션 (counter_app)
 * 인증된 모든 작업에 사용. SET LOCAL으로 tenant_id를 트랜잭션 범위에만 설정.
 */
async function withTenant(tenantId, callback) {
    assertUUID(tenantId, 'tenantId');
    const client = await appPool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function healthCheck() {
    // Promise.allSettled: 한 쪽이 죽어도 나머지 결과를 함께 반환
    const [appResult, authResult] = await Promise.allSettled([
        appPool.query('SELECT 1 AS ok'),
        authPool.query('SELECT 1 AS ok'),
    ]);
    const appOk  = appResult.status  === 'fulfilled' && appResult.value.rows[0].ok  === 1;
    const authOk = authResult.status === 'fulfilled' && authResult.value.rows[0].ok === 1;
    return {
        ok:   appOk && authOk,
        pools: {
            app:  appOk  ? 'ok' : 'error',
            auth: authOk ? 'ok' : 'error',
        },
    };
}

module.exports = { authQuery, withAuthTransaction, withTenant, healthCheck };
