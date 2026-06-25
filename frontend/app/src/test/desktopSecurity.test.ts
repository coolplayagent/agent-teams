import { describe, expect, it } from "vitest";

import { normalizeExternalHttpUrl } from "../desktop/externalLinks";
import { buildDesktopWindowOptions } from "../desktop/windowOptions";

describe("desktop security boundaries", () => {
  it("keeps renderer Node access disabled with an isolated preload bridge", () => {
    const options = buildDesktopWindowOptions("C:/agent-teams/preload.js");

    expect(options.webPreferences).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      preload: "C:/agent-teams/preload.js",
      sandbox: true,
    });
    expect(options.show).toBe(false);
    expect(options.title).toBe("Agent Teams");
  });

  it("normalizes allowed external links before opening them in the main process", () => {
    expect(normalizeExternalHttpUrl("https://example.com/docs#setup")).toBe(
      "https://example.com/docs#setup",
    );
    expect(normalizeExternalHttpUrl("http://127.0.0.1:8000/app/")).toBe(
      "http://127.0.0.1:8000/app/",
    );
  });

  it("rejects non-http external link protocols", () => {
    expect(() => normalizeExternalHttpUrl("file:///C:/Users/yex/token.txt")).toThrow(
      "Only http and https links can be opened externally.",
    );
    expect(() => normalizeExternalHttpUrl("javascript:alert(1)")).toThrow(
      "Only http and https links can be opened externally.",
    );
  });
});
