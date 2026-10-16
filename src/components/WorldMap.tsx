import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
type Point = { country: string; value: number | null };
export default function WorldMap({
  rows,
  selected,
  onSelect,
  name,
  empty,
}: {
  rows: Point[];
  selected: string;
  onSelect: (c: string) => void;
  name: (c: string) => string;
  empty: string;
}) {
  const div = useRef<HTMLDivElement>(null),
    map = useRef<MLMap | null>(null),
    cache = useRef<any>(null),
    latest = useRef({ rows, selected, onSelect, name, empty });
  latest.current = { rows, selected, onSelect, name, empty };
  const [error, setError] = useState(false);
  function update() {
    if (!map.current || !cache.current) return;
    const vals = new Map(latest.current.rows.map((r) => [r.country, r.value]));
    const max = Math.max(...latest.current.rows.map((r) => r.value ?? 0), 1);
    const features = cache.current.features.map((f: any) => ({
      ...f,
      properties: {
        ...f.properties,
        value: vals.get(f.properties.iso3) ?? null,
        ratio: (vals.get(f.properties.iso3) ?? 0) / max,
        selected: f.properties.iso3 === latest.current.selected,
      },
    }));
    (map.current.getSource("countries") as GeoJSONSource)?.setData({
      ...cache.current,
      features,
    });
  }
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [m, geo] = await Promise.all([
          import("maplibre-gl"),
          fetch("/data/world.geojson").then((r) => r.json()),
        ]);
        if (!alive || !div.current) return;
        cache.current = geo;
        const instance = new m.Map({
          container: div.current,
          style: {
            version: 8,
            sources: {},
            layers: [
              {
                id: "background",
                type: "background",
                paint: { "background-color": "#f3f6f5" },
              },
            ],
          },
          center: [12, 20],
          zoom: 0.75,
          minZoom: -1.5,
          maxZoom: 6,
          renderWorldCopies: false,
          attributionControl: false,
        });
        map.current = instance;
        instance.addControl(
          new m.NavigationControl({ showCompass: false }),
          "top-left",
        );
        instance.addControl(
          new m.AttributionControl({
            compact: true,
            customAttribution: "Natural Earth · Public domain",
          }),
        );
        instance.scrollZoom.disable();
        instance.on("load", () => {
          instance.addSource("countries", { type: "geojson", data: geo });
          instance.addLayer({
            id: "land",
            type: "fill",
            source: "countries",
            paint: {
              "fill-color": [
                "case",
                ["==", ["get", "value"], null],
                "#e0e5e2",
                [
                  "interpolate",
                  ["linear"],
                  ["get", "ratio"],
                  0,
                  "#e0eee5",
                  0.25,
                  "#acd0bc",
                  0.5,
                  "#68a88c",
                  0.75,
                  "#347c63",
                  1,
                  "#15523e",
                ],
              ],
              "fill-opacity": 1,
            },
          });
          instance.addLayer({
            id: "borders",
            type: "line",
            source: "countries",
            paint: { "line-color": "#ffffff", "line-width": 0.55 },
          });
          instance.addLayer({
            id: "selected",
            type: "line",
            source: "countries",
            filter: ["==", ["get", "selected"], true],
            paint: { "line-color": "#d88336", "line-width": 2.5 },
          });
          instance.fitBounds(
            [
              [-180, -58],
              [180, 80],
            ],
            { padding: 12, duration: 0 },
          );
          update();
          instance.once("idle", () =>
            div.current?.setAttribute("data-map-ready", "true"),
          );
        });
        const popup = new m.Popup({ closeButton: false, closeOnClick: false });
        instance.on("mousemove", "land", (e) => {
          instance.getCanvas().style.cursor = "pointer";
          const p = e.features?.[0]?.properties;
          if (!p) return;
          const el = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent =
            latest.current.name(p.iso3) === p.iso3
              ? p.name
              : latest.current.name(p.iso3);
          const v = document.createElement("div");
          v.textContent =
            p.value === null || p.value === undefined
              ? latest.current.empty
              : Number(p.value).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                });
          el.append(title, v);
          popup.setLngLat(e.lngLat).setDOMContent(el).addTo(instance);
        });
        instance.on("mouseleave", "land", () => {
          instance.getCanvas().style.cursor = "";
          popup.remove();
        });
        instance.on("click", "land", (e) => {
          const c = e.features?.[0]?.properties?.iso3;
          if (c) latest.current.onSelect(c);
        });
        instance.on("error", () => setError(true));
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    update();
  }, [rows, selected]);
  return (
    <div className="map-wrap">
      <div
        ref={div}
        className="world-map"
        role="img"
        aria-label="World choropleth map"
      />
      {error && (
        <div className="map-fallback">
          {empty} · WebGL.{" "}
          <a href="#data-table">
            {empty === "Brak danych" ? "Przejdź do tabeli" : "Open data table"}
          </a>
        </div>
      )}
    </div>
  );
}
