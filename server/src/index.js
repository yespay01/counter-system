'use strict';

require('dotenv').config();

const http = require('http');
const { createApp } = require('./app');
const { init: initSockets } = require('./sockets');
const redis  = require('./lib/redis');
const logger = require('./lib/logger');

const PORT = process.env.PORT || 3000;

redis.init();

const app = createApp();
const server = http.createServer(app);
const io = initSockets(server);

// io를 app에서 참조할 수 있도록 (Phase 2에서 queue 서비스에서 broadcast 사용)
app.set('io', io);

server.listen(PORT, () => {
    logger.info('Server started', { port: PORT, env: process.env.NODE_ENV });
});

// Graceful shutdown
function shutdown(signal) {
    logger.info('Shutdown signal received', { signal });
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: reason?.message || String(reason) });
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception — 프로세스 종료', { err: err.message, stack: err.stack });
    process.exit(1);
});
