export type TimelineInjectionStatus = "applied" | "failed" | "queued";

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
