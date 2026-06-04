# syntax=docker/dockerfile:1

FROM docker:27-cli AS docker_cli

FROM python:3.12-slim-bookworm

ARG AGENTBENCH_REF=d1e4a10db08c87075c78972e48ecc182be03e2d5

LABEL relay-teams.agentbench-ref="${AGENTBENCH_REF}"

ENV PIP_DEFAULT_TIMEOUT=120
ENV PIP_NO_CACHE_DIR=1
ENV PIP_RETRIES=10
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/opt/relay-teams-benchmark-runners:/workspace:/opt/AgentBench

COPY --from=docker_cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker_cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx
COPY --from=docker_cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose

RUN python -m pip install --retries 10 --timeout 120 httpx==0.28.1 pydantic==2.13.4

COPY .agent_teams/benchmarks/repos/AgentBench /opt/AgentBench
COPY benchmarks/__init__.py /opt/relay-teams-benchmark-runners/benchmarks/__init__.py
COPY benchmarks/common /opt/relay-teams-benchmark-runners/benchmarks/common
COPY benchmarks/agentbench /opt/relay-teams-benchmark-runners/benchmarks/agentbench
COPY benchmarks/docker/relay-server-entrypoint.sh /opt/relay-teams-benchmark-runners/relay-server-entrypoint.sh
RUN chmod +x /opt/relay-teams-benchmark-runners/relay-server-entrypoint.sh

RUN python -c "import benchmarks.agentbench.run_agentbench; print('agentbench runner ok')"

WORKDIR /workspace
ENTRYPOINT ["/opt/relay-teams-benchmark-runners/relay-server-entrypoint.sh"]
