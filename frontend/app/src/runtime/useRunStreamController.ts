import { App } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { openRunStream, type RunStreamHandle } from "./streamClient";
import { useRuntimeStore } from "./runtimeStore";

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
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  useEffect(() => {
    runtimeStateRef.current = runtimeState;
  }, [runtimeState]);

  useEffect(
    () => () => {
      streamHandleRef.current?.close();
    },
    [],
  );

  const clearRunStream = () => {
    streamHandleRef.current?.close();
    streamHandleRef.current = null;
    setActiveRunId(null);
  };

  const startRunStream = (options: StartRunStreamOptions) => {
    streamHandleRef.current?.close();
    const replayOffset = Math.max(
      runtimeStateRef.current.runs[options.runId]?.lastEventId ?? 0,
      options.afterEventId ?? 0,
    );
    setActiveRunId(options.runId);
    streamHandleRef.current = openRunStream({
      runId: options.runId,
      afterEventId: replayOffset,
      initialState: runtimeStateRef.current,
      onState: (nextRuntimeState) => {
        runtimeStateRef.current = nextRuntimeState;
        setRuntimeState(nextRuntimeState);
      },
      onClosed: () => {
        setActiveRunId(null);
        streamHandleRef.current = null;
        void queryClient.invalidateQueries({
          queryKey: ["sessions", options.sessionId, "messages"],
        });
        void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
        void queryClient.invalidateQueries({
          queryKey: ["sessions", options.sessionId, "recovery"],
        });
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
