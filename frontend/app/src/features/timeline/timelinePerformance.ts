export interface PrefixCandidate {
  groupKey: string;
  index: number;
  text: string;
}

export interface TimelineDerivationCacheEntry<Value> {
  identities: readonly object[];
  signature: string;
  value: Value;
}

interface TimelineDerivationOptions<Value> {
  cache: Map<string, TimelineDerivationCacheEntry<Value>>;
  derive: () => Value;
  identities: readonly object[];
  key: string;
  limit: number;
  signature: string | null;
}

export function timelineDerivedValue<Value>({
  cache,
  derive,
  identities,
  key,
  limit,
  signature,
}: TimelineDerivationOptions<Value>): Value {
  const cached = cache.get(key);
  if (
    signature !== null &&
    cached !== undefined &&
    cached.signature === signature &&
    cached.identities.length === identities.length &&
    cached.identities.every((item, index) => item === identities[index])
  ) {
    rememberBoundedValue(cache, key, cached, limit);
    return cached.value;
  }
  const value = derive();
  if (signature !== null) {
    rememberBoundedValue(
      cache,
      key,
      { identities: [...identities], signature, value },
      limit,
    );
  }
  return value;
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

function rememberBoundedValue<Value>(
  values: Map<string, Value>,
  key: string,
  value: Value,
  limit: number,
): void {
  values.delete(key);
  values.set(key, value);
  while (values.size > limit) {
    const oldestKey = values.keys().next().value;
    if (typeof oldestKey !== "string") {
      return;
    }
    values.delete(oldestKey);
  }
}
