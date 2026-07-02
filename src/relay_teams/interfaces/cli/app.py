# -*- coding: utf-8 -*-
from __future__ import annotations

import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import shlex
import signal
import shutil
import socket
import ssl
import subprocess
import sys
import time
from typing import NamedTuple, NoReturn
from urllib.parse import ParseResult, quote, urlencode, urlparse

import yaml

from relay_teams.interfaces.cli.manifest import (
    CLI_COMMAND_CHILDREN,
    CLI_COMMAND_DESCRIPTIONS,
    CLI_COMMAND_SPECS,
    CLI_COMMAND_SUBCOMMANDS,
    CLI_GROUP_DESCRIPTIONS,
    CLI_GROUP_PATHS,
    CLI_ROOT_HELP,
    CliCommandSpec,
)

try:
    import keyring
except ImportError:  # pragma: no cover - import availability depends on environment
    keyring = None

DEFAULT_BASE_URL = "http://127.0.0.1:8000"
_APP_ENV_SECRET_NAMESPACE = "app_env"
_KEYRING_SERVICE_NAME = "agent-teams"
_SECRETS_FILE_NAME = "secrets.json"
_SKILL_MANIFEST_MAX_DEPTH = 3
_SCRIPT_DESCRIPTION_PATTERN = re.compile(
    r"^- ([\w-]+):\s*(.*?)(?:\s*\((.*?)\))?$",
    re.MULTILINE,
)
_OPTIONS_WITH_VALUES = frozenset(
    {
        "-m",
        "--account-id",
        "--action",
        "--agent-id",
        "--answers-json",
        "--arg",
        "--base-url",
        "--bot-type",
        "--command",
        "--config-json",
        "--content",
        "--description",
        "--distribution",
        "--draft-id",
        "--env",
        "--env-json",
        "--feedback",
        "--format",
        "--header",
        "--host",
        "--instructions",
        "--kind",
        "--marketplace",
        "--marketplace-provider",
        "--marketplace-ref",
        "--marketplace-source",
        "--memory-id",
        "--message",
        "--model",
        "--mode",
        "--objective",
        "--option-id",
        "--orchestration",
        "--payload-json",
        "--port",
        "--prefix",
        "--query",
        "--question-id",
        "--reason",
        "--role",
        "--role-id",
        "--route-tag",
        "--run-id",
        "--runtime-name",
        "--scope",
        "--scope-id",
        "--section",
        "--session-key",
        "--set",
        "--shared-state-json",
        "--skill",
        "--skill-id",
        "--source",
        "--source-kind",
        "--status",
        "--tags",
        "--target",
        "--target-scope",
        "--target-tier",
        "--tier",
        "--timeout-ms",
        "--title",
        "--token",
        "--tool",
        "--tool-call-id",
        "--transport",
        "--url",
        "--version",
        "--wechat-base-url",
        "--window-minutes",
        "--workspace",
        "--workspace-id",
    }
)
_FAST_FLAG_OPTIONS = frozenset(
    {
        "-d",
        "--available",
        "--clear-token",
        "--cross-workspace",
        "--daemon",
        "--disabled",
        "--enabled",
        "--force",
        "--force-delete",
        "--include-disabled",
        "--no-autostart",
        "--no-force-delete",
        "--no-yolo",
        "--overwrite",
        "--prune",
        "--show-secrets",
        "--yolo",
    }
)
_COMMON_FAST_VALUE_OPTIONS = frozenset({"--base-url", "--format"})
_COMMON_FAST_FLAG_OPTIONS = frozenset(
    {"--autostart", "--no-autostart", "--daemon", "-d", "--force"}
)
_ROOT_FULL_OPTIONS = frozenset({"--install-completion", "--show-completion"})
_FAST_LOCAL_OPTION_SCOPES: dict[
    tuple[str, ...], tuple[frozenset[str], frozenset[str]]
] = {
    ("server", "start"): (
        frozenset({"--host", "--port"}),
        frozenset({"--daemon", "-d"}),
    ),
    ("server", "stop"): (frozenset({"--host", "--port"}), frozenset({"--force"})),
    ("server", "restart"): (frozenset({"--host", "--port"}), frozenset({"--force"})),
    ("skills", "list"): (frozenset({"--format", "--source"}), frozenset()),
    ("skills", "show"): (frozenset({"--format"}), frozenset()),
    ("mcp", "list"): (frozenset({"--format"}), frozenset()),
    (
        "mcp",
        "add",
    ): (
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
    ),
    ("mcp", "enable"): (frozenset({"--format"}), frozenset()),
    ("mcp", "disable"): (frozenset({"--format"}), frozenset()),
    ("env", "list"): (
        frozenset({"--format", "--prefix"}),
        frozenset({"--show-secrets"}),
    ),
}
_FAST_LOCAL_POSITIONAL_ARITY: dict[tuple[str, ...], tuple[int, int]] = {
    ("server", "start"): (0, 0),
    ("server", "stop"): (0, 0),
    ("server", "restart"): (0, 0),
    ("skills", "list"): (0, 0),
    ("skills", "show"): (1, 1),
    ("mcp", "list"): (0, 0),
    ("mcp", "add"): (1, 1),
    ("mcp", "enable"): (1, 1),
    ("mcp", "disable"): (1, 1),
    ("env", "list"): (0, 0),
}
_FAST_LOCAL_MISSING_ARGUMENT: dict[tuple[str, ...], str] = {
    ("skills", "show"): "Missing argument 'NAME'.",
    ("mcp", "add"): "Missing argument 'SERVER_NAME'.",
    ("mcp", "enable"): "Missing argument 'SERVER_NAME'.",
    ("mcp", "disable"): "Missing argument 'SERVER_NAME'.",
}
_FAST_PLUGIN_OPTION_SCOPES: dict[
    tuple[str, ...], tuple[frozenset[str], frozenset[str]]
] = {
    ("plugin", "list"): (
        frozenset({"--format"}),
        frozenset(),
    ),
    ("plugin", "list", "available"): (
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
    ),
    ("plugin", "search"): (
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
    ),
    ("plugin", "validate"): (frozenset({"--format"}), frozenset()),
    ("plugin", "install"): (
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
    ),
    ("plugin", "uninstall"): (frozenset({"--scope"}), frozenset({"--prune"})),
    ("plugin", "enable"): (frozenset({"--scope"}), frozenset()),
    ("plugin", "disable"): (frozenset({"--scope"}), frozenset()),
    ("plugin", "configure"): (frozenset({"--scope", "--set"}), frozenset()),
    ("plugin", "update"): (frozenset({"--scope", "--version"}), frozenset()),
    ("plugin", "prune"): (frozenset(), frozenset()),
}
_FAST_PLUGIN_POSITIONAL_ARITY: dict[tuple[str, ...], tuple[int, int]] = {
    ("plugin", "list"): (0, 0),
    ("plugin", "list", "available"): (0, 0),
    ("plugin", "search"): (1, 1),
    ("plugin", "validate"): (1, 1),
    ("plugin", "install"): (1, 1),
    ("plugin", "uninstall"): (1, 1),
    ("plugin", "enable"): (1, 1),
    ("plugin", "disable"): (1, 1),
    ("plugin", "configure"): (1, 1),
    ("plugin", "update"): (1, 1),
    ("plugin", "prune"): (0, 0),
}
_FAST_PLUGIN_MISSING_ARGUMENT: dict[tuple[str, ...], str] = {
    ("plugin", "search"): "Missing argument 'QUERY'.",
    ("plugin", "validate"): "Missing argument 'PATH'.",
    ("plugin", "install"): "Missing argument 'SOURCE'.",
    ("plugin", "uninstall"): "Missing argument 'NAME'.",
    ("plugin", "enable"): "Missing argument 'NAME'.",
    ("plugin", "disable"): "Missing argument 'NAME'.",
    ("plugin", "configure"): "Missing argument 'NAME'.",
    ("plugin", "update"): "Missing argument 'NAME'.",
}
_FAST_SERVER_JSON_OPTION_SCOPES: dict[
    tuple[str, ...], tuple[frozenset[str], frozenset[str]]
] = {
    ("hooks", "list"): (frozenset(), frozenset()),
    ("hooks", "show"): (frozenset(), frozenset()),
    ("metrics", "overview"): (
        frozenset({"--scope", "--scope-id", "--window-minutes"}),
        frozenset(),
    ),
    ("metrics", "breakdowns"): (
        frozenset({"--scope", "--scope-id", "--window-minutes"}),
        frozenset(),
    ),
    ("agent-runtimes", "list"): (frozenset(), frozenset()),
    ("agent-runtimes", "get"): (frozenset(), frozenset()),
    ("agent-runtimes", "save"): (frozenset({"--config-json"}), frozenset()),
    ("agent-runtimes", "delete"): (frozenset(), frozenset()),
    ("agent-runtimes", "test"): (frozenset(), frozenset({"--watch"})),
    ("agent-runtimes", "registry", "list"): (
        frozenset(),
        frozenset({"--refresh"}),
    ),
    ("agent-runtimes", "registry", "refresh"): (frozenset(), frozenset()),
    ("agent-runtimes", "registry", "install"): (
        frozenset({"--agent-id", "--distribution", "--env-json"}),
        frozenset(),
    ),
    ("commands", "list"): (frozenset({"--workspace"}), frozenset()),
    ("commands", "show"): (frozenset({"--workspace"}), frozenset()),
    ("approvals", "list"): (frozenset({"--run-id"}), frozenset()),
    ("approvals", "resolve"): (
        frozenset(
            {"--run-id", "--tool-call-id", "--action", "--feedback", "--option-id"}
        ),
        frozenset(),
    ),
    ("questions", "list"): (frozenset({"--run-id"}), frozenset()),
    ("questions", "answer"): (
        frozenset({"--run-id", "--question-id", "--answers-json"}),
        frozenset(),
    ),
    ("runs", "todo"): (frozenset({"--run-id"}), frozenset()),
    ("env", "proxy-reload"): (frozenset(), frozenset()),
    ("env", "probe-web"): (frozenset({"--timeout-ms"}), frozenset()),
    ("clawhub", "config", "get"): (frozenset(), frozenset()),
    ("clawhub", "config", "save"): (
        frozenset({"--token"}),
        frozenset({"--clear-token"}),
    ),
    ("clawhub", "skills", "list"): (frozenset(), frozenset()),
    ("clawhub", "skills", "get"): (frozenset(), frozenset()),
    ("clawhub", "skills", "save"): (frozenset({"--config-json"}), frozenset()),
    ("clawhub", "skills", "delete"): (frozenset(), frozenset()),
    ("gateway", "feishu", "list"): (frozenset(), frozenset()),
    ("gateway", "feishu", "create"): (frozenset({"--payload-json"}), frozenset()),
    ("gateway", "feishu", "update"): (
        frozenset({"--account-id", "--payload-json"}),
        frozenset(),
    ),
    ("gateway", "feishu", "enable"): (frozenset({"--account-id"}), frozenset()),
    ("gateway", "feishu", "disable"): (frozenset({"--account-id"}), frozenset()),
    ("gateway", "feishu", "delete"): (
        frozenset({"--account-id"}),
        frozenset({"--force-delete", "--no-force-delete"}),
    ),
    ("gateway", "feishu", "reload"): (frozenset(), frozenset()),
    ("gateway", "wechat", "list"): (frozenset(), frozenset()),
    ("gateway", "wechat", "connect"): (
        frozenset({"--bot-type", "--wechat-base-url", "--route-tag"}),
        frozenset(),
    ),
    ("gateway", "wechat", "wait"): (
        frozenset({"--session-key", "--timeout-ms"}),
        frozenset(),
    ),
    ("gateway", "wechat", "update"): (
        frozenset({"--account-id", "--payload-json"}),
        frozenset(),
    ),
    ("gateway", "wechat", "enable"): (frozenset({"--account-id"}), frozenset()),
    ("gateway", "wechat", "disable"): (frozenset({"--account-id"}), frozenset()),
    ("gateway", "wechat", "delete"): (
        frozenset({"--account-id"}),
        frozenset({"--force-delete", "--no-force-delete"}),
    ),
    ("gateway", "wechat", "reload"): (frozenset(), frozenset()),
    ("memories", "list"): (
        frozenset({"--workspace-id", "--tier", "--scope", "--role-id"}),
        frozenset(),
    ),
    ("memories", "get"): (frozenset({"--workspace-id", "--memory-id"}), frozenset()),
    ("memories", "create"): (
        frozenset(
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
        frozenset(),
    ),
    ("memories", "delete"): (frozenset({"--workspace-id", "--memory-id"}), frozenset()),
    ("memories", "search"): (frozenset({"--workspace-id", "--query"}), frozenset()),
    ("memories", "evolve", "create"): (
        frozenset(
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
        frozenset(),
    ),
    ("memories", "evolve", "list"): (
        frozenset({"--workspace-id", "--target", "--status"}),
        frozenset(),
    ),
    ("memories", "evolve", "apply"): (
        frozenset({"--workspace-id", "--draft-id"}),
        frozenset(),
    ),
    ("memories", "evolve", "reject"): (
        frozenset({"--workspace-id", "--draft-id", "--reason"}),
        frozenset(),
    ),
    ("memories", "skill-drafts", "generate"): (
        frozenset({"--kind", "--workspace-id", "--query"}),
        frozenset({"--cross-workspace"}),
    ),
    ("memories", "skill-drafts", "list"): (
        frozenset({"--workspace-id", "--status"}),
        frozenset(),
    ),
    ("memories", "skill-drafts", "get"): (frozenset({"--draft-id"}), frozenset()),
    ("memories", "skill-drafts", "update"): (
        frozenset(
            {
                "--draft-id",
                "--runtime-name",
                "--description",
                "--instructions",
                "--status",
            }
        ),
        frozenset(),
    ),
    ("memories", "skill-drafts", "validate"): (frozenset({"--draft-id"}), frozenset()),
    ("memories", "skill-drafts", "apply"): (frozenset({"--draft-id"}), frozenset()),
    ("roles", "validate"): (frozenset(), frozenset()),
    ("roles", "prompt"): (
        frozenset(
            {
                "--role-id",
                "--shared-state-json",
                "--objective",
                "--tool",
                "--skill",
                "--section",
            }
        ),
        frozenset(),
    ),
}
_FAST_SERVER_JSON_POSITIONAL_ARITY: dict[tuple[str, ...], tuple[int, int]] = {
    ("hooks", "list"): (0, 0),
    ("hooks", "show"): (0, 0),
    ("metrics", "overview"): (0, 0),
    ("metrics", "breakdowns"): (0, 0),
    ("agent-runtimes", "list"): (0, 0),
    ("agent-runtimes", "get"): (1, 1),
    ("agent-runtimes", "save"): (1, 1),
    ("agent-runtimes", "delete"): (1, 1),
    ("agent-runtimes", "test"): (1, 1),
    ("agent-runtimes", "registry", "list"): (0, 0),
    ("agent-runtimes", "registry", "refresh"): (0, 0),
    ("agent-runtimes", "registry", "install"): (1, 1),
    ("commands", "list"): (0, 0),
    ("commands", "show"): (1, 1),
    ("approvals", "list"): (0, 0),
    ("approvals", "resolve"): (0, 0),
    ("questions", "list"): (0, 0),
    ("questions", "answer"): (0, 0),
    ("runs", "todo"): (0, 0),
    ("env", "proxy-reload"): (0, 0),
    ("env", "probe-web"): (1, 1),
    ("clawhub", "config", "get"): (0, 0),
    ("clawhub", "config", "save"): (0, 0),
    ("clawhub", "skills", "list"): (0, 0),
    ("clawhub", "skills", "get"): (1, 1),
    ("clawhub", "skills", "save"): (1, 1),
    ("clawhub", "skills", "delete"): (1, 1),
    ("gateway", "feishu", "list"): (0, 0),
    ("gateway", "feishu", "create"): (0, 0),
    ("gateway", "feishu", "update"): (0, 0),
    ("gateway", "feishu", "enable"): (0, 0),
    ("gateway", "feishu", "disable"): (0, 0),
    ("gateway", "feishu", "delete"): (0, 0),
    ("gateway", "feishu", "reload"): (0, 0),
    ("gateway", "wechat", "list"): (0, 0),
    ("gateway", "wechat", "connect"): (0, 0),
    ("gateway", "wechat", "wait"): (0, 0),
    ("gateway", "wechat", "update"): (0, 0),
    ("gateway", "wechat", "enable"): (0, 0),
    ("gateway", "wechat", "disable"): (0, 0),
    ("gateway", "wechat", "delete"): (0, 0),
    ("gateway", "wechat", "reload"): (0, 0),
    ("memories", "list"): (0, 0),
    ("memories", "get"): (0, 0),
    ("memories", "create"): (0, 0),
    ("memories", "delete"): (0, 0),
    ("memories", "search"): (0, 0),
    ("memories", "evolve", "create"): (0, 0),
    ("memories", "evolve", "list"): (0, 0),
    ("memories", "evolve", "apply"): (0, 0),
    ("memories", "evolve", "reject"): (0, 0),
    ("memories", "skill-drafts", "generate"): (0, 0),
    ("memories", "skill-drafts", "list"): (0, 0),
    ("memories", "skill-drafts", "get"): (0, 0),
    ("memories", "skill-drafts", "update"): (0, 0),
    ("memories", "skill-drafts", "validate"): (0, 0),
    ("memories", "skill-drafts", "apply"): (0, 0),
    ("roles", "validate"): (0, 0),
    ("roles", "prompt"): (0, 0),
}


def _group_help(path: tuple[str, ...]) -> str:
    command = " ".join(path)
    children = CLI_COMMAND_CHILDREN.get(path, frozenset())
    rows = "\n".join(f"  {child}" for child in sorted(children))
    description = CLI_GROUP_DESCRIPTIONS.get(
        path, "This command group is loaded on demand."
    )
    return f"""Usage: relay-teams {command} [OPTIONS] COMMAND [ARGS]...

{description}

Commands:
{rows}
"""


def _leaf_help(path: tuple[str, ...]) -> str:
    command = " ".join(path)
    description = CLI_COMMAND_DESCRIPTIONS.get(
        path,
        "This command is available through the lightweight CLI dispatcher.",
    )
    return f"""Usage: relay-teams {command} [OPTIONS] [ARGS]...

{description}
Use the command without --help to execute it.
"""


_ROOT_HELP = CLI_ROOT_HELP
_COMMAND_HELP = {" ".join(path): _group_help(path) for path in CLI_GROUP_PATHS} | {
    " ".join(path): _leaf_help(path) for path in CLI_COMMAND_SPECS
}
_COMMAND_SUBCOMMANDS = CLI_COMMAND_SUBCOMMANDS


class FastPromptOptions(NamedTuple):
    message: str
    mode: str
    role_id: str | None
    orchestration_id: str | None
    model_profile: str | None
    workspace: Path | None
    yolo: bool
    daemon: bool
    force: bool
    no_autostart: bool
    base_url: str


class FastCommandParseResult(NamedTuple):
    path: tuple[str, ...]
    remaining_args: list[str]
    invalid_token: str
    invalid_parent: tuple[str, ...]


def main() -> None:
    args = sys.argv[1:]
    if _is_help(args):
        if _print_fast_help(args):
            return
        _run_full_cli()
    _validate_fast_command_surface(args)
    if _handle_fast_local_command(args):
        return
    _run_full_cli()


def _is_help(args: list[str]) -> bool:
    if not args:
        return True
    index = 0
    while index < len(args):
        arg = args[index]
        if arg == "--":
            return False
        value_option = _matched_value_option(arg, _OPTIONS_WITH_VALUES)
        if value_option is not None:
            inline_value = value_option[1]
            index += 1 if inline_value is not None else 2
            continue
        if arg in {"--help", "-h"}:
            return True
        index += 1
    return False


def _print_fast_help(args: list[str]) -> bool:
    help_args = _help_command_args(args)
    if not help_args:
        print(_ROOT_HELP.rstrip())
        return True
    parsed = _parse_fast_command(help_args)
    if parsed.invalid_token:
        _raise_fast_no_such_command(
            parent=parsed.invalid_parent,
            subcommand=parsed.invalid_token,
        )
    key = " ".join(parsed.path)
    if key:
        print(_COMMAND_HELP.get(key, _generic_fast_help(list(parsed.path))).rstrip())
        return True
    _raise_fast_no_such_command(parent=(), subcommand=help_args[0])


def _help_command_args(args: list[str]) -> list[str]:
    help_args: list[str] = []
    index = 0
    while index < len(args):
        arg = args[index]
        if arg == "--":
            break
        if arg in {"--help", "-h"}:
            index += 1
            continue
        value_option = _matched_value_option(arg, _OPTIONS_WITH_VALUES)
        if value_option is not None:
            inline_value = value_option[1]
            index += 1 if inline_value is not None else 2
            continue
        if arg.startswith("-"):
            index += 1
            continue
        help_args.append(arg)
        index += 1
    return help_args


def _generic_fast_help(help_args: list[str]) -> str:
    command = " ".join(help_args)
    return f"""Usage: relay-teams {command} [OPTIONS] [ARGS]...

This command is available through the lightweight CLI dispatcher.
Use the command without --help to execute it.
"""


def _validate_fast_command_surface(args: list[str]) -> None:
    if not args or _fast_prompt_candidate(args):
        return
    parsed = _parse_fast_command(args)
    if parsed.invalid_token:
        _raise_fast_no_such_command(
            parent=parsed.invalid_parent,
            subcommand=parsed.invalid_token,
        )
    if not parsed.path:
        if args and args[0] in _ROOT_FULL_OPTIONS:
            return
        if args and args[0].startswith("-"):
            _raise_fast_no_such_option(args[0])
        return
    if parsed.path in CLI_GROUP_PATHS and parsed.path not in CLI_COMMAND_SPECS:
        print(_COMMAND_HELP.get(" ".join(parsed.path), _ROOT_HELP).rstrip())
        raise SystemExit(0)
    spec = CLI_COMMAND_SPECS.get(parsed.path)
    if spec is None:
        return
    _raise_unknown_fast_options_for_manifest(spec, parsed.remaining_args)
    _raise_fast_positional_arity_for_manifest(spec, parsed.remaining_args)


def _parse_fast_command(args: list[str]) -> FastCommandParseResult:
    path: tuple[str, ...] = ()
    index = 0
    while index < len(args):
        token = args[index]
        if token == "--":
            break
        value_option = _matched_value_option(token, _OPTIONS_WITH_VALUES)
        if value_option is not None:
            inline_value = value_option[1]
            index += 1 if inline_value is not None else 2
            continue
        if token.startswith("-"):
            index += 1
            continue
        children = CLI_COMMAND_CHILDREN.get(path, frozenset())
        if token in children:
            path = (*path, token)
            index += 1
            continue
        if not path:
            return FastCommandParseResult((), args[index:], token, ())
        if path in CLI_COMMAND_SPECS:
            break
        return FastCommandParseResult(path, args[index:], token, path)
    return FastCommandParseResult(path, args[index:], "", ())


def _raise_unknown_fast_options_for_manifest(
    spec: CliCommandSpec,
    args: list[str],
) -> None:
    value_options = spec.value_options
    flag_options = spec.flag_options
    index = 0
    while index < len(args):
        token = args[index]
        if token == "--":
            return
        value_option = _matched_value_option(token, value_options)
        if value_option is not None:
            inline_value = value_option[1]
            if inline_value is None and (
                index + 1 >= len(args)
                or _is_manifest_option_token(spec, args[index + 1])
            ):
                _raise_missing_option_value(value_option[0])
            index += 1 if inline_value is not None else 2
            continue
        if token in flag_options:
            index += 1
            continue
        if token.startswith("-"):
            _raise_fast_no_such_option(token)
        index += 1


def _is_manifest_option_token(spec: CliCommandSpec, token: str) -> bool:
    if token in spec.flag_options:
        return True
    return _matched_value_option(token, spec.value_options) is not None


def _raise_fast_positional_arity_for_manifest(
    spec: CliCommandSpec,
    args: list[str],
) -> None:
    positionals = _fast_positionals_for_manifest(spec, args)
    minimum = spec.positional_min
    maximum = spec.positional_max
    if len(positionals) < minimum:
        print("Missing argument.", file=sys.stderr)
        raise SystemExit(2)
    if len(positionals) > maximum:
        print(
            f"Got unexpected extra argument ({positionals[maximum]}).", file=sys.stderr
        )
        raise SystemExit(2)


def _fast_positionals_for_manifest(spec: CliCommandSpec, args: list[str]) -> list[str]:
    value_options = spec.value_options
    positionals: list[str] = []
    index = 0
    while index < len(args):
        token = args[index]
        if token == "--":
            positionals.extend(args[index + 1 :])
            break
        value_option = _matched_value_option(token, value_options)
        if value_option is not None:
            inline_value = value_option[1]
            index += 1 if inline_value is not None else 2
            continue
        if token.startswith("-"):
            index += 1
            continue
        positionals.append(token)
        index += 1
    return positionals


def _raise_fast_no_such_command(
    *,
    parent: tuple[str, ...],
    subcommand: str,
) -> NoReturn:
    help_key = " ".join(parent)
    print(_COMMAND_HELP.get(help_key, _ROOT_HELP).rstrip(), file=sys.stderr)
    command = "relay-teams" if not parent else f"relay-teams {' '.join(parent)}"
    print(f"Try '{command} --help' for help.", file=sys.stderr)
    print(f"No such command '{subcommand}'.", file=sys.stderr)
    raise SystemExit(2)


def _raise_fast_no_such_option(option: str) -> NoReturn:
    print(f"No such option: {option}", file=sys.stderr)
    raise SystemExit(2)


def _handle_fast_local_command(args: list[str]) -> bool:
    if len(args) >= 2 and args[:2] == ["server", "start"]:
        _raise_unknown_fast_options_for_command(("server", "start"), args[2:])
        _server_start(args[2:])
        return True
    if len(args) >= 2 and args[:2] == ["server", "stop"]:
        _raise_unknown_fast_options_for_command(("server", "stop"), args[2:])
        _server_stop(args[2:])
        return True
    if len(args) >= 2 and args[:2] == ["server", "restart"]:
        _raise_unknown_fast_options_for_command(("server", "restart"), args[2:])
        _server_restart(args[2:])
        return True
    if len(args) >= 2 and args[:2] == ["skills", "list"]:
        _raise_unknown_fast_options_for_command(("skills", "list"), args[2:])
        _skills_list(args[2:])
        return True
    if len(args) >= 2 and args[:2] == ["skills", "show"]:
        _raise_unknown_fast_options_for_command(("skills", "show"), args[2:])
        _skills_show(args[2:])
        return True
    if len(args) >= 2 and args[:2] == ["mcp", "list"]:
        _raise_unknown_fast_options_for_command(("mcp", "list"), args[2:])
        _mcp_list(args[2:])
        return True
    if len(args) >= 2 and args[:2] == ["mcp", "add"]:
        _raise_unknown_fast_options_for_command(("mcp", "add"), args[2:])
        _mcp_add(args[2:])
        return True
    if len(args) >= 2 and args[:2] == ["mcp", "enable"]:
        _raise_unknown_fast_options_for_command(("mcp", "enable"), args[2:])
        _mcp_set_enabled(args[2:], enabled=True)
        return True
    if len(args) >= 2 and args[:2] == ["mcp", "disable"]:
        _raise_unknown_fast_options_for_command(("mcp", "disable"), args[2:])
        _mcp_set_enabled(args[2:], enabled=False)
        return True
    if len(args) >= 2 and args[:2] == ["env", "list"]:
        _raise_unknown_fast_options_for_command(("env", "list"), args[2:])
        _env_list(args[2:])
        return True
    if len(args) >= 1 and args[:1] == ["plugin"]:
        if _handle_fast_plugin(args[1:]):
            return True
    if len(args) >= 2 and args[:2] == ["plugin", "list"] and "--available" not in args:
        _plugin_list(args[2:])
        return True
    if _fast_prompt_candidate(args):
        _run_fast_prompt(args)
        return True
    _raise_fast_invalid_subcommand_if_known(args)
    if _server_backed_no_autostart(args):
        if not _is_agent_teams_base_url_healthy(_base_url(args)):
            print(
                "Agent Teams server is not running and --no-autostart was provided",
                file=sys.stderr,
            )
            raise SystemExit(1)
        if _handle_fast_server_json_command(args):
            return True
        return False
    if _handle_fast_server_json_command(args):
        return True
    return False


def _raise_fast_invalid_subcommand_if_known(args: list[str]) -> None:
    if len(args) < 2:
        return
    group = args[0]
    subcommand = args[1]
    if subcommand.startswith("-"):
        return
    valid_subcommands = _COMMAND_SUBCOMMANDS.get(group)
    if valid_subcommands is None or subcommand in valid_subcommands:
        return
    print(_COMMAND_HELP.get(group, _ROOT_HELP).rstrip(), file=sys.stderr)
    print(f"Try 'relay-teams {group} --help' for help.", file=sys.stderr)
    print(f"No such command '{subcommand}'.", file=sys.stderr)
    raise SystemExit(2)


def _server_start(args: list[str]) -> None:
    host = _option_value(args, "--host", "127.0.0.1")
    port = _int_option_value(args, "--port", 8000)
    port_available = _is_port_available(host=host, port=port)
    if not port_available and _is_agent_teams_live(host=host, port=port):
        print(f"Agent Teams server is already running on http://{host}:{port}")
        return
    if not port_available:
        owner_pid = _find_tcp_listen_pid(host=host, port=port)
        pid_detail = f" by pid {owner_pid}" if owner_pid is not None else ""
        print(
            f"Cannot start Agent Teams server on http://{host}:{port}: "
            f"port is already in use{pid_detail}.",
            file=sys.stderr,
        )
        print(
            "Run `relay-teams server stop --force` if this is a stale Agent Teams "
            "server, or choose another --port.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    if "--daemon" in args or "-d" in args:
        _start_server_daemon(host=host, port=port)
        if not _wait_until_healthy(host=host, port=port, timeout_seconds=20.0):
            raise RuntimeError(f"Failed to start Agent Teams server at {host}:{port}")
        process = _read_server_process()
        pid_info = f" (pid {process.get('pid')})" if process else ""
        print(f"Agent Teams server started on http://{host}:{port}{pid_info}")
        return

    _write_server_process(host=host, port=port)
    server_process: subprocess.Popen[bytes] | None = None
    try:
        print(f"Starting Agent Teams server on http://{host}:{port}")
        command = [
            sys.executable,
            "-m",
            "uvicorn",
            "relay_teams.interfaces.server.app:app",
            "--host",
            host,
            "--port",
            str(port),
            "--ws",
            "websockets-sansio",
            "--timeout-graceful-shutdown",
            "10",
        ]
        server_process = subprocess.Popen(command)
        _write_server_process(host=host, port=port, pid=server_process.pid)
        return_code = server_process.wait()
        if return_code != 0:
            raise SystemExit(return_code)
    except KeyboardInterrupt:
        if server_process is not None and server_process.poll() is None:
            _terminate_process_tree(server_process.pid, force=False)
            server_process.wait(timeout=10)
        raise SystemExit(130) from None
    finally:
        _clear_server_process()


def _server_stop(args: list[str]) -> None:
    host = _option_value(args, "--host", "127.0.0.1")
    port = _int_option_value(args, "--port", 8000)
    force = "--force" in args
    process = _read_server_process()
    pid = process.get("pid") if process else None
    if not isinstance(pid, int):
        fallback_pid = _find_tcp_listen_pid(host=host, port=port)
        if fallback_pid is None:
            print("No managed Agent Teams server process found.")
            return
        if not force and not _is_agent_teams_live(host=host, port=port):
            print(
                "No managed Agent Teams server process found, but "
                f"http://{host}:{port} is occupied by pid {fallback_pid}. "
                "Use --force to terminate that process if you are sure.",
                file=sys.stderr,
            )
            raise SystemExit(1)
        _terminate_process_tree(fallback_pid, force=True)
        print(
            f"Stopped Agent Teams server on http://{host}:{port} (pid {fallback_pid})"
        )
        return
    _terminate_process_tree(pid, force=force)
    _clear_server_process()
    print(
        "Stopped Agent Teams server on "
        f"http://{process.get('host', '127.0.0.1')}:{process.get('port', 8000)}"
    )


def _server_restart(args: list[str]) -> None:
    host = _option_value(args, "--host", "127.0.0.1")
    port = _int_option_value(args, "--port", 8000)
    stop_args = ["--host", host, "--port", str(port)]
    if "--force" in args:
        stop_args.append("--force")
    try:
        _server_stop(stop_args)
    except SystemExit as exc:
        if exc.code not in (0, None):
            raise
    start_args = ["--host", host, "--port", str(port), "--daemon"]
    _server_start(start_args)


def _start_server_daemon(*, host: str, port: int) -> None:
    command = [
        sys.executable,
        "-m",
        "relay_teams",
        "server",
        "start",
        "--host",
        host,
        "--port",
        str(port),
    ]
    if sys.platform.startswith("win"):
        creationflags = int(getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
        creationflags |= int(getattr(subprocess, "DETACHED_PROCESS", 0))
        creationflags |= int(getattr(subprocess, "CREATE_NO_WINDOW", 0))
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= int(getattr(subprocess, "STARTF_USESHOWWINDOW", 0))
        startupinfo.wShowWindow = int(getattr(subprocess, "SW_HIDE", 0))
        subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
            startupinfo=startupinfo,
        )
        return
    subprocess.Popen(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


def _wait_until_healthy(*, host: str, port: int, timeout_seconds: float) -> bool:
    deadline = time.perf_counter() + timeout_seconds
    while time.perf_counter() < deadline:
        if _is_agent_teams_healthy(host=host, port=port):
            return True
        time.sleep(0.1)
    return False


def _wait_until_base_url_healthy(*, base_url: str, timeout_seconds: float) -> bool:
    parsed = urlparse(base_url)
    if _uses_plain_http_root_health(parsed):
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 80
        return _wait_until_healthy(
            host=host,
            port=port,
            timeout_seconds=timeout_seconds,
        )
    deadline = time.perf_counter() + timeout_seconds
    while time.perf_counter() < deadline:
        if _is_agent_teams_base_url_healthy(base_url):
            return True
        time.sleep(0.1)
    return False


def _is_local_fast_base_url_host(host: str) -> bool:
    normalized = host.strip("[]").lower()
    if normalized == "localhost":
        return True
    try:
        address = ipaddress.ip_address(normalized)
    except ValueError:
        return False
    return address.is_loopback or address.is_unspecified


def _is_agent_teams_healthy(*, host: str, port: int) -> bool:
    try:
        payload = _http_get_json(host=host, port=port, path="/api/system/health")
    except (OSError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError):
        return False
    return _health_payload_indicates_ready(payload)


def _is_agent_teams_live(*, host: str, port: int) -> bool:
    try:
        payload = _http_get_json(host=host, port=port, path="/api/system/live")
    except (OSError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError):
        return False
    return isinstance(payload, dict) and payload.get("status") == "alive"


def _is_agent_teams_base_url_healthy(base_url: str) -> bool:
    parsed = urlparse(base_url)
    if _uses_plain_http_root_health(parsed):
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 80
        return _is_agent_teams_healthy(host=host, port=port)
    try:
        payload = _http_request_json(
            base_url=base_url,
            method="GET",
            path="/api/system/health",
            payload=None,
            timeout_seconds=0.5,
        )
    except (
        OSError,
        RuntimeError,
        TimeoutError,
        json.JSONDecodeError,
        UnicodeDecodeError,
    ):
        return False
    return _health_payload_indicates_ready(payload)


def _health_payload_indicates_ready(payload: object) -> bool:
    if not isinstance(payload, dict):
        return False
    if payload.get("background_startup_pending") or payload.get(
        "background_startup_failures"
    ):
        return False
    if payload.get("status") == "ok":
        return True
    return payload.get("hydrated") is True and payload.get("startup_phase") == "ready"


def _uses_plain_http_root_health(parsed: ParseResult) -> bool:
    scheme = parsed.scheme or "http"
    return scheme == "http" and not parsed.path.rstrip("/")


def _http_get_json(*, host: str, port: int, path: str) -> object:
    request_host = _connect_host_for_bind_host(host)
    address = request_host.strip("[]")
    request = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {_http_host_header(request_host, port)}\r\n"
        "Accept: application/json\r\n"
        "Connection: close\r\n"
        "\r\n"
    ).encode("ascii")
    with socket.create_connection((address, port), timeout=0.5) as sock:
        sock.settimeout(0.5)
        sock.sendall(request)
        chunks: list[bytes] = []
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            chunks.append(chunk)
    raw = b"".join(chunks)
    header, separator, body = raw.partition(b"\r\n\r\n")
    if not separator or b" 200 " not in header.splitlines()[0]:
        raise OSError("health endpoint did not return HTTP 200")
    return json.loads(body.decode("utf-8"))


def _find_tcp_listen_pid(*, host: str, port: int) -> int | None:
    normalized_host = host.strip("[]")
    if not normalized_host:
        return None
    if sys.platform.startswith("win"):
        return _find_windows_tcp_listen_pid(port=port)
    return _find_unix_tcp_listen_pid(port=port)


def _is_port_available(*, host: str, port: int) -> bool:
    bind_host = _connect_host_for_bind_host(host).strip("[]")
    family = socket.AF_INET6 if ":" in bind_host else socket.AF_INET
    with socket.socket(family, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((bind_host, port))
        except OSError:
            return False
    return True


def _find_windows_tcp_listen_pid(*, port: int) -> int | None:
    completed = subprocess.run(
        ["netstat", "-ano", "-p", "TCP"],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        return None
    port_suffix = f":{port}"
    for raw_line in completed.stdout.splitlines():
        parts = raw_line.split()
        if len(parts) < 5 or parts[0].upper() != "TCP":
            continue
        local_address = parts[1]
        state = parts[3].upper()
        raw_pid = parts[4]
        if state != "LISTENING" or not local_address.endswith(port_suffix):
            continue
        try:
            return int(raw_pid)
        except ValueError:
            return None
    return None


def _find_unix_tcp_listen_pid(*, port: int) -> int | None:
    completed = subprocess.run(
        ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        return None
    first_pid = completed.stdout.strip().splitlines()[0:1]
    if not first_pid:
        return None
    try:
        return int(first_pid[0])
    except ValueError:
        return None


def _terminate_process_tree(pid: int, *, force: bool) -> None:
    if sys.platform.startswith("win"):
        args = ["taskkill", "/PID", str(pid), "/T"]
        if force:
            args.append("/F")
        subprocess.run(
            args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return
    os.kill(pid, signal.SIGKILL if force else signal.SIGTERM)


def _server_process_file() -> Path:
    return _app_config_dir() / "server-process.json"


def _write_server_process(*, host: str, port: int, pid: int | None = None) -> None:
    package_root = _package_root()
    payload = {
        "pid": os.getpid() if pid is None else pid,
        "host": host,
        "port": port,
        "control_plane_host": None,
        "control_plane_port": None,
        "python_executable": str(Path(sys.executable).expanduser().resolve()),
        "package_root": str(package_root),
        "builtin_skills_dir": str(package_root / "builtin" / "skills"),
    }
    path = _server_process_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _read_server_process() -> dict[str, object]:
    return _read_json_object(_server_process_file())


def _clear_server_process() -> None:
    try:
        _server_process_file().unlink()
    except FileNotFoundError:
        return
    except OSError:
        return


def _fast_prompt_candidate(args: list[str]) -> bool:
    return "-m" in args or "--message" in args


def _run_fast_prompt(args: list[str]) -> None:
    options = _parse_fast_prompt_args(args)
    _ensure_fast_prompt_server(options)
    workspace_id = _resolve_fast_prompt_workspace_id(options)
    resolved_message = _resolve_fast_prompt_slash_command(
        message=options.message,
        workspace_id=workspace_id,
        options=options,
    )
    session = _require_json_object(
        _http_request_json(
            base_url=options.base_url,
            method="POST",
            path="/api/sessions",
            payload={"workspace_id": workspace_id},
        ),
        "/api/sessions",
    )
    session_id = _require_json_string(session, "session_id")
    _configure_fast_prompt_topology(session_id=session_id, options=options)
    run_payload: dict[str, object] = {
        "session_id": session_id,
        "input": [{"kind": "text", "text": resolved_message}],
        "execution_mode": "ai",
        "yolo": options.yolo,
    }
    if options.model_profile is not None:
        run_payload["normal_model_profile"] = options.model_profile

    run = _require_json_object(
        _http_request_json(
            base_url=options.base_url,
            method="POST",
            path="/api/runs",
            payload=run_payload,
        ),
        "/api/runs",
    )
    run_id = _require_json_string(run, "run_id")
    try:
        _stream_fast_prompt_events(base_url=options.base_url, run_id=run_id)
    except KeyboardInterrupt:
        _request_fast_prompt_run_stop(base_url=options.base_url, run_id=run_id)
        raise SystemExit(130) from None
    print()


def _parse_fast_prompt_args(args: list[str]) -> FastPromptOptions:
    values: dict[str, str] = {}
    mode = "normal"
    yolo = True
    daemon = False
    force = False
    no_autostart = False
    index = 0
    while index < len(args):
        arg = args[index]
        value_option_names = {
            "-m",
            "--message",
            "--model",
            "--mode",
            "--role",
            "--orchestration",
            "--workspace",
            "--base-url",
        }
        value_option = _matched_value_option(arg, value_option_names)
        if value_option is not None:
            option_name, inline_value = value_option
            if inline_value is not None:
                values[option_name] = inline_value
                index += 1
                continue
            if index + 1 >= len(args) or args[index + 1].startswith("-"):
                _raise_fast_prompt_usage(f"{arg} requires a value")
            values[option_name] = args[index + 1]
            index += 2
            continue
        if arg in {
            "--yolo",
            "--no-yolo",
            "--daemon",
            "-d",
            "--force",
            "--no-autostart",
        }:
            if arg == "--no-yolo":
                yolo = False
            elif arg == "--yolo":
                yolo = True
            elif arg in {"--daemon", "-d"}:
                daemon = True
            elif arg == "--force":
                force = True
            elif arg == "--no-autostart":
                no_autostart = True
            index += 1
            continue
        if arg.startswith("-"):
            return _delegate_fast_prompt_to_full_cli()
        _raise_fast_prompt_usage("Cannot combine --message with subcommands")

    raw_message = values.get("-m", values.get("--message", "")).strip()
    if not raw_message:
        _raise_fast_prompt_usage("message must not be empty")
    if "--mode" in values:
        mode = values["--mode"].strip().lower()
    if mode not in {"normal", "orchestration"}:
        _raise_fast_prompt_usage("--mode must be normal or orchestration")
    role_id = values.get("--role")
    if role_id is not None:
        role_id = role_id.strip()
        if not role_id:
            _raise_fast_prompt_usage("--role must not be empty")
    orchestration_id = values.get("--orchestration")
    if orchestration_id is not None:
        orchestration_id = orchestration_id.strip()
        if not orchestration_id:
            _raise_fast_prompt_usage("--orchestration must not be empty")
    model_profile = values.get("--model")
    if model_profile is not None:
        model_profile = model_profile.strip()
        if not model_profile:
            _raise_fast_prompt_usage("--model must not be empty")
    if mode == "orchestration" and role_id is not None:
        _raise_fast_prompt_usage("--role can only be used with --mode normal")
    if mode != "orchestration" and orchestration_id is not None:
        _raise_fast_prompt_usage(
            "--orchestration can only be used with --mode orchestration"
        )
    if mode == "orchestration" and model_profile is not None:
        _raise_fast_prompt_usage("--model can only be used with --mode normal")
    workspace = None
    raw_workspace = values.get("--workspace")
    if raw_workspace is not None:
        workspace = Path(raw_workspace).expanduser()
    return FastPromptOptions(
        message=raw_message,
        mode=mode,
        role_id=role_id,
        orchestration_id=orchestration_id,
        model_profile=model_profile,
        workspace=workspace,
        yolo=yolo,
        daemon=daemon,
        force=force,
        no_autostart=no_autostart,
        base_url=values.get("--base-url", DEFAULT_BASE_URL),
    )


def _delegate_fast_prompt_to_full_cli() -> NoReturn:
    _run_full_cli()


def _raise_fast_prompt_usage(message: str) -> NoReturn:
    print(message, file=sys.stderr)
    raise SystemExit(2)


def _ensure_fast_prompt_server(options: FastPromptOptions) -> None:
    host, port = _base_url_host_port(["--base-url", options.base_url])
    if _is_agent_teams_base_url_healthy(options.base_url):
        return
    if options.no_autostart:
        print(
            "Agent Teams server is not running and --no-autostart was provided",
            file=sys.stderr,
        )
        raise SystemExit(1)
    if not _is_local_fast_base_url_host(host):
        print(
            f"Refusing to autostart server for non-local base URL: {options.base_url}",
            file=sys.stderr,
        )
        raise SystemExit(1)
    if options.force:
        process = _read_server_process()
        pid = process.get("pid") if process else None
        if isinstance(pid, int):
            _terminate_process_tree(pid, force=True)
            _clear_server_process()
    _ = options.daemon
    _start_server_daemon(host=host, port=port)
    if not _wait_until_base_url_healthy(
        base_url=options.base_url,
        timeout_seconds=20.0,
    ):
        print("Failed to start local Agent Teams server", file=sys.stderr)
        raise SystemExit(1)


def _resolve_fast_prompt_workspace_id(options: FastPromptOptions) -> str:
    root_path = (
        Path.cwd().resolve()
        if options.workspace is None
        else options.workspace.expanduser().resolve()
    )
    response = _http_request_json(
        base_url=options.base_url,
        method="POST",
        path="/api/workspaces/pick",
        payload={"root_path": str(root_path)},
    )
    payload = _require_json_object(response, "/api/workspaces/pick")
    workspace_payload = payload.get("workspace")
    if not isinstance(workspace_payload, dict):
        raise RuntimeError("Expected workspace details from /api/workspaces/pick")
    return _require_json_string(workspace_payload, "workspace_id")


def _resolve_fast_prompt_slash_command(
    *,
    message: str,
    workspace_id: str,
    options: FastPromptOptions,
) -> str:
    if not message.startswith("/"):
        return message
    response = _http_request_json(
        base_url=options.base_url,
        method="POST",
        path="/api/system/commands:resolve",
        payload={
            "workspace_id": workspace_id,
            "raw_text": message,
            "mode": options.mode,
            "cwd": str(Path.cwd().resolve()),
        },
    )
    payload = _require_json_object(response, "/api/system/commands:resolve")
    matched = payload.get("matched")
    if not isinstance(matched, bool) or not matched:
        return message
    expanded_prompt = payload.get("expanded_prompt")
    if not isinstance(expanded_prompt, str):
        raise RuntimeError("Command resolve response is missing expanded_prompt")
    if not expanded_prompt.strip():
        return message
    return expanded_prompt


def _configure_fast_prompt_topology(
    *, session_id: str, options: FastPromptOptions
) -> None:
    if options.mode == "orchestration":
        _ = _http_request_json(
            base_url=options.base_url,
            method="PATCH",
            path=f"/api/sessions/{session_id}/topology",
            payload={
                "session_mode": "orchestration",
                "orchestration_preset_id": options.orchestration_id,
            },
        )
        return
    if options.role_id is not None:
        _ = _http_request_json(
            base_url=options.base_url,
            method="PATCH",
            path=f"/api/sessions/{session_id}/topology",
            payload={
                "session_mode": "normal",
                "normal_root_role_id": options.role_id,
                "orchestration_preset_id": None,
            },
        )


def _stream_fast_prompt_events(*, base_url: str, run_id: str) -> None:
    parsed = urlparse(base_url)
    host = parsed.hostname or "127.0.0.1"
    if _base_url_requires_proxy(base_url=base_url, host=host):
        _run_full_cli()
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    prefix = parsed.path.rstrip("/")
    path = f"{prefix}/api/runs/{quote(run_id, safe='')}/events"
    request_host = _connect_host_for_bind_host(host)
    address = request_host.strip("[]")
    connection_class = (
        http.client.HTTPSConnection
        if parsed.scheme == "https"
        else http.client.HTTPConnection
    )
    connection = connection_class(address, port, timeout=600.0)
    try:
        connection.request(
            "GET",
            path,
            headers={
                "Host": _http_host_header(request_host, port),
                "Accept": "text/event-stream",
            },
        )
        response = connection.getresponse()
        if response.status != 200:
            body = response.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"HTTP {response.status} while streaming run {run_id}: {body}"
            )
        while True:
            raw_line = response.readline()
            if not raw_line:
                return
            line = raw_line.decode("utf-8", errors="replace").strip()
            if _handle_fast_prompt_stream_line(line):
                return
    finally:
        connection.close()


def _handle_fast_prompt_stream_line(line: str) -> bool:
    if not line or not line.startswith("data:"):
        return False
    payload = line[5:].strip()
    if not payload:
        return False
    event = _require_json_object(json.loads(payload), "run event stream")
    if "error" in event:
        raise RuntimeError(str(event["error"]))
    event_type = event.get("event_type")
    if event_type == "text_delta":
        event_payload = _json_object_from_string(event.get("payload_json"))
        text = event_payload.get("text", event_payload.get("content", ""))
        print(str(text), end="", flush=True)
    return event_type in {"run_completed", "run_failed"}


def _request_fast_prompt_run_stop(*, base_url: str, run_id: str) -> None:
    try:
        _ = _http_request_json(
            base_url=base_url,
            method="POST",
            path=f"/api/runs/{quote(run_id, safe='')}/stop",
            payload={"scope": "main"},
        )
        print("\nRun stop requested.", file=sys.stderr)
    except (OSError, RuntimeError, json.JSONDecodeError):
        print("\nInterrupted; failed to request run stop.", file=sys.stderr)


def _require_json_object(payload: object, path: str) -> dict[str, object]:
    if isinstance(payload, dict):
        return payload
    raise RuntimeError(f"Expected JSON object from {path}")


def _require_json_string(payload: dict[str, object], key: str) -> str:
    value = payload.get(key)
    if isinstance(value, str):
        return value
    raise RuntimeError(f"Field '{key}' must be a string")


def _json_object_from_string(payload_json: object) -> dict[str, object]:
    if not isinstance(payload_json, str) or not payload_json:
        return {}
    decoded = json.loads(payload_json)
    if isinstance(decoded, dict):
        return decoded
    return {}


def _server_backed_no_autostart(args: list[str]) -> bool:
    return (
        "--no-autostart" in args
        and len(args) >= 2
        and args[0] in _COMMAND_SUBCOMMANDS
        and not args[1].startswith("-")
        and args[:1]
        not in (
            ["server"],
            ["skills"],
            ["mcp"],
            ["plugin"],
        )
    )


def _base_url(args: list[str]) -> str:
    return _option_value(args, "--base-url", DEFAULT_BASE_URL)


def _base_url_host_port(args: list[str]) -> tuple[str, int]:
    base_url = _base_url(args)
    parsed = urlparse(base_url)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    return host, port


def _handle_fast_server_json_command(args: list[str]) -> bool:
    if not _fast_server_json_candidate(args):
        return False
    _raise_unknown_fast_options_for_server_json(args)
    base_url = _base_url(args)
    if not _is_agent_teams_base_url_healthy(base_url):
        if "--no-autostart" in args:
            print(
                "Agent Teams server is not ready and --no-autostart was provided",
                file=sys.stderr,
            )
            raise SystemExit(1)
        return False
    route = _fast_server_json_route(args)
    if route is None:
        return False
    method, path, payload = route
    try:
        response = _http_request_json(
            base_url=base_url,
            method=method,
            path=path,
            payload=payload,
        )
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from None
    response = _normalize_fast_server_json_response(args=args, response=response)
    print(json.dumps(response, ensure_ascii=False))
    return True


def _fast_server_json_candidate(args: list[str]) -> bool:
    if len(args) < 2:
        return False
    if len(args) >= 3 and args[:3] in (
        ["agent-runtimes", "registry", "list"],
        ["agent-runtimes", "registry", "refresh"],
        ["agent-runtimes", "registry", "install"],
    ):
        return _wants_json(args)
    command = args[:2]
    if command == ["memories", "delete"]:
        return False
    if command == ["clawhub", "config"]:
        return len(args) >= 3 and (args[2] != "get" or _wants_json(args))
    if command == ["clawhub", "skills"]:
        return len(args) >= 3 and (args[2] not in {"list", "get"} or _wants_json(args))
    if command in (
        ["hooks", "list"],
        ["hooks", "show"],
        ["metrics", "overview"],
        ["metrics", "breakdowns"],
        ["agent-runtimes", "list"],
        ["agent-runtimes", "get"],
        ["agent-runtimes", "save"],
        ["agent-runtimes", "delete"],
        ["agent-runtimes", "test"],
        ["commands", "list"],
        ["commands", "show"],
        ["approvals", "list"],
        ["approvals", "resolve"],
        ["questions", "list"],
        ["questions", "answer"],
        ["runs", "todo"],
        ["env", "proxy-reload"],
        ["env", "probe-web"],
        ["clawhub", "config"],
        ["clawhub", "skills"],
        ["roles", "prompt"],
        ["gateway", "feishu"],
        ["gateway", "wechat"],
        ["memories", "list"],
        ["memories", "get"],
        ["memories", "create"],
        ["memories", "delete"],
        ["memories", "search"],
        ["memories", "evolve"],
        ["memories", "skill-drafts"],
    ):
        return _wants_json(args) or command not in (
            ["hooks", "list"],
            ["hooks", "show"],
            ["metrics", "overview"],
            ["metrics", "breakdowns"],
            ["agent-runtimes", "list"],
            ["agent-runtimes", "get"],
            ["agent-runtimes", "test"],
            ["commands", "list"],
            ["commands", "show"],
            ["questions", "list"],
            ["runs", "todo"],
            ["env", "probe-web"],
            ["roles", "prompt"],
            ["memories", "list"],
            ["memories", "get"],
            ["memories", "create"],
            ["memories", "search"],
            ["memories", "evolve"],
            ["memories", "skill-drafts"],
        )
    return command == ["roles", "validate"]


def _fast_server_json_route(
    args: list[str],
) -> tuple[str, str, dict[str, object] | None] | None:
    if len(args) >= 2 and args[:2] in (["hooks", "list"], ["hooks", "show"]):
        if _wants_json(args):
            return "GET", "/api/system/configs/hooks", None
        return None
    if len(args) >= 2 and args[:2] == ["metrics", "overview"]:
        if _wants_json(args):
            return "GET", f"/api/observability/overview?{_metrics_query(args)}", None
        return None
    if len(args) >= 2 and args[:2] == ["metrics", "breakdowns"]:
        if _wants_json(args):
            return "GET", f"/api/observability/breakdowns?{_metrics_query(args)}", None
        return None
    if len(args) >= 2 and args[:2] == ["agent-runtimes", "list"]:
        if _wants_json(args):
            return "GET", "/api/system/configs/agent-runtimes", None
        return None
    if len(args) >= 3 and args[:2] == ["agent-runtimes", "get"]:
        if not _wants_json(args):
            return None
        runtime_name = _required_fast_positional_arg(args[2:])
        return (
            "GET",
            f"/api/system/configs/agent-runtimes/{quote(runtime_name, safe='')}",
            None,
        )
    if len(args) >= 3 and args[:2] == ["agent-runtimes", "save"]:
        runtime_name = _required_fast_positional_arg(args[2:])
        raw_config = _option_value(args, "--config-json", "")
        payload = _json_object_option(raw_config, "--config-json")
        return (
            "PUT",
            f"/api/system/configs/agent-runtimes/{quote(runtime_name, safe='')}",
            payload,
        )
    if len(args) >= 3 and args[:2] == ["agent-runtimes", "delete"]:
        runtime_name = _required_fast_positional_arg(args[2:])
        return (
            "DELETE",
            f"/api/system/configs/agent-runtimes/{quote(runtime_name, safe='')}",
            None,
        )
    if len(args) >= 3 and args[:2] == ["agent-runtimes", "test"]:
        if "--watch" in args:
            return None
        if not _wants_json(args):
            return None
        runtime_name = _required_fast_positional_arg(args[2:])
        return (
            "POST",
            f"/api/system/configs/agent-runtimes/{quote(runtime_name, safe='')}:test",
            None,
        )
    if len(args) >= 3 and args[:3] == ["agent-runtimes", "registry", "list"]:
        if not _wants_json(args):
            return None
        query = "?refresh=true" if "--refresh" in args else ""
        return "GET", f"/api/system/configs/agent-runtime-registry{query}", None
    if len(args) >= 3 and args[:3] == ["agent-runtimes", "registry", "refresh"]:
        if not _wants_json(args):
            return None
        return "POST", "/api/system/configs/agent-runtime-registry:refresh", None
    if len(args) >= 4 and args[:3] == ["agent-runtimes", "registry", "install"]:
        if not _wants_json(args):
            return None
        registry_id = _required_fast_positional_arg(args[3:])
        registry_payload: dict[str, object] = {}
        raw_distribution = _option_value(args, "--distribution", "").strip()
        if raw_distribution:
            registry_payload["distribution"] = raw_distribution
        raw_env_text = _option_value(args, "--env-json", "")
        if raw_env_text:
            raw_env = _json_object_option(raw_env_text, "--env-json")
            registry_payload["env"] = {
                str(key): str(value) for key, value in raw_env.items()
            }
        agent_id = _option_value(args, "--agent-id", "").strip()
        if agent_id:
            registry_payload["agent_id"] = agent_id
        return (
            "POST",
            (
                "/api/system/configs/agent-runtime-registry/"
                f"{quote(registry_id, safe='')}:install"
            ),
            registry_payload,
        )
    if len(args) >= 2 and args[:2] == ["commands", "list"]:
        if _wants_json(args):
            workspace_id = _resolve_fast_workspace_id(args)
            return (
                "GET",
                f"/api/system/commands?workspace_id={quote(workspace_id, safe='')}",
                None,
            )
        return None
    if len(args) >= 3 and args[:2] == ["commands", "show"]:
        if _wants_json(args):
            workspace_id = _resolve_fast_workspace_id(args)
            command_name = _required_fast_positional_arg(args[2:])
            return (
                "GET",
                (
                    f"/api/system/commands/{quote(command_name, safe='')}"
                    f"?workspace_id={quote(workspace_id, safe='')}"
                ),
                None,
            )
        return None
    if len(args) >= 2 and args[:2] == ["approvals", "list"]:
        run_id = _required_option_value(args, "--run-id")
        return "GET", f"/api/runs/{quote(run_id, safe='')}/tool-approvals", None
    if len(args) >= 2 and args[:2] == ["approvals", "resolve"]:
        run_id = _required_option_value(args, "--run-id")
        tool_call_id = _required_option_value(args, "--tool-call-id")
        approval_payload: dict[str, object] = {
            "action": _required_option_value(args, "--action"),
            "feedback": _option_value(args, "--feedback", ""),
        }
        option_id = _option_value(args, "--option-id", "").strip()
        if option_id:
            approval_payload["option_id"] = option_id
        return (
            "POST",
            (
                f"/api/runs/{quote(run_id, safe='')}/tool-approvals/"
                f"{quote(tool_call_id, safe='')}/resolve"
            ),
            approval_payload,
        )
    if len(args) >= 2 and args[:2] == ["questions", "list"]:
        if _wants_json(args):
            run_id = _required_option_value(args, "--run-id")
            return "GET", f"/api/runs/{quote(run_id, safe='')}/questions", None
        return None
    if len(args) >= 2 and args[:2] == ["questions", "answer"]:
        run_id = _required_option_value(args, "--run-id")
        question_id = _required_option_value(args, "--question-id")
        answers = _json_array_option(
            _required_option_value(args, "--answers-json"),
            "--answers-json",
        )
        return (
            "POST",
            (
                f"/api/runs/{quote(run_id, safe='')}/questions/"
                f"{quote(question_id, safe='')}:answer"
            ),
            {"answers": answers},
        )
    if len(args) >= 2 and args[:2] == ["runs", "todo"]:
        if _wants_json(args):
            run_id = _required_option_value(args, "--run-id")
            return "GET", f"/api/runs/{quote(run_id, safe='')}/todo", None
        return None
    if len(args) >= 2 and args[:2] == ["env", "proxy-reload"]:
        return "POST", "/api/system/configs/proxy:reload", None
    if len(args) >= 3 and args[:2] == ["env", "probe-web"]:
        if _wants_json(args):
            probe_payload: dict[str, object] = {
                "url": _required_fast_positional_arg(args[2:])
            }
            timeout_ms = _option_value(args, "--timeout-ms", "")
            if timeout_ms:
                probe_payload["timeout_ms"] = _int_option_value(
                    args,
                    "--timeout-ms",
                    0,
                )
            return "POST", "/api/system/configs/web:probe", probe_payload
        return None
    if len(args) >= 3 and args[:2] == ["clawhub", "config"]:
        if args[2] == "get":
            if not _wants_json(args):
                return None
            return "GET", "/api/system/configs/clawhub", None
        if args[2] == "save":
            clear_token = "--clear-token" in args
            token_provided = _option_value(args, "--token", "").strip() != ""
            if clear_token and token_provided:
                print(
                    "Options '--clear-token' and '--token' cannot be used together.",
                    file=sys.stderr,
                )
                raise SystemExit(2)
            if clear_token:
                return "PUT", "/api/system/configs/clawhub", {"token": None}
            return (
                "PUT",
                "/api/system/configs/clawhub",
                {"token": _required_option_value(args, "--token")},
            )
    if len(args) >= 3 and args[:2] == ["clawhub", "skills"]:
        if args[2] == "list":
            if not _wants_json(args):
                return None
            return "GET", "/api/system/configs/clawhub/skills", None
        if len(args) >= 4 and args[2] == "get":
            if not _wants_json(args):
                return None
            skill_id = _required_fast_positional_arg(args[3:])
            return (
                "GET",
                f"/api/system/configs/clawhub/skills/{quote(skill_id, safe='')}",
                None,
            )
        if len(args) >= 4 and args[2] == "save":
            skill_id = _required_fast_positional_arg(args[3:])
            payload = _json_object_option(
                _required_option_value(args, "--config-json"),
                "--config-json",
            )
            return (
                "PUT",
                f"/api/system/configs/clawhub/skills/{quote(skill_id, safe='')}",
                payload,
            )
        if len(args) >= 4 and args[2] == "delete":
            skill_id = _required_fast_positional_arg(args[3:])
            return (
                "DELETE",
                f"/api/system/configs/clawhub/skills/{quote(skill_id, safe='')}",
                None,
            )
    if len(args) >= 3 and args[:2] == ["gateway", "feishu"]:
        return _fast_gateway_route(provider="feishu", args=args[2:])
    if len(args) >= 3 and args[:2] == ["gateway", "wechat"]:
        return _fast_gateway_route(provider="wechat", args=args[2:])
    if len(args) >= 2 and args[:2] == ["memories", "list"]:
        if _wants_json(args):
            workspace_id = _option_value(args, "--workspace-id", "").strip()
            if not workspace_id:
                return None
            params: dict[str, str] = {}
            for option_name, query_name in (
                ("--tier", "tier"),
                ("--scope", "scope"),
                ("--role-id", "role_id"),
            ):
                value = _option_value(args, option_name, "").strip()
                if value:
                    params[query_name] = value
            query = f"?{urlencode(params)}" if params else ""
            return (
                "GET",
                f"/api/workspaces/{quote(workspace_id, safe='')}/memories{query}",
                None,
            )
        return None
    if len(args) >= 2 and args[:2] == ["memories", "get"]:
        if _wants_json(args):
            workspace_id = _required_option_value(args, "--workspace-id")
            memory_id = _required_option_value(args, "--memory-id")
            return (
                "GET",
                (
                    f"/api/workspaces/{quote(workspace_id, safe='')}/memories/"
                    f"{quote(memory_id, safe='')}"
                ),
                None,
            )
        return None
    if len(args) >= 2 and args[:2] == ["memories", "create"]:
        if _wants_json(args):
            workspace_id = _required_option_value(args, "--workspace-id")
            content = _required_option_value(args, "--content")
            body: dict[str, object] = {
                "workspace_id": workspace_id,
                "content": {
                    "title": _option_value(args, "--title", "") or content[:80],
                    "body": content,
                },
                "tier": _option_value(args, "--tier", "persistent"),
                "scope": _option_value(args, "--scope", "workspace"),
                "kind": _option_value(args, "--kind", "fact"),
            }
            tags = _option_value(args, "--tags", "")
            if tags.strip():
                body["tags"] = [tag.strip() for tag in tags.split(",") if tag.strip()]
            return (
                "POST",
                f"/api/workspaces/{quote(workspace_id, safe='')}/memories",
                body,
            )
        return None
    if len(args) >= 2 and args[:2] == ["memories", "search"]:
        if _wants_json(args):
            workspace_id = _required_option_value(args, "--workspace-id")
            return (
                "POST",
                f"/api/workspaces/{quote(workspace_id, safe='')}/memories/search",
                {
                    "workspace_id": workspace_id,
                    "text_query": _required_option_value(args, "--query"),
                },
            )
        return None
    if len(args) >= 3 and args[:2] == ["memories", "evolve"]:
        return _fast_memory_evolve_route(args[2:])
    if len(args) >= 3 and args[:2] == ["memories", "skill-drafts"]:
        return _fast_memory_skill_drafts_route(args[2:])
    if len(args) >= 2 and args[:2] == ["roles", "validate"]:
        return "POST", "/api/roles:validate", {}
    if len(args) >= 2 and args[:2] == ["roles", "prompt"]:
        if not _wants_json(args):
            return None
        payload: dict[str, object] = {
            "role_id": _required_option_value(args, "--role-id"),
            "shared_state": _json_object_option(
                _option_value(args, "--shared-state-json", "{}"),
                "--shared-state-json",
            ),
        }
        objective = _option_value(args, "--objective", "")
        if objective:
            payload["objective"] = objective
        tools = _option_values(args, "--tool")
        skills = _option_values(args, "--skill")
        if tools:
            payload["tools"] = tools
        if skills:
            payload["skills"] = skills
        return "POST", "/api/prompts:preview", payload
    return None


def _normalize_fast_server_json_response(
    *, args: list[str], response: object
) -> object:
    if (
        len(args) >= 2
        and args[:2] == ["roles", "prompt"]
        and isinstance(response, dict)
    ):
        return _select_fast_prompt_sections(
            response,
            section=_option_value(args, "--section", "all"),
        )
    return response


def _select_fast_prompt_sections(
    payload: dict[str, object], *, section: str
) -> dict[str, object]:
    normalized = section.strip().lower()
    if normalized == "runtime":
        return {"runtime_system_prompt": payload.get("runtime_system_prompt", "")}
    if normalized == "provider":
        return {"provider_system_prompt": payload.get("provider_system_prompt", "")}
    if normalized == "user":
        return {"user_prompt": payload.get("user_prompt", "")}
    if normalized == "tools":
        return {"tools": payload.get("tools", [])}
    if normalized == "skills":
        return {"skills": payload.get("skills", [])}
    return {
        "provider_system_prompt": payload.get("provider_system_prompt", ""),
        "user_prompt": payload.get("user_prompt", ""),
    }


def _fast_gateway_route(
    *, provider: str, args: list[str]
) -> tuple[str, str, dict[str, object] | None] | None:
    command = args[0]
    base_path = f"/api/gateway/{provider}"
    if command == "list":
        return "GET", f"{base_path}/accounts", None
    if provider == "feishu" and command == "create":
        return (
            "POST",
            f"{base_path}/accounts",
            _json_object_option(
                _required_option_value(args, "--payload-json"),
                "--payload-json",
            ),
        )
    if provider == "wechat" and command == "connect":
        payload: dict[str, object] = {
            "bot_type": _option_value(args, "--bot-type", "3")
        }
        base_url_override = _option_value(args, "--wechat-base-url", "")
        route_tag = _option_value(args, "--route-tag", "")
        if base_url_override:
            payload["base_url"] = base_url_override
        if route_tag:
            payload["route_tag"] = route_tag
        return "POST", f"{base_path}/login/start", payload
    if provider == "wechat" and command == "wait":
        return (
            "POST",
            f"{base_path}/login/wait",
            {
                "session_key": _required_option_value(args, "--session-key"),
                "timeout_ms": _int_option_value(args, "--timeout-ms", 480000),
            },
        )
    if command in {"update", "enable", "disable", "delete"}:
        account_id = _required_option_value(args, "--account-id")
        account_path = f"{base_path}/accounts/{quote(account_id, safe='')}"
        if command == "update":
            return (
                "PATCH",
                account_path,
                _json_object_option(
                    _required_option_value(args, "--payload-json"),
                    "--payload-json",
                ),
            )
        if command == "enable":
            return "POST", f"{account_path}:enable", None
        if command == "disable":
            return "POST", f"{account_path}:disable", None
        return (
            "DELETE",
            account_path,
            {
                "force": _flag_pair_value(
                    args,
                    positive="--force-delete",
                    negative="--no-force-delete",
                    default=True,
                )
            },
        )
    if command == "reload":
        return "POST", f"{base_path}/reload", None
    return None


def _fast_memory_evolve_route(
    args: list[str],
) -> tuple[str, str, dict[str, object] | None] | None:
    command = args[0]
    workspace_id = _required_option_value(args, "--workspace-id")
    base_path = f"/api/workspaces/{quote(workspace_id, safe='')}/memories/evolutions"
    if command == "create":
        if not _wants_json(args):
            return None
        return (
            "POST",
            base_path,
            {
                "workspace_id": workspace_id,
                "source_memory_ids": _option_values(args, "--memory-id"),
                "target": _option_value(args, "--target", "sop_skill"),
                "skill_id": _required_option_value(args, "--skill-id"),
                "runtime_name": _required_option_value(args, "--runtime-name"),
                "description": _option_value(args, "--description", ""),
                "objective": _option_value(args, "--objective", ""),
            },
        )
    if command == "list":
        if not _wants_json(args):
            return None
        params: dict[str, str] = {}
        for option_name, query_name in (("--target", "target"), ("--status", "status")):
            value = _option_value(args, option_name, "").strip()
            if value:
                params[query_name] = value
        query = f"?{urlencode(params)}" if params else ""
        return "GET", f"{base_path}{query}", None
    if command == "apply":
        if not _wants_json(args):
            return None
        draft_id = _required_option_value(args, "--draft-id")
        return "POST", f"{base_path}/{quote(draft_id, safe='')}:apply", {}
    if command == "reject":
        if not _wants_json(args):
            return None
        draft_id = _required_option_value(args, "--draft-id")
        return (
            "POST",
            f"{base_path}/{quote(draft_id, safe='')}:reject",
            {"reason": _option_value(args, "--reason", "")},
        )
    return None


def _fast_memory_skill_drafts_route(
    args: list[str],
) -> tuple[str, str, dict[str, object] | None] | None:
    command = args[0]
    if command == "generate":
        if not _wants_json(args):
            return None
        draft_body: dict[str, object] = {
            "scope_kind": "cross_workspace"
            if "--cross-workspace" in args
            else "workspace",
            "draft_kind": _option_value(args, "--kind", "auto"),
        }
        workspace_id = _option_value(args, "--workspace-id", "").strip()
        if workspace_id:
            if "--cross-workspace" in args:
                draft_body["workspace_ids"] = [workspace_id]
            else:
                draft_body["workspace_id"] = workspace_id
        query = _option_value(args, "--query", "").strip()
        if query:
            draft_body["text_query"] = query
        return "POST", "/api/memories/skill-drafts:generate", draft_body
    if command == "list":
        if not _wants_json(args):
            return None
        params: dict[str, str] = {}
        for option_name, query_name in (
            ("--workspace-id", "workspace_id"),
            ("--status", "status"),
        ):
            value = _option_value(args, option_name, "").strip()
            if value:
                params[query_name] = value
        query = f"?{urlencode(params)}" if params else ""
        return "GET", f"/api/memories/skill-drafts{query}", None
    if command == "get":
        if not _wants_json(args):
            return None
        draft_id = _required_option_value(args, "--draft-id")
        return "GET", f"/api/memories/skill-drafts/{quote(draft_id, safe='')}", None
    if command == "update":
        if not _wants_json(args):
            return None
        draft_id = _required_option_value(args, "--draft-id")
        body: dict[str, object] = {}
        for option_name, field_name in (
            ("--runtime-name", "runtime_name"),
            ("--description", "description"),
            ("--instructions", "instructions"),
            ("--status", "status"),
        ):
            value = _option_value(args, option_name, "")
            if value:
                body[field_name] = value
        return "PUT", f"/api/memories/skill-drafts/{quote(draft_id, safe='')}", body
    if command in {"validate", "apply"}:
        if not _wants_json(args):
            return None
        draft_id = _required_option_value(args, "--draft-id")
        return (
            "POST",
            f"/api/memories/skill-drafts/{quote(draft_id, safe='')}:{command}",
            None,
        )
    return None


def _required_option_value(args: list[str], name: str) -> str:
    value = _option_value(args, name, "")
    if value:
        return value
    print(f"Missing option '{name}'.", file=sys.stderr)
    raise SystemExit(2)


def _required_fast_positional_arg(args: list[str]) -> str:
    value = _first_positional_arg(args)
    if value:
        return value
    print("Missing required argument.", file=sys.stderr)
    raise SystemExit(2)


def _json_object_option(raw: str, option_name: str) -> dict[str, object]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        print(f"{option_name} must be valid JSON", file=sys.stderr)
        raise SystemExit(2) from None
    if not isinstance(parsed, dict):
        print(f"{option_name} must be a JSON object", file=sys.stderr)
        raise SystemExit(2)
    return {str(key): value for key, value in parsed.items()}


def _json_array_option(raw: str, option_name: str) -> list[object]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        print(f"{option_name} must be valid JSON", file=sys.stderr)
        raise SystemExit(2) from None
    if not isinstance(parsed, list):
        print(f"{option_name} must be a JSON array", file=sys.stderr)
        raise SystemExit(2)
    return parsed


def _metrics_query(args: list[str]) -> str:
    return urlencode(
        {
            "scope": _option_value(args, "--scope", "global"),
            "scope_id": _option_value(args, "--scope-id", ""),
            "time_window_minutes": _option_value(args, "--window-minutes", "1440"),
        }
    )


def _resolve_fast_workspace_id(args: list[str]) -> str:
    base_url = _option_value(args, "--base-url", DEFAULT_BASE_URL)
    raw_workspace = _option_value(args, "--workspace", "")
    if raw_workspace.strip():
        workspace = raw_workspace.strip()
        workspace_path = Path(workspace).expanduser()
        if not _looks_like_path(workspace) and _fast_workspace_id_exists(
            base_url=base_url,
            workspace_id=workspace,
        ):
            return workspace
        if not _looks_like_path(workspace) and not workspace_path.exists():
            return workspace
        root_path = str(workspace_path.resolve())
    else:
        root_path = str(Path.cwd().resolve())
    payload = _http_request_json(
        base_url=base_url,
        method="POST",
        path="/api/workspaces/pick",
        payload={"root_path": root_path},
    )
    if not isinstance(payload, dict):
        raise RuntimeError("Expected object response from /api/workspaces/pick")
    workspace_payload = payload.get("workspace")
    if not isinstance(workspace_payload, dict):
        raise RuntimeError("Expected workspace details from /api/workspaces/pick")
    workspace_id = workspace_payload.get("workspace_id")
    if not isinstance(workspace_id, str) or not workspace_id.strip():
        raise RuntimeError("Workspace response is missing workspace_id")
    return workspace_id


def _fast_workspace_id_exists(*, base_url: str, workspace_id: str) -> bool:
    try:
        payload = _http_request_json(
            base_url=base_url,
            method="GET",
            path=f"/api/workspaces/{quote(workspace_id, safe='')}",
            payload=None,
        )
    except (OSError, RuntimeError, TimeoutError, json.JSONDecodeError):
        return False
    return isinstance(payload, dict)


def _looks_like_path(value: str) -> bool:
    candidate = value.strip()
    if candidate in {".", ".."}:
        return True
    if candidate.startswith("~"):
        return True
    if "\\" in candidate or "/" in candidate:
        return True
    if len(candidate) >= 2 and candidate[1] == ":":
        return True
    return False


def _http_request_json(
    *,
    base_url: str,
    method: str,
    path: str,
    payload: dict[str, object] | None,
    timeout_seconds: float = 10.0,
) -> object:
    parsed = urlparse(base_url)
    scheme = parsed.scheme or "http"
    if scheme not in {"http", "https"}:
        raise RuntimeError(f"Unsupported URL scheme: {scheme}")
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (443 if scheme == "https" else 80)
    if _base_url_requires_proxy(base_url=base_url, host=host):
        _run_full_cli()
    prefix = parsed.path.rstrip("/")
    request_path = f"{prefix}{path}" if prefix else path
    request_host = _connect_host_for_bind_host(host)
    address = request_host.strip("[]")
    body = b""
    headers = [
        f"{method} {request_path} HTTP/1.1",
        f"Host: {_http_host_header(request_host, port)}",
        "Accept: application/json",
        "Connection: close",
    ]
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers.extend(
            [
                "Content-Type: application/json",
                f"Content-Length: {len(body)}",
            ]
        )
    raw_request = ("\r\n".join(headers) + "\r\n\r\n").encode("ascii") + body
    with socket.create_connection((address, port), timeout=timeout_seconds) as raw_sock:
        raw_sock.settimeout(timeout_seconds)
        if scheme == "https":
            context = ssl.create_default_context()
            with context.wrap_socket(raw_sock, server_hostname=host) as sock:
                chunks = _send_raw_http_request(sock=sock, raw_request=raw_request)
        else:
            chunks = _send_raw_http_request(sock=raw_sock, raw_request=raw_request)
    raw = b"".join(chunks)
    header, separator, response_body = raw.partition(b"\r\n\r\n")
    if not separator:
        raise RuntimeError("Server response did not include an HTTP body")
    status_line = header.splitlines()[0]
    status_parts = status_line.split()
    status_code = int(status_parts[1]) if len(status_parts) >= 2 else 0
    if _response_uses_chunked_transfer(header):
        response_body = _decode_chunked_http_body(response_body)
    if status_code < 200 or status_code >= 300:
        detail = response_body.decode("utf-8", errors="replace")
        raise RuntimeError(
            f"HTTP request failed: {status_line.decode('ascii')} {detail}"
        )
    if not response_body:
        return {}
    return json.loads(response_body.decode("utf-8"))


def _response_uses_chunked_transfer(header: bytes) -> bool:
    for header_line in header.splitlines()[1:]:
        name, separator, value = header_line.partition(b":")
        if (
            separator
            and name.strip().lower() == b"transfer-encoding"
            and b"chunked" in {part.strip().lower() for part in value.split(b",")}
        ):
            return True
    return False


def _decode_chunked_http_body(body: bytes) -> bytes:
    decoded = bytearray()
    position = 0
    while True:
        line_end = body.find(b"\r\n", position)
        if line_end < 0:
            raise RuntimeError("Malformed chunked HTTP response")
        size_token = body[position:line_end].split(b";", 1)[0].strip()
        try:
            chunk_size = int(size_token, 16)
        except ValueError as exc:
            raise RuntimeError("Malformed chunked HTTP response") from exc
        position = line_end + 2
        if chunk_size == 0:
            return bytes(decoded)
        chunk_end = position + chunk_size
        if len(body) < chunk_end + 2 or body[chunk_end : chunk_end + 2] != b"\r\n":
            raise RuntimeError("Malformed chunked HTTP response")
        decoded.extend(body[position:chunk_end])
        position = chunk_end + 2


def _base_url_requires_proxy(*, base_url: str, host: str) -> bool:
    if _is_local_fast_base_url_host(host):
        return False
    proxy_env = _load_fast_proxy_env()
    if not _fast_proxy_configured(base_url=base_url, proxy_env=proxy_env):
        return False
    no_proxy = proxy_env.get("NO_PROXY") or proxy_env.get("no_proxy") or ""
    return not _fast_no_proxy_matches(host=host, no_proxy=no_proxy)


def _load_fast_proxy_env() -> dict[str, str]:
    merged = _load_fast_env_file(_app_config_dir() / ".env")
    merged.update(os.environ)
    return merged


def _fast_proxy_configured(*, base_url: str, proxy_env: dict[str, str]) -> bool:
    scheme = (urlparse(base_url).scheme or "http").upper()
    proxy_keys = (
        f"{scheme}_PROXY",
        f"{scheme.lower()}_proxy",
        "ALL_PROXY",
        "all_proxy",
    )
    return any(proxy_env.get(key, "").strip() for key in proxy_keys)


def _fast_no_proxy_matches(*, host: str, no_proxy: str) -> bool:
    normalized_host = host.strip("[]").lower()
    if not normalized_host:
        return False
    for raw_entry in no_proxy.split(","):
        entry = raw_entry.strip().lower()
        if not entry:
            continue
        if entry == "*":
            return True
        entry_host = entry.split(":", 1)[0].strip("[]")
        if not entry_host:
            continue
        if entry_host.startswith("."):
            if normalized_host.endswith(entry_host):
                return True
            if normalized_host == entry_host[1:]:
                return True
            continue
        if normalized_host == entry_host or normalized_host.endswith(f".{entry_host}"):
            return True
    return False


def _http_host_header(host: str, port: int) -> str:
    normalized = host.strip("[]")
    try:
        address = ipaddress.ip_address(normalized)
    except ValueError:
        return f"{host}:{port}"
    if address.version == 6:
        return f"[{normalized}]:{port}"
    return f"{normalized}:{port}"


def _connect_host_for_bind_host(host: str) -> str:
    normalized = host.strip("[]")
    try:
        address = ipaddress.ip_address(normalized)
    except ValueError:
        return host
    if not address.is_unspecified:
        return host
    return "::1" if address.version == 6 else "127.0.0.1"


def _send_raw_http_request(
    *, sock: socket.socket | ssl.SSLSocket, raw_request: bytes
) -> list[bytes]:
    sock.sendall(raw_request)
    chunks: list[bytes] = []
    while True:
        chunk = sock.recv(65536)
        if not chunk:
            break
        chunks.append(chunk)
    return chunks


def _run_full_cli() -> NoReturn:
    completed = subprocess.run(
        [sys.executable, "-m", "relay_teams.interfaces.cli.app_full", *sys.argv[1:]],
        check=False,
    )
    raise SystemExit(completed.returncode)


def _matched_value_option(
    token: str, option_names: frozenset[str] | set[str]
) -> tuple[str, str | None] | None:
    for name in option_names:
        if token == name:
            return name, None
        inline_prefix = f"{name}="
        if token.startswith(inline_prefix):
            return name, token[len(inline_prefix) :]
    return None


def _option_value(args: list[str], name: str, default: str) -> str:
    inline_prefix = f"{name}="
    value = default
    index = 0
    while index < len(args):
        token = args[index]
        if token == "--":
            break
        if token.startswith(inline_prefix):
            value = token[len(inline_prefix) :]
            index += 1
            continue
        if token != name:
            index += 1
            continue
        if index + 1 >= len(args) or args[index + 1].startswith("-"):
            _raise_missing_option_value(name)
        value = args[index + 1]
        index += 2
    return value


def _int_option_value(args: list[str], name: str, default: int) -> int:
    raw_value = _option_value(args, name, str(default))
    try:
        return int(raw_value)
    except ValueError:
        print(f"Invalid value for '{name}': {raw_value}", file=sys.stderr)
        raise SystemExit(2) from None


def _flag_pair_value(
    args: list[str], *, positive: str, negative: str, default: bool
) -> bool:
    value = default
    for token in args:
        if token == "--":
            break
        if token == positive:
            value = True
        elif token == negative:
            value = False
    return value


def _raise_missing_option_value(name: str) -> NoReturn:
    print(f"Option '{name}' requires a value.", file=sys.stderr)
    raise SystemExit(2)


def _raise_unknown_fast_options_for_command(
    command: tuple[str, ...],
    args: list[str],
) -> None:
    value_options, flag_options = _FAST_LOCAL_OPTION_SCOPES[command]
    min_positionals, max_positionals = _FAST_LOCAL_POSITIONAL_ARITY[command]
    _raise_unknown_fast_options(
        args,
        value_options=value_options,
        flag_options=flag_options,
        min_positionals=min_positionals,
        max_positionals=max_positionals,
        missing_argument_message=_FAST_LOCAL_MISSING_ARGUMENT.get(command),
    )


def _raise_unknown_fast_options_for_plugin(command: str, args: list[str]) -> None:
    key = (
        ("plugin", "list", "available")
        if command == "list" and "--available" in args
        else ("plugin", command)
    )
    value_options, flag_options = _FAST_PLUGIN_OPTION_SCOPES[key]
    min_positionals, max_positionals = _FAST_PLUGIN_POSITIONAL_ARITY[key]
    _raise_unknown_fast_options(
        args,
        value_options=value_options,
        flag_options=flag_options,
        min_positionals=min_positionals,
        max_positionals=max_positionals,
        missing_argument_message=_FAST_PLUGIN_MISSING_ARGUMENT.get(key),
    )


def _raise_unknown_fast_options_for_server_json(args: list[str]) -> None:
    command = _fast_server_json_option_scope_key(args)
    value_options, flag_options = _FAST_SERVER_JSON_OPTION_SCOPES[command]
    min_positionals, max_positionals = _FAST_SERVER_JSON_POSITIONAL_ARITY[command]
    _raise_unknown_fast_options(
        args[len(command) :],
        value_options=value_options | _COMMON_FAST_VALUE_OPTIONS,
        flag_options=flag_options | _COMMON_FAST_FLAG_OPTIONS,
        min_positionals=min_positionals,
        max_positionals=max_positionals,
    )


def _fast_server_json_option_scope_key(args: list[str]) -> tuple[str, ...]:
    for length in (3, 2):
        command = tuple(args[:length])
        if command in _FAST_SERVER_JSON_OPTION_SCOPES:
            return command
    print("Unsupported fast command.", file=sys.stderr)
    raise SystemExit(2)


def _raise_unknown_fast_options(
    args: list[str],
    *,
    value_options: frozenset[str] = _OPTIONS_WITH_VALUES,
    flag_options: frozenset[str] = _FAST_FLAG_OPTIONS,
    min_positionals: int | None = None,
    max_positionals: int | None = None,
    missing_argument_message: str | None = None,
) -> None:
    index = 0
    positionals: list[str] = []
    while index < len(args):
        token = args[index]
        if token == "--":
            positionals.extend(args[index + 1 :])
            break
        if not token.startswith("-") or token == "-":
            positionals.append(token)
            index += 1
            continue
        value_option = _matched_value_option(token, value_options)
        if value_option is not None:
            option_name, inline_value = value_option
            if inline_value is None:
                if index + 1 >= len(args) or (
                    args[index + 1].startswith("-") and option_name != "--arg"
                ):
                    _raise_missing_option_value(option_name)
                index += 2
            else:
                index += 1
            continue
        if token in flag_options:
            index += 1
            continue
        print(f"No such option '{token}'.", file=sys.stderr)
        raise SystemExit(2)
    if min_positionals is not None and len(positionals) < min_positionals:
        print(missing_argument_message or "Missing required argument.", file=sys.stderr)
        raise SystemExit(2)
    if max_positionals is not None and len(positionals) > max_positionals:
        print(
            f"Got unexpected extra argument '{positionals[max_positionals]}'.",
            file=sys.stderr,
        )
        raise SystemExit(2)


def _wants_json(args: list[str]) -> bool:
    return _option_value(args, "--format", "table").lower() == "json"


def _app_config_dir() -> Path:
    raw = os.environ.get("RELAY_TEAMS_CONFIG_DIR", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return Path.home() / ".relay-teams"


def _project_root(start: Path | None = None) -> Path | None:
    current = (start or Path.cwd()).resolve()
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists():
            return candidate
    return None


def _package_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _skills_list(args: list[str]) -> None:
    source_filter = _option_value(args, "--source", "all")
    rows = [
        row
        for row in _discover_skill_rows()
        if source_filter == "all" or row["source"] == source_filter
    ]
    if _wants_json(args):
        print(json.dumps(rows, ensure_ascii=False))
        return
    _render_table(
        "Skills",
        rows,
        ("name", "source", "directory", "description"),
    )


def _skills_show(args: list[str]) -> None:
    name = _first_positional_arg(args)
    if not name:
        print("Missing argument 'NAME'.", file=sys.stderr)
        raise SystemExit(2)
    skill = _resolve_skill_detail(name)
    if skill is None:
        print(f"Unknown skill: {name}", file=sys.stderr)
        raise SystemExit(2)
    if _wants_json(args):
        print(json.dumps(skill, ensure_ascii=False))
        return
    _render_skill_detail(skill)


def _first_positional_arg(args: list[str]) -> str:
    index = 0
    while index < len(args):
        value = args[index]
        if value == "--":
            return args[index + 1] if index + 1 < len(args) else ""
        value_option = _matched_value_option(value, _OPTIONS_WITH_VALUES)
        if value_option is not None:
            inline_value = value_option[1]
            index += 1 if inline_value is not None else 2
            continue
        if value.startswith("-"):
            index += 1
            continue
        return value
    return ""


def _discover_skill_rows() -> list[dict[str, object]]:
    by_name: dict[str, dict[str, object]] = {}
    for source, base in _skill_source_dirs():
        if not base.exists():
            continue
        for manifest in _iter_skill_manifest_paths(base):
            row = _skill_row(source=source, manifest=manifest)
            if row is None:
                continue
            by_name[str(row["name"])] = row
    return [by_name[name] for name in sorted(by_name)]


def _skill_source_dirs() -> list[tuple[str, Path]]:
    app_config_dir = _app_config_dir()
    home_dir = app_config_dir.parent
    sources: list[tuple[str, Path]] = [
        ("builtin", _package_root() / "builtin" / "skills"),
        ("user_codex", home_dir / ".codex" / "skills"),
        ("user_claude", home_dir / ".claude" / "skills"),
        ("user_opencode", home_dir / ".config" / "opencode" / "skills"),
        ("user_relay_teams", app_config_dir / "skills"),
        ("user_agents", home_dir / ".agents" / "skills"),
    ]
    sources.extend(_project_skill_source_dirs())
    return sources


def _project_skill_source_dirs() -> list[tuple[str, Path]]:
    start_dir = Path.cwd().resolve()
    project_root = _project_root(start_dir)
    stop_dir = start_dir if project_root is None else project_root
    parent_dirs: list[Path] = []
    current = start_dir
    while True:
        parent_dirs.append(current)
        if current == stop_dir or current.parent == current:
            break
        current = current.parent
    source_specs = (
        ("project_codex", ".codex"),
        ("project_claude", ".claude"),
        ("project_opencode", ".opencode"),
        ("project_relay_teams", ".relay-teams"),
        ("project_agents", ".agents"),
    )
    return [
        (source, parent_dir / directory_name / "skills")
        for source, directory_name in source_specs
        for parent_dir in parent_dirs
    ]


def _iter_skill_manifest_paths(base_dir: Path) -> tuple[Path, ...]:
    return tuple(
        path
        for path in sorted(base_dir.rglob("SKILL.md"))
        if len(path.relative_to(base_dir).parts) <= _SKILL_MANIFEST_MAX_DEPTH + 1
    )


def _skill_row(*, source: str, manifest: Path) -> dict[str, object] | None:
    text = _read_text(manifest)
    parsed = _parse_skill_manifest(text)
    if parsed is None:
        return None
    metadata, _instructions = parsed
    name = metadata.get("name") or manifest.parent.name
    description = metadata.get("description") or ""
    return {
        "ref": f"{source}:{name}",
        "name": name,
        "source": source,
        "directory": manifest.parent.as_posix(),
        "description": description,
    }


def _resolve_skill_detail(name: str) -> dict[str, object] | None:
    skill_map = {str(row["name"]): row for row in _discover_skill_rows()}
    normalized_name = _normalize_legacy_skill_name(name=name, skill_map=skill_map)
    row = skill_map.get(normalized_name)
    if row is None:
        return None
    manifest = Path(str(row["directory"])) / "SKILL.md"
    text = _read_text(manifest)
    parsed = _parse_skill_manifest(text)
    if parsed is None:
        return None
    metadata, instructions = parsed
    directory = manifest.parent
    resources = _skill_resource_rows(directory=directory, metadata=metadata)
    scripts = _skill_script_rows(directory=directory, instructions=instructions)
    return {
        "ref": row["ref"],
        "name": row["name"],
        "description": row["description"],
        "manifest_path": _path_text(manifest),
        "manifest_content": text,
        "instructions": instructions.strip(),
        "source": row["source"],
        "directory": row["directory"],
        "resources": resources,
        "scripts": scripts,
        "files": _iter_skill_file_paths(directory),
    }


def _normalize_legacy_skill_name(
    *, name: str, skill_map: dict[str, dict[str, object]]
) -> str:
    prefix, separator, suffix = name.partition(":")
    if separator != ":" or prefix.strip().lower() not in {"app", "builtin"}:
        return name
    normalized = suffix.strip()
    if normalized not in skill_map:
        return name
    return normalized


def _parse_skill_manifest(text: str) -> tuple[dict[str, object], str] | None:
    split = _split_skill_frontmatter(text)
    if split is None:
        return None
    frontmatter, instructions = split
    try:
        parsed = yaml.safe_load(frontmatter)
    except yaml.YAMLError:
        return None
    if not isinstance(parsed, dict):
        return None
    metadata = {str(key): value for key, value in parsed.items()}
    name = metadata.get("name")
    if not isinstance(name, str) or not name.strip():
        return None
    return metadata, instructions


def _split_skill_frontmatter(text: str) -> tuple[str, str] | None:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end_index = index
            break
    else:
        return None
    frontmatter = "\n".join(lines[1:end_index])
    instructions = "\n".join(lines[end_index + 1 :])
    return frontmatter, instructions


def _skill_resource_rows(
    *, directory: Path, metadata: dict[str, object]
) -> list[dict[str, object]]:
    rows_by_name: dict[str, dict[str, object]] = {}
    resource_entries = metadata.get("resources")
    if isinstance(resource_entries, dict):
        for raw_name, raw_resource in resource_entries.items():
            if not isinstance(raw_resource, dict):
                continue
            resource_name = str(raw_name)
            raw_path = raw_resource.get("path")
            path = directory / raw_path if isinstance(raw_path, str) else None
            rows_by_name[resource_name] = {
                "name": resource_name,
                "description": _coerce_string(raw_resource.get("description")),
                "path": _path_text(path) if path is not None else None,
                "content": None,
            }
    for resource_dir_name in ("resources", "assets"):
        resource_dir = directory / resource_dir_name
        if not resource_dir.exists() or not resource_dir.is_dir():
            continue
        for resource_path in sorted(resource_dir.glob("*")):
            if not resource_path.is_file() or resource_path.name in rows_by_name:
                continue
            rows_by_name[resource_path.name] = {
                "name": resource_path.name,
                "description": f"Auto-discovered resource: {resource_path.name}",
                "path": _path_text(resource_path),
                "content": None,
            }
    for script in _skill_script_rows(directory=directory, instructions=""):
        script_path = script.get("path")
        script_name = script.get("name")
        if not isinstance(script_path, str) or not isinstance(script_name, str):
            continue
        resource_name = f"scripts/{Path(script_path).name}"
        rows_by_name[resource_name] = {
            "name": resource_name,
            "description": f"Script source: {script_name}",
            "path": script_path,
            "content": None,
        }
    return [rows_by_name[name] for name in sorted(rows_by_name)]


def _skill_script_rows(
    *, directory: Path, instructions: str
) -> list[dict[str, object]]:
    scripts_dir = directory / "scripts"
    if not scripts_dir.exists() or not scripts_dir.is_dir():
        return []
    script_meta: dict[str, str] = {}
    for match in _SCRIPT_DESCRIPTION_PATTERN.finditer(instructions):
        script_name, script_description, _script_path = match.groups()
        script_meta[script_name] = script_description.strip()
    rows: list[dict[str, object]] = []
    for script_path in sorted(scripts_dir.glob("*.py")):
        script_name = script_path.stem
        rows.append(
            {
                "name": script_name,
                "description": script_meta.get(
                    script_name, f"Execute {script_name} script."
                ),
                "path": _path_text(script_path),
            }
        )
    return rows


def _iter_skill_file_paths(skill_dir: Path) -> list[str]:
    return [_path_text(path) for path in sorted(skill_dir.rglob("*")) if path.is_file()]


def _coerce_string(value: object) -> str:
    return value if isinstance(value, str) else ""


def _path_text(path: Path) -> str:
    return path.resolve().as_posix()


def _render_skill_detail(skill: dict[str, object]) -> None:
    _render_key_value_table(
        "Skill",
        [
            ("Ref", str(skill.get("ref", ""))),
            ("Name", str(skill.get("name", ""))),
            ("Source", str(skill.get("source", ""))),
            ("Directory", str(skill.get("directory", ""))),
            ("Manifest", str(skill.get("manifest_path", ""))),
            ("Description", str(skill.get("description", ""))),
        ],
    )
    _render_named_path_rows(
        title="Resources",
        rows=_object_list(skill.get("resources")),
        empty_message="No resources.",
    )
    _render_named_path_rows(
        title="Scripts",
        rows=_object_list(skill.get("scripts")),
        empty_message="No scripts.",
    )
    print("Files")
    files = [str(item) for item in _object_list(skill.get("files"))]
    print("\n".join(files) or "No files discovered.")
    print("Instructions")
    print(str(skill.get("instructions") or "<empty>"))


def _object_list(value: object) -> list[object]:
    return value if isinstance(value, list) else []


def _dict_rows(rows: list[object]) -> list[dict[str, object]]:
    return [row for row in rows if isinstance(row, dict)]


def _render_key_value_table(title: str, rows: list[tuple[str, str]]) -> None:
    print(title)
    field_width = max(len("Field"), *(len(field) for field, _value in rows))
    value_width = max(len("Value"), *(len(value) for _field, value in rows))
    border = f"+-{'-' * field_width}-+-{'-' * value_width}-+"
    print(border)
    print(f"| {'Field'.ljust(field_width)} | {'Value'.ljust(value_width)} |")
    print(border)
    for field, value in rows:
        print(f"| {field.ljust(field_width)} | {value.ljust(value_width)} |")
    print(border)


def _render_named_path_rows(
    *, title: str, rows: list[object], empty_message: str
) -> None:
    print(title)
    dict_rows = _dict_rows(rows)
    if not dict_rows:
        print(empty_message)
        return
    name_width = max(len("Name"), *(len(str(row.get("name", ""))) for row in dict_rows))
    path_width = max(len("Path"), *(len(str(row.get("path", ""))) for row in dict_rows))
    description_width = max(
        len("Description"),
        *(len(str(row.get("description", ""))) for row in dict_rows),
    )
    border = f"+-{'-' * name_width}-+-{'-' * path_width}-+-{'-' * description_width}-+"
    print(border)
    print(
        f"| {'Name'.ljust(name_width)} | "
        f"{'Path'.ljust(path_width)} | "
        f"{'Description'.ljust(description_width)} |"
    )
    print(border)
    for row in dict_rows:
        name = str(row.get("name", ""))
        path = str(row.get("path", ""))
        description = str(row.get("description", ""))
        print(
            f"| {name.ljust(name_width)} | "
            f"{path.ljust(path_width)} | "
            f"{description.ljust(description_width)} |"
        )
    print(border)


def _mcp_list(args: list[str]) -> None:
    config_path = _app_config_dir() / "mcp.json"
    raw = _read_json_object(config_path)
    servers = _fast_mcp_servers(raw)
    rows: list[dict[str, object]] = []
    if isinstance(servers, dict):
        for name, config in sorted(servers.items()):
            if not isinstance(config, dict):
                continue
            transport = _mcp_transport(config)
            rows.append(
                {
                    "name": name,
                    "source": "app",
                    "transport": transport,
                    "enabled": bool(config.get("enabled", True)),
                    "discovery_status": "pending"
                    if config.get("enabled", True)
                    else "disabled",
                    "tool_count": 0,
                    "last_checked_at": None,
                    "error": None,
                }
            )
    if _wants_json(args):
        print(json.dumps(rows, ensure_ascii=False))
        return
    _render_table(
        "MCP servers",
        rows,
        ("name", "source", "transport", "enabled", "discovery_status"),
    )


def _mcp_add(args: list[str]) -> None:
    server_name = _first_positional_arg(args)
    if not server_name:
        print("Missing argument 'SERVER_NAME'.", file=sys.stderr)
        raise SystemExit(2)
    command = _option_value(args, "--command", "")
    url = _option_value(args, "--url", "")
    if bool(command) == bool(url):
        print("Specify exactly one of --command or --url", file=sys.stderr)
        raise SystemExit(2)
    config_path = _app_config_dir() / "mcp.json"
    raw = _read_json_object(config_path)
    payload, servers = _writable_fast_mcp_servers_payload(raw)
    if server_name in servers and "--overwrite" not in args:
        print(f"MCP server already exists: {server_name}", file=sys.stderr)
        raise SystemExit(2)
    server_config: dict[str, object]
    if command:
        command_parts = _split_command_option(command)
        if not command_parts:
            print("--command must be non-empty", file=sys.stderr)
            raise SystemExit(2)
        server_config = {
            "transport": _option_value(args, "--transport", "stdio"),
            "command": command_parts[0],
            "args": [*command_parts[1:], *_option_values(args, "--arg")],
            "env": _key_value_options(args, "--env"),
            "enabled": True,
        }
    else:
        transport = _option_value(args, "--transport", "")
        server_config = {
            "transport": transport or ("sse" if "/sse" in url else "http"),
            "url": url,
            "headers": _key_value_options(args, "--header"),
            "enabled": True,
        }
    servers[server_name] = server_config
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    summary = _mcp_summary(name=server_name, config=server_config)
    payload = {"server": summary, "config_path": str(config_path)}
    if _wants_json(args):
        print(json.dumps(payload, ensure_ascii=False))
        return
    print(f"Added MCP server {server_name} ({summary['transport']}) to {config_path}")


def _mcp_set_enabled(args: list[str], *, enabled: bool) -> None:
    server_name = _first_positional_arg(args)
    if not server_name:
        print("Missing argument 'SERVER_NAME'.", file=sys.stderr)
        raise SystemExit(2)
    config_path = _app_config_dir() / "mcp.json"
    raw = _read_json_object(config_path)
    payload, servers = _writable_fast_mcp_servers_payload(raw)
    config = servers.get(server_name)
    if not isinstance(config, dict):
        print(f"Unknown MCP server: {server_name}", file=sys.stderr)
        raise SystemExit(2)
    config["enabled"] = enabled
    servers[server_name] = config
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    summary = _mcp_summary(name=server_name, config=config)
    if _wants_json(args):
        print(json.dumps(summary, ensure_ascii=False))
        return
    print(f"{'Enabled' if enabled else 'Disabled'} MCP server {server_name}.")


def _mcp_summary(*, name: str, config: dict[str, object]) -> dict[str, object]:
    enabled = bool(config.get("enabled", True))
    return {
        "name": name,
        "source": "app",
        "transport": _mcp_transport(config),
        "enabled": enabled,
        "discovery_status": "pending" if enabled else "disabled",
        "tool_count": 0,
        "last_checked_at": None,
        "error": None,
    }


def _fast_mcp_servers(payload: dict[str, object]) -> dict[str, object]:
    maybe_servers = payload.get("mcpServers")
    if isinstance(maybe_servers, dict):
        return _normalized_mcp_server_map(maybe_servers) or {}
    legacy_servers = _normalized_mcp_server_map(payload.get("servers"))
    if legacy_servers is not None:
        return legacy_servers
    return payload


def _writable_fast_mcp_servers_payload(
    payload: dict[str, object],
) -> tuple[dict[str, object], dict[str, object]]:
    existing_servers = payload.get("mcpServers")
    if isinstance(existing_servers, dict):
        servers = _normalized_mcp_server_map(existing_servers) or {}
        payload["mcpServers"] = servers
        return payload, servers
    if "mcpServers" in payload:
        servers: dict[str, object] = {}
        return {"mcpServers": servers}, servers
    legacy_servers = _normalized_mcp_server_map(payload.get("servers"))
    if legacy_servers is not None:
        servers = dict(legacy_servers)
        return {"mcpServers": servers}, servers
    servers = dict(payload)
    return {"mcpServers": servers}, servers


def _normalized_mcp_server_map(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    servers: dict[str, object] = {}
    for name, config in value.items():
        if not isinstance(name, str) or not isinstance(config, dict):
            return None
        servers[name] = config
    return servers


def _key_value_options(args: list[str], name: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_value in _option_values(args, name):
        key, separator, value = raw_value.partition("=")
        if not separator:
            print(f"{name} values must use KEY=VALUE", file=sys.stderr)
            raise SystemExit(2)
        values[key] = value
    return values


def _mcp_transport(config: dict[str, object]) -> str:
    for key in ("transport", "type"):
        value = config.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    if isinstance(config.get("command"), str):
        return "stdio"
    if isinstance(config.get("url"), str):
        return "http"
    return "unknown"


def _env_list(args: list[str]) -> None:
    prefix = _option_value(args, "--prefix", "")
    show_secrets = "--show-secrets" in args
    entries: list[dict[str, object]] = []
    merged: dict[str, str] = {}
    source_by_key: dict[str, str] = {}
    for key, value in _load_fast_env_file((_app_config_dir() / ".env")).items():
        merged[key] = value
        source_by_key[key] = "app"
    secret_env = _load_fast_secret_env_vars(_app_config_dir())
    for key, value in secret_env.items():
        merged[key] = value
        source_by_key[key] = "app"
    for key, value in os.environ.items():
        merged[key] = value
        source_by_key[key] = "process"
    for key in sorted(merged):
        if prefix and not key.startswith(prefix):
            continue
        masked = (not show_secrets) and _is_sensitive_env_key(key)
        entries.append(
            {
                "key": key,
                "value": "<masked>" if masked else merged[key],
                "source": source_by_key.get(key, "unknown"),
                "masked": masked,
            }
        )
    if _wants_json(args):
        print(json.dumps(entries, ensure_ascii=False))
        return
    _render_table("Environment Variables", entries, ("key", "source", "value"))


def _load_fast_env_file(path: Path) -> dict[str, str]:
    if not path.exists() or not path.is_file():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        normalized_key = key.strip()
        if normalized_key:
            values[normalized_key] = _strip_fast_env_quotes(value.strip())
    return values


def _load_fast_secret_env_vars(config_dir: Path) -> dict[str, str]:
    secrets_file = config_dir.expanduser() / _SECRETS_FILE_NAME
    if not secrets_file.exists() or not secrets_file.is_file():
        return {}
    try:
        payload = json.loads(secrets_file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(payload, dict):
        return {}
    entries = payload.get("entries")
    if not isinstance(entries, list):
        return {}

    values: dict[str, str] = {}
    for entry in entries:
        value = _fast_secret_entry_value(config_dir, entry)
        if value is None:
            continue
        field_name = entry.get("field_name") if isinstance(entry, dict) else None
        if isinstance(field_name, str) and _is_sensitive_env_key(field_name):
            values[field_name] = value
    return values


def _fast_secret_entry_value(config_dir: Path, entry: object) -> str | None:
    if not isinstance(entry, dict):
        return None
    if (
        entry.get("namespace") != _APP_ENV_SECRET_NAMESPACE
        or entry.get("owner_id") != "app"
    ):
        return None
    field_name = entry.get("field_name")
    storage = entry.get("storage")
    if not isinstance(field_name, str) or not isinstance(storage, str):
        return None
    if storage == "file":
        value = entry.get("value")
        return value if isinstance(value, str) else None
    if storage != "keyring" or keyring is None:
        return None
    try:
        value = keyring.get_password(
            _KEYRING_SERVICE_NAME,
            _fast_secret_account_name(config_dir, field_name),
        )
    except Exception:
        return None
    return value if isinstance(value, str) else None


def _fast_secret_account_name(config_dir: Path, field_name: str) -> str:
    resolved_dir = config_dir.expanduser().resolve()
    return f"{resolved_dir}::{_APP_ENV_SECRET_NAMESPACE}::app::{field_name}"


def _split_command_option(command: str) -> list[str]:
    return [
        _strip_surrounding_quotes(part) for part in shlex.split(command, posix=False)
    ]


def _strip_surrounding_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def _strip_fast_env_quotes(value: str) -> str:
    if len(value) >= 2 and (
        (value.startswith('"') and value.endswith('"'))
        or (value.startswith("'") and value.endswith("'"))
    ):
        return value[1:-1]
    return value


def _is_sensitive_env_key(key: str) -> bool:
    tokens = [token for token in re.split(r"[^A-Z0-9]+", key.upper()) if token]
    return any(token in {"KEY", "TOKEN", "SECRET", "PASSWORD"} for token in tokens)


def _handle_fast_plugin(args: list[str]) -> bool:
    if not args:
        return False
    command = args[0]
    if command == "list":
        _raise_unknown_fast_options_for_plugin(command, args[1:])
        if "--available" in args:
            _plugin_list_available(args[1:])
            return True
        _plugin_list(args[1:])
        return True
    if command == "search":
        _raise_unknown_fast_options_for_plugin(command, args[1:])
        _plugin_search(args[1:])
        return True
    if command == "validate":
        _raise_unknown_fast_options_for_plugin(command, args[1:])
        _plugin_validate(args[1:])
        return True
    if command == "install":
        _raise_unknown_fast_options_for_plugin(command, args[1:])
        return _plugin_install(args[1:])
    if command == "uninstall":
        _raise_unknown_fast_options_for_plugin(command, args[1:])
        return _plugin_uninstall(args[1:])
    if command in {"enable", "disable"}:
        _raise_unknown_fast_options_for_plugin(command, args[1:])
        return _plugin_set_enabled(args[1:], enabled=command == "enable")
    if command == "configure":
        _raise_unknown_fast_options_for_plugin(command, args[1:])
        return _plugin_configure(args[1:])
    if command == "update":
        _raise_unknown_fast_options_for_plugin(command, args[1:])
        return _plugin_update(args[1:])
    if command == "prune":
        _raise_unknown_fast_options_for_plugin(command, args[1:])
        _plugin_prune()
        return True
    return False


def _plugin_list_available(args: list[str]) -> None:
    if not _plugin_fast_local_marketplace_args(args):
        _run_full_cli()
    marketplace = _required_option_value(args, "--marketplace")
    rows = [
        _plugin_available_row(entry)
        for entry in _plugin_marketplace_entries(marketplace)
    ]
    rows = [row for row in rows if row is not None]
    if _wants_json(args):
        print(json.dumps(rows, ensure_ascii=False))
        return
    _render_table("Available plugins", rows, ("name", "latest", "description"))


def _plugin_search(args: list[str]) -> None:
    raw_query = _first_positional_arg(args).strip()
    if not raw_query:
        print("Missing argument 'QUERY'.", file=sys.stderr)
        raise SystemExit(2)
    query = raw_query.lower()
    marketplace = _option_value(args, "--marketplace", "")
    if (
        not marketplace
        or _option_value(args, "--marketplace-provider", "local_json") != "local_json"
    ):
        _run_full_cli()
    rows = []
    for entry in _plugin_marketplace_entries(marketplace):
        row = _plugin_available_row(entry)
        if row is None:
            continue
        haystack = f"{row.get('name', '')} {row.get('description', '')}".lower()
        if query in haystack:
            rows.append(row)
    if _wants_json(args):
        print(json.dumps(rows, ensure_ascii=False))
        return
    _render_table("Available plugins", rows, ("name", "latest", "description"))


def _plugin_validate(args: list[str]) -> None:
    raw_plugin_root = _first_positional_arg(args)
    if not raw_plugin_root:
        print("Missing argument 'PATH'.", file=sys.stderr)
        raise SystemExit(2)
    plugin_root = Path(raw_plugin_root).expanduser().resolve()
    manifest_path = _plugin_manifest_path(plugin_root)
    diagnostics: list[dict[str, str]] = []
    manifest = _read_json_object(manifest_path)
    if not manifest:
        diagnostics.append(
            {
                "plugin_name": plugin_root.name,
                "scope": "local",
                "severity": "error",
                "component": "",
                "path": _path_text(manifest_path),
                "message": f"Plugin manifest is required: {manifest_path}",
            }
        )
    name = str(manifest.get("name", ""))
    version = str(manifest.get("version", "local"))
    if manifest and not name:
        diagnostics.append(
            {
                "plugin_name": plugin_root.name,
                "scope": "local",
                "severity": "error",
                "component": "",
                "path": _path_text(manifest_path),
                "message": "Plugin manifest field 'name' is required.",
            }
        )
    payload = {
        "valid": not diagnostics,
        "name": name,
        "version": version,
        "root_dir": _path_text(plugin_root),
        "diagnostics": diagnostics,
    }
    if _wants_json(args):
        print(json.dumps(payload, ensure_ascii=False))
    elif payload["valid"]:
        print(f"Plugin is valid: {name} ({version})")
    else:
        print("Plugin is invalid.")
    if diagnostics:
        raise SystemExit(1)


def _plugin_install(args: list[str]) -> bool:
    name = _first_positional_arg(args)
    if not name:
        return False
    if _option_value(args, "--scope", "user") != "user":
        return False
    marketplace = _option_value(args, "--marketplace", "")
    if not _plugin_install_fast_supported(
        args=args, source=name, marketplace=marketplace
    ):
        return False
    disabled = "--disabled" in args
    if marketplace:
        entry = _plugin_find_marketplace_entry(marketplace=marketplace, name=name)
        if entry is None:
            print(f"Plugin not found in marketplace: {name}", file=sys.stderr)
            raise SystemExit(2)
        version, source = _plugin_marketplace_version_source(
            entry=entry,
            requested_version=_option_value(args, "--version", ""),
        )
        source_root = Path(source).expanduser().resolve()
        source_payload = {
            "kind": "marketplace",
            "value": name,
            "ref": "",
            "subdir": "",
            "sha": "",
            "adapter": "",
            "marketplace": str(Path(marketplace).expanduser().resolve()),
            "marketplace_provider": "local_json",
            "marketplace_source": "",
            "marketplace_ref": "",
            "requested_version": version,
        }
    else:
        source_root = Path(name).expanduser().resolve()
        manifest = _read_json_object(_plugin_manifest_path(source_root))
        name = str(manifest.get("name", source_root.name))
        version = str(manifest.get("version", "local"))
        source_payload = {
            "kind": "local",
            "value": str(source_root),
            "ref": "",
            "subdir": "",
            "sha": "",
            "adapter": "",
            "marketplace": "",
            "marketplace_provider": "",
            "marketplace_source": "",
            "marketplace_ref": "",
            "requested_version": None,
        }
    target = _plugin_installed_root() / name / version
    _copy_plugin_tree(source=source_root, target=target)
    record = {
        "name": name,
        "version": version,
        "scope": "user",
        "enabled": not disabled,
        "root_dir": str(target),
        "source": source_payload,
        "user_config": {},
        "dependencies": [],
    }
    state = _plugin_state()
    plugins = [
        plugin
        for plugin in _plugin_state_plugins(state)
        if not (
            str(plugin.get("name", "")) == name
            and str(plugin.get("scope", "user")) == "user"
        )
    ]
    plugins.append(record)
    _write_plugin_state({"plugins": plugins})
    print(
        f"Installed plugin {name} in user scope "
        f"({'enabled' if not disabled else 'disabled'})."
    )
    return True


def _plugin_uninstall(args: list[str]) -> bool:
    name = _first_positional_arg(args)
    if not name or _option_value(args, "--scope", "user") != "user":
        return False
    state = _plugin_state()
    removed: dict[str, object] | None = None
    kept = []
    for plugin in _plugin_state_plugins(state):
        if (
            str(plugin.get("name", "")) == name
            and str(plugin.get("scope", "user")) == "user"
        ):
            removed = plugin
            continue
        kept.append(plugin)
    if removed is None:
        print(f"Plugin is not installed in user: {name}", file=sys.stderr)
        raise SystemExit(2)
    _write_plugin_state({"plugins": kept})
    if "--prune" in args:
        _plugin_prune(quiet=True)
    suffix = " and pruned installed copies" if "--prune" in args else ""
    print(f"Uninstalled plugin {name} from user{suffix}.")
    return True


def _plugin_set_enabled(args: list[str], *, enabled: bool) -> bool:
    name = _first_positional_arg(args)
    if not name or _option_value(args, "--scope", "user") != "user":
        return False
    plugin = _update_plugin_record(name=name, updates={"enabled": enabled})
    print(
        f"{'Enabled' if enabled else 'Disabled'} plugin "
        f"{plugin.get('name', name)} in user scope."
    )
    return True


def _plugin_configure(args: list[str]) -> bool:
    name = _first_positional_arg(args)
    if not name or _option_value(args, "--scope", "user") != "user":
        return False
    values: dict[str, object] = {}
    for raw_value in _option_values(args, "--set"):
        key, separator, value = raw_value.partition("=")
        if not separator:
            print("--set values must use key=value", file=sys.stderr)
            raise SystemExit(2)
        try:
            values[key] = json.loads(value)
        except json.JSONDecodeError:
            values[key] = value
    plugin = _plugin_state_record(name)
    current = plugin.get("user_config", {})
    user_config = dict(current) if isinstance(current, dict) else {}
    user_config.update(values)
    _update_plugin_record(name=name, updates={"user_config": user_config})
    print(f"Configured plugin {name} in user scope.")
    return True


def _plugin_update(args: list[str]) -> bool:
    name = _first_positional_arg(args)
    if not name or _option_value(args, "--scope", "user") != "user":
        return False
    existing = _plugin_state_record(name)
    source = existing.get("source", {})
    if not isinstance(source, dict) or str(source.get("kind", "")) != "marketplace":
        return False
    marketplace = str(source.get("marketplace", ""))
    if not marketplace:
        return False
    if str(source.get("marketplace_provider", "local_json")) != "local_json":
        return False
    entry = _plugin_find_marketplace_entry(marketplace=marketplace, name=name)
    if entry is None:
        print(f"Plugin not found in marketplace: {name}", file=sys.stderr)
        raise SystemExit(2)
    version, source_root = _plugin_marketplace_version_source(
        entry=entry,
        requested_version=_option_value(args, "--version", ""),
    )
    target = _plugin_installed_root() / name / version
    _copy_plugin_tree(source=Path(source_root).expanduser().resolve(), target=target)
    source["requested_version"] = version
    source["value"] = name
    _update_plugin_record(
        name=name,
        updates={
            "version": version,
            "root_dir": str(target),
            "source": source,
        },
    )
    print(f"Updated plugin {name} to {version}.")
    return True


def _plugin_prune(*, quiet: bool = False) -> int:
    installed_root = _plugin_installed_root()
    if not installed_root.exists():
        if not quiet:
            print("No installed plugin versions pruned.")
        return 0
    referenced = {
        Path(str(row.get("root_dir", ""))).expanduser().resolve()
        for row in _plugin_rows()
        if str(row.get("root_dir", "")).strip()
    }
    removed = 0
    for plugin_dir in sorted(installed_root.iterdir()):
        if not plugin_dir.is_dir():
            continue
        for version_dir in sorted(plugin_dir.iterdir()):
            if not version_dir.is_dir() or version_dir.resolve() in referenced:
                continue
            _remove_tree_under(parent=installed_root, target=version_dir)
            removed += 1
    if not removed:
        if not quiet:
            print("No installed plugin versions pruned.")
        return 0
    if not quiet:
        print(f"Pruned {removed} installed plugin version(s).")
    return removed


def _plugin_available_row(entry: dict[str, object]) -> dict[str, object] | None:
    name = entry.get("name")
    if not isinstance(name, str) or not name:
        return None
    versions = entry.get("versions", [])
    version_names: list[str] = []
    if isinstance(versions, list):
        for version in versions:
            if isinstance(version, dict):
                raw_version = version.get("version")
                if isinstance(raw_version, str):
                    version_names.append(raw_version)
            elif isinstance(version, str):
                version_names.append(version)
    latest = entry.get("latest")
    return {
        "name": name,
        "description": str(entry.get("description", "")),
        "latest": latest
        if isinstance(latest, str)
        else (version_names[-1] if version_names else ""),
        "versions": version_names,
    }


def _plugin_find_marketplace_entry(
    *, marketplace: str, name: str
) -> dict[str, object] | None:
    for entry in _plugin_marketplace_entries(marketplace):
        if str(entry.get("name", "")) == name:
            return entry
    return None


def _plugin_install_fast_supported(
    *, args: list[str], source: str, marketplace: str
) -> bool:
    if _option_value(args, "--source-kind", "local") not in {"", "local"}:
        return False
    if marketplace:
        return _plugin_fast_local_marketplace_args(args)
    if source.startswith("clawhub:"):
        return False
    if _looks_like_git_source(source):
        return False
    return True


def _plugin_fast_local_marketplace_args(args: list[str]) -> bool:
    if _option_value(args, "--marketplace-provider", "local_json") != "local_json":
        return False
    if _option_value(args, "--marketplace-source", ""):
        return False
    if _option_value(args, "--marketplace-ref", ""):
        return False
    return True


def _looks_like_git_source(value: str) -> bool:
    normalized = value.strip().lower()
    return normalized.startswith(
        ("http://", "https://", "ssh://", "git@")
    ) or normalized.endswith(".git")


def _plugin_marketplace_entries(marketplace: str) -> list[dict[str, object]]:
    payload = _read_json_object(Path(marketplace).expanduser().resolve())
    plugins = payload.get("plugins", [])
    if not isinstance(plugins, list):
        return []
    return [plugin for plugin in plugins if isinstance(plugin, dict)]


def _plugin_marketplace_version_source(
    *, entry: dict[str, object], requested_version: str
) -> tuple[str, str]:
    versions = entry.get("versions", [])
    if not isinstance(versions, list) or not versions:
        raise SystemExit(2)
    selected: dict[str, object] | None = None
    fallback_version = str(entry.get("latest", ""))
    for version in versions:
        if not isinstance(version, dict):
            continue
        version_name = str(version.get("version", ""))
        if requested_version and version_name == requested_version:
            selected = version
            break
        if not requested_version and (
            (fallback_version and version_name == fallback_version) or selected is None
        ):
            selected = version
    if selected is None:
        print("Marketplace version not found.", file=sys.stderr)
        raise SystemExit(2)
    source = selected.get("source", {})
    if not isinstance(source, dict) or str(source.get("kind", "local")) != "local":
        _run_full_cli()
    value = source.get("value")
    if not isinstance(value, str) or not value:
        print("Marketplace local source is missing.", file=sys.stderr)
        raise SystemExit(2)
    return str(selected.get("version", fallback_version or "local")), value


def _plugin_manifest_path(plugin_root: Path) -> Path:
    candidates = (
        plugin_root / _app_config_dir().name / "plugin.json",
        plugin_root / "app" / "plugin.json",
        plugin_root / ".claude-plugin" / "plugin.json",
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def _plugin_state_path() -> Path:
    return _app_config_dir() / "plugins" / "plugins.json"


def _plugin_installed_root() -> Path:
    return _app_config_dir() / "plugins" / "installed"


def _plugin_state() -> dict[str, object]:
    return _read_json_object(_plugin_state_path())


def _plugin_state_plugins(state: dict[str, object]) -> list[dict[str, object]]:
    plugins = state.get("plugins", [])
    if not isinstance(plugins, list):
        return []
    return [plugin for plugin in plugins if isinstance(plugin, dict)]


def _plugin_state_record(name: str) -> dict[str, object]:
    for plugin in _plugin_state_plugins(_plugin_state()):
        if (
            str(plugin.get("name", "")) == name
            and str(plugin.get("scope", "user")) == "user"
        ):
            return plugin
    print(f"Plugin is not installed in user: {name}", file=sys.stderr)
    raise SystemExit(2)


def _update_plugin_record(
    *, name: str, updates: dict[str, object]
) -> dict[str, object]:
    state = _plugin_state()
    plugins = []
    updated: dict[str, object] | None = None
    for plugin in _plugin_state_plugins(state):
        if (
            str(plugin.get("name", "")) == name
            and str(plugin.get("scope", "user")) == "user"
        ):
            plugin = {**plugin, **updates}
            updated = plugin
        plugins.append(plugin)
    if updated is None:
        print(f"Plugin is not installed in user: {name}", file=sys.stderr)
        raise SystemExit(2)
    _write_plugin_state({"plugins": plugins})
    return updated


def _write_plugin_state(state: dict[str, object]) -> None:
    path = _plugin_state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def _copy_plugin_tree(*, source: Path, target: Path) -> None:
    if not source.exists() or not source.is_dir():
        print(f"Plugin source does not exist: {source}", file=sys.stderr)
        raise SystemExit(2)
    if not _plugin_manifest_path(source).exists():
        print(
            f"Plugin manifest is required: {_plugin_manifest_path(source)}",
            file=sys.stderr,
        )
        raise SystemExit(2)
    if target.exists():
        _remove_tree_under(parent=_plugin_installed_root(), target=target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target)


def _remove_tree_under(*, parent: Path, target: Path) -> None:
    resolved_parent = parent.expanduser().resolve()
    resolved_target = target.expanduser().resolve()
    try:
        resolved_target.relative_to(resolved_parent)
    except ValueError:
        raise RuntimeError(f"Refusing to remove path outside {resolved_parent}")
    shutil.rmtree(resolved_target)


def _option_values(args: list[str], name: str) -> list[str]:
    values: list[str] = []
    index = 0
    while index < len(args):
        if args[index] == "--":
            break
        inline_prefix = f"{name}="
        if args[index].startswith(inline_prefix):
            values.append(args[index][len(inline_prefix) :])
            index += 1
            continue
        if (
            args[index] == name
            and index + 1 < len(args)
            and (name == "--arg" or not args[index + 1].startswith("-"))
        ):
            values.append(args[index + 1])
            index += 2
            continue
        index += 1
    return values


def _plugin_list(args: list[str]) -> None:
    rows = _plugin_rows()
    diagnostics = _plugin_diagnostics(rows)
    if _wants_json(args):
        print(
            json.dumps(
                {"plugins": rows, "diagnostics": diagnostics},
                ensure_ascii=False,
            )
        )
        return
    _render_table("Plugins", rows, ("name", "version", "scope", "enabled", "root_dir"))
    _render_fast_plugin_diagnostics(diagnostics)


def _plugin_rows() -> list[dict[str, object]]:
    state_files: list[tuple[str, Path]] = []
    managed = os.environ.get("RELAY_TEAMS_MANAGED_PLUGINS_FILE", "").strip()
    if managed:
        state_files.append(("managed", Path(managed).expanduser().resolve()))
    project_root = _project_root()
    if project_root is not None:
        state_files.extend(
            (
                ("project", project_root / ".relay-teams" / "plugins.json"),
                ("project-local", project_root / ".relay-teams" / "plugins.local.json"),
            )
        )
    state_files.append(("user", _app_config_dir() / "plugins" / "plugins.json"))
    rows: list[dict[str, object]] = []
    for scope, path in state_files:
        raw = _read_json_object(path)
        plugins = raw.get("plugins", [])
        if not isinstance(plugins, list):
            continue
        for plugin in plugins:
            if not isinstance(plugin, dict):
                continue
            root_dir = str(plugin.get("root_dir", ""))
            rows.append(
                {
                    "name": str(plugin.get("name", "")),
                    "version": str(plugin.get("version", "local")),
                    "scope": str(plugin.get("scope", scope)),
                    "enabled": bool(plugin.get("enabled", True)),
                    "root_dir": root_dir,
                    "source": root_dir,
                    "user_config": plugin.get("user_config", {}),
                }
            )
    return rows


def _plugin_diagnostics(rows: list[dict[str, object]]) -> list[dict[str, str]]:
    diagnostics: list[dict[str, str]] = []
    for row in rows:
        root_dir = str(row.get("root_dir", "")).strip()
        plugin_name = str(row.get("name", "")).strip()
        scope = str(row.get("scope", "user")).strip() or "user"
        if not root_dir:
            diagnostics.append(
                _fast_plugin_diagnostic(
                    plugin_name=plugin_name,
                    scope=scope,
                    path="",
                    message="Plugin root directory is missing.",
                )
            )
            continue
        plugin_root = Path(root_dir).expanduser()
        if not plugin_root.exists() or not plugin_root.is_dir():
            diagnostics.append(
                _fast_plugin_diagnostic(
                    plugin_name=plugin_name,
                    scope=scope,
                    path=str(plugin_root),
                    message="Plugin root directory does not exist.",
                )
            )
            continue
        manifest_path = _plugin_manifest_path(plugin_root)
        if not manifest_path.exists():
            diagnostics.append(
                _fast_plugin_diagnostic(
                    plugin_name=plugin_name,
                    scope=scope,
                    path=str(manifest_path),
                    message="Plugin manifest is missing.",
                )
            )
    return diagnostics


def _fast_plugin_diagnostic(
    *,
    plugin_name: str,
    scope: str,
    path: str,
    message: str,
) -> dict[str, str]:
    return {
        "plugin_name": plugin_name,
        "scope": scope,
        "severity": "error",
        "component": "",
        "path": path,
        "message": message,
    }


def _render_fast_plugin_diagnostics(diagnostics: list[dict[str, str]]) -> None:
    if not diagnostics:
        return
    print("Diagnostics")
    for diagnostic in diagnostics:
        path = diagnostic["path"]
        suffix = "" if not path else f" ({path})"
        print(f"- {diagnostic['severity']}: {diagnostic['message']}{suffix}")


def _read_json_object(path: Path) -> dict[str, object]:
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return {}
    return raw if isinstance(raw, dict) else {}


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _render_table(
    title: str, rows: list[dict[str, object]], columns: tuple[str, ...]
) -> None:
    if not rows:
        print(f"No {title.lower()} discovered.")
        return
    print(f"{title} ({len(rows)} total)")
    widths = {
        column: max(len(column), *(len(str(row.get(column, ""))) for row in rows))
        for column in columns
    }
    border = "+-" + "-+-".join("-" * widths[column] for column in columns) + "-+"
    print(border)
    print("| " + " | ".join(column.ljust(widths[column]) for column in columns) + " |")
    print(border)
    for row in rows:
        print(
            "| "
            + " | ".join(
                str(row.get(column, "")).ljust(widths[column]) for column in columns
            )
            + " |"
        )
    print(border)


if __name__ == "__main__":
    main()
