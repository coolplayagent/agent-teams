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

## 2026-06-23 Round Marker Timeline Batch

### Scope
- Rechecked V1 and V2 timeline screenshots before editing, focusing on round segmentation inside the main chat area.
- Added V2 timeline round marker rows before each run's first hydrated message using the real rounds API data.
- Typed the existing rounds payload usage fields so markers can show real input tokens, output tokens, tool count, run status, and run duration.
- Shared round title and time formatting between the right-side round rail and the main timeline markers.
- Kept the virtualized timeline, scroll anchors, and rail navigation aligned by treating marker rows as first-class timeline rows with run ids.

### Verification
- Browser comparison captured V1 baseline, V2 before, V2 after, V2 clicked-round, and V2 mobile screenshots under `.tmp/frontend-v2-round-markers/`.
- V1 baseline showed each round with visible timestamp, token/tool/status metadata, and intent text while V2 before showed only raw message rows.
- V2 after clicking round 1 showed two real marker rows: round 1 `20:42:33 Input 11.0k Output 35 completed 6s 你好啊` and round 2 `20:43:04 Input 88.2k Output 635 Tools 8 completed 18s ？`.
- Browser click verification kept the round rail and main timeline synchronized: round 1 was `aria-current=step`, timeline `scrollTop` was `0`, and first visible message rows carried run id `88bd0682-8533-4232-bb84-193370a741fb`.
- Desktop and mobile verification kept body and document scroll dimensions locked to their viewports (`1248x679` and `390x844`), with the rail still hidden on mobile.
- `npm run test -- --run src/test/MessageTimeline.test.tsx` in `frontend/app` passed with 34 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Reviewer subagent `019ef530-f88e-7ea0-b45f-44b926f0bda6` first returned FAIL because marker duration used `created_at` instead of `run_started_at`, and persisted messages ignored backend `trace_id` before falling back to timestamp matching.
- Fixed duration to use `run_started_at ?? created_at` through `run_updated_at`, typed `TimelineMessage.trace_id`, and made `messageRunId` prefer `run_id`/`trace_id` before lookup fallbacks.
- Strengthened the timeline test with messages that have `trace_id` but no `created_at`, plus a queued-round case where `created_at` is earlier than `run_started_at` and the marker must show `6s`.
- Browser re-verification after the fix captured `v2-desktop-after-review-fix.png`, `v2-mobile-after-review-fix.png`, and `v2-mobile-top-after-review-fix.png`; desktop and mobile still kept page-level dimensions locked while marker rows rendered real round metadata.
- Reviewer subagent `019ef530-f88e-7ea0-b45f-44b926f0bda6` re-reviewed the remediation and returned PASS.

## 2026-06-24 Sidebar Primary Navigation Batch

### Scope
- Rechecked the real V1 and V2 browser surfaces before editing, focusing on the sidebar and shell-level page framing rather than small component polish.
- Added a V1-shaped primary navigation block to the V2 sidebar between `New session` and the session/workspace list.
- Wired only real V2 surfaces and actions into that block: Chat, Search, Observability, and Settings.
- Avoided adding fake V1-only destinations such as Skills, Automation, Connectors, Boards, or Memory until those screens exist as real V2 product surfaces.
- Added a `Workspaces` section header above the existing session search and workspace/session groups so the sidebar has the same high-level hierarchy as V1.
- Made the Search navigation item and `Ctrl/Cmd+K` focus the existing session search box instead of opening a placeholder screen.
- Kept Settings as a drawer action while leaving the active page indicator on the current shell surface.

### Verification
- Browser comparison captured V1 desktop/mobile baselines, V2 before, and V2 after screenshots under `.tmp/frontend-v2-next-framework/`.
- V1 desktop reference showed the sidebar hierarchy as top action, primary product navigation, then `工作空间`; V2 before went directly from `New session` to `Search sessions` and session groups.
- V2 desktop after showed `New session`, Chat/Search/Observability/Settings navigation, then `Workspaces` and the existing session search/workspace list.
- Browser DOM checks verified exactly one primary navigation, one Search action, one Observability action, one Chat action, and one Settings action.
- Browser click checks verified Search focuses the `Search sessions` input, Observability switches to the observability panel and removes the timeline, Chat restores the timeline, and Settings opens the settings drawer.
- Desktop and mobile verification kept body and document scroll dimensions locked to their viewports (`1248x679` and `390x844`), preserving the one-page shell while the timeline/sidebar own internal scroll.
- `npm run test -- --run src/test/SessionsSidebar.test.tsx src/test/AppShell.test.tsx` in `frontend/app` passed with 12 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Reviewer subagent `019ef543-cef5-7621-ab38-9fb205da04a8` returned PASS with no blocking findings and reran the targeted sidebar/AppShell tests successfully.

## 2026-06-24 Workspace Project View Framework Batch

### Scope
- Rechecked the real V1 and V2 browser surfaces before editing, focusing on the workspace/project shell rather than isolated component details.
- Added a real V2 workspace project view reachable from the Workspaces sidebar header.
- Wired the project view to existing backend APIs for workspace list, snapshot, diffs, and open-root actions instead of adding placeholder destinations.
- Rendered the selected workspace root, default mount, root entries, workspace changes, and workspace sessions in a fixed-height project surface whose scroll stays inside the app frame.
- Kept session rows actionable: choosing a workspace session updates selected workspace/session state and returns to chat.
- Added explicit shown/total counts plus `Show all` / `Show fewer` controls for capped project lists so large changes and session lists are reachable instead of silently truncated.

### Verification
- Browser comparison captured V1/V2 before screenshots and V2 after screenshots under `.tmp/frontend-v2-shell-next/`.
- V2 default project view screenshots captured `v2-desktop-workspace-top-after.png` and `v2-mobile-workspace-top-after.png`.
- Default desktop verification showed body and document scroll dimensions locked to the `1248x679` viewport while `.at-project-view-grid` owned internal scrolling.
- Default mobile verification showed body and document scroll dimensions locked to the `390x844` viewport with the sidebar closed and `.at-project-view` at `390x792`.
- Default project counts showed `2/2` files, `12/37` changes, and `12/343` sessions, with `Show all changes` and `Show all sessions` available.
- Expanded verification showed `37` rendered change rows and `343` rendered session rows, with headers at `37/37` and `343/343` while body/document scroll heights still matched the viewport.
- `npm run test -- --run src/test/SessionsSidebar.test.tsx src/test/AppShell.test.tsx src/test/WorkspaceProjectView.test.tsx src/test/apiClient.test.ts` in `frontend/app` passed with 19 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Reviewer subagent `019ef553-c160-7ee2-b2b9-d8e675a5341d` returned FAIL because the initial project view silently capped root entries, changes, and sessions without an obvious path to the hidden rows.
- Fixed the blocking finding by adding explicit shown/total counts and per-list reveal controls.
- Added targeted coverage proving more than twelve changes and sessions are initially capped, can be expanded through real buttons, and that the later session can be selected.

## 2026-06-24 Shell Language Parity Batch

### Scope
- Rechecked the real V1 and V2 browser surfaces before editing, focusing on shell-level parity rather than isolated detail polish.
- Added a typed V2 i18n dictionary and translation hook for the persistent shell, sidebar, composer, timeline, round rail, export menu, token usage, observability panel, settings drawer, and workspace project view.
- Made the default language follow an existing stored preference first, then the browser language, so Chinese users see a Chinese V2 shell without manually toggling every session.
- Disabled Ant Design's automatic two-character Chinese button spacing at the V2 provider level so labels such as `中文` and `发送` render normally.
- Preserved established English labels where tests and product behavior relied on them, including `Target role` and round marker `Tools 1`.

### Verification
- Browser comparison captured V1/V2 before screenshots under `.tmp/frontend-v2-next-round/`.
- V2 after screenshots were captured under `.tmp/frontend-v2-language-parity/`: `v2-zh-desktop-after.png`, `v2-zh-mobile-after.png`, and `v2-zh-project-desktop-after.png`.
- Desktop chat verification showed the persistent frame in Chinese: `新建会话`, `工作空间`, `提示词`, `目标角色`, `思考`, `Shell 安全`, `发送`, timeline `工具错误`, and round rail `轮次`.
- Desktop chat metrics kept body and document scroll heights equal to the viewport while the composer stayed fixed at the bottom of the workspace.
- Mobile chat metrics kept body and document scroll heights equal to the `390x844` viewport; the sidebar session list owned the long scroll (`scrollHeight=1073`, `overflowY=auto`).
- Project view verification showed Chinese workspace labels (`工作区项目视图`, `打开文件夹`, `文件`, `变更`, `会话`) and kept body/document fixed while `.at-project-view-grid` owned internal scrolling.
- Residual large-frame follow-up: the mobile screenshot still shows the desktop sidebar width squeezing the main workspace instead of switching to a proper mobile drawer/overlay. Treat this as the next framework issue before detail polish.
- `npm run test -- --run src/test/AppShell.test.tsx src/test/SessionsSidebar.test.tsx src/test/Composer.test.tsx src/test/WorkspaceProjectView.test.tsx src/test/MessageTimeline.test.tsx src/test/MessageExportMenu.test.tsx src/test/SessionTokenUsage.test.tsx` in `frontend/app` passed with 104 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this language parity slice. No subsystem completion is claimed from this batch; the mobile sidebar/workspace framing issue remains the next required framework pass.

## 2026-06-24 Mobile Sidebar Framing Batch

### Scope
- Rechecked V1 and V2 in a real `390x844` mobile viewport before editing, focusing on the large-frame sidebar/workspace behavior called out in the previous batch.
- Changed narrow viewports so the V2 sidebar auto-collapses when entering mobile width, letting the chat/workspace surface occupy the full viewport by default.
- Kept the menu button as the mobile entry point; when opened, the sidebar now renders as an overlay drawer whose Ant Design Sider flex width is `0`, so it no longer reserves layout space.
- Added a simple click-outside scrim and Escape handling to close the mobile sidebar.
- Closed the mobile sidebar automatically when selecting Chat, Observability, a session, or the workspace project view, so the chosen workspace surface is immediately visible.

### Verification
- Captured V1/V2 mobile before screenshots under `.tmp/frontend-v2-mobile-shell/`: `v1-mobile-reference.png` and `v2-mobile-before.png`.
- Captured V2 mobile after screenshots under `.tmp/frontend-v2-mobile-shell/`: `v2-mobile-after-closed.png`, `v2-mobile-after-open.png`, and `v2-mobile-project-after-settled.png`.
- Closed-state mobile metrics showed no sidebar or scrim present, body/document scroll heights fixed to the `390x844` viewport, and `.at-workspace` at `x=0`, `width=390`.
- Open-state mobile metrics showed the Sider itself at `width=0`, `flex=0 0 0px`, the drawer children at `width=320`, a scrim present, and `.at-workspace` still at `x=0`, `width=390`.
- Closing through the scrim removed both the sidebar and scrim.
- Mobile project-view verification showed sidebar and scrim removed after choosing the workspace view, `.at-project-view` at `width=390`, and `.at-project-view-grid` owning internal scrolling (`overflowY=auto`, `scrollHeight=950`, `clientHeight=690`).
- `npm run test -- --run src/test/AppShell.test.tsx` in `frontend/app` passed with 6 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this mobile framing slice. No subsystem completion is claimed from this batch; broader Application Shell completion still needs reviewer sign-off and remaining shell checklist coverage.

## 2026-06-24 Shell Fixed Workspace Layout Batch

### Scope
- Rechecked V1 and V2 in the real browser after the user-reported framework screenshot, focusing on page-level scroll ownership and workspace proportions before moving back to detail parity work.
- Split the V2 chat surface into an explicit `.at-chat-view` fixed grid inside the workspace container, so the content area is a one-page shell and the timeline owns chat scrolling.
- Changed `.at-workspace` from a grid surface into a fixed flex container that hosts full-height shell views without leaking row rules into workspace/project pages.
- Moved the round rail to an absolute right-side overlay inside the timeline frame, so it no longer consumes a layout column from the chat timeline.
- Rebuilt the workspace project grid into a full-height three-column/two-row work surface instead of min-content cards that left the bottom of the page empty.
- Made each project panel a fixed flex column with its own scrollable list/body, keeping sidebar sessions and workspace sessions independent from page scroll.

### Verification
- Browser comparison captured V1 reference, V2 before, V2 after chat, V2 after workspace, settled workspace, and mobile workspace screenshots under `.tmp/frontend-v2-shell-layout/`.
- V1 reference showed body/document fixed to the `1269x1272` viewport, sidebar fixed at `280x1220`, and only `#chat-messages` owning chat scroll.
- V2 before showed the workspace project view as min-content cards with the session panel only `183px` high, leaving the remaining work area visually unused.
- V2 after chat metrics showed body/document scroll heights fixed at `1272`, `.at-chat-view` fixed at `1220px`, `.at-workspace` fixed at `1220px`, and only `.at-timeline` using `overflowY=auto`.
- V2 settled workspace metrics showed body/document scroll heights fixed at `1272`, `.at-project-view-grid` fixed at `1150px`, the sidebar `.at-session-list` independently scrollable, and the workspace `.at-project-session-list` independently scrollable.
- Mobile workspace verification at `390x844` kept body/document fixed while `.at-project-view-grid` owned internal scrolling (`clientHeight=690`, `scrollHeight=780`, `overflowY=auto`).
- `npm run test -- src/test/AppShell.test.tsx` in `frontend/app` passed with 6 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this framework layout slice. No subsystem completion is claimed from this batch; the next pass should keep using screenshot-first V1/V2 comparison before polishing smaller UI details.

