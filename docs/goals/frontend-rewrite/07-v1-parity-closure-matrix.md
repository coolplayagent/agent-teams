# V1 Parity Closure Matrix

This matrix is the working plan for ending the frontend rewrite. It is not a
wishlist. Each row must be checked against V1, implemented in V2, verified in
the browser, and backed by focused tests where behavior can regress.

Status values:

- `Not checked`: V1 behavior has not been captured precisely enough.
- `Gap found`: V1 behavior is known and V2 is missing or wrong.
- `In progress`: implementation or verification is underway.
- `Blocked`: needs backend data, product decision, or missing fixture.
- `Verified`: V1/V2 comparison, tests, and manual browser evidence are done.

No item can become `Verified` only because the screen has visible text. The
verification must check order, duplication, missing content, disabled states,
loading states, error states, terminal states, scroll behavior, and refresh or
session-switch recovery where applicable.

## Closure Order

| Priority | Area | Why It Comes Here | Exit Condition | Status |
| --- | --- | --- | --- | --- |
| P0 | Runtime timeline, streaming, replay, recovery | Broken runtime semantics make every other page review unreliable. | Live stream, replay, hard refresh, interrupted recovery, and session switch recovery render the same run content with no duplicate, missing, or out-of-order rows. | In progress |
| P0 | Shell frame and fixed workspace layout | The app must stop page-level scrolling and keep sidebar/workspace/chat regions stable before detailed polish. | Main viewport is one fixed app page; chat scroll does not drag the sidebar/session list; desktop and narrow screenshots match V1 density or better. | In progress |
| P0 | V1 navigation inventory | Randomly adding or removing entries breaks product parity. | Sidebar and settings entries exactly match V1 unless a difference is documented and approved. | Gap found |
| P1 | Settings pages | Settings are visibly incomplete and easy to compare item by item. | Every V1 settings tab has the same reachable second-level logic, controls, loading/error/disabled states, save behavior, and tests. | Gap found |
| P1 | Composer and run controls | Run creation, stop/resume, modes, roles, model/preset controls, YOLO, Shell, thinking, and injection are core workflows. | Normal and orchestration modes behave like V1 through create, stop, resume, inject, and switch flows. | Not checked |
| P1 | Sessions, projects, and subagents | Session selection and active/background work determine most app navigation. | Project/session/subagent selection, indicators, refresh, and unavailable states match V1. | Not checked |
| P1 | Search, board, connectors, memory, observability | These are primary V1 surfaces, not optional placeholders. | Each surface has a V1 capture, V2 implementation location, browser pass, and focused tests for real actions. | Not checked |
| P2 | Visual polish and density | Once behavior is stable, each page needs V1-quality spacing, typography, and control placement. | Desktop and narrow screenshots are reviewed page by page against V1. | Not checked |
| P2 | Cleanup and naming | The final product cannot feel like a temporary V2 fork. | Temporary V2 names are removed or isolated to migration-only files. | Not checked |

## V1 Inventory And Verification Matrix

