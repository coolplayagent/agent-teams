from __future__ import annotations

from dataclasses import dataclass

from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from agent_teams.core.enums import EventType, RunEventType, ScopeType
from agent_teams.core.models import EventEnvelope, RunEvent, ScopeRef, StateMutation, TaskEnvelope
from agent_teams.runtime.injection_manager import RunInjectionManager
from agent_teams.runtime.run_event_hub import RunEventHub
from agent_teams.tools.models import (
    AssignTaskRequest,
    CreateSubAgentRequest,
    CreateTaskRequest,
    EmitEventRequest,
    ManageStateRequest,
    QueryTaskRequest,
    VerifyTaskRequest,
)
from agent_teams.tools.service import CollaborationTools


@dataclass(frozen=True)
class CollaborationDeps:
    tools: CollaborationTools
    run_id: str
    trace_id: str
    task_id: str
    injection_manager: RunInjectionManager
    run_event_hub: RunEventHub


def build_collaboration_agent(
    *,
    model_name: str,
    base_url: str,
    api_key: str,
    system_prompt: str,
) -> Agent[CollaborationDeps, str]:
    model = OpenAIChatModel(
        model_name,
        provider=OpenAIProvider(base_url=base_url, api_key=api_key),
    )
    agent: Agent[CollaborationDeps, str] = Agent(
        model=model,
        deps_type=CollaborationDeps,
        output_type=str,
        system_prompt=system_prompt,
    )

    @agent.tool
    def create_task(ctx: RunContext[CollaborationDeps], envelope_json: str) -> str:
        _emit_tool_call(ctx, 'create_task')
        envelope = TaskEnvelope.model_validate_json(envelope_json)
        ctx.deps.tools.create_task(CreateTaskRequest(envelope=envelope))
        result = _with_injections(ctx, envelope.task_id)
        _emit_tool_result(ctx, 'create_task')
        return result

    @agent.tool
    def assign_task(ctx: RunContext[CollaborationDeps], task_id: str, instance_id: str) -> str:
        _emit_tool_call(ctx, 'assign_task')
        ctx.deps.tools.assign_task(AssignTaskRequest(task_id=task_id, instance_id=instance_id))
        result = _with_injections(ctx, task_id)
        _emit_tool_result(ctx, 'assign_task')
        return result

    @agent.tool
    def query_task(ctx: RunContext[CollaborationDeps], task_id: str) -> str:
        _emit_tool_call(ctx, 'query_task')
        record = ctx.deps.tools.query_task(QueryTaskRequest(task_id=task_id))
        result = _with_injections(ctx, record.model_dump_json())
        _emit_tool_result(ctx, 'query_task')
        return result

    @agent.tool
    def verify_task(ctx: RunContext[CollaborationDeps], task_id: str) -> str:
        _emit_tool_call(ctx, 'verify_task')
        verify = ctx.deps.tools.verify_task(VerifyTaskRequest(task_id=task_id))
        result = _with_injections(ctx, verify.model_dump_json())
        _emit_tool_result(ctx, 'verify_task')
        return result

    @agent.tool
    def list_tasks(ctx: RunContext[CollaborationDeps]) -> str:
        _emit_tool_call(ctx, 'list_tasks')
        items = ctx.deps.tools.list_tasks()
        payload = '[' + ','.join(item.model_dump_json() for item in items) + ']'
        result = _with_injections(ctx, payload)
        _emit_tool_result(ctx, 'list_tasks')
        return result

    @agent.tool
    def create_subagent(ctx: RunContext[CollaborationDeps], role_id: str) -> str:
        _emit_tool_call(ctx, 'create_subagent')
        instance = ctx.deps.tools.create_subagent(CreateSubAgentRequest(role_id=role_id))
        result = _with_injections(ctx, instance.model_dump_json())
        _emit_tool_result(ctx, 'create_subagent')
        return result

    @agent.tool
    def manage_state(
        ctx: RunContext[CollaborationDeps],
        scope_type: str,
        scope_id: str,
        key: str,
        value_json: str,
    ) -> str:
        _emit_tool_call(ctx, 'manage_state')
        mutation = StateMutation(
            scope=ScopeRef(scope_type=ScopeType(scope_type), scope_id=scope_id),
            key=key,
            value_json=value_json,
        )
        ctx.deps.tools.manage_state(ManageStateRequest(mutation=mutation))
        result = _with_injections(ctx, key)
        _emit_tool_result(ctx, 'manage_state')
        return result

    @agent.tool
    def emit_event(
        ctx: RunContext[CollaborationDeps],
        event_type: str,
        trace_id: str,
        session_id: str,
        task_id: str | None = None,
        instance_id: str | None = None,
        payload_json: str = '{}',
    ) -> str:
        _emit_tool_call(ctx, 'emit_event')
        event = EventEnvelope(
            event_type=EventType(event_type),
            trace_id=trace_id,
            session_id=session_id,
            task_id=task_id,
            instance_id=instance_id,
            payload_json=payload_json,
        )
        ctx.deps.tools.emit_event(EmitEventRequest(event=event))
        result = _with_injections(ctx, event.event_type.value)
        _emit_tool_result(ctx, 'emit_event')
        return result

    return agent


def _with_injections(ctx: RunContext[CollaborationDeps], base_result: str) -> str:
    pending = ctx.deps.injection_manager.drain_at_boundary(ctx.deps.run_id)
    if not pending:
        return base_result

    lines: list[str] = []
    for item in pending:
        lines.append(f'[{item.source.value}] {item.content}')
        ctx.deps.run_event_hub.publish(
            RunEvent(
                run_id=ctx.deps.run_id,
                trace_id=ctx.deps.trace_id,
                task_id=ctx.deps.task_id,
                event_type=RunEventType.INJECTION_APPLIED,
                payload_json=item.model_dump_json(),
            )
        )

    injected_text = '\n'.join(lines)
    return f'{base_result}\n\n[InjectedMessages]\n{injected_text}'


def _emit_tool_call(ctx: RunContext[CollaborationDeps], tool_name: str) -> None:
    ctx.deps.run_event_hub.publish(
        RunEvent(
            run_id=ctx.deps.run_id,
            trace_id=ctx.deps.trace_id,
            task_id=ctx.deps.task_id,
            event_type=RunEventType.TOOL_CALL,
            payload_json=f'{{"tool":"{tool_name}"}}',
        )
    )


def _emit_tool_result(ctx: RunContext[CollaborationDeps], tool_name: str) -> None:
    ctx.deps.run_event_hub.publish(
        RunEvent(
            run_id=ctx.deps.run_id,
            trace_id=ctx.deps.trace_id,
            task_id=ctx.deps.task_id,
            event_type=RunEventType.TOOL_RESULT,
            payload_json=f'{{"tool":"{tool_name}"}}',
        )
    )
