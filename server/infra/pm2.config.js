module.exports = {
    apps: [
        {
            name: 'counter-api',
            script: './src/index.js',
            cwd: '/home/insuk/counter-system/server',
            instances: 1, // Standard 단계에서 cluster 모드로 전환
            exec_mode: 'fork',
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
                // DATABASE_URL, DATABASE_AUTH_URL, JWT_SECRET 등은 서버의 .env 파일에서 로드
                // DATABASE_SUPERUSER_URL은 마이그레이션 전용 — PM2에 포함하지 않음
            },
            // 로그
            out_file: '/home/insuk/logs/counter-api-out.log',
            error_file: '/home/insuk/logs/counter-api-err.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            // 재시작 정책
            max_restarts: 10,
            restart_delay: 3000,
            watch: false,
        },
    ],
};
