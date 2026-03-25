# 운영 매뉴얼 (Counter System SaaS)

> 대상: 파일럿 운영자 / 서버 관리자
> 작성 기준: Phase 7 (2026-03-25)

---

## 1. 서버 관리

### 시작 / 재시작

```bash
# PM2 (운영 환경 권장)
pm2 start src/index.js --name counter-api
pm2 restart counter-api
pm2 stop counter-api

# 직접 실행 (개발/디버그)
node src/index.js

# Docker Compose (DB + Redis 포함)
docker compose up -d
docker compose down
```

### 상태 확인

```bash
pm2 status
pm2 logs counter-api --lines 50
curl http://localhost:3000/api/health
```

`/api/health` 응답 예시:
```json
{
  "status": "ok",
  "pools": { "app": "ok", "auth": "ok" },
  "redis": "ok",
  "time": "2026-03-25T12:00:00.000Z"
}
```

`redis`가 `"disabled"`이면 캐시 미사용 (Solo 모드, 정상 동작).
`pools.app`이 `"error"`이면 PostgreSQL 연결 확인 필요.

---

## 2. 로그 확인

로그는 JSON 형식으로 stdout에 출력됩니다.

```bash
# PM2 실시간 로그
pm2 logs counter-api

# 파일로 저장된 경우
tail -f /var/log/counter-api/out.log | jq '.'

# 에러만 필터
pm2 logs counter-api | grep '"level":"error"'

# 감사 로그만 필터 (관리자 작업 기록)
pm2 logs counter-api | grep '"audit":true'
```

### 감사 로그 항목

| action | 의미 |
|--------|------|
| `settings.update` | 업체 기본 설정 변경 |
| `category.upsert` | 카테고리 추가/수정 |
| `menu_item.upsert` | 메뉴 항목 추가/수정 |
| `message_settings.update` | 메시지 발신 설정 변경 |
| `subscription.update` | 구독 상태 변경 (superadmin) |
| `billing_log.create` | 정산 내역 등록 (superadmin) |

---

## 3. 파일럿 고객 온보딩 체크리스트

### 3-1. 테넌트 생성

1. `POST /api/auth/signup` 으로 업체 계정 생성
   - 필드: `email`, `password`, `businessName`, `slug`
   - `slug`는 URL 식별자 (예: `hotteok-shop` → `/:slug/solo`)
2. 회원가입 직후 상태: `sandbox_mode = true`, `subscription.status = 'trial'`

### 3-2. 샌드박스 테스트

1. `/{slug}/solo` 접속 → 번호 발급 테스트
2. 샌드박스 배너가 보이면 정상 (실제 SMS 미발송)
3. `/{slug}/admin/messages` → 발송 로그 탭에서 sandbox 발송 확인
4. `/{slug}/admin/settings` → 카테고리 설정

### 3-3. 유료 전환 절차

1. 고객으로부터 계좌이체 입금 확인
2. `/api/superadmin/tenants/{tenantId}/subscription` PUT 요청:
   ```json
   {
     "status": "active",
     "memo": "계좌이체 확인 YYYY-MM-DD"
   }
   ```
3. `/api/superadmin/tenants/{tenantId}/billing-logs` POST로 정산 내역 등록
4. DB에서 `sandbox_mode = false` 직접 업데이트 (또는 superadmin API 사용):
   ```sql
   UPDATE tenants SET sandbox_mode = false WHERE slug = '업체slug';
   ```
5. 고객에게 유료 전환 완료 안내

### 3-4. Solapi 채널 설정 (실발송 필요 시)

1. `/{slug}/admin/messages` → 메시지 설정 탭
2. PFID, 발신번호, 알림톡 템플릿 식별자 입력 후 저장

---

## 4. 에러 코드 안내

| code | HTTP | 의미 |
|------|------|------|
| `RATE_LIMIT_AUTH` | 429 | 로그인/회원가입 요청 과다 (15분 10회 초과) |
| `RATE_LIMIT_QUEUE` | 429 | 번호 발급 요청 과다 (1분 15회 초과) |
| `TENANT_NOT_FOUND` | 404 | 존재하지 않는 slug |
| `UNAUTHORIZED` | 401 | 인증 토큰 없음 또는 만료 |
| `FORBIDDEN` | 403 | 권한 없음 (role 불일치) |
| `SESSION_NOT_OPEN` | 400 | 운영 세션 없음 (당일 세션 초기화 필요) |
| `NO_WAITING` | 400 | 대기열 비어있음 |
| `INTERNAL_ERROR` | 500 | 서버 내부 오류 (로그 `requestId` 확인) |

500 에러 발생 시 응답의 `requestId`를 로그에서 검색하면 스택 트레이스 확인 가능.

---

## 5. DB 백업

```bash
# 직접 연결 백업 (로컬 또는 운영 서버)
pg_dump -U counter_superuser -h localhost counter_system > backup_$(date +%Y%m%d).sql

# Docker Compose 환경 백업 (server/ 디렉터리에서 실행)
docker compose exec postgres pg_dump -U counter_superuser counter_system > backup_$(date +%Y%m%d).sql

# 복구
psql -U counter_superuser -h localhost counter_system < backup_YYYYMMDD.sql
```

운영 환경에서는 pg_cron 또는 crontab으로 일 1회 자동 백업을 설정합니다.

---

## 6. 구독 상태 흐름

```
trial → active → past_due → suspended
```

| 상태 | 의미 | 조치 |
|------|------|------|
| `trial` | 샌드박스 체험 | 결제 후 superadmin에서 active로 전환 |
| `active` | 정상 운영 | — |
| `past_due` | 결제 기한 초과 | 고객 연락 후 입금 확인 |
| `suspended` | 서비스 중단 | superadmin에서 active로 복구 가능 |

---

## 7. Rate Limit 기준

| 엔드포인트 | 제한 | 초기화 |
|-----------|------|--------|
| `POST /api/auth/login` | IP당 15분 10회 | 15분 경과 |
| `POST /api/auth/signup` | IP당 15분 10회 | 15분 경과 |
| `POST /api/auth/refresh` | IP당 15분 30회 | 15분 경과 |
| `POST /api/public/:slug/queue/issue` | IP당 1분 15회 | 1분 경과 |

키오스크 여러 대가 같은 IP를 사용하는 경우(NAT 환경) queueIssue 한도가 공유됩니다.
필요 시 `src/lib/rateLimiter.js`에서 `max` 값을 조정하세요.
