import { describe, expect, it } from "bun:test";
import { createDashboardViewModel } from "./view-model";

describe("dashboard view model", () => {
  it("builds view model with selected day", () => {
    const viewModel = createDashboardViewModel(
      [
        {
          id: "2026-02-01",
          story: "Test story",
          timeline: {
            id: "2026-02-01",
            date: "2026-02-01",
            weekday: "Sun",
            monthDay: "Feb 01",
            monthKey: "2026-02",
            headline: "Test",
            weather: "Clear",
            placeCount: 2,
            travelKm: 4.2,
            steps: 3000,
            energyKcal: 1200
          },
          footprint: {
            totalDistanceKm: 4.2,
            activeMinutes: 40,
            maxSpeedKmh: 12,
            cities: 1,
            track: [4, 6],
            heatmap: [],
            stops: []
          },
          health: {
            metrics: [],
            activity: [],
            heartRate: [],
            sleepHours: 7,
            mindfulnessMin: 10
          },
          spending: {
            incomeTotal: 0,
            expenseTotal: 0,
            topCategory: "",
            items: []
          }
        }
      ],
      "2026-02-01"
    );

    expect(viewModel.title).toBe("Life.ai");
    expect(viewModel.subtitle).toBe("Memory Atlas");
    expect(viewModel.timeline).toHaveLength(1);
    expect(viewModel.selectedDay.id).toBe("2026-02-01");
  });
});
