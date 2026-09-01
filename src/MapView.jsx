// Network view — the same ontology, projected on a map. Facilities are pins,
// shipments are routes colored by risk, unacked alerts float as callouts
// anchored to their shipment's destination. Clicking anything selects the
// object in the shared detail panel; actions there update the map live.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { IconSvgPaths16 } from '@blueprintjs/icons';
import { FACILITIES, ORIGIN_COORDS } from './data.js';
import COUNTRIES from './assets/countries.json';

const EUROPE_BOUNDS = L.latLngBounds([39.0, -6.5], [56.5, 20.5]);
// keep drawn geometry inside this frame so long routes don't run off to nowhere
const CLIP_BOUNDS = L.latLngBounds([34.5, -11.0], [58.0, 24.5]);

// If an origin lies outside the clip frame (e.g. Shanghai), cut the route at
// the frame edge and mark it there — a line running off-screen reads as noise.
function clampOrigin(from, dest) {
    if (CLIP_BOUNDS.contains(L.latLng(from))) return { point: from, clipped: false };
    let t = 1;
    const clampAxis = (d, o, min, max) => {
        const delta = o - d;
        if (!delta) return 1;
        const lim = delta > 0 ? max : min;
        return Math.max(0, Math.min(1, (lim - d) / delta));
    };
    t = Math.min(
        clampAxis(dest[0], from[0], CLIP_BOUNDS.getSouth(), CLIP_BOUNDS.getNorth()),
        clampAxis(dest[1], from[1], CLIP_BOUNDS.getWest(), CLIP_BOUNDS.getEast()),
    );
    return { point: [dest[0] + (from[0] - dest[0]) * t, dest[1] + (from[1] - dest[1]) * t], clipped: true };
}

function riskColor(score) {
    return score > 60 ? '#f87171' : score > 35 ? '#fbbf24' : '#34d399';
}

