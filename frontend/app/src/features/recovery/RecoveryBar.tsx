import { Alert, Button, Space } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getRecoverySnapshot, resumeRun } from "../../api/client";

interface RecoveryBarProps {
  sessionId: string | null;
}

export function RecoveryBar({ sessionId }: RecoveryBarProps) {
  const queryClient = useQueryClient();
  const recoveryQuery = useQuery({
    queryKey: ["sessions", sessionId, "recovery"],
    queryFn: () => getRecoverySnapshot(sessionId ?? ""),
    enabled: sessionId !== null,
    refetchInterval: 10000,
  });

  const activeRun = recoveryQuery.data?.active_run ?? null;
  const recoverableRunId =
    activeRun?.should_show_recover === true ? activeRun.run_id : null;

  const resumeMutation = useMutation({
    mutationFn: () => resumeRun(recoverableRunId ?? ""),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "recovery"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    },
  });

  if (sessionId === null || recoveryQuery.isLoading || activeRun === null) {
    return null;
  }

  return (
    <Alert
      className="at-recovery"
      message={
        <Space size={8}>
          <span>
            Run {activeRun.run_id} is {activeRun.phase ?? activeRun.status}
          </span>
          {recoverableRunId !== null ? (
            <Button
              loading={resumeMutation.isPending}
              onClick={() => resumeMutation.mutate()}
              size="small"
              type="primary"
            >
              Resume
            </Button>
          ) : null}
        </Space>
      }
      showIcon
      type={recoverableRunId !== null ? "warning" : "info"}
    />
  );
}
