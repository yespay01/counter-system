# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Counter System - 순번대기 시스템

## 최종 목표 (1차 방향/플랜 확정)

현재 어학원 전용 단일 시스템을 **태블릿 1대 기반 Solo 모드에서 시작해 Standard로 확장하는 범용 SaaS 서비스**로 전환한다.

- **인프라 이전**: Firebase → 자체 Linux 서버 (Ubuntu + Node.js + PostgreSQL, Redis는 Standard 대비 설계 포함)
- **범용화**: 하드코딩된 학원 과정 → 업체가 직접 카테고리 설정
- **멀티테넌트**: 여러 업체가 독립적으로 사용하는 SaaS 구조
- **시장 방향**: 소규모 현장 판매 업종용 `Solo`를 먼저 출시하고 이후 `Standard` 확장
- **메시지 과금**: 기본 구독료 + 실제 메시지 건당 과금
- **트라이얼**: 실제 SMS 없이 전체 흐름을 시험하는 샌드박스 모드
- **관련 문서**: `docs/` 폴더 참고 (`TODO.md` → 진행 순서, `1-research/0-summary.md` → 리서치 요약, `2-plan/` → 설계, `agent_meeting/completed/` → 회의 확정본)

> 현재 단계: STEP 3 개발 완료.
> 구현 상태: `Phase 1 ~ 7` 완료 — rate limit + audit log + 예외처리 + 운영 매뉴얼 (2026-03-25).
> 현재 판정: `파일럿 투입 가능`, Phase 1~7 전체 완료.
> 다음 단계: 실제 파일럿 고객 온보딩.

---

## 작업 원칙

- 기본 작업 모드는 `검수 / 검증 / 상위 문서 정리` 우선이다.
- 하위 문서나 결정사항이 바뀌면 `CLAUDE.md`, `AGENTS.md`, `docs/TODO.md`, `docs/1-research/0-summary.md`, `docs/2-plan/2-1~2-4` 같은 상위 문서도 함께 갱신한다.
- 사용자가 명시적으로 구현을 지시할 때만 코드 수정 작업으로 들어간다.
- 별도 구현 지시가 없으면 먼저 누락, 충돌, 회귀 위험, 검증 부족을 점검한다.

---

## 레거시 구현 참고

아래 섹션은 **현재 저장소에 남아 있는 기존 Firebase 기반 정적 구현** 설명이다.
SaaS 전환의 공식 기준은 이 아래가 아니라 문서 하단의 `최신 확정 사항`과 `docs/2-plan/` 문서를 따른다.

---

## 프로젝트 개요 (레거시 현재 상태)

어학원(중국어·영어 학원)용 **순번대기 관리 시스템**. 키오스크, 창구 직원 화면, 대형 디스플레이 3가지 화면으로 구성되며, Firebase Realtime Database로 실시간 동기화한다.

---

## 기술 스택 (레거시 구현)

- **순수 HTML/CSS/JavaScript** — 빌드 도구 없음, npm 없음, 프레임워크 없음
- **Firebase Realtime Database** v11.10.0 (CDN) — 실시간 데이터 동기화
- **Web Serial API** — 시리얼 영수증 프린터 연결 (키오스크)
- **Web Audio API** — 호출음 재생 (디스플레이)
- **언어**: 한국어 전용 UI (`'Malgun Gothic'`, `'Noto Sans KR'`)

---

## Firebase 설정 (레거시 구현)

```js
// 모든 HTML 파일에 동일하게 사용되는 설정값
const firebaseConfig = {
    apiKey: "AIzaSyCuvEDDEoMLwLB2miGHCWX1-B5u8gKlGEQ",
    authDomain: "counter-system-26479.firebaseapp.com",
    databaseURL: "https://counter-system-26479-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "counter-system-26479",
    storageBucket: "counter-system-26479.firebasestorage.app",
    messagingSenderId: "316144964417",
    appId: "1:316144964417:web:8a95a80f9db622f4ee87c0"
};
```

### Firebase 데이터 구조

