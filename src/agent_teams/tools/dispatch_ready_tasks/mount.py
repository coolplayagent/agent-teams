from __future__ import annotations

import json

from pydantic_ai import Agent

from agent_teams.core.enums import InstanceStatus, TaskStatus
from agent_teams.core.models import TaskRecord
from agent_teams.tools.runtime import ToolDeps
from agent_teams.tools.tool_helpers import execute_tool
from agent_teams.workflow.runtime_graph import load_graph

STAGE_ROLE = {
    'spec': 'spec_builder',
    'design': 'design_builder',
    'code': 'coder',
    'verify': 'verify',
}


def mount(agent: Agent[ToolDeps, str]) -> None:
    @agent.tool
    def dispatch_ready_tasks(ctx, workflow_id: str, max_dispatch: int = 4) -> str:
        def _action() -> str:
            graph = load_graph(ctx.deps.shared_store, task_id=ctx.deps.task_id)
            if graph is None:
                raise KeyError('workflow_graph not found, call create_workflow_graph first')
            if graph.get('workflow_id') != workflow_id:
                raise ValueError(f'workflow_id mismatch: expected {graph.get("workflow_id")}, got {workflow_id}')

            records = {record.envelope.task_id: record for record in ctx.deps.task_repo.list_by_trace(ctx.deps.trace_id)}
            stages = graph.get('stages', {})
            if not isinstance(stages, dict):
                raise ValueError('invalid workflow graph stages')

            bounded_dispatch = max(1, min(int(max_dispatch), 8))

            dispatched: list[dict[str, str]] = []
            executed: list[dict[str, str]] = []
            failed: list[dict[str, str]] = []

            def _refresh_records() -> dict[str, TaskRecord]:
                return {record.envelope.task_id: record for record in ctx.deps.task_repo.list_by_trace(ctx.deps.trace_id)}

            def _ensure_and_execute(task_id: str, stage: str) -> bool:
                nonlocal records
                if len(dispatched) >= bounded_dispatch:
                    return False
                record = records.get(task_id)
                if record is None:
                    return False
                if record.status != TaskStatus.CREATED:
                    return False
                instance = ctx.deps.instance_pool.create_subagent(STAGE_ROLE[stage])
                ctx.deps.agent_repo.upsert_instance(
                    run_id=ctx.deps.run_id,
                    trace_id=ctx.deps.trace_id,
                    session_id=ctx.deps.session_id,
                    instance_id=instance.instance_id,
                    role_id=instance.role_id,
                    status=InstanceStatus.IDLE,
                )
                ctx.deps.task_repo.update_status(
                    task_id=task_id,
                    status=TaskStatus.ASSIGNED,
                    assigned_instance_id=instance.instance_id,
                )
                dispatched.append({'task_id': task_id, 'role_id': STAGE_ROLE[stage], 'instance_id': instance.instance_id})
                try:
                    ctx.deps.task_execution_service.execute(
                        instance_id=instance.instance_id,
                        role_id=instance.role_id,
                        task=record.envelope,
                    )
                    executed.append({'task_id': task_id, 'stage': stage, 'status': 'completed'})
                except Exception as exc:
                    failed.append({'task_id': task_id, 'stage': stage, 'status': 'failed', 'error': str(exc)})
                records = _refresh_records()
                return True

            converged_stage = 'blocked'
            progressed = True
            while progressed:
                progressed = False

                spec_id = str(stages.get('spec', {}).get('task_id', ''))
                design_id = str(stages.get('design', {}).get('task_id', ''))
                code_id = str(stages.get('code', {}).get('task_id', ''))
                verify_id = str(stages.get('verify', {}).get('task_id', ''))

                spec_record = records.get(spec_id)
                if spec_record is not None and spec_record.status == TaskStatus.CREATED:
                    progressed = _ensure_and_execute(spec_id, 'spec') or progressed
                    converged_stage = 'spec_executed'
                    continue
                if spec_record is None or spec_record.status != TaskStatus.COMPLETED:
                    converged_stage = 'waiting_spec'
                    break

                design_record = records.get(design_id)
                if design_record is not None and design_record.status == TaskStatus.CREATED:
                    progressed = _ensure_and_execute(design_id, 'design') or progressed
                    converged_stage = 'design_executed'
                    continue
                if design_record is None or design_record.status != TaskStatus.COMPLETED:
                    converged_stage = 'waiting_design'
                    break

                code_record = records.get(code_id)
                if code_record is not None and code_record.status == TaskStatus.CREATED:
                    progressed = _ensure_and_execute(code_id, 'code') or progressed
                    converged_stage = 'code_executed'
                    continue
                if code_record is None or code_record.status != TaskStatus.COMPLETED:
                    converged_stage = 'waiting_code'
                    continue

                verify_record = records.get(verify_id)
                if verify_record is not None and verify_record.status == TaskStatus.CREATED:
                    progressed = _ensure_and_execute(verify_id, 'verify') or progressed
                    converged_stage = 'verify_executed'
                    continue
                if verify_record is not None and verify_record.status == TaskStatus.COMPLETED:
                    converged_stage = 'verify_completed'
                else:
                    converged_stage = 'waiting_verify'
                break

            return json.dumps(
                {
                    'ok': True,
                    'workflow_id': workflow_id,
                    'dispatched': dispatched,
                    'executed': executed,
                    'failed': failed,
                    'converged_stage': converged_stage,
                    'next_action': _next_action(converged_stage, failed),
                    'remaining_budget': max(0, bounded_dispatch - len(dispatched)),
                },
                ensure_ascii=False,
            )

        return execute_tool(
            ctx,
            tool_name='dispatch_ready_tasks',
            args_summary={'workflow_id': workflow_id, 'max_dispatch': max_dispatch},
            action=_action,
        )


def _next_action(converged_stage: str, failed: list[dict[str, str]]) -> str:
    if failed:
        return 'review_failures'
    if converged_stage in {'verify_completed'}:
        return 'finalize'
    if converged_stage.startswith('waiting_'):
        return 'wait_or_retry_dispatch'
    if converged_stage.endswith('_executed'):
        return 'dispatch_again'
    return 'inspect_status'
