'use strict';

const { verifyAccess } = require('../../lib/jwt');
const { findBySlug } = require('./tenant.service');
const { AppError } = require('../../lib/errors');

/**
 * JWT 검증 → req.user 설정
 * Authorization: Bearer <token>
 */
function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return next(new AppError(401, '인증이 필요합니다.', 'UNAUTHORIZED'));
    }
    try {
        const payload = verifyAccess(header.slice(7));
        req.user = { id: payload.sub, tenantId: payload.tid, role: payload.role };
        next();
    } catch (err) {
        next(err);
    }
}

/**
 * URL slug와 JWT tenant_id가 일치하는지 확인
 * authenticate() 이후에 사용
 */
function tenantGuard(req, res, next) {
    const { slug } = req.params;
    if (!slug) return next();

    // findBySlug는 비동기지만 slug→id 매핑은 이미 req.user.tenantId에 있음
    // 여기서는 추가로 slug가 실제 존재하는지 확인 + req.tenant 설정
    findBySlug(slug)
        .then((tenant) => {
            if (req.user && req.user.tenantId !== tenant.id) {
                return next(new AppError(403, '접근 권한이 없습니다.', 'FORBIDDEN'));
            }
            req.tenant = tenant;
            next();
        })
        .catch(next);
}

/**
 * 공개 slug 라우트 전용: 인증 없이 tenant만 확인
 */
function resolveSlug(req, res, next) {
    const { slug } = req.params;
    if (!slug) return next(new AppError(400, 'slug가 필요합니다.', 'MISSING_SLUG'));

    findBySlug(slug)
        .then((tenant) => {
            req.tenant = tenant;
            next();
        })
        .catch(next);
}

/**
 * 역할 확인 (authenticate → tenantGuard 이후에 사용)
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return next(new AppError(403, '권한이 없습니다.', 'FORBIDDEN'));
        }
        next();
    };
}

module.exports = { authenticate, tenantGuard, resolveSlug, requireRole };
