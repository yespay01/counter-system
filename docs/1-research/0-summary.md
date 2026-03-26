# 리서치 요약

> 작성일: 2026-03-16
> 상태: ✅ 완료
> 목적: 개별 리서치 문서의 핵심 결론을 한 페이지로 정리

---

## 1. 시장 결론

- `1-1 시장조사 회의` 기준 1차 시장 메시지는 `소규모 현장 판매 업종`으로 확정됐다.
- 예: `호떡집`, `분식 포장점`, `팝업스토어`, `소형 베이커리`, `테이크아웃 전문점`
- 예약형/좌석형 레스토랑은 제외하고, 포장형/테이크아웃형 소규모 업종은 포함 검토다.
- 제품 포지션은 `태블릿 1대 기반 혼잡 시간대용 대기 도구`에서 시작해 이후 `현장형 순번대기 운영 SaaS`로 확장한다.
- 공개 확인 가능한 경쟁 가격대는 대체로 `월 3만~5만원대` 시작이다.

## 2. 기술 결론

- `1-2 기술 리서치 회의` 기준 기술 스택은 `Node.js + Express + PostgreSQL + Socket.IO + Nginx`
- Redis는 설계에 포함하되, `Solo MVP 런타임`에서는 optional이다.
- 멀티테넌트는 `/:slug/... + tenant_id + PostgreSQL RLS`로 확정됐다.
- 프런트엔드는 MVP에서 `순수 HTML/JS 유지`다.
- 프록시는 `Nginx`
- 샌드박스는 `sandbox_mode + 메시지 미리보기 + sandbox 로그` 방식이다.

## 3. 메시지 결론

- 공급자는 `Solapi` 유지
- 기본 채널은 `알림톡(ATA)` 우선
- 실패 시 `자동 SMS fallback`이 기본 ON으로 확정됐다
- 채널 구조는 `플랫폼 공유 채널(기본) + 테넌트 개별 채널(선택)` 하이브리드다
- 현재 브라우저 직접 발송 구조는 운영용으로 부적합
- SaaS 전환 시 `서버 발송 구조`로 변경 필요
- Solo MVP의 `admin/messages`에는 PFID / 발신번호 / 템플릿 식별자 입력과 발송 로그 확인이 포함된다
- 회의 결과 가격 정책은 `기본 구독료 + 메시지 건당 별도 과금`으로 정리됐다.
- 메시지 과금은 `sent` 성공 건만 billable로 집계하고 `previewed` / `failed`는 제외한다
- `issue`, `ready`, `call` 3종 메시지를 모두 정산 대상 집계에 포함한다
- 발송 시점의 Solapi 원가와 업소 청구 단가를 스냅샷으로 남겨 월 정산 기준으로 사용한다

## 4. 결제 결론

- Solo MVP 결제는 `계좌이체 수동 처리`로 확정됐다
- PG사는 현재 `미정`이며, `업소 50개 이상`을 공식 재검토 기준으로 둔다
- 설계는 `BillingService` 경계 + `ManualBillingService` 구현체 기준으로 정리한다
- 수동 결제 상태 관리를 위한 최소 `/superadmin` 화면이 Solo MVP에 포함된다

## 5. 상품 결론

- MVP는 `Solo 모드` 우선이다.
- 개발은 `기존 학원 코드 → Solo 단순화 → Standard 확장` 구조로 진행한다.
- 가격은 `기본 구독료 + 메시지 건당 별도 과금`이 현재 확정 방향이다.
- 트라이얼은 `실제 SMS 발송 없는 샌드박스(테스트 모드)` 방식으로 재설계한다.
- Solo MVP 번호 발급 UX는 `태블릿 전화번호 입력`, `QR 셀프 접수`, `음식점형 메뉴 선택`까지 수용한다.

## 6. 현재 상태와 바로 이어지는 작업

1. `2-1 ~ 2-4` 플랜 문서는 회의 결과 반영 기준으로 확정됐다.
2. `Phase 1 ~ 4` 구현은 완료됐고, `Phase 5` Standard 화면 구현과 브라우저 검증도 완료됐다.
3. `Solo MVP`는 `/:slug/solo` + 기본 관리자 화면 + 메시지/정산 구조까지 구현 및 검증 완료 상태다.
4. `Solo MVP` 체크리스트 전 항목이 완료됐다.
5. 현재 상태는 `Solo 파일럿 가능`이다.
6. `Phase 7` 완료 + 실서버 배포 완료 (2026-03-25). insuk@192.168.0.5, API port 3200, PM2 + Docker 운영 중.
7. Nginx/SSL + Solapi 실발송 + 파일럿 가동 완료 (2026-03-26): `https://waiting.semolink.store`, ezen 테넌트 Solo 실발송 흐름 확인. 다음: 운영 모니터링, 추가 테넌트 온보딩.

## 7. 관련 문서

- 아래 개별 리서치 문서는 회의 전 조사 원본을 포함한다. 최신 기준은 각 회의 결과와 `2-plan` 문서를 우선한다.
- [`1-1 시장조사`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/1-research/1-1-market-research.md)
- [`1-2 기술 리서치`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/1-research/1-2-technical-research.md)
- [`1-3 Solapi 운영 조사`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/1-research/1-3-solapi-operations-research.md)
- [`1-4 결제 서비스 조사`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/1-research/1-4-payment-research.md)
- [`1-1 시장조사 회의 결과`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/agent_meeting/completed/2026-03-16_1826_1-1-시장조사/2026-03-16_1826_안건_1-1-시장조사.md)
- [`1-2 기술 리서치 회의 결과`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/agent_meeting/completed/2026-03-16_1854_1-2-기술리서치/2026-03-16_1854_안건_1-2-기술리서치.md)
- [`1-3 Solapi 운영 조사 회의 결과`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/agent_meeting/completed/2026-03-17_1221_1-3-solapi-운영조사/2026-03-16_1826_안건_1-3-solapi-운영조사.md)
- [`1-4 결제 서비스 조사 회의 결과`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/agent_meeting/completed/2026-03-17_1323_1-4-결제서비스조사/2026-03-16_1826_안건_1-4-결제서비스조사.md)
