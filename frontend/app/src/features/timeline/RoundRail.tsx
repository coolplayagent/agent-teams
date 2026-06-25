import type { SessionRound } from "../../api/contracts";
import type { Translate } from "../../i18n";
import { roundSummary } from "./roundMetadata";

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
          const summary = roundSummary(round, index);
          const active = round.run_id === activeRunId;
          const classNames = [
            "at-round-rail-item",
            active ? "is-active" : "",
            summary.tone !== null ? `is-${summary.tone}` : "",
          ].filter(Boolean).join(" ");
          return (
            <button
              aria-current={active ? "step" : undefined}
              aria-label={t("timelineGoToRound", {
                round: index + 1,
                title: summary.title,
              })}
              className={classNames}
              key={round.run_id}
              onClick={() => onSelectRun(round.run_id)}
              title={`${summary.timeLabel} ${summary.title}`}
              type="button"
            >
              <span className="at-round-rail-dot" />
              <span className="at-round-rail-time">{summary.timeLabel}</span>
              <span className="at-round-rail-title">{summary.title}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
