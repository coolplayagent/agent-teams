# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Final, NamedTuple


class CliCommandSpec(NamedTuple):
    path: tuple[str, ...]
    positional_min: int
    positional_max: int
    value_options: frozenset[str]
    flag_options: frozenset[str]
    full_process: bool


CLI_ROOT_HELP: Final[str] = """Usage: relay-teams [OPTIONS] COMMAND [ARGS]...

Agent Teams command line interface.

Commands:
  server          Manage the local Agent Teams server.
  roles           Inspect and manage roles through the server API.
  agent-runtimes  Inspect and manage external agent runtimes.
  approvals       List and resolve pending tool approvals.
  questions       List and answer pending user questions.
  env             Inspect environment and proxy configuration.
  mcp             Inspect and manage MCP servers.
  skills          Inspect discovered skills.
  clawhub         Search and install ClawHub skills.
  metrics         Inspect runtime metrics.
  runs            Inspect active and historical runs.
  commands        Inspect slash commands.
  hooks           Inspect runtime hooks.
  gateway         Manage gateway integrations.
  memories        Inspect and manage Memory Bank entries.
  plugin          Install, inspect, enable, and disable plugins.
"""

CLI_GROUP_DESCRIPTIONS: Final[dict[tuple[str, ...], str]] = {
    ("server",): "Manage the local Agent Teams server.",
    ("roles",): "Inspect and manage roles through the server API.",
    ("agent-runtimes",): "Inspect and manage external agent runtimes.",
    ("approvals",): "List and resolve pending tool approvals.",
    ("questions",): "List and answer pending user questions.",
    ("env",): "Inspect environment and proxy configuration.",
    ("mcp",): "Inspect and manage MCP servers from the app config directory.",
    ("skills",): "Inspect discovered skills.",
    ("clawhub",): "Search and install ClawHub skills.",
    ("metrics",): "Inspect runtime metrics.",
    ("runs",): "Inspect active and historical runs.",
    ("commands",): "Inspect slash commands.",
    ("hooks",): "Inspect runtime hooks.",
    ("gateway",): "Manage gateway integrations.",
    ("gateway", "acp"): "Run gateway ACP transports.",
    ("gateway", "feishu"): "Manage Feishu gateway accounts.",
    ("gateway", "wechat"): "Manage WeChat gateway accounts.",
    ("memories",): "Inspect and manage Memory Bank entries.",
    ("memories", "evolve"): (
        "Manage legacy Memory Bank evolution drafts; prefer skill-drafts."
    ),
    ("memories", "skill-drafts"): "Manage skill drafts generated from memory.",
    ("plugin",): "Install, inspect, enable, and disable Relay Teams plugins.",
}

CLI_COMMAND_DESCRIPTIONS: Final[dict[tuple[str, ...], str]] = {
    ("server", "start"): "Start the Agent Teams server.",
    ("server", "stop"): "Stop the managed Agent Teams server.",
    ("server", "restart"): "Restart the managed Agent Teams server.",
    ("skills", "list"): "List all discovered skills.",
    ("skills", "show"): "Show a single skill definition.",
    ("mcp", "list"): "List effective MCP servers from app scope.",
    ("mcp", "tools"): "Connect to one MCP server and list tools.",
    ("mcp", "add"): "Add or update an app-scoped MCP server.",
    ("mcp", "test"): "Connect to one MCP server and report status.",
    ("mcp", "enable"): "Enable an app-scoped MCP server.",
    ("mcp", "disable"): "Disable an app-scoped MCP server.",
    ("agent-runtimes", "registry", "list"): "List official ACP registry agents.",
    ("agent-runtimes", "registry", "refresh"): "Refresh official ACP registry agents.",
    (
        "agent-runtimes",
        "registry",
        "install",
    ): "Install one ACP registry runtime binding.",
}

