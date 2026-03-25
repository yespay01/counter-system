'use strict';

const bcrypt = require('bcrypt');
const { authQuery, withAuthTransaction } = require('../../lib/db');
const { issueTokens, verifyRefresh, hashToken } = require('../../lib/jwt');
const { AppError } = require('../../lib/errors');

const BCRYPT_ROUNDS = 12;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function normalizeEmail(email) {
    return email.trim().toLowerCase();
}

function validateSlug(slug) {
    if (!slug || slug.length < 2 || slug.length > 64 || !SLUG_RE.test(slug)) {
        throw new AppError(400, 'slug는 소문자 영문/숫자/하이픈만 사용 가능하며 2~64자여야 합니다.', 'INVALID_SLUG');
    }
}

async function signup({ email, password, slug, name, industryType }) {
    if (!email || !password || !slug || !name) {
        throw new AppError(400, '필수 항목 누락: email, password, slug, name', 'MISSING_FIELDS');
    }
    if (password.length < 8) {
        throw new AppError(400, '비밀번호는 8자 이상이어야 합니다.', 'WEAK_PASSWORD');
    }
    validateSlug(slug);

    const normalizedEmail = normalizeEmail(email);

    return withAuthTransaction(async (client) => {
        // slug 중복 확인
        const slugCheck = await client.query(
            'SELECT id FROM tenants WHERE slug = $1',
            [slug]
        );
        if (slugCheck.rows.length > 0) {
            throw new AppError(409, '이미 사용 중인 slug입니다.', 'SLUG_TAKEN');
        }

        // 이메일 중복 확인 (정규화된 값으로, 글로벌)
        const emailCheck = await client.query(
            'SELECT id FROM users WHERE LOWER(email) = $1',
            [normalizedEmail]
        );
        if (emailCheck.rows.length > 0) {
            throw new AppError(409, '이미 가입된 이메일입니다.', 'EMAIL_TAKEN');
        }

        // tenant 생성
        const tenantRes = await client.query(
            `INSERT INTO tenants (slug, name, industry_type)
             VALUES ($1, $2, $3)
             RETURNING id, slug, name, sandbox_mode`,
            [slug, name, industryType || null]
        );
        const tenant = tenantRes.rows[0];

        // tenant_settings 기본값
        await client.query(
            'INSERT INTO tenant_settings (tenant_id) VALUES ($1)',
            [tenant.id]
        );

        // subscription trial (30일)
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 30);
        await client.query(
            `INSERT INTO subscriptions (tenant_id, plan_code, status, trial_ends_at)
             VALUES ($1, 'solo_trial', 'trial', $2)`,
            [tenant.id, trialEndsAt]
        );

        // owner 생성 (정규화된 이메일로 저장)
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const userRes = await client.query(
            `INSERT INTO users (tenant_id, email, password_hash, role)
             VALUES ($1, $2, $3, 'owner')
             RETURNING id, email, role`,
            [tenant.id, normalizedEmail, passwordHash]
        );
        const user = userRes.rows[0];

        // refresh token 저장
        const { accessToken, refreshToken } = issueTokens(user.id, tenant.id, user.role);
        const tokenHash = hashToken(refreshToken);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await client.query(
            `INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, expires_at)
             VALUES ($1, $2, $3, $4)`,
            [user.id, tenant.id, tokenHash, expiresAt]
        );

        return {
            tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, sandboxMode: tenant.sandbox_mode },
            user: { id: user.id, email: user.email, role: user.role },
            accessToken,
            refreshToken,
        };
    });
}

async function login({ email, password }) {
    if (!email || !password) {
        throw new AppError(400, '이메일과 비밀번호를 입력하세요.', 'MISSING_FIELDS');
    }

    const normalizedEmail = normalizeEmail(email);

    // 슈퍼유저 연결로 조회 (RLS 우회 — auth 전용 경로)
    const res = await authQuery(
        `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.role, u.status,
                t.slug, t.name, t.sandbox_mode
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         WHERE LOWER(u.email) = $1 AND u.status = 'active' AND t.status = 'active'
         LIMIT 1`,
        [normalizedEmail]
    );

    if (res.rows.length === 0) {
        throw new AppError(401, '이메일 또는 비밀번호가 올바르지 않습니다.', 'INVALID_CREDENTIALS');
    }

    const user = res.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
        throw new AppError(401, '이메일 또는 비밀번호가 올바르지 않습니다.', 'INVALID_CREDENTIALS');
    }

    const { accessToken, refreshToken } = issueTokens(user.id, user.tenant_id, user.role);
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await authQuery(
        `INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [user.id, user.tenant_id, tokenHash, expiresAt]
    );
    await authQuery(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [user.id]
    );

    return {
        user: {
            id: user.id,
            email: user.email,
            role: user.role,
            tenantId: user.tenant_id,
            tenantSlug: user.slug,
            sandboxMode: user.sandbox_mode,
        },
        accessToken,
        refreshToken,
    };
}

async function refresh({ refreshToken: token }) {
    if (!token) {
        throw new AppError(400, 'refreshToken이 필요합니다.', 'MISSING_TOKEN');
    }

    verifyRefresh(token); // 만료/서명 확인
    const tokenHash = hashToken(token);

    const res = await authQuery(
        `SELECT rt.id, rt.user_id, rt.tenant_id, rt.expires_at,
                u.role, u.status
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
         WHERE rt.token_hash = $1`,
        [tokenHash]
    );

    if (res.rows.length === 0 || new Date(res.rows[0].expires_at) < new Date()) {
        throw new AppError(401, '만료되거나 유효하지 않은 토큰입니다.', 'INVALID_REFRESH_TOKEN');
    }

    const row = res.rows[0];
    if (row.status !== 'active') {
        throw new AppError(401, '비활성 계정입니다.', 'ACCOUNT_INACTIVE');
    }

    // 기존 토큰 삭제 (rotation)
    await authQuery('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);

    const { accessToken, refreshToken: newRefreshToken } = issueTokens(row.user_id, row.tenant_id, row.role);
    const newHash = hashToken(newRefreshToken);
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await authQuery(
        `INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [row.user_id, row.tenant_id, newHash, newExpiry]
    );

    return { accessToken, refreshToken: newRefreshToken };
}

async function logout({ refreshToken: token }) {
    if (!token) return;
    const tokenHash = hashToken(token);
    await authQuery('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
}

module.exports = { signup, login, refresh, logout };