## 2026-06-24 Settings Framework Parity Batch

### Scope
- Rechecked V1 and V2 settings screenshots before editing so the change started from the real UI gap rather than isolated component assumptions.
- V1 showed a centered settings modal with a left tablist covering Appearance, General, Model, MCP, Plugins, Commands, Hooks, Agent Runtime, Roles, Orchestration, Web, Proxy, Remote Workspaces, and Environment Variables.
- V2 before this batch only exposed the Shell safety switch in a narrow right drawer, so the settings surface was not a framework-level match.
- Replaced the drawer body with a V2 settings center using left navigation on desktop and horizontal navigation on mobile.
- Added only real wired sections: Appearance uses the existing local theme/language store, General saves the real general config, Models reads model profiles, Roles reads role config options, Orchestration reads orchestration config, and System reads health.
- Avoided adding fake pages for V1 settings areas that are not yet API-backed in V2, including MCP, plugins, commands, hooks, web, proxy, remote workspaces, and environment variables.

### Verification
- Browser comparison screenshots were captured under `.tmp/frontend-v2-settings-framework/`: `v1-settings-reference.png`, `v2-settings-before.png`, `v2-settings-after-appearance.png`, `v2-settings-after-models.png`, `v2-settings-after-system.png`, and `v2-settings-after-mobile-fixed.png`.
- Models verification rendered five real profile rows and the default profile `deepseek-deepseek-v4-flash`.
- System verification rendered health status `ok`, version `0.1.0`, and two health components.
- Desktop metrics kept body and document scroll heights fixed at the `1269x1272` viewport, with the settings center capped at `960px`.
- Mobile metrics kept body and document scroll heights fixed at the `390x844` viewport, with the settings navigation fixed to a compact horizontal strip and the content owning internal scroll.
- `npm run test -- src/test/SettingsDrawer.test.tsx` in `frontend/app` passed with 3 tests.
- `npm run test -- src/test/AppShell.test.tsx src/test/SettingsDrawer.test.tsx` in `frontend/app` passed with 9 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this settings framework slice. No Settings subsystem completion is claimed from this batch; remaining V1 settings tabs still need real API-backed implementation and reviewer coverage.

## 2026-06-24 Settings Web And Notifications Forms Batch

### Scope
- Rechecked V1 settings in the real browser before editing, focusing on the V1 Web tab and the notification controls embedded in the V1 General tab.
- Confirmed V2 before this batch had no Web or Notifications settings entries after the settings framework pass.
- Added typed V2 API contracts and client methods for `/api/system/configs/web` and `/api/system/configs/notifications`.
- Added a real Web settings section backed by the existing backend config: Exa provider, Exa API key input, SearXNG fallback toggle, SearXNG instance URL, built-in instance display, and save through the real Web config endpoint.
- Preserved an existing Exa API key when the key field is left blank, preventing an empty form save from clearing the persisted secret.
- Added a real Notifications settings section backed by the existing notification config endpoint, covering tool approval requested, run completed, run failed, and run stopped.
- Preserved hidden notification delivery channels such as Feishu while allowing the V2 form to edit browser and Toast delivery channels.
- Split the new setting forms into focused components instead of continuing to append all settings behavior to the main settings center file.

### Verification
- Browser comparison screenshots were captured under `.tmp/frontend-v2-settings-forms/`: `v1-web-settings.png`, `v1-general-notifications.png`, `v2-settings-before-web-notifications.png`, `v2-web-settings-after.png`, `v2-notifications-settings-after.png`, and `v2-notifications-settings-mobile-after.png`.
- V1 Web reference showed Exa, optional Exa API key, SearXNG fallback, SearXNG URL, built-in instances, provider site, and a real save action.
- V1 General reference showed speech and notification controls; this batch covered the notification subset and left speech as remaining Settings parity work.
- V2 Web verification loaded the real SearXNG URL `https://search.mdosch.de/` and three built-in SearXNG instances from the backend.
- V2 Notifications verification rendered four real notification rows from backend state.
- Desktop metrics kept body and document scroll heights fixed at the `1269x1272` viewport while Web and Notifications content stayed inside the settings frame.
- Mobile metrics at `390x844` kept body/document fixed, kept the settings nav as horizontal scroll (`overflowX=auto`), and made the settings content own vertical scroll (`overflowY=auto`, `scrollHeight=866`, `clientHeight=672`).
- Browser console verification returned no errors after opening the new sections.
- `npm run test -- src/test/SettingsDrawer.test.tsx src/test/apiClient.test.ts` in `frontend/app` passed with 10 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this settings forms slice. No Settings subsystem completion is claimed from this batch; speech, proxy, workspace, environment variables, MCP, plugins, hooks, commands, roles editing, orchestration editing, model profile editing, agent runtime, GitHub, Clawhub, and reviewer sign-off remain open.

## 2026-06-24 Settings Speech Form Batch

### Scope
- Rechecked the real V1 and V2 settings surfaces before editing, focusing on the Speech-to-text controls in the V1 General tab.
- V1 showed STT Config, Language, and Prompt controls, with the real candidate `alibaba-cn-qwen3-omni-flash (qwen3-omni-flash)` available from the current backend state.
- V2 before this batch had Web and Notifications entries but no Speech settings entry, leaving the V1 General speech subset uncovered.
- Added a real V2 Speech settings section backed by `/api/speech/config` and `/api/system/configs/model/profiles`.
- Filtered STT profile candidates from real model profile metadata, keeping OpenAI-compatible realtime/audio-input profiles and excluding the diarization-only realtime profile.
- Saved STT profile, language, and prompt through `PUT /api/speech/config`, while preserving existing VAD and noise-reduction fields returned by the backend.
- Added localized labels for the Speech section and split the implementation into a focused settings component instead of expanding the settings center file.

### Verification
- Browser comparison screenshots were captured under `.tmp/frontend-v2-settings-speech/`: `v1-general-speech.png`, `v2-settings-before-speech-settled.png`, `v2-speech-settings-after.png`, and `v2-speech-settings-mobile-after.png`.
- Desktop V2 verification rendered the real `alibaba-cn-qwen3-omni-flash (qwen3-omni-flash)` option, Auto language default, Prompt textarea, and Save action.
- Desktop metrics kept body and document scroll heights fixed to the viewport, with the shell and settings frame fixed rather than letting chat or session lists move page scroll.
- Mobile metrics at `390x844` kept body/document fixed, kept the settings navigation as horizontal scroll, and rendered the Speech controls without losing the STT option.
- Browser console check found only pre-existing issues from the main session search box and composer lacking `id/name`, plus the existing `/favicon.ico` 404; the new Speech selects expose `id` and `name`.
- While validating mobile, a narrow top-bar mis-tap could hit the V1 link near the settings button. Treat the compact mobile top bar as the next framework issue before detail polish.
- `npm run test -- src/test/SettingsDrawer.test.tsx src/test/apiClient.test.ts` in `frontend/app` passed with 11 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this settings speech slice. No Settings subsystem completion is claimed from this batch; proxy, workspace, environment variables, MCP, plugins, hooks, commands, roles editing, orchestration editing, model profile editing, agent runtime, GitHub, Clawhub, compact mobile top bar, and reviewer sign-off remain open.

## 2026-06-24 Mobile Topbar Overflow Batch

### Scope
- Rechecked V1 and V2 in the real browser at a `390x844` mobile viewport before editing, focusing on the compact top-bar problem found during the previous settings verification.
- V1 stable reference showed the migration entry to the new interface plus language, observability, export, settings, and theme controls spread across the mobile header.
- V2 before this batch added health and the V1 migration link to the same row, placing Settings, theme, health, and V1 in a cramped cluster at the right edge.
- Changed V2 mobile only: the header now keeps Sidebar, Settings, and More actions as direct touch targets, while Language, Observability, Export HTML, Export PNG, theme toggle, server-status refresh, and V1 live inside the More actions menu.
- Kept desktop behavior unchanged, preserving the direct top-bar actions on wider viewports.
- Extracted the message-export action controller so the mobile overflow menu triggers the same real HTML/PNG export path as the desktop export button.

### Verification
- Browser comparison screenshots were captured under `.tmp/frontend-v2-mobile-header/`: `v1-mobile-header-reference.png`, `v2-mobile-header-before.png`, `v2-mobile-header-after.png`, `v2-mobile-header-menu-after.png`, and `v2-desktop-header-after.png`.
- V2 before metrics at `390x844` showed eight header actions, including Settings at `x=277`, theme at `x=304`, health at `x=331`, and V1 at `x=358`.
- V2 after metrics at `390x844` showed only three header actions: sidebar toggle, Settings at `x=333`, and More actions at `x=360`; V1 no longer appears as a direct top-bar link.
- Mobile More actions menu verification rendered real entries for language, observability, `导出消息 (HTML)`, `导出消息 (图片)`, theme, `服务状态: ok`, and V1.
- Body and document scroll heights remained fixed to the mobile viewport before and after opening the menu.
- Desktop verification at `1248x679` kept the existing direct top-bar actions for language, observability, export, settings, theme, health, and V1, with body/document fixed to the viewport.
- Browser console verification returned no warnings or errors after the built V2 page was loaded and checked.
- `npm run test -- src/test/AppShell.test.tsx src/test/MessageExportMenu.test.tsx` in `frontend/app` passed with 11 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this mobile top-bar framework slice. No Application Shell completion is claimed from this batch; subsystem reviewer sign-off and the remaining parity checklist are still open.

## 2026-06-24 Settings Proxy Form Batch

### Scope
- Rechecked the real V1 and V2 settings surfaces in the browser before editing, focusing on the V1 Proxy tab instead of inferring the UI from source code alone.
- V1 Proxy showed HTTP proxy, HTTPS proxy, ALL proxy, username, password, NO_PROXY, default SSL verification, target URL, timeout, Test URL, and Save controls.
- V2 before this batch had Web and System settings entries but no Proxy settings entry.
- Added typed V2 API contracts and client methods for `/api/system/configs/proxy`, `/api/system/configs/proxy:reload`, and `/api/system/configs/web:probe`.
- Added a real Proxy settings section backed by the existing backend config and probe endpoint.
- Preserved saved proxy passwords when the password field is left blank, preventing a routine save or probe from clearing the persisted secret.
- Added pre-save connectivity testing that sends the current form values as `proxy_override`.

### Verification
- Browser comparison screenshots were captured under `.tmp/frontend-v2-settings-proxy/`: `v1-proxy-settings.png`, `v2-settings-before-proxy.png`, `v2-proxy-settings-after.png`, and `v2-proxy-settings-mobile-after.png`.
- Desktop V2 verification rendered Proxy navigation plus HTTP proxy, HTTPS proxy, ALL proxy, NO_PROXY, username, password, SSL verification, target URL, timeout, Test URL, and Save controls using the real current backend values.
- Desktop metrics kept body and document scroll heights fixed to the `1269x1272` viewport while settings content stayed inside the drawer frame.
- Mobile metrics at `390x844` kept body/document fixed, kept the settings nav as horizontal scroll, and made the settings section body own vertical scroll (`overflowY=auto`, `scrollHeight=880`, `clientHeight=672`).
- `npm run test -- src/test/SettingsDrawer.test.tsx src/test/apiClient.test.ts` in `frontend/app` passed with 12 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this settings proxy slice. No Settings subsystem completion is claimed from this batch; workspace, environment variables, MCP, plugins, hooks, commands, roles editing, orchestration editing, model profile editing, agent runtime, GitHub, Clawhub, the user-reported workspace/chat frame issues, and reviewer sign-off remain open.

## 2026-06-24 Workspace And Chat Frame Recheck Batch

### Scope
- Rechecked the real V1 and V2 browser surfaces before editing after the user-reported framework screenshot, focusing on one-page shell ownership, workspace clipping, and chat timeline framing.
- Confirmed the built V2 shell now keeps body/document fixed while the chat timeline and sidebar session list own their own scroll, but found the workspace project grid still clipped its right-side sessions panel at narrower desktop widths.
- Changed the workspace project grid columns from fixed minimum tracks to shrinkable tracks so the summary, files, changes, and sessions panels fit inside the available workspace width instead of being cut off by `overflow:hidden`.
- Changed the workspace project grid to own overflow internally, preserving the one-page shell while allowing project content to scroll inside its own frame.
- Hid the round rail for single-round timelines while preserving the multi-round navigator, preventing ordinary short chats from losing visible working width.

### Verification
- Browser screenshots and metrics were captured under `.tmp/frontend-v2-framework-next/`.
- V2 workspace before fix at the DevTools viewport had `.at-project-view-grid` `clientWidth=718` and `scrollWidth=864`, with the `sessions` panel starting outside the visible frame.
- V2 workspace after fix at the same viewport had `.at-project-view-grid` `clientWidth=706` and `scrollWidth=706`, with the `sessions` panel inside the frame and body/document still fixed to `543 / 543`.
- V2 chat after fix kept body/document fixed to `543 / 543`, kept `.at-chat-view` fixed at `491px` high, and left `.at-timeline` as the scroll owner with `scrollHeight=4543` and `clientHeight=292`.
- Screenshots captured for this pass include `v2-workspace-after-fixed-clean.png` and `v2-chat-after-fixed.png`; the earlier pre-fix workspace screenshot `v2-workspace-after-real.png` shows the clipped sessions panel.
- `npm run test -- src/test/MessageTimeline.test.tsx src/test/WorkspaceProjectView.test.tsx` in `frontend/app` passed with 38 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this framework recheck slice. No Application Shell, Workspace, or Timeline subsystem completion is claimed from this batch; the next pass should continue screenshot-first comparison and focus on remaining workspace visual structure, composer density, and V1/V2 interaction parity before smaller polish.

