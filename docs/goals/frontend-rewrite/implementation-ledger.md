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

## 2026-06-25 V2 Stream Last-Event-ID Browser Batch

### Scope
- Re-checked the AG-UI Runtime Stream checklist after the sidebar module browser pass and targeted a replay/resume edge that had unit evidence but lacked built-shell browser evidence.
- Extended the V2 `/app/` browser stream harness so mock SSE messages can carry an explicit browser `lastEventId` independently from the payload `event_id`.
- Added an interrupted-stream flow where a live `text_delta` arrives with `event_id: null` in the payload but `Last-Event-ID = 2` from the SSE frame.
- Verified the real V2 stream client reduces that chunk, updates the local run cursor from the SSE id, handles a transport interruption, closes the stale EventSource, and reconnects to `/api/ag-ui/runs/run-v2-stream/events?after_event_id=2`.
- Verified the resumed stream continues rendering later chunks without duplicating the pre-interruption text, then closes on `run_completed`.
- Left full AG-UI Runtime Stream completion open; remaining work still includes broader event-type browser coverage, backend-backed interrupted timing, and paired reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k sse_last_event_id` passed with 1 test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 11 tests.
- No screenshot was captured because this batch adds browser-level stream cursor/replay behavior evidence rather than visible layout changes.

### Reviewer
- Main-agent browser integration verification completed for this Last-Event-ID resume slice. No AG-UI Runtime Stream subsystem completion is claimed.

## 2026-06-25 V2 Narrow Shell Overlay Browser Batch

### Scope
- Re-checked the Application Shell checklist after the stream cursor pass and targeted the missing narrow viewport browser/screenshot evidence.
- Added a built `/app/` browser flow at a 390px viewport that verifies the V2 shell enters the narrow overlay mode instead of letting the sidebar resize the workspace.
- Verified the document keeps a fixed one-page frame on narrow screens: `body` remains overflow-hidden, document height equals the viewport height, document width does not exceed the viewport, and the workspace remains full width behind the sidebar overlay.
- Verified the sidebar overlay behavior through real controls: the sidebar scrim is visible, the resize gutter is hidden on narrow screens, clicking the scrim closes the sidebar, and the top-bar menu button opens it again.
- Captured screenshot evidence at `.tmp/frontend-v2-shell/v2-narrow-sidebar-overlay.png`; manual inspection confirmed the V1-shaped sidebar overlays the workspace without page scroll or horizontal spill.
- Left Application Shell completion open; remaining work still includes final V1/V2 visual comparison, keyboard focus review, and broader timeline/composer density review.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k narrow_shell` passed with 1 test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py` passed with 5 tests.
- No frontend build was needed because this batch adds browser evidence for existing responsive shell behavior without changing renderer source.

### Reviewer
- Main-agent browser integration and screenshot inspection completed for this narrow shell slice. No Application Shell subsystem completion is claimed.

## 2026-06-25 V2 Observability Browser Scope Batch

### Scope
- Re-checked the Observability checklist after the narrow shell pass and targeted the missing built-shell evidence for the top-bar Observability entry and scope switch.
- Added a focused browser integration flow for the built `/app/` shell that opens Observability from the real top bar rather than mounting the page in isolation.
- Verified the Global scope requests `/api/observability/overview?scope=global&time_window_minutes=1440` and `/api/observability/breakdowns?scope=global&time_window_minutes=1440`, then renders KPI cards plus the breakdown table row.
- Switched to Session scope inside the secondary Observability surface and verified the shell requests the same overview and breakdown endpoints with the selected `scope_id`.
- Verified the Session scope replaces the displayed KPIs and breakdown row without flattening Observability into the first-level sidebar navigation.
- Captured screenshot evidence at `.tmp/frontend-v2-observability/v2-observability-session.png`; manual inspection confirmed the fixed shell, V1-shaped sidebar, top-bar secondary surface, and session KPIs/table render in one viewport.
- Left Observability completion open; remaining work still includes deeper project/spec lineage, feedback/diagnostic surfaces, and reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k observability` passed with 1 test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py` passed with 6 tests.
- No frontend build was needed because this batch adds browser evidence for existing V2 Observability behavior without changing renderer source.

### Reviewer
- Main-agent browser integration and screenshot inspection completed for this Observability scope slice. No Observability subsystem completion is claimed.

## 2026-06-25 V2 Desktop Security Boundary Batch

### Scope
- Re-checked the Desktop checklist after the Observability pass and targeted the missing evidence for renderer isolation, preload scope, and external-link handoff.
- Extracted the Electron BrowserWindow options into a typed desktop helper so the main process uses a testable configuration with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and the explicit preload script path.
- Extracted external-link normalization into a main-process helper that accepts only `http` and `https` URLs before calling Electron `shell.openExternal`.
- Added focused frontend tests that lock the desktop renderer security settings and reject `file:` and `javascript:` external links.
- Preserved the existing backend lifecycle path: the Electron main process still builds the backend plan, waits for health, loads `/app/`, and shows the startup failure document on backend startup failure.
- Left Desktop completion open; remaining work still includes an Electron smoke test for real process launch/quit, startup failure rendering, backend shutdown evidence, and reviewer sign-off.

### Verification
- `npm test -- src/test/desktopBackendPlan.test.ts src/test/desktopSecurity.test.ts` passed with 8 tests.
- `npm run desktop:build` passed.
- `npm run lint` passed.
- No screenshot was captured because this batch covers Electron main-process security boundaries rather than visible renderer layout.

### Reviewer
- Main-agent desktop security verification completed for this slice. No Desktop subsystem completion is claimed.

## 2026-06-25 V2 Electron Smoke Batch

### Scope
- Re-checked the Desktop checklist after the desktop security boundary pass and targeted the missing real Electron startup evidence.
- Added an integration smoke test that launches the packaged Electron main process with a test backend URL, connects over Chrome DevTools Protocol, and verifies the real V2 renderer loads `/app/`.
- Verified the renderer receives only the minimal preload bridge keys (`getBackendStatus`, `getVersion`, `onBackendStatus`, and `openExternal`) while `window.require` and `window.process` remain unavailable.
- Found and fixed a real desktop preload regression: the sandboxed renderer did not receive the ESM `preload.js`. The preload source now uses TypeScript `.cts`, the desktop build emits `preload.cjs`, and the main process loads that CommonJS preload file.
- Added an Electron startup-failure smoke path that serves an unhealthy backend, waits for the desktop timeout, verifies the failure document, and verifies the preload backend status reports `failed`.
- Captured screenshot evidence at `.tmp/frontend-v2-desktop/v2-electron-renderer.png` and `.tmp/frontend-v2-desktop/v2-electron-startup-failed.png`; manual inspection confirmed the renderer shell is not blank and the failure page is visible.
- Left Desktop completion open; remaining work still includes managed local backend process launch/shutdown evidence, open-external IPC behavior under Electron, app version display decisions, and reviewer sign-off.

### Verification
- `npm run desktop:build` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_desktop_smoke.py` passed with 2 tests.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_desktop_smoke.py` passed.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_desktop_smoke.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_desktop_smoke.py` passed with 0 errors.
- `npm test -- src/test/desktopBackendPlan.test.ts src/test/desktopSecurity.test.ts` passed with 8 tests.
- `npm run lint` passed.

### Reviewer
- Main-agent Electron smoke verification and screenshot inspection completed for this slice. No Desktop subsystem completion is claimed.

## 2026-06-25 V2 Electron Managed Backend Lifecycle Batch

### Scope
- Re-checked the Desktop checklist after the Electron smoke pass and targeted the remaining managed local backend lifecycle evidence.
- Added a managed backend command-args override for desktop tests while preserving the default `relay-teams server start --host <host> --port <port>` command.
- Extended the Electron smoke coverage with a temporary backend stub launched by the real Electron main process, proving the main process starts the backend, polls `/api/health`, and requests `/app/` from the managed backend.
- Added a narrow smoke-only auto-quit hook so the test can exercise the main-process cleanup path and verify the managed backend port is closed afterward.
- Left Desktop completion open; remaining work still includes open-external IPC behavior under Electron, app version display decisions, and reviewer sign-off.

### Verification
- `npm run desktop:build` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_desktop_smoke.py::test_v2_electron_managed_backend_starts_and_stops_with_main_lifecycle` passed with 1 test.
- `npm test -- src/test/desktopBackendPlan.test.ts src/test/desktopSecurity.test.ts` passed with 9 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_desktop_smoke.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_desktop_smoke.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_desktop_smoke.py` passed with 0 errors.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_desktop_smoke.py` passed with 3 tests.
- `npm run lint` passed.

### Reviewer
- Main-agent Electron managed lifecycle verification completed for this slice. No Desktop subsystem completion is claimed.

## 2026-06-25 V2 Electron Open External Boundary Batch

### Scope
- Re-checked the Desktop checklist after the managed backend lifecycle pass and targeted the remaining open-external preload/main boundary evidence.
- Added a desktop main-process open-external log hook for Electron smoke tests so the test can prove calls cross the sandboxed renderer, preload bridge, and main-process URL normalization path without launching an external browser.
- Extended the Electron smoke coverage to call `window.agentTeamsDesktop.openExternal(...)` from the real sandboxed renderer, verify the main process records the normalized `https:` URL, and verify `file:` URLs are rejected through the same IPC path.
- Strengthened the renderer smoke by asserting the preload `getVersion()` API returns a non-empty app version value, rather than only checking that the key exists.
- Left Desktop completion open; remaining work still includes app version display decision/sign-off and reviewer sign-off for the overall desktop subsystem.

### Verification
- `npm run desktop:build` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_desktop_smoke.py::test_v2_electron_open_external_uses_preload_main_boundary` passed with 1 test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_desktop_smoke.py` passed with 4 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_desktop_smoke.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_desktop_smoke.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_desktop_smoke.py` passed with 0 errors.
- `npm test -- src/test/desktopBackendPlan.test.ts src/test/desktopSecurity.test.ts` passed with 9 tests.
- `npm run lint` passed.

### Reviewer
- Main-agent Electron open-external boundary verification completed for this slice. No Desktop subsystem completion is claimed.

## 2026-06-25 V2 Electron Desktop Reviewer Closure Batch

### Scope
- Re-checked the Desktop checklist and ran the required independent reviewer loop for the Electron desktop shell subsystem.
- Addressed reviewer findings by gating smoke-only desktop hooks behind `AGENT_TEAMS_DESKTOP_TEST_MODE=1` so production runtime behavior is not changed by test env variables alone.
- Extended the desktop open-external smoke from direct preload invocation to a real V2 markdown link click, proving the renderer link path reaches the main-process `setWindowOpenHandler` boundary.
- Added an Electron-only app version display in the existing Settings > System facts area without changing the V1-aligned settings navigation items.
- Improved the startup failure data document into an actionable desktop error state with diagnostics, Copy diagnostics, and Retry startup controls.
- Routed Copy diagnostics and Retry startup through minimal preload/main IPC; smoke coverage clicks both controls, verifies diagnostics reach the main-process copy path, and verifies retry re-enters startup before returning to the failure state when the backend is still unhealthy.
- Refreshed `frontend/dist/app` for the renderer Settings change.
- Fixed a brittle SettingsDrawer test wait so the ACP registry action is clicked only after Agent Runtime data has loaded.

### Verification
- `npm test -- --testTimeout=60000 src/test/SettingsDrawer.test.tsx src/test/desktopBackendPlan.test.ts src/test/desktopSecurity.test.ts` passed with 24 tests.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm run lint` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_desktop_smoke.py` passed with 4 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_desktop_smoke.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_desktop_smoke.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_desktop_smoke.py` passed with 0 errors.
- Screenshot inspection of `.tmp/frontend-v2-desktop/v2-electron-startup-failed.png` confirmed the startup failure state remains a restrained Agent Teams-style status panel with diagnostics and actions.

### Reviewer
- Reviewer subagent `019efec7-4bf7-7351-b911-f3d389cb761b` returned FAIL on the first pass with findings for missing version-display closure, missing reviewer PASS, under-tested real user external-link path, ungated test hooks, and thin startup failure controls.
- After fixes, reviewer subagent `019efec7-4bf7-7351-b911-f3d389cb761b` returned PASS for the Electron desktop shell subsystem.
- Reviewer residual risks: same-window external navigation is not separately guarded with `will-navigate`; rapid repeated Retry clicks could overlap startup attempts; packaging/installer behavior remains outside current smoke-test evidence.

## 2026-06-25 V2 Interrupted Stream Non-Text Event Browser Batch

### Scope
- Re-checked the goal and parity checklist after closing the Desktop reviewer loop, then moved back to the remaining high-risk AG-UI Runtime Stream gap instead of continuing desktop or appearance polish.
- Extended the built V2 `/app/` browser stream recovery harness with an interrupted stream that has already rendered text and active thinking content before the transport disconnects.
- Verified the replacement EventSource reconnects with `after_event_id=4`, derived from the latest local runtime cursor after the pre-disconnect `thinking_delta`, rather than replaying from the earlier text event.
- Verified non-text runtime events after reconnect continue into the same visible timeline: `thinking_delta` appends to the active thinking block, `tool_call` renders the tool-call summary and arguments, `tool_result` renders the result summary, and `token_usage` remains visible as a fallback runtime event.
- Verified the pre-interruption text chunk is not duplicated and the stream closes on `run_completed`.
- Left full AG-UI Runtime Stream completion open; remaining work includes backend-backed interrupted SSE timing, broader named AG-UI event coverage, stop/resume browser flows against real backend timing, and paired reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k non_text_events` passed with 1 test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 12 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed after formatting the file.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured because this batch verifies stream runtime behavior and visible event rendering through browser assertions rather than changing layout or styling.

### Reviewer
- Main-agent browser integration verification completed for this non-text interrupted stream slice. No AG-UI Runtime Stream subsystem completion is claimed.

## 2026-06-25 V2 Real SSE Interrupted Replay Browser Batch

### Scope
- Re-checked the AG-UI Runtime Stream checklist after the non-text mock EventSource coverage and targeted the remaining real browser HTTP/SSE timing gap.
- Added a built V2 `/app/` browser integration path served by a local HTTP server that handles the app shell, mock JSON APIs, and a real `text/event-stream` endpoint without replacing `window.EventSource`.
- Simulated the real interruption sequence: the first SSE request streams `run_started` and `text_delta` through event id 2, the browser performs a native reconnect to the original URL with `Last-Event-ID: 2`, and the V2 controller then opens a new stream with `after_event_id=2`.
- Verified the resumed SSE stream renders a later text delta, does not duplicate the pre-interruption chunk, and hides the Stop control after `run_completed`.
- Found and fixed a real timeline bug exposed only by the full terminal timing: closed runtime entries were hidden whenever any persisted row shared the same run id, including the user prompt. The timeline now suppresses closed runtime rows only after a non-user output row for that run has hydrated.
- Added component coverage proving closed runtime output remains visible when only the user prompt has hydrated.
- Refreshed `frontend/dist/app` for the timeline fix.
- Left full AG-UI Runtime Stream completion open; remaining work includes real backend stop/resume timing, broader production backend interrupted-stream evidence, and paired reviewer sign-off.

### Verification
- `npm test -- --run src/test/MessageTimeline.test.tsx -t "keeps closed runtime output visible"` passed with 1 test.
- `npm test -- --run src/test/MessageTimeline.test.tsx` passed with 47 tests.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k real_sse` passed with 1 test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 13 tests.
- `npm run lint` passed.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed after formatting the file.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured because this batch fixes stream timing/state reconciliation rather than changing visible layout; browser assertions verify the visible timeline and Stop control state.

### Reviewer
- Main-agent browser integration and component verification completed for this real SSE interrupted replay slice. No AG-UI Runtime Stream subsystem completion is claimed.

## 2026-06-25 V2 Real SSE Stop Control Browser Batch

### Scope
- Continued the AG-UI Runtime Stream and Composer/Run Recovery checklist after the real SSE interrupted replay fix, targeting the remaining stop-control timing gap.
- Extended the built V2 `/app/` real HTTP/SSE browser harness with a mode that keeps the initial native EventSource stream open after `run_started` and `text_delta`.
- Verified clicking the real Composer Stop button while the SSE stream is still open sends `POST /api/ag-ui/runs/{run_id}:stop` with `{"scope":"main"}`.
- Verified the server-side stream observes the stop request and exits the held stream path, while the V2 UI hides Stop, restores Send, and keeps the pre-stop streamed text visible without duplication.
- Left full AG-UI Runtime Stream and Run Recovery completion open; remaining work includes real backend resume/approval/question timing, production backend stop semantics, and paired reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k real_sse_active_run_stop` passed with 1 test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 14 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured because this batch verifies stream/control timing and visible button state through browser assertions rather than changing layout.

### Reviewer
- Main-agent browser integration verification completed for this real SSE stop-control slice. No AG-UI Runtime Stream, Composer, or Run Recovery subsystem completion is claimed.

## 2026-06-25 V2 Settings Navigation Browser Parity Batch

### Scope
- Re-checked the parity checklist after the real SSE stop-control slice and targeted the user-facing information-architecture risk in Settings rather than continuing stream-only work.
- Added a built V2 `/app/` browser flow that opens Settings from the real top bar and verifies the V1 primary Settings section order stays fixed: Appearance, General, Speech, Notifications, Models, Roles, Orchestration, Web, ClawHub, Proxy, Remote workspace, Environment variables, and System.
- Verified V1-style secondary System pages remain behind the System launcher instead of being flattened into the primary Settings navigation: MCP, Plugins, Commands, Hooks, Agent Runtime, GitHub, and Triggers are absent from the root Settings nav.
- Verified secondary pages open and return inside the System Settings surface by navigating to Commands and GitHub from the real System list, with real mock API requests for `/api/system/commands:catalog`, `/api/system/configs/github`, and `/api/system/configs/github/webhook/tunnel`.
- Left full Settings completion open; remaining work still includes all settings save/error/destructive-action coverage, visual reviewer pass across all tabs, and V1 parity confirmation for each form.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k settings_keeps_v1_sections` passed with 1 test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py` passed with 7 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_shell_layout.py` passed with 0 errors.
- No screenshot was captured because this batch locks information architecture and secondary-page behavior with browser assertions rather than changing layout or styling.

### Reviewer
- Main-agent browser integration verification completed for this Settings navigation parity slice. No Settings subsystem completion is claimed.

## 2026-06-25 V2 Real SSE Recoverable Resume Browser Batch

### Scope
- Re-checked the AG-UI Runtime Stream and Run Recovery checklist after the Settings navigation parity slice and targeted the remaining real-browser recoverable resume gap.
- Extended the built V2 `/app/` real HTTP/SSE harness with the AG-UI `POST /api/ag-ui/runs/{run_id}:resume` path instead of relying on the mock EventSource resume-only tests.
- Added a recoverable stopped-run browser flow using native EventSource that opens the Recovery Resume control, verifies the client resumes from the saved checkpoint `after_event_id=7`, and streams `run_resumed`, `text_delta`, and `run_completed` events.
- Verified the resumed text is visible in the real timeline, the Stop control hides after the terminal event, and the Send control returns without needing a page refresh.
- Left full AG-UI Runtime Stream and Run Recovery completion open; remaining work includes production-backend resume/approval/question timing, broader event coverage, and paired reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k real_sse_recoverable_resume` passed with 1 test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 15 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured because this batch verifies stream recovery timing and visible control state through browser assertions rather than changing layout or styling.

### Reviewer
- Main-agent browser integration verification completed for this real SSE recoverable resume slice. No AG-UI Runtime Stream or Run Recovery subsystem completion is claimed.

## 2026-06-25 V2 Real SSE Failed Terminal Browser Batch

### Scope
- Re-checked the Runtime Gate after the real SSE recoverable resume slice and targeted the missing real-browser `run_failed` terminal path.
- Extended the built V2 `/app/` real HTTP/SSE harness with a mode that sends `run_started`, `text_delta`, and terminal `run_failed` events over native EventSource.
- Verified the failure diagnostic payload text remains visible in the timeline after the terminal event.
- Verified the stream finalizes without an extra reconnect, the Stop control hides, and the Send control returns after `run_failed`.
- Left full AG-UI Runtime Stream completion open; remaining work still includes production-backend timing for approvals and user questions, broader event coverage, and reviewer findings from the active review pass.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k real_sse_run_failed` passed with 1 test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 16 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured because this batch verifies stream terminal timing and visible failure text through browser assertions rather than changing layout or styling.

### Reviewer
- Reviewer subagent `019eff12-9b1b-7943-a5c8-0c0bea9d6c44` is reviewing the AG-UI Runtime Stream and Run Recovery subsystem. Final reviewer PASS/FAIL is not yet claimed in this batch.

## 2026-06-25 V2 Real SSE Approval And Question Resume Browser Batch

### Scope
- Continued the Runtime Gate after the `run_failed` terminal path and targeted the remaining real-browser recovery-action timing gap for approvals and user questions.
- Extended the built V2 `/app/` real HTTP/SSE harness so pending tool approvals and pending user questions resolve through the real AG-UI action endpoints while the client opens a native EventSource resume stream.
- Added a real SSE browser flow proving a pending tool approval hides the standalone Resume action, resumes the recoverable run from `after_event_id=7`, posts the selected ACP approval option, streams resumed output, and returns the composer to Send.
- Added a real SSE browser flow proving a pending user question hides standalone Resume, preserves selected answers and supplemental text, resumes from `after_event_id=7`, streams resumed output, and returns the composer to Send.
- Left full AG-UI Runtime Stream and Run Recovery completion open pending reviewer results and any follow-up fixes.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "real_sse_recoverable_run_resumes_before"` passed with 2 tests.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 18 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured because this batch verifies recovery-action stream timing and visible control state through browser assertions rather than changing layout or styling.

### Reviewer
- Reviewer subagent `019eff12-9b1b-7943-a5c8-0c0bea9d6c44` is still the active AG-UI Runtime Stream and Run Recovery reviewer. Final reviewer PASS/FAIL is not yet claimed in this batch.

## 2026-06-25 V2 Runtime Recovery Reviewer P1 Fix Batch

### Scope
- Re-checked the active goal and the AG-UI Runtime Stream / Run Recovery gap after the approval/question real SSE slice instead of continuing visual polish.
- Addressed reviewer P1 finding for stale unavailable recovery loops by tracking suppressed run ids after server or malformed stream errors; automatic RecoveryBar continuation now filters those stale targets while explicit starts still clear suppression.
- Addressed reviewer P1 finding for background-only recovery streams by separating foreground active run ids from tracked stream ids; Composer now consumes only foreground run state while RecoveryBar can continue tracking background output streams.
- Extended RecoveryBar auto-streaming so background-only recovery passes `foreground: false` or an empty foreground set, while active queued/running/stopping runs remain foreground.
- Refreshed `frontend/dist/app` for the runtime and recovery behavior changes.
- Left full AG-UI Runtime Stream completion open pending broader production backend timing evidence and final reviewer sign-off.

### Verification
- `npm test -- --run src/test/RunStreamController.test.tsx src/test/RecoveryBar.test.tsx src/test/Composer.test.tsx src/test/ChatWorkspace.test.tsx` passed with 88 tests.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "server_error_suppresses_stale_auto_recovery or background_task_recovery_uses_multiplex_stream"` passed with 2 tests.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 19 tests.
- `npm run lint` passed.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured because this batch fixes runtime state semantics and stream recovery loops; browser assertions verify the visible Composer controls and EventSource request count.

### Reviewer
- Reviewer subagent `019eff12-9b1b-7943-a5c8-0c0bea9d6c44` returned FAIL on the first AG-UI Runtime Stream and Run Recovery pass with P1 findings for stale server-error recovery loops and background-only streams being treated as foreground active runs.
- After the focused fixes, reviewer subagent `019eff12-9b1b-7943-a5c8-0c0bea9d6c44` returned PASS for the two P1 findings.
- Reviewer re-ran `npm test -- --run src/test/RunStreamController.test.tsx src/test/RecoveryBar.test.tsx` with 37 tests passing and `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` with 19 tests passing.

## 2026-06-25 V2 Interrupted Replay Metadata Event Coverage Batch

### Scope
- Re-checked the AG-UI Runtime Stream checklist after the reviewer P1 fix and targeted required event coverage rather than continuing the same recovery-state fix.
- Extended the interrupted stream replay browser scenario so non-text events after reconnect include model step started/finished, state snapshot, state delta, todo update, notification request, subagent status, and background task events.
- Verified those events enter the real V2 browser EventSource path, pass through reducer/store state, and render visible fallback timeline rows after reconnect without duplicating the pre-interruption text chunk.
- Kept this as coverage evidence only; full AG-UI Runtime Stream completion remains open pending broader backend-backed event coverage and final subsystem reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k non_text_events` passed with 1 test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 19 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured because this batch only adds stream-event coverage and does not alter layout or styling.

### Reviewer
- Main-agent browser integration verification completed for this event-coverage slice. No AG-UI Runtime Stream subsystem completion is claimed.

## 2026-06-25 V2 Project View Browser Flow Batch

### Scope
- Re-checked the frontend rewrite goal after the interrupted replay metadata coverage and targeted a global product-shape gap instead of continuing screenshot-only polish.
- Added a built V2 `/app/` browser flow that opens the Workspace Project View from the real sidebar workspace action, preserving the V1-style secondary-page entry instead of flattening the workbench into the root shell.
- Extended the shell browser mock backend with real workspace API contract responses for `/api/workspaces`, snapshot, tree, diffs, diff file, file content, and `:open-root`.
- Verified the Project View renders workspace identity/root path, starts in the Changes tab when diffs exist, shows the changed file and diff lines, switches to Files, opens `README.md`, refreshes snapshot data, opens the workspace folder endpoint, and returns to Chat.
- Kept this as browser-flow evidence only; full Project View and Workspace subsystem completion remains open pending broader file-tree/mount/search/edit/error-state coverage and reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k project_view` passed with 1 test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py` passed with 8 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_shell_layout.py` passed after formatting the file.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_shell_layout.py` passed with 0 errors.
- Captured screenshot evidence at `.tmp/frontend-v2-project/v2-project-view-flow.png`.

### Reviewer
- Main-agent browser integration verification completed for this Project View entry-flow slice. No Project View, Workspace, or Shell subsystem completion is claimed.

## 2026-06-25 V2 Real SSE Runtime Injection Browser Batch

### Scope
- Re-checked the Composer/Run Controls and AG-UI Runtime Stream checklist after the Project View browser-flow batch and targeted a runtime behavior gap instead of continuing Project View or visual-only work.
- Added a built V2 `/app/` browser flow using native EventSource where a run remains actively streaming while the Composer sends Queue and Interrupt injections.
- Extended the real HTTP/SSE browser harness with the real `POST /api/ag-ui/runs/{run_id}/inject` action response and a run-create counter.
- Verified Queue and Interrupt both post text-only injection payloads to the active run, clear the prompt, keep the active Stop control available, avoid setting a terminal state, and do not create a second run while the SSE stream remains open.
- Finished the held stream through Stop to prove the same run still closes cleanly and returns the Composer to Send after injections.
- Kept this as browser-flow evidence only; full Composer/Run Controls and AG-UI Runtime Stream completion remains open pending broader attachment/mention/error-state coverage and final reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k real_sse_active_run_injects` passed with 1 test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 20 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors.
- No screenshot was captured because this batch verifies runtime stream/control behavior and visible Composer state through browser assertions rather than changing layout or styling.

### Reviewer
- Main-agent browser integration verification completed for this real SSE runtime-injection slice. No Composer, Run Controls, or AG-UI Runtime Stream subsystem completion is claimed.

## 2026-06-25 V2 Appearance Preset Interaction Batch

### Scope
- Re-checked the Settings/Appearance checklist after the real SSE runtime-injection batch and targeted a small but user-visible settings interaction gap.
- Fixed the custom Appearance theme preset selector so choosing a preset closes the menu like a normal selector instead of leaving the dropdown open after the selection.
- Added focused SettingsDrawer coverage proving the Appearance preset listbox opens, selecting `Vercel` closes it, updates the trigger label, and persists the selected preset colors/settings to local appearance storage.
- Refreshed `frontend/dist/app` for the Appearance interaction change.
- Kept this as a focused interaction fix only; full Settings and Appearance completion remains open pending broader save/error/import visual passes and reviewer sign-off.

### Verification
- `npm test -- --run src/test/SettingsDrawer.test.tsx -t "closes the appearance preset menu"` passed with 1 test.
- `npm test -- --run src/test/SettingsDrawer.test.tsx` passed with 16 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- No screenshot was captured because this batch changes a small selector close behavior and is covered by focused component assertions rather than a layout change.

### Reviewer
- Main-agent targeted verification completed for this Appearance preset interaction slice. No Settings or Appearance subsystem completion is claimed.

## 2026-06-25 V2 Approval Feedback Recovery Batch

### Scope
- Re-checked the Run Recovery, AG-UI Runtime Stream, and Observability/Feedback checklist after the Appearance preset interaction batch instead of continuing settings polish.
- Closed a real recovery-action feedback gap: pending tool approval controls now expose a compact optional feedback input and pass the trimmed feedback through the AG-UI `tool-approvals/{tool_call_id}:resolve` payload.
- Preserved the existing approval option, Approve, Deny, resume-before-approval, busy, and error behavior while clearing the local feedback after a successful resolution.
- Extended the API client and RecoveryBar tests so feedback is asserted at both the component call boundary and the serialized AG-UI request body.
- Extended the built `/app/` browser recovery flows so both mock EventSource and real HTTP/SSE approval recovery fill the visible `Approval feedback` input and verify the backend receives that feedback with the selected ACP option.
- Refreshed `frontend/dist/app` for the RecoveryBar/API client change.
- Checked the current in-app browser at `http://127.0.0.1:8000/app/` after reload: body scroll height and client height both reported `720`, `body` overflow was `hidden`, the workspace was `994x668`, the timeline was `994x500`, and the composer was fixed at `994x136`. The current live session did not have a pending approval, so the approval feedback visual path is covered by the browser integration flow rather than the live session state.
- Screenshot capture from the in-app browser timed out twice at the browser screenshot command, so no screenshot artifact is claimed for this batch.
- Kept this as a targeted recovery/feedback improvement only; full Run Recovery, AG-UI Runtime Stream, Observability/Feedback, and reviewer sign-off remain open.

