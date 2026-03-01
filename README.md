# agent-teams

Role-driven multi-agent orchestration framework built with strong typing and tool-only collaboration flow.
Runtime model execution uses `pydantic_ai` with OpenAI-compatible endpoints.

## Web Interface

![Agent Teams Web Interface](docs/agent_teams.png)

Start the server with `uv run agent-teams serve` and open http://127.0.0.1:8000 in your browser.

## Quick start

### 1) Install dependencies

```bash
uv sync
```

### 2) Create runtime config file

Linux/macOS:

```bash
cp .agent_teams/.env.example .agent_teams/.env
```

Windows PowerShell:

```powershell
Copy-Item .agent_teams/.env.example .agent_teams/.env
```

Then edit `.agent_teams/.env`.

- If you set `OPENAI_MODEL`, `OPENAI_BASE_URL`, `OPENAI_API_KEY`, it will use your OpenAI-compatible endpoint.
- If those fields are empty, the app falls back to local `EchoProvider` (still runnable for smoke test).

### 3) Validate roles

```bash
uv run agent-teams roles-validate
```

### 4) Start web server

```bash
uv run agent-teams serve
```

Then open http://127.0.0.1:8000 in your browser to access the web interface.

### 5) Run an intent

```bash
uv run agent-teams run-intent --intent "Draft a release note"
```

### 5.1) Stream run events

```bash
uv run agent-teams run-intent-stream --intent "Draft a release note"
```

### 5.2) Inject messages during a running stream (SDK)

```python
from pathlib import Path
from agent_teams.interfaces.sdk.client import AgentTeamsApp
from agent_teams.core.enums import InjectionSource
from agent_teams.core.models import IntentInput

app = AgentTeamsApp(config_dir=Path(".agent_teams"))
stream = app.run_intent_stream(IntentInput(session_id="s1", intent="do multi-step work"))
first_event = next(stream)
app.inject_message(first_event.run_id, InjectionSource.USER, "Additional constraint from user")
for event in stream:
    print(event.event_type, event.payload_json)
```

### 6) Query task records

```bash
uv run agent-teams tasks-list
# then:
uv run agent-teams tasks-query --task-id <task_id>
```
