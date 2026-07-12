export interface TerminalDomSnapshot {
  domIdentity: number | null;
  phase: "light" | "settled";
  rowHeight: number;
  runId: string;
  scrollHeight: number;
  scrollTop: number;
  textHash: string;
  textLength: number;
  timestamp: number;
}

type TerminalSnapshotGlobal = typeof globalThis & {
  __agentTeamsTerminalSnapshots?: TerminalDomSnapshot[];
};

const rowIdentities = new WeakMap<Element, number>();
let nextRowIdentity = 1;

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
  const row = anchorRow?.dataset.runId === runId
    ? anchorRow
    : latestRunMessageRow(timeline, runId);
  const text = row?.querySelector<HTMLElement>(".at-message-text")?.textContent ?? "";
  const rowHeight = row?.getBoundingClientRect().height ?? 0;
  if (phase === "light" && row !== null && rowHeight > 0) {
    row.style.minHeight = `${rowHeight}px`;
  }
  const snapshot: TerminalDomSnapshot = {
    domIdentity: row === null ? null : rowIdentity(row),
    phase,
    rowHeight,
    runId,
    scrollHeight: timeline.scrollHeight,
    scrollTop: timeline.scrollTop,
    textHash: terminalTextHash(text),
    textLength: text.length,
    timestamp: globalThis.performance?.now() ?? Date.now(),
  };
  const diagnosticsGlobal = globalThis as TerminalSnapshotGlobal;
  const snapshots = diagnosticsGlobal.__agentTeamsTerminalSnapshots ?? [];
  diagnosticsGlobal.__agentTeamsTerminalSnapshots = [...snapshots.slice(-99), snapshot];
}

export function stabilizeTerminalDomLayout(
  anchor: HTMLElement | null,
  runId: string,
): void {
  if (anchor === null) {
    return;
  }
  const timeline = anchor.closest<HTMLElement>(".at-timeline");
  if (timeline === null) {
    return;
  }
  const lightSnapshot = latestLightSnapshot(runId);
  if (lightSnapshot === undefined) {
    return;
  }
  const row = latestRunMessageRow(timeline, runId);
  if (row !== null && lightSnapshot.rowHeight > 0) {
    row.style.minHeight = `${lightSnapshot.rowHeight}px`;
  }
  restoreScrollAnchor(timeline, lightSnapshot.scrollTop);
  window.requestAnimationFrame(() => restoreScrollAnchor(timeline, lightSnapshot.scrollTop));
}

function latestLightSnapshot(runId: string): TerminalDomSnapshot | undefined {
  const snapshots = readTerminalDomSnapshots();
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshots[index];
    if (snapshot?.runId === runId && snapshot.phase === "light") {
      return snapshot;
    }
  }
  return undefined;
}

export function readTerminalDomSnapshots(): TerminalDomSnapshot[] {
  const diagnosticsGlobal = globalThis as TerminalSnapshotGlobal;
  return [...(diagnosticsGlobal.__agentTeamsTerminalSnapshots ?? [])];
}

export function resetTerminalDomSnapshots(): void {
  const diagnosticsGlobal = globalThis as TerminalSnapshotGlobal;
  diagnosticsGlobal.__agentTeamsTerminalSnapshots = [];
}

function latestRunMessageRow(
  timeline: HTMLElement,
  runId: string,
): HTMLElement | null {
  const rows = timeline.querySelectorAll<HTMLElement>(".at-message[data-run-id]");
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.dataset.runId === runId) {
      return row;
    }
  }
  return null;
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

function restoreScrollAnchor(timeline: HTMLElement, scrollTop: number): void {
  if (Math.abs(timeline.scrollTop - scrollTop) <= 128) {
    timeline.scrollTop = scrollTop;
  }
}

function terminalTextHash(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