### Verification
- `npm test -- --run src/test/RecoveryBar.test.tsx -t feedback` passed with 1 test.
- `npm test -- --run src/test/apiClient.test.ts -t "tool approvals"` passed with 1 test.
- `npm test -- --run src/test/RecoveryBar.test.tsx` passed with 22 tests.
- `npm test -- --run src/test/apiClient.test.ts` passed with 24 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "recoverable_run_resumes_before_tool_approval"` passed with 2 tests.
- `uv run --extra dev ruff check --fix tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --no-cache --force-exclude tests/integration_tests/browser/test_v2_stream_recovery.py` left 1 file unchanged.

### Reviewer
- Main-agent browser integration and targeted verification completed for this approval-feedback recovery slice. No Run Recovery, AG-UI Runtime Stream, or Observability/Feedback subsystem completion is claimed.

## 2026-06-25 V2 Spec Lineage Observability Batch

### Scope
- Re-checked checklist item 11 after the approval feedback slice and targeted the missing Spec Lineage timeline/diff surface instead of continuing only the last user-reported message rendering issues.
- Added typed frontend API coverage for the existing task/spec endpoints: run task projection, task spec artifacts, spec artifact diff, and spec checkpoint evaluations.
- Added a `SpecLineagePanel` inside the existing Observability secondary surface, preserving the V1-shaped sidebar/settings information architecture and avoiding a new top-level module.
- The panel discovers the latest run for the current session, filters real spec-backed tasks, shows spec artifact versions as a compact timeline, renders checkpoint evaluation rows, and shows the selected version diff from backend data.
- Refreshed `frontend/dist/app` for the Observability/Spec Lineage changes.
- Checked the current in-app browser at `http://127.0.0.1:8000/app/` after reload: sidebar entries remained the V1-parity set, body overflow stayed `hidden`, document height matched viewport height, workspace/sidebar heights stayed fixed at 668 px, and the live session showed the real empty state `最近运行中没有带规格的任务`.
- Browser screenshot capture from the in-app browser timed out at the capture command, so screenshot evidence for this batch comes from the Playwright browser integration run against the refreshed built app.
- Kept this as targeted item-11 evidence only; full Observability, Project View, Spec Lineage, Feedback, and reviewer sign-off remain open.

### Verification
- `npm test -- --run src/test/apiClient.test.ts src/test/SpecLineagePanel.test.tsx` passed with 27 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k observability` passed with 1 test and generated screenshots.
- `uv run --extra dev ruff check --fix tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev ruff format --no-cache --force-exclude tests/integration_tests/browser/test_v2_shell_layout.py` reformatted the browser test once and then left it formatted.
- Captured screenshot evidence at `.tmp/frontend-v2-observability/v2-observability-session.png` and `.tmp/frontend-v2-observability/v2-observability-spec-lineage.png`.

### Reviewer
- Main-agent component, browser integration, screenshot, and in-app-browser verification completed for this Spec Lineage slice. No Observability, Project View, Spec Lineage, or Feedback subsystem completion is claimed.

## 2026-06-25 V2 Timeline Hydration Tool Replay Batch

### Scope
- Re-checked the Message Timeline and AG-UI Runtime Stream checklist after the Spec Lineage batch and targeted a replay/hydration edge case rather than continuing item-11 work.
- Narrowed runtime-entry suppression after persisted message hydration: closed runs with a hydrated assistant answer now suppress duplicate runtime text/output and routine lifecycle rows, but keep tool calls, tool results, validation, approval, thinking, and other non-output replay rows available to the timeline.
- Added focused MessageTimeline coverage proving a closed run with a persisted answer hides the stale runtime text chunk while still rendering the same run's replayed tool call and compact tool error result.
- Refreshed `frontend/dist/app` for the timeline replay behavior change.
- Kept this as targeted Message Timeline replay evidence only; full Message Timeline, AG-UI Runtime Stream, interrupted replay, and reviewer sign-off remain open.

### Verification
- `npm test -- --run src/test/MessageTimeline.test.tsx` passed with 48 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- No screenshot was captured because this batch changes replay/hydration data filtering rather than visible layout. The visible behavior is covered by focused component assertions.

### Reviewer
- Main-agent targeted component verification completed for this replay/hydration slice. No Message Timeline or AG-UI Runtime Stream subsystem completion is claimed.

## 2026-06-25 V2 Timeline Token Usage Replay Summary Batch

### Scope
- Continued the Message Timeline and AG-UI Runtime Stream checklist after the hydration/tool replay slice, focusing on another replay readability gap rather than switching to a shallow surface.
- Added structured timeline rendering for `token_usage` runtime events so replay shows a compact token summary instead of the raw protocol fallback text `token usage`.
- The summary includes total, input, cached input, output, and reasoning token counts when present, while malformed or empty payloads still fall back safely.
- Refreshed `frontend/dist/app` for the timeline replay rendering change.
- Kept this as targeted Message Timeline and resource-event readability evidence only; full Message Timeline, AG-UI Runtime Stream, token usage, and reviewer sign-off remain open.

### Verification
- `npm test -- --run src/test/MessageTimeline.test.tsx` passed with 49 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- No screenshot was captured because this batch changes replay text content, not layout. The visible behavior is covered by focused component assertions.

### Reviewer
- Main-agent targeted component verification completed for this token-usage replay slice. No Message Timeline, AG-UI Runtime Stream, or Resource subsystem completion is claimed.

## 2026-06-25 V2 Timeline Todo Replay Summary Batch

### Scope
- Re-checked the Message Timeline, AG-UI Runtime Stream, and Rounds/Todos checklist after the token-usage replay slice, focusing on another runtime replay event that still rendered as protocol fallback text.
- Added structured timeline rendering for `todo_updated` runtime events backed by the real `TodoSnapshot` payload shape: item count, status counts, current in-progress or pending item, snapshot version, and updater.
- Preserved safe fallback behavior for malformed payloads and summary-only replay events.
- Updated the rich interrupted-stream browser replay flow to assert the current structured `token_usage` summary and a structured `todo_updated` snapshot summary instead of raw fallback labels.
- Refreshed `frontend/dist/app` for the timeline replay rendering change.
- Kept this as targeted Message Timeline, AG-UI Runtime Stream, and todo-event readability evidence only; full Message Timeline, AG-UI Runtime Stream, Rounds/Todos, interrupted replay, and reviewer sign-off remain open.

### Verification
- `npm test -- --run src/test/MessageTimeline.test.tsx` passed with 50 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k interrupted_stream_preserves_non_text_events_after_reconnect` passed with 1 test.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` reported 1 file already formatted.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors, 0 warnings, and 0 notes.
- No screenshot was captured because this batch changes replay text rendering, not layout. The visible behavior is covered by the browser rich replay assertion against the built `/app/` bundle.

### Reviewer
- Main-agent component, built-app browser replay, and targeted static verification completed for this todo replay slice. No Message Timeline, AG-UI Runtime Stream, or Rounds/Todos subsystem completion is claimed.

## 2026-06-25 V2 Timeline State Replay Summary Batch

### Scope
- Re-checked the Message Timeline and AG-UI Runtime Stream checklist after the todo replay slice, focusing on `state_snapshot` and `state_delta` replay readability instead of continuing only todo-specific work.
- Added labelled timeline rendering for state replay events so visible history shows `State snapshot:` and `State delta:` summaries instead of unqualified protocol fallback text.
- Kept the renderer conservative: it uses `summary`, `title`, `message`, or `status` fields first, then falls back to compact scalar field summaries or a one-line JSON preview.
- Updated the rich interrupted-stream browser replay flow to assert the structured state summaries in the built `/app/` UI.
- Refreshed `frontend/dist/app` for the timeline replay rendering change.
- Kept this as targeted Message Timeline and AG-UI Runtime Stream state-event evidence only; full Message Timeline, AG-UI Runtime Stream, recovery semantics, and reviewer sign-off remain open.

### Verification
- `npm test -- --run src/test/MessageTimeline.test.tsx` passed with 51 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k interrupted_stream_preserves_non_text_events_after_reconnect` passed with 1 test.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` reported 1 file already formatted after one formatting pass.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors, 0 warnings, and 0 notes.
- No screenshot was captured because this batch changes replay text rendering, not layout. The visible behavior is covered by the browser rich replay assertion against the built `/app/` bundle.

### Reviewer
- Main-agent component, built-app browser replay, and targeted static verification completed for this state replay slice. No Message Timeline or AG-UI Runtime Stream subsystem completion is claimed.

## 2026-06-25 V2 Timeline Lifecycle Replay Summary Batch

### Scope
- Re-checked the Message Timeline and AG-UI Runtime Stream checklist after the state replay slice, focusing on model step lifecycle, notification, and background task replay coverage.
- Added labelled timeline rendering for `model_step_started`, `model_step_finished`, `notification_requested`, and `background_task_*` runtime events so replay shows product-readable summaries instead of unqualified protocol fallback text.
- Kept the renderer conservative and data-backed: model steps summarize role/instance, notifications summarize title/type/channels, and background tasks summarize command/output/status/exit/task id from the real payload.
- Updated the rich interrupted-stream browser replay flow to assert the structured model step, notification, and background task summaries in the built `/app/` UI.
- Refreshed `frontend/dist/app` for the timeline replay rendering change.
- Kept this as targeted Message Timeline and AG-UI Runtime Stream lifecycle-event evidence only; full Message Timeline, AG-UI Runtime Stream, background task recovery, notification UX, and reviewer sign-off remain open.

### Verification
- `npm test -- --run src/test/MessageTimeline.test.tsx` passed with 52 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k interrupted_stream_preserves_non_text_events_after_reconnect` passed with 1 test.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` reported 1 file already formatted.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors, 0 warnings, and 0 notes.
- No screenshot was captured because this batch changes replay text rendering, not layout. The visible behavior is covered by the browser rich replay assertion against the built `/app/` bundle.

### Reviewer
- Main-agent component, built-app browser replay, and targeted static verification completed for this lifecycle replay slice. No Message Timeline, AG-UI Runtime Stream, notification, or background-task subsystem completion is claimed.

## 2026-06-25 V2 Timeline Coordination Replay Summary Batch

### Scope
- Re-checked the Message Timeline, AG-UI Runtime Stream, Run Recovery, and Subagents checklist after the lifecycle replay slice, focusing on remaining coordination replay events.
- Added labelled timeline rendering for `user_question_requested`, `user_question_answered`, `injection_enqueued`, `injection_applied`, `subagent_session_status_changed`, `subagent_stopped`, `subagent_resumed`, `awaiting_manual_action`, and run lifecycle events.
- Kept the summaries data-backed and compact: questions show prompt/id, injections show content/source/mode/recipient, subagents show status/role/instance/task, manual action shows root task, and run lifecycle shows status/output/root task.
- Preserved hydration suppression for duplicate routine `run_started`, `run_resumed`, and `run_completed` entries when a persisted assistant answer already covers the run output.
- Expanded the rich interrupted-stream browser replay flow to assert these coordination summaries in the built `/app/` UI and moved the duplicate text assertion before virtual scrolling unloads the first row.
- Refreshed `frontend/dist/app` for the timeline replay rendering change.
- Kept this as targeted Message Timeline and AG-UI Runtime Stream coordination-event evidence only; full Message Timeline, AG-UI Runtime Stream, Subagents, Run Recovery, and reviewer sign-off remain open.

### Verification
- `npm test -- --run src/test/MessageTimeline.test.tsx` passed with 53 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k interrupted_stream_preserves_non_text_events_after_reconnect` passed with 1 test.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff format --check tests/integration_tests/browser/test_v2_stream_recovery.py` reported 1 file already formatted.
- `uv run --extra dev basedpyright tests/integration_tests/browser/test_v2_stream_recovery.py` passed with 0 errors, 0 warnings, and 0 notes.
- No screenshot was captured because this batch changes replay text rendering, not layout. The visible behavior is covered by the browser rich replay assertion against the built `/app/` bundle.

### Reviewer
- Main-agent component, built-app browser replay, and targeted static verification completed for this coordination replay slice. No Message Timeline, AG-UI Runtime Stream, Subagents, or Run Recovery subsystem completion is claimed.

## 2026-06-25 V2 Subagent Session Stream Batch

### Scope
- Re-checked the Subagents, AG-UI Runtime Stream, and Run Recovery checklist after the coordination replay slice, focusing on the normal-mode subagent secondary page instead of continuing only message replay summaries.
- Reused the main `MessageTimeline` renderer for subagent agent-message history so persisted subagent messages, runtime replay entries, thinking/tool rendering, empty states, and load errors follow the same path as the main chat timeline.
- Added scoped timeline options for alternate message loaders, query keys, disabled round rails, runtime run filtering, and fallback run hydration so a subagent page can show only its own run stream without flattening subagent content into the primary chat page.
- Preserved the V1-style secondary page behavior: subagents still open from the nested sidebar entry, the subagent page keeps its own back button, and sidebar/settings items were not added or removed.
- Wired active subagent sessions to `RunStreamController.startRunStream` with `last_event_id` replay continuation, terminal-status precedence, scoped runtime display, cleanup on page switch, and agent-message refresh when a tracked subagent stream closes.
- Refreshed `frontend/dist/app` for the subagent session stream change.
- Kept this as targeted Subagents and AG-UI Runtime Stream progress only; full Subagents, Run Recovery, stream replay edge cases, browser V1/V2 visual comparison, and reviewer sign-off remain open.

### Verification
- `npm test -- --run src/test/SubagentSessionView.test.tsx src/test/MessageTimeline.test.tsx` passed with 56 tests.
- `npm test -- --run src/test/SessionsSidebar.test.tsx src/test/AppShell.test.tsx src/test/ChatWorkspace.test.tsx` passed with 41 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- No screenshot was captured because this batch changes subagent stream behavior and fixed-frame reuse rather than the global app shell. The next layout-focused batch should start with browser screenshots against V1 and V2 before detail work.

### Reviewer
- Main-agent component and shell-level targeted verification completed for this subagent-session stream slice. No full Subagents, Run Recovery, Message Timeline, or AG-UI Runtime Stream subsystem completion is claimed.

## 2026-06-26 V2 Shell Sidebar Width Alignment Batch

### Scope
- Re-checked the visual structure and V1 parity requirement before choosing a change, focusing on the global shell frame rather than message details.
- Attempted in-app browser viewport and full-page screenshots for V1 and V2, but the browser `Page.captureScreenshot` call timed out repeatedly before writing any screenshot files. This remains a tooling limitation to retry in a later visual QA batch, not screenshot evidence.
- Used browser DOM snapshots and layout metrics as fallback evidence for the V1/V2 shell comparison at 1280x720.
- Identified a concrete framework drift: V1 sidebar width was 260px with workspace starting at x=266, while V2 used a 280px default with workspace starting at x=286.
- Restored the V2 default sidebar width to 260px and changed the generated-width migration key so existing 280px generated defaults migrate back to the V1-sized default while user-resized widths remain preserved.
- Refreshed `frontend/dist/app` for the shell-width change.
- Kept this as targeted visual-structure progress only; full visual parity, screenshot QA, settings/sidebar item parity, and reviewer sign-off remain open.

### Verification
- `npm test -- --run src/test/uiStore.test.ts src/test/AppShell.test.tsx src/test/ShellLayoutCss.test.ts` passed with 33 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- Browser metrics before the change showed V2 `sidebar.width = 280`, `workspace.left = 286`, while V1 showed `sidebar.width = 260`, `workspace.left = 266`.
- Browser metrics after the built `/app/` reload showed V2 `sidebar.width = 260`, `workspace.left = 266`, `chat.width = 1014`, `body.scrollHeight = 720`, and independent scrolling in `.at-session-list` and `.at-timeline`.

### Reviewer
- Main-agent layout comparison and targeted verification completed for this sidebar-width alignment slice. No global shell, full visual parity, or release readiness completion is claimed.

## 2026-06-26 V2 Round Pending And Retry Summary Batch

### Scope
- Re-checked the Rounds, Todos, History, And Retry checklist before choosing the next change, focusing on visible round state rather than another shell-only pass.
- Added `pending_user_question_count` to the session round projection returned through the timeline whitelist so the public phase and the frontend-visible metadata use the same batched question counts.
- Extended V2 round metadata to summarize pending approvals, pending user questions, retry/fallback phase, retry attempt/delay/target/error details, run diagnostics, and warning/error tone from existing backend fields.
- Updated the React round marker to show those compact metadata items and the right-side round rail dot to surface warning/error state without changing sidebar/settings navigation structure or flattening secondary pages.
- Added English and Chinese i18n strings for the new round metadata labels.
- Refreshed `frontend/dist/app` for the round metadata rendering change.
- Kept this as targeted Rounds and Retry visibility progress only; full round detail pages, dense history review, live retry countdown, recovery overlay completion, and screenshot QA remain open.

### Verification
- `npm test -- --run src/test/MessageTimeline.test.tsx` passed with 54 tests.
- `uv run --extra dev pytest -q tests/unit_tests/sessions/test_session_rounds_run_state_overlay.py` passed with 17 tests.
- `npm run lint` passed.
- `uv run --extra dev ruff check src/relay_teams/sessions/session_service.py src/relay_teams/sessions/session_rounds_projection.py tests/unit_tests/sessions/test_session_rounds_run_state_overlay.py` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- No screenshot was captured for this batch because the change is state-dependent metadata and is covered by focused component and backend projection tests; the visual parity batch still needs a successful screenshot pass.

### Reviewer
- Main-agent projection, component, and build verification completed for this round pending/retry summary slice. No full Rounds, Todos, History, Retry, AG-UI Runtime Stream, or release readiness completion is claimed.

## 2026-06-26 V2 Round Export Retry Detail Batch

### Scope
- Re-checked the Rounds, Todos, History, And Retry checklist after the visible round summary batch, focusing on round history portability.
- Extended HTML and PNG transcript export blocks to include pending user question counts and each retry/fallback event's kind, phase, attempt, retry delay, target profile, error code/message, and active state.
- Preserved the existing export menu choices and paging behavior; this does not add sidebar/settings items or flatten secondary pages.
- Refreshed `frontend/dist/app` for the export detail change.
- Kept this as targeted round history/retry detail progress only; full round detail UI, live retry countdown, dense history visual review, and screenshot QA remain open.

### Verification
- `npm test -- --run src/test/messageExport.test.ts` passed with 9 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- No screenshot was captured because this batch changes generated transcript content rather than the app shell or a stable visible layout state.

### Reviewer
- Main-agent export and build verification completed for this round export detail slice. No full Rounds, Todos, History, Retry, visual parity, or release readiness completion is claimed.

## 2026-06-26 V2 Round Rail Detail Batch

### Scope
- Re-checked the Rounds, Todos, History, Retry, Message Timeline, AG-UI Runtime Stream, and V1 parity checklist before choosing the next change, then narrowed this batch to a visible round-detail gap instead of continuing only shell cleanup.
- Added typed V2 round todo snapshot contracts so the frontend can consume the backend round `todo` payload without loose structures.
- Added V2 round rail hover/focus details with compact status, pending approval/question, retry/fallback, diagnostic, and todo-list metadata.
- Positioned the detail as a fixed viewport overlay so it is not clipped by the timeline or rail scroll containers, while preserving the existing round rail buttons and click navigation.
- Preserved the V1-style secondary-page model and did not add or remove sidebar/settings entries in this batch.
- Refreshed `frontend/dist/app` for the round rail detail change.
- Browser audit during this batch found the current V2 sidebar primary nav still differs from V1 item parity: V2 visible items are `搜索`, `技能`, `自动化`, `连接器`, `看板`, `记忆`, while V1 also includes `聊天`, `观测`, and `设置` in the sidebar sequence. That remains a next-priority global framework gap, separate from this round-detail slice.
- Kept this as targeted Rounds/Todos/History progress only; full sidebar/settings parity, settings secondary pages, stream/replay edge cases, screenshot-based V1/V2 QA, and release readiness remain open.

### Verification
- `npm test -- --run src/test/MessageTimeline.test.tsx` passed with 54 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- Browser reload of `http://127.0.0.1:8000/app/` showed `bodyOverflow = hidden`, `bodyScrollHeight = viewport height`, shell/sidebar/timeline fixed to the viewport, and the built CSS containing `.at-round-rail-detail` and `.at-round-rail-detail.is-open`.
- DevTools hover verification on the built `/app/` page opened `.at-round-rail-detail is-open` with `position = fixed`, visible opacity, text content `completed`, and the detail rectangle fully inside the viewport.

### Reviewer
- Main-agent component, build, and browser/DevTools verification completed for this round rail detail slice. No full Rounds, Todos, History, Retry, AG-UI Runtime Stream, sidebar/settings parity, visual parity, or release readiness completion is claimed.

## 2026-06-26 V2 Sidebar Primary Entry Parity Batch

### Scope
- Re-checked the Application Shell and Settings parity requirements after the round rail detail batch, focusing on the framework-level sidebar mismatch found in browser audit.
- Restored the V2 primary sidebar entry set and order to match the V1 sidebar: `聊天`, `自动化`, `技能`, `看板`, `搜索`, `连接器`, `记忆`, `观测`, `设置`.
- Wired the added `聊天`, `观测`, and `设置` entries to existing real surfaces instead of adding placeholder pages: chat returns to `ChatWorkspace`, observability opens `ObservabilityPanel`, and settings opens the existing `SettingsDrawer`.
- Preserved the existing topbar observability/settings shortcuts and the V1-style secondary page model; settings remains a drawer/secondary surface and is not flattened into the primary workspace.
- Tightened sidebar active state so opening settings highlights only `设置`, and selecting another primary entry closes the settings drawer before navigating.
- Refreshed `frontend/dist/app` for the sidebar navigation change.
- Kept this as targeted Application Shell parity progress only; settings tab coverage, full settings form parity, screenshot-based V1/V2 visual QA, stream/replay edge cases, and release readiness remain open.

### Verification
- `npm test -- --run src/test/AppShell.test.tsx` passed with 19 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- Browser reload of `http://127.0.0.1:8000/app/` showed `bodyOverflow = hidden`, sidebar width `260`, workspace x `266`, and sidebar entries `聊天`, `自动化`, `技能`, `看板`, `搜索Ctrl+K`, `连接器`, `记忆`, `观测`, `设置`.
- Browser interaction verification showed `观测` opens the observability surface with only `观测` active, `设置` opens the drawer with only `设置` active, and `聊天` closes the drawer and returns to the chat timeline with only `聊天` active.

### Reviewer
- Main-agent shell component, build, and browser/DevTools verification completed for this sidebar primary entry parity slice. No full Application Shell, Settings, visual parity, or release readiness completion is claimed.

## 2026-06-26 V2 Token Usage Localization Batch

### Scope
- Re-checked the Application Shell, Message Timeline, Resource Management, and Assistive Features gaps before choosing a small close-out slice, then narrowed this batch to visible mixed-language feedback in the live V2 shell.
- Localized the compact token usage strip and its detailed tooltip in Chinese, replacing the remaining hardcoded `Tokens`, `total`, `input`, `output`, `cached`, `reasoning`, and `context` labels with i18n-backed strings.
- Localized the last-answer copy feedback strings for empty content, success, and unavailable clipboard paths.
- Preserved the V1 sidebar and settings item parity restored in the previous batch; this change does not add or remove sidebar/settings entries and does not flatten any secondary settings pages.
- Refreshed `frontend/dist/app` for the token usage and timeline copy feedback change.
- Kept this as targeted Resource Management, Assistive Features, and Message Timeline polish only; full Message Timeline streaming/replay, settings form parity, visual parity, and release readiness remain open.

### Verification
- `npm test -- --run src/test/SessionTokenUsage.test.tsx src/test/MessageTimeline.test.tsx` passed with 59 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- Browser reload of `http://127.0.0.1:8000/app/` showed `bodyOverflow = hidden`, `bodyScrollHeight = viewport height`, token text `用量 输入 112k 输出 791 总计 113k 上下文 13.6k / 1M`, no visible English `Tokens` label, localized tooltip details, and refresh label `刷新 token 用量`.

### Reviewer
- Main-agent component, build, and browser/DevTools verification completed for this token usage localization slice. No full Resource Management, Assistive Features, Message Timeline streaming/replay, visual parity, or release readiness completion is claimed.

## 2026-06-26 V2 Real SSE Run Stopped Browser Evidence Batch

### Scope
- Re-checked the Message Timeline, Run Recovery, and AG-UI Runtime Stream checklist after the token localization slice instead of continuing surface polish.
- Targeted a real-browser stream lifecycle gap: V2 already had real SSE evidence for completed, failed, resume, approval, and user-question paths, but not an independent server-emitted `run_stopped` finalization path.
- Added a real SSE browser scenario where the backend sends `run_started`, `text_delta`, and then `run_stopped` without a user Stop click.
- Verified the UI keeps the streamed text visible, closes the EventSource, hides Stop, restores Send, and does not open another reconnect/request after the terminal stopped event.
- Kept this as targeted AG-UI Runtime Stream evidence only; full Message Timeline streaming/replay, Run Recovery, reviewer sign-off, and release readiness remain open.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "real_sse_run_stopped_finalizes_stream_and_restores_send"` passed with 1 test selected.

### Reviewer
- Main-agent real browser integration verification completed for this `run_stopped` SSE lifecycle slice. No full AG-UI Runtime Stream, Run Recovery, Message Timeline, or release readiness completion is claimed.

## 2026-06-26 V2 Rich Replay Output And Validation Browser Evidence Batch

### Scope
- Re-checked the Message Timeline and AG-UI Runtime Stream checklist after the `run_stopped` evidence batch, focusing on event coverage that still lacked browser-level interrupted replay proof.
- Extended the built V2 `/app/` interrupted-stream browser scenario to emit `output_delta` after reconnect with both a structured text output part and an image `media_ref` part.
- Extended the same interrupted replay scenario to emit `tool_input_validation_failed`, then verified the compact validation preview and expanded details in the timeline.
- Kept the assertions in stream order so early tool-call/tool-result rows are checked before virtual scrolling unloads them, matching the real flow a user sees during streaming.
- Kept this as targeted Message Timeline and AG-UI Runtime Stream replay evidence only; full subsystem completion, reviewer sign-off, and release readiness remain open.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "interrupted_stream_preserves_non_text_events_after_reconnect"` passed with 1 test selected.

### Reviewer
- Main-agent built-app browser integration verification completed for this output-part and tool-validation replay slice. No full Message Timeline, AG-UI Runtime Stream, visual parity, or release readiness completion is claimed.

## 2026-06-26 V1/V2 Chat Frame Visual Audit

### Scope
- Re-checked the active V1 and V2 browser tabs after the rich replay coverage batch instead of relying on memory of earlier screenshots.
- Captured current viewport screenshots for V1 chat and V2 chat:
  - `.tmp/frontend-v1-chat-audit-current.png`
  - `.tmp/frontend-v2-visual-audit-current.png`
- Confirmed both V1 and V2 keep `body` fixed to the viewport (`overflow: hidden`, `scrollHeight = clientHeight = 943`) in the current desktop browser state.
- Confirmed V2 keeps independent scroll containers for the session list and timeline, with the composer fixed at the bottom of the one-page shell.
- Compared current frame metrics at `1733x943`: V2 sidebar `260px`, workspace x `266`, timeline `724px` tall, composer `135px` tall, round rail x `1589`; V1 current user/browser state showed sidebar `220px`, main x `226`, composer `78px` tall, round rail x `1489`.
- Did not change code from this audit because the observed V1 sidebar width differs from the prior 1280px V1 metric evidence and appears tied to persisted user/sidebar state rather than a stable default. A later visual parity pass should compare reset/known sidebar state across both UIs before changing width again.
- Kept this as visual QA evidence only; full Application Shell visual parity, same-session screenshot comparison, responsive screenshot matrix, reviewer sign-off, and release readiness remain open.

### Verification
- Browser screenshot capture succeeded for both current V1 and current V2 tabs.
- Browser metric scripts confirmed fixed-page body behavior and V2 independent timeline/session-list scrolling.

### Reviewer
- Main-agent visual audit completed for this desktop chat-frame checkpoint. No Application Shell, visual parity, or release readiness completion is claimed.

## 2026-06-26 V2 Recovery Action Localization Batch

### Scope
- Re-checked the active goal README and current implementation ledger before closing this small Run Recovery slice, rather than treating the latest screenshot note as the whole objective.
- Localized V2 recovery action controls for Chinese sessions: resume, approval feedback label and placeholder, approve, deny, answer, the fallback `Other` option, and the supplemental-answer label and placeholder.
- Added component coverage that switches the V2 UI store to Chinese and verifies the localized approval and user-question controls without changing the sidebar, settings entries, or V1-style secondary-page behavior.
- Refreshed `frontend/dist/app` for the recovery action localization change.
- Kept this as targeted Run Recovery and Chinese usability progress only; full Message Timeline streaming/replay, settings form parity, same-session visual screenshot matrix, Electron readiness, reviewer sign-off, and release readiness remain open.

### Verification
- `npm test -- --run src/test/RecoveryBar.test.tsx -t "localizes recovery action prompts"` passed with 1 selected test.
- `npm test -- --run src/test/RecoveryBar.test.tsx` passed with 23 tests.
- `npm run lint` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.

### Reviewer
- Main-agent component, lint, and build verification completed for this recovery localization slice. No full Run Recovery, Message Timeline, visual parity, or release readiness completion is claimed.

## 2026-06-26 V2 Real SSE Replay Cursor Dedupe Evidence Batch

