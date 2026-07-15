import { Button } from "antd";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Translate } from "../../i18n";
import { humanReadableToolText } from "./toolPresentation";

const COPY_FEEDBACK_RESET_MS = 4_000;

interface ToolCallDetailsProps {
  callId: string;
  error: boolean;
  input: string;
  interactive?: boolean;
  output: string;
  raw: string;
  t: Translate;
  toolName: string;
}

export function ToolCallDetails({
  callId,
  error,
  input,
  interactive = true,
  output,
  raw,
  t,
  toolName,
}: ToolCallDetailsProps) {
  return (
    <div className="at-tool-details">
      {callId ? (
        <div className="at-tool-call-id">
          <span>{t("timelineCallId")}</span>
          <code>{callId}</code>
          {interactive ? (
            <CopyButton label={t("timelineCopyCallId")} t={t} text={callId} />
          ) : null}
        </div>
      ) : null}
      {input.trim() ? (
        <ToolDetailSection
          label={t("timelineToolInput")}
          interactive={interactive}
          text={input}
          toolName={toolName}
        />
      ) : null}
      {output.trim() ? (
        <ToolDetailSection
          error={error}
          label={error ? t("timelineToolError") : t("timelineToolOutput")}
          interactive={interactive}
          text={output}
          toolName={toolName}
        />
      ) : null}
      {raw.trim() && raw.trim() !== input.trim() && raw.trim() !== output.trim() ? (
        <details className="at-tool-raw-details">
          <summary>{t("timelineToolRawDetails")}</summary>
          {interactive ? (
            <div className="at-tool-raw-actions">
              <CopyButton label={t("timelineCopyRawDetails")} t={t} text={raw} />
            </div>
          ) : null}
          <pre>{raw}</pre>
        </details>
      ) : null}
    </div>
  );
}

function ToolDetailSection({
  error = false,
  interactive,
  label,
  text,
  toolName,
}: {
  error?: boolean;
  interactive: boolean;
  label: string;
  text: string;
  toolName: string;
}) {
  const display = humanReadableToolText(toolName, text);
  return (
    <section className={["at-tool-detail-section", error ? "is-error" : ""]
      .filter(Boolean).join(" ")}
    >
      <div className="at-tool-detail-heading">{label}</div>
      <pre
        aria-label={label}
        className="at-tool-detail-content at-scroll-region"
        role={interactive ? "region" : undefined}
        tabIndex={interactive ? 0 : undefined}
      >
        {display}
      </pre>
    </section>
  );
}

function CopyButton({
  label,
  t,
  text,
}: {
  label: string;
  t: Translate;
  text: string;
}) {
  const [status, setStatus] = useState<"copied" | "error" | "idle">("idle");
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      resetTimerRef.current = null;
      setStatus("idle");
    }, COPY_FEEDBACK_RESET_MS);
  };
  const feedback = status === "copied"
    ? t("timelineCopied")
    : status === "error"
      ? t("timelineCopyFailed")
      : "";
  return (
    <span className="at-tool-copy-control">
      <Button
        aria-label={feedback || label}
        className={status === "error" ? "is-error" : ""}
        icon={status === "copied"
          ? <Check size={12} />
          : status === "error"
            ? <TriangleAlert size={12} />
            : <Copy size={12} />}
        onClick={() => void copy()}
        size="small"
        type="text"
      />
      <span aria-live="polite" className="at-tool-copy-feedback">
        {feedback}
      </span>
    </span>
  );
}
