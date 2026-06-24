import {
  Alert,
  App,
  Button,
  Drawer,
  Empty,
  Input,
  Segmented,
  Skeleton,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  PackagePlus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  browseClawHubSkillMarket,
  getClawHubSkillMarketDetail,
  getConfigStatus,
  getRuntimeSkillDetail,
  installClawHubMarketSkill,
  reloadSkillsConfig,
  searchClawHubSkillMarket,
  uninstallClawHubMarketSkill,
  uninstallRuntimeSkill,
} from "../../api/client";
import type {
  ClawHubSkillMarketDetail,
  ClawHubSkillMarketSearchItem,
  RuntimeSkillDetail,
  RuntimeSkillSummary,
  SkillSource,
} from "../../api/contracts";
import { useTranslations, type Translate } from "../../i18n";
import { MarkdownMessage } from "../timeline/MarkdownMessage";

type SkillsTab = "installed" | "market";

type DetailTarget =
  | { kind: "installed"; ref: string }
  | { kind: "market"; slug: string; version?: string | null };

interface SkillDetailView {
  description: string;
  markdown: string;
  rows: DetailRow[];
  subtitle: string;
  title: string;
}

interface DetailRow {
  code?: boolean;
  label: string;
  value: string;
}

const userRemovableSources = new Set<SkillSource>([
  "user_agents",
  "user_claude",
  "user_codex",
  "user_opencode",
  "user_relay_teams",
]);

export function SkillsView() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<SkillsTab>("market");
  const [query, setQuery] = useState("");
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);

  const statusQuery = useQuery({
    queryKey: ["skills", "status"],
    queryFn: getConfigStatus,
  });
  const marketQuery = useQuery({
    queryKey: ["skills", "market", query.trim()],
    queryFn: () =>
      query.trim()
        ? searchClawHubSkillMarket(query, 24)
        : browseClawHubSkillMarket({ limit: 24, sort: "popular" }),
    enabled: activeTab === "market",
  });

  const installedSkills = useMemo(
    () => statusQuery.data?.skills?.skills ?? [],
    [statusQuery.data],
  );
  const filteredInstalledSkills = useMemo(
    () => filterRuntimeSkills(installedSkills, query),
    [installedSkills, query],
  );
  const marketItems = marketQuery.data?.items ?? [];

  const installMutation = useMutation({
    mutationFn: (item: ClawHubSkillMarketSearchItem) =>
      installClawHubMarketSkill({
        force: false,
        slug: item.slug,
        version: item.version ?? null,
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        void message.error(result.error_message || t("skillsInstallFailed"));
        return;
      }
      void message.success(t("skillsInstallSuccess"));
      void refreshSkillQueries(queryClient);
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("skillsInstallFailed"),
      );
    },
  });
  const marketUninstallMutation = useMutation({
    mutationFn: (slug: string) => uninstallClawHubMarketSkill(slug),
    onSuccess: (result) => {
      if (!result.ok) {
        void message.error(result.error_message || t("skillsUninstallFailed"));
        return;
      }
      void message.success(t("skillsUninstallSuccess"));
      void refreshSkillQueries(queryClient);
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("skillsUninstallFailed"),
      );
    },
  });
  const runtimeUninstallMutation = useMutation({
    mutationFn: (ref: string) => uninstallRuntimeSkill(ref),
    onSuccess: (result) => {
      if (!result.ok) {
        void message.error(result.error_message || t("skillsUninstallFailed"));
        return;
      }
      void message.success(t("skillsUninstallSuccess"));
      void refreshSkillQueries(queryClient);
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("skillsUninstallFailed"),
      );
    },
  });
  const reloadMutation = useMutation({
    mutationFn: reloadSkillsConfig,
    onSuccess: () => {
      void message.success(t("skillsReloaded"));
      void refreshSkillQueries(queryClient);
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("skillsReloadFailed"),
      );
    },
  });

  const installingSlug = installMutation.isPending
    ? installMutation.variables.slug
    : null;
  const uninstallingMarketSlug = marketUninstallMutation.isPending
    ? marketUninstallMutation.variables
    : null;
  const uninstallingRuntimeRef = runtimeUninstallMutation.isPending
    ? runtimeUninstallMutation.variables
    : null;

  function confirmMarketUninstall(slug: string) {
    modal.confirm({
      cancelText: t("skillsCancel"),
      content: t("skillsUninstallConfirmMessage", { skill: slug }),
      okButtonProps: { danger: true },
      okText: t("skillsUninstall"),
      onOk: () => marketUninstallMutation.mutateAsync(slug),
      title: t("skillsUninstallConfirmTitle"),
    });
  }

  function confirmRuntimeUninstall(skill: RuntimeSkillSummary) {
    modal.confirm({
      cancelText: t("skillsCancel"),
      content: t("skillsUninstallConfirmMessage", { skill: skill.name }),
      okButtonProps: { danger: true },
      okText: t("skillsUninstall"),
      onOk: () => runtimeUninstallMutation.mutateAsync(skill.ref),
      title: t("skillsUninstallConfirmTitle"),
    });
  }

  return (
    <section
      aria-label={t("skillsTitle")}
      className="at-skills-view"
      data-testid="skills-view"
    >
      <div className="at-skills-toolbar">
        <div className="at-skills-title">
          <span className="at-skills-title-icon" aria-hidden="true">
            <Wrench size={18} />
          </span>
          <div>
            <Typography.Title level={3}>{t("skillsTitle")}</Typography.Title>
            <Typography.Text type="secondary">{t("skillsSubtitle")}</Typography.Text>
          </div>
        </div>
        <div className="at-skills-toolbar-actions">
          <Input
            allowClear
            aria-label={t("skillsSearchLabel")}
            className="at-skills-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("skillsSearchPlaceholder")}
            prefix={<Search aria-hidden="true" size={15} />}
            type="search"
            value={query}
          />
          <Tooltip title={t("skillsRefresh")}>
            <Button
              aria-label={t("skillsRefresh")}
              icon={<RefreshCcw size={15} />}
              loading={
                statusQuery.isFetching ||
                marketQuery.isFetching ||
                reloadMutation.isPending
              }
              onClick={() => {
                if (activeTab === "installed") {
                  reloadMutation.mutate();
                } else {
                  void queryClient.invalidateQueries({
                    queryKey: ["skills", "market"],
                  });
                }
              }}
            />
          </Tooltip>
        </div>
      </div>

      <div className="at-skills-content">
        <div className="at-skills-tabs">
          <Segmented
            onChange={(value) => setActiveTab(value as SkillsTab)}
            options={[
              { label: t("skillsMarketTab"), value: "market" },
              { label: t("skillsInstalledTab"), value: "installed" },
            ]}
            value={activeTab}
          />
          <span>
            {t("skillsInstalledCount", { count: installedSkills.length })}
          </span>
        </div>

        {activeTab === "market" ? (
          <SkillsMarketPanel
            error={marketQuery.isError}
            installingSlug={installingSlug}
            items={marketItems}
            loading={marketQuery.isLoading}
            onInstall={(item) => installMutation.mutate(item)}
            onOpenDetail={(item) =>
              setDetailTarget({
                kind: "market",
                slug: item.slug,
                version: item.version ?? null,
              })
            }
            onUninstall={confirmMarketUninstall}
            query={query}
            t={t}
            uninstallingSlug={uninstallingMarketSlug}
          />
        ) : (
          <InstalledSkillsPanel
            error={statusQuery.isError}
            loading={statusQuery.isLoading}
            onOpenDetail={(skill) =>
              setDetailTarget({ kind: "installed", ref: skill.ref })
            }
            onUninstall={confirmRuntimeUninstall}
            skills={filteredInstalledSkills}
            sourceTotal={installedSkills.length}
            t={t}
            uninstallingRef={uninstallingRuntimeRef}
          />
        )}
      </div>

      <SkillDetailDrawer
        detailTarget={detailTarget}
        onClose={() => setDetailTarget(null)}
        t={t}
      />
    </section>
  );
}

