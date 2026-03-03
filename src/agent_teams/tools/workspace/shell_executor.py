from __future__ import annotations

import os
import re
import shutil
import subprocess
import asyncio
from pathlib import Path
from typing import AsyncGenerator, IO


def resolve_bash_path() -> str:
    """查找 bash 可执行文件路径"""
    env_path = os.getenv("GIT_BASH_PATH")
    if env_path and Path(env_path).exists():
        return env_path

    which_bash = shutil.which("bash")
    if which_bash:
        return which_bash

    candidates = (
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files\Git\usr\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
    )
    for item in candidates:
        if Path(item).exists():
            return item

    raise FileNotFoundError("Git Bash executable not found; set GIT_BASH_PATH")


def normalize_timeout(timeout_ms: int | None) -> int:
    """标准化超时时间 (毫秒)"""
    from agent_teams.tools.workspace.shell_policy import (
        DEFAULT_TIMEOUT_SECONDS,
        MAX_TIMEOUT_SECONDS,
    )

    if timeout_ms is None:
        return DEFAULT_TIMEOUT_SECONDS * 1000

    if timeout_ms < 1:
        raise ValueError("timeout_ms must be >= 1")

    max_ms = MAX_TIMEOUT_SECONDS * 1000
    if timeout_ms > max_ms:
        return max_ms

    return timeout_ms


COMMAND_PATH_PATTERNS = [
    (r"^cd\s+(.+?)(?:\s|$)", "cd"),
    (r"^rm\s+-+\s*(.+?)(?:\s|$)", "rm"),
    (r"^cp\s+(.+?)(?:\s|$)", "cp"),
    (r"^mv\s+(.+?)(?:\s|$)", "mv"),
    (r"^mkdir\s+-+\s*(.+?)(?:\s|$)", "mkdir"),
    (r"^touch\s+(.+?)(?:\s|$)", "touch"),
    (r"^chmod\s+(.+?)(?:\s|$)", "chmod"),
    (r"^chown\s+(.+?)(?:\s|$)", "chown"),
    (r"^cat\s+(.+?)(?:\s|$)", "cat"),
    (r"^ls\s+(.+?)(?:\s|$)", "ls"),
    (r"^find\s+(.+?)(?:\s|$)", "find"),
]


def extract_paths_from_command(command: str) -> list[str]:
    """从命令中提取路径参数"""
    import shlex

    paths = []
    lines = command.split("\n")

    for line in lines:
        line = line.strip()
        if not line:
            continue

        parts = shlex.split(line)
        if not parts:
            continue

        cmd = parts[0]

        if cmd in ("cd", "ls", "cat"):
            if len(parts) > 1:
                path = parts[1]
                if not path.startswith("-"):
                    paths.append(path)
        elif cmd in ("rm", "cp", "mv", "touch", "chmod", "chown", "find"):
            for part in parts[1:]:
                if not part.startswith("-"):
                    paths.append(part)
                    break
        elif cmd in ("mkdir",):
            for part in parts[1:]:
                if part.startswith("-"):
                    continue
                paths.append(part)
                break

    return paths


async def spawn_shell(
    command: str,
    cwd: Path,
    timeout_ms: int = 30000,
    env: dict[str, str] | None = None,
) -> AsyncGenerator[tuple[str, str], None]:
    """流式执行 shell 命令

    Args:
        command: 要执行的命令
        cwd: 工作目录
        timeout_ms: 超时时间 (毫秒)
        env: 环境变量

    Yields:
        (stream_type, data): stdout 或 stderr 的数据块
    """
    import select
    import errno

    bash = resolve_bash_path()

    shell_env = os.environ.copy()
    if env:
        shell_env.update(env)

    proc = subprocess.Popen(
        [bash, "-lc", command],
        cwd=str(cwd),
        env=shell_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    from typing import IO

    stdout: IO[str] | None = proc.stdout  # type: ignore
    stderr: IO[str] | None = proc.stderr  # type: ignore

    try:
        while True:
            ready = select.select([stdout, stderr], [], [], 0.1)

            if stdout and stdout in ready[0]:
                chunk = stdout.read(4096)
                if chunk:
                    yield ("stdout", chunk)

            if stderr and stderr in ready[0]:
                chunk = stderr.read(4096)
                if chunk:
                    yield ("stderr", chunk)

            if proc.poll() is not None:
                break

    except select.error as e:
        if e.args[0] != errno.EINTR:
            raise
    finally:
        if proc.poll() is None:
            proc.terminate()
            proc.wait(timeout=5)


def run_git_bash(
    *,
    command: str,
    workdir: Path,
    timeout_seconds: int,
) -> tuple[int, str, str, bool]:
    """同步执行 shell 命令 (保持向后兼容)"""
    bash = resolve_bash_path()
    try:
        proc = subprocess.run(
            [bash, "-lc", command],
            cwd=str(workdir),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            check=False,
        )
        return proc.returncode, proc.stdout, proc.stderr, False
    except subprocess.TimeoutExpired as exc:
        out = exc.stdout or ""
        err = exc.stderr or ""
        return 124, str(out), str(err), True