## 2026-06-24 Timeline Tool Event Density Batch

### Scope
- Rechecked the real V1 and V2 browser surfaces before editing, using the same `你好啊` session for the chat-frame comparison.
- V1 presented the selected run as compact round cards and readable assistant text, while V2 still displayed every tool call/result/error body inline with nested scrollbars, making the chat frame feel vertically overloaded.
- Changed V2 tool call, tool result, validation, and approval timeline parts to render as collapsed `<details>` summaries by default.
- Preserved expandable call ids, parameters, results, errors, approval options, and feedback so detailed tool inspection remains available without dominating the default chat reading path.
- Lowered the virtual row height estimate for collapsed tool events so the timeline no longer reserves space for large hidden JSON bodies.

### Verification
- Browser screenshots and metrics were captured under `.tmp/frontend-v2-framework-followup/`.
- V1 reference screenshot: `v1-current-chat-loaded.png`.
- V2 before screenshot for the same session: `v2-current-chat-same-session.png`.
- V2 after screenshot: `v2-tool-events-collapsed-after.png`.
- V2 before metrics for the same session had `.at-timeline` `scrollHeight=4766` with visible tool bodies and nested scrollbars.
- V2 after metrics had `.at-timeline` `scrollHeight=2520`, `toolBlockCount=16`, `openToolBlockCount=0`, body/document still fixed to `1272 / 1272`, and the composer fixed at the bottom of the one-page shell.
- Browser expansion check opened the first collapsed tool event and verified the call id plus parameter body were still available, then collapsed it again.
- Browser console check returned no warnings or errors after the built V2 page was loaded and checked.
- `npm run test -- src/test/MessageTimeline.test.tsx` in `frontend/app` passed with 35 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this timeline density slice. No Message Timeline subsystem completion is claimed from this batch; streaming/replay/recovery parity, remaining workspace styling, composer density, and reviewer sign-off remain open.

## 2026-06-24 Timeline Virtual Row Stability Batch

### Scope
- Rechecked the built V2 chat in the real in-app browser after the user-reported framework screenshot, using the same `你好啊` session with collapsed thinking and tool rows.
- Confirmed that the previous density pass reduced the overall scroll height but exposed stale virtual row measurements: rows with multiple collapsed thinking/tool summaries could be positioned using an old short height, causing following rows to overlap.
- Changed the timeline virtualizer to key measurements by stable row keys instead of list indexes, preventing cached heights from being reused across different messages or sessions at the same index.
- Adjusted the virtual row estimate to count visible text and streaming thinking text, while using conservative base, thinking, and tool summary allowances so unmeasured rows do not collapse into each other.
- Added a tool-only row class for compact collapsed tool-only messages and hid the redundant role label on those rows without opening tool bodies by default.

### Verification
- Browser screenshots and metrics were captured under `.tmp/frontend-v2-framework-rowgap/`.
- Before the final fix, `v2-tool-only-compact-stable.png` showed visible overlap in the same session; DOM metrics found a rendered row with real height `181px` while the next row was positioned after only `53px`.
- After the fix, `v2-row-density-keyed-verified.jpg` showed the same session without overlapping thinking/tool rows.
- Browser scroll sampling at top, 25%, 50%, 75%, and bottom positions returned `overlapCount=0` for every sampled viewport, with only sub-pixel row gaps between `-0.421875` and `0.46875`.
- Body and document scroll stayed fixed to the viewport (`1272 / 1272`), `.at-timeline` remained the scroll owner (`clientHeight=1051`, `scrollHeight=1991`), and `window.scrollY=0`.
- `npm run test -- src/test/MessageTimeline.test.tsx` in `frontend/app` passed with 35 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this timeline virtual-row stability slice. No Message Timeline subsystem completion is claimed from this batch; remaining work includes broader workspace visual structure, composer density, streaming/replay/recovery parity, and reviewer sign-off.

## 2026-06-24 Sidebar Workspace Structure Batch

### Scope
- Rechecked V1 and V2 in the real in-app browser before editing, focusing on the user-reported workspace framework mismatch rather than smaller style details.
- V1 reference showed workspace organization as compact left-sidebar project cards with project paths and project-local actions, keeping project/session navigation in the primary working frame.
- V2 before this batch grouped sessions by workspace but kept the workspace view action in the section header and did not show project paths in each group, making the workspace area feel like a generic session grouping instead of V1's project structure.
- Moved the workspace view action into each workspace group, keyed by the specific workspace.
- Added a real per-workspace new-session action that calls the existing `createSession` API with that workspace id, matching V1's project-local new-session affordance without introducing fake controls.
- Added visible workspace path hints under workspace titles and tightened session row density/selection styling to read more like the V1 workspace list.

### Verification
- Browser screenshots and metrics were captured under `.tmp/frontend-v2-framework-sweep/`.
- V1 reference screenshot: `v1-current.jpg`.
- V2 before screenshots: `v2-chat-current.jpg` and `v2-workspace-current.jpg`.
- V2 after screenshots: `v2-sidebar-workspace-final.jpg` and `v2-workspace-final-from-sidebar.jpg`.
- Final V2 sidebar metrics showed each rendered workspace group with a visible path plus real actions: `打开 {workspace} 的工作区视图` and `在 {workspace} 中新建会话`.
- Final V2 kept body/document fixed to `1272 / 1272`; `.at-session-list` owned sidebar scrolling and `.at-timeline` owned chat scrolling.
- Final project-view click verification opened the selected workspace view from the workspace row, kept `.at-project-view-grid` at `clientWidth=989` and `scrollWidth=989`, and produced no browser warnings or errors.
- `npm run test -- src/test/SessionsSidebar.test.tsx` in `frontend/app` passed with 11 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this sidebar workspace structure slice. No Application Shell, Sessions, or Workspace subsystem completion is claimed from this batch; remaining work includes missing V1 sidebar management actions, broader project/workspace interaction parity, composer density, streaming/recovery parity, and reviewer sign-off.

## 2026-06-24 Sidebar Session Management Actions Batch

### Scope
- Closed a V1/V2 parity gap in the workspace sidebar: V2 session rows now expose real rename and delete actions instead of only selecting sessions.
- Added typed V2 API client methods for the existing backend `PATCH /api/sessions/{session_id}` metadata route and `DELETE /api/sessions/{session_id}` route.
- Split the session row into a primary select button plus compact action buttons, avoiding nested button markup while keeping the V1-style row density.
- Added controlled Ant modal flows for renaming and destructive deletion confirmation, with localized English and Chinese copy.
- Deleting the selected session clears the selected session state and invalidates session caches; deleting uses the same `force` and `cascade` request body as V1.

### Verification
- Browser screenshots and metrics were captured under `.tmp/frontend-v2-session-actions/`.
- V2 sidebar screenshot: `v2-sidebar-actions.png`.
- V2 rename modal screenshot: `v2-rename-modal.png`.
- Browser DOM verification found one selected-row rename button, one selected-row delete button, 48 rendered session action buttons, and one visible rename input after opening the modal.
- Browser layout metrics kept body/document fixed to the viewport (`1272 / 1272`) while validating the sidebar action UI.
- `npm run test -- src/test/SessionsSidebar.test.tsx` in `frontend/app` passed with 13 tests.
- `npm run test -- src/test/apiClient.test.ts` in `frontend/app` passed with 6 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this sidebar session-management slice. No Sessions subsystem completion is claimed from this batch; remaining work includes the broader screenshot-first framework pass the user requested, workspace visual structure polish, composer density, streaming/recovery parity, and reviewer sign-off.

## 2026-06-24 Composer Density Framework Batch

### Scope
- Rechecked real V1 and V2 browser screenshots before editing, focusing on the bottom composer frame and main workspace density.
- Found V2's composer controls wrapping into two visible rows because normal mode still rendered the orchestration preset control and the Shell safety label consumed a full control-width slot.
- Scoped topology controls to the active session mode: normal mode shows the root role selector, orchestration mode shows the preset selector.
- Kept the Shell safety override as a real per-run control but shortened its visible label to `Shell` with the full meaning preserved in the accessible name and tooltip.
- Narrowed composer control widths and spacing so the V2 control strip fits in a single visual row at the desktop viewport used for V1/V2 comparison.

### Verification
- Browser screenshots and metrics were captured under `.tmp/frontend-v2-framework-pass/`.
- V1 reference screenshot: `v1-framework-baseline.png`.
- V2 before screenshot: `v2-framework-before.png`.
- V2 final screenshot: `v2-composer-compact-after.png`.
- Before this batch, V2 composer metrics showed `.at-composer` height `134px`, `.at-composer-control-set` height `56px`, timeline height `1051px`, and visible composer text included the disabled orchestration preset in normal mode.
- After this batch, V2 composer metrics showed `.at-composer` height `110px`, `.at-composer-control-set` height `24px`, timeline height `1075px`, normal-mode orchestration preset count `0`, and all composer controls on one visual row.
- Body and document scroll stayed fixed to the viewport (`1272 / 1272`) after the compact composer pass.
- `npm run test -- src/test/Composer.test.tsx` in `frontend/app` passed with 45 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this composer-density framework slice. No Composer subsystem completion is claimed from this batch; remaining work includes broader V1/V2 framework parity, runtime streaming/recovery scenarios, missing V1 management surfaces, desktop checks, and reviewer sign-off.

## 2026-06-24 Session Search Surface Batch

### Scope
- Rechecked V1 and V2 in the real in-app browser before editing, focusing on the primary `Search` navigation item from the V2 sidebar.
- V1 opened a dedicated recent-conversation search panel with focused input, session title rows, workspace labels, shortcut-style keyboard selection, and result filtering.
- V2 before this batch only dispatched a focus event to the sidebar `Search sessions` input, leaving no real search workspace surface and no active navigation state.
- Added a componentized V2 `SessionSearchView` that searches real sidebar session records against session title, session id, workspace label, and workspace root path.
- Wired the primary `Search` navigation item and `Ctrl/Cmd+K` to the real search surface, with keyboard result selection returning to the chat view and selecting the matched session/workspace.
- Kept the legacy sidebar focus event for callers that explicitly target the sidebar filter, but removed the sidebar's global `Ctrl/Cmd+K` listener so the shell owns the command-palette shortcut.

### Verification
- Browser screenshots and metrics were captured under `.tmp/frontend-v2-search-surface/`.
- V1 reference screenshot: `v1-after-search-click.png`.
- V2 before screenshot: `v2-after-search-click-before-fix.png`; browser state showed `hasSearchView=false` and focus on the sidebar `Search sessions` input.
- V2 after screenshots: `v2-search-view-after-fix.png` and final rebuild smoke screenshot `v2-search-view-final.png`; browser state showed `hasSearchView=true`, `optionCount=20`, timeline hidden, and focus inside the new search view rather than the sidebar.
- V2 filtered screenshot: `v2-search-filtered-after-fix.png`; browser state showed `desktop` filtering with highlighted matches and real workspace-root result rows.
- Enter selection screenshot: `v2-search-select-after-fix.png`; browser state showed the search view closed, timeline visible again, one selected sidebar session row, and body/document fixed to the viewport (`1272 / 1272`, `windowScrollY=0`).
- Shortcut screenshot: `v2-search-shortcut-after-fix.png`; browser state showed `Ctrl+K` opened the same search surface with focus inside its input.
- Browser console checks returned no warnings or errors after the search interactions and final rebuilt-page smoke test.
- `npm run test -- src/test/SessionSearchView.test.tsx src/test/AppShell.test.tsx src/test/SessionsSidebar.test.tsx` in `frontend/app` passed with 24 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this session-search slice. No Search, Application Shell, or full frontend subsystem completion is claimed from this batch; the next pass should start screenshot-first on the broader fixed-page workspace/chat framework issues reported by the user.

## 2026-06-24 Workspace Workbench Framework Batch

### Scope
- Rechecked V1 and built V2 in the real in-app browser before and after editing, focusing on the user-reported fixed-page framework issues instead of small style polish.
- Confirmed with browser metrics that the current long-chat V2 shell keeps body/document fixed while `.at-timeline` and `.at-session-list` own their own scrolling.
- Replaced the V2 workspace four-panel card dashboard with a V1-shaped workbench frame: top project toolbar, file/change tabs, mount selector, change list, and diff preview.
- Added a typed V2 client contract for the real workspace diff-file endpoint so the preview renders actual file diffs rather than summary-only placeholder content.
- Removed the project view's duplicated session panel; workspace/session navigation remains owned by the left workspace sidebar, matching the one-page frame and preventing project content from dragging the session list.

### Verification
- Browser screenshots and metrics were captured under `.tmp/frontend-v2-framework-fixed-page/`.
- V1 reference screenshots: `v1-frame-reference.png` and `v1-project-view-reference.png`.
- V2 before screenshots: `v2-long-chat-before.png`, `v2-workspace-before.png`, and `v2-workspace-settled-before.png`.
- V2 after screenshots: `v2-workspace-workbench-after.png`, `v2-workspace-files-after.png`, and `v2-long-chat-after.png`.
- Workspace workbench metrics at `1248x679` kept body/document fixed to `679 / 679`, kept `.at-project-view` fixed at `627px`, and made `.at-workspace-diff-list` plus `.at-workspace-diff-preview` the scroll owners while `.at-project-view-grid` no longer existed.
- Long-chat metrics after rebuilding kept body/document fixed to `679 / 679`; scrolling `.at-timeline` to the bottom did not move `.at-session-list`, which remained at `scrollTop=0`.
- Browser console verification found only a pre-existing `/favicon.ico` 404 and no workspace or chat interface errors.
- `npm run test -- src/test/WorkspaceProjectView.test.tsx src/test/AppShell.test.tsx src/test/apiClient.test.ts` in `frontend/app` passed with 17 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this fixed-page workspace/chat framework slice. No Workspace, Application Shell, or Message Timeline subsystem completion is claimed from this batch; remaining work includes broader V1 project interaction parity, detailed workspace actions, streaming/recovery scenarios, and reviewer sign-off.

