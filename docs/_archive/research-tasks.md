# 리서치 항목 (Codex 담당)

> 리서치 결과는 각 항목별 별도 파일로 저장

---

## 1. 인프라 / 서버 환경

- [ ] Ubuntu에서 Node.js + PostgreSQL + Redis 동시 운영 시 권장 스펙
- [ ] PM2 클러스터 모드 vs 단일 프로세스 — 트래픽 기준 선택 기준
- [ ] Nginx 서브도메인 + Node.js 리버스 프록시 설정 패턴
- [ ] Let's Encrypt wildcard SSL 자동 갱신 설정

## 2. 실시간 통신

- [ ] Socket.io vs Server-Sent Events (SSE) 비교
  - 대기열 시스템에 적합한 방식
  - 연결 수 제한 / 스케일링 고려
- [ ] Socket.io Room 기반 멀티테넌트 격리 패턴
- [ ] Redis Pub/Sub + Socket.io 연동 (다중 서버 대비)

## 3. 멀티테넌트 아키텍처

- [ ] PostgreSQL 단일 DB 멀티테넌트 패턴 (Row-level vs Schema-level)
- [ ] JWT 기반 테넌트 인증 + 미들웨어 설계 패턴
- [ ] Node.js + Express 멀티테넌트 라우팅 패턴

## 4. Solapi SMS API

- [ ] Solapi REST API 인증 방식 (HMAC-SHA256) 최신 문서
- [ ] 카카오 알림톡 (ATA) 발송 플로우 — 채널 연동 필요 사항
- [ ] SMS vs 알림톡 발송 비용 비교
- [ ] 발송 실패 시 재시도 / fallback 처리 방법

## 5. 구독 / 사용량 제한

- [ ] Node.js에서 API별 사용량 카운팅 패턴 (Redis 활용)
- [ ] 월별 카운트 자동 초기화 구현 (cron vs DB 트리거)
- [ ] 트라이얼 → 유료 전환 UX 패턴 사례

## 6. 결제 연동 (Phase 7 대비 사전 조사)

- [ ] 토스페이먼츠 정기결제 API 흐름
- [ ] 아임포트(포트원) 정기결제 API 흐름
- [ ] 두 서비스 비교 (수수료, 연동 난이도, 지원 결제수단)
