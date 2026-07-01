import type { JsonValue } from "./contracts";
import { logError } from "../runtime/frontendLogger";

export class ApiError extends Error {
  readonly status: number;
  readonly payload: JsonValue | null;

  constructor(message: string, status: number, payload: JsonValue | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";
const BACKEND_STATUS_HINT_EVENT = "agent-teams-backend-status-hint";
const BACKEND_STATUS_HINT_SUPPRESS_MS = 30_000;

let lastBackendStatusHint: { emittedAt: number; status: "offline" | "online" } | null =
  null;

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

export async function requestJson<TResponse>(
  path: string,
  init: RequestInit = {},
): Promise<TResponse> {
  const headers = new Headers(init.headers);
  const method = normalizedMethod(init.method);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const url = apiUrl(path);
  const fetchInit: RequestInit = {
    ...init,
    headers,
  };
  if ((method === "GET" || method === "HEAD") && fetchInit.cache === undefined) {
    fetchInit.cache = "no-store";
  }

  let response: Response;
  try {
    response = await fetch(url, fetchInit);
  } catch (error) {
    if (!isAbortError(error)) {
      emitBackendStatusHint("offline");
      logRequestError("api.request.exception", "API request failed", {
        error_name: errorName(error),
        error_message: unknownToMessage(error),
        method,
        url,
      });
    }
    throw error;
  }
  const payload = await readJson(response);
  if (!response.ok) {
    const message = errorMessage(payload, response.statusText);
    emitBackendStatusHint("offline");
    logRequestError("api.response.error", message, {
      method,
      status: response.status,
      url,
    });
    throw new ApiError(message, response.status, payload);
  }
  emitBackendStatusHint("online");
  return payload as TResponse;
}

export function resetHttpRequestStateForTests(): void {
  lastBackendStatusHint = null;
}

async function readJson(response: Response): Promise<JsonValue | null> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  return JSON.parse(text) as JsonValue;
}

function errorMessage(payload: JsonValue | null, fallback: string): string {
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    const detail = payload.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
  }
  return fallback || "Request failed";
}

function emitBackendStatusHint(status: "offline" | "online"): void {
  if (typeof window === "undefined") {
    return;
  }
  const now = Date.now();
  if (
    lastBackendStatusHint?.status === status &&
    now - lastBackendStatusHint.emittedAt < BACKEND_STATUS_HINT_SUPPRESS_MS
  ) {
    return;
  }
  lastBackendStatusHint = { emittedAt: now, status };
  window.dispatchEvent(
    new CustomEvent(BACKEND_STATUS_HINT_EVENT, {
      detail: { status },
    }),
  );
}

function normalizedMethod(method: string | undefined): string {
  return (method ?? "GET").toUpperCase();
}

function logRequestError(
  event: string,
  message: string,
  payload: Record<string, JsonValue>,
): void {
  logError(event, message, payload);
}

function isAbortError(error: unknown): boolean {
  return errorName(error) === "AbortError";
}

function errorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }
  if (typeof error === "object" && error !== null && "name" in error) {
    const value = (error as { name?: unknown }).name;
    return typeof value === "string" ? value : "";
  }
  return "";
}

function unknownToMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return "Request failed";
}
