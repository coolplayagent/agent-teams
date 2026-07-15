# Product Parity Checklist

This checklist is the source of truth for determining whether the rewritten
frontend has reached V1 parity or better.

Every checklist item must include:

- V1 location or entry point;
- current V1 behavior;
- new frontend implementation location;
- tests or manual verification evidence;
- builder subagent owner;
- reviewer subagent result;
- final main-agent decision.

No item may be marked complete with:

- placeholder UI;
- fake data;
- disabled controls without a real reason;
- "later" notes;
- hidden V1-only behavior;
- untested stream or recovery paths.

## 1. Application Shell

The new frontend must preserve the current high-level structure and density.

Required items:

- top bar layout and global controls;
- sidebar toggle;
- sidebar resizing;
- workspace title display;
- language toggle;
- theme toggle;
- settings entry;
- observability entry;
- message export entry;
- current session indicator;
- backend health indicator;
- loading shell before app hydration;
- responsive behavior for narrow screens;
- keyboard focus behavior for primary controls.

Completion evidence:

- desktop and narrow viewport screenshots;
- interaction test for sidebar toggle and resize;
- theme and language state verification;
- reviewer visual comparison against V1.

## 2. Sessions And Projects

Required items:

- project list;
- session list;
- session selection;
- active session highlighting;
- active run status display;
- background run indication;
- session refresh after run creation and terminal events;
- unavailable session handling;
- project view open/close;
- project reload;
- navigation back behavior;
- refresh recovery after page reload.

Completion evidence:

- tests for selecting sessions and projects;
- Playwright flow covering session switch during active stream;
- reviewer confirmation that sidebar behavior matches or improves V1.

## 3. Message Timeline

Required items:

- historical message hydration;
- live text deltas;
- output parts;
- reasoning/thinking start, delta, and finish;
- tool call rendering;
- tool result rendering;
- tool validation failure rendering;
- tool approval requested/resolved rendering;
- media reference rendering;
- markdown rendering;
- code highlighting;
- copy last answer;
- message export compatibility;
- timeline virtual scrolling;
- scroll-to-bottom behavior;
- scroll anchor preservation during replay and hydration;
- duplicate event suppression;
- terminal stream finalization.

Completion evidence:

- reducer tests for timeline actions;
- component tests for each message part type;
- Playwright stream and replay scenario;
- reviewer screenshot inspection for long messages and tool-heavy runs.

## 4. Composer And Run Controls

Required items:

- prompt input with multiline behavior;
- Enter to send and Shift+Enter newline;
- send button state;
- stop button state;
- resume run button state;
- YOLO toggle;
- shell safety policy control if present in V1 surface;
- thinking mode toggle and effort selector;
- normal/orchestrated mode controls;
- role selector;
- model selector;
- preset selector;
- prompt attachments;
- mention menu;
- voice input button and disabled/available states;
- runtime injection queue;
- queued injection submission;
- interrupt injection submission;
- disabled and busy states during run creation.

Completion evidence:

- tests for prompt submission and disabled states;
- tests for runtime injection queue behavior;
- Playwright flow for create, stop, resume, and inject;
- reviewer confirmation that controls are real and reachable.

## 5. Run Recovery

Required items:

- active run snapshot display;
- recoverable stopped run display;
- resume recoverable run;
- stopped run local reconciliation;
- pending tool approval list;
- approval options and default approve/deny controls;
- approval busy/error states;
- pending user question display;
- single-choice and multiple-choice answers;
- supplemental answer input;
- user question busy/error states;
- paused subagent display;
- background task display;
- background task collapse/expand;
- background task stop action;
- continuity refresh scheduling;
- refresh while stream is active.

Completion evidence:

- backend tests for recovery snapshot and run state mapping;
- frontend tests for approvals and user questions;
- Playwright refresh-recovery scenario;
- reviewer confirmation that no recovery action is a placeholder.

## 6. AG-UI Runtime Stream

Required items:

- create run through AG-UI-facing endpoint;
- stream single run;
- stream multiplexed runs;
- replay with `after_event_id`;
- resume with `Last-Event-ID` when available;
- event dedupe;
- terminal lifecycle handling;
- run failed handling;
- run stopped handling;
- network error reconnect behavior;
- unavailable run/session cooldown behavior where still needed;
- active stream count state;
- background stream discovery or equivalent AG-UI continuation model.

