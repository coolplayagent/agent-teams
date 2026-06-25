export type DesktopBackendOwnership = "external" | "managed";
export type DesktopBackendState = "starting" | "ready" | "failed" | "stopped";

export interface DesktopBackendStatus {
  baseUrl: string;
  message: string;
  state: DesktopBackendState;
}

export interface DesktopBackendPlan {
  appUrl: string;
  args: string[];
  baseUrl: string;
  command: string | null;
  healthPollMs: number;
  healthUrl: string;
  host: string;
  ownership: DesktopBackendOwnership;
  port: number;
  startupTimeoutMs: number;
}

export interface DesktopBackendPlanOptions {
  defaultHost?: string;
  defaultPort?: number;
  defaultStartupTimeoutMs?: number;
  defaultHealthPollMs?: number;
  env: Record<string, string | undefined>;
}

export const desktopBackendUrlEnv = "AGENT_TEAMS_BACKEND_URL";
export const desktopBackendHostEnv = "AGENT_TEAMS_BACKEND_HOST";
export const desktopBackendPortEnv = "AGENT_TEAMS_BACKEND_PORT";
export const desktopBackendCommandEnv = "AGENT_TEAMS_BACKEND_COMMAND";
export const desktopBackendCommandArgsEnv = "AGENT_TEAMS_BACKEND_COMMAND_ARGS_JSON";
export const desktopBackendStartupTimeoutEnv =
  "AGENT_TEAMS_BACKEND_STARTUP_TIMEOUT_MS";
export const desktopBackendHealthPollEnv = "AGENT_TEAMS_BACKEND_HEALTH_POLL_MS";
export const desktopDefaultHost = "127.0.0.1";
export const desktopDefaultPort = 8000;
export const desktopDefaultStartupTimeoutMs = 30000;
export const desktopDefaultHealthPollMs = 350;
export const desktopDefaultBackendCommand = "relay-teams";
const desktopBackendHealthPath = "/api/system/health";

export function buildDesktopBackendPlan(
  options: DesktopBackendPlanOptions,
): DesktopBackendPlan {
  const host = readHost(options);
  const port = readPort(options);
  const baseUrl =
    normalizeBaseUrl(options.env[desktopBackendUrlEnv]) ??
    `http://${host}:${port}`;
  const startupTimeoutMs = readPositiveInteger(
    options.env[desktopBackendStartupTimeoutEnv],
    options.defaultStartupTimeoutMs ?? desktopDefaultStartupTimeoutMs,
  );
  const healthPollMs = readPositiveInteger(
    options.env[desktopBackendHealthPollEnv],
    options.defaultHealthPollMs ?? desktopDefaultHealthPollMs,
  );
  const externalBaseUrl = normalizeBaseUrl(options.env[desktopBackendUrlEnv]);

  if (externalBaseUrl !== null) {
    return {
      appUrl: `${externalBaseUrl}/app/`,
      args: [],
      baseUrl: externalBaseUrl,
      command: null,
      healthPollMs,
      healthUrl: `${externalBaseUrl}${desktopBackendHealthPath}`,
      host,
      ownership: "external",
      port,
      startupTimeoutMs,
    };
  }

  const command =
    options.env[desktopBackendCommandEnv]?.trim() || desktopDefaultBackendCommand;
  const args =
    readCommandArgs(options.env[desktopBackendCommandArgsEnv], host, port)
    ?? ["server", "start", "--host", host, "--port", String(port)];

  return {
    appUrl: `${baseUrl}/app/`,
    args,
    baseUrl,
    command,
    healthPollMs,
    healthUrl: `${baseUrl}${desktopBackendHealthPath}`,
    host,
    ownership: "managed",
    port,
    startupTimeoutMs,
  };
}

export function normalizeBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === "") {
    return null;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
}

function readHost(options: DesktopBackendPlanOptions): string {
  const host = options.env[desktopBackendHostEnv]?.trim();
  return host !== undefined && host !== "" ? host : options.defaultHost ?? desktopDefaultHost;
}

function readPort(options: DesktopBackendPlanOptions): number {
  return readPositiveInteger(
    options.env[desktopBackendPortEnv],
    options.defaultPort ?? desktopDefaultPort,
  );
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function readCommandArgs(
  value: string | undefined,
  host: string,
  port: number,
): string[] | null {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
      return null;
    }
    return parsed.map((entry) =>
      entry.replaceAll("{host}", host).replaceAll("{port}", String(port)),
    );
  } catch {
    return null;
  }
}
