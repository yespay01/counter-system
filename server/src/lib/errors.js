'use strict';

class AppError extends Error {
    constructor(statusCode, message, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code || 'ERROR';
        this.isOperational = true;
    }
}

module.exports = { AppError };
