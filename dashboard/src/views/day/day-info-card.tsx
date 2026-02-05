"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Droplets, Wind, Sunrise, Sunset, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { fetchHistoricalWeather } from "@/services/weather-service";
import { getWeatherDescription, getWeatherIcon, type DayWeather } from "@/models/weather";

export interface DayInfoCardProps {
  date: Date;
  /** Optional coordinates for weather lookup (defaults to Beijing) */
  latitude?: number;
  longitude?: number;
}

/** Format weekday in Chinese */
const formatWeekday = (date: Date): string => {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return weekdays[date.getDay()];
};

/** Date Card - Simple date display */
export function DateCard({ date }: { date: Date }) {
  const dateStr = format(date, "yyyy年M月d日", { locale: zhCN });
  const weekday = formatWeekday(date);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardContent className="py-1.5 px-3 flex items-center justify-between">
        <span className="font-medium text-sm">{dateStr}</span>
        <span className="text-xs text-muted-foreground">{weekday}</span>
      </CardContent>
    </Card>
  );
}

/** Weather Card - Left-right layout with icon and details */
export function WeatherCard({ date, latitude, longitude }: DayInfoCardProps) {
  const [weather, setWeather] = useState<DayWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadWeather = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchHistoricalWeather(date, latitude, longitude);
        if (!cancelled) {
          setWeather(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载天气失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadWeather();

    return () => {
      cancelled = true;
    };
  }, [date, latitude, longitude]);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardContent className="py-1.5 px-3">
        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center text-muted-foreground py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" aria-label="加载中" />
            <span className="text-xs">加载中…</span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="text-center text-xs text-muted-foreground py-1">
            {error}
          </div>
        )}

        {/* Weather content - Left/Right layout */}
        {weather && !loading && (
          <div className="flex gap-2.5 items-center">
            {/* Left: Large weather icon with description */}
            <div className="flex-shrink-0 text-center">
              <span className="text-4xl" role="img" aria-label={getWeatherDescription(weather.weatherCode)}>{getWeatherIcon(weather.weatherCode)}</span>
              <p className="text-[10px] text-muted-foreground">{getWeatherDescription(weather.weatherCode)}</p>
            </div>

            {/* Right: Weather details - all right-aligned */}
            <div className="flex-1 min-w-0 text-right">
              {/* Temperature range */}
              <div className="text-base font-medium tabular-nums">
                {Math.round(weather.tempMin)}° ~ {Math.round(weather.tempMax)}°C
              </div>

              {/* Row 1: Sunrise & Sunset */}
              <div className="flex justify-end gap-2.5 text-[10px] text-muted-foreground mt-0.5">
                <span className="flex items-center gap-0.5 tabular-nums">
                  <Sunrise className="h-2.5 w-2.5" aria-hidden="true" />
                  {weather.sunrise}
                </span>
                <span className="flex items-center gap-0.5 tabular-nums">
                  <Sunset className="h-2.5 w-2.5" aria-hidden="true" />
                  {weather.sunset}
                </span>
              </div>

              {/* Row 2: Precipitation & Wind */}
              <div className="flex justify-end gap-2.5 text-[10px] text-muted-foreground mt-0.5">
                <span className="flex items-center gap-0.5 tabular-nums">
                  <Droplets className="h-2.5 w-2.5" aria-hidden="true" />
                  {weather.precipitation.toFixed(1)}mm
                </span>
                <span className="flex items-center gap-0.5 tabular-nums">
                  <Wind className="h-2.5 w-2.5" aria-hidden="true" />
                  {Math.round(weather.windSpeedMax)}km/h
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Combined Day Info Cards - Date and Weather */
export function DayInfoCard({ date, latitude, longitude }: DayInfoCardProps) {
  return (
    <>
      <DateCard date={date} />
      <WeatherCard date={date} latitude={latitude} longitude={longitude} />
    </>
  );
}
