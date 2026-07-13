import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DIRECTORY = "test";
const ALLOW_MARKER = "semantic-special-case-allow:";

interface AllowedLiteralPredicate {
  file: string;
  literal: string;
  method: "startsWith";
  receiver: "prompt";
  marker: string;
  justification: string;
}

// Protocol syntax is allowed only through this exact, reviewed registry. Do not add
// entries for product policy, provider/model/tool names, role names, or user content.
const ALLOWED_LITERAL_PREDICATES: readonly AllowedLiteralPredicate[] = [
  {
    file: "features/composer/Composer.tsx",
    literal: "/",
    method: "startsWith",
    receiver: "prompt",
    marker: `${ALLOW_MARKER} prompt-command-prefix`,
    justification: "The slash prefix is public composer command syntax.",
  },
  {
    file: "features/composer/PromptMentions.ts",
    literal: "/",
    method: "startsWith",
    receiver: "prompt",
    marker: `${ALLOW_MARKER} prompt-command-prefix`,
    justification: "The slash prefix is public composer command syntax.",
  },
] as const;

interface KnownSemanticDebt {
  count: number;
  reason: string;
}

// This is a fail-closed migration ledger, not an allowlist: every entry remains a
// prohibited special case. Removing one requires deleting its ledger entry; adding
// or moving a special case to another file fails the gate. Provider-specific UI
// dispatch must ultimately move behind typed adapter/registry boundaries.
const KNOWN_SEMANTIC_DEBT: Readonly<Record<string, KnownSemanticDebt>> = {};

const SENSITIVE_RECEIVER_PARTS = new Set([
  "content",
  "error.message",
  "model",
  "modelid",
  "modelname",
  "prompt",
  "prompttext",
  "provider",
  "providerid",
  "providername",
  "title",
  "toolid",
  "toolname",
]);
const PROHIBITED_ROLE_NAMES = new Set([
  "coordinator",
  "crafter",
  "explorer",
  "main agent",
  "mainagent",
]);
const LITERAL_PREDICATE_METHODS = new Set(["endsWith", "includes", "startsWith"]);

interface Violation {
  column: number;
  file: string;
  line: number;
  message: string;
}

describe("V2 frontend semantic fidelity", () => {
  it("does not hide diagnostics or acceptance hooks on window.__*", () => {
    expect(scanSourceTree().filter((violation) => violation.message.includes("window.__"))).toEqual([]);
  });

  it("does not filter API inventory through HIDDEN_*_IDS lists", () => {
    expect(scanSourceTree().filter((violation) => violation.message.includes("HIDDEN_*_IDS"))).toEqual([]);
  });

  it("does not branch on prompt/content/title/error/model/provider/tool literals or built-in role names", () => {
    const unreviewed = scanSourceTree().filter(
        (violation) =>
          !violation.message.includes("window.__")
          && !violation.message.includes("HIDDEN_*_IDS"),
      ).filter((violation) => !(violationKey(violation) in KNOWN_SEMANTIC_DEBT));
    expect(unreviewed).toEqual([]);
  });

  it("keeps the known semantic-special-case migration ledger exact", () => {
    const actual = new Map<string, number>();
    for (const violation of scanSourceTree()) {
      const key = violationKey(violation);
      if (key in KNOWN_SEMANTIC_DEBT) {
        actual.set(key, (actual.get(key) ?? 0) + 1);
      }
    }
    expect(Object.fromEntries(actual)).toEqual(
      Object.fromEntries(
        Object.entries(KNOWN_SEMANTIC_DEBT).map(([key, debt]) => [key, debt.count]),
      ),
    );
    for (const debt of Object.values(KNOWN_SEMANTIC_DEBT)) {
      expect(debt.reason.trim().length).toBeGreaterThan(30);
    }
  });

  it("keeps every protocol exception exact, documented, and source-annotated", () => {
    for (const allowed of ALLOWED_LITERAL_PREDICATES) {
      expect(allowed.justification.trim().length).toBeGreaterThan(20);
      const source = readFileSync(resolve(SOURCE_ROOT, allowed.file), "utf8");
      expect(source).toContain(allowed.marker);
    }
  });

  it("detects representative semantic shortcuts without rejecting dynamic search or display copy", () => {
    const violations = scanSourceText(
      resolve(SOURCE_ROOT, "fixtures/semantic-shortcuts.ts"),
      `
        window.__acceptance = true;
        const HIDDEN_TOOL_IDS = ["shell"];
        const shouldSkip = promptText.includes("hello");
        const isCoordinator = roleIds.includes("Coordinator");
        const dynamicSearch = title.includes(query);
        const displayCopy = { coordinator: "Coordinator" };
      `,
    );
    expect(violations.map((violation) => violation.message)).toEqual([
      "Do not expose production state through window.__* hooks.",
      "Do not filter backend API inventory through HIDDEN_*_IDS lists.",
      "Do not use prompt includes(\"hello\") as product logic.",
      "Do not special-case the built-in role name \"coordinator\".",
    ]);
  });
});

