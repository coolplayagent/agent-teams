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

## 2026-06-23 Timeline Copy Answer Batch

### Scope
- Added a compact timeline action for copying the latest non-user answer.
- Disabled copy while the current session still has an open runtime stream to avoid copying stale or unstable output.
- Added React component coverage for clipboard output from hydrated message history.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run test -- --run MessageTimeline.test.tsx` in `frontend/app` passed with 1 test.
- `npm run lint` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 16 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

## 2026-06-23 Session Token Usage Batch

### Scope
- Added React API contracts and client support for `/api/sessions/{session_id}/token-usage`.
- Added a compact session token usage strip above the composer with input, output, total, and force refresh.
- Added focused React coverage for token usage rendering and `force_refresh=true` refresh behavior.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run test -- --run SessionTokenUsage.test.tsx` in `frontend/app` passed with 1 test.
- `npm run lint` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 17 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

## 2026-06-23 Timeline Copy Reviewer Remediation Batch

### Scope
- Addressed reviewer `019ef284-18b0-7b53-a3b0-cb41ccb24a04` finding where closed runtime delta rows could win over hydrated full answers.
- Limited copy-last-answer eligibility to stable hydrated messages until the runtime timeline has a true aggregated answer projection.
- Added focused React regression coverage proving stale runtime chunks do not replace the persisted answer in clipboard output.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run test -- --run MessageTimeline.test.tsx` in `frontend/app` passed with 2 tests.
- `npm run lint` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 18 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

## 2026-06-23 Current Session Indicator Batch

### Scope
- Replaced the hard-coded React topbar title with a current-session indicator backed by the sidebar session query cache.
- Displayed the selected session title or id plus active run status when available.
- Added focused React coverage for title/status rendering and selected-session fallback.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run test -- --run CurrentSessionIndicator.test.tsx` in `frontend/app` passed with 2 tests.
- `npm run lint` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 20 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

## 2026-06-23 Token Usage Refresh Remediation Batch

### Scope
- Addressed reviewer `019ef284-18b0-7b53-a3b0-cb41ccb24a04` finding where token usage only refreshed on mount or manual refresh.
- Invalidated the selected session token usage query when an AG-UI run stream closes.
- Added hook-level React coverage for token usage invalidation on stream close.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run test -- --run RunStreamController.test.tsx` in `frontend/app` passed with 1 test.
- `npm run lint` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 21 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

## 2026-06-23 Composer Model Profile Batch

### Scope
- Added React API contracts and client support for model profile listing and `/api/sessions/{session_id}/normal-model-profile`.
- Added a compact composer model profile selector backed by the selected session record and existing model profile config.
- Kept the saved selected profile visible even when the profile no longer appears in the current config list.
- Added focused React coverage proving model profile changes patch the current session.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run test -- --run Composer.test.tsx` in `frontend/app` passed with 5 tests.
- `npm run lint` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 22 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

## 2026-06-23 Composer Model Profile Reviewer Remediation Batch

### Scope
- Addressed reviewer `019ef2b6-51d7-7e12-8a25-c9f6140ad6ee` finding where the session detail query key could collide with the sidebar cache namespace.
- Namespaced session detail cache entries under `["sessions", "detail", session_id]`.
- Disabled the model profile selector until the selected session record has loaded so an unknown profile value is not briefly treated as Default.
- Added focused React regressions for the `sidebar` session id cache collision and loading-state selector lockout.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run test -- --run Composer.test.tsx` in `frontend/app` passed with 7 tests.
- `npm run lint` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 24 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

## 2026-06-23 Composer Session Topology Batch

### Scope
- Added React API contracts and client support for `/api/system/configs/orchestration` and `/api/sessions/{session_id}/topology`.
- Added compact composer session topology controls for normal versus orchestration mode, normal root role, and orchestration preset.
- Respected backend `can_switch_mode` so started sessions do not expose misleading topology edits.
- Added focused React coverage for orchestration mode switching, normal root role selection, and locked started-session controls.

### Verification
- `npm run typecheck` in `frontend/app` passed.
- `npm run test -- --run Composer.test.tsx` in `frontend/app` passed with 10 tests.
- `npm run lint` in `frontend/app` passed.
- `npm run test -- --run` in `frontend/app` passed with 27 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev ruff check --fix` passed.
- `uv run --extra dev ruff format --no-cache --force-exclude` passed.
- `uv run --extra dev basedpyright` passed.
- `uv run --extra dev pytest -q tests/unit_tests` passed.
- `uv run --extra dev pytest -q tests/integration_tests` passed with 1052 passed and 9 skipped.

