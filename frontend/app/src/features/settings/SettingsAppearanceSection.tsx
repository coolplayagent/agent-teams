import { App, Button, Input, Segmented, Switch, Typography } from "antd";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { useTranslations } from "../../i18n";
import type { AppearanceSettings } from "../../runtime/appearance";
import {
  appearanceChangedEvent,
  applyAppearanceSettings,
  readAppearanceSettings,
  resetAppearanceSettings,
  saveAppearanceSettings,
} from "../../runtime/appearance";
import type { ThemeMode } from "../../runtime/uiStore";
import { SettingsSection } from "./SettingsShared";

interface SettingsAppearanceProps {
  setThemeMode: (themeMode: ThemeMode) => void;
  themeMode: ThemeMode;
}

interface ThemePreset {
  accent: string;
  background: string;
  codeFont: string;
  foreground: string;
  key: string;
  label: string;
  uiFont: string;
}

interface ThemeCard {
  key: ThemeMode;
  label: string;
}

interface SettingsTableRowProps {
  children: ReactNode;
  description?: string;
  label: string;
}

const defaultUiFont = "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
const defaultCodeFont = "ui-monospace, \"SFMono-Regular\", Consolas, monospace";

const themePresets: ThemePreset[] = [
  {
    accent: "#0969DA",
    background: "#FFFFFF",
    codeFont: defaultCodeFont,
    foreground: "#1F2328",
    key: "github",
    label: "GitHub",
    uiFont: defaultUiFont,
  },
  {
    accent: "#339CFF",
    background: "#181818",
    codeFont: defaultCodeFont,
    foreground: "#FFFFFF",
    key: "codex",
    label: "Codex",
    uiFont: defaultUiFont,
  },
  {
    accent: "#2F6F5E",
    background: "#FFFFFF",
    codeFont: defaultCodeFont,
    foreground: "#20231F",
    key: "notion",
    label: "Notion",
    uiFont: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  {
    accent: "#635BFF",
    background: "#FFFFFF",
    codeFont: defaultCodeFont,
    foreground: "#18181B",
    key: "one",
    label: "One",
    uiFont: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  {
    accent: "#4D7C59",
    background: "#FBFCF8",
    codeFont: defaultCodeFont,
    foreground: "#243126",
    key: "proof",
    label: "Proof",
    uiFont: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  {
    accent: "#FF6363",
    background: "#FFFFFF",
    codeFont: defaultCodeFont,
    foreground: "#171717",
    key: "raycast",
    label: "Raycast",
    uiFont: defaultUiFont,
  },
  {
    accent: "#C4A7E7",
    background: "#191724",
    codeFont: defaultCodeFont,
    foreground: "#E0DEF4",
    key: "rose-pine",
    label: "Rose Pine",
    uiFont: defaultUiFont,
  },
  {
    accent: "#268BD2",
    background: "#FDF6E3",
    codeFont: defaultCodeFont,
    foreground: "#073642",
    key: "solarized",
    label: "Solarized",
    uiFont: defaultUiFont,
  },
  {
    accent: "#0070F3",
    background: "#FFFFFF",
    codeFont: defaultCodeFont,
    foreground: "#111111",
    key: "vercel",
    label: "Vercel",
    uiFont: "Geist, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  {
    accent: "#007ACC",
    background: "#1E1E1E",
    codeFont: "Cascadia Mono, ui-monospace, monospace",
    foreground: "#D4D4D4",
    key: "vs-code-plus",
    label: "VS Code Plus",
    uiFont: defaultUiFont,
  },
  {
    accent: "#0A84FF",
    background: "#FFFFFF",
    codeFont: defaultCodeFont,
    foreground: "#1D1D1F",
    key: "xcode",
    label: "Xcode",
    uiFont: "-apple-system, BlinkMacSystemFont, sans-serif",
  },
  {
    accent: "#7AA2F7",
    background: "#1A1B26",
    codeFont: defaultCodeFont,
    foreground: "#C0CAF5",
    key: "tokyo-night",
    label: "Tokyo Night",
    uiFont: defaultUiFont,
  },
];

export function SettingsAppearanceSection({
  setThemeMode,
  themeMode,
}: SettingsAppearanceProps) {
  const { message } = App.useApp();
  const t = useTranslations();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [appearance, setAppearance] = useState(readAppearanceSettings);

  useEffect(() => {
    applyAppearanceSettings(appearance);
  }, [appearance]);

  useEffect(() => {
    const syncAppearance = () => setAppearance(readAppearanceSettings());
    window.addEventListener(appearanceChangedEvent, syncAppearance);
    window.addEventListener("storage", syncAppearance);
    return () => {
      window.removeEventListener(appearanceChangedEvent, syncAppearance);
      window.removeEventListener("storage", syncAppearance);
    };
  }, []);

  const activePresetKey = appearance.themePreset || defaultPresetKey(themeMode);
  const contrastValue = appearance.contrast > 0 ? appearance.contrast : 45;
  const uiFontSize = appearance.uiFontSize > 0 ? appearance.uiFontSize : 14;
  const codeFontSize = appearance.codeFontSize > 0 ? appearance.codeFontSize : 12;
  const lineHeightValue = appearance.lineHeight > 0 ? appearance.lineHeight : 148;
  const messageDensityValue =
    appearance.messageDensity > 0 ? appearance.messageDensity : 85;
  const activeThemeLabel = themeLabel(themeMode, t);
  const themeCards: ThemeCard[] = [
    { key: "system", label: t("settingsAppearanceThemeSystem") },
    { key: "light", label: t("settingsThemeLight") },
    { key: "dark", label: t("settingsThemeDark") },
  ];

  function updateAppearance<K extends keyof AppearanceSettings>(
    key: K,
    value: AppearanceSettings[K],
  ): void {
    setAppearance((current) => {
      const next = { ...current, [key]: value };
      saveAppearanceSettings(next);
      return next;
    });
  }

  function applyPreset(key: string): void {
    const preset = themePresets.find((candidate) => candidate.key === key);
    if (preset === undefined) {
      return;
    }
    setAppearance((current) => {
      const next: AppearanceSettings = {
        ...current,
        accent: preset.accent,
        background: preset.background,
        codeFont: preset.codeFont,
        foreground: preset.foreground,
        themePreset: preset.key,
        uiFont: preset.uiFont,
      };
      saveAppearanceSettings(next);
      return next;
    });
  }

  function selectThemeMode(nextThemeMode: ThemeMode): void {
    setThemeMode(nextThemeMode);
    applyPreset(defaultPresetKey(nextThemeMode));
  }

  async function copyTheme(): Promise<void> {
    const payload = JSON.stringify(appearance, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      void message.success(t("settingsAppearanceCopied"));
    } catch {
      fallbackCopy(payload);
      void message.success(t("settingsAppearanceCopied"));
    }
  }

  async function importTheme(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const next = importedAppearanceSettings(parsed, appearance);
      setAppearance(next);
      saveAppearanceSettings(next);
      void message.success(t("settingsAppearanceImported"));
    } catch {
      void message.error(t("settingsAppearanceImportFailed"));
    }
  }

  function resetAppearance(): void {
    resetAppearanceSettings();
    setAppearance(readAppearanceSettings());
    void message.success(t("settingsAppearanceReset"));
  }

  return (
    <SettingsSection title={t("settingsAppearance")}>
      <div className="at-appearance-page">
        <div className="at-appearance-theme-grid" role="list">
          {themeCards.map((card) => (
            <button
              aria-pressed={themeMode === card.key}
              className={
                themeMode === card.key
                  ? "at-appearance-theme-card is-selected"
                  : "at-appearance-theme-card"
              }
              key={card.key}
              onClick={() => selectThemeMode(card.key)}
              type="button"
            >
              <ThemePreview kind={card.key} />
              <span>{card.label}</span>
            </button>
          ))}
        </div>

        <DiffPreview />

        <div className="at-appearance-panel">
          <div className="at-appearance-panel-header">
            <Typography.Text strong>{activeThemeLabel}</Typography.Text>
            <div className="at-appearance-panel-actions">
              <Button onClick={() => importInputRef.current?.click()} type="text">
                {t("settingsAppearanceImport")}
              </Button>
              <Button onClick={() => void copyTheme()} type="text">
                {t("settingsAppearanceCopyTheme")}
              </Button>
              <label className="at-appearance-preset-select">
                <span aria-hidden="true" className="at-appearance-preset-icon">
                  Aa
                </span>
                <select
                  aria-label={t("settingsAppearanceThemePreset")}
                  onChange={(event) => applyPreset(event.target.value)}
                  value={activePresetKey}
                >
                  {themePresets.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
              <input
                accept="application/json"
                className="at-appearance-import-input"
                onChange={(event) => void importTheme(event)}
                ref={importInputRef}
                type="file"
              />
            </div>
          </div>

          <SettingsTableRow label={t("settingsAppearanceAccent")}>
            <ColorPill
              fallback="#0969DA"
              label={t("settingsAppearanceAccentValue")}
              onChange={(value) => updateAppearance("accent", value)}
              tone="accent"
              value={appearance.accent}
            />
          </SettingsTableRow>
          <SettingsTableRow label={t("settingsAppearanceBackground")}>
            <ColorPill
              fallback={themeMode === "dark" ? "#181818" : "#FFFFFF"}
              label={t("settingsAppearanceBackgroundValue")}
              onChange={(value) => updateAppearance("background", value)}
              tone="background"
              value={appearance.background}
            />
          </SettingsTableRow>
          <SettingsTableRow label={t("settingsAppearanceForeground")}>
            <ColorPill
              fallback={themeMode === "dark" ? "#FFFFFF" : "#1F2328"}
              label={t("settingsAppearanceForegroundValue")}
              onChange={(value) => updateAppearance("foreground", value)}
              tone="foreground"
              value={appearance.foreground}
            />
          </SettingsTableRow>
          <SettingsTableRow label={t("settingsAppearanceUiFont")}>
            <Input
              aria-label={t("settingsAppearanceUiFont")}
              className="at-appearance-text-pill"
              onChange={(event) => updateAppearance("uiFont", event.target.value)}
              placeholder={defaultUiFont}
              value={appearance.uiFont}
            />
          </SettingsTableRow>
          <SettingsTableRow label={t("settingsAppearanceCodeFont")}>
            <Input
              aria-label={t("settingsAppearanceCodeFont")}
              className="at-appearance-text-pill"
              onChange={(event) => updateAppearance("codeFont", event.target.value)}
              placeholder={defaultCodeFont}
              value={appearance.codeFont}
            />
          </SettingsTableRow>
          <SettingsTableRow label={t("settingsAppearanceTranslucentSidebar")}>
            <Switch
              aria-label={t("settingsAppearanceTranslucentSidebar")}
              checked={appearance.translucentSidebar}
              onChange={(checked) => updateAppearance("translucentSidebar", checked)}
            />
          </SettingsTableRow>
          <SettingsTableRow label={t("settingsAppearanceContrast")}>
            <div className="at-appearance-inline-range">
              <input
                aria-label={t("settingsAppearanceContrast")}
                max={80}
                min={20}
                onChange={(event) => updateAppearance("contrast", Number(event.target.value))}
                type="range"
                value={contrastValue}
              />
              <output>{contrastValue}</output>
            </div>
          </SettingsTableRow>
        </div>

        <div className="at-appearance-panel">
          <SettingsTableRow
            description={t("settingsAppearancePointerCursorHelp")}
            label={t("settingsAppearancePointerCursor")}
          >
            <Switch
              aria-label={t("settingsAppearancePointerCursor")}
              checked={appearance.pointerCursor}
              onChange={(checked) => updateAppearance("pointerCursor", checked)}
            />
          </SettingsTableRow>
          <SettingsTableRow
            description={t("settingsAppearanceReduceMotionHelp")}
            label={t("settingsAppearanceReduceMotion")}
          >
            <Segmented
              onChange={(value) =>
                updateAppearance("motion", value as AppearanceSettings["motion"])
              }
              options={[
                { label: t("settingsAppearanceMotionSystem"), value: "system" },
                { label: t("settingsAppearanceMotionOn"), value: "reduce" },
                { label: t("settingsAppearanceMotionOff"), value: "full" },
              ]}
              value={appearance.motion}
            />
          </SettingsTableRow>
          <SettingsTableRow
            description={t("settingsAppearanceUiFontSizeHelp")}
            label={t("settingsAppearanceUiFontSize")}
          >
            <NumberPill
              label={t("settingsAppearanceUiFontSize")}
              max={20}
              min={11}
              onChange={(value) => updateAppearance("uiFontSize", value)}
              unit="px"
              value={uiFontSize}
            />
          </SettingsTableRow>
          <SettingsTableRow
            description={t("settingsAppearanceCodeFontSizeHelp")}
            label={t("settingsAppearanceCodeFontSize")}
          >
            <NumberPill
              label={t("settingsAppearanceCodeFontSize")}
              max={18}
              min={10}
              onChange={(value) => updateAppearance("codeFontSize", value)}
              unit="px"
              value={codeFontSize}
            />
          </SettingsTableRow>
          <SettingsTableRow label={t("settingsAppearanceLineHeight")}>
            <div className="at-appearance-inline-range">
              <input
                aria-label={t("settingsAppearanceLineHeight")}
                max={180}
                min={120}
                onChange={(event) =>
                  updateAppearance("lineHeight", Number(event.target.value))
                }
                type="range"
                value={lineHeightValue}
              />
              <output>{formatRatio(lineHeightValue)}</output>
            </div>
          </SettingsTableRow>
          <SettingsTableRow label={t("settingsAppearanceMessageDensity")}>
            <div className="at-appearance-inline-range">
              <input
                aria-label={t("settingsAppearanceMessageDensity")}
                max={130}
                min={60}
                onChange={(event) =>
                  updateAppearance("messageDensity", Number(event.target.value))
                }
                type="range"
                value={messageDensityValue}
              />
              <output>{formatRatio(messageDensityValue)}</output>
            </div>
          </SettingsTableRow>
          <SettingsTableRow
            description={t("settingsAppearanceDiffMarkerHelp")}
            label={t("settingsAppearanceDiffMarkers")}
          >
            <Segmented
              onChange={(value) =>
                updateAppearance("diffMarker", value as AppearanceSettings["diffMarker"])
              }
              options={[
                { label: t("settingsAppearanceDiffMarkerColor"), value: "color" },
                { label: "+/-", value: "sign" },
              ]}
              value={appearance.diffMarker}
            />
          </SettingsTableRow>
        </div>

        <div className="at-appearance-footer">
          <Button onClick={resetAppearance}>{t("settingsAppearanceReset")}</Button>
        </div>
      </div>
    </SettingsSection>
  );
}

function ThemePreview({ kind }: { kind: ThemeMode }) {
  return (
    <span className={`at-appearance-theme-preview is-${kind}`} aria-hidden="true">
      <span className="at-appearance-preview-window">
        <span />
        <span />
        <span />
      </span>
      <span className="at-appearance-preview-lines">
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}

function DiffPreview() {
  return (
    <div className="at-appearance-diff-preview" aria-hidden="true">
      <div className="at-appearance-diff-side is-deleted">
        <CodeLine lineNumber={1} text="const themePreview: ThemeConfig = {" />
        <CodeLine marker="-" lineNumber={2} text={'surface: "sidebar",'} />
        <CodeLine marker="-" lineNumber={3} text={'accent: "#2563eb",'} />
        <CodeLine marker="-" lineNumber={4} text="contrast: 42," />
        <CodeLine lineNumber={5} text="};" />
      </div>
      <div className="at-appearance-diff-side is-added">
        <CodeLine lineNumber={1} text="const themePreview: ThemeConfig = {" />
        <CodeLine marker="+" lineNumber={2} text={'surface: "sidebar-elevated",'} />
        <CodeLine marker="+" lineNumber={3} text={'accent: "#0ea5e9",'} />
        <CodeLine marker="+" lineNumber={4} text="contrast: 68," />
        <CodeLine lineNumber={5} text="};" />
      </div>
    </div>
  );
}

function CodeLine({
  lineNumber,
  marker,
  text,
}: {
  lineNumber: number;
  marker?: "+" | "-";
  text: string;
}) {
  return (
    <div className={marker === undefined ? "at-appearance-code-line" : "at-appearance-code-line is-marked"}>
      <span>{lineNumber}</span>
      <span>{marker ?? ""}</span>
      <code>{text}</code>
    </div>
  );
}

function SettingsTableRow({
  children,
  description,
  label,
}: SettingsTableRowProps) {
  return (
    <div className="at-appearance-table-row">
      <div className="at-appearance-row-copy">
        <Typography.Text strong>{label}</Typography.Text>
        {description !== undefined ? (
          <Typography.Text className="at-settings-help">{description}</Typography.Text>
        ) : null}
      </div>
      <div className="at-appearance-row-control">{children}</div>
    </div>
  );
}

function ColorPill({
  fallback,
  label,
  onChange,
  tone,
  value,
}: {
  fallback: string;
  label: string;
  onChange: (value: string) => void;
  tone: "accent" | "background" | "foreground";
  value: string;
}) {
  const displayValue = colorInputValue(value, fallback);
  const style = {
    "--at-appearance-pill-bg": tone === "background" ? "var(--at-surface)" : displayValue,
    "--at-appearance-pill-text": tone === "foreground" ? "#ffffff" : "var(--at-text)",
  } as CSSProperties;
  return (
    <label className={`at-appearance-color-pill is-${tone}`} style={style}>
      <input
        aria-label={`${label} swatch`}
        onChange={(event) => onChange(event.target.value)}
        type="color"
        value={displayValue}
      />
      <Input
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        value={value || fallback}
      />
    </label>
  );
}

function NumberPill({
  label,
  max,
  min,
  onChange,
  unit,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  unit: string;
  value: number;
}) {
  return (
    <label className="at-appearance-number-pill">
      <Input
        aria-label={label}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
      <span>{unit}</span>
    </label>
  );
}

function defaultPresetKey(themeMode: ThemeMode): string {
  return themeMode === "dark" ? "codex" : "github";
}

function themeLabel(themeMode: ThemeMode, t: ReturnType<typeof useTranslations>): string {
  if (themeMode === "dark") {
    return t("settingsAppearanceDarkTheme");
  }
  if (themeMode === "system") {
    return t("settingsAppearanceSystemTheme");
  }
  return t("settingsAppearanceLightTheme");
}

function colorInputValue(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value : fallback;
}

function formatRatio(value: number): string {
  return (value / 100).toFixed(2);
}

function fallbackCopy(value: string): void {
  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

function importedAppearanceSettings(
  value: unknown,
  current: AppearanceSettings,
): AppearanceSettings {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid appearance theme.");
  }
  const record = value as Partial<AppearanceSettings>;
  return {
    ...current,
    accent: typeof record.accent === "string" ? record.accent : current.accent,
    background:
      typeof record.background === "string" ? record.background : current.background,
    codeFont: typeof record.codeFont === "string" ? record.codeFont : current.codeFont,
    codeFontSize:
      typeof record.codeFontSize === "number" ? record.codeFontSize : current.codeFontSize,
    contrast: typeof record.contrast === "number" ? record.contrast : current.contrast,
    diffMarker:
      record.diffMarker === "sign" || record.diffMarker === "color"
        ? record.diffMarker
        : current.diffMarker,
    foreground:
      typeof record.foreground === "string" ? record.foreground : current.foreground,
    lineHeight:
      typeof record.lineHeight === "number" ? record.lineHeight : current.lineHeight,
    messageDensity:
      typeof record.messageDensity === "number"
        ? record.messageDensity
        : current.messageDensity,
    motion:
      record.motion === "system" || record.motion === "reduce" || record.motion === "full"
        ? record.motion
        : current.motion,
    pointerCursor:
      typeof record.pointerCursor === "boolean"
        ? record.pointerCursor
        : current.pointerCursor,
    themePreset:
      typeof record.themePreset === "string" ? record.themePreset : current.themePreset,
    showDiagnostics:
      typeof record.showDiagnostics === "boolean"
        ? record.showDiagnostics
        : current.showDiagnostics,
    translucentSidebar:
      typeof record.translucentSidebar === "boolean"
        ? record.translucentSidebar
        : current.translucentSidebar,
    uiFont: typeof record.uiFont === "string" ? record.uiFont : current.uiFont,
    uiFontSize:
      typeof record.uiFontSize === "number" ? record.uiFontSize : current.uiFontSize,
  };
}
