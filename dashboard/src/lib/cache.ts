/**
 * Simple in-memory cache for historical data that doesn't change.
 * Used for year/month aggregations where past data is immutable.
 */
export class MemoryCache<T> {
  private cache = new Map<string, T>();

  /** Get cached value or undefined if not present */
  get(key: string): T | undefined {
    return this.cache.get(key);
  }

  /** Set cached value */
  set(key: string, value: T): void {
    this.cache.set(key, value);
  }

  /** Check if key exists in cache */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /** Delete a cached value */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /** Clear all cached values */
  clear(): void {
    this.cache.clear();
  }

  /** Get number of cached entries */
  size(): number {
    return this.cache.size;
  }

  /** Get cached value or compute and cache it */
  getOrSet(key: string, factory: () => T): T {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const value = factory();
    this.cache.set(key, value);
    return value;
  }
}

/**
 * Check if a month (YYYY-MM) is historical (before current month).
 * Historical months have immutable data and can be cached indefinitely.
 */
export function isHistoricalMonth(month: string, now = new Date()): boolean {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return month < currentMonth;
}

/**
 * Check if a year is historical (before current year).
 * Historical years have immutable data and can be cached indefinitely.
 */
export function isHistoricalYear(year: number, now = new Date()): boolean {
  return year < now.getFullYear();
}
