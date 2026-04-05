"use client";

import { useSettingsStore, type MapProvider } from "@/viewmodels/settings-store";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAP_PROVIDERS: { value: MapProvider; label: string }[] = [
  { value: "carto", label: "CARTO（默认）" },
  { value: "google", label: "Google 地图" },
];

export default function SettingsPage() {
  const { mapProvider, setMapProvider } = useSettingsStore();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-4">通用设置</h2>
        <div className="rounded-card bg-secondary p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="map-provider">地图服务商</Label>
              <p className="text-sm text-muted-foreground">
                选择轨迹可视化的地图瓦片服务商
              </p>
            </div>
            <Select value={mapProvider} onValueChange={(v: MapProvider) => setMapProvider(v)}>
              <SelectTrigger id="map-provider" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MAP_PROVIDERS.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
