'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { AppError } = require('./lib/errors');
const logger = require('./lib/logger');
const redis  = require('./lib/redis');

// Routes
const authRoutes = require('./modules/auth/auth.routes');
const tenantAdminRoutes = require('./modules/tenant/tenant.routes');
const { publicRouter: queuePublicRoutes, staffRouter: queueStaffRoutes } = require('./modules/queue/queue.routes');
const superadminRoutes = require('./modules/superadmin/superadmin.routes');

const PUBLIC_DIR = path.join(__dirname, '../public');

function createApp() {
    const app = express();
    const isProd = process.env.NODE_ENV === 'production';

    // ── 보안 / 공통 미들웨어 ──────────────────────────────────────
    app.set('trust proxy', 1);
    app.use(helmet({
        contentSecurityPolicy: isProd ? {
            useDefaults: true,
            directives: {
                "connect-src": ["'self'", 'ws:', 'wss:'],
                "script-src": ["'self'", "'unsafe-inline'"],
                "script-src-attr": ["'unsafe-inline'"],
            },
        } : false,
    }));
    app.use(cors({
        origin: isProd
            ? (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
            : true,
        credentials: true,
    }));
    app.use(express.json({ limit: '1mb' }));

    // cookie-parser 없이 쿠키 직접 파싱 (간단한 경우만 사용)
    app.use((req, _res, next) => {
        req.cookies = Object.fromEntries(
            (req.headers.cookie || '').split(';')
                .map((c) => c.trim().split('='))
                .filter(([k]) => k)
                .map(([k, ...v]) => [k.trim(), decodeURIComponent(v.join('=').trim())])
        );
        next();
    });

    // ── 요청 ID ───────────────────────────────────────────────────
    app.use((req, res, next) => {
        req.id = Date.now().toString(36) + Math.random().toString(36).slice(2);
        res.setHeader('X-Request-Id', req.id);
        next();
    });

    // ── Health check ──────────────────────────────────────────────
    app.get('/api/health', async (_req, res) => {
        const { healthCheck } = require('./lib/db');
        try {
            const [dbResult, redisStatus] = await Promise.all([healthCheck(), redis.healthCheck()]);
            const ok = dbResult.ok;
            res.status(ok ? 200 : 503).json({
                status: ok ? 'ok' : 'error',
                pools:  dbResult.pools,
                redis:  redisStatus,   // 'ok' | 'disabled' | 'error'
                time:   new Date().toISOString(),
            });
        } catch (err) {
            res.status(503).json({ status: 'error', pools: { app: 'error', auth: 'error' }, redis: 'error', detail: err.message });
        }
    });

    // ── Auth ──────────────────────────────────────────────────────
    app.use('/api/auth', authRoutes);

    // ── 공개 API (/api/public/:slug) ──────────────────────────────
    app.use('/api/public/:slug', queuePublicRoutes);

    // ── 직원 API (/api/staff) ─────────────────────────────────────
    app.use('/api/staff', queueStaffRoutes);

    // ── 관리자 API (/api/:slug/admin) ─────────────────────────────
    app.use('/api/:slug/admin', tenantAdminRoutes);

    // ── Superadmin API (/api/superadmin) ──────────────────────────
    app.use('/api/superadmin', superadminRoutes);

    // ── 정적 자산 (/js, /images 등) ────────────────────────────────
    app.use(express.static(PUBLIC_DIR));

    // ── HTML 화면 정적 제공 ────────────────────────────────────────
    const sendHtml = (file) => (_req, res) =>
        res.sendFile(path.join(PUBLIC_DIR, file));

    app.get('/',        sendHtml('landing.html'));
    app.get('/signup',  sendHtml('signup.html'));
    app.get('/login',   sendHtml('login.html'));
    app.get('/superadmin', sendHtml('superadmin/index.html'));

    app.get('/:slug/solo',               sendHtml('solo.html'));
    app.get('/:slug/join',               sendHtml('join.html'));
    app.get('/:slug/kiosk',              sendHtml('kiosk.html'));
    app.get('/:slug/kiosk-sms',          sendHtml('kiosk-sms.html'));
    app.get('/:slug/counter',            sendHtml('counter.html'));
    app.get('/:slug/display',            sendHtml('display.html'));
    app.get('/:slug/admin/dashboard',    sendHtml('admin/dashboard.html'));
    app.get('/:slug/admin/settings',     sendHtml('admin/settings.html'));
    app.get('/:slug/admin/messages',     sendHtml('admin/messages.html'));
    app.get('/:slug/admin/subscription', sendHtml('admin/subscription.html'));

    // ── 404 ───────────────────────────────────────────────────────
    app.use((_req, _res, next) => {
        next(new AppError(404, 'Not Found', 'NOT_FOUND'));
    });

    // ── 에러 핸들러 ───────────────────────────────────────────────
    app.use((err, req, res, _next) => {
        const status = err.statusCode || 500;
        const code = err.code || 'INTERNAL_ERROR';
        const message = err.isOperational ? err.message : 'Internal server error';

        if (status >= 500) {
            logger.error('Unhandled error', { err: err.message, stack: err.stack, path: req.path, requestId: req.id });
        }

        res.status(status).json({ error: { code, message, requestId: req.id } });
    });

    return app;
}

module.exports = { createApp };
