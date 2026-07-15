# Quality Gates

This document defines the gates that must be passed before any subsystem or the
full rewrite can be marked complete.

## Subsystem Gate

Each subsystem must satisfy all of the following.

## Functional Gate

- Every visible control has a real behavior.
- Every menu item is reachable and intentional.
- Every form loads real data or a real empty state.
- Every mutation calls the real API or is explicitly out of scope for that
  subsystem.
- Loading states are visible when async work is pending.
- Empty states explain the absence of data without becoming marketing copy.
- Error states show actionable feedback.
- Disabled states are intentional and explainable.
- Streaming states update as events arrive.
- Terminal states stop showing live activity.

## Visual Gate

- Layout remains recognizably Agent Teams.
- Sidebar, top bar, workspace, timeline, and composer density stay close to V1.
- Ant Design components are themed to fit the existing product rather than
  using a generic default skin.
- No decorative hero sections are introduced inside operational surfaces.
- No unnecessary gradients, oversized cards, or visual filler are added.
- Dark and light modes are both usable.
- Text does not overflow controls.
- Mobile and narrow layouts remain coherent.

## Runtime Gate

- Stream events enter reducer/store logic before rendering.
- Replay is idempotent.
- Duplicate events do not duplicate messages or tools.
- Refresh recovery can rebuild visible state.
- Interrupted streams reconnect from the latest event id.
- Stop, resume, approval, user question, and injection paths update UI state.
- Subagent and background streams do not leak when switching sessions.

## Accessibility Gate

- Buttons have accessible names.
- Icon-only controls have labels or tooltips.
- Forms have labels and error messages.
- Modal and drawer focus behavior is correct.
- Keyboard operation works for primary workflows.
- Color is not the only state indicator.

## Test Gate

Each subsystem needs targeted tests appropriate to its risk:

- reducer tests for stream/runtime logic;
- component tests for interactive UI;
- integration tests for backend protocol changes;
- Playwright tests for end-to-end user workflows;
- Electron smoke tests for desktop lifecycle.

Tests must verify behavior, not just rendering snapshots.

## Reviewer Gate

The reviewer subagent must return PASS before completion.

A PASS requires:

- no missing core V1 behavior in the subsystem;
- no fake interactions;
- no visual breakage that would make the product feel unfinished;
- no critical test gaps;
- no unresolved high-risk edge cases.

If the reviewer returns FAIL, the implementation must be fixed and reviewed
again.

## Full Rewrite Gate

The full rewrite is complete only when all subsystem gates have passed and the
following release-level checks are complete.

## Backend Checks

Required backend coverage:

- AG-UI event model validation;
- Relay RunEvent to AG-UI mapping;
- single run stream;
- multiplex run stream;
- replay with `after_event_id`;
- resume with `Last-Event-ID` when supported;
- stop;
- resume;
- approval resolution;
- user-question answer;
- runtime injection;
- subagent stream events;
- background task events;
- todo updates;
- terminal run events;
- failed run events.

## Frontend Checks

Required frontend coverage:

- stream reducer replay and dedupe;
- message timeline rendering;
- composer state transitions;
- recovery banner and actions;
- approval and user-question forms;
- subagent rail and subagent stream state;
- settings form load/save behavior;
- theme and language behavior;
- export controls;
- route switching between V1 and new UI.

## Browser Checks

Required Playwright flows:

- open V1;
- switch to new UI;
- switch back to V1;
- create a run;
- observe streaming output;
- refresh page while run is streaming;
- reconnect and continue from replay;
- stop a run;
- resume a recoverable run;
- handle tool approval;
- answer user question;
- inspect subagent activity;
- open settings;
- open observability;
- open project view;
- open spec lineage;
- export a message;
- verify mobile/narrow layout.

## Desktop Checks

Required Electron checks:

- main process starts backend;
- app waits for backend health;
- renderer loads new UI;
- startup failure is displayed if backend cannot start;
- backend process is stopped on quit;
- preload API exposes only approved methods;
- renderer has no direct Node process access.

## Final Commands

Before declaring the full rewrite complete, run:

```text
uv run --extra dev ruff check --fix
uv run --extra dev ruff format --no-cache --force-exclude
uv run --extra dev basedpyright
uv run --extra dev pytest -q tests/unit_tests
uv run --extra dev pytest -q tests/integration_tests
```

If frontend package scripts are added, also run the package-level checks:

```text
npm run lint
npm run typecheck
npm run test
npm run build
```

Use the actual package manager chosen by the implementation if it differs from
`npm`.

## Naming Cleanup Gate

Before final promotion:

- search for user-facing `V2`, `v2`, `新版`, and migration-only labels;
- remove final-state `V2/v2` names;
- keep only temporary migration names that are documented for deletion;
- verify package names, route names, component names, docs, and UI labels use
  neutral naming.

Suggested searches:

```text
rg -n "V2|v2|新版|旧版" frontend docs src tests
```

Every remaining match must be either removed or justified as temporary
migration code.
