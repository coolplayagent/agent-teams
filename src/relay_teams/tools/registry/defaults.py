# -*- coding: utf-8 -*-
from __future__ import annotations

from relay_teams.tools.auto_harness_tools import TOOLS as AUTO_HARNESS_TOOLS
from relay_teams.tools.computer_tools import TOOLS as COMPUTER_TOOLS
from relay_teams.tools.im_tools.im_send import register as register_im_send
from relay_teams.tools.notify_tools import TOOLS as NOTIFY_TOOLS
from relay_teams.tools.orchestration_tools import TOOLS as ORCHESTRATION_TOOLS
from relay_teams.tools.registry.registry import ToolRegistry
from relay_teams.tools.registry.semantics import (
    ToolActionFamily,
    ToolSemanticCategory,
    ToolSemantics,
)
from relay_teams.tools.skill_team_tools import TOOLS as SKILL_TEAM_TOOLS
from relay_teams.tools.task_tools import TOOLS as TASK_TOOLS
from relay_teams.tools.todo_tools import TOOLS as TODO_TOOLS
from relay_teams.tools.web_tools import TOOLS as WEB_TOOLS
from relay_teams.tools.workspace_tools import TOOLS as WORKSPACE_TOOLS

IM_TOOLS = {
    "im_send": register_im_send,
}
HIDDEN_FROM_ROLE_CONFIG: tuple[str, ...] = ("im_send",)


def _semantics(
    category: ToolSemanticCategory,
    family: ToolActionFamily,
) -> ToolSemantics:
    return ToolSemantics(semantic_category=category, action_family=family)


