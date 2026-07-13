# Live frontend acceptance

Deterministic browser tests that use `mockShellApi()` are regression coverage only.
Running those tests with the Microsoft Edge executable does not validate a user's
real session, backend data, browser profile, or release deployment.

Run the completed-subagent release acceptance only against a local live deployment:

```powershell
$env:LIVE_BASE_URL = "http://127.0.0.1:8000"
$env:LIVE_SESSION_ID = "session-id"
$env:LIVE_WORKSPACE_ID = "default"
$env:LIVE_SUBAGENT_TITLE = "subagent title"
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
npx playwright test -c playwright.config.ts --project=chromium browser-tests/live-completed-subagent-scroll.spec.ts
```

The test is skipped unless `LIVE_BASE_URL` and `LIVE_SESSION_ID` are supplied. It
does not mock API routes, refuses non-localhost URLs, scrolls both the prompt and
transcript with wheel input, returns to the main session, reopens the subagent,
checks for a page crash, and saves before/after/reopened screenshots.
Each saved screenshot follows two animation frames, a short paint-settle delay, and
a discarded warm-up capture so an Edge compositor transition frame is not treated
as visual acceptance evidence.

## Coverage matrix

| Acceptance | Data source | User actions | Performance evidence | Release meaning |
| --- | --- | --- | --- | --- |
| `subagent-completed-scroll.spec.ts` | Deterministic mocked API | Prompt and transcript wheel scrolling | Geometry and bottom reachability | Regression only |
| `streaming-scale-acceptance.spec.ts` | Deterministic mocked API with 30 sessions, 260 child rows, and 451 main rows | Session switching, subagent open, typing, scrolling, hidden-session stream updates | Interaction/event-to-paint timing, rendered row bounds, EventSource count | Regression and scale guard only |
| `real-backend-live-stream.spec.ts` and `managed-backend-live-stream.spec.ts` | Real or managed local backend with SSE | Start runs, switch sessions, open subagents, recover streams | Stream state and connection lifecycle assertions | Integration coverage; use the real-backend variant for release evidence |
| `live-completed-subagent-scroll.spec.ts` | Existing localhost deployment and real persisted session | Expand processed tools, open subagent, wheel both regions, back, switch session, return, and reenter | Long tasks, interaction latency, JS heap growth, page/console errors, renderer crash | Required live user-path acceptance when its environment variables are supplied |
| `live-orchestration-subagent-path.spec.ts` | Existing active localhost orchestration run with multiple real children and reused task history | Open a running child, wheel both regions, back, switch session, return, reenter, wait for terminal, reload replay | Responsiveness heartbeat, long tasks, interaction latency, EventSource count, cross-task/output containment, page/console errors, renderer crash | Required live orchestration acceptance; terminal-only or mock fixtures fail the gate |

The live completed-subagent test warms the lazy-loaded panel before measurement,
writes `live-subagent-pressure-metrics.json`, then repeats switch/open/back five
times. Its gates are under 500 ms for wheel interactions, under 750 ms for back,
under 1.5 seconds for open, reentry, and session switching, no long task at or
above 300 ms, under 2 seconds cumulative long-task time, and less than 32 MiB heap
growth between post-GC samples. It records both long-task count and per-action
segments. Each segment also samples one reused CDP Performance session and records
Task, Script, Layout, and RecalcStyle duration deltas so a failed budget can be
attributed without a separate profiling run. It also requires zero unexpected
HTTP/console failures, page errors, renderer crashes, or leaked EventSource
subscriptions. A mock run must never be reported as satisfying these live release
gates.

## Live orchestration child path

The orchestration panel regression must be accepted against an already-running
localhost orchestration session whose parent run has at least two child agents.
This spec deliberately installs no `page.route()` handlers and does not create a
synthetic SSE stream. Mocked API, mocked EventSource, DOM-only, and static replay
tests do not satisfy this gate.

Start the test while the selected child and its parent run are still non-terminal:

```powershell
$env:LIVE_BASE_URL = "http://127.0.0.1:8000"
$env:LIVE_SESSION_ID = "session-id"
$env:LIVE_WORKSPACE_ID = "default"
$env:LIVE_SUBAGENT_TITLE = "Crafter"
# Set these when a title is reused or a specific task must be selected.
$env:LIVE_SUBAGENT_INSTANCE_ID = "instance-id"
$env:LIVE_SUBAGENT_TASK_ID = "task-id"
$env:LIVE_TERMINAL_TIMEOUT_MS = "600000"
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
npx playwright test -c playwright.config.ts --project=chromium browser-tests/live-orchestration-subagent-path.spec.ts
```

The live spec verifies that the selected card exposes its real parent `run_id`,
`instance_id`, and `task_id`; another orchestration child exists under the same
parent run; the selected instance has persisted history for another task; and the
selected child is opened while both the parent and child are non-terminal. It
uses real wheel input on the prompt and transcript, returns to
the main session, switches to a different session and back, reopens the child,
waits for the real run to finish, reloads persisted state, and repeats the child
replay.

At terminal state it derives unique evidence directly from the selected and
sibling agents' real persisted messages. The selected child tool/stdout marker
must appear in that child panel but never in the main timeline, and a sibling
marker or another task from the same instance must never appear in the selected
panel. The panel's real agent-message requests must also remain scoped to the
selected `instance_id`. The test also fails on a renderer
crash, a two-second responsiveness timeout, page or console errors, failed HTTP
responses, leaked EventSource subscriptions, a 300 ms long task, or interaction
budgets above 500-1500 ms. It writes
`live-orchestration-subagent-path-metrics.json` and stable running/terminal
screenshots as release evidence. If the configured session is already terminal,
the test fails fixture preflight instead of pretending that replay covered the
streaming interaction.
