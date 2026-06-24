export type AppearanceMotionMode = "system" | "reduce" | "full";
export type AppearanceDiffMarkerMode = "color" | "sign";

export interface AppearanceSettings {
  themePreset: string;
  accent: string;
  background: string;
  foreground: string;
  uiFont: string;
  codeFont: string;
  uiFontSize: number;
  codeFontSize: number;
  lineHeight: number;
  messageDensity: number;
  translucentSidebar: boolean;
  contrast: number;
  pointerCursor: boolean;
  motion: AppearanceMotionMode;
  diffMarker: AppearanceDiffMarkerMode;
  showDiagnostics: boolean;
}

export const appearanceStorageKey = "agent_teams_appearance";
export const appearanceChangedEvent = "agent-teams-appearance-changed";

export const defaultAppearanceSettings: AppearanceSettings = {
  themePreset: "",
  accent: "",
  background: "",
  foreground: "",
  uiFont: "",
  codeFont: "",
  uiFontSize: 0,
  codeFontSize: 0,
  lineHeight: 0,
  messageDensity: 0,
  translucentSidebar: false,
  contrast: 0,
  pointerCursor: false,
  motion: "system",
  diffMarker: "color",
  showDiagnostics: false,
};

export function readAppearanceSettings(): AppearanceSettings {
  const raw = window.localStorage.getItem(appearanceStorageKey);
  if (raw === null) {
    return { ...defaultAppearanceSettings };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return { ...defaultAppearanceSettings };
    }
    return {
      themePreset: readString(parsed, "themePreset"),
      accent: readString(parsed, "accent"),
      background: readString(parsed, "background"),
      foreground: readString(parsed, "foreground"),
      uiFont: readString(parsed, "uiFont"),
      codeFont: readString(parsed, "codeFont"),
      uiFontSize: readNumber(parsed, "uiFontSize"),
      codeFontSize: readNumber(parsed, "codeFontSize"),
      lineHeight: readNumber(parsed, "lineHeight"),
      messageDensity: readNumber(parsed, "messageDensity"),
      translucentSidebar: readBoolean(parsed, "translucentSidebar"),
      contrast: readNumber(parsed, "contrast"),
      pointerCursor: readBoolean(parsed, "pointerCursor"),
      motion: readMotionMode(parsed),
      diffMarker: readDiffMarkerMode(parsed),
      showDiagnostics: readBoolean(parsed, "showDiagnostics"),
    };
  } catch {
    return { ...defaultAppearanceSettings };
  }
}

export function saveAppearanceSettings(settings: AppearanceSettings): void {
  window.localStorage.setItem(appearanceStorageKey, JSON.stringify(settings));
  applyAppearanceSettings(settings);
  window.dispatchEvent(new Event(appearanceChangedEvent));
}

export function resetAppearanceSettings(): void {
  window.localStorage.removeItem(appearanceStorageKey);
  applyAppearanceSettings(defaultAppearanceSettings);
  window.dispatchEvent(new Event(appearanceChangedEvent));
}

