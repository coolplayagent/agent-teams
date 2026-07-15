import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "../api/http";

type FrontendLoggerModule = typeof import("../runtime/frontendLogger");
type HttpModule = typeof import("../api/http");

let frontendLogger: FrontendLoggerModule;
let http: HttpModule;

beforeEach(async () => {
  vi.resetModules();
  [frontendLogger, http] = await Promise.all([
    import("../runtime/frontendLogger"),
    import("../api/http"),
  ]);
});

afterEach(async () => {
  await frontendLogger.flushFrontendLogs();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("api http request helper", () => {
  it("uses no-store for GET and HEAD requests unless cache is explicit", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await http.requestJson("/sessions");
    await http.requestJson("/sessions", { method: "HEAD" });
    await http.requestJson("/sessions", { cache: "reload" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/sessions",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/sessions",
      expect.objectContaining({ cache: "no-store", method: "HEAD" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/sessions",
      expect.objectContaining({ cache: "reload" }),
    );
  });

  it("sets JSON headers, raises ApiError, logs failures, and emits backend hints", async () => {
    const hints = collectBackendStatusHints();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "busy" }), {
          headers: { "Content-Type": "application/json" },
          status: 503,
          statusText: "Service Unavailable",
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accepted: 1 }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      http.requestJson("/sessions", {
        body: JSON.stringify({ title: "Hello" }),
        method: "POST",
      }),
    ).rejects.toMatchObject({
      message: "busy",
      name: "ApiError",
      payload: { detail: "busy" },
      status: 503,
    } satisfies Partial<ApiError>);
    await frontendLogger.flushFrontendLogs();

    const requestInit = capturedRequestInit(fetchMock, 0);
    const headers = requestInit.headers;
    if (!(headers instanceof Headers)) {
      throw new Error("Expected request headers.");
    }
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(hints.values).toEqual(["offline"]);
    expect(capturedLogBatch(fetchMock, 1).events[0]).toMatchObject({
      event: "api.response.error",
      level: "error",
      message: "busy",
      payload: {
        method: "POST",
        status: 503,
        url: "/api/sessions",
      },
    });
    hints.dispose();
  });

  it("formats structured validation detail arrays into readable ApiError text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: [
            {
              loc: ["hooks", "PreToolUse", 0, "hooks", 0, "command"],
              msg: "Field required",
            },
          ],
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 400,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      http.requestJson("/system/configs/hooks:validate", { method: "POST" }),
    ).rejects.toMatchObject({
      detail: "hooks.PreToolUse.0.hooks.0.command: Field required",
      message: "hooks.PreToolUse.0.hooks.0.command: Field required",
      name: "ApiError",
      status: 400,
    } satisfies Partial<ApiError>);
  });

  it("does not log or emit backend hints for AbortError", async () => {
    const hints = collectBackendStatusHints();
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(http.requestJson("/sessions")).rejects.toMatchObject({
      name: "AbortError",
    });
    await frontendLogger.flushFrontendLogs();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hints.values).toEqual([]);
    hints.dispose();
  });

  it("logs network failures and suppresses repeated offline hints", async () => {
    const hints = collectBackendStatusHints();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/logs/frontend") {
        return Promise.resolve(new Response(JSON.stringify({ accepted: 2 }), { status: 200 }));
      }
      return Promise.reject(new TypeError("network down"));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(http.requestJson("/sessions")).rejects.toThrow("network down");
    await expect(http.requestJson("/roles")).rejects.toThrow("network down");
    await frontendLogger.flushFrontendLogs();

    expect(hints.values).toEqual(["offline"]);
    const batch = capturedLogBatch(fetchMock, 2);
    expect(batch.events).toHaveLength(2);
    expect(batch.events.map((event) => event.event)).toEqual([
      "api.request.exception",
      "api.request.exception",
    ]);
    hints.dispose();
  });
});

interface CapturedLogBatch {
  events: Array<{
    event: string;
    level: string;
    message: string;
    payload: Record<string, unknown>;
  }>;
}

function capturedRequestInit(fetchMock: ReturnType<typeof vi.fn>, index: number): RequestInit {
  const init = fetchMock.mock.calls[index]?.[1];
  if (init === undefined || typeof init !== "object") {
    throw new Error("Expected request init.");
  }
  return init as RequestInit;
}

function capturedLogBatch(
  fetchMock: ReturnType<typeof vi.fn>,
  index: number,
): CapturedLogBatch {
  const init = capturedRequestInit(fetchMock, index);
  if (typeof init.body !== "string") {
    throw new Error("Expected frontend log body.");
  }
  return JSON.parse(init.body) as CapturedLogBatch;
}

function collectBackendStatusHints(): {
  dispose: () => void;
  values: string[];
} {
  const values: string[] = [];
  const listener = (event: Event): void => {
    if (!(event instanceof CustomEvent)) {
      return;
    }
    const detail = event.detail as { status?: unknown };
    if (typeof detail.status === "string") {
      values.push(detail.status);
    }
  };
  window.addEventListener("agent-teams-backend-status-hint", listener);
  return {
    dispose: () => window.removeEventListener("agent-teams-backend-status-hint", listener),
    values,
  };
}
