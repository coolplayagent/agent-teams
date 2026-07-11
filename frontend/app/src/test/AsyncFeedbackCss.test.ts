/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const feedbackCss = readFileSync("src/styles/feedback.css", "utf8");
const mainSource = readFileSync("src/main.tsx", "utf8");

describe("async feedback styles", () => {
  it("defines restrained shared motion durations and safe properties", () => {
    expect(feedbackCss).toContain("--at-motion-fast: 150ms");
    expect(feedbackCss).toContain("--at-motion-standard: 180ms");
    expect(feedbackCss).toContain("--at-motion-slow: 220ms");
    expect(feedbackCss).toContain("grid-template-rows");
    expect(feedbackCss).toContain("opacity");
    expect(feedbackCss).toContain("transform");
    expect(feedbackCss).not.toMatch(/transition:\s*all/);
  });

  it("turns shared motion off for explicit and system reduced motion", () => {
    expect(feedbackCss).toContain(':root[data-motion="reduce"]');
    expect(feedbackCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(feedbackCss).toContain(':root[data-motion="system"]');
    expect(feedbackCss).toContain("transition: none");
    expect(feedbackCss).toContain("animation: none");
  });

  it("loads feedback styles from the application entry", () => {
    expect(mainSource).toContain('import "./styles/feedback.css";');
  });
});
