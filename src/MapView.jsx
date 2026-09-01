// Network view — the same ontology, projected on a map. Facilities are pins,
// shipments are routes colored by risk, unacked alerts float as callouts
// anchored to their shipment's destination. Clicking anything selects the
// object in the shared detail panel; actions there update the map live.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FACILITIES, ORIGIN_COORDS } from './data.js';

const EUROPE_BOUNDS = L.latLngBounds([39.0, -6.5], [56.5, 20.5]);

function riskColor(score) {
    return score > 60 ? '#f87171' : score > 35 ? '#fbbf24' : '#34d399';
}

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
        });
        map.attributionControl.setPrefix(false);
        // Standard OSM tiles, darkened with a CSS filter (see .map-dark-tiles in
        // index.css) — no API key required, honest attribution kept.
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 12, minZoom: 3, className: 'map-dark-tiles',
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
        shipments.forEach(s => {
            const from = ORIGIN_COORDS[s.origin];
            const dest = facilityById[s.destId];
            if (!from || !dest) return;
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
            // moving-dot midpoint marker for in-motion shipments
            if (s.status === 'In transit' || s.status === 'Delayed') {
                const mid = [(from[0] + dest.lat) / 2, (from[1] + dest.lng) / 2];
                const dot = L.circleMarker(mid, {
                    radius: isSel ? 6 : 4, color: riskColor(s.riskScore),
                    fillColor: riskColor(s.riskScore), fillOpacity: 0.9, weight: 1,
                });
                dot.bindTooltip(`${s.id} · ETA ${s.etaH}h`, { direction: 'top' });
                dot.on('click', () => onSelect(s.id));
                layers.addLayer(dot);
            }
        });

        // ---- facility pins ----
        FACILITIES.forEach(f => {
            const icon = L.divIcon({
                className: '',
                html: `<div class="map-fac"><span class="map-fac__name">${f.name}</span><span class="map-fac__cap">${f.capacityPct}%</span></div>`,
                iconSize: null, iconAnchor: [10, 10],
            });
            const m = L.marker([f.lat, f.lng], { icon, zIndexOffset: 500 });
            m.bindTooltip(`${f.kind} · ${f.region} · ${f.capacityPct}% capacity`, { direction: 'bottom' });
            layers.addLayer(m);
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
                         <span class="map-callout__pin">▲</span> ${a.kind} · <b>${s.id}</b>
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