export function applyAppearanceSettings(settings: AppearanceSettings): void {
  const root = document.documentElement;
  const accent = settings.accent.trim();
  const background = settings.background.trim();
  const foreground = settings.foreground.trim();
  const uiFont = settings.uiFont.trim();
  const codeFont = settings.codeFont.trim();

  setStyle(root, "--primary", accent);
  setStyle(root, "--primary-hover", accent === "" ? "" : lightenColor(accent, 0.15));
  setStyle(root, "--at-primary", accent);
  setStyle(root, "--at-accent", accent);

  setStyle(root, "--bg-base", background);
  setStyle(root, "--bg-surface", background);
  setStyle(root, "--at-bg", background);
  setStyle(root, "--at-surface", background);
  setStyle(root, "--at-sidebar", background);
  setStyle(root, "--at-topbar", background);

  setStyle(root, "--text-primary", foreground);
  setStyle(root, "--text-msg-content", foreground);
  setStyle(root, "--at-text", foreground);

  setStyle(root, "--font-ui", uiFont);
  setStyle(root, "--at-font-ui", uiFont);
  setStyle(root, "--font-mono", codeFont);
  setStyle(root, "--at-font-mono", codeFont);

  setStyle(root, "--ui-font-size", pixelValue(settings.uiFontSize));
  setStyle(root, "--at-ui-font-size", pixelValue(settings.uiFontSize));
  setStyle(root, "--code-font-size", pixelValue(settings.codeFontSize));
  setStyle(root, "--at-code-font-size", pixelValue(settings.codeFontSize));
  setStyle(root, "--msg-line-height", ratioValue(settings.lineHeight));
  setStyle(root, "--at-message-line-height", ratioValue(settings.lineHeight));
  setStyle(root, "--msg-gap", remValue(settings.messageDensity));
  setStyle(root, "--at-message-gap", remValue(settings.messageDensity));
  setStyle(root, "--at-contrast-filter", contrastFilter(settings.contrast));

  setDatasetFlag(root, "translucentSidebar", settings.translucentSidebar);
  setDatasetFlag(root, "pointerCursor", settings.pointerCursor);
  root.dataset.motion = settings.motion;
  root.dataset.diffMarker = settings.diffMarker;

  if (settings.showDiagnostics) {
    root.dataset.diagnosticsVisible = "true";
  } else {
    delete root.dataset.diagnosticsVisible;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: keyof AppearanceSettings): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function readNumber(record: Record<string, unknown>, key: keyof AppearanceSettings): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readBoolean(record: Record<string, unknown>, key: keyof AppearanceSettings): boolean {
  const value = record[key];
  return typeof value === "boolean" ? value : false;
}

function readMotionMode(record: Record<string, unknown>): AppearanceMotionMode {
  const value = record.motion;
  if (value === "reduce" || value === "full" || value === "system") {
    return value;
  }
  return "system";
}

function readDiffMarkerMode(record: Record<string, unknown>): AppearanceDiffMarkerMode {
  const value = record.diffMarker;
  if (value === "sign" || value === "color") {
    return value;
  }
  return "color";
}

function setStyle(root: HTMLElement, property: string, value: string): void {
  if (value === "") {
    root.style.removeProperty(property);
    return;
  }
  root.style.setProperty(property, value);
}

function pixelValue(value: number): string {
  return value > 0 ? `${value}px` : "";
}

function ratioValue(value: number): string {
  return value > 0 ? (value / 100).toFixed(2) : "";
}

function remValue(value: number): string {
  return value > 0 ? `${(value / 100).toFixed(2)}rem` : "";
}

function contrastFilter(value: number): string {
  if (value <= 0 || value === 45) {
    return "";
  }
  const ratio = 1 + (Math.min(80, Math.max(20, value)) - 45) / 100;
  return `contrast(${ratio.toFixed(2)})`;
}

function setDatasetFlag(root: HTMLElement, key: string, enabled: boolean): void {
  if (enabled) {
    root.dataset[key] = "true";
    return;
  }
  delete root.dataset[key];
}

function lightenColor(color: string, amount: number): string {
  const normalized = normalizeHexColor(color);
  if (normalized === null) {
    return color;
  }
  const hex = normalized.slice(1);
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return `#${lightenByte(red, amount)}${lightenByte(green, amount)}${lightenByte(blue, amount)}`;
}

function lightenByte(value: number, amount: number): string {
  const next = Math.round(value + (255 - value) * amount);
  return Math.max(0, Math.min(255, next)).toString(16).padStart(2, "0");
}

function normalizeHexColor(color: string): string | null {
  const trimmed = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const red = trimmed[1];
    const green = trimmed[2];
    const blue = trimmed[3];
    return `#${red}${red}${green}${green}${blue}${blue}`;
  }
  return null;
}
