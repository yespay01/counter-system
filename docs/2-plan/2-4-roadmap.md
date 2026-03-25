# 2-4. 개발 로드맵 확정

> 상태: 🟢 v2 (2026-03-17, 1-1/1-2 회의 결과 반영)
> 목적: SaaS 전환 개발을 실제 작업 순서로 분해하고, 각 단계의 완료 기준을 명확히 한다
> **Solo MVP 우선**: Phase 1~3은 Solo 기준. Standard(다창구/디스플레이)는 Phase 5 이후
> 현재 실행 상태 (2026-03-25): `Phase 7` 완료 — rate limit + audit log + 예외처리 + 운영 매뉴얼, 파일럿 투입 가능

---

## 1. 원칙

- 한 번에 전체 재작성하지 않는다
- `운영 가능한 최소 단위`를 먼저 완성한다
- 현재 HTML 자산은 최대한 재사용한다
- 결제와 메시지처럼 외부 연동은 서버 구조를 먼저 만든 뒤 붙인다

## 2. 전체 단계

### Solo MVP (1차 출시 목표)
1. 기반 구축 + 멀티테넌트 기초
2. Solo 코어 (번호발급 → 호출 → 메시지 기본 + 샌드박스)
3. Solo 화면 + 기본 관리자

### MVP 이후 확장
4. 메시지 / 구독 자동화
5. Standard 화면 (다창구 / 디스플레이 / 전용 키오스크) + Redis
6. 관리자 / 운영도구 완성
7. 안정화 / 파일럿

## 3. 상세 단계

## Phase 1. 기반 구축 + 멀티테넌트 기초

### 작업
- Node.js 서버 프로젝트 초기화
- Express, PostgreSQL 연결 (Redis는 Solo MVP에서 불포함)
- 기본 환경변수 / 설정 로더
- 헬스체크 엔드포인트
- Nginx/PM2 배포 구조 확정
- tenants / users 기본 스키마
- `/:slug/...` 라우팅 뼈대
- JWT 인증 기초
- tenant guard / PostgreSQL RLS 기본 적용

### 산출물
- 실행 가능한 API 서버
- 개발/운영 env 템플릿
- 기본 배포 스크립트
- 테넌트/인증 기초 구조

### 완료 기준
- 로컬과 서버에서 앱 부팅 가능
- DB, healthcheck 정상 (Redis 없이)
- 샘플 테넌트 2개 기준 slug 분리와 기본 RLS 검증 가능

## Phase 2. Solo 코어 백엔드

### 작업
- categories, queue_sessions, queue_items, current_calls, sms_logs 스키마 생성
- 공개 번호 발급 API (`sandbox_mode` 분기 포함)
- 번호 발급 payload에 전화번호 / `entry_channel` / 메뉴 선택값 반영
- `/:slug/join`용 공개 설정 조회 API
- 호출/완료 API
- Socket.IO 기본 브로드캐스트
- 일일 세션 초기화 로직
- **샌드박스 모드**: `sandbox_mode` 플래그 + 메시지 미리보기 + sandbox 로그
- Solapi 서버 발송 기본 구조와 기본 발송 경로 (sandbox 분기 포함)
- 알림톡 실패 시 자동 SMS fallback 기본 경로
- 플랫폼 공유 채널 기본 + 테넌트 개별 채널 선택 구조 반영

### 산출물
- Firebase 없이도 Solo 대기열이 동작하는 서버 코어
- sandbox 모드에서 전체 흐름 체험 가능
- Solapi 연결 시 기본 발송 흐름 점검 가능
- 하이브리드 채널 구조를 수용하는 메시지 기본 모델

### 완료 기준
- API만으로 발급 → 호출 → 완료 흐름 재현 가능
- 태블릿 입력과 QR 셀프 입력이 같은 번호 발급 API로 처리 가능
- sandbox 모드에서 메시지 미리보기 정상 동작
- 기본 실발송 경로와 sandbox 경로가 분리 동작
- 번호 발급(`issue`) 기준 발송 로그와 알림톡 실패 시 자동 SMS fallback 기본 경로 점검 가능

## Phase 3. Solo 화면 + 기본 관리자 구현

### 작업
- `/:slug/solo` 통합 Solo 화면 (고객 영역 + 사장 영역 한 화면)
  - 카테고리 선택 → 번호 발급 → 성공 모달
  - 전화번호 입력 후 번호 발급
  - 음식점형 업종용 메뉴/주문 항목 선택 후 번호 발급
  - 대기열 목록 + 호출/완료 버튼
  - 샌드박스 배너 + 메시지 미리보기 팝업
- `/:slug/join` 공개 접수 화면
  - QR 진입
  - 전화번호 입력 → 카테고리/메뉴 선택 → 번호 발급
