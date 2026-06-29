/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { markBootstrapReady } from "../app/bootstrapState";

const appHtml = readFileSync("index.html", "utf8");

describe("app bootstrap shell", () => {
  it("renders a V1-style loading shell before React hydrates", () => {
    expect(appHtml).toContain('<body data-bootstrap-state="loading">');
    expect(appHtml).toContain('class="initial-app-shell"');
    expect(appHtml).toContain('class="initial-app-loader" role="status"');
    expect(appHtml).toContain("Loading Agent Teams...");
    expect(appHtml).toContain('body[data-bootstrap-state="ready"] .initial-app-shell');
    expect(appHtml).toContain('body[data-bootstrap-state="ready"] .initial-app-loader');
    expect(appHtml).toContain('<div id="root"></div>');
  });

  it("does not depend on external markdown or font CDNs", () => {
    expect(appHtml).not.toContain("fonts.googleapis.com");
    expect(appHtml).not.toContain("cdn.jsdelivr.net/npm/marked");
    expect(appHtml).not.toContain("cdnjs.cloudflare.com/ajax/libs/highlight.js");
  });

  it("marks the bootstrap shell ready after the app mounts", () => {
    document.body.dataset.bootstrapState = "loading";

    markBootstrapReady();

    expect(document.body.dataset.bootstrapState).toBe("ready");
  });
});
