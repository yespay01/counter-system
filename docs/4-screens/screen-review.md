# 화면 구성 검토 메모

> 작성일: 2026-03-26
> 목적: 현재 구현된 화면 전체 목록 + 추가/수정 사항 체크리스트

---

## 현재 운영 URL 구조

| 역할 | URL | 파일 | 대상 |
|------|-----|------|------|
| 고객 접수 (알림톡) | `/:slug/kiosk-sms` | `public/kiosk-sms.html` | 고객 (태블릿) |
| 고객 접수 (번호표) | `/:slug/kiosk` | `public/kiosk.html` | 고객 (태블릿) |
| 고객 QR 셀프 접수 | `/:slug/join` | `public/join.html` | 고객 (본인 폰) |
| 대기 디스플레이 | `/:slug/display` | `public/display.html` | 대기실 TV |
| 직원 호출 화면 | `/:slug/counter` | `public/counter.html` | 직원 |
| Solo 통합 화면 | `/:slug/solo` | `public/solo.html` | 1대 운영용 |
| 관리자 대시보드 | `/:slug/admin/dashboard` | `public/admin/dashboard.html` | 관리자 |
| 관리자 설정 | `/:slug/admin/settings` | `public/admin/settings.html` | 관리자 |
| 관리자 메시지 | `/:slug/admin/messages` | `public/admin/messages.html` | 관리자 |
| 관리자 구독 | `/:slug/admin/subscription` | `public/admin/subscription.html` | 관리자 |

---

## 2026-03-26 추가 사항

### 1. counter.html — 관리자 버튼 추가
- 상단 topbar에 `관리자` 버튼 추가
- 클릭 시 `/:slug/admin/dashboard` 이동
- **검토 필요**: 관리자 접근 권한 체크 없음 (현재 URL만 이동)

### 2. admin/dashboard.html — 운영 화면 바로가기 섹션 추가
- 5개 운영 화면 링크 (새 탭으로 열림)
  - 📱 키오스크 (알림톡) → `/:slug/kiosk-sms`
  - 🎫 키오스크 (번호표) → `/:slug/kiosk`
  - 🔗 QR 셀프 접수 → `/:slug/join`
  - 📺 대기 디스플레이 → `/:slug/display`
  - 🖥 직원 호출 화면 → `/:slug/counter`
- **검토 필요**: 설정에서 비활성화된 화면도 링크가 노출됨 (예: QR 비활성화 시에도 join 링크 표시)

### 3. admin/dashboard.html — QR 코드 섹션 추가
- `/:slug/join` URL을 QR 코드로 자동 생성 (qrcode.js CDN)
- URL 텍스트 표시
- 🖨 인쇄 버튼 — 인쇄 시 QR 코드만 출력 (나머지 섹션 숨김)
- **검토 필요**: 인쇄 레이아웃 실제 출력 확인 필요
- **검토 필요**: 가게 이름 / 안내 문구 없이 QR만 출력됨 — 인쇄용 안내문구 추가 검토

---

## 추후 개선 검토 항목

- [ ] `solo.html` — Solo 개념 재검토 완료. 실제 운영은 kiosk + counter + display 분리 구조 권장
- [ ] `kiosk-sms.html` — 전화번호 입력 UX 실제 태블릿에서 테스트 필요
- [ ] `display.html` — 대기 현황 실시간 업데이트 브라우저 검증 필요
- [ ] `counter.html` — 창구 번호 선택 UX 실제 운영 피드백 반영 필요
- [ ] `join.html` — QR 접수 후 대기 현황 안내 화면 UX 검토
- [ ] QR 인쇄물 — 가게명, 안내 문구 포함한 인쇄 레이아웃 개선 검토
- [ ] 운영 화면 바로가기 — 설정 연동 (QR 비활성 시 join 링크 숨김 등)

---

## 관련 파일

- 화면 설계 원본: `docs/2-plan/2-3-screen-plan.md`
- 서버 라우트: `server/src/app.js` (정적 파일 라우팅)
- 운영 매뉴얼: `docs/operations-manual.md`
