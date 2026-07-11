import { Button } from "antd";
import { Copy } from "lucide-react";
import { useState } from "react";

import type { Translate } from "../../i18n";

interface ToolCallDetailsProps {
  callId: string;
  error: boolean;
  input: string;
  output: string;
  raw: string;
  t: Translate;
}

export function ToolCallDetails({
  callId,
  error,
  input,
  output,
  raw,
  t,
}: ToolCallDetailsProps) {
  return (
    <div className="at-tool-details">
      {callId ? (
        <div className="at-tool-call-id">
          <span>{t("timelineCallId")}</span>
          <code>{callId}</code>
          <CopyButton label={t("timelineCopyCallId")} text={callId} />
        </div>
      ) : null}
      {input.trim() ? (
        <ToolDetailSection label={t("timelineToolInput")} t={t} text={input} />
      ) : null}
      {output.trim() ? (
        <ToolDetailSection
          error={error}
          label={error ? t("timelineToolError") : t("timelineToolOutput")}
          t={t}
          text={output}
        />
      ) : null}
      {raw.trim() && raw.trim() !== input.trim() && raw.trim() !== output.trim() ? (
        <details className="at-tool-raw-details">
          <summary>{t("timelineToolRawDetails")}</summary>
          <div className="at-tool-raw-actions">
            <CopyButton label={t("timelineCopyRawDetails")} text={raw} />
          </div>
          <pre>{raw}</pre>
        </details>
      ) : null}
    </div>
  );
}

function ToolDetailSection({
  error = false,
  label,
  text,
  t,
}: {
  error?: boolean;
  label: string;
  text: string;
  t: Translate;
}) {
  const [expanded, setExpanded] = useState(false);
  const display = humanReadableToolText(text);
  const long = display.length > 1_200 || display.split("\n").length > 20;
  return (
    <section className={["at-tool-detail-section", error ? "is-error" : ""]
      .filter(Boolean).join(" ")}
    >
      <div className="at-tool-detail-heading">{label}</div>
      <pre className={!expanded && long ? "is-clamped" : ""}>{display}</pre>
      {long ? (
        <Button onClick={() => setExpanded((value) => !value)} size="small" type="text">
          {expanded ? t("timelineShowLess") : t("timelineShowMore")}
        </Button>
      ) : null}
    </section>
  );
}

function CopyButton({ label, text }: { label: string; text: string }) {
  return (
    <Button
      aria-label={label}
      icon={<Copy size={12} />}
      onClick={() => void navigator.clipboard.writeText(text)}
      size="small"
      type="text"
    />
  );
}

function humanReadableToolText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return text;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const list = readableStringList(parsed);
    return list === null ? JSON.stringify(parsed, null, 2) : list.map((item) => `- ${item}`).join("\n");
  } catch {
    return text;
  }
}

function readableStringList(value: unknown): string[] | null {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  for (const key of ["entries", "files", "items", "paths"]) {
    const candidate = (value as Record<string, unknown>)[key];
    if (Array.isArray(candidate) && candidate.every((item) => typeof item === "string")) {
      return candidate;
    }
  }
  return null;
}