function SkillsMarketPanel({
  error,
  installingSlug,
  items,
  loading,
  onInstall,
  onOpenDetail,
  onUninstall,
  query,
  t,
  uninstallingSlug,
}: {
  error: boolean;
  installingSlug: string | null;
  items: ClawHubSkillMarketSearchItem[];
  loading: boolean;
  onInstall: (item: ClawHubSkillMarketSearchItem) => void;
  onOpenDetail: (item: ClawHubSkillMarketSearchItem) => void;
  onUninstall: (slug: string) => void;
  query: string;
  t: Translate;
  uninstallingSlug: string | null;
}) {
  if (loading) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
  }
  if (error) {
    return <Alert message={t("skillsMarketLoadError")} showIcon type="error" />;
  }
  if (items.length === 0) {
    return (
      <Empty
        description={query.trim() ? t("skillsMarketEmpty") : t("skillsBrowseMarket")}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }
  return (
    <div className="at-skills-grid">
      {items.map((item) => (
        <MarketSkillCard
          installing={installingSlug === item.slug}
          item={item}
          key={`${item.slug}:${item.version ?? ""}`}
          onInstall={() => onInstall(item)}
          onOpenDetail={() => onOpenDetail(item)}
          onUninstall={() => onUninstall(item.slug)}
          t={t}
          uninstalling={uninstallingSlug === item.slug}
        />
      ))}
    </div>
  );
}

