import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startManagedNetworkProxy } from "./managed-network-proxy";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = resolve(packageRoot, "../..");

export interface ManagedRealBackend {
  apiBaseUrl: string;
  close: () => Promise<void>;
  interruptNetwork: (offlineMs?: number) => Promise<void>;
}

interface ManagedProcess {
  logFile: string;
  logStream: ReturnType<typeof createWriteStream>;
  name: string;
  process: ChildProcessWithoutNullStreams;
}

export async function startManagedRealBackend(): Promise<ManagedRealBackend> {
  const fakeLlmPort = await findFreePort();
  const backendPort = await findFreePort();
  const runtimeRoot = await makeRuntimeRoot();
  const fakeLlmBaseUrl = `http://127.0.0.1:${fakeLlmPort}`;
  const apiBaseUrl = `http://127.0.0.1:${backendPort}`;
  await writeRuntimeConfig(runtimeRoot, `${fakeLlmBaseUrl}/v1`);

  const env = managedProcessEnv(runtimeRoot);
  const fakeLlm = startManagedProcess({
    args: [
      "-m",
      "uvicorn",
      "integration_tests.support.fake_llm_server:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(fakeLlmPort),
      "--log-level",
      "warning",
    ],
    env,
    logFile: join(runtimeRoot, "fake-llm.log"),
    name: "fake-llm",
  });
  let backend: ManagedProcess | null = null;
  let networkProxy: Awaited<ReturnType<typeof startManagedNetworkProxy>> | null = null;
  try {
    await waitForHttpReady(`${fakeLlmBaseUrl}/health`, fakeLlm, 20_000);
    backend = startManagedProcess({
      args: [
        "-m",
        "uvicorn",
        "relay_teams.interfaces.server.app:app",
        "--host",
        "127.0.0.1",
        "--port",
        String(backendPort),
        "--log-level",
        "warning",
      ],
      env,
      logFile: join(runtimeRoot, "backend.log"),
      name: "agent-teams-backend",
    });
    await waitForHttpReady(`${apiBaseUrl}/api/system/health`, backend, 90_000);
    await waitForHttpReady(`${apiBaseUrl}/api/sessions?workspace_id=default`, backend, 90_000);
    networkProxy = await startManagedNetworkProxy(backendPort);
    return {
      apiBaseUrl: networkProxy.baseUrl,
      close: async () => {
        if (networkProxy !== null) {
          await networkProxy.close();
        }
        if (backend !== null) {
          await stopManagedProcess(backend);
        }
        await stopManagedProcess(fakeLlm);
        await rm(runtimeRoot, { force: true, recursive: true });
      },
      interruptNetwork: networkProxy.interrupt,
    };
  } catch (error) {
    if (networkProxy !== null) {
      await networkProxy.close();
    }
    if (backend !== null) {
      await stopManagedProcess(backend);
    }
    await stopManagedProcess(fakeLlm);
    await rm(runtimeRoot, { force: true, recursive: true });
    throw error;
  }
}

async function makeRuntimeRoot(): Promise<string> {
  const root = join(tmpdir(), `agent-teams-managed-live-${process.pid}-${Date.now()}`);
  await mkdir(root, { recursive: true });
  return root;
}

async function writeRuntimeConfig(
  runtimeRoot: string,
  fakeLlmV1BaseUrl: string,
): Promise<void> {
  const configDir = join(runtimeRoot, ".relay-teams");
  await mkdir(configDir, { recursive: true });
  await writeFile(
    join(configDir, "model.json"),
    JSON.stringify(
      {
        default: {
          api_key: "test-api-key",
          base_url: fakeLlmV1BaseUrl,
          context_window: 22000,
          max_tokens: 512,
          model: "fake-chat-model",
          temperature: 0,
          top_p: 1,
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function managedProcessEnv(runtimeRoot: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const pythonPaths = [repoRoot, join(repoRoot, "src"), join(repoRoot, "tests")];
  const existingPythonPath = env.PYTHONPATH?.trim();
  if (existingPythonPath) {
    pythonPaths.push(existingPythonPath);
  }
  env.PYTHONPATH = pythonPaths.join(process.platform === "win32" ? ";" : ":");
  env.HOME = runtimeRoot;
  env.USERPROFILE = runtimeRoot;
  if (process.platform === "win32") {
    env.HOMEDRIVE = runtimeRoot.slice(0, 2);
    env.HOMEPATH = runtimeRoot.slice(2) || "\\";
  }
  env.AGENT_TEAMS_COMPUTER_RUNTIME = "fake";
  env.PYTHON_KEYRING_BACKEND = "keyring.backends.null.Keyring";
  env.RELAY_TEAMS_LLM_HTTP_MAX_CONCURRENCY = "4";
  for (const key of [
    "HTTP_PROXY",
    "http_proxy",
    "HTTPS_PROXY",
    "https_proxy",
    "ALL_PROXY",
    "all_proxy",
    "NO_PROXY",
    "no_proxy",
    "SSL_VERIFY",
  ]) {
    delete env[key];
  }
  return env;
}

function startManagedProcess(options: {
  args: string[];
  env: NodeJS.ProcessEnv;
  logFile: string;
  name: string;
}): ManagedProcess {
  const logStream = createWriteStream(options.logFile, { flags: "a" });
  const child = spawn(pythonExecutable(), options.args, {
    cwd: repoRoot,
    env: options.env,
  });
  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });
  return {
    logFile: options.logFile,
    logStream,
    name: options.name,
    process: child,
  };
}

function pythonExecutable(): string {
  const configured = process.env.AGENT_TEAMS_TEST_PYTHON?.trim();
  if (configured) {
    return configured;
  }
  const windowsVenvPython = join(repoRoot, ".venv", "Scripts", "python.exe");
  if (existsSync(windowsVenvPython)) {
    return windowsVenvPython;
  }
  const unixVenvPython = join(repoRoot, ".venv", "bin", "python");
  if (existsSync(unixVenvPython)) {
    return unixVenvPython;
  }
  return "python";
}

async function stopManagedProcess(processInfo: ManagedProcess): Promise<void> {
  if (processInfo.process.exitCode === null && !processInfo.process.killed) {
    processInfo.process.kill();
    await Promise.race([
      new Promise<void>((resolveClose) => {
        processInfo.process.once("close", () => resolveClose());
      }),
      new Promise<void>((resolveTimeout) => {
        setTimeout(resolveTimeout, 5_000);
      }),
    ]);
  }
  if (processInfo.process.exitCode === null && !processInfo.process.killed) {
    processInfo.process.kill("SIGKILL");
  }
  processInfo.logStream.end();
}

async function waitForHttpReady(
  url: string,
  processInfo: ManagedProcess,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (processInfo.process.exitCode !== null) {
      throw new Error(
        `${processInfo.name} exited before ${url} became ready.\n${await logTail(processInfo.logFile)}`,
      );
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry until timeout
    }
    await new Promise((resolveWait) => {
      setTimeout(resolveWait, 250);
    });
  }
  throw new Error(
    `${processInfo.name} did not become ready at ${url}.\n${await logTail(processInfo.logFile)}`,
  );
}

async function logTail(logFile: string): Promise<string> {
  try {
    const content = await readFile(logFile, "utf-8");
    return content.slice(-4000);
  } catch {
    return "";
  }
}

async function findFreePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        rejectPort(new Error("Expected TCP server to bind to a port."));
        return;
      }
      const port = address.port;
      server.close(() => resolvePort(port));
    });
  });
}