## 2026-06-24 Workspace File Tree Pane Batch

### Scope
- Rechecked the real V1 and V2 project workbench in the in-app browser before editing, focusing on the larger framework mismatch the user flagged.
- V1 showed a three-surface project workbench with a right-side file tree, `筛选文件...` filter, file/change tabs, and workspace-level actions.
- V2 before this batch had the fixed-page workbench shell from the prior pass, but the changes view only had a diff list and diff preview, leaving the right workspace file surface missing.
- Added typed V2 client contracts for the real workspace tree and path search endpoints, and threaded the active mount through tree, search, diff, and open-root requests.
- Added a real right-side workspace file pane to the V2 changes view, with file filtering backed by `/api/workspaces/{id}/search` and changed-file rows selecting the corresponding diff preview.
- Kept unchanged file and directory rows display-only in this batch instead of pretending they open, so the UI does not add dead controls while full file-open parity remains pending.
- Adjusted the workbench grid so the three columns fill the available width without the blank right gap seen in the first browser verification pass.

### Verification
- Browser screenshots and metrics were captured under `.tmp/frontend-v2-workspace-tree-parity/`.
- V1 reference screenshot: `v1-project-workbench-reference.png`.
- V2 before screenshot: `v2-workspace-before-tree-pane.png`.
- V2 after screenshots: `v2-workspace-after-tree-pane.png` and `v2-workspace-filtered-tree-pane.png`.
- Final V2 browser metrics kept body/document fixed to the viewport (`1272 / 1272`, `windowScrollY=0`) while `.at-session-list`, `.at-workspace-diff-list`, `.at-workspace-diff-preview`, and `.at-workspace-file-pane-list` owned their own scrolling.
- Final V2 workbench grid columns measured `265.156px 491.844px 190px` with `rightGap=0`, replacing the earlier two-column V2 state and the first three-column attempt that left unused right space.
- Filtering for `WorkspaceProjectView` returned real changed-file rows for `frontend/app/src/test/WorkspaceProjectView.test.tsx` and `frontend/app/src/features/workspaces/WorkspaceProjectView.tsx`; selecting the component result updated both the file pane and diff list selection and showed the matching diff preview.
- Browser console verification returned no warnings or errors after the rebuilt V2 interaction pass.
- `npm run test -- src/test/WorkspaceProjectView.test.tsx src/test/apiClient.test.ts` in `frontend/app` passed with 10 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this workspace file-tree pane slice. No Workspace subsystem completion is claimed from this batch; remaining work includes opening non-diff files, recursive tree expansion, broader project actions, streaming/recovery parity, loading and empty states across more real runs, and reviewer sign-off.

## 2026-06-24 Workspace File Preview Batch

### Scope
- Rechecked V1 and V2 project views in the real in-app browser after the prior file-tree pane work.
- V1 Files mode showed a real project workbench shape: central file preview, right-side filterable tree, directory expansion, and file selection.
- V2 before this batch still rendered Files mode as a flat root-entry list, so the project workbench looked closer in Changes mode but remained structurally wrong for file browsing.
- Added a typed V2 client contract for `GET /api/workspaces/{id}/file?path=...&mount=...`.
- Reworked the V2 Files tab into a two-surface workbench: left file preview and right file explorer, while preserving the fixed one-page shell.
- Added on-demand directory expansion through the existing workspace tree endpoint, file search through the existing path search endpoint, and real file content loading through the existing file endpoint.
- Kept directory search results display-only when they cannot be previewed directly, so the UI does not add fake open behavior for directories.

### Verification
- Browser screenshots and metrics were captured under `.tmp/frontend-v2-next-framework-pass/`.
- V1 reference screenshot: `v1-project-view-confirmed.png`.
- V2 rebuilt default workspace screenshot before switching Files mode: `v2-default-workspace-after-build.png`.
- V2 final Files preview screenshot: `v2-files-preview-after.png`.
- Browser verification opened the real `default` workspace at `C:\Users\yex\Documents\workspace\agent-teams`, switched to Files mode, expanded `frontend`, filtered for `WorkspaceProjectView.tsx`, and opened `frontend/app/src/features/workspaces/WorkspaceProjectView.tsx`.
- Final V2 browser metrics kept body/document fixed to the viewport (`1272 / 1272`, `windowScrollY=0`) while `.at-workspace-file-preview` owned the long source scroll (`clientHeight=1063`, `scrollHeight=19731`) and `.at-workspace-file-pane-list` owned the file-result scroll.
- Final Files grid measured `681.844px 265.156px`, matching the V1 main-preview plus side-tree shape more closely than the previous flat Files list.
- Browser console verification returned no warnings or errors after the file browse and preview interaction.
- `npm run typecheck` in `frontend/app` passed.
- `npm run test -- src/test/WorkspaceProjectView.test.tsx src/test/apiClient.test.ts` in `frontend/app` passed with 10 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this workspace file-preview slice. No Workspace subsystem completion is claimed from this batch; remaining work includes mount add/edit/remove parity, SSH profile management entry parity, richer file highlighting/image preview parity, broader project actions, streaming/recovery scenarios, and reviewer sign-off.

## 2026-06-24 Workspace Mount Actions Batch

### Scope
- Rechecked the real V1 project workbench before editing and confirmed its mount action bar exposes add mount, edit mount, SSH config, and remove mount actions.
- V2 before this batch showed mount chips but did not expose real mount-management actions, leaving a visible project interaction gap after the fixed-page workbench pass.
- Added typed V2 workspace update and SSH profile contracts to the shared API client.
- Added project-workbench actions for adding, editing, and removing workspace mounts through the real workspace update endpoint.
- Added a read-only SSH profiles entry point backed by the real workspace SSH profiles configuration endpoint, so the V2 workbench has the same top-level navigation affordance as V1 without claiming full SSH profile editing parity yet.
- Kept the workbench fixed in the one-page application frame while adding the new actions.

### Verification
- Browser screenshots and metrics were captured under `.tmp/frontend-v2-mount-actions/`.
- V1 reference screenshot: `v1-mount-actions-reference.png`.
- V2 before screenshot: `v2-mount-actions-before.png`.
- V2 final screenshots: `v2-mount-actions-final.png`, `v2-add-mount-modal-final.png`, and `v2-ssh-profiles-modal-final.png`.
- Final V2 browser metrics at `1248x679` kept body/document fixed to the viewport (`679 / 679`, `scrollTop=0`), kept `main` fixed at `627px`, kept `.at-project-view` fixed at `627px`, and kept `.at-workspace-workbench` contained at `520px`.
- Final V2 mount action counts were one each for `添加挂载`, `编辑挂载`, `SSH 配置`, and `移除挂载`.
- The add-mount dialog rendered real mount fields and localized actions (`取消`, `保存`) with no English `Cancel` text.
- The SSH profiles dialog rendered the localized empty state `暂无 SSH 配置。` with no Ant default `No data` text.
- Current page assets loaded the rebuilt files `index-Cc-dSXVg.js` and `index-CL4YibP8.css`.
- Browser console verification found only the pre-existing missing favicon 404 and no workspace action, chunk, or API errors.
- `npm run test -- src/test/WorkspaceProjectView.test.tsx src/test/apiClient.test.ts` in `frontend/app` passed with 14 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this workspace mount-action slice. No Workspace subsystem completion is claimed from this batch; remaining work includes full SSH profile management surfaces, richer project actions, file/image preview parity, streaming/recovery scenarios, and reviewer sign-off.

## 2026-06-24 Remote Workspace Settings Batch

### Scope
- Rechecked V1 and V2 Settings in the real in-app browser before editing.
- V1 Settings exposed a full settings workbench with entries including MCP, plugins, Commands, Hooks, Agent Runtime, remote workspace, and environment variables.
- V2 before this batch exposed a smaller Settings drawer and had no remote workspace settings surface, even though workspace SSH profiles are a real backend capability and V1 has a dedicated `远端工作区` settings entry.
- Added typed V2 client contracts for SSH profile save, delete, password reveal, and connectivity probe in addition to list.
- Added a componentized `WorkspaceSettingsSection` under the V2 Settings drawer with a real `远端工作区` / `Remote workspace` nav item.
- The new section lists SSH profiles, shows authentication metadata, opens a real add/edit profile form, preserves saved secrets when fields are left blank, can reveal a saved password on explicit user action, can test saved or draft profile values through the probe endpoint, and deletes profiles through the real delete endpoint with confirmation.

### Verification
- Browser screenshots and metrics were captured under `.tmp/frontend-v2-settings-parity/`.
- V1 reference screenshot: `v1-settings-reference.png`.
- V2 before screenshot: `v2-settings-clean-click.png`.
- V2 final screenshots: `v2-remote-workspace-settings-final.png` and `v2-remote-workspace-profile-editor-final.png`.
- Final V2 browser state loaded rebuilt assets `index-BGHLisR6.js` and `index-7F-Qfyb2.css`.
- Final V2 Settings nav included `远端工作区`; the remote workspace panel showed a localized empty state `暂无 SSH 配置。` with no `No data` text.
- The add-profile editor rendered real fields for profile id, host, username, port, connect timeout, remote shell, password, private key name, private key, plus `测试草稿` and `保存` actions.
- Body/document stayed fixed to the viewport (`1272 / 1272`) while the drawer/editor owned their own frame.
- Browser console verification returned no warnings or errors after opening the new settings section and editor.
- `npm run test -- src/test/SettingsDrawer.test.tsx src/test/apiClient.test.ts` in `frontend/app` passed with 16 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this remote-workspace settings slice. No Settings subsystem completion is claimed from this batch; remaining work includes MCP, plugin, Commands, Hooks, Agent Runtime, environment variables, deeper settings form parity, streaming/recovery scenarios, and reviewer sign-off.

## 2026-06-24 Environment Variables Settings Batch

### Scope
- Continued Settings parity from the V1 reference surface instead of adding a placeholder settings tab.
- Added typed V2 client contracts for `GET`, `PUT`, and `DELETE /api/system/configs/environment-variables`.
- Added a componentized `EnvironmentSettingsSection` under the V2 Settings drawer with a real `环境变量` / `Environment variables` nav item.
- The new section lists editable app variables and read-only system variables, keeps proxy-related app keys out of this panel because the dedicated proxy settings surface owns them, opens a real add/edit variable form, preserves backend rename semantics through `source_key`, and deletes app variables through the real delete endpoint with confirmation.
- User-reported large-frame blocker remains explicitly next: the workspace/session/chat shell must be rechecked with screenshots first, especially fixed one-page ownership and preventing chat scroll from carrying workspace sessions.

### Verification
- Browser screenshots were captured under `.tmp/frontend-v2-environment-settings/`.
- V2 final screenshots: `v2-environment-settings-panel.png` and `v2-environment-settings-editor.png`.
- Final V2 browser state loaded rebuilt assets `index-ZjT6Slvw.js` and `index-CQBkVBnX.css`.
- Final V2 Settings nav included `环境变量`; the panel showed app/system counts, real app records, edit/delete actions for app records, and a collapsed system group.
- The add-variable editor rendered real localized fields for key and value plus `取消` and `保存` actions.
- Browser verification confirmed the environment section, new-variable button, and key field existed in the actual in-app browser at `http://127.0.0.1:8000/app/`.
- `npm run typecheck` in `frontend/app` passed.
- `npm run test -- src/test/SettingsDrawer.test.tsx src/test/apiClient.test.ts` in `frontend/app` passed with 18 tests.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this environment-variable settings slice. No Settings subsystem completion is claimed from this batch; remaining work includes MCP, plugin, Commands, Hooks, Agent Runtime, deeper settings form parity, the user-reported framework scroll/layout pass, streaming/recovery scenarios, and reviewer sign-off.

## 2026-06-25 Message Timeline Rendering Batch

### Scope
- Rechecked the real V2 chat timeline after the user-reported screenshot instead of relying on component assumptions.
- Removed the persisted-message fallback that rendered raw `message` text when a historical row had no readable content.
- Added support for legacy `user-prompt` history parts and trimmed internal `## Skill Candidates` routing text from user-visible prompts.
- Hid ordinary user/assistant role labels in the main timeline so the chat surface no longer shows stray `用户` / `助手` labels between rows.
- Changed failed tool returns to display concise error summaries instead of raw `{ ok, data, error, meta }` JSON envelopes.
- Changed successful tool returns to unwrap useful output fields before falling back to JSON, reducing protocol noise in tool-heavy histories.
- Compacted provider API failure text into a readable title and cause instead of showing the full raw `body` and `Root cause` payload.
- Cleared stale stream state when switching sessions so a previous run cannot keep painting into a newly selected chat surface.