```
counterSystem/
├── currentCall/
│   ├── number           # 현재 호출 번호 (예: "CH-001")
│   ├── counter          # 창구 번호 (1~6)
│   ├── course           # 과정 코드
│   ├── immediateCall    # 즉시 호출 플래그 (boolean)
│   ├── isRecall         # 재호출 여부 (boolean)
│   ├── callType         # 호출 유형 ('direct' | 'normal')
│   ├── callTime         # 호출 시각
│   └── recallTime       # 재호출 시각
├── waiting[]            # 대기열 배열
│   ├── number           # 대기 번호
│   ├── course           # 과정
│   └── time             # 발급 시각
├── counters[]           # 창구 현황 (index 0~5 → 창구 1~6)
│   ├── id               # 창구 번호
│   └── current          # 현재 응대 중인 번호
└── counterSettings/     # 창구별 담당 과정
    ├── 1: 'CH' | 'EN' | 'HSK' | 'TO' | 'ALL'
    └── ...

kioskGlobalSettings/
└── courses[]            # 과정 목록 (키오스크에서 관리)
    ├── code             # 과정 코드 (예: 'CH')
    ├── name             # 한국어 이름 (예: '중국어 과정')
    └── englishName      # 영어 이름
```

---

## 파일 구조 및 역할 (레거시 운영 파일)

```
counter-system/
├── kiosk-normal/       ← 일반 대기표 (시리얼 프린터)
│   └── index.html
├── kiosk-sms/          ← SMS/알림톡 대기표
│   └── index.html
├── counter.html        ← 창구 직원 화면
├── display.html        ← 대기실 TV 디스플레이
└── CLAUDE.md
```

### 주요 화면 (운영 파일)

| 파일 | 역할 | 사용 대상 |
|------|------|-----------|
| `kiosk-normal/index.html` | 키오스크 - 시리얼 프린터 연결 대기표 발급 | 고객 |
| `kiosk-sms/index.html` | 키오스크 - 알림톡(SMS) 방식 대기표 | 고객 |
| `counter.html` | 창구 직원 화면 - 창구별 전담 과정 | 직원 |
| `display.html` | 대형 TV 디스플레이 - 현재 호출 + 대기번호 + 창구현황 | 대기실 |

---

## 과정(Course) 정보 (레거시 기본값)

기본 과정 코드 (Firebase `kioskGlobalSettings.courses`에서 동적 변경 가능):

| 코드 | 한국어 이름 | 영어 이름 |
|------|------------|-----------|
| `CH` | 중국어 과정 | Chinese Course |
| `EN` | 영어 과정 | English Course |
| `HSK` | HSK 시험반 | HSK Test Prep |
| `TO` | TOEIC 집중반 | TOEIC Course |

---

## 주요 기능 및 동작 원리 (레거시 구현)

### 대기번호 발급 흐름
1. 고객이 키오스크에서 과정 선택
2. `counterSystem/waiting` 배열에 대기 정보 추가
3. 시리얼 프린터로 대기표 출력 (Web Serial API)
4. 디스플레이 화면에 대기번호 즉시 반영

### 호출 흐름
1. 직원이 `counter.html`에서 "다음 호출" 버튼 클릭
2. `counterSystem/currentCall` 업데이트 (immediateCall: true)
3. `counterSystem/waiting`에서 해당 번호 제거
4. `counterSystem/counters`에 창구별 현재 번호 업데이트
5. `display.html`이 Firebase 변경 감지 → 호출음 재생 + 화면 강조 효과

### 창구 배정 방식
- 각 창구는 특정 과정 전담 또는 모든 과정 처리 가능
- `counterSettings`에 저장: `{ 1: 'CH', 2: 'EN', 3: 'ALL', ... }`
- 창구 직원 설정 패널에서 변경 가능

---

## 디스플레이 화면 (`display.html`) 특이사항 (레거시 구현)

- **오디오**: 기본 비활성화 상태. 🔇 버튼 클릭 또는 S키로 활성화
- **레이아웃**: 좌측(현재 호출) + 우측(대기번호 최대 10개 + 창구현황 6개)
- **키보드 단축키**:
  - `F11`: 전체화면 토글
  - `S`: 오디오 토글
  - `T`: 일반 호출음 테스트
  - `R`: 재호출음 테스트
  - `D`: 디버그 모드
- **관리자 모드**: 현재 호출 번호를 7번 클릭
- **호출 중복 방지**: callKey(`번호-시각-타입`)로 동일 호출 재생 방지

---

## 로컬 개발 (레거시 구현)

빌드 도구·패키지 매니저 없음. 브라우저에서 직접 파일을 열거나, 로컬 서버를 띄워 테스트한다.

```bash
python3 -m http.server 3000 --bind 127.0.0.1
```

