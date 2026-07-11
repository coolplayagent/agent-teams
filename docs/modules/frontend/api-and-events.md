# Frontend API And Events

## HTTP Boundary

All product data crosses the public `/api/*` boundary through the typed client in `frontend/app/src/api/`. Requests use explicit contracts, abort signals, and React Query invalidation; feature components do not read backend persistence directly.

Important domains include workspaces, sessions, messages, rounds, runs, recovery, roles, settings, skills, automation, connectors, memory, observability, and project files.

## AG-UI Stream Boundary

The runtime client consumes ordered SSE events and normalizes them into typed AG-UI-facing events. Required families include:

- run start, pause, resume, complete, stop, and failure;
- text and output deltas;
- thinking and model-step lifecycle;
- tool call, validation, result, approval, and resolution;
- user-question request and answer;
- injection, state snapshot/delta, todo, and token usage;
- background task, subagent, and notification events.

Every event is keyed by run identity and event identity. Reducers deduplicate replay/live overlap, preserve unknown future events, and keep a bounded cursor history.

## Recovery

Streams resume with the latest durable event cursor. Browser refresh and session switching reconcile the backend snapshot before following live events. Terminal events close the active stream projection; a later resume establishes a new continuation without rebuilding already rendered text.

Approval, question, background-task, and paused-subagent actions are derived from the recovery snapshot and rendered above the composer.