### Scope
- Re-checked the parity checklist after the recovery localization close-out and shifted back to the higher-risk Message Timeline and AG-UI Runtime Stream gaps.
- Added a real SSE browser scenario for an interrupted stream where the server resumes from `after_event_id=2`, first replays the cursor event id `2`, then continues with a new text delta and terminal completion.
- Verified the V2 timeline keeps the original streamed text visible, dedupes the replayed cursor event instead of appending the first chunk twice, renders the new post-replay chunk, hides Stop, restores Send, and preserves the browser `Last-Event-ID: 2` continuation signal.
- Reused the real V2 `/app/` browser server fixture rather than mock-only reducer evidence, so this covers the user-facing replay path through EventSource, reducer, timeline rendering, and run-control state.
- Kept this as targeted streaming/replay evidence only; full Message Timeline, AG-UI Runtime Stream, visual parity matrix, Electron readiness, reviewer sign-off, and release readiness remain open.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "real_sse_replay_dedupes_cursor_event_before_continuing"` passed with 1 selected test.

### Reviewer
- Main-agent real browser integration verification completed for this replay cursor dedupe slice. No full Message Timeline, AG-UI Runtime Stream, or release readiness completion is claimed.

## 2026-06-26 V2 Appearance Dark Preset Browser Evidence Batch

### Scope
- Re-checked the Settings and Appearance parity gaps after the real SSE replay-dedupe batch instead of continuing only stream tests.
- Added a real V2 `/app/` browser scenario that opens the Settings drawer, verifies the Appearance page is the active first-level settings surface, keeps Dark selected, opens the theme preset listbox, chooses `Rose Pine`, and verifies the listbox closes.
- Verified the selected dark preset writes real appearance settings to local storage and applies the expected `--at-primary`, `--at-bg`, and `--at-text` CSS variables instead of acting as a decorative control.
- Verified the outer page remains fixed (`body` overflow hidden and document height equal to the viewport), while the actual settings section body owns internal scrolling.
- Captured dark Appearance evidence at `.tmp/frontend-v2-settings-appearance/v2-appearance-dark-rose-pine.png`.
- Preserved the V1 settings information architecture: no sidebar/settings entries were added or removed, and system-level pages remain behind the secondary launcher.
- Kept this as targeted Settings/Appearance browser evidence only; full Settings parity, all settings save/error/destructive-state coverage, reviewer sign-off, visual parity matrix, and release readiness remain open.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "appearance_dark_preset"` passed with 1 selected test.

### Reviewer
- Main-agent real browser verification completed for this Appearance dark preset slice. No full Settings, Application Shell, visual parity, or release readiness completion is claimed.

## 2026-06-26 V2 Shell Browser Evidence Alignment Batch

### Scope
- Re-checked the active goal README, parity checklist, and current implementation ledger before choosing this close-out slice, with the remaining high-risk gaps still centered on stream/replay edge cases, full settings form parity, message timeline coverage, Electron readiness, visual parity matrix, and reviewer sign-off.
- Updated stale browser shell evidence to match the current V1-aligned implementation instead of the old generated shell assumptions.
- Aligned the sidebar resize browser scenario with the restored 260px default width and the current `agentTeams.sidebarWidthMigratedTo260` migration key.
- Expanded the sidebar module browser scenario from the obsolete six-entry list to the V1 primary navigation order: Chat, Automation, Skills, Board, Search, Connectors, Memory, Observability, and Settings.
- Scoped navigation clicks to the sidebar primary navigation so topbar shortcuts do not accidentally satisfy sidebar parity checks.
- Verified each primary entry opens a real surface: chat composer, automation project, skills market, board TODO, session search, connectors/runtime tools, memory detail, observability breakdowns, and the settings drawer with the Appearance section.
- Kept this as evidence-layer Application Shell parity progress only; no product UI code changed, no sidebar/settings entries were added or removed, and no subsystem completion is claimed.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "sidebar_mouse_resize_persists_after_reload or sidebar_module_entries_open_real_surfaces"` passed with 2 selected tests.

### Reviewer
- Main-agent browser evidence alignment completed for this shell/navigation slice. Full Application Shell visual parity, Settings parity, streaming/replay completion, Electron readiness, and reviewer subagent sign-off remain open.

## 2026-06-26 V2 Settings System Secondary Pages Browser Evidence Batch

### Scope
- Re-checked the Settings parity checklist and current browser coverage after the shell evidence alignment batch, then focused on the V1 secondary-page rule instead of flattening more settings into the root drawer.
- Expanded the real built `/app/` Settings browser scenario so the V1 primary Settings section order remains fixed while System-owned pages stay absent from the root Settings navigation.
- Verified the System secondary page launcher exposes MCP, Plugins, Commands, Hooks, Agent Runtime, GitHub, and Triggers, then opened each page and returned to System with the real Back control.
- Added mock API coverage for the real endpoints those secondary pages load: `/api/mcp/servers`, `/api/mcp/servers/stdio-shell/tools`, `/api/system/configs/plugins/runtime`, `/api/system/configs/hooks`, `/api/system/configs/hooks/runtime`, `/api/system/configs/agent-runtimes`, `/api/gateway/feishu/accounts`, and `/api/gateway/wechat/accounts`.
- Kept this as Settings information-architecture and browser evidence progress only; no product UI code changed, no settings entries were added or removed, and full save/error/destructive-state coverage remains open.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "settings_keeps_v1_sections"` passed with 1 selected test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "settings_keeps_v1_sections or sidebar_mouse_resize_persists_after_reload or sidebar_module_entries_open_real_surfaces"` passed with 3 selected tests.

### Reviewer
- Main-agent browser verification completed for this System secondary settings slice. Full Settings subsystem parity, all settings mutation/error states, visual reviewer pass, streaming/replay completion, and release readiness remain open.

## 2026-06-26 V2 Stream Copy Control Browser Evidence Batch

### Scope
- Re-checked the active frontend rewrite goal and product parity ledger before choosing this slice, with remaining high-risk work still centered on stream/replay edge cases, full settings mutation/error parity, full visual screenshot QA, Electron readiness, and reviewer sign-off.
- Added a real built `/app/` browser scenario for the Message Timeline copy control during an active AG-UI stream.
- Updated runtime text/output rows so streamed assistant answers expose the same latest-answer copy action as hydrated answer rows, while non-answer runtime status, thinking, and tool-only rows remain non-copyable.
- Verified a streamed assistant answer renders immediately, the `Copy last answer` action is visible but disabled while the run stream is open, and the same action becomes enabled only after the terminal `run_completed` event closes the EventSource.
- Verified the terminal state also restores the normal `Send` control, covering the user-facing transition from streaming mode back to idle mode.
- Kept this as targeted Message Timeline and AG-UI Runtime Stream UI-state evidence only; no sidebar/settings entries were added or removed, and no subsystem completion is claimed.

### Verification
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "copy_last_answer"` passed with 1 selected test.
- `npm test -- --run src/test/MessageTimeline.test.tsx -t "copy"` passed with 1 selected test.
- `npm test -- --run src/test/MessageTimeline.test.tsx` passed with 54 tests.

### Reviewer
- Main-agent browser test coverage was added for this stream copy-control slice. Full Message Timeline, AG-UI Runtime Stream, visual parity matrix, Electron readiness, and release readiness remain open.

## 2026-06-26 V2 Web Settings Save/Error Browser Evidence Batch

### Scope
- Re-checked the Settings completion rules after the stream copy-control batch, focusing on the remaining requirement that forms load real data, save through real APIs, and show visible validation or mutation errors.
- Added a real built `/app/` browser scenario that opens Settings from the topbar, navigates to the existing V1-aligned Web settings entry, and verifies the section loads saved Web config from `/api/system/configs/web`.
- Verified the saved Exa key preservation path by leaving the key field blank, editing the SearXNG URL, and asserting the UI sends a real `PUT /api/system/configs/web` payload that preserves the stored key while saving the changed URL.
- Verified successful save feedback with the visible `Web settings saved.` toast.
- Verified failed save feedback by forcing the next Web settings `PUT` to return HTTP 500 and asserting the visible API error message appears without replacing the last successfully saved config.
- Kept this as targeted Settings form mutation/error evidence only; no sidebar or settings entries were added or removed, and full Settings subsystem parity still requires broader reviewer coverage across every settings surface.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "web_settings_save"` passed with 1 selected test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "settings_keeps_v1_sections or web_settings_save or appearance_dark_preset"` passed with 3 selected tests.

### Reviewer
- Main-agent browser verification completed for this Web settings save/error slice. Full Settings subsystem parity, all destructive/high-impact settings confirmations, visual parity matrix, Electron readiness, and release readiness remain open.

## 2026-06-26 V2 Remote Workspace Delete Confirmation Browser Evidence Batch

### Scope
- Re-checked the Settings completion rules after the Web settings save/error batch, focusing on the destructive/high-impact confirmation requirement that still needed browser-level evidence.
- Added a real built `/app/` browser scenario that opens Settings from the topbar, navigates to the existing V1-aligned Remote workspace entry, and verifies SSH profiles load from `/api/system/configs/workspace/ssh-profiles`.
- Verified clicking `Delete` first opens the confirmation dialog for `devbox` and does not send any `DELETE` request before the user confirms.
- Verified canceling the confirmation leaves the profile visible and still does not call the delete API.
- Verified confirming the dialog sends `DELETE /api/system/configs/workspace/ssh-profiles/devbox`, shows the visible success toast, refreshes the SSH profile list, and renders the empty state after the backend removes the profile.
- Kept this as targeted Settings destructive-action evidence only; no sidebar/settings entries were added or removed, and full Settings subsystem parity still requires broader mutation/error/destructive coverage and reviewer sign-off.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "remote_workspace_delete"` passed with 1 selected test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "settings_keeps_v1_sections or web_settings_save or remote_workspace_delete"` passed with 3 selected tests.

### Reviewer
- Main-agent browser verification completed for this Remote workspace delete-confirmation slice. Full Settings subsystem parity, full visual parity matrix, Electron readiness, reviewer sign-off, and release readiness remain open.

## 2026-06-26 V2 Electron Health Endpoint Alignment Batch

### Scope
- Re-checked the active frontend rewrite goal and remaining parity ledger before choosing this slice, with the next high-risk gaps still centered on stream/replay edge cases, visual parity matrix work, full Settings parity sign-off, Electron readiness, and release readiness.
- Aligned the Electron backend startup plan with the backend's real public health contract by changing both external and managed desktop plans from `/api/health` to `/api/system/health`.
- Updated the desktop smoke harness so healthy, unhealthy, and managed backend fixtures all respond on `/api/system/health`, preventing the smoke tests from masking a route mismatch that the packaged desktop app would hit against the real server.
- Preserved the existing Electron security and lifecycle boundaries: renderer stays behind the preload/main IPC boundary, external links still use the main-process bridge, and managed backend ownership still starts and stops through the main process.
- Kept this as targeted Desktop/Electron readiness progress only; no sidebar/settings entries were added or removed, no renderer UI was changed, and full Electron release readiness still requires the broader packaging and reviewer pass.

### Verification
- `npm test -- --run src/test/desktopBackendPlan.test.ts src/test/desktopSecurity.test.ts` passed with 2 files and 9 tests.
- `npm run desktop:build` passed.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_desktop_smoke.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_desktop_smoke.py` passed with 4 tests.

### Reviewer
- Main-agent Electron smoke verification completed for this health endpoint alignment slice. Full Desktop/Electron release readiness, visual parity matrix completion, stream/replay completion, and reviewer sign-off remain open.

## 2026-06-26 V2 Board Sync Browser Evidence Batch

### Scope
- Re-checked the active frontend rewrite goal, parity checklist, quality gates, current browser DOM, and latest ledger before choosing this slice, avoiding another narrow settings-only pass.
- Verified from the live `/app/` DOM that the page shell remains fixed to one viewport with `body` overflow hidden, then focused this batch on the Connectors/Memory/Gateway/Automation/Boards parity requirement that module actions call real endpoints.
- Added a real built `/app/` browser scenario that opens the existing V1-aligned Board module from primary navigation, verifies the initial board card and revision from `GET /api/boards/todos`, clicks the visible `Sync board` action, and asserts the UI is replaced by the `POST /api/boards/todos:sync` response.
- Extended the shell mock backend to record the exact sync payload and return a different board revision/card after sync, proving the button is not decorative and the module consumes the real mutation response.
- Kept this as targeted Boards action evidence only; no sidebar/settings entries were added or removed, no renderer UI structure changed, and full Connectors/Memory/Gateway/Automation/Boards completion still requires broader action/error/reviewer coverage.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "board_sync"` passed with 1 selected test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "sidebar_module_entries_open_real_surfaces or board_sync"` passed with 2 selected tests.

### Reviewer
- Main-agent browser verification completed for this Board sync action slice. Full module parity, visual parity matrix completion, stream/replay completion, subsystem reviewer sign-off, and release readiness remain open.

## 2026-06-26 V2 Automation Toggle Browser Evidence Batch

### Scope
- Re-checked the active frontend rewrite goal, parity ledger, and current worktree before choosing this slice, then moved from Board evidence to another high-value module action instead of continuing only one area.
- Fixed Automation status mutations so successful enable/disable responses update both the selected project detail cache and the project list cache, while exact list invalidation no longer refetches and overwrites the current detail with stale data.
- Added refresh coverage for the automation project's recent-run query after `Run now` succeeds so the Automation surface can reflect newly started runs when the user remains on the module page.
- Strengthened the Automation component test so the Disable action must leave the detail view showing the real Enable follow-up state, not merely call the mocked endpoint.
- Added a real built `/app/` browser scenario that opens Automation from the existing V1-aligned primary navigation, clicks Disable and Enable, verifies `POST /api/automation/projects/aut-daily:disable` and `:enable`, and confirms the detail status/button updates from the backend response.
- Kept this as targeted Automation action and cache-correctness progress only; no sidebar/settings entries were added or removed, and full Connectors/Memory/Gateway/Automation/Boards completion still requires broader action/error/reviewer coverage.

### Verification
- `npm test -- --run src/test/AutomationView.test.tsx` passed with 4 tests.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "automation_toggle"` passed with 1 selected test before the build.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "automation_toggle or sidebar_module_entries_open_real_surfaces"` passed with 2 selected tests after the build.

### Reviewer
- Main-agent component and built-app browser verification completed for this Automation toggle slice. Full module parity, visual parity matrix completion, stream/replay completion, subsystem reviewer sign-off, and release readiness remain open.

## 2026-06-26 V2 Real SSE Multiplex Background Stream Evidence Batch

### Scope
- Re-checked the active frontend rewrite goal, parity checklist, latest stream ledger entries, and current worktree before choosing this slice, then shifted back to the higher-risk AG-UI Runtime Stream requirements instead of continuing module-management actions.
- Identified that multiplex stream behavior had reducer/client and mock-EventSource browser coverage, while built-app real SSE browser evidence still centered on single-run streams.
- Added a real built `/app/` browser scenario where recovery exposes a running background subagent task, the frontend opens the true `/api/ag-ui/runs/events` multiplex SSE endpoint with both the main run and subagent run, and both streams render their text deltas in the timeline.
- Extended the real SSE test server to handle `/api/ag-ui/runs/events`, record multiplex run offsets, emit main and reviewer subagent deltas, and close only after both tracked runs receive terminal events.
- Kept this as targeted AG-UI multiplex and background stream continuation evidence only; full AG-UI Runtime Stream, Subagents, Message Timeline, visual parity matrix, subsystem reviewer sign-off, and release readiness remain open.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "real_sse_background_task_recovery_streams_multiplexed_runs"` passed with 1 selected test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "background_task_recovery_uses_multiplex_stream or real_sse_background_task_recovery_streams_multiplexed_runs or real_sse_replay_dedupes_cursor_event_before_continuing"` passed with 3 selected tests.

### Reviewer
- Main-agent built-app real SSE browser verification completed for this multiplex background stream slice. Full AG-UI Runtime Stream, Subagents, visual parity matrix, reviewer sign-off, and release readiness remain open.

## 2026-06-26 V2 Round Rail Retry/Todo Browser Evidence Batch

### Scope
- Re-checked the active frontend rewrite goal, parity checklist, latest ledger, and current worktree before choosing this slice, then moved to the Rounds/Todos/History/Retry requirement instead of extending the previous stream-only work.
- Identified that round retry/todo details had component-level coverage, while the checklist still called for Playwright navigation through rounds and dense round history inspection.
- Added a real built `/app/` browser scenario that opens the existing V1-aligned chat surface, waits for the round rail, hovers the round navigation item, and verifies the visible detail panel renders pending approvals, pending questions, retry metadata, diagnostic text, and todo items from the `/api/sessions/{session_id}/rounds?limit=100` response.
- Extended the shell mock round fixture with real retry, todo, pending action, and diagnostic fields so the test proves the UI consumes the backend round projection instead of asserting static markup.
- Captured local browser evidence at `.tmp/frontend-v2-rounds/v2-round-rail-detail.png`.
- Kept this as targeted Rounds/Todos/History/Retry evidence only; no sidebar/settings entries were added or removed, no V1 secondary-page logic changed, and full round history/retry parity still requires paging and reviewer coverage.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "round_rail_opens_retry_todo_detail"` passed with 1 selected test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "message_export or round_rail_opens_retry_todo_detail"` passed with 2 selected tests.

### Reviewer
- Main-agent built-app browser verification completed for this round rail retry/todo slice. Full Rounds/Todos/History/Retry parity, paging coverage, visual parity matrix completion, subsystem reviewer sign-off, and release readiness remain open.

## 2026-06-26 V2 Runtime Tools Connector Action Browser Evidence Batch

### Scope
- Re-checked the active frontend rewrite goal, latest ledger, and current worktree after the round rail commit, then moved to the Connectors/Memory/Gateway/Automation/Boards requirement instead of continuing round-only coverage.
- Identified that runtime tool actions had component tests and module-open browser evidence, but no built `/app/` browser proof that the visible connector action buttons work inside the real shell.
- Added a real built `/app/` browser scenario that opens Connectors from the existing V1-aligned primary navigation, verifies the ripgrep runtime tool card loads from `/api/connectors/runtime-tools`, clicks the visible copy-path button, and asserts the browser clipboard receives the backend-provided binary path.
- Extended the shell mock backend with stateful `POST /api/connectors/runtime-tools/system-path:add` handling, then verified the visible `Add to system environment variables` action calls the real endpoint, updates the button to `Added to system environment variables`, and shows the backend success message.
- Captured local browser evidence at `.tmp/frontend-v2-connectors/v2-runtime-tools-actions.png`.
- Kept this as targeted connector action evidence only; no sidebar/settings entries were added or removed, no connector set was changed, and full Connectors/Memory/Gateway/Automation/Boards parity still requires broader gateway/memory/handoff/error reviewer coverage.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "connectors_runtime_tools_actions"` passed with 1 selected test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "sidebar_module_entries_open_real_surfaces or connectors_runtime_tools_actions"` passed with 2 selected tests.

### Reviewer
- Main-agent built-app browser verification completed for this runtime tools connector action slice. Full module parity, gateway action coverage, visual parity matrix completion, subsystem reviewer sign-off, and release readiness remain open.

## 2026-06-26 V2 Board Handoff Start Browser Evidence Batch

### Scope
- Re-checked the active frontend rewrite goal, parity checklist, latest ledger, and current worktree before choosing this slice, then targeted the still-open Boards TODO handoff interaction requirement instead of continuing only visual polish or connector actions.
- Added typed frontend contracts and API client calls for `POST /api/boards/todos/{todo_id}:preview-start` and `POST /api/boards/todos/{todo_id}:start`.
- Added a secondary Board handoff drawer opened from each Todo card, preserving the V1-style module navigation and avoiding new sidebar/settings entries; the drawer previews the backend prompt, exposes the final prompt editor, displays execution/queue/concurrency diagnostics, and starts the handoff through the real API.
- Updated the Board query cache from the start response so the card moves to the backend-reported in-progress state without a decorative-only button or stale list.
- Added component coverage for preview/start payloads and cache updates, plus a built `/app/` browser scenario that opens Board from the existing V1-aligned primary navigation, previews a TODO handoff, edits the final prompt, starts it, verifies the real endpoint payloads, waits for the drawer to close, and captures stable browser evidence at `.tmp/frontend-v2-board/v2-board-handoff-started.png`.
- Kept this as targeted Board start-handoff progress only; request-changes, mark done/archive/restore, source settings, broader module error states, full visual parity matrix, stream/replay completion, subsystem reviewer sign-off, and release readiness remain open.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `npm test -- --run src/test/BoardTodosView.test.tsx` passed with 4 tests.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "board_handoff_preview_and_start"` passed with 1 selected test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "board_sync or board_handoff_preview_and_start"` passed with 2 selected tests.

### Reviewer
- Main-agent component and built-app browser verification completed for this Board start-handoff slice. Full Boards action parity, Connectors/Memory/Gateway/Automation/Boards module parity, visual parity matrix completion, stream/replay completion, subsystem reviewer sign-off, and release readiness remain open.

## 2026-06-26 V2 Stream Reconnect Exhaustion Recovery Batch

### Scope
- Re-checked the active frontend rewrite goal, parity checklist, stream/recovery coverage, and latest ledger after the Board handoff commit, then moved back to the high-risk AG-UI Runtime Stream edge cases instead of continuing only module actions.
- Identified that V2 already had unit and browser coverage for single reconnects, replay cursors, Last-Event-ID, server-error suppression, run failed/stopped finalization, and multiplexed background streams, but lacked evidence for repeated transport interruptions exhausting the manual reconnect fallback.
- Added controller coverage proving repeated transport failures retry from the latest local cursor for three fallback attempts, then stop opening new streams, clear active/tracked run state, and suppress the stale recovery target.
- Added a built `/app/` browser scenario that starts a run, receives live text, forces repeated mock EventSource transport failures through the real composer/recovery shell, and verifies that after reconnect exhaustion all EventSources are closed, the Stop control disappears, Send returns, and no immediate recovery auto-start creates a fifth EventSource.
- Fixed the discovered bug where reconnect exhaustion cleared the current stream but did not suppress the still-running recovery target, allowing RecoveryBar to immediately restart the same failed stream and leave the composer in an active-run state.
- Kept this as targeted AG-UI transport-exhaustion progress only; full event matrix completion, long-run visual QA, subagent reviewer sign-off, and release readiness remain open.

### Verification
- `npm test -- --run src/test/RunStreamController.test.tsx` passed with 17 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "interrupted_stream_exhausts_manual_reconnects"` passed with 1 selected test.
- `npm test -- --run src/test/RunStreamController.test.tsx src/test/RecoveryBar.test.tsx` passed with 40 tests.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "interrupted_stream_exhausts_manual_reconnects or interrupted_stream_reconnects_from_latest_event_id or real_sse_server_error_suppresses_stale_auto_recovery"` passed with 3 selected tests.

### Reviewer
- Main-agent component and built-app browser verification completed for this transport reconnect-exhaustion slice. Full AG-UI Runtime Stream completion, Message Timeline visual parity, subsystem reviewer sign-off, and release readiness remain open.

## 2026-06-26 V2 Board Status Actions Browser Evidence Batch

### Scope
- Re-checked the active frontend rewrite goal, parity checklist, latest ledger, and live `/app/` shell before choosing this slice, then returned to the Board action parity gap left open by the prior handoff batch instead of continuing only stream work or one screenshot complaint.
- Added typed frontend contracts and API client calls for `POST /api/boards/todos/{todo_id}:preview-request-changes`, `:request-changes`, `:mark-done`, `:archive`, and `:restore`.
- Extended Board cards with status-appropriate real actions: Todo keeps Start handoff, Review can Request changes through a secondary drawer and Mark done through confirmation, Done can Archive through confirmation, and Archived can Restore when archived items are included.
- Preserved the existing V1-aligned shell/module navigation and secondary-page behavior: no sidebar/settings entries were added or removed, and the request-changes flow stays in a drawer with preview, editable final prompt, queue/concurrency diagnostics, and backend response cache updates.
- Added component coverage for request-changes preview/submission payloads, mark-done confirmation, archive confirmation/removal from the non-archived view, and API-client endpoint encoding/payloads.
- Added a built `/app/` browser scenario that opens Board from primary navigation, requests changes on a Review card, verifies exact preview/request endpoint payloads, waits for the drawer to close, observes the card update to the backend-reported running state, and captures evidence at `.tmp/frontend-v2-board/v2-board-request-changes.png`.
- Re-loaded the user's live in-app browser at `http://127.0.0.1:8000/app/`, switched to the real Board page, and verified from DOM metrics that the shell stayed fixed to the viewport (`bodyHeight` matched `viewportHeight`) with the Board view visible and actions present; direct in-app screenshot capture timed out, so the local Playwright screenshots remain the visual artifact for this batch.
- Kept this as targeted Board status-action progress only; source settings, broader module error states, complete Connectors/Memory/Gateway/Automation/Boards reviewer sign-off, visual parity matrix completion, stream/replay completion, and release readiness remain open.

### Verification
- `npm test -- --run src/test/BoardTodosView.test.tsx src/test/apiClient.test.ts` passed with 2 files and 32 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "board_sync or board_handoff or board_request_changes"` passed with 3 selected tests.

### Reviewer
- Main-agent component, API-client, built-app browser, and live in-app DOM verification completed for this Board status-action slice. Full Boards/module parity, visual parity matrix completion, AG-UI stream/replay completion, subsystem reviewer sign-off, and release readiness remain open.

## 2026-06-26 V2 Real SSE Rich Replay Terminal Recovery Batch

### Scope
- Re-checked the frontend rewrite goal and latest ledger before closing this slice, then kept the work focused on the still-high-risk AG-UI stream/replay and Message Timeline parity area instead of treating the latest screenshot as the whole goal.
- Added a built `/app/` real SSE rich-replay scenario that reconnects with `Last-Event-ID`, replays thinking, tools, token usage, model steps, state snapshot/delta, todos, notifications, subagent status/stop/resume, background task, injections, user question/request answer, manual action, output text/media, validation failure, and terminal completion events.
- Fixed terminal stream closure so stale recovery targets are suppressed after `onClosed` or local terminal transport closure, preventing an already completed replay from immediately auto-starting again from an outdated recovery snapshot.
- Fixed Message Timeline round metadata so a runtime-closed run can override stale persisted `running/streaming` round labels with the terminal status while preserving the existing round rail, marker, and V1-style navigation shape.
- Verified the browser screenshot evidence at `.tmp/frontend-v2-stream/v2-real-sse-rich-replay.png`: the fake streaming recovery bar is gone, the round marker shows `completed`, and rich replay event rows render in the timeline.
- Kept this as targeted AG-UI replay/recovery progress only; the full visual parity matrix, remaining stream edge cases, subsystem reviewer sign-off, Electron release readiness, and final V2 naming cleanup remain open.

### Verification
- `npm test -- --run src/test/MessageTimeline.test.tsx src/test/RunStreamController.test.tsx` passed with 2 files and 73 tests.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "real_sse_interrupted_stream_reconnects_from_runtime_cursor or real_sse_replay_dedupes_cursor_event_before_continuing or real_sse_rich_replay"` passed with 3 selected tests.

### Reviewer
- Main-agent component, built-app browser, and screenshot verification completed for this rich replay terminal-recovery slice. Full AG-UI Runtime Stream completion, Message Timeline visual parity, visual parity matrix completion, subsystem reviewer sign-off, and release readiness remain open.

## 2026-06-26 V2 Route Switch And V1 Baseline Browser Evidence Batch

### Scope
- Re-checked the active frontend rewrite goal, parity checklist, quality gates, latest ledger, and live `/app/` DOM state before closing this small slice, then kept the work focused on route/baseline evidence rather than treating the latest annotated screenshot as the whole objective.
- Added browser coverage that starts on the real V1 root page, verifies the V1 shell and `Open new interface` entry, switches into `/app/`, verifies the fixed V2 shell and `V1` return entry, then switches back to the V1 root page.
- Extended the local browser test server to serve both legacy `frontend/dist` assets and the V2 `frontend/dist/app` bundle so route switching is exercised against the same built static layout the product ships.
- Narrowed API interception for this flow to the served `/api/**` origin and added the V1 workspace sidebar-session response so legacy static assets are not mistaken for backend API requests and the captured V1 screenshots stay free of mock-route error toasts.
- Captured route-switch evidence at `.tmp/frontend-v2-route-switch/`: `v1-root-before-switch.png`, `v2-after-new-ui-switch.png`, and `v1-after-return.png`; manual inspection confirmed V1 opens cleanly, V2 keeps the fixed shell/composer frame, and returning to V1 preserves the V1 root surface.
- Kept this as route-switch and baseline evidence only; full same-session visual matrix, remaining Message Timeline stream/replay edge cases, Settings form mutation/error parity, Electron/release readiness, and subsystem reviewer sign-off remain open.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "route_switches_from_v1_and_back"` passed with 1 selected test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "route_switches_from_v1_and_back or sidebar_mouse_resize"` passed with 2 selected tests.

### Reviewer
- Main-agent browser integration and screenshot inspection completed for this route-switch baseline slice. No Application Shell, Settings, Message Timeline, or release subsystem completion is claimed from this batch.

## 2026-06-26 V2 Real SSE Malformed Event Recovery Batch

### Scope
- Re-checked the active frontend rewrite goal, product parity checklist, quality gates, stream/recovery tests, and latest ledger before choosing this slice, then targeted a remaining runtime-gate edge case instead of continuing only visual or settings work.
- Added a built `/app/` real SSE browser scenario where the server sends a valid initial text delta followed by a structurally invalid named SSE event.
- Verified the visible stream state after the malformed event: the already streamed text remains rendered, Stop disappears, Send returns, and the stale recovery target is suppressed so the RecoveryBar does not immediately auto-start the same broken stream again.
- Extended the real SSE test server with a malformed-event mode and kept the request-count assertion at one stream request after the error, covering the browser path that was previously only represented by lower-level stream-client tests.
- Re-queued reviewer subagent `019eff12-9b1b-7943-a5c8-0c0bea9d6c44` to continue the AG-UI Runtime Stream and Run Recovery review; no final PASS/FAIL is claimed in this batch because the reviewer had not returned before this commit.
- Kept this as targeted AG-UI Runtime Stream error-path evidence only; full stream/replay completion, Message Timeline visual parity, subsystem reviewer sign-off, Electron readiness, and release readiness remain open.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "real_sse_malformed_event_suppresses_stale_auto_recovery"` passed with 1 selected test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "real_sse_malformed_event_suppresses_stale_auto_recovery or real_sse_server_error_suppresses_stale_auto_recovery or real_sse_run_failed_finalizes_stream"` passed with 3 selected tests.

### Reviewer
- Main-agent built-app browser verification completed for this malformed SSE edge case. Hegel reviewer review is still pending, so no subsystem completion is claimed.

## 2026-06-26 V2 Board Source Settings Browser Evidence Batch