| URL | 화면 |
|-----|------|
| `http://127.0.0.1:3000/counter.html` | 직원 창구 |
| `http://127.0.0.1:3000/display.html` | 대기실 TV |
| `http://127.0.0.1:3000/kiosk-normal/` | 시리얼 프린터 키오스크 |
| `http://127.0.0.1:3000/kiosk-sms/` | SMS 키오스크 |

수동 스모크 테스트 체크리스트:
1. 키오스크에서 대기표 발급 → 번호 형식 `과정코드-001` 확인
2. `counter.html`에서 호출/재호출 동작 확인
3. `display.html`에서 실시간 갱신 + 호출음 확인
4. 키오스크 과정 설정 변경 → Firebase 전 화면 동기화 확인

---

## 코딩 스타일 (레거시 구현)

- **들여쓰기**: HTML·CSS·JS 블록 모두 4칸 스페이스
- **JS 식별자**: `camelCase` (변수·함수), `kebab-case` (CSS 클래스)
- **각 화면은 단일 파일로 완결**: 마크업·스타일·스크립트가 같은 파일에 위치
- **한국어 UI 문구** 변경 금지 (명시적 지시 있을 때만)
- **대기번호 형식** `COURSE-001` 유지

---

## 코드 규칙 및 주의사항 (레거시 구현)

### 수정 시 반드시 확인
- Firebase 설정값(`apiKey`, `databaseURL` 등)은 모든 HTML 파일에 중복 포함됨 → **한 파일 수정 시 관련 파일 전체 동기화 필요**
- `courses` 배열은 키오스크 설정 패널에서 관리하고 Firebase에 저장됨. 하드코딩된 기본값은 fallback용
- 대기번호 형식: `과정코드-번호` (예: `CH-001`, `EN-023`)

### UI/디자인 패턴
- 배경: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)` (전 화면 공통)
- 글꼴: `'Malgun Gothic'` (기본), `'Noto Sans KR'` (display)
- Glassmorphism 카드: `background: rgba(255,255,255,0.1); backdrop-filter: blur(20px);`
- 강조색: 초록 `#00FF88` (현재 호출), 금색 `#FFD700` (타이틀)
- 창구 활성: `border-color: #00FF88; background: rgba(0,255,136,0.15)`

### 터치 최적화 (키오스크)
- 과정 선택 버튼: `min-height: 150px`, `touch-action: manipulation`
- `pointer-events: none` 자식 요소에 적용해 터치 이벤트를 부모 버튼으로 전달
- 터치 디바이스 감지 후 `.touch-device` 클래스 추가

---

## 운영 환경 (레거시 구현)

- 브라우저에서 직접 HTML 파일을 열어 사용 (로컬 파일)
- 인터넷 연결 필수 (Firebase, Google Fonts CDN)
- 시리얼 프린터: Chrome/Edge 등 Web Serial API 지원 브라우저 필요
- 창구 직원 PC: `counter.html` 실행
- 키오스크 PC/태블릿: `kiosk-normal/index.html` (시리얼 프린터) 또는 `kiosk-sms/index.html` (알림톡) 실행
- 대기실 TV: `display.html` 실행 (전체화면 F11)

---

## 문서 진행 상태

상위 기준 문서 (우선순위 순):

1. `docs/2-plan/2-4-roadmap.md`
2. `docs/2-plan/2-2-architecture-plan.md`
3. `docs/2-plan/2-3-screen-plan.md`
4. `docs/2-plan/2-1-service-plan.md`
5. `docs/1-research/0-summary.md`
6. `CLAUDE.md` / `AGENTS.md` / `docs/TODO.md`
7. `docs/3-server_spec/SERVER_SPEC_AND_STACK.md` — Phase 1 서버 사양

주의:
- 회의 전 개별 리서치 문서(`1-1` ~ `1-4`)는 참고만, 최신 기준은 `2-plan`과 `completed` 회의 결과 우선
- 문서 간 충돌 발견 시 임의 해석 금지 — 먼저 보고

### 리서치 완료 문서
- `docs/1-research/1-1-market-research.md`
- `docs/1-research/1-2-technical-research.md`
- `docs/1-research/1-3-solapi-operations-research.md`
- `docs/1-research/1-4-payment-research.md`

주의:
- 개별 리서치 문서는 회의 전 조사 원본을 포함할 수 있다.
- 최신 공식 기준은 각 회의 결과와 `2-plan` 문서를 우선한다.

### 플랜 확정 문서
- `docs/2-plan/2-1-service-plan.md`
- `docs/2-plan/2-2-architecture-plan.md`
- `docs/2-plan/2-3-screen-plan.md`
- `docs/2-plan/2-4-roadmap.md`

