import type { ReactNode } from "react";

import type { JsonValue } from "../api/contracts";
import {
  showFeedbackMessage,
  type FeedbackMessenger,
} from "../components/feedbackMessages";

export type FrontendLogLevel = "debug" | "info" | "warn" | "error";

export interface FrontendLogContext {
  activeStreamCount?: number;
  instanceId?: string | null;
  requestId?: string | null;
  roleId?: string | null;
  runId?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  traceId?: string | null;
}

export type FrontendLogPayload = Record<string, JsonValue>;

interface FrontendLogEvent {
  browser_session_id: string;
  event: string;
  instance_id: string | null;
  level: FrontendLogLevel;
  message: string;
  page: string;
  payload: FrontendLogPayload;
  request_id: string | null;
  role_id: string | null;
  route: string;
  run_id: string | null;
  session_id: string | null;
  task_id: string | null;
  trace_id: string | null;
  ts: string;
  user_agent: string | null;
}

const FRONTEND_LOG_ENDPOINT = "/logs/frontend";
const FRONTEND_LOG_BATCH_SIZE = 20;
const FRONTEND_LOG_FLUSH_DELAY_MS = 3500;
const browserSessionStorageKey = "agentTeams.frontendLogger.browserSessionId";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

let context: FrontendLogContext = {};
let flushTimer: number | null = null;
let globalLoggingInstalled = false;
let queuedEvents: FrontendLogEvent[] = [];

export function setFrontendLogContext(nextContext: FrontendLogContext): void {
  context = {
    ...context,
    ...nextContext,
  };
}

export function logDebug(
  event: string,
  message: string,
  payload: FrontendLogPayload = {},
): void {
  enqueueFrontendLog("debug", event, message, payload);
}

export function logInfo(
  event: string,
  message: string,
  payload: FrontendLogPayload = {},
): void {
  enqueueFrontendLog("info", event, message, payload);
}

export function logWarn(
  event: string,
  message: string,
  payload: FrontendLogPayload = {},
): void {
  enqueueFrontendLog("warn", event, message, payload);
}

export function logError(
  event: string,
  message: string,
  payload: FrontendLogPayload = {},
): void {
  enqueueFrontendLog("error", event, message, payload);
}

export function sysLog(
  message: ReactNode,
  tone: "log-error" | "log-info" | "log-warn" = "log-info",
  messenger?: FeedbackMessenger,
): void {
  const text = typeof message === "string" ? message : String(message);
  if (tone === "log-error") {
    logError("syslog", text);
    if (messenger !== undefined) {
      showFeedbackMessage(messenger, "error", message, {
        dedupeKey: `syslog:error:${text}`,
        dedupeMs: 6500,
      });
    }
    return;
  }
  if (tone === "log-warn") {
    logWarn("syslog", text);
    return;
  }
  logInfo("syslog", text);
}

export async function flushFrontendLogs(options: { keepalive?: boolean } = {}): Promise<void> {
  clearFlushTimer();
  const events = queuedEvents;
  if (events.length === 0) {
    return;
  }
  queuedEvents = [];
  if (options.keepalive && sendFrontendLogBeacon(events)) {
    return;
  }
  try {
    await fetch(frontendLogUrl(), {
      body: JSON.stringify({ events }),
      headers: { "Content-Type": "application/json" },
      keepalive: options.keepalive === true,
      method: "POST",
    });
  } catch {
    // Logging must never make user-facing work fail.
  }
}

export function installGlobalErrorLogging(): void {
  if (globalLoggingInstalled) {
    return;
  }
  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);
  window.addEventListener("beforeunload", handleBeforeUnload);
  globalLoggingInstalled = true;
}

export function resetFrontendLoggerForTests(): void {
  queuedEvents = [];
  context = {};
  clearFlushTimer();
  if (globalLoggingInstalled) {
    window.removeEventListener("error", handleWindowError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    window.removeEventListener("beforeunload", handleBeforeUnload);
    globalLoggingInstalled = false;
  }
  window.sessionStorage.removeItem(browserSessionStorageKey);
}

function enqueueFrontendLog(
  level: FrontendLogLevel,
  event: string,
  message: string,
  payload: FrontendLogPayload,
): void {
  queuedEvents.push({
    browser_session_id: browserSessionId(),
    event,
    instance_id: normalizedContextValue(context.instanceId),
    level,
    message,
    page: document.title || "agent-teams",
    payload,
    request_id: normalizedContextValue(context.requestId),
    role_id: normalizedContextValue(context.roleId),
    route: window.location.pathname,
    run_id: normalizedContextValue(context.runId),
    session_id: normalizedContextValue(context.sessionId),
    task_id: normalizedContextValue(context.taskId),
    trace_id: normalizedContextValue(context.traceId),
    ts: new Date().toISOString(),
    user_agent: navigator.userAgent || null,
  });
  if (queuedEvents.length >= FRONTEND_LOG_BATCH_SIZE) {
    void flushFrontendLogs();
    return;
  }
  scheduleFlush();
}

function browserSessionId(): string {
  const existing = window.sessionStorage.getItem(browserSessionStorageKey);
  if (existing !== null && existing.trim().length > 0) {
    return existing;
  }
  const generated = `browser_${randomIdentifier()}`;
  window.sessionStorage.setItem(browserSessionStorageKey, generated);
  return generated;
}

function randomIdentifier(): string {
  const cryptoApi = window.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function scheduleFlush(): void {
  if (flushTimer !== null) {
    return;
  }
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    if ((context.activeStreamCount ?? 0) > 0) {
      scheduleFlush();
      return;
    }
    void flushFrontendLogs();
  }, FRONTEND_LOG_FLUSH_DELAY_MS);
}

function clearFlushTimer(): void {
  if (flushTimer === null) {
    return;
  }
  window.clearTimeout(flushTimer);
  flushTimer = null;
}

function sendFrontendLogBeacon(events: FrontendLogEvent[]): boolean {
  if (typeof navigator.sendBeacon !== "function") {
    return false;
  }
  return navigator.sendBeacon(
    frontendLogUrl(),
    new Blob([JSON.stringify({ events })], { type: "application/json" }),
  );
}

function frontendLogUrl(): string {
  return `${API_BASE}${FRONTEND_LOG_ENDPOINT}`;
}

function normalizedContextValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function handleWindowError(event: ErrorEvent): void {
  logError("window.error", event.message || "Unhandled frontend error", {
    filename: event.filename,
    lineno: event.lineno,
  });
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  logError("window.unhandled_rejection", unknownToMessage(event.reason));
}

function handleBeforeUnload(): void {
  void flushFrontendLogs({ keepalive: true });
}

function unknownToMessage(value: unknown): string {
  if (value instanceof Error && value.message.trim().length > 0) {
    return value.message;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return "Unhandled frontend error";
}
