# Counter System SaaS — TODO

> 모든 리서치와 플랜 확정이 완료된 뒤 개발 시작
> 현재 단계: 실서버 운영 중 + 파일럿 진행 중
> 현재 상태: Phase 7 완료 + 실서버 배포 + Nginx/SSL + 실발송 활성화 완료 (2026-03-26) — insuk@192.168.0.5, `https://waiting.semolink.store`, `파일럿 실운영 중`

---

## 작업 원칙

- 기본 우선순위는 `검수`, `검증`, `상위 문서 정리`다.
- 구현 코딩은 사용자가 명시적으로 지시했을 때만 진행한다.
- 하위 문서 변경이 생기면 `CLAUDE.md`, `AGENTS.md`, `docs/TODO.md`까지 정합성을 확인한다.

---

## 전체 진행 순서

### STEP 1 — 리서치 (`1-research/`)
> 리서치가 모두 끝나야 플랜 확정 가능

- [x] 1-1. 시장조사 (경쟁 서비스, 수요, 가격대)
- [x] 1-2. 기술 리서치 (인프라, 실시간 통신, DB)
- [x] 1-3. Solapi 운영 조사 (기본 구현 존재, 대안 비교 생략)
- [x] 1-4. 결제 서비스 조사 (구독 결제 연동 방법)

### STEP 2 — 플랜 확정 (`2-plan/`)
> 리서치 결과 반영 후 확정

- [x] 2-1. 서비스 기획 확정 (1-1 회의 결과 반영 완료)
- [x] 2-2. 아키텍처 설계 확정 (v2 완료 — Redis MVP 보류, sandbox 설계, Socket.IO 고정 반영)
- [x] 2-3. 화면 설계 (v2 완료 — Solo 통합 화면 추가, 우선순위 재정렬)
- [x] 2-4. 개발 로드맵 확정 (v2 완료 — Solo MVP 기준 Phase 재구성)

### STEP 3 — 개발 시작
> STEP 1, 2 완료 후 진행

- [x] Phase 1: 기반 구축 + 멀티테넌트 기초
- [x] Phase 2: Solo 코어 백엔드
- [x] Phase 3: Solo 화면 + 기본 관리자
- [x] Phase 4: 메시지 / 구독 자동화
- [x] Phase 5: Standard 화면 + Redis — 화면 4개 + 브라우저 검증 완료 + Redis 캐시 레이어 구현 완료 (2026-03-25)
- [x] Phase 6: 관리자 / 운영도구 완성 (2026-03-25)
- [x] Phase 7: 안정화 / 파일럿 — rate limit + audit log + 예외처리 + 운영 매뉴얼 (2026-03-25)

---

## 현재 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| 리서치 요약 | ✅ 완료 | `docs/1-research/0-summary.md` 참고 |
| 시장조사 | ✅ 완료 | `docs/1-research/1-1-market-research.md` 참고 |
| 1-1 시장조사 회의 | ✅ 완료 | `docs/agent_meeting/completed/2026-03-16_1826_1-1-시장조사/` 참고 |
| 기술 리서치 | ✅ 완료 | `docs/1-research/1-2-technical-research.md` 참고 |
| 1-2 기술 리서치 회의 | ✅ 완료 | `docs/agent_meeting/completed/2026-03-16_1854_1-2-기술리서치/` 참고 |
| 1-3 Solapi 운영 조사 회의 | ✅ 완료 | `docs/agent_meeting/completed/2026-03-17_1221_1-3-solapi-운영조사/` 참고 |
| 1-4 결제 서비스 조사 회의 | ✅ 완료 | `docs/agent_meeting/completed/2026-03-17_1323_1-4-결제서비스조사/` 참고 |
| SMS / 알림톡 | ✅ 완료 | `docs/1-research/1-3-solapi-operations-research.md` 참고 |
| 결제 조사 | ✅ 완료 | `docs/1-research/1-4-payment-research.md` 참고 |
| 서비스 기획 | ✅ 완료 | `docs/2-plan/2-1-service-plan.md` 참고 |
| 아키텍처 설계 | ✅ 완료 | `docs/2-plan/2-2-architecture-plan.md` (v2) |
| 화면 설계 | ✅ 완료 | `docs/2-plan/2-3-screen-plan.md` (v2) |
| 개발 로드맵 | ✅ 완료 | `docs/2-plan/2-4-roadmap.md` (v2) |
| 플랜 확정 | ✅ 완료 | 2-1 ~ 2-4 모두 완료 |
| 개발 | ✅ 완료 | Phase 7 완료 (2026-03-25) — 파일럿 준비 완료 |

---

## 참고

- `_archive/` — 초안 문서 보관 (확정 전 러프 버전)
- 리서치는 Codex 담당
- 플랜은 리서치 결과와 회의 결론 반영까지 완료

## 다음 작업 메모

- Phase 1~7 완료, 실서버 배포 완료, Nginx/SSL 완료, 파일럿 실운영 중 (2026-03-26)
- 파일럿 완료 (2026-03-26):
  - Nginx + Let's Encrypt SSL (`https://waiting.semolink.store`)
  - 실서버 Solapi 환경변수 반영, 실발송 활성화
  - Helmet CSP 수정 — 인라인 스크립트 + ws:/wss: 허용
  - ezen 테넌트 생성, sandbox_mode=false, Solo 실발송 흐름 확인
- 다음: 파일럿 운영 모니터링, 알림톡 발송 로그 확인, 추가 테넌트 온보딩
- `1-3 Solapi 운영 조사` 회의 결과를 Phase 2~4 상세 설계에 유지 반영
- `1-4 결제 서비스 조사` 회의 결과를 서비스/아키텍처/로드맵에 유지 반영
- 번호 발급 UX는 `태블릿 전화번호 입력 + QR 셀프 접수 + 음식점형 메뉴 선택` 기준으로 유지
- Phase 4에서는 메시지 정산 기준을 `sent 성공 건만 billable + 발송 시점 단가 스냅샷 저장`으로 구현
- Solo MVP 체크리스트 전 항목 완료 ✅ (2026-03-19)
- `Phase 7 안정화 / 파일럿 준비` 완료 (2026-03-25) — rate limit + audit log + 예외처리 + 운영 매뉴얼 작성
- 실서버 배포 완료 (2026-03-25) — insuk@192.168.0.5, `/home/insuk/projects/counter-system/server/`
  - API: PM2 (counter-api, port 3200), 재부팅 자동기동 등록
  - DB: Docker PostgreSQL (host port 5435), restart: unless-stopped
  - Cache: Docker Redis (port 6379), restart: unless-stopped
  - ✅ Nginx/SSL 완료 (2026-03-26): `https://waiting.semolink.store`
  - ✅ Solapi 실발송 활성화 완료 (2026-03-26)
- Phase 5 완료 (2026-03-25):
  - [완료] `/:slug/kiosk`, `/:slug/kiosk-sms`, `/:slug/counter`, `/:slug/display` 화면 구현
  - [완료] `sockets/index.js` — queueUpdated/sessionReset display room 확장
  - [완료] 브라우저 수동 검증 통과 (2026-03-24)
  - [완료] `004_entry_channel.sql` 로컬 Docker DB 적용 확인 (2026-03-25) — 실 서버는 배포 시 수동 실행 필요
  - [완료] Redis 도입 — `src/lib/redis.js` + queue.service.js 캐시 레이어, Docker Redis 컨테이너 추가 (2026-03-25)
