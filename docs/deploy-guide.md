# Counter System — 실서버 배포 가이드

> 대상 서버: `insuk@192.168.0.5` (LAN) / `insuk@100.107.201.37` (Tailscale)
> 기준 브랜치: `main` (`https://github.com/yespay01/counter-system`)

---

## 포트 할당 (기존 서비스 충돌 회피)

| 서비스 | 호스트 포트 | 비고 |
|--------|-----------|------|
| Node.js API | **3200** | 3000은 coupang-blog-web 사용 중 |
| PostgreSQL (Docker) | **5435 → 5432** | 5432는 n8n-postgres-1 사용 중 |
| Redis (Docker) | **6379** | 비어 있음 |

---

## 선행 조건 (배포 전 확인)

로컬 Windows에서 `server/` 코드가 GitHub에 push된 상태여야 합니다.
아직 push되지 않았다면 배포 전에 먼저 완료해주세요.

---

## 배포 절차

### 1. 코드 클론

```bash
cd ~/projects/
git clone https://github.com/yespay01/counter-system.git
cd counter-system/server/
```

이미 클론된 경우:
```bash
cd ~/projects/counter-system/
git pull
cd server/
```

---

### 2. PM2 설치

```bash
npm install -g pm2
```

---

### 3. 의존성 설치

```bash
npm install
```

---

### 4. Docker Compose 포트 수정

PostgreSQL 호스트 포트를 5432 → 5435로 변경 (n8n-postgres-1 충돌 회피):

```bash
sed -i 's/- "5432:5432"/- "5435:5432"/' docker-compose.yml
```

변경 확인:
```bash
grep "5435\|5432" docker-compose.yml
# 기대: - "5435:5432"
```

---

### 5. 환경변수 설정

```bash
cp .env.example .env
nano .env   # 또는 vi .env
```

아래 항목을 수정합니다:

```dotenv
NODE_ENV=production
PORT=3200

# PostgreSQL 포트를 5432 → 5435로 변경
DATABASE_URL=postgresql://counter_app:YOUR_APP_PASSWORD@localhost:5435/counter_system
DATABASE_AUTH_URL=postgresql://counter_auth:YOUR_AUTH_PASSWORD@localhost:5435/counter_system
DATABASE_SUPERUSER_URL=postgresql://counter_superuser:YOUR_SUPERUSER_PASSWORD@localhost:5435/counter_system

# JWT 시크릿 (32자 이상, 안전한 랜덤 값으로 변경)
JWT_SECRET=CHANGE_THIS_TO_SECURE_RANDOM_32CHARS
JWT_REFRESH_SECRET=CHANGE_THIS_TO_ANOTHER_SECURE_32CHARS
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Superadmin 시크릿
SUPERADMIN_SECRET=CHANGE_THIS_SUPERADMIN_SECRET_32CHARS

# Redis
REDIS_URL=redis://localhost:6379
```

> 비밀번호는 임의로 설정하되, 나중에 DB 컨테이너 초기화 시 사용한 값과 일치해야 합니다.
> docker-compose.yml의 `POSTGRES_PASSWORD`와 .env의 `counter_superuser` 비밀번호를 맞춰주세요.

---

### 6. DB + Redis 컨테이너 시작

```bash
docker compose up -d
```

컨테이너 상태 확인:
```bash
docker compose ps
# postgres, redis 모두 Up 상태 확인
```

---

### 7. 마이그레이션 실행

DB 준비 대기 후 실행:
```bash
sleep 5
node src/lib/migrate.js
```

성공 시 `Migration complete` 또는 각 파일명이 출력됩니다.
오류 발생 시 postgres 컨테이너 로그 확인:
```bash
docker compose logs postgres
```

---

### 8. 서버 시작

```bash
NODE_ENV=production pm2 start src/index.js --name counter-api
pm2 save
```

부팅 시 자동 시작 설정:
```bash
pm2 startup
# 출력된 sudo 명령어를 복사해서 실행
```

---

### 9. 헬스체크 확인

```bash
curl http://localhost:3200/api/health
```

기대 응답:
```json
{
  "status": "ok",
  "pools": { "app": "ok", "auth": "ok" },
  "redis": "ok",
  "time": "..."
}
```

`redis`가 `"disabled"`이면 REDIS_URL 확인.
`pools.app`이 `"error"`이면 DB 연결 확인 (포트, 비밀번호).

---

### 10. PM2 상태 확인

```bash
pm2 status
pm2 logs counter-api --lines 20
```

---

## 문제 해결

### bcrypt 오류 (`ELF` 관련)
Windows에서 node_modules를 생성한 경우 Linux 바이너리와 호환이 안 됩니다.

```bash
npm rebuild bcrypt
```

### 마이그레이션 재실행
이미 적용된 마이그레이션은 멱등성이 없을 수 있으므로, 재실행 전에 migrate.js 내부 로직을 확인하세요.

### 포트 확인
```bash
ss -tln | grep -E ":(3200|5435|6379)"
```

---

## 이후 운영

로그 확인, 재시작, 백업 등은 `docs/operations-manual.md` 참고.
