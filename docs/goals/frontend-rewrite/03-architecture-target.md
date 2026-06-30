# Architecture Target

The rewrite should produce a stable web application architecture that can serve
both browser and Electron desktop targets without duplicating product logic.

## Frontend Architecture

The new frontend should be isolated during migration, but long-lived names must
be neutral.

Recommended migration layout:

```text
frontend/
  app/
    package.json
    vite.config.ts
    tsconfig.json
    src/
      main.tsx
      app/
      routes/
      api/
      runtime/
      features/
      components/
      styles/
      desktop/
```

If an intermediate `v2` path is used to avoid conflict with V1, it must be
documented as temporary and removed or renamed before final promotion.

## Frontend Stack

Required stack:

- React;
- TypeScript;
- Vite;
- Ant Design v5;
- Ant Design X;
- TanStack Query;
- TanStack Virtual;
- a small local state store for active UI/runtime state;
- Playwright for browser verification.

Ant Design should provide:

- shell layout;
- menus;
- forms;
- tables;
- drawers;
- modals;
- tabs;
- segmented controls;
- notifications;
- theme tokens;
- empty/loading/error surfaces.

Ant Design X should provide or inform:

- conversation surfaces;
- streaming message affordances;
- markdown rendering patterns;
- agent-facing message controls.

Custom components are still required for Relay-specific runtime concepts:

- tool approval cards;
- user-question prompts;
- runtime injection queue;
- subagent rail;
- background tasks;
- rounds and todos;
- recovery overlays;
- spec lineage diff;
- observability charts and summaries.

## Frontend State Ownership

The frontend must separate state by responsibility.

Server snapshot state:

- fetched through centralized API clients;
- cached with TanStack Query;
- invalidated by explicit mutations and stream events.

Runtime stream state:

- owned by a typed stream runtime module;
- updated only through event reducers;
- stores active streams, last event ids, dedupe keys, stream statuses, and
  terminal states.

UI-only state:

- panel open/closed state;
- current tab;
- drafts;
- scroll anchors;
- local filters;
- sidebar width.

Rules:

- components must not open EventSource connections directly;
- components must not parse Relay events directly;
- components must not mutate message DOM directly;
- API calls must go through the API client layer;
- stream events must enter reducer/store first and render second.

## Frontend Runtime Modules

The runtime layer should include:

- AG-UI client;
- SSE transport;
- event parser;
- replay/resume coordinator;
- multiplex stream coordinator;
- dedupe manager;
- stream reducer;
- message/timeline reducer;
- recovery state reducer;
- activity reducer for tools, approvals, user questions, background tasks, and
  subagents.

The reducers must be testable without a browser.

## Backend AG-UI Architecture

The backend should add an AG-UI-facing interface layer without breaking V1.

V1 compatibility:

- existing `/api/runs/*` routes remain available;
- existing `/api/sessions/*` routes remain available;
- existing frontend assets continue to work during migration.

New interface:

- AG-UI-facing run creation;
- AG-UI-facing run event stream;
- AG-UI-facing multiplex stream;
- AG-UI-facing thread/session snapshot;
- AG-UI-facing stop, resume, input, approval, and user-question actions.

The mapping layer should translate Relay runtime concepts into stable AG-UI
events and state objects.

Required mapping coverage:

- text deltas;
- output parts;
- reasoning/thinking lifecycle;
- model step lifecycle;
- tool call lifecycle;
- tool result lifecycle;
- tool validation failure;
- tool approval requested and resolved;
- user question requested and answered;
- injection enqueued and applied;
- run started, resumed, completed, stopped, and failed;
- subagent session status;
- subagent stopped and resumed;
- background task started, updated, completed, and stopped;
- todo updated;
- token usage;
- notification requested;
- recovery state snapshots and deltas.

## Backend Type Rules

Project rules still apply:

- use Pydantic v2 models;
- use explicit enums where event names are bounded;
- use `pydantic.JsonValue` for arbitrary JSON payload fields;
- do not use `typing.Any`;
- do not use dataclasses;
- do not use loose `{}` structures for public contracts;
- expose public package APIs through package-level `__init__.py` where needed.

## Event Semantics

The AG-UI layer must preserve Relay semantics.

Replay:

- client can resume from an event id;
- replayed events must retain order;
- duplicate events must be safe;
- terminal events stop live follow-up for that run unless a later resume creates
  a new continuation.

Refresh recovery:

- client can load a snapshot for the active session/thread;
- snapshot includes enough data to rebuild visible UI state;
- client can reconnect streams after refresh without losing output.

Interrupted stream:

- client tracks last seen event id;
- client reconnects with last seen event id;
- client dedupes events that were replayed and received live.

Subagents:

- parent run and subagent run identities remain distinguishable;
- subagent activity can render in the main timeline and in subagent-specific
  surfaces;
- terminal subagent events update the parent session surfaces.

## Electron Architecture

Electron should wrap the same web frontend.

Main process responsibilities:

- select or receive a local port;
- start the local Relay Teams backend;
- poll backend health;
- load the new frontend URL;
- display startup failure state if backend cannot start;
- stop the backend process on app quit;
- open external URLs safely.

Renderer responsibilities:

- render the web frontend;
- call backend HTTP/SSE APIs;
- call only minimal preload APIs for desktop-specific behavior.

Preload responsibilities:

- expose app version;
- expose backend status read events if needed;
- expose open-external action;
- optionally expose log path helpers;
- avoid broad filesystem, process, or shell access.

Security rules:

- renderer Node access disabled;
- context isolation enabled;
- no direct process management from renderer;
- no secret exposure through preload;
- no local file access unless a later goal explicitly designs it.
