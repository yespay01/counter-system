# 1-2. 기술 리서치

> 상태: ✅ 회의 반영 완료 (2026-03-16)
> 목적: SaaS 전환용 인프라, 실시간 통신, 멀티테넌트 구조의 기술 선택 근거 정리

---

## 조사 항목

### A. 인프라 / 서버 환경
- Ubuntu에서 Node.js + PostgreSQL + Redis 동시 운영 시 권장 구성
- PM2 클러스터 모드 vs 단일 프로세스 선택 기준
- Nginx 리버스 프록시 및 SSL 패턴

### B. 실시간 통신
- Socket.IO vs Server-Sent Events (SSE)
- Socket.IO Room 기반 멀티테넌트 격리
- Redis Pub/Sub 기반 다중 서버 확장

### C. 멀티테넌트 아키텍처
- PostgreSQL 단일 DB 멀티테넌트 패턴
- JWT 기반 인증/권한 구조
- Express 라우팅 패턴

---

## 1. 결론 요약

- `앱 서버`: `Node.js + Express`
- `DB`: `PostgreSQL + Row-Level Security`
- `실시간`: `Socket.IO` 처음부터
- `Redis`: 설계 포함, `Solo MVP 런타임`에서는 optional
- `프록시`: `Nginx`
- `멀티테넌트`: `/:slug/... + tenant_id + PostgreSQL RLS`
- `프런트엔드`: MVP는 `순수 HTML/JS 유지`
- `샌드박스`: `sandbox_mode + 메시지 미리보기 + sandbox 로그`

해석: `1-2 기술 리서치 회의` 기준으로 Solo MVP를 단순하게 가져가되, 나중에 Standard 확장 시 재작성 비용이 커지지 않는 선택을 우선한다.

## 2. 인프라 / 서버 환경

### 권장 초기 사양

> 아래 사양은 공식 최소사양이 아니라 현재 제품 범위와 SMB 초기 SaaS 가정을 반영한 운영 권장치다.

- `파일럿/초기 운영`: `2 vCPU / 4 GB RAM / 80 GB SSD`
- `안정 운영 시작점`: `4 vCPU / 8 GB RAM / 160 GB SSD`
- 단일 서버에 Node.js + PostgreSQL + Redis를 함께 두되, 백업과 모니터링은 초기에 반드시 분리

### Node.js 버전 판단
- 2026-03-16 기준 Node.js 공식 배포 페이지에서 최신 LTS는 `v24.14.0`, `v24`는 `Active LTS`, `v22.22.1`은 `LTS` 상태다.
- 운영 서버는 `Current`보다 `LTS`를 쓰는 편이 안전하다.
- 권장: `Node.js 24 LTS`

### PM2 단일 프로세스 vs 클러스터
- PM2 공식 문서상 cluster mode는 모든 CPU로 프로세스를 확장하고, `reload`로 무중단 재배포가 가능하다.
- 다만 PM2는 앱이 `stateless`일 것을 요구한다. 로컬 메모리 세션/소켓 상태에 의존하면 꼬인다.
- 현재 서비스는 실시간 연결이 있지만 상태를 Redis/PostgreSQL로 밀어낼 수 있으므로, 구조만 잘 잡으면 cluster 전환은 가능하다.

### 운영 권장안
- 초기: `PM2 단일 프로세스`
- 전환 조건:
  - CPU 1개로 부족해지는 시점
  - 동시 접속 매장 수가 늘어 Redis adapter가 필요해지는 시점
  - 배포 중 무중단 요구가 생기는 시점
- 이후: `PM2 cluster + Socket.IO Redis adapter`

## 3. Nginx / 프록시 / SSL

### Nginx 역할
- 정적 파일/SPA 진입점 서빙
- `/api`와 Socket.IO 업그레이드 요청을 Node.js로 프록시
- HTTPS 종료

### Express 프록시 설정
- Express 공식 문서상 리버스 프록시 뒤에 둘 때는 `trust proxy`를 정확히 설정해야 한다.
- 그렇지 않으면 `req.ip`, `req.protocol` 등이 내부 프록시 값으로 오염될 수 있다.
- Nginx가 `X-Forwarded-*` 헤더를 덮어쓰는 구성이 전제되어야 한다.