| ID | V1 Surface Or Flow | V1 Items To Capture | V2 Implementation Area | Required Evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| SHELL-01 | Top bar | sidebar toggle, title/session label, language, activity/observability, download/export, settings, theme, health/version controls | `features/shell/*`, `styles/theme.css` | V1/V2 screenshots, focus/keyboard check, button count/name comparison | In progress | V2 top bar now restores the backend health/refresh control as a compact `ok/off` chip after theme and before V1, while keeping language, observability, export, settings, and theme visible. Static parity now locks the V1 sidebar inventory and topbar control inventory, AppShell tests verify backend health transitions from checking to `ok`, and browser parity confirms the packed dist shows the topbar `Backend connected` control with text `ok`. Evidence: `.tmp/frontend-v2-ts-shell/v2-topbar-nav-parity.png`, `.tmp/frontend-v2-ts-shell/v2-sidebar-module-parity.png`; tests: `npm test -- src/test/AppShell.test.tsx`, `npm test -- src/test/ShellNavigationParity.test.ts`, `npm run build`, `npm run test:browser -- v2-shell-parity.spec.ts -g "keeps V1 primary sidebar entries" --project=chromium`. Needs formal V1 topbar DOM/screenshot pairing before `Verified`. |
| SHELL-02 | Sidebar primary nav | Chat, automation, skills, boards, search, connectors, memory, observability, settings, workspace/project area | `SessionsSidebar.tsx`, `AppShell.tsx` | DOM/nav list comparison with V1, screenshot, navigation test | In progress | V2 primary sidebar now restores the V1 entry set and order: Chat, Automation, Skills, Board, Search, Connectors, Memory, Observability, Settings. The browser parity test clicks every entry through the sidebar, with topbar Observability/Settings kept as additional shortcuts rather than substitutes. Evidence: `.tmp/frontend-v2-ts-shell/v2-sidebar-module-parity.png`; tests: `npm test -- src/test/AppShell.test.tsx`, `npm test -- src/test/SessionsSidebar.test.tsx`, `npm run test:browser -- v2-shell-parity.spec.ts -g "primary sidebar" --project=chromium`, `npm run build`. Needs formal V1 DOM/screenshot pairing before `Verified`. |
| SHELL-03 | Fixed app layout | fixed viewport, sidebar independent scroll, chat independent scroll, composer pinned | `ChatWorkspace.tsx`, shell CSS | Browser screenshot plus scroll test proving sidebar does not move with chat | In progress | Current live browser split-panel check proves page/body remain viewport-locked, session list does not move with chat scroll, main timeline owns scroll, and composer stays pinned. Evidence: `.tmp/shell-fixed-scroll-final.json`, `.tmp/shell-fixed-scroll-final.png`. Still needs narrow/V1 density sign-off before `Verified`. |
| SESS-01 | Workspace/project selector | project list, active project, reload, project open/close, path display | `WorkspaceProjectView.tsx`, `SessionsSidebar.tsx` | V1/V2 screenshots and click flow | Not checked |  |
| SESS-02 | Session list | search, create, refresh, active highlight, unread/background run indicator, delete/rename if present | `SessionsSidebar.tsx` | Browser flow and component tests | Not checked |  |
| SESS-03 | Session switch during active run | switch away, stream continues or is recoverable, switch back restores exact content | `ChatWorkspace.tsx`, `useRunStreamController.ts`, `MessageTimeline.tsx` | Timed stream sampling before/after switch, no duplicate/missing/order changes | In progress | TS browser mock SSE now proves a background foreground stream stays hidden after switching away, restores ordered text after switching back, and clears the selected session running indicator on terminal; still needs real-backend/real-SSE, orchestration, and tool/thinking-heavy switch cases. |
| MSG-01 | Historical replay | round marker, prompt, processed work, final answer, copy placement | `MessageTimeline.tsx`, `RoundMarker.tsx` | Complex history replay screenshots and DOM row snapshots | In progress | Expanded round markers now use a controlled button/body pair instead of native `details`, so the collapsed title is removed before the full prompt body appears. Real browser checks confirmed the open marker summary only shows `收起`, the prompt prefix appears once in the marker, and the body owns the full text. Split-panel replay now also keeps the round rail from collapsing the virtual timeline column to `0px`. A complex Chinese replay fixture now combines a duplicated user prompt source, round marker, folded processed work, thinking, split tool-call/tool-return, final answer, and hard refresh; DOM counts prove the prompt prefix appears once in the main virtual timeline before and after refresh. Evidence: `.tmp/round-marker-expand-final-dom.json`, `.tmp/round-marker-background-filter-final.png`, `.tmp/round-marker-expanded-final.json`, `.tmp/round-marker-button-dom-final.json`, `.tmp/round-marker-button-final.png`, `.tmp/pending-cursor-roundmarker-final.png`, `.tmp/round-marker-narrow-rail-final.json`, `.tmp/round-marker-narrow-rail-final.png`, `.tmp/frontend-v2-ts-complex-replay/v2-complex-replay-expanded-before-refresh.png`, `.tmp/frontend-v2-ts-complex-replay/v2-complex-replay-expanded-after-refresh.png`. Still needs final divider/copy placement review. |
| MSG-02 | Live text streaming | empty start, first token, long output, terminal close | `reducers.ts`, `streamClient.ts`, `MessageTimeline.tsx` | Timeline samples at 250ms intervals and final replay comparison | In progress | First-token waiting state now renders one compact streaming cursor row instead of a blank transcript; real browser samples at 400ms/800ms/1500ms/3000ms showed one cursor, no internal `run started`/`passed` text, and terminal samples showed zero cursors with final `BETA_1...BETA_5` content. Evidence: `.tmp/live-pending-cursor-final.json`, `.tmp/pending-cursor-roundmarker-final.png`. Still needs hard-refresh replay comparison and complex tool/subagent stream variants. |
| MSG-03 | Thinking/reasoning | start, delta, finish, terminal folded under processed group | `MessageTimeline.tsx` | Live and replay screenshots with opened/closed processed group | In progress | Hydration now trims persisted thinking prefixes out of live/replay overlay deltas before the runtime thinking accumulator renders them, so expanding a folded persisted thinking part plus a continuing stream no longer repeats the prefix. Evidence: `npm test -- src/test/MessageTimeline.test.tsx -t "trims hydrated thinking prefixes"`, `npm test -- src/test/MessageTimeline.test.tsx -t "thinking\|hydrated\|subagent\|stream"`, full `MessageTimeline.test.tsx`, `npm run build`. Still needs end-to-end live/replay screenshots with opened and closed processed groups. |
| MSG-04 | Tool call lifecycle | pending call shows running, result fills same card, validation failure/error, compact collapsed rows | `MessageTimeline.tsx` | Tool-heavy session replay and live tool run; component tests | In progress | Browser coverage now proves persisted tool calls and results split across separate history messages merge into one completed card, with no stale running call row, no spinner, no legacy status dot, collapsed details by default, and result plus call args available only after expansion. Evidence: `npm run test:browser -- v2-tool-lifecycle.spec.ts --project=chromium`, screenshot `.tmp/frontend-v2-ts-tool-lifecycle/v2-tool-lifecycle-merged-card.png`. Full tool call/result lifecycle still needs normal/orchestration real-session browser coverage before `Verified`. |
| MSG-05 | Processed group | terminal work folds under one `已处理` affordance, no decorative divider abuse | `MessageTimeline.tsx`, CSS | Screenshot, click expand/collapse, virtual row measurement test | In progress | Browser coverage now verifies a completed run renders one collapsed `Processed` control without the old `.at-processed-group-line` divider, keeps thinking/tool work hidden while the final answer remains visible, expands on click, and increases both processed-row height and virtual timeline height after remeasurement. Complex replay coverage now also expands `已处理` after a hard refresh and confirms thinking/tool work stays folded under the single processed affordance while the final answer remains outside the group. Evidence: `npm run test:browser -- v2-processed-group.spec.ts --project=chromium`, `npm run test:browser -- v2-complex-replay.spec.ts --project=chromium`, screenshots `.tmp/frontend-v2-ts-processed-group/v2-processed-group-expanded.png`, `.tmp/frontend-v2-ts-complex-replay/v2-complex-replay-expanded-after-refresh.png`. Still needs copy-placement review before `Verified`. |
| MSG-06 | Markdown/media/code | tables, links, code highlight, image previews, long outputs | `MarkdownMessage.tsx`, timeline render parts | Component tests and screenshot fixture | Not checked |  |
| MSG-07 | Scroll behavior | bottom follow, scroll anchor during hydration, virtualizer row measurement | `MessageTimeline.tsx` | Component tests plus browser scroll recording | Not checked |  |
| STREAM-01 | AG-UI event coverage | text, output parts, thinking, model lifecycle, tool, approvals, questions, injection, state, subagent, background, todo, token, terminal events | `events.ts`, `reducers.ts`, `streamClient.ts`, timeline | Unit and integration tests per event family | In progress | Managed background task notifications are now filtered from the visible transcript, including real `message.parts[*].part_kind="user-prompt"` payloads. Browser replay on `session-e4dde0de` confirmed no `A managed background task finished`, `background-task-notification`, or `wait_background_task` text in DOM. Internal lifecycle families still need broader live/reconnect coverage. |
| STREAM-02 | Replay and reconnect | `after_event_id`, Last-Event-ID fallback, duplicate events, network reconnect, terminal settlement | `streamClient.ts`, `useRunStreamController.ts` | Tests and browser interrupted-stream scenario | In progress | Session-switch browser spec now checks ordered switch-back recovery for text deltas; subagent SSE now carries scoped runtime state so UUID child rows do not leak into the parent timeline, and persisted child messages are filtered before round metadata hydrates. Still must prove interrupted reconnect, hard-refresh replay, real-SSE, and orchestration variants with no duplicate/missing/out-of-order rows. |
| REC-01 | Recovery bar | active run, stopped run, resume, local reconciliation | `RecoveryBar.tsx` | Browser refresh during active run and stopped run | In progress | Browser recovery coverage now includes an active-run refresh path that opens from `last_event_id=17`, streams event 18, reloads with event 18 persisted, reconnects from `last_event_id=18`, and proves the persisted event is not duplicated before event 19 arrives. Existing mock and real-SSE coverage also proves standalone stopped-run resume uses the checkpoint and real-SSE active stop suppresses stale reconnect. Evidence: `npm run test:browser -- v2-recovery.spec.ts --project=chromium`, `npm run test:browser -- v2-real-sse-stale-recovery.spec.ts -g "reopens a real SSE stream from the recovery checkpoint after refresh|resumes a real SSE recoverable run from the standalone action|stops a real SSE active run" --project=chromium`, screenshots `.tmp/frontend-v2-ts-recovery/v2-active-recovery-refresh.png`, `.tmp/frontend-v2-ts-stream/v2-real-sse-refresh-recovery.png`, `.tmp/frontend-v2-ts-stream/v2-real-sse-recoverable-resume.png`. Still needs broader manual/V1 comparison before `Verified`. |
| REC-02 | Pending actions | tool approval, user question, background task, paused subagent | `RecoveryBar.tsx`, subagent views | Tests and manual browser flows | In progress | Browser recovery coverage now verifies pending tool approvals and user questions render in the recovery area between the timeline and composer, not as a top run banner or injected timeline rows. It also covers question answer clearing, multi-prompt focus refresh, retryable action errors, stopped-run resume from checkpoint, webfetch host-scoped approval, background task stop/refresh, paused subagent recovery without a standalone resume action, and recovered background subagent stream isolation from the parent timeline. Evidence: `npm run test:browser -- v2-recovery.spec.ts --project=chromium`, screenshots `.tmp/frontend-v2-ts-recovery/v2-recovery-actions.png`, `.tmp/frontend-v2-ts-recovery/v2-paused-subagent-recovery.png`, `.tmp/frontend-v2-ts-recovery/v2-background-subagent-stream.png`. Still needs real-backend/manual action flows before `Verified`. |
| COMP-01 | Composer input | multiline, Enter/Shift+Enter, disabled/busy, attachments, mention menu, voice state | `Composer.tsx`, attachments/mention/voice modules | Component tests and browser flow | Not checked |  |
| COMP-02 | Run options | normal/orchestration mode, role, model, preset, thinking, YOLO, Shell safety | `Composer.tsx`, settings APIs | Browser comparison with V1 and tests | Not checked | Must cover both normal and orchestration modes. |
| COMP-03 | Stop/resume/injection | stop button, queued/interrupt injection, resume run | `Composer.tsx`, `RecoveryBar.tsx` | Browser flow and API assertions | Not checked |  |
| SET-01 | Settings shell | V1 tab list and second-level opening logic | `SettingsCenter.tsx`, `SettingsDrawer.tsx` | V1/V2 tab list comparison and navigation screenshot | Gap found | Do not flatten second-level pages into first level. |
| SET-02 | Appearance | system/light/dark, theme import/copy/select, colors, fonts, sidebar alpha, contrast, cursor, motion, font sizes, diff markers | `SettingsAppearanceSection.tsx` | Implemented controls, screenshot against provided V1 refs | In progress | Already has target screenshots from user. |
| SET-03 | General | Shell safety policy plus V1 General diagnostics/speech/notification inventory mapped to current split-page entries | `SettingsCenter.tsx`, settings CSS/i18n | V1/V2 DOM + screenshots, control count/name/save tests, secondary-entry click checks | Verified | V1 live capture showed Diagnostics, Shell Policy, Speech, and Notifications inside General. V2 keeps only the real General API control on the page, exposes diagnostics/speech/notifications as second-level entries, saves Shell policy through `/system/configs/general`, and does not flatten notification details. Evidence: `.tmp/v1-general-settings.png`, `.tmp/v1-general-dom.json`, `.tmp/v2-general-settings-final.png`, `.tmp/v2-general-dom-final.json`, `.tmp/v2-general-related-clicks.json`. |
| SET-04 | Speech | speech/voice settings and unavailable states | `SpeechSettingsSection.tsx` | V1 comparison and disabled/loading test | Verified | V1 General speech capture showed STT profile, language, and prompt controls with no separate first-level tab. V2 keeps the V1 settings tab list unchanged, exposes Speech as the intended second-level page, preserves STT/language/prompt save behavior, and adds explicit unavailable-profile explanations for non-STT/provider/TTS/no-speech states instead of silently hiding them. Evidence: `.tmp/v1-speech-general.png`, `.tmp/v1-speech-dom.json`, `.tmp/v2-speech-final.png`, `.tmp/v2-speech-dom-final.json`; tests: `npm test -- src/test/SettingsDrawer.test.tsx -t "speech"`, `npm test -- src/test/ShellLayoutCss.test.ts`, `npm run build`. |
| SET-05 | Notifications | notification settings, save/reset/error states | `NotificationSettingsSection.tsx` | V1 comparison and tests | Not checked |  |
| SET-06 | Models | provider/model list, defaults, credentials/keyring states if surfaced | runtime/model settings modules | V1 comparison, API save/load tests | Not checked |  |
| SET-07 | Roles | role list, create/edit/delete, tools/MCP/skills, validation errors | role/settings modules | Browser workflow and tests | Not checked |  |
| SET-08 | Orchestration | orchestration config, normal/orchestrated mode dependencies | `OrchestrationSettingsSection.tsx` | Browser workflow and tests | Not checked |  |
| SET-09 | Web | web/search settings and save states | `WebSettingsSection.tsx` | V1 comparison and tests | Not checked |  |
| SET-10 | ClawHub | account/config/status controls | `ClawHubSettingsSection.tsx` | V1 comparison and tests | Not checked |  |
| SET-11 | Proxy | proxy fields, auth/no-auth, validation, save/test if V1 has it | `ProxySettingsSection.tsx` | V1 comparison and tests | Not checked |  |
| SET-12 | Remote workspace | remote workspace configuration and status | `WorkspaceSettingsSection.tsx` | V1 comparison and tests | Not checked |  |
| SET-13 | Environment variables | env var list, add/edit/delete, masking, validation | `EnvironmentSettingsSection.tsx` | Browser workflow and tests | Not checked |  |
| SET-14 | System | system info, diagnostics, update/restart/export if V1 has them | settings/system modules | V1 comparison and tests | Not checked |  |
| PAGE-01 | Automation | triggers, monitor/follow-up style workflows, session links | `AutomationView.tsx` | V1/V2 screenshot and workflow tests | Not checked |  |
| PAGE-02 | Skills | skill list, install/status/detail flows | `SkillsView.tsx` | V1/V2 screenshot and interaction tests | Not checked |  |
| PAGE-03 | Board | board/todo source groups, statuses, sync, filters | `BoardTodosView.tsx` | V1/V2 screenshot and tests | Not checked |  |
| PAGE-04 | Search | session search, result selection, highlighting, empty/error states | `SessionSearchView.tsx` | Browser workflow and tests | Not checked |  |
| PAGE-05 | Connectors | connector list, runtime tools, enable/status/detail flows | `ConnectorsView.tsx`, `RuntimeToolsSection.tsx` | V1/V2 screenshot and tests | Not checked |  |
| PAGE-06 | Memory | memory facts, sessions, edit/delete if V1 has it | `MemoryView.tsx` | V1/V2 screenshot and tests | Not checked |  |
| PAGE-07 | Observability | metrics, events, trends, lineage panels | `ObservabilityPanel.tsx`, `ObservabilityTrends.tsx`, `SpecLineagePanel.tsx` | V1/V2 screenshot and tests | Not checked |  |
| SUB-01 | Subagent rail/session | subagent list, active/stopped/resumed, parent-child relation | `SubagentSessionView.tsx`, sidebar subagent UI | Complex orchestration history replay and live stream | In progress | Browser coverage now opens subagents from the parent tool card, verifies UUID session-scoped subagent streaming, delayed terminal history refill, send/switch pressure, parent hydration race, hard-refresh restoration, and parent timeline isolation while the right panel streams. It now also samples incremental child text deltas before terminal history refill: the first delta appears alone in the right panel, the second appends into the same live row, the parent chat never receives the child text, and the streamed row survives while final persisted messages are intentionally delayed. The panel suppresses internal subagent/background lifecycle labels, renders live background output as normal text, no longer treats generic tool `run_id`/`role_id` payloads as subagent previews, clamps the resizable side panel to the actual workspace width, restores the active right-side subagent panel after reload, and keeps detached subagent runtime/replay rows out of the main timeline even when role or round metadata is missing or misleading. Subagent terminal state reaches the panel before history refill finishes, preserving already streamed runtime rows until persisted history catches up without leaving the badge/spinner in a running state. Evidence: `.tmp/subagent-clean-live-samples.json`, `.tmp/subagent-clean-final-panel-now.json`, `.tmp/subagent-panel-clean-replay-final.json`, `.tmp/subagent-panel-clean-final.png`, `.tmp/final-browser-dom-check.json`, `.tmp/subagent-panel-width-clamp-final.json`, `.tmp/subagent-panel-width-clamp-final.png`, `.tmp/subagent-main-panel-isolation-final.json`, `.tmp/subagent-main-panel-isolation-final.png`, `.tmp/subagent-terminal-state-first-final.json`, `.tmp/subagent-terminal-state-first-final.png`, `.tmp/frontend-v2-ts-subagent-session/v2-subagent-session-live.png`, `.tmp/frontend-v2-ts-subagent-session/v2-subagent-incremental-stream-before-refill.png`, `.tmp/frontend-v2-ts-subagent-session/v2-subagent-session-completed.png`, `.tmp/frontend-v2-ts-subagent-session/v2-subagent-hard-refresh-restored.png`, `.tmp/frontend-v2-ts-subagent-session/v2-subagent-session-race.png`. Broader orchestration replay still remains. |
| DESK-01 | Desktop packaging | Electron shell, backend process lifecycle, app refresh, deep links if present | desktop target | Desktop run evidence | Not checked |  |
| CLEAN-01 | V2 cleanup | no user-facing V2 naming except migration boundary | all frontend files | grep and screenshot check | Not checked |  |