BUILTIN_TOOL_SEMANTICS: dict[str, ToolSemantics] = {
    "activate_skill_roles": _semantics(
        ToolSemanticCategory.ORCHESTRATION, ToolActionFamily.ORCHESTRATION
    ),
    "ask_question": _semantics(
        ToolSemanticCategory.INTERACTIVE, ToolActionFamily.GENERIC
    ),
    "auto_harness_disable_tool": _semantics(
        ToolSemanticCategory.ORCHESTRATION, ToolActionFamily.ORCHESTRATION
    ),
    "auto_harness_enable_tool": _semantics(
        ToolSemanticCategory.ORCHESTRATION, ToolActionFamily.ORCHESTRATION
    ),
    "auto_harness_synthesize_tool": _semantics(
        ToolSemanticCategory.ORCHESTRATION, ToolActionFamily.ORCHESTRATION
    ),
    "auto_harness_upgrade_tool": _semantics(
        ToolSemanticCategory.ORCHESTRATION, ToolActionFamily.ORCHESTRATION
    ),
    "capture_screen": _semantics(ToolSemanticCategory.EXECUTION, ToolActionFamily.READ),
    "click_at": _semantics(ToolSemanticCategory.EXECUTION, ToolActionFamily.RUN),
    "create_monitor": _semantics(
        ToolSemanticCategory.PLANNING, ToolActionFamily.ORCHESTRATION
    ),
    "double_click_at": _semantics(ToolSemanticCategory.EXECUTION, ToolActionFamily.RUN),
    "drag_between": _semantics(ToolSemanticCategory.EXECUTION, ToolActionFamily.RUN),
    "edit": _semantics(ToolSemanticCategory.FILE_EDIT, ToolActionFamily.EDIT),
    "focus_window": _semantics(ToolSemanticCategory.EXECUTION, ToolActionFamily.RUN),
    "glob": _semantics(ToolSemanticCategory.FILE_READ, ToolActionFamily.SEARCH),
    "grep": _semantics(ToolSemanticCategory.FILE_READ, ToolActionFamily.SEARCH),
    "hotkey": _semantics(ToolSemanticCategory.EXECUTION, ToolActionFamily.RUN),
    "im_send": _semantics(ToolSemanticCategory.INTERACTIVE, ToolActionFamily.GENERIC),
    "launch_app": _semantics(ToolSemanticCategory.EXECUTION, ToolActionFamily.RUN),
    "list_background_tasks": _semantics(
        ToolSemanticCategory.PLANNING, ToolActionFamily.ORCHESTRATION
    ),
    "list_monitors": _semantics(
        ToolSemanticCategory.PLANNING, ToolActionFamily.ORCHESTRATION
    ),
    "list_skill_roles": _semantics(
        ToolSemanticCategory.ORCHESTRATION, ToolActionFamily.ORCHESTRATION
    ),
    "list_windows": _semantics(ToolSemanticCategory.EXECUTION, ToolActionFamily.READ),
    "notebook_edit": _semantics(ToolSemanticCategory.FILE_EDIT, ToolActionFamily.EDIT),
    "notify": _semantics(ToolSemanticCategory.INTERACTIVE, ToolActionFamily.GENERIC),
    "office_read_markdown": _semantics(
        ToolSemanticCategory.FILE_READ, ToolActionFamily.READ
    ),
    "orch_create_tasks": _semantics(
        ToolSemanticCategory.ORCHESTRATION, ToolActionFamily.ORCHESTRATION
    ),
    "orch_create_temporary_role": _semantics(
        ToolSemanticCategory.ORCHESTRATION, ToolActionFamily.ORCHESTRATION
    ),
    "orch_dispatch_task": _semantics(
        ToolSemanticCategory.ORCHESTRATION, ToolActionFamily.ORCHESTRATION
    ),
    "orch_list_available_roles": _semantics(
        ToolSemanticCategory.ORCHESTRATION, ToolActionFamily.ORCHESTRATION
    ),
    "orch_list_delegated_tasks": _semantics(
        ToolSemanticCategory.ORCHESTRATION, ToolActionFamily.ORCHESTRATION
    ),
    "orch_update_task": _semantics(
        ToolSemanticCategory.ORCHESTRATION, ToolActionFamily.ORCHESTRATION
    ),
    "read": _semantics(ToolSemanticCategory.FILE_READ, ToolActionFamily.READ),
    "scroll_view": _semantics(ToolSemanticCategory.EXECUTION, ToolActionFamily.RUN),
    "shell": _semantics(ToolSemanticCategory.EXECUTION, ToolActionFamily.RUN),
    "spawn_subagent": _semantics(
        ToolSemanticCategory.ORCHESTRATION, ToolActionFamily.SUBAGENT
    ),
    "stop_background_task": _semantics(
        ToolSemanticCategory.PLANNING, ToolActionFamily.ORCHESTRATION
    ),
    "stop_monitor": _semantics(
        ToolSemanticCategory.PLANNING, ToolActionFamily.ORCHESTRATION
    ),
    "todo_read": _semantics(ToolSemanticCategory.PLANNING, ToolActionFamily.READ),
    "todo_write": _semantics(ToolSemanticCategory.PLANNING, ToolActionFamily.EDIT),
    "type_text": _semantics(ToolSemanticCategory.EXECUTION, ToolActionFamily.RUN),
    "wait_background_task": _semantics(
        ToolSemanticCategory.PLANNING, ToolActionFamily.ORCHESTRATION
    ),
    "wait_for_window": _semantics(ToolSemanticCategory.EXECUTION, ToolActionFamily.RUN),
    "webfetch": _semantics(ToolSemanticCategory.WEB, ToolActionFamily.SEARCH),
    "websearch": _semantics(ToolSemanticCategory.WEB, ToolActionFamily.SEARCH),
    "write": _semantics(ToolSemanticCategory.FILE_EDIT, ToolActionFamily.EDIT),
    "write_tmp": _semantics(
        ToolSemanticCategory.MEMORY_ARTIFACT, ToolActionFamily.EDIT
    ),
}


def build_default_registry() -> ToolRegistry:
    tools = {
        **ORCHESTRATION_TOOLS,
        **SKILL_TEAM_TOOLS,
        **TASK_TOOLS,
        **TODO_TOOLS,
        **WEB_TOOLS,
        **WORKSPACE_TOOLS,
        **COMPUTER_TOOLS,
        **NOTIFY_TOOLS,
        **AUTO_HARNESS_TOOLS,
        **IM_TOOLS,
    }
    return ToolRegistry(
        tools,
        hidden_from_config=HIDDEN_FROM_ROLE_CONFIG,
        semantics=BUILTIN_TOOL_SEMANTICS,
    )
