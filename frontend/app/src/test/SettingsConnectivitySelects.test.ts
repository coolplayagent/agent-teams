/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = [
  "ProxySettingsSection.tsx",
  "SpeechSettingsSection.tsx",
  "WebSettingsSection.tsx",
];
const sources = Object.fromEntries(
  files.map((file) => [
    file,
    readFileSync(`src/features/settings/${file}`, "utf8"),
  ]),
);

describe("connectivity settings finite controls", () => {
  it("uses Select instead of native selects", () => {
    for (const source of Object.values(sources)) {
      expect(source).not.toContain("<select");
    }
  });

  it("keeps speech model and language choices registry backed and searchable", () => {
    const speech = sources["SpeechSettingsSection.tsx"] ?? "";
    expect(speech).toMatch(
      /name="stt_profile_name"[\s\S]*?<Select[\s\S]*?displayedProfileEntries\.map[\s\S]*?showSearch/,
    );
    expect(speech).toMatch(
      /name="language"[\s\S]*?<Select[\s\S]*?languageOptions\(selectedLanguage\)[\s\S]*?showSearch/,
    );
  });
});
