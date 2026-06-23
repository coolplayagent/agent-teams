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
