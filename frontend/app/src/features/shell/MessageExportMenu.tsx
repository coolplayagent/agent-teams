import { Button, Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { Download } from "lucide-react";
import { useState } from "react";

import { listSessionMessages } from "../../api/client";
import {
  exportSessionMessages,
  type MessageExportFormat,
} from "./messageExport";

interface MessageExportMessenger {
  error(content: string): unknown;
  success(content: string): unknown;
  warning(content: string): unknown;
}

interface MessageExportMenuProps {
  messenger: MessageExportMessenger;
  sessionId: string | null;
}

const EXPORT_MENU_ITEMS: MenuProps["items"] = [
  {
    key: "html",
    label: "HTML",
  },
  {
    key: "png",
    label: "PNG",
  },
];

export function MessageExportMenu({
  messenger,
  sessionId,
}: MessageExportMenuProps) {
  const [exporting, setExporting] = useState<MessageExportFormat | null>(null);

  const handleExport = async (format: MessageExportFormat): Promise<void> => {
    if (sessionId === null) {
      void messenger.warning("Select a session before exporting.");
      return;
    }

    setExporting(format);
    try {
      const messages = await listSessionMessages(sessionId);
      const fileCount = await exportSessionMessages({
        format,
        messages,
        sessionId,
      });
      const label = format === "html" ? "HTML" : "PNG";
      void messenger.success(
        fileCount === 1
          ? `Messages exported as ${label}.`
          : `Messages exported as ${label} (${fileCount} files).`,
      );
    } catch (error) {
      void messenger.error(exportErrorMessage(error));
    } finally {
      setExporting(null);
    }
  };

  return (
    <Dropdown
      menu={{
        items: EXPORT_MENU_ITEMS,
        onClick: ({ key }) => {
          void handleExport(key === "png" ? "png" : "html");
        },
      }}
      placement="bottomRight"
      trigger={["click"]}
    >
      <Tooltip title="Export messages">
        <Button
          aria-label="Export messages"
          icon={<Download size={17} />}
          loading={exporting !== null}
          type="text"
        />
      </Tooltip>
    </Dropdown>
  );
}

function exportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Message export failed.";
}