## 2026-06-23 Composer Session Topology Reviewer Remediation Batch

### Scope
- Addressed reviewer `019ef2f8-fff2-7700-8b98-d6dbf9c4b3b1` finding where `can_switch_mode` could remain stale after the first run.
- Locked the session detail cache by setting `can_switch_mode` to `false` immediately after run creation succeeds.
- Stored the run-start topology lock in the React Query cache so Composer remounts keep the lock and in-flight stale session detail responses cannot re-enable topology controls.
- Added focused React regressions proving topology controls stay locked after the first run even when `activeRunId` is back to `null` and when stale session detail resolves after run creation.

### Verification
- `npm run test -- --run Composer.test.tsx` in `frontend/app` passed with 12 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

## 2026-06-23 Recovery Resume Action Batch

### Scope
- Aligned the React RecoveryBar standalone Resume action with V1 recovery visibility rules.
- Hid the standalone Resume button while approvals, user questions, paused subagents, local streams, or stopping runs own the recovery path.
- Preserved automatic resume-before-approval behavior only for stopped recoverable runs before resolving approvals.
- Added focused React coverage for standalone resume, approval-owned resume, and already-streaming resume suppression.

### Verification
- `npm run test -- --run RecoveryBar.test.tsx` in `frontend/app` passed with 6 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

## 2026-06-23 Composer Shell Safety Policy Batch

### Scope
- Added the AG-UI run create contract field for `shell_safety_policy_enabled`.
- Added a compact Composer shell safety policy toggle backed by the existing general config endpoint.
- Sent the selected shell safety policy override with new AG-UI run creation requests.
- Avoided sending a shell safety override before general config has loaded so backend defaults remain authoritative.
- Addressed reviewer `019ef33f-233c-7750-a53e-b7c29429b0bb` finding by keeping the Shell safety control disabled when general config fails to load.
- Added focused React coverage proving the Composer control sends the selected override, omits it while config is still loading, and remains disabled on config failure.

### Verification
- `npm run test -- --run Composer.test.tsx` in `frontend/app` passed with 15 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

## 2026-06-23 Recovery Background Task Controls Batch

### Scope
- Added typed React contracts and client support for stopping run background tasks through `/api/runs/{run_id}/background-tasks/{background_task_id}:stop`.
- Added a compact RecoveryBar background task section for active running/blocked background tasks.
- Preserved V1 visibility semantics by hiding terminal background tasks from the active recovery strip.
- Added real Hide/Show collapse behavior while keeping the active task summary visible.
- Added focused React coverage for active task display, terminal task suppression, stop actions, and collapse/expand behavior.

### Verification
- `npm run test -- --run RecoveryBar.test.tsx` in `frontend/app` passed with 8 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer Remediation
- Addressed reviewer `019ef35b-543e-7663-b602-37e95e8e9a39` finding by switching the React stop client from the AG-UI run path to the real `/api/runs/{run_id}/background-tasks/{background_task_id}:stop` endpoint.
- Added `apiClient.test.ts` coverage that asserts the concrete background task stop URL.
- Re-ran `npm run test -- --run apiClient.test.ts RecoveryBar.test.tsx`, `npm run typecheck`, `npm run lint`, and `npm run build` in `frontend/app`.

## 2026-06-23 Session Context Indicator Batch

### Scope
- Extended the React session token usage strip with a real context usage indicator derived from `by_role.latest_input_tokens` and `by_role.context_window`.
- Matched V1's context signal by showing the selected normal root role's latest input against its context window as `input / window`.
- Preserved the compact composer-adjacent layout without adding placeholder controls or fake progress.
- Added focused React coverage for context label refreshes, primary-role selection, and loading/error/missing-window titles.

