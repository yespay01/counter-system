'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// DATABASE_SUPERUSER_URL 필수 — 폴백 없음
// counter_app/counter_auth로는 role 생성 권한이 없어 마이그레이션 실패
const connStr = process.env.DATABASE_SUPERUSER_URL;
if (!connStr) {
    console.error('[migrate] DATABASE_SUPERUSER_URL이 설정되지 않았습니다.');
    console.error('[migrate] .env.example을 참고해 슈퍼유저 접속 정보를 설정하세요.');
    process.exit(1);
}

const pool = new Pool({ connectionString: connStr });
const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

async function run() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename   TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        const { rows: applied } = await client.query('SELECT filename FROM schema_migrations');
        const appliedSet = new Set(applied.map((r) => r.filename));

        const files = fs
            .readdirSync(MIGRATIONS_DIR)
            .filter((f) => f.endsWith('.sql'))
            .sort();

        for (const file of files) {
            if (appliedSet.has(file)) {
                console.log(`[skip] ${file}`);
                continue;
            }
            console.log(`[run ] ${file}`);
            const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
            await client.query('COMMIT');
            console.log(`[done] ${file}`);
        }
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch((err) => {
    console.error('[migrate] 실패:', err.message);
    process.exit(1);
});
