export interface PrefixCandidate {
  groupKey: string;
  index: number;
  text: string;
}

export function indexesWithLongerStrictPrefix(
  candidates: readonly PrefixCandidate[],
): ReadonlySet<number> {
  const candidatesByGroup = new Map<string, PrefixCandidate[]>();
  for (const candidate of candidates) {
    const group = candidatesByGroup.get(candidate.groupKey);
    if (group === undefined) {
      candidatesByGroup.set(candidate.groupKey, [candidate]);
    } else {
      group.push(candidate);
    }
  }

  const indexes = new Set<number>();
  for (const group of candidatesByGroup.values()) {
    const ordered = [...group].sort((left, right) => {
      const textOrder = left.text.localeCompare(right.text);
      return textOrder === 0 ? left.index - right.index : textOrder;
    });
    for (let index = 0; index + 1 < ordered.length; index += 1) {
      const candidate = ordered[index];
      const next = ordered[index + 1];
      if (
        candidate !== undefined &&
        next !== undefined &&
        next.text.length > candidate.text.length &&
        next.text.startsWith(candidate.text)
      ) {
        indexes.add(candidate.index);
      }
    }
  }
  return indexes;
}
