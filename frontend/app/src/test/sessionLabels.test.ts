import { describe, expect, it } from "vitest";

import type { SessionSidebarRecord } from "../api/contracts";
import { sessionDisplayLabel } from "../features/sessions/sessionLabels";

describe("sessionDisplayLabel", () => {
  it("prefers metadata title, name, then label", () => {
    expect(
      sessionDisplayLabel(
        session({
          metadata: {
            label: "Label title",
            name: "Named title",
            title: "Prompt title",
          },
          title: "Legacy title",
        }),
      ),
    ).toBe("Prompt title");

    expect(
      sessionDisplayLabel(
        session({
          metadata: {
            label: "Label title",
            name: "Named title",
            title: " ",
          },
          title: "Legacy title",
        }),
      ),
    ).toBe("Named title");

    expect(
      sessionDisplayLabel(
        session({
          metadata: {
            label: "Label title",
            name: null,
          },
          title: "Legacy title",
        }),
      ),
    ).toBe("Label title");
  });

  it("falls back to legacy title, session id, fallback label, then app name", () => {
    expect(sessionDisplayLabel(session({ title: "Legacy title" }))).toBe("Legacy title");
    expect(sessionDisplayLabel(session({ session_id: "session-fallback" }))).toBe(
      "session-fallback",
    );
    expect(sessionDisplayLabel(null, "Selected session")).toBe("Selected session");
    expect(sessionDisplayLabel(null)).toBe("Agent Teams");
  });
});

function session(overrides: Partial<SessionSidebarRecord>): SessionSidebarRecord {
  return {
    session_id: "session-1",
    ...overrides,
  };
}
