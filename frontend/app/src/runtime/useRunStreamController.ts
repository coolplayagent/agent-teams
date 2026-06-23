import { App } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { openRunStream, type RunStreamHandle } from "./streamClient";
import { useRuntimeStore } from "./runtimeStore";

const RECOVERY_CONTINUITY_REFRESH_MS = 10000;

export interface StartRunStreamOptions {
  runId: string;
  sessionId: string;
  afterEventId?: number;
}

export interface RunStreamController {
  activeRunId: string | null;
  clearRunStream: () => void;
  startRunStream: (options: StartRunStreamOptions) => void;
}

export function useRunStreamController(): RunStreamController {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const runtimeState = useRuntimeStore((state) => state.runtimeState);
  const setRuntimeState = useRuntimeStore((state) => state.setRuntimeState);
  const runtimeStateRef = useRef(runtimeState);
  const streamHandleRef = useRef<RunStreamHandle | null>(null);
  const continuityRefreshTimerRef = useRef<number | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  useEffect(() => {
    runtimeStateRef.current = runtimeState;
  }, [runtimeState]);

  useEffect(
    () => () => {
      stopContinuityRefresh();
      streamHandleRef.current?.close();
    },
    [],
  );

  const refreshRecoverySnapshot = (sessionId: string) => {
    void queryClient.invalidateQueries({
      queryKey: ["sessions", sessionId, "recovery"],
    });
  };

  const stopContinuityRefresh = () => {
    if (continuityRefreshTimerRef.current !== null) {
      window.clearInterval(continuityRefreshTimerRef.current);
      continuityRefreshTimerRef.current = null;
    }
  };

  const startContinuityRefresh = (sessionId: string) => {
    stopContinuityRefresh();
    refreshRecoverySnapshot(sessionId);
    continuityRefreshTimerRef.current = window.setInterval(() => {
      refreshRecoverySnapshot(sessionId);
    }, RECOVERY_CONTINUITY_REFRESH_MS);
  };

  const clearRunStream = () => {
    stopContinuityRefresh();
    streamHandleRef.current?.close();
    streamHandleRef.current = null;
    setActiveRunId(null);
  };

  const startRunStream = (options: StartRunStreamOptions) => {
    stopContinuityRefresh();
    streamHandleRef.current?.close();
    const replayOffset = Math.max(
      runtimeStateRef.current.runs[options.runId]?.lastEventId ?? 0,
      options.afterEventId ?? 0,
    );
    setActiveRunId(options.runId);
    startContinuityRefresh(options.sessionId);
    streamHandleRef.current = openRunStream({
      runId: options.runId,
      afterEventId: replayOffset,
      initialState: runtimeStateRef.current,
      onState: (nextRuntimeState) => {
        runtimeStateRef.current = nextRuntimeState;
        setRuntimeState(nextRuntimeState);
      },
      onClosed: () => {
        stopContinuityRefresh();
        setActiveRunId(null);
        streamHandleRef.current = null;
        void queryClient.invalidateQueries({
          queryKey: ["sessions", options.sessionId, "messages"],
        });
        void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
        refreshRecoverySnapshot(options.sessionId);
        void queryClient.invalidateQueries({
          queryKey: ["sessions", options.sessionId, "token-usage"],
        });
      },
      onError: (errorMessage) => {
        void message.error(errorMessage);
      },
    });
  };

  return {
    activeRunId,
    clearRunStream,
    startRunStream,
  };
}