Required event coverage:

- text;
- output parts;
- reasoning;
- model step lifecycle;
- tool call;
- tool result;
- tool validation failure;
- tool approval;
- user question;
- injection;
- state snapshot;
- state delta;
- subagent status;
- background task;
- todo update;
- token usage;
- notification;
- run started/resumed/completed/stopped/failed.

Completion evidence:

- unit tests for Relay RunEvent to AG-UI mapping;
- integration tests for live and replay streams;
- test proving duplicate events are ignored;
- reviewer check of interrupted stream recovery.

## 7. Subagents

Required items:

- normal mode subagent rail;
- subagent session snapshot;
- subagent session stream;
- subagent run stream;
- subagent active state;
- subagent terminal state;
- subagent stopped state;
- subagent resumed state;
- subagent gate display;
- subagent-specific tool and message rendering;
- parent/child session relationship display;
- subagent stream cleanup on session switch;
- subagent refresh after terminal events.

Completion evidence:

- integration tests for subagent streams;
- component tests for rail states;
- Playwright scenario for selecting and observing a subagent;
- reviewer comparison against V1 subagent behavior.

## 8. Rounds, Todos, History, And Retry

Required items:

- rounds list;
- round detail;
- round navigator;
- round timeline;
- round history;
- todo visibility sync;
- todo update event handling;
- retry status display;
- retry detail display;
- paging behavior;
- scroll preservation;
- terminal round state;
- recovery overlay state.

Completion evidence:

- tests for round/todo projections in UI state;
- Playwright navigation through rounds;
- reviewer inspection of dense round history layouts.

## 9. Settings

Required settings surfaces:

- agent registry;
- agents;
- roles;
- workspace settings;
- web settings;
- trigger settings;
- system status;
- speech settings;
- proxy settings;
- plugin settings;
- orchestration settings;
- notification settings;
- model profiles;
- hooks settings;
- GitHub settings;
- environment variables;
- commands settings;
- Clawhub settings;
- appearance settings.

Completion rules:

- every form must load real data;
- every save action must call the real API;
- validation errors must be visible;
- loading and empty states must be explicit;
- destructive or high-impact actions must preserve V1 confirmation behavior.

Completion evidence:

- component tests for representative settings forms;
- API mutation tests where backend changes are introduced;
- reviewer pass over all settings tabs.

## 10. Connectors, Memory, Gateway, Automation, Boards

Required items:

- connector cards and status;
- connector actions;
- memory view;
- gateway account/status surfaces;
- automation project/session surfaces;
- trigger surfaces;
- board todo display;
- todo source settings;
- todo handoff interactions;
- refresh and error states for each module.

Completion evidence:

- smoke tests for each module entry;
- reviewer check for no blank management pages;
- manual or automated verification that actions call real endpoints.

## 11. Observability, Project View, Spec Lineage, Feedback

Required items:

- observability global/session scope;
- observability overview;
- observability trends and breakdowns;
- project view content;
- project reload and close;
- spec lineage timeline;
- spec lineage diff viewer;
- feedback controls;
- runtime diagnostics where present in V1.

Completion evidence:

- Playwright flow for opening and closing each surface;
- reviewer screenshot inspection;
- tests for scope switching and reload actions.

## 12. Resource And Assistive Features

Required items:

- image preview;
- message export as HTML;
- message export as PNG;
- voice input button and availability state;
- token usage indicator;
- context indicator;
- notifications;
- diagnostics display;
- backend status display.

Completion evidence:

- export tests or browser smoke verification;
- screenshot for image preview;
- reviewer check for availability and disabled states.

## 13. Desktop

Required items:

- Electron main process;
- local backend process start;
- backend health polling;
- renderer loading new frontend;
- startup failure view;
- backend shutdown on app quit;
- minimal preload API;
- no renderer Node access;
- open external links through main/preload boundary;
- app version display where needed.

Completion evidence:

- Electron smoke test;
- reviewer check of desktop startup/failure behavior;
- security check for preload API scope.

## Completion Matrix

Each checklist row should move through these states:

1. Not started.
2. Builder in progress.
3. Builder complete.
4. Reviewer failed.
5. Fix in progress.
6. Reviewer passed.
7. Main-agent verified.
8. Complete.

Only state 8 counts as complete.
