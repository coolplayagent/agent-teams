import { Alert, App, Button, Empty, Skeleton, Tooltip, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clipboard, Download, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  addRuntimeToolsSystemPath,
  getRuntimeToolDownload,
  listRuntimeTools,
  startRuntimeToolDownload,
} from "../../api/client";
import type {
  BinaryToolDownloadJob,
  BinaryToolId,
  BinaryToolItem,
  BinaryToolListResponse,
  BinaryToolPathSource,
  BinaryToolSystemPathResult,
  ConnectorStatus,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";

type RuntimeToolStatusKey =
  | "downloading"
  | "error"
  | "loading"
  | "missing"
  | "ready"
  | "update_available";
type RuntimeToolJobs = Record<string, BinaryToolDownloadJob>;

interface RuntimeToolDefault {
  displayName: string;
  executableName: string;
}

interface RuntimeToolViewState {
  detail: string;
  displayName: string;
  errorMessage: string;
  isBusy: boolean;
  job: BinaryToolDownloadJob | null;
  path: string;
  showAction: boolean;
  statusLabel: string;
  statusTone: ConnectorStatus;
  toolId: BinaryToolId;
  updateAvailable: boolean;
}

const runtimeToolsQueryKey = ["connectors", "runtime-tools"] as const;
const RUNTIME_TOOL_ORDER: BinaryToolId[] = [
  "rg",
  "gh",
  "clawhub",
  "relay-knowledge",
];
const RUNTIME_TOOL_DEFAULTS: Record<BinaryToolId, RuntimeToolDefault> = {
  clawhub: {
    displayName: "ClawHub CLI",
    executableName: "clawhub",
  },
  gh: {
    displayName: "GitHub CLI",
    executableName: "gh",
  },
  "relay-knowledge": {
    displayName: "Relay Knowledge CLI",
    executableName: "relay-knowledge",
  },
  rg: {
    displayName: "ripgrep",
    executableName: "rg",
  },
};

export function RuntimeToolsSection() {
  const t = useTranslations();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [runtimeToolJobs, setRuntimeToolJobs] = useState<RuntimeToolJobs>({});

  const runtimeToolsQuery = useQuery({
    queryKey: runtimeToolsQueryKey,
    queryFn: listRuntimeTools,
  });
  const downloadMutation = useMutation({
    mutationFn: (toolId: BinaryToolId) => startRuntimeToolDownload(toolId),
    onError: (error) => {
      void message.error(
        runtimeToolErrorMessage(error, t("connectorsRuntimeToolsDownloadFailed")),
      );
    },
    onSuccess: (job) => {
      setRuntimeToolJobs((current) => ({
        ...current,
        [job.job_id]: job,
      }));
      void queryClient.invalidateQueries({ queryKey: runtimeToolsQueryKey });
    },
  });
  const systemPathMutation = useMutation({
    mutationFn: addRuntimeToolsSystemPath,
    onError: (error) => {
      void message.error(
        runtimeToolErrorMessage(error, t("connectorsRuntimeToolsSystemPathFailed")),
      );
    },
    onSuccess: (result) => {
      queryClient.setQueryData<BinaryToolListResponse>(
        runtimeToolsQueryKey,
        (current) => withRuntimeToolsSystemPathAdded(current, result),
      );
      void queryClient.invalidateQueries({ queryKey: runtimeToolsQueryKey });
      void message.success(
        result.message || t("connectorsRuntimeToolsSystemPathSuccess"),
      );
    },
  });

  const activeRuntimeDownloadJobIds = useMemo(
    () => activeRuntimeToolJobIds(runtimeToolsQuery.data, runtimeToolJobs),
    [runtimeToolJobs, runtimeToolsQuery.data],
  );
  const downloadingToolId = downloadMutation.isPending
    ? downloadMutation.variables
    : null;
  const loadError =
    runtimeToolsQuery.error === null
      ? ""
      : runtimeToolErrorMessage(runtimeToolsQuery.error, "");
  const toolStates = runtimeToolViewStates(
    runtimeToolsQuery.data,
    loadError,
    runtimeToolJobs,
    t,
  );
  const systemPathState = runtimeToolsSystemPathState(
    runtimeToolsQuery.data,
    systemPathMutation.isPending,
    t,
  );

  useEffect(() => {
    if (activeRuntimeDownloadJobIds.length === 0) {
      return undefined;
    }
    const refreshJobs = () => {
      activeRuntimeDownloadJobIds.forEach((jobId) => {
        void getRuntimeToolDownload(jobId)
          .then((job) => {
            setRuntimeToolJobs((current) => ({
              ...current,
              [job.job_id]: job,
            }));
            if (isTerminalRuntimeToolJob(job)) {
              void queryClient.invalidateQueries({
                queryKey: runtimeToolsQueryKey,
              });
            }
          })
          .catch(() => {
            setRuntimeToolJobs((current) => removeRuntimeToolJob(current, jobId));
          });
      });
    };
    const timer = window.setInterval(refreshJobs, 700);
    refreshJobs();
    return () => window.clearInterval(timer);
  }, [activeRuntimeDownloadJobIds, queryClient]);

  function handleAddRuntimeToolsSystemPath() {
    if (systemPathMutation.isPending) {
      return;
    }
    if (runtimeToolsQuery.data?.system_path?.added === true) {
      modal.confirm({
        cancelText: t("sidebarDeleteCancel"),
        content: t("connectorsRuntimeToolsSystemPathResetMessage"),
        okText: t("connectorsRuntimeToolsSystemPathResetConfirm"),
        onOk: () => {
          systemPathMutation.mutate();
        },
        title: t("connectorsRuntimeToolsSystemPathResetTitle"),
      });
      return;
    }
    systemPathMutation.mutate();
  }

  async function handleCopyRuntimeToolPath(toolId: BinaryToolId) {
    const path = runtimeToolPath(
      toolId,
      runtimeToolsQuery.data,
      runtimeToolJobs,
    );
    if (!path) {
      void message.error(t("connectorsRuntimeToolsCopyPathEmpty"));
      return;
    }
    if (navigator.clipboard?.writeText === undefined) {
      void message.error(t("connectorsRuntimeToolsCopyUnavailable"));
      return;
    }
    try {
      await navigator.clipboard.writeText(path);
      void message.success(t("connectorsRuntimeToolsCopyPathSuccess"));
    } catch (error) {
      void message.error(
        runtimeToolErrorMessage(error, t("connectorsRuntimeToolsCopyPathFailed")),
      );
    }
  }

  return (
    <section className="at-runtime-tools" data-testid="runtime-tools-section">
      <div className="at-runtime-tools-heading">
        <Typography.Title level={4}>
          {t("connectorsRuntimeToolsTitle")}
        </Typography.Title>
        <div className="at-runtime-tools-heading-actions">
          {loadError ? (
            <Button
              icon={<RefreshCcw size={14} />}
              loading={runtimeToolsQuery.isFetching}
              onClick={() =>
                void queryClient.invalidateQueries({
                  queryKey: runtimeToolsQueryKey,
                })
              }
              size="small"
            >
              {t("connectorsRuntimeToolsRetry")}
            </Button>
          ) : null}
          <Tooltip title={systemPathState.label}>
            <Button
              className={systemPathState.added ? "is-complete" : undefined}
              disabled={systemPathState.disabled}
              loading={systemPathMutation.isPending}
              onClick={handleAddRuntimeToolsSystemPath}
              size="small"
            >
              {systemPathState.label}
            </Button>
          </Tooltip>
        </div>
      </div>
      {runtimeToolsQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 2 }} title={false} />
      ) : null}
      {loadError ? (
        <Alert
          message={t("connectorsRuntimeToolsLoadFailed")}
          description={loadError}
          showIcon
          type="warning"
        />
      ) : null}
      {!runtimeToolsQuery.isLoading && toolStates.length === 0 ? (
        <Empty
          description={t("connectorsRuntimeToolsEmpty")}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : null}
      <div className="at-runtime-tools-grid">
        {toolStates.map((tool) => (
          <RuntimeToolCard
            downloading={downloadingToolId === tool.toolId}
            key={tool.toolId}
            onCopyPath={(toolId) => {
              void handleCopyRuntimeToolPath(toolId);
            }}
            onDownload={(toolId) => downloadMutation.mutate(toolId)}
            t={t}
            tool={tool}
          />
        ))}
      </div>
    </section>
  );
}

