# Frontend Rewrite Implementation Ledger

This file tracks implementation evidence for the React/Ant Design migration goal without changing the source goal documents.

## 2026-06-23 Foundation Batch

### Scope
- Added the first isolated React, TypeScript, Vite app under `frontend/app`.
- Built the static app output into `frontend/dist/app` with `/app/` routing.
- Added a neutral migration entry from the existing static UI at `/` to `/app/`.
- Added a backend `/api/ag-ui` foundation router and typed AG-UI mapping layer.

### Builder Evidence
- AG-UI backend foundation was implemented by worker subagent `019ef245-4e7b-7f71-a898-664b7b1dea1e`.
- React app shell foundation was implemented in the main workspace and still requires a dedicated reviewer pass before the subsystem is marked complete.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 3 tests.
- `npm run build` in `frontend/app` passed and emitted `frontend/dist/app`.
- `uv run --extra dev pytest -q tests/unit_tests/interfaces/server/test_ag_ui_mapping.py tests/unit_tests/interfaces/server/test_ag_ui_router.py tests/unit_tests/interfaces/server/test_app.py::test_runtime_bundle_wires_runtime_app_with_fake_modules` passed with 19 tests.

### Known Follow-Ups
- Re-run reviewer subagent passes for the AG-UI backend and React app shell foundation after the 2026-06-23 remediation batch.
- Wire the React runtime stream client into active run execution and replay.
- Replace temporary migration switch labels before final release cleanup.
- Split Ant Design-heavy surfaces by route or feature if bundle size becomes a release blocker.

## 2026-06-23 Reviewer Remediation Batch

### Findings Addressed
- AG-UI reviewer found that `/api/ag-ui/runs` bypassed inline media normalization from the existing `/api/runs` route.
- Frontend reviewer found that mixed `kind/text` and legacy `part_kind/content` content parts broke TypeScript narrowing in timeline/export rendering.
- Frontend reviewer found that `frontend/dist/app` needed to be regenerated after source changes.

### Fixes
- Extracted shared run content normalization for inline media and display-input media-ref reuse.
- Reused the shared normalization from both `/api/runs` and `/api/ag-ui/runs`.
- Added AG-UI parity coverage for inline media display-input ref reuse.
- Switched the React app run lifecycle to `/api/ag-ui` create/stop/resume and AG-UI SSE streams.
- Added a runtime store so the timeline can render live AG-UI stream entries.
- Added typed content-part text extraction for current and legacy message payloads.
- Regenerated `frontend/dist/app`.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 4 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.
- Browser QA at `http://127.0.0.1:5174/app/` loaded the app shell, confirmed the timeline/composer grid rows as `0px 557px 111px` at 1280x720, and confirmed the composer no longer consumes the middle workspace row.
- `uv run --extra dev ruff check --fix` on touched backend files passed.
- `uv run --extra dev basedpyright` on touched backend files passed.
- `uv run --extra dev pytest -q tests/unit_tests/interfaces/server/test_ag_ui_mapping.py tests/unit_tests/interfaces/server/test_ag_ui_router.py tests/unit_tests/interfaces/server/test_runs_router.py::test_create_run_route_reuses_input_media_refs_for_display_input tests/unit_tests/interfaces/server/test_app.py::test_runtime_bundle_wires_runtime_app_with_fake_modules` passed with 21 tests.

## 2026-06-23 Recovery Resume Stream Batch

### Scope
- Extracted the React AG-UI stream lifecycle into a shared run stream controller.
- Reused the controller from both composer-created runs and recovery resume actions.
- Recovery resume now starts `/api/ag-ui/runs/{run_id}/events` from the recovery snapshot event offset when available.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 4 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

## 2026-06-23 Pending Interaction Actions Batch

### Scope
- Added typed React contracts for recovery snapshot tool approvals and user questions.
- Added AG-UI client actions for resolving tool approvals and answering user questions.
- Expanded the recovery bar so pending approvals and questions can be handled without returning to the legacy UI.
- Added focused React tests for approval resolution, question answer submission, and resume-before-approval behavior.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 7 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

## 2026-06-23 Session Creation Batch

### Scope
- Addressed recovery interaction reviewer findings by letting backend ACP defaults choose the safest approval option and supporting user-question supplements.
- Normalized the React workspace client for the current paginated `/api/workspaces` contract.
- Added workspace selection state to the React UI store.
- Added a sidebar workspace picker and new-session action that creates a session, refreshes the sidebar, and selects the created session.
- Added focused React coverage for recovery reviewer regressions, workspace response normalization, and the new-session path.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 10 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.
- Reviewer subagent `019ef270-912a-78f2-8661-e656893d31fd` passed re-review of the recovery interaction fixes and session creation flow.

## 2026-06-23 Composer Target Role Batch

### Scope
- Added React API contracts and client support for `/api/roles:options`.
- Added a compact composer target-role selector backed by normal-mode role options.
- Sent the selected `target_role_id` through AG-UI run creation.
- Tightened workspace selection so stale local storage cannot briefly drive new-session creation before loaded workspace options are validated.
- Added focused React coverage for target-role run creation.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 11 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

## 2026-06-23 Composer Thinking Controls Batch

### Scope
- Added a strict React `RunThinkingConfig` contract matching the AG-UI run schema.
- Added composer thinking mode and effort controls backed by the existing V1 local storage keys.
- Sent the selected thinking settings through AG-UI run creation with the prompt, role, and YOLO controls.
- Added focused React coverage for thinking payload submission and persistence.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run test -- --run Composer.test.tsx` in `frontend/app` passed with 2 tests.
- `npm run lint` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 12 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

## 2026-06-23 Stale Workspace Regression Batch

### Scope
- Added a focused sidebar regression test proving stale stored workspace ids are ignored during new-session creation.
- Covered the non-blocking reviewer follow-up from the session creation pass.

### Verification
- `npm run test -- --run SessionsSidebar.test.tsx` in `frontend/app` passed with 2 tests.
- `npm run test -- --run` in `frontend/app` passed with 13 tests.
- `npm run lint` in `frontend/app` passed.

## 2026-06-23 Runtime Injection Controls Batch

### Scope
- Addressed reviewer `019ef284-18b0-7b53-a3b0-cb41ccb24a04` finding by adding a visible Thinking label and test coverage for it.
- Added React AG-UI client support for `/api/ag-ui/runs/{run_id}/inject`.
- Reused the composer during active runs for real queued and interrupt injections instead of creating a second run.
- Locked run-creation-only controls while an active run is present.
- Added focused React coverage proving Queue and Interrupt call the injection API and do not call run creation.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run test -- --run Composer.test.tsx` in `frontend/app` passed with 4 tests.
- `npm run lint` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 15 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.
