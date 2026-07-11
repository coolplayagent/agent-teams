# Desktop Release

Agent Teams ships a Windows x64 Electron distribution. The Electron renderer
uses the same production frontend served by the bundled Relay Teams backend.
The renderer does not receive Node.js, filesystem, shell, or process access.

## Prerequisites

- Windows x64;
- Node.js and npm versions compatible with `frontend/app/package-lock.json`;
- `uv` with access to the Python version pinned by the repository;
- network access for the first Electron, PyInstaller, and NSIS tool downloads.

The backend build creates an isolated environment under
`.tmp/desktop-pyinstaller`. It uses the repository lock without default
dependency groups and pins PyInstaller 6.16.0. It does not package the project
development or evaluation environment.

## Commands

Run commands from `frontend/app`:

```text
npm ci
npm run desktop:package
npm run desktop:dist
npm run desktop:release
npm run desktop:smoke
```

`desktop:package` creates the unpacked application. `desktop:dist` creates the
NSIS installer. `desktop:release` creates both from one prepared renderer,
main/preload build, and frozen backend. `desktop:verify` runs focused contract
tests, creates both distributions, and executes the complete desktop smoke.

## Output

Release output is written to `.tmp/desktop-release`:

```text
win-unpacked/
  Agent Teams.exe
  resources/
    app.asar
    backend/
      relay-teams-backend.exe
      _internal/relay_teams/frontend/dist/index.html
Agent-Teams-Setup-<version>-x64.exe
Agent-Teams-Setup-<version>-x64.exe.blockmap
```

`app.asar` contains the compiled Electron main process, preload bridge, package
metadata, and `release-metadata.json`. The backend resource contains the Python
runtime, Relay Teams server, package resources, and production renderer.

The desktop product version follows npm SemVer (`0.0.3-dev.0` for the current
development release). `release-metadata.json` also records the Python backend
version (`0.0.3.dev0`) so both identities can be audited in the artifact.

## Runtime Contract

By default, the packaged main process selects an available loopback port,
starts `resources/backend/relay-teams-backend.exe server start`, polls
`/api/system/health`, and loads the root frontend URL. Closing the final window
stops the managed backend.

The development and diagnostic overrides remain available:

- `AGENT_TEAMS_BACKEND_URL` uses an externally managed backend;
- `AGENT_TEAMS_BACKEND_HOST` and `AGENT_TEAMS_BACKEND_PORT` select a fixed bind;
- `AGENT_TEAMS_BACKEND_COMMAND` and
  `AGENT_TEAMS_BACKEND_COMMAND_ARGS_JSON` override managed process startup;
- `AGENT_TEAMS_BACKEND_STARTUP_TIMEOUT_MS` and
  `AGENT_TEAMS_BACKEND_HEALTH_POLL_MS` control readiness polling.

The renderer can reload normally because it remains on the backend-served root
URL. Agent Teams does not currently register an application protocol, accept
desktop deep links, include an auto-updater, or expose a restart command. Those
capabilities were not present in the previous desktop inventory and are not
silently simulated by the release package.

## Signing

Local and CI artifacts are currently unsigned. `signAndEditExecutable` is
disabled so unsigned builds work in standard Windows sessions that cannot
create symbolic links while extracting electron-builder's signing tools. A
production signing identity and trusted CI signing step are required before a
public release. The default Electron application icon is also retained until a
release-owned `.ico` asset is approved.
