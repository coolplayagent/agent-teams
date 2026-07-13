import { describe, expect, it } from "vitest";

import type { SessionSidebarRecord } from "../api/contracts";
import { sessionDisplayLabel } from "../features/sessions/sessionLabels";

describe("sessionDisplayLabel", () => {
  it("uses metadata.title as the sole title contract", () => {
    expect(
      sessionDisplayLabel(
        session({
          metadata: {
            label: "Label title",
            name: "Named title",
            title: "Prompt title",
          },
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
        }),
      ),
    ).toBe("session-1");

    expect(
      sessionDisplayLabel(
        session({
          metadata: {
            label: "Label title",
            name: null,
          },
        }),
      ),
    ).toBe("session-1");
  });

  it("falls back to session id, fallback label, then app name", () => {
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
