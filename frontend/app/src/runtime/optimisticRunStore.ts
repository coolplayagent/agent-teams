import { create } from "zustand";

export interface OptimisticRunPrompt {
  createdAt: string;
  id: string;
  runId?: string;
  sessionId: string;
  text: string;
}

interface OptimisticRunState {
  prompts: Record<string, OptimisticRunPrompt>;
  beginPrompt: (sessionId: string, text: string) => string;
  confirmPrompt: (sessionId: string, promptId: string, runId: string) => void;
  finishPrompt: (sessionId: string, promptId: string) => void;
}

let optimisticPromptSequence = 0;

export const useOptimisticRunStore = create<OptimisticRunState>((set) => ({
  prompts: {},
  beginPrompt: (sessionId, text) => {
    optimisticPromptSequence += 1;
    const id = `optimistic-run-${optimisticPromptSequence}`;
    set((state) => ({
      prompts: {
        ...state.prompts,
        [sessionId]: {
          createdAt: new Date().toISOString(),
          id,
          sessionId,
          text,
        },
      },
    }));
    return id;
  },
  confirmPrompt: (sessionId, promptId, runId) => {
    set((state) => {
      const prompt = state.prompts[sessionId];
      if (prompt?.id !== promptId) {
        return state;
      }
      return {
        prompts: {
          ...state.prompts,
          [sessionId]: { ...prompt, runId },
        },
      };
    });
  },
  finishPrompt: (sessionId, promptId) => {
    set((state) => {
      if (state.prompts[sessionId]?.id !== promptId) {
        return state;
      }
      const prompts = { ...state.prompts };
      delete prompts[sessionId];
      return { prompts };
    });
  },
}));
