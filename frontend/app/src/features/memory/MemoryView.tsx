import {
  Alert,
  Button,
  Empty,
  Input,
  Segmented,
  Select,
  Skeleton,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, RefreshCcw, RotateCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  getMemory,
  listMemories,
  rebuildMemoryIndex,
  searchMemories,
} from "../../api/client";
import type {
  GlobalMemorySearchRequest,
  MemoryEntry,
  MemoryEntryKind,
  MemoryEntryStatus,
  MemoryEntrySummary,
  MemoryScope,
  MemorySearchHit,
  MemorySourceKind,
  MemoryTier,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { useUiStore, type Language } from "../../runtime/uiStore";

type MemoryFilter<T extends string> = T | "all";

const memoryLimit = 40;

export function MemoryView({
  selectedWorkspaceId,
}: {
  selectedWorkspaceId: string | null;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const language = useUiStore((state) => state.language);
  const [query, setQuery] = useState("");
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<MemoryFilter<MemoryEntryStatus>>("active");
  const [tierFilter, setTierFilter] = useState<MemoryFilter<MemoryTier>>("all");
  const [scopeFilter, setScopeFilter] =
    useState<MemoryFilter<MemoryScope>>("all");
  const [kindFilter, setKindFilter] =
    useState<MemoryFilter<MemoryEntryKind>>("all");
  const trimmedQuery = query.trim();

  const listQuery = useQuery({
    enabled: trimmedQuery.length === 0,
    queryFn: () =>
      listMemories({
        kind: kindFilter,
        limit: memoryLimit,
        scope: scopeFilter,
        status: statusFilter,
        tier: tierFilter,
        workspaceId: selectedWorkspaceId,
      }),
    queryKey: [
      "memories",
      "list",
      selectedWorkspaceId ?? "",
      tierFilter,
      scopeFilter,
      statusFilter,
      kindFilter,
    ],
  });
  const searchQuery = useQuery({
    enabled: trimmedQuery.length > 0,
    queryFn: () =>
      searchMemories(
        buildSearchRequest({
          kindFilter,
          query: trimmedQuery,
          scopeFilter,
          selectedWorkspaceId,
          statusFilter,
          tierFilter,
        }),
      ),
    queryKey: [
      "memories",
      "search",
      trimmedQuery,
      selectedWorkspaceId ?? "",
      tierFilter,
      scopeFilter,
      statusFilter,
      kindFilter,
    ],
  });
  const rebuildMutation = useMutation({
    mutationFn: () => rebuildMemoryIndex(selectedWorkspaceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });

  const rows = useMemo(
    () =>
      trimmedQuery.length > 0
        ? searchQuery.data?.items.map((hit) => hit.entry) ?? []
        : listQuery.data?.items ?? [],
    [listQuery.data?.items, searchQuery.data?.items, trimmedQuery.length],
  );
  const hitMeta = useMemo(
    () => buildHitMeta(searchQuery.data?.items ?? []),
    [searchQuery.data?.items],
  );
  const selectedSummary = useMemo(
    () => rows.find((row) => row.id === selectedMemoryId) ?? null,
    [rows, selectedMemoryId],
  );
  const detailQuery = useQuery({
    enabled: selectedSummary !== null,
    queryFn: () => {
      if (selectedSummary === null) {
        throw new Error("Memory is required.");
      }
      return getMemory(selectedSummary.workspace_id, selectedSummary.id);
    },
    queryKey: [
      "memories",
      "detail",
      selectedSummary?.workspace_id ?? "",
      selectedSummary?.id ?? "",
    ],
  });

  const activeQuery = trimmedQuery.length > 0 ? searchQuery : listQuery;
  const totalCount =
    trimmedQuery.length > 0
      ? searchQuery.data?.total_count ?? rows.length
      : listQuery.data?.total_count ?? rows.length;

  useEffect(() => {
    if (rows.length === 0) {
      if (selectedMemoryId !== null) {
        setSelectedMemoryId(null);
      }
      return;
    }
    if (
      selectedMemoryId === null ||
      rows.every((row) => row.id !== selectedMemoryId)
    ) {
      setSelectedMemoryId(rows[0].id);
    }
  }, [rows, selectedMemoryId]);

  return (
    <section
      aria-label={t("memoryTitle")}
      className="at-memory-view"
      data-testid="memory-view"
    >
      <div className="at-memory-toolbar">
        <div className="at-memory-title">
          <span className="at-memory-title-icon" aria-hidden="true">
            <Database size={18} />
          </span>
          <div>
            <Typography.Title level={3}>{t("memoryTitle")}</Typography.Title>
            <Typography.Text type="secondary">
              {selectedWorkspaceId
                ? t("memoryWorkspaceScopeLabel", {
                    workspace: selectedWorkspaceId,
                  })
                : t("memoryGlobalScopeLabel")}
            </Typography.Text>
          </div>
        </div>
        <div className="at-memory-toolbar-actions">
          <Tooltip title={t("memoryRebuildIndex")}>
            <Button
              aria-label={t("memoryRebuildIndex")}
              icon={<RotateCw size={15} />}
              loading={rebuildMutation.isPending}
              onClick={() => rebuildMutation.mutate()}
              type="text"
            />
          </Tooltip>
          <Tooltip title={t("memoryRefresh")}>
            <Button
              aria-label={t("memoryRefresh")}
              icon={<RefreshCcw size={15} />}
              loading={activeQuery.isFetching}
              onClick={() =>
                void queryClient.invalidateQueries({ queryKey: ["memories"] })
              }
              type="text"
            />
          </Tooltip>
        </div>
      </div>

      <div className="at-memory-content">
        <div className="at-memory-controls">
          <Input
            allowClear
            aria-label={t("memorySearchLabel")}
            className="at-memory-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("memorySearchPlaceholder")}
            prefix={<Search aria-hidden="true" size={15} />}
            type="search"
            value={query}
          />
          <Segmented
            onChange={(value) =>
              setStatusFilter(value as MemoryFilter<MemoryEntryStatus>)
            }
            options={[
              { label: t("memoryActive"), value: "active" },
              { label: t("memoryAll"), value: "all" },
              { label: t("memorySuperseded"), value: "superseded" },
              { label: t("memoryExpired"), value: "expired" },
            ]}
            value={statusFilter}
          />
          <Select
            aria-label={t("memoryFilterTier")}
            className="at-memory-filter"
            onChange={(value) => setTierFilter(value)}
            options={tierOptions(t)}
            popupMatchSelectWidth={false}
            value={tierFilter}
          />
          <Select
            aria-label={t("memoryFilterScope")}
            className="at-memory-filter"
            onChange={(value) => setScopeFilter(value)}
            options={scopeOptions(t)}
            popupMatchSelectWidth={false}
            value={scopeFilter}
          />
          <Select
            aria-label={t("memoryFilterKind")}
            className="at-memory-kind-filter"
            onChange={(value) => setKindFilter(value)}
            options={kindOptions(t)}
            popupMatchSelectWidth={false}
            value={kindFilter}
          />
        </div>

        <div className="at-memory-count">
          {t(trimmedQuery.length > 0 ? "memorySearchCount" : "memoryListCount", {
            count: totalCount,
          })}
        </div>

        {activeQuery.isError ? (
          <Alert message={t("memoryLoadFailed")} showIcon type="error" />
        ) : null}
        {detailQuery.isError ? (
          <Alert message={t("memoryDetailFailed")} showIcon type="warning" />
        ) : null}
        {rebuildMutation.isError ? (
          <Alert message={t("memoryRebuildFailed")} showIcon type="error" />
        ) : null}
        {rebuildMutation.isSuccess ? (
          <Alert
            message={t("memoryRebuildSucceeded", {
              failed: rebuildMutation.data.failed_count,
              rebuilt: rebuildMutation.data.rebuilt_count,
              scanned: rebuildMutation.data.scanned_count,
              skipped: rebuildMutation.data.skipped_count,
            })}
            showIcon
            type="success"
          />
        ) : null}

        {activeQuery.isLoading ? <Skeleton active paragraph={{ rows: 9 }} /> : null}
        {!activeQuery.isLoading && !activeQuery.isError && rows.length === 0 ? (
          <Empty
            description={
              trimmedQuery.length > 0 ? t("memoryNoMatches") : t("memoryNoRows")
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : null}
        {rows.length > 0 ? (
          <div className="at-memory-workbench">
            <div className="at-memory-list" aria-label={t("memoryRowsLabel")}>
              {rows.map((row) => (
                <MemoryRow
                  hit={hitMeta.get(row.id) ?? null}
                  key={row.id}
                  language={language}
                  onSelect={() => setSelectedMemoryId(row.id)}
                  row={row}
                  selected={row.id === selectedMemoryId}
                  t={t}
                />
              ))}
            </div>
            <MemoryDetail
              entry={detailQuery.data ?? null}
              hit={selectedSummary ? hitMeta.get(selectedSummary.id) ?? null : null}
              language={language}
              loading={detailQuery.isLoading}
              summary={selectedSummary}
              t={t}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MemoryRow({
  hit,
  language,
  onSelect,
  row,
  selected,
  t,
}: {
  hit: { score: number; snippet: string } | null;
  language: Language;
  onSelect: () => void;
  row: MemoryEntrySummary;
  selected: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <button
      aria-pressed={selected}
      className={selected ? "at-memory-row is-selected" : "at-memory-row"}
      data-testid={`memory-row-${row.id}`}
      onClick={onSelect}
      type="button"
    >
      <span className="at-memory-row-title">{row.content_title}</span>
      <span className="at-memory-row-preview">
        {hit?.snippet || row.content_body_preview}
      </span>
      <span className="at-memory-row-meta">
        <span>
          {memoryTierLabel(row.tier, t)} / {memoryScopeLabel(row.scope, t)} /{" "}
          {memoryKindLabel(row.kind, t)}
        </span>
        <span>{formatDateTime(row.updated_at, language)}</span>
      </span>
      <span className="at-memory-row-tags">
        <Tag>{memoryStatusLabel(row.status, t)}</Tag>
        {hit ? <Tag>{t("memorySearchScore", { score: hit.score.toFixed(2) })}</Tag> : null}
        {row.tags.slice(0, 3).map((tag) => (
          <Tag key={tag}>{tag}</Tag>
        ))}
      </span>
    </button>
  );
}

function MemoryDetail({
  entry,
  hit,
  language,
  loading,
  summary,
  t,
}: {
  entry: MemoryEntry | null;
  hit: { score: number; snippet: string } | null;
  language: Language;
  loading: boolean;
  summary: MemoryEntrySummary | null;
  t: ReturnType<typeof useTranslations>;
}) {
  if (summary === null) {
    return (
      <aside className="at-memory-detail">
        <Empty
          description={t("memoryNoSelected")}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </aside>
    );
  }
  const title = entry?.content.title ?? summary.content_title;
  const body = entry?.content.body ?? summary.content_body_preview;
  const context = entry?.content.context.trim() ?? "";
  const outcome = entry?.content.outcome.trim() ?? "";
  const metadataEntries = Object.entries(entry?.metadata ?? {});

  return (
    <aside className="at-memory-detail" data-testid="memory-detail">
      {loading ? <Skeleton active paragraph={{ rows: 8 }} title /> : null}
      {!loading ? (
        <>
          <div className="at-memory-detail-header">
            <Typography.Title level={4}>{title}</Typography.Title>
            <span className="at-memory-detail-id">{summary.id}</span>
          </div>
          {hit ? (
            <div className="at-memory-snippet">
              <strong>{t("memoryMatchedSnippet")}</strong>
              <span>{hit.snippet}</span>
            </div>
          ) : null}
          <section className="at-memory-detail-section">
            <h4>{t("memoryBody")}</h4>
            <p>{body}</p>
          </section>
          {context ? (
            <section className="at-memory-detail-section">
              <h4>{t("memoryContext")}</h4>
              <p>{context}</p>
            </section>
          ) : null}
          {outcome ? (
            <section className="at-memory-detail-section">
              <h4>{t("memoryOutcome")}</h4>
              <p>{outcome}</p>
            </section>
          ) : null}
          <dl className="at-memory-facts">
            <Fact label={t("memoryWorkspace")} value={summary.workspace_id} />
            <Fact label={t("memoryTier")} value={memoryTierLabel(summary.tier, t)} />
            <Fact label={t("memoryScope")} value={memoryScopeLabel(summary.scope, t)} />
            <Fact label={t("memoryKind")} value={memoryKindLabel(summary.kind, t)} />
            <Fact
              label={t("memoryStatus")}
              value={memoryStatusLabel(summary.status, t)}
            />
            <Fact
              label={t("memoryConfidence")}
              value={`${Math.round(summary.confidence_score * 100)}%`}
            />
            <Fact
              label={t("memorySource")}
              value={memorySourceLabel(summary.source, t)}
            />
            <Fact label={t("memoryVersion")} value={String(summary.version)} />
            <Fact
              label={t("memoryCreated")}
              value={formatDateTime(summary.created_at, language)}
            />
            <Fact
              label={t("memoryUpdated")}
              value={formatDateTime(summary.updated_at, language)}
            />
            <Fact
              label={t("memoryExpires")}
              value={formatDateTime(summary.expires_at, language)}
            />
            <Fact label={t("memorySession")} value={summary.session_id ?? ""} />
            <Fact label={t("memoryRole")} value={summary.role_id ?? ""} />
            <Fact
              label={t("memoryAccessCount")}
              value={entry ? String(entry.access_count) : ""}
            />
          </dl>
          {summary.tags.length > 0 ? (
            <div className="at-memory-detail-tags">
              <span>{t("memoryTags")}</span>
              <div>
                {summary.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>
            </div>
          ) : null}
          {metadataEntries.length > 0 ? (
            <section className="at-memory-detail-section">
              <h4>{t("memoryMetadata")}</h4>
              <dl className="at-memory-metadata">
                {metadataEntries.map(([key, value]) => (
                  <Fact key={key} label={key} value={value} />
                ))}
              </dl>
            </section>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </div>
  );
}

function buildSearchRequest({
  kindFilter,
  query,
  scopeFilter,
  selectedWorkspaceId,
  statusFilter,
  tierFilter,
}: {
  kindFilter: MemoryFilter<MemoryEntryKind>;
  query: string;
  scopeFilter: MemoryFilter<MemoryScope>;
  selectedWorkspaceId: string | null;
  statusFilter: MemoryFilter<MemoryEntryStatus>;
  tierFilter: MemoryFilter<MemoryTier>;
}): GlobalMemorySearchRequest {
  return {
    kind: kindFilter === "all" ? null : kindFilter,
    limit: memoryLimit,
    min_confidence: 0,
    scope: scopeFilter === "all" ? null : scopeFilter,
    status: statusFilter === "all" ? null : statusFilter,
    text_query: query,
    tier: tierFilter === "all" ? null : tierFilter,
    workspace_id: selectedWorkspaceId,
  };
}

function buildHitMeta(items: MemorySearchHit[]): Map<string, { score: number; snippet: string }> {
  return new Map(
    items.map((hit) => [
      hit.entry.id,
      {
        score: hit.score,
        snippet: hit.snippet,
      },
    ]),
  );
}

function tierOptions(t: ReturnType<typeof useTranslations>) {
  return [
    { label: t("memoryAll"), value: "all" },
    { label: t("memoryTierWorking"), value: "working" },
    { label: t("memoryTierMedium"), value: "medium_term" },
    { label: t("memoryTierPersistent"), value: "persistent" },
  ];
}

function scopeOptions(t: ReturnType<typeof useTranslations>) {
  return [
    { label: t("memoryAll"), value: "all" },
    { label: t("memoryScopeWorkspace"), value: "workspace" },
    { label: t("memoryScopeSession"), value: "session" },
    { label: t("memoryScopeRole"), value: "role" },
  ];
}

function kindOptions(t: ReturnType<typeof useTranslations>) {
  return [
    { label: t("memoryAll"), value: "all" },
    { label: t("memoryKindInsight"), value: "insight" },
    { label: t("memoryKindConstraint"), value: "constraint" },
    { label: t("memoryKindDecision"), value: "decision" },
    { label: t("memoryKindFailureMode"), value: "failure_mode" },
    { label: t("memoryKindPreference"), value: "preference" },
    { label: t("memoryKindFact"), value: "fact" },
    { label: t("memoryKindSummary"), value: "summary" },
  ];
}

function memoryTierLabel(
  tier: MemoryTier,
  t: ReturnType<typeof useTranslations>,
): string {
  if (tier === "working") {
    return t("memoryTierWorking");
  }
  if (tier === "medium_term") {
    return t("memoryTierMedium");
  }
  return t("memoryTierPersistent");
}

function memoryScopeLabel(
  scope: MemoryScope,
  t: ReturnType<typeof useTranslations>,
): string {
  if (scope === "session") {
    return t("memoryScopeSession");
  }
  if (scope === "role") {
    return t("memoryScopeRole");
  }
  return t("memoryScopeWorkspace");
}

function memoryKindLabel(
  kind: MemoryEntryKind,
  t: ReturnType<typeof useTranslations>,
): string {
  if (kind === "constraint") {
    return t("memoryKindConstraint");
  }
  if (kind === "decision") {
    return t("memoryKindDecision");
  }
  if (kind === "failure_mode") {
    return t("memoryKindFailureMode");
  }
  if (kind === "preference") {
    return t("memoryKindPreference");
  }
  if (kind === "fact") {
    return t("memoryKindFact");
  }
  if (kind === "summary") {
    return t("memoryKindSummary");
  }
  return t("memoryKindInsight");
}

function memoryStatusLabel(
  status: MemoryEntryStatus,
  t: ReturnType<typeof useTranslations>,
): string {
  if (status === "expired") {
    return t("memoryExpired");
  }
  if (status === "superseded") {
    return t("memorySuperseded");
  }
  return t("memoryActive");
}

function memorySourceLabel(
  source: MemorySourceKind,
  t: ReturnType<typeof useTranslations>,
): string {
  if (source === "condensation") {
    return t("memorySourceCondensation");
  }
  if (source === "manual") {
    return t("memorySourceManual");
  }
  if (source === "task_result") {
    return t("memorySourceTaskResult");
  }
  return t("memorySourceConsolidation");
}

function formatDateTime(
  value: string | null | undefined,
  language: Language,
): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat(language, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
