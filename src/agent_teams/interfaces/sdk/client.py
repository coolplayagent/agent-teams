from __future__ import annotations

from pathlib import Path

from agent_teams.agents.instance_pool import InstancePool
from agent_teams.agents.meta_agent import MetaAgent
from agent_teams.coordination.coordinator import CoordinatorGraph
from agent_teams.core.config import load_runtime_config
from agent_teams.core.models import (
    IntentInput,
    ModelEndpointConfig,
    RoleDefinition,
    RunResult,
    SubAgentInstance,
    TaskEnvelope,
    TaskRecord,
)
from agent_teams.events.event_bus import EventBus
from agent_teams.prompting.runtime_prompt_builder import RuntimePromptBuilder
from agent_teams.providers.llm import EchoProvider, LLMProvider, OpenAICompatibleProvider
from agent_teams.roles.registry import RoleLoader
from agent_teams.state.shared_store import SharedStore
from agent_teams.state.task_repo import TaskRepository
from agent_teams.tools.models import CreateSubAgentRequest, CreateTaskRequest, QueryTaskRequest
from agent_teams.tools.service import CollaborationTools
from agent_teams.workflow.spec import WorkflowSpec


class AgentTeamsApp:
    def __init__(
        self,
        roles_dir: Path | None = None,
        db_path: Path | None = None,
        model_config: ModelEndpointConfig | None = None,
        config_dir: Path = Path('.agent_teams'),
    ) -> None:
        runtime = load_runtime_config(config_dir=config_dir, roles_dir=roles_dir, db_path=db_path)
        effective_model_config = model_config or runtime.model_endpoint

        role_registry = RoleLoader().load_all(runtime.paths.roles_dir)
        task_repo = TaskRepository(runtime.paths.db_path)
        shared_store = SharedStore(runtime.paths.db_path)
        event_bus = EventBus(runtime.paths.db_path)
        instance_pool = InstancePool()
        tools = CollaborationTools(
            task_repo=task_repo,
            instance_pool=instance_pool,
            shared_store=shared_store,
            event_bus=event_bus,
        )

        def provider_factory(_role: RoleDefinition) -> LLMProvider:
            provider: LLMProvider
            if effective_model_config is None:
                provider = EchoProvider()
            else:
                provider = OpenAICompatibleProvider(effective_model_config)
            return provider

        coordinator = CoordinatorGraph(
            role_registry=role_registry,
            instance_pool=instance_pool,
            task_repo=task_repo,
            shared_store=shared_store,
            tools=tools,
            prompt_builder=RuntimePromptBuilder(),
            provider_factory=provider_factory,
        )
        self._meta_agent = MetaAgent(coordinator=coordinator)
        self._tools = tools
        self._role_registry = role_registry
        self._workflows: list[WorkflowSpec] = []

    def run_intent(self, intent: IntentInput) -> RunResult:
        return self._meta_agent.handle_intent(intent)

    def create_workflow(self, spec: WorkflowSpec) -> str:
        self._workflows.append(spec)
        return spec.workflow_id

    def submit_task(self, task: TaskEnvelope) -> str:
        self._tools.create_task(CreateTaskRequest(envelope=task))
        return task.task_id

    def query_task(self, task_id: str) -> TaskRecord:
        return self._tools.query_task(QueryTaskRequest(task_id=task_id))

    def list_tasks(self) -> tuple[TaskRecord, ...]:
        return self._tools.list_tasks()

    def create_subagent(self, role_id: str) -> SubAgentInstance:
        return self._tools.create_subagent(CreateSubAgentRequest(role_id=role_id))

    def list_roles(self) -> tuple[RoleDefinition, ...]:
        return self._role_registry.list_roles()
