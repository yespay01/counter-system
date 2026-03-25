'use strict';

const { Router } = require('express');
const superadminService = require('./superadmin.service');
const { AppError } = require('../../lib/errors');
const audit = require('../../lib/audit');

const router = Router();

/** SUPERADMIN_SECRET Bearer 인증 */
function superadminAuth(req, _res, next) {
    const secret = process.env.SUPERADMIN_SECRET;
    if (!secret) {
        return next(new AppError(503, 'Superadmin 미설정', 'SUPERADMIN_NOT_CONFIGURED'));
    }
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
        return next(new AppError(401, '인증이 필요합니다.', 'UNAUTHORIZED'));
    }
    if (auth.slice(7) !== secret) {
        return next(new AppError(403, '권한이 없습니다.', 'FORBIDDEN'));
    }
    next();
}

// GET /api/superadmin/tenants
router.get('/tenants', superadminAuth, async (_req, res, next) => {
    try {
        const tenants = await superadminService.listTenants();
        res.json({ tenants });
    } catch (err) { next(err); }
});

// PUT /api/superadmin/tenants/:tenantId/subscription
router.put('/tenants/:tenantId/subscription', superadminAuth, async (req, res, next) => {
    try {
        const { tenantId } = req.params;
        const { status, memo } = req.body;
        if (!status) return next(new AppError(400, 'status 필요', 'MISSING_STATUS'));

        const sub = await superadminService.updateTenantSubscription(tenantId, { status, memo });
        audit.log('subscription.update', { actor: 'superadmin' }, { tenantId, status, memo });
        res.json({ subscription: sub });
    } catch (err) { next(err); }
});

// GET /api/superadmin/tenants/:tenantId/billing-logs
router.get('/tenants/:tenantId/billing-logs', superadminAuth, async (req, res, next) => {
    try {
        const { tenantId } = req.params;
        const logs = await superadminService.listBillingLogs(tenantId);
        res.json({ billingLogs: logs });
    } catch (err) { next(err); }
});

// POST /api/superadmin/tenants/:tenantId/billing-logs
router.post('/tenants/:tenantId/billing-logs', superadminAuth, async (req, res, next) => {
    try {
        const { tenantId } = req.params;
        const {
            yearMonth, planAmount, messageAmount,
            paymentMethod, status, memo,
        } = req.body;
        if (!yearMonth) return next(new AppError(400, 'yearMonth 필요 (YYYY-MM)', 'MISSING_YEAR_MONTH'));

        // created_by: Authorization 헤더에서는 secret만 있으므로 'superadmin' 고정
        const log = await superadminService.createBillingLog(tenantId, {
            yearMonth, planAmount, messageAmount,
            paymentMethod, status, memo,
            createdBy: 'superadmin',
        });
        audit.log('billing_log.create', { actor: 'superadmin' }, { tenantId, yearMonth, status });
        res.status(201).json({ billingLog: log });
    } catch (err) { next(err); }
});

module.exports = router;
