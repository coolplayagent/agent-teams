import { toText } from "hast-util-to-text";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import shell from "highlight.js/lib/languages/shell";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import type { Element, ElementContent, Root } from "hast";
import { createLowlight, type LanguageFn } from "lowlight";
import { visit } from "unist-util-visit";

const lowlight = createLowlight({
  bash,
  css,
  diff,
  javascript,
  json,
  markdown,
  plaintext,
  powershell,
  python,
  shell,
  typescript,
  xml,
  yaml,
} satisfies Readonly<Record<string, LanguageFn>>);

lowlight.registerAlias({
  bash: ["sh"],
  javascript: ["js", "jsx"],
  markdown: ["md"],
  powershell: ["ps", "ps1"],
  plaintext: ["text", "txt"],
  typescript: ["ts", "tsx"],
  xml: ["html", "svg"],
  yaml: ["yml"],
});

export function rehypeCodeHighlight() {
  return function highlightCodeBlocks(tree: Root): undefined {
    visit(tree, "element", (node, _index, parent) => {
      if (!isCodeInPre(node, parent)) {
        return;
      }
      const language = codeLanguage(node);
      if (language === null) {
        return;
      }
      const highlighted = highlight(language, toText(node, { whitespace: "pre" }));
      if (highlighted === null) {
        return;
      }
      node.properties.className = ["hljs", ...classNames(node)];
      node.children = highlighted.children as ElementContent[];
    });
    return undefined;
  };
}

function isCodeInPre(node: Element, parent: unknown): boolean {
  return node.tagName === "code" && isElement(parent) && parent.tagName === "pre";
}

function isElement(value: unknown): value is Element {
  return (
    typeof value === "object"
    && value !== null
    && "type" in value
    && value.type === "element"
    && "tagName" in value
    && typeof value.tagName === "string"
  );
}

function codeLanguage(node: Element): string | null {
  for (const className of classNames(node)) {
    if (className === "no-highlight" || className === "nohighlight") {
      return null;
    }
    if (className.startsWith("language-")) {
      return className.slice("language-".length);
    }
    if (className.startsWith("lang-")) {
      return className.slice("lang-".length);
    }
  }
  return null;
}

function classNames(node: Element): string[] {
  const rawClassName = node.properties.className;
  if (Array.isArray(rawClassName)) {
    return rawClassName.map(String);
  }
  if (typeof rawClassName === "string") {
    return rawClassName.split(/\s+/).filter(Boolean);
  }
  return [];
}

function highlight(language: string, code: string): Root | null {
  if (!lowlight.registered(language)) {
    return null;
  }
  return lowlight.highlight(language, code);
}
