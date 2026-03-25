# 2-2. 아키텍처 설계 확정

> 상태: 🟢 v2 (2026-03-17, 1-1/1-2 회의 결과 반영)
> 전제: `Node.js + Express + Socket.IO + PostgreSQL + Nginx`, Solapi 유지, 결제는 Solo MVP에서 PG 미연동 + 수동 처리
> Redis는 설계 포함, MVP 런타임 보류

---

## 1. 목표

현재 Firebase 기반 단일 고객용 정적 HTML 시스템을 `멀티테넌트 SaaS`로 전환한다.

**1차 타겟 (Solo MVP)**: 소규모 현장 판매 업종 (호떡집, 분식 포장점, 팝업스토어, 소형 베이커리 등)
태블릿 1대로 번호 발급 + 호출 + SMS를 처리하는 `Solo 모드`부터 완성한 뒤, 다창구/디스플레이 확장(`Standard`)으로 나아간다.

핵심 요구는 아래 4가지다.

- 여러 업체를 하나의 서비스에서 격리 운영
- 키오스크, 창구, 디스플레이 간 실시간 동기화
- 알림톡/SMS와 구독 결제 운영
- Solo MVP부터 단순하게, 이후 Standard로 확장 가능한 구조

## 2. 최종 기술 스택

| 영역 | 선택 |
|------|------|
| 웹 서버 | Nginx |
| 앱 서버 | Node.js 24 LTS + Express |
| 실시간 | Socket.IO |
| DB | PostgreSQL |
| 캐시 / 실시간 상태 | Redis (**설계 포함, MVP 런타임 보류**) |
| 인증 | JWT + Refresh Token |
| 메시지 | Solapi |
| 결제 | `BillingService` 경계 + `ManualBillingService` (PG는 추후 연결) |
| 프로세스 관리 | PM2 |

## 3. 배포 구조

```text
Client Browser
  ├─ solo
  ├─ kiosk
  ├─ counter
  ├─ display
  └─ admin
        ↓
Nginx
  ├─ /              → web app / static assets
  ├─ /api           → Express REST API
  └─ /socket.io     → Socket.IO
        ↓
Node.js App
  ├─ auth
  ├─ tenant
  ├─ queue
  ├─ messaging
  ├─ billing
  └─ admin
    ├─ PostgreSQL
    └─ Redis
```

### 운영 원칙
- 초기 1대 서버 운영
- Node.js는 `PM2 단일 프로세스`
- Redis는 Solo MVP 런타임에서 불포함. Standard 단계(다창구, 다중 인스턴스)에서 도입
- 다중 서버로 갈 때만 `PM2 cluster` 또는 앱 인스턴스 다중화

## 4. 멀티테넌트 구조

### URL
- `/:slug/solo`
- `/:slug/join`
- `/:slug/kiosk`
- `/:slug/kiosk-sms`
- `/:slug/counter`
- `/:slug/display`
- `/:slug/admin/dashboard`
- `/:slug/admin/settings`
- `/:slug/admin/categories`
- `/:slug/admin/messages`
- `/:slug/admin/subscription`
- `/login`
- `/signup`
- `/superadmin`

### 테넌트 식별
- 공개 화면은 `slug`
- 내부 DB/이벤트/Redis는 `tenant_id`

### 격리 원칙
- PostgreSQL: 모든 테이블에 `tenant_id`
- Redis: `queue:{tenantId}:*`
- Socket.IO room: `tenant:{tenantId}:*`
- JWT payload에 `tenant_id` 포함

## 5. 앱 모듈 구조

### 1) Auth
- 회원가입
- 로그인
- 리프레시 토큰
- 비밀번호 해시(bcrypt/argon2 계열)

### 2) Tenant
- 업체 기본정보
- slug 관리
- 카테고리 / 카운터 / 메시지 설정
- 기기 접근 토큰

### 3) Queue
- 번호 발급
- 전화번호 입력 기반 발급
- QR 진입 기반 셀프 접수
- 메뉴/주문 항목 선택값 저장
- 다음 호출 / 재호출 / 완료 / 직접 호출
- 일일 세션 생성 / 종료
- 대기상태 조회

