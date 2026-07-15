import { describe, expect, it } from "vitest";

import { fileReadResultText } from "../features/timeline/toolResultPresentation";

describe("fileReadResultText", () => {
  it("renders a structured workspace file projection", () => {
    expect(fileReadResultText({
      data: {
        output: "<content>legacy provider payload</content>",
        presentation: {
          content: "1: const value = 1;\n\n(End of file - total 1 lines)",
          entries: [],
          kind: "workspace-read",
          path: "src/main.ts",
          resource_type: "file",
        },
      },
      ok: true,
    })).toBe([
      "Path: src/main.ts",
      "Type: file",
      "",
      "1: const value = 1;",
      "",
      "(End of file - total 1 lines)",
    ].join("\n"));
  });

  it("renders structured directory entries as compact lines", () => {
    expect(fileReadResultText({
      presentation: {
        entries: ["frontend/", "pyproject.toml"],
        kind: "workspace-read",
        path: ".",
        resource_type: "directory",
      },
    })).toBe("Path: .\nType: directory\n\nfrontend/\npyproject.toml");
  });

  it("uses unmodified plain text as the legacy and third-party fallback", () => {
    const legacy = "<path>old.txt</path>\n<content>legacy</content>";
    expect(fileReadResultText({ data: { output: legacy }, ok: true })).toBe(legacy);
  });
});