### Scope
- Re-checked the active frontend rewrite goal, product parity checklist item 10, latest ledger, and current worktree before choosing this slice, then targeted the still-open Board `todo source settings` gap instead of continuing only screenshot-level polish.
- Added typed frontend contracts and API client calls for `GET /api/boards/todo-sources`, `POST /api/boards/todo-sources`, `PATCH /api/boards/todo-sources/{source_id}`, and `DELETE /api/boards/todo-sources/{source_id}`.
- Added a Board-local secondary drawer for source settings, preserving the V1-aligned sidebar/settings item set and avoiding a flattened root-level management surface.
- The drawer lists source display name, repository, enabled/system state, source kind, sync status, last sync time, and diagnostics; it supports create/edit/delete against real endpoints, while system-managed sources are read-only.
- Added component coverage for opening the drawer, loading sources, editing an existing source, creating a new GitHub issues source, plus API-client endpoint encoding and payload coverage including delete.
- Added a built `/app/` browser scenario that opens Board from primary navigation, opens the Board sources drawer, edits, creates, and deletes sources through real mocked endpoints, and captures evidence at `.tmp/frontend-v2-board/v2-board-source-settings.png`.
- Re-loaded the user's live in-app browser at `http://127.0.0.1:8000/app/`, verified the shell remains fixed to the viewport with the V1-aligned sidebar entries unchanged, opened the real Board page, and opened the `看板来源` drawer; DOM metrics showed `bodyHeight` still matched `viewportHeight`.
- Kept this as targeted Board source-settings progress only; broader Connectors/Memory/Gateway/Automation/Boards reviewer sign-off, visual parity matrix completion, AG-UI stream/replay completion, Electron readiness, and release readiness remain open.

### Verification
- `npm test -- --run src/test/BoardTodosView.test.tsx src/test/apiClient.test.ts` passed with 2 files and 34 tests.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "board_source_settings"` passed with 1 selected test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "board_sync or board_handoff or board_request_changes or board_source_settings"` passed with 4 selected tests.

### Reviewer
- Main-agent component, API-client, built-app browser, and live in-app DOM verification completed for this Board source-settings slice. Full module parity and subsystem reviewer sign-off remain open.

## 2026-06-26 V2 Recoverable Parent Background Stream Fix Batch

### Scope
- Re-checked the active frontend rewrite goal, latest ledger, live `/app/` DOM state, and Hegel reviewer result before choosing this slice; moved from screenshot-level timeline polish back to the higher-risk AG-UI stream/replay recovery gap.
- Addressed Hegel reviewer `019eff12-9b1b-7943-a5c8-0c0bea9d6c44` P1 finding: V2 could include a recoverable/stopped parent run in automatic background multiplex recovery whenever active background tasks existed, diverging from V1 and risking a stream that stayed open after the real background/subagent run completed.
- Split automatic recovery target selection so the foreground active run is included only when its own status or phase is streamable, while background task output runs are added separately.
- Filtered background task targets that point back to the same recoverable/stopped parent run; subagent tasks with a distinct `subagent_run_id` now stream that child run only.
- Preserved explicit Resume, pending approval, pending user question, paused subagent, and running parent + subagent multiplex paths.
- Extended the real SSE browser harness so it can serve a standalone subagent run stream, then added built `/app/` evidence that a recoverable stopped parent with an active subagent requests only the child run, opens no multiplex stream, renders the subagent output, and returns the composer to Send without showing Stop.
- Kept this as targeted AG-UI Runtime Stream recovery progress only; Message Timeline visual parity, full visual matrix, subsystem reviewer sign-off, Electron readiness, and release readiness remain open.

### Verification
- `npm test -- RecoveryBar.test.tsx -t "subagent output run|same-run background"` passed with 2 selected tests.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm test -- RecoveryBar.test.tsx -t "active background subagent recovery|subagent output run|same-run background"` passed with 3 selected tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "recoverable_parent_streams_background_subagent_only"` passed with 1 selected test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "background_task_recovery_uses_multiplex_stream or real_sse_background_task_recovery_streams_multiplexed_runs or recoverable_parent_streams_background_subagent_only or background_task_recovery_displays_collapses_and_stops"` passed with 4 selected tests.
- `npm test -- RecoveryBar.test.tsx` passed with 25 tests.

### Reviewer
- Hegel reviewer P1 was reproduced from code review and fixed in this batch.
- Follow-up reviewer result from Hegel subagent `019eff12-9b1b-7943-a5c8-0c0bea9d6c44`: PASS for the recoverable/stopped parent background-stream P1 in commit `663e2b3b`; no blocker remains in that P1 scope.
- No final AG-UI Runtime Stream subsystem completion is claimed from this targeted P1 pass; broader stream/replay, visual parity, subsystem reviewer sign-off, Electron readiness, and release readiness remain open.

## 2026-06-26 V2 Electron Smoke Evidence Batch

### Scope
- Re-checked the active frontend rewrite goal, latest ledger, and existing Electron desktop implementation before choosing the next slice, keeping the work grounded in global V2 readiness rather than only the latest message screenshot.
- Verified the desktop main/preload boundary currently covers external-link routing, backend status exposure, retry startup, copy diagnostics, managed backend lifecycle, and renderer isolation through the existing desktop smoke suite.
- Inspected the Electron renderer screenshot at `.tmp/frontend-v2-desktop/v2-electron-renderer.png`; the real V2 shell loaded nonblank in desktop mode, the backend was connected, the composer was visible, and the sidebar showed the V1-aligned primary entries including Chat, Automation, Skills, Board, Search, Connectors, Memory, Observability, and Settings.
- Kept this as desktop smoke evidence only; no sidebar/settings entries were added or removed, no renderer UI behavior was changed, and full Desktop/Electron release readiness still requires broader packaging/release validation and reviewer sign-off.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_desktop_smoke.py` passed with 4 tests.
- Main-agent visual inspection of `.tmp/frontend-v2-desktop/v2-electron-renderer.png` confirmed the renderer was nonblank and framed as the V2 desktop shell rather than a fallback error page.

### Reviewer
- Main-agent desktop smoke verification completed for this evidence batch. No full Desktop/Electron subsystem completion is claimed.

## 2026-06-26 V2 Settings Full Component Gate Stabilization Batch

### Scope
- Re-checked the active frontend rewrite goal, Settings parity checklist, quality gates, and latest Settings ledger entries before choosing this slice, then targeted the currently red Settings gate instead of continuing only screenshot-level polish.
- Found the combined Settings navigation and SettingsDrawer component gate failed because the System -> Agent Runtime create/delete secondary-page path timed out at 25 seconds in the full suite, even though the same destructive confirmation path passed in isolation.
- Increased the Agent Runtime create/delete test timeout to match other long Settings secondary-page flows, preserving the existing V1-aligned Settings information architecture: no root settings entries were added or removed, and Agent Runtime remains behind the System secondary launcher.
- Kept this as Settings test-gate stabilization only; full Settings subsystem completion still requires reviewer coverage across all tabs, broader browser evidence for save/error/destructive states, visual parity review, and release readiness.

### Verification
- `npm test -- --run src/test/SettingsDrawer.test.tsx -t "creates and deletes agent runtimes"` passed with 1 selected test.
- `npm test -- --run src/test/SettingsNavigationParity.test.ts src/test/SettingsDrawer.test.tsx` passed with 2 files and 18 tests.

### Reviewer
- Main-agent Settings component gate verification completed for this stabilization slice. No full Settings subsystem completion is claimed.

## 2026-06-26 V2 Live Settings Information Architecture Browser Recheck Batch

### Scope
- Re-checked the live in-app browser at `http://127.0.0.1:8000/app/` after the Settings component gate stabilization, focusing on global V2 framework health before choosing further implementation work.
- Verified the current live shell remains a fixed one-page workspace: viewport `1280x720`, `body` and `documentElement` both had `clientHeight=720` and `scrollHeight=720`, while the timeline owned its own internal scroll (`clientHeight=500`, `scrollHeight=4466`).
- Verified the visible primary sidebar entry set remains V1-aligned and unchanged: Chat, Automation, Skills, Board, Search, Connectors, Memory, Observability, and Settings.
- Opened Settings from the live UI and confirmed the root Settings navigation remains the V1-aligned set only: Appearance, General, Speech, Notifications, Models, Roles, Orchestration, Web, ClawHub, Proxy, Remote Workspace, Environment Variables, and System.
- Confirmed System child pages remain behind the System secondary launcher rather than being flattened into the root Settings list: MCP, Plugins, Commands, Hooks, Agent Runtime, GitHub, and Triggers.
- Opened the live System -> Agent Runtime secondary page and verified it renders real runtime entries and controls (`Back`, `Refresh`, `ACP registry`, `New runtime`, and runtime rows such as Amp, Claude Agent, Codex CLI, and OpenCode) while the page-level body/document stayed fixed to the viewport.
- Direct in-app screenshot capture timed out in this batch, so this entry records DOM/metric browser evidence only; no screenshot artifact is claimed.
- Kept this as Settings information-architecture and live layout evidence only. No Settings subsystem completion is claimed; Hegel reviewer Settings review is queued and full visual/reviewer sign-off remains open.

### Verification
- Main-agent in-app browser DOM/metric verification completed against the live `/app/` page.

### Reviewer
- Hegel reviewer `019eff12-9b1b-7943-a5c8-0c0bea9d6c44` was queued for Settings subsystem readiness review after this recheck; no PASS/FAIL result has returned yet.

## 2026-06-26 V2 Resource And Assistive Feature Evidence Batch

### Scope
- Re-checked the product parity checklist item 12 and the latest ledger before choosing this slice, then focused on Resource and Assistive Features because it is an explicit release gate and does not overlap with the pending Settings reviewer pass.
- Verified existing component coverage for message export format choices, paginated round loading before export, HTML/PNG export invocation, token usage refresh, context-window display, loading/error titles, and Chinese localization of the token/context strip.
- Verified built `/app/` browser coverage for real HTML and PNG message-export downloads, including expected filenames, HTML transcript content, and PNG file signature.
- Verified built `/app/` browser image-preview coverage and inspected `.tmp/frontend-v2-resource/v2-image-preview-open.png`; the runtime media reference rendered nonblank, the Ant image preview was open, and the V2 shell stayed framed with sidebar/topbar/composer visible.
- Verified focused voice-input browser coverage for the configured speech path sending PCM audio and returning idle after silence, plus the unconfigured STT path where the voice button remains hidden and Space continues behaving as prompt input.
- Kept this as Resource and Assistive Feature evidence only. No full Resource subsystem completion is claimed because complete reviewer sign-off, broader export visual review, and final release-level audit remain open.

### Verification
- `npm test -- --run src/test/MessageExportMenu.test.tsx src/test/messageExport.test.ts src/test/SessionTokenUsage.test.tsx` passed with 3 files and 18 tests.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "message_export or timeline_image_preview"` passed with 2 selected tests.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_voice_input_audio.py -k "button_hides_without_stt_config or sends_pcm_bytes"` passed with 2 selected tests.

### Reviewer
- Main-agent component, browser, and screenshot inspection completed for this Resource/Assistive evidence slice. Full reviewer sign-off remains open.

## 2026-06-26 V2 Settings Model Profile Default/Delete Recovery Batch

### Scope
- Re-checked the active frontend rewrite goal, latest Settings evidence, live `/app/` layout metrics, and Hegel reviewer result before closing this slice, keeping the work aimed at the broader V2 readiness gaps instead of only the latest annotated screenshot.
- Hegel reviewer `019eff12-9b1b-7943-a5c8-0c0bea9d6c44` returned FAIL for Settings readiness: Model Profiles lacked V1-backed mutation controls, Plugins/Hooks were still mostly read-only, and Roles/Orchestration were missing important create/validation/default/destructive flows.
- Restored a first V1-backed Model Profiles mutation path in the existing V2 Settings Models page: profile rows and detail pages can now set a profile as default or delete a profile through real model-config API clients, with reload and query invalidation after mutation.
- Added typed frontend contracts and API client calls for `PUT /api/system/configs/model/profiles/{profile_id}`, `DELETE /api/system/configs/model/profiles/{profile_id}`, and `POST /api/system/configs/model:reload`.
- Preserved the V1-aligned Settings information architecture: no primary Settings items were added or removed, and System secondary pages remain behind the System launcher rather than being flattened into the root settings list.
- Re-opened the user's live in-app browser at `http://127.0.0.1:8000/app/`; Settings opened from the real sidebar, the root navigation still had exactly 13 V1-aligned items, and `body`/`documentElement` stayed fixed at `720/720`.
- Kept this as partial Model Profiles recovery only. Full Settings readiness remains open for add/save/test/catalog Model Profiles flows, Plugins/Hooks mutation parity, Roles/Orchestration parity, broader visual review, and reviewer sign-off.

### Verification
- `npm test -- --run src/test/SettingsDrawer.test.tsx -t "model profiles"` passed with 1 selected test.
- `npm test -- --run src/test/apiClient.test.ts -t "model profiles"` passed with 1 selected test.
- `npm run build` passed and refreshed `frontend/dist/app`.
- Live in-app browser DOM/metric verification completed against `/app/`: Settings opened from the sidebar, root Settings nav remained Appearance, General, Speech, Notifications, Models, Roles, Orchestration, Web, ClawHub, Proxy, Remote Workspace, Environment Variables, and System, and the page stayed fixed to the viewport.
- `npm test -- --run src/test/SettingsDrawer.test.tsx` passed with 17 tests.
- `npm test -- --run src/test/apiClient.test.ts` passed with 28 tests.

### Reviewer
- Hegel reviewer FAIL is recorded as active for the broader Settings subsystem. This batch addresses only part of the Model Profiles P1 and does not claim full Settings completion.

## 2026-06-26 V2 Settings Model Profile Edit/Test Recovery Batch

### Scope
- Re-checked the active frontend rewrite goal, the V1 Model Profiles module, backend model-config router, and Hegel Settings FAIL before choosing this slice; continued the Settings P1 recovery without adding or removing root Settings entries.
- Restored another V1-backed Model Profiles path inside the existing Models detail page: existing profiles can now be tested through the real model probe endpoint, edited in-place, renamed with `source_name`, saved through the real profile save endpoint, and reloaded afterward.
- Added typed frontend contracts and API client coverage for `POST /api/system/configs/model:probe`.
- Kept the V1 secondary-page logic intact: Model Profiles remains under the existing Settings > Models surface, and no System child pages were flattened into the root Settings list.
- Fixed a save/rename state edge case found by screenshot inspection: the detail page now keeps an optimistic selected profile after save so a transient or stale refetch cannot kick the user back to the profile list.
- Added built `/app/` browser evidence for Settings > Models > existing profile detail: the scenario tests the profile, edits/renames it, saves it through real mocked endpoints, waits for `model:reload`, verifies the detail remains open, confirms the shell remains fixed to the viewport, and captures `.tmp/frontend-v2-settings/v2-model-profile-detail.png`.
- Re-tested the live in-app browser at `http://127.0.0.1:8000/app/`; the shell remained fixed at `720/720`, but the running server continued to serve the previous JS/CSS hashes after normal and hard refresh, so the new feature verification was performed against the freshly built `/app/` harness instead of claiming live-8000 feature evidence.
- Kept this as partial Model Profiles recovery only. Add-new-profile, full catalog selection/discovery, CodeAgent/MaaS auth flows, Plugins/Hooks mutation parity, Roles/Orchestration parity, broader visual review, and Hegel reviewer sign-off remain open.

### Verification
- `npm test -- --run src/test/SettingsDrawer.test.tsx -t "model profile"` passed with 2 selected tests.
- `npm test -- --run src/test/apiClient.test.ts -t "model profiles"` passed with 1 selected test.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "model_profile_detail"` passed with 1 selected test.
- Main-agent screenshot inspection of `.tmp/frontend-v2-settings/v2-model-profile-detail.png` confirmed the real built V2 shell stayed framed and the Models detail form remained open after save.
- `npm test -- --run src/test/apiClient.test.ts` passed with 28 tests.
- `npm test -- --run src/test/SettingsDrawer.test.tsx` passed with 18 tests.

### Reviewer
- Hegel reviewer FAIL remains active for the broader Settings subsystem. This batch addresses only the existing-profile edit/test portion of the Model Profiles P1 and does not claim full Settings completion.

## 2026-06-26 V2 Settings Model Profile Create/Catalog Recovery Batch

### Scope
- Re-checked the active frontend rewrite goal, the V1 Model Profiles module, V1 catalog behavior tests, and the still-active Hegel Settings FAIL before choosing this slice; continued the Settings P1 recovery without changing the Settings root item set or flattening System secondary pages.
- Added typed V2 frontend contracts and API clients for `GET /api/system/configs/model/catalog` and `POST /api/system/configs/model/catalog:refresh`.
- Restored a V1-backed create path inside Settings > Models: the Models page now opens a secondary detail editor for a new profile, lazily loads the model catalog only after that create flow opens, lets the user pick a catalog provider/model, fills provider/model/base URL/context/output fields, saves through the real profile PUT endpoint, reloads model config, and keeps the saved profile detail open.
- Preserved existing-profile edit semantics: opening the profile list or editing an existing profile does not automatically fetch the catalog, and existing profile rename/edit still uses `source_name`.
- Added catalog metadata preservation for catalog-created saves (`catalog_provider_id`, `catalog_provider_name`, `catalog_model_name`, and capabilities) while clearing the transient catalog patch if the user manually edits endpoint/model/provider fields before saving.
- Added built `/app/` browser evidence for the new create/catalog flow, including screenshots at `.tmp/frontend-v2-settings/v2-model-profile-catalog-picker.png` and `.tmp/frontend-v2-settings/v2-model-profile-catalog-create.png`; screenshot inspection confirmed the catalog picker stays inside the Models secondary flow and the shell remains framed/fixed.
- Kept this as partial Model Profiles recovery only. CodeAgent SSO/password auth flows, MaaS credential flows, model discovery from custom endpoints, broader Plugins/Hooks mutation parity, Roles/Orchestration parity, visual matrix review, and Hegel reviewer sign-off remain open.

### Verification
- `npm test -- --run src/test/SettingsDrawer.test.tsx -t "model profile"` passed with 3 selected tests.
- `npm test -- --run src/test/apiClient.test.ts -t "model profiles"` passed with 1 selected test.
- `npm run typecheck` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "model_profile_create_from_catalog"` passed with 1 selected test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "model_profile_detail or model_profile_create_from_catalog"` passed with 2 selected tests.
- `npm test -- --run src/test/apiClient.test.ts` passed with 28 tests.
- `npm test -- --run src/test/SettingsDrawer.test.tsx` passed with 19 tests.
- `npm run lint` passed.

### Reviewer
- Main-agent component, API-client, built-app browser, and screenshot inspection completed for this create/catalog slice. Hegel reviewer FAIL remains active for the broader Settings subsystem, so no Settings completion is claimed.

## 2026-06-26 V2 Real SSE Refresh Recovery Checkpoint Evidence Batch

### Scope
- Re-checked the active frontend rewrite goal, product parity checklist, quality gates, latest ledger, and current stream/recovery coverage before choosing this slice, then targeted a remaining AG-UI Runtime Stream browser gap instead of continuing only Settings or visual polish.
- Added a built `/app/` real SSE browser scenario for page refresh while a run stream is still open: the initial SSE sends `run_started` and the first text delta, stays open to prevent a pre-refresh native reconnect false positive, and the browser reloads with persisted message and recovery checkpoint state.
- Verified the refreshed page opens a new real SSE request from `after_event_id=2`, with no synthetic `Last-Event-ID` header, receives the continued text delta and terminal event, keeps the pre-refresh text rendered exactly once, hides Stop, restores Send, and does not create a second run.
- Extended the real SSE harness with a controlled first-stream hold/release path plus request-count/request-snapshot wait helpers so future refresh tests can distinguish page-reload recovery from ordinary EventSource reconnects.
- Kept this as targeted refresh-recovery evidence only. Full AG-UI Runtime Stream completion, Message Timeline visual parity, Settings readiness, visual matrix review, Electron release readiness, and subsystem reviewer sign-off remain open.

### Verification
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "real_sse_refresh_recovery_reopens_stream_from_checkpoint"` passed with 1 selected test.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_stream_recovery.py -k "real_sse_refresh_recovery_reopens_stream_from_checkpoint or real_sse_interrupted_stream_reconnects_from_runtime_cursor or real_sse_replay_dedupes_cursor_event_before_continuing or real_sse_rich_replay_preserves_non_text_events_after_reconnect"` passed with 4 selected tests.

### Reviewer
- Main-agent built-app real SSE browser verification completed for this refresh-recovery checkpoint slice. No full AG-UI Runtime Stream, Run Recovery, Message Timeline, Settings, or release completion is claimed.

## 2026-06-26 V2 Settings Plugin Mutation Recovery Batch

### Scope
- Re-checked the active frontend rewrite goal, latest Hegel Settings FAIL, and current Settings ledger before choosing this slice, then returned to Settings parity instead of following only the latest annotated UI note.
- Restored the existing V1-aligned System -> Plugins secondary page as a mutation surface: configured plugins now load from `/api/system/configs/plugins`, can be enabled, disabled, updated, and deleted through the real plugin config endpoints, and refresh both config and runtime diagnostics after mutations.
- Added typed frontend contracts and API clients for `GET /api/system/configs/plugins`, `POST /api/system/configs/plugins/{name}:enable`, `POST /api/system/configs/plugins/{name}:disable`, `POST /api/system/configs/plugins/{name}:update`, and `DELETE /api/system/configs/plugins/{name}`.
- Preserved the V1 Settings information architecture: no primary Settings items were added or removed, and Plugins remains behind the System secondary launcher rather than being flattened into the root Settings list.
- Added built `/app/` browser evidence for Settings > System > Plugins: the scenario confirms Plugins is absent from the root Settings nav, opens Plugins from System, clicks Enable/Disable/Update/Delete, verifies backend request payloads and query params, and captures `.tmp/frontend-v2-settings/v2-plugin-actions.png`.
- Kept this as partial Settings recovery only. Hegel Settings FAIL remains open for Hooks mutation parity, Roles/Orchestration create/validation/default/destructive flows, CodeAgent/MaaS auth/discovery gaps, broader visual review, and reviewer sign-off.

### Verification
- `npm test -- --run src/test/SettingsDrawer.test.tsx -t "plugins"` passed with 1 selected test.
- `npm test -- --run src/test/apiClient.test.ts -t "plugins"` passed with 1 selected test.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "plugins_settings_actions"` passed with 1 selected test.
- Main-agent screenshot inspection of `.tmp/frontend-v2-settings/v2-plugin-actions.png` confirmed the real built V2 shell stayed framed, Settings root nav was unchanged, and Plugins remained in the System secondary page.
- `npm test -- --run src/test/apiClient.test.ts` passed with 29 tests.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "settings_keeps_v1_sections or plugins_settings_actions"` passed with 2 selected tests.
- `npm test -- --run src/test/SettingsDrawer.test.tsx` passed with 20 tests.
- `npm run lint` passed.

### Reviewer
- Main-agent component, API-client, built-app browser, and screenshot inspection completed for this plugin mutation slice. Hegel reviewer FAIL remains active for the broader Settings subsystem, so no Settings completion is claimed.

## 2026-06-26 V2 Settings Hooks Edit Validate Save Recovery Batch

### Scope
- Re-checked the remaining Hegel Settings FAIL after the plugin mutation recovery and selected Hooks because it shares the same Settings/System secondary-page parity gap and has real backend mutation endpoints.
- Restored a V1-backed Hooks mutation path inside the existing System -> Hooks secondary page: the page now renders the saved hooks config as a JSON editor, validates through `POST /api/system/configs/hooks:validate`, saves through `PUT /api/system/configs/hooks`, and refreshes config/runtime diagnostics afterward.
- Added typed frontend contracts and API clients for hook validation results and save/validate endpoints.
- Preserved the V1 Settings information architecture: no primary Settings items were added or removed, and Hooks remains behind the System secondary launcher rather than being flattened into the root Settings list.
- Added built `/app/` browser evidence for Settings > System > Hooks: the scenario confirms Hooks is absent from the root Settings nav, opens Hooks from System, validates the current JSON, saves an edited config payload, verifies backend request payloads, and captures `.tmp/frontend-v2-settings/v2-hooks-editor-save.png`.
- Kept this as partial Settings recovery only. Hegel Settings FAIL remains open for Roles/Orchestration create/validation/default/destructive flows, CodeAgent/MaaS auth/discovery gaps, broader visual review, and reviewer sign-off.

### Verification
- `npm test -- --run src/test/SettingsDrawer.test.tsx -t "hooks"` passed with 1 selected test.
- `npm test -- --run src/test/apiClient.test.ts -t "hooks"` passed with 1 selected test.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "hooks_settings_validate"` passed with 1 selected test.
- Main-agent screenshot inspection of `.tmp/frontend-v2-settings/v2-hooks-editor-save.png` confirmed the real built V2 shell stayed framed, Settings root nav was unchanged, and Hooks remained in the System secondary page.
- `npm test -- --run src/test/apiClient.test.ts` passed with 30 tests.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "settings_keeps_v1_sections or plugins_settings_actions or hooks_settings_validate"` passed with 3 selected tests.
- `npm run lint` passed.
- `npm test -- --run src/test/SettingsDrawer.test.tsx` passed with 21 tests.

### Reviewer
- Main-agent component, API-client, built-app browser, and screenshot inspection completed for this hooks mutation slice. Hegel reviewer FAIL remains active for the broader Settings subsystem, so no Settings completion is claimed.

## 2026-06-26 V2 Settings Role Config Mutation Recovery Batch

### Scope
- Re-checked the active frontend rewrite goal, latest Settings ledger, and remaining Hegel Settings FAIL after the Hooks recovery, then selected Roles because it still lacked real create/validate/delete mutation parity.
- Restored V1-backed Role configuration mutations inside the existing Settings > Roles secondary detail flow: roles can now be validated through `POST /api/roles:validate-config`, deleted through `DELETE /api/roles/configs/{role_id}`, and created through the same typed save path used for existing role updates.
- Updated the role save client to send only backend save-request fields instead of leaking read-only record metadata such as `file_name`, `source`, or rendered content back into the mutation payload.
- Preserved the V1 Settings information architecture: no primary Settings items were added or removed, Roles remains a root Settings surface, and System child pages remain behind the System secondary launcher.
- Added built `/app/` browser evidence for Settings > Roles: the scenario opens an editable role, validates it, deletes it, creates a new Analyst role, saves through real mocked endpoints, verifies the clean save payload, and captures `.tmp/frontend-v2-settings/v2-roles-create-save.png`.
- Kept this as partial Settings recovery only. Hegel Settings FAIL remains open for Orchestration default/create/delete flows, CodeAgent/MaaS auth/discovery gaps, broader visual review, and reviewer sign-off.

### Verification
- `npm test -- --run src/test/SettingsDrawer.test.tsx -t "role configs"` passed with 2 selected tests.
- `npm test -- --run src/test/SettingsDrawer.test.tsx -t "validates, deletes"` passed with 1 selected test.
- `npm test -- --run src/test/apiClient.test.ts -t "role configs"` passed with 1 selected test.
- `npm run typecheck` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "roles_settings_validate"` passed with 1 selected test.
- Main-agent screenshot inspection of `.tmp/frontend-v2-settings/v2-roles-create-save.png` confirmed the real built V2 shell stayed framed, Settings root nav was unchanged, and the created Role detail remained open after save.
- `npm test -- --run src/test/apiClient.test.ts` passed with 30 tests.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "settings_keeps_v1_sections or roles_settings_validate"` passed with 2 selected tests.
- `npm run lint` passed.
- `npm test -- --run src/test/SettingsDrawer.test.tsx` passed with 22 tests.

### Reviewer
- Main-agent component, API-client, built-app browser, and screenshot inspection completed for this role mutation slice. Hegel reviewer FAIL remains active for the broader Settings subsystem, so no Settings completion is claimed.

## 2026-06-26 V2 Settings Orchestration Mutation Recovery Batch

### Scope
- Re-checked the active frontend rewrite goal, product parity checklist, and Settings ledger after the Roles mutation recovery, then selected Orchestration because it was the remaining explicit Hegel Settings P1 item with a focused V1-backed mutation path.
- Restored the V1 Orchestration settings flow inside the existing Settings > Orchestration secondary detail page: presets can now be set as default, deleted with confirmation while preserving the last-preset guard, edited with preset ID/policy/roles/prompt/graph JSON fields, and created through the real `PUT /api/system/configs/orchestration` endpoint.
- Preserved backend semantics by treating default, delete, create, and edit as whole-config saves, matching V1 and the current backend contract rather than inventing new endpoints.
- Added typed graph support to the V2 frontend contract so editing a preset no longer drops existing DAG JSON, and kept non-edited policy fields while exposing V1's max-cycle and max-parallel controls.
- Preserved the V1 Settings information architecture: no primary Settings items were added or removed, Orchestration remains a root Settings surface, and System child pages remain behind the System secondary launcher.
- Added built `/app/` browser evidence for Settings > Orchestration: the scenario sets Shipping as default, deletes the previous Default preset, creates a new Analysis preset, verifies the three real save payloads, confirms the shell remains framed, and captures `.tmp/frontend-v2-settings/v2-orchestration-create-save.png`.
- Kept this as partial Settings recovery only. Hegel Settings FAIL still requires CodeAgent/MaaS auth and discovery parity, broader save/error/destructive-state review across Settings, visual review, and reviewer sign-off before Settings can be marked complete.

### Verification
- `npm run typecheck` passed.
- `npm test -- --run src/test/SettingsDrawer.test.tsx -t "orchestration"` passed with 1 selected test.
- `npm test -- --run src/test/SettingsDrawer.test.tsx -t "renders a real settings center"` passed with 1 selected test.
- `npm test -- --run src/test/SettingsDrawer.test.tsx -t "orchestration|renders a real settings center"` passed with 2 selected tests.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "orchestration_settings"` passed with 1 selected test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "settings_keeps_v1_sections or orchestration_settings"` passed with 2 selected tests.
- `npm run lint` passed.
- `npm test -- --run src/test/SettingsDrawer.test.tsx` passed with 23 tests.
- Main-agent screenshot inspection of `.tmp/frontend-v2-settings/v2-orchestration-create-save.png` confirmed the real built V2 shell stayed framed, Settings root nav was unchanged, Orchestration remained a secondary detail flow, and the created preset detail stayed open after save.
- Main-agent in-app browser inspection on `http://127.0.0.1:8000/app/` confirmed the refreshed V2 shell had no document-level scroll, the main sidebar retained the V1 nav set, the Settings root nav retained the V1 item set, and Settings stayed in a fixed-height drawer.

