import type { SessionRound } from "../../api/contracts";
import type { Translate } from "../../i18n";
import { formatRoundTokens, roundSummary } from "./roundMetadata";

interface RoundMarkerProps {
  index: number;
  round: SessionRound;
  t: Translate;
}

export function RoundMarker({ index, round, t }: RoundMarkerProps) {
  const summary = roundSummary(round, index);
  const metaItems = [
    summary.timeLabel,
    summary.inputTokens > 0
      ? `${t("tokenInput")} ${formatRoundTokens(summary.inputTokens)}`
      : "",
    summary.outputTokens > 0
      ? `${t("tokenOutput")} ${formatRoundTokens(summary.outputTokens)}`
      : "",
    summary.toolCount > 0 ? `${t("timelineTools")} ${summary.toolCount}` : "",
    summary.statusLabel ?? "",
    summary.durationLabel !== null ? `${summary.durationLabel}` : "",
  ].filter(Boolean);

  return (
    <div className="at-round-marker-content">
      <div className="at-round-marker-meta">
        {metaItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <div className="at-round-marker-title">{summary.title}</div>
    </div>
  );
}
