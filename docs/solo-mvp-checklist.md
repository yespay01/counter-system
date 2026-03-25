# Solo MVP 검증 체크리스트

> 검증 담당: Codex
> 작성 기준: `docs/2-plan/2-4-roadmap.md` Solo MVP 컷라인
> 최종 업데이트: 2026-03-19 (Playwright 브라우저 검증 완료)
> 결론: `Solo MVP` 체크리스트 전 항목 완료, `Solo 파일럿 가능`, 다음 작업은 `Phase 5 (Standard + Redis)`

---

## Phase 1 — 기반 구축

- [x] 서버 부팅 (Node.js + Express)
- [x] PostgreSQL 연결 (app/auth pool 모두 정상)
- [x] 마이그레이션 적용 (001 ~ 003)
- [x] 헬스체크 `/api/health` 정상 응답
- [x] slug 기반 테넌트 분리 동작
- [x] JWT 인증 (로그인 → accessToken 발급)

---

## Phase 2 — Solo 코어 백엔드

- [x] 번호 발급 API (`/api/public/:slug/queue/issue`) 동작
- [x] sandbox_mode 분기 동작 (true → previewed, false → 실발송)
- [x] Solapi ATA 실발송 1건 검증 ✅
- [x] sms_logs `status=sent`, `billable=true` 기록 확인
- [x] 단가 스냅샷 저장 (`provider_unit_cost=13`, 2026-03-19 이전 레거시 레코드는 14로 저장됨 — 정상)
- [x] 호출 API (`/api/staff/queue/call-next`) → call 알림톡 수신 확인 ✅
- [x] ATA 실패 시 SMS fallback 동작 확인 ✅ (INVALID_PFID → ATA 실패 → SMS 발송, channel=sms/25원 과금 확인)
- [x] 일일 세션 초기화 동작 확인 ✅ (POST /api/staff/queue/reset → closedSessions 반환, 마감 후 발급 차단, 익일 자동 새 세션 생성 로직 확인)

---

## Phase 3 — Solo 화면 + 관리자

- [x] `http://localhost:3000/signup` 회원가입 화면 동작
- [x] `http://localhost:3000/login` 로그인 화면 동작
- [x] `/:slug/solo` 번호 발급 → 호출 → 완료 전체 흐름
- [x] `/:slug/join` QR 셀프 접수 동작
- [x] `/:slug/admin/dashboard` 대시보드 화면 동작
- [x] `/:slug/admin/settings` 카테고리 설정 화면 동작 (카테고리 추가 포함)
- [x] `/:slug/admin/messages` PFID/템플릿 설정 + 발송 로그 + 사용량 확인
- [x] `/:slug/admin/subscription` trial 상태 표시 확인
- [x] `/superadmin` 수동 결제 상태 변경 동작 (trial→active→past_due→suspended 전체 흐름)

---

## Phase 4 — 메시지/구독 자동화

- [x] issue 메시지 발송 + billing 집계 동작
- [x] call 메시지 발송 + billing 집계 동작 (A-004 호출, sms_logs status=sent 확인)
- [x] usage_monthly 월별 집계 확인 (2026-03: 12건, admin/messages 사용량 탭)
- [x] `trial → active` 상태 전환 (superadmin에서 수동)
- [x] `active → past_due → suspended` 흐름 점검

---

## Solo MVP 최종 컷라인

아래 조건 모두 통과 시 `Solo 파일럿 가능` 판정.

- [x] Phase 1~4 체크리스트 전 항목 통과 ✅
- [x] Firebase 없이 현장 테스트 가능한 상태

---

## 테스트 환경 정보

| 항목 | 값 |
|------|-----|
| 서버 | localhost:3000 (Windows Docker + Node.js) |
| DB | PostgreSQL 16 (Docker) |
| 테스트 테넌트 | slug: `test-shop` |
| 테스트 계정 | `owner@test.com` / `password` |
| sandbox_mode | `false` (실발송 활성) |
| Solapi 발신번호 | 01074240832 |
| PFID | KA01PF250703061140859DlTkL4q0BXu |
| TEMPLATE_ISSUE | KA01TP250707025252241eJNMjXR5Wve (대기표 발급완료 사본) |
| TEMPLATE_READY | KA01TP250703062421839i1JoNmtv93a (호출 예정 알림) |
| TEMPLATE_CALL  | KA01TP2507030622190404veLphvzG33 (대기표 발급완료) |
| ATA 단가 | 13원 (provider), 18원 (billing) |
