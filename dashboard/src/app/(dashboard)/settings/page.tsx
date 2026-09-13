"use client";

import { useSettingsStore, type MapProvider } from "@/viewmodels/settings-store";
import { Label } from "@nocoo/basalt";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nocoo/basalt/components/select";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SectionRule } from "@nocoo/basalt/components/section-rule";

const MAP_PROVIDERS: { value: MapProvider; label: string }[] = [
  { value: "carto", label: "CARTO（默认）" },
  { value: "google", label: "Google 地图" },
];

export default function SettingsPage() {
  const { mapProvider, setMapProvider } = useSettingsStore();

  return (
    <div className="space-y-6">
      <PageHeader title="设置" description="配置 Life.ai 的本地显示偏好。" />
      <SectionRule title="通用设置">
        <LayerCard>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="map-provider">地图服务商</Label>
              <p className="text-sm text-basalt-muted-foreground">
                选择轨迹可视化的地图瓦片服务商
              </p>
            </div>
            <Select
              value={mapProvider}
              onValueChange={(value) => setMapProvider(value as MapProvider)}
            >
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
        </LayerCard>
      </SectionRule>
    </div>
  );
}
