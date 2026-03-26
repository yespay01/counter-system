# Repository Guidelines

## Working Mode
Default collaboration mode for this repository:

- Codex reviews and verifies changes first.
- Codex updates top-level documents when lower-level decisions change.
- Codex writes code only when the user explicitly instructs implementation.
- For review requests, findings, regressions, missing updates, and verification gaps come before solution proposals.

## Project Structure & Module Organization
This repository contains two layers: (1) legacy static Firebase HTML screens (`counter.html`, `display.html`, `kiosk-normal/`, `kiosk-sms/`) kept for reference, and (2) the active SaaS server under [`server/`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/server/) — Node.js + Express + PostgreSQL + Socket.IO + Redis. Planning and research notes are under [`docs/`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs), and [`CLAUDE.md`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/CLAUDE.md) is the primary runtime and architecture reference.

## Build, Test, and Development Commands
The legacy HTML screens have no build step. The active SaaS server uses Node.js with npm.

```bash
# Start local dev dependencies (PostgreSQL + Redis)
cd server && docker compose up -d

# Run the server locally
cd server && npm run dev   # nodemon, port 3200

# Health check
curl http://localhost:3200/api/health
```

For the legacy static screens, `python3 -m http.server 3000 --bind 127.0.0.1` still works for basic HTML checks.

## Coding Style & Naming Conventions
Server-side: 4-space indentation, `camelCase` for JS variables and functions, `kebab-case` for CSS classes. Each Express module lives under `server/src/modules/<name>/` with `<name>.routes.js`, `<name>.service.js`, `<name>.controller.js`. Legacy HTML screens keep existing Korean UI copy and `COURSE-001` number format unchanged.

## Testing Guidelines
No automated test suite yet; use manual smoke tests. For server changes: restart the server, hit `GET /api/health`, exercise the affected route with curl or a browser, confirm Socket.IO events if queues are involved. For legacy HTML changes: verify ticket issuance, counter call/recall, and live display updates.

## Commit & Pull Request Guidelines
Use short imperative subjects. Include the affected module or screen and the behavior change — avoid vague messages like `Update kiosk.html`. PRs should describe the user-visible change, list manual test steps, and note any DB migration or schema changes required.

## Configuration Notes
Server config lives in `server/.env` (not committed). Key variables: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PORT`. The legacy HTML files still contain a Firebase config block — do not remove it; it is still used by those screens.

## Current Direction
Current planning decisions favor a `Solo` MVP first: a tablet-first queue flow for small walk-up sellers such as snack stalls, takeout counters, pop-ups, and small bakeries. Keep `Standard` multi-screen operations as the follow-up expansion path. Technical decisions already settled in research/meeting notes are:

- Backend: `Node.js + Express + PostgreSQL + Socket.IO + Nginx`
- Multitenancy: `/:slug/...` + `tenant_id` + PostgreSQL RLS
- Redis: keep room for it in the design, but it is optional at Solo MVP runtime
- Frontend: keep the existing plain HTML/CSS/JS approach for MVP
- Sandbox: no real SMS send; use `sandbox_mode`, message preview, and sandbox logs
- Billing: base subscription fee plus per-message usage billing
- Messaging: `Solapi` 유지, `알림톡 우선 + 실패 시 자동 SMS fallback (기본 ON)`
- Channel model: `플랫폼 공유 채널(기본) + 테넌트 개별 채널(선택)` 하이브리드
- Browser send: direct browser send is deprecated before MVP; use server API only
- Solo MVP billing ops: `계좌이체 수동 처리`, PG 미정, `업소 50개 이상`에서 공식 재검토
- Billing design: `BillingService` boundary + `ManualBillingService`, minimal `/superadmin` included in Solo MVP
- Current implementation status: `Phase 1~7` complete + 실서버 배포 완료 (2026-03-25)
- Server: insuk@192.168.0.5, `/home/insuk/projects/counter-system/server/`, API port 3200, PM2 + Docker
- Nginx/SSL: 완료 (2026-03-26) — `https://waiting.semolink.store`, Let's Encrypt
- Solapi 실발송: 완료 (2026-03-26) — 실서버 env 반영, sandbox_mode=false, ezen 테넌트 Solo 흐름 확인
- CSP: 완료 (2026-03-26) — 인라인 스크립트 + ws:/wss: 허용 (helmet useDefaults + directives)
- Next: 파일럿 운영 모니터링, 알림톡 발송 로그 확인, 추가 테넌트 온보딩

Before editing planning docs, align with these decisions unless the user explicitly changes them.

## Agent Meeting Notes
If the user starts an agent meeting, follow [`docs/agent_meeting/MEETING_GUIDE.md`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/agent_meeting/MEETING_GUIDE.md). Meetings start only after research is complete and only when the user specifies both the topic and the agent who writes the agenda. Use `YYYY-MM-DD_HHMM_안건_<주제>.md` for agendas and `YYYY-MM-DD_HHMM_회의록_<주제>.md` for minutes, keep agenda files unchanged during the meeting, let the non-agenda agent write first in the minutes, and archive completed files under [`docs/agent_meeting/completed/`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/agent_meeting/completed).

## Upper Docs
When lower-level decisions change, keep these documents aligned first:

- [`CLAUDE.md`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/CLAUDE.md)
- [`AGENTS.md`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/AGENTS.md)
- [`docs/TODO.md`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/TODO.md)
- [`docs/1-research/0-summary.md`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/1-research/0-summary.md)
- [`docs/2-plan/2-1-service-plan.md`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/2-plan/2-1-service-plan.md)
- [`docs/2-plan/2-2-architecture-plan.md`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/2-plan/2-2-architecture-plan.md)
- [`docs/2-plan/2-3-screen-plan.md`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/2-plan/2-3-screen-plan.md)
- [`docs/2-plan/2-4-roadmap.md`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs/2-plan/2-4-roadmap.md)
