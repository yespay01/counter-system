# 파일럿 수정 작업 계획서

> 작성일: 2026-04-18
> 목적: 파일럿 운영 중 확인된 관리자/접수 화면 이슈를 우선순위 기준으로 정리하고, Codex + Claude 병행 작업 순서를 맞춘다

---

## 1. 작업 범위

이번 묶음 작업의 범위는 아래 5개다.

1. `admin/subscription` 트라이얼 잔여기간 미차감
2. `admin/dashboard` QR 셀프 접수 QR 인쇄 불가
3. `kiosk-sms` 접수유형 이후 메뉴선택 불가
4. `kiosk` 번호표 접수 흐름에서도 동일 선택/진행 이상 여부 확인
5. 사용량/메시지 화면에서 가맹점 사장에게 마진 정보 노출

---

## 2. 우선순위

### P0 — 운영/권한 이슈

- 트라이얼 잔여기간 미차감
  - 구독 상태 신뢰도에 직접 영향
  - 무료 가입자 전환 흐름 검증에 필요
- QR 인쇄 불가
  - 매장 현장 배치용 인쇄물 운영에 직접 영향
- 가맹점 사장 화면 마진 노출
  - 권한/정산 정보 노출 이슈
  - 파일럿 단계에서 우선 차단 필요

### P1 — 접수 화면 기능 이슈

- `kiosk-sms` 메뉴선택 불가
- `kiosk` 번호표 화면 동일 증상 여부 확인 및 공통 처리

---

## 3. 작업 원칙

- 먼저 `재현`, `원인 범위 확정`, `공통 원인 여부 판단` 순서로 간다.
- 화면 증상만 보고 바로 수정하지 않고, API 응답 / 초기 설정 데이터 / 프런트 상태 로직 중 어디가 깨졌는지 먼저 분리한다.
- `kiosk-sms`와 `kiosk`는 UI는 다르더라도 카테고리/메뉴 설정 데이터가 공통이면 한 번에 묶어 본다.
- 권한 노출 이슈는 화면 숨김만으로 끝내지 말고, 가능하면 API 응답에서도 불필요 필드를 제거할지 같이 판단한다.

---

## 4. 권장 작업 순서

### 1) 구독 / 권한 계층 먼저 확인

- `admin/subscription`의 trial 계산 기준 확인
  - 가입 시점
  - trial 시작일 / 종료일 저장 방식
  - 서버 계산값 vs 화면 계산값
- 사용량/메시지 화면의 마진 데이터 공급 경로 확인
  - API가 이미 마진을 내려주는지
  - 프런트에서 role 조건 없이 렌더링하는지
  - tenant admin과 superadmin 권한 경계가 섞였는지

### 2) QR 인쇄 흐름 확인

- `admin/dashboard`에서 QR 생성은 되는지, 인쇄만 실패하는지 분리
- 인쇄 버튼 이벤트, 인쇄용 CSS, 인쇄 대상 DOM 범위 확인
- `window.print()` 호출 타이밍과 QR 렌더 완료 타이밍 충돌 여부 확인

### 3) 접수 화면 공통 흐름 확인

- `kiosk-sms`와 `kiosk`에서 공통으로 쓰는 설정 API 확인
- 접수유형 선택 이후 메뉴선택 렌더 조건 확인
- 카테고리/메뉴 설정 데이터가 빈 값으로 내려오는지 확인
- 이벤트 바인딩 누락인지, 상태 초기화 충돌인지 확인

### 4) 수정 후 검증 순서 고정

- 구독 화면
- 관리자 QR 인쇄
- `kiosk-sms`
- `kiosk`
- 권한별 사용량 화면

운영 영향도가 높은 순서대로 검증하고, 앞 단계가 통과해야 다음 단계로 넘어간다.

---

## 5. Codex / Claude 분담안

### Codex 담당 권장 범위

- 전체 이슈 재현 순서 고정
- 서버/API 응답 경로 점검
- 권한/정산/구독 로직 검토
- 최종 검증 체크리스트 통합
- 문서 업데이트 정리

