import type { JsonValue, LifeEvent } from "../models/types";

export interface EventDetailRow {
	term: string;
	value: string;
}

const FIELD_LABELS: Record<string, string> = {
	type: "类型",
	unit: "单位",
	value: "数值",
	sourceName: "来源设备",
	sourceVersion: "来源版本",
	device: "设备",
	workoutActivityType: "运动类型",
	duration: "时长",
	totalDistance: "距离",
	totalEnergyBurned: "活动能量",
	activeEnergyBurned: "活动能量",
	appleExerciseTime: "锻炼时间",
	appleStandHours: "站立小时",
	lat: "纬度",
	latitude: "纬度",
	lon: "经度",
	lng: "经度",
	longitude: "经度",
	ele: "海拔",
	elevation: "海拔",
	speed: "速度",
	course: "航向",
	count: "点数",
	points: "轨迹点",
	distance: "距离",
	日期: "日期",
	交易分类: "交易分类",
	交易类型: "交易类型",
	流入金额: "流入金额",
	流出金额: "流出金额",
	币种: "币种",
	资金账户: "资金账户",
	标签: "标签",
	备注: "备注",
	category: "分类",
	account: "账户",
	amount: "金额",
	income: "收入",
	expense: "支出",
	currency: "币种",
	note: "备注",
	title: "标题",
	content: "内容",
	text: "正文",
	body: "正文",
	tags: "标签",
};

const HK_TYPE_LABELS: Record<string, string> = {
	HKQuantityTypeIdentifierStepCount: "步数",
	HKQuantityTypeIdentifierDistanceWalkingRunning: "步行跑步距离",
	HKQuantityTypeIdentifierFlightsClimbed: "爬楼",
	HKQuantityTypeIdentifierHeartRate: "心率",
	HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "心率变异",
	HKQuantityTypeIdentifierOxygenSaturation: "血氧",
	HKQuantityTypeIdentifierRespiratoryRate: "呼吸频率",
	HKQuantityTypeIdentifierDietaryWater: "饮水",
	HKQuantityTypeIdentifierActiveEnergyBurned: "活动能量",
	HKCategoryTypeIdentifierSleepAnalysis: "睡眠",
	HKWorkoutActivityTypeWalking: "步行",
	HKWorkoutActivityTypeRunning: "跑步",
	HKWorkoutActivityTypeCycling: "骑行",
};

const SKIP_KEYS = new Set(["key", "id"]);

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatNumber(key: string, value: number): string {
	if (!Number.isFinite(value)) {
		return String(value);
	}
	if (
		key === "流入金额" ||
		key === "流出金额" ||
		key === "amount" ||
		key === "income" ||
		key === "expense"
	) {
		return `¥${value.toFixed(2)}`;
	}
	if (Number.isInteger(value)) {
		return String(value);
	}
	return String(Number(value.toFixed(4)));
}

function formatJsonValue(key: string, value: JsonValue): string {
	if (value === null) {
		return "—";
	}
	if (typeof value === "boolean") {
		return value ? "是" : "否";
	}
	if (typeof value === "number") {
		return formatNumber(key, value);
	}
	if (typeof value === "string") {
		if (key === "type" || key === "workoutActivityType") {
			return (
				HK_TYPE_LABELS[value] ??
				value.replace(/^HK(Quantity|Category|WorkoutActivity)?Type(Identifier)?/, "")
			);
		}
		return value;
	}
	if (Array.isArray(value)) {
		if (value.length === 0) {
			return "无";
		}
		if (value.every((item) => item === null || typeof item !== "object")) {
			return value.map((item) => formatJsonValue(key, item)).join("、");
		}
		return `${value.length} 项`;
	}
	const nestedKeys = Object.keys(value);
	if (nestedKeys.length === 0) {
		return "空";
	}
	return `${nestedKeys.length} 个字段`;
}

function labelFor(key: string): string {
	return FIELD_LABELS[key] ?? key;
}

export function describeJsonData(data: JsonValue): EventDetailRow[] {
	if (data === null) {
		return [];
	}
	if (!isRecord(data)) {
		return [{ term: "数据", value: formatJsonValue("data", data) }];
	}
	const rows: EventDetailRow[] = [];
	for (const [key, value] of Object.entries(data)) {
		if (SKIP_KEYS.has(key) || value === undefined) {
			continue;
		}
		rows.push({ term: labelFor(key), value: formatJsonValue(key, value) });
	}
	return rows;
}

export function describeEventData(event: LifeEvent): EventDetailRow[] {
	return describeJsonData(event.data);
}

export function sourceKindLabel(kind: LifeEvent["sourceKind"]): string {
	return kind === "connect" ? "Connect" : "导入";
}
