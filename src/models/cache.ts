import { z } from "zod";

export const CACHE_KINDS = ["github", "gecko", "firefly", "sun", "weather", "place"] as const;
export type CacheKind = (typeof CACHE_KINDS)[number];
export const CACHE_NAMES: Record<CacheKind, string> = {
	github: "GitHub",
	gecko: "Gecko",
	firefly: "Firefly",
	sun: "日出日落",
	weather: "天气",
	place: "地点名称",
};

export const cacheQuerySchema = z.discriminatedUnion("scope", [
	z.object({ scope: z.literal("day"), date: z.iso.date() }).strict(),
	z.object({ scope: z.literal("all") }).strict(),
]);
export type CacheQuery = z.infer<typeof cacheQuerySchema>;
export interface CacheEntry {
	kind: CacheKind;
	count: number;
	updatedAt: number | null;
}
export interface CacheOverview {
	query: CacheQuery;
	entries: CacheEntry[];
}
export interface CacheClearResult {
	cleared: number;
	overview: CacheOverview;
}
