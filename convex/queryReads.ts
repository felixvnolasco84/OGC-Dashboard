/** Parallelize independent reads without changing their result order. */
export async function mapReadBatches<T, R>(items: readonly T[], read: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let offset = 0; offset < items.length; offset += 32) {
    results.push(...await Promise.all(items.slice(offset, offset + 32).map(read)));
  }
  return results;
}
