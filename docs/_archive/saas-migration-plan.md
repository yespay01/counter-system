# Counter System → SaaS 전환 계획

> 작성일: 2026-03-16
> 상태: 계획 수립 완료, 리서치 대기 중

---

## 배경 및 목표

### 현재 상태
- 어학원 1곳 전용 순번대기 시스템
- Firebase Realtime Database 기반 (BaaS)
- 하드코딩된 과정 코드 (CH, EN, HSK, TO)
- SMS: Solapi 직접 연동 (클라이언트 사이드)

### 전환 목표
- Firebase → 자체 Linux 서버 이전
- 단일 업체 → 멀티테넌트 SaaS
- 학원 전용 → 업종 무관 범용 서비스
- SMS 구독제 도입 (트라이얼 10건 무료 제공)

---

## 인프라 구성

```
인터넷
  ↓
Nginx (리버스 프록시 + SSL)
  ├── queue.yourdomain.com  → Node.js 앱 (포트 3000)
  └── 기존 서비스           → 기존 설정 유지

Node.js + Socket.io  ←→  Redis (실시간 대기열)
        ↓
  PostgreSQL (영구 데이터)
```

### 도메인
- 기존 도메인에 서브도메인 추가: `queue.yourdomain.com`
- 기존 서비스 영향 없음
- SSL: Let's Encrypt (certbot)

### 서버 소프트웨어
- OS: Ubuntu
- Nginx: 리버스 프록시 + 정적 파일 서빙
- PM2: Node.js 프로세스 관리 (재시작 자동화)

---

## 기술 스택

| 역할 | 기술 | 선택 이유 |
|------|------|-----------|
| 앱 서버 | Node.js + Express | 현재 JS 코드베이스와 일치 |
| 실시간 | Socket.io | Firebase Realtime DB 1:1 대체 |
| 메인 DB | PostgreSQL | 테넌트/구독/로그 영구 저장 |
| 캐시/대기열 | Redis | 실시간 대기 상태 빠른 읽기쓰기 |
| SMS | Solapi | 기존 연동 유지 |
| 인증 | JWT | 테넌트 관리자 로그인 |
| 웹서버 | Nginx | 서브도메인 처리, 기존 서버 활용 |
| 프로세스 | PM2 | 서버 안정성 |

---

## 멀티테넌트 구조

### URL 설계

```
queue.yourdomain.com/                      → 랜딩 + 가입 페이지
queue.yourdomain.com/signup                → 업체 가입
queue.yourdomain.com/login                 → 관리자 로그인

queue.yourdomain.com/:slug/kiosk           → 고객 키오스크 (일반)
queue.yourdomain.com/:slug/kiosk-sms       → 고객 키오스크 (SMS)
queue.yourdomain.com/:slug/counter         → 직원 창구 화면
queue.yourdomain.com/:slug/display         → 대기실 TV 디스플레이

queue.yourdomain.com/:slug/admin           → 업체 관리자 패널
queue.yourdomain.com/superadmin            → 운영자 슈퍼 관리자
```

`:slug` 예시: `city-hospital`, `kb-bank-jongno`

### 테넌트 격리 방식
- DB: 모든 쿼리에 `tenant_id` 필터 포함
- Socket.io: Room = `tenant:{tenant_id}` (실시간 이벤트 격리)
- Redis: Key = `queue:{tenant_id}` (대기열 격리)

---

## 데이터베이스 스키마 (PostgreSQL)

```sql
-- 업체 (테넌트)
tenants
  id           UUID  PK
  slug         TEXT  UNIQUE        (URL 식별자, 예: my-hospital)
  name         TEXT                (업체명)
  status       ENUM  active | suspended
  created_at   TIMESTAMP

-- 관리자 계정
users
  id           UUID  PK
  tenant_id    UUID  FK → tenants
  email        TEXT  UNIQUE
  password     TEXT  (bcrypt)
  role         ENUM  admin | staff

-- 구독 정보
subscriptions
  id                UUID  PK
  tenant_id         UUID  FK → tenants
  plan              ENUM  trial | basic | pro
  status            ENUM  trial | active | expired | suspended
  trial_sms_used    INT   DEFAULT 0
  trial_sms_limit   INT   DEFAULT 10
  plan_sms_limit    INT   (플랜별 월 한도)
  plan_sms_used     INT   DEFAULT 0
  started_at        TIMESTAMP
  expires_at        TIMESTAMP
  reset_at          TIMESTAMP  (월 SMS 카운트 초기화 시각)

-- 업체별 설정
tenant_settings
  tenant_id      UUID  FK → tenants
  categories     JSONB  ([{ code, name, color }])
  counter_count  INT
  ticket_format  JSONB  ({ prefix_type: 'category'|'fixed', digits: 3 })
  sms_templates  JSONB  ({ issue, ready, call })
  phone_country  TEXT   DEFAULT 'KR'

-- SMS 발송 로그
sms_logs
  id          UUID  PK
  tenant_id   UUID  FK
  phone       TEXT
  message     TEXT
  type        ENUM  issue | ready | call
  status      ENUM  sent | failed
  sent_at     TIMESTAMP

-- 대기열 세션 (일별)
queue_sessions
  id          UUID  PK
  tenant_id   UUID  FK
  date        DATE
  is_active   BOOLEAN

-- 대기 항목
queue_items
  id          UUID  PK
  session_id  UUID  FK
  tenant_id   UUID  FK
  number      TEXT         (예: A-001)
  category    TEXT
  phone       TEXT         (SMS 방식일 때)
  status      ENUM  waiting | called | done | skipped
  issued_at   TIMESTAMP
  called_at   TIMESTAMP
```

---

## Redis 구조 (실시간 대기열)

