import { describe, expect, it } from "vitest";

import {
  buildDesktopBackendPlan,
  desktopDefaultBackendCommand,
  desktopDefaultHealthPollMs,
  desktopDefaultStartupTimeoutMs,
  normalizeBaseUrl,
} from "../desktop/backendPlan";

describe("desktop backend plan", () => {
  it("uses an externally managed backend URL when provided", () => {
    const plan = buildDesktopBackendPlan({
      env: {
        AGENT_TEAMS_BACKEND_URL: "http://127.0.0.1:9100/",
      },
    });

    expect(plan).toEqual({
      appUrl: "http://127.0.0.1:9100/app/",
      args: [],
      baseUrl: "http://127.0.0.1:9100",
      command: null,
      healthPollMs: desktopDefaultHealthPollMs,
      healthUrl: "http://127.0.0.1:9100/api/health",
      host: "127.0.0.1",
      ownership: "external",
      port: 8000,
      startupTimeoutMs: desktopDefaultStartupTimeoutMs,
    });
  });

  it("builds a managed relay-teams server command by default", () => {
    const plan = buildDesktopBackendPlan({
      env: {
        AGENT_TEAMS_BACKEND_HOST: "127.0.0.2",
        AGENT_TEAMS_BACKEND_PORT: "8123",
      },
    });

    expect(plan.command).toBe(desktopDefaultBackendCommand);
    expect(plan.args).toEqual([
      "server",
      "start",
      "--host",
      "127.0.0.2",
      "--port",
      "8123",
    ]);
    expect(plan.appUrl).toBe("http://127.0.0.2:8123/app/");
    expect(plan.healthUrl).toBe("http://127.0.0.2:8123/api/health");
    expect(plan.ownership).toBe("managed");
  });

  it("accepts explicit startup timing and command overrides", () => {
    const plan = buildDesktopBackendPlan({
      env: {
        AGENT_TEAMS_BACKEND_COMMAND: "uv",
        AGENT_TEAMS_BACKEND_HEALTH_POLL_MS: "125",
        AGENT_TEAMS_BACKEND_STARTUP_TIMEOUT_MS: "12000",
      },
    });

    expect(plan.command).toBe("uv");
    expect(plan.healthPollMs).toBe(125);
    expect(plan.startupTimeoutMs).toBe(12000);
  });

  it("accepts managed backend command args with host and port placeholders", () => {
    const plan = buildDesktopBackendPlan({
      env: {
        AGENT_TEAMS_BACKEND_COMMAND: "node",
        AGENT_TEAMS_BACKEND_COMMAND_ARGS_JSON: JSON.stringify([
          "desktop-backend-stub.mjs",
          "server",
          "start",
          "--host",
          "{host}",
          "--port",
          "{port}",
        ]),
        AGENT_TEAMS_BACKEND_HOST: "127.0.0.3",
        AGENT_TEAMS_BACKEND_PORT: "8131",
      },
    });

    expect(plan.command).toBe("node");
    expect(plan.args).toEqual([
      "desktop-backend-stub.mjs",
      "server",
      "start",
      "--host",
      "127.0.0.3",
      "--port",
      "8131",
    ]);
    expect(plan.ownership).toBe("managed");
  });

  it("ignores malformed external URLs and falls back to a managed backend", () => {
    const plan = buildDesktopBackendPlan({
      env: {
        AGENT_TEAMS_BACKEND_PORT: "not-a-port",
        AGENT_TEAMS_BACKEND_URL: "127.0.0.1:9000",
      },
    });

    expect(plan.ownership).toBe("managed");
    expect(plan.port).toBe(8000);
    expect(plan.baseUrl).toBe("http://127.0.0.1:8000");
  });

  it("normalizes supported backend base URLs", () => {
    expect(normalizeBaseUrl(" https://agent-teams.local/// ")).toBe(
      "https://agent-teams.local",
    );
    expect(normalizeBaseUrl("file:///tmp/app")).toBeNull();
    expect(normalizeBaseUrl("")).toBeNull();
  });
});