### Reviewer
- Main-agent component, built-app browser, and screenshot inspection completed for this orchestration mutation slice. Hegel reviewer FAIL remains active for the broader Settings subsystem, so no Settings completion is claimed.

## 2026-06-26 V2 Stream Replay Cursor Recovery Batch

### Scope
- Re-checked the frontend rewrite parity checklist after the Settings Orchestration recovery and selected the Message Timeline / AG-UI stream path because streaming, replay, refresh recovery, and interrupted-stream recovery remain core completion blockers.
- Fixed the stream client so `after_event_id` is not only sent in the EventSource URL but also seeds the local runtime state's `lastEventId` for each tracked run. This prevents a boundary replay event from rendering again after a page refresh, including multiplexed replay streams.
- Added a browser-level built `/app/` scenario that creates a run through the real composer path, opens the initial run EventSource, renders the first live text delta, reloads the page, resumes the active run from the recovery snapshot's `last_event_id`, verifies the second EventSource uses `after_event_id=1`, and proves a duplicate boundary event stays hidden while the next replay event renders.
- Kept this as partial stream/replay recovery only. Remaining stream completion work still includes broader live event coverage, interrupted transport retry review, tool-heavy visual replay inspection, subagent/background stream browser scenarios, and reviewer sign-off.

### Verification
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm test -- --run src/test/streamClient.test.ts` passed with 25 tests.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "stream_replay_resumes"` passed with 1 selected test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "stream_replay_resumes or settings_keeps_v1_sections or orchestration_settings"` passed with 3 selected tests.

### Reviewer
- Main-agent unit and browser verification completed for this stream cursor slice. No Message Timeline / AG-UI stream subsystem completion is claimed until the remaining live, replay, refresh, interrupted, subagent, and visual review gates are closed.

## 2026-06-26 V2 Interrupted Stream Browser Recovery Batch

### Scope
- Continued the Message Timeline / AG-UI stream quality gate after the replay cursor fix, focusing on the checklist requirement that interrupted streams reconnect from the latest event id.
- Added a browser-level built `/app/` scenario that creates a run through the real composer path, receives a live text delta, simulates an EventSource transport interruption, waits for the V2 run stream controller fallback reconnect, verifies the second EventSource URL uses `after_event_id=1`, and confirms subsequent stream output still renders in the timeline.
- Extended the browser EventSource harness only inside the integration test init script so normal built-app behavior remains unchanged.
- Kept this as partial stream/recovery evidence only. Remaining stream completion work still includes broader live event matrix coverage, subagent/background stream browser scenarios, terminal replay closure paths, visual review of tool-heavy interrupted streams, and reviewer sign-off.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "stream_replay_resumes or stream_transport_interrupt"` passed with 2 selected browser tests.

### Reviewer
- Main-agent browser verification completed for this interrupted stream slice. No Message Timeline / AG-UI stream subsystem completion is claimed.

## 2026-06-26 V2 Terminal Stream Browser Finalization Batch

### Scope
- Continued the Message Timeline / AG-UI stream quality gate after interrupted reconnect coverage, focusing on terminal stream events and composer recovery.
- Added a browser-level built `/app/` scenario that creates a run through the real composer path, receives a live text delta, dispatches a terminal `run.completed` event, verifies the EventSource is closed, verifies the Stop control disappears, confirms the prompt is usable for a follow-up message, and keeps the completed stream output visible in the timeline.
- Extended the browser EventSource harness only inside the integration test init script so normal built-app behavior remains unchanged.
- Kept this as partial stream/finalization evidence only. Remaining stream completion work still includes broader live event matrix coverage, subagent/background stream browser scenarios, tool-heavy interrupted stream visual review, terminal recovery across reload boundaries, and reviewer sign-off.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "stream_replay_resumes or stream_transport_interrupt or stream_terminal_event"` passed with 3 selected browser tests.

### Reviewer
- Main-agent browser verification completed for this terminal stream slice. No Message Timeline / AG-UI stream subsystem completion is claimed.

## 2026-06-26 V2 Tool Stream Browser Replay Batch

### Scope
- Re-checked the frontend rewrite checklist after terminal stream coverage and selected the tool-heavy Message Timeline / AG-UI stream path because V1 parity requires tool call, tool result, validation failure, replay, and interrupted-stream behavior to hold in the real browser UI.
- Added a browser-level built `/app/` scenario that creates a run through the real composer path, dispatches `tool_call.started` and `tool_result.completed` events, verifies the visible timeline renders compact tool cards instead of raw JSON, simulates an EventSource interruption, verifies the reconnect uses `after_event_id=2`, replays the duplicate boundary result, and confirms only one tool error card remains before a validation failure card renders.
- Captured `.tmp/frontend-v2-stream/v2-tool-reconnect.png` and inspected it to confirm the shell stayed fixed-height, the V1-aligned sidebar/topbar frame remained intact, and tool cards did not stretch the workspace.
- Kept this as partial stream/tool evidence only. Remaining stream completion work still includes approval/user-question browser flows, subagent/background stream browser scenarios, terminal recovery across reload boundaries, broader visual review of long tool-heavy runs, and reviewer sign-off.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "stream_replay_resumes or stream_transport_interrupt or stream_terminal_event or stream_tool_replay"` passed with 4 selected browser tests.
- Main-agent screenshot inspection of `.tmp/frontend-v2-stream/v2-tool-reconnect.png` confirmed the built V2 shell stayed framed while tool call, tool error, and tool validation cards rendered as compact rows.

### Reviewer
- Main-agent browser verification completed for this tool stream slice. No Message Timeline / AG-UI stream subsystem completion is claimed.

## 2026-06-26 V2 Recovery Approval Question Browser Action Batch

### Scope
- Re-checked the Run Recovery and Browser Checks gates after stream tool replay coverage and selected pending approval/user-question actions because component tests already covered local behavior but the built `/app/` browser path lacked proof that the visible controls call real AG-UI endpoints.
- Added a browser-level built `/app/` scenario that loads a recovery snapshot with one pending tool approval and one pending user question, submits ACP `Allow once` with optional feedback through `/api/ag-ui/runs/{run_id}/tool-approvals/{tool_call_id}:resolve`, then answers the question through `/api/ag-ui/runs/{run_id}/questions/{question_id}:answer` and verifies the exact request payloads.
- Extended only the browser mock backend with mutable pending approval/question queues and endpoint capture so the UI refetch removes resolved items the same way the real backend would.
- Captured `.tmp/frontend-v2-recovery/v2-recovery-actions.png` and inspected it to confirm the built V2 shell stayed fixed-height while approval buttons, feedback input, question choices, and composer remained reachable.
- Kept this as partial Run Recovery browser evidence only. Remaining recovery completion work still includes stopped-run resume browser flow, approval/question error states in the built shell, subagent/background stream browser scenarios, broader visual review, and reviewer sign-off.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "recovery_approval_and_question_actions"` passed with 1 selected browser test.
- Main-agent screenshot inspection of `.tmp/frontend-v2-recovery/v2-recovery-actions.png` confirmed the real built V2 shell stayed framed with pending recovery actions visible and operable.

### Reviewer
- Main-agent browser verification completed for this recovery action slice. No Run Recovery subsystem completion is claimed.

## 2026-06-26 V2 Background Subagent Stream Browser Batch

### Scope
- Re-checked the Subagents, Run Recovery, and AG-UI Runtime Stream checklist items after approval/question browser coverage, then selected background subagent stream discovery because it remained a high-risk cross-subsystem gap.
- Added a browser-level built `/app/` scenario that loads a recovery snapshot with an active parent run and a running background subagent task, verifies the visible background task panel, waits for the recovery controller to open the multiplex AG-UI EventSource with both `run-v2-live` and `subagent-run-1`, then dispatches parent and subagent stream deltas through that single stream.
- Verified the main timeline renders both the parent orchestration output and the reviewer subagent output, and added a document-height assertion so the recovered subagent stream cannot reintroduce whole-page scrolling.
- Captured `.tmp/frontend-v2-recovery/v2-background-subagent-stream.png` and inspected it to confirm the V2 shell stayed fixed-height with the sidebar, recovery panel, timeline, token bar, and composer all still reachable.
- Kept this as partial subagent/background stream evidence only. Remaining work still includes selecting persisted subagent sessions in the sidebar, subagent terminal/refresh cleanup across session switches, background stop error states in the built shell, and reviewer sign-off.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "background_subagent_stream or recovery_approval_and_question_actions or stream_replay_resumes or stream_transport_interrupt"` passed with 4 selected browser tests.
- Main-agent screenshot inspection of `.tmp/frontend-v2-recovery/v2-background-subagent-stream.png` confirmed the built V2 shell stayed framed while parent and reviewer subagent stream output rendered in the timeline.

### Reviewer
- Main-agent browser verification completed for this background subagent stream slice. No Subagents, Run Recovery, or AG-UI Runtime Stream subsystem completion is claimed.

## 2026-06-26 V2 Persisted Subagent Session Stream Browser Batch

### Scope
- Re-checked the Subagents, AG-UI Runtime Stream, and V1 secondary-page behavior gaps after the background subagent stream slice, then selected persisted subagent session entry because it remained uncovered at the built `/app/` browser layer.
- Added a browser-level scenario that preserves the V1-style sidebar hierarchy: the parent session exposes only a subagent count, the subagent list loads after expanding the parent, and selecting the subagent opens the read-only secondary session page instead of flattening content into the primary chat view.
- Verified the secondary page loads persisted agent messages from `/sessions/{session_id}/agents/{instance_id}/messages`, starts the subagent EventSource from `last_event_id=4`, renders a live reviewer delta, survives a simulated EventSource transport interruption, reconnects with `after_event_id=5`, deduplicates the boundary event, and renders the resumed delta.
- Added fixed-frame assertions for the persisted subagent page so the body and document stay at the viewport height while the workspace and subagent body keep internal overflow hidden.
- Captured `.tmp/frontend-v2-subagents/v2-persisted-subagent-stream.png` and inspected it to confirm the sidebar, topbar, secondary subagent header, status badge, persisted output, and resumed stream output stayed inside the fixed V2 shell.
- Kept this as targeted Subagents and AG-UI stream progress only. Remaining work still includes full message-timeline visual polish, terminal subagent refresh across route changes, background stop/error browser states, broader V1/V2 visual comparison, and reviewer sign-off.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k persisted_subagent_session_stream_resumes_from_sidebar` passed with 1 selected browser test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "background_subagent_stream or persisted_subagent_session_stream"` passed with 2 selected browser tests.
- Main-agent screenshot inspection of `.tmp/frontend-v2-subagents/v2-persisted-subagent-stream.png` confirmed the built V2 shell stayed framed while the persisted reviewer message and resumed live subagent stream rendered in the secondary session view.

### Reviewer
- Main-agent browser verification completed for this persisted subagent session stream slice. No Subagents, Message Timeline, AG-UI Runtime Stream, or V2 frontend completion is claimed.

## 2026-06-26 V2 Recovery Background Task Stop Browser Batch

### Scope
- Re-checked the Run Recovery quality gate after the persisted subagent stream slice and selected background task stop because it remained a visible recovery control that needed built `/app/` proof rather than component-only evidence.
- Added a browser-level scenario that loads a recovery snapshot with a running background command task and no active foreground run, verifies the fixed shell shows the background task panel and Stop action, then clicks Stop through the visible UI.
- Extended the browser mock backend with the real `/runs/{run_id}/background-tasks/{background_task_id}:stop` route, request capture, and state mutation so the subsequent recovery refetch sees the task as stopped.
- Verified the UI removes the recovery panel after the stop mutation and refetch, proving the button is not a fake control and the active background task filter reconciles terminal state.
- Captured `.tmp/frontend-v2-recovery/v2-background-task-stop-before.png` and `.tmp/frontend-v2-recovery/v2-background-task-stop-after.png` and inspected them to confirm the Stop control and post-stop fixed shell state.
- Kept this as targeted Run Recovery progress only. Remaining work still includes stopped-run resume browser flow, recovery action error states in the built shell, broader visual review of recovery styling, and reviewer sign-off.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k recovery_background_task_stop_refreshes_snapshot` passed with 1 selected browser test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "recovery_background_task_stop or background_subagent_stream or recovery_approval_and_question_actions"` passed with 3 selected browser tests.
- Main-agent screenshot inspection confirmed the background task Stop control appeared inside the built V2 recovery panel and disappeared after the real stop endpoint refreshed recovery state.

### Reviewer
- Main-agent browser verification completed for this background task stop slice. No Run Recovery, Subagents, AG-UI Runtime Stream, or V2 frontend completion is claimed.

## 2026-06-26 V2 Recovery Resume Browser Batch

### Scope
- Re-checked the Run Recovery and AG-UI Runtime Stream gates after the background task stop slice and selected recoverable stopped-run resume because it remained component-tested but lacked built `/app/` browser evidence.
- Added a browser-level scenario that loads a stopped recoverable run with `should_show_recover=true` and `last_event_id=42`, verifies the visible recovery Resume action, and confirms no EventSource is opened before the user clicks Resume.
- Extended the browser mock backend with the real `/ag-ui/runs/{run_id}:resume` route, request capture, and recovery snapshot transition from stopped to running.
- Verified clicking Resume calls the real endpoint, starts the run EventSource from `after_event_id=42`, removes the standalone Resume action, renders resumed live output in the timeline, and keeps the document fixed to the viewport.
- Captured `.tmp/frontend-v2-recovery/v2-recovery-resume-before.png` and `.tmp/frontend-v2-recovery/v2-recovery-resume-after.png` and inspected them to confirm the stopped, resumed, and running UI states in the real V2 shell.
- Kept this as targeted Run Recovery / AG-UI stream progress only. Remaining work still includes recovery action error states in the built shell, broader recovery visual review, terminal subagent refresh cleanup, and reviewer sign-off.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k recovery_resume_stopped_run_reconnects_from_checkpoint` passed with 1 selected browser test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "recovery_resume_stopped_run or recovery_background_task_stop or recovery_approval_and_question_actions or stream_replay_resumes"` passed with 4 selected browser tests.
- Main-agent screenshot inspection confirmed Resume is visible only for the stopped recoverable run, the resumed run opens a live stream from the stored checkpoint, and the shell remains fixed-height after resumed output arrives.

### Reviewer
- Main-agent browser verification completed for this stopped-run resume slice. No Run Recovery, AG-UI Runtime Stream, Message Timeline, or V2 frontend completion is claimed.

## 2026-06-26 V2 Recovery Action Error Browser Batch

### Scope
- Re-checked the Run Recovery gate after the stopped-run resume slice and selected approval/question error states because component tests existed but the built `/app/` browser shell still lacked visible failure-and-retry evidence.
- Added a browser-level scenario that loads one pending tool approval and one pending user question, forces the first approval resolution to return HTTP 500, and verifies the inline tool approval error stays visible while the approval remains retryable.
- Extended the browser mock backend with one-shot failure toggles for `/ag-ui/runs/{run_id}/tool-approvals/{tool_call_id}:resolve` and `/ag-ui/runs/{run_id}/questions/{question_id}:answer` so failures preserve pending recovery state instead of removing items.
- Verified retrying the approval succeeds and clears the inline error, then forced the question answer endpoint to fail, verified the inline question error remains visible with the question still present, and retried successfully.
- Captured `.tmp/frontend-v2-recovery/v2-recovery-action-errors.png` and inspected it to confirm the approval error appears inside the real V2 recovery panel rather than only in a toast or console.
- Kept this as targeted Run Recovery error-state progress only. Remaining work still includes broader recovery visual review, terminal subagent refresh cleanup, reviewer sign-off, and release-level parity audit.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k recovery_action_errors_remain_visible_and_retryable` passed with 1 selected browser test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "recovery_action_errors or recovery_approval_and_question_actions or recovery_resume_stopped_run or recovery_background_task_stop"` passed with 4 selected browser tests.
- Main-agent screenshot inspection confirmed the built V2 recovery panel preserves pending approval/question controls while showing inline API failure feedback and allowing retry.

### Reviewer
- Main-agent browser verification completed for this recovery action error-state slice. No Run Recovery, AG-UI Runtime Stream, Message Timeline, or V2 frontend completion is claimed.

## 2026-06-26 V2 Persisted Subagent Terminal Refresh Batch

### Scope
- Re-checked the Subagents, AG-UI Runtime Stream, and fixed-shell quality gates after the recovery error-state slice, then selected persisted subagent terminal refresh because it still lacked built `/app/` browser evidence and directly affects replay/terminal edge cases.
- Added a browser-level scenario that opens a V1-style secondary subagent page from the sidebar, streams a reviewer delta, receives a terminal `run_completed` event, closes the EventSource, refetches persisted agent messages, and verifies the stream is not restarted.
- Found and fixed a real stale-state bug from screenshot inspection: the sidebar subagent row refreshed to `completed` while the open subagent detail header still showed `running`.
- Updated `SubagentSessionView` to derive its visible subagent status from the runtime terminal event for the viewed run, so the open secondary page reconciles terminal status even though the selected subagent props were captured when the page opened.
- Rebuilt `frontend/dist/app` so the browser suite and served V2 app exercise the current source bundle rather than the previous Vite artifact.
- Captured `.tmp/frontend-v2-subagents/v2-persisted-subagent-terminal.png` and inspected it to confirm the sidebar child session and subagent detail badge both show `completed`, the final persisted reviewer answer renders in the secondary page, and the shell remains fixed to the viewport.
- Checked the live in-app browser at `http://127.0.0.1:8000/app/` after reload: the outer document/body height matched the 1280x720 viewport, `pageHasOuterVerticalScroll` was false, and the sidebar navigation still matched the V1 module set without added or removed items.
- Kept this as targeted Subagents / AG-UI terminal refresh progress only. Remaining work still includes message-timeline visual parity, broader streaming replay/resume boundary coverage, recovery visual review, settings appearance parity, and reviewer sign-off.

### Verification
- `npm test -- --run src/test/SubagentSessionView.test.tsx` passed with 4 selected component tests.
- `npm run typecheck` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "persisted_subagent_terminal_refreshes_history_without_restart or persisted_subagent_session_stream_resumes_from_sidebar"` passed with 2 selected browser tests.
- Main-agent screenshot inspection confirmed the terminal subagent browser page now reconciles the sidebar and detail statuses to `completed` without reopening the stream.

### Reviewer
- Main-agent browser and live in-app layout verification completed for this persisted subagent terminal refresh slice. No Subagents, AG-UI Runtime Stream, Message Timeline, or V2 frontend completion is claimed.

## 2026-06-26 V2 SSE Last-Event-ID Stream Reconnect Batch

### Scope
- Re-checked the Message Timeline and AG-UI Runtime Stream checklist after the persisted subagent terminal refresh slice, then selected the SSE `Last-Event-ID` boundary because unit tests covered it but the built `/app/` browser path did not.
- Added a browser-level scenario that creates a run through the real composer path, dispatches an AG-UI `message.text.delta` event without a payload `event_id`, relies on the SSE `lastEventId` value `11` to advance the runtime cursor, simulates a transport interruption, and verifies the reconnect EventSource opens with `after_event_id=11`.
- Verified replaying the boundary event without a payload event id does not duplicate the visible message, while a fresh `lastEventId=12` chunk still renders into the same live assistant stream.
- Captured `.tmp/frontend-v2-stream/v2-last-event-id-reconnect.png` and inspected it to confirm the built V2 shell stays fixed-height, the running stream controls remain reachable, and the message text remains readable after reconnect.
- Kept this as targeted AG-UI stream/replay progress only. Remaining work still includes run failed/stopped browser finalization, broader event matrix coverage, long tool-heavy visual replay review, recovery visual review, and reviewer sign-off.

### Verification
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_shell_layout.py` passed.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "stream_reconnect_uses_sse_last_event_id"` passed with 1 selected browser test.
- `uv run --extra dev pytest -q tests/integration_tests/browser/test_v2_shell_layout.py -k "stream_replay_resumes or stream_transport_interrupt or stream_reconnect_uses_sse_last_event_id or stream_terminal_event or stream_tool_replay"` passed with 5 selected browser tests.
- Main-agent screenshot inspection confirmed the missing-payload-id stream uses SSE `Last-Event-ID` for reconnect, suppresses the duplicate boundary replay, and keeps the fixed V2 chat frame intact.

### Reviewer
- Main-agent browser and screenshot verification completed for this SSE `Last-Event-ID` stream boundary slice. No Message Timeline, AG-UI Runtime Stream, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Terminal Stream Coverage Batch

### Scope
- Re-checked the updated goal after the SSE `Last-Event-ID` slice and stopped adding new `.py` UI browser coverage for the failed/stopped terminal stream path.
- Added TS Vitest coverage for `run_failed` and `run_stopped` terminal events in the stream client, verifying each event closes the EventSource, clears active run ids, preserves the last event id, and records the correct terminal event type.
- Added TS MessageTimeline coverage for failed and stopped run lifecycle diagnostics, verifying the user-visible terminal rows include status, diagnostic message/reason, and root task context without leaving a live indicator behind.
- Kept this as a targeted TS migration step only. Remaining work still includes migrating the broader Python browser UI suite to a TS browser runner, preserving screenshot evidence for V1/V2 visual comparison, and completing reviewer sign-off.

### Verification
- `npm test -- --run src/test/streamClient.test.ts src/test/MessageTimeline.test.tsx` passed with 84 selected TS tests.
- `npm run typecheck` passed.

### Reviewer
- Main-agent TS verification completed for this terminal stream slice. No Message Timeline, AG-UI Runtime Stream, test-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Route Switch Harness Batch

### Scope
- Re-checked the updated goal and continued the UI-test migration away from `.py` browser coverage toward TS-owned browser tests.
- Added `@playwright/test`, a `test:browser` script, and a named `chromium` Playwright project that can reuse an installed Chromium through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` or the local Windows Playwright cache.
- Added the first TS browser harness scenario for V1 -> `/app/` V2 -> V1 route switching, serving `frontend/dist` and `frontend/dist/app` from a local Node test server with precise `/api/` mocks.
- Fixed the harness after screenshot inspection caught an overbroad `**/api/**` mock intercepting V1 static modules such as `/js/core/api/request.js`, which had produced misleading green tests with loading screenshots.
- Added bootstrap-ready, fixed-height, backend-online, and unhandled-API assertions so screenshots are taken only after V1/V2 shells are actually stable and free of API error toasts.
- Captured and inspected `.tmp/frontend-v2-ts-route-switch/ts-v1-root-before-switch.png`, `.tmp/frontend-v2-ts-route-switch/ts-v2-after-new-ui-switch.png`, and `.tmp/frontend-v2-ts-route-switch/ts-v1-after-return.png`. The final screenshots show clean V1/V2 frames with no startup loader, no error toasts, no outer document scroll, and intact V1/V2 switch controls.
- Kept this as TS browser harness migration progress only. Remaining work still includes migrating the broader Python browser suite, extracting reusable API fixtures, message stream/replay browser boundaries, appearance/settings parity, and full V1/V2 visual audit.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-route-switch.spec.ts` passed with 1 TS browser test.
- Main-agent screenshot inspection confirmed the route-switch screenshots represent stable UI states rather than loading or error states.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this route-switch harness slice. No V2 frontend completion, Message Timeline completion, or browser-suite migration completion is claimed.

## 2026-06-26 V2 TS Browser Stream Composer Batch

### Scope
- Re-checked the updated frontend rewrite goal after the TS route-switch harness slice and continued the TS-owned browser migration instead of adding new Python UI browser coverage.
- Extracted the TS browser static server, API mock, fixed-shell assertions, screenshot helpers, and mock EventSource control into `browser-tests/support/frontend-app.ts` so route-switch and stream/replay tests can share one precise fixture.
- Added a TS Playwright browser scenario that uses the real V2 composer to create a run, verifies the `POST /ag-ui/runs` payload, opens the run EventSource from `after_event_id=0`, dispatches AG-UI started/text/completed events, and confirms live output plus terminal state render in the fixed shell.
- Re-ran screenshot inspection and fixed a real visible composer regression: desktop controls were technically inside the frame but the session-mode segmented control visually overlapped the following selects. Updated the composer controls layout and added CSS and browser assertions to guard against future control overlap.
- Rebuilt `frontend/dist/app` so the served V2 app and TS browser screenshots use the current source bundle.
- Captured and inspected `.tmp/frontend-v2-ts-route-switch/ts-v2-after-new-ui-switch.png`, `.tmp/frontend-v2-ts-stream/v2-stream-create-run.png`, and the V1 return screenshots. The final V2 screenshots show no outer document scroll and no composer control overlap.
- Kept this as TS browser harness and AG-UI stream-create progress only. Remaining work still includes stream replay refresh/interruption edge matrix migration, long tool-heavy visual replay review, settings appearance parity, broader V1/V2 visual audit, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test -- ShellLayoutCss.test.ts` passed with 7 selected CSS layout tests.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm run test:browser -- --project=chromium browser-tests/v2-route-switch.spec.ts browser-tests/v2-stream-create-run.spec.ts` passed with 2 TS browser tests.
- Main-agent screenshot inspection confirmed the built V2 shell stayed fixed-height during route switching and stream completion, and the composer controls no longer visually overlap.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this composer stream slice. No V2 frontend completion, Message Timeline completion, AG-UI Runtime Stream completion, or browser-suite migration completion is claimed.

## 2026-06-26 V2 TS Browser Stream Reconnect Exhaustion Batch

### Scope
- Re-checked the frontend rewrite goal, quality gates, and product parity checklist after the TS browser composer slice, then selected a remaining high-risk stream recovery path from the old Python UI browser suite for TS migration.
- Extended the shared TS browser EventSource fixture with transport-error dispatch, open-source counting, and latest-open-source targeting so TS Playwright can exercise real stream interruption behavior without adding new `.py` UI tests.
- Added a TS Playwright browser scenario that creates a run through the real V2 composer, renders the first live text chunk, dispatches repeated transport errors, verifies manual reconnects reopen the stream from `after_event_id=2`, and confirms the fourth transport error exhausts the reconnect budget.
- Verified the exhausted state restores the composer: Stop is hidden, the prompt is enabled, Send is visible, the previously streamed text remains rendered once, the EventSource URL history stays capped at four attempts, and the shell remains fixed-height.
- Captured and inspected `.tmp/frontend-v2-ts-stream/v2-stream-reconnect-exhausted.png`; the screenshot shows the V2 frame, sidebar, token row, recovered composer controls, and surviving stream text in a single fixed viewport.
- Kept this as targeted TS browser migration and AG-UI stream recovery progress only. Remaining work still includes TS migration for replay after refresh, non-text event replay after reconnect, tool-heavy long-run visual review, settings appearance parity, broader V1/V2 audit, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-stream-reconnect.spec.ts` passed with 1 TS browser test.
- `npm run test:browser -- --project=chromium browser-tests/v2-route-switch.spec.ts browser-tests/v2-stream-create-run.spec.ts browser-tests/v2-stream-reconnect.spec.ts` passed with 3 TS browser tests.
- Main-agent screenshot inspection confirmed the final reconnect-exhausted state restores the composer and keeps the built V2 shell fixed-height without duplicate stream text.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this stream reconnect exhaustion slice. No V2 frontend completion, Message Timeline completion, AG-UI Runtime Stream completion, or browser-suite migration completion is claimed.

## 2026-06-26 V2 TS Browser Non-Text Reconnect Batch

### Scope
- Re-checked the frontend rewrite goal and old Python stream-recovery coverage after the reconnect exhaustion slice, then selected the non-text replay-after-reconnect path for continued TS browser migration.
- Added a TS Playwright scenario that creates a run through the real V2 composer, streams text plus thinking events, interrupts the EventSource, verifies reconnect resumes from `after_event_id=4`, and then delivers additional thinking, tool call, tool result, and token usage events through the reconnected stream.
- Verified the message timeline preserves the original text exactly once, combines pre- and post-reconnect thinking deltas, renders compact `Tool call: read` / `Tool result: read` rows with previews instead of raw JSON, and shows the runtime token-usage diagnostic row.
- Captured and inspected `.tmp/frontend-v2-ts-stream/v2-stream-non-text-reconnect.png`; the screenshot shows the V2 shell remains fixed-height while thinking, tool, and token usage rows stay readable and the active-run controls remain reachable.
- Kept this as targeted Message Timeline / AG-UI stream recovery progress only. Remaining work still includes TS migration for refresh replay, broader event matrix coverage, long tool-heavy visual review, settings appearance parity, broader V1/V2 audit, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-stream-reconnect.spec.ts` passed with 2 TS browser tests.
- Main-agent screenshot inspection confirmed non-text events survive reconnect without duplicating the base text or breaking the fixed V2 shell frame.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this non-text reconnect slice. No V2 frontend completion, Message Timeline completion, AG-UI Runtime Stream completion, or browser-suite migration completion is claimed.

## 2026-06-26 V2 TS Browser Refresh Replay Batch

### Scope
- Re-checked the frontend rewrite goal after the non-text reconnect slice and selected refresh replay because it is a required stream/replay/recovery parity path and was still represented by old Python browser coverage rather than TS-owned browser evidence.
- Added a TS Playwright browser scenario that creates a run through the real V2 composer, streams an initial assistant text delta, records the backend recovery checkpoint at `last_event_id=2`, reloads `/app/`, and verifies RecoveryBar opens the resumed EventSource from `after_event_id=2`.
- Mocked persisted session messages after reload so the hydrated assistant output appears exactly once, then delivered a new post-reload delta through the resumed stream and verified the visible message is not duplicated.
- Completed the stream with a terminal `run.completed` event, updated the persisted message payload to include both chunks, and verified the Stop control disappears, the stream closes, and the fixed-height shell/composer layout stays intact.
- Captured and inspected `.tmp/frontend-v2-ts-stream/v2-stream-refresh-replay.png`; the screenshot shows the built V2 shell fixed to one viewport, the sidebar/workspace frame stable, and the refreshed output rendered as one assistant message.
- Kept this as targeted Message Timeline / AG-UI refresh recovery progress only. Remaining work still includes broader replay event matrix coverage, long tool-heavy visual replay review, settings appearance parity, broader V1/V2 audit, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-stream-refresh.spec.ts` passed with 1 TS browser test.
- `npm run test:browser -- --project=chromium browser-tests/v2-stream-create-run.spec.ts browser-tests/v2-stream-reconnect.spec.ts browser-tests/v2-stream-refresh.spec.ts` passed with 4 TS browser tests.
- Main-agent screenshot inspection confirmed refresh recovery resumes from the stored checkpoint without duplicate hydrated text and keeps the V2 shell fixed-height.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this refresh replay slice. No V2 frontend completion, Message Timeline completion, AG-UI Runtime Stream completion, or browser-suite migration completion is claimed.