## Evidence Rules

For every row moved to `Verified`, record:

1. V1 evidence: screenshot path, DOM/state sample, or exact behavior notes.
2. V2 implementation: file path and component/function names.
3. Automated evidence: targeted TypeScript tests or integration tests.
4. Manual evidence: browser screenshot or timed stream sample.
5. Decision: same as V1, intentionally better, or documented product change.

## Verification Ledger

### 2026-07-01 Active Run Recovery Refresh Checkpoint

- `REC-01` tightened: added a browser refresh scenario for an active recovered run, proving V2 reconnects from the recovery snapshot checkpoint, preserves the already persisted streamed event after reload, and continues from the next event without duplicating the persisted row.
- Mock recovery evidence now covers both active-run refresh and stopped-run resume from checkpoint in `v2-recovery.spec.ts`; real-SSE evidence covers active stop without stale reconnect, standalone recoverable resume, and checkpoint refresh recovery.
- Visual inspection confirmed the active refresh state stays inside the fixed shell, shows no extra recovery card when no action is pending, and keeps the composer pinned while the stream is still active.
- Automated evidence: `npm run test:browser -- v2-recovery.spec.ts --project=chromium`, `npm run test:browser -- v2-real-sse-stale-recovery.spec.ts -g "reopens a real SSE stream from the recovery checkpoint after refresh|resumes a real SSE recoverable run from the standalone action|stops a real SSE active run" --project=chromium`.
- Browser evidence: `.tmp/frontend-v2-ts-recovery/v2-active-recovery-refresh.png`, `.tmp/frontend-v2-ts-stream/v2-real-sse-refresh-recovery.png`.

