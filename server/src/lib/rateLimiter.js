'use strict';

const { rateLimit } = require('express-rate-limit');

const msg = (code) => ({
    message: { error: { code, message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' } },
    standardHeaders: true,
    legacyHeaders: false,
});

/** 인증: signup / login — 15분 10회 (brute-force 방지) */
const authStrict = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, ...msg('RATE_LIMIT_AUTH') });

/** 인증: token refresh — 15분 30회 */
const authRefresh = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, ...msg('RATE_LIMIT_AUTH') });

/** 번호 발급 — 1분 15회 (키오스크 다중 접속 고려) */
const queueIssue = rateLimit({ windowMs: 60 * 1000, max: 15, ...msg('RATE_LIMIT_QUEUE') });

module.exports = { authStrict, authRefresh, queueIssue };