### Verification
- `npm run test -- --run SessionTokenUsage.test.tsx` in `frontend/app` passed with 3 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer Remediation
- Addressed reviewer `019ef367-7f06-75d3-9d4f-c0b9ff698349` findings by replacing highest-loaded-role selection with explicit `normal_root_role_id`/MainAgent fallback semantics.
- Changed the visible Context value from a percentage to the V1-style `latest input / context window` label.
- Added explicit loading, unavailable, and missing-window title coverage.
- Addressed reviewer `019ef36e-160d-7de2-afa2-792d3c6daa86` finding by rendering `latest input / --` and the V1-style latest-input title when the selected role has no context window.
- Re-ran `npm run test -- --run SessionTokenUsage.test.tsx`, `npm run typecheck`, `npm run lint`, and `npm run build` in `frontend/app`.
- Addressed reviewer `019ef371-9d93-7812-b763-16131dbec0a6` test-gap finding with explicit MainAgent fallback coverage when no primary role is provided.
- Re-ran `npm run test -- --run SessionTokenUsage.test.tsx`, `npm run typecheck`, and `npm run lint` in `frontend/app`.

## 2026-06-23 Recovery Approval Options Batch

### Scope
- Rendered explicit ACP approval options in the React RecoveryBar while preserving the default Approve and Deny controls.
- Mapped ACP allow options to `approve` with `optionId` and reject options to `deny` with `optionId`.
- Kept the default Approve and Deny payloads free of `optionId` so backend ACP default selection remains authoritative.
- Added focused React coverage for explicit ACP option submission and default approval behavior.

### Verification
- `npm run test -- --run RecoveryBar.test.tsx` in `frontend/app` passed with 9 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.
- Reviewer subagent `019ef46c-d1d3-7d33-a6e0-7ad44475f606` returned PASS.
- Committed as `28aa36373 Render recovery approval options`.

## 2026-06-23 Recovery Stream Continuity Refresh Batch

### Scope
- Added explicit recovery query refresh when the React AG-UI run stream starts.
- Added a 10 second continuity refresh interval while a stream remains active.
- Cleared the continuity refresh timer when streams are replaced, manually cleared, closed, or unmounted.
- Preserved stream-close refreshes for messages, sidebar state, recovery, and token usage.
- Added focused hook coverage for start-time refresh, active-stream refresh, close-time timer cleanup, and token usage refresh on stream close.

### Verification
- `npm run test -- --run RunStreamController.test.tsx` in `frontend/app` passed with 2 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.
- Reviewer subagent `019ef473-4994-7483-b51e-9e2a1560706a` returned PASS.

## 2026-06-23 Recovery Paused Subagent Display Batch

### Scope
- Replaced the React recovery snapshot `paused_subagent` contract with an explicit typed shape.
- Rendered a compact RecoveryBar paused-subagent panel from real recovery snapshot state.
- Kept standalone Resume hidden while a paused subagent owns the follow-up path.
- Filtered empty and reserved paused-subagent roles so dirty snapshots do not display MainAgent or Coordinator as blocked subagents.
- Added focused React coverage for paused subagent display and reserved-role filtering.

### Verification
- `npm run test -- --run RecoveryBar.test.tsx` in `frontend/app` passed with 11 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.
- Reviewer subagent `019ef479-689e-7da1-9653-c7f7400bd9c9` returned PASS.

## 2026-06-23 Recovery Interaction Busy And Error States Batch

### Scope
- Added per-tool-call approval error state in the React RecoveryBar.
- Added per-question user question error state in the React RecoveryBar.
- Showed approval and question errors inline while retaining toast notifications.
- Derived approval and question busy state from mutation variables so the active item shows loading and related duplicate actions are temporarily disabled.
- Disabled pending question options and supplemental inputs while their answer submission is in flight.
- Added focused React coverage for approval retry error clearing and question busy/error behavior.

### Verification
- `npm run test -- --run RecoveryBar.test.tsx` in `frontend/app` passed with 13 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.
- Reviewer subagent `019ef481-f383-7233-9caf-17baf53f252a` returned PASS.

## 2026-06-23 Composer Voice Input Batch

### Scope
- Added React speech config and STT WebSocket client helpers for the existing `/api/speech/config` and `/api/speech/stt/stream` backend.
- Added a focused Composer voice input hook that captures microphone audio, streams PCM16 frames to the STT WebSocket, and writes `delta`/`completed` transcription text into the prompt at the captured selection.
- Added the Composer voice button with V1-aligned visibility: hidden when speech is not configured, disabled when configured but browser/runtime/session state is unavailable, and active while listening/transcribing.
- Preserved manual prompt edits by stopping voice input and ignoring late transcription events after user typing.
- Cleared pre-ready audio when the server reports a different STT sample rate.
- Kept the Composer component thin by putting audio/WebSocket lifecycle in `useVoiceInput.ts`.

