import { Button, Empty, Skeleton, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Wrench } from "lucide-react";

import { listAgentMessages } from "../../api/client";
import {
  contentPartText,
  type ContentPart,
  type JsonValue,
  type TimelineMessage,
} from "../../api/contracts";
import { useTranslations, type Translate } from "../../i18n";
import { MarkdownMessage } from "../timeline/MarkdownMessage";
import type { ActiveSubagentSession } from "./SessionsSidebar";

interface SubagentSessionViewProps {
  subagent: ActiveSubagentSession;
  onBack: () => void;
}

export function SubagentSessionView({
  onBack,
  subagent,
}: SubagentSessionViewProps) {
  const t = useTranslations();
  const messagesQuery = useQuery({
    queryKey: [
      "sessions",
      subagent.sessionId,
      "agents",
      subagent.instanceId,
      "messages",
    ],
    queryFn: () => listAgentMessages(subagent.sessionId, subagent.instanceId),
  });
  const title = subagent.title || humanizeRoleId(subagent.roleId) || subagent.instanceId;
  return (
    <div className="at-subagent-session-view">
      <header className="at-subagent-session-header">
        <div className="at-subagent-session-title-row">
          <Button icon={<ArrowLeft size={15} />} onClick={onBack} size="small">
            {t("subagentSessionBack")}
          </Button>
          <Typography.Title className="at-subagent-session-title" level={2}>
            {title}
          </Typography.Title>
          <span className={subagentBadgeClassName(subagent)}>
            {subagent.runStatus || subagent.status || "idle"}
          </span>
        </div>
        <div className="at-subagent-session-meta">
          <span>{t("subagentSessionReadOnly")}</span>
          <span>{subagent.roleId}</span>
          <span>{subagent.instanceId}</span>
        </div>
      </header>
      <div className="at-subagent-session-body">
        {messagesQuery.isLoading ? (
          <Skeleton active paragraph={{ rows: 10 }} />
        ) : messagesQuery.isError ? (
          <Empty
            description={t("subagentSessionLoadError")}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (messagesQuery.data ?? []).length === 0 ? (
          <Empty
            description={t("subagentSessionEmpty")}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <div className="at-subagent-message-list">
            {(messagesQuery.data ?? []).map((message, index) => (
              <SubagentMessage
                key={message.message_id ?? `${message.role ?? "message"}:${index}`}
                message={message}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SubagentMessage({ message }: { message: TimelineMessage }) {
  const t = useTranslations();
  const parts = messageParts(message);
  const fallbackText = fallbackMessageText(message);
  const role = message.role_id?.trim() || message.role?.trim() || "agent";
  return (
    <article className="at-subagent-message">
      <div className="at-subagent-message-header">
        <span>{role}</span>
        {message.created_at ? <time dateTime={message.created_at}>{message.created_at}</time> : null}
      </div>
      <div className="at-subagent-message-content">
        {parts.length > 0 ? (
          parts.map((part, index) => (
            <SubagentMessagePart
              key={`${partKind(part)}:${index}`}
              part={part}
              t={t}
            />
          ))
        ) : fallbackText ? (
          <MarkdownMessage text={fallbackText} />
        ) : null}
      </div>
    </article>
  );
}

function SubagentMessagePart({
  part,
  t,
}: {
  part: ContentPart;
  t: Translate;
}) {
  const text = contentPartText(part);
  if (text !== null) {
    return <MarkdownMessage text={text} />;
  }
  const kind = partKind(part);
  if (kind === "thinking") {
    return (
      <details className="at-subagent-message-thinking">
        <summary>{t("timelineThinking")}</summary>
        <MarkdownMessage text={partText(part)} />
      </details>
    );
  }
  if (kind === "tool-call" || kind === "tool-return" || kind === "retry-prompt") {
    return (
      <details className="at-subagent-message-tool">
        <summary>
          <Wrench aria-hidden="true" size={14} />
          <span>{toolPartTitle(kind, part, t)}</span>
        </summary>
        <pre>{toolPartBody(part)}</pre>
      </details>
    );
  }
  return null;
}

function messageParts(message: TimelineMessage): ContentPart[] {
  return message.parts ?? message.message?.parts ?? [];
}

function fallbackMessageText(message: TimelineMessage): string {
  return message.content?.trim() || message.message?.content?.trim() || "";
}

function partKind(part: ContentPart): string {
  if ("kind" in part) {
    return String(part.kind);
  }
  if ("part_kind" in part) {
    return String(part.part_kind);
  }
  return "part";
}

function partText(part: ContentPart): string {
  if ("text" in part && typeof part.text === "string") {
    return part.text;
  }
  if ("content" in part && typeof part.content === "string") {
    return part.content;
  }
  return "";
}

function toolPartTitle(kind: string, part: ContentPart, t: Translate): string {
  const name = toolName(part);
  if (kind === "tool-call") {
    return name ? `${t("timelineToolCall")}: ${name}` : t("timelineToolCall");
  }
  if (kind === "retry-prompt") {
    return name
      ? `${t("timelineToolValidation")}: ${name}`
      : t("timelineToolValidation");
  }
  return name ? `${t("timelineToolResult")}: ${name}` : t("timelineToolResult");
}

function toolName(part: ContentPart): string {
  if ("tool_name" in part && typeof part.tool_name === "string") {
    return part.tool_name;
  }
  return "";
}

function toolPartBody(part: ContentPart): string {
  if ("args" in part) {
    return jsonDisplayText(part.args);
  }
  if ("content" in part) {
    return jsonDisplayText(part.content);
  }
  return "";
}

function jsonDisplayText(value: JsonValue | undefined): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function subagentBadgeClassName(subagent: ActiveSubagentSession): string {
  const status = (subagent.runStatus || subagent.status).toLowerCase();
  if (status === "running" || status === "queued" || status === "stopping") {
    return "at-subagent-session-badge is-running";
  }
  if (status === "failed" || status === "error") {
    return "at-subagent-session-badge is-failed";
  }
  if (status === "stopped" || status === "cancelled" || status === "canceled") {
    return "at-subagent-session-badge is-stopped";
  }
  return "at-subagent-session-badge";
}

function humanizeRoleId(roleId: string): string {
  return roleId
    .trim()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