### 4) Messaging
- Solapi 발송
- 템플릿 관리
- 발송 로그
- 실패 재시도 / fallback
- 성공 발송 기준 사용량/정산 집계
- 발송 시점 원가/청구 단가 스냅샷 기록

### 5) Billing
- 계좌이체 수동 확인
- 구독 상태 갱신
- billing 로그
- PG 연동 지점 유지

### 6) Admin
- 업체 관리자 화면
- 발송 현황 / 사용량 / 구독 상태
- Solo MVP 최소 superadmin + 이후 고도화

## 6. PostgreSQL 스키마

### 핵심 테이블

#### tenants
- `id`
- `slug`
- `name`
- `industry_type`
- `status`
- `timezone`
- `created_at`

#### users
- `id`
- `tenant_id`
- `email`
- `password_hash`
- `role` (`owner`, `admin`, `staff`)
- `status`
- `last_login_at`

#### tenant_settings
- `tenant_id`
- `counter_count`
- `ticket_prefix_mode`
- `ticket_digits`
- `theme`
- `phone_country`
- `kiosk_mode_default`
- `phone_input_enabled`
- `qr_join_enabled`
- `menu_selection_enabled`
- `message_channel_mode` (`platform_shared`, `tenant_owned`)
- `solapi_pfid`
- `solapi_sender`
- `solapi_template_issue`
- `solapi_template_ready`
- `solapi_template_call`
- `sms_fallback_enabled`
- `created_at`
- `updated_at`

#### categories
- `id`
- `tenant_id`
- `code`
- `name`
- `display_order`
- `is_active`

#### menu_items
- `id`
- `tenant_id`
- `code`
- `name`
- `display_order`
- `is_active`

#### counter_assignments
- `id`
- `tenant_id`
- `counter_no`
- `category_code`

#### queue_sessions
- `id`
- `tenant_id`
- `business_date`
- `status` (`open`, `closed`)
- `opened_at`
- `closed_at`

#### queue_items
- `id`
- `tenant_id`
- `session_id`
- `ticket_number`
- `category_code`
- `customer_phone`
- `entry_channel` (`solo_tablet`, `qr_self`)
- `menu_code`
- `menu_label`
- `channel` (`paper`, `sms`)
- `status` (`waiting`, `called`, `done`, `skipped`, `cancelled`)
- `issued_at`
- `called_at`
- `completed_at`

#### current_calls
- `tenant_id`
- `counter_no`
- `queue_item_id`
- `call_type` (`normal`, `recall`, `direct`)
- `called_at`

#### sms_logs
- `id`
- `tenant_id`
- `queue_item_id`
- `phone`
- `provider`
- `message_type` (`issue`, `ready`, `call`)
- `channel` (`ata`, `sms`, `lms`)
- `channel_mode` (`platform_shared`, `tenant_owned`)
- `provider_status_code`
- `status` (`previewed`, `queued`, `sent`, `failed`)
- `sandbox` (boolean)
- `billable` (boolean)
- `provider_unit_cost`
- `billing_unit_price`
- `billing_amount`
- `requested_at`
- `sent_at`

#### subscriptions
- `id`
- `tenant_id`
- `plan_code`
- `status` (`trial`, `active`, `past_due`, `cancelled`, `suspended`)
- `trial_ends_at`
- `current_period_start`
- `current_period_end`
- `included_ata_quota`
- `included_sms_quota`
- `billing_provider`
- `billing_method`
- `billing_customer_key`
- `billing_key`
- `activated_at`
- `next_billing_at`
- `last_paid_at`
- `last_failed_at`
- `memo`

#### usage_monthly
- `id`
- `tenant_id`
- `year_month`
- `ata_sent`
- `sms_sent`
- `lms_sent`
- `issue_sent`
- `ready_sent`
- `call_sent`
- `billable_count`
- `provider_cost_amount`
- `billed_amount`
- `margin_amount`
- `extra_billing_amount`

