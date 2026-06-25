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

  it("marks the bootstrap shell ready after the app mounts", () => {
    document.body.dataset.bootstrapState = "loading";

    markBootstrapReady();

    expect(document.body.dataset.bootstrapState).toBe("ready");
  });
});
