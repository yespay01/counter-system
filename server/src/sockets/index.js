'use strict';

const { Server } = require('socket.io');
const { verifyAccess } = require('../lib/jwt');
const { findBySlug } = require('../modules/tenant/tenant.service');
const logger = require('../lib/logger');

/**
 * room 이름 헬퍼
 */
const rooms = {
    tenant:  (tid)      => `tenant:${tid}`,
    display: (tid)      => `tenant:${tid}:display`,
    counter: (tid, no)  => `tenant:${tid}:counter:${no}`,
    admin:   (tid)      => `tenant:${tid}:admin`,
};

function init(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.NODE_ENV === 'production' ? false : '*',
            methods: ['GET', 'POST'],
        },
        transports: ['websocket', 'polling'],
    });

    io.on('connection', (socket) => {
        logger.debug('socket connected', { id: socket.id });

        /**
         * room:join — tenantId를 클라이언트가 직접 넘기지 않음
         *
         * 공개 화면 (solo, join, display):
         *   { slug: 'my-shop', type: 'display' | 'tenant' }
         *
         * 인증 화면 (counter, admin):
         *   { token: '<JWT>', type: 'counter' | 'admin', counterNo?: number }
         */
        socket.on('room:join', async ({ slug, token, type, counterNo }) => {
            let tenantId;

            if (token) {
                // 인증 화면: JWT 검증 후 tid 추출
                try {
                    const payload = verifyAccess(token);
                    tenantId = payload.tid;
                } catch {
                    socket.emit('room:error', { code: 'INVALID_TOKEN' });
                    return;
                }
            } else if (slug) {
                // 공개 화면: slug → tenantId 서버 결정
                try {
                    const tenant = await findBySlug(slug);
                    tenantId = tenant.id;
                } catch {
                    socket.emit('room:error', { code: 'INVALID_SLUG' });
                    return;
                }
            } else {
                socket.emit('room:error', { code: 'MISSING_IDENTIFIER' });
                return;
            }

            let room;
            if (type === 'display') {
                room = rooms.display(tenantId);
            } else if (type === 'counter' && counterNo) {
                // counter room은 인증(token)으로만 접근 허용
                if (!token) {
                    socket.emit('room:error', { code: 'AUTH_REQUIRED' });
                    return;
                }
                room = rooms.counter(tenantId, counterNo);
            } else if (type === 'admin') {
                // admin room은 인증(token)으로만 접근 허용
                if (!token) {
                    socket.emit('room:error', { code: 'AUTH_REQUIRED' });
                    return;
                }
                room = rooms.admin(tenantId);
            } else {
                room = rooms.tenant(tenantId);
            }

            socket.join(room);
            logger.debug('socket joined room', { socketId: socket.id, room });
            socket.emit('room:joined', { room });
        });

        socket.on('disconnect', () => {
            logger.debug('socket disconnected', { id: socket.id });
        });
    });

    // broadcast 유틸 (queue.routes.js에서 사용)
    io.broadcast = {
        queueUpdated: (tid, data) => io.to(rooms.tenant(tid)).to(rooms.display(tid)).emit('queue:updated', data),
        callNew:      (tid, data) => io.to(rooms.display(tid)).emit('call:new', data),
        callRecall:   (tid, data) => io.to(rooms.display(tid)).emit('call:recall', data),
        sessionReset: (tid)       => io.to(rooms.tenant(tid)).to(rooms.display(tid)).emit('session:reset'),
        messageStatus:(tid, data) => io.to(rooms.admin(tid)).emit('message:status', data),
    };

    return io;
}

module.exports = { init, rooms };
