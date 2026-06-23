import { create } from "zustand";

import { initialRuntimeState, type RuntimeState } from "./reducers";

interface RuntimeStoreState {
  runtimeState: RuntimeState;
  setRuntimeState: (runtimeState: RuntimeState) => void;
  resetRuntimeState: () => void;
}

export const useRuntimeStore = create<RuntimeStoreState>((set) => ({
  runtimeState: initialRuntimeState,
  setRuntimeState: (runtimeState) => set({ runtimeState }),
  resetRuntimeState: () => set({ runtimeState: initialRuntimeState }),
}));
