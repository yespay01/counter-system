# Repository Guidelines

## Working Mode
Default collaboration mode for this repository:

- Codex reviews and verifies changes first.
- Codex updates top-level documents when lower-level decisions change.
- Codex writes code only when the user explicitly instructs implementation.
- For review requests, findings, regressions, missing updates, and verification gaps come before solution proposals.

## Project Structure & Module Organization
This repository is a static browser-based queue system. The main operator view is [`counter.html`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/counter.html), the waiting-room display is [`display.html`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/display.html), and kiosk variants live in [`kiosk-normal/index.html`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/kiosk-normal/index.html) and [`kiosk-sms/index.html`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/kiosk-sms/index.html). Planning and research notes are under [`docs/`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/docs), and [`CLAUDE.md`](/mnt/c/Users/sakai/OneDrive/바탕 화면/counter-system/CLAUDE.md) documents runtime behavior and Firebase data shape.

## Build, Test, and Development Commands
There is no build step, package manager, or bundler in this repo.

- `python3 -m http.server 3000 --bind 127.0.0.1`
  Serve the repository locally for browser testing.
- Open `http://127.0.0.1:3000/counter.html`
  Test the staff counter screen.
- Open `http://127.0.0.1:3000/display.html`
  Test the public display screen.
- Open `http://127.0.0.1:3000/kiosk-normal/` or `http://127.0.0.1:3000/kiosk-sms/`
  Test kiosk flows.

Direct file opening also works for basic checks, but use a local server when validating browser APIs and cross-screen behavior.

## Coding Style & Naming Conventions
Use 4-space indentation in HTML, CSS, and JavaScript blocks. Keep each screen self-contained: markup, styles, and scripts stay in the same file unless the repo is intentionally restructured. Prefer `camelCase` for JavaScript variables and functions, `kebab-case` for CSS classes, and preserve the existing Korean UI copy unless a change explicitly requires new wording. Keep queue numbers in the existing `COURSE-001` format, and update duplicated `firebaseConfig` values consistently across all four runtime files.

## Testing Guidelines
There is no automated test suite yet; use manual smoke tests. After changes, verify ticket issuance on the relevant kiosk, counter call/recall behavior in `counter.html`, and live updates plus audio/status behavior in `display.html`. When touching kiosk settings or course data, confirm Firebase sync across every screen.

## Commit & Pull Request Guidelines
Recent history uses short imperative subjects such as `Reorganize file structure: move kiosks to subfolders, remove legacy files` and `Add currentCall to kiosk state initialization`. Follow that style, but avoid vague messages like `Update kiosk.html`; include the affected screen and behavior instead. PRs should describe the user-visible change, list manual test steps, mention any Firebase schema/config updates, and include screenshots for UI changes.

## Configuration Notes
Firebase is loaded from CDN modules in every runtime HTML file. Any config or data-shape change must be mirrored across the operator, display, and kiosk screens to avoid drift.

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
- Current implementation status: `Phase 1~7` complete — rate limit + audit log + 예외처리 + 운영 매뉴얼 (2026-03-25), `파일럿 투입 가능`
- All phases complete. Next: 실제 파일럿 고객 온보딩

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
