import React from "react";
import ReactDOM from "react-dom/client";

import { AppProviders } from "./app/AppProviders";
import { AgentTeamsApp } from "./app/AgentTeamsApp";
import { markBootstrapReady } from "./app/bootstrapState";
import { applyAppearanceSettings, readAppearanceSettings } from "./runtime/appearance";
import { applyDocumentThemeMode, resolveThemeMode } from "./runtime/themeMode";
import { useUiStore } from "./runtime/uiStore";
import "./styles/feedback.css";
import "./styles/theme.css";
import "./styles/scrollbars.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Missing application root element.");
}

const initialThemeMode = useUiStore.getState().themeMode;
const initialResolvedThemeMode = resolveThemeMode(initialThemeMode);
applyDocumentThemeMode(initialThemeMode, initialResolvedThemeMode);
applyAppearanceSettings(readAppearanceSettings(), initialResolvedThemeMode);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AppProviders>
      <AgentTeamsApp />
    </AppProviders>
  </React.StrictMode>,
);

markBootstrapReady();
