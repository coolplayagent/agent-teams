import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CurrentSessionIndicator } from "../features/shell/CurrentSessionIndicator";

afterEach(() => {
  cleanup();
});

describe("CurrentSessionIndicator", () => {
  it("shows the selected session title and active run status", () => {
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
      />,
    );

    expect(screen.getByText("Frontend rewrite")).toBeVisible();
    expect(screen.queryByText("Legacy rewrite")).not.toBeInTheDocument();
    expect(screen.getByText("running")).toBeVisible();
  });

  it("falls back to the selected session id while sidebar data loads", () => {
    render(
      <CurrentSessionIndicator selectedSessionId="session-loading" session={null} />,
    );

    expect(screen.getByText("session-loading")).toBeVisible();
  });
});
