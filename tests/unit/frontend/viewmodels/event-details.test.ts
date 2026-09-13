import { describe, expect, it } from "vitest";
import {
	describeEventData,
	describeJsonData,
	sourceKindLabel,
} from "../../../../src/viewmodels/event-details";
import { eventFixture } from "../helpers";

describe("describeJsonData", () => {
	it("returns nothing for null", () => {
		expect(describeJsonData(null)).toEqual([]);
	});

	it("wraps primitive data", () => {
		expect(describeJsonData("hello")).toEqual([{ term: "数据", value: "hello" }]);
	});

	it("skips identity keys and formats known fields", () => {
		const rows = describeJsonData({
			id: "hidden",
			key: "hidden",
			type: "HKQuantityTypeIdentifierStepCount",
			value: 12,
			unit: "count",
			流入金额: 1.5,
			amount: 2,
			ok: true,
			missing: null,
			tags: ["a", "b"],
			points: [{ lat: 1 }, { lat: 2 }],
			emptyList: [],
			emptyObject: {},
			nested: { a: 1, b: 2 },
			ratio: 1.23456,
			broken: Number.POSITIVE_INFINITY,
		});
		const byTerm = Object.fromEntries(rows.map((row) => [row.term, row.value]));
		expect(byTerm.类型).toBe("步数");
		expect(byTerm.数值).toBe("12");
		expect(byTerm.单位).toBe("count");
		expect(byTerm.流入金额).toBe("¥1.50");
		expect(byTerm.金额).toBe("¥2.00");
		expect(byTerm.ok).toBe("是");
		expect(byTerm.missing).toBe("—");
		expect(byTerm.标签).toBe("a、b");
		expect(byTerm.轨迹点).toBe("2 项");
		expect(byTerm.emptyList).toBe("无");
		expect(byTerm.emptyObject).toBe("空");
		expect(byTerm.nested).toBe("2 个字段");
		expect(byTerm.ratio).toBe("1.2346");
		expect(byTerm.broken).toBe("Infinity");
		expect(rows.some((row) => row.term === "id")).toBe(false);
	});

	it("maps workout activity types and false booleans", () => {
		expect(
			describeJsonData({ workoutActivityType: "HKWorkoutActivityTypeRunning", flag: false }),
		).toEqual([
			{ term: "运动类型", value: "跑步" },
			{ term: "flag", value: "否" },
		]);
		expect(
			describeJsonData({ income: 3, expense: 4, type: "HKCategoryTypeIdentifierSleepAnalysis" }),
		).toEqual([
			{ term: "收入", value: "¥3.00" },
			{ term: "支出", value: "¥4.00" },
			{ term: "类型", value: "睡眠" },
		]);
		expect(describeJsonData({ type: "CustomType" })[0]?.value).toBe("CustomType");
	});
});

describe("describeEventData", () => {
	it("reads the event data object", () => {
		expect(describeEventData(eventFixture()).some((row) => row.term === "类型")).toBe(true);
	});
});

describe("sourceKindLabel", () => {
	it("labels connect and import sources", () => {
		expect(sourceKindLabel("connect")).toBe("Connect");
		expect(sourceKindLabel("import")).toBe("导入");
	});
});