### 회의 완료 문서
- `docs/agent_meeting/completed/2026-03-16_1826_1-1-시장조사/`
- `docs/agent_meeting/completed/2026-03-16_1854_1-2-기술리서치/`
- `docs/agent_meeting/completed/2026-03-17_1221_1-3-solapi-운영조사/`
- `docs/agent_meeting/completed/2026-03-17_1323_1-4-결제서비스조사/`

---

## 최신 확정 사항

### 1-1 시장조사 회의 기준
- 1차 시장 메시지: `소규모 현장 판매 업종`
- 제품 구조: `Solo 먼저 → Standard 확장`
- 개발 출발점: 기존 학원 코드
- 가격 구조: 기본 구독료 + 메시지 건당 별도 과금
- 트라이얼: 실제 SMS 없는 샌드박스 방식

### 1-2 기술 리서치 회의 기준
- 기술 스택: `Node.js + Express + PostgreSQL + Socket.IO + Nginx`
- Redis: 설계 포함, MVP 런타임 보류
- 실시간: `Socket.IO` 처음부터
- 멀티테넌트: `/:slug/... + tenant_id + PostgreSQL RLS`
- 프런트엔드: MVP는 순수 HTML/JS 유지
- 샌드박스: `sandbox_mode + 메시지 미리보기 + sandbox 로그`

### 1-3 Solapi 운영 조사 회의 기준
- 메시지 공급자: `Solapi` 유지
- 기본 메시지 정책: `알림톡 우선, 실패 시 자동 SMS fallback (기본 ON)`
- 채널 구조: `플랫폼 공유 채널(기본) + 테넌트 개별 채널(선택)` 하이브리드
- 브라우저 직접 발송: `MVP 이전 폐기`
- Solo MVP `admin/messages`: `PFID / 발신번호 / 템플릿 식별자 입력 + 발송 로그 확인`
- 운영 준비: `Phase 2~3부터 병행 시작`
- 메시지 과금 기준: `sent` 성공 건만 billable, `issue/ready/call` 전부 집계
- 정산 기준: 발송 시점 `provider unit cost`와 `billing unit price`를 스냅샷 저장

### 1-4 결제 서비스 조사 회의 기준
- Solo MVP 결제 방식: `계좌이체 수동 처리 (PG 미연동)`
- PG사: 현재 `미정`
- PG 재검토 기준: `업소 50개 이상`
- 결제 설계: `BillingService` 경계 + `ManualBillingService` 구현체
- 구독 상태 흐름: `trial -> active -> past_due -> suspended`
- sandbox → 유료 전환: 운영자가 계좌이체 확인 후 수동으로 `active + sandbox_mode=false`
- Solo MVP `admin/subscription`: trial / 플랜 상태와 계좌이체 안내 중심 기본 화면
- superadmin: `수동 결제 상태 관리용 최소 화면`을 Solo MVP에 포함

### 추가 반영 사항
- 번호 발급 UX: 태블릿 전화번호 입력과 `/:slug/join` QR 셀프 접수를 모두 수용
- 음식점형 업종: 메뉴/주문 항목 선택 후 번호 발급 가능
- 발급 API payload: `customer_phone`, `entry_channel`, 선택된 `menu_code/menu_label` 포함 가능

---

## 에이전트 회의 규칙

회의 규칙 원문은 `docs/agent_meeting/MEETING_GUIDE.md`를 기준으로 한다.

### 회의 시작 조건
- 리서치 문서가 완료된 뒤 진행한다.
- 사용자가 `안건 주제`와 `안건 작성 에이전트`를 지정해야 한다.
- 에이전트가 임의로 회의를 시작하거나 안건 파일을 먼저 만들면 안 된다.

### 파일 규칙
- 안건 파일: `YYYY-MM-DD_HHMM_안건_<주제>.md`
- 회의록 파일: `YYYY-MM-DD_HHMM_회의록_<주제>.md`
- 안건 파일은 회의 중 수정 금지
- 회의록은 안건 미작성 에이전트가 먼저 시작
- 이후에는 에이전트가 번갈아가며 작성

### 회의 종료
- 최종 결정은 사용자
- 종료 후 안건 파일에 사용자 결정을 반영
- 안건/회의록은 `docs/agent_meeting/completed/YYYY-MM-DD_HHMM_<주제>/`로 아카이브