### Verification
- `npm run test -- --run src/test/Composer.test.tsx` in `frontend/app` passed with 43 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.
- Browser visual comparison captured V1 and V2 desktop/mobile screenshots under `.tmp/frontend-v2-visual/`.
- Visual comparison found broader V2 framework gaps to address next, especially disabled default composer state, language mismatch, and mobile sidebar/composer layout; these were intentionally left for the next framework-first pass per the updated goal.

### Reviewer Remediation
- Reviewer subagent `019ef490-c8d1-7c00-9ec8-244f410afc49` flagged late transcript overwrite, lost prompt selection after focusing the voice button, and pre-ready sample-rate mismatch.
- Addressed all three findings with focused code paths and regression coverage.
- Browser screenshot comparison found the unconfigured voice button was visible in V2 while hidden in V1; changed the React button to hide when speech is not configured and added coverage.
- Addressed the follow-up reviewer finding where Ant Design `loading` made the connecting voice button unclickable; connecting remains cancellable, unopened sockets close immediately, and focused coverage verifies both unopened and open-but-not-ready stop paths.

## 2026-06-23 App Shell Fixed Viewport Layout Batch

### Scope
- Locked the React shell to a single viewport-height application frame instead of allowing chat content to grow the document.
- Moved scrolling responsibility into the message timeline and session list so workspace/session navigation no longer scrolls with the page.
- Added width and height constraints for the Ant Design `App` wrapper so the shell fills the browser rather than shrinking to content.
- Added a keyboard-accessible sidebar resize separator backed by the existing `sidebarWidth` UI state.
- Tightened sidebar session row density by showing active run status only when present instead of rendering normal-mode metadata on every row.

### Verification
- Browser comparison captured V1 desktop reference, V2 before, V2 after desktop, V2 after mobile, and V2 after collapsed-mobile screenshots under `.tmp/frontend-v2-framework/`.
- V1 desktop reference: document scroll height matched viewport height at `1272 / 1272` and body overflow was hidden.
- V2 before fix: desktop document scroll height was `4581` for a `1272` viewport, and mobile document scroll height was `4872` for an `844` viewport.
- V2 after fix: desktop document scroll height matched viewport height at `1272 / 1272`; mobile document scroll height matched viewport height at `844 / 844`.
- V2 after reviewer remediation: mobile document/body/shell/topbar/workspace/composer scroll width all matched the `390` viewport, with no document-level horizontal overflow.
- Browser scroll verification showed sidebar wheel scrolling changed only `.at-session-list.scrollTop` from `0` to `700`, while body/document scroll stayed `0`; timeline wheel scrolling changed only `.at-timeline.scrollTop` from `3309` to `2609`.
- `npm run test -- --run src/test/AppShell.test.tsx` in `frontend/app` passed with 2 tests.
- `npm run test -- --run src/test/SessionsSidebar.test.tsx` in `frontend/app` passed with 3 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer Remediation
- Reviewer subagent `019ef4bb-eef3-71d3-a24c-e0497567b767` returned FAIL for mobile horizontal overflow and overly thin sidebar status affordance.
- Fixed mobile overflow by constraining the shell, workspace, composer controls, select widths, and compact topbar spacing under the narrow breakpoint.
- Restored compact session metadata using real sidebar fields for active run status, background tasks, pending approvals/questions, and relative update time without returning to bulky mode tags.
- Added focused sidebar coverage for compact status, background work, pending approval/question, and update time rendering.
- Reviewer subagent `019ef4bb-eef3-71d3-a24c-e0497567b767` re-reviewed the remediation and returned PASS.

## 2026-06-23 Sidebar Workspace Grouping Batch

### Scope
- Replaced the React sidebar's flat session list with V1-aligned workspace groups.
- Kept each workspace header interactive so selecting a session from another workspace updates both selected workspace and selected session state.
- Preserved a fixed one-page shell by keeping workspace and document scrolling locked while the session list owns its own scroll.
- Kept search useful by matching both session labels and workspace labels, while hiding empty workspace groups during filtered searches.
- Preserved workspace display names and path hints for filtered workspace groups instead of falling back to raw workspace ids.

