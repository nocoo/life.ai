import { describe, test, expect } from "bun:test";
import {
  getSunAltitude,
  getSunAltitudeDegrees,
  isSunUp,
  getCelestialIcon,
  getCelestialEmoji,
  getSunCurvePosition,
  getSkyColor,
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
  describe("getSunAltitudeDegrees", () => {
    test("returns highest altitude around solar noon", () => {
      // Solar noon in Beijing is around 12:00 (with some offset due to longitude)
      const noonAltitude = getSunAltitudeDegrees(12, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON);
      const morningAltitude = getSunAltitudeDegrees(9, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON);
      const eveningAltitude = getSunAltitudeDegrees(15, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON);
      
      expect(noonAltitude).toBeGreaterThan(morningAltitude);
      expect(noonAltitude).toBeGreaterThan(eveningAltitude);
    });

    test("returns negative altitude at midnight", () => {
      const altitude = getSunAltitudeDegrees(0, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON);
      expect(altitude).toBeLessThan(0);
    });

    test("returns higher max altitude on summer solstice than winter solstice", () => {
      const summerNoon = getSunAltitudeDegrees(12, 0, SUMMER_SOLSTICE, BEIJING_LAT, BEIJING_LON);
      const winterNoon = getSunAltitudeDegrees(12, 0, WINTER_SOLSTICE, BEIJING_LAT, BEIJING_LON);
      
      expect(summerNoon).toBeGreaterThan(winterNoon);
    });

    test("altitude varies with latitude", () => {
      // At equator (0°), sun should be higher than at Beijing (39.9°N) on equinox
      const equatorNoon = getSunAltitudeDegrees(12, 0, SPRING_EQUINOX, 0, BEIJING_LON);
      const beijingNoon = getSunAltitudeDegrees(12, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON);
      
      expect(equatorNoon).toBeGreaterThan(beijingNoon);
    });

    test("uses default values when not provided", () => {
      const altitude = getSunAltitudeDegrees(12, 0);
      expect(typeof altitude).toBe("number");
      expect(altitude).toBeGreaterThan(-90);
      expect(altitude).toBeLessThan(90);
    });
  });

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

  describe("getCelestialEmoji", () => {
    test("returns sun emoji during day", () => {
      expect(getCelestialEmoji(12, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON)).toBe("☀️");
      expect(getCelestialEmoji(9, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON)).toBe("☀️");
    });

    test("returns moon emoji at night", () => {
      expect(getCelestialEmoji(0, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON)).toBe("🌙");
      expect(getCelestialEmoji(3, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON)).toBe("🌙");
    });
  });

  describe("getCelestialIcon (legacy)", () => {
    test("returns sun icon during day", () => {
      expect(getCelestialIcon(12)).toBe("☀️");
    });

    test("returns moon icon at night", () => {
      expect(getCelestialIcon(0)).toBe("🌙");
    });
  });

  describe("getSunCurvePosition", () => {
    test("returns value between 0 and 100", () => {
      for (let hour = 0; hour < 24; hour++) {
        const pos = getSunCurvePosition(hour, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON);
        expect(pos).toBeGreaterThanOrEqual(0);
        expect(pos).toBeLessThanOrEqual(100);
      }
    });

    test("returns highest value around noon", () => {
      const noonPos = getSunCurvePosition(12, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON);
      const midnightPos = getSunCurvePosition(0, 0, SPRING_EQUINOX, BEIJING_LAT, BEIJING_LON);
      
      expect(noonPos).toBeGreaterThan(midnightPos);
      expect(noonPos).toBeGreaterThan(50); // Above horizon line
    });

    test("uses default values when not provided", () => {
      const pos = getSunCurvePosition(12);
      expect(typeof pos).toBe("number");
    });
  });

  describe("getSkyColor", () => {
    test("returns light sky blue for high sun (noon)", () => {
      expect(getSkyColor(12)).toBe("rgb(135, 206, 250)");
    });

    test("returns peach for low sun (around 8am)", () => {
      // Around 8am should be golden hour (altitude between 0 and 30 degrees)
      expect(getSkyColor(8)).toBe("rgb(255, 218, 185)");
    });

    test("returns twilight or night colors for early morning", () => {
      // Around 5-6am the sun is below horizon or just rising
      const color = getSkyColor(5);
      // Could be twilight purple or midnight blue depending on exact calculation
      expect(["rgb(138, 123, 169)", "rgb(25, 25, 112)"]).toContain(color);
    });

    test("returns midnight blue for deep night", () => {
      expect(getSkyColor(0)).toBe("rgb(25, 25, 112)");
      expect(getSkyColor(3)).toBe("rgb(25, 25, 112)");
    });
  });
});