### Claude 담당 권장 범위

- 관리자 화면 DOM 이벤트와 인쇄 CSS 확인
- `kiosk-sms`, `kiosk` 프런트 상태 흐름 추적
- 공통 UI 컴포넌트/스크립트 차이 비교
- 재현 경로 캡처 및 화면 중심 수정 초안 정리

### 충돌 방지 규칙

- 같은 파일을 동시에 수정하지 않는다.
- 먼저 `원인 추정 메모`를 공유한 뒤 구현에 들어간다.
- 권한 이슈는 화면/서버 둘 중 어디까지 막을지 먼저 합의한다.
- `kiosk-sms`와 `kiosk`가 공통 스크립트를 쓰면 한 사람이 공통 파일을 맡고, 다른 사람은 검증으로 돌린다.

---

## 6. 세부 체크포인트

### A. 트라이얼 잔여기간

- 가입 직후 trial 시작일이 저장되는지
- 종료일이 `created_at + N일`인지 별도 필드인지
- 서버 시간대와 화면 시간대 차이로 0일 고정이 되는지
- 남은 일수 계산이 음수/0으로 고정되는 조건이 있는지

### B. QR 인쇄

- QR canvas 또는 img가 인쇄 DOM에 포함되는지
- print 전용 CSS가 QR 섹션을 숨기고 있지 않은지
- 렌더 완료 전에 print가 호출되는지
- 브라우저별 차이 없이 최소 Chrome 기준 동작하는지

### C. kiosk-sms / kiosk 선택 흐름

- 접수유형 변경 시 메뉴 목록 갱신 함수가 호출되는지
- 메뉴 데이터가 tenant 설정에 실제 존재하는지
- 메뉴가 없는 경우 fallback 문구만 뜨고 선택이 막히는지
- 번호표 모드와 SMS 모드에서 분기명이 달라 한쪽만 누락됐는지

### D. 마진 노출 제어

- tenant admin 화면에서 마진 컬럼 자체를 숨길지
- API에서 `margin`, `provider_unit_cost`, `billing_amount` 노출 범위를 role별로 분리할지
- superadmin 전용 데이터인지 운영 관리자도 봐야 하는지 기준 확정

---

## 7. 구현 전 확인 질문

아래는 구현 전에 Codex/Claude가 내부적으로 먼저 맞춰야 할 항목이다.

- 트라이얼 기준 일수는 현재 몇 일로 운영 중인지
- 마진 정보는 superadmin 전용인지, platform 운영자 전용인지
- `kiosk`의 "번호표 부분도 마찬가지"가 메뉴선택 불가를 뜻하는지, 번호 발급 버튼 비활성까지 포함하는지

사용자에게 다시 물어야 하는 항목은 마지막 항목뿐이고, 나머지는 코드/설정 확인으로 우선 판단 가능하다.

---

## 8. 완료 기준

- 무료 가입 사용자로 로그인 시 trial 잔여일이 매일 정상 감소 표시된다.
- 관리자 대시보드에서 QR 인쇄 버튼으로 실제 인쇄 가능한 출력물이 생성된다.
- `kiosk-sms`에서 접수유형 이후 메뉴선택이 가능하고 정상 접수된다.
- `kiosk`에서도 동일 흐름이 정상 동작하거나, 별도 분기 문제면 분리 수정된다.
- tenant admin 계정에서는 마진 정보가 보이지 않는다.
- 수정 결과와 수동 검증 절차가 `docs/TODO.md` 기준으로 다시 체크 가능하다.

---

## 9. 구현 결과 (2026-04-18)

> 구현자: Claude / 배포: git push → 서버 git pull + pm2 restart

### 수정된 파일 목록