- 회원가입 / 로그인
- `/:slug/admin/settings` — 카테고리/카운터 설정
- `/:slug/admin/dashboard` — 운영 상태 확인
- `/:slug/admin/messages` — PFID / 발신번호 / 템플릿 식별자 입력 + 발송 로그 기본 화면
- `/:slug/admin/subscription` — trial / 플랜 상태와 결제 진입 중심 기본 화면
- `/superadmin` — 수동 결제 상태 관리용 최소 운영 화면
- Firebase 코드 제거 (Solo 경로 기준)

### 산출물
- 태블릿 1대로 Solo 운영 가능한 화면 세트
- 관리자가 셀프 설정 가능한 최소 패널
- Solo 운영에 필요한 기본 관리자 화면
- 수동 결제 상태 관리를 위한 최소 운영 화면

### 완료 기준
- 소규모 현장 업종에서 Solo 화면으로 발급 → 호출 → 완료 가능
- 태블릿 번호 입력 접수와 QR 셀프 접수 흐름이 모두 동작
- Firebase 없이 현장 테스트 가능
- `/:slug/solo`, 관리자 기본 화면, 샌드박스 흐름이 한 세트로 동작
- `admin/messages`에서 PFID / 발신번호 / 템플릿 식별자 입력과 발송 로그 확인 가능
- `/superadmin`에서 수동 결제 상태 변경 가능

## Phase 4. 메시지 / 구독 자동화

### 작업
- Solapi 서버 모듈 완성 (Phase 2 기본 구조 → 운영형 완성)
- `issue`, `ready`, `call` 메시지 발송 경로 완성
- 메시지 템플릿 / PFID / 발신번호 설정
- 플랫폼 공유 채널 / 테넌트 개별 채널 운영 정책 정교화
- `sms_logs / usage_monthly / billing_logs` 정산형 반영
- `sent` 성공 건 기준 billable 집계
- 발송 시점 `provider_unit_cost / billing_unit_price / billing_amount` 스냅샷 저장
- 월별 채널별 건수 / 정산 금액 / 마진 집계
- 수동 결제 운영 로그 / 상태 관리 고도화
- PG 연동 시점용 `BillingService` 확장 포인트 정리
- 과금 추적: 성공 발송 건 기준 + 단가 스냅샷 + 월별 정산 집계

### 산출물
- 서버 발송 구조와 수동 결제 운영도구 완성
- `/:slug/admin/messages`, `/:slug/admin/subscription` 운영형 완성
- 월별 메시지 정산 기준과 운영 화면 완성

### 완료 기준
- `issue`, `ready`, `call` 메시지 발송과 로그 기록 가능
- 성공 발송 건만 월별 billable 집계에 반영
- 관리자 화면에서 채널별 성공 건수와 예상 청구 금액 확인 가능
- 수동 구독 전환과 `past_due` / `suspended` 처리 흐름 점검 가능

## Phase 5. Standard 화면 + Redis 도입

> 진행 상태: ✅ 완료 (2026-03-25)

### 작업
- [완료] `/:slug/kiosk` / `/:slug/kiosk-sms` — 전용 키오스크
- [완료] `/:slug/counter` — 창구 직원 화면
- [완료] `/:slug/display` — 대기실 TV 디스플레이
- [완료] `004_entry_channel.sql` 로컬 Docker 적용 확인 (2026-03-25)
- [완료] Redis 투입 — `src/lib/redis.js` + queue.service.js 캐시 레이어 (2026-03-25)

### 산출물
- 다창구/디스플레이 운영 가능한 Standard 세트
- Redis 기반 실시간 상태 최적화

### 완료 기준
- 다창구 환경에서 창구별 호출/완료 정상 동작 ✅
- 디스플레이에 실시간 반영 ✅
- Redis 도입 후 Standard 다창구 상태 최적화

## Phase 6. 관리자 완성 / 운영도구

> 진행 상태: ✅ 완료 (2026-03-25)

### 작업
- [완료] 관리자 대시보드 (dashboard.html + `/api/:slug/admin/dashboard`)
- [완료] 메시지 로그 / 설정 / 사용량 (messages.html + API 3종)
- [완료] 구독 화면 (subscription.html + `/api/:slug/admin/subscription`)
- [완료] superadmin 운영 화면 (superadmin/index.html + API)
- [완료] 랜딩 페이지 (landing.html, `GET /`)
- [완료] dashboard.html `recentFailed` race condition 버그 수정

### 산출물
- 셀프 설정 가능한 전체 운영 패널
- 개발자 개입 없이 운영 가능한 환경

### 완료 기준
- 개발자 개입 없이 기본 설정 가능
- 장애 원인 추적용 로그 확인 가능

## Phase 7. 안정화 / 파일럿

> 진행 상태: ✅ 완료 (2026-03-25)

