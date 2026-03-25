'use strict';

const authService = require('./auth.service');
const logger = require('../../lib/logger');

async function signup(req, res, next) {
    try {
        const { email, password, slug, name, industryType } = req.body;
        const result = await authService.signup({ email, password, slug, name, industryType });

        setRefreshCookie(res, result.refreshToken);
        res.status(201).json({
            tenant: result.tenant,
            user: result.user,
            accessToken: result.accessToken,
        });
    } catch (err) {
        next(err);
    }
}

async function login(req, res, next) {
    try {
        const { email, password } = req.body;
        const result = await authService.login({ email, password });

        setRefreshCookie(res, result.refreshToken);
        res.json({
            user: result.user,
            accessToken: result.accessToken,
        });
    } catch (err) {
        next(err);
    }
}

async function refresh(req, res, next) {
    try {
        // 쿠키 or body 둘 다 허용
        const token = req.cookies?.refreshToken || req.body?.refreshToken;
        const result = await authService.refresh({ refreshToken: token });

        setRefreshCookie(res, result.refreshToken);
        res.json({ accessToken: result.accessToken });
    } catch (err) {
        next(err);
    }
}

async function logout(req, res, next) {
    try {
        const token = req.cookies?.refreshToken || req.body?.refreshToken;
        await authService.logout({ refreshToken: token });
        res.clearCookie('refreshToken');
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
}

function setRefreshCookie(res, token) {
    res.cookie('refreshToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}

module.exports = { signup, login, refresh, logout };
