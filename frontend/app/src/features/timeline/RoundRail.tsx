import { contentPartText, type SessionRound } from "../../api/contracts";

interface RoundRailProps {
  activeRunId: string | null;
  error: boolean;
  loading: boolean;
  onSelectRun: (runId: string) => void;
  rounds: SessionRound[];
}

export function RoundRail({
  activeRunId,
  error,
  loading,
  onSelectRun,
  rounds,
}: RoundRailProps) {
  if (!loading && !error && rounds.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Rounds" className="at-round-rail">
      {loading ? (
        <div className="at-round-rail-state">Loading rounds</div>
      ) : null}
      {error ? (
        <div className="at-round-rail-state">Rounds unavailable</div>
      ) : null}
      {!loading && !error ? (
        <div className="at-round-rail-list">
          {rounds.map((round, index) => {
            const title = roundTitle(round, index);
            const timeLabel = roundTimeLabel(round.created_at, index);
            const active = round.run_id === activeRunId;
            return (
              <button
                aria-current={active ? "step" : undefined}
                aria-label={`Go to round ${index + 1}: ${title}`}
                className={active ? "at-round-rail-item is-active" : "at-round-rail-item"}
                key={round.run_id}
                onClick={() => onSelectRun(round.run_id)}
                title={`${timeLabel} ${title}`}
                type="button"
              >
                <span className="at-round-rail-dot" />
                <span className="at-round-rail-time">{timeLabel}</span>
                <span className="at-round-rail-title">{title}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </nav>
  );
}

function roundTitle(round: SessionRound, index: number): string {
  const intentText = normalizedText(round.run_user_message)
    || normalizedText(roundIntentText(round))
    || normalizedText(round.intent)
    || normalizedText(round.run_diagnostic_message);
  if (intentText) {
    return intentText;
  }
  return `Round ${index + 1}`;
}

function roundIntentText(round: SessionRound): string {
  const parts = round.intent_parts ?? [];
  return parts
    .map((part) => contentPartText(part))
    .filter((text): text is string => text !== null && text.trim().length > 0)
    .join("");
}

function normalizedText(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function roundTimeLabel(value: string | undefined, index: number): string {
  if (value === undefined || value.trim().length === 0) {
    return `#${index + 1}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return `#${index + 1}`;
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
