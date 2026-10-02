"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import type {
    LatLngExpression,
    Map as LeafletMap,
    Polyline,
    TileLayer,
} from "leaflet"
import "leaflet/dist/leaflet.css"
import { MinusIcon, PlusIcon } from "lucide-react"
import { useTheme } from "next-themes"
import React, {
    Suspense,
    lazy,
    useEffect,
    useRef,
    useState,
    type ComponentType,
    type Ref,
} from "react"
import {
    useMap,
    useMapEvents,
    type MapContainerProps,
    type PolylineProps,
    type TileLayerProps,
} from "react-leaflet"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createLazyComponent<T extends ComponentType<any>>(
    factory: () => Promise<{ default: T }>
) {
    const LazyComponent = lazy(factory)

    const Component = (props: React.ComponentProps<T>) => {
        const [isMounted, setIsMounted] = useState(false)

        useEffect(() => {
            setIsMounted(true)
        }, [])

        if (!isMounted) {
            return null
        }

        return (
            <Suspense>
                <LazyComponent {...props} />
            </Suspense>
        )
    }
    Component.displayName = "LazyComponent"
    return Component
}

const LeafletMapContainer = createLazyComponent(() =>
    import("react-leaflet").then((mod) => ({
        default: mod.MapContainer,
    }))
)
const LeafletTileLayer = createLazyComponent(() =>
    import("react-leaflet").then((mod) => ({
        default: mod.TileLayer,
    }))
)
const LeafletPolyline = createLazyComponent(() =>
    import("react-leaflet").then((mod) => ({
        default: mod.Polyline,
    }))
)

function Map({
    zoom = 15,
    maxZoom = 18,
    className,
    ...props
}: Omit<MapContainerProps, "zoomControl"> & {
    center: LatLngExpression
    ref?: Ref<LeafletMap>
}) {
    return (
        <LeafletMapContainer
            zoom={zoom}
            maxZoom={maxZoom}
            attributionControl={false}
            zoomControl={false}
            className={cn(
                "z-50 size-full min-h-96 flex-1 rounded-md",
                className
            )}
            {...props}
        />
    )
}

function MapTileLayer({
    name = "Default",
    url,
    attribution,
    darkUrl,
    darkAttribution,
    ...props
}: Partial<TileLayerProps> & {
    name?: string
    darkUrl?: string
    darkAttribution?: string
    ref?: Ref<TileLayer>
}) {
    void name
    const map = useMap()
    if (map.attributionControl) {
        map.attributionControl.setPrefix("")
    }

    const DEFAULT_URL =
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
    const DEFAULT_DARK_URL =
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"

    const { resolvedTheme } = useTheme()
    const resolvedUrl =
        resolvedTheme === "dark"
            ? (darkUrl ?? url ?? DEFAULT_DARK_URL)
            : (url ?? DEFAULT_URL)
    const resolvedAttribution =
        resolvedTheme === "dark" && darkAttribution
            ? darkAttribution
            : (attribution ??
              '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>')

    return (
        <LeafletTileLayer
            url={resolvedUrl}
            attribution={resolvedAttribution}
            {...props}
        />
    )
}

function MapPolyline({
    className,
    ...props
}: PolylineProps & { ref?: Ref<Polyline> }) {
    return (
        <LeafletPolyline
            className={cn(
                "fill-foreground stroke-foreground stroke-2",
                className
            )}
            {...props}
        />
    )
}

function MapZoomControl({
    position = "top-1 left-1",
    className,
    ...props
}: React.ComponentProps<"div"> & { position?: string }) {
    const map = useMap()
    const [zoomLevel, setZoomLevel] = useState(map.getZoom())

    useMapEvents({
        zoomend: () => {
            setZoomLevel(map.getZoom())
        },
    })

    return (
        <MapControlContainer className={cn(position, className)}>
            <ButtonGroup
                orientation="vertical"
                aria-label="Zoom controls"
                {...props}>
                <Button
                    type="button"
                    size="icon-sm"
                    variant="secondary"
                    aria-label="Zoom in"
                    title="Zoom in"
                    className="border"
                    disabled={zoomLevel >= map.getMaxZoom()}
                    onClick={() => map.zoomIn()}>
                    <PlusIcon />
                </Button>
                <Button
                    type="button"
                    size="icon-sm"
                    variant="secondary"
                    aria-label="Zoom out"
                    title="Zoom out"
                    className="border"
                    disabled={zoomLevel <= map.getMinZoom()}
                    onClick={() => map.zoomOut()}>
                    <MinusIcon />
                </Button>
            </ButtonGroup>
        </MapControlContainer>
    )
}

function MapControlContainer({
    className,
    ...props
}: React.ComponentPropsWithoutRef<"div">) {
    const { L } = useLeaflet()
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!L) return
        const element = containerRef.current
        if (!element) return
        L.DomEvent.disableClickPropagation(element)
        L.DomEvent.disableScrollPropagation(element)
    }, [L])

    return (
        <div
            ref={containerRef}
            className={cn("absolute z-1000 size-fit cursor-default", className)}
            {...props}
        />
    )
}

function useLeaflet() {
    const [L, setL] = useState<typeof import("leaflet") | null>(null)

    useEffect(() => {
        async function loadLeaflet() {
            const leaflet = await import("leaflet")
            setL(leaflet.default)
        }

        if (L) return
        if (typeof window === "undefined") return

        loadLeaflet()
    }, [L])

    return { L }
}

export {
    Map,
    MapPolyline,
    MapTileLayer,
    MapZoomControl,
}
