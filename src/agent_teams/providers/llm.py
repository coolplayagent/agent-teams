from __future__ import annotations

from dataclasses import dataclass
from json import dumps

from agent_teams.core.enums import RunEventType
from agent_teams.core.models import ModelEndpointConfig, RunEvent
from agent_teams.runtime.injection_manager import RunInjectionManager
from agent_teams.runtime.run_event_hub import RunEventHub
from agent_teams.tools.pydantic_ai_tools import CollaborationDeps, build_collaboration_agent
from agent_teams.tools.service import CollaborationTools


@dataclass(frozen=True)
class LLMRequest:
    run_id: str
    trace_id: str
    task_id: str
    system_prompt: str
    user_prompt: str


class LLMProvider:
    def generate(self, request: LLMRequest) -> str:
        raise NotImplementedError


class EchoProvider(LLMProvider):
    def generate(self, request: LLMRequest) -> str:
        return f'ECHO: {request.user_prompt}'


class OpenAICompatibleProvider(LLMProvider):
    def __init__(
        self,
        config: ModelEndpointConfig,
        collaboration_tools: CollaborationTools,
        injection_manager: RunInjectionManager,
        run_event_hub: RunEventHub,
    ) -> None:
        self._config = config
        self._collaboration_tools = collaboration_tools
        self._injection_manager = injection_manager
        self._run_event_hub = run_event_hub

    def generate(self, request: LLMRequest) -> str:
        tool_rules = (
            'You are inside a multi-agent system. Use tools for collaboration data flow when needed. '
            'Available tools: create_task, assign_task, query_task, verify_task, list_tasks, '
            'create_subagent, manage_state, emit_event.'
        )
        self._run_event_hub.publish(
            RunEvent(
                run_id=request.run_id,
                trace_id=request.trace_id,
                task_id=request.task_id,
                event_type=RunEventType.MODEL_STEP_STARTED,
                payload_json='{}',
            )
        )
        agent = build_collaboration_agent(
            model_name=self._config.model,
            base_url=self._config.base_url,
            api_key=self._config.api_key,
            system_prompt=f'{request.system_prompt}\n\n{tool_rules}',
        )
        deps = CollaborationDeps(
            tools=self._collaboration_tools,
            run_id=request.run_id,
            trace_id=request.trace_id,
            task_id=request.task_id,
            injection_manager=self._injection_manager,
            run_event_hub=self._run_event_hub,
        )
        result = agent.run_sync(request.user_prompt, deps=deps)
        text = self._extract_text(result.response)
        self._run_event_hub.publish(
            RunEvent(
                run_id=request.run_id,
                trace_id=request.trace_id,
                task_id=request.task_id,
                event_type=RunEventType.TEXT_DELTA,
                payload_json=dumps({'text': text}),
            )
        )
        self._run_event_hub.publish(
            RunEvent(
                run_id=request.run_id,
                trace_id=request.trace_id,
                task_id=request.task_id,
                event_type=RunEventType.MODEL_STEP_FINISHED,
                payload_json='{}',
            )
        )
        return text

    def _extract_text(self, response: object) -> str:
        parts = getattr(response, 'parts', None)
        if isinstance(parts, list):
            texts: list[str] = []
            for part in parts:
                content = getattr(part, 'content', None)
                if isinstance(content, str) and content:
                    texts.append(content)
            if texts:
                return ''.join(texts)
        return str(response)