### Verification
- Browser verification on `http://127.0.0.1:8000/app/` showed `messageExactCount: 0`, no `.at-message-role` labels for ordinary rows, `hasApiSummary: true`, and no raw `Root cause` or `invalid_request_error` text.
- V2 screenshot verification in the in-app browser showed the API error rendered as two readable paragraphs and no bare `message` rows.
- `npm test -- src/test/MessageTimeline.test.tsx src/test/ShellLayoutCss.test.ts src/test/ChatWorkspace.test.tsx` in `frontend/app` passed with 51 tests.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this message timeline rendering slice. No Message Timeline subsystem completion is claimed from this batch; remaining work includes full streaming/replay edge scenarios, message export parity, long tool-heavy history review, and reviewer sign-off.

## 2026-06-25 Inline Message Copy Action Batch

### Scope
- Rechecked V1 and V2 in the real in-app browser before editing, focusing on the user-reported floating copy icon and message action placement.
- Captured current V2 and V1 chat/settings baselines under `.tmp/frontend-v2-continuation/`.
- Removed the V2 timeline-level sticky copy toolbar.
- Moved `复制最后回答` / `Copy last answer` into the latest copyable answer row, matching V1's message-local action shape more closely while preserving the existing accessible name.
- Kept the copy action disabled while a stream is open so partially streaming answers are not copied as final output.

### Verification
- V1/V2 baseline screenshots captured under `.tmp/frontend-v2-continuation/`: `v1-current.png`, `v2-current.png`, `v1-settings.png`, and `v2-settings.png`.
- Final browser DOM verification on `http://127.0.0.1:8000/app/` showed `toolbarCount: 0`, one `.at-message-actions` copy button, aria label `复制最后回答`, and the action button nested under the latest answer `article.at-message`.
- Browser body/document metrics remained fixed to the viewport at `1280x720` with no page-level scroll growth.
- Final screenshot capture for `v2-inline-copy-after.png` was attempted twice but the in-app browser screenshot backend timed out on `Page.captureScreenshot`; DOM verification and targeted tests were used as the final evidence for this small visual placement change.
- `npm test -- src/test/MessageTimeline.test.tsx src/test/ShellLayoutCss.test.ts` in `frontend/app` passed with 50 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent browser and test verification completed for this inline copy action slice. No Message Timeline subsystem completion is claimed from this batch; remaining work includes full streaming/replay edge scenarios, export parity, and reviewer sign-off.

## 2026-06-25 Stream Terminal Transport Boundary Batch

### Scope
- Rechecked the current V2 browser frame before editing; the page body remained fixed to the viewport while the timeline and session list owned their own scroll areas, and the rebuilt chat surface no longer showed bare `message` rows or the old timeline-level copy toolbar.
- Reviewed the existing AG-UI stream client, runtime reducer, and run stream controller coverage for `after_event_id`, SSE `Last-Event-ID`, local cursor replay, multiplexed replay, transport interruptions, and duplicate event suppression.
- Fixed a terminal replay edge where a transport disconnect after the local reducer already knew every tracked run was closed could still be treated as a recoverable network interruption and scheduled another stream replay.
- Shared the normal stream-close cleanup path for this terminal transport boundary so messages, sidebar sessions, recovery state, and token usage are invalidated exactly like a server-terminal close.

### Verification
- `npm test -- src/test/RunStreamController.test.tsx` in `frontend/app` passed with 12 tests, including the new regression proving terminal local run state stops transport reconnect instead of opening another EventSource.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app` with rebuilt asset `index-4T8FptvI.js`.
- Browser verification on `http://127.0.0.1:8000/app/` loaded the rebuilt asset, kept body/document height fixed at `720 / 720`, kept `.at-session-list` and `.at-timeline` as independent scroll owners, showed `floatingCopy: 0`, and showed `bareMessageCount: 0`.
- Browser screenshots were attempted for the current V2/V1 framework and final rebuilt V2 state, but the in-app browser screenshot backend timed out on `Page.captureScreenshot`; DOM metrics and targeted runtime tests were used as evidence for this non-visual stream-controller fix.

### Reviewer
- Main-agent browser and test verification completed for this stream terminal transport boundary slice. No AG-UI Runtime Stream or Message Timeline subsystem completion is claimed from this batch; remaining work includes live stream/replay Playwright scenarios, refresh-during-stream recovery, interrupted-stream resume under real SSE timing, and reviewer sign-off.

## 2026-06-25 Multiplex Active Run State Batch

### Scope
- Continued the AG-UI stream/replay parity pass by tightening the React run stream controller's multiplexed active-run projection.
- When a multiplexed stream state update reports one tracked run as terminal while another tracked run remains open, the controller now removes the terminal run from `activeRunIds` immediately instead of keeping it active until the whole multiplex stream closes.
- This keeps composer stop/inject ownership and recovery active-stream matching aligned with the reducer's actual run statuses during partial terminal replay or mixed parent/subagent streams.

### Verification
- `npm test -- src/test/RunStreamController.test.tsx` in `frontend/app` passed with 13 tests, including the new regression that a closed `run-1` is removed while `run-2` remains active in the same multiplex stream.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app` with rebuilt asset `index-CoqwURYH.js`.

### Reviewer
- Main-agent targeted verification completed for this multiplex active-run state slice. No AG-UI Runtime Stream subsystem completion is claimed from this batch; remaining work includes real browser stream/replay scenarios, refresh-during-stream recovery, interrupted-stream resume under real SSE timing, and reviewer sign-off.

## 2026-06-25 Duplicate Terminal Replay Close Batch

### Scope
- Continued the AG-UI stream/replay parity pass at the lower stream client layer.
- Fixed the case where replay only delivers a duplicate terminal event that the reducer correctly treats as a no-op; the stream client now still checks the tracked run terminal state and emits `onClosed`.
- This prevents upper layers from waiting for a later transport error before clearing streaming state when replay confirms a run is already terminal.

### Verification
- `npm test -- src/test/streamClient.test.ts` in `frontend/app` passed with 17 tests, including the new duplicate terminal replay close regression.
- `npm test -- src/test/RunStreamController.test.tsx` in `frontend/app` passed with 13 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app` with rebuilt asset `index-CiycJFyW.js`.

### Reviewer
- Main-agent targeted verification completed for this duplicate terminal replay close slice. No AG-UI Runtime Stream subsystem completion is claimed from this batch; remaining work includes real browser stream/replay scenarios, refresh-during-stream recovery, interrupted-stream resume under real SSE timing, and reviewer sign-off.

## 2026-06-25 Multiplex Duplicate Terminal Replay Evidence Batch

### Scope
- Added focused stream-client coverage for the multiplex variant of duplicate terminal replay.
- The new regression proves that when all tracked multiplexed runs are already terminal locally, replaying a duplicate terminal event for one tracked run closes the EventSource and emits the existing closed runtime state without producing duplicate timeline state.

### Verification
- `npm test -- src/test/streamClient.test.ts` in `frontend/app` passed with 18 tests.
- `npm run typecheck` in `frontend/app` passed.

### Reviewer
- Main-agent targeted verification completed for this multiplex duplicate terminal replay evidence slice. No AG-UI Runtime Stream subsystem completion is claimed from this batch; remaining work includes real browser stream/replay scenarios, refresh-during-stream recovery, interrupted-stream resume under real SSE timing, and reviewer sign-off.

## 2026-06-25 Recovery Stream Target Tracking Batch

### Scope
- Split the React run stream controller's state into `activeRunIds` for currently open runs and `trackedRunIds` for the EventSource targets being followed.
- RecoveryBar now compares recovery snapshot targets against `trackedRunIds`, so a stale recovery snapshot does not reopen an entire multiplex stream after one tracked run has already reached terminal state locally.
- Composer and other active-run controls continue to use `activeRunIds`, preserving the narrower stop/inject ownership from the earlier multiplex active-run state fix.

### Verification
- `npm test -- src/test/RunStreamController.test.tsx` in `frontend/app` passed with 13 tests, including the regression that active ids shrink while tracked ids remain stable for the open EventSource.
- `npm test -- src/test/RecoveryBar.test.tsx` in `frontend/app` passed with 19 tests, including the regression that RecoveryBar does not restart a multiplex stream when active ids are a subset but tracked ids still match the recovery targets.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app` with rebuilt asset `index-BvAOAp4z.js`.

### Reviewer
- Main-agent targeted verification completed for this recovery stream target tracking slice. No AG-UI Runtime Stream or Run Recovery subsystem completion is claimed from this batch; remaining work includes real browser stream/replay scenarios, refresh-during-stream recovery, interrupted-stream resume under real SSE timing, and reviewer sign-off.

## 2026-06-25 V1 Sidebar And Runtime Message Cleanup Batch

### Scope
- Rechecked V2 against the live V1 page before editing instead of relying on code-level assumptions.
- Restored the primary sidebar to V1's six navigation entries and order: Search, Skills, Automation, Connectors, Board, and Memory. Chat remains the default/session surface, while Observability and Settings remain topbar actions instead of extra sidebar entries.
- Tightened runtime `message` event rendering so empty protocol events no longer leak the literal `message` fallback or standard role labels into the timeline, while payload text and payload parts from replay still render normally.
- Reduced the visual weight of runtime tool-only rows so tool call/result/error details read as subordinate timeline details rather than full message rows.

### Verification
- `npm test -- src/test/AppShell.test.tsx` in `frontend/app` passed with 17 tests, including V1 sidebar order and topbar-only Observability/Settings coverage.
- `npm test -- src/test/MessageTimeline.test.tsx` in `frontend/app` passed with 45 tests, including the new empty runtime `message` regression and payload replay rendering regression.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app` with rebuilt asset `index-2ygWoNwy.js`.
- Browser verification on `http://127.0.0.1:8000/app/` showed `body.scrollHeight === body.clientHeight`, `.at-timeline` as the scroll owner, sidebar buttons `["搜索Ctrl+K", "技能", "自动化", "连接器", "看板", "记忆"]`, `bareMessageTexts: 0`, `standardRoleLabels: []`, and `floatingTimelineToolbar: 0`.
- V1 and V2 screenshots were captured to `frontend-debug-v1-reference.png` and `frontend-debug-v2-final.png` for the large-frame comparison.

### Reviewer
- Main-agent browser and targeted test verification completed for this V1 sidebar and runtime message cleanup slice. No Message Timeline or Shell subsystem completion is claimed from this batch; remaining work includes deeper V1 visual parity review, live stream/replay scenarios, refresh-during-stream recovery, and reviewer sign-off.

## 2026-06-25 Background-Only Recovery Batch

### Scope
- Continued the Run Recovery and AG-UI continuation pass for refresh/replay edge cases.
- RecoveryBar now stays visible when a recovery snapshot has active background tasks but no registered `active_run`.
- The background-only recovery state starts the appropriate run stream target, keeps the task stop action wired to the task's own `run_id`, and still avoids rendering approval actions when no active run id is available for approvals.
- Added status/collapse key handling that does not depend on `active_run.run_id`, so background task collapse/expand remains stable after refresh.

### Verification
- `npm test -- src/test/RecoveryBar.test.tsx` in `frontend/app` passed with 20 tests, including the new regression for `active_run: null` plus a running background task.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app` with rebuilt asset `index-DbEQ_jK8.js`.

### Reviewer
- Main-agent targeted verification completed for this background-only recovery slice. No Run Recovery or AG-UI Runtime Stream subsystem completion is claimed from this batch; remaining work includes browser refresh-recovery scenarios with real SSE timing, interrupted stream resume, and reviewer sign-off.

## 2026-06-25 Error Event Transport Fallback Batch

### Scope
- Continued the AG-UI stream/replay pass by tightening the lower stream client's `event: error` handling.
- Kept explicit server error payloads (`{"error": "..."}`) on the server-error path so failed replay/resume responses still close the EventSource and surface the backend error.
- Treated empty or malformed data-bearing `event: error` messages as transport interruptions instead of malformed stream payloads, so transient disconnect noise can enter the controller's delayed reconnect path rather than stopping stream/replay immediately.
- Left normal AG-UI/message event malformed payload reporting unchanged.

### Verification
- `npm test -- src/test/streamClient.test.ts` in `frontend/app` passed with 20 tests, including the new empty and malformed `event: error` transport fallback regressions.
- `npm test -- src/test/RunStreamController.test.tsx` in `frontend/app` passed with 13 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app` with rebuilt asset `index-D_ZeE1Sh.js`.

### Reviewer
- Main-agent targeted verification completed for this error-event transport fallback slice. No AG-UI Runtime Stream subsystem completion is claimed from this batch; remaining work includes real browser stream/replay scenarios, refresh-during-stream recovery, interrupted stream resume under real SSE timing, and reviewer sign-off.

## 2026-06-25 V1 Framework Alignment Browser Audit Batch

### Scope
- Re-ran the large-frame comparison against live V1 and V2 before editing, then kept this batch focused on the shell/workspace frame rather than continuing into message-detail polish.
- Restored the visible V2 workspace identity to match V1 expectations by resolving generic workspace ids such as `default` from the workspace root folder name, so the shell and workspace group show `agent-teams` instead of leaking an internal id.
- Simplified the topbar identity back to a V1-style single visible title while preserving the selected session and status in accessible text.
- Converted the right round rail from a reserved grid column into an overlay rail with a protected timeline gutter, keeping the workspace width aligned with the V1 frame while preventing the rail from covering message cards.
- Preserved the fixed one-screen shell: the page body remains non-scrolling, the sidebar/workspace/composer stay inside the viewport, and `.at-timeline` remains the scroll owner for message history.