```
queue:{tenant_id}:waiting        → List  [{ number, category, phone, issued_at }]
queue:{tenant_id}:current_call   → Hash  { number, counter, category, call_time }
queue:{tenant_id}:counters       → Hash  { 1: "A-003", 2: "B-007", ... }
queue:{tenant_id}:daily_counter  → Hash  { A: 12, B: 5, ... }  (오늘 발급 수)
```

---

## Socket.io 이벤트 설계

### 서버 → 클라이언트
```
queue:updated      대기열 변경 (발급/취소)
call:new           새 호출 { number, counter, category, is_recall }
call:recall        재호출
counter:updated    창구 상태 변경
session:reset      일일 초기화
subscription:warn  SMS 잔여량 부족 경고
```

### 클라이언트 → 서버
```
room:join          { tenant_id, role: 'kiosk'|'counter'|'display' }
queue:issue        { category, phone? }
queue:call_next    { counter_id }
queue:recall       { counter_id }
queue:complete     { counter_id }
queue:call_direct  { number, counter_id }
```

---

## API 엔드포인트

### 인증
```
POST /api/auth/signup       업체 가입 (테넌트 생성)
POST /api/auth/login        로그인 → JWT 발급
POST /api/auth/refresh      토큰 갱신
```

### 업체 설정
```
GET  /api/tenant/:slug/settings     설정 조회 (공개 - 키오스크용)
PUT  /api/tenant/settings           설정 수정 (인증 필요)
```

### 대기열 (인증 불필요)
```
POST /api/queue/:slug/issue         번호 발급
GET  /api/queue/:slug/status        현재 상태 조회
```

### 대기열 관리 (직원)
```
POST /api/queue/:slug/call-next     다음 호출
POST /api/queue/:slug/recall        재호출
POST /api/queue/:slug/complete      응대 완료
POST /api/queue/:slug/call-direct   직접 호출
POST /api/queue/:slug/reset         초기화
```

### 구독
```
GET  /api/subscription/status       구독 상태 + SMS 잔여량
POST /api/subscription/upgrade      플랜 업그레이드 (추후 결제 연동)
```

### 슈퍼 관리자
```
GET  /api/superadmin/tenants        전체 업체 목록
GET  /api/superadmin/stats          수익/사용량 통계
PUT  /api/superadmin/tenant/:id     업체 상태 변경
```

---

## SMS 트라이얼 로직

```
번호 발급 요청
    ↓
구독 상태 확인
    ├── trial 상태
    │     ├── trial_sms_used < 10  →  SMS 발송 + used++
    │     └── trial_sms_used >= 10 →  번호는 발급, SMS는 스킵
    │                                  키오스크에 "체험 종료" 안내 표시
    │                                  관리자에게 업그레이드 이메일 발송
    ├── active 상태
    │     ├── 월 한도 미초과  →  SMS 발송 + used++
    │     └── 월 한도 초과   →  SMS 스킵 + 관리자 알림
    └── expired / suspended  →  서비스 접근 차단 (안내 페이지 표시)
```

---

## 화면 구성

### 기존 화면 (수정)
| 화면 | 주요 변경 내용 |
|------|----------------|
| `kiosk-normal/index.html` | Firebase → Socket.io, 하드코딩 과정 → 동적 로드 |
| `kiosk-sms/index.html` | Firebase+직접 SMS → Socket.io+백엔드 SMS, 범용화 |
| `counter.html` | Firebase → Socket.io |
| `display.html` | Firebase → Socket.io |

### 신규 화면
| 화면 | 내용 |
|------|------|
| `landing/index.html` | 서비스 소개 + 가입 버튼 |
| `admin/index.html` | 업체 관리자 패널 (카테고리/창구 설정, 통계, 구독 현황) |
| `superadmin/index.html` | 운영자 대시보드 (전체 테넌트, 수익) |

---

## 개발 로드맵

```
Phase 1  [인프라 구축]
  ├── Ubuntu에 Node.js, PostgreSQL, Redis 설치
  ├── Nginx 서브도메인 설정
  ├── SSL 인증서 (Let's Encrypt)
  └── PM2 설정

Phase 2  [코어 백엔드]
  ├── PostgreSQL 스키마 생성
  ├── Socket.io 실시간 서버
  ├── 대기열 CRUD API
  └── 단일 테넌트 수동 생성 후 기존 화면 연결 테스트

Phase 3  [기존 화면 마이그레이션]
  ├── kiosk / counter / display → Firebase 코드 제거
  ├── Socket.io 클라이언트 연결
  └── 단일 테넌트 정상 동작 확인

Phase 4  [멀티테넌트 + 인증]
  ├── 가입/로그인 화면
  ├── 테넌트별 설정 관리
  └── URL slug 기반 테넌트 분리

Phase 5  [범용화 + SMS 재개발]
  ├── 동적 카테고리 시스템
  ├── SMS 템플릿 커스터마이징
  └── 트라이얼 10건 로직

Phase 6  [관리자 패널]
  ├── 업체 관리자 화면 (설정, 통계, 사용량)
  └── 슈퍼 관리자 화면

Phase 7  [결제 연동] ← 추후
  ├── 토스페이먼츠 월 자동결제
  └── 플랜 업그레이드 흐름
```

---

## 미결 사항 (개발 전 확인 필요)

| # | 항목 | 내용 |
|---|------|------|
| 1 | 직원 창구 인증 | 현재 인증 없음. 유지 vs 직원 PIN 추가? |
| 2 | 트라이얼 만료 후 데이터 보존 기간 | 30일? 90일? |
| 3 | 서브도메인 이름 | `queue.` 또는 다른 이름? |
| 4 | Solapi 계정 운영 방식 | 업체별 API 키 입력 vs 내 계정으로 통합 발송? |
