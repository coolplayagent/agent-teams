import { Alert, Button, Empty, Space, Table, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";

import {
  getTaskSpecArtifactDiff,
  listRunTasks,
  listSessionRounds,
  listSpecCheckpointEvaluations,
  listTaskSpecArtifacts,
} from "../../api/client";
import type {
  SessionRound,
  SpecCheckpointEvaluation,
  TaskProjection,
  TaskSpecArtifactDiffFieldChange,
  TaskSpecArtifactVersionSummary,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";

interface SpecLineagePanelProps {
  onBack?: () => void;
  sessionId: string | null;
  standalone?: boolean;
  taskId?: string | null;
}

export function SpecLineagePanel({
  onBack,
  sessionId,
  standalone = false,
  taskId = null,
}: SpecLineagePanelProps) {
  const t = useTranslations();
  const directTaskId = taskId?.trim() ?? "";
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const roundsQuery = useQuery({
    queryKey: ["sessions", sessionId, "rounds", "spec-lineage"],
    queryFn: () => listSessionRounds(sessionId ?? "", { limit: 10 }),
    enabled: !standalone && sessionId !== null,
  });
  const latestRunId = useMemo(
    () => latestRoundRunId(roundsQuery.data?.items ?? []),
    [roundsQuery.data?.items],
  );
  const tasksQuery = useQuery({
    queryKey: ["tasks", "runs", latestRunId, "spec-lineage"],
    queryFn: () => listRunTasks(latestRunId ?? "", true),
    enabled: !standalone && latestRunId !== null,
  });
  const specTasks = useMemo(
    () => tasksWithSpec(tasksQuery.data?.tasks ?? []),
    [tasksQuery.data?.tasks],
  );
  useEffect(() => {
    if (standalone) {
      setSelectedTaskId(directTaskId);
      return;
    }
    if (specTasks.length === 0) {
      setSelectedTaskId("");
      return;
    }
    if (!specTasks.some((task) => task.task_id === selectedTaskId)) {
      setSelectedTaskId(specTasks[0]?.task_id ?? "");
    }
  }, [directTaskId, selectedTaskId, specTasks, standalone]);

  const artifactsQuery = useQuery({
    queryKey: ["tasks", selectedTaskId, "spec-artifacts"],
    queryFn: () => listTaskSpecArtifacts(selectedTaskId),
    enabled: selectedTaskId.trim().length > 0,
  });
  const versions = useMemo(
    () => sortedVersions(artifactsQuery.data?.versions ?? []),
    [artifactsQuery.data?.versions],
  );
  useEffect(() => {
    if (versions.length === 0) {
      setSelectedVersion(null);
      return;
    }
    if (!versions.some((version) => version.version === selectedVersion)) {
      setSelectedVersion(versions[versions.length - 1]?.version ?? null);
    }
  }, [selectedVersion, versions]);

  const evaluationsQuery = useQuery({
    queryKey: ["tasks", selectedTaskId, "spec-checkpoint-evaluations"],
    queryFn: () => listSpecCheckpointEvaluations(selectedTaskId),
    enabled: selectedTaskId.trim().length > 0,
  });
  const diffQuery = useQuery({
    queryKey: ["tasks", selectedTaskId, "spec-artifacts", selectedVersion, "diff"],
    queryFn: () =>
      getTaskSpecArtifactDiff(
        selectedTaskId,
        selectedVersion ?? 1,
        Math.max((selectedVersion ?? 1) - 1, 1),
      ),
    enabled: selectedTaskId.trim().length > 0 && (selectedVersion ?? 0) > 1,
  });
  const loading =
    (!standalone && (roundsQuery.isLoading || tasksQuery.isLoading)) ||
    artifactsQuery.isLoading ||
    evaluationsQuery.isLoading;
  const loadError =
    !standalone && (roundsQuery.isError || tasksQuery.isError);
  const taskUnavailable =
    !standalone && specTasks.length === 0 && !loading;
  const handleReload = () => {
    if (!standalone) {
      void roundsQuery.refetch();
      void tasksQuery.refetch();
    }
    void artifactsQuery.refetch();
    void evaluationsQuery.refetch();
    if ((selectedVersion ?? 0) > 1) {
      void diffQuery.refetch();
    }
  };

  return (
    <section
      aria-label={t("specLineageTitle")}
      className={standalone ? "at-spec-lineage is-standalone" : "at-spec-lineage"}
    >
      <div className="at-spec-lineage-header">
        <div>
          <Typography.Title level={4}>{t("specLineageTitle")}</Typography.Title>
          <Typography.Text type="secondary">
            {standalone
              ? selectedTaskId || t("specLineageNoTasks")
              : latestRunId ?? t("specLineageNoRun")}
          </Typography.Text>
        </div>
        {standalone ? (
          <Space className="at-spec-lineage-header-actions" size={8}>
            <Button
              aria-label={t("specLineageReload")}
              icon={<RefreshCw size={15} />}
              loading={loading || diffQuery.isFetching}
              onClick={handleReload}
              size="small"
            >
              {t("specLineageReload")}
            </Button>
            <Button
              aria-label={t("specLineageBack")}
              icon={<ArrowLeft size={15} />}
              onClick={onBack}
              size="small"
              type="text"
            >
              {t("specLineageBack")}
            </Button>
          </Space>
        ) : null}
      </div>
      {standalone && selectedTaskId.trim().length === 0 ? (
        <Empty description={t("specLineageNoTasks")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : !standalone && sessionId === null ? (
        <Empty description={t("specLineageNoSession")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : loadError ? (
        <Alert message={t("specLineageLoadError")} showIcon type="error" />
      ) : taskUnavailable ? (
        <Empty description={t("specLineageNoTasks")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          {standalone ? (
            <div className="at-spec-lineage-direct-task">
              <span>{t("specLineageTask")}</span>
              <strong>{selectedTaskId}</strong>
            </div>
          ) : (
            <div className="at-spec-lineage-controls">
              <label>
                <span>{t("specLineageTask")}</span>
                <select
                  aria-label={t("specLineageTask")}
                  disabled={specTasks.length === 0}
                  onChange={(event) => setSelectedTaskId(event.target.value)}
                  value={selectedTaskId}
                >
                  {specTasks.map((task) => (
                    <option key={task.task_id} value={task.task_id}>
                      {taskLabel(task)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {artifactsQuery.isError ? (
            <Alert message={t("specLineageArtifactError")} showIcon type="error" />
          ) : (
            <SpecVersionTimeline
              selectedVersion={selectedVersion}
              setSelectedVersion={setSelectedVersion}
              versions={versions}
            />
          )}
          <SpecEvaluationTable
            evaluations={evaluationsQuery.data?.evaluations ?? []}
            loading={evaluationsQuery.isLoading}
          />
          <SpecDiffViewer
            diffError={diffQuery.isError}
            loading={diffQuery.isLoading}
            selectedVersion={selectedVersion}
            changes={diffQuery.data?.field_changes ?? []}
            hasChanges={diffQuery.data?.has_changes ?? false}
            summary={diffQuery.data?.summary ?? ""}
          />
        </>
      )}
    </section>
  );
}

interface SpecVersionTimelineProps {
  selectedVersion: number | null;
  setSelectedVersion: (version: number) => void;
  versions: TaskSpecArtifactVersionSummary[];
}

function SpecVersionTimeline({
  selectedVersion,
  setSelectedVersion,
  versions,
}: SpecVersionTimelineProps) {
  const t = useTranslations();
  if (versions.length === 0) {
    return <Empty description={t("specLineageNoVersions")} image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }
  return (
    <div aria-label={t("specLineageVersions")} className="at-spec-lineage-timeline">
      {versions.map((version) => (
        <button
          className={
            version.version === selectedVersion
              ? "at-spec-version is-selected"
              : "at-spec-version"
          }
          key={version.artifact_id}
          onClick={() => setSelectedVersion(version.version)}
          type="button"
        >
          <strong>{t("specLineageVersion", { version: String(version.version) })}</strong>
          <span>{shortDate(version.updated_at)}</span>
        </button>
      ))}
    </div>
  );
}

interface SpecEvaluationTableProps {
  evaluations: SpecCheckpointEvaluation[];
  loading: boolean;
}

function SpecEvaluationTable({ evaluations, loading }: SpecEvaluationTableProps) {
  const t = useTranslations();
  return (
    <Table
      className="at-spec-lineage-table"
      columns={[
        {
          dataIndex: "checkpoint_seq",
          key: "checkpoint_seq",
          title: t("specLineageCheckpoint"),
        },
        {
          dataIndex: "overall_score",
          key: "overall_score",
          render: formatScore,
          title: t("specLineageScore"),
        },
        {
          dataIndex: "summary",
          key: "summary",
          title: t("specLineageSummary"),
        },
        {
          dataIndex: "drift_detected",
          key: "drift_detected",
          render: (value: boolean) =>
            value ? t("specLineageDrift") : t("specLineageNoDrift"),
          title: t("specLineageDriftColumn"),
        },
      ]}
      dataSource={evaluations}
      loading={loading}
      locale={{ emptyText: t("specLineageNoEvaluations") }}
      pagination={false}
      rowKey="evaluation_id"
      size="small"
    />
  );
}

interface SpecDiffViewerProps {
  changes: TaskSpecArtifactDiffFieldChange[];
  diffError: boolean;
  hasChanges: boolean;
  loading: boolean;
  selectedVersion: number | null;
  summary: string;
}

function SpecDiffViewer({
  changes,
  diffError,
  hasChanges,
  loading,
  selectedVersion,
  summary,
}: SpecDiffViewerProps) {
  const t = useTranslations();
  if ((selectedVersion ?? 0) <= 1) {
    return <Empty description={t("specLineageNoDiff")} image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }
  if (diffError) {
    return <Alert message={t("specLineageDiffError")} showIcon type="error" />;
  }
  if (loading) {
    return (
      <Typography.Text type="secondary">{t("specLineageDiffLoading")}</Typography.Text>
    );
  }
  if (!hasChanges) {
    return <Empty description={t("specLineageNoChanges")} image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }
  return (
    <div className="at-spec-lineage-diff">
      {summary.trim() ? (
        <Typography.Text type="secondary">{summary}</Typography.Text>
      ) : null}
      {changes.map((change) => (
        <div className="at-spec-diff-field" key={change.field_name}>
          <div className="at-spec-diff-field-header">
            <strong>{change.field_label}</strong>
            <span>{change.change_type}</span>
          </div>
          <pre>{fieldChangeText(change)}</pre>
        </div>
      ))}
    </div>
  );
}

function latestRoundRunId(rounds: SessionRound[]): string | null {
  const withRunIds = rounds.filter((round) => round.run_id.trim().length > 0);
  if (withRunIds.length === 0) {
    return null;
  }
  const sorted = [...withRunIds].sort(
    (left, right) => roundTimestamp(left) - roundTimestamp(right),
  );
  return sorted[sorted.length - 1]?.run_id ?? null;
}

function roundTimestamp(round: SessionRound): number {
  const raw =
    round.run_updated_at ?? round.run_started_at ?? round.created_at ?? "";
  const value = Date.parse(raw);
  return Number.isFinite(value) ? value : 0;
}

function tasksWithSpec(tasks: TaskProjection[]): TaskProjection[] {
  return tasks.filter(
    (task) =>
      task.task_id.trim().length > 0 &&
      (typeof task.spec_artifact_id === "string" ||
        typeof task.spec_source_task_id === "string" ||
        (task.spec !== undefined && task.spec !== null)),
  );
}

function sortedVersions(
  versions: TaskSpecArtifactVersionSummary[],
): TaskSpecArtifactVersionSummary[] {
  return [...versions].sort((left, right) => left.version - right.version);
}

function taskLabel(task: TaskProjection): string {
  const title = task.title?.trim();
  if (title) {
    return `${title} (${task.task_id})`;
  }
  return task.task_id;
}

function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
}

function fieldChangeText(change: TaskSpecArtifactDiffFieldChange): string {
  const lines: string[] = [];
  if (change.old_value || change.new_value) {
    if (change.old_value) {
      lines.push(`- ${change.old_value}`);
    }
    if (change.new_value) {
      lines.push(`+ ${change.new_value}`);
    }
  }
  for (const item of change.removed_items ?? []) {
    lines.push(`- ${item}`);
  }
  for (const item of change.added_items ?? []) {
    lines.push(`+ ${item}`);
  }
  if (lines.length === 0) {
    for (const item of change.old_items ?? []) {
      lines.push(`- ${item}`);
    }
    for (const item of change.new_items ?? []) {
      lines.push(`+ ${item}`);
    }
  }
  return lines.join("\n") || "-";
}

function formatScore(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return value.toFixed(1);
}
