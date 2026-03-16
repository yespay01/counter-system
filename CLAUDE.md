# Counter System - 순번대기 시스템

## 프로젝트 개요

어학원(중국어·영어 학원)용 **순번대기 관리 시스템**. 키오스크, 창구 직원 화면, 대형 디스플레이 3가지 화면으로 구성되며, Firebase Realtime Database로 실시간 동기화한다.

---

## 기술 스택

- **순수 HTML/CSS/JavaScript** — 빌드 도구 없음, npm 없음, 프레임워크 없음
- **Firebase Realtime Database** v11.10.0 (CDN) — 실시간 데이터 동기화
- **Web Serial API** — 시리얼 영수증 프린터 연결 (키오스크)
- **Web Audio API** — 호출음 재생 (디스플레이)
- **언어**: 한국어 전용 UI (`'Malgun Gothic'`, `'Noto Sans KR'`)

---

## Firebase 설정

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

## 파일 구조 및 역할

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

## 과정(Course) 정보

기본 과정 코드 (Firebase `kioskGlobalSettings.courses`에서 동적 변경 가능):

| 코드 | 한국어 이름 | 영어 이름 |
|------|------------|-----------|
| `CH` | 중국어 과정 | Chinese Course |
| `EN` | 영어 과정 | English Course |
| `HSK` | HSK 시험반 | HSK Test Prep |
| `TO` | TOEIC 집중반 | TOEIC Course |

---

## 주요 기능 및 동작 원리

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

## 디스플레이 화면 (`display.html`) 특이사항

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

## 코드 규칙 및 주의사항

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

## 운영 환경

- 브라우저에서 직접 HTML 파일을 열어 사용 (로컬 파일)
- 인터넷 연결 필수 (Firebase, Google Fonts CDN)
- 시리얼 프린터: Chrome/Edge 등 Web Serial API 지원 브라우저 필요
- 창구 직원 PC: `counter.html` 실행
- 키오스크 PC/태블릿: `kiosk-normal/index.html` (시리얼 프린터) 또는 `kiosk-sms/index.html` (알림톡) 실행
- 대기실 TV: `display.html` 실행 (전체화면 F11)
