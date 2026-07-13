import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CurrentSessionIndicator } from "../features/shell/CurrentSessionIndicator";
import { useUiStore } from "../runtime/uiStore";

beforeEach(() => {
  useUiStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("CurrentSessionIndicator", () => {
  it("shows the current session title and keeps workspace context in its tooltip", () => {
    render(
      <CurrentSessionIndicator
        selectedSessionId="session-1"
        session={{
          session_id: "session-1",
          metadata: {
            title: "Frontend rewrite",
          },
          active_run_status: "running",
        }}
        workspaceLabel="Agent Teams"
      />,
    );

    expect(screen.getByText("Frontend rewrite")).toBeVisible();
    expect(screen.getByRole("status", { name: "Frontend rewrite Running" }))
      .toHaveTextContent("Frontend rewrite");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Frontend rewrite")).toHaveAttribute(
      "title",
      "Agent Teams · Frontend rewrite",
    );
    expect(screen.queryByText("Agent Teams")).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy rewrite")).not.toBeInTheDocument();
  });

  it("falls back to the selected session id while sidebar data loads", () => {
    render(
      <CurrentSessionIndicator
        selectedSessionId="session-loading"
        session={null}
        workspaceLabel="Workspace loading"
      />,
    );

    expect(screen.getByText("session-loading")).toBeVisible();
    expect(screen.getByRole("status", { name: "session-loading" })).toHaveTextContent(
      "session-loading",
    );
    expect(screen.getByText("session-loading")).toHaveAttribute(
      "title",
      "Workspace loading · session-loading",
    );
  });

  it("announces a localized run status without adding visible status chrome", () => {
    useUiStore.setState({ language: "zh-CN" });
    render(
      <CurrentSessionIndicator
        selectedSessionId="session-running"
        session={{
          active_run_status: "running",
          session_id: "session-running",
          metadata: { title: "流式验证" },
        }}
        workspaceLabel="agent-teams"
      />,
    );

    expect(screen.getByText("流式验证")).toBeVisible();
    expect(screen.getByRole("status", { name: "流式验证 运行中" })).toBeVisible();
    expect(screen.queryByText("运行中")).not.toBeInTheDocument();
  });
});