// Blueprint's own icon paths, inlined into Leaflet divIcons so map glyphs
// match the rest of the UI exactly.
function bpSvg(name, size = 12) {
    const paths = IconSvgPaths16[name] || [];
    return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="currentColor">` +
        paths.map(d => `<path d="${d}" fill-rule="evenodd"/>`).join('') + '</svg>';
}
const MODE_ICON = { Road: 'Truck', Rail: 'Train', Ocean: 'CargoShip' };

export default function MapView({ shipments, alerts, selectedId, onSelect }) {
    const hostRef = useRef(null);
    const mapRef = useRef(null);
    const layersRef = useRef(null);

    // one-time map setup
    useEffect(() => {
        const map = L.map(hostRef.current, {
            zoomControl: true,
            attributionControl: true,
            scrollWheelZoom: true,
            // half-level steps make wheel zoom feel smooth instead of jumpy
            zoomSnap: 0.5,
            zoomDelta: 0.5,
            wheelPxPerZoomLevel: 90,
        });
        map.attributionControl.setPrefix(false);
        map.attributionControl.addAttribution('Basemap: Natural Earth');
        map.setMinZoom(3); map.setMaxZoom(8);
        // Flat vector base — country outlines only, no raster tiles. Quieter,
        // fully offline, and nothing to flash while zooming.
        L.geoJSON(COUNTRIES, {
            style: {
                color: 'rgba(255,255,255,0.14)', weight: 1,
                fillColor: '#161b22', fillOpacity: 1, interactive: false,
            },
        }).addTo(map);
        map.fitBounds(EUROPE_BOUNDS, { padding: [10, 10] });
        layersRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        // the pane mounts inside a grid — make sure Leaflet measures it right
        setTimeout(() => map.invalidateSize(), 60);
        return () => { map.remove(); mapRef.current = null; };
    }, []);

    // redraw overlays whenever the data or selection changes
    useEffect(() => {
        const map = mapRef.current, layers = layersRef.current;
        if (!map || !layers) return;
        layers.clearLayers();
        const facilityById = Object.fromEntries(FACILITIES.map(f => [f.id, f]));

        // ---- shipment routes ----
        const originStops = {};   // city -> {point, clipped, cities' shipments touch it}
        shipments.forEach(s => {
            const rawFrom = ORIGIN_COORDS[s.origin];
            const dest = facilityById[s.destId];
            if (!rawFrom || !dest) return;
            const { point: from, clipped } = clampOrigin(rawFrom, [dest.lat, dest.lng]);
            originStops[s.origin] = { point: from, clipped };
            const isSel = s.id === selectedId;
            const line = L.polyline([from, [dest.lat, dest.lng]], {
                color: riskColor(s.riskScore),
                weight: isSel ? 4 : 2,
                opacity: isSel ? 0.95 : 0.55,
                dashArray: s.status === 'Delivered' ? '2 8' : s.status === 'Loading' ? '6 6' : null,
            });
            line.bindTooltip(`${s.id} · ${s.origin} → ${dest.name} · ${s.status}`, { sticky: true, direction: 'top' });
            line.on('click', () => onSelect(s.id));
            layers.addLayer(line);
            // mode chip at the route midpoint for in-motion shipments
            if (s.status === 'In transit' || s.status === 'Delayed') {
                const mid = [(from[0] + dest.lat) / 2, (from[1] + dest.lng) / 2];
                const c = riskColor(s.riskScore);
                const chip = L.divIcon({
                    className: '',
                    html: `<div class="map-chip${isSel ? ' map-chip--sel' : ''}" style="border-color:${c};color:${c}">${bpSvg(MODE_ICON[s.mode] || 'Truck', 11)}</div>`,
                    iconSize: [22, 22], iconAnchor: [11, 11],
                });
                const dot = L.marker(mid, { icon: chip, zIndexOffset: isSel ? 400 : 300 });
                dot.bindTooltip(`${s.id} · ${s.mode} · ETA ${s.etaH}h`, { direction: 'top' });
                dot.on('click', () => onSelect(s.id));
                layers.addLayer(dot);
            }
        });

        // ---- facility pins ----
        FACILITIES.forEach(f => {
            const icon = L.divIcon({
                className: '',
                html: `<div class="map-fac">${bpSvg('Office', 11)}<span class="map-fac__name">${f.name}</span><span class="map-fac__cap">${f.capacityPct}%</span></div>`,
                iconSize: null, iconAnchor: [10, 10],
            });
            const m = L.marker([f.lat, f.lng], { icon, zIndexOffset: 500 });
            m.bindTooltip(`${f.kind} · ${f.region} · ${f.capacityPct}% capacity`, { direction: 'bottom' });
            layers.addLayer(m);
        });

        // ---- origin city dots (deduped) — routes start somewhere visible ----
        Object.entries(originStops).forEach(([city, o]) => {
            const icon = L.divIcon({
                className: '',
                html: `<div class="map-origin"><span class="map-origin__dot"></span>${city}${o.clipped ? ' →' : ''}</div>`,
                iconSize: null, iconAnchor: [4, 4],
            });
            layers.addLayer(L.marker(o.point, { icon, zIndexOffset: 200, interactive: false }));
        });

        // ---- alert callouts (unacked only), stacked per destination ----
        const stackAt = {};
        alerts.filter(a => !a.acked).forEach(a => {
            const s = shipments.find(x => x.id === a.shipmentId);
            if (!s) return;                        // filtered out — no callout
            const dest = facilityById[s.destId];
            if (!dest) return;
            const n = (stackAt[s.destId] = (stackAt[s.destId] || 0) + 1);
            const icon = L.divIcon({
                className: '',
                html: `<div class="map-callout map-callout--${a.severity}">
                         <span class="map-callout__pin">${bpSvg('WarningSign', 10)}</span> ${a.kind} · <b>${s.id}</b>
                       </div>`,
                iconSize: null, iconAnchor: [-14, 44 + (n - 1) * 34],
            });
            const m = L.marker([dest.lat, dest.lng], { icon, zIndexOffset: 1000 });
            m.on('click', () => onSelect(s.id));
            layers.addLayer(m);
        });
    }, [shipments, alerts, selectedId, onSelect]);

    return <div ref={hostRef} className="map-host" />;
}