## 2026-06-26 V2 TS Browser Sidebar And Settings Parity Batch

### Scope
- Re-checked the frontend rewrite goal, product parity checklist, and quality gates after the refresh replay slice, then selected sidebar/settings parity because it protects the V1 entry set and secondary-page behavior the rewrite must preserve.
- Added a TS Playwright browser scenario that verifies the primary sidebar labels remain exactly `Chat`, `Automation`, `Skills`, `Board`, `Search`, `Connectors`, `Memory`, `Observability`, and `Settings`, then opens each entry and confirms the target surface renders real mocked data instead of a dead placeholder.
- Added a TS Playwright browser scenario that verifies the Settings top-level section list remains exactly aligned with V1, and that `MCP`, `Plugins`, `Commands`, `Hooks`, `Agent Runtime`, `GitHub`, and `Triggers` stay grouped under the `System` secondary page rather than being flattened into the root settings navigation.
- Added targeted TS browser API fixtures for the module and system-settings surfaces needed by this parity path, including automation detail/sessions, skills market, board, connectors/runtime tools, memory detail, observability, MCP tools, plugins, hooks, agent runtime, GitHub, and Feishu/WeChat triggers.
- Added an animation-aware settings-dialog settling assertion before screenshot capture after noticing the first screenshot could catch the settings panel during its slide-in transition.
- Captured and inspected `.tmp/frontend-v2-ts-shell/v2-sidebar-module-parity.png` and `.tmp/frontend-v2-ts-shell/v2-settings-system-parity.png`; the final screenshots show the fixed V2 shell, unchanged primary sidebar entries, Settings opened with the expected V1 top-level sections, and System secondary pages reachable through Back navigation.
- Kept this as targeted Application Shell / Settings TS browser migration progress only. Remaining work still includes broader V1/V2 visual audit, additional module action parity, remaining `.py` UI browser migration, long tool-heavy message review, desktop checks, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-shell-parity.spec.ts` passed with 2 TS browser tests.
- `npm run test:browser -- --project=chromium browser-tests/v2-route-switch.spec.ts browser-tests/v2-shell-parity.spec.ts` passed with 3 TS browser tests.
- Main-agent screenshot inspection confirmed the settings panel is captured after its transition, secondary settings pages remain nested under System, and the sidebar module set is not added to or removed from.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this sidebar/settings parity slice. No Application Shell, Settings, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Message Export Batch

### Scope
- Re-checked the frontend rewrite goal and release browser gates after the sidebar/settings parity slice, then selected message export because `export a message` remains an explicit browser-check workflow and still had old Python UI coverage.
- Added a TS Playwright browser scenario that opens the real V2 top-bar `Export messages` menu, downloads both `HTML` and `PNG`, and verifies the suggested filenames are `session-v2-shell-messages.html` and `session-v2-shell-messages.png`.
- Mocked a real session rounds page for export with a prompt, coordinator output, pending approval/question counts, retry metadata, a diagnostic, and todo state so the exported transcript exercises the round-based export path rather than an empty placeholder.
- Verified the downloaded HTML contains the transcript title, `Round 1 prompt`, `V2 export prompt`, and `Exported V2 transcript content`; verified the downloaded PNG starts with the PNG file signature and is produced through the browser download flow.
- Stabilized the request-count assertion around the initial timeline rounds load, then verified the two export actions add exactly two more `/sessions/{session_id}/rounds` requests.
- Kept this as targeted Message Timeline / export-control TS browser migration progress only. Remaining work still includes round rail, image preview, observability drilldown, project view, mobile/narrow layout, additional module action parity, desktop checks, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-message-export.spec.ts` passed with 1 TS browser test.
- `npm run test:browser -- --project=chromium browser-tests/v2-route-switch.spec.ts browser-tests/v2-message-export.spec.ts` passed with 2 TS browser tests.
- Main-agent artifact inspection confirmed Playwright produced non-empty HTML and PNG downloads before test output cleanup.

### Reviewer
- Main-agent TS browser and artifact verification completed for this message export slice. No Message Timeline, export-control subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Observability Spec Lineage Batch

### Scope
- Re-checked the frontend rewrite goal after the message export slice, then selected the Observability top-bar flow because it protects a V1 secondary surface that should not be flattened into the primary shell.
- Added a TS Playwright browser scenario that opens Observability from the real top bar, verifies global metrics, switches to the session scope, and confirms the session breakdown renders mocked backend data.
- Extended the scenario through Spec Lineage by mocking the session rounds, task run projection, spec artifact versions, artifact diff, and checkpoint evaluation endpoints. The test verifies the selected task, the diff field, the added requirement, and the evaluation summary.
- Added fixed-shell and unhandled-route assertions so this path also guards against the outer-document scroll regression and accidental missing API mocks.
- Captured and inspected `.tmp/frontend-v2-ts-observability/v2-observability-session.png` and `.tmp/frontend-v2-ts-observability/v2-observability-spec-lineage.png`; the final screenshots show the sidebar/workspace frame fixed, the unchanged primary navigation entries, the Observability secondary content in the main surface, and the Spec Lineage diff visible without tooltip pollution.
- Kept this as targeted Application Shell / Observability / Spec Lineage TS browser migration progress only. Remaining work still includes long tool-heavy message replay review, more stream event matrix boundaries, project view and module action parity, desktop checks, broader V1/V2 visual audit, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-observability.spec.ts` passed with 1 TS browser test.
- `npm run test:browser -- --project=chromium browser-tests/v2-route-switch.spec.ts browser-tests/v2-observability.spec.ts` passed with 2 TS browser tests.
- Main-agent screenshot inspection confirmed the Observability surface and Spec Lineage section render as stable V2 UI states inside the fixed shell.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this Observability / Spec Lineage slice. No Application Shell, Observability, Spec Lineage, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Recovery Actions Batch

### Scope
- Re-checked the frontend rewrite goal and remaining old Python browser coverage after the Observability / Spec Lineage slice, then selected recovery approvals and pending user questions because they protect real paused-run action semantics rather than static page parity.
- Added a TS Playwright browser scenario that renders a paused active run with one pending tool approval and one pending user question, fills approval feedback, resolves the ACP `Allow once` option, selects a user-question answer, and verifies the exact AG-UI endpoint payloads.
- Added a second TS Playwright browser scenario that forces the first tool approval and first user-question answer to fail, verifies the inline error remains visible in the Recovery panel, retries both actions successfully, and confirms the stale errors and pending rows disappear after recovery snapshot refresh.
- Captured and inspected `.tmp/frontend-v2-ts-recovery/v2-recovery-actions.png` and `.tmp/frontend-v2-ts-recovery/v2-recovery-action-errors.png`; the final screenshots show the Recovery panel, real action buttons, disabled answer state before selection, inline error text, composer, and sidebar/workspace frame staying inside the fixed shell.
- Kept this as targeted Run Recovery TS browser migration progress only. Remaining work still includes recoverable stopped-run resume, background task stop, background subagent streaming, persisted subagent recovery, wider stream event matrix, long tool-heavy replay review, desktop checks, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-recovery.spec.ts` passed with 2 TS browser tests.
- `npm run test:browser -- --project=chromium browser-tests/v2-route-switch.spec.ts browser-tests/v2-recovery.spec.ts` passed with 3 TS browser tests.
- Main-agent screenshot inspection confirmed both the normal recovery-action state and retryable error state render as stable V2 UI states inside the fixed shell.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this recovery action slice. No Run Recovery, AG-UI Runtime Stream, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Recovery Resume Batch

### Scope
- Re-checked the remaining old Python Run Recovery browser coverage after the recovery action slice, then selected stopped-run resume because it protects the checkpoint continuation path for interrupted runs.
- Extended the TS recovery browser scenario to render a recoverable stopped run with `last_event_id=42`, verify no EventSource opens before the user acts, click the real `Resume` button, and assert the `POST /ag-ui/runs/{run_id}:resume` request is captured.
- Verified the resumed stream opens through the browser EventSource harness at `/api/ag-ui/runs/run-v2-live/events?after_event_id=42`, hides the Resume action, renders a post-resume text delta, and then receives a terminal event so the test covers stream cleanup instead of leaving teardown to close an active run.
- Captured and inspected `.tmp/frontend-v2-ts-recovery/v2-recovery-resume-before.png` and `.tmp/frontend-v2-ts-recovery/v2-recovery-resume-after.png`; the screenshots show the stopped recovery banner before resume and the running recovered output after resume, both inside the fixed V2 shell with sidebar/workspace and composer still stable.
- Kept this as targeted Run Recovery / AG-UI continuation migration progress only. Remaining work still includes background task stop, background subagent streaming, persisted subagent recovery, round rail/todo history, wider stream event matrix, long tool-heavy replay review, desktop checks, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-recovery.spec.ts` passed with 3 TS browser tests.
- `npm run test:browser -- --project=chromium browser-tests/v2-route-switch.spec.ts browser-tests/v2-recovery.spec.ts` passed with 4 TS browser tests.
- Main-agent screenshot inspection confirmed the stopped-run recovery before/after states render as stable V2 UI states and resume from the checkpoint without opening a stream early.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this recovery resume slice. No Run Recovery, AG-UI Runtime Stream, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Background Subagent Recovery Batch

### Scope
- Re-checked the remaining old Python Run Recovery browser coverage after the stopped-run resume slice, then selected background subagent streaming because it exercises multiplexed parent/subagent recovery rather than a single active run.
- Extended the TS recovery browser scenario to render a running parent run with a background subagent task, verify the recovered EventSource opens exactly once through `/api/ag-ui/runs/events`, and assert the multiplexed query carries `run_id=run-v2-live&after_event_id=5` plus `run_id=subagent-run-1&after_event_id=0`.
- Dispatched text deltas for both the parent orchestration run and the reviewer subagent run through the same EventSource, verified both outputs render in the timeline, then dispatched terminal events for both runs so stream cleanup is covered explicitly.
- Captured and inspected `.tmp/frontend-v2-ts-recovery/v2-background-subagent-stream.png`; the screenshot shows the Recovery background task panel, parent output, reviewer subagent output, fixed sidebar/workspace frame, and active-run composer controls in one stable viewport.
- Kept this as targeted Run Recovery / AG-UI multiplexed continuation migration progress only. Remaining work still includes background task stop, persisted subagent session recovery, persisted subagent terminal refresh, round rail/todo history, broader V1/V2 visual audit, desktop checks, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-recovery.spec.ts` passed with 4 TS browser tests.
- `npm run test:browser -- --project=chromium browser-tests/v2-route-switch.spec.ts browser-tests/v2-recovery.spec.ts` passed with 5 TS browser tests.
- Main-agent screenshot inspection confirmed the background subagent recovery state renders as a stable V2 UI state and multiplexed recovery output appears without breaking the fixed shell.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this background subagent recovery slice. No Run Recovery, AG-UI Runtime Stream, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Background Task Stop Batch

### Scope
- Re-checked the remaining old Python Run Recovery browser coverage after the background subagent recovery slice, then selected background task stop because it protects a real recovery action endpoint and snapshot refresh path.
- Extended the TS recovery browser scenario to render a recovery snapshot with only a running background command task, verify the task opens a recovery stream at `/api/ag-ui/runs/background-run-1/events?after_event_id=0`, and capture the pre-stop Recovery panel.
- Clicked the real `Stop` button, verified the `POST /runs/background-run-1/background-tasks/background-task-1:stop` payload path through the TS mock, cleared the mocked task from the recovery snapshot, and confirmed the Recovery panel disappears after query invalidation.
- Dispatched a terminal `run.stopped` event for the background run so the test covers stream cleanup instead of leaving an active background stream hanging after the stop action.
- Captured and inspected `.tmp/frontend-v2-ts-recovery/v2-background-task-stop-before.png` and `.tmp/frontend-v2-ts-recovery/v2-background-task-stop-after.png`; the screenshots show the running task and Stop button before the action, then the fixed shell without the Recovery panel after the refreshed snapshot.
- Kept this as targeted Run Recovery action migration progress only. Remaining work still includes persisted subagent session recovery, persisted subagent terminal refresh, round rail/todo history, project view flow, broader V1/V2 visual audit, desktop checks, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-recovery.spec.ts` passed with 5 TS browser tests.
- `npm run test:browser -- --project=chromium browser-tests/v2-route-switch.spec.ts browser-tests/v2-recovery.spec.ts` passed with 6 TS browser tests.
- Main-agent screenshot inspection confirmed the background task stop before/after states render as stable V2 UI states and the Recovery panel clears without breaking the fixed shell.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this background task stop slice. No Run Recovery, AG-UI Runtime Stream, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Round Rail Detail Batch

### Scope
- Re-checked the remaining old Python browser coverage after the background task stop slice, then selected round rail retry/todo detail to broaden the TS browser migration into Rounds, Todos, History, And Retry instead of continuing only inside Run Recovery.
- Added a TS Playwright browser scenario that hydrates a real timeline message plus its round projection, verifies the Rounds rail appears, checks the warning tone for pending approvals/questions, and opens the round detail hover panel.
- Verified the detail panel shows pending approval/question counts, retry scheduling metadata, diagnostic text, todo count, and todo item statuses, and that `/sessions/{session_id}/rounds?limit=100` is requested through the browser flow.
- Screenshot inspection caught a real dark-theme regression where the Ant Sender textarea could render as a white input in the V2 shell. Fixed the composer sender CSS to pin the input, focus, and placeholder colors to existing Agent Teams theme variables, then rebuilt `frontend/dist/app`.
- Captured and inspected `.tmp/frontend-v2-ts-rounds/v2-round-rail-detail.png`; the final screenshot shows the round rail detail, timeline output, fixed sidebar/workspace frame, and dark composer input all rendering correctly in one stable viewport.
- Kept this as targeted Message Timeline / Round Rail / composer visual parity progress only. Remaining work still includes image preview, project view, persisted subagent recovery, additional module actions, broader V1/V2 visual audit, desktop checks, and reviewer sign-off.

### Verification
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-rounds.spec.ts` passed with 1 TS browser test.
- `npm run test:browser -- --project=chromium browser-tests/v2-route-switch.spec.ts browser-tests/v2-rounds.spec.ts` passed with 2 TS browser tests.
- `npm run test -- ShellLayoutCss.test.ts` passed with 7 CSS layout tests.
- Main-agent screenshot inspection confirmed the round rail detail stays inside the fixed shell and the dark composer input no longer falls back to a white Ant textarea.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this round rail detail and composer visual fix slice. No Message Timeline, Rounds/Todos/History/Retry, composer subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Project View Batch

### Scope
- Re-checked the frontend rewrite goal and parity checklist after the round rail slice, then selected the project view open/reload/close workflow because it protects a V1 secondary workspace surface and the fixed-shell frame instead of staying focused on message detail polish.
- Added a TS Playwright browser scenario that opens the real workspace project view from the left workspace group action, preserving the V1 secondary-page navigation model rather than flattening project content into primary navigation.
- Verified the project view uses real mocked API data for workspace metadata, snapshot, diff listing, diff preview, file tree, and file preview; the scenario switches from Changes to Files, opens `README.md`, clicks Reload, and checks the refreshed workspace snapshot request.
- Verified the Back control returns to the chat workspace, the project view unmounts, no unhandled API route was hit, and the document remains fixed-height so the workspace/session sidebar does not scroll with main content.
- Captured and inspected `.tmp/frontend-v2-ts-project-view/v2-project-view-files.png`; the final screenshot shows the project view inside the main workspace with the sidebar, workspace group, selected session, file preview, and file tree all stable, and no tooltip pollution.
- Kept this as targeted Sessions And Projects / Project View TS browser migration evidence only. Remaining work still includes session switch during active stream, project remove/open-root mutation coverage, image preview, persisted subagent recovery, wider stream/replay edge cases, desktop checks, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-project-view.spec.ts` passed with 1 TS browser test.
- `npm run test:browser -- --project=chromium browser-tests/v2-route-switch.spec.ts browser-tests/v2-project-view.spec.ts` passed with 2 TS browser tests.
- Main-agent screenshot inspection confirmed the project view stays inside the fixed V2 shell and returns to chat without leaving the secondary page mounted.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this project view open/reload/close slice. No Sessions And Projects subsystem, project action subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Active Stream Session Switch Batch

### Scope
- Re-checked the frontend rewrite goal and parity checklist after the project view slice, then selected the active-stream session switch path because Sessions And Projects explicitly requires browser coverage for switching sessions while a stream is running.
- Added a TS Playwright browser scenario that starts a real AG-UI foreground run from the composer, opens the EventSource test harness, dispatches `run.started` and live text-delta events, and verifies the source session shows streaming output and the Stop control.
- Switched to a second sidebar session while the source run is still open, verifying the foreground stream is cleared, the EventSource handle closes, the Stop control disappears, the composer becomes usable again, and the second session hydrates its own persisted message without showing the source session stream.
- Dispatched a late text-delta into the already closed source EventSource and verified it stays hidden, protecting the boundary where replay or delayed browser events could otherwise leak into the newly selected session.
- Captured and inspected `.tmp/frontend-v2-ts-session-switch/v2-active-stream-session-switch.png`; the screenshot shows the fixed shell, source session still carrying its backend active-run indicator, the secondary session selected, second-session output visible, and composer controls restored.
- Kept this as targeted Sessions And Projects / AG-UI Runtime Stream browser migration evidence only. Remaining work still includes long tool-heavy replay inspection, image preview, persisted subagent session recovery, broader stream event matrix edges, desktop checks, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-session-switch-stream.spec.ts` passed with 1 TS browser test.
- `npm run test:browser -- --project=chromium browser-tests/v2-route-switch.spec.ts browser-tests/v2-stream-create-run.spec.ts browser-tests/v2-session-switch-stream.spec.ts` passed with 3 TS browser tests.
- Main-agent screenshot inspection confirmed session switching during an active foreground stream stays inside the fixed V2 shell, closes the foreground EventSource, and restores composer controls in the selected session.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this active stream session switch slice. No Sessions And Projects subsystem, AG-UI Runtime Stream subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Image Preview Batch

### Scope
- Re-checked the frontend rewrite goal and parity checklist after the active stream session-switch slice, then selected image preview because Resource And Assistive Features explicitly requires screenshot evidence and the existing coverage was still component-level only.
- Added a TS Playwright browser scenario that hydrates a persisted assistant message containing a real `media_ref` image part, verifies the inline image and caption render through the V2 timeline, then clicks the Ant Image preview mask a user actually sees.
- Verified the preview overlay mask, close control, and preview image become visible, and captured the settled overlay state after the opening animation so the screenshot proves the modal preview rather than only the inline thumbnail.
- Kept the scenario inside the existing fixed-shell guardrails: no unhandled API routes, no document-level scroll, and no composer-control overlap before opening the preview; after Escape closes the overlay, the fixed V2 shell is still stable.
- Captured and inspected `.tmp/frontend-v2-ts-image-preview/v2-image-preview-open.png`; the screenshot shows the darkened shell, inline media behind the overlay, centered image preview, and close control.
- Kept this as targeted Resource And Assistive Features / Message Timeline browser evidence only. Remaining work still includes long tool-heavy replay inspection, persisted subagent session recovery, broader stream event matrix edges, desktop checks, final V1/V2 visual audit, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-image-preview.spec.ts` passed with 1 TS browser test.
- Main-agent screenshot inspection confirmed image media renders and opens the real preview overlay without breaking the fixed V2 shell.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this image preview slice. No Resource And Assistive Features subsystem, Message Timeline subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Tool-Heavy Refresh Replay Batch

### Scope
- Re-checked the frontend rewrite goal and parity checklist after the image preview slice, then selected a refresh replay boundary because the remaining risk is not just live text streaming but replay continuation while the timeline already contains hydrated tool output.
- Extended the TS stream-refresh browser scenario so a run starts from the real composer, emits text, tool call, tool result, and token usage events, then the page reloads as if the browser refreshed during the active stream.
- Hydrated the post-refresh timeline with persisted text plus tool-heavy message parts, verified the recovery snapshot opens `/api/ag-ui/runs/run-ts-tool-refresh/events?after_event_id=5`, and dispatched a duplicate `event_id=5` text delta to prove cursor replay duplicates stay hidden.
- Continued the stream after the hydrated cursor with a validation failure and structured `output_delta` text, verified the tool count changes only for the new validation event, and finalized the run with `run.completed` so the Stop control clears.
- Captured and inspected `.tmp/frontend-v2-ts-stream/v2-stream-tool-heavy-refresh-replay.png`; the screenshot shows the active recovery banner, hydrated tool call/result/error rows, resumed validation row, resumed output, fixed sidebar, and composer controls staying inside one viewport.
- Kept this as targeted Message Timeline / AG-UI refresh replay evidence only. Remaining work still includes persisted subagent session recovery, broader event matrix edges, desktop checks, final V1/V2 visual audit, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-stream-refresh.spec.ts` passed with 2 TS browser tests.
- `npm run test:browser -- --project=chromium browser-tests/v2-route-switch.spec.ts browser-tests/v2-stream-refresh.spec.ts` passed with 3 TS browser tests.
- Main-agent screenshot inspection confirmed tool-heavy refresh replay remains visually stable and continues from the hydrated event cursor without duplicating old output.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this tool-heavy refresh replay slice. No Message Timeline subsystem, AG-UI Runtime Stream subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Subagent Session View Batch

### Scope
- Re-checked the frontend rewrite goal and parity checklist after the tool-heavy refresh replay slice, then selected the subagent session view because the Subagents checklist requires a Playwright scenario for selecting and observing a subagent.
- Added a TS browser scenario that starts from the real V2 shell, exposes a parent sidebar session with `subagent_count`, expands the nested subagent list, and opens the secondary read-only subagent session view instead of flattening subagent content into the primary navigation.
- Verified the subagent view hydrates history from `/sessions/{session_id}/agents/{instance_id}/messages`, starts the subagent EventSource from `after_event_id=41`, renders live subagent output, receives `run.completed`, then refetches the subagent history and sidebar state.
- Verified the terminal state updates both the main subagent badge and nested sidebar item to `completed`, and the Back control returns to the parent chat workspace without leaving the subagent page mounted.
- Captured and inspected `.tmp/frontend-v2-ts-subagent-session/v2-subagent-session-completed.png`; the screenshot shows the nested sidebar subagent item, secondary subagent page header, completed badge, and final persisted subagent answer inside the fixed shell.
- Kept this as targeted Subagents / Sessions browser evidence only. Remaining work still includes broader subagent stream cleanup and failure states, desktop checks, final V1/V2 visual audit, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-subagent-session.spec.ts` passed with 1 TS browser test.
- `npm run test:browser -- --project=chromium browser-tests/v2-route-switch.spec.ts browser-tests/v2-subagent-session.spec.ts` passed with 2 TS browser tests.
- Main-agent screenshot inspection confirmed the subagent session remains a secondary page within the fixed V2 shell, with nested sidebar structure preserved.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this subagent session view slice. No Subagents subsystem, Sessions subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Real SSE Stale Recovery Batch

### Scope
- Re-checked the frontend rewrite goal, parity checklist, and remaining `.py` V2 browser tests after the subagent session slice, then selected real SSE stale-recovery suppression because it protects stream/replay boundary behavior that was still covered only by Python browser tests.
- Added a TS Playwright browser scenario that keeps the browser's native `EventSource` path active, creates a real foreground AG-UI run, fulfills `/api/ag-ui/runs/{run_id}/events` with `text/event-stream`, and verifies an explicit server `error` frame restores the composer without opening a stale second recovery stream.
- Added a sibling TS browser scenario for a malformed SSE event after valid `run.started` and `message.text.delta` frames, verifying the persisted live output remains visible, the composer is restored, and the stream request count stays at one after the native reconnect grace window.
- Screenshot inspection caught a stale RecoveryBar regression where suppressed active runs still displayed `Run ... is streaming` after server/malformed stream errors. Fixed RecoveryBar so suppressed pure active-run snapshots no longer render a misleading recovery banner, while pending approvals, user questions, paused subagents, and background tasks remain visible.
- Rebuilt `frontend/dist/app` so the packaged V2 app carries the RecoveryBar fix, then re-captured `.tmp/frontend-v2-ts-stream/v2-real-sse-server-error-stale-recovery.png` and `.tmp/frontend-v2-ts-stream/v2-real-sse-malformed-stale-recovery.png`; both screenshots show the fixed shell, restored composer, native stream error toast, and no stale blue recovery bar.
- Kept this as targeted AG-UI Runtime Stream / Run Recovery / TS browser migration progress only. Remaining work still includes broader real-SSE replay/resume edges, remaining Python browser migration, desktop checks, final V1/V2 visual audit, and reviewer sign-off.

### Verification
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm run typecheck` passed.
- `npm run test -- RecoveryBar.test.tsx` passed with 25 unit tests.
- `npm run test:browser -- --project=chromium browser-tests/v2-real-sse-stale-recovery.spec.ts` passed with 2 TS browser tests.
- `npm run test:browser -- --project=chromium browser-tests/v2-recovery.spec.ts` passed with 5 TS browser tests.
- Main-agent screenshot inspection confirmed the server-error and malformed-event states remain inside the fixed V2 shell, restore composer controls, and do not leave a stale RecoveryBar banner.

### Reviewer
- Main-agent TS browser, unit, build, and screenshot verification completed for this real SSE stale-recovery slice. No AG-UI Runtime Stream subsystem, Run Recovery subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Appearance And Narrow Shell Batch

### Scope
- Re-checked the remaining V2 Python browser coverage after the real SSE stale-recovery slice, then selected appearance settings and narrow shell layout because they protect the large-frame UI issues called out in the Application Shell and Settings checklist.
- Added a TS Playwright browser scenario that opens Settings from the real top bar, verifies the V1 settings drawer/secondary-page model is preserved, selects the `Rose Pine` dark appearance preset, and asserts the theme values are persisted to `agent_teams_appearance` and applied to the CSS variables.
- Added metrics assertions that the document body remains fixed-height while the Settings section body owns its internal scroll, and that the three appearance preview tiles keep stable usable dimensions.
- Added a narrow viewport TS browser scenario that verifies the sidebar overlay, scrim, hidden resizer, fixed workspace geometry, close/reopen controls, and document scroll constraints at `390x740`.
- Captured and inspected `.tmp/frontend-v2-ts-appearance/v2-appearance-dark-rose-pine.png` and `.tmp/frontend-v2-ts-appearance/v2-narrow-sidebar-overlay.png`; the screenshots show the settings drawer over the dimmed workspace, preserved V1 sidebar entries/settings sections, and the mobile sidebar overlay without dragging the workspace into document scroll.
- Kept this as targeted Application Shell / Settings / TS browser migration progress only. Remaining work still includes additional module action parity, remaining Python browser migration, desktop checks, broader real-SSE replay/resume edges, final V1/V2 visual audit, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-appearance-layout.spec.ts` passed with 2 TS browser tests.
- `npm run test:browser -- --project=chromium browser-tests/v2-shell-parity.spec.ts browser-tests/v2-appearance-layout.spec.ts` passed with 4 TS browser tests.
- Main-agent screenshot inspection confirmed the appearance settings drawer and narrow sidebar overlay remain stable inside the fixed V2 shell.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this appearance and narrow-shell slice. No Application Shell subsystem, Settings subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Desktop Smoke Migration Batch

### Scope
- Re-checked the frontend rewrite goal after the appearance/narrow-shell slice, then selected the remaining V2 Electron desktop smoke coverage because the quality gates require desktop checks and the goal asks UI verification to move out of Python browser tests.
- Migrated the Python Electron smoke scenarios into `frontend/app/browser-tests/v2-desktop-smoke.spec.ts`, covering renderer boot through the real Electron preload, backend startup failure UI, external-link IPC boundaries, and managed backend lifecycle start/stop.
- Kept the V1-style shell/sidebar/settings structure untouched; the desktop renderer smoke uses the existing app shell and verifies the exposed desktop API keys, isolated `require`/`process`, backend status, and rendered markdown link.
- Removed `tests/integration_tests/browser/test_v2_desktop_smoke.py` after the TS replacement passed, reducing the remaining `.py` UI surface without weakening the desktop release gate.
- Captured and inspected `.tmp/frontend-v2-desktop/v2-electron-renderer.png` and `.tmp/frontend-v2-desktop/v2-electron-startup-failed.png`; screenshots show the fixed desktop shell and the standalone startup failure page.
- Kept this as targeted Desktop / TS browser migration progress only. Remaining work still includes the broader stream/replay Python migration, final V1/V2 visual audit, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run desktop:build` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-desktop-smoke.spec.ts` passed with 4 TS Electron/browser tests.
- Main-agent screenshot inspection confirmed the desktop renderer and startup-failure states render correctly.

### Reviewer
- Main-agent TS browser, desktop build, and screenshot verification completed for this Electron smoke migration slice. No Desktop subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Real SSE Terminal Lifecycle Batch

### Scope
- Re-checked the frontend rewrite goal, parity checklist, and remaining Python V2 browser coverage after the desktop smoke migration, then selected native SSE terminal lifecycle behavior because the AG-UI Runtime Stream checklist still requires run failed/stopped handling on the real browser EventSource path.
- Extended the TS real-SSE browser spec with `run.failed` and `run.stopped` terminal scenarios. Both scenarios create a real foreground AG-UI run from the composer, receive native `text/event-stream` frames, render live text, then receive the terminal event.
- Verified terminal events restore composer controls, hide the Stop button, suppress stale recovery banners, avoid extra stale reconnect requests, and keep the fixed shell without document scroll or composer-control overlap.
- Tightened Stop/Send button locators to exact accessible names so a session title such as `TS run-stopped` cannot masquerade as the run Stop action.
- Captured and inspected `.tmp/frontend-v2-ts-stream/v2-real-sse-run-failed-terminal.png` and `.tmp/frontend-v2-ts-stream/v2-real-sse-run-stopped-terminal.png`; screenshots show terminal summaries in the timeline with the composer restored and the shell fixed.
- Kept this as targeted AG-UI Runtime Stream / TS browser migration progress only. Remaining work still includes broader real-SSE resume/replay and recoverable-run edges, remaining Python browser migration, final V1/V2 visual audit, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-real-sse-stale-recovery.spec.ts` passed with 4 TS browser tests.
- Main-agent screenshot inspection confirmed real SSE failed/stopped terminal states render correctly and do not reopen stale recovery.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this real SSE terminal lifecycle slice. No AG-UI Runtime Stream subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Real SSE Active Control Batch