### Verification
- Browser V1 reference screenshot captured at `.tmp/frontend-framework-audit/v1-reference-ready.png`.
- Browser V2 before screenshot and metrics captured at `.tmp/frontend-framework-audit/v2-before.png` and `.tmp/frontend-framework-audit/v2-before-metrics.json`.
- Browser V2 final screenshot and metrics captured at `.tmp/frontend-framework-audit/v2-final.png` and `.tmp/frontend-framework-audit/v2-final-metrics.json`.
- Final V2 browser metrics on `http://127.0.0.1:8000/app/` showed `body.scrollHeight === body.clientHeight === 720`, `.at-shell` and `.at-workspace` fixed to the viewport, `.at-timeline` as the vertical scroll owner, `visibleDefaultLabels: 0`, `workspaceGroupTitles: ["agent-teams", "agent-teams-issue-401", "desktop"]`, topbar visible text `["agent-teams", "中文", "V1"]`, and `railOverlapPx: 0`.
- `npm test -- src/test/AppShell.test.tsx src/test/SessionsSidebar.test.tsx src/test/CurrentSessionIndicator.test.tsx src/test/ShellLayoutCss.test.ts` in `frontend/app` passed with 47 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app` with rebuilt assets `index-BlSOqG0z.js` and `index-B5yJWOSo.css`.

### Reviewer
- Main-agent browser screenshot/metrics verification completed for this V1 framework alignment slice. No Settings page, Appearance page, Message Timeline, or AG-UI Runtime Stream subsystem completion is claimed from this batch; remaining work includes V1 secondary-page logic parity, appearance/settings detail pages, message rendering polish, and real stream/replay browser scenarios.

## 2026-06-25 Settings Appearance Cold-Load Audit Batch

### Scope
- Reopened V2 in the browser after the previous framework batch and caught the cold-load variant where the generic `default` workspace id could appear before workspace records finished loading.
- Added a shared workspace fallback label path so generic ids are not exposed in the topbar, sidebar grouping, or sidebar search fallback while workspace data is still pending; once workspace data arrives, the root folder label still wins.
- Kept the Settings section list aligned with the V1 target list used by the current parity tests and user reference, while preserving the existing secondary-page launcher for system-level pages instead of flattening MCP/plugins/commands/hooks/runtime/triggers into the first-level settings list.
- Tightened the Appearance theme preview cards to a stable aspect ratio so the drawer viewport does not squash them vertically; the rest of the Appearance page remains a real settings surface backed by local appearance persistence rather than placeholder controls.

### Verification
- V2 pre-fix Appearance screenshot captured at `.tmp/frontend-appearance-audit/v2-appearance-before.png`.
- Actual V1 settings Appearance screenshot and metrics captured at `.tmp/frontend-appearance-audit/v1-settings-appearance.png` and `.tmp/frontend-appearance-audit/v1-settings-appearance-metrics.json`.
- Final V2 Appearance screenshot and metrics captured at `.tmp/frontend-appearance-audit/v2-appearance-final.png` and `.tmp/frontend-appearance-audit/v2-appearance-final-metrics.json`.
- Final V2 browser shell metrics on `http://127.0.0.1:8000/app/` loaded rebuilt assets `index-DWqYPBtn.js` and `index-C7JYNZNZ.css`, kept `body.scrollHeight === body.clientHeight === 720`, reported `visibleDefaultLabels: 0`, and showed workspace group titles `["agent-teams", "agent-teams-issue-401", "desktop"]`.
- Final V2 settings metrics showed first-level nav `["外观", "通用", "语音", "通知", "模型", "角色", "编排", "Web", "ClawHub", "代理", "远端工作区", "环境变量", "系统"]`, active nav `["外观"]`, settings body `overflowY: "auto"`, page body `overflowY: "hidden"`, and theme preview cards sized about `223x154`.
- `npm test -- src/test/AppShell.test.tsx src/test/SessionsSidebar.test.tsx src/test/ShellLayoutCss.test.ts src/test/SettingsNavigationParity.test.ts` in `frontend/app` passed with 49 tests.
- `npm run typecheck` in `frontend/app` passed.
- `npm run lint` in `frontend/app` passed.
- `npm run build` in `frontend/app` passed and refreshed `frontend/dist/app` with rebuilt assets `index-DWqYPBtn.js` and `index-C7JYNZNZ.css`.

### Reviewer
- Main-agent browser screenshot/metrics verification completed for this Settings Appearance cold-load slice. No full Settings subsystem completion is claimed; remaining work includes detailed V1/V2 pass over all settings secondary pages, save/error states, dark-mode Appearance verification, and reviewer sign-off.

## 2026-06-25 Terminal Replay Stream Closure Batch

### Scope
- Continued the AG-UI stream/replay hardening pass for refresh and recovery edges.
- `streamClient` now closes and reports `onClosed` immediately when a replay stream is opened for tracked runs that are already terminal in the local runtime state.
- Late messages arriving after a stream has been closed are ignored before payload parsing, preventing stale EventSource callbacks from surfacing malformed-event noise after terminal cleanup.
- Covered both single-run and multiplexed replay targets so recovery does not keep a stream active while waiting for the backend to resend duplicate terminal events.

### Verification
- `npm test -- src/test/streamClient.test.ts src/test/RunStreamController.test.tsx` in `frontend/app` passed with 35 tests, including the new terminal replay closure regressions plus the existing reconnect/resume controller coverage.
- `npm run build` in `frontend/app` passed, including typecheck, desktop build, and Vite production build; Vite refreshed `frontend/dist/app` with rebuilt asset `index-Cb3B_Qvx.js`.

### Reviewer
- Main-agent targeted verification completed for this terminal replay stream closure slice. No AG-UI Runtime Stream subsystem completion is claimed; remaining work includes real browser stream/replay scenarios, refresh-during-stream recovery under actual SSE timing, interrupted stream resume validation, message timeline polish, and reviewer sign-off.

## 2026-06-25 V1 Framework Follow-Up Layout Batch

### Scope
- Re-opened live V1 and V2 in the browser before editing and captured screenshots/metrics for the shell frame, sidebar, message column, round rail, and composer.
- Fixed generic workspace labels so a workspace named or identified as `default` no longer leaks into the topbar or sidebar group title; root folder labels such as `agent-teams` now win even when the backend record carries a generic name.
- Moved the V2 desktop sidebar default back to the V1 width of 220px and migrated old generated V2 default widths, while preserving deliberate resized widths.
- Re-centered the timeline reading column when the round rail is present instead of pushing it right with a fixed rail margin; the round rail remains overlaid without covering messages.
- Expanded the composer back to a V1-wide bottom work area rather than a narrow centered card, while keeping the compact controls and fixed one-screen shell.

### Verification
- V1 reference screenshot and metrics captured at `.tmp/frontend-framework-followup/v1-reference-devtools.png` and `.tmp/frontend-framework-followup/v1-reference-metrics.json`.
- V2 pre-fix screenshot and metrics captured at `.tmp/frontend-framework-followup/v2-before-devtools.png` and `.tmp/frontend-framework-followup/v2-before-metrics-devtools.json`.
- V2 final wide screenshot and metrics captured at `.tmp/frontend-framework-followup/v2-final-layout-devtools.png` and `.tmp/frontend-framework-followup/v2-final-layout-metrics.json`.
- V2 final desktop viewport screenshot and metrics captured at `.tmp/frontend-framework-followup/v2-final-1280x720.png` and `.tmp/frontend-framework-followup/v2-final-1280x720-metrics.json`.
- Final wide metrics on `http://127.0.0.1:8000/app/` showed `body.scrollHeight === body.clientHeight === 943`, sidebar width `220`, workspace left `225.998`, timeline row left `591.328`, composer inner width `1459.349`, `railOverlapPx: 0`, `visibleDefaultLabels: []`, topbar title `agent-teams`, and workspace group titles `["agent-teams", "agent-teams-issue-401", "desktop"]`.
- Final desktop viewport metrics showed fixed body scrolling, sidebar width `220`, composer inner width `1148.238`, `railOverlapPx: 0`, and `visibleDefaultLabels: 0`.
- `npm test -- src/test/AppShell.test.tsx src/test/uiStore.test.ts src/test/ShellLayoutCss.test.ts src/test/MessageTimeline.test.tsx` in `frontend/app` passed with 73 tests.
- `npm run build` in `frontend/app` passed, including typecheck, desktop build, and Vite production build; Vite refreshed `frontend/dist/app` with rebuilt assets `index-CThlZvNI.js` and `index-cwD4NfMS.css`.

### Reviewer
- Main-agent browser screenshot/metrics verification completed for this framework follow-up slice. No full Shell, Message Timeline, Settings, or AG-UI Runtime Stream subsystem completion is claimed; remaining work includes detailed message rendering polish, live stream/replay browser scenarios, settings secondary pages, and reviewer sign-off.

## 2026-06-25 Message Timeline Tool Summary Follow-Up Batch

### Scope
- Rechecked the live V2 message timeline after the user-marked screenshot instead of relying on source-level assumptions.
- Kept persisted tool calls, tool results, validation failures, and approval rows collapsed by default while adding a one-line human-readable summary beside each tool title.
- Extracted concise call summaries from common tool arguments such as `command`, `cmd`, `path`, `query`, `pattern`, and `url`, so rows such as `glob {"pattern":"*"}` render as `glob *` instead of exposing raw JSON punctuation.
- Preserved full tool details behind the existing disclosure control; expanding a row still reveals call ids and the complete text body for debugging.
- Left broader streaming/replay completion work open; this batch only reduces tool-heavy timeline noise and protects the collapsed-detail behavior with tests.

### Verification
- V2 pre-fix screenshot and metrics captured at `.tmp/frontend-message-timeline-followup/v2-before-devtools.png` and `.tmp/frontend-message-timeline-followup/v2-before-metrics.json`.
- Final V2 screenshot captured at `.tmp/frontend-message-timeline-followup/v2-after-tool-summary.png`.
- V1 current reference screenshot captured at `.tmp/frontend-message-timeline-followup/v1-reference-current.png`.
- Final V2 browser verification on `http://127.0.0.1:8000/app/` showed body/document height fixed to the viewport (`772 / 772`), `.at-timeline` owning the message scroll, and visible tool summaries such as `工具调用: glob *`, `工具调用: glob .*`, `工具调用: glob **/*`, and `工具错误: grep ...` with full details still behind disclosure rows.
- `npm test -- src/test/MessageTimeline.test.tsx` in `frontend/app` passed with 45 tests.
- `npm run build` in `frontend/app` passed, including typecheck, desktop build, and Vite production build; Vite refreshed `frontend/dist/app` with rebuilt assets `index-CJ96CMJq.js` and `index-CR_s-NpK.css`.

### Reviewer
- Main-agent browser screenshot/metrics verification completed for this message timeline tool-summary slice. No full Message Timeline or AG-UI Runtime Stream subsystem completion is claimed; remaining work includes live stream/replay browser scenarios, refresh-during-stream recovery under actual SSE timing, detailed long-history rendering parity, and reviewer sign-off.

## 2026-06-25 Stream Replay Activity Continuation Batch

### Scope
- Continued the AG-UI stream/replay hardening pass around interrupted-stream recovery.
- Added a stream activity callback for valid tracked run events, separate from state changes, so replayed duplicate events can still prove the native EventSource connection resumed.
- Updated the run stream controller to cancel pending manual reconnect fallback when tracked activity arrives, while still keeping duplicate events out of rendered runtime state.
- Preserved the existing state-change path so normal streamed events continue to cancel reconnect timers and update active run ids.
- Left broader browser-level live stream/replay verification open; this batch targets the reducer/controller boundary that prevents needless reconnect churn during replay resume.

### Verification
- `npm test -- src/test/streamClient.test.ts src/test/RunStreamController.test.tsx src/test/runtimeReducers.test.ts` in `frontend/app` passed with 50 tests.
- `npm run build` in `frontend/app` passed, including typecheck, desktop build, and Vite production build; Vite refreshed `frontend/dist/app` with rebuilt asset `index-DDLpdHYG.js`.
- No screenshot was captured for this batch because it changed non-visual stream runtime behavior; browser stream/replay scenarios remain required before subsystem completion.

### Reviewer
- Main-agent targeted verification completed for this replay activity continuation slice. No AG-UI Runtime Stream subsystem completion is claimed; remaining work includes real browser stream/replay scenarios, refresh-during-stream recovery under actual SSE timing, interrupted stream resume validation against the backend, and reviewer sign-off.

## 2026-06-25 Message Timeline Layout Leak Closure Batch

### Scope
- Rechecked the live V2 message timeline after the user-marked screenshot and treated the visible shell as the source of truth for this batch.
- Filtered closed runtime replay rows once their matching persisted run has hydrated, preventing old runtime chunks from stacking over saved messages after refresh.
- Dropped direct AG-UI protocol placeholder payloads where `payload.message` is only the literal string `message`, so timeline rows no longer expose a naked `message` label as content.
- Reworked message rows as a stable two-column grid so per-message actions, including copy, stay attached to their message row instead of floating away from the content column.
- Nudged the virtualizer after programmatic bottom and anchor scroll restoration so refreshed long sessions repopulate visible rows instead of leaving the viewport visually detached from the timeline state.

