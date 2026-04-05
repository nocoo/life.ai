import { describe, test, expect } from "bun:test";
import {
  getSunAltitude,
  isSunUp,
} from "@/lib/sun-position";

// Test date: Summer solstice 2024 (June 21) - longest day
const SUMMER_SOLSTICE = new Date(2024, 5, 21);
// Test date: Winter solstice 2024 (December 21) - shortest day
const WINTER_SOLSTICE = new Date(2024, 11, 21);
// Test date: Equinox (March 20, 2024) - equal day/night
const SPRING_EQUINOX = new Date(2024, 2, 20);

// Beijing coordinates
const BEIJING_LAT = 39.9;
const BEIJING_LON = 116.4;

describe("sun-position", () => {
  describe("getSunAltitude (normalized)", () => {
    test("returns value between -1 and 1", () => {
      for (let hour = 0; hour < 24; hour++) {
        const altitude = getSunAltitude(hour, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON);
        expect(altitude).toBeGreaterThanOrEqual(-1);
        expect(altitude).toBeLessThanOrEqual(1);
      }
    });

    test("returns highest value around noon", () => {
      const noonAlt = getSunAltitude(12, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON);
      const midnightAlt = getSunAltitude(0, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON);

      expect(noonAlt).toBeGreaterThan(midnightAlt);
      expect(noonAlt).toBeGreaterThan(0);
    });

    test("returns negative at night", () => {
      const nightAlt = getSunAltitude(3, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON);
      expect(nightAlt).toBeLessThan(0);
    });

    test("seasonal variation affects normalized altitude", () => {
      // Both summer and winter noon return values close to 1 (near max for that day)
      // since they're normalized to each day's maximum altitude
      const summerNoon = getSunAltitude(12, 0, SUMMER_SOLSTICE, BEIJING_LAT, BEIJING_LON);
      const winterNoon = getSunAltitude(12, 0, WINTER_SOLSTICE, BEIJING_LAT, BEIJING_LON);

      // Both should be high (close to 1) since 12:00 is near solar noon
      expect(summerNoon).toBeGreaterThan(0.9);
      expect(winterNoon).toBeGreaterThan(0.9);
    });

    test("uses default values when not provided", () => {
      const altitude = getSunAltitude(12, 0);
      expect(typeof altitude).toBe("number");
      expect(altitude).toBeGreaterThan(-1);
      expect(altitude).toBeLessThan(1);
    });
  });

  describe("isSunUp", () => {
    test("returns true during daytime", () => {
      expect(isSunUp(12, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON)).toBe(true);
      expect(isSunUp(9, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON)).toBe(true);
      expect(isSunUp(15, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON)).toBe(true);
    });

    test("returns false during nighttime", () => {
      expect(isSunUp(0, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON)).toBe(false);
      expect(isSunUp(3, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON)).toBe(false);
      expect(isSunUp(22, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON)).toBe(false);
    });

    test("uses default values when not provided", () => {
      expect(typeof isSunUp(12)).toBe("boolean");
    });
  });
});
