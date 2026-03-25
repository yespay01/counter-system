'use strict';

const crypto = require('crypto');

const SOLAPI_ENDPOINT = 'https://api.solapi.com/messages/v4/send';

function buildAuthHeader() {
    const apiKey    = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;
    if (!apiKey || !apiSecret) return null;

    const date = new Date().toISOString();
    const salt = crypto.randomBytes(8).toString('hex');
    const sig  = crypto.createHmac('sha256', apiSecret).update(date + salt).digest('hex');
    return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${sig}`;
}

/**
 * 알림톡(ATA) 발송
 * @returns {{ success: boolean, statusCode?: string, error?: string }}
 */
async function sendAta({ to, pfId, templateId, variables, from }) {
    const auth = buildAuthHeader();
    if (!auth) {
        return { success: false, error: 'SOLAPI_API_KEY 미설정' };
    }

    const body = {
        message: {
            to,
            from,
            kakaoOptions: { pfId, templateId, variables },
        },
    };

    try {
        const res = await fetch(SOLAPI_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: auth },
            body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) {
            return { success: false, statusCode: String(res.status), error: data?.errorCode || data?.message };
        }
        return { success: true, statusCode: String(res.status) };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * SMS 발송 (알림톡 실패 시 fallback)
 */
async function sendSms({ to, from, text }) {
    const auth = buildAuthHeader();
    if (!auth) {
        return { success: false, error: 'SOLAPI_API_KEY 미설정' };
    }

    const body = { message: { to, from, text } };

    try {
        const res = await fetch(SOLAPI_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: auth },
            body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) {
            return { success: false, statusCode: String(res.status), error: data?.errorCode || data?.message };
        }
        return { success: true, statusCode: String(res.status) };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

module.exports = { sendAta, sendSms };
