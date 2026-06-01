/**
 * app/bootstrap.js
 * UI bindings and application startup sequence.
 */
import { initSettings, openSettings, initAppearanceOnStartup } from "../components/settings.js";
import { initializeProjectView } from "../components/projectView.js";
import { initializeSpecLineage, openSpecLineage, getTaskIdFromUrl } from "../components/specLineage.js";
import { openNewSessionDraft } from "../components/newSessionDraft.js";
import { initializeContextIndicators } from "../components/contextIndicators.js";
import { initializeSessionTokenUsage } from "../components/sessionTokenUsage.js";
import { initializeSessionDebugBadge } from "../components/sessionDebugBadge.js";
import { initializeSubagentRail } from "../components/subagentRail.js";
import { initializeObservability } from "../components/observability.js";
import { initializeImagePreview } from "../components/imagePreview.js";
import { initializeMessageExport } from "../components/messageExport.js";
import { initializeVoiceInput } from "../components/voiceInput.js";
import {
  handleNewProjectClick,
  loadProjects,
  toggleProjectSortMode,
} from "../components/sidebar.js";
import { state } from "../core/state.js";
import { setupNavbarBindings } from "../components/navbar.js";
import { initBackendStatusMonitor } from "../utils/backendStatus.js";
import { initUiFeedback } from "../utils/feedback.js";
import { initializeLanguage, toggleLanguage, t } from "../utils/i18n.js";
import { resumeRecoverableRun } from "./recovery.js";
import {
  handlePromptComposerInput,
  handlePromptComposerKeydown,
  handlePromptComposerPaste,
  handleRuntimeForceInject,
  initializeSessionTopologyControls,
  initializePromptMentionAutocomplete,
  initializeThinkingControls,
  initializeYoloToggle,
} from "./prompt.js";
import { requestStopCurrentRun } from "../core/stream.js";
import { els } from "../utils/dom.js";
import {
  errorToPayload,
  installGlobalErrorLogging,
  logInfo,
  logError,
  sysLog,
} from "../utils/logger.js";

export function setupEventBindings(handleSend) {
  els.promptInput.addEventListener("input", () => {
    els.promptInput.style.height = "auto";
    els.promptInput.style.height = `${els.promptInput.scrollHeight}px`;
    handlePromptComposerInput();
  });
  els.promptInput.addEventListener("keydown", (e) => {
    if (handlePromptComposerKeydown(e)) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  });
  els.promptInput.addEventListener("paste", (event) => {
    void handlePromptComposerPaste(event);
  });
  if (els.chatForm) {
    els.chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      void handleSend();
    });
  }
  if (els.stopBtn) {
    els.stopBtn.onclick = async () => {
      try {
        const requested = await requestStopCurrentRun();
        if (!requested) {
          return;
        }
      } catch (e) {
        sysLog(`Stop failed: ${e.message}`, "log-error");
      }
    };
  }
  document.addEventListener("agent-teams-force-inject-requested", (event) => {
    const runId = String(event?.detail?.runId || "").trim();
    void handleRuntimeForceInject(runId);
  });
  document.addEventListener("run-approval-resolved", (event) => {
    const runId = event?.detail?.runId;
    if (!runId || typeof runId !== "string") return;
    void resumeRecoverableRun(runId, {
      sessionId: state.currentSessionId,
      reason: "tool approval resolved",
      quiet: true,
    });
  });
}

function setupSettingsButton() {
  const languageToggleBtn = document.getElementById("language-toggle-btn");
  const settingsBtn = document.getElementById("settings-btn");
  if (languageToggleBtn) {
    languageToggleBtn.onclick = () => {
      void toggleLanguage();
    };
  }
  if (settingsBtn) {
    settingsBtn.onclick = openSettings;
  }
}

export async function initApp(selectSession, selectSubagentSession, handleSend) {
  document.body.dataset.bootstrapState = "loading";
  installGlobalErrorLogging();
  try {
    logInfo("frontend.bootstrap.started", "Frontend bootstrap started");
    await initializeLanguage();
    sysLog(t("app.system_initialized"));
    initUiFeedback();
    initBackendStatusMonitor();
    setupNavbarBindings();
    initializeYoloToggle();
    initializeThinkingControls();
    const sessionTopologyControlsReady = initializeSessionTopologyControls().catch((error) => {
      logError(
        "frontend.bootstrap.session_topology_failed",
        "Session topology controls failed during startup.",
        errorToPayload(error),
      );
    });
    initializePromptMentionAutocomplete();
    initializeContextIndicators();
    initializeSessionTokenUsage();
    initializeSessionDebugBadge();
    initializeSubagentRail();
    initializeObservability();
    initializeImagePreview();
    initializeMessageExport();
    initializeVoiceInput();
    initializeProjectView();
    initializeSpecLineage();
    setupEventBindings(handleSend);
    initAppearanceOnStartup();
    initSettings();
    setupSettingsButton();
    await loadProjects();

    document.addEventListener("agent-teams-select-session", (event) => {
      const sessionId = String(event?.detail?.sessionId || "").trim();
      if (!sessionId) {
        return;
      }
      void selectSession(sessionId);
    });

    document.addEventListener("agent-teams-select-subagent-session", (event) => {
      const sessionId = String(event?.detail?.sessionId || "").trim();
      const subagent = event?.detail?.subagent || null;
      if (!sessionId || !subagent) {
        return;
      }
      void selectSubagentSession(sessionId, subagent);
    });

    document.addEventListener("agent-teams-select-live-subagent", (event) => {
      const sessionId = String(event?.detail?.sessionId || "").trim();
      const subagent = event?.detail?.subagent || null;
      const roleId = String(subagent?.roleId || "").trim();
      if (!sessionId || !roleId) {
        return;
      }
      if (state.currentSessionId !== sessionId) {
        void selectSession(sessionId).then(() => {
          if (state.currentSessionId === sessionId) {
            void selectSubagentSession(sessionId, subagent);
          }
        });
        return;
      }
      void selectSubagentSession(sessionId, subagent);
    });

    const firstSessionEl = document.querySelector(".session-item");
    if (firstSessionEl) {
      const sessionId = String(
        firstSessionEl.getAttribute("data-session-id") || "",
      ).trim();
      if (sessionId) {
        await selectSession(sessionId, { markTerminalViewed: false });
      }
    } else {
      openNewSessionDraft("");
    }
    void sessionTopologyControlsReady;

    // Auto-open spec lineage if task_id is in the URL
    const urlTaskId = getTaskIdFromUrl();
    if (urlTaskId) {
      openSpecLineage(urlTaskId);
    }
  } finally {
    dismissInitialRuntimeLoader();
  }
}

function dismissInitialRuntimeLoader() {
  document.body.dataset.bootstrapState = "ready";
  const initialLoader = document.getElementById("initial-runtime-loader");
  if (!initialLoader) {
    return;
  }
  window.setTimeout(() => {
    initialLoader.remove();
  }, 220);
}
