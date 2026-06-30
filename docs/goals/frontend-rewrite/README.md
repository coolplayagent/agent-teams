# Agent Teams Frontend Rewrite Goal

This directory defines the goal, scope, architecture target, parity rules,
subagent workflow, quality gates, and release cleanup requirements for the
Agent Teams frontend rewrite.

The goal is not to create a visual prototype. The goal is to replace the
current hand-maintained HTML/CSS/JavaScript frontend under `frontend/dist`
with a maintainable, componentized, tested, desktop-ready frontend while
preserving the existing product experience.

The rewritten frontend must reach V1 parity or better in:

- visual structure
- feature completeness
- streaming behavior
- replay behavior
- refresh recovery
- interrupted-stream recovery
- desktop readiness
- long-term maintainability

## Core Judgment Standard

The rewrite is successful only when a user can open the new interface and feel
that it is still Agent Teams: the same product shape, the same core workflows,
and the same agent runtime semantics, implemented with a steadier component
system.

The rewrite is not successful if it contains:

- fake controls
- dead buttons
- placeholder pages
- nonfunctional menus
- hidden V1-only workflows
- broken loading, empty, error, disabled, streaming, or terminal states
- a visual style that feels like a different product
- permanent user-facing `V2` naming after the migration period

## Document Map

- [01 Objective And Scope](01-objective-and-scope.md): the concrete goal,
  scope boundaries, and stop conditions.
- [02 Product Parity Checklist](02-product-parity-checklist.md): the complete
  checklist that must be maintained throughout implementation.
- [03 Architecture Target](03-architecture-target.md): the desired frontend,
  backend protocol, and Electron architecture.
- [04 Subagent Workflow](04-subagent-workflow.md): the mandatory builder and
  reviewer subagent process.
- [05 Quality Gates](05-quality-gates.md): subsystem and release-level gates.
- [06 Release And Cleanup](06-release-and-cleanup.md): coexistence, promotion,
  cleanup, documentation, and final removal rules.
- [07 V1 Parity Closure Matrix](07-v1-parity-closure-matrix.md): the working
  closure table used to compare V1 and V2 page by page, state by state, until
  the rewrite can actually end.

## Non-Negotiable Outcomes

1. The new UI must be visually close to V1 or better.
2. Every existing V1 surface must be accounted for in the parity checklist.
3. Every completed checklist item must have implementation and verification
   evidence.
4. Every subsystem must be built by one subagent and reviewed by another
   subagent before it can be marked complete.
5. V2 naming is allowed only as a temporary migration boundary. The final
   product and architecture must use neutral names.
6. The new UI must use AG-UI-facing protocol semantics for its runtime stream
   layer.
7. The desktop target must be Electron with a locally managed backend process.

## Completion Definition

This goal is complete only when:

- all files in this directory have been followed;
- the parity checklist is complete;
- the implementation passes backend, frontend, browser, and desktop checks;
- reviewer subagents have signed off on each subsystem;
- no required V1 workflow remains missing or broken;
- temporary `V2/v2` naming has been removed or explicitly limited to migration
  files that are scheduled for deletion.