### 2026-07-01 Recovery Pending Actions And Prompt Redundancy

- `REC-02` tightened: pending tool approvals and user questions now have browser assertions that they stay between the timeline and composer and do not show the old `Run ... is awaiting_tool_approval` banner or inject internal question/answer text into the main timeline.
- Recovery edge coverage now includes action retry failures, webfetch approval scoping, stopped-run resume, background task stop, paused subagent recovery without a generic banner/resume button, and recovered background subagent output staying out of the parent timeline.
- `MSG-01` tightened again against the reported expanded-prompt redundancy: the long Chinese prompt fixture now asserts the prompt prefix itself is absent from the expanded summary and appears only once in the marker, not only that the full prompt string is unique.
- Round rail browser coverage is explicitly run at a wide viewport, while the long prompt expansion case remains at the default viewport so rail hiding does not mask main-column prompt behavior.
- Automated evidence: `npm run build`, `npm run test:browser -- v2-recovery.spec.ts --project=chromium`, `npm run test:browser -- v2-rounds.spec.ts --project=chromium`, `npm run test:browser -- v2-complex-replay.spec.ts --project=chromium`.
- Browser evidence: `.tmp/frontend-v2-ts-recovery/v2-recovery-actions.png`, `.tmp/frontend-v2-ts-recovery/v2-paused-subagent-recovery.png`, `.tmp/frontend-v2-ts-rounds/v2-round-marker-expanded-no-duplicate.png`, `.tmp/frontend-v2-ts-complex-replay/v2-complex-replay-expanded-after-refresh.png`.

