/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/features/settings/ModelCatalogPicker.tsx",
  "utf8",
);
const css = readFileSync(
  "src/features/settings/ModelCatalogPicker.css",
  "utf8",
);

describe("model catalog picker", () => {
  it("uses searchable virtual selects instead of fully rendered lists", () => {
    expect(source.match(/<Select/g)).toHaveLength(2);
    expect(source.match(/\bvirtual\b/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain("listHeight={320}");
    expect(source).not.toContain(".map((model) => (\n                <button");
    expect(css).not.toMatch(/overflow:\s*auto/);
  });

  it("shows operational model metadata and backfills the selected model", () => {
    expect(source).toContain("model.context_window");
    expect(source).toContain("model.output_limit");
    expect(source).toContain("model.tool_call");
    expect(source).toContain("model.input_modalities");
    expect(source).toContain("onSelect(activeProvider, model)");
  });
});
