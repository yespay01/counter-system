'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { AppError } = require('./errors');

function signAccess(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    });
}

function signRefresh(payload) {
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    });
}

function verifyAccess(token) {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        throw new AppError(401, 'Invalid or expired token', 'INVALID_TOKEN');
    }
}

function verifyRefresh(token) {
    try {
        return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
        throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
    }
}

/** refresh token DB 저장용 해시 */
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * access + refresh 토큰 쌍 생성
 * payload: { sub: userId, tid: tenantId, role }
 */
function issueTokens(userId, tenantId, role) {
    const payload = { sub: userId, tid: tenantId, role };
    return {
        accessToken: signAccess(payload),
        refreshToken: signRefresh(payload),
    };
}

module.exports = { issueTokens, verifyAccess, verifyRefresh, hashToken };
