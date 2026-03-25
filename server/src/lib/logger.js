'use strict';

const isDev = process.env.NODE_ENV !== 'production';

function timestamp() {
    return new Date().toISOString();
}

const logger = {
    info(msg, meta) {
        console.log(JSON.stringify({ level: 'info', time: timestamp(), msg, ...meta }));
    },
    warn(msg, meta) {
        console.warn(JSON.stringify({ level: 'warn', time: timestamp(), msg, ...meta }));
    },
    error(msg, meta) {
        console.error(JSON.stringify({ level: 'error', time: timestamp(), msg, ...meta }));
    },
    debug(msg, meta) {
        if (isDev) {
            console.debug(JSON.stringify({ level: 'debug', time: timestamp(), msg, ...meta }));
        }
    },
};

module.exports = logger;
