import type { ReactNode } from "react";

export type FeedbackMessageKind = "error" | "info" | "success" | "warning";

export interface FeedbackMessenger {
  error: (content: ReactNode) => unknown;
  info: (content: ReactNode) => unknown;
  success: (content: ReactNode) => unknown;
  warning: (content: ReactNode) => unknown;
}

export interface FeedbackMessageOptions {
  dedupeKey?: string;
  dedupeMs?: number;
  now?: () => number;
}

const DEFAULT_FEEDBACK_DEDUPE_MS = 3000;
const dedupeExpiryByKey = new Map<string, number>();

export function showFeedbackMessage(
  messenger: FeedbackMessenger,
  kind: FeedbackMessageKind,
  content: ReactNode,
  options: FeedbackMessageOptions = {},
): boolean {
  const dedupeKey = options.dedupeKey?.trim() ?? "";
  if (dedupeKey.length > 0) {
    const now = options.now?.() ?? Date.now();
    const currentExpiry = dedupeExpiryByKey.get(dedupeKey) ?? 0;
    if (currentExpiry > now) {
      return false;
    }
    const dedupeMs = options.dedupeMs ?? DEFAULT_FEEDBACK_DEDUPE_MS;
    dedupeExpiryByKey.set(dedupeKey, now + Math.max(0, dedupeMs));
  }
  messenger[kind](content);
  return true;
}

export function resetFeedbackMessageDedupeForTests(): void {
  dedupeExpiryByKey.clear();
}
