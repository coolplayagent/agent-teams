import { LoaderCircle } from "lucide-react";

import type { RuntimeRunState } from "../../runtime/reducers";

export function ModelRequestStatus({
  phase,
  waitingLabel,
  openingLabel,
}: {
  phase: RuntimeRunState["modelRequestPhase"];
  waitingLabel: string;
  openingLabel: string;
}) {
  if (phase !== "waiting_for_slot" && phase !== "opening_stream") {
    return null;
  }
  return (
    <div className="at-model-request-status" role="status">
      <LoaderCircle aria-hidden="true" className="at-model-request-status-icon" size={14} />
      <span>{phase === "waiting_for_slot" ? waitingLabel : openingLabel}</span>
    </div>
  );
}
