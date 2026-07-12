import { Empty, Input, Skeleton, Typography } from "antd";
import type { InputRef } from "antd";
import { MessageSquare, Search } from "lucide-react";
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import type { SessionSidebarRecord, WorkspaceRecord } from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { useUiStore, type Language } from "../../runtime/uiStore";
import { sessionDisplayLabel } from "../sessions/sessionLabels";

const maxSearchResults = 20;

interface SessionSearchViewProps {
  hasError?: boolean;
  loading?: boolean;
  onClose?: () => void;
  onSessionSelected: (session: SessionSidebarRecord) => void;
  selectedSessionId: string | null;
  sessions: SessionSidebarRecord[];
  workspaces: WorkspaceRecord[];
}

interface SessionSearchRow {
  session: SessionSidebarRecord;
  title: string;
  workspaceLabel: string;
  workspaceRoot: string;
  updatedAtMs: number;
  score: number;
}

export function SessionSearchView({
  hasError = false,
  loading = false,
  onClose,
  onSessionSelected,
  selectedSessionId,
  sessions,
  workspaces,
}: SessionSearchViewProps) {
  const t = useTranslations();
  const language = useUiStore((state) => state.language);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<InputRef>(null);
  const activeOptionRef = useRef<HTMLButtonElement | null>(null);
  const resultsId = useId();
  const rows = useMemo(
    () =>
      buildSessionSearchRows(
        sessions,
        workspaces,
        query,
        t("searchUnknownWorkspace"),
      ),
    [query, sessions, t, workspaces],
  );
  const hasQuery = query.trim().length > 0;
  const statusLabel = hasQuery
    ? t("searchResultCount", { count: rows.length })
    : t("searchRecentSessions");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex((current) => {
      if (rows.length === 0) {
        return 0;
      }
      return Math.min(current, rows.length - 1);
    });
  }, [rows.length]);

  useEffect(() => {
    activeOptionRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, rows]);

  return (
    <section
      aria-label={t("searchViewTitle")}
      className="at-session-search-view"
      data-testid="session-search-view"
    >
      <div className="at-session-search-toolbar">
        <Input
          allowClear
          aria-activedescendant={
            rows[activeIndex] === undefined
              ? undefined
              : `${resultsId}-option-${activeIndex}`
          }
          aria-controls={resultsId}
          aria-expanded="true"
          aria-label={t("searchViewInputLabel")}
          autoFocus
          className="at-session-search-input"
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={t("searchViewPlaceholder")}
          prefix={<Search aria-hidden="true" size={15} />}
          ref={inputRef}
          role="searchbox"
          value={query}
        />
        <span aria-live="polite" className="at-session-search-count" role="status">
          {statusLabel}
        </span>
      </div>

      <div
        aria-label={hasQuery ? t("searchViewResults") : t("searchRecentSessions")}
        className="at-session-search-results at-scroll-region"
        id={resultsId}
        role="listbox"
      >
        {loading && rows.length === 0 ? (
          <Skeleton active paragraph={{ rows: 10 }} />
        ) : null}
        {hasError ? (
          <Empty
            description={t("searchViewLoadError")}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : null}
        {!loading && !hasError && rows.length === 0 ? (
          <Empty
            description={hasQuery ? t("searchViewNoMatches") : t("searchViewNoSessions")}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : null}
        {!hasError && rows.length > 0 ? (
          <div className="at-session-search-list">
            {rows.map((row, index) => {
              const active = index === activeIndex;
              const selected = row.session.session_id === selectedSessionId;
              return (
                <button
                  aria-current={selected ? "page" : undefined}
                  aria-label={t("searchViewOpenSession", { title: row.title })}
                  aria-selected={active}
                  className={[
                    "at-session-search-result",
                    active ? "is-active" : "",
                    selected ? "is-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  id={`${resultsId}-option-${index}`}
                  key={row.session.session_id}
                  onClick={() => onSessionSelected(row.session)}
                  onMouseEnter={() => setActiveIndex(index)}
                  ref={active ? activeOptionRef : undefined}
                  role="option"
                  type="button"
                >
                  <span className="at-session-search-result-icon" aria-hidden="true">
                    <MessageSquare size={15} />
                  </span>
                  <span className="at-session-search-result-main">
                    <span className="at-session-search-result-title">
                      {highlightSearchText(row.title, query)}
                    </span>
                    <span className="at-session-search-result-workspace">
                      {highlightSearchText(row.workspaceLabel, query)}
                    </span>
                  </span>
                  <Typography.Text
                    className="at-session-search-result-root"
                    ellipsis
                    title={row.workspaceRoot}
                  >
                    {row.workspaceRoot}
                  </Typography.Text>
                  {row.session.updated_at ? (
                    <span
                      className="at-session-search-result-time"
                      title={row.session.updated_at}
                    >
                      {formatRelativeTime(row.session.updated_at, language)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        rows.length === 0 ? 0 : Math.min(rows.length - 1, current + 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(rows.length === 0 ? 0 : rows.length - 1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose?.();
      return;
    }
    if (event.key === "Enter" && rows[activeIndex] !== undefined) {
      event.preventDefault();
      onSessionSelected(rows[activeIndex].session);
    }
  }
}

function buildSessionSearchRows(
  sessions: SessionSidebarRecord[],
  workspaces: WorkspaceRecord[],
  query: string,
  unknownWorkspaceLabel: string,
): SessionSearchRow[] {
  const workspaceById = new Map(
    workspaces.map((workspace) => [workspace.workspace_id, workspace]),
  );
  const tokens = searchTokens(query);
  const normalizedQuery = normalizeSearchText(query);
  return sessions
    .map((session) => {
      const workspaceId = session.workspace_id?.trim() ?? "";
      const workspace = workspaceById.get(workspaceId);
      const row = {
        session,
        title: sessionDisplayLabel(session, session.session_id),
        workspaceLabel: workspaceLabel(workspace, workspaceId, unknownWorkspaceLabel),
        workspaceRoot: workspaceRoot(workspace, workspaceId),
        updatedAtMs: sessionTimestampValue(session.updated_at),
        score: 0,
      };
      return {
        ...row,
        score: scoreSearchRow(row, tokens, normalizedQuery),
      };
    })
    .filter((row) => row.score >= 0)
    .sort(
      (left, right) =>
        left.score - right.score ||
        right.updatedAtMs - left.updatedAtMs ||
        left.title.localeCompare(right.title) ||
        left.session.session_id.localeCompare(right.session.session_id),
    )
    .slice(0, maxSearchResults);
}

function scoreSearchRow(
  row: Omit<SessionSearchRow, "score">,
  tokens: string[],
  normalizedQuery: string,
): number {
  if (tokens.length === 0) {
    return 0;
  }
  const title = normalizeSearchText(row.title);
  const workspace = normalizeSearchText(row.workspaceLabel);
  const root = normalizeSearchText(row.workspaceRoot);
  const sessionId = normalizeSearchText(row.session.session_id);
  const haystack = `${title} ${workspace} ${root} ${sessionId}`;
  if (!tokens.every((token) => haystack.includes(token))) {
    return -1;
  }
  if (title === normalizedQuery) {
    return 0;
  }
  if (title.startsWith(normalizedQuery)) {
    return 1;
  }
  if (title.includes(normalizedQuery)) {
    return 2;
  }
  if (workspace.startsWith(normalizedQuery)) {
    return 3;
  }
  if (workspace.includes(normalizedQuery)) {
    return 4;
  }
  if (sessionId.includes(normalizedQuery)) {
    return 5;
  }
  return 6;
}

function highlightSearchText(value: string, query: string): ReactNode {
  const ranges = highlightedRanges(value, searchTokens(query));
  if (ranges.length === 0) {
    return value;
  }
  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], index) => {
    if (start > cursor) {
      nodes.push(value.slice(cursor, start));
    }
    nodes.push(
      <mark className="at-session-search-mark" key={`${start}-${end}-${index}`}>
        {value.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < value.length) {
    nodes.push(value.slice(cursor));
  }
  return <Fragment>{nodes}</Fragment>;
}

function highlightedRanges(value: string, tokens: string[]): [number, number][] {
  if (tokens.length === 0) {
    return [];
  }
  const lowerValue = value.toLocaleLowerCase();
  const ranges: [number, number][] = [];
  tokens.forEach((token) => {
    let start = 0;
    while (start < lowerValue.length) {
      const index = lowerValue.indexOf(token, start);
      if (index < 0) {
        break;
      }
      ranges.push([index, index + token.length]);
      start = index + Math.max(token.length, 1);
    }
  });
  return mergeRanges(ranges);
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length === 0) {
    return [];
  }
  const sorted = [...ranges].sort((left, right) => left[0] - right[0]);
  const merged: [number, number][] = [];
  sorted.forEach(([start, end]) => {
    const last = merged[merged.length - 1];
    if (last === undefined || start > last[1]) {
      merged.push([start, end]);
      return;
    }
    last[1] = Math.max(last[1], end);
  });
  return merged;
}

function searchTokens(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function workspaceLabel(
  workspace: WorkspaceRecord | undefined,
  workspaceId: string,
  unknownWorkspaceLabel: string,
): string {
  if (workspace === undefined) {
    return workspaceId || unknownWorkspaceLabel;
  }
  return (
    workspace.display_name?.trim() ||
    workspace.name?.trim() ||
    workspace.workspace_id
  );
}

function workspaceRoot(
  workspace: WorkspaceRecord | undefined,
  workspaceId: string,
): string {
  if (workspace === undefined) {
    return workspaceId;
  }
  return workspace.root_path;
}

function sessionTimestampValue(value: string | undefined): number {
  if (value === undefined || !value.trim()) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatRelativeTime(value: string, language: Language): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (elapsedMs < minuteMs) {
    return language === "zh-CN" ? "现在" : "now";
  }
  if (elapsedMs < hourMs) {
    return language === "zh-CN"
      ? `${Math.floor(elapsedMs / minuteMs)}分`
      : `${Math.floor(elapsedMs / minuteMs)}m`;
  }
  if (elapsedMs < dayMs) {
    return language === "zh-CN"
      ? `${Math.floor(elapsedMs / hourMs)}时`
      : `${Math.floor(elapsedMs / hourMs)}h`;
  }
  if (elapsedMs < 7 * dayMs) {
    return language === "zh-CN"
      ? `${Math.floor(elapsedMs / dayMs)}天`
      : `${Math.floor(elapsedMs / dayMs)}d`;
  }
  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
  }).format(new Date(timestamp));
}
