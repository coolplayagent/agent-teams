import { create } from "zustand";

export type ThemeMode = "light" | "dark";
export type Language = "en" | "zh-CN";

interface UiState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  themeMode: ThemeMode;
  language: Language;
  selectedSessionId: string | null;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setLanguage: (language: Language) => void;
  setSelectedSessionId: (sessionId: string | null) => void;
}

const sidebarWidthMin = 220;
const sidebarWidthMax = 360;

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  sidebarWidth: storedNumber("agentTeams.sidebarWidth", 280),
  themeMode: storedThemeMode(),
  language: storedLanguage(),
  selectedSessionId: window.localStorage.getItem("agentTeams.selectedSessionId"),
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
}));

function storedNumber(key: string, fallback: number): number {
  const raw = window.localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  return raw === "zh-CN" ? "zh-CN" : "en";
}