function RuntimeToolCard({
  downloading,
  onCopyPath,
  onDownload,
  t,
  tool,
}: {
  downloading: boolean;
  onCopyPath: (toolId: BinaryToolId) => void;
  onDownload: (toolId: BinaryToolId) => void;
  t: ReturnType<typeof useTranslations>;
  tool: RuntimeToolViewState;
}) {
  const busy = downloading || tool.isBusy;
  return (
    <article
      className="at-runtime-tool-card"
      data-testid={`runtime-tool-card-${tool.toolId}`}
    >
      <div className="at-runtime-tool-main">
        <span className="at-runtime-tool-icon" aria-hidden="true">
          {runtimeToolIconText(tool.toolId)}
        </span>
        <div className="at-runtime-tool-title">
          <strong>{tool.displayName}</strong>
          {tool.detail ? <span>{tool.detail}</span> : null}
          {tool.errorMessage ? <em title={tool.errorMessage}>{tool.errorMessage}</em> : null}
          <RuntimeToolProgress job={tool.job} t={t} />
        </div>
      </div>
      <div className="at-runtime-tool-footer">
        <span className={`at-connectors-status is-${tool.statusTone}`}>
          <span aria-hidden="true" />
          {tool.statusLabel}
        </span>
        <div className="at-runtime-tool-actions">
          {tool.path ? (
            <Tooltip title={t("connectorsRuntimeToolsCopyPath")}>
              <Button
                aria-label={t("connectorsRuntimeToolsCopyPath")}
                icon={<Clipboard size={14} />}
                onClick={() => onCopyPath(tool.toolId)}
                size="small"
                type="text"
              />
            </Tooltip>
          ) : null}
          {tool.showAction ? (
            <Button
              disabled={busy}
              icon={<Download size={14} />}
              loading={busy}
              onClick={() => onDownload(tool.toolId)}
              size="small"
            >
              {runtimeToolActionLabel(tool, busy, t)}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function RuntimeToolProgress({
  job,
  t,
}: {
  job: BinaryToolDownloadJob | null;
  t: ReturnType<typeof useTranslations>;
}) {
  if (job === null || !["failed", "queued", "running"].includes(job.status)) {
    return null;
  }
  const percent = clampProgress(job.progress_percent);
  return (
    <div className="at-runtime-tool-progress">
      <div
        aria-label={t("connectorsRuntimeToolsProgress")}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        role="progressbar"
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <span>{job.message || t("connectorsRuntimeToolsDownloading")}</span>
    </div>
  );
}

function runtimeToolViewStates(
  data: BinaryToolListResponse | undefined,
  loadError: string,
  jobs: RuntimeToolJobs,
  t: ReturnType<typeof useTranslations>,
): RuntimeToolViewState[] {
  const loaded = data !== undefined && !loadError;
  return RUNTIME_TOOL_ORDER.map((toolId) =>
    runtimeToolViewState({
      item: data?.items.find((candidate) => candidate.tool_id === toolId),
      jobs,
      loadError,
      loaded,
      t,
      toolId,
    }),
  );
}

function runtimeToolViewState({
  item,
  jobs,
  loadError,
  loaded,
  t,
  toolId,
}: {
  item: BinaryToolItem | undefined;
  jobs: RuntimeToolJobs;
  loadError: string;
  loaded: boolean;
  t: ReturnType<typeof useTranslations>;
  toolId: BinaryToolId;
}): RuntimeToolViewState {
  const defaults = RUNTIME_TOOL_DEFAULTS[toolId];
  const job = runtimeToolJobForTool(toolId, item, jobs);
  const jobStatus = job?.status;
  const isJobBusy = jobStatus === "queued" || jobStatus === "running";
  const isReady = item?.status === "ready" || jobStatus === "succeeded";
  const updateAvailable = item?.update_available === true && jobStatus !== "succeeded";
  const statusKey = runtimeToolStatusKey({
    isJobBusy,
    isReady,
    item,
    jobStatus,
    loadError,
    loaded,
    updateAvailable,
  });
  const path = (job?.path || item?.path || "").trim();
  return {
    detail: runtimeToolDetail(item, updateAvailable, t),
    displayName: item?.display_name || defaults.displayName,
    errorMessage: (job?.error_message || item?.error_message || loadError).trim(),
    isBusy: statusKey === "downloading",
    job,
    path,
    showAction: loaded && !loadError && (!isReady || updateAvailable),
    statusLabel: runtimeToolStatusLabel(statusKey, t),
    statusTone: runtimeToolStatusTone(statusKey),
    toolId,
    updateAvailable,
  };
}

function runtimeToolStatusKey({
  isJobBusy,
  isReady,
  item,
  jobStatus,
  loadError,
  loaded,
  updateAvailable,
}: {
  isJobBusy: boolean;
  isReady: boolean;
  item: BinaryToolItem | undefined;
  jobStatus: BinaryToolDownloadJob["status"] | undefined;
  loadError: string;
  loaded: boolean;
  updateAvailable: boolean;
}): RuntimeToolStatusKey {
  if (loadError) {
    return "error";
  }
  if (!loaded) {
    return "loading";
  }
  if (isJobBusy || item?.status === "downloading") {
    return "downloading";
  }
  if (jobStatus === "failed" || item?.status === "error") {
    return "error";
  }
  if (updateAvailable && isReady) {
    return "update_available";
  }
  if (isReady) {
    return "ready";
  }
  return "missing";
}

function runtimeToolJobForTool(
  toolId: BinaryToolId,
  item: BinaryToolItem | undefined,
  jobs: RuntimeToolJobs,
): BinaryToolDownloadJob | null {
  const itemJobId = item?.download_job_id?.trim();
  if (itemJobId && jobs[itemJobId] !== undefined) {
    return jobs[itemJobId];
  }
  return (
    Object.values(jobs).find(
      (job) => job.tool_id === toolId && !isTerminalRuntimeToolJob(job),
    ) ?? null
  );
}

function runtimeToolDetail(
  item: BinaryToolItem | undefined,
  updateAvailable: boolean,
  t: ReturnType<typeof useTranslations>,
): string {
  const version = item?.version?.trim() ?? "";
  const targetVersion = item?.target_version?.trim() ?? "";
  const parts = [
    version ? t("connectorsRuntimeToolsVersion", { version }) : "",
    updateAvailable && targetVersion
      ? t("connectorsRuntimeToolsUpdateAvailable", { version: targetVersion })
      : "",
    runtimeToolSourceLabel(item?.path_source, t),
  ];
  return parts.filter((part) => part.trim()).join(" · ");
}

function runtimeToolSourceLabel(
  value: BinaryToolPathSource | null | undefined,
  t: ReturnType<typeof useTranslations>,
): string {
  if (value === "managed") {
    return t("connectorsRuntimeToolsSourceManaged");
  }
  if (value === "npm_global") {
    return t("connectorsRuntimeToolsSourceNpmGlobal");
  }
  if (value === "system") {
    return t("connectorsRuntimeToolsSourceSystem");
  }
  return "";
}

function runtimeToolStatusLabel(
  status: RuntimeToolStatusKey,
  t: ReturnType<typeof useTranslations>,
): string {
  if (status === "downloading") {
    return t("connectorsRuntimeToolsStatusDownloading");
  }
  if (status === "error") {
    return t("connectorsRuntimeToolsStatusError");
  }
  if (status === "loading") {
    return t("connectorsRuntimeToolsStatusLoading");
  }
  if (status === "missing") {
    return t("connectorsRuntimeToolsStatusMissing");
  }
  if (status === "update_available") {
    return t("connectorsRuntimeToolsStatusUpdateAvailable");
  }
  return t("connectorsRuntimeToolsStatusReady");
}

function runtimeToolStatusTone(status: RuntimeToolStatusKey): ConnectorStatus {
  if (status === "ready") {
    return "connected";
  }
  if (status === "error") {
    return "error";
  }
  return "needs_config";
}

function runtimeToolActionLabel(
  tool: RuntimeToolViewState,
  busy: boolean,
  t: ReturnType<typeof useTranslations>,
): string {
  if (busy) {
    return tool.updateAvailable
      ? t("connectorsRuntimeToolsUpdating")
      : t("connectorsRuntimeToolsDownloading");
  }
  return tool.updateAvailable
    ? t("connectorsRuntimeToolsUpdate")
    : t("connectorsRuntimeToolsDownload");
}

function runtimeToolsSystemPathState(
  data: BinaryToolListResponse | undefined,
  busy: boolean,
  t: ReturnType<typeof useTranslations>,
): { added: boolean; disabled: boolean; label: string } {
  const pathState = data?.system_path;
  const known = pathState !== undefined && pathState !== null;
  const supported = pathState?.supported === true;
  const added = pathState?.added === true;
  if (busy) {
    return {
      added,
      disabled: true,
      label: t("connectorsRuntimeToolsSystemPathAdding"),
    };
  }
  if (added) {
    return {
      added: true,
      disabled: false,
      label: t("connectorsRuntimeToolsSystemPathAdded"),
    };
  }
  if (known && !supported) {
    return {
      added: false,
      disabled: true,
      label: t("connectorsRuntimeToolsSystemPathUnsupported"),
    };
  }
  return {
    added: false,
    disabled: false,
    label: t("connectorsRuntimeToolsSystemPathAdd"),
  };
}

function withRuntimeToolsSystemPathAdded(
  current: BinaryToolListResponse | undefined,
  result: BinaryToolSystemPathResult,
): BinaryToolListResponse {
  return {
    items: current?.items ?? [],
    system_path: {
      added: true,
      bin_dir: result.bin_dir || current?.system_path?.bin_dir || "",
      supported: current?.system_path?.supported !== false,
    },
  };
}

function activeRuntimeToolJobIds(
  data: BinaryToolListResponse | undefined,
  jobs: RuntimeToolJobs,
): string[] {
  const ids = new Set<string>();
  data?.items.forEach((item) => {
    const jobId = item.download_job_id?.trim();
    if (jobId && item.status === "downloading") {
      ids.add(jobId);
    }
  });
  Object.values(jobs).forEach((job) => {
    if (!isTerminalRuntimeToolJob(job)) {
      ids.add(job.job_id);
    }
  });
  return Array.from(ids).sort();
}

function isTerminalRuntimeToolJob(job: BinaryToolDownloadJob): boolean {
  return job.status === "failed" || job.status === "succeeded";
}

function removeRuntimeToolJob(
  current: RuntimeToolJobs,
  jobId: string,
): RuntimeToolJobs {
  const next: RuntimeToolJobs = {};
  Object.entries(current).forEach(([currentJobId, job]) => {
    if (currentJobId !== jobId) {
      next[currentJobId] = job;
    }
  });
  return next;
}

function runtimeToolPath(
  toolId: BinaryToolId,
  data: BinaryToolListResponse | undefined,
  jobs: RuntimeToolJobs,
): string {
  const item = data?.items.find((candidate) => candidate.tool_id === toolId);
  const job = runtimeToolJobForTool(toolId, item, jobs);
  return (job?.path || item?.path || "").trim();
}

function runtimeToolIconText(toolId: BinaryToolId): string {
  if (toolId === "relay-knowledge") {
    return "RK";
  }
  if (toolId === "clawhub") {
    return "CH";
  }
  return toolId.toUpperCase();
}

function clampProgress(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 10;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function runtimeToolErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  const message = String(error ?? "").trim();
  return message || fallback;
}
