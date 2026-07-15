# Objective And Scope

## Objective

Rewrite the Agent Teams frontend as a modern React and TypeScript application
using Ant Design, Ant Design X, and AG-UI, while preserving the current product
shape and interaction model.

The rewrite must retain the current Agent Teams feel:

- top bar for global actions;
- left sidebar for sessions, projects, and navigation context;
- central workspace for chat, projects, observability, spec lineage, and
  management views;
- message timeline optimized for agent output;
- bottom composer for prompt submission, run controls, runtime injection, and
  execution options;
- recovery surfaces for long-running and interrupted agent work.

The rewritten frontend must support the complex agent runtime behaviors that
make Agent Teams different from a simple chat application:

- live streaming output;
- stream replay;
- refresh recovery while a stream is running;
- interrupted-stream reload and reconnection;
- stop and resume;
- tool approval;
- user-question prompts;
- runtime injection;
- subagent sessions and subagent streams;
- rounds, todos, history, retry, and recovery state.

## User-Facing Goal

A user should be able to switch to the new interface and complete the same work
they currently complete in V1 without needing to understand that a rewrite has
happened.

The new interface may be cleaner, steadier, and more consistent, but it must
not feel like a different product or a simplified demo.

## Technical Goal

The implementation should move the frontend from direct DOM construction and
large hand-maintained JavaScript modules toward:

- componentized React surfaces;
- typed runtime events;
- testable stream reducers;
- centralized API clients;
- explicit state ownership;
- reusable Ant Design-based UI primitives;
- an AG-UI-facing runtime protocol;
- an Electron desktop shell that starts and monitors the local backend.

## In Scope

The rewrite includes:

- application shell, top bar, sidebar, workspace, layout, theme, language, and
  responsive behavior;
- session and project browsing;
- chat timeline, message rendering, streaming, replay, scroll anchoring, and
  virtualized long histories;
- composer, prompt submission, run controls, role/model controls, attachments,
  mentions, and runtime injection queue;
- recovery surfaces for active runs, stopped runs, pending approvals, pending
  user questions, paused subagents, and background tasks;
- AG-UI runtime protocol endpoints, mapping, and tests;
- subagent rail, subagent session streams, subagent run streams, state changes,
  stop/resume behavior, and child task visibility;
- rounds, todos, timeline history, retry state, and navigators;
- settings surfaces for agents, roles, model profiles, plugins, commands,
  environment variables, hooks, notifications, proxy, GitHub, web, speech,
  appearance, and orchestration;
- connectors, memory, gateway, automation, board todos, observability, project
  view, spec lineage, and feedback;
- image preview, HTML/PNG export, voice input, token usage, and context window
  indicators;
- V1/new-interface switching during migration;
- Electron shell, backend launch, health checks, failure display, and shutdown.

## Out Of Scope

The rewrite does not include:

- replacing the core agent execution engine;
- changing the product information architecture without explicit approval;
- deleting V1 features for convenience;
- reducing streaming, replay, or recovery semantics to ordinary chat behavior;
- making the desktop shell responsible for agent runtime business logic;
- using placeholder UI to claim parity before real behavior exists.

## Migration Naming Rule

Temporary directory or route names may use `v2` only to isolate the rewrite
during migration. Inside the product-facing UI and long-lived architecture,
names must be neutral.

Allowed temporary examples:

- migration-only route used for side-by-side validation;
- temporary source directory that will be renamed or promoted;
- documented cleanup task that explicitly removes the temporary name.

Disallowed final-state examples:

- visible labels such as `V2 UI`;
- permanent package names containing `v2`;
- long-lived component names such as `V2Shell`;
- docs that describe the final UI as V2 after V1 is removed.

## Stop And Ask Conditions

Implementation must stop and ask the user when:

- a V1 feature's behavior cannot be inferred from code, tests, docs, or current
  UI behavior;
- a workflow appears removable, simplifiable, or deferrable but the user has
  not explicitly approved that change;
- AG-UI standard events cannot represent a Relay runtime semantic without a
  custom extension;
- Electron backend lifecycle, security, installation, or update behavior
  requires a product decision not covered by this goal;
- reviewer subagents find core visual or functional divergence that would
  require changing the goal rather than fixing the implementation.