### 2026-07-01 Complex Replay Prompt And Processed Refresh

- `MSG-01` tightened: expanded long round prompts no longer read as duplicated header/body content. The open marker summary is a compact right-side collapse control, and the full prompt body owns the only main-timeline copy of the prompt.
- `MSG-05` tightened: the same fixture expands processed work after a hard refresh and keeps thinking plus split tool-call/tool-return rows under one `已处理` affordance while the final answer remains outside the group.
- Browser verification used a Chinese light-mode complex replay with a user message, round metadata, thinking, split tool call/result, final answer, expansion, hard refresh, and expansion again. DOM counts target `.at-timeline-virtual` so the right round rail cannot mask a duplicated main timeline row.
- Automated evidence: `npm test -- src/test/ShellLayoutCss.test.ts src/test/RoundMarker.test.tsx`, `npm run build`, `npm run test:browser -- v2-complex-replay.spec.ts --project=chromium`, `npm run test:browser -- v2-rounds.spec.ts -g "does not repeat the round prompt title" --project=chromium`.
- Browser evidence: `.tmp/frontend-v2-ts-complex-replay/v2-complex-replay-expanded-before-refresh.png`, `.tmp/frontend-v2-ts-complex-replay/v2-complex-replay-expanded-after-refresh.png`.

