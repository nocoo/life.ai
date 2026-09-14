import { z } from "zod";
import { gpsDistanceMeters } from "./day-insights";

export const MAX_NAMED_PLACES = 100;
export const MIN_PLACE_RADIUS_METERS = 50;
export const MAX_PLACE_RADIUS_METERS = 50_000;
export const DEFAULT_PLACE_RADIUS_METERS = 300;

export const namedPlaceSchema = z
	.object({
		id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "地点标识无效"),
		label: z
			.string()
			.trim()
			.min(1, "请填写地点名称")
			.max(80, "地点名称不能超过 80 个字")
			.regex(/^[^\p{Cc}]+$/u, "地点名称不能包含换行或控制字符"),
		latitude: z.number().min(-90).max(90),
		longitude: z.number().min(-180).max(180),
		radiusMeters: z
			.number()
			.int()
			.min(MIN_PLACE_RADIUS_METERS, "地点半径至少为 50 米")
			.max(MAX_PLACE_RADIUS_METERS, "地点半径不能超过 50 公里"),
	})
	.strict();

const clockSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "请选择有效的时分");
export const sleepRoutineSchema = z
	.object({
		bedtime: clockSchema,
		wakeTime: clockSchema,
		timeZone: z
			.string()
			.max(80)
			.transform((value, context) => {
				try {
					return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
				} catch {
					context.addIssue({ code: "custom", message: "请选择有效时区" });
					return z.NEVER;
				}
			}),
	})
	.strict()
	.refine((value) => value.bedtime !== value.wakeTime, "入睡和起床时间不能相同");

export const generalSettingsSchema = z
	.object({
		places: z
			.array(namedPlaceSchema)
			.max(MAX_NAMED_PLACES, "最多保存 100 个地点")
			.refine((places) => new Set(places.map((place) => place.id)).size === places.length, {
				message: "地点标识不能重复",
			}),
		routine: sleepRoutineSchema.nullable(),
	})
	.strict();

export type NamedPlace = z.infer<typeof namedPlaceSchema>;
export type SleepRoutine = z.infer<typeof sleepRoutineSchema>;
export type GeneralSettings = z.infer<typeof generalSettingsSchema>;
export type Coordinates = Pick<NamedPlace, "latitude" | "longitude">;
export const EMPTY_NAMED_PLACES: readonly NamedPlace[] = [];

export function emptyGeneralSettings(): GeneralSettings {
	return { places: [], routine: null };
}

export function validateGeneralSettings(value: unknown): GeneralSettings {
	const result = generalSettingsSchema.safeParse(value);
	if (!result.success) throw new Error(result.error.issues[0]?.message ?? "通用设置无效");
	return result.data;
}

/** Match the actual coordinate, never an entire coarse GPS cluster. Smaller circles win;
 * equal radii use distance then ID, so reordering saved locations cannot change a label. */
export function matchNamedPlace(
	point: Coordinates,
	places: readonly NamedPlace[],
): NamedPlace | null {
	if (
		!Number.isFinite(point.latitude) ||
		!Number.isFinite(point.longitude) ||
		Math.abs(point.latitude) > 90 ||
		Math.abs(point.longitude) > 180
	)
		return null;
	let match: NamedPlace | null = null;
	let nearest = Infinity;
	for (const place of places) {
		const distance = gpsDistanceMeters(point, place);
		if (distance > place.radiusMeters) continue;
		if (
			!match ||
			place.radiusMeters < match.radiusMeters ||
			(place.radiusMeters === match.radiusMeters &&
				(distance < nearest || (distance === nearest && place.id < match.id)))
		) {
			match = place;
			nearest = distance;
		}
	}
	return match;
}

/** A recurring wall-clock interval, not an observed sleep duration or a UTC timestamp. */
export function routineDurationMinutes(
	routine: Pick<SleepRoutine, "bedtime" | "wakeTime">,
): number {
	const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
	return (minutes(routine.wakeTime) - minutes(routine.bedtime) + 1440) % 1440;
}
