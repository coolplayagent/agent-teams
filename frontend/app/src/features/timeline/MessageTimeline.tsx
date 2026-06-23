import { App, Button, Empty, Skeleton, Tooltip, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy } from "lucide-react";
import { useMemo, useRef } from "react";

import { listSessionMessages } from "../../api/client";
import { contentPartText, type TimelineMessage } from "../../api/contracts";
import type { RunEventType } from "../../runtime/events";
import type { TimelineEntry } from "../../runtime/reducers";
import { useRuntimeStore } from "../../runtime/runtimeStore";

interface MessageTimelineProps {
  sessionId: string | null;
}

export function MessageTimeline({ sessionId }: MessageTimelineProps) {
  const { message } = App.useApp();
  const parentRef = useRef<HTMLDivElement | null>(null);
  const runtimeState = useRuntimeStore((state) => state.runtimeState);
  const messagesQuery = useQuery({
    queryKey: ["sessions", sessionId, "messages"],
    queryFn: () => listSessionMessages(sessionId ?? ""),
    enabled: sessionId !== null,
  });

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const runtimeEntries = useMemo(
    () =>
      Object.values(runtimeState.runs)
        .flatMap((runState) => runState.entries)
        .filter((entry) => entry.sessionId === sessionId),
    [runtimeState, sessionId],
  );
  const rows = useMemo(
    () => [
      ...messages.map(messageToRow),
      ...runtimeEntries.map(runtimeEntryToRow),
    ],
    [messages, runtimeEntries],
  );
  const streamOpenForSession = useMemo(
    () =>
      Object.values(runtimeState.runs).some(
        (runState) =>
          runState.status !== "closed" &&
          runState.entries.some((entry) => entry.sessionId === sessionId),
      ),
    [runtimeState.runs, sessionId],
  );
  const lastAnswer = useMemo(() => {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (row !== undefined && row.copyable) {
        return row;
      }
    }
    return undefined;
  }, [rows]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 8,
  });

  if (sessionId === null) {
    return (
      <div className="at-timeline at-timeline-empty">
        <Empty description="Select a session" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  if (messagesQuery.isLoading) {
    return (
      <div className="at-timeline">
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  if (messagesQuery.isError) {
    return (
      <div className="at-timeline at-timeline-empty">
        <Empty description="Could not load messages" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="at-timeline at-timeline-empty">
        <Empty description="No messages yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  return (
    <div className="at-timeline" ref={parentRef}>
      <div className="at-timeline-toolbar">
        <Tooltip
          title={
            streamOpenForSession ? "Copy is available after streaming finishes" : "Copy last answer"
          }
        >
          <Button
            aria-label="Copy last answer"
            disabled={lastAnswer === undefined || streamOpenForSession}
            icon={<Copy size={15} />}
            onClick={() => {
              void copyLastAnswer(lastAnswer, message);
            }}
            size="small"
            type="text"
          />
        </Tooltip>
      </div>
      <div
        className="at-timeline-virtual"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const row = rows[virtualItem.index];
          return (
            <article
              className={`at-message ${row.source === "runtime" ? "is-runtime" : ""}`}
              key={row.key}
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <Typography.Text className="at-message-role">
                {row.role}
              </Typography.Text>
              <Typography.Paragraph className="at-message-content">
                {row.text}
              </Typography.Paragraph>
            </article>
          );
        })}
      </div>
    </div>
  );
}

interface TimelineRow {
  key: string;
  role: string;
  text: string;
  kind: RunEventType | "message";
  source: "message" | "runtime";
  copyable: boolean;
}

function messageToRow(message: TimelineMessage, index: number): TimelineRow {
  const role = message.role_id ?? message.role ?? "agent";
  const text = messageText(message);
  return {
    key: `message:${message.message_id ?? index}`,
    role,
    text,
    kind: "message",
    source: "message",
    copyable: isAnswerRole(role) && text.trim().length > 0,
  };
}

function runtimeEntryToRow(entry: TimelineEntry): TimelineRow {
  return {
    key: `runtime:${entry.id}`,
    role: entry.roleId,
    text: entry.text,
    kind: entry.kind,
    source: "runtime",
    copyable:
      isAnswerRole(entry.roleId) &&
      (entry.kind === "text_delta" || entry.kind === "output_delta") &&
      entry.text.trim().length > 0,
  };
}

function messageText(message: TimelineMessage): string {
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content;
  }
  for (const part of message.parts ?? []) {
    const text = contentPartText(part);
    if (text !== null) {
      return text;
    }
  }
  return message.entry_type ?? "message";
}

function isAnswerRole(role: string): boolean {
  return role.trim().toLowerCase() !== "user";
}

async function copyLastAnswer(
  row: TimelineRow | undefined,
  messenger: ReturnType<typeof App.useApp>["message"],
): Promise<void> {
  const text = row?.text.trim() ?? "";
  if (!text) {
    void messenger.warning("No answer content to copy.");
    return;
  }
  try {
    if (navigator.clipboard?.writeText === undefined) {
      throw new Error("Clipboard is unavailable.");
    }
    await navigator.clipboard.writeText(text);
    void messenger.success("Last answer copied.");
  } catch (_error) {
    void messenger.error("Clipboard is unavailable.");
  }
}