### Verification
- Browser comparison captured V1 sidebar reference and V2 desktop/mobile screenshots under `.tmp/frontend-v2-sidebar/`.
- V2 desktop verification at `1248x679` showed body and document scroll heights both matched viewport height at `679`, while `.at-session-list` owned the long scroll (`14327` scroll height).
- V2 mobile emulation at `390x844` showed body/document/shell scroll width and height matched the viewport with no page-level overflow; `.at-session-list` remained the only long scroll area.
- `npm run test -- --run src/test/SessionsSidebar.test.tsx` in `frontend/app` passed with 5 tests.
- `npm run test -- --run` in `frontend/app` passed with 124 tests after stabilizing two existing Composer model-profile wait assertions.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Reviewer subagent `019ef4d2-7fb8-7701-8415-5f401c3f436e` returned PASS.
- Followed up on the reviewer test-gap note by adding explicit coverage for workspace-label search and filtered empty-group suppression.

## 2026-06-23 Sidebar Session Label Parity Batch

### Scope
- Added React frontend contract support for sidebar session `metadata` returned by the backend.
- Reused the V1 session label priority of metadata `title`, `name`, then `label` before falling back to legacy title and session id.
- Shared the label resolver between the sidebar rows and the topbar current-session indicator so both surfaces show the same human-readable session name.
- Preserved session id fallback for records that have no usable metadata/title.

### Verification
- Browser comparison captured the V1 reference and stable V2 after screenshots under `.tmp/frontend-v2-session-labels/`.
- V1 reference labels from the same local data included `你好啊`, `新会话`, `你好`, and `Use OpenSpec to draft a proposal for this change.`.
- V2 after verification showed the selected session label as `你好啊` and the first visible labels matched metadata/prompt titles instead of raw ids, with only one raw `session-*` fallback among the first eighteen visible sessions.
- Browser verification also surfaced a remaining framework blocker for the next pass: large workspace groups and chat scroll behavior still need a framework-first layout review against V1 rather than detail-only polish.
- Stable V2 after screenshot had server health `ok`, zero skeleton placeholders, selected label `你好啊`, and one raw `session-*` fallback among the first eighteen visible sessions.
- `npm run test -- --run src/test/sessionLabels.test.ts src/test/SessionsSidebar.test.tsx src/test/CurrentSessionIndicator.test.tsx` in `frontend/app` passed with 9 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Reviewer subagent `019ef4ef-00f8-7fa1-b831-d460e1cd6bfd` returned PASS.
- Followed up on the reviewer test-gap note by adding explicit coverage for metadata `name`, metadata `label`, and fallback behavior.

## 2026-06-23 Framework Layout Recheck Batch

### Scope
- Rechecked V1 and V2 with real browser screenshots before editing, focusing on the high-level workspace/session/chat frame instead of detail polish.
- Limited each V2 workspace sidebar group to the first ten sessions by default, with an explicit per-workspace `Show more` action that expands in batches.
- Kept search results complete while preventing large unfiltered workspaces from rendering hundreds of session rows into the sidebar.
- Centered the V2 timeline virtual content and composer contents into stable working columns closer to V1's visual structure.
- Kept the fixed single-page shell while preserving timeline-owned scrolling and sidebar-owned scrolling.

### Verification
- Browser baseline screenshots captured V1 desktop, V2 desktop before, and V2 mobile before under `.tmp/frontend-v2-framework-round2/`.
- V2 desktop before showed `.at-session-list` at `1124` client height and `14482` scroll height because `default` rendered 343 sessions at once.
- V2 desktop after screenshot showed `.at-session-list` at `1124` client height and `1124` scroll height, with `Show more 10/343` and `Show more 10/41` controls.
- V2 desktop after centered the timeline virtual column at `760px` width and the composer inner column at `920px` width.
- Browser wheel verification showed timeline scrolling changed `.at-timeline.scrollTop` from `3309` to `2609` while document/body and session list scroll stayed at `0`.
- V2 mobile before showed `.at-session-list` at `696` client height and `14482` scroll height.
- V2 mobile after showed document/body dimensions still locked to the `390x844` viewport, and `.at-session-list` reduced to `696` client height and `1074` scroll height.
- `npm run test -- --run src/test/SessionsSidebar.test.tsx src/test/Composer.test.tsx src/test/AppShell.test.tsx` in `frontend/app` passed with 51 tests.
- Follow-up `npm run test -- --run src/test/SessionsSidebar.test.tsx` in `frontend/app` passed with 7 tests after adding search uncapped coverage.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Reviewer subagent `019ef501-d543-73d0-99b6-9ffd797bf55f` returned PASS.
- Followed up on the reviewer test-gap note by adding explicit coverage that filtered workspace results remain uncapped beyond ten sessions.

