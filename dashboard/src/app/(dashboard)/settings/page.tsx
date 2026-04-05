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
  { value: "carto", label: "CARTO (Default)" },
  { value: "google", label: "Google Maps" },
];

export default function SettingsPage() {
  const { mapProvider, setMapProvider } = useSettingsStore();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-4">General Settings</h2>
        <div className="rounded-card bg-secondary p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="map-provider">Map Provider</Label>
              <p className="text-sm text-muted-foreground">
                Choose the map tile provider for track visualization
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
