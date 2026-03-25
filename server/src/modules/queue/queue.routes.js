'use strict';

const { Router } = require('express');
const queueService = require('./queue.service');
const { resolveSlug, authenticate, requireRole } = require('../tenant/tenant.middleware');
const { queueIssue } = require('../../lib/rateLimiter');

// ── 공개 라우터 (/api/public/:slug) ──────────────────────────────
const publicRouter = Router({ mergeParams: true });

// 발급 화면 설정 조회 (카테고리, 메뉴, 옵션)
publicRouter.get('/join-config', resolveSlug, async (req, res, next) => {
    try {
        const config = await queueService.getJoinConfig(req.tenant.id);
        res.json(config);
    } catch (err) { next(err); }
});

// 현재 대기 현황
publicRouter.get('/queue/status', resolveSlug, async (req, res, next) => {
    try {
        const status = await queueService.getQueueStatus(req.tenant.id);
        res.json(status);
    } catch (err) { next(err); }
});

// 번호 발급
// body: { categoryCode, customerPhone?, entryChannel?, menuCode?, menuLabel? }
publicRouter.post('/queue/issue', queueIssue, resolveSlug, async (req, res, next) => {
    try {
        const { categoryCode, customerPhone, entryChannel, menuCode, menuLabel } = req.body;
        const result = await queueService.issueTicket(req.tenant.id, {
            categoryCode, customerPhone, entryChannel, menuCode, menuLabel,
        });

        const io = req.app.get('io');
        io.broadcast.queueUpdated(req.tenant.id, result.queueStatus);

        res.status(201).json({ ticket: result.ticket, sandboxMode: req.tenant.sandbox_mode });
    } catch (err) { next(err); }
});

// ── 직원 라우터 (/api/staff) ──────────────────────────────────────
// JWT에서 tenantId를 가져오므로 slug 불필요
const staffRouter = Router();

function useTenantFromAuth(req, _res, next) {
    req.tenant = { id: req.user.tenantId };
    next();
}

const staffMiddleware = [authenticate, useTenantFromAuth, requireRole('owner', 'admin', 'staff')];

// 다음 호출
// body: { counterNo, categoryCode? }
staffRouter.post('/queue/call-next', ...staffMiddleware, async (req, res, next) => {
    try {
        const { counterNo, categoryCode } = req.body;
        if (!counterNo) return next(new (require('../../lib/errors').AppError)(400, 'counterNo 필요', 'MISSING_COUNTER'));

        const item = await queueService.callNext(req.tenant.id, counterNo, categoryCode);
        const io   = req.app.get('io');
        io.broadcast.callNew(req.tenant.id, { ...item, counterNo });

        const status = await queueService.getQueueStatus(req.tenant.id);
        io.broadcast.queueUpdated(req.tenant.id, status);

        res.json({ called: item, counterNo });
    } catch (err) { next(err); }
});

// 재호출
// body: { counterNo }
staffRouter.post('/queue/recall', ...staffMiddleware, async (req, res, next) => {
    try {
        const { counterNo } = req.body;
        if (!counterNo) return next(new (require('../../lib/errors').AppError)(400, 'counterNo 필요', 'MISSING_COUNTER'));

        const item = await queueService.recall(req.tenant.id, counterNo);
        req.app.get('io').broadcast.callRecall(req.tenant.id, { ...item, counterNo });

        res.json({ recalled: item, counterNo });
    } catch (err) { next(err); }
});

// 완료
// body: { counterNo }
staffRouter.post('/queue/complete', ...staffMiddleware, async (req, res, next) => {
    try {
        const { counterNo } = req.body;
        if (!counterNo) return next(new (require('../../lib/errors').AppError)(400, 'counterNo 필요', 'MISSING_COUNTER'));

        const result = await queueService.complete(req.tenant.id, counterNo);
        const status = await queueService.getQueueStatus(req.tenant.id);
        req.app.get('io').broadcast.queueUpdated(req.tenant.id, status);

        res.json(result);
    } catch (err) { next(err); }
});

// 직접 호출
// body: { ticketNumber, counterNo }
staffRouter.post('/queue/call-direct', ...staffMiddleware, async (req, res, next) => {
    try {
        const { ticketNumber, counterNo } = req.body;
        if (!ticketNumber || !counterNo) {
            return next(new (require('../../lib/errors').AppError)(400, 'ticketNumber, counterNo 필요', 'MISSING_FIELDS'));
        }

        const item = await queueService.callDirect(req.tenant.id, ticketNumber, counterNo);
        const io   = req.app.get('io');
        io.broadcast.callNew(req.tenant.id, { ...item, counterNo, callType: 'direct' });

        const status = await queueService.getQueueStatus(req.tenant.id);
        io.broadcast.queueUpdated(req.tenant.id, status);

        res.json({ called: item, counterNo });
    } catch (err) { next(err); }
});

// 세션 초기화 (당일 마감)
staffRouter.post('/queue/reset', authenticate, useTenantFromAuth, requireRole('owner', 'admin'), async (req, res, next) => {
    try {
        const result = await queueService.resetSession(req.tenant.id);
        req.app.get('io').broadcast.sessionReset(req.tenant.id);
        res.json(result);
    } catch (err) { next(err); }
});

module.exports = { publicRouter, staffRouter };
