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

The live completed-subagent test writes `live-subagent-pressure-metrics.json` to
the Playwright result directory. Its current gates are under 3 seconds for open,
wheel, and reentry interactions, under 5 seconds for switching away and back, no
long task at or above 1 second, less than 128 MiB heap growth when Chromium exposes
heap data, and zero page errors, console errors, or renderer crashes. A mock run
must never be reported as satisfying these live release gates.
