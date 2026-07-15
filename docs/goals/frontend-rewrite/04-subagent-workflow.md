# Subagent Workflow

The rewrite must be executed with paired subagents for each subsystem.

The purpose is not ceremony. The purpose is to prevent large unreviewed chunks,
visual drift, missing V1 behavior, and fake-complete UI.

## Roles

## Builder Subagent

The builder subagent implements one bounded subsystem.

Responsibilities:

- read the relevant V1 code, docs, and tests;
- implement the assigned subsystem;
- preserve existing behavior;
- add or update tests;
- avoid touching unrelated files;
- avoid reverting other agents' work;
- report changed files;
- report validation commands and results;
- explicitly list incomplete or blocked items.

The builder owns code changes for the subsystem only.

## Reviewer Subagent

The reviewer subagent independently inspects the builder's result.

Responsibilities:

- compare behavior against V1;
- compare visual structure against V1;
- inspect for fake controls, dead buttons, empty pages, and placeholder data;
- inspect loading, empty, error, disabled, streaming, and terminal states;
- inspect accessibility and keyboard behavior;
- inspect responsive layout;
- inspect tests and identify missing coverage;
- return a clear pass/fail decision.

The reviewer should not edit code unless explicitly assigned a separate fixing
task. Review output must be concrete and actionable.

## Main Agent

The main agent coordinates the work.

Responsibilities:

- define subsystem boundaries;
- ensure subagents have disjoint write scopes;
- integrate builder changes;
- evaluate reviewer findings;
- fix or reassign failed items;
- keep the parity checklist current;
- run verification before final completion;
- stop and ask when product intent is unclear.

## Required Subsystem Split

Use this split unless a later implementation plan narrows it further.

1. App shell, layout, theme, navigation.
2. AG-UI backend mapping and stream protocol.
3. Frontend stream runtime and reducers.
4. Message timeline and renderer.
5. Composer and run controls.
6. Recovery, approvals, and user questions.
7. Subagent rail and subagent streams.
8. Rounds, todos, history, and retry.
9. Settings system.
10. Connectors, memory, gateway, automation, and boards.
11. Observability, project view, spec lineage, export, media, and voice.
12. Electron desktop shell.
13. Final parity audit, naming cleanup, and release validation.

## Builder Prompt Template

Every builder prompt must include:

```text
You are implementing one subsystem of the Agent Teams frontend rewrite.

Subsystem:
<name>

Goal:
<specific outcome>

Owned write scope:
<files/directories/modules>

Read-only context to inspect:
<V1 files/docs/tests>

Requirements:
- Preserve V1 behavior for this subsystem.
- Keep visual structure close to V1 or improve stability without changing the
  product feel.
- Do not create fake controls, placeholder pages, or dead interactions.
- Do not revert edits made by other agents.
- Add focused tests for the behavior you implement.
- Use explicit typed contracts where applicable.
- Follow project rules in AGENTS.md.

Deliver:
- changed files;
- behavior implemented;
- tests added or updated;
- commands run and results;
- any unresolved blockers.
```

## Reviewer Prompt Template

Every reviewer prompt must include:

```text
You are reviewing one completed subsystem of the Agent Teams frontend rewrite.

Subsystem:
<name>

Review against:
- V1 behavior;
- V1 visual structure;
- parity checklist;
- project rules;
- tests.

Look for:
- missing V1 features;
- dead buttons or controls;
- fake data or placeholder UI;
- broken loading, empty, error, disabled, streaming, or terminal states;
- visual drift from current Agent Teams;
- accessibility and keyboard issues;
- responsive layout breakage;
- missing tests.

Return:
- PASS or FAIL;
- prioritized findings;
- exact files or UI surfaces involved;
- required fixes;
- residual risks.
```

## Completion Rule

A subsystem is complete only when:

- builder has finished implementation;
- reviewer has returned PASS;
- main agent has inspected the result;
- targeted tests pass;
- the parity checklist row is updated with evidence.

If reviewer returns FAIL, the subsystem returns to implementation.

## Parallelism Rule

Subagents may work in parallel only when their write scopes do not overlap.

Safe parallel examples:

- backend AG-UI mapping and frontend visual shell;
- Electron shell and message reducer tests;
- settings surface and subagent rail.

Unsafe parallel examples:

- two agents editing the same runtime reducer;
- two agents changing the same app shell layout;
- one agent renaming routes while another builds links against old routes.

## Review Evidence

Reviewer output must be preserved in the implementation thread or PR notes.

For each subsystem, record:

- builder agent id or name;
- reviewer agent id or name;
- review date;
- PASS/FAIL result;
- fixes made after review;
- final verification commands.
