import { App } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { openRunStream, type RunStreamHandle } from "./streamClient";
import { useRuntimeStore } from "./runtimeStore";

const RECOVERY_CONTINUITY_REFRESH_MS = 10000;
const RUN_STREAM_RECONNECT_DELAY_MS = 1000;
const RUN_STREAM_RECONNECT_MAX_ATTEMPTS = 3;

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
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const streamGenerationRef = useRef(0);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  useEffect(() => {
    runtimeStateRef.current = runtimeState;
  }, [runtimeState]);

  useEffect(
    () => () => {
      stopContinuityRefresh();
      clearReconnectTimer();
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

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
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
    streamGenerationRef.current += 1;
    reconnectAttemptRef.current = 0;
    clearReconnectTimer();
    stopContinuityRefresh();
    streamHandleRef.current?.close();
    streamHandleRef.current = null;
    setActiveRunId(null);
  };

  const openTrackedRunStream = (
    options: StartRunStreamOptions,
    streamGeneration: number,
  ) => {
    const replayOffset = Math.max(
      runtimeStateRef.current.runs[options.runId]?.lastEventId ?? 0,
      options.afterEventId ?? 0,
    );
    streamHandleRef.current = openRunStream({
      runId: options.runId,
      afterEventId: replayOffset,
      initialState: runtimeStateRef.current,
      onState: (nextRuntimeState) => {
        if (streamGeneration !== streamGenerationRef.current) {
          return;
        }
        reconnectAttemptRef.current = 0;
        runtimeStateRef.current = nextRuntimeState;
        setRuntimeState(nextRuntimeState);
      },
      onClosed: () => {
        if (streamGeneration !== streamGenerationRef.current) {
          return;
        }
        clearReconnectTimer();
        reconnectAttemptRef.current = 0;
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
      onError: (errorMessage, errorKind) => {
        if (streamGeneration !== streamGenerationRef.current) {
          return;
        }
        refreshRecoverySnapshot(options.sessionId);
        if (errorKind === "transport") {
          scheduleRunStreamReconnect(options, streamGeneration, errorMessage);
          return;
        }
        reconnectAttemptRef.current = 0;
        void message.error(errorMessage);
      },
    });
  };

  const scheduleRunStreamReconnect = (
    options: StartRunStreamOptions,
    streamGeneration: number,
    errorMessage: string,
  ) => {
    if (reconnectAttemptRef.current >= RUN_STREAM_RECONNECT_MAX_ATTEMPTS) {
      reconnectAttemptRef.current = 0;
      clearReconnectTimer();
      stopContinuityRefresh();
      streamHandleRef.current?.close();
      streamHandleRef.current = null;
      setActiveRunId(null);
      void message.error(errorMessage);
      return;
    }
    if (reconnectTimerRef.current !== null) {
      return;
    }
    streamHandleRef.current?.close();
    streamHandleRef.current = null;
    const nextAttempt = reconnectAttemptRef.current + 1;
    reconnectAttemptRef.current = nextAttempt;
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      if (streamGeneration !== streamGenerationRef.current) {
        return;
      }
      openTrackedRunStream(options, streamGeneration);
    }, RUN_STREAM_RECONNECT_DELAY_MS * nextAttempt);
  };

  const startRunStream = (options: StartRunStreamOptions) => {
    streamGenerationRef.current += 1;
    const streamGeneration = streamGenerationRef.current;
    reconnectAttemptRef.current = 0;
    clearReconnectTimer();
    stopContinuityRefresh();
    streamHandleRef.current?.close();
    setActiveRunId(options.runId);
    startContinuityRefresh(options.sessionId);
    openTrackedRunStream(options, streamGeneration);
  };

  return {
    activeRunId,
    clearRunStream,
    startRunStream,
  };
}
