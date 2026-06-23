import { Empty, Skeleton, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";

import { listSessionMessages } from "../../api/client";
import { contentPartText, type TimelineMessage } from "../../api/contracts";
import type { TimelineEntry } from "../../runtime/reducers";
import { useRuntimeStore } from "../../runtime/runtimeStore";

interface MessageTimelineProps {
  sessionId: string | null;
}

export function MessageTimeline({ sessionId }: MessageTimelineProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const runtimeEntries = useRuntimeStore((state) =>
    Object.values(state.runtimeState.runs)
      .flatMap((runState) => runState.entries)
      .filter((entry) => entry.sessionId === sessionId),
  );
  const messagesQuery = useQuery({
    queryKey: ["sessions", sessionId, "messages"],
    queryFn: () => listSessionMessages(sessionId ?? ""),
    enabled: sessionId !== null,
  });

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const rows = useMemo(
    () => [
      ...messages.map(messageToRow),
      ...runtimeEntries.map(runtimeEntryToRow),
    ],
    [messages, runtimeEntries],
  );
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
  source: "message" | "runtime";
}

function messageToRow(message: TimelineMessage, index: number): TimelineRow {
  return {
    key: `message:${message.message_id ?? index}`,
    role: message.role_id ?? message.role ?? "agent",
    text: messageText(message),
    source: "message",
  };
}

function runtimeEntryToRow(entry: TimelineEntry): TimelineRow {
  return {
    key: `runtime:${entry.id}`,
    role: entry.roleId,
    text: entry.text,
    source: "runtime",
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
