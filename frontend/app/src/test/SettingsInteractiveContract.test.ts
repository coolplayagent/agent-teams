import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const interactiveTags = new Set([
  "Button",
  "ChoiceControl",
  "Segmented",
  "Switch",
  "button",
]);
const handlerAttributes = new Set([
  "href",
  "onChange",
  "onClick",
  "onPress",
  "onSubmit",
]);

describe("settings interactive contracts", () => {
  it("does not expose controls without an action, state change, or form submission", () => {
    const violations = settingsSourceFiles().flatMap(findInertControls);

    expect(violations).toEqual([]);
  });
});

function settingsSourceFiles(): string[] {
  return walk(join("src", "features", "settings"));
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return walk(path);
    }
    return path.endsWith(".tsx") ? [path] : [];
  });
}

function findInertControls(path: string): string[] {
  const sourceText = readFileSync(path, "utf8");
  const sourceFile = ts.createSourceFile(
    path,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const violations: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sourceFile);
      if (
        interactiveTags.has(tag) &&
        !hasAction(node) &&
        !insidePopconfirm(node) &&
        !insideBoundFormItem(node)
      ) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        violations.push(`${path}:${line} <${tag}>`);
      }
    }
    ts.forEachChild(node, visit);
  }

  function hasAction(
    node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  ): boolean {
    const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
    if (
      attributes.some(
        (attribute) =>
          handlerAttributes.has(attribute.name.getText(sourceFile)) &&
          !isNoOpHandler(attribute),
      )
    ) {
      return true;
    }
    return attributes.some(
      (attribute) =>
        (attribute.name.getText(sourceFile) === "htmlType" ||
          attribute.name.getText(sourceFile) === "type") &&
        attribute.getText(sourceFile).includes("submit"),
    );
  }

  function isNoOpHandler(attribute: ts.JsxAttribute): boolean {
    const expression = attribute.initializer !== undefined &&
      ts.isJsxExpression(attribute.initializer)
      ? attribute.initializer.expression
      : undefined;
    if (expression === undefined || !ts.isArrowFunction(expression)) {
      return false;
    }
    if (ts.isBlock(expression.body)) {
      return expression.body.statements.length === 0;
    }
    return ts.isIdentifier(expression.body) && expression.body.text === "undefined";
  }

  function insideBoundFormItem(node: ts.Node): boolean {
    let parent = node.parent;
    while (parent !== undefined) {
      if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(sourceFile) === "Form.Item") {
        return parent.openingElement.attributes.properties.some(
          (attribute) =>
            ts.isJsxAttribute(attribute) &&
            attribute.name.getText(sourceFile) === "name",
        );
      }
      if (ts.isFunctionLike(parent)) {
        return false;
      }
      parent = parent.parent;
    }
    return false;
  }

  function insidePopconfirm(node: ts.Node): boolean {
    let parent = node.parent;
    while (parent !== undefined) {
      if (
        ts.isJsxElement(parent) &&
        parent.openingElement.tagName.getText(sourceFile) === "Popconfirm"
      ) {
        return true;
      }
      if (ts.isFunctionLike(parent)) {
        return false;
      }
      parent = parent.parent;
    }
    return false;
  }

  visit(sourceFile);
  return violations;
}
