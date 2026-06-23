import type { SessionRound } from "../../api/contracts";
import type { Translate } from "../../i18n";
import { roundTimeLabel, roundTitle } from "./roundMetadata";

interface RoundRailProps {
  activeRunId: string | null;
  onSelectRun: (runId: string) => void;
  rounds: SessionRound[];
  t: Translate;
}

export function RoundRail({
  activeRunId,
  onSelectRun,
  rounds,
  t,
}: RoundRailProps) {
  return (
    <nav aria-label={t("timelineRounds")} className="at-round-rail">
      <div className="at-round-rail-list">
        {rounds.map((round, index) => {
          const title = roundTitle(round, index);
          const timeLabel = roundTimeLabel(round.created_at, index);
          const active = round.run_id === activeRunId;
          return (
            <button
              aria-current={active ? "step" : undefined}
              aria-label={t("timelineGoToRound", {
                round: index + 1,
                title,
              })}
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
    </nav>
  );
}
