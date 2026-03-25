'use strict';

const logger = require('./logger');

/**
 * 관리자 작업 감사 로그
 * @param {string} action - 작업 유형 (예: 'settings.update', 'subscription.update')
 * @param {{ userId?: string, tenantId?: string, role?: string, actor?: string }} actor
 * @param {object} [details] - 추가 컨텍스트
 */
function log(action, actor = {}, details = {}) {
    logger.info(`[AUDIT] ${action}`, { audit: true, action, actor, ...details });
}

module.exports = { log };
