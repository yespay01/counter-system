'use strict';

const { Router } = require('express');
const ctrl = require('./auth.controller');
const { authStrict, authRefresh } = require('../../lib/rateLimiter');

const router = Router();

router.post('/signup',  authStrict,  ctrl.signup);
router.post('/login',   authStrict,  ctrl.login);
router.post('/refresh', authRefresh, ctrl.refresh);
router.post('/logout',  ctrl.logout);

module.exports = router;