### WebSocket 프록시 포인트
- Socket.IO는 기본적으로 WebSocket을 우선 사용하고, 불가능하면 HTTP long-polling으로 폴백한다.
- Nginx는 WebSocket 프록시 시 `proxy_http_version 1.1`, `Upgrade`, `Connection` 헤더 처리가 필요하다.
- 실시간 연결이 60초 이상 idle 상태가 될 수 있으므로 `proxy_read_timeout`도 충분히 늘려야 한다.

### SSL 판단
- Certbot 문서상 wildcard 인증서는 `DNS validation`이 필수다.
- 그러나 현재 계획은 `queue.example.com/:slug/...` 구조라서 wildcard가 없어도 된다.
- 결론: 초기에는 `queue.example.com` 단일 인증서가 더 단순하다. wildcard는 나중에 `slug.example.com` 구조로 갈 때만 검토하면 된다.

## 4. 실시간 통신 선택

### SSE
- WHATWG 표준 기준 `EventSource`는 서버 → 클라이언트 단방향 스트림이다.
- 자동 재연결과 `Last-Event-ID`는 장점이다.
- 하지만 UTF-8 기반 단방향 이벤트 스트림이라, 창구 호출·재호출·관리자 조작 같은 양방향 제어에는 한계가 있다.

### Socket.IO
- 공식 문서상 WebSocket 우선, 실패 시 HTTP long-polling 폴백, 자동 재연결, 다중 서버 확장, room 브로드캐스트를 지원한다.
- room은 서버 전용 개념이고, 특정 클라이언트 집합에만 이벤트를 보낼 수 있다.
- 기본 전달 보장은 사실상 `at most once`에 가깝다. 공식 튜토리얼도 `offset 저장 + 누락분 재전송` 또는 ACK 기반 재시도를 권장한다.

### 결론
- `kiosk`, `counter`, `display`, `admin` 전부 `Socket.IO`로 통일
- SSE는 나중에 `공개 대기현황 전광판` 같은 읽기 전용 초경량 화면이 생길 때만 별도 검토

### 회의 반영 메모
- Solo MVP만 보면 SSE도 가능하지만, Standard 확장 비용을 감안해 `처음부터 Socket.IO`로 확정했다.

## 5. Socket.IO Room / Redis 확장 패턴

### 권장 room 설계
- `tenant:{tenantId}`
- `tenant:{tenantId}:display`
- `tenant:{tenantId}:counter:{counterId}`
- `tenant:{tenantId}:admin`

### Redis adapter 판단
- Socket.IO 공식 문서상 Redis adapter는 Redis `Pub/Sub`를 이용해 각 서버에 브로드캐스트를 전파한다.
- 다중 서버에서 room 브로드캐스트를 유지하려면 사실상 필수다.
- 공식 문서 기준 `Redis 7.0` 이상이면 `sharded adapter`가 신규 개발 권장안이다.
- 또 공식 문서는 `redis` 패키지의 재연결 후 구독 복구 이슈를 언급하며 `ioredis` 사용을 고려하라고 안내한다.

### 결론
- 초기 1대 서버: Redis 없이도 시작 가능
- 다중 서버/클러스터 전환 시:
  - `Redis 7`
  - `@socket.io/redis-adapter`
  - Node Redis 대신 `ioredis` 우선 검토

### 회의 반영 메모
- Redis는 문서와 설계에는 남기되, Solo MVP 런타임 필수 요소에서는 제외할 수 있다.

## 6. PostgreSQL 멀티테넌트 패턴

### 단일 DB + tenant_id 방식
- 모든 핵심 테이블에 `tenant_id`를 둔다.
- 쿼리, 인덱스, 유니크 키를 `tenant_id` 중심으로 설계한다.
- 예: `UNIQUE (tenant_id, slug)`, `INDEX (tenant_id, status, created_at)`

### Row-Level Security (RLS)
- PostgreSQL 공식 문서상 RLS는 테이블별로 행 단위 접근을 제한한다.
- 정책이 없으면 기본적으로 `default deny`다.
- 단, 테이블 owner와 `BYPASSRLS` 권한은 우회 가능하므로 앱 계정 권한 설계가 중요하다.

### Schema-per-tenant와 비교
- `단일 DB + tenant_id + RLS` 장점:
  - 마이그레이션 단순
  - 분석/운영/백업 단순
  - SMB 다수 테넌트에 유리
- `schema-per-tenant` 장점:
  - 논리적 분리가 더 강함
  - 일부 엔터프라이즈 요구에 대응 쉬움
