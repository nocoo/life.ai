import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const map = {
    on: vi.fn(),
    off: vi.fn(),
  };
  const featureGroup = {
    addLayer: vi.fn(),
    getLayers: vi.fn(() => [{}]),
  };
  return { featureGroup, map };
});

vi.mock("react-leaflet", async () => {
  const React = await import("react");

  return {
    FeatureGroup: ({ ref }: { ref?: React.Ref<typeof mocks.featureGroup> }) => {
      React.useEffect(() => {
        if (typeof ref === "function") ref(mocks.featureGroup);
        return () => {
          if (typeof ref === "function") ref(null);
        };
      }, [ref]);
      return null;
    },
    useMap: () => mocks.map,
    useMapEvents: vi.fn(),
  };
});

import { MapDrawControl } from "@/components/ui/map";

describe("MapDrawControl", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("subscribes after the feature group ref attaches", async () => {
    const onLayersChange = vi.fn();
    const { unmount } = render(
      <MapDrawControl onLayersChange={onLayersChange} />,
    );

    await waitFor(() => expect(mocks.map.on).toHaveBeenCalledTimes(3));

    const createdCall = mocks.map.on.mock.calls.find(
      ([event]) => event === "draw:created",
    );
    expect(createdCall).toBeDefined();

    const layer = {};
    createdCall?.[1]({ layer });

    expect(mocks.featureGroup.addLayer).toHaveBeenCalledWith(layer);
    expect(onLayersChange).toHaveBeenCalledWith(mocks.featureGroup);

    unmount();
    expect(mocks.map.off).toHaveBeenCalledTimes(3);
  });
});