| 파일 | 변경 내용 |
|------|---------|
| `server/public/kiosk-sms.html` | 카테고리 클릭 즉시 발급 → 선택 표시 + 메뉴선택 카드 + 접수하기 버튼 흐름으로 전환 |
| `server/public/kiosk.html` | 동일 (phone input 없는 버전) |
| `server/public/admin/dashboard.html` | QR CDN(404) → 로컬 `/js/qrcode.min.js` 교체, 화면 140px 표시, iframe 인쇄 방식으로 전환 |
| `server/public/admin/subscription.html` | `trialDaysLeft()` 함수 추가(캘린더 날짜 기준), 원가/마진 렌더링 제거 |
| `server/public/admin/messages.html` | 원가/마진 렌더링 제거 |
| `server/src/modules/tenant/tenant.service.js` | `getSubscription()`, `getMonthlyUsage()` SQL에서 `provider_cost_amount`, `margin_amount` 제거 |
| `server/src/app.js` | `express.static(PUBLIC_DIR)` 미들웨어 추가 (`/js/qrcode.min.js` 서빙용) |
| `server/public/js/qrcode.min.js` | qrcodejs 1.0.0 로컬 추가 (cdnjs) |

### 항목별 구현 상세

#### A. kiosk / kiosk-sms 메뉴선택 흐름
- **원인**: 기능 자체가 미구현. 카테고리 클릭 → 즉시 발급 구조였음
- **수정**: `selectCategory()` 함수 추가. `menu_selection_enabled=true` AND `menuItems.length > 0` 조건 시 메뉴 카드 표시. 메뉴 선택은 선택사항(optional). 접수하기 버튼 클릭 시 발급
- **닫기/리셋**: 성공 오버레이 닫을 때 카테고리·메뉴·버튼 모두 초기화

#### B. QR 인쇄
- **원인 1**: `https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js` — 해당 경로 자체가 404. QR이 처음부터 생성 안 됨
- **원인 2**: `express.static` 미설정으로 `/js/` 경로가 API 404 핸들러에 걸림
- **수정**: qrcodejs 1.0.0(cdnjs)를 `server/public/js/qrcode.min.js`로 로컬 저장. `express.static` 추가
- **인쇄 방식**: `window.print()` → hidden iframe + `canvas.toDataURL()` → 새 창 노출 없이 인쇄 다이얼로그만 표시. A4 160mm 중앙 배치, `@page { margin: 0 }`
- **화면 표시**: qrcodejs는 canvas로 그린 후 img에 복사. img를 140px로 표시, canvas는 숨김(인쇄용 toDataURL은 숨김 canvas에서 동작)

#### C. 트라이얼 잔여일 계산
- **원인**: `Math.ceil((trial_ends_at - Date.now()) / 86400000)` — 당일 가입자가 다음날 오전에도 "30일 남음"으로 표시
- **수정**: `trialDaysLeft(isoDate)` 함수 — 시간 제거 후 날짜만 비교 (`Math.round`). dashboard.html / subscription.html 양쪽 동일 함수 적용

#### D. 마진 정보 노출
- **범위**: API 응답 + 화면 두 곳 모두 노출 중
- **수정**: `tenant.service.js` 두 함수(`getSubscription`, `getMonthlyUsage`)의 SQL SELECT에서 `provider_cost_amount`, `margin_amount` 제거. `subscription.html` / `messages.html` 렌더링 라인 제거
- **미결**: superadmin 전용 조회 API는 별도 검토 필요 (현재 superadmin 라우트는 미수정)

### Codex 검증 요청 항목

1. **kiosk / kiosk-sms**: ezen 테넌트로 실접속 후 `대기` 선택 → `음료수` 메뉴 표시 확인 → 접수하기 → 번호 발급 확인
2. **QR 인쇄**: `admin/dashboard`에서 QR 미리보기 표시 확인, 인쇄 버튼 → 인쇄 다이얼로그 정상 확인
3. **트라이얼**: ezen 구독 `trial_ends_at` 값 기준으로 오늘 기준 잔여일 계산값이 dashboard / subscription 양쪽 동일한지 확인
4. **마진**: tenant admin 토큰으로 `/api/ezen/admin/subscription`, `/api/ezen/admin/messages/usage` 직접 호출 시 `provider_cost_amount`, `margin_amount` 필드 미포함 확인
5. **정적 파일**: `https://waiting.semolink.store/js/qrcode.min.js` 200 응답 및 JS MIME type 확인
