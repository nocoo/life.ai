import { packHealthDay, parseHealthExport } from "../src/models/apple-health";
import type { HealthDay, HealthNode, HealthStaging } from "../src/models/health-types";
import { normalizeTimestamp } from "../src/models/time";
import type { ImportRecord } from "../src/models/types";

/** Synthetic records only. All fixtures exercise the same lossless daily codec as real imports. */
export async function healthFixtureDays(
	records: Pick<ImportRecord, "occurredAt" | "endAt" | "data">[],
): Promise<HealthDay[]> {
	const days = new Map<number, HealthNode[]>();
	for (const record of records) {
		const data =
			record.data && typeof record.data === "object" && !Array.isArray(record.data)
				? record.data
				: {};
		const kind = data.workoutActivityType ? "Workout" : "Record";
		const attributes: Record<string, string> = {
			sourceName: "Fixture Apple Watch",
			startDate: record.occurredAt,
		};
		if (record.endAt) attributes.endDate = record.endAt;
		for (const [key, value] of Object.entries(data))
			if (typeof value === "string" || typeof value === "number") attributes[key] = String(value);
		const day =
			Math.floor(Date.parse(normalizeTimestamp(record.occurredAt)) / 86_400_000) * 86_400_000;
		const nodes = days.get(day) ?? [];
		nodes.push({ name: kind, attributes });
		days.set(day, nodes);
	}
	return Promise.all(
		[...days].sort(([a], [b]) => a - b).map(([day, nodes]) => packHealthDay(day, nodes)),
	);
}

export function syntheticHealthFiles(date = "2026-09-20"): Record<string, string> {
	const midnight = Date.parse(`${date}T00:00:00+08:00`);
	const at = (hour: number, minute = 0) =>
		new Date(midnight + hour * 3_600_000 + minute * 60_000).toISOString();
	const record = (type: string, value: string, start: string, end = start, unit = "count") =>
		`<Record type="${type}" sourceName="Fixture Apple Watch" device="Watch" startDate="${start}" endDate="${end}" value="${value}" unit="${unit}"/>`;
	const pressure = (kind: string, value: string) =>
		record(`HKQuantityTypeIdentifierBloodPressure${kind}`, value, at(8, 45), at(8, 45), "mmHg");
	const systolic = pressure("Systolic", "118");
	const diastolic = pressure("Diastolic", "76");
	const route = `<gpx><trk><trkseg>${[45, 60, 75].map((minute, index) => `<trkpt lat="${31 + index * 0.01}" lon="${121 + index * 0.01}"><time>${at(7, minute)}</time></trkpt>`).join("")}</trkseg></trk></gpx>`;
	const xml = `<?xml version="1.0" encoding="UTF-8"?><HealthData locale="zh_CN"><ExportDate value="${at(23)}"/>
		${record("HKCategoryTypeIdentifierSleepAnalysis", "HKCategoryValueSleepAnalysisInBed", at(-1, -15), at(6, 50))}
		${record("HKCategoryTypeIdentifierSleepAnalysis", "HKCategoryValueSleepAnalysisAsleepCore", at(-1), at(1))}
		${record("HKCategoryTypeIdentifierSleepAnalysis", "HKCategoryValueSleepAnalysisAsleepDeep", at(1), at(3))}
		${record("HKCategoryTypeIdentifierSleepAnalysis", "HKCategoryValueSleepAnalysisAsleepREM", at(3), at(6, 40))}
		<Workout workoutActivityType="HKWorkoutActivityTypeCycling" sourceName="Fixture Apple Watch" startDate="${at(7, 30)}" endDate="${at(8, 20)}" duration="45" durationUnit="min"><WorkoutStatistics type="HKQuantityTypeIdentifierDistanceCycling" sum="8.2" unit="km"/><WorkoutRoute><FileReference path="/workout-routes/morning.gpx"/></WorkoutRoute></Workout>
		${record("HKQuantityTypeIdentifierHeartRate", "68", at(6, 50), at(6, 50), "count/min")}
		${record("HKQuantityTypeIdentifierHeartRate", "148", at(7, 58), at(7, 58), "count/min")}
		${record("HKQuantityTypeIdentifierHeartRate", "72", at(9), at(9), "count/min")}
		${record("HKQuantityTypeIdentifierStepCount", "800", at(12, 5), at(12, 15))}
		${record("HKQuantityTypeIdentifierDistanceWalkingRunning", "650", at(12, 5), at(12, 15), "m")}
		${record("HKQuantityTypeIdentifierWalkingSpeed", "1.2", at(12, 6), at(12, 6), "m/s")}
		<Correlation type="HKCorrelationTypeIdentifierBloodPressure" sourceName="Fixture Apple Watch" startDate="${at(8, 45)}" endDate="${at(8, 45)}">${systolic}${diastolic}<MetadataEntry key="Note" value="Synthetic measurement"/></Correlation>
		${systolic}${diastolic}
		<ActivitySummary dateComponents="${date}" activeEnergyBurned="350" activeEnergyBurnedUnit="kcal"/>
		<Record type="HKDataTypeSleepDurationGoal" startDate="1970-01-01" value="480" unit="min"/>
	</HealthData>`;
	const ecg = `姓名,Fixture\n记录日期,${at(10, 10)}\n分类,窦性心律\n采样速率,512赫兹\n平均心率,64\n单位,µV\n\n${Array.from({ length: 5120 }, (_, index) => (index % 512 === 101 ? 950 : Math.round(40 * Math.sin(index / 12)))).join("\n")}\n`;
	return {
		"apple_health_export/导出.xml": xml,
		"apple_health_export/workout-routes/morning.gpx": route,
		"apple_health_export/electrocardiograms/morning.csv": ecg,
		"apple_health_export/export_cda.xml": "<ClinicalDocument>original CDA</ClinicalDocument>",
	};
}

export async function syntheticHealthPlan(date?: string) {
	const groups = new Map<number, HealthNode[]>();
	const staging: HealthStaging = {
		async append(batch) {
			for (const [day, records] of batch) groups.set(day, [...(groups.get(day) ?? []), ...records]);
		},
		async days() {
			return [...groups.keys()];
		},
		async read(day) {
			return groups.get(day) ?? [];
		},
		async clear() {
			groups.clear();
		},
	};
	return parseHealthExport(
		Object.entries(syntheticHealthFiles(date)).map(([path, contents]) => {
			const blob = new Blob([contents]);
			return { path, size: blob.size, stream: () => blob.stream() };
		}),
		staging,
	);
}
