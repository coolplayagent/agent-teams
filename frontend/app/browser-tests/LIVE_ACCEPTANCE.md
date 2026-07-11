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