function InstalledSkillsPanel({
  error,
  loading,
  onOpenDetail,
  onUninstall,
  skills,
  sourceTotal,
  t,
  uninstallingRef,
}: {
  error: boolean;
  loading: boolean;
  onOpenDetail: (skill: RuntimeSkillSummary) => void;
  onUninstall: (skill: RuntimeSkillSummary) => void;
  skills: RuntimeSkillSummary[];
  sourceTotal: number;
  t: Translate;
  uninstallingRef: string | null;
}) {
  if (loading) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
  }
  if (error) {
    return <Alert message={t("skillsInstalledLoadError")} showIcon type="error" />;
  }
  if (skills.length === 0) {
    return (
      <Empty
        description={
          sourceTotal === 0 ? t("skillsInstalledEmpty") : t("skillsInstalledNoMatches")
        }
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }
  return (
    <div className="at-skills-grid">
      {skills.map((skill) => (
        <RuntimeSkillCard
          key={skill.ref}
          onOpenDetail={() => onOpenDetail(skill)}
          onUninstall={() => onUninstall(skill)}
          skill={skill}
          t={t}
          uninstalling={uninstallingRef === skill.ref}
        />
      ))}
    </div>
  );
}

function MarketSkillCard({
  installing,
  item,
  onInstall,
  onOpenDetail,
  onUninstall,
  t,
  uninstalling,
}: {
  installing: boolean;
  item: ClawHubSkillMarketSearchItem;
  onInstall: () => void;
  onOpenDetail: () => void;
  onUninstall: () => void;
  t: Translate;
  uninstalling: boolean;
}) {
  const title = marketTitle(item);
  return (
    <article className="at-skills-card">
      <button
        aria-label={t("skillsOpenDetails", { skill: title })}
        className="at-skills-card-body"
        onClick={onOpenDetail}
        type="button"
      >
        <span className="at-skills-card-icon" aria-hidden="true">
          <PackagePlus size={17} />
        </span>
        <span className="at-skills-card-main">
          <strong>{title}</strong>
          <span>{item.summary || item.slug}</span>
          <code>{item.slug}</code>
        </span>
      </button>
      <div className="at-skills-card-footer">
        <SkillStats stats={item.stats ?? null} t={t} />
        {item.installed ? (
          <Button
            danger
            icon={<Trash2 size={14} />}
            loading={uninstalling}
            onClick={onUninstall}
            size="small"
          >
            {uninstalling ? t("skillsUninstalling") : t("skillsUninstall")}
          </Button>
        ) : (
          <Button
            icon={<PackagePlus size={14} />}
            loading={installing}
            onClick={onInstall}
            size="small"
            type="primary"
          >
            {installing ? t("skillsInstalling") : t("skillsInstall")}
          </Button>
        )}
      </div>
    </article>
  );
}

function RuntimeSkillCard({
  onOpenDetail,
  onUninstall,
  skill,
  t,
  uninstalling,
}: {
  onOpenDetail: () => void;
  onUninstall: () => void;
  skill: RuntimeSkillSummary;
  t: Translate;
  uninstalling: boolean;
}) {
  const removable = userRemovableSources.has(skill.source);
  return (
    <article className="at-skills-card">
      <button
        aria-label={t("skillsOpenDetails", { skill: skill.name })}
        className="at-skills-card-body"
        onClick={onOpenDetail}
        type="button"
      >
        <span className="at-skills-card-icon" aria-hidden="true">
          <BookOpen size={17} />
        </span>
        <span className="at-skills-card-main">
          <strong>{skill.name}</strong>
          <span>{skill.description}</span>
          <code>{skill.ref}</code>
        </span>
      </button>
      <div className="at-skills-card-footer">
        <Tag>{skillSourceLabel(skill.source, t)}</Tag>
        {removable ? (
          <Button
            danger
            icon={<Trash2 size={14} />}
            loading={uninstalling}
            onClick={onUninstall}
            size="small"
          >
            {uninstalling ? t("skillsUninstalling") : t("skillsUninstall")}
          </Button>
        ) : (
          <Tag icon={<ShieldCheck size={12} />}>{t("skillsInstalled")}</Tag>
        )}
      </div>
    </article>
  );
}

