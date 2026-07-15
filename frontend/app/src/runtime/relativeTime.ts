import type { Language } from "./uiStore";

const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

export function formatCompactRelativeTime(
  value: string | undefined,
  language: Language,
  nowMs = Date.now(),
): string {
  if (value === undefined || !value.trim()) {
    return "";
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const elapsedMs = Math.max(0, nowMs - timestamp);
  if (elapsedMs < minuteMs) {
    return new Intl.RelativeTimeFormat(language, {
      numeric: "auto",
      style: "narrow",
    }).format(0, "second");
  }
  if (elapsedMs < hourMs) {
    return compactUnit(language, Math.floor(elapsedMs / minuteMs), "minute");
  }
  if (elapsedMs < dayMs) {
    return compactUnit(language, Math.floor(elapsedMs / hourMs), "hour");
  }
  if (elapsedMs < 7 * dayMs) {
    return compactUnit(language, Math.floor(elapsedMs / dayMs), "day");
  }
  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
  }).format(new Date(timestamp));
}

function compactUnit(
  language: Language,
  value: number,
  unit: "day" | "hour" | "minute",
): string {
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit,
    unitDisplay: "narrow",
  }).format(value);
}
