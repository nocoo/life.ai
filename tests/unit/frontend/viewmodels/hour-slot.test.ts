import { describe, expect, it } from "vitest";
import { describeHourSlot } from "../../../../src/viewmodels/hour-slot";
import { eventFixture } from "../helpers";

const emptySlot = {
	hour: 2,
	label: "02:00",
	instants: [] as number[],
	events: [],
	state: "missing" as const,
};

describe("describeHourSlot", () => {
	it("treats an hour with no instants as nonexistent", () => {
		expect(describeHourSlot(emptySlot)).toEqual({
			skipped: true,
			partial: false,
			stateLabel: "夏令时跳过",
			hint: "该小时在本地时区不存在。",
			showEvents: false,
		});
		expect(describeHourSlot({ ...emptySlot, events: [eventFixture()] }).showEvents).toBe(false);
	});

	it("does not hide events on a shortened DST hour", () => {
		const event = eventFixture({ id: "dst" });
		expect(
			describeHourSlot({
				hour: 2,
				label: "02:00",
				instants: [1],
				events: [event],
				state: "missing",
			}),
		).toEqual({
			skipped: false,
			partial: true,
			stateLabel: "夏令时缩短",
			hint: "该小时因夏令时缩短。",
			showEvents: true,
		});
	});

	it("labels a shortened hour without events", () => {
		expect(
			describeHourSlot({
				hour: 2,
				label: "02:00",
				instants: [1],
				events: [],
				state: "missing",
			}),
		).toMatchObject({
			partial: true,
			showEvents: false,
			hint: "该小时因夏令时缩短。",
		});
	});

	it("labels repeated hours and empty normal hours", () => {
		expect(
			describeHourSlot({
				hour: 1,
				label: "01:00",
				instants: [1, 2],
				events: [],
				state: "repeated",
			}),
		).toMatchObject({
			stateLabel: "夏令时重复",
			hint: "无记录",
			showEvents: false,
		});
		expect(
			describeHourSlot({
				hour: 8,
				label: "08:00",
				instants: [1],
				events: [eventFixture()],
				state: "normal",
			}),
		).toMatchObject({
			stateLabel: null,
			hint: null,
			showEvents: true,
		});
		expect(
			describeHourSlot({
				hour: 9,
				label: "09:00",
				instants: [1],
				events: [],
				state: "normal",
			}),
		).toMatchObject({
			hint: "无记录",
			showEvents: false,
		});
	});
});
