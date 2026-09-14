import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../src/models/types";
import {
	healthDimensionLabel,
	healthRecordSource,
	healthRecordTitle,
} from "../../../../src/viewmodels/health-format";
import { eventFixture } from "../helpers";

describe("health record presentation", () => {
	it.each([
		["HKQuantityTypeIdentifierHeartRate", "心率"],
		["HKCategoryTypeIdentifierSleepAnalysis", "睡眠"],
		["HKCorrelationTypeIdentifierBloodPressure", "血压组合"],
		["HKDataTypeIdentifierElectrocardiogram", "心电图"],
		["HKDataTypeSleepDurationGoal", "睡眠目标（系统设置）"],
		["HKWorkoutActivityTypeCycling", "骑行锻炼"],
		["HKCategoryTypeIdentifierLowHeartRateEvent", "低心率提醒"],
		["HKCategoryTypeIdentifierIrregularHeartRhythmEvent", "心律不齐提醒"],
	])("labels %s for people reading the timeline", (type, label) => {
		expect(healthDimensionLabel(type)).toBe(label);
	});

	it("keeps unknown dimensions readable without changing vendor identifiers or embedded prefixes", () => {
		expect(healthDimensionLabel("HKQuantityTypeIdentifierNewSensor")).toBe("NewSensor");
		expect(healthDimensionLabel("VendorMetric")).toBe("VendorMetric");
		expect(healthDimensionLabel("vendor.HKQuantityTypeIdentifierHeartRate")).toBe(
			"vendor.HKQuantityTypeIdentifierHeartRate",
		);
	});

	it("uses workout activity, record dimension and event kind in that order without changing the raw data", () => {
		const workout = eventFixture({
			sourceId: "apple-health",
			data: {
				workoutActivityType: "HKWorkoutActivityTypeRunning",
				type: "HKQuantityTypeIdentifierHeartRate",
				_healthKind: "Workout",
				sourceName: "Apple Watch",
				device: "a recorded device",
			},
		});
		const snapshot = structuredClone(workout);
		expect(healthRecordTitle(workout)).toBe("跑步锻炼");
		expect(healthRecordSource(workout)).toBe("Apple Watch");
		expect(workout).toEqual(snapshot);
		expect(
			healthRecordTitle({
				...workout,
				data: { type: "HKQuantityTypeIdentifierBodyMass", _healthKind: "Record" },
			}),
		).toBe("体重");
		expect(healthRecordTitle({ ...workout, data: { _healthKind: "ActivitySummary" } })).toBe(
			"每日活动圆环",
		);
	});

	const incompleteData: JsonValue[] = [
		null,
		[],
		"a note",
		12,
		{ type: 12 },
		{ sourceName: 12 },
		{},
	];
	it.each(incompleteData.map((data) => ({ data })))(
		"preserves fallback title and source for incomplete health metadata ($data)",
		({ data }) => {
			const event = eventFixture({
				sourceId: "apple-health",
				title: "导入记录",
				sourceName: "Apple 健康",
				data,
			});
			expect(healthRecordTitle(event)).toBe("导入记录");
			expect(healthRecordSource(event)).toBe("Apple 健康");
		},
	);

	it("preserves titles and source names from other providers even if their payload contains health fields", () => {
		const event = eventFixture({
			sourceId: "journal",
			title: "今天去测量体重",
			sourceName: "日记",
			data: { type: "HKQuantityTypeIdentifierBodyMass", sourceName: "Apple Watch" },
		});
		expect(healthRecordTitle(event)).toBe(event.title);
		expect(healthRecordSource(event)).toBe(event.sourceName);
	});
});
