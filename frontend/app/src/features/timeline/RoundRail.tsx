import type { SessionRound } from "../../api/contracts";
import { roundTimeLabel, roundTitle } from "./roundMetadata";

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
