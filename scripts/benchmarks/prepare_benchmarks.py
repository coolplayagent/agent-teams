from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import time
from collections.abc import Sequence
from os import pathsep
from pathlib import Path

from pydantic import BaseModel


AGENTBENCH_REF = "d1e4a10db08c87075c78972e48ecc182be03e2d5"
DEFAULT_AGENTBENCH_IMAGE = "relay-teams-agentbench-tools:latest"
DEFAULT_RUNTIME_IMAGE = "agent-teams-runtime:latest"
DEFAULT_AGENTBENCH_REPO_CONTEXT = Path(".agent_teams/benchmarks/repos/AgentBench")


class AgentBenchRepo(BaseModel):
    name: str
    url: str
    ref: str
    path: Path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Prepare local Docker tooling for relay-teams benchmarks."
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path(".agent_teams/benchmarks/repos"),
    )
    parser.add_argument("--agentbench-image", default=DEFAULT_AGENTBENCH_IMAGE)
    parser.add_argument("--runtime-image", default=DEFAULT_RUNTIME_IMAGE)
    parser.add_argument("--skip-clone", action="store_true")
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument("--skip-runtime-image", action="store_true")
    args = parser.parse_args()

    cache_dir = args.cache_dir.resolve()
    cache_dir.mkdir(parents=True, exist_ok=True)
    repos = [
        AgentBenchRepo(
            name="AgentBench",
            url="https://github.com/THUDM/AgentBench.git",
            ref=AGENTBENCH_REF,
            path=cache_dir / "AgentBench",
        ),
    ]

    if not args.skip_clone:
        for repo in repos:
            clone_or_checkout(repo)

    if not args.skip_build:
        docker = find_docker()
        if not args.skip_runtime_image:
            build_runtime_image(docker=docker, image=args.runtime_image)
            verify_image(docker=docker, image=args.runtime_image)
        agentbench_repo = cache_dir / "AgentBench"
        if agentbench_repo.exists():
            stage_agentbench_repo_for_docker_build(agentbench_repo)
            build_agentbench_os_images(docker=docker)
            build_agentbench_image(docker=docker, image=args.agentbench_image)
            verify_image(docker=docker, image=args.agentbench_image)

    print("Benchmark environment is ready.")
    print(f"Runtime image: {args.runtime_image}")
    print(f"AgentBench image: {args.agentbench_image}")
    print(f"Benchmark repositories: {cache_dir}")
    return 0


def clone_or_checkout(repo: AgentBenchRepo) -> None:
    if repo.path.exists():
        run(
            ["git", "fetch", "--depth", "1", "origin", repo.ref],
            cwd=repo.path,
            attempts=3,
        )
        run(["git", "checkout", "--detach", "FETCH_HEAD"], cwd=repo.path)
        return
    repo.path.mkdir(parents=True, exist_ok=True)
    run(["git", "init"], cwd=repo.path)
    run(["git", "remote", "add", "origin", repo.url], cwd=repo.path)
    run(
        ["git", "fetch", "--depth", "1", "origin", repo.ref],
        cwd=repo.path,
        attempts=3,
    )
    run(["git", "checkout", "--detach", "FETCH_HEAD"], cwd=repo.path)


def find_docker() -> Path:
    for candidate in docker_path_candidates():
        if not candidate.exists():
            continue
        env = docker_env(candidate)
        result = subprocess.run(
            [str(candidate), "info", "--format", "{{.ServerVersion}}"],
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if result.returncode == 0:
            return candidate
    raise RuntimeError("Docker CLI is not available or Docker Desktop is not running.")


def docker_path_candidates() -> tuple[Path, ...]:
    candidates: list[Path] = []
    seen: set[Path] = set()

    def append_candidate(candidate: Path) -> None:
        resolved = candidate.expanduser()
        if resolved in seen:
            return
        seen.add(resolved)
        candidates.append(resolved)

    for entry in os.environ.get("PATH", "").split(pathsep):
        if entry.strip():
            append_candidate(Path(entry) / "docker")
    append_candidate(Path("/Applications/Docker.app/Contents/Resources/bin/docker"))
    return tuple(candidates)


def docker_env(docker: Path) -> dict[str, str]:
    env = os.environ.copy()
    docker_bin_dir = str(docker.parent)
    env["PATH"] = f"{docker_bin_dir}:{env.get('PATH', '')}"
    return env


def build_agentbench_os_images(*, docker: Path) -> None:
    specs = [
        (
            "local-os/default",
            Path("benchmarks/agentbench/docker/os/default.Dockerfile"),
        ),
        (
            "local-os/packages",
            Path("benchmarks/agentbench/docker/os/packages.Dockerfile"),
        ),
        (
            "local-os/ubuntu",
            Path("benchmarks/agentbench/docker/os/ubuntu.Dockerfile"),
        ),
    ]
    for tag, dockerfile in specs:
        run(
            [
                str(docker),
                "build",
                "-f",
                str(dockerfile),
                "-t",
                tag,
                ".",
            ],
            cwd=Path.cwd(),
            env=docker_env(docker),
            attempts=2,
        )


def build_runtime_image(*, docker: Path, image: str) -> None:
    run(
        [
            str(docker),
            "build",
            "-f",
            "docker/Dockerfile.agent-runtime",
            "-t",
            image,
            ".",
        ],
        cwd=Path.cwd(),
        env=docker_env(docker),
        attempts=2,
    )


def build_agentbench_image(*, docker: Path, image: str) -> None:
    run(
        [
            str(docker),
            "build",
            "-f",
            "benchmarks/agentbench/docker/agentbench.Dockerfile",
            "-t",
            image,
            "--build-arg",
            f"AGENTBENCH_REF={AGENTBENCH_REF}",
            ".",
        ],
        cwd=Path.cwd(),
        env=docker_env(docker),
        attempts=2,
    )


def stage_agentbench_repo_for_docker_build(agentbench_repo: Path) -> Path:
    source = agentbench_repo.resolve()
    target = DEFAULT_AGENTBENCH_REPO_CONTEXT.resolve()
    if source == target:
        return DEFAULT_AGENTBENCH_REPO_CONTEXT
    if target.exists():
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target, ignore=shutil.ignore_patterns(".git"))
    return DEFAULT_AGENTBENCH_REPO_CONTEXT


def verify_image(*, docker: Path, image: str) -> None:
    run(
        [str(docker), "image", "inspect", image, "--format", "{{.Id}}"],
        cwd=Path.cwd(),
        env=docker_env(docker),
    )


def run(
    command: Sequence[str],
    *,
    cwd: Path,
    env: dict[str, str] | None = None,
    attempts: int = 1,
) -> None:
    last_error: subprocess.CalledProcessError | None = None
    for attempt in range(1, attempts + 1):
        print("$ " + " ".join(command))
        try:
            subprocess.run(command, cwd=cwd, env=env, check=True)
            return
        except subprocess.CalledProcessError as exc:
            last_error = exc
            if attempt >= attempts:
                break
            time.sleep(2.0 * attempt)
    if last_error is not None:
        raise last_error


if __name__ == "__main__":
    raise SystemExit(main())
