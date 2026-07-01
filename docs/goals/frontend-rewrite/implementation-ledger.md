# Frontend Rewrite Implementation Ledger

This file tracks implementation evidence for the React/Ant Design migration goal without changing the source goal documents.

## 2026-07-01 Image Preview Python Harness Removal

### Scope
- Re-checked the frontend rewrite goal's TS browser migration requirement and selected the remaining `tests/unit_tests/frontend/test_image_preview_ui.py` harness because it only asserted old `frontend/dist/js` and static CSS strings.
- Removed that Python UI harness after verifying V2 image preview behavior is owned by React/Playwright evidence: persisted `media_ref` image rendering, visible inline image/caption, Ant Image preview overlay open/close, fixed shell framing, and component coverage for persisted/runtime/workspace/non-image media references.
- Kept `MSG-06` and cleanup work open; this removes one stale V1/static proof path, not the broader media/V1 visual sign-off or all remaining Python UI harnesses.

### Verification
- `npm run test:browser -- v2-image-preview.spec.ts --project=chromium` passed.
- `npm test -- src/test/MessageTimeline.test.tsx -t "image media references|workspace image previews|media_ref previews|non-image media references|runtime output_delta media_ref"` passed with focused media preview coverage.
- `rg -n "test_image_preview_ui|imagePreview.js|initializeImagePreview" tests frontend/app/src frontend/app/browser-tests` returned no remaining references to the removed legacy harness or old V1 image-preview bootstrap.

### Reviewer
- Main-agent inspection confirmed the removed Python file targeted old `frontend/dist/js/components/imagePreview.js` and old layout/component CSS, while the TS browser test exercises the current built `/app/` V2 timeline and actual preview overlay.

## 2026-07-01 Appearance Page Browser Evidence

### Scope
- Re-checked `SET-02` after comparing the current page shape against the user-provided Appearance references.
- Added packed `/app/` browser coverage for the light theme appearance page, including the full V1-target control inventory, GitHub preset application, root CSS variable updates, fixed settings shell framing, and the preset dropdown open state.
- Fixed the preset dropdown so it scrolls inside the settings drawer instead of extending past the drawer bottom on a 1280x720 desktop viewport.
- Kept `SET-02` at `In progress`; this round adds real browser evidence and fixes the menu overflow, but does not replace final V1 paired visual sign-off or browser coverage for import/copy/reset file and clipboard flows.

### Verification
- `npm run build` passed.
- `npm run test:browser -- v2-appearance-layout.spec.ts --project=chromium` passed with 3 Chromium tests.
- `npm test -- src/test/SettingsDrawer.test.tsx -t "appearance"` passed with 3 focused tests. Vitest emitted the existing jsdom pseudo-element `getComputedStyle` warnings.
- `npm test -- src/test/ShellLayoutCss.test.ts -t "appearance"` passed with 1 focused test.
- Browser screenshot artifacts inspected:
  - `.tmp/frontend-v2-ts-appearance/v2-appearance-light-github.png`
  - `.tmp/frontend-v2-ts-appearance/v2-appearance-light-preset-menu.png`
  - `.tmp/frontend-v2-ts-appearance/v2-appearance-dark-rose-pine.png`

### Reviewer
- Main-agent screenshot inspection confirmed the Appearance page keeps the three theme previews, diff preview, table-form controls, and preset menu inside the settings drawer. The menu now fits within the drawer and scrolls internally instead of running below the viewport.

## 2026-07-01 Real SSE Subagent Stdout Cadence

### Scope
- Re-checked the matrix rows that were still calling out subagent stdout cadence as a gap: `MSG-02`, `STREAM-02`, and `SUB-01`.
- Added a packed `/app/` browser scenario that uses a real HTTP `text/event-stream` response with delayed `response.write(...)` chunks for a running subagent stdout flow. This is not a component mock and not a synchronous fixture dump; the browser receives separate SSE writes over time.
- Preserved closed subagent runtime text rows during terminal history hydration when the hydrated row is just the same final stdout text. This keeps the typewriter catch-up visible, prevents a terminal jump to a fully hydrated row, and avoids replay duplicates in the right-side subagent panel.
- Verified that the parent `.at-chat-view` stays clean while the right-side subagent panel shows the prompt, running/completed state, incremental stdout text, and replayed final output.
- Kept final V1 sign-off open; this closes the real HTTP SSE stdout cadence slice, not full production-backend manual orchestration coverage or broad V1 visual parity.

### Verification
- `npm run build` passed.
- `npm run test:browser -- v2-real-sse-stale-recovery.spec.ts --project=chromium -g "subagent stdout"` passed with 1 Chromium test.
- `npm test -- src/test/MessageTimeline.test.tsx` passed with 151 tests.
- `npm test -- src/test/SubagentSessionView.test.tsx` passed with 21 tests.
- `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium` passed with 10 Chromium tests.
- `npm run test:browser -- v2-real-sse-stale-recovery.spec.ts --project=chromium -g "rich real SSE|background subagent|background-subagent|per-run cursors"` passed with 5 Chromium tests.
- `npm run test:browser -- v2-real-sse-stale-recovery.spec.ts --project=chromium` passed with 18 Chromium tests.
- `npm run lint` passed.
- Browser screenshot artifacts inspected:
  - `.tmp/frontend-v2-ts-stream/v2-real-sse-subagent-stdout-mid-stream.png`
  - `.tmp/frontend-v2-ts-stream/v2-real-sse-subagent-stdout-replay.png`

### Reviewer
- Mid-stream screenshot inspection confirmed the right panel shows the subagent title, prompt, `running` status, partial stdout with the streaming cursor, and no child stdout in the parent timeline.
- Replay screenshot inspection confirmed the right panel shows `completed`, full stdout once, no stale cursor, and the parent timeline still contains only the parent prompt plus the subagent tool card.

## 2026-07-01 Skills Browser And Component Evidence Sweep

### Scope
- Re-checked the closure matrix and selected `PAGE-02` because Skills was still `Not checked` while it is a primary V1 surface.
- Added a dedicated packed `/app/` browser spec for the Skills surface: primary-nav entry, ClawHub market browse/search, market detail drawer, install payload, installed-skill list, installed detail drawer, user-skill uninstall confirmation, skills reload, and ClawHub token probe/save.
- Inspected generated screenshots for market, installed detail, and ClawHub settings. The installed detail evidence now captures the actual `Skill detail` drawer instead of a full-page frame that missed the drawer.
- Stabilized the existing saved-token ClawHub settings component test with a scoped 10 second timeout after confirming the behavior passes under a longer single-test run; the full suite now passes without broadening global timeout.
- Kept `PAGE-02` at `In progress`; this round adds V2 browser/component evidence, not final V1 screenshot/DOM pairing, loading/error browser states, market install/probe failure states, pagination beyond one page, or narrow-density sign-off.

### Verification
- `npm run test:browser -- v2-skills-view.spec.ts --project=chromium` passed with 1 Chromium test.
- `npm test -- src/test/SkillsView.test.tsx` passed with 8 tests. Vitest emitted the existing jsdom pseudo-element `getComputedStyle` environment warnings.
- `npm run lint` passed.
- Browser screenshot artifacts inspected:
  - `.tmp/frontend-v2-ts-skills/v2-skills-market.png`
  - `.tmp/frontend-v2-ts-skills/v2-skills-installed-detail.png`
  - `.tmp/frontend-v2-ts-skills/v2-skills-clawhub-settings.png`

### Reviewer
- Main-agent screenshot inspection confirmed the Skills page remains inside the fixed shell, market and installed cards are readable, the installed detail drawer shows manifest and file metadata, and ClawHub settings probe/save controls render inside the right drawer. Remaining before verification: V1 screenshot/DOM comparison, loading/error browser states, failure-state coverage for install/probe, multi-page market pagination, and compact-width density review.

## 2026-07-01 Automation Browser And Component Evidence Sweep

### Scope
- Re-checked the closure matrix and selected `PAGE-01` because Automation was still `Not checked` while it is a primary V1 surface.
- Ran the packed `/app/` browser automation action path: sidebar navigation, project list/detail rendering, enable/disable endpoints, create modal with workspace, schedule, delivery target, delivery events, created-project detail, Run now session handoff, and delete confirmation.
- Inspected the generated screenshots and confirmed the Automation surface stays inside the fixed shell and exposes list, detail, create, delivery, run, enable/disable, and delete controls without falling back to placeholder content.
- Fixed the stale `AutomationView.test.tsx` API mock for `listAutomationDeliveryBindings`, then expanded the fixture to cover a project-level Xiaoluban delivery binding and the run-now workspace-aware session callback.
- Kept `PAGE-01` at `In progress`; this round adds V2 browser/component evidence, not final V1 screenshot/DOM pairing, loading/error browser states, monitor/follow-up workflow inventory, or narrow-density sign-off.

### Verification
- `npm run test:browser -- v2-module-actions.spec.ts --project=chromium -g "automation"` passed with 2 Chromium tests.
- `npm test -- src/test/AutomationView.test.tsx` passed with 4 tests.
- Browser screenshot artifacts inspected:
  - `.tmp/frontend-v2-ts-module-actions/v2-automation-toggle-actions.png`
  - `.tmp/frontend-v2-ts-module-actions/v2-automation-create-xiaoluban-dialog.png`
  - `.tmp/frontend-v2-ts-module-actions/v2-automation-create-detail.png`

### Reviewer
- Main-agent screenshot inspection confirmed the Automation page is a real in-shell surface with project list/detail, create modal, delivery target selection, status actions, run handoff, and delete flow visible. Remaining before verification: V1 screenshot/DOM comparison, loading/error browser evidence, monitor/follow-up workflow parity, and compact-width density review.

## 2026-07-01 Observability Browser Evidence Sweep

### Scope
- Re-checked the closure matrix and selected `PAGE-07` because Observability was still `Not checked` while it is a primary V1 sidebar/top-bar surface.
- Ran the existing packed `/app/` browser spec instead of relying on component assumptions: top-bar navigation, global/session scope switch, metric summary cards, trend buckets, breakdown tables, gateway signals/breakdowns, spec lineage, direct task lineage URL loading, and empty/error states.
- Inspected each generated screenshot and confirmed the Observability surface stays inside the fixed shell, charts/tables/lineage render in-page, and empty/error states do not fall back to chat timeline content.
- Kept `PAGE-07` at `In progress`; this round adds current V2 browser evidence, not final V1 screenshot/DOM pairing, event-specific V1 inventory, loading-state capture, or narrow-density sign-off.

### Verification
- `npm run test:browser -- v2-observability.spec.ts --project=chromium` passed with 3 Chromium tests.
- `npm test -- src/test/SpecLineagePanel.test.tsx` passed with 2 tests. Vitest emitted the existing jsdom pseudo-element `getComputedStyle` environment warning.
- Browser screenshot artifacts inspected:
  - `.tmp/frontend-v2-ts-observability/v2-observability-session.png`
  - `.tmp/frontend-v2-ts-observability/v2-observability-trends.png`
  - `.tmp/frontend-v2-ts-observability/v2-observability-gateway.png`
  - `.tmp/frontend-v2-ts-observability/v2-observability-spec-lineage.png`
  - `.tmp/frontend-v2-ts-observability/v2-observability-trends-empty.png`
  - `.tmp/frontend-v2-ts-observability/v2-observability-trends-error.png`
  - `.tmp/frontend-v2-ts-observability/v2-spec-lineage-direct-task.png`

### Reviewer
- Main-agent screenshot inspection confirmed the V2 Observability page renders metrics, trends, gateway data, lineage, empty states, and error states inside the fixed shell without document-level scroll drift. Remaining before verification: V1 screenshot/DOM comparison, loading-state browser evidence, event-panel inventory if V1 has a distinct event view, and compact-width density review.

## 2026-07-01 Streaming Typewriter And Subagent Prompt Pass

### Scope
- Re-checked the closure matrix and focused this round on the P0 timeline/subagent gaps the browser screenshots exposed: empty thinking cards, child-stream prompt loss, subagent output leaking or going stale across live/terminal/replay, and stream chunks arriving as abrupt whole sentences.
- Added a presentation-layer typewriter buffer for live text rows. Runtime state still stores the exact SSE payload, but production UI now reveals large incoming chunks progressively while unit tests keep deterministic immediate rendering.
- Treated whitespace-only or structurally empty thinking deltas as internal stream noise, so live and replay no longer show empty `Thinking` cards or fallback strings like missing-text diagnostics. Malformed payload diagnostics are still visible.
- Promoted subagent prompt text from tool-call metadata into the subagent panel state, persisted it across the open-panel localStorage path, and preserved it when authoritative subagent records hydrate IDs/status. The right panel shows the prompt during live waiting/streaming without flattening completed replay content.
- Extended the subagent browser stream test to sample a large first delta before it finishes revealing, append a second delta into the same live row, close the stream before final history refill, verify parent timeline isolation, and then verify hard-refresh restoration.
- Kept the affected rows at `In progress`; this is a focused normal-mode/mock-SSE pass, not final real-backend/orchestration/V1 visual sign-off.

### Verification
- `npm test -- MessageTimeline.test.tsx` passed with 148 tests.
- `npm test -- SubagentSessionView.test.tsx` passed with 19 tests.
- `npm test -- AppShell.test.tsx SessionsSidebar.test.tsx` passed with 67 tests.
- `npm test -- ShellLayoutCss.test.ts` passed with 19 tests.
- `npm run build` passed.
- `npm run lint` passed.
- `npm run test:browser -- v2-subagent-session.spec.ts` passed with 5 Chromium tests.
- Browser screenshot artifacts inspected:
  - `.tmp/frontend-v2-ts-subagent-session/v2-subagent-incremental-stream-before-refill.png`
  - `.tmp/frontend-v2-ts-subagent-session/v2-subagent-hard-refresh-restored.png`

### Reviewer
- Main-agent browser inspection confirmed child text remains in the right subagent panel through live and delayed terminal refill, does not appear in `.at-chat-view`, terminal state removes the running spinner/badge state, hard refresh restores the subagent panel with only the persisted child answer, and composer/sidebar stay inside the fixed shell. Remaining before verification: real backend stream sampling, orchestration-mode subagents, live subagent prompt screenshot before terminal close, and broader tool/thinking-heavy session comparisons.

## 2026-07-01 Memory Surface Browser Coverage

### Scope
- Re-checked the closure matrix and selected `PAGE-06` because Memory was still marked `Not checked` while it is a primary V1 sidebar surface.
- Added a dedicated `/app/` Playwright path for the V2 Memory surface: sidebar navigation, workspace-scoped list loading, row/detail selection, active/default filtering, search request body validation, matched snippet rendering, empty search state, superseded status filtering, rebuild-index action, and success alert.
- Verified the page inside the fixed shell rather than a component-only render; screenshots cover selected detail, search hit, empty search, and rebuild success.
- Kept `PAGE-06` at `In progress`; this slice adds V2 browser evidence and screenshot inspection, not final V1 visual/DOM pairing, V1 edit/delete confirmation, loading/error browser captures, or narrow-density sign-off.

### Verification
- `npm run test:browser -- v2-memory-view.spec.ts --project=chromium` passed.
- `npm run test -- src/test/MemoryView.test.tsx` passed with 3 tests.
- Browser screenshot artifacts inspected:
  - `.tmp/frontend-v2-ts-memory/v2-memory-selected-detail.png`
  - `.tmp/frontend-v2-ts-memory/v2-memory-search-hit.png`
  - `.tmp/frontend-v2-ts-memory/v2-memory-empty-search.png`
  - `.tmp/frontend-v2-ts-memory/v2-memory-rebuild-result.png`

### Reviewer
- Main-agent browser inspection confirmed the Memory surface stays in the fixed shell, search does not leave stale rows or details, the selected detail follows row selection/filter changes, empty search removes the detail pane, and rebuild results render in place. Remaining before verification: V1 screenshot/DOM comparison, loading/error browser states, V1 edit/delete behavior if present, and narrow viewport density review.

## 2026-07-01 Connectors Surface Browser Coverage

### Scope
- Re-checked the closure matrix and selected `PAGE-05` because Connectors was still marked `Not checked` while it is a primary V1 surface.
- Added a dedicated `/app/` Playwright path for the V2 Connectors surface: sidebar navigation, connector list/detail rendering, status summary counts, search filtering, status filtering, connection test action, probe result alert, and same-page runtime CLI tool cards.
- Covered the V1-aligned decision that the internal `relay-knowledge` connector is hidden from the connector list while its runtime CLI card remains visible.
- Kept `PAGE-05` at `In progress`; this slice adds V2 browser evidence and screenshot inspection, not final V1 visual/DOM pairing or release verification.

### Verification
- `npm run test:browser -- v2-connectors-view.spec.ts --project=chromium` passed.
- `npm run test -- src/test/ConnectorsView.test.tsx` passed with 8 tests.
- `npm run lint` passed.
- Browser screenshot artifacts inspected:
  - `.tmp/frontend-v2-ts-connectors/v2-connectors-search-w3.png`
  - `.tmp/frontend-v2-ts-connectors/v2-connectors-error-filter.png`
  - `.tmp/frontend-v2-ts-connectors/v2-connectors-probe-result.png`

### Reviewer
- Main-agent browser inspection confirmed the connector surface stays in the fixed shell, filters do not leave stale cards, the selected detail tracks the visible list, connector probe results render in place, and runtime CLI cards remain available below connector details. Remaining before verification: V1 screenshot/DOM comparison, connector loading/error browser states, and narrow viewport density review.

## 2026-07-01 Board Surface Filter And Archive Coverage

### Scope
- Re-checked the closure matrix and selected `PAGE-03` because Board was still marked `Not checked` while the P1 surface group requires source groups, statuses, sync, and filters.
- Extended the existing Board browser spec with a real `/app/` path for status-column and filter behavior: default board load, source summary count, search filtering, archived-column hiding by default, `include_archived=true` refetch, archived card rendering, and the restore affordance.
- Kept the existing Board browser action coverage for sync, handoff preview/start, request-changes preview/start, and source edit/create/delete intact.
- Kept `PAGE-03` at `In progress`; this slice adds browser evidence and screenshot inspection, not formal V1 visual/DOM pairing or final Board verification.

### Verification
- `npm run test:browser -- v2-board-actions.spec.ts --project=chromium` passed with 5 tests.
- `npm run test -- src/test/BoardTodosView.test.tsx` passed with 7 tests.
- `npm run lint` passed.
- Browser screenshot artifacts inspected:
  - `.tmp/frontend-v2-ts-board-actions/v2-board-filtered-review.png`
  - `.tmp/frontend-v2-ts-board-actions/v2-board-archived-visible.png`

### Reviewer
- Main-agent browser inspection confirmed Board stays in the fixed shell, filter results remove nonmatching cards without stale content, and enabling archived expands the status columns with the expected archived item and restore action. Remaining before verification: V1 screenshot/DOM comparison, loading/error browser states, and narrow viewport density review.

## 2026-07-01 Search Surface Browser Coverage

### Scope
- Re-checked the closure matrix before editing and selected `PAGE-04` because Search was still marked `Not checked` even though it is a primary V1 sidebar surface.
- Added a dedicated `/app/` Playwright path for the V2 Search surface rather than relying on component-only coverage or the shell smoke test.
- The browser path now opens Search through the primary sidebar, searches across multiple workspaces, verifies query highlighting and empty results, selects a result with `Enter`, returns to Chat, hydrates the target session messages, updates the selected sidebar row, and checks the fixed shell plus composer controls.
- Added focused component coverage for the Search load-error state to pair with the existing filtering, click selection, keyboard selection, and no-match state tests.
- Kept `PAGE-04` at `In progress`; this slice covers V2 implementation and browser evidence, not formal V1 screenshot/DOM pairing or final page verification.

### Verification
- `npm run test -- src/test/SessionSearchView.test.tsx` passed with 4 tests.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run test:browser -- v2-search-view.spec.ts --project=chromium` passed.
- Browser screenshot artifacts inspected:
  - `.tmp/frontend-v2-ts-search/v2-session-search-filtered-results.png`
  - `.tmp/frontend-v2-ts-search/v2-session-search-selected-chat.png`

### Reviewer
- Main-agent browser inspection confirmed Search remains inside the fixed shell, shows one filtered result with highlighted query terms, and opens the selected session without leaving stale content from the previous session. Remaining before verification: V1 visual/DOM pairing, loading-state screenshot coverage, and broader page-by-page review of Board, Connectors, Memory, and Observability under the same P1 group.

## 2026-06-30 Subagent Stream Scope And UUID Session Parity

### Scope
- Re-checked the closure matrix after the session-switch slice and selected `SUB-01` plus the related `STREAM-02` leakage edge because subagent runtime rows could still appear in the main timeline during live streaming and session/view switching.
- Added an explicit `RuntimeRunState.scope` marker for session-scoped subagent SSE streams so right-panel subagent updates are rendered by the subagent timeline without polluting the parent chat timeline.
- Tightened main timeline filtering for UUID-shaped subagent instance ids and preserved ordinary main-session worker/tool rows, covering the real backend shape where subagent run/instance ids are UUIDs instead of `subagent_*` strings.
- Removed the stale `subagent_run_` prefix requirement from V2 subagent record normalization so normal subagent records with UUID run ids can reconcile and stream.
- Fixed subagent tool-card opening status: blank status fields now fall back to `running`, while completed tool-result cards propagate the tool row status so completed subagents do not incorrectly open a live stream.
- Extended browser coverage to capture both live and completed subagent panel states and to assert the parent `.at-chat-view` never contains the subagent live/final output while the right panel is open or after returning to the main session.
- Kept `SUB-01` and `STREAM-02` at `In progress`; this slice covers mocked browser SSE, UUID scoping, and normal-mode subagent panel isolation, not real-backend long-running orchestration replay, hard-refresh replay, or full reviewer sign-off.

### Verification
- `npm test -- --run src/test/MessageTimeline.test.tsx` passed with 139 tests.
- `npm test -- --run src/test/SessionsSidebar.test.tsx src/test/AppShell.test.tsx src/test/SubagentSessionView.test.tsx src/test/streamClient.test.ts src/test/runtimeReducers.test.ts` passed with 131 tests.
- `npm run build` passed.
- `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium` passed with 3 browser tests.
- `npm run test:browser -- v2-session-switch-stream.spec.ts --project=chromium` passed.
- Browser screenshot artifacts inspected:
  - `.tmp/frontend-v2-ts-subagent-session/v2-subagent-session-live.png`
  - `.tmp/frontend-v2-ts-subagent-session/v2-subagent-session-completed.png`

### Reviewer
- Main-agent verification confirmed the live UUID subagent output renders only in the right subagent panel, the parent timeline remains unpolluted, completed subagent history refills without a lingering live cursor, and session-switch stream recovery still passes. Remaining before verification: real backend subagent stream sampling, hard-refresh/replay comparison, orchestration-mode subagent histories, and broader tool/thinking-heavy stream screenshots.

## 2026-06-30 Session Switch Stream Recovery Browser Coverage

### Scope
- Re-checked the closure matrix before editing, then selected `STREAM-02` / `SESS-03` as the next P0 timeline gap because session switching during a live stream still lacked browser evidence for exact content restoration.
- Upgraded `v2-session-switch-stream.spec.ts` from a stale "close stream on switch" assertion to the current target behavior: the foreground stream can continue in the background, the newly selected session is not polluted, switching back restores the original run content, and terminal completion removes the streaming cursor.
- Added exact browser row assertions for event-ordered text recovery across session switching: event 2 text, hidden background event 3 text, and foreground event 4 continuation render as one ordered message with no duplicate rows.
- Fixed the terminal stream close path so the active session sidebar refetches immediately instead of waiting for delayed round-history settlement; the selected session no longer keeps a running indicator after the timeline and composer have already settled.
- Synced the round marker `<details>` native toggle state back into React state and added a one-line prompt assertion so expanded markers do not show the same prompt in both the header and body.
- Kept `SESS-03` and `STREAM-02` at `In progress`; this slice covers the TS browser mock SSE path for one normal-mode session switch, not full interrupted recovery, orchestration mode, real-backend streaming, or hard-refresh replay.

### Verification
- `npm test -- --run src/test/RunStreamController.test.tsx src/test/MessageTimeline.test.tsx` passed.
- `npm run build` passed.
- `npm run test:browser -- v2-session-switch-stream.spec.ts --project=chromium` passed.
- `npm run test:browser -- v2-rounds.spec.ts --project=chromium --grep "does not repeat the round prompt title"` passed.
- Browser screenshot artifact updated at `.tmp/frontend-v2-ts-session-switch/v2-active-stream-session-switch.png`.
- Prompt expansion screenshot artifact updated at `.tmp/frontend-v2-ts-rounds/v2-round-marker-expanded-no-duplicate.png`.

### Reviewer
- Main-agent browser coverage completed for active-stream session switching, including terminal sidebar status cleanup and prompt expansion de-duplication. Remaining before row verification: real-backend or real-SSE session-switch sampling, hard-refresh replay comparison after switch-back, orchestration-mode session switching, and row snapshots for tool/thinking-heavy runs.

## 2026-06-30 Timeline Hydration Stability And Prompt Expansion Closure

### Scope
- Re-checked the closure matrix before editing, then focused this slice on message timeline hydration/replay defects that were blocking a full `MessageTimeline.test.tsx` pass.
- Made long round prompt expansion controlled in `RoundMarker`, so the expanded prompt body does not repeat the same prompt text in the summary line and body after virtualizer/session re-renders.
- Fixed subagent tool-card previews when backend/runtime metadata provides an empty title by falling through to description or role id instead of rendering a blank preview.
- Stabilized the message timeline regression coverage around final DOM states: closed runtime output hydration, stale runtime delta suppression for copy, live fallback metadata, hydrated thinking folding, open-stream tool/approval rows, reconnected text/tool-result continuation, string tool arg normalization, and completed subagent panel cursor cleanup.
- Kept the matrix rows `MSG-01`, `MSG-02`, `MSG-03`, `MSG-04`, `MSG-05`, `STREAM-02`, and `SUB-01` at `In progress`; this slice restores the core unit safety net but does not claim full live browser stream parity, session-switch recovery parity, or final V2 completion.

### Verification
- `npm test -- --run src/test/MessageTimeline.test.tsx -t "hides closed runtime output|live fallback targets|does not copy stale runtime|already hydrated|hydrated thinking|live tool and approval|reconnected text|normalizes string tool args|completed subagent stream|MainAgent tool calls|running subagent tool card|hydrated text and idle continuation"` passed with 12 targeted tests.
- `npm test -- --run src/test/MessageTimeline.test.tsx` passed with 138 tests.
- `npm run build` passed.
- In-app browser hard refresh of `http://127.0.0.1:8000/app/` confirmed the expanded round prompt summary only contains the expand/collapse control text while the full prompt appears once in the body, `已处理` remains available, and `.streaming-cursor` count is 0 on the completed session.

### Reviewer
- Main-agent timeline hydration, prompt expansion, and subagent preview stabilization completed for this slice. Remaining work before any relevant row can move to `Verified`: live browser stream from start to terminal, hard-refresh replay comparison, session-switch recovery while streaming, orchestration-mode coverage, and updated screenshot evidence.

## 2026-06-30 Timeline Round Marker And Subagent Tool-Card Browser Coverage

### Scope
- Re-checked the frontend rewrite goal and the V1/V2 closure matrix before editing, then focused this slice on the current message timeline/subagent regressions without changing the V1-aligned sidebar or Settings item inventory.
- Fixed expanded round markers so the collapsed summary title is removed from the DOM while the full prompt body is open. The same prompt no longer appears once in the header and once in the expanded body.
- Changed subagent tool-card previews to prefer the subagent title, description, or role id instead of showing the first line of the JSON tool result body.
- Updated `v2-subagent-session.spec.ts` to use the current product interaction: clicking the parent `spawn_subagent` tool card opens the right-side subagent session, including running and completed subagents. The spec now exercises the session-scoped subagent event stream endpoint, delayed terminal history refill, send/session-switch pressure, and parent hydration race.
- Added `v2-rounds.spec.ts` browser coverage for the exact expanded prompt duplicate regression, with a screenshot fixture at `.tmp/frontend-v2-ts-rounds/v2-round-marker-expanded-no-duplicate.png`.
- Kept the matrix rows `MSG-01`, `MSG-04`, and `SUB-01` at `In progress`; this slice does not claim complete message timeline, stream/replay, tool lifecycle, or subagent subsystem parity.

### Verification
- `npm test -- --run src/test/MessageTimeline.test.tsx -t "round prompts|completed subagent tool card"` passed.
- `npm run build` passed.
- `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium` passed with 3 browser tests.
- `npm run test:browser -- v2-rounds.spec.ts --project=chromium -g "does not repeat the round prompt"` passed.
- Manual screenshot inspection confirmed the expanded round marker shows the full prompt only in the body, and the subagent tool card preview now shows `Race review` instead of `{`.

### Reviewer
- Main-agent round-marker duplicate fix, subagent tool-card preview fix, targeted unit/browser coverage, screenshot inspection, and closure-matrix update completed for this slice. This does not claim full V2 frontend completion, full Message Timeline PASS, full Subagents PASS, full stream/replay PASS, reviewer sign-off, or release cleanup sign-off.
- A full `npm test -- --run src/test/MessageTimeline.test.tsx` attempt still has existing broader failures in virtualized timeline cases, so the next timeline slice must address or isolate those before any row can move to `Verified`.

## 2026-06-30 Agent Runtime Settings TS Migration

### Scope
- Re-checked the frontend rewrite goal, remaining old frontend Python UI harness inventory, and current Settings secondary-page coverage before editing, then selected `tests/integration_tests/frontend/test_agents_settings_ui.py` as the next bounded Settings migration slice.
- Migrated V1 Agent Runtime behavior into focused V2 React coverage in `RuntimeSettingsSections.test.tsx`: stdio runtime save/test flow, Settings environment variable binding payloads, registry runtime creation with selected environment variables, and configured registry secret plus registry snapshot preservation.
- Kept the existing `SettingsDrawer.test.tsx` coverage for opening Agent Runtime through the V1-aligned System secondary page, creating/deleting runtimes, and refreshing the ACP registry instead of flattening Agent Runtime into the primary Settings nav.
- Fixed `RuntimeSettingsSections` so stdio and registry environment bindings use the existing Settings environment variable catalog, save selected variable values into runtime payloads, and still preserve already-configured secret bindings when the value is intentionally blank. HTTP header bindings remain explicit name/value/secret controls.
- Deleted `tests/integration_tests/frontend/test_agents_settings_ui.py`; 21 frontend integration `.py` files remain after this slice.

### Verification
- `npm run test -- src/test/RuntimeSettingsSections.test.tsx` passed.
- `npm run test -- src/test/SettingsDrawer.test.tsx -t "renders a real settings center"` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- `Test-Path tests\integration_tests\frontend\test_agents_settings_ui.py` returned `False`, confirming the old Python UI harness file has been removed.

### Reviewer
- Main-agent Agent Runtime settings harness migration completed for this slice. This does not claim full Settings PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.
- Remaining high-priority gaps after this slice: live message timeline density and part rendering, interrupted stream replay/continuation browser flows, broader settings secondary-page migration, connectors/memory/board/observability coverage, and the remaining frontend Python UI harness migrations.

## 2026-06-30 Workspace Settings TS Migration

### Scope
- Re-checked the frontend rewrite goal and remaining old frontend Python UI harness inventory before editing, then selected `tests/integration_tests/frontend/test_workspace_settings_ui.py` as the next bounded Settings secondary-page migration slice.
- Migrated V1 remote workspace SSH profile behavior into focused V2 React coverage in `WorkspaceSettingsSection.test.tsx`: create/save payloads, persisted list refresh, saved-profile probes, draft override probes, edit prefill, reveal saved password, save-without-secret-dirty preservation, focused replacement password saves, delete confirmation, and required-username validation for saves/probes.
- Kept the existing `SettingsDrawer.test.tsx` Remote workspace coverage for the V1-aligned Settings primary section entry and the real drawer integration path instead of flattening secondary content into the top-level shell.
- Fixed `WorkspaceSettingsSection` so editing an existing SSH profile probes and saves against the original profile id, validation failures during draft probes do not create unhandled promise rejections, and revealed saved passwords are not treated as replacement secrets unless the password field is actually focused and edited.
- Deleted `tests/integration_tests/frontend/test_workspace_settings_ui.py`; 22 frontend integration `.py` files remain after this slice.

### Verification
- `npm run test -- src/test/WorkspaceSettingsSection.test.tsx` passed.
- `npm run test -- src/test/SettingsDrawer.test.tsx -t "remote workspace|Remote workspace"` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- `Test-Path tests\integration_tests\frontend\test_workspace_settings_ui.py` returned `False`, confirming the old Python UI harness file has been removed.

### Reviewer
- Main-agent Workspace settings harness migration completed for this slice. This does not claim full Settings PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.
- Remaining high-priority gaps after this slice: live message timeline density and part rendering, interrupted stream replay/continuation browser flows, broad settings secondary-page migration, connectors/memory/board/observability coverage, and the remaining frontend Python UI harness migrations.

## 2026-06-30 GitHub Settings TS Migration

### Scope
- Continued the settings secondary-page parity migration after Commands by selecting `tests/integration_tests/frontend/test_github_settings_ui.py` as the next bounded old Python UI harness to retire.
- Migrated V1 GitHub settings behavior into focused V2 React coverage in `GitHubSettingsSection.test.tsx`: saved token preservation, unfocused browser-autofill suppression, reveal without dirtying the saved token, focused replacement token probe/save, callback preview updates, empty webhook probe blocking, webhook save payloads, delayed temporary public URL backfill, and matching URL cleanup after tunnel stop.
- Kept the existing `SettingsDrawer.test.tsx` coverage for opening GitHub through the V1-aligned System secondary page and exercising the real Settings drawer path.
- Fixed `GitHubSettingsSection` so unchanged saved tokens use empty probe/save payloads instead of clearing the token, unfocused autofill values are discarded, reveal does not dirty the token, delayed tunnel public URLs are fetched and saved back, matching stopped tunnel URLs are cleared from the form, and action notices are not erased by follow-up config refreshes.
- Deleted `tests/integration_tests/frontend/test_github_settings_ui.py`; 23 frontend integration `.py` files remain after this slice.

### Verification
- `npm run test -- src/test/GitHubSettingsSection.test.tsx` passed.
- `npm run test -- src/test/SettingsDrawer.test.tsx -t "GitHub|github"` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- `Test-Path tests\integration_tests\frontend\test_github_settings_ui.py` returned `False`, confirming the old Python UI harness file has been removed.

### Reviewer
- Main-agent GitHub settings harness migration completed for this slice. This does not claim full Settings PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.
- Remaining high-priority gaps after this slice: live message timeline density and part rendering, interrupted stream replay/continuation browser flows, broad settings secondary-page migration, connectors/memory/board/observability coverage, and the remaining frontend Python UI harness migrations.

## 2026-06-30 Commands Settings TS Migration

### Scope
- Continued the settings secondary-page parity migration after Orchestration by selecting `tests/integration_tests/frontend/test_commands_settings_ui.py` as the next bounded old Python UI harness to retire.
- Migrated V1 Commands settings behavior into focused V2 React coverage in `CommandsSettingsSection.test.tsx`: catalog rendering and filtering, copy-path feedback, create-editor workspace filtering for writable local workspaces, generated command paths, preview rendering, create payload serialization, current catalog preservation when a later refresh fails, and save-success plus refresh-failure feedback.
- Kept the existing `SettingsDrawer.test.tsx` coverage for opening Commands through the V1-aligned System secondary page and editing/creating through the real Settings drawer.
- Fixed `CommandsSettingsSection` so a successful command save still dispatches the command-updated event and reports a warning if the follow-up catalog refresh fails, instead of silently swallowing the refresh failure.
- Deleted `tests/integration_tests/frontend/test_commands_settings_ui.py`; 24 frontend integration `.py` files remain after this slice.

### Verification
- `npm run test -- src/test/CommandsSettingsSection.test.tsx` passed.
- `npm run test -- src/test/SettingsDrawer.test.tsx -t "commands|Commands"` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- `Test-Path tests\integration_tests\frontend\test_commands_settings_ui.py` returned `False`, confirming the old Python UI harness file has been removed.

### Reviewer
- Main-agent Commands settings harness migration completed for this slice. This does not claim full Settings PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.
- Remaining high-priority gaps after this slice: live message timeline density and part rendering, interrupted stream replay/continuation browser flows, broad settings secondary-page migration, connectors/memory/board/observability coverage, and the remaining frontend Python UI harness migrations.

## 2026-06-30 Orchestration Settings TS Migration

### Scope
- Continued the settings secondary-page parity migration after Proxy by selecting `tests/integration_tests/frontend/test_orchestration_settings_ui.py` as the next bounded old Python UI harness to retire.
- Migrated V1 Orchestration settings behavior into `SettingsDrawer.test.tsx`: draft cancellation does not pollute the preset list, preset rows remain visible when role option loading fails, existing graph templates and policies are preserved on save, and the detail editor does not render a default checkbox.
- Reused and strengthened the existing V2 coverage for setting the default preset, deleting with confirmation, and creating a new preset without changing the V1 sidebar/settings item inventory or flattening Settings secondary pages.
- Deleted `tests/integration_tests/frontend/test_orchestration_settings_ui.py`; 25 frontend integration `.py` files remain after this slice.

### Verification
- `npm run test -- src/test/SettingsDrawer.test.tsx -t "orchestration|Orchestration"` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- `Test-Path tests\integration_tests\frontend\test_orchestration_settings_ui.py` returned `False`, confirming the old Python UI harness file has been removed.

### Reviewer
- Main-agent Orchestration settings harness migration completed for this slice. This does not claim full Settings PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.
- Remaining high-priority gaps after this slice: live message timeline density and part rendering, interrupted stream replay/continuation browser flows, broad settings secondary-page migration, connectors/memory/board/observability coverage, and the remaining frontend Python UI harness migrations.

## 2026-06-30 Proxy Settings TS Migration

### Scope
- Continued the settings secondary-page parity migration after Web/ClawHub by selecting `tests/integration_tests/frontend/test_proxy_settings_ui.py` as the next bounded old Python UI harness to remove.
- Migrated V1 Proxy settings behavior into `SettingsDrawer.test.tsx`: saved values load into the real V2 Settings page, saved proxy passwords are preserved for probe/save, autofill-style change events do not dirty the password field until focus, focused edits replace the saved password, explicit clear sends `null`, SSL verify defaults to skip verification, and successful probe output remains visible.
- Fixed `ProxySettingsSection` so password changes only mark the saved secret dirty after the password input has focus, preventing saved credentials from being overwritten by unfocused autofill events.
- Added an explicit Proxy clear-password action to match the V1 saved-secret clearing workflow without changing the settings navigation or flattening secondary pages.
- Deleted `tests/integration_tests/frontend/test_proxy_settings_ui.py`; 26 frontend integration `.py` files remain after this slice.

### Verification
- `npm run test -- src/test/SettingsDrawer.test.tsx -t "Proxy|proxy"` passed.

### Reviewer
- Main-agent Proxy settings harness migration completed for this slice. This does not claim full Settings PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.
- Remaining high-priority gaps after this slice: live message timeline density and part rendering, interrupted stream replay/continuation browser flows, broad settings secondary-page migration, connectors/memory/board/observability coverage, and the remaining frontend Python UI harness migrations.

## 2026-06-30 Web Settings TS Migration

### Scope
- Continued from the submitted ClawHub settings migration by selecting the next bounded Settings parity slice instead of tuning only the most recent visual symptom.
- Migrated the V1 Web settings secret-handling behavior from `tests/integration_tests/frontend/test_web_settings_ui.py` into V2 React coverage in `SettingsDrawer.test.tsx`.
- Added V2 Web settings coverage for saved Exa key preservation, browser-autofill-style DOM value changes that must not dirty the key, explicit replacement, explicit clearing to `null`, Exa provider website linking, masked saved-key placeholder, `autocomplete="new-password"`, and SearXNG fallback field visibility behind the fallback selector.
- Fixed `WebSettingsSection` to track Exa API key dirtiness separately from the saved key, so unchanged fields preserve saved secrets while the new explicit clear action sends `null`.
- Deleted `tests/integration_tests/frontend/test_web_settings_ui.py`; 27 frontend integration `.py` files remain after this slice.

### Verification
- `npm run test -- src/test/SettingsDrawer.test.tsx -t "Web settings|web settings"` passed.

### Reviewer
- Main-agent Web settings harness migration completed for this slice. This does not claim full Settings PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.
- Remaining high-priority gaps after this slice: live message timeline density and part rendering, interrupted stream replay/continuation browser flows, broad settings secondary-page migration, connectors/memory/board/observability coverage, and the remaining frontend Python UI harness migrations.

## 2026-06-30 ClawHub Settings TS Migration

### Scope
- Re-checked the active frontend rewrite goal and remaining old frontend Python UI harnesses before editing, then selected the bounded ClawHub settings slice because it overlaps the Settings secondary-page parity target without changing the V1 sidebar/settings item inventory.
- Migrated the V1 ClawHub token behavior from `tests/integration_tests/frontend/test_clawhub_settings_ui.py` into V2 React coverage across `SettingsDrawer.test.tsx` and `SkillsView.test.tsx`.
- Added Settings coverage for unchanged saved-token probe/save, browser-autofill-style DOM value changes that must not dirty the token field, clearing a saved token to send `null`, blocking probe without an effective token, the account link, and `autocomplete="new-password"`.
- Added Skills drawer coverage for saved-token reuse, the ClawHub settings link, and the same masked-token input contract.
- Restored the V1 probe-result parity where a successful probe that auto-installed the ClawHub CLI reports that fact in both Settings and Skills ClawHub notices.
- Deleted `tests/integration_tests/frontend/test_clawhub_settings_ui.py`; 28 frontend integration `.py` files remain after this slice.

### Verification
- `npm run test -- src/test/SettingsDrawer.test.tsx -t "ClawHub"` passed.
- `npm run test -- src/test/SkillsView.test.tsx -t "ClawHub settings|ClawHub settings drawer"` passed.

### Reviewer
- Main-agent ClawHub settings harness migration completed for this slice. This does not claim full Settings PASS, Skills/ClawHub subsystem PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.
- Remaining high-priority gaps after this slice: live message timeline density and part rendering, interrupted stream replay/continuation browser flows, broad settings secondary-page migration, connectors/memory/board/observability coverage, and the remaining frontend Python UI harness migrations.

## 2026-06-30 Final Subagent Stream Harness TS Migration

### Scope
- Re-checked the active frontend rewrite goal and the AG-UI Runtime Stream / Subagents checklist before editing, with this slice focused on the last remaining old Python UI harnesses that copied V1 `frontend/dist/js/core/stream.js`.
- Migrated `test_normal_mode_subagent_streams_attach_route_and_detach` to V2 semantics across `streamClient.test.ts` and `SubagentSessionView.test.tsx`: selected subagent runs now prove AG-UI replay cursor routing, instance/role metadata reduction, terminal close, checkpoint-based `startRunStream`, unmount detach, and parent subagent/sidebar cache refresh.
- Migrated `test_current_session_background_stream_routes_events_and_deduplicates_attach` into `RunStreamController.test.tsx`: background-only streams remain out of the foreground active run list, duplicate targets open one replay stream from the latest local cursor, runtime state is stored, and terminal close refreshes messages, recovery, sidebar, and token usage.
- Migrated `test_normal_mode_subagent_discovery_reconciles_sidebar_cache` into `SessionsSidebar.test.tsx`: an expanded parent subagent list now refetches and renders newly discovered normal-mode subagents after the V2 sidebar subagent query is invalidated.
- Deleted `tests/integration_tests/frontend/test_subagent_streams_ui.py`; the old V1 source-copy UI harness count is now 0.
- Kept production code and `frontend/dist/app` unchanged in this slice because the existing V2 React runtime satisfied the migrated semantics once asserted.

### Verification
- `npm run test -- src/test/streamClient.test.ts -t "selected subagent|terminal event|multiplexed stream"` passed.
- `npm run test -- src/test/RunStreamController.test.tsx -t "background stream|background-only|duplicate background"` passed.
- `npm run test -- src/test/SubagentSessionView.test.tsx` passed.
- `npm run test -- src/test/SessionsSidebar.test.tsx -t "subagent"` passed.
- `npm run lint` passed.
- `Test-Path tests\integration_tests\frontend\test_subagent_streams_ui.py` returned `False`, confirming the old V1 source-copy subagent stream harness file has been removed.

### Reviewer
- Main-agent final subagent stream harness migration completed for this slice. This does not claim full AG-UI Runtime Stream PASS, replay/continuation PASS, Subagents subsystem PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.
- Remaining high-priority gaps after this slice: live message timeline density and part rendering, interrupted stream replay/continuation browser flows, settings secondary-page parity with V1, broad settings/connectors/memory/board/observability coverage, and subsystem reviewer sign-off.

## 2026-06-30 Screenshot-Driven Composer Framework Alignment

### Scope
- Re-checked the active frontend rewrite goal and the Application Shell / Composer parity checklist before editing, then captured V1 and V2 1280x720 browser screenshots plus layout metrics for the large-frame comparison.
- Confirmed the V2 page shell was already fixed to a single viewport like V1 (`documentElement.scrollHeight == body.scrollHeight == 720`), so this slice did not retune global page scrolling or sidebar items.
- Found the remaining visible framework issue in the bottom composer: V2 wrapped topology controls into two rows and made disabled controls visually heavier than V1, which reduced workspace density and made Shell / YOLO feel squeezed.
- Updated `Composer` and shell CSS so the desktop composer control strip stays on one row, uses compact fixed/responsive widths, keeps the send action pinned on the right, softens disabled select/segmented states, and preserves the existing control set without adding or removing sidebar/settings entries.
- Rebuilt `frontend/dist/app` so the served V2 bundle matches the React source changes.
- Re-captured the post-change V2 screenshot and metrics at 1280x720: fixed page height remained 720, composer height dropped to 134, `.at-composer-control-set` stayed visible without horizontal overflow (`scrollWidth == clientWidth == 830`), and all composer controls remained reachable on the row.
- Evidence paths are under `.tmp/frontend-v1-v2-framework/`: `v1-framework.png`, `v2-framework.png`, `v2-framework-after-composer-fit.png`, and the matching JSON metric files.

### Verification
- `npm run test -- src/test/ShellLayoutCss.test.ts -t "composer controls"` passed.
- `npm run test -- src/test/Composer.test.tsx -t "localizes the persistent composer frame|keeps composer topology controls"` passed.
- `npm run build` passed, including typecheck, desktop build, and Vite bundle generation.
- `git diff --check` passed.

### Reviewer
- Main-agent screenshot-driven composer framework alignment completed for this slice. This does not claim full Application Shell PASS, Message Timeline PASS, AG-UI Runtime Stream PASS, replay/continuation PASS, Settings PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.
- Remaining high-priority gaps after this slice: message timeline density and part rendering, stream/replay continuation edges, settings secondary-page parity with V1, subagent/right-rail behavior, and the 3 remaining old Python UI harness tests that still need TS migration.

## 2026-06-30 Active Run Subagent Discovery Refresh

### Scope
- Re-checked the active frontend rewrite goal and the remaining stream/subagent harnesses after two committed stream-edge slices, then selected the parent-run subagent discovery gap because it affects whether newly spawned normal-mode subagents become visible while a run is still streaming.
- Migrated the V2-relevant behavior from `tests/integration_tests/frontend/test_subagent_streams_ui.py::test_active_parent_run_polls_normal_subagent_discovery_until_children_visible` into `RunStreamController.test.tsx`.
- Fixed `useRunStreamController` so the existing active-stream continuity tick continues refreshing recovery and now also invalidates the current session's subagent query plus the sidebar query. This lets the React sidebar discover new child subagent entries while the parent run remains active.
- Kept the V2 cadence on the existing 10s continuity refresh instead of recreating the V1 8s `frontend/dist/js/core/stream.js` timer.
- Deleted the old V1 parent-run subagent discovery Python harness; `test_subagent_streams_ui.py` now has 3 remaining old Python UI harness tests.
- Kept `frontend/dist/app` unchanged in this slice because the production change is in the V2 React runtime source and no served-bundle or visual sign-off is claimed here.

### Verification
- `npm run test -- src/test/RunStreamController.test.tsx -t "polls sidebar subagent discovery|refreshes recovery|refreshes sidebar and session token usage"` passed with 4 focused controller tests.
- `npm run test -- src/test/RunStreamController.test.tsx` passed with all 24 controller tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_streams_ui.py` passed after deleting the old Python harness.
- `npm run lint` passed.
- `rg -n "def test_" tests\integration_tests\frontend\test_subagent_streams_ui.py` shows 3 remaining old Python UI harness tests in that file.

### Reviewer
- Main-agent active-run subagent discovery refresh, focused/full controller verification, and old Python UI harness reduction completed for this slice. This does not claim full AG-UI Runtime Stream PASS, Subagents subsystem PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

## 2026-06-30 Stale Stream Callback TS Migration

### Scope
- Re-checked the active frontend rewrite goal after the pending-run commit and chose the next slice from the remaining stream/replay recovery gaps instead of continuing to tune only the latest visual note.
- Migrated the V2-relevant navigation/stream replacement edge from `tests/integration_tests/frontend/test_subagent_streams_ui.py::test_foreground_navigation_caps_streams_and_cancels_stale_background_attach` into `RunStreamController.test.tsx`.
- Added controller coverage proving callbacks from an already replaced stream generation cannot restore stale foreground run state, write stale runtime state, suppress current targets, close the newer background stream, or trigger terminal message/sidebar invalidations.
- Deleted the old V1 `frontend/dist/js/core/stream.js` harness for foreground navigation stream budgeting and stale background attach cancellation; the global background-stream fan-out details are not carried forward because V2 attaches through the selected-session recovery/controller path.
- Kept production code and `frontend/dist/app` unchanged in this slice because the existing V2 controller generation guard already satisfied the migrated stale-callback semantics once asserted.
- `test_subagent_streams_ui.py` now has 4 remaining old Python UI harness tests.

### Verification
- `npm run test -- src/test/RunStreamController.test.tsx -t "ignores stale callbacks|tracks background-only streams|cancels pending reconnects"` passed with 3 focused controller tests.
- `npm run test -- src/test/RunStreamController.test.tsx` passed with all 23 controller tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_streams_ui.py` passed after deleting the old Python harness.
- `npm run lint` passed.
- `rg -n "def test_" tests\integration_tests\frontend\test_subagent_streams_ui.py` shows 4 remaining old Python UI harness tests in that file.

### Reviewer
- Main-agent stale stream callback migration and old Python UI harness reduction completed for this slice. This does not claim full AG-UI Runtime Stream PASS, replay/continuation PASS, Subagents subsystem PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

## 2026-06-30 Pending Run Session Switch Migration

### Scope
- Re-checked the active frontend rewrite goal and the current AG-UI Runtime Stream / interrupted-stream recovery / Subagents gap before closing this slice, rather than treating the latest visual note as the whole target.
- Migrated the V2-relevant edge from `tests/integration_tests/frontend/test_subagent_streams_ui.py::test_pending_run_start_detaches_to_background_on_session_switch` into `Composer.test.tsx`: when run creation resolves after the user has already switched sessions, the created run starts as a background stream for the original session.
- Fixed `Composer` to track the latest selected `sessionId` through a ref, start newly created runs in the foreground only when the result still belongs to the current session, and invalidate messages for `result.session_id` instead of the newly selected session.
- Preserved the existing sidebar refresh after pending run creation resolves so the original session can surface terminal/unread state without stealing the active workspace.
- Deleted the old V1 pending-run Python harness from `test_subagent_streams_ui.py`; that file now has 5 remaining old Python UI harness tests.
- Kept `frontend/dist/app` unchanged in this slice because this is a focused React runtime-controller behavior migration and no served-bundle or visual sign-off is claimed here.

### Verification
- `npm run test -- src/test/Composer.test.tsx -t "detaches a created run|starts a run from the composer|keeps topology locked"` passed with 3 focused Composer tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_streams_ui.py` passed after deleting the old Python harness.
- `npm run lint` passed.
- `rg -n "def test_" tests\integration_tests\frontend\test_subagent_streams_ui.py` shows 5 remaining old Python UI harness tests in that file.

### Reviewer
- Main-agent V2 pending-run session-switch behavior, focused regression coverage, and one old Python UI harness retirement completed for this slice. This does not claim full AG-UI Runtime Stream PASS, replay/continuation PASS, Subagents subsystem PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

## 2026-06-30 Paused Subagent Terminal State Migration

### Scope
- Re-checked the active frontend rewrite goal and the Run Recovery / AG-UI Runtime Stream / Subagents parity checklist before editing, with this slice focused on paused and stopped subagent terminal state handling.
- Fixed a V2 subagent session gap: `SubagentSessionView` now maps runtime `run_paused` to a visible `paused` status, treats backend `paused` subagent run status as terminal for stream-start decisions, and uses the existing stopped/subdued badge styling for paused terminal state.
- Strengthened `SubagentSessionView.test.tsx` so paused and stopped subagent sessions do not start a new run stream, and runtime completed/paused/stopped terminal events all override stale running badges without reopening streams.
- Strengthened the Composer stop-run regression so stopping an active run clears the cached recovery active run before invalidating sidebar/recovery data and suppressing stale stream targets.
- Deleted the old V1 `requestStopCurrentRun` Python harness from `tests/integration_tests/frontend/test_subagent_streams_ui.py`; that file now has 6 remaining old Python UI harness tests.
- Kept `frontend/dist/app` unchanged in this slice because the production change is in the V2 React source and no served-bundle verification is claimed here.

### Verification
- `npm run test -- src/test/SubagentSessionView.test.tsx` passed with 8 subagent session tests.
- `npm run test -- src/test/Composer.test.tsx -t "stops an active run"` passed the focused Composer stop-run regression.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_streams_ui.py` passed after deleting the old Python harness.
- `rg -n "def test_" tests\integration_tests\frontend\test_subagent_streams_ui.py` shows 6 remaining old Python UI harness tests in that file.

### Reviewer
- Main-agent V2 paused/stopped subagent terminal state fix, focused regression coverage, and one old Python UI harness retirement completed for this slice. This does not claim full Subagents subsystem PASS, AG-UI Runtime Stream PASS, Run Recovery PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

## 2026-06-30 Recovery Stream Source Assertion Migration

### Scope
- Re-checked the active frontend rewrite goal, the AG-UI Runtime Stream / Run Recovery / Subagents parity areas, and the current `/app/` layout metrics before editing.
- Confirmed the served V2 shell is currently a fixed-height workspace in the in-app browser (`documentElement.scrollHeight == clientHeight == 720`) with scrolling isolated to the session list and timeline; screenshot capture timed out in the browser tool, so no visual sign-off is claimed from this slice.
- Migrated four V1 `frontend/dist/js/core/stream.js` source-shape assertions from `tests/integration_tests/frontend/test_subagent_streams_ui.py` into V2 behavior coverage:
  - `streamClient.test.ts` now treats `run_paused` as a first-class terminal SSE event alongside failed/stopped terminal events;
  - `RecoveryBar.test.tsx` now proves idle recovery snapshots and terminal active runs do not auto-start stream controllers;
  - existing `RecoveryBar.test.tsx` coverage continues to prove active background subagent recovery starts a multiplex parent/subagent stream, and recoverable stopped parent runs do not auto-stream same-run background work.
- Deleted the four migrated top-of-file V1 source assertions from `test_subagent_streams_ui.py`, reducing that file from 11 remaining UI harness tests to 7.
- Kept production code and `frontend/dist/app` unchanged in this slice because the current V2 recovery/streaming behavior already satisfied the migrated semantics once asserted.

### Verification
- `npm run test -- src/test/streamClient.test.ts -t "terminal event"` passed with 6 terminal-event stream tests.
- `npm run test -- src/test/RecoveryBar.test.tsx -t "idle recovery|terminal active|active background subagent|stopped parent"` passed with 4 focused RecoveryBar tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_streams_ui.py` passed after deleting the migrated Python assertions.
- `rg -n "def test_" tests\integration_tests\frontend\test_subagent_streams_ui.py` shows 7 remaining old Python UI harness tests in that file.

### Reviewer
- Main-agent V2 recovery/stream source-assertion migration and partial old Python UI harness reduction completed for this slice. This does not claim full AG-UI Runtime Stream PASS, Run Recovery PASS, Subagents subsystem PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

## 2026-06-30 Paused Run Foreground Stream TS Migration

### Scope
- Re-checked the active frontend rewrite goal and the AG-UI Runtime Stream / Subagents parity checklist before editing, with this slice focused on paused-run stream lifecycle rather than broader visual details.
- Migrated the V2-relevant assertion from `tests/integration_tests/frontend/test_subagent_streams_ui.py::test_active_multiplex_stream_releases_ui_on_run_paused` into `RunStreamController.test.tsx`.
- Added V2 coverage proving a `run_paused` terminal runtime state releases foreground active stream state, preserves the tracked run until stream closure, stores `terminalEventType: "run_paused"`, then suppresses stale recovery targets, closes the stream handle, and refreshes messages, recovery, sidebar, and token usage on closure.
- Deleted the old V1 `frontend/dist/js/core/stream.js` paused-run Python harness so this lifecycle is now asserted against the React runtime controller layer.
- Kept production code and `frontend/dist/app` unchanged in this slice because the current V2 controller already satisfies the migrated paused-run lifecycle semantics.

### Verification
- `npm run test -- src/test/RunStreamController.test.tsx` passed with 22 controller tests, including the new paused-run lifecycle case.
- `npm run test -- src/test/runtimeReducers.test.ts -t paused` passed the adjacent reducer replay/resume check.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_streams_ui.py` passed after deleting the old Python harness.
- `npm run lint` passed after aligning the new test with the real `RunStreamOptions.onClosed(state)` callback shape.
- `rg -n "active_multiplex_stream_releases_ui_on_run_paused|runner_paused_terminal|run-paused" tests frontend\app\src\test docs\goals\frontend-rewrite\implementation-ledger.md` confirms the retired harness name now appears only as ledger history, while unrelated backend paused-run tests remain intact.

### Reviewer
- Main-agent paused-run foreground stream migration and old Python UI harness reduction completed for this slice. This does not claim full AG-UI Runtime Stream PASS, replay/continuation PASS, Subagents subsystem PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

## 2026-06-30 Settings Navigation Label Parity

### Scope
- Re-checked the active frontend rewrite goal, the Settings parity checklist, and the remaining V1 settings-shell harness before editing.
- Migrated the V1 settings tab order / label drift assertion from `tests/integration_tests/frontend/test_settings_shell_ui.py` into V2 `SettingsNavigationParity.test.ts`.
- Strengthened the V2 contract so it now checks both primary settings section keys and their English labels, and verifies that MCP, Plugins, Commands, Hooks, Agent Runtime, GitHub, and Gateway remain behind the System secondary-page launcher instead of leaking into the primary settings navigation.
- Fixed two visible V2 label drifts against the V1 settings surface: the primary settings label is now `Model` instead of `Models`, and the System secondary page label is now `Gateway` instead of `Triggers` while preserving the same page structure and real trigger gateway account implementation underneath.
- Updated the affected SettingsDrawer and browser parity/action tests, and rebuilt `frontend/dist/app` so the served `/app/` bundle contains the V1-aligned labels.

### Verification
- `npm run test -- src/test/SettingsNavigationParity.test.ts` passed.
- `npm run test -- src/test/SettingsDrawer.test.tsx -t "real settings center|links migrated settings labels|manages trigger gateway accounts|sets default and deletes model profiles|edits and tests an existing model profile|creates a model profile from the catalog"` passed with 6 targeted SettingsDrawer tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_settings_shell_ui.py` passed after deleting the migrated Python assertion.
- `npm run build` passed and regenerated the V2 static app bundle.
- `npm run test:browser -- browser-tests/v2-shell-parity.spec.ts -g "settings sections"` passed against the rebuilt bundle.
- `npm run lint` passed.

### Reviewer
- Main-agent V2 Settings navigation label parity, secondary-page grouping evidence, targeted unit/browser verification, lint, dist rebuild, and partial old Python UI harness reduction completed for this slice. This does not claim full Settings subsystem PASS, all settings-form PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

## 2026-06-30 Agent Panel History UI Harness Retirement

### Scope
- Re-checked the active frontend rewrite goal, the Message Timeline / Subagents / Run Recovery checklist areas, and the old V1 agent-panel history harness before editing.
- Migrated the remaining V2-relevant pending-refresh intent from `tests/integration_tests/frontend/test_agent_panel_history_task_prompt_ui.py` into `SubagentSessionView.test.tsx`: when a tracked subagent run closes, existing hydrated subagent history stays visible while the terminal history refetch is still pending, then updates to the persisted final answer when the refetch resolves.
- Verified the other old harness semantics against existing V2 `MessageTimeline.test.tsx` coverage instead of duplicating assertions: hydrated runtime text binding, live tool/approval rows after hydration, separate live subagent overlay rows, stale completed tool-result protection, late tool results after terminal finalization, and finalized subagent cursor cleanup.
- Deleted `tests/integration_tests/frontend/test_agent_panel_history_task_prompt_ui.py`; these checks now live in TypeScript coverage against the V2 React shell/timeline surfaces rather than copied V1 `frontend/dist/js/components/agentPanel/history.js` modules.
- Kept production code and `frontend/dist/app` unchanged in this slice because the added V2 regression test confirmed the current React Query invalidation path already preserves old subagent history while a terminal refetch is in flight.

### Verification
- `npm run test -- src/test/SubagentSessionView.test.tsx` passed with 5 tests, including the new pending terminal-refresh preservation case.
- `npm run test -- src/test/MessageTimeline.test.tsx -t "runtime text is already hydrated|hydrated text in an open stream|live subagent overlay|stale tool calls|late tool results|subagent stream is finalized"` passed with 6 focused Message Timeline stream/replay tests.

### Reviewer
- Main-agent V2 subagent history refresh coverage, existing Message Timeline edge coverage check, and old Python UI harness retirement completed for this slice. This does not claim full Message Timeline subsystem PASS, Subagents subsystem PASS, Run Recovery subsystem PASS, browser screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

## 2026-06-30 Environment Variables UI Harness Retirement

### Scope
- Re-checked the active frontend rewrite goal, Settings parity requirements, and remaining Python UI harness inventory before editing.
- Migrated the V1 environment-variable panel intent from `tests/integration_tests/frontend/test_environment_variables_ui.py` into V2 `SettingsDrawer.test.tsx` behavior coverage:
  - the Environment variables secondary settings page renders app variables before a collapsed System group;
  - hidden app proxy/SSL environment keys stay filtered out of the app list;
  - expanding System reveals real system environment records without adding edit/delete actions;
  - creating and editing app variables call the real environment config client with app scope and the correct `source_key`;
  - deleting an app variable preserves the destructive confirmation flow and calls the real delete client with app scope.
- Deleted `tests/integration_tests/frontend/test_environment_variables_ui.py`; the migrated behavior now lives in TypeScript coverage against the V2 Settings shell instead of the old generated `frontend/dist/js/components/settings/environmentVariables.js` harness.
- Kept production code and `frontend/dist/app` unchanged in this slice because the V2 Environment settings section already matched the migrated semantics.

### Verification
- `npm run test -- src/test/SettingsDrawer.test.tsx -t "manages app environment variables"` passed with the expanded Environment variables behavior coverage.
- `npm run lint` passed.
- `uv run --extra dev ruff check tests\integration_tests\frontend` passed after deleting the old Python UI harness.
- `rg -n "test_environment_variables_ui|environment_variables_panel_renders|environment_variables_add_row|environment_variables_edit_replaces" tests frontend\app\src\test docs\goals\frontend-rewrite\implementation-ledger.md` returned no active code/test references.
- `npm run test -- src/test/SettingsDrawer.test.tsx` was attempted, but the full SettingsDrawer file did not complete in a reasonable slice window in the current environment and was stopped; no full Settings subsystem PASS is claimed from this slice.

### Reviewer
- Main-agent V2 Environment variables settings coverage and old Python UI harness retirement completed for this slice. This does not claim full Settings subsystem PASS, browser visual sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

## 2026-06-30 Session Selection UI Harness Retirement

### Scope
- Re-checked the active frontend rewrite goal, the V1 session-selection harness, and the V2 `AppShell` session selection / terminal-view semantics before editing.
- Migrated the final three `tests/integration_tests/frontend/test_session_selection_ui.py` assertions into TypeScript `AppShell.test.tsx` coverage:
  - rapid selection changes no longer let stale session detail for an older selection overwrite the current session, workspace, composer, or token-usage role context;
  - returning from an active subagent secondary view to the main chat still marks the selected session's unread terminal run through the real terminal-view API path;
  - delayed sidebar hydration for an old selected session cannot mark that old session's terminal run after the selected session has moved elsewhere.
- Enhanced the `AppShell` child-component test doubles to expose received `sessionId`, `workspaceId`, and `primaryRoleId`, so stale session detail regressions are asserted against the rendered V2 surface rather than a private implementation detail.
- Deleted `tests/integration_tests/frontend/test_session_selection_ui.py`; its remaining V2-relevant session-selection behavior is now covered by TypeScript tests.
- Kept production code and `frontend/dist/app` unchanged in this slice because the V2 React Query keyed data flow and selected-sidebar-record terminal marking already satisfy the migrated semantics.

### Verification
- `npm run test -- src/test/AppShell.test.tsx -t "stale session detail|returning from a subagent view|stale selected session"` passed the three migrated edge cases.
- `npm run test -- src/test/AppShell.test.tsx` passed all 30 AppShell tests after enhancing the test doubles.
- `uv run --extra dev ruff check tests\integration_tests\frontend` passed after deleting the old Python UI harness.
- `rg -n "test_session_selection_ui|select_session_ignores|terminal_view_mark_does_not" tests frontend\app\src\test docs\goals\frontend-rewrite\implementation-ledger.md` now finds only historical ledger references to the retired Python harness.

### Reviewer
- Main-agent V2 session-selection edge coverage and old Python UI harness retirement completed for this slice. This does not claim full stream/replay parity, Message Timeline subsystem PASS, browser screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

## 2026-06-30 Screenshot-Driven Sidebar Framework Parity

### Scope
- Re-checked the active frontend rewrite goal and captured stable V1/V2 framework evidence before editing instead of judging from source alone.
- Captured V1 settled screenshot at `C:/Users/yex/AppData/Local/Temp/agent-teams-ui-qa/v1-framework-settled.png` and V2 before/after screenshots at `C:/Users/yex/AppData/Local/Temp/agent-teams-ui-qa/v2-framework-settled.png` and `C:/Users/yex/AppData/Local/Temp/agent-teams-ui-qa/v2-framework-final-sidebar.png` with a 1280x720 Chrome viewport against the local `127.0.0.1:8000` app.
- Confirmed the V2 shell remains one fixed page (`documentScrollHeight == documentClientHeight == 720`, `bodyScrollHeight == bodyClientHeight == 720`) and the sidebar/workspace frame aligns with V1 at `280px` sidebar width plus the `6px` resize gutter.
- Fixed a V2 sidebar framework gap: the selected session now scrolls into the sidebar's visible list when it first renders or when the selected session changes, matching V1's visible-current-session behavior instead of leaving the current session below the fold.
- Toned down the V2 sidebar `New session` button from a primary green slab to neutral sidebar chrome, and strengthened the selected session row using existing surface/border tokens so the selected row reads like V1 without changing the sidebar item set.
- Left the larger message replay/content mismatch observed in the screenshots as pending stream/replay work; this slice only claims the sidebar/framework parity fix.
- Rebuilt `frontend/dist/app` so the served `/app/` bundle contains the sidebar scroll and neutral chrome changes (`/app/assets/index-CshUfHZp.js`, `/app/assets/index-w6MLB_2i.css`).

### Verification
- `npm run test -- src/test/SessionsSidebar.test.tsx -t "scrolls the selected session"` passed with coverage for selected-session `scrollIntoView({ block: "nearest" })`.
- `npm run test -- src/test/SessionsSidebar.test.tsx -t "selects a cross-workspace parent"` passed after checking the adjacent subagent selection path.
- `npm run test -- src/test/SessionsSidebar.test.tsx` passed all 24 sidebar tests on rerun; one previous full-file run had a transient async miss in the existing cross-workspace subagent test, while the targeted rerun and second full rerun passed.
- `npm run test -- src/test/ShellLayoutCss.test.ts` passed all 11 CSS layout/parity assertions, including the new neutral sidebar chrome check.
- `npm run lint` passed.
- `npm run build` passed and regenerated the V2 static app bundle.
- Post-build Chrome screenshot/metrics confirmed the selected V2 session row is visible at `y=501` inside the sidebar list, `New session` uses neutral `rgb(40, 43, 37)` background, and document/body scrolling remains fixed at `720/720`.

### Reviewer
- Main-agent screenshot-driven V1/V2 framework inspection, V2 sidebar selected-session visibility fix, neutral sidebar chrome CSS, targeted/full TS verification, lint, dist rebuild, and post-build screenshot verification completed for this slice. No full Sessions And Projects subsystem PASS, Message Timeline subsystem PASS, stream/replay PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Active Subagent Main Loading TS Migration

### Scope
- Re-checked the active frontend rewrite goal, V1 parity standard, remaining `test_session_selection_ui.py` assertions, and the V2 secondary-surface return path before editing.
- Fixed a V2 parity gap: returning from an active subagent secondary view to the same main chat session now shows the bounded main-session loading frame instead of instantly exposing the timeline with no transition.
- Added an explicit `contentLoadingKey` handoff from `AppShell` to `ChatWorkspace` so same-session content activation can request a loading frame without clearing the live run stream or pretending the session id changed.
- Kept the trigger scoped to primary chat returns from another shell surface or active subagent view; normal same-session sidebar selection in the already-mounted chat surface does not get a spurious loading frame.
- Migrated the old active-subagent-to-main loading Python UI assertion into focused TypeScript coverage and removed that assertion from `tests/integration_tests/frontend/test_session_selection_ui.py`.
- Rebuilt `frontend/dist/app` so the served `/app/` bundle contains the same-session content activation loading behavior (`/app/assets/index-DJc5aSiS.js`).

### Verification
- `npm run test -- src/test/ChatWorkspace.test.tsx` passed with coverage that content activation shows a loading frame without clearing the run stream and keeps all session-scoped child surfaces on the same session.
- `npm run test -- src/test/AppShell.test.tsx -t "clears the active subagent view"` passed with coverage for sidebar return from an active subagent view into the main chat loading frame.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_session_selection_ui.py` passed after deleting the migrated Python assertion.
- `npm run lint` passed.
- `npm run build` passed and regenerated the V2 static app bundle.

### Reviewer
- Main-agent V2 same-session active-subagent return loading implementation, targeted TS/Python verification, lint, dist rebuild, and old Python UI harness reduction completed for this slice. `test_session_selection_ui.py` still has 3 unmigrated V1 edge-case assertions; no full Sessions And Projects subsystem PASS, Message Timeline subsystem PASS, stream/replay PASS, browser screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Terminal View Mark Retry TS Migration

### Scope
- Re-checked the active frontend rewrite goal, Sessions And Projects / Run Recovery checklist items, remaining `test_session_selection_ui.py` terminal-view assertions, and current V2 `AppShell` terminal-view mark behavior before editing.
- Fixed a V2 parity gap: selected unread terminal runs now retry `markSessionTerminalRunViewed` when the backend returns `{ status: "deferred" }` or a transient API error (`429`, `502`, `503`, `504`) instead of treating the optimistic unread clear as final after one attempt.
- Kept the retry bounded to terminal-view marking only, with cache invalidation after success or final failure and key release on final failure so a later sidebar refresh can retry the same terminal run.
- Migrated the old deferred and overloaded terminal-view Python UI assertions into `AppShell.test.tsx` and removed those two assertions from `tests/integration_tests/frontend/test_session_selection_ui.py`.
- Rebuilt `frontend/dist/app` so the served `/app/` bundle contains the retry behavior (`/app/assets/index-BaYHMKrU.js`).

### Verification
- `npm run test -- src/test/AppShell.test.tsx -t "terminal view marks"` passed after covering deferred and overloaded retry behavior.
- `npm run test -- src/test/AppShell.test.tsx` passed all AppShell tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_session_selection_ui.py` passed after deleting the migrated Python assertions.
- `npm run build` passed and regenerated the V2 static app bundle.
- `npm run lint` passed.

### Reviewer
- Main-agent V2 terminal-view retry implementation, targeted TS/Python verification, dist rebuild, and old Python UI harness reduction completed for this slice. No full Sessions And Projects subsystem PASS, Run Recovery subsystem PASS, browser sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Cross-Session Subagent Selection TS Migration

### Scope
- Re-checked the active frontend rewrite goal, Sessions And Projects / Subagents checklist items, remaining `test_session_selection_ui.py` assertions, and existing V2 `SessionsSidebar` / `AppShell` behavior before editing.
- Migrated the V1 expanded-subagent and cross-session subagent selection intent to V2 TypeScript evidence: subagent lists are fetched only after the parent row is expanded, selecting a subagent from another workspace updates the parent session and workspace selection first, and the shell keeps the subagent secondary workspace surface active instead of hydrating the main chat timeline.
- Removed only the two migrated Python assertions from `tests/integration_tests/frontend/test_session_selection_ui.py`; stale same-session selection, terminal mark retry/defer/cancel, and active-subagent-to-main loading remain pending.
- Kept production code and `frontend/dist/app` unchanged because the V2 sidebar and shell already implement this boundary through `SessionsSidebar.selectSubagent`, `useUiStore`, and the `SubagentSessionView` shell route.

### Verification
- `npm run test -- src/test/AppShell.test.tsx -t "cross-session subagent|subagent surface"` passed with coverage for the subagent secondary surface and pending session-detail resolution not restoring the main timeline.
- `npm run test -- src/test/SessionsSidebar.test.tsx -t "subagent sessions|cross-workspace parent"` passed with coverage for expansion-gated subagent loading and cross-workspace parent selection before opening a subagent.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_session_selection_ui.py` passed after deleting the migrated Python assertions.

### Reviewer
- Main-agent V2 sidebar/shell subagent boundary coverage and partial old Python UI harness reduction completed for this slice. No full Sessions And Projects subsystem PASS, Subagents subsystem PASS, AG-UI Runtime Stream PASS, browser sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Session Switch Loading Frame TS Migration

### Scope
- Re-checked the active frontend rewrite goal, Product Parity Checklist, Quality Gates, current V2 shell layout, and the remaining `test_session_selection_ui.py` loading-frame assertions before editing.
- Added a V2 `ChatWorkspace` session-switch loading frame: when the selected session changes, the active run stream is cleared, all session-scoped child surfaces receive the new session id immediately, and the timeline row stays covered by a nonblocking loading state for one animation frame.
- Kept the loading frame bounded to the timeline grid row so it does not affect the sidebar, settings navigation, token strip, composer, or the fixed one-page workspace shell.
- Removed the two old Python assertions that checked V1 `frontend/dist/js/session.js` and `interface.css` strings for nonblocking content-switch loading; the migrated behavior now has React component and shared CSS coverage.
- Rebuilt `frontend/dist/app` so the served `/app/` bundle contains the session-switch loading frame.

### Verification
- `npm run test -- src/test/ChatWorkspace.test.tsx` passed with coverage for stream clearing, all session-scoped surfaces moving to the new session, and a visible fast-switch loading frame.
- `npm run test -- src/test/ShellLayoutCss.test.ts -t "session switch loading|chat shell"` passed with CSS checks for the fixed chat shell and timeline-bounded loading row.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_session_selection_ui.py` passed after deleting the migrated Python assertions.
- `npm run build` passed and regenerated the V2 static app bundle.
- `npm run lint` passed.
- Browser live layout inspection after reloading `http://127.0.0.1:8000/app/` with `/app/assets/index-B4Pmfwm0.js` reported `bodyScrollHeight == bodyClientHeight == 871`, `documentScrollHeight == documentClientHeight == 871`, `body` and `#root` overflow hidden, sidebar width `280px`, chat/workspace height `819px`, timeline frame height `597px`, and composer contained at `y=681`.
- Browser screenshot capture was attempted twice through the in-app browser and both attempts timed out inside `Page.captureScreenshot`; no screenshot sign-off is claimed for this slice.

### Reviewer
- Main-agent V2 session-switch loading implementation, targeted TS/CSS/Python verification, dist rebuild, lint, and live browser layout inspection completed for this slice. No full Sessions And Projects subsystem PASS, Message Timeline subsystem PASS, stream/replay PASS, reviewer sign-off, screenshot sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Session Foreground Recovery TS Migration

### Scope
- Re-checked the active frontend rewrite goal, Sessions And Projects / Run Recovery / AG-UI Runtime Stream checklist items, current V2 `RecoveryBar` auto-stream behavior, and the old `test_select_session_prepares_foreground_streams_after_state_switch` V1 harness before editing.
- Migrated the foreground stream preparation intent to V2 TypeScript evidence: after the recovery surface moves from one selected session to another, the new session recovery snapshot is fetched and its active run starts as a foreground stream with the new session id and latest event cursor.
- Removed only the migrated Python assertion from `tests/integration_tests/frontend/test_session_selection_ui.py`; the remaining stale-selection, terminal retry/defer, cross-session subagent, active-subagent loading, and loading-frame assertions remain pending for later migration.
- Kept production code unchanged because V2 already prepares foreground recovery streams from the session-scoped `RecoveryBar` snapshot after `ChatWorkspace` moves to the new session.

### Verification
- `npm run test -- src/test/RecoveryBar.test.tsx -t "newly selected session|live active run stream|multiplex stream"` passed with the new selected-session foreground recovery coverage and adjacent active/multiplex recovery cases.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_session_selection_ui.py` passed after deleting the migrated Python UI assertion.

### Reviewer
- Main-agent V2 foreground recovery stream coverage and partial old Python UI harness reduction completed for this slice. No full Sessions And Projects subsystem PASS, Run Recovery subsystem PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Session Selection Subagent Boundary TS Migration

### Scope
- Re-checked the active frontend rewrite goal, Sessions And Projects / Subagents checklist items, current V2 `AppShell` secondary-surface behavior, and the old `test_select_subagent_cancels_pending_main_session_hydration` V1 harness before editing.
- Migrated the pending-main-hydration cancellation intent to V2 TypeScript evidence: when main session detail is still resolving, opening a subagent session keeps the subagent secondary workspace surface active, and the later main session detail resolution does not resurrect the main chat timeline.
- Removed only the migrated Python assertion from `tests/integration_tests/frontend/test_session_selection_ui.py`; the remaining session selection, cross-session subagent, loading-frame, retry/deferred terminal mark, and foreground stream preparation assertions remain pending for later migration.
- Kept production code unchanged because V2 already models subagent sessions as a shell secondary surface independent of the main session detail query.

### Verification
- `npm run test -- src/test/AppShell.test.tsx -t "subagent surface|right drawer entrypoints|sidebar returns to chat"` passed with the new pending-detail subagent boundary coverage and adjacent shell-subagent cases.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_session_selection_ui.py` passed after deleting the migrated Python UI assertion.

### Reviewer
- Main-agent V2 shell/subagent boundary coverage and partial old Python UI harness reduction completed for this slice. No full Sessions And Projects subsystem PASS, Subagents subsystem PASS, Browser Checks completion, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Session Selection Terminal Mark TS Migration

### Scope
- Re-checked the active frontend rewrite goal, Sessions And Projects / Run Recovery checklist items, current V2 `AppShell` selected-session behavior, and the old `test_session_selection_ui.py` terminal-view selection assertions before editing.
- Migrated the V1 terminal-view marking intent to V2 TypeScript evidence: the selected sidebar session record triggers the real `markSessionTerminalRunViewed` API without relying on sidebar DOM rows, terminal mark completion invalidates sidebar/detail caches, and a newer terminal run for the same selected session is marked again instead of being masked by the previous viewed key.
- Removed the two migrated terminal-view selection functions from `tests/integration_tests/frontend/test_session_selection_ui.py`; the remaining fast-switch, subagent cancellation, loading-frame, retry/deferred terminal mark, and foreground stream preparation assertions stay in place for later V2 migration slices.
- Kept production code unchanged because V2 already implements selected-session terminal marking in `AppShell` through React Query cache updates and the real terminal-view endpoint.

### Verification
- `npm run test -- src/test/AppShell.test.tsx -t "terminal runs viewed|first available session"` passed with the new selected-terminal mark coverage and adjacent session selection coverage.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_session_selection_ui.py` passed after deleting the two migrated Python UI assertions.

### Reviewer
- Main-agent V2 selected-session terminal-view coverage and partial old Python UI harness reduction completed for this slice. No full Sessions And Projects subsystem PASS, Run Recovery subsystem PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Session Sidebar Store TS Migration

### Scope
- Re-checked the active frontend rewrite goal, Sessions And Projects checklist, existing V2 `SessionsSidebar`/`Composer`/`useRunStreamController` coverage, and the old `test_session_sidebar_store_ui.py` V1 store harness before editing.
- Migrated the V1 sidebar store intent to V2 TypeScript evidence: starting a run refreshes the sidebar session query, stopping a run refreshes the sidebar query while suppressing stale recovery targets, terminal stream closure refreshes sidebar/messages/token/recovery data, locally terminal transport interruptions do not reconnect and still refresh the sidebar, deleted sessions clear selection and invalidate sidebar/detail caches, and terminal/unread/background indicators render from real sidebar session records.
- Kept production code unchanged because V2 intentionally uses React Query session caches and API refetches instead of the old `frontend/dist/js/components/sessionSidebarStore.js` optimistic store.
- Removed `tests/integration_tests/frontend/test_session_sidebar_store_ui.py` after its remaining V2-relevant behavior was covered by focused TypeScript tests and existing sidebar rendering coverage.

### Verification
- `npm run test -- src/test/Composer.test.tsx -t "sidebar|stops an active run"` passed with the new Composer cache-refresh coverage and adjacent sidebar/topology cases.
- `npm run test -- src/test/RunStreamController.test.tsx -t "sidebar|token usage|locally terminal"` passed with the stream-close and local-terminal refresh coverage.
- `npm run test -- src/test/SessionsSidebar.test.tsx -t "session deletion|terminal run indicators|background work"` passed with the sidebar delete and status-rendering coverage.
- `uv run --extra dev ruff check tests/integration_tests/frontend` passed after deleting the old Python UI harness file.

### Reviewer
- Main-agent V2 sidebar cache-refresh coverage and old Python UI harness removal completed for this slice. No full Sessions And Projects subsystem PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Recovery Background Task TS Migration

### Scope
- Re-checked the active frontend rewrite goal, Run Recovery / Browser Checks requirements, existing V2 RecoveryBar/RunStreamController/browser coverage, and the old `test_recovery_background_tasks_ui.py` harness before editing.
- Migrated the remaining V1 recovery/background-task intent to V2 TypeScript behavior: recovery force-refreshes on window focus, foreground command task records do not open background task UI or streams, active background tasks render with stop/collapse behavior, stopped recoverable runs stay explicit, background subagent streams multiplex correctly, and terminal/stale recovery targets are suppressed by the run stream controller.
- Kept production code unchanged because V2 already implements recovery through `RecoveryBar`, `useRunStreamController`, and browser-tested recovery flows rather than the old V1 `recovery.js` facade.
- Removed `tests/integration_tests/frontend/test_recovery_background_tasks_ui.py` after its remaining V2-relevant behavior was covered by component, controller, and existing browser tests.

### Verification
- `npm run test -- src/test/RecoveryBar.test.tsx` passed all 27 RecoveryBar tests.
- `npm run test -- src/test/RunStreamController.test.tsx -t "recovery|background|terminal|multiplex"` passed 13 focused stream-controller tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend` passed after deleting the old Python UI harness file.

### Reviewer
- Main-agent V2 recovery/background-task coverage and old Python UI harness removal completed for this slice. No full Run Recovery subsystem PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Runtime Injection TS Migration

### Scope
- Re-checked the active frontend rewrite goal, Composer/Run Controls checklist, existing V2 Composer/MessageTimeline/browser coverage, and the old `test_runtime_inject_ui.py` harness before editing.
- Migrated the remaining V1 runtime-injection intent to V2 TypeScript evidence: Queue and Interrupt operate through the active AG-UI run injection API instead of creating a new run; successful queued injection clears the draft and refreshes recovery state; runtime injection rows render through live/replay timeline events; persisted round injection messages render inside tool-heavy history.
- Kept production code unchanged because V2 already routes active-run injection through `injectRunMessage`, renders `injection_enqueued`/`injection_applied` runtime events in `MessageTimeline`, and has browser coverage for active real-SSE injection.
- Removed `tests/integration_tests/frontend/test_runtime_inject_ui.py` after its remaining V2-relevant behavior was covered by focused TypeScript tests and existing browser/runtime evidence.

### Verification
- `npm run test -- src/test/Composer.test.tsx -t "runtime injection|queues an injection|queued runtime injection|interrupts an active run|text-only"` passed with 6 focused Composer tests.
- `npm run test -- src/test/MessageTimeline.test.tsx -t "injection|coordination events"` passed with 4 focused MessageTimeline tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend` passed after deleting the old Python UI harness file.

### Reviewer
- Main-agent V2 runtime-injection coverage and old Python UI harness removal completed for this slice. No full Composer subsystem PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Agent Panel Shell Boundary TS Migration

### Scope
- Re-checked the active frontend rewrite goal, current remaining Python UI harness inventory, and the old `test_agent_panel_index_ui.py` assertions before editing.
- Migrated the V1 Agent Panel index intent to V2 shell coverage: subagent sessions now open as a secondary workspace surface instead of a right drawer/right rail, primary sidebar navigation clears the active subagent surface, and returning to chat from the sidebar clears only the active subagent view while preserving the selected session/workspace state.
- Kept production code unchanged because V2 already models subagent drill-in as a `SubagentSessionView` workspace route and the V1 right drawer entrypoints are not part of the React shell.
- Removed `tests/integration_tests/frontend/test_agent_panel_index_ui.py` after its remaining V2-relevant shell boundary behavior was covered in `AppShell.test.tsx`.

### Verification
- `npm run test -- src/test/AppShell.test.tsx` passed all 22 AppShell tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend` passed after deleting the old Python UI harness file.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 shell boundary coverage and old Python UI harness removal completed for this slice. No full Application Shell subsystem PASS, Subagents subsystem PASS, Browser Checks completion, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 I18n TS Migration

### Scope
- Re-checked the active frontend rewrite goal and remaining V1 `test_i18n_ui.py` harness before editing.
- Migrated the V1 i18n module intent to V2 TypeScript coverage: core shell copy translates between English and Chinese, Chinese authentication/model labels remain readable, and translated status messages interpolate runtime values.
- Reused existing `AppShell.test.tsx` coverage for the user-visible shell language toggle instead of preserving V1's DOM `data-i18n` scanner implementation.
- Removed `tests/integration_tests/frontend/test_i18n_ui.py` after its remaining V2-relevant behavior was covered by `i18n.test.ts` and existing shell language-switch coverage.

### Verification
- `npm run test -- src/test/i18n.test.ts` passed all 3 i18n tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend` passed after deleting the old Python UI harness file.
- `npm run lint` passed for the frontend and desktop TypeScript projects.

### Reviewer
- Main-agent V2 i18n coverage, old Python UI harness removal, and focused regression verification completed for this slice. No full settings/shell subsystem PASS, Browser Checks completion, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Session View Boundary TS Migration

### Scope
- Re-checked the active frontend rewrite goal, inspected the live `/app/` DOM/layout state, and reviewed the remaining V1 `test_session_view_ui.py` harness before editing.
- Verified through live DOM metrics that the current V2 shell is constrained to one viewport: document scrolling is not active, workspace/body overflow is hidden, and the timeline owns message scrolling. Browser screenshot capture through the in-app browser timed out, and desktop capture could not see the browser surface, so no screenshot-based sign-off is claimed for this slice.
- Migrated the V1 main-session restore/switch boundary intent to V2 `ChatWorkspace` component behavior: when the session changes, the active run stream is cleared and every session-scoped child surface (`RecoveryBar`, `MessageTimeline`, `SessionTokenUsage`, and `Composer`) moves to the new session id instead of continuing to render against the old session.
- Removed `tests/integration_tests/frontend/test_session_view_ui.py` after its remaining user-facing switch-boundary intent was covered by V2 TypeScript tests.

### Verification
- `npm run test -- src/test/ChatWorkspace.test.tsx` passed all 2 ChatWorkspace tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend` passed after deleting the old Python UI harness file.
- `npm run lint` passed for the frontend and desktop TypeScript projects.

### Reviewer
- Main-agent V2 session-boundary coverage, live DOM layout inspection, old Python UI harness removal, and focused regression verification completed for this slice. No full session switching/replay subsystem PASS, Browser Checks completion, screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Backend Status SDK TS Migration

### Scope
- Re-checked the active frontend rewrite goal and the remaining V1 `test_backend_status_sdk.py` harness before editing.
- Migrated the V1 initializing/online backend-status hint intent to V2 shell behavior: while health is initializing, the sidebar backend status shows the checking label with `aria-busy="true"`; once health resolves online, it shows the connected label with `aria-busy="false"`.
- Kept production code unchanged because V2 already derives sidebar backend status from the health query and the real sidebar renders the busy accessibility state.
- Removed `tests/integration_tests/frontend/test_backend_status_sdk.py` after its user-visible behavior was covered by `AppShell.test.tsx`.

### Verification
- `npm run test -- src/test/AppShell.test.tsx` passed all 20 AppShell tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend` passed after deleting the old Python SDK harness file.
- `npm run lint` passed for the frontend and desktop TypeScript projects.

### Reviewer
- Main-agent V2 shell coverage, old Python SDK harness removal, and focused regression verification completed for this slice. No full backend-status subsystem PASS, Browser Checks completion, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Connector Cards TS Migration

### Scope
- Re-checked the active frontend rewrite goal and remaining V1 `test_connector_cards_ui.py` harness before editing, then moved this slice to V2 component coverage instead of continuing to assert generated `frontend/dist` markup strings.
- Preserved the V1 connector/runtime-tool separation: the internal `relay-knowledge` connector is no longer rendered as a connector card or detail panel, while `Relay Knowledge CLI` remains visible and actionable in the CLI tools section.
- Added V2 coverage for connector loading without false empty states, fixed CLI tool cards during runtime-tool loading, runtime-tool load failure with retry, hidden full install paths with copy action, update/download actions, and system PATH action wiring.
- Removed `tests/integration_tests/frontend/test_connector_cards_ui.py` after its remaining behavior was covered by V2 TypeScript tests or by V2's non-fake loading state.
- Rebuilt `frontend/dist/app` so the served `/app/` bundle includes the connector visibility filtering.

### Verification
- `npm run test -- src/test/ConnectorsView.test.tsx` passed all 8 ConnectorsView tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend` passed after deleting the old Python UI harness file.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the static app bundle (`index-E62bjsBv.js`, `index-Bng0LR7m.css`).

### Reviewer
- Main-agent V2 production filtering, component coverage, old Python UI harness removal, and focused regression verification completed for this slice. No full Connector subsystem PASS, Browser Checks completion, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Round Scroll Controller TS Migration

### Scope
- Re-checked the active frontend rewrite goal, Rounds/Todos/History checklist items, existing V2 round rail coverage, and the remaining V1 `test_round_scroll_controller_ui.py` harness before editing.
- Migrated the V1 finite active-state lock intent to V2 `MessageTimeline` component behavior: after selecting a later round, visible earlier rows do not immediately steal the active rail state; once the selected round reaches the viewport the lock releases, and normal viewport-driven active syncing resumes when scrolling back.
- Reused existing V2 scroll preservation coverage for the V1 scroll-anchor intent: near-bottom follow, away-from-bottom preservation, tool-detail inspection preservation, and replay hydration anchor restoration are already covered in `MessageTimeline.test.tsx`.
- Removed `tests/integration_tests/frontend/test_round_scroll_controller_ui.py` after its remaining UI behavior was covered by V2 TypeScript tests.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "round rail active lock|renders the round rail|preserves the anchored row|preserves scroll position"` passed with the new active-lock coverage and adjacent round/scroll preservation cases.
- `uv run --extra dev ruff check tests/integration_tests/frontend` passed after deleting the old Python UI harness file.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `rg -n 'test_round_scroll_controller_ui|round_completion_scroll_policy|round_timeline_active_state|round rail active lock' frontend/app/src/test/MessageTimeline.test.tsx tests/integration_tests/frontend docs/goals/frontend-rewrite/implementation-ledger.md` returned only the new V2 coverage and ledger evidence.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 component coverage, old Python UI harness file removal, and focused regression verification completed for this slice. No Rounds/Todos/History subsystem PASS, Message Timeline subsystem PASS, Browser Checks completion, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Remaining Streaming Tool UI TS Migration

### Scope
- Re-checked the active frontend rewrite goal, Message Timeline / AG-UI Runtime Stream checklist items, and the two remaining V1 `test_streaming_tool_ui.py` harnesses before editing.
- Migrated the V1 `test_live_streaming_tool_overlay_skips_processed_group_summary` intent to V2 behavior: hydrated text for an open stream appears only once, while later live tool and approval rows for that same run remain visible instead of being collapsed with already-processed output.
- Migrated the V1 `test_main_agent_tool_event_routes_to_coordinator_before_role_options_load` intent to V2 behavior: a `MainAgent` `spawn_subagent` tool call renders in the selected main runtime stream with run, role, and instance metadata even without separate role metadata hydration.
- Improved runtime tool-call preview selection so object args with a `description` field render that useful description instead of the opening `{` from the JSON details body.
- Removed `tests/integration_tests/frontend/test_streaming_tool_ui.py` after its remaining UI behavior coverage moved to V2 TypeScript component tests.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "live tool and approval rows|MainAgent tool calls before role metadata hydration|keeps only a live cursor|visible subagent runtime tool calls"` passed with the new migration coverage and adjacent hydration/subagent cases.
- `npm run test -- src/test/MessageTimeline.test.tsx` passed all 109 Message Timeline tests after the production preview change.
- `uv run --extra dev ruff check tests/integration_tests/frontend` passed after deleting the old Python UI harness file.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the static app bundle (`index-a7iOuACV.js`, `index-Bng0LR7m.css`).
- `rg -n 'test_live_streaming_tool_overlay_skips_processed_group_summary|test_main_agent_tool_event_routes_to_coordinator_before_role_options_load|test_streaming_tool_ui|keeps live tool and approval rows|renders MainAgent tool calls before role metadata hydration' frontend/app/src/test/MessageTimeline.test.tsx tests/integration_tests/frontend docs/goals/frontend-rewrite/implementation-ledger.md` confirmed the old harness names remain only as ledger history while the new V2 tests are present.
- `Select-String -Path 'frontend\app\src\features\timeline\MessageTimeline.tsx' -SimpleMatch 'objectRawString(parsed, "description")'` confirmed the production preview fallback is present.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 production preview improvement, component coverage, old Python UI harness file removal, and focused regression verification completed for this slice. No full Streaming Tool subsystem PASS, Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, Electron sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Visible Subagent Tool Stream TS Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining V1 frontend UI harnesses, and the Message Timeline / AG-UI Runtime Stream checklist before editing.
- Migrated the V1 `test_visible_normal_subagent_tool_call_uses_live_renderer_overlay` intent from a mocked `frontend/dist` event-router harness to V2 behavior: a normal-mode subagent `tool_call` does not render in the parent runtime stream, but does render in the selected subagent stream with the original command preview.
- Verified the rendered subagent tool row keeps `data-run-id`, `data-role-id`, and `data-instance-id` metadata for replay/recovery targeting.
- Removed the replaced V1 Python harness from `tests/integration_tests/frontend/test_streaming_tool_ui.py`.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "visible subagent runtime tool calls|scopes and deduplicates runtime stream rows by run"` passed with the new subagent stream coverage and adjacent run-scoping coverage.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_streaming_tool_ui.py` passed after deleting the migrated Python function.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `rg -n 'test_visible_normal_subagent_tool_call_uses_live_renderer_overlay|renders visible subagent runtime tool calls|call-visible-subagent|subagent_run_live|subagent-body' tests/integration_tests/frontend/test_streaming_tool_ui.py frontend/app/src/test/MessageTimeline.test.tsx docs/goals/frontend-rewrite/implementation-ledger.md` returned only the new V2 coverage and ledger evidence.
- `git diff --check` passed after normalizing the edited Python file tail.

### Reviewer
- Main-agent V2 component coverage, old Python UI test function removal, and focused regression verification completed for this slice. No full Streaming Tool subsystem PASS, Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, Electron sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Processed Transcript Grouping TS Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining V1 frontend UI harnesses, and the Message Timeline / history checklist before editing.
- Migrated the V1 `test_processed_transcript_grouping_is_shared_and_not_history_scoped` intent from implementation-string assertions to V2 behavior: when the same transcript message arrives through both top-level session messages and round transcript messages, V2 renders it only once, keeps collapsed-history message counts deduplicated, and still restores exactly one archived row when history is expanded.
- Kept production behavior unchanged because V2 already deduplicates merged timeline messages globally by message id/fingerprint before inserting round markers and history dividers.
- Removed the replaced V1 Python static source harness from `tests/integration_tests/frontend/test_streaming_tool_ui.py`.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "deduplicates round transcript|collapses round history"` passed with the new dedupe coverage and adjacent collapsed-history behavior.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_streaming_tool_ui.py` passed after deleting the migrated Python function.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `rg -n 'test_processed_transcript_grouping_is_shared_and_not_history_scoped|deduplicates round transcript|normalizeProcessedTranscript|flattenTranscriptMessages|message-history-flow|tool-group-final-divider' tests/integration_tests/frontend/test_streaming_tool_ui.py frontend/app/src/test/MessageTimeline.test.tsx frontend/app/src/features/timeline/MessageTimeline.tsx docs/goals/frontend-rewrite/implementation-ledger.md` returned only the new TS coverage name and ledger note.

### Reviewer
- Main-agent V2 component coverage, old Python UI test function removal, and focused regression verification completed for this slice. No full Streaming Tool subsystem PASS, Message Timeline subsystem PASS, history/rounds subsystem PASS, Browser Checks completion, Electron sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Tagged Read And Bounded Tool Output TS Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining V1 frontend UI harnesses, and the Message Timeline / AG-UI Runtime Stream checklist before editing.
- Migrated the V1 `test_tool_blocks_parse_tagged_read_payloads_and_cap_large_diffs` intent from implementation-string assertions to V2 behavior: read tool returns with `<path>`, `<type>`, and `<content>` tags now render useful metadata/content without exposing raw tags, and very large tool outputs are bounded with a visible truncation notice.
- Added bounded tool return bodies for persisted and runtime tool results using a 200-line / 12000-character preview cap.
- Removed the replaced V1 Python static source harness from `tests/integration_tests/frontend/test_streaming_tool_ui.py`.
- Rebuilt `frontend/dist/app` so the served `/app/` bundle includes tagged read parsing and bounded tool output rendering.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "tagged read|successful tool return envelopes|failed persisted tool returns"` passed with the new tagged read and bounded output coverage plus adjacent tool-return cases.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_streaming_tool_ui.py` passed after deleting the migrated Python function.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the static app bundle (`index-CfkRO9hD.js`, `index-Bng0LR7m.css`).
- `rg -n 'test_tool_blocks_parse_tagged_read_payloads_and_cap_large_diffs|parses tagged read payloads|TOOL_RESULT_MAX_LINES|Preview truncated|parseReadPayload|MAX_WRITE_PREVIEW|tool-diff-no' tests/integration_tests/frontend/test_streaming_tool_ui.py frontend/app/src/test/MessageTimeline.test.tsx frontend/app/src/features/timeline/MessageTimeline.tsx docs/goals/frontend-rewrite/implementation-ledger.md` returned only the V2 production constants/truncation behavior, expanded TS coverage, and ledger notes.

### Reviewer
- Main-agent V2 production bounded-output parsing, component coverage, old Python UI test function removal, static bundle rebuild, and focused regression verification completed for this slice. No full Streaming Tool subsystem PASS, Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, Electron sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Tool Row Metadata TS Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining V1 frontend UI harnesses, and the Message Timeline / AG-UI Runtime Stream checklist before editing.
- Migrated the V1 `test_streaming_tool_calls_keep_indexed_dom_targets_and_message_metadata` intent from implementation-string assertions to V2 behavior: parallel same-name runtime tool events still bind by `tool_call_id`, and rendered runtime tool rows now expose `data-run-id`, `data-role-id`, and `data-instance-id` metadata for the resolved result row and remaining pending call row.
- Added `TimelineRow.instanceId` propagation for runtime text, thinking, tool, validation, and result rows, and exposed role/instance metadata as inert DOM attributes without changing visual layout.
- Removed the replaced V1 Python static source harness from `tests/integration_tests/frontend/test_streaming_tool_ui.py`.
- Rebuilt `frontend/dist/app` so the served `/app/` bundle includes the runtime row metadata attributes.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "out-of-order parallel runtime tool calls|same-name runtime tool calls"` passed with the expanded call-id and metadata coverage.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_streaming_tool_ui.py` passed after deleting the migrated Python function.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the static app bundle (`index-8KaC51q5.js`, `index-Bng0LR7m.css`).
- `rg -n 'test_streaming_tool_calls_keep_indexed_dom_targets_and_message_metadata|out-of-order parallel runtime tool calls|data-instance-id|data-role-id|indexPendingToolBlock|bindReusableToolBlocks|wrapper.dataset.runId' tests/integration_tests/frontend/test_streaming_tool_ui.py frontend/app/src/test/MessageTimeline.test.tsx frontend/app/src/features/timeline/MessageTimeline.tsx` returned only the V2 production attributes and expanded TS coverage.

### Reviewer
- Main-agent V2 production metadata propagation, component coverage, old Python UI test function removal, static bundle rebuild, and focused regression verification completed for this slice. No full Streaming Tool subsystem PASS, Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, Electron sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Late Tool Result Finalization TS Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining V1 frontend UI harnesses, and the Message Timeline / AG-UI Runtime Stream checklist before editing.
- Migrated the V1 `test_tool_result_updates_can_patch_dom_after_stream_finalize` intent from implementation-string assertions to V2 component behavior: a `tool_result` that arrives after `run_completed` still renders in the selected runtime timeline, while the closed stream does not regain a live text row or streaming cursor.
- Kept the production runtime behavior unchanged because V2 already derives the rendered timeline from the full runtime event list rather than requiring an imperative DOM patch target after finalization.
- Removed the replaced V1 Python static source harness from `tests/integration_tests/frontend/test_streaming_tool_ui.py`.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "late tool results|runtime tool results without a prior tool call|keeps completed runtime tool results"` passed with the new terminal-after-tool-result coverage and adjacent runtime tool result cases.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_streaming_tool_ui.py` passed after deleting the migrated Python function.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `rg -n 'test_tool_result_updates_can_patch_dom_after_stream_finalize|renders late tool results after terminal stream finalization|findToolBlockInContainer|resolveToolBlockTarget\(st, container' tests/integration_tests/frontend/test_streaming_tool_ui.py frontend/app/src/test/MessageTimeline.test.tsx frontend/app/src/features/timeline/MessageTimeline.tsx` returned only the new TS coverage name.

### Reviewer
- Main-agent V2 component coverage, old Python UI test function removal, and focused regression verification completed for this slice. No full Streaming Tool subsystem PASS, Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, Electron sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Stream Identity TS Migration

### Scope
- Re-checked the active frontend rewrite goal and product parity checklist, then selected a Message Timeline / AG-UI Runtime Stream gap instead of continuing only on the latest visual feedback.
- Migrated the V1 `test_stream_rebind_prefers_identity_before_label` intent to V2 `MessageTimeline` component coverage: two live `text_delta` streams with the same role label but different `instance_id` values stay as separate runtime rows, while later deltas for the same instance continue the original row.
- Kept the production runtime behavior unchanged because V2 already groups text and thinking rows by `runId` plus `instanceId` before falling back to `roleId`.
- Removed the replaced V1 Python static source harness from `tests/integration_tests/frontend/test_streaming_tool_ui.py`.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "same-role runtime streams|scopes and deduplicates runtime stream rows"` passed with the new identity coverage and adjacent run scoping coverage.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_streaming_tool_ui.py` passed after deleting the migrated Python function.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `rg -n 'test_stream_rebind_prefers_identity_before_label|keeps same-role runtime streams separate by instance identity|labelFallbacks|wrapperMatchesStreamKey' tests/integration_tests/frontend/test_streaming_tool_ui.py frontend/app/src/test/MessageTimeline.test.tsx frontend/app/src/features/timeline/MessageTimeline.tsx` returned only the new TS coverage name.

### Reviewer
- Main-agent V2 component coverage, old Python UI test function removal, and focused regression verification completed for this slice. No full Streaming Tool subsystem PASS, Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, Electron sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Tool Input Preview Alias Parity

### Scope
- Re-checked the active frontend rewrite goal, remaining frontend Python UI harnesses, and the streaming/tool V1 harness before editing.
- Migrated the V1 `test_tool_blocks_extract_effective_inputs_instead_of_footer_status` intent to V2 `MessageTimeline` component coverage: runtime tool-call previews now prefer effective input fields for shell commands, file paths, search queries, and URLs instead of incidental status/footer fields.
- Fixed V2 `toolCallPreview()` to recognize V1-compatible aliases: `file_path`, `filepath`, `target_path`, `q`, `search_query`, and `uri`.
- Removed the replaced V1 Python UI harness function from `tests/integration_tests/frontend/test_streaming_tool_ui.py`.
- Rebuilt `frontend/dist/app` so the served `/app/` bundle includes the preview alias fix.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "effective tool inputs|normalizes string tool args|renders tool calls, results"` passed with the new alias coverage and adjacent tool rendering coverage.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_streaming_tool_ui.py` passed after deleting the migrated Python function.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the static app bundle (`index-CwFO4o2F.js`).
- `rg -n 'test_tool_blocks_extract_effective_inputs_instead_of_footer_status|effective tool inputs|tool-detail-footer|tool-result-status' tests/integration_tests/frontend/test_streaming_tool_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned only the new TS coverage name.

### Reviewer
- Main-agent V2 production fix, component coverage, old Python UI test function removal, static bundle rebuild, and focused regression verification completed for this slice. No full Streaming Tool subsystem PASS, Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, Electron sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Same-Name Tool Call TS Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining frontend Python UI harnesses, and the streaming/tool V1 harness before editing.
- Migrated the V1 `test_pending_tool_block_name_fallback_does_not_merge_parallel_calls` behavior to V2 `MessageTimeline` component coverage: two live `tool_call` events with the same `tool_name` and no `tool_call_id` now render as two separate tool blocks with separate previews.
- Kept the production runtime behavior unchanged because V2 already merges completed tool calls only by `tool_call_id`, not by tool name fallback.
- Removed the replaced V1 Python UI harness function from `tests/integration_tests/frontend/test_streaming_tool_ui.py` while leaving the still-unmigrated streaming/tool harness cases in place.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "same-name runtime tool calls|out-of-order parallel runtime tool calls"` passed with the new no-call-id same-name case and the adjacent call-id merge case.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_streaming_tool_ui.py` passed after deleting the migrated Python function.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `rg -n 'test_pending_tool_block_name_fallback_does_not_merge_parallel_calls|same-name runtime tool calls|resolvePendingToolBlock\(pending, "shell", null\)' tests/integration_tests/frontend/test_streaming_tool_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned only the new TS coverage name.

### Reviewer
- Main-agent V2 component coverage, old Python UI test function removal, and focused regression verification completed for this slice. No full Streaming Tool subsystem PASS, Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, Electron sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Tool Return Media Preview Parity

### Scope
- Re-checked the active frontend rewrite goal and the product parity checklist before editing, then selected a Message Timeline / Resource parity gap from the remaining `test_message_rich_content_ui.py` V1 harness instead of staying on the last visual complaint.
- Updated V2 `MessageTimeline` tool result rendering so persisted `tool-return` content and live/replayed `tool_result` payloads extract nested `media_ref` entries from real tool result containers such as `data.content`, `content`, `parts`, `output`, or `result`.
- Reused the existing `MessageMediaPreview` component inside tool result details, so image results open through the same Ant Image preview path as normal message media and non-image media keep the existing resource-link behavior.
- Preserved the previous workspace text image preview behavior and added adjacent TS coverage for both persisted and runtime tool-return media previews.
- Removed the replaced V1 rich-content Python UI harness: `tests/integration_tests/frontend/test_message_rich_content_ui.py`.
- Rebuilt `frontend/dist/app` so the served `/app/` bundle includes the tool-return media preview fix.
- While running the full `MessageTimeline` component suite, tightened two existing test edges: round rail selection now uses explicit timeline geometry instead of JSDOM zero-layout assumptions, and the injection supersede assertion ignores the intentional open-stream idle cursor row while still verifying the visible content rows.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "tool result media_ref|persisted tool returns|workspace image previews|image media references|runtime tool results"` passed with nine focused media/tool cases.
- `npm run test -- src/test/MessageTimeline.test.tsx` passed with all 100 component tests.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the static app bundle (`index-CsttXSIX.js`).
- `rg --files tests/integration_tests/frontend | rg "test_message_rich_content_ui\\.py|message_rich_content"` returned no matches after deleting the legacy Python UI harness.

### Reviewer
- Main-agent V2 tool-return media preview implementation, focused and full component coverage, old Python UI harness removal, static bundle rebuild, and scoped regression verification completed for this slice. No full Message Timeline subsystem PASS, Resource/Assistive Features PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, final V1/V2 visual audit sign-off, Electron sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Workspace Text Image Preview Parity

### Scope
- Re-checked the active frontend rewrite goal, captured the current V2 `/app/` frame, and compared V1/V2 DOM layout metrics before editing. Both V1 and V2 are fixed to the viewport with 280px sidebar and 52px top bar, so this slice did not make a speculative shell-width change.
- Identified a concrete V1 rich-content parity gap from `test_message_rich_content_ui.py`: V1 appends an image preview when persisted text mentions a workspace image path such as `` `ai_briefing.png` ``.
- Added V2 `buildWorkspaceImagePreviewUrl()` support for `/api/workspaces/{workspace_id}/preview-file?path=...`.
- Passed the selected session workspace id from `AppShell` through `ChatWorkspace` into `MessageTimeline`.
- Updated `MessageTimeline` text rendering so persisted top-level text, nested message content, and structured text parts append previewable image media for workspace image paths while leaving runtime messages without workspace context unchanged.
- Added V2 component coverage proving workspace image paths in persisted text render as Ant Image previews, and that the same text does not request a preview when no workspace id is available.
- Rebuilt `frontend/dist/app` so the served `/app/` bundle includes the workspace text image preview fix.
- Kept this slice focused on Message Timeline / resource preview parity. No sidebar entries, Settings sections, secondary-page routing, message stream state, or V1 Python harness files were removed in this slice.

### Verification
- Captured current V2 screenshot/metrics at `.tmp/frontend-goal-audit/current-visible.png`; document/root scroll height matched viewport height and composer stayed in the fixed app frame.
- Compared V1 DOM metrics from `http://127.0.0.1:8000/`; V1 also used a fixed viewport shell with 280px sidebar and 52px top bar, so no shell-width edit was made.
- `npm run test -- src/test/MessageTimeline.test.tsx -t "workspace image previews|image media references"` passed with four focused media preview cases.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the static app bundle (`index-BRq1fhQ9.js`).

### Reviewer
- Main-agent V2 rich-content parity implementation, component coverage, actual V1/V2 frame inspection, static bundle rebuild, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, Resource/Assistive Features PASS, Browser Checks completion, final V1/V2 visual audit sign-off, Electron sign-off, release cleanup sign-off, Python UI harness removal, or V2 frontend completion is claimed.

## 2026-06-29 Live Retry Round Projection TS Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining Python UI harness list, and the V1 `test_retry_status_ui.py` behavior before editing, then chose this slice because live retry projection is part of the high-risk streaming/replay parity path.
- Fixed V2 `MessageTimeline` round composition so live `llm_retry_*` and `llm_fallback_*` runtime events are merged into the matching round's `retry_events`, reusing the existing round marker and rail summary renderer instead of adding a parallel visual path.
- Preserved terminal semantics for live retry state: completed runs clear temporary retry summaries, while terminal retry/fallback failure events can still surface their final failed state.
- Added V2 component coverage for live retry events appearing in both the round marker and round rail, then disappearing once the run completes.
- Removed the replaced V1 `frontend/dist/js/app/retryStatus.js` Python UI harness file: `tests/integration_tests/frontend/test_retry_status_ui.py`.
- Rebuilt `frontend/dist/app` so the served `/app/` bundle includes the live retry round projection fix.
- Kept this slice focused on live retry stream/replay semantics and UI-test migration. No sidebar entries, Settings sections, secondary-page routing, visible shell layout, or final visual audit status changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "live retry|round pending actions"` passed with the new live retry case and adjacent persisted retry/round metadata coverage.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the static app bundle (`index-9dooR7n1.js`).
- `rg --files tests/integration_tests/frontend | rg "test_retry_status_ui\\.py|retry_status"` returned no matches after deleting the legacy Python UI harness.
- `rg -n "projects live retry events|test_retry_status_updates_single_round_card|Retry scheduled: attempt 2/6|runtimeRetryEventsForRound" frontend/app/src/test/MessageTimeline.test.tsx tests/integration_tests/frontend frontend/app/src/features/timeline/MessageTimeline.tsx -S` returned the new TS coverage and production helper, with no old Python test name.

### Reviewer
- Main-agent V2 live retry projection implementation, component coverage, old Python UI test removal, static bundle rebuild, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, final V1/V2 visual audit sign-off, Electron sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Overlay Final Python Harness Removal

### Scope
- Re-checked the active frontend rewrite goal, remaining `test_stream_session_overlay_ui.py` cases, Message Timeline parity checklist items, and current V2 message/round projection before editing.
- Fixed V2 `MessageTimeline` persisted history projection so round-only messages from `coordinator_messages` and `injection_messages` are merged into the timeline, deduped against `/sessions/{id}/messages`, sorted by timestamp, and rendered with the same tool/thinking/media/text part pipeline.
- Added persisted injection rendering using the same `Injection applied`/`Injection queued` summary language as runtime injection events, so injected guidance that exists only in round data is visible in dense history.
- Added V2 component coverage for the last three legacy stream overlay semantics: live subagent overlay renders as a separate row beside persisted history, round-only injection remains ordered inside failed-tool history, and closed stream finalization keeps real text while removing the cursor.
- Removed the final V1 `frontend/dist/js/components/messageRenderer/history.js` / `stream.js` Python UI harness file: `tests/integration_tests/frontend/test_stream_session_overlay_ui.py`.
- Rebuilt `frontend/dist/app` so the served `/app/` bundle includes the round-only history projection fix.
- Kept this slice focused on Message Timeline history/stream semantics and UI-test migration. No sidebar entries, Settings sections, secondary-page routing, visible shell layout, or final visual audit status changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "separate row|round-only injections|real text tail|failed persisted tool returns|runtime injection rows"` passed with the three new TS migration cases and adjacent tool/injection coverage.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the static app bundle (`index-BjItoa6Z.js`).
- `rg --files tests/integration_tests/frontend | rg "test_stream_session_overlay_ui\\.py|stream_session_overlay"` returned no matches after deleting the legacy Python UI harness.
- `rg -n "test_history_overlay_can_render_as_separate_live_message|test_historical_injection_and_failed_tool_collapse_into_processed_group|test_finalize_stream_keeps_real_text_tail_when_overlay_idle_cursor_drifts|round-only injections|real text tail|separate row" frontend/app/src/test/MessageTimeline.test.tsx tests/integration_tests/frontend` returned only the new TS coverage names.

### Reviewer
- Main-agent V2 production fix, component coverage, final old Python harness removal, static bundle rebuild, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, Browser Checks completion, final V1/V2 visual audit sign-off, Electron sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Rebind Continuation TS Migration

### Scope
- Re-checked the active frontend rewrite goal and the remaining legacy `test_stream_session_overlay_ui.py` cases before editing, then chose the stream rebind/continuation gap because it directly advances the high-risk streaming and replay parity requirements.
- Added V2 `MessageTimeline` component coverage for a reconnected open run where hydrated text is already persisted, a tool result arrives after rebind, and the UI must keep the persisted text once while preserving an idle streaming cursor for the still-open run.
- Added V2 `MessageTimeline` component coverage proving reconnected text after thinking-idle and tool boundaries starts in fresh text segments instead of absorbing a stale idle cursor or previous hydrated text.
- Removed two replaced V1 `frontend/dist/js/components/messageRenderer/stream.js` Python harness tests: `test_rebind_then_tool_result_keeps_existing_text_and_appends_idle_placeholder` and `test_idle_cursor_rebind_resets_live_buffer_before_next_text_delta`.
- Kept this slice focused on stream rebind semantics and UI-test migration. No production UI code, sidebar entries, Settings sections, secondary-page routing, visible shell layout, or static dist bundle changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "reconnected|completed runtime tool results|runtime tool results without a prior tool call|repeated live text"` passed with the two new reconnected stream cases and adjacent tool/hydration coverage.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n "^def test_|rebind_then_tool_result|idle_cursor_rebind|reconnected" tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/MessageTimeline.test.tsx` confirmed the old rebind Python harnesses were removed and only three legacy stream overlay tests remain.
- `npm run lint` passed for the frontend and desktop TypeScript projects.

### Reviewer
- Main-agent V2 component coverage, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, interrupted recovery reviewer sign-off, final visual audit sign-off, Electron sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Idle Cursor After Segment TS Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining legacy `test_stream_session_overlay_ui.py` cases, and V2 `MessageTimeline` runtime thinking/tool tail behavior before editing.
- Restored the V1 idle cursor continuation semantics in the V2 runtime path: an open run whose latest visible event is `thinking_finished`, `tool_result`, or `tool_input_validation_failed` now appends an empty streaming cursor row so users can still see the stream is alive between output segments.
- Updated V2 component coverage so result-first tool replay and no-prior-call tool results both retain an idle cursor while the run remains open.
- Added V2 component coverage proving a completed thinking block becomes non-live/non-open but is followed by an idle streaming cursor until terminal closure.
- Removed three replaced V1 `frontend/dist/js/components/messageRenderer/stream.js` Python harness tests: `test_overlay_snapshot_preserves_idle_cursor_state`, `test_finalize_thinking_restores_idle_streaming_cursor_until_finalize`, and `test_tool_result_restores_idle_streaming_cursor_until_next_segment`.
- Kept this slice focused on stream inter-segment idle cursor semantics. No sidebar entries, Settings sections, secondary-page routing, or visible shell layout changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "idle streaming cursor|thinking finishes|completed runtime tool results|runtime tool results without a prior tool call|closes live thinking|terminal run events"` passed with the new thinking-finished idle cursor case and adjacent idle/tool/terminal coverage.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n "test_overlay_snapshot_preserves_idle_cursor_state|test_finalize_thinking_restores_idle_streaming_cursor_until_finalize|test_tool_result_restores_idle_streaming_cursor_until_next_segment|stream_idle_cursor_snapshot|stream_idle_cursor_after_thinking|stream_idle_cursor_after_tool|thinking finishes" tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned only the new TS case after removal.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the V2 static app bundle.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 idle cursor implementation, component coverage, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, final visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Tool Result Overlay TS Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining legacy `test_stream_session_overlay_ui.py` cases, and V2 `MessageTimeline` runtime tool-result coverage before editing.
- Strengthened V2 component coverage for result-first tool replay: a completed result remains visible without replaying a stale lower-event-id tool call, and its collapsible details expose the useful result payload.
- Added V2 component coverage proving a `tool_result` event without a prior `tool_call` still materializes as a visible tool error row, with preview/details content and no synthetic tool-call row.
- Removed two replaced V1 `frontend/dist/js/components/messageRenderer/stream.js` Python harness tests: `test_tool_result_materializes_overlay_tool_block_into_visible_container` and `test_tool_result_event_synthesizes_overlay_part_without_prior_tool_call`.
- Kept this slice focused on runtime tool result replay/rendering evidence. No production UI code, sidebar entries, Settings sections, secondary-page routing, visible shell layout, or static dist bundle changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "completed runtime tool results|runtime tool results without a prior tool call|out-of-order parallel runtime tool calls|splits runtime text segments around tool result events|runtime tool calls, results"` passed with the new no-prior-call result case and adjacent result-first/materialized-tool coverage.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n "test_tool_result_materializes_overlay_tool_block_into_visible_container|test_tool_result_event_synthesizes_overlay_part_without_prior_tool_call|stream_tool_result_materialize|stream_tool_result_overlay_only|runtime tool results without a prior tool call" tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned only the new TS case after removal.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 component coverage, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, final visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Terminal Text Finalization TS Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining legacy `test_stream_session_overlay_ui.py` cases, and V2 `MessageTimeline` terminal text behavior before editing.
- Fixed V2 runtime row projection so a closed or failed run finalizes any active runtime text segment even when no terminal event row is present in the replayed entries. This preserves unpersisted text recovered from runtime state while removing the live streaming cursor after finalization.
- Added V2 component coverage for a finalized subagent stream with only a recovered `text_delta`, proving the stale text remains visible, the row is not marked streaming, and no streaming cursor remains.
- Removed two replaced V1 `frontend/dist/js/components/messageRenderer/stream.js` Python harness tests: `test_finalize_stream_preserves_unpersisted_overlay_without_live_state` and `test_finalize_stream_turns_off_streaming_cursor_for_live_subagent_text`.
- Kept this slice focused on terminal runtime text semantics. No sidebar entries, Settings sections, secondary-page routing, or visible shell layout changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "runtime text cursor|terminal cursor|clears the runtime text streaming cursor|long runtime text streams|unpersisted runtime text"` passed with the new finalized subagent text case and adjacent open/closed text cursor coverage.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n "test_finalize_stream_preserves_unpersisted_overlay_without_live_state|test_finalize_stream_turns_off_streaming_cursor_for_live_subagent_text|stream_finalize_overlay|stream_finalize_cursor|runtime text cursor" tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned only the new TS case after removal.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the V2 static app bundle.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 terminal text finalization implementation, component coverage, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, final visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Idle Cursor TS Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining legacy `test_stream_session_overlay_ui.py` cases, and V2 `MessageTimeline` runtime projection before editing.
- Restored the V1 idle-gap streaming behavior in the V2 runtime path: an open run with only a silent lifecycle event now renders an empty streaming cursor row instead of appearing as an empty timeline or a protocol fallback message.
- Tightened run lifecycle summaries so an empty run lifecycle payload no longer renders as `Run started: {}`. Lifecycle rows still render when they carry real status, output, error, reason, or root-task details.
- Added V2 component coverage proving an open `run_started` stream shows a live cursor, hides the empty-state copy, keeps the row scoped to the selected run, and does not expose `Run started`/`run started` protocol text.
- Removed the replaced V1 `frontend/dist/js/components/messageRenderer/history.js` Python harness test `test_history_overlay_renders_live_cursor_placeholder_for_idle_gap`.
- Kept this slice focused on stream start/idle rendering semantics. No sidebar entries, Settings sections, secondary-page routing, or visible shell layout changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "idle streaming cursor|open runtime text is already hydrated|repeated live text|closes live thinking|Run completed"` passed with the new idle-cursor case and adjacent hydration/finalization coverage.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n "test_history_overlay_renders_live_cursor_placeholder_for_idle_gap|history_overlay_idle_gap|idle streaming cursor" tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned only the new TS case after removal.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the V2 static app bundle.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 runtime idle-cursor implementation, component coverage, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, final visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime External Media Overlay TS Migration

### Scope
- Re-checked the active frontend rewrite goal, product parity checklist, quality gates, remaining legacy `test_stream_session_overlay_ui.py` cases, and current live `/app/` shell before editing.
- Captured `.tmp/frontend-v2-live-audit/current-app-before-next-stream-slice.png` and measured the live shell: `body` and `#root` remained fixed to the viewport, sidebar width was `280px`, and no document-level scroll regression was present. This kept the slice aligned with the global frame goal before touching stream coverage.
- Added V2 `MessageTimeline` component coverage proving an external primary runtime stream can render a `media_ref` image output on the selected run, preserving the old stream-overlay media behavior through the typed AG-UI runtime path.
- Removed the replaced V1 `frontend/dist/js/components/messageRenderer/history.js` Python harness test `test_history_overlay_renders_media_refs_from_stream_overlay`.
- Kept this slice focused on stream identity/media replay evidence. No sidebar entries, Settings sections, secondary-page routing, production UI code, visible shell layout, or static dist bundle changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "external primary runtime media|external primary runtime text|runtime output_delta media_ref|distinct cursorless runtime media"` passed with the new external primary media case and adjacent stream/media coverage.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n "test_history_overlay_renders_media_refs_from_stream_overlay|history_overlay_media_ref|external primary runtime media" tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned only the new TS case after removal.

### Reviewer
- Main-agent live shell inspection, V2 component coverage, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, final visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Repeated Tail Hydration TS Migration

### Scope
- Re-checked the active frontend rewrite goal, current implementation ledger, remaining legacy `test_stream_session_overlay_ui.py` cases, and the V1 history overlay replay-dedupe harness before editing.
- Tightened V2 `MessageTimeline` hydration/runtime merging so an open run suppresses only the already-hydrated leading text/output prefix. Once a non-text runtime event such as a tool call arrives, later text deltas are treated as live tail even if their text matches earlier persisted output.
- Updated the temporary hydrated-cursor accumulator so an empty cursor placeholder is removed instead of leaving a blank row when a later tool/media/thinking/runtime event closes that text segment.
- Added V2 component coverage proving a repeated text delta after a tool call remains visible as live streaming output while the earlier persisted duplicate is not replayed.
- Removed the replaced V1 `frontend/dist/js/components/messageRenderer/history.js` Python harness test `test_history_overlay_does_not_replay_parts_already_persisted_in_history`.
- Rebuilt `frontend/dist/app` so the served `/app/` bundle reflects the repeated-tail hydration fix.
- Kept this slice focused on stream hydration/replay rendering semantics. No sidebar entries, Settings sections, secondary-page routing, or visible shell layout changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "repeated live text|open runtime text is already hydrated|closed runtime tool events|unpersisted runtime text"` passed with the new repeated-tail case and adjacent hydration/tool/terminal coverage.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n 'test_history_overlay_does_not_replay_parts_already_persisted_in_history|history_overlay_dedupe' tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned no matches after removal.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the V2 static app bundle.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 component coverage, runtime hydration merge fix, static app rebuild, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, interrupted recovery reviewer sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Hydrated Cursor TS Migration

### Scope
- Re-checked the active frontend rewrite goal, current implementation ledger, remaining legacy `test_stream_session_overlay_ui.py` cases, and the V1 history overlay live cursor harness before editing.
- Fixed V2 `MessageTimeline` hydration/runtime merging for an active stream whose current runtime text is already covered by persisted assistant output: the duplicated text is no longer rendered a second time, but the active stream still contributes an empty streaming cursor row so refresh/replay continuation remains visible.
- Added V2 component coverage proving an open runtime text delta matching persisted output renders the persisted answer exactly once, keeps one streaming cursor, and keeps answer copy disabled while the stream is still open.
- Removed the replaced V1 `frontend/dist/js/components/messageRenderer/history.js` Python harness test `test_history_overlay_renders_live_cursor_placeholder_for_stream_tail`.
- Rebuilt `frontend/dist/app` so the served `/app/` bundle reflects the hydration cursor fix.
- Kept this slice focused on stream hydration/replay rendering semantics. No sidebar entries, Settings sections, secondary-page routing, or visible shell layout changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "open runtime text is already hydrated|stale runtime delta|post-checkpoint runtime"` passed with the new hydrated live-cursor case and adjacent hydration regression coverage.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n 'test_history_overlay_renders_live_cursor_placeholder_for_stream_tail|temp_dir = tmp_path / "history_overlay"' tests/integration_tests/frontend/test_stream_session_overlay_ui.py` returned no matches after removal.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the V2 static app bundle.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 component coverage, runtime hydration merge fix, static app rebuild, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, interrupted recovery reviewer sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Overlay Fallback TS Migration

### Scope
- Re-checked the active frontend rewrite goal, current implementation ledger, remaining legacy `test_stream_session_overlay_ui.py` cases, the V1 hydrated timeline fallback harness, and current V2 `MessageTimeline` hydration/runtime merge behavior before editing.
- Mapped the V1 `test_stream_overlay_snapshot_ignores_hydrated_timeline_store_after_dom_state_clears` harness risk to V2's typed runtime store boundary: V2 must not resurrect live thinking/tool overlay rows from the old global `__relayTeamsMessageTimelineGetRunSnapshot` fallback when runtime state is empty.
- Added V2 component coverage proving a leftover legacy global snapshot containing live thinking and pending tool data is not called and does not render any thinking/tool rows when the V2 runtime store has no events.
- Removed the replaced V1 `frontend/dist/js/components/messageRenderer/stream.js` Python harness test `test_stream_overlay_snapshot_ignores_hydrated_timeline_store_after_dom_state_clears`.
- Kept this slice focused on runtime/hydration boundary evidence. No sidebar entries, Settings sections, secondary-page routing, visible shell layout, production runtime code, or static dist bundle changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "legacy hydrated overlay snapshots"` passed with the new V2 component test.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n "test_stream_overlay_snapshot_ignores_hydrated_timeline_store_after_dom_state_clears|stream_timeline_overlay_no_fallback" tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned no matches after removal.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 component coverage, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, interrupted recovery reviewer sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Resume Lifecycle TS Migration

### Scope
- Re-checked the active frontend rewrite goal, parity checklist, quality gates, architecture target, current implementation ledger, remaining legacy `test_stream_session_overlay_ui.py` cases, and existing runtime reducer coverage before editing.
- Mapped the V1 `test_stream_overlay_terminal_event_releases_event_id_dedupe` harness risk to V2's AG-UI/runtime cursor model: backend evidence uses monotonically increasing per-run event ids, so V2 should not accept a same-or-lower event id after terminal, but must reopen a terminal run when a later `run_resumed` lifecycle event advances the stream cursor.
- Added V2 reducer coverage proving stale replay below the terminal cursor remains ignored, a later `run_resumed` clears the terminal state and reopens the run, and subsequent text from the resumed lifecycle remains visible in order.
- Removed the replaced V1 `frontend/dist/js/components/messageRenderer/stream.js` Python harness test `test_stream_overlay_terminal_event_releases_event_id_dedupe`.
- Kept this slice focused on runtime replay/resume semantics. No sidebar entries, Settings sections, secondary-page routing, visible shell layout, production runtime code, or static dist bundle changed.

### Verification
- `npm run test -- src/test/runtimeReducers.test.ts -t "reopens a completed run only|deduplicates replayed events|reopens a paused run"` passed with the new resume-after-terminal reducer test and adjacent dedupe/resume checks.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n "test_stream_overlay_terminal_event_releases_event_id_dedupe|stream_overlay_terminal_replay" tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/runtimeReducers.test.ts` returned no matches after removal.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 reducer coverage, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, interrupted recovery reviewer sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Terminal Cache TS Migration

### Scope
- Re-checked the active frontend rewrite goal, current implementation ledger, remaining legacy `test_stream_session_overlay_ui.py` cases, and existing V2 terminal/thinking coverage before editing.
- Added V2 component coverage for a terminal lifecycle containing thinking, unpersisted text, `model_step_finished`, and `run_completed`, proving the unpersisted text remains visible while thinking content remains retained but no longer live/open after terminal closure.
- Removed the replaced V1 `frontend/dist/js/components/messageRenderer/stream.js` Python harness test `test_stream_overlay_keeps_unpersisted_cache_after_terminal_events`.
- Kept this slice focused on terminal stream rendering evidence. No sidebar entries, Settings sections, secondary-page routing, visible shell layout, production runtime code, or static dist bundle changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "unpersisted runtime text|closes live thinking"` passed with the existing terminal thinking test and the new terminal cache preservation test.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n 'test_stream_overlay_keeps_unpersisted_cache_after_terminal_events' tests/integration_tests/frontend/test_stream_session_overlay_ui.py` returned no matches after removal.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 component coverage, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, interrupted recovery reviewer sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Injection Supersede TS Migration

### Scope
- Re-checked the active frontend rewrite goal, current implementation ledger, remaining legacy `test_stream_session_overlay_ui.py` cases, and existing V2 `MessageTimeline` injection supersede coverage before editing.
- Strengthened the existing V2 component test for `supersedes_pending_tool_calls` so it also verifies timeline row order: the old pending tool call is removed, the injection row renders first, and the replacement tool call/result render after it.
- Removed the replaced V1 `frontend/dist/js/components/messageRenderer/stream.js` Python harness test `test_live_injection_removes_superseded_tool_before_new_segment`.
- Kept this slice focused on stream injection rendering evidence. No sidebar entries, Settings sections, secondary-page routing, visible shell layout, production runtime code, or static dist bundle changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "superseded pending runtime tool"` passed with the strengthened V2 injection supersede component test.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n "test_live_injection_removes_superseded_tool_before_new_segment|live_injection_superseded_tool" tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned no matches after removal.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 component coverage, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, interrupted recovery reviewer sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Injection Replay TS Migration

### Scope
- Re-checked the active frontend rewrite goal, current implementation ledger, remaining legacy `test_stream_session_overlay_ui.py` cases, and existing V2 `MessageTimeline` injection coverage before editing.
- Added V2 component coverage for the live injection boundary `text_delta -> injection_applied -> duplicate replayed injection -> text_delta`, proving injection rows split adjacent runtime text in order and replayed duplicate events do not render duplicate injection markers.
- Removed two V1 `frontend/dist/js/components/messageRenderer/stream.js` Python harness tests: `test_live_injection_marker_splits_current_stream_segment` and `test_live_injection_marker_is_idempotent_for_replayed_event`.
- Kept this slice focused on message stream rendering and replay evidence. No sidebar entries, Settings sections, secondary-page routing, visible shell layout, production runtime code, or static dist bundle changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "runtime injection rows|replay-deduped injection"` passed with the existing injection position test and the new replay-dedupe text-splitting test.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n "test_live_injection_marker_splits_current_stream_segment|test_live_injection_marker_is_idempotent_for_replayed_event|live_injection_segment_split|live_injection_marker_replay" tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned no matches after removal.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 component coverage, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, interrupted recovery reviewer sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Tool Result Segment TS Migration

### Scope
- Re-checked the active frontend rewrite goal, current implementation ledger, remaining legacy `test_stream_session_overlay_ui.py` cases, and existing V2 `MessageTimeline` text/tool segment coverage before editing.
- Added V2 component coverage for the live tool lifecycle boundary `text_delta -> tool_call -> text_delta -> tool_result -> text_delta`, proving both tool calls and tool results split adjacent runtime text into distinct timeline rows in order.
- Added a focused runtime tool-result test helper in `MessageTimeline.test.tsx` so the test uses the same typed timeline entry shape as nearby runtime text and tool-call segment coverage.
- Removed the replaced V1 `frontend/dist/js/components/messageRenderer/stream.js` Python harness test `test_live_tool_result_closes_text_segment_before_next_delta`.
- Kept this slice focused on message stream rendering evidence. No sidebar entries, Settings sections, secondary-page routing, visible shell layout, production runtime code, or static dist bundle changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "splits runtime text segments around tool"` passed with the existing tool-call segment test and the new tool-result lifecycle segment test.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n "test_live_tool_result_closes_text_segment_before_next_delta|live_tool_text_segments" tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned no matches after removal.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 component coverage, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, interrupted recovery reviewer sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Stream Identity TS Migration

### Scope
- Re-checked the active frontend rewrite goal, current implementation ledger, remaining legacy `test_stream_session_overlay_ui.py` cases, and existing V2 `MessageTimeline` stream/tool coverage before editing.
- Mapped the V1 string tool-args normalization harness case to existing V2 coverage in `MessageTimeline.test.tsx`: persisted and runtime tool calls normalize JSON object strings, array strings, and raw strings into the expected previews and details.
- Added V2 component coverage proving an external primary runtime stream with a distinct `instance_id` and `role_id` still renders as the selected run's live output row, preserving run scoping without a V1 `byInstance` overlay split.
- Removed two V1 `frontend/dist/js/components/messageRenderer/stream.js` Python harness tests: `test_stream_overlay_normalizes_string_tool_args_and_keeps_stream_key` and `test_stream_overlay_uses_run_primary_role_for_primary_key`.
- Kept this slice focused on stream identity and rendering evidence. No sidebar entries, Settings sections, secondary-page routing, visible shell layout, runtime source behavior, or static dist bundle changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "normalizes string tool args|external primary runtime text"` passed with the existing string-args coverage and the new external primary stream coverage.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n "test_stream_overlay_normalizes_string_tool_args_and_keeps_stream_key|test_stream_overlay_uses_run_primary_role_for_primary_key|stream_overlay_string_args" tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned no matches after removal.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 component coverage, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, interrupted recovery reviewer sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Parallel Tool Ordering TS Migration

### Scope
- Re-checked the active frontend rewrite goal, current V2 shell screenshot/DOM evidence, the Message Timeline and AG-UI Runtime Stream checklist items, and the remaining legacy `test_stream_session_overlay_ui.py` cases before editing.
- Added V2 `MessageTimeline` component coverage for a parallel tool stream boundary where one tool result arrives before its matching tool call, another tool call arrives in between, and the matching late tool call must merge its args into the completed result instead of rendering a duplicate pending call.
- Updated V2 runtime timeline row construction to consume late tool calls that match already resolved tool results or validation rows, preserving the completed result row's position and preview while retaining the late call args in details.
- Removed the replaced V1 `frontend/dist/js/components/messageRenderer/stream.js` Python harness test `test_stream_overlay_merges_out_of_order_parallel_tool_events`.
- Kept this slice focused on stream/replay rendering semantics. No sidebar entries, Settings sections, secondary-page routing, shell layout, static dist bundle, or visible Appearance page controls changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "out-of-order parallel runtime tool|completed runtime tool results"` passed with the new boundary test and the adjacent stale-event guard test.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n "test_stream_overlay_merges_out_of_order_parallel_tool_events|stream_overlay_parallel_tools" tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned no matches after removal.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the V2 static app bundle.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 component coverage, old Python UI test removal, and focused regression verification completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, interrupted recovery reviewer sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Injection Overlay TS Migration

### Scope
- Re-checked the active frontend rewrite goal, Composer/Run Controls and Message Timeline checklist items, current V2 `MessageTimeline` runtime injection coverage, and the remaining legacy stream overlay Python tests before editing.
- Removed two V1 `frontend/dist/js/components/messageRenderer/stream.js` overlay harness tests from `tests/integration_tests/frontend/test_stream_session_overlay_ui.py`: injection placement between a tool call and following text, and superseding an unexecuted pending tool call when an injection is applied.
- Mapped the behavior to existing V2 component coverage in `frontend/app/src/test/MessageTimeline.test.tsx`: `keeps runtime injection rows at their live event position between tool and text` and `removes superseded pending runtime tool calls before rendering the injected replacement`.
- Kept this slice focused on evidence migration only. No sidebar entries, Settings pages, visible layout, stream transport behavior, or static dist bundle changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "runtime injection rows|superseded pending runtime tool calls"` passed with 2 focused V2 component tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `rg -n "test_stream_overlay_keeps_injection_between_tool_and_next_text|test_stream_overlay_discards_unexecuted_tool_when_inject_supersedes_batch|stream_overlay_injection|stream_overlay_inject_supersedes_tool" tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned no matches after removal.
- `git diff --check` passed.

### Reviewer
- Main-agent old Python UI test removal, V2 evidence mapping, focused component verification, edited-file ruff check, old-test search, and diff check completed for this slice. No full Message Timeline subsystem PASS, Composer/Run Controls PASS, AG-UI Runtime Stream PASS, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Runtime Replay Dedupe TS Migration

### Scope
- Re-checked the active frontend rewrite goal, AG-UI Runtime Stream and Message Timeline checklist items, current V2 runtime reducer/stream controller coverage, and the legacy `test_stream_session_overlay_ui.py` replay-dedupe case before editing.
- Added V2 `MessageTimeline` component coverage proving duplicated replay deliveries for thinking start/delta/finish plus tool call/result events are reduced through the runtime state and render as a single thinking block and a single tool block.
- Removed the replaced `test_stream_overlay_replayed_event_ids_do_not_duplicate_parts` Python UI test from `tests/integration_tests/frontend/test_stream_session_overlay_ui.py`.
- Kept this slice focused on replay dedupe rendering evidence. It does not change sidebar entries, Settings pages, visible layout, stream transport behavior, or the static dist bundle.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "does not duplicate replayed runtime thinking and tool parts"` passed with the new V2 component test.
- `rg -n "test_stream_overlay_replayed_event_ids_do_not_duplicate_parts|replayed_event_ids" tests/integration_tests/frontend/test_stream_session_overlay_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returned no matches after removal.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_stream_session_overlay_ui.py` passed for the edited Python test file.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 component coverage, old Python UI test removal, focused frontend lint/typecheck, edited-file ruff check, and diff check completed for this slice. No full Message Timeline subsystem PASS, AG-UI Runtime Stream subsystem PASS, interrupted recovery reviewer sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 V1 Composer Control Row Alignment

### Scope
- Re-checked the active frontend rewrite goal, V1/V2 same-viewport evidence, and current V2 composer implementation before editing. This slice targets a framework-level parity gap in the persistent bottom composer rather than only the previously annotated message cards.
- Updated the V2 composer control row to use V1-like field grouping: mode, role, target, and model controls now have visible compact labels instead of appearing as a cramped sequence of unlabeled selects.
- Kept existing composer capabilities intact: normal/orchestration topology switching, root role or orchestration preset, target role, model profile, thinking, Shell safety, YOLO, voice input, stop, queue, interrupt, and send actions remain available.
- Replaced the narrow fixed select widths with bounded responsive widths and updated the narrow-viewport layout so controls wrap deliberately instead of visually colliding.
- No sidebar entries, Settings sections, Settings secondary-page behavior, or primary route structure changed in this slice.

### Verification
- `npm run test -- src/test/Composer.test.tsx src/test/ShellLayoutCss.test.ts -t "localizes the persistent composer frame|desktop composer controls"` passed with focused composer structure and CSS layout coverage.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and regenerated the V2 static app bundle.
- `npm run test:browser -- browser-tests/v2-shell-parity.spec.ts -g "keeps V1 primary sidebar entries"` passed with the existing browser parity flow, including the composer non-overlap helper.
- In-app browser reload of `http://127.0.0.1:8000/app/` confirmed composer field labels `["模式","角色","目标","模型"]`, no composer control overlaps, no document-level scroll, and captured the composer evidence screenshot at `.tmp/frontend-layout-audit/v2-composer-after-clip.png`.

### Reviewer
- Main-agent source alignment, focused component/CSS coverage, static app rebuild, browser parity coverage, and in-app browser screenshot verification completed for this slice. No full Composer subsystem PASS, stream/replay/interrupted recovery sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 V1 Sidebar Primary Navigation Alignment

### Scope
- Re-checked the active frontend rewrite goal, V1/V2 same-viewport screenshots, the Application Shell checklist, and current V2 shell implementation before editing. This slice targets a visible framework-level parity gap rather than only message-row details.
- Captured same-viewport V1 and V2 evidence under `.tmp/frontend-layout-audit/`: both versions keep the document fixed to one viewport, but V2 had extra primary sidebar entries (`Chat`, `Observability`, `Settings`) and a non-V1 order.
- Updated V2 primary sidebar navigation to match V1's entry set and order: Search, Skills, Automation, Connectors, Board, Memory. Chat remains the default workspace surface, while Observability and Settings remain reachable from the top bar instead of duplicated in the sidebar.
- Updated component and browser parity coverage so the incorrect sidebar item set is no longer described as V1-aligned.
- Rebuilt `frontend/dist/app` so the served `/app/` bundle reflects the navigation fix.
- Kept Settings section and secondary-page structure unchanged; no Settings tabs, sidebar workspace actions, or module pages were added or removed.

### Verification
- `npm run test -- src/test/AppShell.test.tsx -t "primary sidebar|primary sidebar navigation|shell navigation labels|top bar shortcuts|topbar actions"` passed with 6 focused AppShell tests.
- `npm run test:browser -- browser-tests/v2-shell-parity.spec.ts -g "keeps V1 primary sidebar entries"` passed with the updated TS browser parity flow.
- `npm run build` passed and regenerated the V2 static app bundle.
- In-app browser reload of `http://127.0.0.1:8000/app/` confirmed sidebar labels `["搜索","技能","自动化","连接器","看板","记忆"]`, no Chat/Observability/Settings primary sidebar entries, and no document-level scroll.

### Reviewer
- Main-agent V1/V2 screenshot comparison, source fix, focused component/browser coverage, static app rebuild, and in-app browser screenshot verification completed for this slice. No full Application Shell subsystem PASS, composer/message/round visual parity sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Round Paging TS Migration

### Scope
- Re-checked the active frontend rewrite goal, the Rounds/Todos/History/Retry parity checklist, current V2 `MessageTimeline` round rail implementation, and the legacy `test_round_paging_ui.py` before editing. This slice targets paging behavior evidence without changing sidebar entries, Settings navigation, secondary-page opening logic, or visible UI structure.
- Added V2 component coverage proving the round rail collects paged history with the expected cursor requests, dedupes repeated `run_id` records, keeps the updated round payload, and renders the final round list in chronological order.
- Removed `tests/integration_tests/frontend/test_round_paging_ui.py`, which exercised the old V1 `frontend/dist/js/components/rounds/paging.js` incremental state helper instead of the V2 full-page collection model.
- Kept this as targeted Rounds paging evidence only. Remaining frontend rewrite work still includes deeper stream replay/interrupted recovery verification, final V1/V2 visual audit, Electron/release gates, complete parity checklist review, and reviewer sign-off.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "paged round rail"` passed with the new V2 round paging component test.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `git diff --check` passed.
- `rg --files tests\integration_tests\frontend | rg "test_round_paging_ui\.py$"` returned no matches after removal.

### Reviewer
- Main-agent V1 Python round paging test removal, V2 MessageTimeline paging evidence, focused TS verification, frontend lint/typecheck, and diff check completed for this slice. No full Rounds/Todos/History/Retry subsystem PASS, stream/replay browser sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Subagent Session History TS Migration

### Scope
- Re-checked the active frontend rewrite goal, Subagents checklist, current V2 subagent session implementation, and the legacy `test_agent_panel_history_ui.py` before editing. This slice removes a V1 right-panel source-string assertion in favor of V2 subagent session behavior evidence.
- Confirmed V2 keeps subagent sessions nested under the parent session in the sidebar and opens them as a secondary read-only session view instead of flattening runtime, memory, summary, or auxiliary tabs into a right-side agent panel.
- Confirmed V2 `SubagentSessionView` loads persisted subagent messages through the session-scoped agent history endpoint, streams active subagent runs from the last checkpoint, refreshes history when the tracked run closes, and avoids streaming terminal subagent sessions.
- Confirmed V2 browser overlay coverage still includes running subagent history render-bind behavior in `streaming-message-timeline.spec.ts`.
- Removed `tests/unit_tests/frontend/test_agent_panel_history_ui.py`, which only inspected V1 `frontend/dist/js/components/agentPanel/history.js` source strings.
- No source UI, sidebar entry set, Settings navigation, or dist bundle changed in this slice.

### Verification
- `npm run test -- src/test/SubagentSessionView.test.tsx src/test/SessionsSidebar.test.tsx -t "subagent"` passed with focused V2 subagent tests.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `git diff --check` passed.
- `rg --files tests\unit_tests\frontend | rg "test_agent_panel_history_ui\.py$"` returned no matches after removal.

### Reviewer
- Main-agent old Python V1 agent-panel test removal, V2 subagent session evidence mapping, focused TS verification, frontend lint/typecheck, and diff check completed for this slice. No Subagents subsystem PASS, stream/replay browser sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Current Session Indicator TS Migration

### Scope
- Re-checked the active frontend rewrite goal, Application Shell checklist, current V2 shell implementation, and the legacy `test_session_debug_badge_ui.py` before editing. This slice targets the current-session indicator requirement without restoring the V1-only bottom debug badge shape.
- Confirmed V2 exposes the current session identity through `CurrentSessionIndicator`: the visible topbar stays focused on the workspace title, while the selected session title/status or selected session id remains available through the identity label and screen-reader text.
- Removed `tests/integration_tests/frontend/test_session_debug_badge_ui.py`, which only exercised the V1 `frontend/dist/js/components/sessionDebugBadge.js` module and V1 CSS.
- No sidebar entries, Settings sections, first-level pages, or visible shell layout changed in this slice.

### Verification
- `npm run test -- src/test/CurrentSessionIndicator.test.tsx src/test/AppShell.test.tsx -t "session identity|current session identity"` passed with focused V2 shell tests.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `git diff --check` passed.
- `rg --files tests\integration_tests\frontend | rg "test_session_debug_badge_ui\.py$"` returned no matches after removal.

### Reviewer
- Main-agent old Python V1 badge-test removal, V2 current-session identity evidence mapping, focused TS verification, frontend lint/typecheck, and diff check completed for this slice. No Application Shell subsystem PASS, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Message Renderer Facade Test TS Evidence Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining Python frontend tests, and V2 MessageTimeline copy/streaming coverage before editing. This slice targets checklist item 3 and removes another legacy dist facade export assertion.
- Replaced `tests/unit_tests/frontend/test_message_renderer_facade_exports.py` by relying on existing V2 component coverage for copy-last-answer behavior, hydrated answer precedence, streaming cursor state, and cursor cleanup when tool calls arrive.
- Confirmed V2 browser overlay coverage already exists in `frontend/app/browser-tests/streaming-message-timeline.spec.ts` for replay text around tool calls, stream cleanup, and output-delta overlay streaming state.
- No source UI, sidebar, Settings navigation, or dist bundle changed in this slice.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "copies the latest|does not copy stale|shows a terminal cursor|clears the runtime text"` passed with focused V2 component tests.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `git diff --check` passed.
- `rg --files tests\unit_tests\frontend | rg "test_message_renderer_facade_exports\.py$"` returned no matches after removal.

### Reviewer
- Main-agent old Python facade-test removal, V2 test evidence mapping, focused component verification, frontend lint/typecheck, and diff check completed for this slice. No Message Timeline subsystem PASS, stream/replay browser sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Xiaoluban Gateway API Contract TS Migration

### Scope
- Re-checked the frontend rewrite goal, product parity checklist, remaining Python frontend tests, V2 API client coverage, and backend gateway router before editing. This slice targets checklist item 10 by replacing a legacy dist API facade export assertion with real V2 typed API client contracts.
- Added V2 TypeScript contracts and API helpers for Xiaoluban gateway account list/prepare/create/reveal-token/update/delete, enable/disable, IM config update, and IM forwarding-command fetch endpoints.
- Added the missing V2 `deleteSessionSubagent` API helper for the real `DELETE /api/sessions/{session_id}/subagents/{instance_id}` backend endpoint.
- Extended `apiClient.test.ts` to verify the new helpers call the real backend paths, HTTP methods, and request payloads through fetch mocks.
- Removed the replaced `tests/unit_tests/frontend/test_core_api_facade_exports.py` Python source-string test.
- No sidebar entries, Settings sections, first-level pages, or user-facing UI were added in this slice.

### Verification
- `npm run test -- src/test/apiClient.test.ts -t "subagent sessions|Xiaoluban|model catalog"` passed with 2 focused Vitest tests.
- `npm run test -- src/test/apiClient.test.ts` passed with 34 Vitest tests.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `git diff --check` passed.
- `rg --files tests\unit_tests\frontend | rg "test_core_api_facade_exports\.py$"` returned no matches after removal.

### Reviewer
- Main-agent V2 API contract implementation, focused TS API coverage, and old Python facade-test removal completed for this slice. No Gateway UI parity, Connector subsystem PASS, Settings subsystem PASS, browser visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Settings Accessibility TS Migration

### Scope
- Re-checked the active frontend rewrite goal and the remaining `test_settings_accessibility_ui.py` source-string assertions before editing. This slice targets checklist item 9 by replacing legacy dist markup checks with real V2 SettingsDrawer accessibility coverage.
- Restored the Role detail memory control in V2 by adding a `Memory enabled` switch bound to `memory_profile.enabled`; saving a Role now reflects the user-edited memory state in the real role config payload.
- Added focused TS coverage that navigates through the V1-aligned Settings secondary pages and verifies model profile, proxy, remote workspace, and role controls are reachable through accessible labels or switch names.
- Extended the existing Role save test to turn off `Memory enabled` and assert the saved `memory_profile.enabled` payload changes from `true` to `false`.
- Removed the replaced `tests/unit_tests/frontend/test_settings_accessibility_ui.py` Python source-string test.
- No Settings section or sidebar entries were added or removed.

### Verification
- `npm run test -- src/test/SettingsDrawer.test.tsx -t "links migrated settings labels|saves editable role configs"` passed with 2 focused Vitest tests.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `git diff --check` passed.
- `rg --files tests\unit_tests\frontend | rg "test_settings_accessibility_ui\.py$"` returned no matches after removal.

### Reviewer
- Main-agent V2 settings implementation, focused TS component coverage, old Python file removal, frontend lint/typecheck, and diff check completed for this slice. No Settings subsystem PASS, full settings migration, browser visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Model Profile API Key And Image Capability V2 Parity

### Scope
- Re-checked the active frontend rewrite goal and the remaining legacy settings accessibility coverage before editing. This slice targets checklist item 9 for the Model Profiles settings surface.
- Restored V1-equivalent model profile controls in V2 for provider API key entry and image-input capability override. The API key field stays blank for saved secrets and only sends `api_key` when the user enters a replacement value.
- Added an Image Input native select with Follow detection, Supports image input, and Text only modes. Saving writes the explicit image capability into `capabilities.input.image` while preserving unrelated capability bits.
- Added the missing `has_api_key` field to the V2 frontend contract so the settings UI can show saved-key preservation without exposing the secret.
- Added focused `SettingsDrawer.test.tsx` coverage proving the model profile form labels are accessible, saved API keys show the preservation placeholder, image capability is editable, and the save payload includes the replacement key plus updated capabilities.
- Kept `tests/unit_tests/frontend/test_settings_accessibility_ui.py` for now because it also covers role memory and other legacy assertions that are not fully migrated in this slice.

### Verification
- `npm run test -- src/test/SettingsDrawer.test.tsx -t "edits model profile API key"` passed with 1 focused Vitest test.
- `npm run test -- src/test/SettingsDrawer.test.tsx -t "model profile"` passed with 4 model-profile Vitest tests.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 settings implementation, focused TS component coverage, frontend lint/typecheck, and diff check completed for this slice. No Settings subsystem PASS, full settings accessibility migration, browser visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Round History Clear TS Migration

### Scope
- Re-checked the active frontend rewrite goal and parity checklist before editing. This slice targets checklist item 8, where V2 had microcompact metadata but did not yet collapse timeline/round-rail history before a `clear_marker_before` round.
- Added V2 MessageTimeline history divider rows that participate in the same virtual scrolling model as message and round rows, so collapsed history does not create a separate scrolling surface.
- Added an accessible history divider control with `aria-expanded`, localized English/Chinese labels, and matching round rail filtering so hidden historical rounds do not remain navigable while their timeline rows are collapsed.
- Added TS component coverage proving archived round history is hidden before a clear marker, the divider reports the hidden round/message counts, and clicking the divider expands both the timeline history and round rail entry.
- Removed the replaced `tests/unit_tests/frontend/test_round_history_clear_ui.py` Python source-string test.
- No dist rebuild or screenshot is claimed for this small TS/test migration slice.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx` passed with 75 focused Vitest tests.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `git diff --check` passed.

### Reviewer
- Main-agent V2 behavior implementation, focused TS component coverage, frontend lint/typecheck, diff check, and old Python file removal completed for this slice. No Rounds subsystem PASS, stream/replay sign-off, final V1/V2 visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Streaming Tool Cursor TS Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining frontend Python UI tests, and current V2 MessageTimeline coverage before editing. This slice targets a small stream UI regression from the legacy V1 `test_streaming_tool_cursor_ui.py` file.
- Added V2 TS component coverage proving that when a `tool_call` follows a live `text_delta` while the run remains open, the previous text segment is closed, no longer renders as streaming, and no `.streaming-cursor` remains attached to that text row.
- Removed the replaced `tests/unit_tests/frontend/test_streaming_tool_cursor_ui.py` Python source-string test.
- No runtime or visual source changed in this slice, so no dist rebuild or screenshot is claimed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx` passed with 74 focused Vitest tests.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `git diff --check` passed.
- `rg --files tests/unit_tests/frontend | rg "test_streaming_tool_cursor_ui\\.py$"` returned no matches after removal.

### Reviewer
- Main-agent TS component migration, focused timeline test, frontend lint/typecheck, diff check, and old Python file removal completed for this slice. No Message Timeline subsystem PASS, Runtime Stream subsystem PASS, full Python UI test migration, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Round Prompt Marker TS Closure

### Scope
- Re-checked the active frontend rewrite goal and current V2/V1 parity gaps before editing. This slice targets the message timeline round marker, which is part of the core chat path, while leaving the V1-style secondary-page Settings structure and sidebar item set unchanged.
- Added round prompt metadata to preserve the raw `run_user_message` / intent text separately from the normalized marker title.
- Restored compact V1-style readability for long or multiline round prompts by rendering them as a collapsed marker disclosure. Short round prompts remain a plain single-line marker title, so the first-level message timeline does not become a flattened round detail page.
- Rebuilt `frontend/dist/app` so the backend-served `/app/` bundle includes the marker and CSS changes.

### Verification
- `npm run test -- src/test/roundMetadata.test.ts src/test/MessageTimeline.test.tsx` passed with 77 focused Vitest tests.
- `npm run lint` passed for the frontend and desktop TypeScript projects.
- `npm run build` passed and refreshed `frontend/dist/app`; Vite reported only the existing chunk-size warning.
- Browser reload at `http://127.0.0.1:8000/app/` loaded the new `/app/assets/index-MZk0-t4z.js` and `/app/assets/index-H2TuRu0a.css` bundle hashes. Layout readback at 1280x720 reported shell 1280x720, timeline 994x500, composer 994x136, and no document-level scroll.
- Attempted viewport screenshot capture through the in-app browser twice, but `Page.captureScreenshot` timed out both times. No screenshot evidence is claimed for this slice.

### Reviewer
- Main-agent source fix, focused TS unit/component coverage, frontend lint/typecheck/build, dist refresh, and browser layout readback completed for this slice. No stream/replay sign-off, browser-suite migration sign-off, final V1/V2 visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Agent Runtime Role Binding TS Browser Closure

### Scope
- Re-checked the active frontend rewrite goal and the old `test_browser_settings_save_role_and_agent_configs` Python browser scenario before deciding whether it could be removed. This slice closes the remaining Role half of the earlier Agent Runtime migration instead of widening Settings navigation or adding first-level pages.
- Restored V1-equivalent Role editor behavior in V2: the Bound agent field now uses the saved Agent Runtime list as selectable options, newly-created Agent Runtime configs are available when creating a Role, and existing dirty `bound_agent_id` values remain editable even if the runtime list no longer contains them.
- Restored the Role system prompt edit/preview switch so prompt preview remains available from the Role detail page without flattening the Settings secondary-page structure.
- Fixed a real V2 form bug found during browser verification: creating a Role used a fresh draft object on every render, so Validate could clear the user's unsaved form values before Save. The new draft is stable for the create session, and the system prompt field stays registered while the preview view is open.
- Extended `frontend/app/browser-tests/v2-settings-actions.spec.ts` so the System -> Agent Runtime flow creates an ACP runtime, switches to Roles, creates a Role bound to that runtime, verifies prompt preview, asserts validate/save payloads for `bound_agent_id` and `system_prompt`, deletes the Role, returns to the System -> Agent Runtime secondary page, and deletes the runtime.
- Removed the replaced `test_browser_settings_save_role_and_agent_configs` Python Playwright scenario from `tests/integration_tests/browser/test_browser_smoke.py`. Remaining legacy Python browser scenarios: 5, with 2 still skipped.
- Rebuilt `frontend/dist/app` so dist-served browser tests exercise the restored Role binding and prompt preview behavior.

### Verification
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm run lint` passed for frontend and desktop TypeScript projects.
- `npm run test:browser -- browser-tests/v2-settings-actions.spec.ts -g "creates and deletes Agent Runtime"` passed for the focused migrated flow.
- `npm run test -- SettingsDrawer.test.tsx -t "validates, deletes, and creates role configs|creates and deletes agent runtimes"` passed with 2 focused Vitest tests. The full `SettingsDrawer.test.tsx` file was stopped after it produced only repeated jsdom `getComputedStyle(... pseudo-elements)` notices for about two minutes without a result; the narrower tests cover this slice directly.
- `npm run test:browser -- browser-tests/v2-settings-actions.spec.ts` passed with 13 TS browser tests.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `git diff --check` passed.
- Inspected `.tmp/frontend-v2-ts-settings-actions/v2-agent-runtime-create-delete.png`; it shows the Settings drawer still using the V1-aligned root section list, Agent Runtime still nested under System as a secondary page, the created runtime removed after cleanup, no success-toast stack covering the final screenshot, and the main shell still fixed behind the drawer.

### Reviewer
- Main-agent source fix, TS browser migration, targeted unit coverage, frontend build/typecheck, Python syntax/lint, screenshot inspection, and remaining Python browser scan completed for this slice. No Settings subsystem sign-off, browser-suite migration sign-off, stream/replay sign-off, final visual audit sign-off, Electron sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Agent Runtime Settings TS Browser Batch

### Scope
- Re-checked the active frontend rewrite goal and the remaining `test_browser_settings_save_role_and_agent_configs` Python scenario before editing. Existing TS coverage already exercises role validation/save/delete, so this slice targets the missing dist/browser Agent Runtime form flow.
- Extended `frontend/app/browser-tests/v2-settings-actions.spec.ts` with deterministic TS browser coverage for Settings -> System -> Agent Runtime as a secondary settings page, creating a stdio ACP runtime, asserting the real `PUT /api/system/configs/agent-runtimes/{agent_id}` payload, transitioning to the saved detail view, deleting the runtime through the confirmation popover, asserting `DELETE /api/system/configs/agent-runtimes/{agent_id}`, and confirming the runtime is removed from the list.
- Added stateful browser mock support for Agent Runtime list/detail/save/delete responses so list rows, detail forms, and request assertions share the same state model.
- Preserved V1-aligned navigation boundaries: Agent Runtime remains under System rather than becoming a first-level Settings tab, and no sidebar or Settings section entries were added or removed.
- Kept the old `test_browser_settings_save_role_and_agent_configs` Python scenario in place for now because this slice covers its Agent Runtime half while final removal still needs scenario accounting across the already-covered Role flow and any residual legacy-only assertions. Remaining frontend rewrite work still includes migrating or deleting the remaining 6 legacy Python browser scenarios, deeper stream replay and interrupted-stream recovery coverage, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/v2-settings-actions.spec.ts -g "creates and deletes Agent Runtime"` passed for the new focused flow.
- `npm run test:browser -- browser-tests/v2-settings-actions.spec.ts` passed with 13 TS browser tests after tightening the New runtime click to the Agent Runtime toolbar.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- Inspected `.tmp/frontend-v2-ts-settings-actions/v2-agent-runtime-create-delete.png`; it shows the fixed V2 shell, Settings drawer open on the System secondary page, Agent Runtime selected, the created runtime removed after delete, and no document-level scroll.

### Reviewer
- Main-agent TS browser migration, Settings/Agent Runtime workflow verification, screenshot inspection, and remaining Python scenario accounting completed for this slice. No Settings subsystem sign-off, browser-suite migration sign-off, stream/replay sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Shell Session Management And MCP Reload TS Browser Batch

### Scope
- Re-checked the active frontend rewrite goal, current parity checklist, existing V2 shell/settings TS browser coverage, and the remaining legacy Python browser scenarios before editing. This slice targets a missing browser-level V2 shell management proof instead of chasing only the latest screenshot feedback.
- Extended `frontend/app/browser-tests/v2-shell-parity.spec.ts` with deterministic TS browser coverage for creating a session from the sidebar, selecting the created session, renaming it through the real `PATCH /api/sessions/{id}` metadata endpoint, deleting it through `DELETE /api/sessions/{id}` with the cascade/force payload, and falling back to the remaining session.
- Extended the same TS browser flow through Settings -> System -> MCP as a secondary settings page and verified the real `POST /api/system/configs/mcp:reload` action. The V1-aligned sidebar item set and Settings section grouping remain covered by the adjacent shell parity tests rather than duplicated here.
- Added stateful browser mocks for session create/rename/delete and MCP reload, including tombstone handling for in-flight session queries after deletion so the test models the UI's normal async query tail.
- Kept the old `test_browser_shell_settings_and_session_management` Python scenario in place for now because this slice migrates its shell/session/MCP core while remaining Feishu connector creation and some broad observability smoke coverage still need final scenario-by-scenario accounting. Remaining frontend rewrite work still includes migrating or deleting the remaining 6 legacy Python browser scenarios, deeper stream replay and interrupted-stream recovery coverage, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/v2-shell-parity.spec.ts` passed with 5 TS browser tests after tightening the new flow to wait for the delete confirmation dialog to disappear before screenshot capture.
- Inspected `.tmp/frontend-v2-ts-shell/v2-shell-session-management-mcp.png`; it shows the fixed V2 shell with V1-aligned primary sidebar entries, the surviving session selected after deletion, Settings closed after the MCP reload action, no document-level scroll, and the composer controls contained within the bottom composer frame.
- `git diff --check` passed for the current source changes.

### Reviewer
- Main-agent TS browser migration, shell/session/MCP workflow verification, screenshot inspection, and remaining Python scenario accounting completed for this slice. No shell subsystem sign-off, Settings subsystem sign-off, browser-suite migration sign-off, stream/replay sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Environment Variables And Session Topology TS Browser Batch

### Scope
- Re-checked the active frontend rewrite goal, remaining legacy Python browser surface, and existing Settings/Composer TS coverage before editing. This slice targets the old `test_browser_environment_variables_and_session_topology` workflow at dist/browser level without changing the Settings navigation structure.
- Extended `frontend/app/browser-tests/v2-settings-actions.spec.ts` with deterministic TS browser coverage for the V2 Settings Environment variables secondary page: app/system variable visibility, system group expansion, app variable creation through the modal, PUT payload shape, delete confirmation, DELETE path, and list removal.
- Extended the same TS browser workflow through Composer session topology controls: normal -> orchestration mode switch, default orchestration preset PATCH payload, Shipping preset selection PATCH payload, normal mode reset PATCH payload, fixed-shell no-document-scroll behavior, and composer control overlap detection.
- Added browser mock state for environment-variable catalog changes and session detail/topology updates so the UI and request assertions share the same current-state model.
- Kept the V1-style secondary-page logic intact: Environment variables remains a Settings section, orchestration config remains a Settings section, and topology switching stays in the composer controls instead of being promoted to a new first-level page.
- Kept the old `test_browser_environment_variables_and_session_topology` Python scenario in place for now because the current TS coverage migrates its core V2-equivalent flows but the remaining legacy browser file still needs final scenario-by-scenario removal accounting. Remaining frontend rewrite work still includes migrating or deleting the remaining 6 legacy Python browser scenarios, deeper stream replay and interrupted-stream recovery coverage, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `npm run build` passed before the dist-served browser run; the final source-only TS browser change did not alter `frontend/dist/app`.
- `npm run test:browser -- browser-tests/v2-settings-actions.spec.ts` passed with 12 TS browser tests after one unrelated transient timeout in the existing remote-workspace test was rerun successfully.
- Inspected `.tmp/frontend-v2-ts-settings-actions/v2-environment-topology-workflow.png`; it shows the fixed V2 shell with sidebar navigation unchanged, Settings closed after the environment-variable work, the composer back in normal mode, and the control row kept within the composer frame without overlap.
- `rg -n "^def test_browser_|^@pytest\.mark\.skip" tests/integration_tests/browser/test_browser_smoke.py` still reports 6 legacy Python browser scenarios; no Python scenario was removed in this partial migration slice.

### Reviewer
- Main-agent TS browser migration, frontend lint/typecheck/build, TS browser workflow, screenshot inspection, and remaining Python scenario accounting completed for this slice. No Settings subsystem sign-off, Composer/topology subsystem sign-off, browser-suite migration sign-off, stream/replay sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Automation Project Create/Run/Delete TS Browser Batch

### Scope
- Re-checked the active frontend rewrite goal and the remaining legacy Python browser surface before editing. This slice targets a real V1 workflow gap in the V2 Automation page rather than only the latest visual notes.
- Added typed V2 API client contracts for creating, updating, and deleting automation projects through `/api/automation/projects`, `/api/automation/projects/{id}`, and the existing run/enable/disable endpoints.
- Restored Automation page project management in the V2 shell: users can create a scheduled automation project from the Automation secondary surface, run it immediately, follow the run to the created session with the correct workspace id, and delete the project with a confirmation dialog.
- Kept the V1-style page structure intact: the sidebar item count/order is unchanged, Automation remains a focused module page with list/detail layout, and project creation opens in a modal instead of flattening all configuration into the first-level page.
- Fixed the automation project query-cache merge so newly-created projects are appended to cached project lists before selection, preventing the UI from snapping back to the first existing project after creation.
- Extended `frontend/app/browser-tests/v2-module-actions.spec.ts` with a deterministic TS browser workflow for create -> run -> session handoff -> return -> delete, including request-payload assertions, fixed-shell no-document-scroll checks, and screenshot evidence.
- Rebuilt `frontend/dist/app` so dist-served browser tests exercise the restored Automation workflow.
- Kept the old `test_browser_workspace_and_automation_project_views` Python scenario in place for now because it still includes workspace-project interactions that are not yet fully equivalent in TS coverage. Remaining frontend rewrite work still includes migrating the remaining 6 legacy Python browser scenarios, deeper stream replay and interrupted-stream recovery coverage, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test -- apiClient.test.ts` passed with 31 unit tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm run test:browser -- browser-tests/v2-module-actions.spec.ts` passed with 4 TS browser tests.
- Inspected `.tmp/frontend-v2-ts-module-actions/v2-automation-create-detail.png`; it shows the fixed V2 shell with sidebar navigation unchanged, Automation selected as a module page, project list and detail kept inside the shell frame, the new project selected after creation, and no document-level scroll or modal residue.

### Reviewer
- Main-agent source fix, targeted API unit test, frontend lint/typecheck/build, TS browser workflow, screenshot inspection, and remaining Python scenario accounting completed for this slice. No Automation subsystem sign-off, browser-suite migration sign-off, stream/replay sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Web Settings Declared Defaults And UI Language Persistence TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, remaining Python UI/browser surface, current Settings TS browser coverage, and the real Web settings structure before editing. This slice targets Settings/Web parity and the browser-suite migration rather than only the latest visual note.
- Restored the V1 language setting contract in the V2 shell: the app now reads `/api/system/configs/ui-language` on startup, maps backend `en-US` to the internal English language state, persists topbar language toggles back through the same endpoint, and optimistically updates the query cache so the old saved value cannot flicker the UI back during a slow save.
- Added typed V2 API client coverage for `fetchUiLanguageSettings` and `saveUiLanguageSettings`.
- Extended `frontend/app/browser-tests/v2-settings-actions.spec.ts` with deterministic TS browser coverage for the old Web declared-defaults scenario: backend-initialized Chinese UI, Web settings secondary page navigation, Exa API key preserved text, fallback provider option labels, SearXNG URL and built-in instances, Exa provider link, Disabled hide/show roundtrip, English and Chinese language-toggle PUT payloads, and fixed-shell no-document-scroll behavior.
- Removed the replaced `test_browser_web_settings_ui_matches_declared_defaults` Python Playwright scenario from `tests/integration_tests/browser/test_browser_smoke.py` and cleaned the now-unused Web defaults helper code.
- Rebuilt `frontend/dist/app` so the dist-served browser tests exercise the restored UI language persistence and Web defaults behavior.
- Kept this as targeted Settings/Web browser-suite migration progress only. Remaining frontend rewrite work still includes migrating the remaining 6 legacy scenarios in `test_browser_smoke.py`, deeper stream replay and interrupted-stream recovery browser scenarios, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test -- apiClient.test.ts AppShell.test.tsx` passed with 50 unit tests.
- `npx tsc --noEmit --pretty false --project tsconfig.json` passed.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm run test:browser -- browser-tests/v2-settings-actions.spec.ts` passed with 11 TS browser tests.
- Inspected `.tmp/frontend-v2-ts-settings-actions/v2-web-settings-defaults-language.png`; it shows the V1-style fixed shell with the sidebar still present, Settings using its secondary navigation, Web selected as a secondary settings page, Chinese labels restored after the language roundtrip, and the Web form contained in the drawer rather than flattened into a top-level surface.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `rg -n "^def test_browser_|^@pytest\.mark\.skip|test_browser_web_settings_ui_matches_declared_defaults" tests\integration_tests\browser\test_browser_smoke.py` reports 6 remaining legacy Python browser scenarios and no replaced Web defaults scenario.

### Reviewer
- Main-agent source fix, targeted API/AppShell unit tests, TS browser, frontend lint/typecheck/build, Python syntax/lint, screenshot inspection, remaining Python browser scan, and cleanup completed for this slice. No Settings subsystem sign-off, browser-suite migration sign-off, stream/replay sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

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

## 2026-06-26 Connector Token Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, current worktree, and the remaining legacy Python browser-test surface before editing. This slice targets the broader browser-suite migration while preserving V1 secondary-page and modal opening behavior.
- Added `frontend/app/browser-tests/v1-connector-token-autofill.spec.ts` with TS browser coverage for the V1 GitHub connector modal and V1 Skills ClawHub settings modal.
- Covered saved-token protection against browser-autofilled DOM password values: GitHub clears synthetic input and submits `{}` when only the persisted backend token should be used, while ClawHub keeps the saved token when the DOM value changed without real user input.
- Deleted the replaced Python browser files `tests/integration_tests/browser/test_github_browser_flow.py` and `tests/integration_tests/browser/test_clawhub_browser_flow.py`.
- Kept this as browser-suite migration progress only. Remaining frontend rewrite work still includes the large legacy browser smoke migration, the skipped backend-status pressure harness, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/v1-connector-token-autofill.spec.ts` passed with 2 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `rg -n "test_github_browser_flow|test_clawhub_browser_flow|github_saved_token_wins|clawhub_saved_token_wins|sync_playwright|playwright\.sync_api" tests/integration_tests/browser frontend/app/browser-tests -g "*.py" -g "*.ts"` now reports only the remaining legacy Python browser files `test_browser_smoke.py` and `test_backend_status_pressure.py`.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, deletion scan, remaining Python browser scan, and cleanup completed for this slice. No browser-suite migration sign-off, Application Shell sign-off, Settings sign-off, Connectors sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Backend Status Pressure Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, current worktree, and remaining legacy Python browser-test surface before editing. This slice removes the standalone skipped backend-status pressure browser harness from Python instead of carrying another mixed Playwright boundary.
- Added `frontend/app/browser-tests/v2-backend-status-pressure.spec.ts` with deterministic TS browser coverage for V2 backend status behavior while ten delayed non-health API requests are pending.
- Verified that V2 health polling continues under request pressure and the sidebar backend status remains online rather than regressing to busy or offline.
- Deleted `tests/integration_tests/browser/test_backend_status_pressure.py` after the replacement TS browser scenario passed.
- Kept this as targeted browser-suite migration and Application Shell status coverage only. Remaining frontend rewrite work still includes migrating the large legacy `test_browser_smoke.py`, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/v2-backend-status-pressure.spec.ts` passed with 1 TS browser test.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `rg -n "test_backend_status_pressure|backend_status_stays_connected|sync_playwright|playwright\.sync_api" tests/integration_tests/browser frontend/app/browser-tests -g "*.py" -g "*.ts"` now reports only the remaining legacy Python browser file `test_browser_smoke.py`.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, deletion scan, remaining Python browser scan, and cleanup completed for this slice. No browser-suite migration sign-off, Application Shell sign-off, or V2 frontend completion is claimed.

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

## 2026-06-29 Recovery Question Supplement Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal and remaining browser-suite migration surface before editing. This slice keeps focus on Run Recovery parity and the requirement to move UI/browser coverage out of Python.
- Fixed a V1/V2 recovery behavior gap: V2 now keeps supplemental answers per selected option, not only for the reserved "Other" option, and submits those supplements in the user-question answer payload for both single-choice and multiple-choice prompts.
- Added explicit recovery focus-refresh handling so the recovery snapshot can be force-refreshed on window focus without relying on React Query's default focus behavior. The TS browser scenario verifies that an in-progress composition/focused supplemental answer survives the refresh.
- Extended `frontend/app/browser-tests/v2-recovery.spec.ts` with TS browser coverage for multi-prompt user-question supplements, force refresh, focus preservation, payload shape, and fixed-shell no-document-scroll behavior.
- Removed the replaced `test_browser_ask_question_recovery_card_submits_answers` scenario and its now-unused `_wait_for_open_user_questions` helper from `tests/integration_tests/browser/test_browser_smoke.py`.
- Rebuilt `frontend/dist` from the V2 source changes so dist-served browser tests exercise the updated behavior instead of stale assets.
- Kept this as targeted Run Recovery and browser-suite migration progress only. Remaining frontend rewrite work still includes migrating the remaining 18 legacy scenarios in `test_browser_smoke.py`, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test -- RecoveryBar.test.tsx` passed with 25 frontend unit tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm run test:browser -- browser-tests/v2-recovery.spec.ts` passed with 7 TS browser tests.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `rg -n "test_browser_ask_question_recovery_card_submits_answers|_wait_for_open_user_questions|sync_playwright|playwright\.sync_api|^def test_browser_" tests/integration_tests/browser frontend/app/browser-tests` confirms the migrated ask-question scenario is gone and only `test_browser_smoke.py` remains as the legacy Python browser file.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck/build, Python syntax/lint, remaining Python browser scan, and cleanup completed for this slice. No Run Recovery subsystem sign-off, browser-suite migration sign-off, Application Shell sign-off, Settings sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Round Todo Detail Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, parity checklist, current worktree, and the remaining `test_browser_smoke.py` browser-test surface before editing. This slice targets Rounds, Todos, History, And Retry parity while continuing the Python UI browser migration.
- Extended `frontend/app/browser-tests/v2-rounds.spec.ts` with deterministic TS browser coverage for active round rail todo detail behavior: the round remains the active step, the rail renders a single dot without legacy index/resizer artifacts, todo details open from the rail, and todo item text/title metadata stays scoped to the round detail instead of being flattened into message cards.
- Removed the replaced `test_browser_round_timeline_renders_todo_detail` Python browser scenario from `tests/integration_tests/browser/test_browser_smoke.py`.
- Kept this as targeted Rounds/Todos browser-suite migration progress only. Remaining frontend rewrite work still includes migrating the remaining 17 legacy scenarios in `test_browser_smoke.py`, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/v2-rounds.spec.ts` passed with 2 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `rg -n "test_browser_round_timeline_renders_todo_detail|todo-validation|sync_playwright|playwright\.sync_api" tests/integration_tests/browser frontend/app/browser-tests -g "*.py" -g "*.ts"` confirms the migrated todo scenario is gone and only `test_browser_smoke.py` remains as the legacy Python Playwright UI file.
- `rg -n "^def test_browser_|^@pytest\.mark\.skip" tests/integration_tests/browser/test_browser_smoke.py` reports 17 remaining legacy Python browser scenarios.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, Python syntax/lint, remaining Python browser scan, and cleanup completed for this slice. No Rounds/Todos subsystem sign-off, browser-suite migration sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Settings Mask Behavior Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, current worktree, existing Settings TS coverage, and the remaining `test_browser_smoke.py` browser-test surface before editing. This slice targets V1 Settings shell behavior while continuing the Python UI browser migration.
- Fixed a V1/V2 behavior gap by making the V2 Settings drawer non-mask-closable. Dragging from inside Settings to the mask and clicking outside now keeps Settings open; the explicit close button remains the close path.
- Extended `frontend/app/browser-tests/v2-settings-actions.spec.ts` with deterministic TS browser coverage for the outside-drag and mask-click behavior, plus fixed-shell no-document-scroll verification.
- Removed the replaced `test_browser_settings_modal_stays_open_on_outside_click` Python browser scenario from `tests/integration_tests/browser/test_browser_smoke.py`.
- Rebuilt `frontend/dist` from the V2 source change so dist-served browser tests exercise the updated Settings drawer behavior.
- Kept this as targeted Settings/Application Shell browser-suite migration progress only. Remaining frontend rewrite work still includes migrating the remaining 16 legacy scenarios in `test_browser_smoke.py`, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm run test:browser -- browser-tests/v2-settings-actions.spec.ts` passed with 9 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `rg -n "test_browser_settings_modal_stays_open_on_outside_click|settings mask behavior|maskClosable|sync_playwright|playwright\.sync_api" tests/integration_tests/browser frontend/app/browser-tests frontend/app/src/features/shell/SettingsDrawer.tsx -g "*.py" -g "*.ts" -g "*.tsx"` confirms the migrated outside-click scenario is gone from Python, the V2 drawer fix is present, and only `test_browser_smoke.py` remains as the legacy Python Playwright UI file.
- `rg -n "^def test_browser_|^@pytest\.mark\.skip" tests/integration_tests/browser/test_browser_smoke.py` reports 16 remaining legacy Python browser scenarios.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck/build, Python syntax/lint, remaining Python browser scan, and cleanup completed for this slice. No Settings subsystem sign-off, Application Shell sign-off, browser-suite migration sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Remote Workspace SSH Profile Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, current worktree, existing Settings TS coverage, and the remaining `test_browser_smoke.py` browser-test surface before editing. This slice keeps the work on the global migration target instead of only reacting to the latest UI note.
- Extended `frontend/app/browser-tests/v2-settings-actions.spec.ts` with deterministic TS browser coverage for creating Remote workspace SSH profiles from Settings: the secondary Settings page opens, the new-profile editor exposes the expected SSH fields, the save request sends the wrapped config payload, the saved profile appears in the profile list, the profile detail can be opened, and the shell remains fixed without document scroll.
- Removed the replaced `test_browser_remote_workspace_settings_group_ssh_fields` Python browser scenario from `tests/integration_tests/browser/test_browser_smoke.py`, along with the now-unused layout assertion helpers and `Locator` import.
- Kept this as targeted Remote workspace / Settings browser-suite migration progress only. Remaining frontend rewrite work still includes migrating the remaining 15 legacy scenarios in `test_browser_smoke.py`, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/v2-settings-actions.spec.ts` passed with 10 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `rg -n "^def test_browser_|^@pytest\.mark\.skip" tests/integration_tests/browser/test_browser_smoke.py` reports 15 remaining legacy Python browser scenarios.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, Python syntax/lint, remaining Python browser scan, and cleanup completed for this slice. No Settings subsystem sign-off, Remote workspace subsystem sign-off, browser-suite migration sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 AG-UI Composer Canonical Input Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, parity checklist, current worktree, and remaining legacy `test_browser_smoke.py` browser-test surface before editing. This slice targets Composer And Run Controls plus AG-UI Runtime Stream semantics, not only visual polish.
- Extended `frontend/app/browser-tests/v2-stream-create-run.spec.ts` so the V2 composer run-creation flow verifies the submitted AG-UI request still uses canonical text input parts and does not send the old `intent` field.
- Removed the replaced skipped `test_browser_run_flow_uses_canonical_input_payload` Python browser scenario from `tests/integration_tests/browser/test_browser_smoke.py`.
- Kept this as targeted Composer/AG-UI browser-suite migration progress only. Remaining frontend rewrite work still includes migrating the remaining 14 legacy scenarios in `test_browser_smoke.py`, deeper stream replay/interrupted recovery review, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/v2-stream-create-run.spec.ts` passed with 2 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `rg -n "^def test_browser_|^@pytest\.mark\.skip" tests/integration_tests/browser/test_browser_smoke.py` reports 14 remaining legacy Python browser scenarios.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, Python syntax/lint, remaining Python browser scan, and cleanup completed for this slice. No Composer subsystem sign-off, AG-UI Runtime Stream subsystem sign-off, browser-suite migration sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Terminal Run Viewed State V2 Parity And Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, parity checklist, current worktree, and remaining `test_browser_smoke.py` surface before editing. This slice targets Sessions And Projects, Message Timeline terminal state, and refresh recovery parity.
- Fixed a V1/V2 parity gap: V2 now consumes sidebar `has_unread_terminal_run` and latest terminal run fields, renders an unread terminal indicator when no active run indicator takes precedence, and marks the selected unread terminal session viewed through `POST /api/sessions/{session_id}/terminal-view`.
- Added optimistic sidebar cache clearing for terminal-view marks in the shell layer so sidebar, search, and automation session selections share the same viewed-state behavior. Failed marks invalidate the session caches back to backend truth.
- Added `markSessionTerminalRunViewed` to the V2 API client, extended the sidebar session contract, and added the unread terminal run accessible label/styling without changing the broader sidebar structure.
- Extended unit coverage in `SessionsSidebar.test.tsx` and `apiClient.test.ts`, added TS browser coverage in `v2-shell-parity.spec.ts` for unread terminal indicator clearing and reload persistence, and removed the replaced `test_browser_terminal_run_viewed_state_survives_reload` Python browser scenario plus its private helpers.
- Rebuilt `frontend/dist` from the V2 source change so dist-served browser tests exercise the updated terminal viewed behavior.
- Kept this as targeted terminal viewed-state parity and browser-suite migration progress only. Remaining frontend rewrite work still includes migrating the remaining 13 legacy scenarios in `test_browser_smoke.py`, deeper stream replay/interrupted recovery review, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test -- SessionsSidebar.test.tsx apiClient.test.ts` passed with 51 frontend unit tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm run test:browser -- browser-tests/v2-shell-parity.spec.ts` passed with 3 TS browser tests.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `rg -n "^def test_browser_|^@pytest\.mark\.skip" tests/integration_tests/browser/test_browser_smoke.py` reports 13 remaining legacy Python browser scenarios.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent source fix, TS unit tests, TS browser, frontend lint/typecheck/build, Python syntax/lint, remaining Python browser scan, and cleanup completed for this slice. No Sessions subsystem sign-off, Message Timeline subsystem sign-off, browser-suite migration sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Model Profile Manual Provider Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, Settings parity requirements, current worktree, existing TS Settings coverage, and remaining `test_browser_smoke.py` surface before editing. This slice targets a small but important model-profile data-preservation behavior.
- Extended `frontend/app/browser-tests/v2-settings-actions.spec.ts` so the existing model-profile detail flow verifies that manually changing the Provider field does not clear the current Base URL, then saves and asserts the outgoing model-profile payload preserves the edited provider and explicit endpoint.
- Removed the replaced `test_browser_model_profile_custom_provider_keeps_manual_base_url` Python browser scenario from `tests/integration_tests/browser/test_browser_smoke.py`.
- Kept this as targeted Settings / model-profile browser-suite migration progress only. Remaining frontend rewrite work still includes migrating the remaining 12 legacy scenarios in `test_browser_smoke.py`, deeper stream replay/interrupted recovery review, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/v2-settings-actions.spec.ts` passed with 10 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `rg -n "^def test_browser_|^@pytest\.mark\.skip" tests/integration_tests/browser/test_browser_smoke.py` reports 12 remaining legacy Python browser scenarios.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, Python syntax/lint, remaining Python browser scan, and cleanup completed for this slice. No Settings subsystem sign-off, browser-suite migration sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Web Settings Fallback Roundtrip V2 Parity And Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, Settings parity requirements, current worktree, existing Settings TS browser coverage, and the remaining `test_browser_smoke.py` browser-test surface before editing. This slice keeps the work on V1 parity and Python UI-browser migration, not just the latest visible UI note.
- Fixed a V1/V2 behavior gap in the V2 Web settings form: when the fallback provider is set to Disabled, the SearXNG instance URL and built-in instance list are removed from the visible settings page instead of lingering as disabled controls.
- Preserved the existing SearXNG URL while fallback is disabled, so saving Disabled still sends the retained URL and switching back to SearXNG restores the previous value.
- Extended `frontend/app/browser-tests/v2-settings-actions.spec.ts` so the existing Web settings flow verifies the Disabled roundtrip, hidden SearXNG controls, preserved save payload, restored URL, built-in instance visibility, save-error handling, and fixed-shell no-document-scroll behavior.
- Removed the replaced `test_browser_web_settings_complex_fallback_roundtrip` Python browser scenario from `tests/integration_tests/browser/test_browser_smoke.py`.
- Rebuilt `frontend/dist` from the V2 source change so dist-served browser tests exercise the updated Web settings behavior.
- Kept this as targeted Settings / Web browser-suite migration progress only. Remaining frontend rewrite work still includes migrating the remaining 11 legacy scenarios in `test_browser_smoke.py`, deeper stream replay and interrupted-stream recovery review, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test -- SettingsDrawer.test.tsx -t "web settings"` passed with the targeted Web settings unit test.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `npm run build` passed and refreshed `frontend/dist/app`.
- `npm run test:browser -- browser-tests/v2-settings-actions.spec.ts` passed with 10 TS browser tests.
- In-app browser check on `http://127.0.0.1:8000/app/` verified the real Settings > Web page: switching fallback to Disabled removed both the SearXNG URL control and built-in instance list from the DOM, kept document/body scroll height at the viewport height, and switching back to SearXNG restored the previous URL and built-in instance list.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `rg -n "^def test_browser_|^@pytest\.mark\.skip" tests/integration_tests/browser/test_browser_smoke.py` reports 11 remaining legacy Python browser scenarios.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent source fix, targeted TS unit test, TS browser, frontend lint/typecheck/build, Python syntax/lint, remaining Python browser scan, and cleanup completed for this slice. No Settings subsystem sign-off, browser-suite migration sign-off, stream/replay sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Subagent Session Race Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, parity checklist, current worktree, remaining `test_browser_smoke.py` browser-test surface, and existing TS subagent/session-switch coverage before editing. This slice targets Sessions And Projects plus Subagents race behavior rather than continuing Settings-only work.
- Extended `frontend/app/browser-tests/v2-subagent-session.spec.ts` with a deterministic TS browser scenario for a slow parent-session hydration race: the app starts on a control session, expands the parent session's subagent list, delays parent detail/message/round hydration, opens the child subagent session while the parent requests are still blocked, then verifies late parent hydration does not replace the subagent view.
- Verified the same scenario can return to the main parent session, switch back to the control session, and reopen the child subagent from the still-expanded sidebar list without losing the parent/child selection relationship.
- Removed the replaced `test_browser_subagent_view_survives_complex_switching_races` Python Playwright scenario from `tests/integration_tests/browser/test_browser_smoke.py` and cleaned the now-unused `Route` import.
- Kept this as targeted Subagents / Sessions browser-suite migration progress only. Remaining frontend rewrite work still includes migrating the remaining 10 legacy scenarios in `test_browser_smoke.py`, deeper stream replay and interrupted-stream recovery review, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/v2-subagent-session.spec.ts` passed with 2 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `rg -n "^def test_browser_|^@pytest\.mark\.skip" tests/integration_tests/browser/test_browser_smoke.py` reports 10 remaining legacy Python browser scenarios.
- Inspected `.tmp/frontend-v2-ts-subagent-session/v2-subagent-session-race.png`; it shows the parent session expanded, the Race review child selected, and the main panel still on the read-only subagent session after the race.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed under the workspace.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, Python syntax/lint, screenshot inspection, remaining Python browser scan, and cleanup completed for this slice. No Subagents subsystem sign-off, Sessions subsystem sign-off, browser-suite migration sign-off, stream/replay sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Sidebar Subagent Lazy Load Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, parity checklist, current worktree, the remaining `test_browser_smoke.py` surface, the existing shell/subagent TS browser coverage, and the current live V2 browser frame before editing. This slice targets Sessions/Subagents request-budget parity and the Python UI-browser migration instead of continuing only the latest visible UI note.
- Extended `frontend/app/browser-tests/v2-shell-parity.spec.ts` with deterministic TS browser coverage for large initial sidebar loads: four workspaces with twelve sessions each, every session exposing a subagent count, selected session visible, all subagent lists collapsed, zero `/sessions/{id}/subagents` requests during initial idle, stable session index requests, stable recovery requests, fixed-shell no-document-scroll verification, and screenshot evidence.
- Removed the replaced `test_browser_sidebar_lazy_loads_subagent_sessions_on_initial_open` Python Playwright scenario from `tests/integration_tests/browser/test_browser_smoke.py`.
- Kept this as targeted Sessions/Subagents browser-suite migration progress only. Remaining frontend rewrite work still includes migrating the remaining 9 legacy scenarios in `test_browser_smoke.py`, deeper stream replay and interrupted-stream recovery browser scenarios, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/v2-shell-parity.spec.ts` passed with 4 TS browser tests.
- `npx tsc --noEmit --pretty false --project tsconfig.json` passed.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `rg -n "^def test_browser_|^@pytest\.mark\.skip|test_browser_sidebar_lazy_loads_subagent_sessions_on_initial_open" tests\integration_tests\browser\test_browser_smoke.py` reports 9 remaining legacy Python browser scenarios and no replaced lazy-load scenario.
- Inspected `.tmp/frontend-v2-ts-shell/v2-sidebar-lazy-subagents.png`; it shows the large collapsed session list inside the fixed sidebar with no subagent child list rendered.
- In-app browser verification on `http://127.0.0.1:8000/app/` showed `documentScrollHeight === documentClientHeight === 720`, `bodyScrollHeight === bodyClientHeight === 720`, `windowScrollY === 0`, `.at-session-list` owning its own scroll (`277 / 1046`), and `.at-timeline` owning its own scroll (`500 / 4466`).
- Inspected `.tmp/frontend-v2-live-check/current-v2-framework.png`; the live Settings > Web page preserved the V1 root setting sections and kept the main shell fixed while content scrolled within its own pane.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, Python syntax/lint, screenshot inspection, live browser layout metrics, remaining Python browser scan, and cleanup completed for this slice. No Sessions subsystem sign-off, Subagents subsystem sign-off, browser-suite migration sign-off, stream/replay sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Subagent Send/Switch Pressure Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, parity checklist, current worktree, remaining `test_browser_smoke.py` browser-test surface, existing TS subagent/session-switch coverage, and the high-risk stream/replay/recovery items before editing. This slice targets Sessions/Subagents pressure behavior plus the Python UI-browser migration, not just visual polish.
- Extended `frontend/app/browser-tests/v2-subagent-session.spec.ts` with deterministic TS browser coverage for the old send/switch/subagent pressure flow: thirty-two sidebar seed sessions, eight rapid visible session switches, creating a new session from the V2 sidebar, sending through the AG-UI composer, verifying send feedback under 2500 ms, rendering a live run delta, switching back to the parent session, opening a subagent child view under 2500 ms, returning to the parent under 1000 ms, reopening the child, clearing the subagent view, resetting a primary module view back to chat on session selection, checking fixed-shell no-document-scroll behavior, and enforcing request-budget bounds for subagent list and sidebar index requests.
- Removed the replaced `test_browser_session_send_switch_and_subagent_view_stay_responsive_under_load` Python Playwright scenario from `tests/integration_tests/browser/test_browser_smoke.py` and cleaned now-unused API helper imports.
- Kept this as targeted Sessions/Subagents/Composer browser-suite migration progress only. Remaining frontend rewrite work still includes migrating the remaining 8 legacy scenarios in `test_browser_smoke.py`, deeper stream replay and interrupted-stream recovery browser scenarios, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/v2-subagent-session.spec.ts` passed with 3 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `npx tsc --noEmit --pretty false --project tsconfig.json` passed.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `rg -n "^def test_browser_|^@pytest\.mark\.skip|test_browser_session_send_switch_and_subagent_view_stay_responsive_under_load" tests\integration_tests\browser\test_browser_smoke.py` reports 8 remaining legacy Python browser scenarios and no replaced send/switch/subagent pressure scenario.
- Inspected `.tmp/frontend-v2-ts-subagent-session/v2-subagent-send-switch-pressure.png`; it shows the parent session restored in chat, the subagent row expanded under the parent, the new running session indicator preserved in the fixed sidebar, and the composer contained at the bottom of the fixed shell.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, Python syntax/lint, screenshot inspection, remaining Python browser scan, and cleanup completed for this slice. No Sessions subsystem sign-off, Subagents subsystem sign-off, Composer subsystem sign-off, browser-suite migration sign-off, stream/replay sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Burst New Session Start Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, current worktree, remaining `test_browser_smoke.py` browser-test surface, and existing V2 AG-UI composer stream coverage before editing. This slice targets Composer/session-start feedback and request-budget parity while continuing the Python UI-browser migration.
- Extended `frontend/app/browser-tests/v2-stream-create-run.spec.ts` with deterministic TS browser coverage for three burst new-session starts: each iteration creates a real V2 sidebar session, sends through the AG-UI composer, verifies visible Stop/live feedback within the old 2500 ms budget, preserves the canonical AG-UI input payload, keeps workspace refetches at zero after initial load, bounds sidebar/recovery/model-profile request churn, rejects subagent prefetches, and keeps the fixed shell/composer layout intact.
- Kept the migrated scenario faithful to the old burst-start semantics by proving live start feedback without forcing each run to terminal; forcing terminal events added stream-close sidebar refreshes and measured a different behavior.
- Removed the replaced skipped `test_browser_burst_new_session_starts_stay_within_request_budget` Python Playwright scenario from `tests/integration_tests/browser/test_browser_smoke.py` and cleaned the now-unused API helper import block.
- Kept this as targeted Composer/Sessions/AG-UI browser-suite migration progress only. Remaining frontend rewrite work still includes migrating the remaining 7 legacy scenarios in `test_browser_smoke.py`, deeper stream replay and interrupted-stream recovery browser scenarios, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/v2-stream-create-run.spec.ts` passed with 3 TS browser tests.
- `npm run lint` passed for the frontend TypeScript and desktop TypeScript projects.
- `npx tsc --noEmit --pretty false --project tsconfig.json` passed.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `rg -n "^def test_browser_|^@pytest\.mark\.skip|test_browser_burst_new_session_starts_stay_within_request_budget" tests\integration_tests\browser\test_browser_smoke.py` reports 7 remaining legacy Python browser scenarios and no replaced burst-start scenario.
- Inspected `.tmp/frontend-v2-ts-stream/v2-burst-new-session-starts.png`; it shows the three burst sessions with running indicators inside the fixed sidebar, live output in the chat pane, and the composer contained at the bottom of the fixed shell.

### Reviewer
- Main-agent TS browser, frontend lint/typecheck, Python syntax/lint, screenshot inspection, remaining Python browser scan, and cleanup completed for this slice. No Composer subsystem sign-off, Sessions subsystem sign-off, AG-UI Runtime Stream subsystem sign-off, browser-suite migration sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Workspace Project Actions Browser Harness TS Migration Batch

### Scope
- Re-checked the active frontend rewrite goal, current worktree, remaining `test_browser_smoke.py` browser-test surface, existing project-view TS coverage, and existing automation module-action TS coverage before editing. This slice targets Sessions And Projects / Workspace project actions while continuing the Python UI-browser migration, not just the latest visible message screenshot.
- Added a V2 `deleteWorkspace` frontend API client for `DELETE /api/workspaces/{workspace_id}` with optional `remove_directory=true` and the required forced delete body when local directory removal is selected.
- Restored the V1-equivalent workspace removal action in the V2 sidebar as a workspace-row secondary action, with a confirmation modal and an explicit "also remove the workspace directory" checkbox. This keeps the sidebar's primary navigation set unchanged and does not flatten project actions into the first-level shell.
- Extended `frontend/app/browser-tests/v2-project-view.spec.ts` to cover a nested workspace file-tree expansion, opening a file returned from the child tree request, project view reload, fixed-shell no-document-scroll behavior, workspace removal from the sidebar, and the resulting `/workspaces/{workspace_id}` DELETE request.
- Reused the existing `frontend/app/browser-tests/v2-module-actions.spec.ts` automation coverage for the old automation half of the replaced Python scenario: toggle, create, run, and delete all still go through real V2 endpoints.
- Removed the replaced `test_browser_workspace_and_automation_project_views` Python Playwright scenario from `tests/integration_tests/browser/test_browser_smoke.py`.
- Kept this as targeted Sessions And Projects / Workspace actions / Automation browser-suite migration progress only. Remaining frontend rewrite work still includes migrating the remaining 3 legacy `test_browser_smoke.py` browser scenarios, deeper stream replay and interrupted-stream recovery review, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test -- SessionsSidebar.test.tsx -t "workspace removal"` passed.
- `npm run test -- apiClient.test.ts -t "deletes workspaces"` passed.
- `npm run build` passed, including frontend and desktop typecheck plus Vite dist rebuild.
- `npm run test:browser -- browser-tests/v2-project-view.spec.ts` passed.
- `npm run test:browser -- browser-tests/v2-module-actions.spec.ts -g "automation"` passed with 2 TS browser tests.
- `npm run lint` passed.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `git diff --check` passed.
- `rg -n "^def test_browser_|^@pytest\.mark\.skip|test_browser_workspace_and_automation_project_views" tests\integration_tests\browser\test_browser_smoke.py` reports 3 remaining legacy Python browser scenarios and no replaced workspace/automation scenario.
- Inspected `.tmp/frontend-v2-ts-project-view/v2-project-view-files.png`; it shows the V2 project secondary page, right-side file tree expanded to `frontend/guide.md`, the README preview selected, and both workspace rows contained inside the fixed sidebar.
- Live in-app browser layout verification on `http://127.0.0.1:8000/app/` measured `documentScrollHeight === documentClientHeight === 720`, `bodyScrollHeight === bodyClientHeight === 720`, `windowScrollY === 0`, `.at-session-list` owning its own scroll (`277 / 1046`), and `.at-timeline` owning its own scroll (`500 / 4466`).

### Reviewer
- Main-agent source fix, TS unit tests, TS browser, frontend lint/typecheck/build, Python syntax/lint, screenshot inspection, live browser layout metrics, remaining Python browser scan, and cleanup completed for this slice. No Sessions And Projects subsystem sign-off, Automation subsystem sign-off, browser-suite migration sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Environment Topology Browser Harness TS Migration Cleanup

### Scope
- Re-checked the active frontend rewrite goal, current worktree, remaining `test_browser_smoke.py` browser-test surface, and existing `v2-settings-actions.spec.ts` coverage before editing. This slice targets Settings / Composer topology migration evidence instead of continuing the previous workspace-action area.
- Confirmed `frontend/app/browser-tests/v2-settings-actions.spec.ts` already covers the replaced V1/Python behavior: app environment variable create/delete through real endpoints, session switch to orchestration with the default preset, orchestration preset selection, reset to normal mode, request payload verification, fixed-shell no-document-scroll verification, and screenshot evidence.
- Removed the skipped `test_browser_environment_variables_and_session_topology` Python Playwright scenario from `tests/integration_tests/browser/test_browser_smoke.py`.
- Kept this as targeted Settings / Session Topology browser-suite migration cleanup only. Remaining frontend rewrite work still includes migrating the remaining 2 active and 1 skipped `test_browser_smoke.py` browser scenarios, deeper stream replay and interrupted-stream recovery review, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/v2-settings-actions.spec.ts -g "environment variables and session topology"` passed.
- `uv run --extra dev python -m py_compile tests\integration_tests\browser\test_browser_smoke.py` passed.
- `uv run --extra dev ruff check tests\integration_tests\browser\test_browser_smoke.py` passed.
- `git diff --check` passed.
- `rg -n "^def test_browser_|^@pytest\.mark\.skip|test_browser_environment_variables_and_session_topology" tests\integration_tests\browser\test_browser_smoke.py` reports 2 active plus 1 skipped legacy Python browser scenarios and no replaced environment/topology scenario.
- Inspected `.tmp/frontend-v2-ts-settings-actions/v2-environment-topology-workflow.png`; it shows the V2 fixed shell after the environment/topology browser flow, with sidebar and composer contained in one viewport.

### Reviewer
- Main-agent TS browser, Python syntax/lint, diff check, screenshot inspection, remaining Python browser scan, and cleanup completed for this slice. No Settings subsystem sign-off, Composer topology subsystem sign-off, browser-suite migration sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Multiplex Stream Reconnect Closed-Run Filter

### Scope
- Re-checked the active frontend rewrite goal, current worktree, current browser-test tree, and the high-risk stream/replay/recovery items before editing. This slice targets interrupted multiplex stream recovery rather than visual shell polish.
- Fixed a replay boundary in the V2 run stream controller: initial explicit replay still opens all requested run targets with their latest `afterEventId`, while manual reconnect after a transport interruption now filters out run targets already marked `closed` in local runtime state.
- Added controller coverage for both sides of the boundary: initial multiplex replay keeps locally terminal targets, while a reconnect after `run-1` is locally terminal and `run-2` remains open falls back to a single-run stream for `run-2` with the latest local event id instead of resubscribing the already-closed run.
- Kept this as targeted AG-UI runtime stream recovery progress only. Remaining frontend rewrite work still includes deeper stream/replay browser scenarios, final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test -- RunStreamController.test.tsx streamClient.test.ts` passed with 50 tests.
- `npm run build` passed, including frontend and desktop typecheck plus Vite dist rebuild.
- `git diff --check` passed.
- `rg --files tests frontend/app/browser-tests | rg "(browser|playwright|\.py$|\.spec\.ts$)"` shows the current browser coverage is in TS browser specs plus the non-UI Python module-loading browser integration helpers; the old `test_browser_smoke.py` file is no longer present.
- `rg -n "sync_playwright|playwright\.sync_api|def test_browser_|pytest\.mark\.skip" tests frontend/app/browser-tests -g "*.py" -g "*.ts" -g "*.tsx"` found no remaining Python UI Playwright scenarios.

### Reviewer
- Read-only reviewer returned PASS for the replay/reconnect boundary and recommended the initial-multiplex guard that was added before commit. Main-agent source fix, targeted runtime unit tests, frontend typecheck/build, diff check, and current browser-test tree scan completed for this slice. No AG-UI Runtime Stream subsystem sign-off, browser-suite sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Real SSE Terminal Background Subagent Reconnect Browser Coverage

### Scope
- Re-checked the active frontend rewrite goal, parity checklist, current worktree, and existing TS stream/recovery browser coverage before editing. This slice targets AG-UI runtime stream interrupted-recovery evidence rather than the latest visual feedback.
- Extended `frontend/app/browser-tests/v2-real-sse-stale-recovery.spec.ts` with a real SSE browser scenario where recovery opens a multiplex stream for the active parent run and a background subagent run, the subagent run reaches `run.completed`, and the subsequent manual reconnect must reopen only the still-active parent run at `after_event_id=6`.
- Kept the existing all-active multiplex reconnect scenario but made it less brittle by no longer requiring an intermediate native `Last-Event-ID` empty reconnect before the manual fallback. The test still proves the final per-run cursor reconnect.
- Updated two existing real SSE browser assertions to match current UI behavior: supplemental user-question inputs are now option-specific, and the real HTTP harness may render the composer in Chinese while the behavior under test remains the same.
- Kept this as targeted AG-UI Runtime Stream browser evidence only. Remaining frontend rewrite work still includes final V1/V2 visual audit, Electron release checks, V2 naming cleanup, parity checklist completion, and reviewer sign-off.

### Verification
- `npm run test:browser -- browser-tests/v2-real-sse-stale-recovery.spec.ts -g "drops a terminal real SSE background subagent"` passed.
- `npm run test:browser -- browser-tests/v2-real-sse-stale-recovery.spec.ts -g "resumes a real SSE recoverable run before answering user question|reconnects a real SSE interruption from the runtime cursor|reconnects real SSE multiplexed background streams from per-run cursors|drops a terminal real SSE background subagent"` passed with 4 tests.
- `npm run test:browser -- browser-tests/v2-real-sse-stale-recovery.spec.ts` passed with 17 tests.
- `npx tsc --noEmit --pretty false --project tsconfig.json` passed.
- `git diff --check` passed.
- Inspected `.tmp/frontend-v2-ts-stream/v2-real-sse-background-subagent-terminal-reconnect.png`; it shows the fixed V2 shell with unchanged sidebar structure, main run output resumed after the subagent terminal event, the composer contained at the bottom, and no document-level scroll. No `frontend/dist` rebuild was needed because only browser-test code and this ledger changed.

### Reviewer
- Main-agent TS browser coverage, typecheck, diff check, screenshot inspection, and Playwright artifact cleanup completed for this slice. No AG-UI Runtime Stream subsystem sign-off, browser-suite sign-off, final visual audit sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Electron Desktop Smoke Gate Evidence

### Scope
- Re-checked the active frontend rewrite goal, quality gates, release cleanup requirements, and current worktree before running validation. This slice targets the release-level Desktop Checks gate rather than stream/replay or visual polish.
- Ran the existing Electron browser smoke coverage against the current built desktop artifacts. The suite covers renderer loading the new app, isolated preload API shape, absence of renderer `require` and `process`, backend readiness status, startup failure UI, diagnostics copy, retry startup, external-link opening through the preload/main boundary, managed backend startup, health polling, app load, auto-quit, and managed backend shutdown.
- Kept this as desktop-gate evidence only. Remaining frontend rewrite work still includes final V1/V2 visual audit, naming cleanup, parity checklist completion, subsystem reviewer sign-offs, release promotion decisions, and final full-check execution before completion can be claimed.

### Verification
- `npm run test:browser -- browser-tests/v2-desktop-smoke.spec.ts` passed with 4 Electron smoke tests.
- Inspected `.tmp/frontend-v2-desktop/v2-electron-renderer.png`; it shows the Electron renderer loading the fixed V2 shell with the desktop smoke message, sidebar, composer, backend connected status, and isolated desktop controls.
- Inspected `.tmp/frontend-v2-desktop/v2-electron-startup-failed.png`; it shows the startup failure screen with backend URL diagnostics plus Copy diagnostics and Retry startup actions.
- Cleaned `frontend/app/test-results` after verifying the resolved path stayed inside the workspace. No `frontend/dist` rebuild was needed because this slice changed only this ledger.

### Reviewer
- Main-agent Electron smoke execution, screenshot inspection, and Playwright artifact cleanup completed for this slice. No Desktop subsystem sign-off, final visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Route Switch Naming Guard

### Scope
- Re-checked the active frontend rewrite goal, current worktree, recent browser evidence, and temporary V2/new-interface naming surface before editing. This slice targets release naming cleanup while preserving the V1 return path as an explicit migration control.
- Changed the default mocked browser-test session title from `V2 shell route switch` to `Agent Teams route switch`, so route-switch screenshots and visible shell text no longer leak implementation-era naming.
- Added route-switch browser coverage that asserts the new shell visible text does not expose `V2`, `v2`, `新版`, or `旧版`, while the `V1` return link remains visible.
- Kept this as targeted naming cleanup evidence only. Remaining frontend rewrite work still includes final V1/V2 visual audit, stream/replay edge-case sign-off, parity checklist completion, subsystem reviewer sign-offs, release promotion decisions, and final full-check execution before completion can be claimed.

### Verification
- `npm run test:browser -- browser-tests/v2-route-switch.spec.ts` passed.
- `npm run lint` passed.
- Inspected `.tmp/frontend-v2-ts-route-switch/ts-v2-after-new-ui-switch.png`; it shows the fixed shell after switching to the new interface, with sidebar, workspace list, main work area, and bottom composer contained in one viewport. No temporary V2/new/old naming is visible in the new shell outside the intentional `V1` return link.
- No `frontend/dist` rebuild was needed because this slice changed only browser-test code and this ledger.

### Reviewer
- Main-agent route-switch browser coverage, frontend typecheck, screenshot inspection, and naming-surface cleanup completed for this slice. No final naming cleanup sign-off, visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Shell And Settings Parity Gate Repair

### Scope
- Re-checked the active frontend rewrite goal, live in-app browser shell, Settings drawer, message timeline, and existing shell parity browser coverage before editing. This slice targets the V1 sidebar/settings parity gate instead of adding new visible navigation.
- Live browser inspection on `http://127.0.0.1:8000/app/` confirmed the fixed shell has no document-level scroll, the sidebar owns its own scroll, the timeline owns its own scroll, the current visible message timeline no longer exposes raw `user/message/assistant` role labels, and Settings keeps the V1-aligned primary and secondary entry structure.
- Re-ran the existing shell/settings parity browser gate. It caught a real gap: opening Automation in the parity flow now requests `/automation/delivery-bindings`, but the parity mock did not handle that real data surface.
- Added the missing Automation delivery-binding response to `v2-shell-parity.spec.ts`, matching the existing module-action browser mock shape. The unhandled-route assertion remains strict.
- Kept this as test-harness parity gate repair and live visual evidence only. Remaining frontend rewrite work still includes stream/replay edge-case sign-off, final V1/V2 visual audit, subsystem reviewer sign-offs, release promotion decisions, and final full-check execution before completion can be claimed.

### Verification
- Initial `npm run test:browser -- browser-tests/v2-shell-parity.spec.ts -g "keeps V1 primary sidebar entries|keeps V1 settings sections"` failed on unhandled `GET /automation/delivery-bindings`, which is the gap fixed in this slice.
- Re-run `npm run test:browser -- browser-tests/v2-shell-parity.spec.ts -g "keeps V1 primary sidebar entries|keeps V1 settings sections"` passed with 2 tests.
- `npm run lint` passed.
- Inspected `.tmp/frontend-v2-ts-shell/v2-sidebar-module-parity.png`; it shows the V1-aligned sidebar entries and Settings drawer without document-level page growth.
- Inspected `.tmp/frontend-v2-ts-shell/v2-settings-system-parity.png`; it shows Settings preserving System secondary-page navigation instead of flattening MCP/Plugins/Commands/Hooks/Agent Runtime/GitHub/Triggers into the primary Settings nav.
- No `frontend/dist` rebuild was needed because this slice changed only browser-test code and this ledger.

### Reviewer
- Main-agent live UI inspection, targeted shell/settings browser gate repair, frontend typecheck, screenshot inspection, and strict unhandled-route verification completed for this slice. No Settings subsystem sign-off, final visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Release Browser Gate Evidence Sweep

### Scope
- Re-checked the active frontend rewrite goal, quality gates, current worktree, and existing TS browser coverage before running validation. This slice targets release-level browser evidence for Observability / Spec lineage, message export, Appearance, and narrow layout rather than changing product code.
- Ran the existing TS browser gates for opening Observability, rendering Spec lineage, downloading message exports, applying a dark Appearance preset, and keeping the workspace fixed under the narrow sidebar overlay.
- Kept this as evidence-gathering toward the Browser Checks and Visual Gate only. Remaining frontend rewrite work still includes stream/replay edge-case sign-off, final V1/V2 visual audit, subsystem reviewer sign-offs, release promotion decisions, and final full-check execution before completion can be claimed.

### Verification
- `npm run test:browser -- browser-tests/v2-observability.spec.ts browser-tests/v2-message-export.spec.ts browser-tests/v2-appearance-layout.spec.ts` passed with 4 tests.
- The Observability test verifies global/session scope switching, gateway metrics and breakdowns, Spec lineage task loading, spec artifact diff retrieval, checkpoint evaluation rendering, strict unhandled-route coverage, and fixed-shell no-document-scroll behavior.
- The message export test verifies HTML and PNG download actions from the top bar, suggested filenames, exported transcript structure, pending approval/question/retry/diagnostic content, valid PNG bytes, browser PNG decoding, and per-export rounds reloads.
- The Appearance / narrow-layout tests verify dark theme preset persistence, themed Settings framing, internal Settings scrolling without document scroll, 390px narrow sidebar overlay behavior, hidden resize handle on narrow viewports, and fixed workspace dimensions behind the overlay.
- Inspected `.tmp/frontend-v2-ts-observability/v2-observability-spec-lineage.png`; it shows the Observability surface with gateway breakdowns, task selection, spec lineage versions, checkpoint table, and diff block inside the fixed V2 shell.
- Inspected `.tmp/frontend-v2-ts-appearance/v2-narrow-sidebar-overlay.png`; it shows the narrow viewport sidebar overlay covering the fixed workspace without introducing document-level horizontal or vertical scroll.
- Inspected `.tmp/frontend-v2-ts-appearance/v2-appearance-dark-rose-pine.png`; it shows the Appearance settings first screen with the three theme cards, diff preview, preset selector, and theme table framed inside the Settings drawer.
- No `frontend/dist` rebuild was needed because this slice changed only this ledger.

### Reviewer
- Main-agent targeted browser gate execution and screenshot inspection completed for this slice. No Observability subsystem sign-off, Export subsystem sign-off, Appearance subsystem sign-off, final visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Visible Fixture Naming Cleanup And Review Findings

### Scope
- Re-checked the active frontend rewrite goal, release cleanup requirement, implementation ledger, current worktree, and visible browser-test fixture text before editing. This slice targets user-facing migration naming cleanup in screenshots and fixture data while preserving technical `v2-*` test file names, helper names, screenshot directories, and mock ids that remain temporary migration/test boundaries.
- Removed visible temporary `V2` wording from Observability, Shell parity, Module action, Board action, and Round rail browser fixtures where it would appear as session prompts, memory titles, automation prompts, board item bodies, spec diff requirements, or accessible round names.
- Left Spec lineage `v1` / `v2` cards in place because they are artifact version labels, not product migration naming.
- Asked a read-only reviewer to inspect subsystem 11 / release evidence across Observability, project view, spec lineage, export, media, and voice. The reviewer returned FAIL with real remaining gaps: missing Observability trends, missing task-addressable Spec lineage entry behavior, and incomplete V1-style multi-round export workflow. Those findings are carried forward as active work and no release cleanup or subsystem sign-off is claimed.

### Verification
- `npm run test:browser -- browser-tests/v2-observability.spec.ts browser-tests/v2-shell-parity.spec.ts browser-tests/v2-module-actions.spec.ts browser-tests/v2-board-actions.spec.ts browser-tests/v2-rounds.spec.ts` passed with 18 tests.
- `npm run lint` passed.
- `git diff --check` passed.
- Inspected `.tmp/frontend-v2-ts-observability/v2-observability-spec-lineage.png`; it shows Observability and Spec lineage in the fixed shell, with no visible temporary product `V2` naming beyond version labels.
- Inspected `.tmp/frontend-v2-ts-shell/v2-sidebar-module-parity.png`; it shows V1-aligned sidebar entries and Settings secondary-page navigation inside the fixed shell.
- Inspected `.tmp/frontend-v2-ts-rounds/v2-round-rail-detail.png`; it shows the Round rail and bottom composer contained in one viewport with the cleaned visible prompt text.
- No `frontend/dist` rebuild was needed because this slice changed only browser-test fixtures and this ledger.

### Reviewer
- Read-only reviewer `019f1250-3460-7d00-a68c-a4d96491ace7` returned FAIL. Blocking findings: Observability trends are not rendered in the TS panel, Spec lineage is embedded but lacks the V1 task-addressable/back/reload entry path, and message export downloads work but do not preserve the V1 multi-round selection and export structure. These findings are not resolved by this cleanup commit.

## 2026-06-29 Observability Trends Restore

### Scope
- Re-checked the reviewer FAIL findings, V1 Observability implementation, TS API contract, current TS Observability panel, styles, and browser coverage before editing. This slice addresses the first blocking reviewer finding: V1-equivalent Observability trends were missing from the TS panel even though `/observability/overview` still exposes `trends`.
- Added `ObservabilityTrends.tsx` as a focused component so the main Observability panel does not absorb another large view concern. It parses trend buckets from the existing contract and renders Steps, Input tokens, Output tokens, and Tool calls as compact data-driven trend cards inside the existing Observability surface.
- Added loading, empty, and error trend states using existing Ant Design primitives and current shell colors, without adding a new chart dependency or changing sidebar/settings information architecture.
- Added English and Chinese strings for the new trend labels and states, plus local CSS for the trend cards and bars.
- Rebuilt `frontend/dist/app` from the source changes so the served app and browser evidence match the implementation.
- This resolves only the Observability trends gap from reviewer `019f1250-3460-7d00-a68c-a4d96491ace7`. The reviewer findings for task-addressable Spec lineage and V1-style multi-round export remain open.

### Verification
- `npm run build` passed, including frontend typecheck, desktop typecheck, desktop build, and Vite dist rebuild.
- `npm run lint` passed after the component split.
- `npm run test:browser -- browser-tests/v2-observability.spec.ts` passed with 2 tests covering populated trends, session/global scope switching, empty trend buckets, trend error state, Spec lineage, and fixed-shell behavior.
- `npm run test:browser -- browser-tests/v2-shell-parity.spec.ts -g "keeps V1 primary sidebar entries"` passed.
- `git diff --check` passed.
- Inspected `.tmp/frontend-v2-ts-observability/v2-observability-trends.png`; it shows populated trend cards in the fixed shell without document-level page growth.
- Inspected `.tmp/frontend-v2-ts-observability/v2-observability-trends-empty.png`; it shows the empty trend state inside the Observability view.
- Inspected `.tmp/frontend-v2-ts-observability/v2-observability-trends-error.png`; it shows the metrics and trend error states inside the same fixed shell.

### Reviewer
- Main-agent implementation, build, targeted browser coverage, screenshot inspection, and diff check completed for this P1 slice. No Observability subsystem sign-off, Spec lineage sign-off, Export sign-off, final release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Task Addressed Spec Lineage Restore

### Scope
- Re-checked the reviewer FAIL findings, V1 Spec lineage implementation, TS AppShell routing, TS SpecLineagePanel, current styles, and browser coverage before editing. This slice addresses the second blocking reviewer finding: Spec lineage needed a task-addressable entry path instead of only discovering spec tasks from the latest session run.
- Added an AppShell-level secondary view for Spec lineage that opens when the app URL contains `?task_id=...` or `#spec-lineage?task_id=...`. This does not add or remove sidebar/settings entries; Observability remains the active parent surface while the task-addressed page is open.
- Extended `SpecLineagePanel` with a standalone mode that loads the provided task id directly from `/tasks/{task_id}/spec-artifacts`, `/tasks/{task_id}/spec-checkpoint-evaluations`, and the selected version diff endpoint, without requiring `/sessions/{session_id}/rounds` or `/tasks/runs/{run_id}` discovery.
- Added page-level Reload and Back controls for standalone Spec lineage. Reload refetches the task's artifacts, evaluations, and diff; Back clears the `task_id` URL state and returns to the chat workspace.
- Added focused styles and translations for the standalone page controls while keeping the embedded Observability Spec lineage layout unchanged.
- Rebuilt `frontend/dist/app` from the source changes so the served app and browser evidence match the implementation.
- This resolves only the task-addressable Spec lineage gap from reviewer `019f1250-3460-7d00-a68c-a4d96491ace7`. The reviewer finding for V1-style multi-round message export remains open.

### Verification
- `npm run build` passed, including frontend typecheck, desktop typecheck, desktop build, and Vite dist rebuild.
- `npm run lint` passed.
- `npm run test:browser -- browser-tests/v2-observability.spec.ts` passed with 3 tests covering Observability trends, embedded Spec lineage, task-addressed Spec lineage URL opening, reload, Back, and fixed-shell no-document-scroll behavior.
- `npm run test:browser -- browser-tests/v2-shell-parity.spec.ts -g "keeps V1 primary sidebar entries"` passed.
- Inspected `.tmp/frontend-v2-ts-observability/v2-spec-lineage-direct-task.png`; it shows the standalone Spec lineage secondary page inside the fixed shell, with Reload and Back controls and no added sidebar entry.
- Inspected `.tmp/frontend-v2-ts-observability/v2-observability-spec-lineage.png`; it shows the embedded Observability Spec lineage path still works.

### Reviewer
- Main-agent implementation, build, targeted browser coverage, screenshot inspection, and shell parity check completed for this P1 slice. No Spec lineage subsystem sign-off, Export sign-off, final release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Message Export Round Selection Restore

### Scope
- Re-checked the active frontend rewrite goal, product parity checklist, quality gates, reviewer FAIL findings, current export implementation, and browser evidence before editing. This slice addresses the remaining reviewer finding from `019f1250-3460-7d00-a68c-a4d96491ace7`: message export needed V1-style multi-round selection and a structured export shape instead of a flat all-round download.
- Added a round-selection modal before multi-round HTML and PNG exports. All rounds are selected by default, users can clear or select all, the export action is disabled when nothing is selected, and cancel exits without downloading.
- Changed HTML transcript generation to group content by exported round using `message-export-turn`, `message-export-user`, `message-export-agent`, and `message-export-status` classes. Selected rounds only are included in the generated transcript.
- Kept the PNG export path on the existing block renderer while feeding it the selected round set, so PNG behavior now follows the same selection decision without introducing a separate visual rewrite.
- Added English and Chinese copy plus scoped modal/list styling. This does not add or remove sidebar entries or Settings sections.
- Rebuilt `frontend/dist/app` from the source changes so the served app and browser evidence match the implementation.
- This resolves only the V1-style multi-round export workflow gap from the reviewer finding. Message timeline streaming/replay/recovery, full resource/assistive sign-off, release cleanup, and final V2 completion remain open.

### Verification
- `npm run build` passed, including frontend typecheck, desktop typecheck, desktop build, and Vite dist rebuild.
- `npm run lint` passed.
- `npm run test:browser -- browser-tests/v2-message-export.spec.ts` passed with 1 test covering HTML and PNG export selection, selected-round filtering, V1-like HTML export structure, PNG byte validity, browser PNG decode, and strict unhandled-route coverage.
- Tightened the browser test so screenshot evidence waits for the actual Ant Modal content and verifies the format dropdown is closed before capture.
- Inspected `.tmp/frontend-v2-ts-message-export/v2-message-export-round-selection.png`; it shows the round-selection modal with both rounds selected, select-all/clear controls, and the export action in the fixed shell theme.

### Reviewer
- Main-agent implementation, dist rebuild, targeted browser coverage, screenshot inspection, and frontend typecheck completed for this export slice. No Message Timeline subsystem sign-off, Resource/Assistive subsystem sign-off, final visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Stream Replay Recovery Browser Evidence Sweep

### Scope
- Re-checked the active frontend rewrite goal, product parity checklist, quality gates, current stream/replay browser specs, `streamClient.ts`, and `useRunStreamController.ts` before deciding whether to edit. Existing TS browser coverage already targets the highest-risk AG-UI runtime paths, so this slice focuses on verified release evidence rather than changing working runtime code.
- Ran the targeted stream/replay/recovery browser gate covering create-run streams, refresh recovery, hydrated-cursor replay, manual reconnect exhaustion, SSE `Last-Event-ID` fallback, real SSE malformed/server errors, failed/stopped terminal events, stop/inject controls, approval/question resume paths, standalone resume, duplicate replay suppression, runtime-cursor reconnect, rich replay event rendering, multiplexed background subagent recovery, multiplex reconnect from per-run cursors, and terminal background subagent target cleanup.
- Kept this as evidence toward the Message Timeline, Run Recovery, AG-UI Runtime Stream, Subagents, and Browser Checks gates. No code changes were needed in this slice.

### Verification
- `npm run test:browser -- browser-tests/v2-stream-refresh.spec.ts browser-tests/v2-stream-reconnect.spec.ts browser-tests/v2-real-sse-stale-recovery.spec.ts` passed with 22 tests.
- Inspected `.tmp/frontend-v2-ts-stream/v2-stream-tool-heavy-refresh-replay.png`; it shows hydrated tool-heavy replay continuing from the cursor with tool call/result/error/validation blocks and resumed output inside the fixed shell.
- Inspected `.tmp/frontend-v2-ts-stream/v2-last-event-id-reconnect.png`; it shows the SSE `Last-Event-ID` fallback reconnect path deduping the boundary chunk and completing the run.
- Inspected `.tmp/frontend-v2-ts-stream/v2-real-sse-rich-replay.png`; it shows rich real SSE replay content including thinking, tool call/result, token usage, model-step metadata, and the composer contained in one viewport.
- Inspected `.tmp/frontend-v2-ts-stream/v2-real-sse-refresh-recovery.png`; it shows a real SSE refresh recovery continuing with resumed output without document-level page growth.
- `git status` after the test run showed only the known untracked goal/reference files before this ledger update.

### Reviewer
- Main-agent targeted stream/replay/recovery browser gate execution and screenshot inspection completed for this evidence slice. No Runtime subsystem reviewer PASS, Message Timeline subsystem PASS, Run Recovery subsystem PASS, Browser Checks completion, final visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Settings Project Shell Browser Evidence Sweep

### Scope
- Re-checked the active frontend rewrite goal and product parity checklist before running another browser gate. This slice targets the high-level frame, V1-aligned sidebar/settings information architecture, Settings secondary-page behavior, project view, Appearance, and narrow viewport layout.
- Ran the targeted TS browser gate for shell parity, Settings actions, project view, and Appearance layout. The coverage includes V1 primary sidebar entries, V1 Settings section grouping, System secondary-page grouping, session management, MCP reloads, unread terminal run handling, lazy subagent loading, Settings drawer persistence under outside clicks/drags, Plugins, Hooks, Agent Runtime, Roles, Orchestration, Environment variables, session topology, model profiles, Web settings, remote workspace SSH profiles, project open/reload/close, dark Appearance preset, and narrow sidebar overlay behavior.
- Kept this as release evidence toward Application Shell, Sessions and Projects, Settings, Observability/Project View, Resource/Assistive layout, and Browser Checks gates. No code changes were needed in this slice.

### Verification
- `npm run test:browser -- browser-tests/v2-shell-parity.spec.ts browser-tests/v2-settings-actions.spec.ts browser-tests/v2-project-view.spec.ts browser-tests/v2-appearance-layout.spec.ts` passed with 21 tests.
- Inspected `.tmp/frontend-v2-ts-shell/v2-settings-system-parity.png`; it shows Settings retaining the V1 primary section list while System-owned content opens as a secondary Settings page, with a Back control instead of flattening every subsection into the primary nav.
- Inspected `.tmp/frontend-v2-ts-settings-actions/v2-agent-runtime-create-delete.png`; it shows Agent Runtime as a System secondary page with real Refresh, registry, create, and list actions.
- Inspected `.tmp/frontend-v2-ts-settings-actions/v2-remote-workspace-create.png`; it shows Remote workspace as its own Settings section with persisted SSH profile details and test/edit/delete actions.
- Inspected `.tmp/frontend-v2-ts-settings-actions/v2-model-profile-detail.png`; it shows a real model profile detail form with save/test/default/delete/back actions and dense, bounded settings layout.
- Inspected `.tmp/frontend-v2-ts-project-view/v2-project-view-files.png`; it shows the project file view, reload/open-folder controls, file tree, and editor area as a secondary workspace view rather than a flattened sidebar page.
- Inspected `.tmp/frontend-v2-ts-appearance/v2-narrow-sidebar-overlay.png`; it shows the narrow sidebar overlay covering a fixed workspace without introducing document-level scrolling.

### Reviewer
- Main-agent targeted browser gate execution and screenshot inspection completed for this evidence slice. No Application Shell subsystem PASS, Settings subsystem PASS, Sessions/Projects subsystem PASS, final visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Desktop Smoke And Reviewer Evidence Sweep

### Scope
- Re-checked the active frontend rewrite goal, Desktop completion checklist, and latest reviewer result before editing this ledger. This slice records the Electron desktop smoke gate and the independent read-only reviewer result for the latest export/stream evidence.
- Ran the targeted Desktop browser smoke gate covering Electron renderer loading, isolated preload API shape, renderer Node isolation, backend status bridge, startup failure view, diagnostics copy, retry startup, external link routing through the preload/main boundary, invalid external-link rejection, managed backend process start, managed backend health/app requests, auto-quit, and backend shutdown after app lifecycle exit.
- Received read-only reviewer `019f1277-8156-7fa2-a80e-9a4f5c3202fc` verdict PASS for the latest message export round-selection slice and stream/replay/recovery evidence slice. The reviewer reported no blockers and noted only residual risks: export tests prove selection/filtering and HTML structure but do not positively include the tool/status-heavy round in the selected HTML assertion, historical `retry-prompt` validation parts are better covered in timeline rendering than export output, and the stream evidence should remain targeted evidence rather than subsystem completion.
- Kept this as release evidence toward Desktop and Reviewer gates only. No code changes were needed in this slice.

### Verification
- `npm run test:browser -- browser-tests/v2-desktop-smoke.spec.ts` passed with 4 tests.
- Inspected `.tmp/frontend-v2-desktop/v2-electron-renderer.png`; it shows the Electron renderer loaded into the fixed Agent Teams shell with the desktop smoke session, backend connected state, isolated desktop API assertions, and no empty renderer.
- Inspected `.tmp/frontend-v2-desktop/v2-electron-startup-failed.png`; it shows a clear backend startup failure screen with diagnostics copy and retry startup controls.
- Reviewer `019f1277-8156-7fa2-a80e-9a4f5c3202fc` returned PASS with no P0/P1/P2 findings for the export/stream slices under review.

### Reviewer
- Main-agent desktop smoke execution, screenshot inspection, and independent reviewer PASS recording completed for this evidence slice. No Desktop subsystem PASS, full Reviewer Gate completion, final visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Message Export Tool Status Evidence Tightening

### Scope
- Re-checked the active frontend rewrite goal, reviewer PASS residual risks, current message export implementation, and current browser coverage before editing. This slice targets a narrow evidence gap: the export browser gate proved round selection/filtering, but did not positively prove the tool/status-heavy round is present in the structured HTML export when all rounds are selected.
- Extended `frontend/app/browser-tests/v2-message-export.spec.ts` so the HTML flow first exports the default all-selected round set and asserts the V1-like HTML structure includes both rounds, tool-call content, tool arguments, pending approval count, pending user-question count, retry error text, diagnostic text, and the second-round answer.
- Kept the existing second HTML export path that reopens the selection dialog, deselects the first round, and proves selected-round filtering excludes the tool/status-heavy round.
- Re-checked for remaining Python browser UI scenarios with targeted searches for `test_browser_`, Playwright, Selenium, and page navigation patterns. No legacy Python browser UI scenario names remain; the remaining Python matches are non-browser UI tests or backend/system references.

### Verification
- `npm run test:browser -- browser-tests/v2-message-export.spec.ts` passed with 1 test covering all-selected HTML export, filtered HTML export, PNG export, structured export classes, PNG byte/decode validation, and strict unhandled-route coverage.
- `npm run lint` passed.
- Inspected `.tmp/frontend-v2-ts-message-export/v2-message-export-round-selection.png`; it still captures the actual round-selection modal with both rounds selected and the export action visible.
- `rg -n "def test_browser|browser_test|Browser|Playwright|page\\.goto|selenium" -g "*.py" tests src frontend` found no remaining Python browser UI test scenario that needs migration.
- `rg -n "test_browser_" tests src frontend` returned no matches.

### Reviewer
- Main-agent browser test tightening, frontend typecheck, screenshot inspection, and Python browser-test scan completed for this evidence slice. This closes the reviewer residual risk around positive tool/status-heavy HTML export evidence, but no full Export subsystem PASS, browser-suite completion, final naming cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Naming Cleanup Boundary Audit

### Scope
- Re-checked the active frontend rewrite goal, Naming Cleanup Gate, current product source, published HTML entry points, and route-switch browser evidence before claiming any progress on release cleanup.
- Audited user-facing `V2/v2/新版/旧版` naming in the React source and published entry HTML. The product source does not expose final-state `V2` branding; remaining source matches are the Chinese "latest version" placeholder for skill installation and a real `/api/v2/` default endpoint URL.
- Confirmed the remaining migration labels are boundary-only: V1's published shell still exposes `Open new interface`, and the new shell exposes a `V1` return control. These are intentionally kept during coexistence and must be removed or neutralized only during final promotion.
- Kept this as naming-boundary evidence only. No final naming cleanup, release promotion, route removal, or V2 frontend completion is claimed.

### Verification
- `rg -n "V2|v2|新版|旧版" frontend/app/src --glob '!**/*.test.*' --glob '!**/__snapshots__/**'` returned only `skillsInstallVersionPlaceholder: "最新版本"` and the Settings ClawHub `/api/v2/` default URL.
- `rg -n "new interface|old interface|Open new|V1|V2|新版|旧版" frontend/app/src frontend/app/index.html frontend/dist/app/index.html frontend/dist/index.html --glob '!**/*.test.*'` returned the expected migration controls plus an SVG path-data false positive.
- `npm run test:browser -- browser-tests/v2-route-switch.spec.ts` passed with 1 test covering V1 to new shell switching and return to V1.
- Inspected `.tmp/frontend-v2-ts-route-switch/ts-v2-after-new-ui-switch.png`; it shows the new shell with the temporary `V1` return button but no permanent `V2/新版` product branding.
- Inspected `.tmp/frontend-v2-ts-route-switch/ts-v1-root-before-switch.png`; it shows the V1 shell with the temporary `New UI` entry that remains part of the coexistence boundary.

### Reviewer
- Main-agent naming scan, route-switch browser gate, and screenshot inspection completed for this evidence slice. Final promotion still needs the migration boundary removed or renamed, a full V1/V2 visual audit, subsystem reviewer sign-offs, release cleanup decisions, and final full-check execution.

## 2026-06-29 V1 Sidebar Width Alignment

### Scope
- Re-checked the active frontend rewrite goal, product parity checklist, and current live browser UI before editing. This slice targets a framework-level V1/V2 visual gap found from screenshots and layout metrics instead of another isolated component detail.
- Captured the live new shell at `http://127.0.0.1:8000/app/` and measured `document`, `#root`, top bar, sidebar, main workspace, and composer rectangles. The fixed-page shell was already healthy, but the V2 sidebar measured `260px` while V1 measured `280px`.
- Changed the new shell default sidebar width back to the V1-sized `280px`, migrated previous generated `260px` defaults to `280px`, and preserved compact user-resized widths that were already marked by the older `260px` migration.
- Rebuilt `frontend/dist/app` so the packaged V2 shell uses the restored V1-width sidebar.

### Verification
- `npm run test -- src/test/uiStore.test.ts` passed with 8 tests covering the default width, old generated-width migration, and preservation of user-resized compact sidebars.
- `npm run build` passed, including frontend typecheck, desktop typecheck/build, and Vite dist rebuild.
- `npm run test:browser -- browser-tests/v2-module-actions.spec.ts -g "persists V2 sidebar mouse resize after reload"` passed after the dist rebuild, covering default `280px`, resize to `220px`, persistence, and no document-level scroll.
- Inspected `.tmp/frontend-v1-v2-visual-audit/v1-current-loaded-viewport.png`; V1 measured sidebar `280px`, main `x=286`, and document `1280x720`.
- Inspected `.tmp/frontend-v2-live-audit/current-app-after-sidebar-280.png`; V2 now measures sidebar `280px`, main `x=286`, composer `x=286`, and document `1280x720` with no body/page growth.

### Reviewer
- Main-agent screenshot comparison, implementation, targeted unit/browser verification, dist rebuild, and live browser inspection completed for this framework slice. No Application Shell subsystem PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Tool-Heavy Timeline Summary Readability

### Scope
- Re-checked the active frontend rewrite goal, product parity checklist, and current Message Timeline renderer before editing. This slice targets a visible tool-heavy history issue from the final visual audit path: long previews could squeeze the tool phase/title down to truncated labels such as `Tool call: s...`, making dense replay history harder to scan.
- Updated `MessageTimeline` so tool summary titles and previews keep their full text in `title` attributes for hover/inspection, while the visual row prioritizes the phase plus tool name.
- Adjusted `.at-message-tool-title` and `.at-message-tool-preview` flex behavior so short tool titles such as `Tool call: shell`, `Tool error: shell`, and `Tool validation: read` remain readable before the preview consumes the remaining row width.
- Rebuilt `frontend/dist/app` so the served V2 shell includes the tool summary readability fix.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx` passed with 64 tests, including the updated assertion that tool titles and previews retain full `title` text.
- `npm run build` passed, including frontend typecheck, desktop typecheck/build, and Vite dist rebuild.
- `npm run test:browser -- browser-tests/v2-stream-refresh.spec.ts -g "continues a tool-heavy replay after refresh from the hydrated cursor"` passed.
- Inspected `.tmp/frontend-v2-ts-stream/v2-stream-tool-heavy-refresh-replay.png`; the tool-heavy replay now shows complete tool summary labels for read, shell, error, and validation rows while staying inside the fixed shell.

### Reviewer
- Main-agent implementation, targeted MessageTimeline test, dist rebuild, tool-heavy browser replay verification, and screenshot inspection completed for this Message Timeline readability slice. No Message Timeline subsystem PASS, Runtime Stream subsystem PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Composer Disabled-State Explanations

### Scope
- Re-checked the active frontend rewrite goal, release cleanup placeholder guidance, current source scans, and Composer controls before editing. The source scan found no user-facing Chinese "not implemented" placeholders and only normal input placeholders / board TODO domain text in production source.
- Addressed a Quality Gate gap in the Composer: disabled Send, Queue, and Interrupt buttons now expose the concrete reason through button titles without changing when actions are enabled or which API calls run.
- Added English and Chinese copy for empty send input, active-run send redirection, busy actions, and runtime injection text requirements. Existing validation copy is reused for image/runtime injection blocks.
- Rebuilt `frontend/dist/app` so the served V2 shell includes the disabled-state explanation copy.

### Verification
- `rg -n "TODO|placeholder|mock|fake|stub|not implemented|coming soon" frontend/app/src --glob '!**/*.test.*' --glob '!**/__snapshots__/**'` returned no production "not implemented" UI; remaining matches are normal input placeholders, board TODO terminology, and typed placeholder fields.
- `rg -n "暂不可用|占位|稍后|后续实现|未实现" frontend/app/src --glob '!**/*.test.*' --glob '!**/__snapshots__/**'` returned no matches.
- `npm run test -- src/test/Composer.test.tsx` passed with 53 tests, including disabled Send, Queue, and Interrupt title assertions.
- `npm run build` passed, including frontend typecheck, desktop typecheck/build, and Vite dist rebuild.
- `npm run test:browser -- browser-tests/v2-stream-create-run.spec.ts` passed with 3 browser tests covering send/create-run flows, burst new sessions, live stream terminal state, and copy-last-answer disabled behavior.
- Inspected `.tmp/frontend-v2-ts-stream/v2-stream-create-run.png`; composer controls remain contained in the fixed shell after the title-only disabled-state change.

### Reviewer
- Main-agent source scan, Composer implementation, targeted unit/browser verification, dist rebuild, and screenshot inspection completed for this Composer/Accessibility quality slice. No Composer subsystem PASS, final placeholder cleanup sign-off, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-29 Round Diagnostics And Message Dedupe Migration

### Scope
- Re-checked the active frontend rewrite goal, current V2 shell screenshot, live DOM layout, remaining Python UI harness inventory, and V1 diagnostics coverage before editing. The current V2 shell is fixed to one viewport with a V1-width sidebar, so this slice moved from framework layout back to a message-timeline quality gap.
- Migrated the old `test_diagnostics_ui.py` coverage away from `frontend/dist` static assertions and into V2 TS source tests. The old Python UI harness was deleted.
- Added V2 round diagnostic sanitization so raw verification/guardrail diagnostics such as `runtime_guardrail:pre_execution_boundary` collapse to `Verification not passed.` unless the existing Appearance diagnostics switch has set `document.documentElement.dataset.diagnosticsVisible`.
- Kept ordinary explanatory text visible and kept the existing Appearance settings item/list structure unchanged.
- Fixed a visible message-timeline duplication found during browser screenshot inspection: round coordinator messages are now deduped against already-loaded session history by message id and by run/timestamp/role/text fingerprint.
- Rebuilt `frontend/dist/app` so the served V2 shell includes the diagnostic and dedupe changes.

### Verification
- Captured and inspected `.tmp/frontend-v2-gap-audit/external-v2-online.png`; it shows the current V2 shell in the fixed one-page layout with sidebar, round rail, token bar, and bottom composer contained in the viewport.
- `npm run test -- src/test/roundMetadata.test.ts src/test/MessageTimeline.test.tsx` passed with 119 tests covering hidden raw diagnostics, visible diagnostics mode, safe fallback round titles, message-timeline diagnostic rendering, and session/round duplicate suppression.
- `npm run build` passed, including frontend typecheck, desktop typecheck/build, and Vite dist rebuild.
- `npm run test:browser -- browser-tests/v2-rounds.spec.ts -g "keeps verification failed rounds in the warning lane"` passed, covering warning tone, sanitized diagnostic detail, no raw guardrail leak, and no duplicate visible output.
- `npm run lint` passed.
- Inspected `.tmp/frontend-v2-ts-rounds/v2-round-verification-warning.png`; it shows one visible `Verification warning output`, safe `Diagnostic: Verification not passed.` text in the marker/detail, and the fixed shell with no document-level page growth.
- `rg -n "test_diagnostics_ui|diagnostics_text_is_hidden|diagnostics_renders_from_rich|Verification not passed|runtime_guardrail:pre_execution_boundary|Persisted shared answer" frontend/app/src frontend/app/browser-tests tests docs/goals/frontend-rewrite/implementation-ledger.md` returns only the new TS/browser coverage, production sanitizer label, backend guardrail tests, and this ledger entry for the migrated behavior.

### Reviewer
- Main-agent screenshot inspection, implementation, targeted TS/browser verification, dist rebuild, lint, and Python UI harness deletion completed for this Message Timeline diagnostics slice. No Message Timeline subsystem PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Message Prompt Labels And Duration Migration

### Scope
- Re-checked the active frontend rewrite goal and remaining Python UI harness inventory before editing. This slice migrates `test_message_history_labels_ui.py` away from V1 `frontend/dist` static/module tests into V2 TS coverage.
- Strengthened the V2 `MessageTimeline` user-prompt test so a historical user prompt with an agent-specific `role_id` renders the actual prompt content only, hides injected skill-candidate routing text, and does not surface protocol fallback text or role labels such as `writer`.
- Fixed V2 round duration formatting to preserve the V1-style hour boundary. Round summaries now render `34s`, `3m 4s`, and `1h 2m` instead of flattening an hour-plus run into `62m`.
- Deleted the old Python `test_message_history_labels_ui.py` harness and rebuilt `frontend/dist/app` from the source changes.

### Verification
- `npm run test -- src/test/roundMetadata.test.ts src/test/MessageTimeline.test.tsx` passed with 120 tests covering prompt-label behavior and seconds/minutes/hours duration formatting.
- `npm run build` passed, including frontend typecheck, desktop typecheck/build, and Vite dist rebuild.
- `npm run lint` passed.
- `rg -n "test_message_history_labels_ui|formatElapsed|message_history_uses_task_prompt|elapsed_duration_keeps|1h 2m|3m 4s|Actual user prompt" frontend/app/src tests docs/goals/frontend-rewrite/implementation-ledger.md` returns only the new V2 TS coverage and this ledger entry for the migrated behavior.

### Reviewer
- Main-agent implementation, targeted TS verification, dist rebuild, lint, and Python UI harness deletion completed for this Message Timeline migration slice. No Message Timeline subsystem PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Subagent Rail Sidebar Migration

### Scope
- Re-checked the active frontend rewrite goal, product parity checklist, and remaining Python UI harness inventory before editing. This slice migrates `test_subagent_rail_ui.py` away from V1 `frontend/dist` static/module tests into V2 TS coverage.
- Kept the V2 subagent workflow as a sidebar-nested entry plus secondary workspace surface instead of restoring the removed V1 right rail DOM or flattening subagent content into the primary chat surface.
- Added V2 sidebar normalization protection so reserved root-role records such as `Coordinator` and `MainAgent`, plus non-`subagent_run_` normal-mode records, are filtered from expanded subagent session lists before they can be opened as child sessions.
- Rebuilt `frontend/dist/app` so the served V2 shell includes the subagent sidebar normalization fix.

### Verification
- `npm run test -- src/test/SessionsSidebar.test.tsx src/test/AppShell.test.tsx src/test/apiClient.test.ts` passed with 90 tests covering nested subagent entrypoints, secondary subagent surface behavior without old right-rail DOM, subagent endpoint force refresh, and reserved-role filtering.
- `npm run lint` passed.
- `npm run build` passed, including frontend typecheck, desktop typecheck/build, and Vite dist rebuild.
- `Test-Path tests\integration_tests\frontend\test_subagent_rail_ui.py` returned `False`.
- `rg -n "test_subagent_rail_ui" tests frontend/app/src docs/goals/frontend-rewrite/implementation-ledger.md` returns only this ledger entry.
- `rg -n "Coordinator root record|Main agent root record|isReservedRootRoleId|right-rail" frontend/app/src docs/goals/frontend-rewrite/implementation-ledger.md` returns the new V2 TS coverage, the production reserved-role predicate, the existing AppShell no-right-rail assertion, and this ledger entry.

### Reviewer
- Main-agent implementation, targeted TS verification, dist rebuild, lint, and Python UI harness deletion completed for this Subagents migration slice. No Subagents subsystem PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Run Events Runtime Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining Python UI harness inventory, and the old V1 `test_run_events_ui.py` assertions before editing. This slice targets the stream/replay runtime path the user called out, while keeping V2's sidebar/settings and secondary-page structure unchanged.
- Migrated the highest-risk V1 event-router semantics into V2 TS coverage: subagent stream events now have explicit reducer assertions showing they stay in their own run state without overwriting the parent run, and token/generation events retain subagent instance and role metadata.
- Expanded runtime reducer replay coverage for human-intervention, approval, background-task, monitor, fallback, token, hook, thinking, tool, checkpoint, guardrail, and unknown future event kinds so V2 does not silently drop non-text events during stream replay.
- Deleted the old Python `test_run_events_ui.py` harness, which exercised removed V1 `frontend/dist` event-router globals rather than the V2 reducer/stream/timeline architecture.

### Verification
- `npm run test -- src/test/runtimeReducers.test.ts src/test/streamClient.test.ts src/test/RunStreamController.test.tsx src/test/MessageTimeline.test.tsx` passed with 186 tests covering reducer replay state, stream client replay cursors, reconnect/resume controller behavior, and timeline rendering.
- `Test-Path tests\integration_tests\frontend\test_run_events_ui.py` returned `False`.
- `rg -n "test_run_events_ui|keeps subagent stream events isolated|llm_fallback_exhausted|background_task_stopped|user_question_requested|tool_approval_resolved" frontend\app\src\test tests docs\goals\frontend-rewrite\implementation-ledger.md` returns only the new V2 TS coverage, existing backend/timeline coverage, and this ledger entry.

### Reviewer
- Main-agent coverage review, targeted TS migration, broad stream/runtime verification, and Python UI harness deletion completed for this Run Events migration slice. No Runtime Stream subsystem PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Route Switch Framework Screenshot Audit

### Scope
- Re-checked the active frontend rewrite goal and used the V1/V2 route-switch browser gate as a framework audit before editing. The in-app V2 DOM check showed the shell fixed to one viewport (`body` overflow hidden and document height equal to viewport height), then the Playwright gate produced current V1 and V2 screenshots for direct structure comparison.
- Fixed a V2 framework regression found by the screenshot/browser pass: the desktop Composer control strip could let the `YOLO` control's bounding box overlap the right-side `Send` action at 1280x720.
- Changed the desktop Composer control set to wrap within the left grid column instead of relying on horizontal overflow. This keeps controls visible and prevents the left control group from entering the Send column while preserving the existing mobile single-column Composer layout.
- Rebuilt `frontend/dist/app` so the served V2 route includes the corrected Composer layout.

### Verification
- In-app V2 DOM inspection at `http://127.0.0.1:8000/app/` reported `bodyOverflow: "hidden"` and document/client/body heights of `720`, confirming the live shell is fixed to the viewport.
- `npm run test:browser -- browser-tests/v2-route-switch.spec.ts` first failed with `YOLO overlaps Send`, then passed after the Composer layout fix.
- Updated screenshots were generated under `.tmp/frontend-v2-ts-route-switch/`: `ts-v1-root-before-switch.png`, `ts-v2-after-new-ui-switch.png`, and `ts-v1-after-return.png`.
- `npm run test -- src/test/ShellLayoutCss.test.ts src/test/Composer.test.tsx` passed with 67 tests.
- `npm run build` passed, including frontend typecheck, desktop typecheck/build, and Vite dist rebuild.

### Reviewer
- Main-agent screenshot comparison, implementation, targeted unit/browser verification, and dist rebuild completed for this framework/composer slice. No Application Shell subsystem PASS, Composer subsystem PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Prompt YOLO Payload Migration

### Scope
- Re-checked the active frontend rewrite goal and the remaining Python UI harness inventory before editing. This slice targets a bounded Composer/run-controls migration rather than treating the whole `test_prompt_yolo_ui.py` file as complete.
- Added V2 Composer TS coverage proving the actual YOLO checkbox state is sent in the AG-UI `createRun` request after the user toggles it off.
- Removed the matching legacy V1 `sendUserPrompt` payload assertions for YOLO/thinking and explicit input parts from `tests/integration_tests/frontend/test_prompt_yolo_ui.py`. Explicit inline-media input parts are already covered by the V2 Composer pasted-image tests.
- Left the rest of `test_prompt_yolo_ui.py` in place because it still contains unmigrated behavior lines, especially slash command/skill same-name selection semantics and new-session draft model-profile creation. The file now has 29 remaining legacy UI scenarios.

### Verification
- `npm run test -- src/test/Composer.test.tsx` passed with 57 tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_prompt_yolo_ui.py` passed.
- `git diff --check` passed.
- `rg -n "test_send_user_prompt_includes_yolo|test_send_user_prompt_uses_explicit_input_parts|passes the selected YOLO mode|yolo: false" frontend/app/src/test/Composer.test.tsx tests/integration_tests/frontend/test_prompt_yolo_ui.py` returns only the new V2 YOLO test and no legacy V1 payload test names.

### Reviewer
- Main-agent coverage mapping, targeted TS migration, focused verification, and partial legacy harness removal completed for this Composer/run-controls slice. No Composer subsystem PASS, slash skill parity completion, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Slash Skill Composer Migration

### Scope
- Re-checked the active frontend rewrite goal, the Composer/run-controls checklist, current AG-UI create-run backend contract, `/roles:options` backend response, and the remaining `test_prompt_yolo_ui.py` V1 harness before editing. This slice targets the V1 slash command/skill parity gap rather than sidebar/settings structure.
- Added typed V2 support for `RoleConfigOptions.skills` and `RunCreateRequest.skills`, matching the existing AG-UI backend capability.
- Extended the Composer slash mention menu so command and skill entries with the same slash name render as separate selectable options with minimal Command/Skill labels.
- Added Composer submit behavior matching V1 priority: manually typed slash prompts still prefer command resolution; an explicitly selected slash skill skips command resolution and sends `skills`; stale selected skills fall back to command resolution; command misses can fall back to skill invocation.
- Rebuilt `frontend/dist/app` so the served V2 shell includes the slash skill Composer behavior.
- Removed the corresponding migrated V1 Python harness scenarios from `tests/integration_tests/frontend/test_prompt_yolo_ui.py`. The file now has 24 remaining legacy UI scenarios, including selected-command stale fallback, image support edge cases, and new-session draft model-profile creation.

### Verification
- `npm run test -- src/test/Composer.test.tsx src/test/PromptMentions.test.ts` passed with 67 tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_prompt_yolo_ui.py` passed.
- `git diff --check` passed.
- `npm run lint` passed.
- `npm run build` passed, including frontend typecheck, desktop typecheck/build, and Vite dist rebuild.
- `rg -n "test_handle_send_prefers_command_alias|test_slash_menu_shows_same_named|test_selected_same_named_skill|test_committing_resource_mention_preserves|test_stale_selected_skill" tests/integration_tests/frontend/test_prompt_yolo_ui.py frontend/app/src/test/Composer.test.tsx frontend/app/src/test/PromptMentions.test.ts` returns only the new V2 TS coverage and no migrated V1 Python function names.

### Reviewer
- Main-agent V1 harness mapping, implementation, targeted TS verification, dist rebuild, lint, and partial legacy harness removal completed for this Composer slash skill slice. No Composer subsystem PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Selected Command Slash Fallback Migration

### Scope
- Continued the Composer/run-controls migration by mapping the next three V1 `test_prompt_yolo_ui.py` selected-command slash edge cases onto V2 TS coverage.
- Added V2 Composer tests for selected command becoming unavailable and falling back to a same-named skill, selected command falling back to skill when there is no active workspace for command resolution, and explicitly selected command resolving without accidentally submitting a same-named skill.
- Removed the corresponding three legacy Python UI scenarios from `tests/integration_tests/frontend/test_prompt_yolo_ui.py`. The file now has 21 remaining legacy UI scenarios.
- This slice is test coverage and harness cleanup only; no production UI, Settings, sidebar, or backend contract behavior changed.

### Verification
- `npm run test -- src/test/Composer.test.tsx` passed with 66 tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_prompt_yolo_ui.py` passed.
- `git diff --check` passed.
- `rg -n "test_stale_selected_command|test_selected_same_named_command|falls back to a slash skill when a selected command|falls back to a slash skill without workspace|does not submit a same-named skill" tests/integration_tests/frontend/test_prompt_yolo_ui.py frontend/app/src/test/Composer.test.tsx` returns only the new V2 TS coverage and no migrated V1 Python function names.

### Reviewer
- Main-agent V1 harness mapping, focused TS coverage migration, targeted verification, and partial legacy harness removal completed for this Composer slash fallback slice. No Composer subsystem PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Inline Slash Prose Composer Migration

### Scope
- Continued Composer/run-controls migration by moving the inline slash prose scenario from the V1 `test_prompt_yolo_ui.py` harness to V2 TS coverage.
- Added V2 Composer coverage proving a slash token inside ordinary prose such as `Please explain /time complexity` does not call command resolution and does not submit a skill, even when a matching skill exists.
- Removed the corresponding Python UI harness scenario from `tests/integration_tests/frontend/test_prompt_yolo_ui.py`. The file now has 20 remaining legacy UI scenarios.
- This slice is test coverage and harness cleanup only; no production UI, Settings, sidebar, backend, or dist behavior changed.

### Verification
- `npm run test -- src/test/Composer.test.tsx` passed with 67 tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_prompt_yolo_ui.py` passed.
- `git diff --check` passed.
- `rg -n "test_handle_send_does_not_parse_inline_slash|does not parse inline slash prose" tests/integration_tests/frontend/test_prompt_yolo_ui.py frontend/app/src/test/Composer.test.tsx` returns only the new V2 TS coverage and no migrated V1 Python function name.

### Reviewer
- Main-agent V1 harness mapping, focused TS coverage migration, targeted verification, and partial legacy harness removal completed for this Composer inline slash slice. No Composer subsystem PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Composer Static Control Harness Migration

### Scope
- Re-checked the active frontend rewrite goal, product parity checklist, quality gates, remaining V1 `test_prompt_yolo_ui.py` harness inventory, and current V2 Composer/Sessions coverage before editing.
- Added V2 Composer coverage for the persistent normal-mode control surface: prompt placeholder, Mode/Role/Target/Model labels, normal-only root role select, absence of orchestration preset in normal mode, target/model selects, Shell safety policy, YOLO, Thinking toggle, Thinking effort appearance after enabling, and disabled Send reason title.
- Removed three migrated V1 source/static harness tests from `tests/integration_tests/frontend/test_prompt_yolo_ui.py`: chat input control existence, bootstrap shell-safety initialization absence, and custom disabled tooltip source assertions. The file now has 17 remaining legacy UI scenarios.
- Left the V1 new-session workspace selector source assertions in place because they need a separate V1/V2 interaction mapping instead of being treated as covered by this Composer control slice.
- This slice is test coverage and harness cleanup only; no production UI, Settings, sidebar inventory, backend, or dist behavior changed.

### Verification
- `npm run test -- src/test/Composer.test.tsx` passed with 68 tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_prompt_yolo_ui.py` passed.
- `git diff --check` passed.
- `rg -c "^def test_" tests/integration_tests/frontend/test_prompt_yolo_ui.py` returned 17.
- `rg -n "test_chat_input_renders_yolo|test_bootstrap_does_not_initialize|test_composer_disabled_tooltips|persistent run controls" tests/integration_tests/frontend/test_prompt_yolo_ui.py frontend/app/src/test/Composer.test.tsx` returns only the new V2 TS coverage and no migrated V1 Python function names.

### Reviewer
- Main-agent goal/checklist scan, V1 harness mapping, focused TS coverage migration, targeted verification, and partial legacy harness removal completed for this Composer static/control slice. No Composer subsystem PASS, Settings/sidebar PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Composer Image Attachment Profile Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining V1 `test_prompt_yolo_ui.py` harness inventory, current V2 Composer image attachment tests, and V2 image capability resolution before editing.
- Added V2 Composer coverage proving selected normal model profiles participate in image attachment validation: a selected image-capable profile allows an image even when the root role is text-only, while a selected text-only profile blocks an image even when the root role supports images.
- Removed five migrated V1 Python UI harness scenarios from `tests/integration_tests/frontend/test_prompt_yolo_ui.py`: inline-media paste/send, text-only role image blocking, selected model profile image allow, selected model profile image rejection, and unknown image support blocking. The file now has 12 remaining legacy UI scenarios.
- Kept the pending model-profile save image validation scenarios, pasted-image footer hint scenario, role mention scenarios, title preview/abort scenarios, workspace selector source assertions, topology controls scenario, and new-session draft model-profile scenario because they still need separate V1/V2 mapping or V2-specific coverage.
- This slice is test coverage and harness cleanup only; no production UI, Settings, sidebar inventory, backend, or dist behavior changed.

### Verification
- `npm run test -- src/test/Composer.test.tsx` passed with 70 tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_prompt_yolo_ui.py` passed.
- `git diff --check` passed.
- `rg -c "^def test_" tests/integration_tests/frontend/test_prompt_yolo_ui.py` returned 12.
- `rg -n "test_handle_send_sends_pasted_image|test_handle_send_blocks_pasted_image_for_text_only|test_handle_send_allows_image_when_selected_model_profile|test_handle_send_blocks_image_when_selected_model_profile|test_handle_send_blocks_pasted_image_when_image_support|selected model profile supports image input|selected model profile rejects image input" tests/integration_tests/frontend/test_prompt_yolo_ui.py frontend/app/src/test/Composer.test.tsx` returns only the new V2 TS coverage and no migrated V1 Python function names.

### Reviewer
- Main-agent V1 harness mapping, focused TS coverage migration, targeted verification, and partial legacy harness removal completed for this Composer image/profile slice. No Composer subsystem PASS, prompt attachment subsystem PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Leading Role Mention Harness Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining V1 `test_prompt_yolo_ui.py` harness inventory, and current V2 Composer leading role mention coverage before editing.
- Removed the V1 Python UI harness scenario for leading role mention submission because V2 `Composer.test.tsx` already proves ASCII and fullwidth leading role mentions strip the mention text and set `target_role_id` on AG-UI run creation.
- Kept the broader V1 prompt mention autocomplete/menu scenario in place because it also covers command, skill, resource, cache invalidation, stale command fetch, and case-sensitive resource lookup behavior that needs separate V2 mapping.
- This slice is test harness cleanup only; no production UI, Settings, sidebar inventory, backend, or dist behavior changed. The file now has 11 remaining legacy UI scenarios.

### Verification
- `npm run test -- src/test/Composer.test.tsx` passed with 70 tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_prompt_yolo_ui.py` passed.
- `git diff --check` passed.
- `rg -c "^def test_" tests/integration_tests/frontend/test_prompt_yolo_ui.py` returned 11.
- `rg -n "test_handle_send_strips_leading_role_mention|uses a leading role mention as the run target|supports fullwidth leading role mention" tests/integration_tests/frontend/test_prompt_yolo_ui.py frontend/app/src/test/Composer.test.tsx` returns only the V2 TS coverage and no migrated V1 Python function name.

### Reviewer
- Main-agent V1 harness mapping, existing TS coverage verification, targeted Composer test execution, and partial legacy harness removal completed for this leading role mention slice. No Composer subsystem PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Slash Command Abort Composer Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining V1 `test_prompt_yolo_ui.py` harness inventory, and V2 Composer slash command submission flow before editing.
- Added V2 Composer coverage for an async slash command resolver failure: the draft stays in the prompt, the Send button becomes enabled again with its normal title, and no AG-UI `createRun` call is made.
- Removed the corresponding V1 Python UI harness scenario from `tests/integration_tests/frontend/test_prompt_yolo_ui.py`. The file now has 10 remaining legacy UI scenarios.
- This slice is test coverage and harness cleanup only; no production UI, Settings, sidebar inventory, backend, or dist behavior changed.

### Verification
- `npm run test -- src/test/Composer.test.tsx` passed with 71 tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_prompt_yolo_ui.py` passed.
- `git diff --check` passed.
- `rg -c "^def test_" tests/integration_tests/frontend/test_prompt_yolo_ui.py` returned 10.
- `rg -n "test_handle_send_restores_composer_when_command_resolution_aborts|restores the composer when leading slash command resolution fails" tests/integration_tests/frontend/test_prompt_yolo_ui.py frontend/app/src/test/Composer.test.tsx` returns only the new V2 TS coverage and no migrated V1 Python function name.

### Reviewer
- Main-agent V1 harness mapping, focused TS coverage migration, targeted Composer verification, and partial legacy harness removal completed for this slash command abort slice. No Composer subsystem PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Composer Topology Controls Harness Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining V1 `test_prompt_yolo_ui.py` harness inventory, and current V2 Composer topology/thinking coverage before editing.
- Added a V2 Composer assertion for the started-session boundary: topology controls stay locked after the first run, while the normal model profile selector remains available once the session record has loaded.
- Removed the migrated V1 Python UI harness scenario for normal/orchestration field visibility, normal root-role updates, normal model-profile updates, started-session topology locking, and thinking effort visibility. The file now has 9 remaining legacy UI scenarios.
- Kept title preview, prompt mention autocomplete, pending model-profile save image validation, pasted-image footer hint, new-session workspace selector, and new-session model-profile draft scenarios because they still need separate mapping or missing V2 coverage.
- This slice is test coverage and harness cleanup only; no production UI, Settings, sidebar inventory, backend, desktop, or dist behavior changed.

### Verification
- `npm run test -- src/test/Composer.test.tsx` passed with 71 tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_prompt_yolo_ui.py` passed.
- `rg -c "^def test_" tests/integration_tests/frontend/test_prompt_yolo_ui.py` returned 9.
- `rg -n "test_prompt_controls_toggle_mode_specific_fields|renders persistent run controls|keeps composer topology controls scoped|switches the current session to orchestration|updates the current session normal root role|locks session topology controls|passes selected thinking settings" tests/integration_tests/frontend/test_prompt_yolo_ui.py frontend/app/src/test/Composer.test.tsx` returns only the V2 TS coverage and no migrated V1 Python function name.

### Reviewer
- Main-agent V1 harness mapping, focused TS assertion hardening, targeted Composer verification, and partial legacy harness removal completed for this topology/thinking controls slice. No Composer subsystem PASS, streaming/replay PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Composer Model Profile Save Boundary Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining V1 `test_prompt_yolo_ui.py` harness inventory, and V2 Composer model-profile/image attachment coverage before editing.
- Added V2 Composer coverage for the normal model-profile save boundary: a text-only selected profile blocks a pasted image, switching to an image-capable profile disables the prompt/model selector/send button while the save is pending, no AG-UI run is created during that pending state, and the same image can only be sent after the saved session detail reflects the image-capable profile.
- Removed three migrated V1 Python UI harness scenarios from `tests/integration_tests/frontend/test_prompt_yolo_ui.py`: stale model-profile save response handling, image validation after pending profile save, and waiting for the latest pending profile save before sending. The file now has 6 remaining legacy UI scenarios.
- Kept prompt mention autocomplete/resource insertion, title preview event timing, pasted-image footer hint, new-session workspace selector, and new-session draft model-profile creation scenarios because they still need separate V2 mapping or design confirmation.
- This slice is test coverage and harness cleanup only; no production UI, Settings, sidebar inventory, backend, desktop, or dist behavior changed.

### Verification
- `npm run test -- src/test/Composer.test.tsx` passed with 72 tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_prompt_yolo_ui.py` passed.
- `rg -c "^def test_" tests/integration_tests/frontend/test_prompt_yolo_ui.py` returned 6.
- `rg -n "test_prompt_model_profile_ignores_stale_save_response|test_handle_send_validates_image_after_pending_model_profile_save|test_handle_send_waits_for_latest_pending_model_profile_save|waits for model profile saves before validating" tests/integration_tests/frontend/test_prompt_yolo_ui.py frontend/app/src/test/Composer.test.tsx` returns only the new V2 TS coverage and no migrated V1 Python function names.

### Reviewer
- Main-agent V1 harness mapping, focused TS coverage migration, targeted Composer verification, and partial legacy harness removal completed for this model-profile save boundary slice. No Composer subsystem PASS, streaming/replay PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 New Session Workspace Flow Harness Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining V1 `test_prompt_yolo_ui.py` harness inventory, V2 `SessionsSidebar` workspace/session creation tests, and the V2 `SessionCreateRequest` contract before editing.
- Removed two V1-only Python source assertions for the legacy new-session workspace selector dropdown style and outside-click binding. V2 no longer uses that draft-page dropdown; the user-facing equivalent is covered by workspace-group session creation, selected-workspace creation, and stale selected-workspace fallback in `SessionsSidebar.test.tsx`.
- Left the new-session draft model-profile creation harness in place because `SessionCreateRequest` supports `normal_model_profile`, while V2 sidebar creation currently sends only `workspace_id`; that needs a separate product decision or implementation slice rather than being treated as covered.
- The legacy Python UI harness now has 4 remaining scenarios: prompt mention/resource autocomplete, title preview event timing, pasted-image footer hint, and new-session draft model-profile creation.
- This slice is test harness cleanup only; no production UI, sidebar inventory, Settings inventory, backend, desktop, or dist behavior changed.

### Verification
- `npm run test -- src/test/SessionsSidebar.test.tsx` passed with 26 tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_prompt_yolo_ui.py` passed.
- `rg -c "^def test_" tests/integration_tests/frontend/test_prompt_yolo_ui.py` returned 4.
- `rg -n "test_new_session_workspace_selector|creates a session in the selected workspace|creates a session from a workspace project row|ignores a stale stored workspace id" tests/integration_tests/frontend/test_prompt_yolo_ui.py frontend/app/src/test/SessionsSidebar.test.tsx` returns only the V2 TS coverage and no migrated V1 Python function names.

### Reviewer
- Main-agent V1 harness mapping, V2 workspace creation coverage verification, targeted sidebar test execution, and partial legacy harness removal completed for this workspace creation flow slice. No sidebar subsystem PASS, new-session model-profile inheritance PASS, final V1/V2 visual audit sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 New Session Model Profile Inheritance Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining V1 `test_prompt_yolo_ui.py` harness inventory, V2 `SessionCreateRequest`, and current `SessionsSidebar` create-session flow before editing.
- Fixed the V2 sidebar create-session path to carry the selected session's cached `normal_model_profile` into the `createSession` request when a non-empty saved profile exists. This preserves the V1 new-session draft behavior without reintroducing the V1 draft dropdown surface.
- Added V2 `SessionsSidebar.test.tsx` coverage proving a selected session with cached `normal_model_profile: "precise"` creates the next session with `normal_model_profile: "precise"` and the same workspace. Existing sidebar tests still cover the no-profile path by expecting only `workspace_id`.
- Stabilized the existing cross-workspace subagent sidebar test by waiting for the subagent query and label before clicking the subagent row.
- Removed the migrated V1 Python UI harness scenario for new-session draft creation including the selected normal model profile. The legacy Python UI harness now has 3 remaining scenarios: prompt mention/resource autocomplete, title preview event timing, and pasted-image footer hint.

### Verification
- `npm run test -- src/test/SessionsSidebar.test.tsx` passed with 27 tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_prompt_yolo_ui.py` passed.
- `rg -c "^def test_" tests/integration_tests/frontend/test_prompt_yolo_ui.py` returned 3.
- `rg -n "test_new_session_draft_creation_includes_selected_normal_model_profile|carries the selected normal model profile into new sessions|normal_model_profile" tests/integration_tests/frontend/test_prompt_yolo_ui.py frontend/app/src/test/SessionsSidebar.test.tsx frontend/app/src/features/sessions/SessionsSidebar.tsx` returns the new V2 TS coverage and implementation; no migrated V1 Python function name remains.

### Reviewer
- Main-agent V1 harness mapping, focused V2 implementation, targeted sidebar verification, and partial legacy harness removal completed for this new-session model-profile inheritance slice. No full sidebar subsystem PASS, final V1/V2 visual audit sign-off, streaming/replay PASS, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Composer Pasted Image Attachment Harness Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining V1 `test_prompt_yolo_ui.py` harness inventory, and V2 Composer pasted-image attachment coverage before editing.
- Strengthened V2 Composer coverage for the pasted-image user state that replaces the old V1 footer-hint DOM behavior: the prompt attachment region is absent before paste, appears after an image paste, and disappears again when the pasted image is removed.
- Removed the migrated V1 Python UI harness scenario for `promptInputHint` hiding when an image attachment is present. V2 does not carry that legacy footer-hint DOM node forward; the user-facing equivalent is the `Prompt attachments` region rendered by `PromptAttachments`.
- The legacy Python UI harness now has 2 remaining scenarios: prompt mention/resource autocomplete and title preview event timing. The title preview scenario remains intentionally unresolved because the corresponding V1 `agent-teams-session-title-previewed` event is not yet mapped to a confirmed V2 behavior.
- This slice is test coverage and harness cleanup only; no production UI, Settings/sidebar inventory, backend, desktop, stream/replay runtime, or built dist behavior changed.

### Verification
- `npm run test -- src/test/Composer.test.tsx` passed with 72 tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_prompt_yolo_ui.py` passed.
- `rg -c "^def test_" tests/integration_tests/frontend/test_prompt_yolo_ui.py` returned 2.
- `rg -n "test_pasted_image_hides_prompt_footer_hint|Prompt attachments|submits pasted image attachments|removes pasted image attachments" tests/integration_tests/frontend/test_prompt_yolo_ui.py frontend/app/src/test/Composer.test.tsx` returns only the V2 TS attachment coverage and no migrated V1 Python function name.

### Reviewer
- Main-agent V1 harness mapping, focused V2 assertion hardening, targeted Composer verification, and partial legacy harness removal completed for this pasted-image attachment slice. No full Composer subsystem PASS, final V1/V2 visual audit sign-off, streaming/replay PASS, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Composer Title Preview Harness Migration

### Scope
- Re-checked the active frontend rewrite goal, the remaining V1 `test_prompt_yolo_ui.py` harness inventory, and the V1 `agent-teams-session-title-previewed` event path before editing.
- Implemented the V2 equivalent without reintroducing a global DOM event: once `createRun` resolves, Composer now writes the submitted prompt preview into the React Query sidebar session cache using `metadata.title`, preserves the legacy `title` field for compatibility, updates the session detail cache title, and still invalidates the sidebar query for backend reconciliation.
- Preserved the V1 boundary that the title preview is not emitted before a run exists. The new V2 test holds `createRun` pending, proves the sidebar cache remains on the old title, then resolves the run and proves the optimistic title appears.
- Removed the migrated V1 Python UI harness scenario for title preview event timing. The legacy Python UI harness now has 1 remaining scenario: prompt mention/resource autocomplete and insertion.
- This slice is a production behavior parity fix plus focused test migration; no visual layout, Settings/sidebar item inventory, backend contract, desktop shell, stream/replay transport, or built dist behavior changed.

### Verification
- `npm run test -- src/test/Composer.test.tsx` passed with 73 tests.
- `npm run lint` passed.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_prompt_yolo_ui.py` passed.
- `rg -c "^def test_" tests/integration_tests/frontend/test_prompt_yolo_ui.py` returned 1.
- `rg -n "test_handle_send_emits_title_preview_only_after_run_created|previews the submitted prompt title only after run creation succeeds|previewSessionTitleInSidebarCache|agent-teams-session-title-previewed|^def test_" tests/integration_tests/frontend/test_prompt_yolo_ui.py frontend/app/src/test/Composer.test.tsx frontend/app/src/features/composer/Composer.tsx` returns only the new V2 TS coverage, the V2 implementation, and the one remaining legacy Python autocomplete test.

### Reviewer
- Main-agent V1 behavior mapping, V2 React Query implementation, focused TS coverage, targeted type/test verification, and partial legacy harness removal completed for this title preview slice. No full Composer subsystem PASS, final V1/V2 visual audit sign-off, streaming/replay PASS, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Prompt Mention Autocomplete Harness Migration

### Scope
- Re-checked the active frontend rewrite goal, the final remaining `test_prompt_yolo_ui.py` scenario, and existing V2 Composer mention coverage before editing.
- Added V2 Composer coverage for the remaining prompt mention behavior: keyboard role mention selection, fullwidth mention dismissal, directory resource mention continuation, cached resource fallback for later matching queries, and case-preserving workspace resource lookup.
- Fixed a V2 resource mention parity gap by reusing cached workspace path search results only when the current resource query has no results, then deduplicating cached paths before rendering suggestions. This preserves case-sensitive backend queries while restoring V1's useful cached-path fallback behavior for repeated prompt mentions.
- Deleted `tests/integration_tests/frontend/test_prompt_yolo_ui.py`; the old source-copy prompt/composer Python UI harness for this file is now fully migrated to V2 TS coverage.
- This slice is a focused Composer behavior parity fix plus harness cleanup; no visual layout, sidebar/settings item inventory, backend contract, desktop shell, stream/replay transport, or built dist behavior changed.

### Verification
- `npm run test -- src/test/Composer.test.tsx` passed with 76 tests.
- `npm run lint` passed.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_prompt_yolo_ui.py` passed before deletion.
- `Test-Path tests/integration_tests/frontend/test_prompt_yolo_ui.py` returned `False`, confirming the migrated old Python harness file is gone.
- `rg -n "test_prompt_role_mentions_offer|supports keyboard role mention selection|continues directory resource mentions|keeps workspace resource mention lookup case-sensitive|promptResourceResponseForMentions" tests/integration_tests/frontend frontend/app/src/test/Composer.test.tsx frontend/app/src/features/composer/Composer.tsx` returns only the new V2 TS coverage and implementation, with no migrated V1 Python function name.

### Reviewer
- Main-agent V1 harness decomposition, V2 behavior implementation, focused TS coverage, targeted type/test verification, and final `test_prompt_yolo_ui.py` removal completed for this prompt mention slice. No full Composer subsystem PASS, final V1/V2 visual audit sign-off, streaming/replay PASS, broader frontend Python UI test migration PASS, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Timeline Fallback Retry Harness Migration

### Scope
- Re-checked the active frontend rewrite goal, Message Timeline / AG-UI Runtime Stream checklist requirements, remaining old Python UI harness inventory, and current V2 `MessageTimeline` retry/fallback coverage before editing.
- Added V2 `MessageTimeline.test.tsx` coverage for live `llm_fallback_activated` runtime events: the unsafe fallback target is rendered as text in both round marker and round rail metadata, no `<img>` node is created, and the affected round remains visibly warning-state.
- Removed the migrated V1 source-copy harness `test_retry_timeline_escapes_fallback_target_markup` from `tests/integration_tests/frontend/test_round_retry_timeline_ui.py`. That old file now has 14 remaining Python UI harness scenarios.
- This slice is focused Message Timeline runtime-event coverage and old harness migration only; no sidebar/settings item inventory, secondary-page navigation logic, production layout, backend contract, desktop shell, or built dist behavior changed.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "fallback targets"` passed.
- `npm run test -- src/test/MessageTimeline.test.tsx` passed with 114 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_round_retry_timeline_ui.py` passed.
- `rg -c "^def test_" tests/integration_tests/frontend/test_round_retry_timeline_ui.py` returned 14.
- `rg -n "test_retry_timeline_escapes_fallback_target_markup|fallback targets as safe round metadata|llm_fallback_activated" tests/integration_tests/frontend/test_round_retry_timeline_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returns only the new V2 TS coverage and no migrated V1 Python function name.

### Reviewer
- Main-agent goal/checklist scan, V1 harness mapping, focused V2 runtime-event coverage, targeted verification, and partial legacy harness removal completed for this fallback retry timeline slice. No full Message Timeline PASS, AG-UI Runtime Stream PASS, stream/replay recovery PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion is claimed.

## 2026-06-30 Terminal Close Round Refresh Migration

### Scope
- Re-checked the active frontend rewrite goal, Message Timeline / Run Recovery / AG-UI Runtime Stream checklist requirements, remaining old timeline Python UI harnesses, and current V2 stream-controller cache invalidation before editing.
- Fixed V2 `useRunStreamController` terminal close handling so it invalidates `["sessions", sessionId, "rounds"]` together with messages, sidebar, recovery, and token usage. This keeps the round rail/detail transcript, tool counts, retry metadata, and terminal persisted state from remaining stale after a run stream closes.
- Strengthened `RunStreamController.test.tsx` coverage for foreground, paused, and background terminal closes to assert the rounds query is refreshed.
- Removed the migrated V1 source-copy harness `test_load_session_rounds_uses_full_timeline_page_for_navigator` from `tests/integration_tests/frontend/test_round_retry_timeline_ui.py`. The V2 equivalent is covered by `MessageTimeline.test.tsx::collects paged round rail history before sorting and rendering`; the old file now has 13 remaining Python UI harness scenarios.
- This slice improves terminal timeline refresh and removes one old V1 harness. It does not claim complete terminal-settle parity, expected-tool-call follow-up polling parity, full Message Timeline PASS, stream/replay recovery PASS, Settings/sidebar inventory PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm run test -- src/test/RunStreamController.test.tsx -t "refreshes timeline|background stream state"` passed.
- `npm run test -- src/test/MessageTimeline.test.tsx -t "collects paged round rail history"` passed.
- `npm run test -- src/test/RunStreamController.test.tsx` passed with 26 tests.
- `npm run lint` passed.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_round_retry_timeline_ui.py` passed.
- `rg -c "^def test_" tests/integration_tests/frontend/test_round_retry_timeline_ui.py` returned 13.
- `rg -n 'test_load_session_rounds_uses_full_timeline_page_for_navigator|collects paged round rail history|refreshes timeline, sidebar, and session token usage' tests/integration_tests/frontend/test_round_retry_timeline_ui.py frontend/app/src/test/MessageTimeline.test.tsx frontend/app/src/test/RunStreamController.test.tsx` returns only the new V2 TS coverage and no migrated V1 Python function name.
- `rg -n '"rounds"' frontend/app/src/runtime/useRunStreamController.ts frontend/app/src/test/RunStreamController.test.tsx` shows the production invalidation plus the three focused TS assertions.

### Reviewer
- Main-agent goal/checklist scan, V1 harness mapping, V2 terminal-close cache refresh implementation, targeted verification, and partial legacy harness removal completed for this terminal round refresh slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Timeline Session Switch Stale Hydration Migration

### Scope
- Re-checked the active frontend rewrite goal, Message Timeline / Run Recovery / AG-UI Runtime Stream checklist requirements, remaining old timeline and subagent Python UI harnesses, and current V2 `MessageTimeline` query behavior before editing.
- Added V2 `MessageTimeline.test.tsx` coverage for a session-switch race: session 1 starts a slow rounds hydration, the UI switches to session 2 and renders fresh messages/round rail data, then the stale session 1 rounds response resolves without polluting the current timeline.
- Removed the migrated V1 source-copy harness `test_load_session_rounds_ignores_stale_timeline_after_session_switch` from `tests/integration_tests/frontend/test_round_retry_timeline_ui.py`. The old file now has 12 remaining Python UI harness scenarios.
- This slice proves the V2 React Query session-key boundary for stale round hydration. It does not claim broader terminal-settle parity, new-session draft parity, subagent session-switch parity, Playwright replay sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "stale round hydration"` passed.
- `npm run test -- src/test/MessageTimeline.test.tsx` passed with 115 tests.
- `npm run lint` passed.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_round_retry_timeline_ui.py` passed.
- `rg -c "^def test_" tests/integration_tests/frontend/test_round_retry_timeline_ui.py` returned 12.
- `rg -n "test_load_session_rounds_ignores_stale_timeline_after_session_switch|ignores stale round hydration" tests/integration_tests/frontend/test_round_retry_timeline_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returns only the new V2 TS coverage and no migrated V1 Python function name.

### Reviewer
- Main-agent goal/checklist scan, V1 harness mapping, V2 stale hydration race coverage, targeted verification, and partial legacy harness removal completed for this session-switch timeline slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Slow Round Rail Hydration Migration

### Scope
- Re-checked the active frontend rewrite goal, Message Timeline / Run Recovery / AG-UI Runtime Stream checklist requirements, remaining old timeline Python UI harnesses, and current V2 `MessageTimeline` messages/rounds query separation before editing.
- Added V2 `MessageTimeline.test.tsx` coverage proving persisted messages render while round rail hydration is still pending, then the round rail appears after the slower rounds payload resolves.
- Removed the migrated V1 source-copy harness `test_load_session_rounds_renders_page_before_slow_timeline_payload` from `tests/integration_tests/frontend/test_round_retry_timeline_ui.py`. The old file now has 11 remaining Python UI harness scenarios.
- This slice proves the V2 main message stream is not blocked by slow round rail hydration. It does not claim terminal-settle follow-up polling parity, expected-tool-call history parity, Playwright replay sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "slow round rail"` passed.
- `npm run test -- src/test/MessageTimeline.test.tsx` passed with 116 tests.
- `npm run lint` passed.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_round_retry_timeline_ui.py` passed.
- `rg -c "^def test_" tests/integration_tests/frontend/test_round_retry_timeline_ui.py` returned 11.
- `rg -n "test_load_session_rounds_renders_page_before_slow_timeline_payload|renders messages before slow round rail" tests/integration_tests/frontend/test_round_retry_timeline_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returns only the new V2 TS coverage and no migrated V1 Python function name.

### Reviewer
- Main-agent goal/checklist scan, V1 harness mapping, V2 slow hydration coverage, targeted verification, and partial legacy harness removal completed for this timeline hydration slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Bootstrap Shell And Round Rail Failure Migration

### Scope
- Re-checked the active frontend rewrite goal, the product parity checklist, remaining timeline/subagent Python UI harness inventory, and the live `/app/` browser state before editing.
- Used the in-app browser to inspect the actual V2 shell. The page-level scroll was already locked to one viewport, and the sidebar session list had its own scroll container, but the initial bootstrap loader/shell remained visible at `opacity: 1` with a very high z-index after the React app rendered.
- Fixed the V2 React entrypoint so it calls `markBootstrapReady()` after scheduling the app render. Rebuilt `frontend/dist/app` so the served `/app/` bundle receives the fix.
- Added `AppBootstrapEntry.test.tsx` coverage proving the entrypoint marks `body[data-bootstrap-state]` ready after scheduling the root render.
- Added V2 `MessageTimeline.test.tsx` coverage proving hydrated messages remain visible when round rail hydration fails, while the empty state and broken `Rounds` navigation stay hidden.
- Removed the migrated V1 source-copy harness `test_load_session_rounds_falls_back_when_timeline_page_fails` from `tests/integration_tests/frontend/test_round_retry_timeline_ui.py`. The old file now has 10 remaining Python UI harness scenarios.
- This slice closes one real browser-observed shell defect and one round rail failure migration. It does not claim full visual parity, Settings/sidebar inventory PASS, full stream/replay recovery PASS, terminal expected-tool-call polling parity, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm run test -- src/test/AppBootstrapEntry.test.tsx src/test/AppBootstrapHtml.test.ts` passed with 4 tests.
- `npm run test -- src/test/MessageTimeline.test.tsx -t "round rail hydration fails|slow round rail"` passed.
- `npm run test -- src/test/MessageTimeline.test.tsx` passed with 117 tests.
- `npm run lint` passed.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_round_retry_timeline_ui.py` passed.
- `npm run build` passed and rebuilt `frontend/dist/app`.
- Browser reload of `http://127.0.0.1:8000/app/` showed `body[data-bootstrap-state="ready"]`, `.initial-app-loader` and `.initial-app-shell` at `visibility: hidden` and `opacity: 0`, `body` scroll height fixed to the viewport, and `.at-session-list` as its own `overflow-y: auto` scroll container.
- `rg -c "^def test_" tests/integration_tests/frontend/test_round_retry_timeline_ui.py` returned 10.

### Reviewer
- Main-agent goal/checklist scan, actual browser layout inspection, V2 bootstrap shell fix, focused TS coverage, dist rebuild, targeted verification, and partial legacy harness removal completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Terminal Round History Settle Migration

### Scope
- Re-checked the active frontend rewrite goal, Message Timeline / AG-UI Runtime Stream / Run Recovery requirements, and the remaining old timeline Python UI harness inventory before editing.
- Implemented a V2 terminal round history settle path in `useRunStreamController`: when a terminal stream closes after locally observed `tool_call` events, the controller force-refreshes session rounds until the persisted round contains the expected tool call IDs before invalidating the round rail query.
- Kept ordinary terminal closes without local tool calls on the existing immediate rounds refresh path, so plain text runs, paused runs, background closes, and existing cache refresh behavior are not delayed.
- Added bounded retry behavior for transient round-history fetch errors and incomplete early responses. If the expected tool calls never appear within the cap, this terminal-close pass does not publish an incomplete round refresh.
- Added V2 `RunStreamController.test.tsx` coverage for waiting through an incomplete persisted round and retrying transient history fetch failures until the history is safe.
- Removed the migrated V1 source-copy harnesses `test_terminal_round_refresh_waits_for_expected_tool_calls_from_history` and `test_terminal_round_refresh_retries_transient_fetch_errors` from `tests/integration_tests/frontend/test_round_retry_timeline_ui.py`. The old file now has 8 remaining Python UI harness scenarios.
- Rebuilt `frontend/dist/app` so the served V2 app includes the runtime stream-controller change.
- This slice improves terminal stream finalization and persisted round replay safety. It does not claim complete stream/replay recovery PASS, session-switch settle cancellation parity, incomplete-history cap parity, subagent terminal settle parity, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm run test -- src/test/RunStreamController.test.tsx -t "terminal round history"` passed.
- `npm run test -- src/test/RunStreamController.test.tsx` passed with 28 tests.
- `npm run lint` passed.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_round_retry_timeline_ui.py` passed.
- `npm run build` passed and rebuilt `frontend/dist/app`.
- `rg -c "^def test_" tests/integration_tests/frontend/test_round_retry_timeline_ui.py` returned 8.
- `rg -n "test_terminal_round_refresh_waits_for_expected_tool_calls_from_history|test_terminal_round_refresh_retries_transient_fetch_errors|waits for terminal round history|retries transient terminal round" tests\integration_tests\frontend\test_round_retry_timeline_ui.py frontend\app\src\test\RunStreamController.test.tsx` returns only the new V2 TS coverage and no migrated V1 Python function names.

### Reviewer
- Main-agent goal/checklist scan, V1 harness mapping, V2 terminal round settle implementation, focused TS coverage, dist rebuild, targeted verification, and partial legacy harness removal completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Terminal Round Settle Guard Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining `test_round_retry_timeline_ui.py` harness inventory, and the current V2 terminal round settle implementation before editing.
- Added V2 `RunStreamController.test.tsx` coverage proving an in-flight terminal round history settle is canceled by a newer stream generation when another session stream starts, so a late old-session persisted round cannot invalidate the old round rail into the current workspace.
- Added V2 coverage proving incomplete terminal round history follow-ups stop at the 24-attempt cap and do not publish an incomplete rounds refresh when expected streamed tool calls never appear in persisted history.
- Removed the migrated V1 source-copy harnesses `test_terminal_round_refresh_does_not_merge_after_session_switch` and `test_terminal_round_refresh_caps_incomplete_history_followups` from `tests/integration_tests/frontend/test_round_retry_timeline_ui.py`. The old file now has 6 remaining Python UI harness scenarios.
- This slice tightens terminal stream finalization and replay safety. It does not claim complete stream/replay recovery PASS, subagent terminal settle parity, the remaining timeline/draft/background harness migrations, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm run test -- src/test/RunStreamController.test.tsx -t "terminal round history|cancels terminal round|caps incomplete"` passed with 4 tests.
- `npm run test -- src/test/RunStreamController.test.tsx` passed with 30 tests.
- `npm run lint` passed.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_round_retry_timeline_ui.py` passed.
- `rg -n "^def test_" tests/integration_tests/frontend/test_round_retry_timeline_ui.py` returned 6 remaining Python UI harness scenarios.
- `rg -n "test_terminal_round_refresh_does_not_merge_after_session_switch|test_terminal_round_refresh_caps_incomplete_history_followups|cancels terminal round history|caps incomplete terminal round" tests/integration_tests/frontend/test_round_retry_timeline_ui.py frontend/app/src/test/RunStreamController.test.tsx` returns only the new V2 TS coverage and no migrated V1 Python function names.

### Reviewer
- Main-agent goal/checklist scan, V1 harness mapping, V2 session-switch and incomplete-history cap coverage, targeted verification, and partial legacy harness removal completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Retry And Stale Round Hydration Migration

### Scope
- Re-checked the active frontend rewrite goal, product parity checklist, and the remaining `test_round_retry_timeline_ui.py` harness inventory before editing.
- Added V2 `MessageTimeline.test.tsx` coverage for persisted active retrying rounds: the round marker and rail detail now prove `phase: retrying` / `is_active: true` appears as stable warning metadata with attempt, delay, and error details.
- Added V2 coverage for a stale round hydration race: the assistant message renders before delayed round hydration, then a late `running` persisted round is still overlaid by the terminal runtime state and displayed as `completed`.
- Removed the migrated V1 source-copy harnesses `test_retry_timeline_renders_stable_retry_item_with_spinner` and `test_terminal_overlay_survives_stale_background_full_page` from `tests/integration_tests/frontend/test_round_retry_timeline_ui.py`. The old file now has 4 remaining Python UI harness scenarios.
- This slice tightens Rounds/Retry and terminal hydration parity. It does not claim complete Message Timeline PASS, browser stream/replay sign-off, the remaining forced-fetch/new-session/background-summary/live-round migrations, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "active retrying|stale round hydration resolves later"` passed with 2 tests.
- `npm run test -- src/test/MessageTimeline.test.tsx` passed with 119 tests.
- `npm run lint` passed.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_round_retry_timeline_ui.py` passed.
- `rg -c "^def test_" tests/integration_tests/frontend/test_round_retry_timeline_ui.py` returned 4 remaining Python UI harness scenarios.
- `rg -n "test_retry_timeline_renders_stable_retry_item_with_spinner|test_terminal_overlay_survives_stale_background_full_page|active retrying|stale round hydration resolves later" tests/integration_tests/frontend/test_round_retry_timeline_ui.py frontend/app/src/test/MessageTimeline.test.tsx` returns only the new V2 TS coverage and no migrated V1 Python function names.

### Reviewer
- Main-agent goal/checklist scan, V1 harness mapping, V2 active retrying and stale terminal hydration coverage, targeted verification, and partial legacy harness removal completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Round Timeline Harness Retirement

### Scope
- Re-checked the active frontend rewrite goal, remaining `test_round_retry_timeline_ui.py` V1 harnesses, and V2 `MessageTimeline` query/session behavior before editing.
- Added V2 `MessageTimeline.test.tsx` coverage proving stale round hydration cannot repopulate the UI after switching to no selected session, preserving the new-session/no-session surface instead of rendering stale round navigation.
- Added V2 coverage proving round rail page fetching is serialized through the returned cursor: page 2 is not requested until page 1 resolves with `next_cursor`, and the final rail renders both ordered rounds.
- Added V2 coverage proving a rounds refresh replaces stale rail data: an approval-only old round is removed after the refreshed rail source returns the newer run, and the marker/rail now point at the refreshed run.
- Retired the remaining V1 source-copy harnesses in `tests/integration_tests/frontend/test_round_retry_timeline_ui.py` and deleted that file. The broader frontend integration directory still contains other Python UI harnesses that must be handled separately.
- This slice closes the round retry/timeline Python harness file. It does not claim complete Message Timeline PASS, all frontend Python UI migrations, browser stream/replay sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm run test -- src/test/MessageTimeline.test.tsx -t "no selected session|round rail data|serializes round rail|slow round rail"` passed with 4 tests.
- `npm run test -- src/test/MessageTimeline.test.tsx` passed with 122 tests.
- `npm run lint` passed.
- `uv run --extra dev ruff check tests\integration_tests\frontend` passed.
- `Test-Path tests\integration_tests\frontend\test_round_retry_timeline_ui.py` returned `False`.
- `rg -n "^def test_" tests/integration_tests/frontend -g "*.py"` still returns other frontend Python UI harnesses outside the retired round timeline file, so the global Python UI migration remains incomplete.

### Reviewer
- Main-agent goal/checklist scan, V1 harness mapping, V2 no-session stale hydration/cursor serialization/round refresh coverage, focused verification, and full retirement of the round timeline Python harness file completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Subagent Sidebar Refresh Force Refresh

### Scope
- Re-checked the active frontend rewrite goal, the product parity checklist subagent/stream requirements, the remaining frontend Python UI harness inventory, and the live `/app/` browser shell state before editing.
- Browser DOM/layout inspection showed the current V2 shell URL at `http://127.0.0.1:8000/app/`, the body/document height fixed to the 1280x720 viewport, and the sidebar exposing the V1-aligned primary navigation/workspace structure. The in-app screenshot API timed out twice, so this slice uses DOM/layout metrics only and does not claim visual sign-off.
- Fixed `SessionsSidebar` subagent discovery so the first expanded subagent request remains a normal cacheable request, while a React Query invalidation from stream/recovery paths refetches with `force_refresh=true`.
- Extended `SessionsSidebar.test.tsx` to prove the first nested subagent request calls `listSessionSubagents("session-parent", false)` and the post-invalidation refresh calls `listSessionSubagents("session-parent", true)`.
- Kept V1 secondary-surface behavior untouched: no sidebar item inventory, settings navigation, subagent view routing, composer, message timeline, desktop shell, or built dist behavior changed.
- Did not delete `tests/integration_tests/frontend/test_subagent_sessions_ui.py` in this slice because its background-task/subagent-memory cases still need separate V2 TS mapping. The global Python UI harness migration remains incomplete.
- This slice tightens subagent refresh recovery semantics. It does not claim complete subagent stream/replay PASS, background-task subagent discovery parity, browser screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- SessionsSidebar.test.tsx` passed with 27 tests.
- `npm run lint` passed.
- `git diff --check` passed.
- `rg -n "^def test_" tests/integration_tests/frontend/test_subagent_sessions_ui.py` still returns remaining Python UI harness scenarios, so the subagent harness retirement is still pending.

### Reviewer
- Main-agent goal/checklist scan, V1 harness mapping, live browser layout inspection, V2 subagent refresh implementation, focused TS coverage, and targeted verification completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Subagent Force Refresh Harness Retirement

### Scope
- Re-checked the active frontend rewrite goal, the existing V2 `SessionsSidebar.test.tsx` force-refresh coverage, and the remaining `test_subagent_sessions_ui.py` Python harness inventory before editing.
- Removed the migrated V1 source-copy harness `test_ensure_session_subagents_force_refresh_reaches_api` from `tests/integration_tests/frontend/test_subagent_sessions_ui.py`.
- The V2 equivalent is covered by `SessionsSidebar.test.tsx`, which proves the first expanded subagent request calls `listSessionSubagents("session-parent", false)` and a post-invalidation refresh calls `listSessionSubagents("session-parent", true)`.
- Did not remove the terminal-settle subagent harness in this slice because its old V1 `requireToolBoundary` retry path is not yet proven by an equivalent V2 subagent-message refresh test.
- No production UI, sidebar/settings item inventory, secondary-surface routing, stream controller, or built dist behavior changed in this slice.
- This slice reduces the subagent Python UI harness count only. It does not claim complete subagent stream/replay PASS, background-task subagent discovery parity, subagent terminal settle parity, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- SessionsSidebar.test.tsx` passed with 27 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_sessions_ui.py` passed.
- `rg -n "^def test_" tests\integration_tests\frontend\test_subagent_sessions_ui.py` returned 11 remaining Python UI harness scenarios.
- `rg -n -F "test_ensure_session_subagents_force_refresh_reaches_api" tests\integration_tests\frontend\test_subagent_sessions_ui.py frontend\app\src\test\SessionsSidebar.test.tsx docs\goals\frontend-rewrite\implementation-ledger.md` returns only this ledger entry and no remaining Python function definition.

### Reviewer
- Main-agent goal/checklist scan, V1 harness mapping, V2 TS evidence check, targeted verification, and partial legacy harness removal completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Subagent Secondary Surface Harness Retirement

### Scope
- Re-checked the active frontend rewrite goal, the existing V2 AppShell subagent coverage, and the remaining `test_subagent_sessions_ui.py` Python harness inventory before editing.
- Extended `AppShell.test.tsx` so the subagent secondary workspace test now explicitly proves the main chat composer is not mounted while `SubagentSessionView` is active.
- Removed the migrated V1 source-copy harness `test_live_subagent_open_is_guarded_after_session_switch_race` from `tests/integration_tests/frontend/test_subagent_sessions_ui.py`. The V2 behavior is covered through AppShell cross-session subagent selection and pending main-session hydration isolation rather than by scanning old `frontend/dist` bootstrap strings.
- Kept the larger `test_opening_subagent_session_hides_main_input_container` runner for now because its V1 DOM helper details still need a direct V2 mapping before removal, even though the new AppShell assertion covers the core composer absence.
- No production UI, sidebar/settings item inventory, stream controller, or built dist behavior changed in this slice.
- This slice reduces the subagent Python UI harness count and strengthens secondary-surface coverage. It does not claim complete subagent stream/replay PASS, subagent gate parity, background-task subagent discovery parity, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- AppShell.test.tsx -t "subagent"` passed with 5 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_sessions_ui.py` passed.
- `rg -n "^def test_" tests\integration_tests\frontend\test_subagent_sessions_ui.py` returned 10 remaining Python UI harness scenarios.
- `rg -n -F "test_live_subagent_open_is_guarded_after_session_switch_race" tests\integration_tests\frontend\test_subagent_sessions_ui.py frontend\app\src\test\AppShell.test.tsx docs\goals\frontend-rewrite\implementation-ledger.md` returns only this ledger entry and no remaining Python function definition.

### Reviewer
- Main-agent goal/checklist scan, V1 harness mapping, V2 AppShell coverage strengthening, targeted verification, and partial legacy harness removal completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Subagent Layout CSS Harness Retirement

### Scope
- Re-checked the active frontend rewrite goal, current V2 subagent CSS, existing `ShellLayoutCss.test.ts`, and the remaining `test_subagent_sessions_ui.py` Python harness inventory before editing.
- Added V2 `ShellLayoutCss.test.ts` coverage proving subagent sessions stay locked to the workspace frame: `.at-subagent-session-view` uses a two-row grid with `height: 100%`, `min-height: 0`, and `overflow: hidden`; the title row truncates safely; and `.at-subagent-session-body` keeps its scrollable timeline child inside `minmax(0, 1fr)`.
- Removed the migrated V1 source-copy harness `test_subagent_session_streaming_layout_is_stable` from `tests/integration_tests/frontend/test_subagent_sessions_ui.py`. The removed test only scanned old `frontend/dist/css/components/subagent.css` selectors, while V2 layout lives in `frontend/app/src/styles/theme.css`.
- No production CSS changed in this slice; this is a test migration only.
- This slice reduces the subagent Python UI harness count and strengthens V2 layout coverage. It does not claim browser screenshot sign-off, full visual parity, complete subagent stream/replay PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- ShellLayoutCss.test.ts` passed with 12 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_sessions_ui.py` passed.
- `rg -n "^def test_" tests\integration_tests\frontend\test_subagent_sessions_ui.py` returned 9 remaining Python UI harness scenarios.
- `rg -n -F "test_subagent_session_streaming_layout_is_stable" tests\integration_tests\frontend\test_subagent_sessions_ui.py frontend\app\src\test\ShellLayoutCss.test.ts docs\goals\frontend-rewrite\implementation-ledger.md` returns only this ledger entry and no remaining Python function definition.

### Reviewer
- Main-agent goal/checklist scan, V1 CSS harness mapping, V2 CSS test coverage, targeted verification, and partial legacy harness removal completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Subagent Re-entry Hydration Harness Retirement

### Scope
- Re-checked the active frontend rewrite goal, the product parity checklist subagent/stream requirements, and the remaining `test_subagent_sessions_ui.py` Python harness inventory before editing.
- Added V2 `AppShell.test.tsx` coverage for the return-to-main/re-enter-subagent race: a delayed main-session detail query and pending chat loading frame must not remount the main timeline or composer after the user has re-entered the subagent secondary surface.
- Verified the pending chat loading frame is canceled when `SubagentSessionView` remounts, preserving the V1 secondary-page behavior without changing sidebar/settings item inventory or flattening subagent content into the primary chat surface.
- Removed the migrated V1 source-copy harness `test_return_to_main_session_ignores_stale_hydration_after_subagent_reentry` from `tests/integration_tests/frontend/test_subagent_sessions_ui.py`.
- No production UI, settings navigation, sidebar item list, stream controller, or built dist behavior changed in this slice.
- This slice reduces the subagent Python UI harness count and strengthens AppShell race coverage. It does not claim complete subagent stream/replay PASS, terminal-settle parity, background-task subagent discovery parity, browser screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- AppShell.test.tsx -t "subagent re-entry"` passed.
- `npm test -- AppShell.test.tsx -t "subagent"` passed with 6 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_sessions_ui.py` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- `rg -n "^def test_" tests\integration_tests\frontend\test_subagent_sessions_ui.py` returned 8 remaining Python UI harness scenarios.

### Reviewer
- Main-agent goal/checklist scan, V1 harness mapping, V2 AppShell race coverage, targeted verification, and partial legacy harness removal completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Subagent Return-To-Chat Hydration Harness Retirement

### Scope
- Re-checked the remaining `test_subagent_sessions_ui.py` inventory after the subagent re-entry slice and selected the matching return-to-main-session predecessor harness rather than moving to unrelated visual polish.
- Strengthened the existing V2 `AppShell.test.tsx` return-to-chat coverage so the chat timeline and main-session composer are mounted immediately after leaving a subagent secondary surface, while the subagent view is removed and the chat loading frame is visible.
- Removed the migrated V1 source-copy harness `test_return_to_main_session_clears_subagent_view_before_hydration` from `tests/integration_tests/frontend/test_subagent_sessions_ui.py`.
- Kept V1 secondary-page opening semantics intact: subagent content remains a secondary workspace surface, not flattened into the primary chat, and no sidebar/settings item inventory changed.
- No production UI, settings navigation, stream controller, or built dist behavior changed in this slice.
- This slice reduces the subagent Python UI harness count. It does not claim complete subagent stream/replay PASS, gate resolution parity, running-stream sync parity, terminal-settle parity, background-task subagent discovery parity, browser screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- AppShell.test.tsx -t "sidebar returns to chat|subagent"` passed with 6 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_sessions_ui.py` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- `rg -n "^def test_" tests\integration_tests\frontend\test_subagent_sessions_ui.py` returned 7 remaining Python UI harness scenarios.

### Reviewer
- Main-agent goal/checklist scan, V1 harness mapping, V2 AppShell return-to-chat coverage, targeted verification, and partial legacy harness removal completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Subagent Open Surface Harness Retirement

### Scope
- Re-checked the remaining `test_subagent_sessions_ui.py` inventory and selected `test_opening_subagent_session_hides_main_input_container` only after mapping its V1 assertions across V2 AppShell routing and the real `SubagentSessionView`.
- Strengthened `AppShell.test.tsx` so opening a subagent secondary surface asserts the passed session id, instance id, run id, and run status, while the main timeline/composer and old right-drawer entrypoints are absent.
- Strengthened `SubagentSessionView.test.tsx` so the real subagent view proves the read-only header metadata, agent message query, checkpoint-based foreground stream start, and cleanup path.
- Removed the migrated V1 source-copy harness `test_opening_subagent_session_hides_main_input_container` from `tests/integration_tests/frontend/test_subagent_sessions_ui.py`.
- Kept V1 secondary-surface semantics intact and did not change sidebar/settings item inventory, production UI, stream controller, or built dist behavior.
- This slice reduces the subagent Python UI harness count. It does not claim complete subagent stream/replay PASS, gate resolution parity, running-stream sync parity, terminal-settle parity, background-task subagent discovery parity, browser screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- AppShell.test.tsx -t "subagent"` passed with 6 tests.
- `npm test -- SubagentSessionView.test.tsx` passed with 8 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_sessions_ui.py` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- `rg -n "^def test_" tests\integration_tests\frontend\test_subagent_sessions_ui.py` returned 6 remaining Python UI harness scenarios.

### Reviewer
- Main-agent goal/checklist scan, V1 harness mapping, V2 AppShell and SubagentSessionView coverage, targeted verification, and partial legacy harness removal completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Subagent Backend Load Concurrency Migration

### Scope
- Re-checked the remaining `test_subagent_sessions_ui.py` inventory and found that `test_ensure_session_subagents_limits_parallel_backend_loads` represented a real V1 concurrency guarantee that V2 had not yet implemented.
- Added a narrow `SessionsSidebar` subagent-load queue so expanded subagent lists call the existing `listSessionSubagents` API with at most two concurrent backend requests while preserving the existing force-refresh behavior.
- Added V2 `SessionsSidebar.test.tsx` coverage that expands five parent sessions, holds each backend request open, and proves only two subagent loads run at once while all five eventually complete.
- Removed the migrated V1 source-copy harness `test_ensure_session_subagents_limits_parallel_backend_loads` from `tests/integration_tests/frontend/test_subagent_sessions_ui.py`.
- Kept sidebar/settings item inventory, subagent secondary-surface routing, stream controller behavior, and built dist unchanged in this slice.
- This slice restores a V1 refresh-recovery/backpressure guard for V2 sidebar discovery. It does not claim complete subagent stream/replay PASS, running-stream sync parity, terminal-settle parity, background-task subagent discovery parity, browser screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- SessionsSidebar.test.tsx -t "limits expanded subagent"` passed.
- `npm test -- SessionsSidebar.test.tsx` passed with 28 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_sessions_ui.py` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- `rg -n "^def test_" tests\integration_tests\frontend\test_subagent_sessions_ui.py` returned 5 remaining Python UI harness scenarios.

### Reviewer
- Main-agent goal/checklist scan, V1 concurrency harness mapping, V2 production concurrency guard, focused TS coverage, targeted verification, and partial legacy harness removal completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Subagent Discovery Event Refresh Migration

### Scope
- Re-checked the active frontend rewrite goal, the remaining subagent Python UI harness inventory, and the prior migration ledger before editing so this slice advances the global V2 target rather than only chasing the latest visual note.
- Added V2 runtime-stream handling that invalidates the current session subagent query and sidebar session query immediately when a newly observed subagent lifecycle event or subagent background-task event arrives.
- Added per-event dedupe so stream replay, recovery, and repeated `onState` snapshots do not repeatedly refresh the sidebar for the same runtime event.
- Strengthened `RunStreamController.test.tsx` coverage for immediate subagent discovery refresh on `subagent_session_status_changed`, `subagent_resumed`, and `background_task_completed` events.
- Removed the migrated V1 source-copy harness `test_background_task_event_records_normal_mode_subagent_immediately` from `tests/integration_tests/frontend/test_subagent_sessions_ui.py`. V2 intentionally refreshes React Query backed sidebar/subagent data instead of synthesizing a separate frontend global subagent row cache from copied `frontend/dist` helpers.
- Kept `test_subagent_status_update_emits_sidebar_refresh_event` for now because it also covers broader V1 parent/child status merge behavior that still needs an explicit V2 mapping before retirement.
- Kept sidebar/settings item inventory, secondary-surface routing, appearance-page layout, and built dist behavior unchanged in this slice.
- This slice restores a V2 refresh-recovery path for subagent discovery events. It does not claim complete subagent stream/replay PASS, parent/child subagent status merge parity, terminal-settle parity, browser screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- RunStreamController.test.tsx -t "subagent events|subagent discovery"` passed with 2 tests.
- `npm test -- RunStreamController.test.tsx` passed with 31 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_sessions_ui.py` passed.
- `git diff --check` passed.
- `npm run lint` passed.
- `rg -n "^def test_" tests\integration_tests\frontend\test_subagent_sessions_ui.py` returned 4 remaining Python UI harness scenarios.

### Reviewer
- Main-agent goal/checklist scan, V1 background-task harness mapping, V2 runtime-stream query refresh implementation, focused TS coverage, targeted verification, and partial legacy harness removal completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Subagent Terminal History Settle Migration

### Scope
- Re-checked the active frontend rewrite goal, remaining `test_subagent_sessions_ui.py` inventory, and V2 subagent/timeline tests before editing, then selected the terminal settle harness because it directly maps to the stream/replay/recovery requirements.
- Added V2 `SubagentSessionView` terminal history settling: when a tracked subagent stream leaves the tracked set, the view now preserves the visible history while polling persisted agent messages until the history includes tool calls already observed in runtime state, or until the bounded settle attempts are exhausted.
- Added cancellation guards so an unmounted or replaced subagent view does not write stale terminal-settle results into the current query cache.
- Added timeline hydration filtering for persisted tool rows keyed by run id, tool call id, and tool phase, preventing a terminal replay from showing both the persisted tool call and the matching runtime tool call after history catches up.
- Strengthened `SubagentSessionView.test.tsx` with a terminal-history scenario that first returns incomplete persisted history, keeps the existing history visible, then replaces it only after the persisted history contains the streamed tool call.
- Removed the migrated V1 source-copy harness `test_terminal_settle_retries_until_history_is_safe` from `tests/integration_tests/frontend/test_subagent_sessions_ui.py`.
- Kept sidebar/settings item inventory, secondary-surface routing, appearance layout, and built dist unchanged in this slice.
- This slice improves subagent terminal replay safety. It does not claim complete subagent stream/replay PASS, parent/child subagent status merge parity, running-stream sync parity, gate parity, browser screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- SubagentSessionView.test.tsx` passed with 9 tests.
- `npm test -- MessageTimeline.test.tsx -t "subagent runtime tool|post-checkpoint|late tool|terminal"` passed with 12 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_sessions_ui.py` passed.
- `npm run lint` passed.
- `rg -n "^def test_" tests\integration_tests\frontend\test_subagent_sessions_ui.py` returned 3 remaining Python UI harness scenarios.

### Reviewer
- Main-agent goal/checklist scan, V1 terminal-settle harness mapping, V2 subagent terminal history settle implementation, timeline hydration de-duplication, focused TS coverage, targeted verification, and partial legacy harness removal completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Subagent Recovery Cursor Migration

### Scope
- Re-checked the active frontend rewrite goal, the remaining `test_subagent_sessions_ui.py` inventory, and the V1 running-subagent stream-sync harness before editing so this slice stays aligned with the broader V2 stream/replay target.
- Migrated the V2-relevant `last_event_id` continuation behavior from `test_ensure_session_subagents_syncs_running_streams_for_current_session` into `RecoveryBar.test.tsx`.
- Added `last_event_id` to the V2 `RecoveryBackgroundTask` contract and taught `RecoveryBar` to apply that cursor to background subagent output run targets when starting recovery streams.
- Strengthened recovery coverage for both active parent multiplex recovery and stopped-parent subagent-only recovery, proving the subagent output stream resumes from the recovered event cursor instead of replaying from an undefined position.
- Removed the migrated V1 source-copy harness `test_ensure_session_subagents_syncs_running_streams_for_current_session` from `tests/integration_tests/frontend/test_subagent_sessions_ui.py`.
- Kept sidebar/settings item inventory, secondary-surface routing, appearance layout, production visual CSS, and built dist unchanged in this slice.
- This slice improves one stream/replay continuation boundary. It does not claim complete subagent stream/replay PASS, parent/child subagent status merge parity, gate parity, browser screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- RecoveryBar.test.tsx` passed with 30 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_sessions_ui.py` passed.
- `npm run lint` passed.
- `rg -n "^def test_" tests\integration_tests\frontend\test_subagent_sessions_ui.py` returned 2 remaining Python UI harness scenarios.

### Reviewer
- Main-agent goal/checklist scan, V1 running-stream cursor harness mapping, V2 recovery cursor implementation, focused TS coverage, targeted verification, and partial legacy harness removal completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Subagent Sidebar Status Refresh Migration

### Scope
- Re-checked the active frontend rewrite goal, the remaining `test_subagent_sessions_ui.py` inventory, and the V1 status-event/sidebar-refresh harness before editing.
- Split the old V1 source-copy harness into V2 responsibilities: `RunStreamController.test.tsx` already covers subagent runtime events invalidating the current session subagent query and sidebar query, while the new `SessionsSidebar.test.tsx` coverage proves expanded subagent rows redraw status from refreshed authoritative backend records.
- Added V2 sidebar coverage for a running subagent changing to stopped and then back to running after query invalidations, with force-refresh requests after invalidation.
- Removed the migrated V1 source-copy harness `test_subagent_status_update_emits_sidebar_refresh_event` from `tests/integration_tests/frontend/test_subagent_sessions_ui.py`.
- Kept sidebar/settings item inventory, secondary-surface routing, appearance layout, production visual CSS, stream controller production code, and built dist unchanged in this slice.
- This slice tightens subagent status-refresh parity. It does not claim complete subagent stream/replay PASS, gate parity, browser screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- SessionsSidebar.test.tsx -t "subagent status|subagent cache refresh|subagent discovery"` passed with 2 focused tests.
- `npm test -- RunStreamController.test.tsx -t "subagent events|subagent discovery"` passed with 2 focused tests.
- `npm test -- SessionsSidebar.test.tsx` passed with 29 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_subagent_sessions_ui.py` passed.
- `npm run lint` passed.
- `rg -n "^def test_" tests\integration_tests\frontend\test_subagent_sessions_ui.py` returned 1 remaining Python UI harness scenario.

### Reviewer
- Main-agent goal/checklist scan, V1 mixed status harness mapping, V2 sidebar status-refresh coverage, targeted verification, and partial legacy harness removal completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Subagent Gate Resolution Harness Retirement

### Scope
- Re-checked the active frontend rewrite goal, the final remaining `test_subagent_sessions_ui.py` harness, and the V2 pending-approval ownership before editing.
- Mapped the old V1 gate-card race to the V2 recovery model: pending gates/tool approvals are rendered from the session recovery snapshot, not inserted into the subagent secondary-page DOM by copied `frontend/dist` helpers.
- Added `RecoveryBar.test.tsx` coverage proving a resolved pending approval disappears after the success-triggered recovery refresh returns no pending approvals, preventing stale approval UI from surviving resolution.
- Deleted `tests/integration_tests/frontend/test_subagent_sessions_ui.py`; the old V1 source-copy subagent session harness file is now retired.
- Kept sidebar/settings item inventory, secondary-surface routing, appearance layout, production visual CSS, stream controller production code, and built dist unchanged in this slice.
- This slice closes the subagent sessions Python UI harness file. It does not claim complete subagent stream/replay PASS, full Run Recovery PASS, browser screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- RecoveryBar.test.tsx -t "resolved approvals|approval"` passed with 6 focused tests.
- `npm test -- RecoveryBar.test.tsx` passed with 31 tests.
- `npm run lint` passed.
- `Test-Path tests\integration_tests\frontend\test_subagent_sessions_ui.py` returned `False`.

### Reviewer
- Main-agent goal/checklist scan, V1 gate harness mapping, V2 recovery approval refresh coverage, targeted verification, and old subagent session harness file deletion completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Composer Framework Visual Parity Tightening

### Scope
- Re-checked the active frontend rewrite goal, compared fresh 1280x720 V2 and V1 framework screenshots, and selected the confirmed V1/V2 gap instead of continuing to edit from memory.
- Fixed the V2 bottom composer control row so desktop-width mode, role, target, and model controls keep V1-level readable text instead of shrinking into ellipses.
- Kept the full-page shell fixed to one viewport: screenshot DOM metrics after the change show `body` and `#root` at `720/720` with `overflow: hidden`.
- Kept sidebar/settings item inventory, secondary-page routing, stream controller behavior, and appearance settings navigation unchanged in this slice.
- This slice is a visual framework tightening only. It does not claim complete visual parity, complete stream/replay PASS, interrupted-stream recovery PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- ShellLayoutCss.test.ts` passed with 12 tests.
- `git diff --check` passed.
- `npm run build` passed, including `tsc --noEmit`, `tsc -p tsconfig.desktop.json --noEmit`, desktop build, and Vite production build.
- Playwright screenshot `frontend-v2-framework-after.png` at 1280x720 verified composer controls are readable; DOM measurements reported no clipped labels for `普通模式`, `编排模式`, `Main Agent`, `目标角色`, or `默认`.

### Reviewer
- Main-agent V1/V2 screenshot comparison, focused CSS guard update, production build, and browser screenshot/DOM verification completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Primary Feature Stream Detach Migration

### Scope
- Re-checked the active frontend rewrite goal, the remaining Python frontend harness inventory, and the stream/replay quality gates before selecting this slice.
- Migrated the V1 `test_projects_sidebar_detaches_active_stream_before_opening_feature_view` behavior into V2 `AppShell.test.tsx`.
- Updated `AppShell` so opening a primary feature surface such as Skills while a foreground run stream is active clears the foreground run stream before the chat workspace unmounts.
- Removed the matching old V1 source-copy Python harness function from `tests/integration_tests/frontend/test_projects_sidebar_ui.py`.
- Kept sidebar/settings item inventory, secondary-page routing, appearance layout, and visual framework CSS unchanged in this slice.
- This slice tightens one stream/navigation boundary. It does not claim complete stream/replay PASS, interrupted-stream recovery PASS, broader Projects Sidebar Python harness migration PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion. The adjacent `test_projects_sidebar_new_session_detaches_active_stream_without_session` Python harness remains as a next migration candidate.

### Verification
- `npm test -- AppShell.test.tsx -t "foreground stream|routes primary sidebar"` passed with 2 focused tests.
- `npm test -- AppShell.test.tsx` passed with 32 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_projects_sidebar_ui.py` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- `npm run build` passed, including `tsc --noEmit`, `tsc -p tsconfig.desktop.json --noEmit`, desktop build, and Vite production build.
- `rg -n "test_projects_sidebar_detaches_active_stream_before_opening_feature_view|detaches_active_stream_before_opening_feature_view|active stream before opening feature" tests\integration_tests\frontend frontend\app\src\test\AppShell.test.tsx` returned no matches.

### Reviewer
- Main-agent V1 harness mapping, V2 production stream-detach implementation, focused/full AppShell verification, frontend typecheck/build, and partial Python UI harness retirement completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Empty Shell New Session Stream Detach Migration

### Scope
- Re-checked the active frontend rewrite goal and continued the adjacent stream/navigation migration rather than switching to unrelated UI polish.
- Migrated the V1 `test_projects_sidebar_new_session_detaches_active_stream_without_session` behavior into V2 `AppShell.test.tsx`.
- Updated `AppShell` so a stale active foreground stream is cleared when the shell has no selected session and navigation returns to chat, covering the new-session-from-empty-shell boundary where `ChatWorkspace` has no previous session switch to observe.
- Kept existing active streams intact when returning to chat with an already selected session, preserving normal foreground stream behavior.
- Removed the matching old V1 source-copy Python harness function from `tests/integration_tests/frontend/test_projects_sidebar_ui.py`.
- Kept sidebar/settings item inventory, visible navigation labels, secondary-page routing, appearance layout, and visual framework CSS unchanged in this slice.
- This slice tightens one more stream/navigation boundary. It does not claim complete stream/replay PASS, interrupted-stream recovery PASS, broader Projects Sidebar Python harness migration PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- AppShell.test.tsx -t "stale active foreground stream|foreground stream"` passed with 2 focused tests.
- `npm test -- AppShell.test.tsx` passed with 33 tests, including the V1 sidebar inventory alignment assertion.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_projects_sidebar_ui.py` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- `npm run build` passed, including `tsc --noEmit`, `tsc -p tsconfig.desktop.json --noEmit`, desktop build, and Vite production build.
- `rg -n "test_projects_sidebar_new_session_detaches_active_stream_without_session|new_session_detaches_active_stream_without_session" tests\integration_tests\frontend frontend\app\src\test\AppShell.test.tsx` returned no matches.

### Reviewer
- Main-agent V1 harness mapping, V2 production empty-shell stream-detach implementation, focused/full AppShell verification, frontend typecheck/build, and partial Python UI harness retirement completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Workspace View Stream Detach Harness Migration

### Scope
- Re-checked the active frontend rewrite goal, the remaining Projects Sidebar Python harness inventory, and the stream/replay quality gates before selecting this slice.
- Migrated the V1 `test_projects_sidebar_cancels_pending_session_switch_before_workspace_view` boundary into V2 `AppShell.test.tsx`.
- Added coverage proving that opening the workspace secondary surface clears an active foreground run stream before the chat workspace unmounts, while preserving the selected V2 session/workspace shell state.
- Removed the matching old V1 source-copy Python harness function from `tests/integration_tests/frontend/test_projects_sidebar_ui.py`.
- Kept sidebar/settings item inventory, visible navigation labels, secondary-page routing, appearance layout, production visual CSS, and production stream controller code unchanged in this slice.
- This slice tightens one workspace/navigation stream boundary. It does not claim complete stream/replay PASS, interrupted-stream recovery PASS, broader Projects Sidebar Python harness migration PASS, browser screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- AppShell.test.tsx -t "workspace view|foreground stream"` passed with 3 focused tests.
- `npm test -- AppShell.test.tsx` passed with 34 tests, including the V1 sidebar inventory alignment assertion.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_projects_sidebar_ui.py` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- `rg -n "test_projects_sidebar_cancels_pending_session_switch_before_workspace_view|cancels_pending_session_switch_before_workspace_view" tests\integration_tests\frontend frontend\app\src\test\AppShell.test.tsx` returned no matches.

### Reviewer
- Main-agent goal/checklist scan, V1 workspace-navigation stream harness mapping, V2 AppShell coverage, focused/full AppShell verification, frontend typecheck, and partial Python UI harness retirement completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Project View Workbench Scroll Harness Migration

### Scope
- Re-checked the active frontend rewrite goal, the product parity checklist, the quality gates, current browser DOM metrics, and fresh V1/V2 route-switch screenshots before selecting this slice.
- Confirmed the current V2 shell now keeps `body` and `#root` fixed to the 1280x720 viewport with independent `.at-session-list` and `.at-timeline` scroll regions; the in-app screenshot API itself timed out repeatedly, so this slice used the project Playwright browser harness for screenshot evidence.
- Migrated the V1 `test_project_view_workbench_uses_independent_scroll_regions` CSS harness into `ShellLayoutCss.test.ts` using the V2 `at-*` project view/workbench structure.
- Added V2 CSS coverage for project view fixed-frame behavior, workbench toolbar/content sizing, internal file/diff/tree preview scroll regions, and narrow viewport workbench row stacking.
- Removed the matching old V1 source-copy Python harness function from `tests/integration_tests/frontend/test_project_view_ui.py`.
- Refreshed browser screenshots for route switching and the project view: `.tmp/frontend-v2-ts-route-switch/ts-v1-root-before-switch.png`, `.tmp/frontend-v2-ts-route-switch/ts-v2-after-new-ui-switch.png`, and `.tmp/frontend-v2-ts-project-view/v2-project-view-files.png`.
- Kept production UI code, sidebar/settings item inventory, visible navigation labels, secondary-page routing, appearance layout, and stream controller behavior unchanged in this slice.
- Visual follow-up noted from the refreshed V1/V2 screenshots: the V2 empty-chat composer control row still truncates the mode labels more than V1 in the 1280px browser-test fixture. That is not closed by this slice.
- This slice tightens one project-view layout parity boundary and retires one Python UI harness. It does not claim complete Project View PASS, complete visual parity, complete stream/replay PASS, broader Python UI harness migration PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- ShellLayoutCss.test.ts` passed with 13 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_project_view_ui.py` passed.
- `npm run test:browser -- v2-project-view.spec.ts --project=chromium` passed and refreshed the project-view screenshot.
- `npm run test:browser -- v2-route-switch.spec.ts --project=chromium` passed and refreshed the V1/V2 route-switch screenshots.
- `rg -n "test_project_view_workbench_uses_independent_scroll_regions|workbench_uses_independent_scroll_regions" tests\integration_tests\frontend frontend\app\src\test` returned no matches.

### Reviewer
- Main-agent goal/checklist scan, V1 project-view scroll CSS harness mapping, V2 CSS guard migration, browser screenshot refresh, and partial Python UI harness retirement completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Composer Control Readability Visual Tightening

### Scope
- Re-checked the active frontend rewrite goal, current worktree status, and the refreshed V1/V2 route-switch screenshots before editing.
- Fixed the V2 empty-chat composer control row at the 1280px V1 comparison width so short controls such as session mode, target role, and model profile remain readable instead of clipping into `Nor...`, `Orchestr...`, or `Target r...`.
- Increased the desktop session-mode segmented control and select widths enough for the short V1-parity labels, and let the composer action cluster take its own row below 1320px so the primary controls do not compete with send/toggle actions.
- Strengthened the shared Playwright browser helper so composer mode labels and the target-role placeholder fail browser tests when they are visually clipped, not merely when controls overlap.
- Refreshed the route-switch screenshots after the production build. The V2 screenshot now shows readable `Normal`, `Orchestration`, `Target role`, and `Default` labels in the 1280px fixture.
- Kept sidebar/settings item inventory, secondary-page routing, stream controller behavior, appearance settings content, and Python UI harness inventory unchanged in this slice.
- This slice tightens one visual parity gap from screenshot review. It does not claim complete visual parity, complete Composer PASS, complete stream/replay PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- ShellLayoutCss.test.ts` passed with 13 tests.
- `npm run build` passed, including `tsc --noEmit`, `tsc -p tsconfig.desktop.json --noEmit`, desktop build, and Vite production build.
- `npm run test:browser -- v2-route-switch.spec.ts --project=chromium` passed and refreshed `.tmp/frontend-v2-ts-route-switch/ts-v1-root-before-switch.png` plus `.tmp/frontend-v2-ts-route-switch/ts-v2-after-new-ui-switch.png`.
- `npm run test:browser -- v2-shell-parity.spec.ts --project=chromium` passed with 5 browser tests and exercised the strengthened composer readability helper across shell surfaces.

### Reviewer
- Main-agent screenshot comparison, focused composer CSS implementation, browser readability guard update, production build, and V1/V2 screenshot refresh completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Loaded Sidebar Session Index Harness Migration

### Scope
- Re-checked the active frontend rewrite goal, stream/recovery quality gates, remaining Projects Sidebar Python harness inventory, and current V2 sidebar/session tests before editing.
- Mapped the V1 `test_projects_sidebar_indexes_search_and_streams_from_loaded_session_pages` harness to the V2 architecture: V2 sidebar search and compact run indicators are derived from the `listSidebarSessions` query records, while stream continuation is owned by the AG-UI recovery/run-controller layer rather than a sidebar-local background stream sync helper.
- Added `SessionsSidebar.test.tsx` coverage proving a large loaded sidebar result set indexes searchable hidden-by-cap sessions, renders the active run indicator from the loaded sidebar record, does not surface a hidden active session that is not in the sidebar query payload, and does not trigger subagent/background discovery as a side effect of search indexing.
- Removed the matching old V1 source-copy Python harness function from `tests/integration_tests/frontend/test_projects_sidebar_ui.py`.
- Kept production UI code, sidebar/settings item inventory, visual layout, secondary-page routing, build output, and stream controller behavior unchanged in this slice.
- This slice retires one Projects Sidebar Python UI harness and tightens the V2 sidebar search/run-indicator boundary. It does not claim complete stream/replay PASS, complete Sessions Sidebar PASS, broader Python UI harness migration PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- SessionsSidebar.test.tsx -t "loaded sidebar records|filtered workspace results|compact session status"` passed with 3 focused tests.
- `npm test -- SessionsSidebar.test.tsx` passed with 30 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_projects_sidebar_ui.py` passed.
- `rg -n "test_projects_sidebar_indexes_search_and_streams_from_loaded_session_pages|indexes_search_and_streams_from_loaded_session_pages" tests\integration_tests\frontend frontend\app\src\test` returned no matches.

### Reviewer
- Main-agent V1 harness mapping, V2 sidebar query/search/status coverage, focused/full SessionsSidebar verification, and partial Python UI harness retirement completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Sidebar Run Indicator Harness Migration

### Scope
- Re-checked the active frontend rewrite goal and current implementation ledger before selecting this slice, with the remaining gap still centered on V1 parity, stream/replay/recovery hardening, browser screenshot sign-off, and Python UI harness retirement.
- Migrated the V1 `test_projects_sidebar_renders_session_run_status_indicators` behavior into V2 `SessionsSidebar.test.tsx`.
- Added V2 coverage proving queued and stopping sidebar sessions render as active running indicators, failed/stopped/unread terminal states keep compact indicator glyphs instead of raw status text, and the selected session suppresses stale unread terminal indicators.
- Updated `SessionsSidebar` so a selected session with only stale `has_unread_terminal_run` state no longer receives the unread indicator class or glyph, matching the V1 active-session behavior without changing running/failed/stopped status mapping.
- Removed the matching old V1 source-copy Python harness function from `tests/integration_tests/frontend/test_projects_sidebar_ui.py`.
- Kept sidebar/settings item inventory, secondary-page routing, appearance settings layout, broader visual framework CSS, stream controller behavior, and replay/recovery code unchanged in this slice.
- This slice retires one Projects Sidebar Python UI harness and tightens one sidebar status parity boundary. It does not claim complete Sessions Sidebar PASS, complete visual parity, complete stream/replay PASS, interrupted-stream recovery PASS, broader Python UI harness migration PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- SessionsSidebar.test.tsx -t "terminal run indicators|selected session"` passed with 5 focused tests.
- `npm test -- SessionsSidebar.test.tsx` passed with 31 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_projects_sidebar_ui.py` passed.
- `npm run lint` passed, including `tsc --noEmit --pretty false` and `tsc -p tsconfig.desktop.json --noEmit --pretty false`.
- `npm run build` passed, including `tsc --noEmit`, `tsc -p tsconfig.desktop.json --noEmit`, desktop build, and Vite production build.
- `rg -n "test_projects_sidebar_renders_session_run_status_indicators|renders_session_run_status_indicators" tests\integration_tests\frontend frontend\app\src\test` returned no matches.

### Reviewer
- Main-agent goal/ledger scan, V1 run-indicator harness mapping, V2 production selected-session indicator fix, focused/full SessionsSidebar verification, frontend typecheck/build, and partial Python UI harness retirement completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Large Sidebar Group DOM Cap Harness Migration

### Scope
- Re-checked the active frontend rewrite goal, product parity checklist, quality gates, current worktree status, and remaining frontend Python UI harness inventory before selecting this slice.
- Selected the V1 `test_projects_sidebar_renders_2000_sessions_without_full_dom_expansion` behavior because it protects sidebar density, local scroll performance, and the fixed-frame shell direction called out by the current V2 frontend goal.
- Migrated the 2000-session workspace behavior into V2 `SessionsSidebar.test.tsx`, covering the real React sidebar component instead of the old source-copy harness.
- Added coverage proving a 2000-session workspace initially renders only 10 `.at-session-item` rows, keeps the next item out of the DOM, shows the `10/2000` load-more affordance, and fetches sidebar sessions once.
- Removed the matching old V1 source-copy Python harness function from `tests/integration_tests/frontend/test_projects_sidebar_ui.py`.
- Kept production UI code, sidebar/settings item inventory, secondary-page routing, appearance settings layout, visual framework CSS, stream controller behavior, replay/recovery code, and build output unchanged in this slice.
- This slice retires one Projects Sidebar Python UI harness and tightens one sidebar performance/density parity boundary. It does not claim complete Sessions Sidebar PASS, complete visual parity, complete stream/replay PASS, interrupted-stream recovery PASS, broader Python UI harness migration PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- SessionsSidebar.test.tsx -t "2000-session"` passed with 1 focused test.
- `npm test -- SessionsSidebar.test.tsx` passed with 32 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_projects_sidebar_ui.py` passed.
- `rg -n "test_projects_sidebar_renders_2000_sessions_without_full_dom_expansion|renders_2000_sessions_without_full_dom_expansion|2000-session workspace" tests\integration_tests\frontend frontend\app\src\test` returned only the new V2 TS test name.

### Reviewer
- Main-agent goal/checklist scan, V1 2000-session DOM-cap harness mapping, V2 SessionsSidebar coverage, focused/full SessionsSidebar verification, and partial Python UI harness retirement completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Sidebar Session Click State Harness Migration

### Scope
- Re-checked the active frontend rewrite goal, current worktree status, and remaining Projects Sidebar Python UI harnesses before selecting this slice.
- Migrated the V1 `test_projects_sidebar_clears_unread_indicator_immediately_on_session_click` behavior into V2 `SessionsSidebar.test.tsx`.
- Added V2 interaction coverage proving an unread terminal session row first renders with the unread indicator, then immediately becomes selected and loses the unread indicator when clicked, without issuing a session metadata update.
- Migrated the adjacent V1 `test_projects_sidebar_keeps_latest_rapid_session_click_active` behavior into V2 `SessionsSidebar.test.tsx`.
- Added V2 coverage proving rapid clicks on two session rows leave the latest clicked session selected and update the selected workspace/session store state.
- Removed the two matching old V1 source-copy Python harness functions from `tests/integration_tests/frontend/test_projects_sidebar_ui.py`.
- Kept production UI code, sidebar/settings item inventory, secondary-page routing, appearance settings layout, visual framework CSS, stream controller behavior, replay/recovery code, and build output unchanged in this slice.
- This slice retires two Projects Sidebar Python UI harnesses and tightens one sidebar interaction/state parity boundary. It does not claim complete Sessions Sidebar PASS, complete visual parity, complete stream/replay PASS, interrupted-stream recovery PASS, broader Python UI harness migration PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- SessionsSidebar.test.tsx -t "unread terminal indicator immediately|latest rapid session click"` passed with 2 focused tests.
- `npm test -- SessionsSidebar.test.tsx` passed with 34 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_projects_sidebar_ui.py` passed.
- `rg -n "test_projects_sidebar_clears_unread_indicator_immediately_on_session_click|test_projects_sidebar_keeps_latest_rapid_session_click_active|clears_unread_indicator_immediately|keeps_latest_rapid_session_click|unread terminal indicator immediately|latest rapid session click" tests\integration_tests\frontend frontend\app\src\test` returned only the new V2 TS test names.

### Reviewer
- Main-agent goal/worktree scan, V1 session-click harness mapping, V2 SessionsSidebar interaction coverage, focused/full SessionsSidebar verification, and partial Python UI harness retirement completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Sidebar Parent Click And Animation Harness Migration

### Scope
- Re-checked the active frontend rewrite goal, current worktree status, and remaining Projects Sidebar Python UI harnesses before selecting this slice.
- Migrated the V1 `test_projects_sidebar_parent_session_click_preserves_active_subagent_until_handler` behavior into V2 `SessionsSidebar.test.tsx`.
- Added V2 coverage proving a parent session click selects the parent and invokes the session handler while preserving the active subagent marker passed into the sidebar, leaving subagent view cleanup to the AppShell handler boundary.
- Migrated the V1 `test_projects_sidebar_session_click_does_not_add_activation_animation` behavior into V2 `SessionsSidebar.test.tsx`.
- Added V2 coverage proving repeated session clicks keep the row selected without adding legacy activation classes or scheduling the old 180ms activation timer.
- Removed the two matching old V1 source-copy Python harness functions from `tests/integration_tests/frontend/test_projects_sidebar_ui.py`.
- Kept production UI code, sidebar/settings item inventory, secondary-page routing, appearance settings layout, visual framework CSS, stream controller behavior, replay/recovery code, and build output unchanged in this slice.
- This slice retires two Projects Sidebar Python UI harnesses and tightens one sidebar click/subagent boundary. It does not claim complete Sessions Sidebar PASS, complete visual parity, complete stream/replay PASS, interrupted-stream recovery PASS, broader Python UI harness migration PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- SessionsSidebar.test.tsx -t "active subagent marker|activation animation timers"` passed with 2 focused tests.
- `npm test -- SessionsSidebar.test.tsx` passed with 36 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_projects_sidebar_ui.py` passed.
- `rg -n "test_projects_sidebar_parent_session_click_preserves_active_subagent_until_handler|test_projects_sidebar_session_click_does_not_add_activation_animation|parent_session_click_preserves_active_subagent|session_click_does_not_add_activation_animation|active subagent marker|activation animation timers" tests\integration_tests\frontend frontend\app\src\test` returned only the new V2 TS test names.

### Reviewer
- Main-agent goal/worktree scan, V1 parent-click/animation harness mapping, V2 SessionsSidebar interaction coverage, focused/full SessionsSidebar verification, and partial Python UI harness retirement completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Sidebar New Session Cap And Motion Harness Migration

### Scope
- Re-checked the active frontend rewrite goal, current worktree status, and remaining Projects Sidebar Python UI harnesses before selecting this slice.
- Migrated the behavior core of the V1 `test_projects_sidebar_new_session_keeps_session_visibility_collapsed_and_declares_animations` harness into V2 `SessionsSidebar.test.tsx` and `ShellLayoutCss.test.ts`.
- Added V2 coverage proving a capped workspace remains capped after creating and selecting a new session, so hidden rows are not expanded into the DOM as a side effect of new session creation.
- Added V2 CSS coverage proving sidebar session motion is limited to the current run indicator and session-switch affordances, while legacy session item enter/remove/switch-target and project-session visibility animation classes stay absent.
- Removed the matching old V1 source-copy Python harness function from `tests/integration_tests/frontend/test_projects_sidebar_ui.py`; historical V1 source-string assertions were not retained as final V2 acceptance criteria.
- Kept production UI code, sidebar/settings item inventory, secondary-page routing, appearance settings layout, stream controller behavior, replay/recovery code, and build output unchanged in this slice.
- This slice retires one Projects Sidebar Python UI harness and tightens one sidebar new-session/capped-list boundary. It does not claim complete Sessions Sidebar PASS, complete visual parity, complete stream/replay PASS, interrupted-stream recovery PASS, broader Python UI harness migration PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- SessionsSidebar.test.tsx -t "capped workspace capped after creating|active subagent marker"` passed with 2 focused tests.
- `npm test -- ShellLayoutCss.test.ts -t "sidebar session motion"` passed with 1 focused test.
- `npm test -- SessionsSidebar.test.tsx` passed with 37 tests.
- `npm test -- ShellLayoutCss.test.ts` passed with 14 tests.
- `uv run --extra dev ruff check tests\integration_tests\frontend\test_projects_sidebar_ui.py` passed.
- `rg -n "test_projects_sidebar_new_session_keeps_session_visibility_collapsed_and_declares_animations|new_session_keeps_session_visibility_collapsed|capped workspace capped after creating|sidebar session motion" tests\integration_tests\frontend frontend\app\src\test` returned only the new V2 TS test names.

### Reviewer
- Main-agent goal/worktree scan, V1 new-session/animation harness mapping, V2 SessionsSidebar and CSS coverage, focused/full verification, and partial Python UI harness retirement completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 Round Marker Expanded Prompt De-Duplication

### Scope
- Re-checked the active frontend rewrite goal and the MSG-01 historical replay row after the user reported that expanded round markers repeated the same prompt in the summary line and body.
- Reproduced the issue in the real browser first: the stale tab initially loaded old assets and showed the prompt both in `.at-round-marker-intent-summary` and `.at-round-marker-intent-body`.
- Confirmed the currently served refreshed assets removed the prompt from the expanded summary, then tightened `RoundMarker` so the action label is rendered by React as only the current state (`Expand` or `Collapse`) instead of keeping both labels in the DOM and hiding one with CSS.
- Removed the obsolete CSS-only expand/collapse text toggles from `theme.css`.
- Updated `MessageTimeline.test.tsx` so long prompt expansion asserts exact action text and one prompt occurrence.
- Updated `v2-rounds.spec.ts` to assert round requests by parsed path and required query parameters, because the V2 round rail intentionally sends `force_refresh=true` and exact old query strings made the browser regression brittle.
- Rebuilt `frontend/dist/app` and verified the live browser loaded the new `index-BUsY0TEx.js` / `index-CXAJ35hq.css` assets.
- This slice fixes one MSG-01 information-duplication bug. It does not claim complete historical replay PASS, complete stream/replay PASS, full subagent PASS, settings parity, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- --run src/test/MessageTimeline.test.tsx -t "round prompts"` passed with 2 focused tests.
- `npm test -- --run src/test/ShellLayoutCss.test.ts` passed with 17 tests.
- `npm run build` passed, including frontend typecheck, desktop build, and Vite production build.
- `npm run test:browser -- v2-rounds.spec.ts --project=chromium` passed with 5 browser tests.
- Browser DOM check on `流式从头到尾完整验证-1782817107625` after refresh returned `summaryText: "收起"`, `titleText: null`, and `promptOccurrenceCountInMarker: 1`.
- Screenshot saved at `.tmp/frontend-v2-round-marker-expanded-no-duplicate.png`.

### Reviewer
- Main-agent browser reproduction, source fix, focused tests, production build, and live DOM/screenshot verification completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-06-30 General Settings V1 Inventory Closure

### Scope
- Re-checked the active frontend rewrite goal, clean worktree, and `SET-03` before editing.
- Captured the live V1 General settings DOM and screenshot. V1 General contains Diagnostics, Shell Policy, Speech, and Notifications, with one real General save action.
- Captured the live V2 General settings DOM and screenshot before editing; it only rendered the Shell safety switch and Save button.
- Kept the V2 first-level Settings navigation aligned with the current target: Speech, Notifications, and Appearance remain their own pages instead of being flattened back into General.
- Reworked V2 General into a V1-informed page with a Shell policy card, clear save action, and related entries for diagnostic display, Speech, and Notifications.
- Verified related entries open the existing second-level pages and that notification rule details are not rendered inside General.
- Updated `SET-03` to `Verified`. This slice does not claim complete Settings PASS, complete Appearance PASS, complete stream/replay PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- --run src/test/SettingsDrawer.test.tsx -t "general"` passed with 2 focused tests.
- `npm test -- --run src/test/ShellLayoutCss.test.ts` passed with 17 tests.
- `npm run build` passed, including frontend typecheck, desktop build, and Vite production build.
- Browser V1 evidence saved at `.tmp/v1-general-settings.png` and `.tmp/v1-general-dom.json`.
- Browser V2 final evidence saved at `.tmp/v2-general-settings-final.png` and `.tmp/v2-general-dom-final.json`; final DOM reported `shellSwitchCount: 1` and `hasV1Text: false`.
- Browser related-entry click evidence saved at `.tmp/v2-general-related-clicks.json`, confirming General opens Speech, Notifications, and Appearance.

### Reviewer
- Main-agent V1/V2 browser comparison, source fix, focused TS tests, CSS test, production build, and live DOM/screenshot verification completed for this slice. No final V2 completion is claimed.

## 2026-07-01 Fixed Shell Scroll Evidence Recheck

### Scope
- Re-checked the active frontend rewrite goal and `SHELL-03` after the framework-scroll complaints instead of continuing only with message-detail fixes.
- Used the live in-app browser on `http://127.0.0.1:8000/app/` with the current subagent split panel open, because that state is more likely to expose workspace width and scroll ownership regressions.
- Measured the shell before and after scrolling the main chat timeline, then saved the raw DOM metrics and a viewport screenshot.
- Updated `SHELL-03` and the P0 shell framework row from `Gap found` to `In progress`, not `Verified`, because this slice proves current desktop fixed-scroll ownership but does not yet complete narrow/V1 density sign-off.
- Kept production UI code and build output unchanged in this slice.

### Verification
- `npm test -- src/test/ShellLayoutCss.test.ts` passed with 18 tests.
- Browser evidence saved at `.tmp/shell-fixed-scroll-final.json` and `.tmp/shell-fixed-scroll-final.png`.
- The browser scroll check reported `windowScrollY`, `documentScrollTop`, and `bodyScrollTop` stayed `0`; `bodyScrollHeight` and `documentScrollHeight` stayed equal to the `720px` viewport; `.at-session-list.scrollTop` stayed `0`; the main `.at-timeline.scrollTop` moved from `0` to `304.5`; and the composer stayed pinned at the bottom of the chat grid.

### Reviewer
- Main-agent matrix scan, live browser scroll measurement, screenshot inspection, focused CSS verification, and matrix status update completed for this slice. No subsystem PASS, narrow-layout PASS, complete shell parity PASS, or final V2 completion is claimed.

## 2026-07-01 Thinking Hydration Prefix De-Duplication

### Scope
- Re-checked the active frontend rewrite goal and selected the next P0 message-rendering gap from `MSG-03` instead of only following screenshot-level symptoms.
- Reproduced the duplicate-thinking boundary in a focused `MessageTimeline` test: persisted thinking text was rendered from hydrated history while the open runtime overlay still carried the same prefix plus a live suffix.
- Updated runtime hydration so `thinking_delta` entries are normalized before rendering: fully hydrated deltas are dropped, and deltas whose prefix already exists in hydrated thinking history are trimmed before the thinking accumulator appends them.
- Kept the fix scoped to thinking hydration. Tool cards, subagent panel routing, sidebar/settings inventory, appearance settings, composer controls, and broader visual CSS were not changed in this slice.
- This slice fixes one `MSG-03` replay/live-overlay duplication boundary. It does not claim complete thinking/reasoning PASS, complete stream/replay PASS, subagent stream PASS, browser screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm test -- src/test/MessageTimeline.test.tsx -t "trims hydrated thinking prefixes"` passed with the new regression test.
- `npm test -- src/test/MessageTimeline.test.tsx -t "thinking|hydrated|subagent|stream"` passed with 54 focused timeline tests.
- `npm test -- src/test/MessageTimeline.test.tsx` passed with 147 tests.
- `npm run build` passed, including frontend typecheck, desktop build, and Vite production build.
- `npm run test:browser -- v2-rounds.spec.ts -g "does not repeat the round prompt title" --project=chromium` passed.
- `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium` passed with 4 browser tests.
- In-app browser refresh confirmed the served V2 app loaded `index-DghzCSxz.js`; existing expanded round markers still reported one title occurrence each after the rebuild.

### Reviewer
- Main-agent goal/matrix scan, failing-regression reproduction, source fix, focused/full TS verification, production build, browser regression checks, and live in-app bundle/DOM sanity check completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-07-01 Persisted Tool Lifecycle Browser Coverage

### Scope
- Re-checked the active frontend rewrite goal and selected `MSG-04` because tool lifecycle rendering is still a P0 gap and earlier user feedback called out split tool call/result cards.
- Added a focused V2 browser spec that serves the built frontend, mocks a normal session where a `tool-call` and matching `tool-return` arrive as separate persisted assistant messages, and verifies the built UI merges them into one completed tool card.
- The browser assertion checks that the stale `Tool call: read` row is gone, the single card has `data-status="completed"`, no running spinner or legacy status dot is present, details remain collapsed by default, and expanding the card shows both the result body and the original call args.
- Saved screenshot evidence at `.tmp/frontend-v2-ts-tool-lifecycle/v2-tool-lifecycle-merged-card.png`.
- Kept production source, sidebar/settings inventory, visual CSS, stream controller behavior, and built dist unchanged in this slice.
- This slice strengthens `MSG-04` evidence. It does not claim complete tool lifecycle PASS, complete stream/replay PASS, normal/orchestration real-session PASS, browser reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm run test:browser -- v2-tool-lifecycle.spec.ts --project=chromium` passed with 1 browser test.

### Reviewer
- Main-agent matrix scan, focused V2 browser coverage, screenshot evidence, and matrix/ledger updates completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-07-01 Subagent Incremental Stream Browser Coverage

### Scope
- Re-checked the active frontend rewrite goal and selected `SUB-01` because the subagent panel previously had user-visible reports of appearing to wait and then jump straight to final output.
- Added a strict V2 browser scenario inside the existing `v2-subagent-session.spec.ts` shell fixture instead of relying on a component-only assertion.
- The scenario opens the right-side subagent panel from the parent `Subagent started` tool card, verifies the initial persisted checkpoint, then dispatches two mock SSE child `message.text.delta` events before terminal state.
- The browser assertions prove the first delta is visible by itself in the right panel, the second delta appends into the same live row, the parent `.at-chat-view` never receives the child text, no final persisted answer appears before terminal history refill is released, and the live row remains visible while that refill is deliberately delayed.
- Saved screenshot evidence at `.tmp/frontend-v2-ts-subagent-session/v2-subagent-incremental-stream-before-refill.png`.
- Kept production UI source and built dist unchanged in this slice; this closes a missing evidence hole rather than claiming a new product behavior.
- This slice strengthens `SUB-01` and stream/replay evidence. It does not claim complete subagent PASS, real-backend orchestration PASS, broad complex-history replay PASS, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm run test:browser -- v2-subagent-session.spec.ts -g "streams subagent deltas incrementally" --project=chromium` passed with 1 browser test.
- `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium` passed with all 5 browser tests.
- Visual inspection of `.tmp/frontend-v2-ts-subagent-session/v2-subagent-incremental-stream-before-refill.png` confirmed the left parent timeline contains only parent output plus the subagent tool card, while the right panel shows `SUB_STREAM_ALPHA and BETA` before final persisted history is released.

### Reviewer
- Main-agent matrix scan, focused browser stream sampling, screenshot inspection, full subagent browser spec verification, and matrix/ledger updates completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-07-01 Processed Group Browser Measurement Coverage

### Scope
- Re-checked the active frontend rewrite goal and selected `MSG-05` because the processed-work fold was previously reported as confusing divider UI and still lacked browser screenshot plus virtualizer measurement evidence.
- Added a focused V2 browser spec that serves the built frontend, mocks a completed normal session with thinking, a read tool call/result, and a final answer, then verifies the processed work stays folded behind one compact `Processed` control.
- The browser assertions prove the final answer remains visible while thinking/tool work is hidden, the old `.at-processed-group-line` divider DOM is absent, expanding the control reveals the tool card without expanding nested thinking text, and both the processed-row height and virtual timeline height increase after remeasurement.
- Saved screenshot evidence at `.tmp/frontend-v2-ts-processed-group/v2-processed-group-expanded.png`.
- Kept production source, sidebar/settings inventory, broader visual CSS, stream controller behavior, and built dist unchanged in this slice.
- This slice strengthens `MSG-05` evidence. It does not claim complete processed-group PASS, complete historical replay PASS, complex-history screenshot sign-off, reviewer sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm run test:browser -- v2-processed-group.spec.ts --project=chromium` passed with 1 browser test.
- `npm run test:browser -- v2-rounds.spec.ts -g "does not repeat the round prompt title" --project=chromium` was re-run to confirm the current built V2 browser fixture still keeps an expanded round prompt in one body only, without repeating the title in the open summary row.

### Reviewer
- Main-agent matrix scan, focused V2 browser coverage, screenshot evidence, and matrix/ledger updates completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-07-01 Settings Parity Browser Gate And Proxy Semantics

### Scope
- Re-checked the active frontend rewrite goal and Settings rows before editing, then moved from symptom-level fixes to a stricter Settings parity gate.
- Added `frontend/app/browser-tests/v2-settings-parity.spec.ts` as an independent packed-browser test for the Settings shell instead of appending more scenarios to the existing large settings-actions spec.
- The new browser gate opens all 13 V1-aligned Settings first-level entries, verifies System-only pages remain nested under the System secondary page, and screenshots the real packed UI.
- Added browser coverage for Notifications save behavior: rule labels render, hidden channels are preserved visibly, a rule toggle saves through `/system/configs/notifications`, and unhandled Settings routes fail the test.
- Fixed `ProxySettingsSection` so backend `ssl_verify: null` maps to the UI's `Inherit default` option instead of incorrectly showing `Skip verification`.
- Added browser coverage for Proxy probe and save behavior: saved passwords stay preserved, probe payloads carry `ssl_verify: null`, probe feedback renders, and Save calls both proxy save and proxy reload.
- Rebuilt `frontend/dist/app` so the dist-served browser tests exercise the source fix.
- Updated the closure matrix for `SET-01`, `SET-05`, and `SET-11`. This slice does not claim complete Settings PASS, formal V1 visual sign-off, release cleanup sign-off, or V2 frontend completion.

### Verification
- `npm run build` passed, including frontend typecheck, desktop build, and Vite production build.
- `npm run test:browser -- v2-settings-parity.spec.ts --project=chromium` passed with 2 browser tests.
- `npm run lint` passed.
- Inspected `.tmp/frontend-v2-ts-settings-parity/v2-settings-v1-section-survey.png`; it shows the V1-aligned Settings section list and System secondary page entries without flattening.
- Inspected `.tmp/frontend-v2-ts-settings-parity/v2-settings-notification-proxy-actions.png`; it shows Proxy with `Inherit default` selected for saved inherited SSL verification inside the fixed Settings shell.

### Reviewer
- Main-agent source fix, packed browser parity gate, screenshot inspection, frontend build/lint, and matrix/ledger updates completed for this slice. No full Settings subsystem PASS or final V2 completion is claimed.

## 2026-07-01 Settings Model Profile Browser Evidence Closure

### Scope
- Re-checked the frontend rewrite matrix and selected `SET-06 Models` because it was still `Not checked` even though earlier recovery work had implemented the Model settings surface.
- Ran the packed-browser Models scenarios instead of relying on source inspection. The catalog-create scenario initially failed because `Model catalog` matched both the title and the loading status, so the existing evidence was not clean.
- Fixed the browser assertion to use exact title matching and added a missing screenshot checkpoint for the Model profile list before entering a secondary profile editor.
- Confirmed by screenshot inspection that the Model settings entry remains part of the V1-aligned root Settings list, profile rows stay on the primary Model page, existing and created profiles open in second-level detail pages, API key values remain hidden, and catalog selection fills provider/model/base URL/context/output/image capability fields.
- Updated `SET-06` from `Not checked` to `In progress`. This slice does not claim Model settings `Verified`, full Settings completion, formal V1 visual/DOM pairing, credential/keyring failure-state completion, reviewer sign-off, release cleanup sign-off, or final V2 frontend completion.

### Verification
- `npm run test:browser -- v2-settings-actions.spec.ts --project=chromium -g "model profile"` passed with 2 browser tests after the assertion fix.
- Inspected `.tmp/frontend-v2-ts-settings-actions/v2-model-profile-list.png`, `.tmp/frontend-v2-ts-settings-actions/v2-model-profile-detail.png`, `.tmp/frontend-v2-ts-settings-actions/v2-model-profile-catalog-picker.png`, and `.tmp/frontend-v2-ts-settings-actions/v2-model-profile-catalog-create.png`.

### Reviewer
- Main-agent matrix scan, failing browser evidence reproduction, targeted browser assertion fix, added screenshot checkpoint, focused browser verification, screenshot inspection, and matrix/ledger updates completed for this slice. No Settings subsystem PASS or final V2 completion is claimed.

## 2026-07-01 Settings Roles Browser Evidence Closure

### Scope
- Re-checked the frontend rewrite matrix and selected `SET-07 Roles` because it was still `Not checked` even though the Settings page already contained role list/detail/create/delete code paths.
- Strengthened the packed-browser Roles scenario with evidence that the root Settings list remains V1-aligned, the Roles page stays a list-first page, and Reviewer opens in a secondary detail view rather than flattening the form into the top-level Settings page.
- Added screenshot checkpoints for the role list, Reviewer detail top, Reviewer detail lower fields, and clean Analyst saved detail after transient Ant messages disappear.
- Added browser assertions that the Reviewer detail preserves the tools count, MCP server list, and skill list from the backend document while still supporting validate, delete, and create/save workflows.
- Re-ran the Agent Runtime browser scenario because it covers the related Roles behavior for runtime-bound roles: creating a runtime under System, binding a new role to it, previewing a prompt, validating and saving the bound-agent payload, then deleting the role.
- Updated `SET-07` from `Not checked` to `In progress`. This slice does not claim Roles `Verified`, full Settings completion, formal V1 visual/DOM pairing, validation-error coverage, reviewer sign-off, release cleanup sign-off, or final V2 frontend completion.

### Verification
- `npm run test:browser -- v2-settings-actions.spec.ts --project=chromium -g "role configs"` passed with 1 browser test.
- `npm run test:browser -- v2-settings-actions.spec.ts --project=chromium -g "Agent Runtime configs"` passed with 1 browser test.
- `npm test -- src/test/SettingsDrawer.test.tsx -t "role configs|role detail"` passed with 2 focused tests; jsdom emitted the known pseudo-element `getComputedStyle` warning.
- Inspected `.tmp/frontend-v2-ts-settings-actions/v2-roles-list.png`, `.tmp/frontend-v2-ts-settings-actions/v2-roles-reviewer-detail.png`, `.tmp/frontend-v2-ts-settings-actions/v2-roles-reviewer-detail-fields.png`, and `.tmp/frontend-v2-ts-settings-actions/v2-roles-create-save.png`.

### Reviewer
- Main-agent matrix scan, focused browser test strengthening, browser and component verification, screenshot inspection, and matrix/ledger updates completed for this slice. No Settings subsystem PASS or final V2 completion is claimed.

## 2026-07-01 Settings Orchestration Browser Evidence Closure

### Scope
- Re-checked the frontend rewrite matrix and selected `SET-08 Orchestration` because it was still `Not checked` even though the Orchestration settings implementation already had create/default/delete paths.
- Strengthened the packed-browser Orchestration scenario with explicit list evidence for the V1-aligned Settings entry, default preset fact, preset count fact, and list-first Orchestration page before entering a secondary detail page.
- Added detail-page evidence and assertions for the Default preset: the Preset ID field is loaded, the Reviewer role checkbox is actually checked, and the Graph JSON field preserves the `review` node.
- Added lower-detail screenshot evidence for prompt, graph JSON, and policy rows after setting Shipping as default. Screenshot inspection caught a transient Ant success message polluting the first screenshot, so the browser test now waits for `.ant-message-notice` to clear before capturing detail evidence.
- Preserved the existing mutation flow coverage: set Shipping as default, delete Default with confirmation, create Analysis, verify the save payload role IDs, and keep the saved Analysis secondary detail open instead of flattening the form into the list page.
- Updated `SET-08` from `Not checked` to `In progress`. This slice does not claim Orchestration `Verified`, complete Settings parity, formal V1 visual/DOM pairing, runtime composer sign-off, reviewer sign-off, release cleanup sign-off, or final V2 frontend completion.

### Verification
- `npm run test:browser -- v2-settings-actions.spec.ts --project=chromium -g "orchestration presets"` passed with 1 browser test.
- `npm test -- src/test/SettingsDrawer.test.tsx -t "orchestration"` passed with 4 focused component tests; jsdom emitted the known pseudo-element `getComputedStyle` warning.
- `npm run lint` passed.
- Inspected `.tmp/frontend-v2-ts-settings-actions/v2-orchestration-list.png`, `.tmp/frontend-v2-ts-settings-actions/v2-orchestration-default-detail.png`, `.tmp/frontend-v2-ts-settings-actions/v2-orchestration-default-detail-policy.png`, and `.tmp/frontend-v2-ts-settings-actions/v2-orchestration-create-save.png`.

### Reviewer
- Main-agent matrix scan, focused browser test strengthening, browser and component verification, screenshot inspection, and matrix/ledger updates completed for this slice. No Settings subsystem PASS or final V2 completion is claimed.

## 2026-07-01 Settings Web Browser Evidence Closure

### Scope
- Re-checked the frontend rewrite matrix and selected `SET-09 Web` because it was still `Not checked` even though prior Web settings migrations had added source and test coverage.
- Re-ran the packed-browser Web settings scenarios instead of copying old ledger claims. The defaults/language scenario initially failed because the `EN` language button selector also matched the topbar `Backend connected` health button, so the existing evidence was stale.
- Fixed the browser selectors to require exact language-button names for both Chinese and English toggles.
- Re-ran the browser scenarios and inspected the screenshots. The first regenerated error screenshot still hid the inline Web error alert above the viewport while old success toasts were visible, so the browser test now waits for transient messages to clear, scrolls the inline `.ant-alert-error` into view, and asserts it is in the viewport before capturing evidence.
- Confirmed by screenshot inspection that Settings keeps the V1-aligned first-level section list, Web remains a first-level Settings page, saved Exa API keys stay masked, SearXNG fallback controls are visible/restored as expected, built-in instances render, and the error state is durable inside the Web form.
- Updated `SET-09` from `Not checked` to `In progress`. This slice does not claim Web `Verified`, complete Settings parity, formal V1 visual/DOM pairing, provider/search runtime sign-off, reviewer sign-off, release cleanup sign-off, or final V2 frontend completion.

### Verification
- `npm run test:browser -- v2-settings-actions.spec.ts --project=chromium -g "Web settings"` passed with 2 browser tests after the selector and screenshot-evidence fixes.
- `npm test -- src/test/SettingsDrawer.test.tsx -t "Web settings|web settings"` passed with 4 focused component tests; jsdom emitted the known pseudo-element `getComputedStyle` warning.
- `npm run lint` passed.
- Inspected `.tmp/frontend-v2-ts-settings-actions/v2-web-settings-defaults-language.png` and `.tmp/frontend-v2-ts-settings-actions/v2-web-settings-error.png`.

### Reviewer
- Main-agent matrix scan, stale browser failure reproduction, focused browser test fixes, browser and component verification, screenshot inspection, and matrix/ledger updates completed for this slice. No Settings subsystem PASS or final V2 completion is claimed.

## 2026-07-01 Settings ClawHub Browser Evidence Closure

### Scope
- Re-checked the frontend rewrite matrix and selected `SET-10 ClawHub` because it was still `Not checked`. Prior work covered ClawHub component behavior and the Skills ClawHub drawer, but not the actual Settings > ClawHub page in the packed browser.
- Added a focused Settings browser scenario that opens the V1-aligned ClawHub Settings entry, verifies the saved-token facts, masked token field, `autocomplete="new-password"`, and account link, then probes with the saved token through `/api/system/configs/clawhub:probe`.
- The browser scenario now verifies the auto-install probe notice, saves a replacement token through `/api/system/configs/clawhub`, clears the token, shows the required-token probe error without making a second probe call, and saves the null token payload.
- Screenshot inspection caught that the first clear-state screenshot would not prove the required-token error because saving the null token refreshes config and clears the probe notice. Added a separate `v2-clawhub-settings-required.png` checkpoint before the save so the visible error state has direct evidence.
- Updated `SET-10` from `Not checked` to `In progress`. This slice does not claim ClawHub `Verified`, complete Settings parity, formal V1 visual/DOM pairing, Skills market account-status sign-off, reviewer sign-off, release cleanup sign-off, or final V2 frontend completion.

### Verification
- `npm run test:browser -- v2-settings-actions.spec.ts --project=chromium -g "ClawHub settings"` passed with 1 browser test.
- `npm test -- src/test/SettingsDrawer.test.tsx -t "ClawHub"` passed with 3 focused component tests; jsdom emitted the known pseudo-element `getComputedStyle` warning.
- `npm run lint` passed.
- Inspected `.tmp/frontend-v2-ts-settings-actions/v2-clawhub-settings-probe.png`, `.tmp/frontend-v2-ts-settings-actions/v2-clawhub-settings-required.png`, and `.tmp/frontend-v2-ts-settings-actions/v2-clawhub-settings-clear.png`.

### Reviewer
- Main-agent matrix scan, missing Settings-page browser coverage identification, focused browser test addition, browser and component verification, screenshot inspection, and matrix/ledger updates completed for this slice. No Settings subsystem PASS or final V2 completion is claimed.

## 2026-07-01 Settings Remote Workspace Browser Evidence Closure

### Scope
- Re-checked the frontend rewrite matrix and selected `SET-12 Remote workspace` because it was still `Not checked` even though previous slices had migrated SSH profile logic and added create/delete browser scenarios.
- Re-ran the packed-browser Remote workspace scenarios and the full `WorkspaceSettingsSection` component suite rather than relying on old ledger claims.
- Screenshot inspection caught two evidence-quality issues: the create/delete screenshots were polluted by transient success toasts, and the initial full-page editor screenshot made the modal fields hard to read.
- Tightened the browser test to wait for `.ant-message-notice` to clear before the final create/delete screenshots and changed the editor checkpoint to screenshot the `New SSH profile` dialog itself.
- Confirmed by screenshot inspection that Settings keeps the V1-aligned first-level section list, Remote workspace remains a first-level Settings page, the SSH editor exposes the expected connection and credential fields, created profiles render list/detail/auth summaries, and delete confirmation leaves a clean empty state after success.
- Updated `SET-12` from `Not checked` to `In progress`. This slice does not claim Remote workspace `Verified`, complete Settings parity, formal V1 visual/DOM pairing, project-open runtime sign-off, reviewer sign-off, release cleanup sign-off, or final V2 frontend completion.

### Verification
- `npm run test:browser -- v2-settings-actions.spec.ts --project=chromium -g "remote workspace"` passed with 2 browser tests after the screenshot-evidence fixes.
- `npm test -- src/test/WorkspaceSettingsSection.test.tsx` passed with 4 focused component tests; jsdom emitted the known pseudo-element `getComputedStyle` warning.
- `npm test -- src/test/SettingsDrawer.test.tsx -t "remote workspace|Remote workspace"` passed with 1 focused Settings integration test; jsdom emitted the known pseudo-element `getComputedStyle` warning.
- `npm run lint` passed.
- Inspected `.tmp/frontend-v2-ts-settings-actions/v2-remote-workspace-editor.png`, `.tmp/frontend-v2-ts-settings-actions/v2-remote-workspace-create.png`, and `.tmp/frontend-v2-ts-settings-actions/v2-remote-workspace-delete.png`.

### Reviewer
- Main-agent matrix scan, focused browser evidence rerun, screenshot-quality fixes, browser and component verification, screenshot inspection, and matrix/ledger updates completed for this slice. No Settings subsystem PASS or final V2 completion is claimed.

## 2026-07-01 Settings Environment Variables Browser Evidence Closure

### Scope
- Re-checked the frontend rewrite matrix and selected `SET-13 Environment variables` because it was still `Not checked` even though earlier component and browser paths had partial behavior coverage.
- Found that the existing packed browser path exercised environment variable creation/deletion but only captured the final session topology screenshot after closing Settings, so it did not provide direct visual evidence for the Environment variables page itself.
- Strengthened the browser scenario to open the V1-aligned `Environment variables` Settings entry, verify hidden app proxy/system keys stay hidden, expand the System group, and capture a direct list screenshot with app and system records visible.
- Added direct browser evidence for the create dialog, created list state, edit dialog, edited list state, and deleted clean state. The browser path now also asserts edit payload preservation with `source_key: "BROWSER_TS_ENV"` instead of only checking that text appeared.
- During screenshot inspection, the first delete-confirmation screenshot was invalid because Playwright captured only an Ant modal corner. Removed that bad screenshot from the evidence set and kept explicit confirmation title/button assertions in the browser test instead of pretending the image was useful.
- Updated `SET-13` from `Not checked` to `In progress`. This slice does not claim Environment variables `Verified`, complete Settings parity, formal V1 visual/DOM pairing, secret/masking policy sign-off, reviewer sign-off, release cleanup sign-off, or final V2 frontend completion.

### Verification
- `npm run test:browser -- v2-settings-actions.spec.ts --project=chromium -g "environment variables and session topology"` passed with 1 browser test.
- `npm test -- src/test/SettingsDrawer.test.tsx -t "manages app environment variables"` passed with 1 focused component test; jsdom emitted the known pseudo-element `getComputedStyle` warning.
- `npm run lint` passed.
- Inspected `.tmp/frontend-v2-ts-settings-actions/v2-environment-variables-list.png`, `.tmp/frontend-v2-ts-settings-actions/v2-environment-variable-create-dialog.png`, `.tmp/frontend-v2-ts-settings-actions/v2-environment-variable-created.png`, `.tmp/frontend-v2-ts-settings-actions/v2-environment-variable-edit-dialog.png`, `.tmp/frontend-v2-ts-settings-actions/v2-environment-variable-edited.png`, and `.tmp/frontend-v2-ts-settings-actions/v2-environment-variable-deleted.png`.

### Reviewer
- Main-agent matrix scan, focused browser evidence strengthening, failed-selector reproduction, screenshot-quality rejection, browser and component verification, screenshot inspection, and matrix/ledger updates completed for this slice. No Settings subsystem PASS or final V2 completion is claimed.

## 2026-07-01 Settings System Landing Browser Evidence Closure

### Scope
- Re-checked the frontend rewrite matrix and selected `SET-14 System` because it was still `Not checked` after the surrounding Settings entries had moved to `In progress`.
- Confirmed that the current V2 System surface is a landing page for system status and secondary settings pages, not a flat page containing every System-owned control. This preserves the V1-style secondary-page logic the user explicitly called out.
- Strengthened the packed Settings parity browser survey with explicit System assertions: first-level Settings navigation still excludes MCP, Plugins, Commands, Hooks, Agent Runtime, GitHub, and Gateway; the System landing shows `Skills loaded` as enabled; raw skill descriptions are not leaked as landing-page rows; and the secondary launcher order is exactly MCP, Plugins, Commands, Hooks, Agent Runtime, GitHub, Gateway.
- Added direct System landing screenshot evidence at `.tmp/frontend-v2-ts-settings-parity/v2-settings-system-landing.png` instead of relying only on the broader Settings survey screenshot.
- Updated `SET-14` from `Not checked` to `In progress`. This slice does not claim System `Verified`, complete Settings parity, formal V1 visual/DOM pairing, deep MCP/Commands/GitHub/Gateway browser sign-off, reviewer sign-off, release cleanup sign-off, or final V2 frontend completion.

### Verification
- `npm run test:browser -- v2-settings-parity.spec.ts --project=chromium -g "surveys V1 settings sections"` passed with 1 browser test.
- `npm test -- src/test/SettingsNavigationParity.test.ts` passed with 2 focused static navigation tests.
- `npm test -- src/test/SettingsDrawer.test.tsx -t "renders a real settings center"` passed with 1 focused Settings integration test and 39 skipped tests; jsdom emitted the known pseudo-element `getComputedStyle` warning.
- `npm run lint` passed.
- Inspected `.tmp/frontend-v2-ts-settings-parity/v2-settings-system-landing.png`.

### Reviewer
- Main-agent matrix scan, System landing evidence strengthening, browser/component/static verification, screenshot inspection, and matrix/ledger updates completed for this slice. No Settings subsystem PASS or final V2 completion is claimed.

## 2026-07-01 Desktop Packaging Smoke Evidence Closure

### Scope
- Re-checked the frontend rewrite matrix and selected `DESK-01 Desktop packaging` because desktop readiness is a README non-negotiable outcome and the row was still `Not checked`.
- Ran the focused desktop build instead of a full suite: `npm run desktop:build` generated the Electron main/preload target without TypeScript errors.
- Ran the dedicated Electron smoke spec. It covered renderer handoff into `/app/`, isolated preload API exposure, blocked renderer access to `window.require` and `window.process`, backend status propagation, startup-failure diagnostics with copy/retry controls, external-link routing through the preload/main boundary, rejection of `file://` external links, and managed backend startup/auto-quit lifecycle.
- Inspected the generated desktop screenshots. `v2-electron-renderer.png` shows the packaged Electron shell rendering the normal app frame with sidebar, top bar, backend status, timeline content, and composer; `v2-electron-startup-failed.png` shows a readable failure state with diagnostics plus Copy diagnostics and Retry startup controls.
- Inspected the generated logs: `open-external.log` recorded only the allowed `https://example.com/...` URLs, `copy-diagnostics.log` contained the failed backend URL/status, and the managed backend logs showed `scheduled:750`, `fired`, `/api/system/health`, and `/app/`.
- Updated `DESK-01` from `Not checked` to `In progress`. This slice does not claim Desktop packaging `Verified`, installer/distribution readiness, updater/restart parity, formal deep-link coverage, reviewer sign-off, release cleanup sign-off, or final V2 frontend completion.

### Verification
- `npm run desktop:build` passed.
- `npm run test:browser -- v2-desktop-smoke.spec.ts` passed with 4 Electron smoke tests.
- Inspected `.tmp/frontend-v2-desktop/v2-electron-renderer.png` and `.tmp/frontend-v2-desktop/v2-electron-startup-failed.png`.
- Inspected `.tmp/frontend-v2-desktop/open-external.log`, `.tmp/frontend-v2-desktop/copy-diagnostics.log`, `.tmp/frontend-v2-desktop/auto-quit-28598.log`, and `.tmp/frontend-v2-desktop/managed-28598.log`.

### Reviewer
- Main-agent matrix scan, focused desktop build/smoke verification, screenshot inspection, log inspection, and matrix/ledger updates completed for this slice. No Desktop packaging PASS or final V2 completion is claimed.

## 2026-07-01 Subagent Typewriter And Prompt Ordering Closure

### Scope
- Re-checked the frontend rewrite matrix after the user called out that subagent streaming still felt like a jump-cut and that prompt/process information in the right panel was not normal.
- Found that the browser specs serve `frontend/dist`, so source edits must be followed by `npm run build` before screenshot evidence is meaningful. Rebuilt before the final browser pass.
- Slowed the production presentation-layer stream reveal from the previous large-step cadence to smaller 28ms steps. Reducer state still keeps the exact full SSE payload; only the visible text reveal is buffered.
- Strengthened `v2-subagent-session.spec.ts` so it samples six 70ms visible-length checkpoints before the first large child delta finishes revealing. The test now fails if a large chunk jumps from the first characters to the full sentence without intermediate lengths.
- Screenshot inspection of the rebuilt packed app caught that the subagent prompt could appear below streamed output. Replaced the subagent panel body grid/`:has()` positioning with explicit column flex layout and added browser layout metrics proving the prompt is above the timeline.
- Updated `MSG-02` and `SUB-01` evidence. This slice does not claim complete stream/replay PASS, real-backend orchestration PASS, reviewer sign-off, release cleanup sign-off, or final V2 frontend completion.

### Verification
- `npm test -- src/test/ShellLayoutCss.test.ts -t "subagent sessions"` passed.
- `npm test -- src/test/MessageTimeline.test.tsx -t "long open runtime text streams|streaming cursor|subagent stream"` passed with 9 focused tests.
- `npm run build` passed and regenerated `frontend/dist/app`.
- `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium` passed with 5 browser tests.
- `npm run test:browser -- v2-stream-create-run.spec.ts v2-stream-refresh.spec.ts v2-session-switch-stream.spec.ts --project=chromium` passed with 6 browser tests.
- `npm run lint` passed.
- Inspected `.tmp/frontend-v2-ts-subagent-session/v2-subagent-typewriter-mid-reveal.png`; it shows the prompt above the timeline, partial child output only through `SUB_STREAM_ALPHA_3...`, and the loading cursor at the next reveal point while the parent chat remains isolated.

### Reviewer
- Main-agent code inspection, source/dist mismatch correction, focused browser sampling, screenshot inspection, stream regression browser coverage, matrix update, and ledger update completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-07-01 Completed Orchestration Subagent Replay Closure

### Scope
- Re-checked the current matrix after `SUB-01` still called out missing broader orchestration replay evidence.
- Added a packed-browser orchestration replay case to `v2-subagent-session.spec.ts`: the parent session is `session_mode: orchestration`, the visible parent transcript has a coordinator message plus a `spawn_subagent` tool card, and the child is a completed `Crafter` subagent.
- The new browser case first failed because completed subagent panels did not render the prompt; only running/waiting panels did. This matched the user-facing concern that prompt/process information in the right panel could disappear in replay.
- Fixed `SubagentSessionView` so a subagent prompt is shown whenever prompt text is available, not only while the child run is live.
- Added `SubagentSessionView.test.tsx` coverage for completed subagent replay prompts so the behavior is guarded at component level as well as packed-browser level.
- Browser assertions now prove the completed orchestration child prompt sits above the timeline, child output stays out of `.at-chat-view`, raw standalone role labels do not pollute the panel body, and hard refresh restores the same right panel.
- Updated `SUB-01` evidence. This slice does not claim complete subagent PASS, real-backend hard-refresh replay PASS, live orchestration stream PASS, reviewer sign-off, release cleanup sign-off, or final V2 frontend completion.

### Verification
- `npm test -- src/test/SubagentSessionView.test.tsx -t "completed subagent prompt|live subagent prompt|terminal history"` passed with 4 focused tests.
- `npm run build` passed and regenerated `frontend/dist/app`.
- `npm run test:browser -- v2-subagent-session.spec.ts -g "orchestration subagent panel" --project=chromium` passed after the implementation fix.
- `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium` passed with 6 browser tests.
- `npm test -- src/test/SubagentSessionView.test.tsx` passed with 20 tests.
- `npm run lint` passed.
- Inspected `.tmp/frontend-v2-ts-subagent-session/v2-subagent-orchestration-replay-panel.png`; it shows the parent coordinator timeline on the left, the `Crafter` subagent prompt and completed child output in the right panel, and no child final text leaking into the parent chat.

### Reviewer
- Main-agent gap selection, failing browser reproduction, implementation fix, component and browser regression coverage, screenshot inspection, matrix update, and ledger update completed for this slice. No subsystem PASS or final V2 completion is claimed.

## 2026-07-01 Settings Shell CSS TS Migration

### Scope
- Re-checked the closure matrix and remaining old frontend Python UI harness inventory before editing.
- Selected a bounded cleanup slice: five Settings shell CSS assertions in `tests/integration_tests/frontend/test_settings_shell_ui.py` still inspected legacy `frontend/dist` CSS for layout, hover/active tab chrome, footer action ownership, and duplicate divider behavior.
- Migrated the V2-equivalent checks into `ShellLayoutCss.test.ts`: the test now asserts the actual V2 Settings drawer grid, independent Settings nav/content scroll regions, normal hover/active nav feedback, absence of the legacy global `.settings-actions-bar`, and no top divider on `.at-settings-section-body`.
- Removed the corresponding Python static CSS tests and the now-unused `load_components_css` import from `test_settings_shell_ui.py`.
- Kept `CLEAN-01` at `In progress`; this is a cleanup/test-migration slice, not full Settings parity, not full old-harness retirement, and not final V2 completion.

### Verification
- `npm test -- src/test/ShellLayoutCss.test.ts -t "settings navigation"` initially failed because the helper matched the translucent-sidebar override instead of the base Settings nav rule.
- Tightened the helper to match line-start complete selectors, then `npm test -- src/test/ShellLayoutCss.test.ts -t "settings navigation"` passed.
- `npm test -- src/test/ShellLayoutCss.test.ts` passed with 19 tests.
- `uv run --extra dev ruff check tests/integration_tests/frontend/test_settings_shell_ui.py` passed.

### Reviewer
- Main-agent matrix scan, scoped Python-to-TS UI harness migration, failed-test reproduction, helper fix, focused verification, and matrix update completed for this slice. No Settings subsystem PASS, cleanup PASS, reviewer sign-off, or final V2 completion is claimed.

## 2026-07-01 Backend Status UI Harness Migration

### Scope
- Re-checked the remaining Python UI harness inventory and selected `tests/integration_tests/frontend/test_backend_status_ui.py` because it was a self-contained legacy V1/dist UI module test.
- Confirmed the file read `frontend/dist/js/utils/backendStatus.js`, built fake DOM/window objects, and asserted old status-hint/fallback-port behavior that no longer exists in the V2 React app.
- Added V2-native `AppShell.test.tsx` coverage instead of carrying over obsolete implementation details: health failures render `Backend offline` with offline tone, reachable non-ok health payloads render their status text without a fake busy state, and manual topbar refresh returns the shell to `Backend connected`.
- Kept the existing packed-browser pressure test as the real `/app/` evidence that backend health polling remains online while unrelated API requests are stalled.
- Deleted `test_backend_status_ui.py`. This does not claim all frontend Python UI harnesses are migrated.

### Verification
- `npm test -- src/test/AppShell.test.tsx -t "backend status|health failures|non-ok backend"` passed with 3 focused tests.
- `npm run test:browser -- v2-backend-status-pressure.spec.ts --project=chromium` passed with 1 Chromium browser test.

### Reviewer
- Main-agent source mapping, obsolete V1 harness identification, V2 behavior coverage, browser pressure verification, and matrix update completed for this slice. No cleanup PASS, reviewer sign-off, or final V2 completion is claimed.

## 2026-07-01 System Status UI Harness Migration

### Scope
- Re-checked the remaining old Python frontend harness inventory and selected `tests/integration_tests/frontend/test_system_status_ui.py` because it still executed legacy V1/dist `systemStatus.js` and asserted DOM strings that are no longer the V2 React proof path.
- Added V2 MCP editor import support to `McpSettingsSection.tsx`: users can paste either a V1-style `mcpServers` block or the current V2 preview payload, apply it to the editor, normalize legacy transport aliases, split array commands, and preserve hidden config fields such as `cwd` and `read_timeout` on save.
- Added V2-native `SettingsDrawer.test.tsx` coverage for MCP tool loading, delete confirmation, non-app server delete hiding, JSON import aliases, array command import, and hidden config preservation while editing.
- Added `SkillsView.test.tsx` coverage proving duplicate installed skill names stay distinguishable by ref/source labels without leaking raw source identifiers.
- Deleted `test_system_status_ui.py`. This does not claim full System Settings parity, full Skills parity, complete old Python harness retirement, reviewer sign-off, or final V2 frontend completion.

### Verification
- `npm test -- src/test/SettingsDrawer.test.tsx -t "MCP"` passed with 6 focused tests and 39 skipped tests; jsdom emitted the existing pseudo-element `getComputedStyle` warning.
- `npm test -- src/test/SkillsView.test.tsx -t "duplicate installed skill"` passed with 1 focused test and 8 skipped tests.
- `npm test -- src/test/SettingsDrawer.test.tsx` initially exposed an unrelated stale Proxy SSL-default assertion, which was corrected to the current inherit-default behavior; the full file then passed with 45 tests.
- `npm test -- src/test/SkillsView.test.tsx` passed with 9 tests.
- `npm run lint` passed.
- `uv run --extra dev ruff check tests/integration_tests/frontend` passed.
- `git diff --check` passed; Git reported only the existing CRLF normalization warnings for edited files.

### Reviewer
- Main-agent old harness mapping, V2 implementation, focused component verification, matrix update, and ledger update completed for this slice. No cleanup PASS, reviewer sign-off, or final V2 completion is claimed.

## 2026-07-01 Round Todo UI Harness Migration

### Scope
- Re-checked the remaining old Python frontend harness inventory and selected `tests/integration_tests/frontend/test_round_todo_card_ui.py` because it still executed the V1 `frontend/dist/js/components/rounds` floating round navigator in a fake DOM.
- Mapped the old harness assertions to V2 product behavior instead of preserving obsolete V1 implementation details: round order, active/current state, run-id selection, stable rerenders, todo snapshot updates, hover/focus detail behavior, clamped popover placement, and todo status labels.
- Strengthened `RoundRail.test.tsx` with V2-native behavior coverage for those observable user-facing states.
- Deleted `test_round_todo_card_ui.py`. This does not claim full replay PASS, final round/copy placement review, complete old Python harness retirement, reviewer sign-off, or final V2 frontend completion.

### Verification
- `npm test -- src/test/RoundRail.test.tsx` initially exposed that this file needed explicit cleanup once it contained multiple renders; after fixing the test harness cleanup, the file passed with 5 tests.
- `npm run test:browser -- v2-rounds.spec.ts --project=chromium` passed with 5 Chromium browser tests covering round rail retry/todo detail, scoped todo detail, expanded marker no-duplicate prompt, paged round navigation, and verification warning tone.

### Reviewer
- Main-agent V1 harness inspection, V2 behavior mapping, failed-test reproduction, focused component coverage, matrix update, and ledger update completed for this slice. No cleanup PASS, reviewer sign-off, or final V2 completion is claimed.

## 2026-07-01 Settings Shell Harness Retirement

### Scope
- Re-checked the remaining old Python frontend harness inventory and selected `tests/integration_tests/frontend/test_settings_shell_ui.py` because it still executed the V1 `frontend/dist/js/components/settings/index.js` shell in a fake DOM.
- Audited the remaining 17 Python tests before deletion. The user-facing pieces are now covered by V2-native tests instead of the old DOM IDs: Settings first-level order and System secondary page order in `SettingsNavigationParity.test.ts`; real Settings center navigation, General related-page routing, Shell policy save, speech/notification/model/system drill-ins, and outside-click behavior in `SettingsDrawer.test.tsx`; Remote workspace SSH profile behavior in `WorkspaceSettingsSection.test.tsx`; and Settings layout/scroll/nav chrome in `ShellLayoutCss.test.ts`.
- Kept obsolete V1 implementation details out of V2 coverage: the old global `settings-actions-bar`, manually composed hidden tab actions, and `frontend/dist` string snapshots are no longer treated as product behavior.
- Deleted `test_settings_shell_ui.py`. This is a cleanup/test-migration slice only. It does not claim complete Settings PASS, final cleanup PASS, formal V1 visual sign-off, reviewer sign-off, or V2 frontend completion.

### Verification
- `npm test -- src/test/SettingsNavigationParity.test.ts` passed with 2 tests.
- `npm test -- src/test/ShellLayoutCss.test.ts -t "settings navigation"` passed with 1 focused test and 18 skipped tests.
- `npm test -- src/test/SettingsDrawer.test.tsx -t "renders a real settings center|V1 general|general shell|outside"` passed with 3 focused tests and 42 skipped tests; jsdom emitted the existing pseudo-element `getComputedStyle` warning.
- `npm test -- src/test/WorkspaceSettingsSection.test.tsx` passed with 4 tests; jsdom emitted the existing pseudo-element `getComputedStyle` warning.
- `npm run test:browser -- v2-settings-parity.spec.ts --project=chromium` passed with 2 Chromium tests.
- `npm run test:browser -- v2-settings-actions.spec.ts --project=chromium -g "outside drag"` passed with 1 Chromium test.
- `uv run --extra dev ruff check tests/integration_tests/frontend` passed.
- `npm run lint` passed.
- `git diff --check` passed with only the existing CRLF normalization warnings for edited Markdown files.
- Inspected `.tmp/frontend-v2-ts-settings-parity/v2-settings-system-landing.png` and `.tmp/frontend-v2-ts-settings-actions/v2-settings-mask-click.png`.

### Reviewer
- Main-agent old harness mapping, deletion, focused component/static verification, packed-browser verification, screenshot inspection, matrix update, and ledger update completed for this slice. No Settings subsystem PASS, cleanup PASS, reviewer sign-off, or final V2 completion is claimed.

## 2026-07-01 Subagent Stream Timeline Containment Slice

### Scope
- Fixed a runtime ordering gap where a parent `spawn_subagent` tool result could reference a child run before the child run emitted UUID-tagged events. Explicit `subagent_run_id`/`run_id` references now mark those runtime states as subagent scope early, keeping child events out of the main timeline during streaming and replay.
- Removed empty thinking cards from runtime message rendering.
- Kept main-session subagent tool cards compact and openable while suppressing raw subagent prompt/output details in the main timeline. The subagent content belongs in the right-side subagent panel.
- Suppressed exact duplicate subagent prompt rows inside the right-side panel while preserving the prompt header, so prompt text is not shown twice.
- Rebuilt the packaged V2 frontend assets under `frontend/dist/app`.

### Verification
- `npm test -- src/test/runtimeReducers.test.ts` passed with 16 tests.
- `npm test -- src/test/MessageTimeline.test.tsx` passed with 150 tests.
- `npm test -- src/test/SubagentSessionView.test.tsx` passed with 21 tests.
- `npm run lint` passed.
- `npm run build` passed and produced the current `frontend/dist/app` bundle.
- `git diff --check` passed with only the existing CRLF normalization warnings for edited files.
- Actual app observation caught that the browser was initially serving an old bundle before the rebuild. After rebuilding, the app served the updated bundle and the main subagent card for the sampled `ui-subagent-stream-1782892710534` run no longer exposed the raw command/output in the main timeline. The final prompt-dedupe change is covered by tests and build, but the final in-app DOM recheck was blocked by the in-app browser control timing out.

### Reviewer
- Main-agent runtime reducer fix, timeline containment fix, subagent panel duplicate suppression, focused TS coverage, dist rebuild, and partial real-app observation completed for this slice. This does not claim full streaming cadence PASS, full subagent side-panel PASS, complete V1/V2 parity closure, reviewer sign-off, or final V2 frontend completion.

## 2026-07-01 Top-Level Subagent Output Delta Streaming Slice

### Scope
- Reproduced a concrete streaming gap: `message.output.delta` events with top-level `text`/`delta` payloads rendered as separate non-streaming fallback rows instead of joining the live text stream.
- Updated `MessageTimeline` so top-level `output_delta` text uses the same active runtime text accumulator as `text_delta` and structured `output[]` text parts.
- Added App-level browser coverage proving the right-side subagent panel streams top-level child stdout-style output into one live row with a cursor and does not leak that output into the parent chat timeline.
- Rebuilt the packaged V2 frontend assets under `frontend/dist/app`.

### Verification
- The new focused checks failed before the fix: `npm test -- src/test/MessageTimeline.test.tsx -t "top-level output_delta"` showed two `output delta` fallback rows, and `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium -g "top-level subagent output"` found no streaming subagent row.
- After the fix, `npm test -- src/test/MessageTimeline.test.tsx -t "top-level output_delta"` passed.
- `npm test -- src/test/MessageTimeline.test.tsx` passed with 151 tests.
- `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium` passed with 7 Chromium tests.
- `npm run lint` passed.
- `npm run build` passed and produced the current `frontend/dist/app` bundle.
- Inspected `.tmp/frontend-v2-ts-subagent-session/v2-subagent-top-level-output-delta.png`; it shows the main timeline containing only the compact `Subagent started` card while the right panel contains `SUB_STDOUT_1 SUB_STDOUT_2` as live subagent output.

### Reviewer
- Main-agent failure reproduction, streaming accumulator fix, component coverage, App-level browser coverage, screenshot inspection, dist rebuild, and matrix update completed for this slice. This does not claim full real-backend stdout streaming PASS, interrupted mid-stdout refresh recovery, live orchestration PASS, reviewer sign-off, or final V2 frontend completion.

## 2026-07-01 Terminal Typewriter Catch-Up Slice

### Scope
- Audited the remaining mismatch behind "only one or two characters, then the whole sentence appears": terminal runtime cleanup closed the text accumulator, which turned `part.streaming` off and made `MessageText` bypass the typewriter buffer before the visible text had caught up.
- Updated the presentation hook so text that has already been displayed as a live stream keeps revealing after terminal close or delayed history refill, then clears the cursor once the display reaches the exact target text. Persisted replay loaded cold still renders immediately and is not animated.
- Added App-level browser coverage for a subagent child stream that receives a large text delta and then immediately completes before final history is released. The test samples the terminal display mid-catch-up, verifies text length continues increasing instead of jumping to full output, then verifies the cursor is gone at the final settled state.
- Rebuilt the packaged V2 frontend assets under `frontend/dist/app`.

### Verification
- `npm run build` passed and produced the current `frontend/dist/app` bundle.
- `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium -g "terminal close"` passed with the new terminal catch-up scenario.
- `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium` passed with 8 Chromium tests.
- `npm test -- src/test/MessageTimeline.test.tsx` passed with 151 tests.
- `npm run lint` passed.
- Inspected `.tmp/frontend-v2-ts-subagent-session/v2-subagent-terminal-typewriter-catchup-mid.png`; it shows the subagent panel already marked `completed` while the child output is only partially revealed with the cursor at the next character position and no child output in the parent timeline.
- Inspected `.tmp/frontend-v2-ts-subagent-session/v2-subagent-terminal-typewriter-catchup-final.png`; it shows the full child output with no stale cursor.

### Reviewer
- Main-agent implementation audit, display-state fix, App-level browser coverage, screenshot inspection, dist rebuild, matrix update, and focused verification completed for this slice. This does not claim real-backend stdout cadence PASS, hard-refresh during the catch-up window PASS, live orchestration child cadence PASS, reviewer sign-off, or final V2 frontend completion.

## 2026-07-01 Subagent Catch-Up Refresh Recovery Evidence Slice

### Scope
- Closed the specific verification gap left by the previous slice: hard refresh while a terminal subagent output row is still visually catching up.
- Added a packed-browser scenario that streams a large child output into the right subagent panel, completes the child run while final message history is delayed, reloads the app during the catch-up window, receives replayed child events from the restored `/subagents/events` connection, and verifies the typewriter reveal resumes in the restored right panel.
- The scenario also verifies the restored prompt/header context, parent timeline isolation, single child-output row after delayed final history release, and no stale cursor after the replayed terminal state settles.
- No production code change was required for this slice; it converts an explicit unknown in the matrix into browser evidence.

### Verification
- `npm run build` passed and kept the packaged V2 frontend bundle current.
- `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium -g "refresh during terminal catch-up"` passed.
- Inspected `.tmp/frontend-v2-ts-subagent-session/v2-subagent-refresh-catchup-restored-mid.png`; it shows the restored subagent panel with the prompt/header intact, replayed child output partially revealed, cursor at the next character position, and no child output in the parent timeline.
- Inspected `.tmp/frontend-v2-ts-subagent-session/v2-subagent-refresh-catchup-restored-final.png`; it shows delayed final history released, one replayed child-output row, and no stale cursor.

### Reviewer
- Main-agent scenario design, browser coverage, screenshot inspection, matrix update, and ledger update completed for this slice. This does not claim real-backend stdout cadence PASS, live orchestration child cadence PASS, reviewer sign-off, or final V2 frontend completion.

## 2026-07-01 Live Orchestration Subagent Stream Cadence Slice

### Scope
- Closed the packed-browser evidence gap for live orchestration child output. The new scenario uses an orchestration parent session, a `subagent_kind="orchestration"` Crafter child record, and live `/subagents/events` updates instead of reusing the normal subagent path or the completed replay fixture.
- The test verifies typewriter cadence for a large `message.text.delta`, top-level `message.output.delta` tail merging into the same child row, terminal close before final history release, prompt/header retention, body role-label suppression, parent timeline isolation, and no stale cursor after final history settles.
- The first run caught a test-quality issue: the terminal assertion was still pinned to `.is-streaming`, even though terminal rows correctly drop that class after the cursor is gone. The assertion now checks the unique terminal row by run id and content.
- No production code change was required for this slice; it converts the live orchestration child cadence item from unverified to packed-browser evidence.

### Verification
- `npm run build` passed.
- `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium -g "live orchestration subagent"` passed after tightening the terminal assertion.
- Inspected `.tmp/frontend-v2-ts-subagent-session/v2-subagent-orchestration-live-stream-mid.png`; it shows the orchestration composer state, running right-side Crafter panel, child output in the panel, and no child output in the parent timeline.
- Inspected `.tmp/frontend-v2-ts-subagent-session/v2-subagent-orchestration-live-stream-final.png`; it shows the completed right-side panel, final child answer, one child output row, and no stale cursor.

### Reviewer
- Main-agent live orchestration fixture design, failed-test diagnosis, browser coverage, screenshot inspection, matrix update, and ledger update completed for this slice. This does not claim real-backend stdout cadence PASS, real-backend orchestration/SSE cadence PASS, reviewer sign-off, or final V2 frontend completion.