### Scope
- Re-checked the frontend rewrite goal and current ledger after the terminal lifecycle slice, then selected active-run controls because streaming/replay semantics remain one of the largest V2 completion risks.
- Extended the native EventSource TS browser suite with active Stop and Queue/Interrupt scenarios. The tests create a real foreground AG-UI run from the composer, keep the browser EventSource path active, and verify active controls against the fixed V2 shell.
- Found and fixed a stale recovery race where a successful Stop cleared local stream state, but the next recovery snapshot could still rehydrate the same running `active_run` and bring back the Stop controls.
- Added explicit run suppression to `clearRunStream({ suppressRunIds })` and changed the Composer Stop success path to suppress only the stopped run id, preserving ordinary session-switch and unmount clear behavior.
- Added unit coverage for Composer stop suppression and for the controller distinction between ordinary clear and explicit suppressed clear.
- Captured and inspected `.tmp/frontend-v2-ts-stream/v2-real-sse-active-stop-restored.png` and `.tmp/frontend-v2-ts-stream/v2-real-sse-active-inject-controls.png`; the screenshots show the fixed shell, V1 sidebar shape, active Queue/Interrupt controls before stop, and restored Send controls with no stale recovery banner after stop.
- Kept this as targeted AG-UI Runtime Stream / Run Recovery / TS browser migration progress only. Remaining work still includes broader real-SSE replay/resume edges, remaining Python browser migration, desktop checks, final V1/V2 visual audit, and reviewer sign-off.

### Verification
- `npm run test -- Composer.test.tsx RunStreamController.test.tsx` passed with 70 unit tests.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm run test:browser -- --project=chromium browser-tests/v2-real-sse-stale-recovery.spec.ts` passed with 6 TS browser tests.
- `npm run test -- RecoveryBar.test.tsx` passed with 25 unit tests.
- `npm run test:browser -- --project=chromium browser-tests/v2-recovery.spec.ts` passed with 5 TS browser tests.
- Main-agent screenshot inspection confirmed explicit Stop suppresses stale recovery, Queue/Interrupt inject into the existing run without a second run create, and the shell remains fixed-height.

### Reviewer
- Main-agent TS browser, unit, build, recovery, and screenshot verification completed for this real SSE active-control slice. No AG-UI Runtime Stream subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Real SSE Recoverable Action Batch

### Scope
- Re-checked the frontend rewrite goal, parity checklist, and remaining Python V2 browser stream coverage after the active-control slice, then selected recoverable action resume because it sits at the boundary of stopped runs, pending approvals/questions, and real EventSource replay.
- Extended the native EventSource TS browser suite with two recoverable stopped-run scenarios: tool approval and user-question answer. Both start from a recovery snapshot with `should_show_recover=true`, verify the standalone Resume button is hidden while action items are pending, then trigger the recovery action.
- Verified the UI calls `/ag-ui/runs/{run_id}:resume` before resolving the approval or question action, opens the real SSE stream from `after_event_id=7`, renders the resumed output and terminal completion, clears recovery UI, restores Send, and keeps the fixed V2 shell without composer-control overlap.
- Removed the corresponding real-SSE Python UI scenarios from `tests/integration_tests/browser/test_v2_stream_recovery.py`, reducing the remaining `.py` browser migration surface instead of duplicating coverage.
- Captured and inspected `.tmp/frontend-v2-ts-stream/v2-real-sse-recovery-approval-resume.png` and `.tmp/frontend-v2-ts-stream/v2-real-sse-recovery-question-resume.png`; both screenshots show the recovered stream transcript, restored composer, V1-shaped sidebar, and no stale recovery banner.
- Kept this as targeted AG-UI Runtime Stream / Run Recovery / TS browser migration progress only. Remaining work still includes broader real-SSE rich replay edges, remaining Python browser migration, desktop checks, final V1/V2 visual audit, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-real-sse-stale-recovery.spec.ts` passed with 8 TS browser tests.
- `uv run --extra dev python -m py_compile tests/integration_tests/browser/test_v2_stream_recovery.py` passed after removing the migrated Python scenarios.
- Main-agent screenshot inspection confirmed the approval and question recovery paths resume through real SSE from the checkpoint and end in a stable fixed shell.

### Reviewer
- Main-agent TS browser, syntax, and screenshot verification completed for this real SSE recoverable-action slice. No AG-UI Runtime Stream subsystem, Run Recovery subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Message Export Decode Migration Batch

### Scope
- Re-checked the frontend rewrite goal and remaining Python browser coverage after the recoverable-action slice, then selected message export because its old Python harness still owned HTML cleanliness and PNG decode evidence outside the V2 Playwright suite.
- Strengthened `frontend/app/browser-tests/v2-message-export.spec.ts` so the V2 top-bar export flow parses the downloaded HTML in the browser and verifies the title, heading, two-round message structure, prompt text, assistant output, pending-action summaries, retry diagnostics, tool-call arguments, and absence of legacy share classes or sidebar time leakage.
- Added browser-side `createImageBitmap` validation for the downloaded PNG so the test proves the artifact is a decodable image, not just a file with a PNG magic header.
- Removed `tests/integration_tests/browser/test_message_export_browser.py` after the TS replacement passed, reducing the remaining old Python UI-browser surface without preserving a parallel dist-only harness.
- Did not capture a screenshot for this batch because no visible UI implementation changed; artifact verification comes from the downloaded HTML DOM parse and in-browser PNG decode.
- Kept this as targeted Message Timeline / export artifact TS browser migration progress only. Remaining work still includes message copy actions, voice/composer browser coverage, remaining V2 shell and stream Python migration, long stream replay edges, final V1/V2 visual audit, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-message-export.spec.ts` passed with 1 TS browser test.
- Residual Python browser scan still shows remaining coverage in `test_message_copy_actions.py`, `test_voice_input_audio.py`, `test_v2_shell_layout.py`, `test_v2_stream_recovery.py`, and older V1/dist browser suites.

### Reviewer
- Main-agent TS browser and artifact verification completed for this message export decode migration slice. No Message Timeline subsystem, export-control subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Paused Subagent Recovery Batch

### Scope
- Re-checked the remaining V2 Python recovery coverage after the message export migration, then selected paused subagent recovery because it is a focused Run Recovery/Subagents boundary still covered only by a Python browser scenario.
- Added a built-shell TS browser scenario in `frontend/app/browser-tests/v2-recovery.spec.ts` that renders a recovery snapshot with `paused_subagent`, verifies the paused subagent follow-up copy and detail line, confirms the standalone Resume action is hidden, and confirms no EventSource stream is opened for this attention-only recovery state.
- Removed the corresponding `test_v2_paused_subagent_recovery_displays_followup_state` scenario from `tests/integration_tests/browser/test_v2_stream_recovery.py` after the TS replacement passed.
- Captured and inspected `.tmp/frontend-v2-ts-recovery/v2-paused-subagent-recovery.png`; the screenshot shows the fixed V2 shell, V1-shaped sidebar, paused-subagent recovery panel, stable composer, and no document-level scrolling.
- Kept this as targeted Run Recovery / Subagents TS browser migration progress only. Remaining work still includes rich real-SSE replay, background subagent stream edges, message copy and voice/composer browser coverage, final V1/V2 visual audit, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `uv run --extra dev python -m py_compile tests/integration_tests/browser/test_v2_stream_recovery.py` passed after removing the migrated Python scenario.
- `npm run test:browser -- --project=chromium browser-tests/v2-recovery.spec.ts` passed with 6 TS browser tests.
- Main-agent screenshot inspection confirmed paused-subagent recovery remains inside the fixed shell and suppresses the standalone Resume action.

### Reviewer
- Main-agent TS browser, syntax, and screenshot verification completed for this paused-subagent recovery slice. No Run Recovery subsystem, Subagents subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Real SSE Duplicate Python Coverage Cleanup Batch

### Scope
- Re-checked the remaining Python `test_v2_stream_recovery.py` scenarios against existing TS browser specs after the paused-subagent slice.
- Removed Python scenarios that are already covered by `frontend/app/browser-tests/v2-real-sse-stale-recovery.spec.ts`: real SSE server-error stale suppression, malformed-event stale suppression, `run.failed`, `run.stopped`, active Stop, active Queue/Interrupt injection, and recoverable approval/question actions that resume before resolving the pending action.
- Kept the Python scenarios that still need dedicated TS migration, including runtime-cursor reconnect, refresh recovery checkpoint, cursor-event dedupe, rich non-text replay, standalone recoverable resume, background/multiplex subagent recovery, and recoverable parent/subagent stream isolation.
- Did not capture new screenshots in this cleanup batch because no renderer code or TS scenario changed; the existing TS real-SSE suite retains screenshot coverage for the removed Python paths.
- Kept this as targeted AG-UI Runtime Stream / Run Recovery browser-suite migration cleanup only. Remaining work still includes the harder replay/refresh/multiplex stream edges, message copy and voice/composer browser coverage, final V1/V2 visual audit, and reviewer sign-off.

### Verification
- `uv run --extra dev python -m py_compile tests/integration_tests/browser/test_v2_stream_recovery.py` passed after removing the duplicate Python scenarios.
- `npm run test:browser -- --project=chromium browser-tests/v2-real-sse-stale-recovery.spec.ts` passed with 8 TS browser tests.
- Residual scan now shows the remaining real-SSE Python scenarios are the richer replay/refresh/multiplex cases that still need separate migration work.

### Reviewer
- Main-agent TS browser and syntax verification completed for this duplicate real-SSE cleanup slice. No AG-UI Runtime Stream subsystem, Run Recovery subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Real SSE Standalone Resume Batch

### Scope
- Re-checked the remaining real-SSE Python recovery scenarios after the duplicate cleanup slice, then selected standalone recoverable Resume because the TS suite covered approval/question resume ordering but not the plain Resume button path.
- Added a native EventSource TS browser scenario to `frontend/app/browser-tests/v2-real-sse-stale-recovery.spec.ts` that starts from a stopped recoverable snapshot, clicks the standalone Resume action, verifies `/ag-ui/runs/{run_id}:resume`, opens the stream from `after_event_id=7`, renders resumed text plus terminal completion, clears recovery UI, and restores Send.
- Removed `test_v2_real_sse_recoverable_resume_streams_from_checkpoint` from `tests/integration_tests/browser/test_v2_stream_recovery.py` after the TS replacement passed.
- Captured and inspected `.tmp/frontend-v2-ts-stream/v2-real-sse-recoverable-resume.png`; the screenshot shows the recovered transcript inside the fixed V2 shell, stable V1-shaped sidebar, cleared recovery banner, and anchored composer.
- Kept this as targeted Run Recovery / AG-UI Runtime Stream TS browser migration progress only. Remaining work still includes refresh checkpoint replay, cursor-event dedupe, rich non-text replay, multiplex/subagent stream recovery, message copy and voice/composer browser coverage, final V1/V2 visual audit, and reviewer sign-off.

### Verification
- `npm run typecheck` passed.
- `uv run --extra dev python -m py_compile tests/integration_tests/browser/test_v2_stream_recovery.py` passed after removing the migrated Python scenario.
- `npm run test:browser -- --project=chromium browser-tests/v2-real-sse-stale-recovery.spec.ts` passed with 9 TS browser tests.
- Main-agent screenshot inspection confirmed standalone Resume continues through real SSE from the checkpoint and ends in a stable fixed shell.

### Reviewer
- Main-agent TS browser, syntax, and screenshot verification completed for this standalone real-SSE resume slice. No Run Recovery subsystem, AG-UI Runtime Stream subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Real SSE Refresh Checkpoint Batch

### Scope
- Re-checked the frontend rewrite goal before continuing and selected refresh checkpoint recovery because stream/replay/refresh behavior remains one of the largest V2 completion risks.
- Added a native EventSource TS browser scenario to `frontend/app/browser-tests/v2-real-sse-stale-recovery.spec.ts` that starts a real SSE run, hydrates the first assistant chunk as persisted history, reloads the app, verifies the next stream opens from `after_event_id=2`, and renders only the post-checkpoint continuation once.
- Fixed the timeline hydration filter so a closed run with hydrated assistant output suppresses duplicate pre-checkpoint runtime deltas while still keeping live runtime deltas whose `event_id` is greater than the replay cursor.
- Added `replayAfterEventId` to runtime replay cursor state and unit coverage proving post-refresh runtime deltas remain visible when hydration only covers earlier output.
- Removed the migrated Python `test_v2_real_sse_refresh_recovery_reopens_stream_from_checkpoint` scenario from `tests/integration_tests/browser/test_v2_stream_recovery.py`.
- Rebuilt `frontend/dist/app` so the browser harness serves the updated V2 runtime code.
- Captured and inspected `.tmp/frontend-v2-ts-stream/v2-real-sse-refresh-recovery.png`; the screenshot shows the hydrated pre-refresh chunk once, the resumed chunk after reload, a fixed-height shell, stable V1-shaped sidebar, and restored composer.
- Kept this as targeted AG-UI Runtime Stream / Refresh Recovery TS browser migration progress only. Remaining work still includes cursor-event dedupe, rich non-text replay, multiplex/subagent stream recovery, message copy and voice/composer browser coverage, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, and reviewer sign-off.

### Verification
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm run test -- MessageTimeline.test.tsx` passed with 58 unit tests.
- `npm run test:browser -- --project=chromium browser-tests/v2-real-sse-stale-recovery.spec.ts` passed with 10 TS browser tests.
- `uv run --extra dev python -m py_compile tests/integration_tests/browser/test_v2_stream_recovery.py` passed after removing the migrated Python scenario.
- Main-agent screenshot inspection confirmed refresh recovery continues through real SSE from the persisted checkpoint and stays inside the fixed shell.

### Reviewer
- Main-agent build, unit, TS browser, syntax, and screenshot verification completed for this refresh-checkpoint recovery slice. No AG-UI Runtime Stream subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Real SSE Cursor Dedupe Batch

### Scope
- Re-checked the remaining V2 frontend gaps after the refresh-checkpoint commit and selected cursor-event dedupe because replay semantics remain higher risk than ordinary visual polish.
- Added a native EventSource TS browser scenario to `frontend/app/browser-tests/v2-real-sse-stale-recovery.spec.ts` that starts a real foreground SSE run, lets the first stream reach event 2, waits for the runtime controller to reopen from `after_event_id=2`, then sends a duplicate event 2 before the fresh event 3 continuation and terminal event 4.
- Verified the duplicate cursor chunk is not rendered a second time, the continuation does render, the run reaches terminal completion, Send returns, and the fixed shell does not acquire document-level scrolling.
- Removed the migrated Python `test_v2_real_sse_replay_dedupes_cursor_event_before_continuing` scenario from `tests/integration_tests/browser/test_v2_stream_recovery.py`.
- Captured and inspected `.tmp/frontend-v2-ts-stream/v2-real-sse-duplicate-replay.png`; the screenshot shows one pre-reconnect chunk, the post-cursor continuation, terminal completion, V1-shaped sidebar, and anchored composer.
- Kept this as targeted AG-UI Runtime Stream / Replay TS browser migration progress only. Remaining work still includes rich non-text replay, runtime-cursor reconnect cleanup, multiplex/subagent stream recovery, message copy and voice/composer browser coverage, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, and reviewer sign-off.

### Verification
- `npm run build` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-real-sse-stale-recovery.spec.ts` passed with 11 TS browser tests.
- `uv run --extra dev python -m py_compile tests/integration_tests/browser/test_v2_stream_recovery.py` passed after removing the migrated Python scenario.
- Main-agent screenshot inspection confirmed cursor-event dedupe continues through real SSE replay and stays inside the fixed shell.

### Reviewer
- Main-agent build, TS browser, syntax, and screenshot verification completed for this cursor-dedupe replay slice. No AG-UI Runtime Stream subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Real SSE Rich Replay Batch

### Scope
- Re-checked the remaining Python UI stream coverage after the cursor-dedupe slice and selected rich real-SSE replay because it covers non-text runtime semantics that are easy to regress while the UI still looks superficially correct.
- Added a native EventSource TS browser scenario to `frontend/app/browser-tests/v2-real-sse-stale-recovery.spec.ts` that starts a real foreground run, reconnects from `after_event_id=2`, and replays thinking, tool call/result, token usage, model step, state snapshot/delta, todo, notification, subagent status, background task, injection, user-question, manual-action, output media, validation failure, and terminal completion events.
- Added scroll-aware TS helpers for virtualized timeline text and selector checks so long replay assertions inspect the actual timeline instead of accidentally matching fixed composer controls or only the current viewport.
- Mocked a rich replay round page in the TS harness and verified the round marker reaches completed state after terminal runtime state.
- Removed the migrated Python `test_v2_real_sse_rich_replay_preserves_non_text_events_after_reconnect` scenario from `tests/integration_tests/browser/test_v2_stream_recovery.py`.
- Captured and inspected `.tmp/frontend-v2-ts-stream/v2-real-sse-rich-replay.png`; the screenshot shows the long replay inside the fixed V2 shell, V1-shaped sidebar, round rail, rich tool/thinking/token/model rows, and anchored composer.
- Kept this as targeted AG-UI Runtime Stream / Message Timeline TS browser migration progress only. Remaining work still includes real-SSE runtime-cursor reconnect cleanup, multiplex/subagent stream recovery, session-switch/recovery Python migration, message copy and voice/composer browser coverage, final V1/V2 visual audit, V2 naming cleanup, and reviewer sign-off.

### Verification
- `npm run build` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-real-sse-stale-recovery.spec.ts --grep "preserves rich real SSE replay events after reconnect"` passed with 1 TS browser test.
- `npm run test:browser -- --project=chromium browser-tests/v2-real-sse-stale-recovery.spec.ts` passed with 12 TS browser tests.
- `uv run --extra dev python -m py_compile tests/integration_tests/browser/test_v2_stream_recovery.py` passed after removing the migrated Python scenario.
- Main-agent screenshot inspection confirmed rich replay remains inside the fixed shell and preserves the expected non-text timeline rows.

### Reviewer
- Main-agent build, TS browser, syntax, and screenshot verification completed for this rich replay slice. No AG-UI Runtime Stream subsystem, Message Timeline subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Real SSE Runtime Cursor Reconnect Batch

### Scope
- Re-checked the remaining V2 stream/replay Python UI surface after the rich replay slice and selected the runtime-cursor reconnect path because it exercises interrupted-stream recovery under browser-native EventSource timing.
- Extended the TS browser support server so individual scenarios can serve real HTTP API/SSE responses from the same localhost origin while preserving the default static-server behavior for existing tests.
- Added a native HTTP SSE scenario to `frontend/app/browser-tests/v2-real-sse-stale-recovery.spec.ts` that lets the first stream reach event 2, records the browser's automatic reconnect with `Last-Event-ID: 2`, then verifies the V2 runtime controller opens the manual continuation stream with `after_event_id=2`.
- Verified the continuation chunk renders, the original chunk is not duplicated, terminal completion restores Send, and the fixed shell does not acquire document-level scrolling.
- Removed the migrated Python `test_v2_real_sse_interrupted_stream_reconnects_from_runtime_cursor` scenario from `tests/integration_tests/browser/test_v2_stream_recovery.py`.
- Captured and inspected `.tmp/frontend-v2-ts-stream/v2-real-sse-runtime-cursor-reconnect.png`; the screenshot shows the interrupted stream continuation inside the fixed shell, V1-shaped sidebar, terminal completion, and anchored composer.
- Kept this as targeted AG-UI Runtime Stream / Interrupted Stream Recovery TS browser migration progress only. Remaining work still includes mock EventSource stream refresh/session-switch Python migration, recoverable/background/multiplex recovery migration, message copy and voice/composer browser coverage, final V1/V2 visual audit, V2 naming cleanup, and reviewer sign-off.

### Verification
- `npm run build` passed.
- `npm run test:browser -- --project=chromium browser-tests/v2-real-sse-stale-recovery.spec.ts --grep "reconnects a real SSE interruption from the runtime cursor"` passed with 1 TS browser test.
- `npm run test:browser -- --project=chromium browser-tests/v2-real-sse-stale-recovery.spec.ts` passed with 13 TS browser tests.
- `uv run --extra dev python -m py_compile tests/integration_tests/browser/test_v2_stream_recovery.py` passed after removing the migrated Python scenario.
- Main-agent screenshot inspection confirmed runtime-cursor reconnect remains inside the fixed shell and preserves the expected continuation transcript.

### Reviewer
- Main-agent build, TS browser, syntax, and screenshot verification completed for this runtime-cursor reconnect slice. No AG-UI Runtime Stream subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Real SSE Background Subagent Recovery Batch

### Scope
- Re-checked the remaining V2 stream/replay Python UI surface after the runtime-cursor reconnect slice and selected background subagent recovery because it spans Run Recovery, AG-UI multiplex streams, and the subagent boundary that must not be flattened into the parent chat.
- Added TS browser coverage in `frontend/app/browser-tests/v2-real-sse-stale-recovery.spec.ts` for a recovered active parent run with a running background subagent task. The scenario verifies the frontend opens `/api/ag-ui/runs/events` once with `run_id=run-ts-real-sse-stale&after_event_id=5` and `run_id=subagent-run-ts-real-sse&after_event_id=0`, then renders both parent and reviewer subagent deltas through the single stream.
- Added TS browser coverage for a recoverable/stopped parent run with a running background subagent task. The scenario verifies the parent run is not included in automatic recovery, no multiplex stream opens, only `/api/ag-ui/runs/subagent-run-ts-real-sse/events?after_event_id=0` is requested, and the reviewer subagent output renders while the parent stays recoverable.
- Removed the migrated Python scenarios `test_v2_real_sse_background_task_recovery_streams_multiplexed_runs` and `test_v2_real_sse_recoverable_parent_streams_background_subagent_only` from `tests/integration_tests/browser/test_v2_stream_recovery.py`.
- Captured and inspected `.tmp/frontend-v2-ts-stream/v2-real-sse-background-subagent-multiplex.png` and `.tmp/frontend-v2-ts-stream/v2-real-sse-background-subagent-only.png`; both screenshots show the recovered output inside the fixed V2 shell, V1-shaped sidebar, anchored composer, and no document-level scroll.
- Kept this as targeted Run Recovery / AG-UI Runtime Stream / Subagents TS browser migration progress only. Remaining work still includes mock EventSource refresh/session-switch recovery migration, background task stop migration, message copy and voice/composer browser coverage, final V1/V2 visual audit, V2 naming cleanup, and reviewer sign-off.

### Verification
- `npm run build` passed.
- `npm run test:browser -- browser-tests/v2-real-sse-stale-recovery.spec.ts -g "background subagent"` passed with 2 TS browser tests.
- `npm run test:browser -- browser-tests/v2-real-sse-stale-recovery.spec.ts` passed with 15 TS browser tests.
- `uv run --extra dev python -m py_compile tests/integration_tests/browser/test_v2_stream_recovery.py` passed after removing the migrated Python scenarios.
- Main-agent screenshot inspection confirmed multiplexed parent/subagent recovery and background-subagent-only recovery both remain inside the fixed shell and preserve the expected parent/subagent stream isolation.

### Reviewer
- Main-agent build, TS browser, syntax, and screenshot verification completed for this background subagent recovery slice. No Run Recovery subsystem, AG-UI Runtime Stream subsystem, Subagents subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Stream Copy Terminal Batch

### Scope
- Re-checked the remaining Python UI stream coverage after the background subagent recovery slice and selected `Copy last answer` terminal gating because it is a user-visible stream/composer boundary still covered only by Python browser code.
- Added TS browser coverage in `frontend/app/browser-tests/v2-stream-create-run.spec.ts` that starts a live run from the real V2 composer, emits a text delta, verifies `Copy last answer` is visible but disabled while the EventSource is open, emits terminal completion, then verifies the button enables and writes the streamed answer to the clipboard probe.
- Fixed a Message Timeline bug found by the new browser scenario: runtime lifecycle rows such as `run.completed` could become the latest copy target after terminal state, so copying produced `Run completed: status completed` instead of the answer. Runtime lifecycle rows still render, but only runtime `message`, `text_delta`, and `output_delta` answer rows are copy targets.
- Added focused React coverage proving a terminal runtime row does not replace the copied answer.
- Removed the migrated Python `test_v2_copy_last_answer_waits_for_stream_terminal` scenario from `tests/integration_tests/browser/test_v2_stream_recovery.py`.
- Rebuilt `frontend/dist/app` and captured `.tmp/frontend-v2-ts-stream/v2-stream-copy-last-answer-terminal.png`; the screenshot shows the streamed answer, terminal row, fixed V2 shell, V1-shaped sidebar, and anchored composer with the copy affordance attached to the answer row.
- Kept this as targeted Message Timeline / AG-UI Runtime Stream TS browser migration progress only. Remaining work still includes mock EventSource refresh/reconnect/session-switch Python migration, background task recovery cleanup, voice/composer browser coverage, final V1/V2 visual audit, V2 naming cleanup, and reviewer sign-off.

### Verification
- `npm run test -- MessageTimeline.test.tsx` passed with 59 unit tests.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm run test:browser -- browser-tests/v2-stream-create-run.spec.ts` passed with 2 TS browser tests.
- `uv run --extra dev python -m py_compile tests/integration_tests/browser/test_v2_stream_recovery.py` passed after removing the migrated Python scenario.
- Main-agent screenshot inspection confirmed the copy affordance remains in the fixed shell and the browser test verifies clipboard text is the streamed answer, not the terminal status row.

### Reviewer
- Main-agent build, unit, TS browser, syntax, and screenshot verification completed for this stream copy terminal slice. No Message Timeline subsystem, AG-UI Runtime Stream subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Last-Event-ID Reconnect Migration Batch

### Scope
- Re-checked the frontend rewrite goal, the product parity checklist, and the remaining Python UI stream coverage before selecting this slice. The next highest-risk gap was still interrupted-stream recovery, especially reconnecting from browser SSE `Last-Event-ID` when the payload itself does not include `event_id`.
- Added TS browser coverage in `frontend/app/browser-tests/v2-stream-reconnect.spec.ts` that creates a real V2 run through the composer, emits a text delta whose cursor only exists in the SSE `lastEventId`, verifies the manual reconnect opens with `after_event_id=11`, replays the boundary chunk without duplication, renders the fresh `lastEventId=12` continuation, and restores the composer after terminal completion.
- Removed the migrated Python UI scenarios from `tests/integration_tests/browser/test_v2_stream_recovery.py` and `tests/integration_tests/browser/test_v2_shell_layout.py`, including the now-unused shell helper for payloads without `event_id`.
- Captured and inspected `.tmp/frontend-v2-ts-stream/v2-last-event-id-reconnect.png`; the screenshot shows the resumed stream inside the fixed V2 shell with the composer anchored and no document-level scrolling.
- Kept this as targeted AG-UI Runtime Stream / Interrupted Stream Recovery browser migration progress only. Remaining work still includes mock EventSource refresh/session-switch recovery migration, background task recovery cleanup, voice/composer browser coverage, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/v2-stream-reconnect.spec.ts` passed with 3 TS browser tests.
- `uv run --extra dev python -m py_compile tests/integration_tests/browser/test_v2_stream_recovery.py tests/integration_tests/browser/test_v2_shell_layout.py` passed after removing the migrated Python scenarios.
- Main-agent screenshot inspection confirmed the Last-Event-ID reconnect path remains inside the fixed shell, keeps only one boundary message, and renders the continuation before terminal completion.

### Reviewer
- Main-agent TS browser, syntax, and screenshot verification completed for this Last-Event-ID reconnect slice. No AG-UI Runtime Stream subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Stream Recovery Python Cleanup Batch

### Scope
- Re-checked the frontend rewrite goal and remaining Python UI stream coverage before editing, then selected the already-covered mock EventSource stream recovery scenarios so the browser suite keeps moving toward TS ownership without narrowing the product goal.
- Removed five migrated Python UI scenarios from `tests/integration_tests/browser/test_v2_stream_recovery.py`: active refresh replay, active run queue/interrupt/stop controls, latest-event reconnect, reconnect exhaustion, and non-text reconnect replay.
- Verified the removed scenarios are covered by stronger TS browser suites: `v2-stream-refresh.spec.ts`, `v2-stream-reconnect.spec.ts`, and real-SSE active/rich replay coverage in `v2-real-sse-stale-recovery.spec.ts`.
- Fixed a replay/terminal duplication bug found while validating the migration cleanup: closed runtime `output_delta` text was not compared against hydrated assistant text because the runtime entry text was the protocol event label, so terminal refresh could render the same resumed output twice. `MessageTimeline` now compares hydrated text against text extracted from runtime output parts.
- Added focused React coverage proving hydrated assistant text suppresses the already-closed runtime output text while preserving the existing behavior where a closed runtime answer remains visible if only the user prompt is hydrated.
- Rebuilt `frontend/dist/app` and inspected `.tmp/frontend-v2-ts-stream/v2-stream-tool-heavy-refresh-replay.png`; the screenshot shows a single resumed output row inside the fixed shell with the composer anchored.
- Remaining Python UI stream-recovery work is now limited to four scenarios in `test_v2_stream_recovery.py`: active session switch isolation, recoverable resume from checkpoint, background task collapse/stop, and background multiplex stream recovery.