#### billing_logs
- `id`
- `tenant_id`
- `subscription_id`
- `provider`
- `billing_key`
- `amount`
- `status`
- `requested_at`
- `paid_at`
- `failed_at`
- `provider_payment_key`

### 인덱스 원칙
- 모든 조회 핵심축은 `tenant_id`
- 대표 인덱스:
  - `(tenant_id, business_date)`
  - `(tenant_id, status, issued_at)`
  - `(tenant_id, counter_no)`
  - `(tenant_id, year_month)`

### 보안 원칙
- `Row-Level Security` 적용
- 앱 계정은 `BYPASSRLS` 금지
- owner 전용 연결 사용 금지

## 7. Redis 설계

### 키 구조 (Phase 5 구현 기준)
- `queue:{tenantId}:status` — 대기 현황 전체 JSON (`{ sessionId, waiting[], currentCalls[] }`)
- `queue:{tenantId}:*` — 테넌트 범위 일괄 무효화 패턴 (resetSession/재연결 시 사용)

> 초기 계획의 분리 키(`waiting`, `counters`, `currentCall`, `dailyCounter`, `presence`)는
> 구현 단계에서 단일 `status` blob으로 통합됐다.
> `getQueueStatus`가 항상 전체 데이터를 함께 읽고 쓰는 패턴이라 분리 키의 이점이 없어서,
> 단순하고 원자적인 단일 blob 방식을 채택했다.

### 용도
- `getQueueStatus` 반응 속도 개선 (DB 조회 → Redis 히트로 대체)
- 디스플레이/카운터 화면의 폴링 부하 감소
- 이후 다중 인스턴스 환경에서 Redis Pub/Sub 확장 기반

### 원칙
- Redis는 `실시간 캐시`, PostgreSQL은 `정본`
- 장애 시 Redis 재구축 가능 (DB 직접 조회로 자동 대체)
- write 후 캐시 무효화 → 다음 읽기에서 DB 재구성 (cache-aside with invalidation)
- 재연결 시 `queue:*` 전체 삭제 → 장애 중 누락된 invalidate 보완
- **Solo MVP에서는 Redis 미사용.** `REDIS_URL` 미설정 시 자동으로 DB 직접 조회 모드
- Standard 전환 시 `REDIS_URL` 설정만으로 캐시 활성화

## 8. REST API 설계

### 공개 API
- `GET /api/public/:slug/join-config`
- `POST /api/public/:slug/queue/issue`
- `GET /api/public/:slug/queue/status`
- `GET /api/public/:slug/settings`

### 인증 API
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

### 직원 API
- `POST /api/staff/queue/call-next`
- `POST /api/staff/queue/recall`
- `POST /api/staff/queue/complete`
- `POST /api/staff/queue/call-direct`
- `POST /api/staff/queue/reset`

### 관리자 API
- `GET /api/admin/settings`
- `PUT /api/admin/settings`
- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `PUT /api/admin/categories/:id`
- `GET /api/admin/menu-items`
- `POST /api/admin/menu-items`
- `PUT /api/admin/menu-items/:id`
- `GET /api/admin/usage`
- `GET /api/admin/messages/logs`
- `GET /api/admin/subscription`

### 결제 API
- `POST /api/admin/subscription/manual-activate`
- `POST /api/admin/subscription/manual-mark-past-due`
- `POST /api/admin/subscription/manual-suspend`
- `POST /api/billing/providers/:provider/attach` (추후 PG 연동 시)
- `POST /api/billing/webhooks/:provider` (추후 PG 연동 시)

### 설계 원칙
- 공개 API는 slug 기준
- `/:slug/solo`와 `/:slug/join`은 같은 번호 발급 API를 사용하고 `entry_channel`만 구분한다
- 인증 API 이후는 JWT 기준 + tenant_id 강제
- 상태 변경 API는 멱등성 키 도입 검토

## 9. Socket.IO 이벤트 설계

### room
- `tenant:{tenantId}`
- `tenant:{tenantId}:display`
- `tenant:{tenantId}:counter:{counterNo}`
- `tenant:{tenantId}:admin`