### 작업
- [완료] rate limit — `express-rate-limit` + `src/lib/rateLimiter.js` (login/signup 15분 10회, queue/issue 1분 15회)
- [완료] audit log — `src/lib/audit.js` (settings/category/message 변경, subscription/billing superadmin 작업)
- [완료] 예외 처리 강화 — `unhandledRejection` / `uncaughtException` 핸들러, 요청 ID (X-Request-Id)
- [완료] 모니터링 개선 — `/api/health`에 Redis 상태 포함
- [완료] 운영 매뉴얼 — `docs/operations-manual.md`

### 산출물
- 실제 파일럿 투입 가능한 버전

### 완료 기준
- 파일럿 고객 1곳 이상 운영 가능
- 치명적 장애 없이 1주 이상 운영

## 4. 권장 구현 순서

### Solo MVP Sprint
| Sprint | 내용 |
|--------|------|
| Sprint 1 | Phase 1 (기반 + 멀티테넌트 기초) + Phase 2 일부 (코어 API + sandbox) |
| Sprint 2 | Phase 2 완료 (Solo 코어 완성) + Phase 3 Solo 화면 |
| Sprint 3 | Phase 3 완성 + 관리자 기본 화면 → **Solo 파일럿 가능** |

### MVP 이후 Sprint
| Sprint | 내용 |
|--------|------|
| Sprint 4 | Phase 4 (메시지/구독 자동화) |
| Sprint 5 | Phase 5 (Standard 화면 + Redis) |
| Sprint 6 | Phase 6 (관리자 완성) + Phase 7 (안정화/파일럿) |

## 5. 우선순위 높은 리스크

### 1) 메시지 발송 구조
- 현재 브라우저 기반 Solapi 코드는 운영용이 아님
- 서버 발송으로 빠르게 옮겨야 함

### 2) 실시간 상태 정합성
- 호출/재호출/완료 이벤트가 중복되면 현장이 바로 혼란스러워짐
- REST 처리 후 Socket broadcast 구조를 강제해야 함

### 3) 멀티테넌트 보안
- tenant guard와 RLS가 빠지면 데이터 혼선 위험이 큼
- 그래서 Phase 1부터 기초 적용을 끝내야 함

### 4) 결제 실패 처리
- 결제 실패 후 구독 상태 전환 기준을 명확히 정해야 함

## 6. MVP 컷라인

### Solo MVP (Sprint 3 완료 기준)
아래가 되면 `Solo 파일럿 가능`으로 본다.

- 업체 가입 / 로그인
- slug 기반 테넌트 분리와 기본 RLS 동작
- 카테고리 설정
- `/:slug/solo` 화면으로 번호 발급 + 호출 + 완료
- 전화번호 입력 후 알림톡 수신과 QR 셀프 접수 가능
- 음식점형 업종은 메뉴/주문 항목 선택 후 번호 발급 가능
- 샌드박스 모드에서 전체 흐름 체험 가능
- Solapi 연결 시 기본 알림톡 발송 가능
- 알림톡 실패 시 자동 SMS fallback 동작
- 관리자 기본 화면 (`dashboard`, `settings`, `messages`, `subscription`) 사용 가능
- `/superadmin`에서 수동 결제 상태 관리 가능

### Standard MVP (Sprint 6 완료 기준)
- 위 Solo 조건 포함
- 다창구 운영 (전용 kiosk + counter + display)
- PG 연동 후 구독 결제 자동화
- 발송 로그 / 사용량 확인

## 7. 확정 사항 (1-1 / 1-2 / 1-3 / 1-4 회의 기준)

| 항목 | 결정 |
|------|------|
| MVP 기준 | Solo 먼저 (태블릿 1대) |
| Redis | Solo MVP 미포함, Standard에서 도입 |
| 샌드박스 | Solo MVP에 포함 (Phase 2) |
| 프런트엔드 | 순수 HTML/JS 유지 |
| superadmin | Solo MVP에 수동 결제 상태 관리용 최소 화면 포함 |
| 멀티테넌트 | Solo MVP 시작 전부터 slug + tenant_id + RLS 기초 적용 |
| 구독/결제 | Solo MVP는 계좌이체 수동 처리. PG는 업소 50개 이상 시 공식 재검토 |
| 결제 설계 | `BillingService` 경계 + `ManualBillingService` 구현체 |
| 구독 상태 | `trial -> active -> past_due -> suspended` |
| 메시지 정책 | 알림톡 우선, 실패 시 자동 SMS fallback (기본 ON, 업소 고지) |
| 채널 구조 | 하이브리드 — 플랫폼 공유 채널(기본) + 테넌트 개별 채널(선택) |
| admin/messages | Solo MVP부터 PFID / 발신번호 / 템플릿 식별자 입력 + 발송 로그 확인 포함 |
| 번호 발급 UX | Solo MVP부터 태블릿 전화번호 입력 + QR 셀프 접수 지원 |
| 음식점형 확장 | 메뉴/주문 항목 선택값을 번호 발급 payload에 포함 가능 |