### Verification
- `npm test -- MessageTimeline.test.tsx ShellLayoutCss.test.ts` in `frontend/app` passed with 53 tests, including regression coverage for protocol placeholder filtering, hydrated runtime-row suppression, and message action layout CSS.
- `npm run build` in `frontend/app` passed, including typecheck, desktop build, and Vite production build; Vite refreshed `frontend/dist/app` with rebuilt assets `index-BVyJunYW.js` and `index-Byg9iS88.css`.
- Final live browser metrics on `http://127.0.0.1:8000/app/` showed the document fixed to the viewport (`body.scrollHeight === document.scrollHeight === 720`), `.at-chat-view` owning a fixed-height shell, `.at-timeline` owning message scroll with `overflowY: "auto"`, the composer fixed inside the one-screen layout, `nakedMessageCount: 0`, and the visible copy action in message grid column `2`.
- In-app browser screenshot capture repeatedly timed out with `Page.captureScreenshot`; no screenshot artifact is claimed for this batch, and the next visual pass should start by restoring a reliable screenshot/V1 comparison loop before more detail work.

### Reviewer
- Main-agent browser metrics verification completed for this visible message-layout closure slice. No full Message Timeline, Shell, Settings, or AG-UI Runtime Stream subsystem completion is claimed; remaining work includes reliable screenshot comparison, detailed V1/V2 message rendering parity, and real stream/replay/resume browser scenarios.

## 2026-06-25 V1/V2 Theme Parity Audit Batch

### Scope
- Re-scanned the frontend rewrite goal documents before editing and selected a gap tied to the broader parity goal rather than a single user screenshot.
- Restored a reliable screenshot path with Playwright for the current local V1 and V2 routes after the in-app browser screenshot command kept timing out.
- Captured current V1 and V2 1280x720 screenshots and layout metrics before the fix, confirming that V1 opened in the dark product theme while V2 opened light under the same empty preference state.
- Updated the V2 UI store to read the V1 `agent_teams_theme` key when the new `agentTeams.themeMode` key is absent, and to default to V1's dark theme when neither key exists.
- Synchronized V2 theme changes back to the V1 key so switching between `/` and `/app/` preserves the user's theme instead of splitting the product into two independent preferences.

### Verification
- Pre-fix V1 and V2 screenshots plus metrics captured at `.tmp/frontend-goal-audit-current/v1-1280x720.png`, `.tmp/frontend-goal-audit-current/v2-1280x720.png`, `.tmp/frontend-goal-audit-current/v1-metrics.json`, and `.tmp/frontend-goal-audit-current/v2-metrics.json`.
- Final V1 and V2 screenshots plus metrics captured at `.tmp/frontend-goal-audit-theme-parity/v1-1280x720.png`, `.tmp/frontend-goal-audit-theme-parity/v2-1280x720.png`, `.tmp/frontend-goal-audit-theme-parity/v1-metrics.json`, and `.tmp/frontend-goal-audit-theme-parity/v2-metrics.json`.
- Final V2 metrics on `http://127.0.0.1:8000/app/` loaded rebuilt asset `index-B_f5wtrc.js`, reported `htmlDataset.theme: "dark"`, `htmlDataset.themeMode: "dark"`, `body.scrollHeight === body.clientHeight === 720`, `.at-timeline` owning message scroll, and `nakedMessageCount: 0`.
- Browser interaction verification recorded in `.tmp/frontend-goal-audit-theme-parity/theme-toggle-localstorage.json` showed an empty preference opening dark, a theme-toggle click writing both `agentTeams.themeMode: "light"` and `agent_teams_theme: "light"`, and a second click restoring both keys to `"dark"`.
- `npm test -- uiStore.test.ts` in `frontend/app` passed with 6 tests.
- `npm run build` in `frontend/app` passed, including typecheck, desktop build, and Vite production build; Vite refreshed `frontend/dist/app` with rebuilt asset `index-B_f5wtrc.js`.

### Reviewer
- Main-agent screenshot and browser interaction verification completed for this V1/V2 theme parity slice. No subsystem completion is claimed; remaining work includes browser-level stream/replay/refresh recovery scenarios, detailed message rendering parity, settings secondary-page review, and paired subagent review before any checklist row can be marked complete.

## 2026-06-25 V2 Browser Stream Recovery Scenario Batch

### Scope
- Re-scanned the frontend rewrite goal and selected a gap from the global checklist rather than continuing local visual polish.
- Added a real V2 `/app/` browser integration scenario for the AG-UI stream and recovery path.
- Served the built React/Ant Design app from `frontend/dist/app`, mocked only the `/api/*` backend contract, and installed a browser-native mock `EventSource` before app bootstrap so Composer, MessageTimeline, RecoveryBar, query invalidation, and stream controller logic all run through the actual shell.
- Covered creating a run from the V2 composer, receiving live `text_delta` output, refreshing while the run is active, hydrating the saved first chunk, and auto-opening the recovered EventSource from `last_event_id`.
- Asserted the recovered stream URL carries `after_event_id=2`, the persisted first chunk remains rendered exactly once after refresh, the post-refresh chunk appears from the resumed stream, and `run_completed` closes the EventSource.
- Left full Runtime Stream completion open; this is the first browser-level refresh recovery scenario and still needs backend-backed SSE timing, interrupted network retry, stop/resume, approvals/questions, and reviewer sign-off coverage.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 1 test.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured for this batch because the committed change is browser-level runtime coverage rather than a visual UI change; the next visual framework pass should continue using paired V1/V2 screenshots.

### Reviewer
- Main-agent browser integration verification completed for this refresh recovery slice. No AG-UI Runtime Stream, Run Recovery, or Message Timeline subsystem completion is claimed; remaining work includes real backend SSE replay, interrupted stream resume, stop/resume, approvals/questions during active recovery, and detailed message rendering parity.

## 2026-06-25 AG-UI HTTP Stream Replay Integration Batch

### Scope
- Re-scanned the Runtime Stream and Run Recovery checklist after the mocked V2 browser recovery scenario and targeted the next weakest evidence layer.
- Added a real backend API integration test for `/api/ag-ui/runs` and `/api/ag-ui/runs/{run_id}/events` instead of another mocked EventSource scenario.
- Created a manual run through the AG-UI-facing endpoint, streamed the actual AG-UI SSE output until `run_completed`, and verified each SSE `event:` name matches the JSON `type` field.
- Reconnected with the `Last-Event-ID` header from the first streamed event and verified the replay returned exactly the later event ids and Relay event types, proving the ASGI router, AG-UI mapper, SSE formatter, event log, and run service replay path work together.
- Left full Runtime Stream completion open; this does not yet cover interrupted network reconnect under browser EventSource timing, multiplexed real backend replay, stop/resume UI flows, approvals/questions, or reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/api/test_ag_ui_http_stream.py` passed with 1 test.
- `uv run --extra dev ruff check tests/integration_tests/api/test_ag_ui_http_stream.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/api/test_ag_ui_http_stream.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/api/test_ag_ui_http_stream.py` passed with 0 errors.
- No screenshot was captured for this batch because it adds backend protocol coverage only; the next visual or interaction pass should resume paired V1/V2 browser evidence.

### Reviewer
- Main-agent backend integration verification completed for this AG-UI replay slice. No AG-UI Runtime Stream subsystem completion is claimed; remaining work includes real browser interrupted-stream reconnect, multiplexed backend replay, stop/resume and recovery UI actions, approvals/questions, and reviewer sign-off.

## 2026-06-25 V2 Active Run Control Recovery Cache Batch

### Scope
- Continued from the global Runtime Gate and Composer/Run Controls checklist rather than repeating protocol-only stream coverage.
- Extended the real V2 `/app/` browser integration scenario to exercise active-run controls in the built shell.
- Covered queued runtime injection, interrupt runtime injection, and stop-run actions against the AG-UI endpoint shapes from the V2 composer while a mocked EventSource is open.
- Caught a real stop-run race where the Stop mutation cleared the stream controller but stale recovery cache still contained a running `active_run`, letting RecoveryBar immediately reconnect before the fresh recovery refetch arrived.
- Fixed the race by clearing the current session recovery query's `active_run` cache synchronously on Stop success before calling `clearRunStream()`, while still invalidating recovery so a backend-reported recoverable stopped run can reappear as a Resume action.
- Rebuilt the V2 app bundle so `frontend/dist/app` carries the fix.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 2 tests.
- `npm test -- src/test/Composer.test.tsx src/test/RecoveryBar.test.tsx src/test/RunStreamController.test.tsx` in `frontend/app` passed with 84 tests.
- `npm run build` in `frontend/app` passed, including typecheck, desktop build, and Vite production build; Vite refreshed `frontend/dist/app` with rebuilt asset `index-Du6q0nKX.js`.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured for this batch because the committed change fixes runtime control behavior rather than visual structure; the next visual pass should resume paired V1/V2 screenshots.

### Reviewer
- Main-agent browser integration and targeted test verification completed for this active-run controls slice. No Composer, Run Recovery, or AG-UI Runtime Stream subsystem completion is claimed; remaining work includes real backend stop/resume browser flows, approval and user-question recovery actions, multiplexed backend replay, and reviewer sign-off.

## 2026-06-25 V2 Recoverable Resume Browser Batch

### Scope
- Continued from the global Run Recovery and AG-UI Runtime Stream checklist instead of staying on message-layout polish.
- Extended the V2 `/app/` browser integration harness with a stopped active run whose recovery snapshot reports `should_show_recover: true` and `last_event_id: 7`.
- Covered the real RecoveryBar resume action against the built V2 shell, including the POST to `/api/ag-ui/runs/run-v2-stream:resume`.
- Verified that Resume opens the run EventSource from the saved checkpoint with `after_event_id=7`, then accepts a `run_resumed` event and renders the resumed `text_delta` chunk.
- Preserved the active-run controls check after resume by asserting that the Stop control appears once the stream is live again.
- Left full Run Recovery and Runtime Stream completion open; this batch does not yet cover real backend resume timing, approvals/questions during recoverable runs, multiplexed backend replay, or reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 3 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured for this batch because it adds browser-level runtime recovery coverage rather than visual layout changes; the next visual-framework pass should resume paired V1/V2 screenshots before detailed styling work.

### Reviewer
- Main-agent browser integration verification completed for this recoverable-resume slice. No Run Recovery or AG-UI Runtime Stream subsystem completion is claimed; remaining work includes backend-backed resume/replay browser evidence, approval and user-question recovery actions, multiplexed stream replay, and reviewer sign-off.

## 2026-06-25 V2 Recovery Approval And Question Browser Batch

### Scope
- Continued the Run Recovery checklist from the recovery-action gap rather than switching to unrelated UI polish.
- Extended the built V2 `/app/` browser integration harness with recoverable stopped runs that contain pending tool approvals and pending user questions.
- Covered the no-standalone-Resume behavior when an approval or question is already the required recovery action.
- Verified that resolving an explicit ACP option first resumes the disconnected run from `last_event_id` with `after_event_id=7`, then POSTs the selected approval payload to `/api/ag-ui/runs/run-v2-stream/tool-approvals/call-v2-approval:resolve`.
- Verified that answering a multiple-choice user question with the reserved Other supplement first resumes the disconnected run from the saved checkpoint, then POSTs the exact answer selections and supplement to `/api/ag-ui/runs/run-v2-stream/questions/question-v2-recovery:answer`.
- Left full Run Recovery completion open; remaining work includes backend-backed approval/question timing, background tasks, paused subagent actions, real SSE interruption recovery, and reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 5 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured for this batch because the committed change is browser-level recovery action coverage rather than a visual layout change.

### Reviewer
- Main-agent browser integration verification completed for this approval/question recovery slice. No Run Recovery or AG-UI Runtime Stream subsystem completion is claimed; remaining work includes backend-backed action recovery, background/paused-subagent recovery, multiplexed stream replay, and paired reviewer sign-off.

## 2026-06-25 V2 Background And Paused Recovery Browser Batch

### Scope
- Continued the Run Recovery checklist from the remaining background-task and paused-subagent gaps.
- Extended the built V2 `/app/` browser integration harness with an active background command task and a paused subagent recovery snapshot.
- Verified that a background task with no active main run keeps the RecoveryBar visible, renders the task count, command, cwd, and running state, and opens the run stream through the existing recovery continuation path.
- Covered background task collapse/expand behavior in the actual V2 shell and verified that Stop calls `/api/runs/run-v2-stream/background-tasks/background-task-v2:stop`.
- Verified that a paused subagent recovery snapshot renders the follow-up state, including role, instance id, task id, and reason, while keeping the standalone Resume action hidden.
- Left full Run Recovery completion open; remaining work includes backend-backed timing for these actions, real interrupted SSE behavior, multiplexed stream replay, and reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 7 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured for this batch because the committed change adds browser-level recovery behavior evidence rather than a visual layout change.

### Reviewer
- Main-agent browser integration verification completed for this background/paused recovery slice. No Run Recovery or AG-UI Runtime Stream subsystem completion is claimed; remaining work includes backend-backed recovery timing, interrupted/multiplexed stream replay, and paired reviewer sign-off.

## 2026-06-25 AG-UI Multiplex Replay Integration Batch

### Scope
- Moved from V2 mocked browser recovery evidence to a real backend AG-UI Runtime Stream gap.
- Added an integration test for `/api/ag-ui/runs/events`, the AG-UI multiplex stream endpoint.
- Created two manual AG-UI runs through the public `/api/ag-ui/runs` endpoint and streamed each single-run event stream to terminal so the real event log, mapper, SSE formatter, and run service were exercised before replay.
- Replayed both runs through the multiplex endpoint with independent `run_id` and `after_event_id` query values, using a nonzero offset for the first run and zero for the second run.
- Verified that the first run replays only events after its offset, the second run replays from the beginning, each SSE `event:` name still matches the JSON `type`, and both runs reach terminal state before the multiplex stream is accepted as closed.
- Left full AG-UI Runtime Stream completion open; remaining work includes browser interrupted-network reconnect timing, frontend handling of real multiplex EventSource streams, event-type breadth, and reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/api/test_ag_ui_http_stream.py` passed with 2 tests.
- `uv run --extra dev ruff check tests/integration_tests/api/test_ag_ui_http_stream.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/api/test_ag_ui_http_stream.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/api/test_ag_ui_http_stream.py` passed with 0 errors.
- No screenshot was captured for this batch because the committed change is backend protocol coverage rather than visual UI behavior.