### 서버 → 클라이언트
- `queue:updated`
- `call:new`
- `call:recall`
- `counter:updated`
- `session:reset`
- `message:status`
- `subscription:updated`

### 클라이언트 → 서버
- `room:join`
- `display:ready`
- `counter:ready`

### 원칙
- 상태 변경은 REST API에서 처리
- Socket.IO는 결과 broadcast 중심
- 이렇게 해야 감사 로그와 권한 검증이 단순하다

## 10. 샌드박스 설계

트라이얼 사용자가 실제 SMS를 발송하지 않고 전체 흐름을 체험할 수 있도록 한다.

### 구현 방식

- 테넌트 레벨 `sandbox_mode` 플래그 (DB: `tenants.sandbox_mode boolean`)
- `sandbox_mode = true`이면 Solapi API 호출을 스킵하고 `sms_logs`에 `sandbox: true`, `status: 'previewed'`로 기록
- solo / kiosk / counter / admin 화면에 **샌드박스 배너** 표시 ("테스트 모드 — 실제 SMS가 발송되지 않습니다")
- 메시지 발송 시점에 화면에 **미리보기 팝업** 표시: "이 시점에 알림톡이 발송됩니다. 내용: [템플릿 미리보기]"

### sandbox 로그

- `sms_logs` 테이블의 `sandbox: true` + `status: 'previewed'`로 구분
- 관리자 화면에서 sandbox 발송 내역 별도 확인 가능

### 전환

- sandbox → 실제 운영: 관리자 패널에서 구독 등록 + Solapi 연결 완료 후 플래그 해제

---

## 11. 메시지 발송 구조

### 권장 흐름
1. Solo 태블릿 또는 QR 공개 화면에서 번호 발급 요청
2. 서버가 queue item 저장
3. 요청 payload에 `customer_phone`, `entry_channel`, 선택된 `menu_code/menu_label` 포함 가능
4. 서버가 구독/사용량 확인
5. Solapi 알림톡 발송
6. 실패 시 자동 SMS fallback
7. 결과를 `sms_logs`, `usage_monthly`에 반영
8. `sent` 성공 건이면 발송 시점 `provider_unit_cost`, `billing_unit_price`, `billing_amount` 스냅샷 저장
9. 관리자 화면과 Socket.IO 이벤트로 상태 반영

### 채널 구조
- 기본값: `platform_shared`
- 테넌트가 PFID / 발신번호 / 템플릿 식별자를 입력하면 `tenant_owned`로 override 가능
- 로그에는 실제 발송에 사용된 채널 모드와 PFID를 남긴다

### fallback 원칙
- 기본값은 `자동 SMS fallback ON`
- 알림톡 실패 시 SMS fallback을 수행하고, 과금 내역은 관리자 화면에서 명확히 고지
- 설정 오류를 fallback으로 숨기지 않도록 실패 원인 구분이 필요하다

### 정산 원칙
- 과금 대상은 `previewed` / `failed`가 아니라 `sent` 성공 건만 본다
- `issue`, `ready`, `call` 3종 메시지를 모두 집계 대상에 포함한다
- 채널별 원가와 청구 단가는 다를 수 있다
- 예: Solapi 알림톡 원가 `14원`일 때 업소 청구 단가 `18~20원` 운영 가능
- 월 정산은 `발송 당시 단가 스냅샷` 기준으로 계산한다

### 금지
- 브라우저에서 Solapi 직접 호출
- API key/secret을 프런트에 저장

## 12. 결제 구조

### 권장 흐름
1. 가입 시 `trial + sandbox_mode=true`
2. 고객이 Solo 흐름을 테스트
3. 계좌이체 안내 및 입금
4. 운영자가 입금 확인
5. `subscriptions.status = active`, `sandbox_mode=false`
6. 갱신 미납 시 `past_due`
7. 필요 시 `suspended` 전환

### PG 연동 준비
- 결제 로직은 `BillingService` 경계 뒤에 둔다
- Solo MVP 구현체는 `ManualBillingService`
- PG사는 현재 미정
- 공식 재검토 기준은 `업소 50개 이상`
- PG 도입 시 `BillingService` 구현체만 추가한다

