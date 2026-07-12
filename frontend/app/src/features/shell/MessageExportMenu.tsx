import { Button, Dropdown, Modal, Space, Tooltip, Typography } from "antd";
import type { MenuProps } from "antd";
import { Download } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";

import { listSessionRounds } from "../../api/client";
import { contentPartText, type SessionRound } from "../../api/contracts";
import { ChoiceControl } from "../../components/ChoiceControl";
import {
  exportSessionMessages,
  type MessageExportFormat,
} from "./messageExport";
import { useTranslations } from "../../i18n";

export interface MessageExportMessenger {
  error(content: string): unknown;
  success(content: string): unknown;
  warning(content: string): unknown;
}

interface MessageExportMenuProps {
  messenger: MessageExportMessenger;
  sessionId: string | null;
}

type RoundSelector = (
  rounds: SessionRound[],
  format: MessageExportFormat,
) => Promise<SessionRound[] | null>;

interface MessageExporterOptions extends MessageExportMenuProps {
  selectRounds?: RoundSelector;
}

export interface MessageExporter {
  exporting: MessageExportFormat | null;
  exportMessages(format: MessageExportFormat): Promise<void>;
}

export function useMessageExporter({
  messenger,
  selectRounds,
  sessionId,
}: MessageExporterOptions): MessageExporter {
  const [exporting, setExporting] = useState<MessageExportFormat | null>(null);
  const t = useTranslations();

  const exportMessages = async (format: MessageExportFormat): Promise<void> => {
    if (sessionId === null) {
      void messenger.warning(t("exportSelectSession"));
      return;
    }

    setExporting(format);
    try {
      const rounds = await collectCompleteSessionRounds(sessionId);
      const selectedRounds = await resolveExportRounds(rounds, format, selectRounds);
      if (selectedRounds === null) {
        return;
      }
      const fileCount = await exportSessionMessages({
        format,
        rounds: selectedRounds,
        sessionId,
      });
      void messenger.success(
        fileCount === 1
          ? t(exportSuccessKey(format))
          : t(
              format === "png"
                ? "exportMessagesAsPngFiles"
                : "exportMessagesAsHtmlFiles",
              { count: fileCount },
            ),
      );
    } catch (error) {
      void messenger.error(exportErrorMessage(error, t));
    } finally {
      setExporting(null);
    }
  };

  return {
    exporting,
    exportMessages,
  };
}