function SkillDetailDrawer({
  detailTarget,
  onClose,
  t,
}: {
  detailTarget: DetailTarget | null;
  onClose: () => void;
  t: Translate;
}) {
  const detailQuery = useQuery({
    queryKey: ["skills", "detail", detailTarget],
    queryFn: async () => {
      if (detailTarget === null) {
        throw new Error(t("skillsDetailsLoadFailed"));
      }
      if (detailTarget.kind === "installed") {
        const detail = await getRuntimeSkillDetail(detailTarget.ref);
        return runtimeDetailView(detail, t);
      }
      const detail = await getClawHubSkillMarketDetail(
        detailTarget.slug,
        detailTarget.version ?? null,
      );
      return marketDetailView(detail, t);
    },
    enabled: detailTarget !== null,
  });

  const detail = detailQuery.data;
  return (
    <Drawer
      className="at-skills-detail-drawer"
      destroyOnClose
      onClose={onClose}
      open={detailTarget !== null}
      title={t("skillsDetail")}
      width={520}
    >
      {detailQuery.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
      {detailQuery.isError ? (
        <Alert message={t("skillsDetailsLoadFailed")} showIcon type="error" />
      ) : null}
      {detail ? (
        <div className="at-skills-detail">
          <div className="at-skills-detail-head">
            <h3>{detail.title}</h3>
            <span>{detail.subtitle}</span>
            {detail.description ? <p>{detail.description}</p> : null}
          </div>
          <section className="at-skills-detail-section">
            <h4>{t("skillsManifest")}</h4>
            <div className="at-skills-detail-markdown">
              <MarkdownMessage text={detail.markdown || t("skillsNoManifest")} />
            </div>
          </section>
          <dl className="at-skills-detail-list">
            {detail.rows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.code ? <code>{row.value}</code> : row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </Drawer>
  );
}

function SkillStats({
  stats,
  t,
}: {
  stats: ClawHubSkillMarketSearchItem["stats"] | null;
  t: Translate;
}) {
  const installs = stats?.installs_current ?? stats?.installs_all_time;
  const chips: Array<{ label: string; value: number | null | undefined }> = [
    { label: t("skillsInstalls"), value: installs },
    { label: t("skillsStars"), value: stats?.stars },
    { label: t("skillsDownloads"), value: stats?.downloads },
  ];
  return (
    <span className="at-skills-stats">
      {chips
        .filter((chip) => typeof chip.value === "number")
        .slice(0, 2)
        .map((chip) => (
          <span key={chip.label}>
            {chip.label}: <strong>{formatCount(chip.value ?? 0)}</strong>
          </span>
        ))}
    </span>
  );
}

function filterRuntimeSkills(
  skills: RuntimeSkillSummary[],
  query: string,
): RuntimeSkillSummary[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return skills;
  }
  return skills.filter((skill) =>
    normalizeSearchText(
      [skill.description, skill.name, skill.ref, skill.source].join(" "),
    ).includes(normalizedQuery),
  );
}

function runtimeDetailView(detail: RuntimeSkillDetail, t: Translate): SkillDetailView {
  return {
    description: detail.description,
    markdown: detail.manifest_content ?? detail.instructions,
    rows: [
      { code: true, label: t("skillsRef"), value: detail.ref },
      { label: t("skillsSource"), value: skillSourceLabel(detail.source, t) },
      { code: true, label: t("skillsDirectory"), value: detail.directory },
      { code: true, label: t("skillsManifestPath"), value: detail.manifest_path },
    ],
    subtitle: skillSourceLabel(detail.source, t),
    title: detail.name,
  };
}

function marketDetailView(
  detail: ClawHubSkillMarketDetail,
  t: Translate,
): SkillDetailView {
  const stats = detail.stats;
  return {
    description: detail.summary,
    markdown: detail.manifest_content ?? detail.summary,
    rows: [
      { code: true, label: t("skillsRef"), value: detail.slug },
      { label: t("skillsVersion"), value: detail.version ?? t("skillsUnknown") },
      {
        label: t("skillsOwner"),
        value: detail.owner_display_name ?? detail.owner_handle ?? t("skillsUnknown"),
      },
      {
        label: t("skillsInstalls"),
        value: formatCount(stats?.installs_current ?? stats?.installs_all_time),
      },
      { label: t("skillsStars"), value: formatCount(stats?.stars) },
      { label: t("skillsDownloads"), value: formatCount(stats?.downloads) },
    ],
    subtitle: t("skillsMarketSource"),
    title: detail.title || detail.slug,
  };
}

function marketTitle(item: ClawHubSkillMarketSearchItem): string {
  return item.title.trim() || item.slug;
}

function skillSourceLabel(source: SkillSource, t: Translate): string {
  if (source === "builtin") {
    return t("skillsBuiltinSource");
  }
  if (source === "plugin") {
    return t("skillsPluginSource");
  }
  if (source.startsWith("project_")) {
    return t("skillsProjectSource");
  }
  if (source.startsWith("user_")) {
    return t("skillsUserSource");
  }
  return t("skillsRuntimeSource");
}

function formatCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0";
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 10000 ? 1 : 0,
    notation: value >= 10000 ? "compact" : "standard",
  }).format(value);
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function refreshSkillQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["skills", "status"] });
  void queryClient.invalidateQueries({ queryKey: ["skills", "market"] });
}