### 과금 원칙
- 기본 구독료는 월 선결제
- 메시지 초과분은 익월 합산 청구
- 메시지 정산은 `성공 발송 건수 x 발송 시점 청구 단가` 기준
- Solapi 원가와 업소 청구 단가는 분리 관리
- 관리자 화면에는 월별 `billable_count`, `billed_amount`, `margin_amount`가 보여야 한다

## 13. 인증 / 권한

### 역할
- `owner`
- `admin`
- `staff`
- `superadmin`

### 권한 분리
- `owner/admin`: 설정, 결제, 로그 조회
- `staff`: 호출/완료 등 운영만
- `superadmin`: 플랫폼 운영

### 공개 화면 접근
- solo / kiosk / display는 URL 진입 허용
- 설정 변경은 반드시 인증 필요
- 필요 시 `device_token` 추가

## 14. 보안 / 운영

### 필수
- HTTPS only
- `trust proxy` 명시
- 환경변수 분리
- 비밀번호 해시 저장
- JWT 만료/재발급
- 입력값 검증
- rate limit
- 감사 로그

### 환경변수 예시
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `SOLAPI_API_KEY`
- `SOLAPI_API_SECRET`
- `BILLING_PROVIDER` (추후)
- `BILLING_PROVIDER_SECRET` (추후)

## 15. 폴더 구조 제안

```text
apps/
  web/
  api/
packages/
  shared/
  ui/
infra/
docs/
```

또는 초기 단순형:

```text
src/
  modules/
    auth/
    tenant/
    queue/
    messaging/
    billing/
  lib/
  sockets/
  jobs/
  views/
```

초기엔 후자가 현실적이다.

## 16. 마이그레이션 원칙

- 현재 HTML/CSS UI를 최대한 재사용
- Firebase 의존 로직만 API/Socket.IO로 치환
- 기존 학원 코드 → `/:slug/solo` 통합 화면 → Standard 화면 순으로 서버 전환
- SMS는 브라우저 구현 폐기 후 서버 발송으로 교체

## 17. 확정 사항 (1-1 / 1-2 / 1-3 / 1-4 회의 기준)

| 항목 | 결정 |
|------|------|
| 프런트엔드 | 순수 HTML/JS 유지. 프레임워크 전환은 추후 별도 검토 |
| 관리자 화면 | 단일 Node.js 앱에 포함 |
| Redis | 설계 포함, Solo MVP 런타임 보류. Standard 단계 도입 |
| 실시간 통신 | Socket.IO 처음부터 |
| 샌드박스 | sandbox_mode 플래그 + 메시지 미리보기 + sandbox 로그 |
| 과금 추적 | `sent` 성공 건 기준 + sms_logs 단가 스냅샷 + usage_monthly 월 집계 |
| 멀티테넌트 | /:slug/ + tenant_id + PostgreSQL RLS |
| 결제 방식 | Solo MVP: 계좌이체 수동 처리 (PG 미연동). PG는 업소 50개 이상 시 착수 |
| 결제 설계 | `BillingService` 경계 분리 + `ManualBillingService` 구현체. 나중에 PG 교체 가능 |
| 구독 상태 흐름 | `trial → active → past_due → suspended` |
| sandbox → 유료 전환 | 운영자가 계좌이체 확인 후 수동으로 `active + sandbox_mode=false` 처리 |
| superadmin | Solo MVP에 수동 결제 상태 관리용 기본 화면 포함 |
| 메시지 공급자 | Solapi 유지 |
| 기본 메시지 정책 | 알림톡 우선, 실패 시 자동 SMS fallback (기본 ON, 업소 고지) |
| 알림톡 채널 구조 | 하이브리드 — 플랫폼 공유 채널(기본) + 테넌트 개별 채널(선택, tenant_settings에 PFID/발신번호 저장) |
| 브라우저 발송 | MVP 이전 폐기. 발송 경로는 클라이언트 → 서버 API → Solapi 단일화 |
| Solapi 운영 준비 | Phase 2~3부터 병행 시작 |
