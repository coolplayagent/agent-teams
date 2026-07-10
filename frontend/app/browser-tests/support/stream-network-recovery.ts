import type { CDPSession, Page } from "@playwright/test";

export interface EventStreamRequestEvidence {
  afterEventId: number | null;
  lastEventId: number | null;
  url: string;
}

export interface EventStreamProbe {
  failures: string[];
  requests: EventStreamRequestEvidence[];
  stop: () => Promise<void>;
}

export async function observeEventStreams(page: Page): Promise<EventStreamProbe> {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  const failures: string[] = [];
  const requests: EventStreamRequestEvidence[] = [];
  const requestIndexes = new Map<string, number>();
  const requestUrls = new Map<string, string>();
  const pendingLastEventIds = new Map<string, string>();
  const onRequest = (rawPayload: unknown) => {
    const payload = networkRequestPayload(rawPayload);
    if (payload === null || !isEventStreamUrl(payload.url)) {
      return;
    }
    requestUrls.set(payload.requestId, payload.url);
    const pendingLastEventId = pendingLastEventIds.get(payload.requestId);
    requests.push({
      afterEventId: queryEventId(payload.url, "after_event_id"),
      lastEventId: headerEventId(pendingLastEventId ?? payload.lastEventId),
      url: payload.url,
    });
    requestIndexes.set(payload.requestId, requests.length - 1);
    pendingLastEventIds.delete(payload.requestId);
  };
  const onRequestExtraInfo = (rawPayload: unknown) => {
    const payload = networkRequestExtraInfoPayload(rawPayload);
    if (payload === null || payload.lastEventId === undefined) {
      return;
    }
    const requestIndex = requestIndexes.get(payload.requestId);
    if (requestIndex === undefined) {
      pendingLastEventIds.set(payload.requestId, payload.lastEventId);
      return;
    }
    const request = requests[requestIndex];
    if (request !== undefined) {
      request.lastEventId = headerEventId(payload.lastEventId);
    }
  };
  const onRequestFailed = (rawPayload: unknown) => {
    const requestId = networkLoadingFailedRequestId(rawPayload);
    if (requestId === null) {
      return;
    }
    const url = requestUrls.get(requestId);
    if (url !== undefined) {
      failures.push(url);
    }
  };
  session.on("Network.requestWillBeSent", onRequest);
  session.on("Network.requestWillBeSentExtraInfo", onRequestExtraInfo);
  session.on("Network.loadingFailed", onRequestFailed);
  return {
    failures,
    requests,
    stop: async () => {
      session.off("Network.requestWillBeSent", onRequest);
      session.off("Network.requestWillBeSentExtraInfo", onRequestExtraInfo);
      session.off("Network.loadingFailed", onRequestFailed);
      await session.detach();
    },
  };
}

export function eventStreamEvidenceForRun(
  evidence: EventStreamRequestEvidence[],
  runId: string,
): EventStreamRequestEvidence[] {
  return evidence.filter((entry) => streamUrlContainsRun(entry.url, runId));
}

export function eventStreamFailuresForRun(failures: string[], runId: string): string[] {
  return failures.filter((url) => streamUrlContainsRun(url, runId));
}

export function eventStreamEvidenceForSubagentSession(
  evidence: EventStreamRequestEvidence[],
  sessionId: string,
): EventStreamRequestEvidence[] {
  return evidence.filter((entry) => subagentSessionStreamUrl(entry.url, sessionId));
}

export function eventStreamFailuresForSubagentSession(
  failures: string[],
  sessionId: string,
): string[] {
  return failures.filter((url) => subagentSessionStreamUrl(url, sessionId));
}

export function hasPositiveRecoveryCursor(
  evidence: EventStreamRequestEvidence[],
): boolean {
  return evidence.some(
    (entry) => (entry.afterEventId ?? 0) > 0 || (entry.lastEventId ?? 0) > 0,
  );
}

function isEventStreamUrl(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).pathname.endsWith("/events");
  } catch {
    return false;
  }
}

function streamUrlContainsRun(rawUrl: string, runId: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.pathname.includes(`/runs/${runId}/events`) ||
      url.searchParams.getAll("run_id").includes(runId);
  } catch {
    return false;
  }
}

function subagentSessionStreamUrl(rawUrl: string, sessionId: string): boolean {
  try {
    const path = new URL(rawUrl).pathname;
    return path.includes(
      `/sessions/${encodeURIComponent(sessionId)}/subagents/events`,
    );
  } catch {
    return false;
  }
}

function queryEventId(rawUrl: string, key: string): number | null {
  try {
    return nonNegativeInteger(new URL(rawUrl).searchParams.get(key));
  } catch {
    return null;
  }
}

function headerEventId(value: string | undefined): number | null {
  return nonNegativeInteger(value ?? null);
}

interface NetworkRequestEvidencePayload {
  lastEventId: string | undefined;
  requestId: string;
  url: string;
}

interface NetworkRequestExtraInfoPayload {
  lastEventId: string | undefined;
  requestId: string;
}

function networkRequestPayload(value: unknown): NetworkRequestEvidencePayload | null {
  if (!isRecord(value) || typeof value.requestId !== "string") {
    return null;
  }
  const request = value.request;
  if (!isRecord(request) || typeof request.url !== "string") {
    return null;
  }
  const headers = isRecord(request.headers) ? request.headers : {};
  return {
    lastEventId: stringHeader(headers, "last-event-id"),
    requestId: value.requestId,
    url: request.url,
  };
}

function networkLoadingFailedRequestId(value: unknown): string | null {
  return isRecord(value) && typeof value.requestId === "string"
    ? value.requestId
    : null;
}

function networkRequestExtraInfoPayload(
  value: unknown,
): NetworkRequestExtraInfoPayload | null {
  if (!isRecord(value) || typeof value.requestId !== "string") {
    return null;
  }
  const headers = isRecord(value.headers) ? value.headers : {};
  return {
    lastEventId: stringHeader(headers, "last-event-id"),
    requestId: value.requestId,
  };
}

function stringHeader(
  headers: Record<string, unknown>,
  expectedName: string,
): string | undefined {
  const entry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === expectedName,
  );
  return typeof entry?.[1] === "string" ? entry[1] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