### Reviewer
- Main-agent backend integration verification completed for this multiplex replay slice. No AG-UI Runtime Stream subsystem completion is claimed; remaining work includes interrupted browser replay, real frontend multiplex handling, broader event coverage, and paired reviewer sign-off.

## 2026-06-25 V2 Browser Multiplex Recovery Stream Batch

### Scope
- Continued the AG-UI Runtime Stream checklist at the frontend boundary after adding backend multiplex replay evidence.
- Extended the built V2 `/app/` browser integration harness with a background subagent task that produces two recovery stream targets: the parent run and the subagent run.
- Verified that RecoveryBar opens the AG-UI multiplex EventSource endpoint `/api/ag-ui/runs/events` with both `run_id` values instead of falling back to a single-run stream.
- Emitted text deltas for both tracked runs through the same browser EventSource and verified both chunks render in the live V2 timeline.
- Emitted terminal events for both tracked runs and verified the multiplex EventSource closes only after both run targets are terminal.
- Left full AG-UI Runtime Stream completion open; remaining work includes interrupted-network reconnect timing, broader event-type coverage in live browser flows, and reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 8 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured for this batch because the committed change is browser-level runtime stream behavior evidence rather than visual layout work.

### Reviewer
- Main-agent browser integration verification completed for this frontend multiplex recovery slice. No AG-UI Runtime Stream subsystem completion is claimed; remaining work includes interrupted browser replay, broader event coverage, and paired reviewer sign-off.

## 2026-06-25 V2 Settings Agent Runtime Evidence Batch

### Scope
- Re-checked the Settings parity target against the V1 settings shell before changing code, especially the V1 Agent Runtime tab and ACP registry child view.
- Preserved the current V2 Settings navigation shape: MCP, Plugins, Commands, Hooks, Agent Runtime, GitHub, and Triggers remain behind the System secondary page instead of being added as new top-level Settings entries.
- Added component coverage for creating a stdio Agent Runtime from the System -> Agent Runtime secondary page and verified the real `saveAgentRuntime` payload includes the agent id, command, args, protocol, and transport.
- Added destructive-action coverage for deleting an existing Agent Runtime through the antd confirmation flow before `deleteAgentRuntime` is called.
- Added ACP registry child-view coverage for opening the registry from Agent Runtime and calling the real registry refresh client.
- Left Settings completion open; remaining work includes reviewer pass over all settings tabs, deeper visual comparison against V1, and more edge-state/error coverage for high-risk forms.

### Verification
- `npm test -- src/test/SettingsDrawer.test.tsx -t "creates and deletes agent runtimes|refreshes the ACP registry"` passed with 2 tests.
- `npm test -- src/test/SettingsDrawer.test.tsx src/test/SettingsNavigationParity.test.ts` passed with 17 tests.
- No screenshot was captured for this batch because the committed change is targeted behavior evidence and does not alter visible UI layout.

### Reviewer
- Main-agent parity inspection and component verification completed for this Agent Runtime settings slice. No Settings subsystem completion is claimed.

## 2026-06-25 V2 Shell Sidebar Width Parity Batch

### Scope
- Re-checked the Application Shell checklist and compared the current V2 shell against the saved V1 reference screenshot and V1 CSS.
- Verified V1 uses a 280px desktop sidebar in `frontend/dist/css/layout.css`, while V2 had drifted to a 220px default.
- Restored the V2 desktop sidebar default to 280px while preserving the existing resize min/max behavior.
- Migrated previously generated 220/248/260/274 localStorage sidebar widths back to the V1-sized default so already-open developer browsers do not stay stuck on the narrow layout.
- Reloaded the real `/app/` page after build and verified the sidebar renders at 280px, document scroll height equals viewport height, body overflow remains hidden, and the workspace remains a fixed-height frame.
- Captured a current V2 shell screenshot at `.tmp/v2-shell-layout-sidebar-280.png` for visual comparison against `frontend-debug-v1-reference.png`.
- Left Application Shell completion open; remaining work includes broader desktop/narrow screenshot pairs, sidebar resize browser flow, final reviewer pass, and continued density comparison for timeline/composer details.

### Verification
- `npm test -- src/test/uiStore.test.ts src/test/AppShell.test.tsx src/test/ShellLayoutCss.test.ts` passed with 32 tests.
- `npm run build` passed and refreshed `frontend/dist/app`.
- Browser verification on `http://127.0.0.1:8000/app/` after reload reported `sidebar.width = 280`, `documentScrollHeight = documentClientHeight = 720`, and `bodyOverflow = hidden`.

### Reviewer
- Main-agent visual and browser verification completed for this shell width parity slice. No Application Shell subsystem completion is claimed.

## 2026-06-25 V2 Shell Sidebar Resize Browser Batch

### Scope
- Re-checked the Application Shell checklist after the 280px sidebar parity pass and targeted the remaining sidebar resize browser-flow gap.
- Added a focused browser integration test for the built `/app/` shell that loads the real V2 bundle, drags the sidebar resizer with the mouse, verifies the sidebar width reaches 220px, reloads the page, and verifies the manually resized width persists.
- Fixed a real interaction regression found by that browser test: the V1-style 6px resize gutter lived at `right: -6px`, but `.at-sidebar { overflow: hidden; }` clipped the clickable gutter. The sidebar now leaves overflow visible while `.ant-layout-sider-children` continues to own content clipping.
- Replaced the broad legacy-width migration with a one-time migration flag so old generated 220/248/260/274 defaults still move to 280, while a user-selected 220px width remains stable after refresh.
- Rebuilt `frontend/dist/app` and verified the live in-app `/app/` page still reports a 280px default sidebar, a visible 6px `col-resize` resizer, `documentScrollHeight = documentClientHeight = 720`, and `bodyOverflow = hidden`.
- Captured `.tmp/v2-shell-resize-live-after.png` after the live-page check.
- Left Application Shell completion open; remaining work still includes narrow viewport screenshot pairs, broader shell visual reviewer pass, and timeline/composer density comparison.

### Verification
- `npm test -- src/test/uiStore.test.ts src/test/AppShell.test.tsx src/test/ShellLayoutCss.test.ts` passed with 33 tests.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py` passed with 1 test.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_shell_layout.py` passed with 0 errors.
- `npm run lint` passed.

### Reviewer
- Main-agent browser interaction verification completed for this sidebar resize slice. No Application Shell subsystem completion is claimed.

## 2026-06-25 V2 Interrupted Stream Browser Reconnect Batch

### Scope
- Re-checked the AG-UI Runtime Stream checklist and targeted the remaining browser-level interrupted-stream recovery gap instead of adding more shell polish.
- Extended the built V2 `/app/` browser recovery harness with a mock EventSource transport interruption while a run is actively streaming.
- Covered the end-to-end controller path where the first EventSource receives `run_started` and a `text_delta` through event id 2, then dispatches a transport error.
- Verified the V2 run stream controller closes the interrupted EventSource after the reconnect grace window and opens a new `/api/ag-ui/runs/run-v2-stream/events` stream with `after_event_id=2`, derived from the local runtime reducer state.
- Verified a later `text_delta` from the replacement EventSource continues rendering without duplicating the earlier chunk, and `run_completed` closes the stream.
- Left full AG-UI Runtime Stream completion open; remaining work includes backend-backed interrupted SSE timing, broader event-type coverage during interruption, and reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 9 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured for this batch because it adds browser-level runtime interruption coverage rather than visible layout changes.

### Reviewer
- Main-agent browser integration verification completed for this interrupted-stream reconnect slice. No AG-UI Runtime Stream subsystem completion is claimed.

## 2026-06-25 V2 Active Stream Session Switch Browser Batch

### Scope
- Re-checked the Sessions And Projects checklist after the interrupted-stream reconnect pass and targeted the required Playwright flow for switching sessions during an active stream.
- Extended the built V2 `/app/` browser recovery harness with a second sidebar session served by the same mocked backend contract.
- Covered the active-stream path where the first session creates a run, receives `run_started` plus a live `text_delta`, and shows the Stop control.
- Switched to the second session from the real V2 sidebar while the first session's stream was still open.
- Verified the stream controller closed the old EventSource, the first session's live chunk disappeared from the selected timeline, the second session's historical message rendered, and the composer returned to the normal Send state.
- Left Sessions And Projects completion open; remaining work includes backend-backed session switch timing, unavailable session handling, project reload/back flows, and reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 10 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured for this batch because it adds browser-level stream/session isolation coverage rather than visible layout changes.

### Reviewer
- Main-agent browser integration verification completed for this active-stream session-switch slice. No Sessions And Projects or AG-UI Runtime Stream subsystem completion is claimed.

## 2026-06-25 V2 Message Export Browser Batch

### Scope
- Re-checked the Resource And Assistive Features checklist and targeted the missing built-shell browser evidence for message export as HTML and PNG.
- Added a focused V2 `/app/` browser integration flow that opens the real top-bar export menu, downloads the selected session transcript as HTML, reads the saved file back, and verifies the session title, round prompt, and assistant transcript content.
- Extended the same browser flow to reopen the export menu, download the PNG transcript, save the file, and verify the PNG signature bytes.
- Verified export uses the real `/api/sessions/{session_id}/rounds` path from the shell rather than static fixture content by asserting the export actions add two rounds requests after the shell's initial round hydration.
- Fixed a real V2 top-bar interaction bug found by the browser test: the export button tooltip stayed open over the dropdown and intercepted menu clicks. The export menu now controls dropdown open state and hides the tooltip while the menu is open.
- Rebuilt `frontend/dist/app` so the browser harness and served app use the fixed export menu bundle.
- Left Resource And Assistive Features completion open; remaining work still includes image preview screenshot evidence, notification/diagnostic availability checks, and reviewer sign-off.

### Verification
- `npm run test -- --run src/test/MessageExportMenu.test.tsx src/test/messageExport.test.ts` passed with 12 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py` passed with 2 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_shell_layout.py` passed with 0 errors.
- No screenshot was captured for this batch because it fixes top-bar export interaction and browser download coverage rather than visible layout structure.

### Reviewer
- Main-agent browser integration verification completed for this message export slice. No Resource And Assistive Features subsystem completion is claimed.

## 2026-06-25 V2 Image Preview Browser Batch

### Scope
- Re-checked the Resource And Assistive Features checklist after the message export browser pass and targeted the remaining image preview browser/screenshot evidence.
- Extended the built V2 `/app/` shell browser harness with a selected session message containing a real image `media_ref` part.
- Verified the timeline renders the image preview and filename inside the fixed-height V2 shell rather than dropping media-only parts or reducing them to plain text.
- Verified the actual Ant Image preview path by clicking the visible preview mask, waiting for `.ant-image-preview-wrap`, and asserting the enlarged preview image remains accessible by filename.
- Captured screenshot evidence at `.tmp/frontend-v2-resource/v2-image-preview-open.png`; the screenshot shows the fixed shell, image thumbnail, filename, preview overlay close affordance, and composer remaining anchored.
- Left Resource And Assistive Features completion open; notification/diagnostic availability checks, broader media-type preview, and reviewer sign-off remain open.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py` passed with 3 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_shell_layout.py` passed with 0 errors.
- No frontend build was needed because this batch adds browser evidence for existing V2 image preview behavior without changing renderer source.

### Reviewer
- Main-agent browser integration and screenshot inspection completed for this image preview slice. No Resource And Assistive Features subsystem completion is claimed.

## 2026-06-25 V2 Sidebar Module Entry Browser Batch

### Scope
- Re-checked the V2 frontend parity checklist after the resource-preview pass and targeted a broader Application Shell gap: sidebar entries needed built-shell browser evidence that they still open real secondary module pages instead of placeholder or flattened first-level content.
- Added a focused browser integration flow for the built `/app/` shell that asserts the V1-aligned sidebar module set remains exactly `Search`, `Skills`, `Automation`, `Connectors`, `Board`, and `Memory`.
- Clicked each sidebar module entry through the real V2 shell and verified the expected module surface appears: session search, ClawHub skills market, automation project detail, connector detail plus runtime tools, board TODO cards, and memory row/detail.
- Extended the shell browser mock backend with the minimum real API contracts for skills, automation, connectors, runtime tools, board TODOs, and memory detail, then asserted each module hit its expected `/api/*` route.
- Captured screenshot evidence at `.tmp/frontend-v2-resource/v2-sidebar-modules-memory.png`; manual inspection confirmed the fixed shell, V1-shaped sidebar, selected secondary Memory page, and non-flattened detail surface render in the same viewport.
- Left Application Shell completion open; remaining work still includes broader desktop/narrow screenshot comparison, final V1/V2 visual review, and deeper message timeline/composer parity.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k sidebar_module_entries` passed with 1 test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py` passed with 4 tests.
- No frontend build was needed because this batch adds browser evidence for existing V2 sidebar module routing without changing renderer source.

### Reviewer
- Main-agent browser integration and screenshot inspection completed for this sidebar module entry slice. No Application Shell subsystem completion is claimed.