### Verification
- `npm run test -- MessageTimeline.test.tsx` passed with 60 unit tests.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm run test:browser -- browser-tests/v2-stream-refresh.spec.ts browser-tests/v2-stream-reconnect.spec.ts` passed with 5 TS browser tests.
- `npm run test:browser -- browser-tests/v2-real-sse-stale-recovery.spec.ts -g "active run|rich real SSE replay"` passed with 3 TS browser tests.
- `uv run --extra dev python -m py_compile tests/integration_tests/browser/test_v2_stream_recovery.py` passed.
- `uv run --extra dev ruff check tests/integration_tests/browser/test_v2_stream_recovery.py` passed.

### Reviewer
- Main-agent build, unit, TS browser, syntax, lint, and screenshot verification completed for this stream-recovery cleanup slice. No AG-UI Runtime Stream subsystem, Message Timeline subsystem, browser-suite migration, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Stream Recovery File Removal Batch

### Scope
- Re-checked the frontend rewrite goal and the current Python UI browser scan before editing. The global gap is still V2 parity plus TS-owned browser coverage, not a one-off visual tweak.
- Mapped the final four scenarios in `tests/integration_tests/browser/test_v2_stream_recovery.py` to existing TS coverage: session-switch stream isolation, recoverable resume from checkpoint, background task recovery stop, and real-SSE background subagent multiplex recovery.
- Added the missing TS assertions before deleting the Python file: `v2-recovery.spec.ts` now verifies the recovered background task count, command, cwd, Hide/Show collapse behavior, and stop refresh; `v2-real-sse-stale-recovery.spec.ts` now verifies recovered background subagent streams leave the foreground composer in Send-only state with Stop, Queue, and Interrupt hidden.
- Removed `tests/integration_tests/browser/test_v2_stream_recovery.py` after the replacement coverage passed, completing the stream-recovery Python UI file migration instead of keeping duplicate `.py` browser ownership.
- Captured and inspected `.tmp/frontend-v2-ts-recovery/v2-background-task-stop-before.png`, `.tmp/frontend-v2-ts-recovery/v2-background-task-stop-after.png`, and `.tmp/frontend-v2-ts-stream/v2-real-sse-background-subagent-multiplex.png`; the screenshots show the recovery/task output inside the fixed shell, V1-shaped sidebar, anchored composer, and no document-level scroll.
- Remaining Python UI migration work is now concentrated in `tests/integration_tests/browser/test_v2_shell_layout.py`, which still covers broad shell, runtime, settings, workspace, model, board, connectors, observability, and responsive parity surfaces.

### Verification
- `npm run test:browser -- browser-tests/v2-session-switch-stream.spec.ts` passed with 1 TS browser test.
- `npm run test:browser -- browser-tests/v2-recovery.spec.ts` passed with 6 TS browser tests.
- `npm run test:browser -- browser-tests/v2-real-sse-stale-recovery.spec.ts -g "background subagent"` passed with 2 TS browser tests.
- `rg -n "def test_v2_" tests\integration_tests\browser` now shows V2 Python UI coverage only in `test_v2_shell_layout.py`.
- `npm run build` was not rerun because this slice only changed browser tests, deleted a Python browser test file, and updated the ledger; no frontend source or `frontend/dist` artifact changed.

### Reviewer
- Main-agent TS browser and screenshot verification completed for this stream-recovery file removal slice. No AG-UI Runtime Stream subsystem, browser-suite migration, V1/V2 visual parity, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Shell Parity Python Cleanup Batch

### Scope
- Re-checked the frontend rewrite goal, current worktree, and remaining V2 Python UI scan before editing. This slice targets broad V1/V2 product-shape parity that already has stronger TS browser ownership.
- Removed ten migrated Python UI scenarios from `tests/integration_tests/browser/test_v2_shell_layout.py`: V1/V2 route switching, message export, round rail detail, timeline image preview, primary sidebar module surfaces, workspace project view, V1 settings section grouping, appearance fixed-frame layout, narrow sidebar overlay layout, and observability scope/spec-lineage navigation.
- Verified those scenarios are covered by TS browser specs in `v2-route-switch.spec.ts`, `v2-message-export.spec.ts`, `v2-rounds.spec.ts`, `v2-image-preview.spec.ts`, `v2-shell-parity.spec.ts`, `v2-project-view.spec.ts`, `v2-appearance-layout.spec.ts`, and `v2-observability.spec.ts`.
- Kept V1 sidebar and settings-item parity explicit in TS: the sidebar test checks the V1 primary entries exactly, and the settings parity test checks the top-level sections exactly while keeping secondary System pages nested rather than flattened.
- Captured and inspected `.tmp/frontend-v2-ts-shell/v2-settings-system-parity.png`, `.tmp/frontend-v2-ts-appearance/v2-appearance-dark-rose-pine.png`, `.tmp/frontend-v2-ts-project-view/v2-project-view-files.png`, and `.tmp/frontend-v2-ts-appearance/v2-narrow-sidebar-overlay.png`; the screenshots show fixed shell framing, non-document scrolling, V1-shaped navigation, and nested settings/project surfaces.
- Remaining V2 Python UI coverage in `test_v2_shell_layout.py` is now 26 scenarios, concentrated around stream/recovery duplication, persisted subagent sessions, connector/automation/board/model/settings mutation flows, web/remote-workspace actions, and sidebar resizing.

### Verification
- `npm run test:browser -- browser-tests/v2-route-switch.spec.ts browser-tests/v2-message-export.spec.ts browser-tests/v2-rounds.spec.ts browser-tests/v2-image-preview.spec.ts browser-tests/v2-shell-parity.spec.ts browser-tests/v2-project-view.spec.ts browser-tests/v2-appearance-layout.spec.ts browser-tests/v2-observability.spec.ts` passed with 10 TS browser tests.
- `uv run --extra dev python -m py_compile tests/integration_tests/browser/test_v2_shell_layout.py` passed after deleting the migrated Python scenarios.
- `git diff --check` passed, with only the expected Windows line-ending warning.
- `rg -c "^def test_v2_" tests\integration_tests\browser\test_v2_shell_layout.py` reports 26 remaining V2 Python UI scenarios.

### Reviewer
- Main-agent TS browser, Python syntax, diff, and screenshot verification completed for this shell parity cleanup slice. No browser-suite migration, V1/V2 visual parity, subsystem sign-off, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Stream Recovery Shell Cleanup Batch

### Scope
- Re-checked the frontend rewrite goal, current worktree, and remaining `test_v2_shell_layout.py` V2 Python UI scan before editing. This slice targets the high-risk streaming, replay, recovery, and persisted subagent paths that were still duplicated in Python after TS browser coverage landed.
- Removed eleven migrated Python UI scenarios from `tests/integration_tests/browser/test_v2_shell_layout.py`: active stream refresh replay, transport reconnect from the latest event, terminal stream composer restore, tool-card replay after reconnect, recovery approval/question actions, retryable recovery action errors, stopped-run recovery resume, background subagent recovery stream, background task stop/refresh, persisted subagent stream resume, and persisted subagent terminal history refresh.
- Verified those scenarios are covered by TS browser specs in `v2-stream-refresh.spec.ts`, `v2-stream-reconnect.spec.ts`, `v2-stream-create-run.spec.ts`, `v2-recovery.spec.ts`, and `v2-subagent-session.spec.ts`.
- Captured and inspected `.tmp/frontend-v2-ts-stream/v2-stream-refresh-replay.png`, `.tmp/frontend-v2-ts-stream/v2-stream-tool-heavy-refresh-replay.png`, `.tmp/frontend-v2-ts-recovery/v2-recovery-actions.png`, and `.tmp/frontend-v2-ts-subagent-session/v2-subagent-session-completed.png`; the screenshots show fixed shell framing, anchored composer/recovery surfaces, timeline replay, and subagent session refresh without document-level scrolling.
- Remaining V2 Python UI coverage in `test_v2_shell_layout.py` is now 15 scenarios, concentrated around sidebar resizing and connectors, automation, board, plugins, hooks, roles, orchestration, model profile, web settings, and remote-workspace mutation flows.

### Verification
- `npm run test:browser -- browser-tests/v2-stream-refresh.spec.ts browser-tests/v2-stream-reconnect.spec.ts browser-tests/v2-stream-create-run.spec.ts browser-tests/v2-recovery.spec.ts browser-tests/v2-subagent-session.spec.ts` passed with 14 TS browser tests.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_v2_shell_layout.py` passed after deleting the migrated Python scenarios.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_v2_shell_layout.py` passed.
- `uv run --extra dev ruff format --check tests\integration_tests\browser\test_v2_shell_layout.py` passed.
- `rg -c "^def test_v2_" tests\integration_tests\browser\test_v2_shell_layout.py` reports 15 remaining V2 Python UI scenarios.

### Reviewer
- Main-agent TS browser, Python syntax, lint, format, and screenshot verification completed for this stream/recovery shell cleanup slice. No browser-suite migration, AG-UI Runtime Stream subsystem sign-off, persisted subagent subsystem sign-off, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Module Actions Migration Batch

### Scope
- Re-checked the frontend rewrite goal, current worktree, and remaining `test_v2_shell_layout.py` V2 Python UI scan before editing. This slice intentionally targeted low-coupling module action coverage so the global goal keeps moving without flattening settings/sidebar structure or mixing in broader appearance work.
- Added TS browser coverage in `frontend/app/browser-tests/v2-module-actions.spec.ts` for three migrated behaviors: sidebar mouse resize persistence across reload, Connectors runtime tool path copy plus managed PATH update, and Automation project enable/disable toggling through the real endpoints.
- Removed the three corresponding Python UI scenarios from `tests/integration_tests/browser/test_v2_shell_layout.py`.
- Captured and inspected `.tmp/frontend-v2-ts-module-actions/v2-sidebar-resize-reload.png`, `.tmp/frontend-v2-ts-module-actions/v2-runtime-tools-actions.png`, and `.tmp/frontend-v2-ts-module-actions/v2-automation-toggle-actions.png`; the screenshots show fixed shell framing, anchored composer or module content, V1-shaped sidebar entries, and no document-level scrolling.
- Remaining V2 Python UI coverage in `test_v2_shell_layout.py` is now 12 scenarios, concentrated around board sync/handoff/request/source settings, plugins/hooks/roles/orchestration settings mutations, model profile detail/create, web settings, and remote-workspace deletion.

### Verification
- `npm run test:browser -- browser-tests/v2-module-actions.spec.ts` passed with 3 TS browser tests.
- `npm run lint` passed for the frontend TypeScript project.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_v2_shell_layout.py` passed after deleting the migrated Python scenarios.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_v2_shell_layout.py` passed.
- `uv run --extra dev ruff format --check tests\integration_tests\browser\test_v2_shell_layout.py` passed.
- `git diff --check` passed, with only the expected Windows line-ending warning for the touched Python file.
- `rg -n "^def test_v2_" tests\integration_tests\browser\test_v2_shell_layout.py` reports 12 remaining V2 Python UI scenarios.

### Reviewer
- Main-agent TS browser, frontend typecheck, Python syntax, lint, format, diff, and screenshot verification completed for this module action migration slice. No browser-suite migration, module mutation subsystem sign-off, V1/V2 visual parity sign-off, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Board Actions Migration Batch

### Scope
- Re-checked the frontend rewrite goal, current worktree, and remaining `test_v2_shell_layout.py` V2 Python UI scan before editing. This slice targeted the Board workflow because it is a user-visible V1 workflow with multiple non-placeholder actions and clear backend contracts.
- Added TS browser coverage in `frontend/app/browser-tests/v2-board-actions.spec.ts` for Board sync, board TODO handoff preview/start, review request-changes preview/submit, and Board source edit/create/delete.
- Removed the four corresponding Python UI scenarios from `tests/integration_tests/browser/test_v2_shell_layout.py`.
- Captured and inspected `.tmp/frontend-v2-ts-board-actions/v2-board-sync.png`, `.tmp/frontend-v2-ts-board-actions/v2-board-handoff-started.png`, `.tmp/frontend-v2-ts-board-actions/v2-board-request-changes.png`, and `.tmp/frontend-v2-ts-board-actions/v2-board-source-settings.png`; the screenshots show Board columns and the source drawer inside the fixed shell, with V1-shaped sidebar navigation and no document-level scrolling.
- Remaining V2 Python UI coverage in `test_v2_shell_layout.py` is now 8 scenarios, concentrated around plugins/hooks/roles/orchestration settings mutations, model profile detail/create, web settings, and remote-workspace deletion.

### Verification
- `npm run test:browser -- browser-tests/v2-board-actions.spec.ts` passed with 4 TS browser tests.
- `npm run lint` passed for the frontend TypeScript project.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_v2_shell_layout.py` passed after deleting the migrated Python scenarios.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_v2_shell_layout.py` passed.
- `uv run --extra dev ruff format --check tests\integration_tests\browser\test_v2_shell_layout.py` passed.
- `git diff --check` passed, with only the expected Windows line-ending warning for the touched Python file.
- `rg -n "^def test_v2_" tests\integration_tests\browser\test_v2_shell_layout.py` reports 8 remaining V2 Python UI scenarios.

### Reviewer
- Main-agent TS browser, frontend typecheck, Python syntax, lint, format, diff, and screenshot verification completed for this Board action migration slice. No Board subsystem sign-off, browser-suite migration sign-off, V1/V2 visual parity sign-off, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Settings Actions Migration Batch

### Scope
- Re-checked the frontend rewrite goal, current worktree, and remaining `test_v2_shell_layout.py` V2 Python UI scan before editing. This slice targeted settings mutation flows while preserving the V1 top-level/secondary-page information architecture.
- Added TS browser coverage in `frontend/app/browser-tests/v2-settings-actions.spec.ts` for Plugins enable/disable/update/delete under the System secondary page, Hooks validate/save under the System secondary page, Roles validate/delete/create, and Orchestration set-default/delete/create.
- Removed the four corresponding Python UI scenarios from `tests/integration_tests/browser/test_v2_shell_layout.py`.
- Captured and inspected `.tmp/frontend-v2-ts-settings-actions/v2-plugin-actions.png`, `.tmp/frontend-v2-ts-settings-actions/v2-hooks-editor-save.png`, `.tmp/frontend-v2-ts-settings-actions/v2-roles-create-save.png`, and `.tmp/frontend-v2-ts-settings-actions/v2-orchestration-create-save.png`; the screenshots show the settings dialog inside the fixed shell, System secondary pages still nested, and no document-level scrolling.
- Remaining V2 Python UI coverage in `test_v2_shell_layout.py` is now 4 scenarios: model profile detail save/test, model profile catalog create, Web settings save/error feedback, and remote workspace delete confirmation.

### Verification
- `npm run test:browser -- browser-tests/v2-settings-actions.spec.ts` passed with 4 TS browser tests.
- `npm run lint` passed for the frontend TypeScript project.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_v2_shell_layout.py` passed after deleting the migrated Python scenarios.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_v2_shell_layout.py` passed.
- `uv run --extra dev ruff format --check tests\integration_tests\browser\test_v2_shell_layout.py` passed.
- `git diff --check` passed, with only the expected Windows line-ending warning for the touched Python file.
- `rg -n "^def test_v2_" tests\integration_tests\browser\test_v2_shell_layout.py` reports 4 remaining V2 Python UI scenarios.

### Reviewer
- Main-agent TS browser, frontend typecheck, Python syntax, lint, format, diff, and screenshot verification completed for this settings action migration slice. No Settings subsystem sign-off, browser-suite migration sign-off, V1/V2 visual parity sign-off, or V2 frontend completion is claimed.

## 2026-06-26 V2 TS Browser Settings Model/Web/Workspace Migration Batch

### Scope
- Re-checked the frontend rewrite goal, product parity checklist, quality gates, current worktree, and remaining `test_v2_shell_layout.py` scan before editing. The selected slice closes the last Python-owned V2 shell browser scenarios while staying aligned with the broader Settings parity target.
- Extended `frontend/app/browser-tests/v2-settings-actions.spec.ts` with TS browser coverage for model profile test/save, model catalog profile creation, Web settings save/error feedback, and remote workspace SSH delete confirmation.
- Preserved the V1 information architecture: Models, Web, and Remote workspace remain normal top-level Settings entries, while Plugins and Hooks remain under the System secondary page from the prior settings-action slice.
- Removed `tests/integration_tests/browser/test_v2_shell_layout.py` after the replacement TS browser scenarios passed; `rg -n "^def test_v2_" tests/integration_tests/browser` now reports no V2 Python UI test functions.
- While checking screenshots, found that Web save failure feedback was too easy to miss in visual evidence. Added a stable inline error `Alert` to `WebSettingsSection` while keeping the existing toast, so the form has a durable error state that satisfies the Settings quality gate.
- Captured and inspected `.tmp/frontend-v2-ts-settings-actions/v2-model-profile-detail.png`, `.tmp/frontend-v2-ts-settings-actions/v2-model-profile-catalog-picker.png`, `.tmp/frontend-v2-ts-settings-actions/v2-model-profile-catalog-create.png`, `.tmp/frontend-v2-ts-settings-actions/v2-web-settings-error.png`, and `.tmp/frontend-v2-ts-settings-actions/v2-remote-workspace-delete.png`; the screenshots show fixed shell framing, visible Web error feedback, closed remote-workspace delete confirmation after success, and no document-level scrolling.
- Kept this as browser-suite migration and Settings error-state progress only. The full frontend rewrite still needs broader V1/V2 visual audit, subsystem reviewer sign-off, Electron release gates, stream/replay edge-case hardening, naming cleanup, and final parity matrix completion.

### Verification
- `npm run test -- src/test/SettingsDrawer.test.tsx -t "saves web settings"` passed with 1 selected React test.
- `npm run build` passed, including frontend typecheck, desktop typecheck/build, and Vite production build for `frontend/dist/app`.
- `npm run test:browser -- browser-tests/v2-settings-actions.spec.ts` passed with 8 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- Reviewer Hegel additionally ran `npm run test:browser -- browser-tests/v2-shell-parity.spec.ts`; it passed with 2 TS browser tests.
- `rg -n "^def test_v2_" tests\integration_tests\browser` reports no V2 Python UI test functions.
- `rg -n "test_v2_shell_layout|_V2ShellBackend|_serve_v2_app" tests frontend -g "*.py" -g "*.ts" -g "*.tsx"` reports no code references to the deleted Python fixture.
- `git diff --check` passed, with only the expected Windows line-ending warnings.

### Reviewer
- Hegel returned PASS for this Settings model/web/workspace migration slice. Review findings: no blocker; `WebSettingsSection` inline `Alert` is appropriate and does not replace the toast; `frontend/dist/app` points at the rebuilt asset; deleting `test_v2_shell_layout.py` is justified by the replacement TS browser coverage and no active references remain.
- Main-agent build, TS browser, frontend lint/typecheck, deletion scan, screenshot verification, and reviewer follow-up cleanup completed for this slice. No full Settings subsystem completion, full browser-suite migration sign-off, V1/V2 visual parity sign-off, or V2 frontend completion is claimed.

## 2026-06-26 Message Copy Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, current worktree, and remaining migration notes before selecting this slice. The immediate gap is now broader TS ownership of old browser UI tests, not another isolated visual tweak.
- Added `frontend/app/browser-tests/message-copy-actions.spec.ts` to migrate the six browser harness scenarios for latest-answer copy, stable streaming-copy gating, detached history mount sync, round-intent copy buttons, round-intent overlay hit testing, and round timeline scroll-anchor preservation.
- Reused the existing TS Playwright frontend static server instead of the removed Python `sync_playwright` harness, so this browser coverage now lives with the rest of the frontend app browser tests.
- Removed `tests/integration_tests/browser/test_message_copy_actions.py` after the replacement TS browser scenarios passed.
- Kept this as targeted Message Timeline / Rounds browser-suite migration progress only. Remaining work still includes legacy voice/composer Python browser coverage, broader old Python UI module migration, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/message-copy-actions.spec.ts` passed with 6 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `rg -n "test_message_copy_actions|message_copy_actions|round_intent_controls" tests frontend -g "*.py" -g "*.ts" -g "*.tsx"` reports no lingering old Python harness references.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, deletion scan, and test-results cleanup completed for this slice. No Message Timeline subsystem sign-off, Rounds subsystem sign-off, full browser-suite migration sign-off, or V2 frontend completion is claimed.

## 2026-06-26 Voice Input Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal after the message-copy migration and selected the next old browser UI test file by global risk: voice/composer behavior spans microphone permissions, streaming WebSocket state, audio chunking, keyboard hold-to-talk, and composer action layout.
- Added `frontend/app/browser-tests/voice-input-audio.spec.ts` to migrate the nine browser scenarios from the Python harness: PCM byte streaming, silence auto-stop, space-hold suppression, persistent backpressure shutdown, finalize-timeout close, sample-rate negotiation, hidden voice control without STT config, audio worklet chunking, and composer action non-overlap in normal/new-session layouts.
- Kept the coverage behavior-focused and did not change sidebar/settings information architecture or product UI structure.
- Removed `tests/integration_tests/browser/test_voice_input_audio.py` after the TS replacement passed.
- Kept this as targeted voice/composer browser-suite migration progress only. Remaining work still includes broader old Python UI/browser module migration, stream timeline harness migration, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/voice-input-audio.spec.ts` passed with 9 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, and cleanup completed for this slice. No Composer subsystem sign-off, voice input subsystem sign-off, full browser-suite migration sign-off, or V2 frontend completion is claimed.

## 2026-06-26 Streaming Timeline Text/Tool Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, current worktree, and remaining Python browser-test surface before editing. This slice selected the highest-risk remaining old browser harness area: message timeline stream/replay semantics.
- Added `frontend/app/browser-tests/streaming-message-timeline.spec.ts` with TS browser coverage for the first ten migrated `test_streaming_message_timeline.py` scenarios: live text around tool calls, overlay replay text/tool segmentation, model-step boundary segmentation and whitespace preservation, output-delta text segmentation, persisted history segmentation, partial persisted repeated text, rich markdown update cursor preservation, streamed-vs-persisted tool args parity, and completed tool summary visual weight.
- Removed the corresponding ten Python browser scenarios from `tests/integration_tests/browser/test_streaming_message_timeline.py`; 36 Python scenarios remain in that file, concentrated around session switching, overlay dedupe, missing tool-call IDs, thinking replay, terminal transcript projection, and subagent layout.
- Kept this as targeted Message Timeline / AG-UI stream browser-suite migration progress only. Remaining work still includes finishing the stream timeline harness migration, broader old Python UI/browser module migration, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/streaming-message-timeline.spec.ts` passed with 10 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_streaming_message_timeline.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_streaming_message_timeline.py` passed.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, Python syntax/lint, and cleanup completed for this slice. No Message Timeline subsystem sign-off, AG-UI Runtime Stream subsystem sign-off, full browser-suite migration sign-off, or V2 frontend completion is claimed.

## 2026-06-26 Streaming Timeline Tool/Thinking Cleanup Harness TS Migration Batch

### Scope
- Continued the `test_streaming_message_timeline.py` migration by selecting the next coherent browser-harness group: empty active thinking overlays, missing tool-call IDs, repeated/unfinished thinking replay, and run stream cleanup dedupe.
- Extended `frontend/app/browser-tests/streaming-message-timeline.spec.ts` with TS browser coverage for seven migrated scenarios that exercise real overlay replay, missing-id tool matching, thinking prefix merge behavior, and `clearRunStreamState` event-dedupe reset.
- Removed the corresponding seven Python browser scenarios from `tests/integration_tests/browser/test_streaming_message_timeline.py`; 24 Python scenarios remain in that file, now concentrated around output/media refs, terminal transcript projection, and subagent stream/layout behavior.
- Kept this as targeted Message Timeline / AG-UI stream browser-suite migration progress only. Remaining work still includes finishing the stream timeline harness migration, broader old Python UI/browser module migration, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/streaming-message-timeline.spec.ts` passed with 22 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_streaming_message_timeline.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_streaming_message_timeline.py` passed.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, Python syntax/lint, and cleanup completed for this slice. No Message Timeline subsystem sign-off, AG-UI Runtime Stream subsystem sign-off, full browser-suite migration sign-off, or V2 frontend completion is claimed.

## 2026-06-26 Streaming Timeline Session Overlay Harness TS Migration Batch

### Scope
- Continued the `test_streaming_message_timeline.py` migration by selecting the next coherent browser-harness group: session switching, primary alias dedupe, repeated switch stress, partial thinking replay dedupe, and concurrent direct stream isolation.
- Extended `frontend/app/browser-tests/streaming-message-timeline.spec.ts` with TS browser coverage for five migrated scenarios that exercise real `applyStreamOverlayEvent`, direct stream state, thinking-block lifecycle, history replay, and stream finalization paths.
- Removed the corresponding five Python browser scenarios from `tests/integration_tests/browser/test_streaming_message_timeline.py`; 31 Python scenarios remain in that file, now concentrated around missing tool-call IDs, thinking replay prefixes, run cleanup/media refs, terminal transcript projection, and subagent layout.
- Kept this as targeted Message Timeline / AG-UI stream browser-suite migration progress only. Remaining work still includes finishing the stream timeline harness migration, broader old Python UI/browser module migration, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/streaming-message-timeline.spec.ts` passed with 15 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_streaming_message_timeline.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_streaming_message_timeline.py` passed.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, Python syntax/lint, and cleanup completed for this slice. No Message Timeline subsystem sign-off, AG-UI Runtime Stream subsystem sign-off, full browser-suite migration sign-off, or V2 frontend completion is claimed.

## 2026-06-26 Streaming Timeline Media/Terminal Overlay Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, current worktree, and remaining `test_streaming_message_timeline.py` browser-test surface before editing. This slice keeps attention on the broader stream/replay parity goal while avoiding another unrelated UI detour.
- Extended `frontend/app/browser-tests/streaming-message-timeline.spec.ts` with TS browser coverage for five migrated scenarios: output-delta overlay streaming cursor state, finalized media-ref overlay dedupe, older media-ref reuse while a newer overlay is active, terminal event dedupe reset after a terminal run event, and stopped-session replay dedupe against persisted history.
- Removed the corresponding five Python browser scenarios from `tests/integration_tests/browser/test_streaming_message_timeline.py`; 19 Python scenarios remain in that file, now concentrated around thinking placement/late rebind, randomized stream pressure, subagent switching/layout, and terminal transcript projection.
- Kept this as targeted Message Timeline / AG-UI stream browser-suite migration progress only. Remaining work still includes finishing the stream timeline harness migration, broader old Python UI/browser module migration, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/streaming-message-timeline.spec.ts` passed with 27 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_streaming_message_timeline.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_streaming_message_timeline.py` passed.
- `rg -n "^def test_|^async def test_" tests\integration_tests\browser\test_streaming_message_timeline.py` reports 19 remaining Python browser scenarios.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, Python syntax/lint, remaining-scenario scan, and cleanup completed for this slice. No Message Timeline subsystem sign-off, AG-UI Runtime Stream subsystem sign-off, full browser-suite migration sign-off, or V2 frontend completion is claimed.

## 2026-06-26 Streaming Timeline Python Harness Removal Batch

### Scope
- Re-checked the active frontend rewrite goal, current worktree, and the remaining 13 `test_streaming_message_timeline.py` browser scenarios before editing. This slice finished the stream timeline browser harness migration instead of leaving a mixed Python/TS ownership boundary.
- Extended `frontend/app/browser-tests/streaming-message-timeline.spec.ts` with TS browser coverage for the remaining stream timeline scenarios: subagent switch-back thinking order, stale thinking gap removal, running subagent compact history DOM, terminal completed overlay grouping, terminal payload final output rendering and dedupe, terminal history final-output projection, live/history terminal transcript parity for main and subagent runs, completed subagent status-only transcript processing, final-output collapse matrix, subagent session width stability, and subagent round-navigator suppression.
- Deleted `tests/integration_tests/browser/test_streaming_message_timeline.py` after the replacement TS browser scenarios passed. The stream timeline browser harness now lives in TS with 46 scenarios.
- Kept this as targeted Message Timeline / AG-UI stream browser-suite migration progress only. Remaining frontend rewrite work still includes broader old Python browser module migration, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/streaming-message-timeline.spec.ts` passed with 46 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `rg -n "test_streaming_message_timeline|stream_timeline_harness|__streamTimelineHarnessReady" tests frontend -g "*.py" -g "*.ts" -g "*.tsx"` reports no lingering old Python harness references.
- `rg -n "sync_playwright|playwright\.sync_api" tests\integration_tests\browser -g "*.py"` still reports other legacy Python browser files (`test_github_browser_flow.py`, `test_clawhub_browser_flow.py`, `test_browser_smoke.py`, and `test_backend_status_pressure.py`), so full Python browser migration remains open.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, deletion scan, remaining Python browser scan, and cleanup completed for this slice. No Message Timeline subsystem sign-off, AG-UI Runtime Stream subsystem sign-off, full browser-suite migration sign-off, or V2 frontend completion is claimed.

## 2026-06-26 Streaming Timeline Rebind/Subagent Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, current worktree, and remaining `test_streaming_message_timeline.py` browser-test surface before editing. This slice targeted stream/subagent rebind behavior because it directly affects interrupted-stream recovery, replay recovery, and session-switch correctness.
- Extended `frontend/app/browser-tests/streaming-message-timeline.spec.ts` with TS browser coverage for six migrated scenarios: unpersisted thinking overlay placement after history, late tool-call rebind after container rerender, randomized stream-switch pressure across 18 containers and 216 tool blocks, visible subagent overlay switch-back order, subagent render binding after switch-back, and preventing agent deltas from appending to the user prompt during stream rebind.
- Removed the corresponding six Python browser scenarios from `tests/integration_tests/browser/test_streaming_message_timeline.py`; 13 Python scenarios remain in that file, now concentrated around subagent thinking order, running subagent compaction, terminal transcript projection, final-output collapse rules, and subagent layout.
- Kept this as targeted Message Timeline / AG-UI stream browser-suite migration progress only. Remaining work still includes finishing the stream timeline harness migration, broader old Python UI/browser module migration, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/streaming-message-timeline.spec.ts` passed with 33 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_streaming_message_timeline.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_streaming_message_timeline.py` passed.
- `rg -n "^def test_|^async def test_" tests\integration_tests\browser\test_streaming_message_timeline.py` reports 13 remaining Python browser scenarios.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, Python syntax/lint, remaining-scenario scan, and cleanup completed for this slice. No Message Timeline subsystem sign-off, AG-UI Runtime Stream subsystem sign-off, full browser-suite migration sign-off, or V2 frontend completion is claimed.
