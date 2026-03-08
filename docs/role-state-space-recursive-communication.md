# Role State-Space and Recursive Communication Design

## 1. Purpose

This document describes how the current `roles`, `agents`, and `coordination` modules implement role-scoped communication based on state-space boundaries and recursive feedback loops.

The design follows these principles:

1. Role is prior to instance: role defines state-space boundaries, instance only executes transitions.
2. Memory belongs to `workspace + role + conversation`, not to instance identity.
3. Communication is modeled as encoded state transitions.
4. Collaboration must define convergence conditions with explicit acceptance and verification signals.
5. Role-scoped workspace and conversation binding provides isolation and traceability.

## 2. Module Responsibilities

### 2.1 `roles` module

- `RoleDefinition` is the stable contract of role identity and role-level capabilities.
- `role_id` is used as the authoritative identity for role-scoped state-space and memory ownership.

Reference:
- `src/agent_teams/roles/models.py`

### 2.2 `agents` module

- `AgentRuntimeRecord` and `SubAgentInstance` are execution carriers.
- They hold runtime bindings (`instance_id`, `workspace_id`, `conversation_id`) and execute state transitions under role boundaries.

Reference:
- `src/agent_teams/agents/models.py`

### 2.3 `coordination` module

`src/agent_teams/coordination/role_communication.py` provides concrete coordination capabilities:

- `RoleStateSpace` and `RoleStateTransition`: role-defined state-space boundary.
- `RoleInstanceExecution` and `execute_role_transition(...)`: instance execution inside role boundary.
- `RoleAgentBinding` and `bind_role_to_agent_instance(...)`: connect `RoleDefinition` with runtime agent records.
- `RoleConversationMemoryScope` and `build_memory_scope_from_binding(...)`: canonical memory scope identity.
- `RoleCommunicationExchange` and `validate_role_communication(...)`: communication as transition payload and boundary validation.
- `validate_exchange_binding(...)`: validate workspace-role-conversation alignment for receiver context.
- `FeedbackLoopSpec`, `FeedbackLoopEvaluation`, `evaluate_feedback_loop(...)`, and `evaluate_feedback_loop_recursively(...)`: convergence evaluation for iterative collaboration.

## 3. Runtime Flow

### Step 1: Role and instance binding

Use `bind_role_to_agent_instance(role_definition, agent_instance)` to build a strict runtime binding.

Contract:
- `agent_instance.role_id` must equal `role_definition.role_id`.

Output:
- `RoleAgentBinding(role_id, instance_id, workspace_id, conversation_id)`.

### Step 2: Derive memory scope

Use `build_memory_scope_from_binding(binding)` to derive role-scoped memory identity.

Output:
- `RoleConversationMemoryScope(workspace_id, role_id, conversation_id)`.

### Step 3: Execute role transition

Use `execute_role_transition(role_state_space, execution)` before applying a transition.

Checks:
- instance role must match role state-space role.
- transition must be inside allowed role transitions.

### Step 4: Validate communication exchange

When one role sends communication to another, represent message as `RoleCommunicationExchange`.

Checks:
- exchange memory role must match receiver role.
- transition must be legal in receiver role state-space.
- receiver binding can be validated with `validate_exchange_binding(...)`.

### Step 5: Recursive feedback convergence

Use `evaluate_feedback_loop(...)` for one iteration and `evaluate_feedback_loop_recursively(...)` for iterative runs.

Convergence condition:
- all acceptance criteria and verification points are observed.

Stop condition:
- convergence reached, or
- iteration reaches `max_iterations`.

## 4. Engineering Constraints

- Keep role boundary checks in coordination layer, not in ad-hoc prompt text.
- Keep imports at module top-level for dependency visibility.
- Keep public coordination interfaces exported from `agent_teams.coordination.__init__`.
- Add unit tests that mirror coordination path in `tests/unit_tests/coordination/`.

## 5. Related Source Files

- `src/agent_teams/coordination/role_communication.py`
- `src/agent_teams/coordination/__init__.py`
- `src/agent_teams/roles/models.py`
- `src/agent_teams/agents/models.py`
- `tests/unit_tests/coordination/test_role_communication.py`
