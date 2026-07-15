import { X } from "lucide-react";
import { useId, type KeyboardEvent } from "react";

import { useTranslations } from "../../i18n";
import type { MessageTimelineUiState } from "../timeline/MessageTimeline";
import type { ActiveSubagentSession } from "./SessionsSidebar";
import { SubagentSessionView } from "./SubagentSessionView";
import {
  subagentDisplayTitle,
  subagentPanelIdentityMatches,
  subagentTabKey,
} from "./useSubagentWorkbench";

interface SubagentWorkbenchProps {
  activeSubagent: ActiveSubagentSession;
  onActivate: (subagent: ActiveSubagentSession) => void;
  onClose: (tabKey: string) => void;
  onLocate: (subagent: ActiveSubagentSession) => void;
  onUiStateChange: (tabKey: string, state: MessageTimelineUiState) => void;
  tabs: ActiveSubagentSession[];
  uiState: MessageTimelineUiState | null;
}

export function SubagentWorkbench({
  activeSubagent,
  onActivate,
  onClose,
  onLocate,
  onUiStateChange,
  tabs,
  uiState,
}: SubagentWorkbenchProps) {
  const t = useTranslations();
  const activeTabKey = subagentTabKey(activeSubagent);
  const tabIdPrefix = useId();
  const activeTabDomId = workbenchTabDomId(tabIdPrefix, activeTabKey);
  const activePanelDomId = workbenchPanelDomId(tabIdPrefix, activeTabKey);
  return (
    <aside
      aria-label={t("subagentTabsLabel")}
      className="at-subagent-side-panel"
    >
      <div
        aria-label={t("subagentTabsLabel")}
        className="at-subagent-workbench-tabs"
        role="tablist"
      >
        {tabs.map((subagent) => {
          const tabKey = subagentTabKey(subagent);
          const selected = subagentPanelIdentityMatches(
            activeSubagent,
            subagent,
          );
          const title = subagentDisplayTitle(
            subagent,
            t("subagentTabUntitled"),
          );
          return (
            <div
              className={
                selected
                  ? "at-subagent-workbench-tab is-active"
                  : "at-subagent-workbench-tab"
              }
              key={tabKey}
            >
              <button
                aria-controls={workbenchPanelDomId(tabIdPrefix, tabKey)}
                aria-selected={selected}
                className="at-subagent-workbench-tab-trigger"
                onClick={() => onActivate(subagent)}
                onDoubleClick={() => onLocate(subagent)}
                onKeyDown={(event) =>
                  handleTabKeyboardNavigation({
                    event,
                    onActivate,
                    subagent,
                    tabIdPrefix,
                    tabs,
                  })}
                id={workbenchTabDomId(tabIdPrefix, tabKey)}
                role="tab"
                tabIndex={selected ? 0 : -1}
                title={title}
                type="button"
              >
                {title}
              </button>
              <button
                aria-label={t("subagentCloseTab", { title })}
                className="at-subagent-workbench-tab-close"
                onClick={() => onClose(tabKey)}
                type="button"
              >
                <X aria-hidden="true" size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="at-subagent-workbench-content">
        <div
          aria-labelledby={activeTabDomId}
          className="at-subagent-heavy-surface"
          id={activePanelDomId}
          key={activeTabKey}
          role="tabpanel"
        >
          <SubagentSessionView
            onBack={() => onClose(activeTabKey)}
            onTimelineUiStateChange={(state) =>
              onUiStateChange(activeTabKey, state)}
            showBackAction={false}
            subagent={activeSubagent}
            timelineUiState={uiState}
            visible
          />
        </div>
      </div>
    </aside>
  );
}

function handleTabKeyboardNavigation({
  event,
  onActivate,
  subagent,
  tabIdPrefix,
  tabs,
}: {
  event: KeyboardEvent<HTMLButtonElement>;
  onActivate: (subagent: ActiveSubagentSession) => void;
  subagent: ActiveSubagentSession;
  tabIdPrefix: string;
  tabs: ActiveSubagentSession[];
}): void {
  const currentIndex = tabs.findIndex((candidate) =>
    subagentPanelIdentityMatches(candidate, subagent),
  );
  if (currentIndex < 0 || tabs.length < 2) {
    return;
  }
  let nextIndex: number | null = null;
  if (event.key === "ArrowLeft") {
    nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  } else if (event.key === "ArrowRight") {
    nextIndex = (currentIndex + 1) % tabs.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = tabs.length - 1;
  }
  if (nextIndex === null) {
    return;
  }
  event.preventDefault();
  const nextSubagent = tabs[nextIndex];
  if (nextSubagent === undefined) {
    return;
  }
  onActivate(nextSubagent);
  window.requestAnimationFrame(() => {
    document
      .getElementById(
        workbenchTabDomId(tabIdPrefix, subagentTabKey(nextSubagent)),
      )
      ?.focus();
  });
}

function workbenchTabDomId(prefix: string, tabKey: string): string {
  return `${prefix}-subagent-tab-${domSafeTabKey(tabKey)}`;
}

function workbenchPanelDomId(prefix: string, tabKey: string): string {
  return `${prefix}-subagent-panel-${domSafeTabKey(tabKey)}`;
}

function domSafeTabKey(tabKey: string): string {
  return tabKey.replace(/[^A-Za-z0-9_-]/g, "_");
}
