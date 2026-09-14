import type { LifeEvent } from "../models/types";

const LABELS: Record<string, string> = {
	StepCount: "步数",
	HeartRate: "心率",
	SleepAnalysis: "睡眠",
	OxygenSaturation: "血氧饱和度",
	RespiratoryRate: "呼吸频率",
	HeartRateVariabilitySDNN: "心率变异性",
	RestingHeartRate: "静息心率",
	WalkingHeartRateAverage: "步行平均心率",
	HeartRateRecoveryOneMinute: "一分钟心率恢复",
	BloodPressure: "血压组合",
	BloodPressureSystolic: "收缩压",
	BloodPressureDiastolic: "舒张压",
	BodyMass: "体重",
	BodyMassIndex: "身体质量指数",
	Height: "身高",
	LeanBodyMass: "去脂体重",
	DistanceWalkingRunning: "步行与跑步距离",
	DistanceCycling: "骑行距离",
	FlightsClimbed: "爬楼",
	ActiveEnergyBurned: "活动能量",
	BasalEnergyBurned: "静息能量",
	AppleExerciseTime: "锻炼分钟",
	AppleStandTime: "站立时间",
	AppleStandHour: "站立小时",
	DietaryWater: "饮水",
	VO2Max: "最大摄氧量",
	PhysicalEffort: "体能消耗强度",
	WalkingSpeed: "步行速度",
	WalkingStepLength: "步长",
	WalkingDoubleSupportPercentage: "双足支撑比例",
	WalkingAsymmetryPercentage: "步行不对称性",
	SixMinuteWalkTestDistance: "六分钟步行距离",
	AppleWalkingSteadiness: "步行稳定性",
	StairAscentSpeed: "上楼速度",
	StairDescentSpeed: "下楼速度",
	TimeInDaylight: "日照时间",
	AppleSleepingWristTemperature: "睡眠腕温",
	EnvironmentalAudioExposure: "环境声音",
	HeadphoneAudioExposure: "耳机声音",
	EnvironmentalSoundReduction: "环境降噪",
	AudioExposureEvent: "环境声音提醒",
	HeadphoneAudioExposureEvent: "耳机声音提醒",
	HighHeartRateEvent: "高心率提醒",
	LowCardioFitnessEvent: "心肺适能提醒",
	HandwashingEvent: "洗手",
	SleepDurationGoal: "睡眠目标（系统设置）",
	Workout: "锻炼",
	ActivitySummary: "每日活动圆环",
	Electrocardiogram: "心电图",
	LowHeartRateEvent: "低心率提醒",
	IrregularHeartRhythmEvent: "心律不齐提醒",
	Walking: "步行锻炼",
	Running: "跑步锻炼",
	Cycling: "骑行锻炼",
	Swimming: "游泳锻炼",
	Hiking: "徒步锻炼",
	Yoga: "瑜伽",
	TraditionalStrengthTraining: "力量训练",
	FunctionalStrengthTraining: "功能训练",
};

export function healthDimensionLabel(id: string): string {
	const name = id.replace(
		/^HK(?:(?:Quantity|Category|Correlation|Data)Type(?:Identifier)?|WorkoutActivityType)/,
		"",
	);
	return LABELS[name] ?? name;
}

export function healthRecordTitle(event: LifeEvent): string {
	const data = event.data;
	if (event.sourceId !== "apple-health" || !data || typeof data !== "object" || Array.isArray(data))
		return event.title;
	const type = data.workoutActivityType ?? data.type ?? data._healthKind;
	return typeof type === "string" ? healthDimensionLabel(type) : event.title;
}

export function healthRecordSource(event: LifeEvent): string {
	const data = event.data;
	return event.sourceId === "apple-health" &&
		data &&
		typeof data === "object" &&
		!Array.isArray(data) &&
		typeof data.sourceName === "string"
		? data.sourceName
		: event.sourceName;
}