- `schema-per-tenant` 단점:
  - 마이그레이션, 연결풀, 모니터링, 배치 작업이 빠르게 복잡해짐

### 결론
- 현재 단계는 `단일 DB + tenant_id + RLS`가 맞다.
- 단, RLS 관련 보안 수정 이력이 있으므로 PostgreSQL은 반드시 최신 보안 패치 라인을 유지해야 한다.

## 7. JWT / 라우팅 권장안

### 라우팅
- 공개 화면:
  - `/:slug/kiosk`
  - `/:slug/kiosk-sms`
  - `/:slug/display`
- API:
  - `GET /api/public/:slug/settings`
  - `POST /api/public/:slug/queue/issue`
  - `POST /api/staff/queue/call-next`
  - `POST /api/admin/settings`

### 인증
- 관리자/직원은 JWT 사용
- 토큰 payload 권장:
  - `sub`
  - `tenant_id`
  - `role`
  - `session_version`
- 서버 미들웨어는 `tenant_id`와 현재 URL의 `slug`가 실제로 일치하는지 검증

### 기기 접근
- kiosk/display를 완전 공개로 두기보다 `device token` 또는 `tenant slug + device secret` 방식이 더 안전하다.
- 다만 초기 SaaS는 셀프 설치성이 중요하므로, 화면 자체는 공개 접근 가능하되 `설정 변경`과 `관리 기능`만 보호하는 구조가 현실적이다.

## 8. 샌드박스 구현 방향

- `sandbox_mode` 플래그 기반
- 실제 Solapi 발송 없음
- 화면에서 메시지 내용 미리보기 제공
- "이 시점에 발송됩니다" 안내 표시
- `sms_logs`에는 `sandbox` 상태로 기록

## 9. 프런트엔드 방침

- MVP는 `순수 HTML/JS` 유지
- 이유:
  - 기존 코드 자산 재사용
  - Solo MVP가 단순함
  - 프레임워크 마이그레이션 비용 회피

### 재검토 트리거
- Admin 화면 4개 이상
- 창구/운영 화면에서 실시간 상태 2종 이상 동시 관리 필요

## 10. 최종 추천 아키텍처

1. `Nginx`가 HTTPS 종료와 reverse proxy 담당
2. `Node.js 24 LTS + Express + Socket.IO`
3. `PM2 단일 프로세스`로 시작
4. `PostgreSQL 단일 DB + tenant_id + RLS`
5. `Redis`는 실시간 상태와 수평 확장 대비용
6. 멀티테넌트는 `/:slug/...` 경로 기반
7. Solapi는 `1-3`에서 세부 운영 플로우만 정리하고 공급자는 고정

해석: 이 조합이 현재 코드베이스와 가장 자연스럽고, 틈새시장 SaaS에 필요한 `빠른 출시`, `운영 단순성`, `확장 여지`를 동시에 만족한다.

## 회의 결과

- 완료 안건: [`1-2 기술 리서치 회의 결과`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/agent_meeting/completed/2026-03-16_1854_1-2-기술리서치/2026-03-16_1854_안건_1-2-기술리서치.md)

## 출처
- Node.js 다운로드: https://nodejs.org/en/download
- Node.js 릴리즈 정책: https://nodejs.org/en/download/releases/
- PM2 cluster mode: https://pm2.keymetrics.io/docs/usage/cluster-mode/
- Socket.IO Rooms: https://socket.io/docs/v4/rooms/
- Socket.IO Redis adapter: https://socket.io/docs/v4/redis-adapter/
- Socket.IO server delivery: https://socket.io/docs/v4/tutorial/step-7
- Socket.IO client delivery: https://socket.io/docs/v4/tutorial/step-8
- WHATWG Server-Sent Events: https://html.spec.whatwg.org/dev/server-sent-events.html
- Redis Pub/Sub: https://redis.io/docs/latest/develop/pubsub/
- PostgreSQL Row Security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- PostgreSQL RLS 보안 공지: https://www.postgresql.org/support/security/CVE-2024-10976/
- PostgreSQL 보안 릴리즈: https://www.postgresql.org/support/security/8.0/
- Nginx proxy module: https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- Express behind proxies: https://expressjs.com/en/guide/behind-proxies.html
- Certbot glossary: https://certbot.eff.org/glossary
