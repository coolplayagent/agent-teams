from __future__ import annotations

import json

from pydantic_ai import Agent

from agent_teams.tools.runtime import ToolDeps
from agent_teams.tools.tool_helpers import execute_tool
from agent_teams.workflow.runtime_graph import load_graph


def mount(agent: Agent[ToolDeps, str]) -> None:
    @agent.tool
    def get_workflow_status(ctx, workflow_id: str) -> str:
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

            def _status(task_id: str) -> str:
                task = records.get(task_id)
                if task is None:
                    return 'missing'
                return task.status.value

            spec_id = str(stages.get('spec', {}).get('task_id', ''))
            design_id = str(stages.get('design', {}).get('task_id', ''))
            code_id = str(stages.get('code', {}).get('task_id', ''))
            verify_id = str(stages.get('verify', {}).get('task_id', ''))
            code_stage_status = _status(code_id)

            return json.dumps(
                {
                    'ok': True,
                    'workflow_id': workflow_id,
                    'stage_status': {
                        'spec': _status(spec_id),
                        'design': _status(design_id),
                        'code': code_stage_status,
                        'verify': _status(verify_id),
                    },
                },
                ensure_ascii=False,
            )

        return execute_tool(
            ctx,
            tool_name='get_workflow_status',
            args_summary={'workflow_id': workflow_id},
            action=_action,
        )
