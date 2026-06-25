import { create } from "zustand";

export type ThemeMode = "system" | "light" | "dark";
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

export const sidebarWidthDefault = 260;
export const sidebarWidthMin = 220;
export const sidebarWidthMax = 320;
export const sidebarWidthStorageKey = "agentTeams.sidebarWidth";
export const sidebarWidthMigrationStorageKey = "agentTeams.sidebarWidthMigratedTo260";
export const themeModeStorageKey = "agentTeams.themeMode";
export const legacyThemeStorageKey = "agent_teams_theme";

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
    window.localStorage.setItem(sidebarWidthStorageKey, String(nextWidth));
    window.localStorage.setItem(sidebarWidthMigrationStorageKey, "true");
    set({ sidebarWidth: nextWidth });
  },
  setThemeMode: (mode) => {
    window.localStorage.setItem(themeModeStorageKey, mode);
    syncLegacyThemeMode(mode);
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
  const raw = window.localStorage.getItem(sidebarWidthStorageKey);
  if (raw === null) {
    return sidebarWidthDefault;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return sidebarWidthDefault;
  }
  if (legacyGeneratedSidebarWidth(parsed) && !sidebarWidthMigrationApplied()) {
    window.localStorage.setItem(sidebarWidthStorageKey, String(sidebarWidthDefault));
    window.localStorage.setItem(sidebarWidthMigrationStorageKey, "true");
    return sidebarWidthDefault;
  }
  return Math.min(sidebarWidthMax, Math.max(sidebarWidthMin, parsed));
}

function legacyGeneratedSidebarWidth(width: number): boolean {
  return width === 220 || width === 248 || width === 274 || width === 280;
}

function sidebarWidthMigrationApplied(): boolean {
  return window.localStorage.getItem(sidebarWidthMigrationStorageKey) === "true";
}

function storedThemeMode(): ThemeMode {
  const raw = window.localStorage.getItem(themeModeStorageKey);
  if (raw === "system" || raw === "light" || raw === "dark") {
    return raw;
  }
  const legacyRaw = window.localStorage.getItem(legacyThemeStorageKey);
  if (legacyRaw === "light" || legacyRaw === "dark") {
    return legacyRaw;
  }
  return "dark";
}

function syncLegacyThemeMode(mode: ThemeMode): void {
  if (mode === "system") {
    window.localStorage.setItem(
      legacyThemeStorageKey,
      window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    );
    return;
  }
  window.localStorage.setItem(legacyThemeStorageKey, mode);
}

function storedLanguage(): Language {
  const raw = window.localStorage.getItem("agentTeams.language");
  if (raw === "zh-CN" || raw === "en") {
    return raw;
  }
  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}
