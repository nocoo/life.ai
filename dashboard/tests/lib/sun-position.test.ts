import { describe, test, expect } from "bun:test";
import {
  getSunAltitude,
  isSunUp,
  getCelestialIcon,
  getSunCurvePosition,
  getSkyColor,
} from "@/lib/sun-position";

describe("sun-position", () => {
  describe("getSunAltitude", () => {
    test("returns 1 at solar noon (12:00)", () => {
      expect(getSunAltitude(12, 0)).toBeCloseTo(1, 5);
    });

    test("returns -1 at midnight (0:00)", () => {
      expect(getSunAltitude(0, 0)).toBeCloseTo(-1, 5);
    });

    test("returns -1 at midnight (24:00 equivalent)", () => {
      expect(getSunAltitude(24, 0)).toBeCloseTo(-1, 5);
    });

    test("returns 0 at sunrise (6:00)", () => {
      expect(getSunAltitude(6, 0)).toBeCloseTo(0, 5);
    });

    test("returns 0 at sunset (18:00)", () => {
      expect(getSunAltitude(18, 0)).toBeCloseTo(0, 5);
    });

    test("returns positive during day (10:00)", () => {
      const altitude = getSunAltitude(10, 0);
      expect(altitude).toBeGreaterThan(0);
      expect(altitude).toBeLessThan(1);
    });

    test("returns negative at night (3:00)", () => {
      const altitude = getSunAltitude(3, 0);
      expect(altitude).toBeLessThan(0);
      expect(altitude).toBeGreaterThan(-1);
    });

    test("handles minutes correctly (11:30 should be slightly less than 12:00)", () => {
      const at1130 = getSunAltitude(11, 30);
      const at1200 = getSunAltitude(12, 0);
      expect(at1130).toBeLessThan(at1200);
      expect(at1130).toBeGreaterThan(0.9);
    });

    test("minute defaults to 0", () => {
      expect(getSunAltitude(12)).toBe(getSunAltitude(12, 0));
    });
  });

  describe("isSunUp", () => {
    test("returns true at noon", () => {
      expect(isSunUp(12, 0)).toBe(true);
    });

    test("returns false at midnight", () => {
      expect(isSunUp(0, 0)).toBe(false);
    });

    test("returns true at 9am", () => {
      expect(isSunUp(9, 0)).toBe(true);
    });

    test("returns true at 5pm (17:00)", () => {
      expect(isSunUp(17, 0)).toBe(true);
    });

    test("returns false at 3am", () => {
      expect(isSunUp(3, 0)).toBe(false);
    });

    test("returns false at 9pm (21:00)", () => {
      expect(isSunUp(21, 0)).toBe(false);
    });

    test("minute defaults to 0", () => {
      expect(isSunUp(12)).toBe(isSunUp(12, 0));
    });
  });

  describe("getCelestialIcon", () => {
    test("returns sun icon during day", () => {
      expect(getCelestialIcon(12)).toBe("☀️");
      expect(getCelestialIcon(9)).toBe("☀️");
      expect(getCelestialIcon(15)).toBe("☀️");
    });

    test("returns moon icon at night", () => {
      expect(getCelestialIcon(0)).toBe("🌙");
      expect(getCelestialIcon(3)).toBe("🌙");
      expect(getCelestialIcon(22)).toBe("🌙");
    });
  });

  describe("getSunCurvePosition", () => {
    test("returns 100 at solar noon (peak)", () => {
      expect(getSunCurvePosition(12, 0)).toBeCloseTo(100, 5);
    });

    test("returns 0 at midnight (lowest)", () => {
      expect(getSunCurvePosition(0, 0)).toBeCloseTo(0, 5);
    });

    test("returns 50 at sunrise/sunset (horizon)", () => {
      expect(getSunCurvePosition(6, 0)).toBeCloseTo(50, 5);
      expect(getSunCurvePosition(18, 0)).toBeCloseTo(50, 5);
    });

    test("minute defaults to 0", () => {
      expect(getSunCurvePosition(12)).toBe(getSunCurvePosition(12, 0));
    });
  });

  describe("getSkyColor", () => {
    test("returns light sky blue for high sun", () => {
      // altitude > 0.5 (around 10am-2pm)
      expect(getSkyColor(12)).toBe("rgb(135, 206, 250)");
    });

    test("returns peach for low sun (golden hour)", () => {
      // altitude 0 to 0.5 (around 7am-10am and 2pm-5pm)
      expect(getSkyColor(7)).toBe("rgb(255, 218, 185)");
      expect(getSkyColor(17)).toBe("rgb(255, 218, 185)");
    });

    test("returns dusk purple for twilight", () => {
      // altitude -0.3 to 0 (around 6am and 6pm edges, and 7pm)
      expect(getSkyColor(19)).toBe("rgb(138, 123, 169)");
    });

    test("returns midnight blue for night", () => {
      // altitude < -0.3 (deeper night)
      expect(getSkyColor(0)).toBe("rgb(25, 25, 112)");
      expect(getSkyColor(3)).toBe("rgb(25, 25, 112)");
    });
  });
});
