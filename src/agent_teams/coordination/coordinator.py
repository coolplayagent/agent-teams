from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from agent_teams.agents.instance_pool import InstancePool
from agent_teams.agents.subagent import SubAgentRunner
from agent_teams.core.enums import EventType, ScopeType, TaskStatus
from agent_teams.core.ids import new_task_id, new_trace_id
from agent_teams.core.models import EventEnvelope, IntentInput, RoleDefinition, ScopeRef, TaskEnvelope, VerificationPlan
from agent_teams.prompting.runtime_prompt_builder import RuntimePromptBuilder
from agent_teams.providers.llm import LLMProvider
from agent_teams.roles.registry import RoleRegistry
from agent_teams.state.shared_store import SharedStore
from agent_teams.state.task_repo import TaskRepository
from agent_teams.tools.models import AssignTaskRequest, CreateSubAgentRequest, CreateTaskRequest, EmitEventRequest, VerifyTaskRequest
from agent_teams.tools.service import CollaborationTools


@dataclass
class CoordinatorGraph:
    role_registry: RoleRegistry
    instance_pool: InstancePool
    task_repo: TaskRepository
    shared_store: SharedStore
    tools: CollaborationTools
    prompt_builder: RuntimePromptBuilder
    provider_factory: Callable[[RoleDefinition], LLMProvider]

    def run(self, intent: IntentInput) -> tuple[str, str, str, str]:
        trace_id = new_trace_id().value
        task = self._spec_builder(intent, trace_id)
        role_id = self._role_planner(task)
        instance_id = self._instance_creator(role_id, task, intent, trace_id)
        result = self._task_executor(instance_id, role_id, task, intent)
        verification = self.tools.verify_task(VerifyTaskRequest(task_id=task.task_id))
        status = 'completed' if verification.passed else 'failed'
        return trace_id, task.task_id, status, result

    def _spec_builder(self, intent: IntentInput, trace_id: str) -> TaskEnvelope:
        task = TaskEnvelope(
            task_id=new_task_id().value,
            session_id=intent.session_id,
            parent_task_id=None,
            trace_id=trace_id,
            objective=intent.intent,
            scope=('deliverable',),
            dod=('response produced',),
            verification=VerificationPlan(checklist=('echo',)),
        )
        self.tools.create_task(CreateTaskRequest(envelope=task))
        self.tools.emit_event(
            req=self._emit_request(
                event_type=EventType.TASK_CREATED,
                trace_id=trace_id,
                session_id=intent.session_id,
                task_id=task.task_id,
            )
        )
        return task

    def _role_planner(self, task: TaskEnvelope) -> str:
        text = task.objective.lower()
        for role in self.role_registry.list_roles():
            for capability in role.capabilities:
                if capability.lower() in text:
                    return role.role_id
        return self.role_registry.list_roles()[0].role_id

    def _instance_creator(self, role_id: str, task: TaskEnvelope, intent: IntentInput, trace_id: str) -> str:
        instance = self.tools.create_subagent(CreateSubAgentRequest(role_id=role_id))
        self.tools.assign_task(AssignTaskRequest(task_id=task.task_id, instance_id=instance.instance_id))
        self.tools.emit_event(
            req=self._emit_request(
                event_type=EventType.INSTANCE_CREATED,
                trace_id=trace_id,
                session_id=intent.session_id,
                task_id=task.task_id,
                instance_id=instance.instance_id,
            )
        )
        self.tools.emit_event(
            req=self._emit_request(
                event_type=EventType.TASK_ASSIGNED,
                trace_id=trace_id,
                session_id=intent.session_id,
                task_id=task.task_id,
                instance_id=instance.instance_id,
            )
        )
        return instance.instance_id

    def _task_executor(self, instance_id: str, role_id: str, task: TaskEnvelope, intent: IntentInput) -> str:
        self.instance_pool.mark_running(instance_id)
        self.task_repo.update_status(task.task_id, TaskStatus.RUNNING)
        self.tools.emit_event(
            req=self._emit_request(
                event_type=EventType.TASK_STARTED,
                trace_id=task.trace_id,
                session_id=intent.session_id,
                task_id=task.task_id,
                instance_id=instance_id,
            )
        )
        role = self.role_registry.get(role_id)
        runner = SubAgentRunner(role=role, prompt_builder=self.prompt_builder, provider=self.provider_factory(role))
        snapshot = self.shared_store.snapshot(ScopeRef(scope_type=ScopeType.SESSION, scope_id=intent.session_id))
        try:
            result = runner.run(task=task, parent_instruction=intent.parent_instruction, shared_state_snapshot=snapshot)
            self.task_repo.update_status(task.task_id, TaskStatus.COMPLETED, result=result)
            self.instance_pool.mark_completed(instance_id)
            self.tools.emit_event(
                req=self._emit_request(
                    event_type=EventType.TASK_COMPLETED,
                    trace_id=task.trace_id,
                    session_id=intent.session_id,
                    task_id=task.task_id,
                    instance_id=instance_id,
                )
            )
            return result
        except TimeoutError:
            self.task_repo.update_status(task.task_id, TaskStatus.TIMEOUT, error_message='Task timeout')
            self.instance_pool.mark_timeout(instance_id)
            self.tools.emit_event(
                req=self._emit_request(
                    event_type=EventType.TASK_TIMEOUT,
                    trace_id=task.trace_id,
                    session_id=intent.session_id,
                    task_id=task.task_id,
                    instance_id=instance_id,
                )
            )
            raise
        except Exception as exc:
            self.task_repo.update_status(task.task_id, TaskStatus.FAILED, error_message=str(exc))
            self.instance_pool.mark_failed(instance_id)
            self.tools.emit_event(
                req=self._emit_request(
                    event_type=EventType.TASK_FAILED,
                    trace_id=task.trace_id,
                    session_id=intent.session_id,
                    task_id=task.task_id,
                    instance_id=instance_id,
                )
            )
            raise

    def _emit_request(
        self,
        event_type: EventType,
        trace_id: str,
        session_id: str,
        task_id: str | None = None,
        instance_id: str | None = None,
    ) -> EmitEventRequest:
        return EmitEventRequest(
            event=EventEnvelope(
                event_type=event_type,
                trace_id=trace_id,
                session_id=session_id,
                task_id=task_id,
                instance_id=instance_id,
                payload_json='{}',
            )
        )
