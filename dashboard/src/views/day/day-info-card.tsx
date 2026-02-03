"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Calendar, Thermometer, Droplets, Wind, Sunrise, Sunset, Loader2 } from "lucide-react";
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

export function DayInfoCard({ date, latitude, longitude }: DayInfoCardProps) {
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

  // Format date parts
  const year = format(date, "yyyy");
  const monthDay = format(date, "M月d日", { locale: zhCN });
  const weekday = formatWeekday(date);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardContent className="p-4 min-w-0">
        {/* Date Section */}
        <div className="flex items-center gap-3 mb-3">
          <Calendar className="h-5 w-5 text-primary" />
          <div>
            <div className="text-lg font-bold">
              {monthDay} {weekday}
            </div>
            <div className="text-xs text-muted-foreground">{year}年</div>
          </div>
        </div>

        {/* Weather Section */}
        <div className="border-t pt-3">
          {loading && (
            <div className="flex items-center justify-center py-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm">加载天气数据...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-2 text-sm text-muted-foreground">
              {error}
            </div>
          )}

          {weather && !loading && (
            <div className="space-y-2">
              {/* Weather condition */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getWeatherIcon(weather.weatherCode)}</span>
                  <span className="font-medium">{getWeatherDescription(weather.weatherCode)}</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-primary">
                    {Math.round(weather.tempAvg)}°C
                  </span>
                </div>
              </div>

              {/* Temperature range */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Thermometer className="h-4 w-4" />
                <span>
                  {Math.round(weather.tempMin)}°C ~ {Math.round(weather.tempMax)}°C
                </span>
              </div>

              {/* Additional info row */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {/* Sunrise/Sunset */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Sunrise className="h-3 w-3" />
                    <span>{weather.sunrise}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Sunset className="h-3 w-3" />
                    <span>{weather.sunset}</span>
                  </div>
                </div>

                {/* Precipitation & Wind */}
                <div className="flex items-center gap-3">
                  {weather.precipitation > 0 && (
                    <div className="flex items-center gap-1">
                      <Droplets className="h-3 w-3" />
                      <span>{weather.precipitation.toFixed(1)}mm</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Wind className="h-3 w-3" />
                    <span>{Math.round(weather.windSpeedMax)}km/h</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
