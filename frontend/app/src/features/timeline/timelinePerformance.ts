export interface TimelineDerivationCacheEntry<Value> {
  identities: readonly object[];
  signature: string;
  value: Value;
}

export interface TimelineFallbackVirtualItem {
  index: number;
  start: number;
}

interface TimelineDerivationOptions<Value> {
  cache: Map<string, TimelineDerivationCacheEntry<Value>>;
  derive: () => Value;
  identities: readonly object[];
  key: string;
  limit: number;
  signature: string | null;
}

interface BoundedStringCacheOptions<Value> {
  cache: Map<string, Value>;
  create: () => Value;
  key: string;
  limit: number;
}

export function boundedStringCacheValue<Value>({
  cache,
  create,
  key,
  limit,
}: BoundedStringCacheOptions<Value>): Value {
  if (cache.has(key)) {
    const value = cache.get(key) as Value;
    rememberBoundedValue(cache, key, value, limit);
    return value;
  }
  const value = create();
  rememberBoundedValue(cache, key, value, limit);
  return value;
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

export function timelineFallbackVirtualItems(
  itemSizes: readonly number[],
  limit: number,
): TimelineFallbackVirtualItem[] {
  const firstIndex = Math.max(0, itemSizes.length - Math.max(0, limit));
  let start = itemSizes
    .slice(0, firstIndex)
    .reduce((total, size) => total + size, 0);
  return itemSizes.slice(firstIndex).map((size, offset) => {
    const item = { index: firstIndex + offset, start };
    start += size;
    return item;
  });
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