_COMMON_SERVER_VALUE_OPTIONS = frozenset({"--base-url", "--format"})
_COMMON_SERVER_FLAG_OPTIONS = frozenset(
    {"--autostart", "--no-autostart", "--daemon", "-d", "--force"}
)

CLI_COMMAND_SPECS: Final[dict[tuple[str, ...], CliCommandSpec]] = {
    ("server", "start"): CliCommandSpec(
        ("server", "start"),
        0,
        0,
        frozenset({"--host", "--port"}),
        frozenset({"--daemon", "-d"}),
        False,
    ),
    ("server", "stop"): CliCommandSpec(
        ("server", "stop"),
        0,
        0,
        frozenset({"--host", "--port"}),
        frozenset({"--force"}),
        False,
    ),
    ("server", "restart"): CliCommandSpec(
        ("server", "restart"),
        0,
        0,
        frozenset({"--host", "--port"}),
        frozenset({"--force"}),
        False,
    ),
    ("roles", "validate"): CliCommandSpec(
        ("roles", "validate"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("roles", "prompt"): CliCommandSpec(
        ("roles", "prompt"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset(
            {
                "--role-id",
                "--shared-state-json",
                "--objective",
                "--tool",
                "--skill",
                "--section",
            }
        ),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("agent-runtimes", "list"): CliCommandSpec(
        ("agent-runtimes", "list"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("agent-runtimes", "get"): CliCommandSpec(
        ("agent-runtimes", "get"),
        1,
        1,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("agent-runtimes", "save"): CliCommandSpec(
        ("agent-runtimes", "save"),
        1,
        1,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--config-json"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("agent-runtimes", "delete"): CliCommandSpec(
        ("agent-runtimes", "delete"),
        1,
        1,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("agent-runtimes", "test"): CliCommandSpec(
        ("agent-runtimes", "test"),
        1,
        1,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("agent-runtimes", "registry", "list"): CliCommandSpec(
        ("agent-runtimes", "registry", "list"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS | frozenset({"--refresh"}),
        False,
    ),
    ("agent-runtimes", "registry", "refresh"): CliCommandSpec(
        ("agent-runtimes", "registry", "refresh"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("agent-runtimes", "registry", "install"): CliCommandSpec(
        ("agent-runtimes", "registry", "install"),
        1,
        1,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset({"--agent-id", "--distribution", "--env-json"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("approvals", "list"): CliCommandSpec(
        ("approvals", "list"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--run-id"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("approvals", "resolve"): CliCommandSpec(
        ("approvals", "resolve"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset(
            {"--run-id", "--tool-call-id", "--action", "--feedback", "--option-id"}
        ),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("questions", "list"): CliCommandSpec(
        ("questions", "list"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--run-id"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("questions", "answer"): CliCommandSpec(
        ("questions", "answer"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset({"--run-id", "--question-id", "--answers-json"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("env", "list"): CliCommandSpec(
        ("env", "list"),
        0,
        0,
        frozenset({"--format", "--prefix"}),
        frozenset({"--show-secrets"}),
        False,
    ),
    ("env", "proxy-reload"): CliCommandSpec(
        ("env", "proxy-reload"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("env", "probe-web"): CliCommandSpec(
        ("env", "probe-web"),
        1,
        1,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--timeout-ms"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("mcp", "list"): CliCommandSpec(
        ("mcp", "list"), 0, 0, frozenset({"--format"}), frozenset(), False
    ),
    ("mcp", "tools"): CliCommandSpec(
        ("mcp", "tools"), 1, 1, frozenset({"--format"}), frozenset(), True
    ),
    ("mcp", "add"): CliCommandSpec(
        ("mcp", "add"),
        1,
        1,
        frozenset(
            {
                "--format",
                "--command",
                "--url",
                "--transport",
                "--arg",
                "--env",
                "--header",
            }
        ),
        frozenset({"--overwrite"}),
        False,
    ),
    ("mcp", "test"): CliCommandSpec(
        ("mcp", "test"), 1, 1, frozenset({"--format"}), frozenset(), True
    ),
    ("mcp", "enable"): CliCommandSpec(
        ("mcp", "enable"), 1, 1, frozenset({"--format"}), frozenset(), False
    ),
    ("mcp", "disable"): CliCommandSpec(
        ("mcp", "disable"), 1, 1, frozenset({"--format"}), frozenset(), False
    ),
    ("skills", "list"): CliCommandSpec(
        ("skills", "list"),
        0,
        0,
        frozenset({"--format", "--source"}),
        frozenset(),
        False,
    ),
    ("skills", "show"): CliCommandSpec(
        ("skills", "show"), 1, 1, frozenset({"--format"}), frozenset(), False
    ),
    ("clawhub", "config", "get"): CliCommandSpec(
        ("clawhub", "config", "get"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("clawhub", "config", "save"): CliCommandSpec(
        ("clawhub", "config", "save"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--token"}),
        _COMMON_SERVER_FLAG_OPTIONS | frozenset({"--clear-token"}),
        False,
    ),
    ("clawhub", "skills", "list"): CliCommandSpec(
        ("clawhub", "skills", "list"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("clawhub", "skills", "get"): CliCommandSpec(
        ("clawhub", "skills", "get"),
        1,
        1,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("clawhub", "skills", "save"): CliCommandSpec(
        ("clawhub", "skills", "save"),
        1,
        1,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--config-json"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("clawhub", "skills", "delete"): CliCommandSpec(
        ("clawhub", "skills", "delete"),
        1,
        1,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("metrics", "overview"): CliCommandSpec(
        ("metrics", "overview"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset({"--scope", "--scope-id", "--window-minutes"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("metrics", "breakdowns"): CliCommandSpec(
        ("metrics", "breakdowns"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset({"--scope", "--scope-id", "--window-minutes"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("metrics", "tail"): CliCommandSpec(
        ("metrics", "tail"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset({"--scope", "--scope-id", "--window-minutes"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        True,
    ),
    ("runs", "todo"): CliCommandSpec(
        ("runs", "todo"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--run-id"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("commands", "list"): CliCommandSpec(
        ("commands", "list"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--workspace"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("commands", "show"): CliCommandSpec(
        ("commands", "show"),
        1,
        1,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--workspace"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("hooks", "show"): CliCommandSpec(
        ("hooks", "show"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("hooks", "validate"): CliCommandSpec(
        ("hooks", "validate"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        True,
    ),
    ("hooks", "list"): CliCommandSpec(
        ("hooks", "list"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("gateway", "acp", "stdio"): CliCommandSpec(
        ("gateway", "acp", "stdio"), 0, 0, frozenset({"--role-id"}), frozenset(), True
    ),
    ("gateway", "feishu", "list"): CliCommandSpec(
        ("gateway", "feishu", "list"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("gateway", "feishu", "create"): CliCommandSpec(
        ("gateway", "feishu", "create"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--payload-json"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("gateway", "feishu", "update"): CliCommandSpec(
        ("gateway", "feishu", "update"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--account-id", "--payload-json"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("gateway", "feishu", "enable"): CliCommandSpec(
        ("gateway", "feishu", "enable"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--account-id"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("gateway", "feishu", "disable"): CliCommandSpec(
        ("gateway", "feishu", "disable"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--account-id"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("gateway", "feishu", "delete"): CliCommandSpec(
        ("gateway", "feishu", "delete"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--account-id"}),
        _COMMON_SERVER_FLAG_OPTIONS
        | frozenset({"--force-delete", "--no-force-delete"}),
        False,
    ),
    ("gateway", "feishu", "reload"): CliCommandSpec(
        ("gateway", "feishu", "reload"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("gateway", "wechat", "list"): CliCommandSpec(
        ("gateway", "wechat", "list"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("gateway", "wechat", "connect"): CliCommandSpec(
        ("gateway", "wechat", "connect"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset({"--bot-type", "--wechat-base-url", "--route-tag"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("gateway", "wechat", "wait"): CliCommandSpec(
        ("gateway", "wechat", "wait"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--session-key", "--timeout-ms"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("gateway", "wechat", "update"): CliCommandSpec(
        ("gateway", "wechat", "update"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--account-id", "--payload-json"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("gateway", "wechat", "enable"): CliCommandSpec(
        ("gateway", "wechat", "enable"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--account-id"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("gateway", "wechat", "disable"): CliCommandSpec(
        ("gateway", "wechat", "disable"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--account-id"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("gateway", "wechat", "delete"): CliCommandSpec(
        ("gateway", "wechat", "delete"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--account-id"}),
        _COMMON_SERVER_FLAG_OPTIONS
        | frozenset({"--force-delete", "--no-force-delete"}),
        False,
    ),
    ("gateway", "wechat", "reload"): CliCommandSpec(
        ("gateway", "wechat", "reload"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS,
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("memories", "list"): CliCommandSpec(
        ("memories", "list"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset({"--workspace-id", "--tier", "--scope", "--role-id"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("memories", "get"): CliCommandSpec(
        ("memories", "get"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--workspace-id", "--memory-id"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("memories", "create"): CliCommandSpec(
        ("memories", "create"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset(
            {
                "--workspace-id",
                "--content",
                "--title",
                "--tier",
                "--scope",
                "--kind",
                "--tags",
            }
        ),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("memories", "delete"): CliCommandSpec(
        ("memories", "delete"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--workspace-id", "--memory-id"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        True,
    ),
    ("memories", "search"): CliCommandSpec(
        ("memories", "search"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--workspace-id", "--query"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("memories", "consolidate"): CliCommandSpec(
        ("memories", "consolidate"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset({"--workspace-id", "--query", "--target-tier"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        True,
    ),
    ("memories", "rebuild-index"): CliCommandSpec(
        ("memories", "rebuild-index"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--workspace-id", "--limit"}),
        _COMMON_SERVER_FLAG_OPTIONS | frozenset({"--dry-run"}),
        True,
    ),
    ("memories", "evolve", "create"): CliCommandSpec(
        ("memories", "evolve", "create"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset(
            {
                "--workspace-id",
                "--memory-id",
                "--target",
                "--skill-id",
                "--runtime-name",
                "--description",
                "--objective",
            }
        ),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("memories", "evolve", "list"): CliCommandSpec(
        ("memories", "evolve", "list"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset({"--workspace-id", "--target", "--status"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("memories", "evolve", "apply"): CliCommandSpec(
        ("memories", "evolve", "apply"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--workspace-id", "--draft-id"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("memories", "evolve", "reject"): CliCommandSpec(
        ("memories", "evolve", "reject"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset({"--workspace-id", "--draft-id", "--reason"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("memories", "skill-drafts", "generate"): CliCommandSpec(
        ("memories", "skill-drafts", "generate"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset({"--kind", "--workspace-id", "--query"}),
        _COMMON_SERVER_FLAG_OPTIONS | frozenset({"--cross-workspace"}),
        False,
    ),
    ("memories", "skill-drafts", "list"): CliCommandSpec(
        ("memories", "skill-drafts", "list"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--workspace-id", "--status"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("memories", "skill-drafts", "get"): CliCommandSpec(
        ("memories", "skill-drafts", "get"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--draft-id"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("memories", "skill-drafts", "update"): CliCommandSpec(
        ("memories", "skill-drafts", "update"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS
        | frozenset(
            {
                "--draft-id",
                "--runtime-name",
                "--description",
                "--instructions",
                "--status",
            }
        ),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("memories", "skill-drafts", "validate"): CliCommandSpec(
        ("memories", "skill-drafts", "validate"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--draft-id"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("memories", "skill-drafts", "apply"): CliCommandSpec(
        ("memories", "skill-drafts", "apply"),
        0,
        0,
        _COMMON_SERVER_VALUE_OPTIONS | frozenset({"--draft-id"}),
        _COMMON_SERVER_FLAG_OPTIONS,
        False,
    ),
    ("plugin", "install"): CliCommandSpec(
        ("plugin", "install"),
        1,
        1,
        frozenset(
            {
                "--scope",
                "--marketplace",
                "--version",
                "--source-kind",
                "--marketplace-provider",
                "--marketplace-source",
                "--marketplace-ref",
            }
        ),
        frozenset({"--disabled"}),
        False,
    ),
    ("plugin", "uninstall"): CliCommandSpec(
        ("plugin", "uninstall"),
        1,
        1,
        frozenset({"--scope"}),
        frozenset({"--prune"}),
        False,
    ),
    ("plugin", "enable"): CliCommandSpec(
        ("plugin", "enable"), 1, 1, frozenset({"--scope"}), frozenset(), False
    ),
    ("plugin", "disable"): CliCommandSpec(
        ("plugin", "disable"), 1, 1, frozenset({"--scope"}), frozenset(), False
    ),
    ("plugin", "update"): CliCommandSpec(
        ("plugin", "update"),
        1,
        1,
        frozenset({"--scope", "--version"}),
        frozenset(),
        False,
    ),
    ("plugin", "configure"): CliCommandSpec(
        ("plugin", "configure"),
        1,
        1,
        frozenset({"--scope", "--set"}),
        frozenset(),
        False,
    ),
    ("plugin", "prune"): CliCommandSpec(
        ("plugin", "prune"), 0, 0, frozenset(), frozenset(), False
    ),
    ("plugin", "list"): CliCommandSpec(
        ("plugin", "list"),
        0,
        0,
        frozenset({"--format"}),
        frozenset({"--available"}),
        False,
    ),
    ("plugin", "list", "available"): CliCommandSpec(
        ("plugin", "list", "available"),
        0,
        0,
        frozenset(
            {
                "--format",
                "--marketplace",
                "--marketplace-provider",
                "--marketplace-source",
                "--marketplace-ref",
            }
        ),
        frozenset({"--available"}),
        False,
    ),
    ("plugin", "search"): CliCommandSpec(
        ("plugin", "search"),
        1,
        1,
        frozenset(
            {
                "--format",
                "--marketplace",
                "--marketplace-provider",
                "--marketplace-source",
                "--marketplace-ref",
            }
        ),
        frozenset(),
        False,
    ),
    ("plugin", "validate"): CliCommandSpec(
        ("plugin", "validate"), 1, 1, frozenset({"--format"}), frozenset(), False
    ),
}


def _parent_paths(path: tuple[str, ...]) -> tuple[tuple[str, ...], ...]:
    return tuple(path[:index] for index in range(1, len(path)))


CLI_GROUP_PATHS: Final[frozenset[tuple[str, ...]]] = frozenset(
    parent for path in CLI_COMMAND_SPECS for parent in _parent_paths(path)
)
CLI_ROOT_COMMANDS: Final[frozenset[str]] = frozenset(
    path[0] for path in CLI_GROUP_PATHS
)


def _children() -> dict[tuple[str, ...], frozenset[str]]:
    raw: dict[tuple[str, ...], set[str]] = {(): set(CLI_ROOT_COMMANDS)}
    for path in (*CLI_GROUP_PATHS, *CLI_COMMAND_SPECS):
        for index in range(len(path)):
            parent = path[:index]
            child = path[index]
            raw.setdefault(parent, set()).add(child)
    return {path: frozenset(names) for path, names in raw.items()}


CLI_COMMAND_CHILDREN: Final[dict[tuple[str, ...], frozenset[str]]] = _children()
CLI_COMMAND_SUBCOMMANDS: Final[dict[str, frozenset[str]]] = {
    path[0]: CLI_COMMAND_CHILDREN.get(path, frozenset())
    for path in CLI_GROUP_PATHS
    if len(path) == 1
}