### 2026-07-01 V1 Primary Sidebar Inventory Restore

- `SHELL-02` tightened: the primary sidebar no longer uses the obsolete six-entry set. It now matches the V1 user-facing order: Chat, Automation, Skills, Board, Search, Connectors, Memory, Observability, Settings.
- Sidebar Observability and Settings are real entry points that open the module surface and settings drawer; the existing topbar buttons remain visible as shortcuts and no longer mask sidebar parity.
- Browser verification on `/app/` with built `index-jGtzJpgW.js` clicked every primary sidebar entry and confirmed the real module surfaces opened inside the fixed shell frame.
- Automated evidence: `npm test -- src/test/AppShell.test.tsx`, `npm test -- src/test/SessionsSidebar.test.tsx`, `npm run build`, `npm run test:browser -- v2-shell-parity.spec.ts -g "primary sidebar" --project=chromium`.
- Browser evidence: `.tmp/frontend-v2-ts-shell/v2-sidebar-module-parity.png`.

### 2026-07-01 Subagent Stream, Terminal Refill, And Hard Refresh

- `SUB-01` tightened: the shell persists the active right-side subagent panel and restores it after a hard refresh without replaying the child answer into the parent `.at-chat-view`.
- Subagent terminal hydration now preserves streamed text deltas while a delayed history request still returns an older checkpoint, then lets persisted history take over once the final message arrives.
- `MessageTimeline` keeps this relaxed terminal-hydration rule scoped to subagent runtime state so normal closed-run de-duplication is not widened globally.
- Browser verification on `/app/` with built `index-DrrDQkM0.js` covered live child streaming, terminal refill, hard-refresh restoration, send/switch pressure, and parent hydration race in `v2-subagent-session.spec.ts`.
- Automated evidence: `npm test -- src/test/SubagentSessionView.test.tsx`, `npm test -- src/test/AppShell.test.tsx -t "subagent"`, `npm run build`, `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium`.
- Browser evidence: `.tmp/frontend-v2-ts-subagent-session/v2-subagent-session-live.png`, `.tmp/frontend-v2-ts-subagent-session/v2-subagent-session-completed.png`, `.tmp/frontend-v2-ts-subagent-session/v2-subagent-hard-refresh-restored.png`, `.tmp/frontend-v2-ts-subagent-session/v2-subagent-session-race.png`, `.tmp/frontend-v2-ts-subagent-session/v2-subagent-send-switch-pressure.png`.

### 2026-07-01 Subagent Terminal State Before History Refill

- `SUB-01` tightened: when a subagent stream closes, the panel now stores the terminal runtime state immediately instead of waiting for persisted history to become available.
- Terminal display preserves already streamed runtime rows while history refill is pending, so the panel does not drop visible output or leave a stale running/loading affordance between stream close and message hydration.
- Browser verification on `/app/` with built `index-DpdOgFUl.js` opened a completed subagent from the parent tool card and showed `badge: "completed"`, `spinnerCount: 0`, `waitingTextCount: 0`, and `statusRunningCount: 0`.
- Automated evidence: `npm test -- src/test/SubagentSessionView.test.tsx`, `npm run build`.
- Browser evidence: `.tmp/subagent-terminal-state-first-final.json`, `.tmp/subagent-terminal-state-first-final.png`.

### 2026-07-01 Round Marker Split-Panel Width Guard

- `MSG-01` tightened: the round marker split-panel path no longer depends on a `max(0px, calc(100% - 288px))` rail reservation that can collapse the timeline virtual column to zero.
- `MSG-05`/layout tightened: `.at-timeline-frame` is now an inline-size container; narrow timeline containers hide the round rail and keep the reading column at the normal timeline width instead of relying on viewport-wide media queries.
- Browser verification on `/app/` with built `index-CAmwhJw-.js` and `index-BDLPeTMS.css` showed `virtualWidth: 760`, `buttonWidth: 734`, `railDisplay: "none"`, `summaryText: "收起"`, `titleInSummary: false`, and `prefixCount: 1` after opening the marker.
- Automated evidence: `npm test -- src/test/ShellLayoutCss.test.ts`, `npm test -- src/test/RoundMarker.test.tsx`, `npm run build`.
- Browser evidence: `.tmp/round-marker-narrow-rail-final.json`, `.tmp/round-marker-narrow-rail-final.png`.

