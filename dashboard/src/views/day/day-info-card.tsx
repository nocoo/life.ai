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
      <CardContent className="py-3 flex items-center justify-between">
        <span className="font-medium">{dateStr}</span>
        <span className="text-sm text-muted-foreground">{weekday}</span>
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
      <CardContent className="py-3">
        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm">加载中...</span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="text-center text-sm text-muted-foreground">
            {error}
          </div>
        )}

        {/* Weather content - Left/Right layout */}
        {weather && !loading && (
          <div className="flex gap-3 items-center">
            {/* Left: Weather icon */}
            <div className="flex-shrink-0 text-center">
              <span className="text-4xl">{getWeatherIcon(weather.weatherCode)}</span>
              <p className="text-xs text-muted-foreground">{getWeatherDescription(weather.weatherCode)}</p>
            </div>

            {/* Right: Weather details */}
            <div className="flex-1 min-w-0">
              {/* Temperature row */}
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-bold">{Math.round(weather.tempAvg)}°C</span>
                <span className="text-sm text-muted-foreground">
                  {Math.round(weather.tempMin)}° ~ {Math.round(weather.tempMax)}°
                </span>
              </div>

              {/* Details row */}
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <div className="flex gap-2">
                  <span className="flex items-center gap-0.5">
                    <Sunrise className="h-3 w-3" />
                    {weather.sunrise}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Sunset className="h-3 w-3" />
                    {weather.sunset}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="flex items-center gap-0.5">
                    <Droplets className="h-3 w-3" />
                    {weather.precipitation.toFixed(1)}mm
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Wind className="h-3 w-3" />
                    {Math.round(weather.windSpeedMax)}km/h
                  </span>
                </div>
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