export function MessageExportMenu({
  messenger,
  sessionId,
}: MessageExportMenuProps) {
  const t = useTranslations();
  const roundSelection = useRoundSelectionDialog();
  const exporter = useMessageExporter({
    messenger,
    selectRounds: roundSelection.selectRounds,
    sessionId,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const exportMenuItems: MenuProps["items"] = [
    {
      key: "html",
      label: t("exportAsHtml"),
    },
    {
      key: "json",
      label: t("exportAsJson"),
    },
    {
      key: "png",
      label: t("exportAsPng"),
    },
  ];

  return (
    <>
    <Dropdown
      onOpenChange={setMenuOpen}
      open={menuOpen}
      menu={{
        items: exportMenuItems,
        onClick: ({ key }) => {
          setMenuOpen(false);
          void exporter.exportMessages(
            key === "png" ? "png" : key === "json" ? "json" : "html",
          );
        },
      }}
      placement="bottomRight"
      trigger={["click"]}
    >
      <Tooltip open={menuOpen ? false : undefined} title={t("exportMessages")}>
        <Button
          aria-label={t("exportMessages")}
          className="at-topbar-action"
          icon={<Download size={17} />}
          loading={exporter.exporting !== null}
        />
      </Tooltip>
    </Dropdown>
    {roundSelection.modal}
    </>
  );
}

interface RoundSelectionState {
  format: MessageExportFormat;
  rounds: SessionRound[];
  selectedKeys: string[];
}

function useRoundSelectionDialog(): {
  modal: ReactNode;
  selectRounds: RoundSelector;
} {
  const t = useTranslations();
  const resolverRef = useRef<((rounds: SessionRound[] | null) => void) | null>(null);
  const [state, setState] = useState<RoundSelectionState | null>(null);
  const selectRounds = useCallback<RoundSelector>(async (rounds, format) => {
    if (rounds.length <= 1) {
      return rounds;
    }
    return await new Promise<SessionRound[] | null>((resolve) => {
      resolverRef.current = resolve;
      setState({
        format,
        rounds,
        selectedKeys: rounds.map((round, index) => roundKey(round, index)),
      });
    });
  }, []);
  const resolve = (rounds: SessionRound[] | null) => {
    resolverRef.current?.(rounds);
    resolverRef.current = null;
    setState(null);
  };
  const setSelectedKeys = (selectedKeys: string[]) => {
    setState((current) => current === null ? null : { ...current, selectedKeys });
  };
  const selectedRounds = state?.rounds.filter((round, index) =>
    state.selectedKeys.includes(roundKey(round, index)),
  ) ?? [];
  const modal = (
    <Modal
      cancelText={t("sidebarDeleteCancel")}
      okButtonProps={{ disabled: selectedRounds.length === 0 }}
      okText={t("exportRoundSelectionConfirm")}
      onCancel={() => resolve(null)}
      onOk={() => resolve(selectedRounds)}
      open={state !== null}
      title={t("exportRoundSelectionTitle")}
      width={560}
    >
      {state === null ? null : (
        <div className="at-message-export-selection">
          <Typography.Text type="secondary">
            {t("exportRoundSelectionDescription", {
              format: exportFormatLabel(state.format, t),
            })}
          </Typography.Text>
          <div className="at-message-export-selection-tools">
            <Typography.Text type="secondary">
              {t("exportRoundSelectionCount", {
                count: state.selectedKeys.length,
                total: state.rounds.length,
              })}
            </Typography.Text>
            <Space size={8}>
              <Button
                onClick={() =>
                  setSelectedKeys(state.rounds.map((round, index) => roundKey(round, index)))
                }
                size="small"
                type="text"
              >
                {t("exportRoundSelectionAll")}
              </Button>
              <Button
                onClick={() => setSelectedKeys([])}
                size="small"
                type="text"
              >
                {t("exportRoundSelectionClear")}
              </Button>
            </Space>
          </div>
          <div className="at-message-export-selection-list">
            {state.rounds.map((round, index) => {
              const key = roundKey(round, index);
              return (
                <ChoiceControl
                  checked={state.selectedKeys.includes(key)}
                  className="at-message-export-selection-row"
                  key={key}
                  label={
                    <span className="at-message-export-selection-copy">
                      <strong>
                        {t("exportRoundSelectionRound", { index: index + 1 })}
                      </strong>
                      <span>{roundPreview(round)}</span>
                    </span>
                  }
                  onChange={(checked) => {
                    const nextSelected = checked
                      ? [...state.selectedKeys, key]
                      : state.selectedKeys.filter((value) => value !== key);
                    setSelectedKeys(Array.from(new Set(nextSelected)));
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
  return {
    modal,
    selectRounds,
  };
}

async function resolveExportRounds(
  rounds: SessionRound[],
  format: MessageExportFormat,
  selectRounds: RoundSelector | undefined,
): Promise<SessionRound[] | null> {
  if (selectRounds === undefined) {
    return rounds;
  }
  return await selectRounds(rounds, format);
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

function roundKey(round: SessionRound, index: number): string {
  const runId = round.run_id.trim();
  return runId || round.created_at || round.intent || `round:${index}`;
}

function roundPreview(round: SessionRound): string {
  const intentParts = (round.intent_parts ?? [])
    .map((part) => contentPartText(part))
    .filter((value): value is string =>
      typeof value === "string" && value.trim().length > 0,
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (intentParts) {
    return intentParts;
  }
  const intent = round.intent?.trim() ?? "";
  if (intent) {
    return intent;
  }
  const createdAt = round.created_at?.trim() ?? "";
  if (createdAt) {
    return new Date(createdAt).toLocaleString();
  }
  return "No prompt";
}

function exportFormatLabel(
  format: MessageExportFormat,
  t: ReturnType<typeof useTranslations>,
): string {
  return t(
    format === "png"
      ? "exportAsPng"
      : format === "json"
        ? "exportAsJson"
        : "exportAsHtml",
  );
}

function exportSuccessKey(
  format: MessageExportFormat,
): "exportMessagesAsHtml" | "exportMessagesAsJson" | "exportMessagesAsPng" {
  if (format === "json") {
    return "exportMessagesAsJson";
  }
  return format === "png" ? "exportMessagesAsPng" : "exportMessagesAsHtml";
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
