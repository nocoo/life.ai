/** Weather data for a specific day */
export interface DayWeather {
  /** Date string (yyyy-MM-dd) */
  date: string;
  /** Maximum temperature in Celsius */
  tempMax: number;
  /** Minimum temperature in Celsius */
  tempMin: number;
  /** Average temperature in Celsius */
  tempAvg: number;
  /** WMO Weather code */
  weatherCode: number;
  /** Total precipitation in mm */
  precipitation: number;
  /** Sunrise time (HH:mm) */
  sunrise: string;
  /** Sunset time (HH:mm) */
  sunset: string;
  /** Maximum wind speed in km/h */
  windSpeedMax: number;
}

/** Map WMO weather code to Chinese description */
export function getWeatherDescription(code: number): string {
  // WMO Weather interpretation codes
  // https://open-meteo.com/en/docs
  const weatherCodes: Record<number, string> = {
    0: "晴",
    1: "大部晴朗",
    2: "多云",
    3: "阴天",
    45: "雾",
    48: "雾凇",
    51: "小毛毛雨",
    53: "毛毛雨",
    55: "大毛毛雨",
    56: "冻毛毛雨",
    57: "大冻毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    66: "小冻雨",
    67: "大冻雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    77: "雪粒",
    80: "小阵雨",
    81: "阵雨",
    82: "大阵雨",
    85: "小阵雪",
    86: "大阵雪",
    95: "雷阵雨",
    96: "雷阵雨伴小冰雹",
    99: "雷阵雨伴大冰雹",
  };
  return weatherCodes[code] ?? "未知";
}

/** Get weather icon based on WMO code */
export function getWeatherIcon(code: number): string {
  // Map WMO codes to emoji icons
  if (code === 0) return "\u2600\uFE0F"; // ☀️ Clear
  if (code <= 3) return "\u26C5"; // ⛅ Partly cloudy / Cloudy
  if (code <= 48) return "\uD83C\uDF2B\uFE0F"; // 🌫️ Fog
  if (code <= 57) return "\uD83C\uDF27\uFE0F"; // 🌧️ Drizzle
  if (code <= 67) return "\uD83C\uDF27\uFE0F"; // 🌧️ Rain / Freezing rain
  if (code <= 77) return "\u2744\uFE0F"; // ❄️ Snow
  if (code <= 82) return "\uD83C\uDF27\uFE0F"; // 🌧️ Rain showers
  if (code <= 86) return "\u2744\uFE0F"; // ❄️ Snow showers
  if (code >= 95 && code <= 99) return "\u26C8\uFE0F"; // ⛈️ Thunderstorm
  return "\u2601\uFE0F"; // ☁️ Default cloud
}
