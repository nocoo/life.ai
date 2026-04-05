"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

interface GoogleMapProps {
  center: { lat: number; lng: number };
  zoom: number;
  polyline?: { lat: number; lng: number }[];
  bounds?: { north: number; south: number; east: number; west: number };
  className?: string;
}

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

// Track if options have been set
let optionsInitialized = false;

function ensureOptions() {
  if (!optionsInitialized && GOOGLE_MAPS_API_KEY) {
    setOptions({
      key: GOOGLE_MAPS_API_KEY,
      v: "weekly",
    });
    optionsInitialized = true;
  }
}

export function GoogleMap({ center, zoom, polyline, bounds, className }: GoogleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const polylineInstanceRef = useRef<google.maps.Polyline | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const initMap = useCallback(async () => {
    if (!mapRef.current || !GOOGLE_MAPS_API_KEY) return;

    ensureOptions();

    // Import the maps library
    const mapsLib = await importLibrary("maps");

    const map = new mapsLib.Map(mapRef.current, {
      center,
      zoom,
      disableDefaultUI: true,
      zoomControl: true,
      zoomControlOptions: {
        position: google.maps.ControlPosition.TOP_RIGHT,
      },
      styles: [
        // Subtle blue-green tint
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#a2daf2" }],
        },
        {
          featureType: "landscape",
          elementType: "geometry",
          stylers: [{ color: "#e8f4f0" }],
        },
        {
          featureType: "road",
          elementType: "geometry",
          stylers: [{ color: "#ffffff" }],
        },
        {
          featureType: "road",
          elementType: "geometry.stroke",
          stylers: [{ color: "#d4e8e2" }],
        },
        {
          featureType: "poi",
          elementType: "geometry",
          stylers: [{ color: "#d4e8e2" }],
        },
        {
          featureType: "transit",
          elementType: "geometry",
          stylers: [{ color: "#d4e8e2" }],
        },
      ],
    });

    mapInstanceRef.current = map;

    // Draw polyline if provided
    if (polyline && polyline.length > 0) {
      polylineInstanceRef.current = new google.maps.Polyline({
        path: polyline,
        geodesic: true,
        strokeColor: "#3b82f6", // blue-500
        strokeOpacity: 1.0,
        strokeWeight: 2,
      });
      polylineInstanceRef.current.setMap(map);
    }

    // Fit bounds if provided
    if (bounds) {
      const latLngBounds = new google.maps.LatLngBounds(
        { lat: bounds.south, lng: bounds.west },
        { lat: bounds.north, lng: bounds.east }
      );
      map.fitBounds(latLngBounds, 30); // 30px padding
    }

    setIsLoading(false);
  }, [center, zoom, polyline, bounds]);

  useEffect(() => {
    initMap();
  }, [initMap]);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground text-sm ${className}`}>
        Google Maps API key not configured
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={mapRef} className="h-full w-full" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-sm">
          Loading map...
        </div>
      )}
    </div>
  );
}
