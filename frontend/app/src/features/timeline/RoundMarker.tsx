import type { SessionRound } from "../../api/contracts";
import { formatRoundTokens, roundSummary } from "./roundMetadata";

interface RoundMarkerProps {
  index: number;
  round: SessionRound;
}

export function RoundMarker({ index, round }: RoundMarkerProps) {
  const summary = roundSummary(round, index);
  const metaItems = [
    summary.timeLabel,
    summary.inputTokens > 0 ? `Input ${formatRoundTokens(summary.inputTokens)}` : "",
    summary.outputTokens > 0 ? `Output ${formatRoundTokens(summary.outputTokens)}` : "",
    summary.toolCount > 0 ? `Tools ${summary.toolCount}` : "",
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