## 2026-06-23 Workspace Group Collapse Batch

### Scope
- Split each V2 workspace header into a dedicated expand/collapse control and a separate title selection target, matching the V1 sidebar interaction shape more closely.
- Added per-workspace expanded state with `aria-expanded` and explicit `Collapse`/`Expand` labels for keyboard and screen-reader affordance.
- Kept search results visible by forcing matching workspace groups open while filtering, even if the group was collapsed before the search.
- Preserved the existing capped unfiltered group rendering while letting filtered results remain complete.

### Verification
- Browser screenshots captured expanded, collapsed, search-expanded, and mobile states under `.tmp/frontend-v2-workspace-collapse/`.
- V2 desktop verification at `1248x679` showed body and document scroll dimensions locked to the viewport, while `.at-session-list` owned its own scroll.
- Expanded desktop state showed `default` rendered ten visible session rows; collapsed desktop state showed `default` at `aria-expanded=false` with zero rendered session rows.
- Collapsing `default` reduced `.at-session-list` scroll height from `1073` to `672`.
- Searching for `连续修复验证` after collapse forced `default` back to `aria-expanded=true` and rendered all `70` matching sessions.
- Mobile verification at `390x844` kept body and document dimensions locked to the viewport while `.at-session-list` remained the long scroll area.
- `npm run test -- --run src/test/SessionsSidebar.test.tsx` in `frontend/app` passed with 8 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Reviewer subagent `019ef50d-593e-71f0-956f-de50c07567fd` returned PASS.

## 2026-06-23 Round Rail Framework Batch

### Scope
- Rechecked V1 and V2 with real browser screenshots before editing, focusing on the main workspace frame rather than detail polish.
- Added a V1-style right-side round/history rail to the React message timeline on desktop using the real `/sessions/{id}/rounds` API.
- Associated timeline rows with rounds even when hydrated message records do not carry `run_id`, using round message ids, matching timestamps, and round-created-at boundaries.
- Made round rail buttons real navigation controls that jump the virtualized timeline to the selected run and expose `aria-current`.
- Kept the round rail hidden on narrow viewports so mobile keeps the fixed one-page shell without adding horizontal pressure.

### Verification
- Browser comparison captured V1 desktop/mobile baselines, V2 before, and V2 after screenshots under `.tmp/frontend-v2-framework-round3/`.
- V1 desktop reference showed the existing right-side round/history rail at about `128px` wide beside the chat timeline.
- V2 desktop after showed `.at-timeline-frame` at `968px` wide with `.at-timeline` at `836px` and `.at-round-rail` at `132px`, matching the V1 two-column workspace structure more closely.
- V2 desktop after loaded `2` real round rail buttons from the rounds API: `Go to round 1: 你好啊` and `Go to round 2: ？`.
- Browser click verification changed the virtualized timeline from later-round rows to first-round rows, with visible rows carrying run id `88bd0682-8533-4232-bb84-193370a741fb` and the first rail item marked `aria-current=step`.
- Desktop and mobile verification kept body and document scroll dimensions locked to their viewports (`1248x679` and `390x844`).
- Mobile verification kept `.at-round-rail` at `display: none` and `.at-timeline-frame` at `390px` width.
- `npm run test -- --run src/test/MessageTimeline.test.tsx` in `frontend/app` passed with 34 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Reviewer subagent `019ef51d-8168-7b61-abd4-b29531f17e1c` returned FAIL because the first click artifact briefly showed round 1 rows while `aria-current` still pointed at round 2, and the unit test clicked the default-active round 2 instead of proving a round change.
- Fixed the active-round race by keeping a pending clicked run id while virtualized rows catch up, so scroll listeners cannot overwrite the user's selected round with stale viewport state.
- Strengthened the unit test to verify the default active round 2 state, click back to round 1, and assert round 1 becomes `aria-current=step` while round 2 clears.
- Browser re-verification replaced the click artifact: after clicking `Go to round 1: 你好啊`, timeline `scrollTop` moved from `3902` to `0`, the first visible rows carried run id `88bd0682-8533-4232-bb84-193370a741fb`, and round 1 was marked `aria-current=step`.
- Reviewer subagent `019ef51d-8168-7b61-abd4-b29531f17e1c` re-reviewed the remediation and returned PASS.