### 2026-07-01 Subagent Main Timeline Isolation

- `SUB-01` tightened: main session timelines now reject detached subagent runs before role matching, so a scoped subagent run cannot leak back into the parent merely because an event carries the primary role.
- Replay injection tightened: subagent rounds returned by session history no longer re-enter the main timeline through `mergeTimelineMessages`; explicit selected-run/subagent panel playback remains allowed.
- Replay hydration before round metadata tightened: detached persisted child messages with UUID agent instances or subagent identifiers are filtered from the main timeline even when `/rounds` has not returned parent run IDs yet.
- Browser verification on `/app/` with built `index-CqPIrZoU.js` showed `mainDetachedRows: []` in `.at-chat-view` while the right panel retained the Crafter `subagent_run_*` rows and `SUBOPEN_*` output.
- Automated evidence: `npm test -- src/test/MessageTimeline.test.tsx -t "subagent round messages|scoped subagent runs|subagent orphan|subagent stream rows|UUID subagent"`, `npm test -- src/test/MessageTimeline.test.tsx -t "subagent orphan messages|orphan subagent messages out before round metadata|subagent round messages|selected subagent stream|live subagent stream rows|UUID subagent"`, `npm test -- src/test/MessageTimeline.test.tsx`, `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium`, `npm run build`.
- Browser evidence: `.tmp/subagent-main-panel-isolation-final.json`, `.tmp/subagent-main-panel-isolation-final.png`.

### 2026-07-01 Parent Subagent Tool Card Preservation

- `SUB-01` tightened: parent `spawn_subagent` tool-result cards are no longer removed by the detached-subagent replay filter when their message or run identifiers contain `subagent`.
- This preserves the user-facing "Subagent started" card in the main timeline so clicking it opens the right-side subagent panel, while detached child output remains filtered out of the parent timeline.
- Browser verification on `/app/` with built `index-BW92pzP9.js` passed all four `v2-subagent-session` scenarios: live subagent streaming, terminal history refill, hard-refresh restoration, send/switch pressure, and parent hydration race.
- Automated evidence: `npm test -- src/test/MessageTimeline.test.tsx -t "persisted parent subagent tool cards|opens the subagent panel|opens a running subagent|subagent orphan|UUID subagent|thinking"`, `npm run build`, `npm run test:browser -- v2-subagent-session.spec.ts --project=chromium`.
- Browser evidence: `.tmp/frontend-v2-ts-subagent-session/v2-subagent-session-live.png`, `.tmp/frontend-v2-ts-subagent-session/v2-subagent-session-completed.png`, `.tmp/frontend-v2-ts-subagent-session/v2-subagent-hard-refresh-restored.png`, `.tmp/frontend-v2-ts-subagent-session/v2-subagent-send-switch-pressure.png`, `.tmp/frontend-v2-ts-subagent-session/v2-subagent-session-race.png`.

### 2026-07-01 Subagent Panel Width Clamp

- `SUB-01` tightened: the right subagent panel now derives its maximum width from the live workspace width, preserving a minimum readable main timeline column instead of letting the saved/dragged panel width exceed the actual grid space.
- Browser verification on `/app/` with the built `index-BdhUluEL.js` bundle kept `aria-valuemax`, `aria-valuenow`, CSS `--at-subagent-panel-width`, `grid-template-columns`, and measured panel width aligned at `646px` after an additional grow keypress.
- Automated evidence: `npm test -- src/test/AppShell.test.tsx -t "subagent panel|right-side panel|available workspace width"`, `npm test -- src/test/ShellLayoutCss.test.ts`, `npm run build`.
- Browser evidence: `.tmp/subagent-panel-width-clamp-final.json`, `.tmp/subagent-panel-width-clamp-final.png`.

### 2026-07-01 Round Marker And Subagent Panel Cleanup

- `MSG-01` tightened: long round prompts no longer duplicate the truncated title and full prompt when expanded; the summary becomes a single action button while the body owns the full prompt text.
- `SUB-01` tightened: the right subagent panel filters internal `Subagent status` and `Background task` lifecycle rows, keeps streamed task output visible as output, and preserves completed panel replay without raw `Explorer` role labels.
- `MSG-04` tightened: generic tool results that happen to contain `instance_id`, `run_id`, or `role_id` are not promoted into subagent cards unless they carry explicit subagent reference fields.
- Automated evidence: `npm test -- src/test/RoundMarker.test.tsx`, `npm test -- src/test/MessageTimeline.test.tsx`, `npm run build`.
- Browser evidence: `.tmp/round-marker-button-dom-final.json`, `.tmp/round-marker-button-final.png`, `.tmp/subagent-clean-live-samples.json`, `.tmp/subagent-clean-final-panel-now.json`, `.tmp/subagent-panel-clean-replay-final.json`, `.tmp/subagent-panel-clean-final.png`, `.tmp/final-browser-dom-check.json`.

### 2026-07-01 Live Pending Cursor And Prompt Dedup