function scanSourceTree(): Violation[] {
  return sourceFiles(SOURCE_ROOT).flatMap(scanSourceFile);
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory)
    .flatMap((entry) => {
      if (entry === TEST_DIRECTORY) {
        return [];
      }
      const path = resolve(directory, entry);
      return statSync(path).isDirectory() ? sourceFiles(path) : [path];
    })
    .filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"));
}

function scanSourceFile(path: string): Violation[] {
  const sourceText = readFileSync(path, "utf8");
  return scanSourceText(path, sourceText);
}

function scanSourceText(path: string, sourceText: string): Violation[] {
  const sourceFile = ts.createSourceFile(
    path,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const constants = stringConstants(sourceFile);
  const violations: Violation[] = [];
  const visit = (node: ts.Node): void => {
    if (isWindowDiagnosticProperty(node)) {
      violations.push(violation(sourceFile, node, "Do not expose production state through window.__* hooks."));
    }
    if (ts.isIdentifier(node) && /^HIDDEN_[A-Z0-9_]*_IDS$/.test(node.text)) {
      violations.push(
        violation(sourceFile, node, "Do not filter backend API inventory through HIDDEN_*_IDS lists."),
      );
    }
    if (ts.isCallExpression(node)) {
      const literalPredicate = semanticLiteralPredicate(node, constants);
      if (literalPredicate !== null && !isAllowedPredicate(sourceFile, sourceText, literalPredicate)) {
        violations.push(
          violation(
            sourceFile,
            node,
            `Do not use ${literalPredicate.receiver} ${literalPredicate.method}(\"${literalPredicate.literal}\") as product logic.`,
          ),
        );
      }
      const roleName = prohibitedRolePredicate(node, constants);
      if (roleName !== null) {
        violations.push(
          violation(sourceFile, node, `Do not special-case the built-in role name \"${roleName}\".`),
        );
      }
    }
    if (ts.isBinaryExpression(node)) {
      const roleName = prohibitedRoleComparison(node, constants);
      if (roleName !== null) {
        violations.push(
          violation(sourceFile, node, `Do not special-case the built-in role name \"${roleName}\".`),
        );
      }
      const semanticComparison = semanticLiteralComparison(node, constants);
      if (semanticComparison !== null) {
        violations.push(
          violation(
            sourceFile,
            node,
            `Do not branch on ${semanticComparison.receiver} ${semanticComparison.operator} \"${semanticComparison.literal}\".`,
          ),
        );
      }
    }
    if (ts.isCaseClause(node)) {
      const roleName = literalText(node.expression, constants)?.toLocaleLowerCase() ?? null;
      if (roleName !== null && PROHIBITED_ROLE_NAMES.has(roleName)) {
        violations.push(
          violation(sourceFile, node, `Do not special-case the built-in role name \"${roleName}\".`),
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

function prohibitedRolePredicate(
  node: ts.CallExpression,
  constants: ReadonlyMap<string, string>,
): string | null {
  if (!ts.isPropertyAccessExpression(node.expression) || node.arguments.length === 0) {
    return null;
  }
  if (!LITERAL_PREDICATE_METHODS.has(node.expression.name.text)) {
    return null;
  }
  const literal = literalText(node.arguments[0], constants)?.toLocaleLowerCase() ?? null;
  return literal !== null && PROHIBITED_ROLE_NAMES.has(literal) ? literal : null;
}

function stringConstants(sourceFile: ts.SourceFile): ReadonlyMap<string, string> {
  const constants = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer !== undefined
      && isConstDeclaration(node)
    ) {
      const value = literalText(node.initializer, constants);
      if (value !== null) {
        constants.set(node.name.text, value);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return constants;
}

function isConstDeclaration(node: ts.VariableDeclaration): boolean {
  return ts.isVariableDeclarationList(node.parent)
    && (node.parent.flags & ts.NodeFlags.Const) !== 0;
}

function isWindowDiagnosticProperty(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node)) {
    return ts.isIdentifier(node.expression)
      && node.expression.text === "window"
      && node.name.text.startsWith("__");
  }
  if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)) {
    return node.expression.text === "window"
      && node.argumentExpression !== undefined
      && (literalText(node.argumentExpression, new Map())?.startsWith("__") ?? false);
  }
  return false;
}

interface LiteralPredicate {
  literal: string;
  method: "endsWith" | "includes" | "startsWith";
  receiver: string;
}

function semanticLiteralPredicate(
  node: ts.CallExpression,
  constants: ReadonlyMap<string, string>,
): LiteralPredicate | null {
  if (!ts.isPropertyAccessExpression(node.expression) || node.arguments.length !== 1) {
    return null;
  }
  const method = node.expression.name.text;
  if (!LITERAL_PREDICATE_METHODS.has(method)) {
    return null;
  }
  const receiver = sensitiveReceiver(node.expression.expression);
  const literal = literalText(node.arguments[0], constants);
  if (receiver === null || literal === null) {
    return null;
  }
  return { literal, method: method as LiteralPredicate["method"], receiver };
}

function isAllowedPredicate(
  sourceFile: ts.SourceFile,
  sourceText: string,
  predicate: LiteralPredicate,
): boolean {
  const file = relative(SOURCE_ROOT, sourceFile.fileName).replaceAll("\\", "/");
  return ALLOWED_LITERAL_PREDICATES.some(
    (allowed) =>
      allowed.file === file
      && allowed.literal === predicate.literal
      && allowed.method === predicate.method
      && allowed.receiver === predicate.receiver
      && sourceText.includes(allowed.marker),
  );
}

function prohibitedRoleComparison(
  node: ts.BinaryExpression,
  constants: ReadonlyMap<string, string>,
): string | null {
  if (!isEqualityOperator(node.operatorToken.kind)) {
    return null;
  }
  const left = literalText(node.left, constants)?.toLocaleLowerCase() ?? null;
  const right = literalText(node.right, constants)?.toLocaleLowerCase() ?? null;
  if (left !== null && PROHIBITED_ROLE_NAMES.has(left)) {
    return left;
  }
  if (right !== null && PROHIBITED_ROLE_NAMES.has(right)) {
    return right;
  }
  return null;
}

interface LiteralComparison {
  literal: string;
  operator: string;
  receiver: string;
}

function semanticLiteralComparison(
  node: ts.BinaryExpression,
  constants: ReadonlyMap<string, string>,
): LiteralComparison | null {
  if (!isEqualityOperator(node.operatorToken.kind)) {
    return null;
  }
  if (ts.isTypeOfExpression(node.left) || ts.isTypeOfExpression(node.right)) {
    return null;
  }
  const leftReceiver = sensitiveReceiver(node.left);
  const rightLiteral = literalText(node.right, constants);
  if (leftReceiver !== null && rightLiteral !== null) {
    return { literal: rightLiteral, operator: node.operatorToken.getText(), receiver: leftReceiver };
  }
  const rightReceiver = sensitiveReceiver(node.right);
  const leftLiteral = literalText(node.left, constants);
  if (rightReceiver !== null && leftLiteral !== null) {
    return { literal: leftLiteral, operator: node.operatorToken.getText(), receiver: rightReceiver };
  }
  return null;
}

function isEqualityOperator(kind: ts.SyntaxKind): boolean {
  return kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    || kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
    || kind === ts.SyntaxKind.EqualsEqualsToken
    || kind === ts.SyntaxKind.ExclamationEqualsToken;
}

function sensitiveReceiver(node: ts.Expression): string | null {
  const normalized = node.getText().replaceAll(/[^a-zA-Z0-9_.]/g, "").toLocaleLowerCase();
  for (const part of SENSITIVE_RECEIVER_PARTS) {
    if (
      normalized === part
      || normalized.endsWith(`.${part}`)
      || normalized.endsWith(part)
    ) {
      return part === "error.message" ? "error.message" : semanticReceiverGroup(part);
    }
  }
  if (normalized.endsWith(".message")) {
    return "error.message";
  }
  return null;
}

function semanticReceiverGroup(part: string): string {
  if (part.startsWith("prompt")) return "prompt";
  if (part.startsWith("model")) return "model";
  if (part.startsWith("provider")) return "provider";
  if (part.startsWith("tool")) return "tool";
  return part;
}

function literalText(
  node: ts.Expression,
  constants: ReadonlyMap<string, string>,
): string | null {
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  if (ts.isIdentifier(node)) {
    return constants.get(node.text) ?? null;
  }
  return null;
}

function violation(sourceFile: ts.SourceFile, node: ts.Node, message: string): Violation {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    column: position.character + 1,
    file: relative(SOURCE_ROOT, sourceFile.fileName).replaceAll("\\", "/"),
    line: position.line + 1,
    message,
  };
}

function violationKey(violation: Violation): string {
  return `${violation.file}|${violation.message}`;
}
