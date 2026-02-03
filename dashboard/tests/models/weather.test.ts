import { describe, expect, test } from "bun:test";
import {
  getWeatherDescription,
  getWeatherIcon,
} from "@/models/weather";

describe("weather model", () => {
  describe("getWeatherDescription", () => {
    test("returns 晴 for code 0", () => {
      expect(getWeatherDescription(0)).toBe("晴");
    });

    test("returns 大部晴朗 for code 1", () => {
      expect(getWeatherDescription(1)).toBe("大部晴朗");
    });

    test("returns 多云 for code 2", () => {
      expect(getWeatherDescription(2)).toBe("多云");
    });

    test("returns 阴天 for code 3", () => {
      expect(getWeatherDescription(3)).toBe("阴天");
    });

    test("returns 雾 for code 45", () => {
      expect(getWeatherDescription(45)).toBe("雾");
    });

    test("returns 小雨 for code 61", () => {
      expect(getWeatherDescription(61)).toBe("小雨");
    });

    test("returns 中雨 for code 63", () => {
      expect(getWeatherDescription(63)).toBe("中雨");
    });

    test("returns 大雨 for code 65", () => {
      expect(getWeatherDescription(65)).toBe("大雨");
    });

    test("returns 小雪 for code 71", () => {
      expect(getWeatherDescription(71)).toBe("小雪");
    });

    test("returns 雷阵雨 for code 95", () => {
      expect(getWeatherDescription(95)).toBe("雷阵雨");
    });

    test("returns 未知 for unknown code", () => {
      expect(getWeatherDescription(999)).toBe("未知");
    });
  });

  describe("getWeatherIcon", () => {
    test("returns sun emoji for clear sky (code 0)", () => {
      expect(getWeatherIcon(0)).toBe("\u2600\uFE0F");
    });

    test("returns cloud emoji for partly cloudy (code 1-3)", () => {
      expect(getWeatherIcon(1)).toBe("\u26C5");
      expect(getWeatherIcon(2)).toBe("\u26C5");
      expect(getWeatherIcon(3)).toBe("\u26C5");
    });

    test("returns fog emoji for fog (code 45-48)", () => {
      expect(getWeatherIcon(45)).toBe("\uD83C\uDF2B\uFE0F");
      expect(getWeatherIcon(48)).toBe("\uD83C\uDF2B\uFE0F");
    });

    test("returns drizzle emoji for drizzle (code 51-57)", () => {
      expect(getWeatherIcon(51)).toBe("\uD83C\uDF27\uFE0F");
      expect(getWeatherIcon(55)).toBe("\uD83C\uDF27\uFE0F");
    });

    test("returns rain emoji for rain (code 61-67)", () => {
      expect(getWeatherIcon(61)).toBe("\uD83C\uDF27\uFE0F");
      expect(getWeatherIcon(65)).toBe("\uD83C\uDF27\uFE0F");
    });

    test("returns snow emoji for snow (code 71-77)", () => {
      expect(getWeatherIcon(71)).toBe("\u2744\uFE0F");
      expect(getWeatherIcon(75)).toBe("\u2744\uFE0F");
    });

    test("returns rain emoji for rain showers (code 80-82)", () => {
      expect(getWeatherIcon(80)).toBe("\uD83C\uDF27\uFE0F");
      expect(getWeatherIcon(82)).toBe("\uD83C\uDF27\uFE0F");
    });

    test("returns snow emoji for snow showers (code 85-86)", () => {
      expect(getWeatherIcon(85)).toBe("\u2744\uFE0F");
      expect(getWeatherIcon(86)).toBe("\u2744\uFE0F");
    });

    test("returns thunderstorm emoji for thunderstorm (code >= 95)", () => {
      expect(getWeatherIcon(95)).toBe("\u26C8\uFE0F");
      expect(getWeatherIcon(99)).toBe("\u26C8\uFE0F");
    });

    test("returns cloud emoji for unknown codes", () => {
      expect(getWeatherIcon(100)).toBe("\u2601\uFE0F");
    });
  });
});
