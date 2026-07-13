export type TimelineInjectionStatus = "applied" | "failed" | "queued";

const APPROVED_APPROVAL_ACTIONS = new Set<string>([
  "approve",
  "approve_exact",
  "approve_once",
  "approve_prefix",
]);
const ERROR_APPROVAL_ACTIONS = new Set<string>([
  "cancel",
  "cancelled",
  "deny",
  "denied",
  "reject",
  "rejected",
  "timed_out",
  "timeout",
]);
const ERROR_TOOL_OUTCOMES = new Set<string>(["denied", "failed"]);

const INJECTION_STATUS_CONTRACT = {
  applied: "applied",
  delivered: "applied",
  enqueued: "queued",
  error: "failed",
  failed: "failed",
  pending: "queued",
  queued: "queued",
} as const satisfies Record<string, TimelineInjectionStatus>;

export function normalizedInjectionStatus(
  status: string | null | undefined,
): TimelineInjectionStatus {
  const normalized = (status ?? "").trim().toLowerCase();
  return Object.hasOwn(INJECTION_STATUS_CONTRACT, normalized)
    ? INJECTION_STATUS_CONTRACT[normalized as keyof typeof INJECTION_STATUS_CONTRACT]
    : "queued";
}

export function approvalActionIsApproved(action: string): boolean {
  return APPROVED_APPROVAL_ACTIONS.has(action.trim().toLowerCase());
}

export function approvalActionIsError(action: string): boolean {
  return ERROR_APPROVAL_ACTIONS.has(action.trim().toLowerCase());
}

export function toolOutcomeIsError(outcome: unknown): boolean {
  return typeof outcome === "string" &&
    ERROR_TOOL_OUTCOMES.has(outcome.trim().toLowerCase());
}
