import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CurrentSessionIndicator } from "../features/shell/CurrentSessionIndicator";

afterEach(() => {
  cleanup();
});

describe("CurrentSessionIndicator", () => {
  it("shows the workspace title while keeping the session identity accessible", () => {
    render(
      <CurrentSessionIndicator
        selectedSessionId="session-1"
        session={{
          session_id: "session-1",
          metadata: {
            title: "Frontend rewrite",
          },
          title: "Legacy rewrite",
          active_run_status: "running",
        }}
        workspaceLabel="Agent Teams"
      />,
    );

    expect(screen.getByText("Agent Teams")).toBeVisible();
    expect(screen.getByLabelText("Frontend rewrite running")).toHaveTextContent(
      "Agent Teams",
    );
    expect(screen.getByText("Frontend rewrite running")).toHaveClass("at-sr-only");
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

    expect(screen.getByText("Workspace loading")).toBeVisible();
    expect(screen.getByLabelText("session-loading")).toHaveTextContent(
      "Workspace loading",
    );
    expect(screen.getByText("session-loading")).toHaveClass("at-sr-only");
  });
});
