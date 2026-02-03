import { format } from "date-fns";
import type { DayWeather } from "@/models/weather";

/** Open-Meteo Historical Weather API response */
interface OpenMeteoResponse {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    temperature_2m_mean: number[];
    weather_code: number[];
    precipitation_sum: number[];
    sunrise: string[];
    sunset: string[];
    wind_speed_10m_max: number[];
  };
}

/** Beijing coordinates */
const BEIJING_LAT = 39.9042;
const BEIJING_LON = 116.4074;

/**
 * Fetch historical weather data from Open-Meteo API
 * @param date - The date to fetch weather for
 * @param latitude - Optional latitude (defaults to Beijing)
 * @param longitude - Optional longitude (defaults to Beijing)
 * @returns Weather data for the specified day
 */
export async function fetchHistoricalWeather(
  date: Date,
  latitude: number = BEIJING_LAT,
  longitude: number = BEIJING_LON
): Promise<DayWeather> {
  const dateStr = format(date, "yyyy-MM-dd");

  // Build the API URL
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    start_date: dateStr,
    end_date: dateStr,
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "temperature_2m_mean",
      "weather_code",
      "precipitation_sum",
      "sunrise",
      "sunset",
      "wind_speed_10m_max",
    ].join(","),
    timezone: "Asia/Shanghai",
  });

  const url = `https://archive-api.open-meteo.com/v1/archive?${params}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }

  const data: OpenMeteoResponse = await response.json();

  // Validate response data
  if (!data.daily || !data.daily.time || data.daily.time.length === 0) {
    throw new Error("No weather data available for this date");
  }

  // Extract time from ISO datetime (e.g., "2025-12-02T07:13:00" -> "07:13")
  const extractTime = (isoDateTime: string): string => {
    const match = isoDateTime.match(/T(\d{2}:\d{2})/);
    return match ? match[1] : "--:--";
  };

  return {
    date: dateStr,
    tempMax: data.daily.temperature_2m_max[0],
    tempMin: data.daily.temperature_2m_min[0],
    tempAvg: data.daily.temperature_2m_mean[0],
    weatherCode: data.daily.weather_code[0],
    precipitation: data.daily.precipitation_sum[0],
    sunrise: extractTime(data.daily.sunrise[0]),
    sunset: extractTime(data.daily.sunset[0]),
    windSpeedMax: data.daily.wind_speed_10m_max[0],
  };
}
