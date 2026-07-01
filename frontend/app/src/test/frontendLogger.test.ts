import { afterEach, describe, expect, it, vi } from "vitest";

import {
  flushFrontendLogs,
  installGlobalErrorLogging,
  logError,
  logInfo,
  resetFrontendLoggerForTests,
  setFrontendLogContext,
  sysLog,
} from "../runtime/frontendLogger";

afterEach(() => {
  resetFrontendLoggerForTests();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("frontendLogger", () => {
  it("batches structured frontend log events through the backend endpoint", async () => {
    const fetchMock = mockFetch();
    window.history.replaceState(null, "", "/app/");

    logError("frontend.test.failure", "frontend failed", {
      component: "composer",
    });
    await flushFrontendLogs();

    const batch = capturedBatch(fetchMock);
    expect(batch.events).toHaveLength(1);
    expect(batch.events[0]).toMatchObject({
      browser_session_id: expect.stringMatching(/^browser_/),
      event: "frontend.test.failure",
      level: "error",
      message: "frontend failed",
      page: "agent-teams",
      payload: { component: "composer" },
      route: "/app/",
    });
  });

  it("keeps run context nullable when no active run is known", async () => {
    const fetchMock = mockFetch();
    setFrontendLogContext({ runId: null, sessionId: "session-ui" });

    logInfo("frontend.test.info", "frontend ok");
    await flushFrontendLogs();

    expect(capturedBatch(fetchMock).events[0]).toMatchObject({
      run_id: null,
      session_id: "session-ui",
      trace_id: null,
    });
  });

  it("flushes full batches without using sendBeacon", async () => {
    const fetchMock = mockFetch();
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });

    for (let index = 0; index < 20; index += 1) {
      logInfo("frontend.test.batch", `batch ${index}`);
    }
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(capturedBatch(fetchMock).events).toHaveLength(20);
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("surfaces syslog errors through feedback without rendering a system log panel", async () => {
    const fetchMock = mockFetch();
    const messenger = {
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    };

    sysLog("Session load failed", "log-error", messenger);
    sysLog("Background sync complete");
    await flushFrontendLogs();

    expect(messenger.error).toHaveBeenCalledWith("Session load failed");
    expect(capturedBatch(fetchMock).events.map((event) => event.level)).toEqual([
      "error",
      "info",
    ]);
  });

  it("uses sendBeacon for beforeunload even when active streams defer normal flushes", async () => {
    const fetchMock = mockFetch();
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });
    setFrontendLogContext({ activeStreamCount: 1, runId: "run-ui" });

    installGlobalErrorLogging();
    logError("frontend.test.unload", "flush during unload");
    window.dispatchEvent(new Event("beforeunload"));

    expect(sendBeacon).toHaveBeenCalledWith(
      "/api/logs/frontend",
      expect.any(Blob),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

interface CapturedBatch {
  events: Array<Record<string, unknown>>;
}

function mockFetch() {
  return vi
    .spyOn(window, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ accepted: 1 }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }));
}

function capturedBatch(fetchMock: ReturnType<typeof mockFetch>): CapturedBatch {
  const body = fetchMock.mock.calls[0]?.[1]?.body;
  if (typeof body !== "string") {
    throw new Error("Expected a JSON string frontend log payload.");
  }
  return JSON.parse(body) as CapturedBatch;
}
