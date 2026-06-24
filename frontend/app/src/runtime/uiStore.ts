import { create } from "zustand";

export type ThemeMode = "light" | "dark";
export type Language = "en" | "zh-CN";

interface UiState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  themeMode: ThemeMode;
  language: Language;
  selectedSessionId: string | null;
  selectedWorkspaceId: string | null;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setLanguage: (language: Language) => void;
  setSelectedSessionId: (sessionId: string | null) => void;
  setSelectedWorkspaceId: (workspaceId: string | null) => void;
}

export const sidebarWidthDefault = 274;
export const sidebarWidthMin = 220;
export const sidebarWidthMax = 360;

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  sidebarWidth: storedSidebarWidth(),
  themeMode: storedThemeMode(),
  language: storedLanguage(),
  selectedSessionId: window.localStorage.getItem("agentTeams.selectedSessionId"),
  selectedWorkspaceId: window.localStorage.getItem("agentTeams.selectedWorkspaceId"),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setSidebarWidth: (width) => {
    const nextWidth = Math.min(sidebarWidthMax, Math.max(sidebarWidthMin, width));
    window.localStorage.setItem("agentTeams.sidebarWidth", String(nextWidth));
    set({ sidebarWidth: nextWidth });
  },
  setThemeMode: (mode) => {
    window.localStorage.setItem("agentTeams.themeMode", mode);
    set({ themeMode: mode });
  },
  setLanguage: (language) => {
    window.localStorage.setItem("agentTeams.language", language);
    set({ language });
  },
  setSelectedSessionId: (sessionId) => {
    if (sessionId === null) {
      window.localStorage.removeItem("agentTeams.selectedSessionId");
    } else {
      window.localStorage.setItem("agentTeams.selectedSessionId", sessionId);
    }
    set({ selectedSessionId: sessionId });
  },
  setSelectedWorkspaceId: (workspaceId) => {
    if (workspaceId === null) {
      window.localStorage.removeItem("agentTeams.selectedWorkspaceId");
    } else {
      window.localStorage.setItem("agentTeams.selectedWorkspaceId", workspaceId);
    }
    set({ selectedWorkspaceId: workspaceId });
  },
}));

function storedSidebarWidth(): number {
  const raw = window.localStorage.getItem("agentTeams.sidebarWidth");
  if (raw === null) {
    return sidebarWidthDefault;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return sidebarWidthDefault;
  }
  if (parsed === 220 || parsed === 280) {
    return sidebarWidthDefault;
  }
  return Math.min(sidebarWidthMax, Math.max(sidebarWidthMin, parsed));
}

function storedThemeMode(): ThemeMode {
  const raw = window.localStorage.getItem("agentTeams.themeMode");
  if (raw === "light" || raw === "dark") {
    return raw;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function storedLanguage(): Language {
  const raw = window.localStorage.getItem("agentTeams.language");
  if (raw === "zh-CN" || raw === "en") {
    return raw;
  }
  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}