- `MSG-02` tightened: open runtime runs with scoped lifecycle entries but no visible output now render a compact empty streaming text row with a typing cursor until the first real text/thinking/tool row arrives.
- `MSG-01` tightened: expanded round markers are covered by a component test that prevents the prompt from appearing in both the summary header and the expanded body.
- Automated evidence: `npm test -- src/test/RoundMarker.test.tsx`, `npm test -- src/test/MessageTimeline.test.tsx -t "pending runtime cursor"`, `npm test -- src/test/MessageTimeline.test.tsx -t "pending cursor for an open scoped run"`, `npm test -- src/test/MessageTimeline.test.tsx`, `npm run build`.
- Browser evidence: `.tmp/live-pending-cursor-final.json`, `.tmp/round-marker-expanded-final.json`, `.tmp/pending-cursor-roundmarker-final.png`.

### 2026-07-01 Timeline Background Notification And Prompt Expansion

- `STREAM-01` tightened: managed background task completion notifications are hidden from the user-visible transcript even when replayed from persisted `message.parts[*].part_kind="user-prompt"` payloads.
- `MSG-01` tightened: round marker prompt expansion is now React-controlled, so the collapsed title cannot remain visible beside the expanded full prompt because of native `details` event ordering.
- Automated evidence: `npm test -- src/test/MessageTimeline.test.tsx -t "managed background task|long round prompts|one-line round prompts"`, `npm test -- src/test/MessageTimeline.test.tsx`, `npm run build`.
- Browser evidence: `.tmp/session-e4dde0de-api.json`, `.tmp/background-notification-filter-final-dom.json`, `.tmp/round-marker-expand-final-dom.json`, `.tmp/round-marker-background-filter-final.png`.

### 2026-06-30 Speech Settings And Expanded Prompt Closure

- `SET-04` moved to `Verified`: compared V1 speech controls inside General against V2 Speech second-level page, kept the settings tab list unchanged, verified STT profile/language/prompt controls, and added unavailable-profile reasons for model profiles that cannot be used for realtime STT.
- `MSG-01` tightened: expanded round markers now rely on native `details` toggling and no longer keep the truncated title in the summary while the full prompt is open.
- Automated evidence: `npm test -- src/test/SettingsDrawer.test.tsx -t "speech"`, `npm test -- src/test/MessageTimeline.test.tsx`, `npm test -- src/test/ShellLayoutCss.test.ts`, `npm run build`.
- Browser evidence: `.tmp/v2-speech-final.png`, `.tmp/v2-speech-dom-final.json`, `.tmp/round-marker-expanded.png`, `.tmp/round-marker-expanded-dom.json`.

## Immediate P0 Batch

The current batch closes these rows first:

| Row | Required Fix | Verification |
| --- | --- | --- |
| MSG-01 | Prompt appears only in the round marker, not duplicated as a user row or expanded summary/body pair. | Added expanded prompt browser fixture, controlled `RoundMarker` coverage, component test coverage, split-panel width guard, and complex Chinese hard-refresh browser replay. DOM counts now prove the prompt prefix appears once in the main virtual timeline before and after refresh. Still needs final copy placement review. |
| MSG-02 | Live stream has no giant blank cursor row and no stray internal `passed` text. | `MessageTimeline.test.tsx` now covers first-token pending cursor, stale runtime suppression, and completed subagent cursor cleanup; browser timing sample from send to terminal showed one cursor before content and none after terminal. Still needs refresh comparison and complex tool/subagent stream variants. |
| MSG-03 | Thinking appears once and folds into `已处理` after terminal state. | `MessageTimeline.test.tsx` now covers hydrated closed-stream thinking folded into processed work and live overlay deltas whose prefix is already persisted; full timeline tests still pass. Still needs live stream, terminal replay, expanded/collapsed browser screenshots. |
| MSG-04 | Tool call and result occupy one lifecycle card: running while pending, filled when done, compact after processed. | `MessageTimeline.test.tsx` covers live tool/approval rows, reconnected tool results, and compact tool previews; `v2-tool-lifecycle.spec.ts` now proves split persisted call/result history renders one completed card in the built V2 shell. Still needs tool-heavy normal and orchestration browser sessions. |
| MSG-05 | `已处理` is a real compact fold control, not divider decoration, and preserves virtualizer measurements. | Unit coverage exercises processed group folding in hydrated thinking/tool flows; `v2-processed-group.spec.ts` proves collapsed/expanded browser behavior, absence of old divider DOM, and virtual height remeasurement. `v2-complex-replay.spec.ts` now adds hard-refresh expansion with thinking/tool work under one processed affordance. Still needs final copy placement review. |
| STREAM-02 | Switching sessions during an active stream and returning restores exact run content by event order. | Browser mock SSE now starts a run, switches sessions, receives a hidden background delta, switches back, compares ordered row text, and settles terminal without a cursor; still needs real-SSE/hard-refresh/orchestration variants. |
| SUB-01 | Right-side subagent panel remains readable and resizable across replay/live panel states. | `AppShell.test.tsx` now clamps panel growth to the measured workspace width; `MessageTimeline.test.tsx` now covers scoped subagent events carrying the primary role and subagent rounds injected from replay. `SubagentSessionView.test.tsx` covers terminal state reaching the panel before history refill finishes while preserving live runtime output, and `v2-subagent-session.spec.ts` now proves two child text deltas appear incrementally in one right-panel row before delayed final history refill, with no parent timeline leakage. Still needs hard-refresh replay and broader orchestration variants. |
