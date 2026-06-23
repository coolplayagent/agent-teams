import { Button, Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { Download } from "lucide-react";
import { useState } from "react";

import { listSessionRounds } from "../../api/client";
import type { SessionRound } from "../../api/contracts";
import {
  exportSessionMessages,
  type MessageExportFormat,
} from "./messageExport";
import { useTranslations } from "../../i18n";

interface MessageExportMessenger {
  error(content: string): unknown;
  success(content: string): unknown;
  warning(content: string): unknown;
}

interface MessageExportMenuProps {
  messenger: MessageExportMessenger;
  sessionId: string | null;
}

export function MessageExportMenu({
  messenger,
  sessionId,
}: MessageExportMenuProps) {
  const [exporting, setExporting] = useState<MessageExportFormat | null>(null);
  const t = useTranslations();
  const exportMenuItems: MenuProps["items"] = [
    {
      key: "html",
      label: t("exportAsHtml"),
    },
    {
      key: "png",
      label: t("exportAsPng"),
    },
  ];

  const handleExport = async (format: MessageExportFormat): Promise<void> => {
    if (sessionId === null) {
      void messenger.warning(t("exportSelectSession"));
      return;
    }

    setExporting(format);
    try {
      const rounds = await collectCompleteSessionRounds(sessionId);
      const fileCount = await exportSessionMessages({
        format,
        rounds,
        sessionId,
      });
      void messenger.success(
        fileCount === 1
          ? t(format === "html" ? "exportMessagesAsHtml" : "exportMessagesAsPng")
          : t(
              format === "html"
                ? "exportMessagesAsHtmlFiles"
                : "exportMessagesAsPngFiles",
              { count: fileCount },
            ),
      );
    } catch (error) {
      void messenger.error(exportErrorMessage(error, t));
    } finally {
      setExporting(null);
    }
  };

  return (
    <Dropdown
      menu={{
        items: exportMenuItems,
        onClick: ({ key }) => {
          void handleExport(key === "png" ? "png" : "html");
        },
      }}
      placement="bottomRight"
      trigger={["click"]}
    >
      <Tooltip title={t("exportMessages")}>
        <Button
          aria-label={t("exportMessages")}
          icon={<Download size={17} />}
          loading={exporting !== null}
          type="text"
        />
      </Tooltip>
    </Dropdown>
  );
}

async function collectCompleteSessionRounds(sessionId: string): Promise<SessionRound[]> {
  const rounds: SessionRound[] = [];
  let cursorRunId: string | null = null;
  let hasMore = true;
  while (hasMore) {
    const page = await listSessionRounds(sessionId, {
      cursorRunId,
      limit: 50,
    });
    rounds.push(...page.items);
    hasMore = page.has_more === true && page.items.length > 0;
    cursorRunId = hasMore ? page.next_cursor ?? null : null;
    if (hasMore && cursorRunId === null) {
      break;
    }
  }
  return sortRoundsAscending(uniqueRoundsByRunId(rounds));
}

function uniqueRoundsByRunId(rounds: SessionRound[]): SessionRound[] {
  const byRunId = new Map<string, SessionRound>();
  for (const round of rounds) {
    const runId = round.run_id.trim();
    if (runId && !byRunId.has(runId)) {
      byRunId.set(runId, round);
    }
  }
  return Array.from(byRunId.values());
}

function sortRoundsAscending(rounds: SessionRound[]): SessionRound[] {
  return [...rounds].sort((left, right) =>
    sortableTimestamp(left.created_at) - sortableTimestamp(right.created_at),
  );
}

function sortableTimestamp(value: string | undefined): number {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function exportErrorMessage(error: unknown, t: ReturnType<typeof useTranslations>): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return t("exportFailed");
}
