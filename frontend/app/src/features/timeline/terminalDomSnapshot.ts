export interface TerminalDomSnapshot {
  domIdentity: number | null;
  phase: "light" | "settled";
  runId: string;
  scrollHeight: number;
  scrollTop: number;
  textHash: string;
  textLength: number;
  timestamp: number;
}

const rowIdentities = new WeakMap<Element, number>();
let nextRowIdentity = 1;
let terminalSnapshots: TerminalDomSnapshot[] = [];

export function recordTerminalDomSnapshot(
  anchor: HTMLElement | null,
  runId: string,
  phase: TerminalDomSnapshot["phase"],
): void {
  if (anchor === null) {
    return;
  }
  const timeline = anchor.closest<HTMLElement>(".at-timeline");
  if (timeline === null) {
    return;
  }
  const anchorRow = anchor.closest<HTMLElement>(".at-message[data-run-id]");
  const row = anchorRow?.dataset.runId === runId ? anchorRow : null;
  const text = row?.querySelector<HTMLElement>(".at-message-text")?.textContent ?? "";
  const snapshot: TerminalDomSnapshot = {
    domIdentity: row === null ? null : rowIdentity(row),
    phase,
    runId,
    scrollHeight: timeline.scrollHeight,
    scrollTop: timeline.scrollTop,
    textHash: terminalTextHash(text),
    textLength: text.length,
    timestamp: globalThis.performance?.now() ?? Date.now(),
  };
  terminalSnapshots = [...terminalSnapshots.slice(-99), snapshot];
}

export function readTerminalDomSnapshots(): TerminalDomSnapshot[] {
  return [...terminalSnapshots];
}

export function resetTerminalDomSnapshots(): void {
  terminalSnapshots = [];
}

function rowIdentity(row: HTMLElement): number {
  const existing = rowIdentities.get(row);
  if (existing !== undefined) {
    return existing;
  }
  const identity = nextRowIdentity;
  nextRowIdentity += 1;
  rowIdentities.set(row, identity);
  return identity;
}

function terminalTextHash(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
