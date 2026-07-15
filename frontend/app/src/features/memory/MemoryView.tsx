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
  applyMemorySkillDraft,
  generateMemorySkillDrafts,
  getMemory,
  getMemorySkillDraft,
  listMemories,
  listMemorySkillDrafts,
  rebuildMemoryIndex,
  searchMemories,
  updateMemorySkillDraft,
  validateMemorySkillDraft,
} from "../../api/client";
import type {
  GenerateMemorySkillDraftsRequest,
  GlobalMemorySearchRequest,
  MemoryEntry,
  MemoryEntryKind,
  MemoryEntryStatus,
  MemoryEntrySummary,
  MemoryScope,
  MemorySearchHit,
  MemorySkillDraft,
  MemorySkillDraftGenerationKind,
  MemorySkillDraftKind,
  MemorySkillDraftScopeKind,
  MemorySkillDraftStatus,
  MemorySkillDraftSummary,
  MemorySourceKind,
  MemoryTier,
  UpdateMemorySkillDraftRequest,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { useUiStore, type Language } from "../../runtime/uiStore";

type MemoryFilter<T extends string> = T | "all";
type MemoryTab = "architecture" | "entries" | "skill-drafts";

interface DraftFormState {
  description: string;
  instructions: string;
  runtimeName: string;
}

const memoryLimit = 40;

export function MemoryView({
  selectedWorkspaceId,
}: {
  selectedWorkspaceId: string | null;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const language = useUiStore((state) => state.language);
  const [activeTab, setActiveTab] = useState<MemoryTab>("entries");
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
  const entriesActive = activeTab === "entries";

  const listQuery = useQuery({
    enabled: entriesActive && trimmedQuery.length === 0,
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
    enabled: entriesActive && trimmedQuery.length > 0,
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
    enabled: entriesActive && selectedSummary !== null,
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
        <Segmented
          className="at-memory-tabs"
          onChange={(value) => setActiveTab(value as MemoryTab)}
          options={[
            { label: t("memoryEntriesTab"), value: "entries" },
            { label: t("memoryArchitectureTab"), value: "architecture" },
            { label: t("memorySkillDraftsTab"), value: "skill-drafts" },
          ]}
          value={activeTab}
        />

        {activeTab === "entries" ? (
          <>
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
              {t(
                trimmedQuery.length > 0 ? "memorySearchCount" : "memoryListCount",
                {
                  count: totalCount,
                },
              )}
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

            {activeQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 9 }} />
            ) : null}
            {!activeQuery.isLoading && !activeQuery.isError && rows.length === 0 ? (
              <Empty
                description={
                  trimmedQuery.length > 0
                    ? t("memoryNoMatches")
                    : t("memoryNoRows")
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
                  hit={
                    selectedSummary ? hitMeta.get(selectedSummary.id) ?? null : null
                  }
                  language={language}
                  loading={detailQuery.isLoading}
                  summary={selectedSummary}
                  t={t}
                />
              </div>
            ) : null}
          </>
        ) : null}

        {activeTab === "architecture" ? <MemoryArchitectureMap t={t} /> : null}
        {activeTab === "skill-drafts" ? (
          <MemorySkillDrafts selectedWorkspaceId={selectedWorkspaceId} />
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

function MemoryArchitectureMap({
  t,
}: {
  t: ReturnType<typeof useTranslations>;
}) {
  const tiers = [
    {
      body: t("memoryArchitectureWorkingBody"),
      meta: t("memoryArchitectureWorkingMeta"),
      title: t("memoryArchitectureWorkingTitle"),
    },
    {
      body: t("memoryArchitectureMediumBody"),
      meta: t("memoryArchitectureMediumMeta"),
      title: t("memoryArchitectureMediumTitle"),
    },
    {
      body: t("memoryArchitecturePersistentBody"),
      meta: t("memoryArchitecturePersistentMeta"),
      title: t("memoryArchitecturePersistentTitle"),
    },
  ];

  return (
    <div
      className="at-memory-architecture"
      data-testid="memory-architecture-map"
    >
      <section className="at-memory-architecture-flow">
        <h4>{t("memoryArchitectureFlowTitle")}</h4>
        <ol>
          {[
            t("memoryArchitectureCapture"),
            t("memoryArchitectureWorking"),
            t("memoryArchitectureConsolidation"),
            t("memoryArchitectureReuse"),
            t("memoryArchitectureDrafts"),
          ].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <section className="at-memory-architecture-tiers">
        {tiers.map((tier) => (
          <article key={tier.title}>
            <h4>{tier.title}</h4>
            <p>{tier.body}</p>
            <span>{tier.meta}</span>
          </article>
        ))}
      </section>
      <section className="at-memory-architecture-flow">
        <h4>{t("memoryArchitectureSkillFlowTitle")}</h4>
        <ol>
          {[
            t("memoryArchitectureSkillSelect"),
            t("memoryArchitectureSkillGenerate"),
            t("memoryArchitectureSkillValidate"),
            t("memoryArchitectureSkillApply"),
          ].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function MemorySkillDrafts({
  selectedWorkspaceId,
}: {
  selectedWorkspaceId: string | null;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const language = useUiStore((state) => state.language);
  const [draftSearch, setDraftSearch] = useState("");
  const [scopeKind, setScopeKind] = useState<MemorySkillDraftScopeKind>(
    selectedWorkspaceId ? "workspace" : "cross_workspace",
  );
  const [draftKind, setDraftKind] =
    useState<MemorySkillDraftGenerationKind>("auto");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [draftForm, setDraftForm] = useState<DraftFormState>({
    description: "",
    instructions: "",
    runtimeName: "",
  });
  const trimmedDraftSearch = draftSearch.trim();
  const listWorkspaceId = scopeKind === "workspace" ? selectedWorkspaceId : null;
  const listDraftKind: MemorySkillDraftKind | "all" =
    draftKind === "auto" ? "all" : draftKind;

  useEffect(() => {
    if (selectedWorkspaceId === null && scopeKind === "workspace") {
      setScopeKind("cross_workspace");
    }
  }, [scopeKind, selectedWorkspaceId]);

  const draftListQuery = useQuery({
    queryFn: () =>
      listMemorySkillDrafts({
        draftKind: listDraftKind,
        limit: 30,
        scopeKind,
        status: "all",
        textQuery: trimmedDraftSearch,
        workspaceId: listWorkspaceId,
      }),
    queryKey: [
      "memories",
      "skill-drafts",
      scopeKind,
      listWorkspaceId ?? "",
      listDraftKind,
      trimmedDraftSearch,
    ],
  });
  const draftRows = draftListQuery.data?.items ?? [];
  const effectiveSelectedDraftId = selectedDraftId ?? draftRows[0]?.id ?? null;
  const selectedDraftSummary = useMemo(
    () => draftRows.find((row) => row.id === effectiveSelectedDraftId) ?? null,
    [draftRows, effectiveSelectedDraftId],
  );
  const draftDetailQuery = useQuery({
    enabled: selectedDraftSummary !== null,
    queryFn: () => {
      if (selectedDraftSummary === null) {
        throw new Error("Memory skill draft is required.");
      }
      return getMemorySkillDraft(selectedDraftSummary.id);
    },
    queryKey: ["memories", "skill-draft", selectedDraftSummary?.id ?? ""],
  });
  const generateMutation = useMutation({
    mutationFn: () =>
      generateMemorySkillDrafts(
        buildGenerateDraftRequest({
          draftKind,
          scopeKind,
          selectedWorkspaceId,
          textQuery: trimmedDraftSearch,
        }),
      ),
    onSuccess: (result) => {
      if (result.items[0]) {
        setSelectedDraftId(result.items[0].id);
      }
      void queryClient.invalidateQueries({
        queryKey: ["memories", "skill-drafts"],
      });
    },
  });
  const updateMutation = useMutation({
    mutationFn: (request: { draftId: string; body: UpdateMemorySkillDraftRequest }) =>
      updateMemorySkillDraft(request.draftId, request.body),
    onSuccess: (draft) => {
      setSelectedDraftId(draft.id);
      void queryClient.invalidateQueries({
        queryKey: ["memories", "skill-drafts"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["memories", "skill-draft", draft.id],
      });
    },
  });
  const validateMutation = useMutation({
    mutationFn: (draftId: string) => validateMemorySkillDraft(draftId),
    onSuccess: (draft) => {
      setSelectedDraftId(draft.id);
      void queryClient.invalidateQueries({
        queryKey: ["memories", "skill-drafts"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["memories", "skill-draft", draft.id],
      });
    },
  });
  const applyMutation = useMutation({
    mutationFn: (draftId: string) => applyMemorySkillDraft(draftId),
    onSuccess: (result) => {
      setSelectedDraftId(result.draft.id);
      void queryClient.invalidateQueries({
        queryKey: ["memories", "skill-drafts"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["memories", "skill-draft", result.draft.id],
      });
    },
  });

  useEffect(() => {
    if (draftRows.length === 0) {
      if (selectedDraftId !== null) {
        setSelectedDraftId(null);
      }
      return;
    }
    if (
      selectedDraftId === null ||
      draftRows.every((row) => row.id !== selectedDraftId)
    ) {
      setSelectedDraftId(draftRows[0].id);
    }
  }, [draftRows, selectedDraftId]);

  useEffect(() => {
    const draft = draftDetailQuery.data;
    if (!draft) {
      return;
    }
    setDraftForm({
      description: draft.description,
      instructions: draft.instructions,
      runtimeName: draft.runtime_name,
    });
  }, [draftDetailQuery.data?.id, draftDetailQuery.data?.updated_at]);

  const selectedDraft = draftDetailQuery.data ?? null;
  const canGenerate = scopeKind === "cross_workspace" || selectedWorkspaceId !== null;
  const canSave = selectedDraft !== null && draftForm.runtimeName.trim().length > 0;
  const canApply =
    selectedDraft !== null &&
    selectedDraft.status !== "applied" &&
    selectedDraft.status !== "applying" &&
    selectedDraft.validation_messages.every(
      (message) => message.severity !== "error",
    );

  return (
    <div className="at-memory-drafts" data-testid="memory-skill-drafts">
      <div className="at-memory-draft-controls">
        <Input
          allowClear
          aria-label={t("memoryDraftSearchLabel")}
          className="at-memory-search"
          onChange={(event) => setDraftSearch(event.target.value)}
          placeholder={t("memoryDraftSearchPlaceholder")}
          prefix={<Search aria-hidden="true" size={15} />}
          type="search"
          value={draftSearch}
        />
        <Select
          aria-label={t("memoryDraftScope")}
          className="at-memory-filter"
          onChange={(value) => setScopeKind(value)}
          options={[
            {
              disabled: selectedWorkspaceId === null,
              label: t("memoryDraftScopeWorkspace"),
              value: "workspace",
            },
            {
              label: t("memoryDraftScopeCrossWorkspace"),
              value: "cross_workspace",
            },
          ]}
          popupMatchSelectWidth={false}
          value={scopeKind}
        />
        <Select
          aria-label={t("memoryDraftKind")}
          className="at-memory-filter"
          onChange={(value) => setDraftKind(value)}
          options={[
            { label: t("memoryDraftKindAuto"), value: "auto" },
            { label: t("memoryDraftKindSkill"), value: "skill" },
            { label: t("memoryDraftKindSopSkill"), value: "sop_skill" },
          ]}
          popupMatchSelectWidth={false}
          value={draftKind}
        />
        <Button
          disabled={!canGenerate}
          loading={generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
          type="primary"
        >
          {t("memoryDraftGenerate")}
        </Button>
      </div>

      <div className="at-memory-count">
        {t("memoryDraftListCount", {
          count: draftListQuery.data?.total_count ?? draftRows.length,
        })}
      </div>

      {draftListQuery.isError ? (
        <Alert message={t("memoryDraftLoadFailed")} showIcon type="error" />
      ) : null}
      {draftDetailQuery.isError ? (
        <Alert message={t("memoryDraftDetailFailed")} showIcon type="warning" />
      ) : null}
      {generateMutation.isError ? (
        <Alert message={t("memoryDraftGenerateFailed")} showIcon type="error" />
      ) : null}
      {generateMutation.isSuccess && generateMutation.data.error_message ? (
        <Alert
          message={generateMutation.data.error_message}
          showIcon
          type="warning"
        />
      ) : null}
      {updateMutation.isError ? (
        <Alert message={t("memoryDraftSaveFailed")} showIcon type="error" />
      ) : null}
      {validateMutation.isError ? (
        <Alert message={t("memoryDraftValidateFailed")} showIcon type="error" />
      ) : null}
      {applyMutation.isError ? (
        <Alert message={t("memoryDraftApplyFailed")} showIcon type="error" />
      ) : null}
      {applyMutation.isSuccess ? (
        <Alert
          message={t("memoryDraftApplyResult", {
            ref: applyMutation.data.ref,
          })}
          showIcon
          type="success"
        />
      ) : null}

      {draftListQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : null}
      {!draftListQuery.isLoading &&
      !draftListQuery.isError &&
      draftRows.length === 0 ? (
        <Empty
          description={t("memoryDraftNoRows")}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : null}
      {draftRows.length > 0 ? (
        <div className="at-memory-draft-shell">
          <div
            aria-label={t("memoryDraftRowsLabel")}
            className="at-memory-draft-list"
          >
            {draftRows.map((draft) => (
              <MemorySkillDraftRow
                draft={draft}
                key={draft.id}
                language={language}
                onSelect={() => setSelectedDraftId(draft.id)}
                selected={draft.id === selectedDraftId}
                t={t}
              />
            ))}
          </div>
          <MemorySkillDraftEditor
            applyMutationPending={applyMutation.isPending}
            canApply={canApply}
            canSave={canSave}
            draft={selectedDraft}
            form={draftForm}
            language={language}
            loading={draftDetailQuery.isLoading}
            onApply={(draftId) => applyMutation.mutate(draftId)}
            onFormChange={setDraftForm}
            onReject={(draftId) =>
              updateMutation.mutate({
                body: { status: "rejected" },
                draftId,
              })
            }
            onSave={(draftId) =>
              updateMutation.mutate({
                body: {
                  description: draftForm.description.trim(),
                  instructions: draftForm.instructions.trimEnd(),
                  runtime_name: draftForm.runtimeName.trim(),
                },
                draftId,
              })
            }
            onValidate={(draftId) => validateMutation.mutate(draftId)}
            rejectMutationPending={
              updateMutation.isPending &&
              updateMutation.variables?.body.status === "rejected"
            }
            saveMutationPending={
              updateMutation.isPending &&
              updateMutation.variables?.body.status !== "rejected"
            }
            t={t}
            validateMutationPending={validateMutation.isPending}
          />
        </div>
      ) : null}
    </div>
  );
}

function MemorySkillDraftRow({
  draft,
  language,
  onSelect,
  selected,
  t,
}: {
  draft: MemorySkillDraftSummary;
  language: Language;
  onSelect: () => void;
  selected: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <button
      aria-pressed={selected}
      className={selected ? "at-memory-draft-row is-selected" : "at-memory-draft-row"}
      data-testid={`memory-draft-row-${draft.id}`}
      onClick={onSelect}
      type="button"
    >
      <span className="at-memory-row-title">{draft.runtime_name}</span>
      <span className="at-memory-row-preview">{draft.description || draft.id}</span>
      <span className="at-memory-row-meta">
        <span>
          {memoryDraftKindLabel(draft.draft_kind, t)} /{" "}
          {memoryDraftStatusLabel(draft.status, t)} /{" "}
          {t("memoryDraftSourceCount", {
            count: draft.source_memory_count,
          })}
        </span>
        <span>{formatDateTime(draft.updated_at, language)}</span>
      </span>
      <span className="at-memory-row-tags">
        <Tag>{memoryDraftScopeLabel(draft.scope_kind, t)}</Tag>
        {draft.validation_error_count > 0 ? (
          <Tag color="error">
            {t("memoryDraftErrors", { count: draft.validation_error_count })}
          </Tag>
        ) : null}
        {draft.validation_warning_count > 0 ? (
          <Tag color="warning">
            {t("memoryDraftWarnings", { count: draft.validation_warning_count })}
          </Tag>
        ) : null}
        {draft.applied_ref ? <Tag>{draft.applied_ref}</Tag> : null}
      </span>
    </button>
  );
}

function MemorySkillDraftEditor({
  applyMutationPending,
  canApply,
  canSave,
  draft,
  form,
  language,
  loading,
  onApply,
  onFormChange,
  onReject,
  onSave,
  onValidate,
  rejectMutationPending,
  saveMutationPending,
  t,
  validateMutationPending,
}: {
  applyMutationPending: boolean;
  canApply: boolean;
  canSave: boolean;
  draft: MemorySkillDraft | null;
  form: DraftFormState;
  language: Language;
  loading: boolean;
  onApply: (draftId: string) => void;
  onFormChange: (form: DraftFormState) => void;
  onReject: (draftId: string) => void;
  onSave: (draftId: string) => void;
  onValidate: (draftId: string) => void;
  rejectMutationPending: boolean;
  saveMutationPending: boolean;
  t: ReturnType<typeof useTranslations>;
  validateMutationPending: boolean;
}) {
  if (draft === null) {
    return (
      <aside className="at-memory-draft-editor">
        <Empty
          description={t("memoryDraftNoSelected")}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </aside>
    );
  }

  return (
    <aside className="at-memory-draft-editor" data-testid="memory-draft-editor">
      {loading ? <Skeleton active paragraph={{ rows: 8 }} title /> : null}
      {!loading ? (
        <>
          <div className="at-memory-draft-editor-header">
            <div>
              <Typography.Title level={4}>{draft.runtime_name}</Typography.Title>
              <span>{draft.id}</span>
            </div>
            <Tag>{memoryDraftStatusLabel(draft.status, t)}</Tag>
          </div>
          <div className="at-memory-draft-fields">
            <label>
              <span>{t("memoryDraftRuntimeName")}</span>
              <Input
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    runtimeName: event.target.value,
                  })
                }
                value={form.runtimeName}
              />
            </label>
            <label>
              <span>{t("memoryDraftDescription")}</span>
              <Input
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    description: event.target.value,
                  })
                }
                value={form.description}
              />
            </label>
            <label>
              <span>{t("memoryDraftInstructions")}</span>
              <Input.TextArea
                autoSize={{ maxRows: 9, minRows: 5 }}
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    instructions: event.target.value,
                  })
                }
                value={form.instructions}
              />
            </label>
          </div>
          <dl className="at-memory-draft-lifecycle">
            <Fact
              label={t("memoryDraftCreated")}
              value={formatDateTime(draft.created_at, language)}
            />
            <Fact
              label={t("memoryDraftUpdated")}
              value={formatDateTime(draft.updated_at, language)}
            />
            <Fact
              label={t("memoryDraftValidated")}
              value={formatDateTime(draft.validated_at, language)}
            />
            <Fact
              label={t("memoryDraftApplied")}
              value={formatDateTime(draft.applied_at, language)}
            />
            <Fact label={t("memoryDraftAppliedRef")} value={draft.applied_ref ?? ""} />
            <Fact
              label={t("memoryDraftSourceCountLabel")}
              value={String(draft.source_memory_ids.length)}
            />
          </dl>
          {draft.validation_messages.length > 0 ? (
            <section className="at-memory-draft-messages">
              <h4>{t("memoryDraftValidationMessages")}</h4>
              {draft.validation_messages.map((message) => (
                <div key={`${message.severity}-${message.code}-${message.path}`}>
                  <Tag color={message.severity === "error" ? "error" : "warning"}>
                    {message.severity}
                  </Tag>
                  <span>
                    {message.code}: {message.message}
                  </span>
                  {message.path ? <code>{message.path}</code> : null}
                </div>
              ))}
            </section>
          ) : null}
          {draft.files.length > 0 ? (
            <section className="at-memory-draft-files">
              <h4>{t("memoryDraftFiles")}</h4>
              {draft.files.map((file) => (
                <div key={file.path}>
                  <code>{file.path}</code>
                  <span>{file.encoding}</span>
                </div>
              ))}
            </section>
          ) : null}
          <div className="at-memory-draft-actions">
            <Button
              disabled={!canSave}
              loading={saveMutationPending}
              onClick={() => onSave(draft.id)}
            >
              {t("memoryDraftSave")}
            </Button>
            <Button
              loading={validateMutationPending}
              onClick={() => onValidate(draft.id)}
            >
              {t("memoryDraftValidate")}
            </Button>
            <Button
              disabled={!canApply}
              loading={applyMutationPending}
              onClick={() => onApply(draft.id)}
              type="primary"
            >
              {t("memoryDraftApply")}
            </Button>
            <Button
              disabled={draft.status === "rejected" || draft.status === "applied"}
              loading={rejectMutationPending}
              onClick={() => onReject(draft.id)}
            >
              {t("memoryDraftReject")}
            </Button>
          </div>
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

function memoryDraftScopeLabel(
  scopeKind: MemorySkillDraftScopeKind,
  t: ReturnType<typeof useTranslations>,
): string {
  if (scopeKind === "cross_workspace") {
    return t("memoryDraftScopeCrossWorkspace");
  }
  return t("memoryDraftScopeWorkspace");
}

function memoryDraftKindLabel(
  draftKind: MemorySkillDraftKind,
  t: ReturnType<typeof useTranslations>,
): string {
  if (draftKind === "sop_skill") {
    return t("memoryDraftKindSopSkill");
  }
  return t("memoryDraftKindSkill");
}

function memoryDraftStatusLabel(
  status: MemorySkillDraftStatus,
  t: ReturnType<typeof useTranslations>,
): string {
  if (status === "validated") {
    return t("memoryDraftStatusValidated");
  }
  if (status === "applying") {
    return t("memoryDraftStatusApplying");
  }
  if (status === "applied") {
    return t("memoryDraftStatusApplied");
  }
  if (status === "rejected") {
    return t("memoryDraftStatusRejected");
  }
  return t("memoryDraftStatusDraft");
}

function buildGenerateDraftRequest({
  draftKind,
  scopeKind,
  selectedWorkspaceId,
  textQuery,
}: {
  draftKind: MemorySkillDraftGenerationKind;
  scopeKind: MemorySkillDraftScopeKind;
  selectedWorkspaceId: string | null;
  textQuery: string;
}): GenerateMemorySkillDraftsRequest {
  return {
    draft_kind: draftKind,
    limit: 80,
    max_drafts: 3,
    min_confidence: 0.3,
    scope_kind: scopeKind,
    source_memory_ids: [],
    text_query: textQuery,
    workspace_id: scopeKind === "workspace" ? selectedWorkspaceId : null,
    workspace_ids: [],
  };
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
