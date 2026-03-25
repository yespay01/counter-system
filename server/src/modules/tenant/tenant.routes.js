'use strict';

const { Router } = require('express');
const { authenticate, tenantGuard, requireRole } = require('./tenant.middleware');
const tenantService = require('./tenant.service');
const { AppError } = require('../../lib/errors');
const audit = require('../../lib/audit');

const router = Router({ mergeParams: true });
const ownerAdmin = [authenticate, tenantGuard, requireRole('owner', 'admin')];

// ── Settings ───────────────────────────────────────────────────

router.get('/settings', ...ownerAdmin, async (req, res, next) => {
    try {
        const settings = await tenantService.getSettings(req.tenant.id);
        res.json({ settings });
    } catch (err) { next(err); }
});

router.put('/settings', ...ownerAdmin, async (req, res, next) => {
    try {
        const settings = await tenantService.updateSettings(req.tenant.id, req.body);
        audit.log('settings.update', { userId: req.user.id, tenantId: req.tenant.id, role: req.user.role }, { fields: Object.keys(req.body) });
        res.json({ settings });
    } catch (err) { next(err); }
});

// ── Categories ─────────────────────────────────────────────────

router.get('/categories', ...ownerAdmin, async (req, res, next) => {
    try {
        const categories = await tenantService.getCategories(req.tenant.id);
        res.json({ categories });
    } catch (err) { next(err); }
});

router.post('/categories', ...ownerAdmin, async (req, res, next) => {
    try {
        const { code, name, displayOrder, isActive } = req.body;
        const category = await tenantService.upsertCategory(req.tenant.id, { code, name, displayOrder, isActive });
        audit.log('category.upsert', { userId: req.user.id, tenantId: req.tenant.id, role: req.user.role }, { code });
        res.status(201).json({ category });
    } catch (err) { next(err); }
});

// ── Menu Items ─────────────────────────────────────────────────

router.get('/menu-items', ...ownerAdmin, async (req, res, next) => {
    try {
        const menuItems = await tenantService.getMenuItems(req.tenant.id);
        res.json({ menuItems });
    } catch (err) { next(err); }
});

router.post('/menu-items', ...ownerAdmin, async (req, res, next) => {
    try {
        const { code, name, displayOrder, isActive } = req.body;
        const item = await tenantService.upsertMenuItem(req.tenant.id, { code, name, displayOrder, isActive });
        audit.log('menu_item.upsert', { userId: req.user.id, tenantId: req.tenant.id, role: req.user.role }, { code });
        res.status(201).json({ menuItem: item });
    } catch (err) { next(err); }
});

// ── Dashboard ──────────────────────────────────────────────────

router.get('/dashboard', ...ownerAdmin, async (req, res, next) => {
    try {
        const stats = await tenantService.getDashboardStats(req.tenant.id);
        res.json(stats);
    } catch (err) { next(err); }
});

// ── Subscription ───────────────────────────────────────────────

// 구독 정보 + 월별 사용량 + 정산 이력
router.get('/subscription', ...ownerAdmin, async (req, res, next) => {
    try {
        const result = await tenantService.getSubscription(req.tenant.id);
        res.json(result);
    } catch (err) { next(err); }
});

// ── Message Settings ───────────────────────────────────────────

router.get('/messages/settings', ...ownerAdmin, async (req, res, next) => {
    try {
        const settings = await tenantService.getMessageSettings(req.tenant.id);
        res.json({ settings });
    } catch (err) { next(err); }
});

router.put('/messages/settings', ...ownerAdmin, async (req, res, next) => {
    try {
        const settings = await tenantService.updateMessageSettings(req.tenant.id, req.body);
        audit.log('message_settings.update', { userId: req.user.id, tenantId: req.tenant.id, role: req.user.role }, { fields: Object.keys(req.body) });
        res.json({ settings });
    } catch (err) { next(err); }
});

// ── Message Logs ───────────────────────────────────────────────

router.get('/messages/logs', ...ownerAdmin, async (req, res, next) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit, 10)  || 50, 200);
        const offset = parseInt(req.query.offset, 10) || 0;
        const status = req.query.status || null;
        const logs = await tenantService.getMessageLogs(req.tenant.id, { limit, offset, status });
        res.json({ logs });
    } catch (err) { next(err); }
});

// 월별 사용량 요약
router.get('/messages/usage', ...ownerAdmin, async (req, res, next) => {
    try {
        const months = Math.min(parseInt(req.query.months, 10) || 6, 12);
        const usage  = await tenantService.getMonthlyUsage(req.tenant.id, { months });
        res.json({ usage });
    } catch (err) { next(err); }
});

module.exports = router;
