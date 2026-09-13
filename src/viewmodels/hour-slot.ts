import type { HourSlot } from "../models/types";

export interface HourSlotView {
	skipped: boolean;
	partial: boolean;
	stateLabel: string | null;
	hint: string | null;
	showEvents: boolean;
}

export function describeHourSlot(slot: HourSlot): HourSlotView {
	const exists = slot.instants.length > 0;
	const partial = slot.state === "missing" && exists;
	const skipped = !exists;
	const repeated = slot.state === "repeated";
	let stateLabel: string | null = null;
	if (skipped) {
		stateLabel = "夏令时跳过";
	} else if (partial) {
		stateLabel = "夏令时缩短";
	} else if (repeated) {
		stateLabel = "夏令时重复";
	}
	let hint: string | null = null;
	if (skipped) {
		hint = "该小时在本地时区不存在。";
	} else if (partial) {
		hint = "该小时因夏令时缩短。";
	} else if (slot.events.length === 0) {
		hint = "无记录";
	}
	return {
		skipped,
		partial,
		stateLabel,
		hint,
		showEvents: exists && slot.events.length > 0,
	};
}
