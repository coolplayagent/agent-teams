import type { TimelineEntry } from "../../runtime/reducers";

export interface RuntimeEntryScopeProjection {
  scopedEntries: TimelineEntry[];
  sourceEntries: TimelineEntry[];
}

export function projectRuntimeEntriesForScope(
  sourceEntries: TimelineEntry[],
  previous: RuntimeEntryScopeProjection | undefined,
  matchesEntry: (entry: TimelineEntry) => boolean,
): RuntimeEntryScopeProjection {
  if (previous?.sourceEntries === sourceEntries) {
    return previous;
  }
  if (previous !== undefined && entriesExtendPrevious(sourceEntries, previous.sourceEntries)) {
    const appendedEntries = sourceEntries
      .slice(previous.sourceEntries.length)
      .filter(matchesEntry);
    return {
      scopedEntries: appendedEntries.length === 0
        ? previous.scopedEntries
        : [...previous.scopedEntries, ...appendedEntries],
      sourceEntries,
    };
  }
  return {
    scopedEntries: sourceEntries.filter(matchesEntry),
    sourceEntries,
  };
}

export function mergeRuntimeTimelineEntries(
  currentEntries: TimelineEntry[],
  nextEntries: TimelineEntry[],
): TimelineEntry[] {
  if (currentEntries === nextEntries || currentEntries.length === 0) {
    return nextEntries;
  }
  if (nextEntries.length === 0) {
    return currentEntries;
  }
  if (entriesExtendPrevious(nextEntries, currentEntries)) {
    return nextEntries;
  }
  if (entriesExtendPrevious(currentEntries, nextEntries)) {
    return currentEntries;
  }
  const entriesById = new Map<string, TimelineEntry>();
  for (const entry of currentEntries) {
    entriesById.set(entry.id, entry);
  }
  for (const entry of nextEntries) {
    entriesById.set(entry.id, entry);
  }
  return Array.from(entriesById.values()).sort(
    (left, right) => left.eventId - right.eventId,
  );
}

function entriesExtendPrevious(
  sourceEntries: TimelineEntry[],
  previousEntries: TimelineEntry[],
): boolean {
  const previousLength = previousEntries.length;
  return sourceEntries.length > previousLength &&
    (previousLength === 0 ||
      sourceEntries[previousLength - 1] === previousEntries[previousLength - 1]);
}
