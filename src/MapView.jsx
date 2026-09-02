// Network view — the same ontology, projected on a map. Facilities are pins,
// shipments are routes colored by risk, unacked alerts float as callouts;
// the top open alert gets a full "control tower" card with an AI-analyzing
// shimmer, and the selected shipment's destination gets a pulse ring.
// A layers panel in the left rail explains the encoding and toggles layers.
import { useEffect, useRef } from 'react';
import { Checkbox, Button } from '@blueprintjs/core';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { IconSvgPaths16 } from '@blueprintjs/icons';
import { FACILITIES, ORIGIN_COORDS, MAP_LABELS } from './data.js';
import COUNTRIES from './assets/countries.json';

const EUROPE_BOUNDS = L.latLngBounds([39.0, -6.5], [56.5, 20.5]);
// keep drawn geometry inside this frame so long routes don't run off to nowhere
const CLIP_BOUNDS = L.latLngBounds([34.5, -11.0], [58.0, 24.5]);

// If an origin lies outside the clip frame (e.g. Shanghai), cut the route at
// the frame edge and mark it there — a line running off-screen reads as noise.
function clampOrigin(from, dest) {
    if (CLIP_BOUNDS.contains(L.latLng(from))) return { point: from, clipped: false };
    const clampAxis = (d, o, min, max) => {
        const delta = o - d;
        if (!delta) return 1;
        const lim = delta > 0 ? max : min;
        return Math.max(0, Math.min(1, (lim - d) / delta));
    };
    const t = Math.min(
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

export const DEFAULT_MAP_LAYERS = {
    routes: true, transit: true, facilities: true, alerts: true, origins: true,
};
export const DEFAULT_OVERLAYS = { temp: false, rain: false, wind: false, pop: false };

// Decorative environmental overlays: hand-placed soft blobs, the way a
// control tower layers weather over the network. [lat, lng, radius km]
const OVERLAY_BLOBS = {
    temp: { color: '#f59e0b', spots: [[40.4, -3.7, 260], [38.5, -1.0, 220], [41.9, 12.5, 240], [37.4, -5.9, 210], [43.6, 3.9, 180]] },
    rain: { color: '#3b82f6', spots: [[54.5, -2.5, 240], [56.6, 4.0, 280], [53.3, -7.0, 210], [55.6, 10.0, 220]] },
    wind: { color: '#22d3ee', spots: [[48.0, -8.0, 300], [51.5, -10.0, 260], [44.5, -8.5, 240]] },
    pop:  { color: '#a78bfa', spots: [[51.5, -0.1, 120], [48.85, 2.35, 120], [52.5, 13.4, 110], [41.4, 2.2, 100], [45.46, 9.19, 100], [50.1, 8.7, 95], [52.23, 21.0, 100]] },
};
const OVERLAY_META = [
    { key: 'temp', icon: 'temperature', label: 'Land surface temperature' },
    { key: 'rain', icon: 'rain', label: 'Precipitation rate (daily)' },
    { key: 'wind', icon: 'flash', label: 'Wind speed' },
    { key: 'pop', icon: 'people', label: 'Population density' },
];

// Rendered in the left rail (next to the ontology) while the map is open.
export function MapLayersPanel({ show, onToggle, overlays, onToggleOverlay, shipments, alerts }) {
    const inMotion = shipments.filter(s => s.status === 'In transit' || s.status === 'Delayed').length;
    const openAlerts = alerts.filter(a => !a.acked).length;
    const row = (key, label, count, swatch) => (
        <div className="obj-row">
            <Checkbox checked={show[key]} onChange={() => onToggle(key)}
                labelElement={<span><span className={'obj-swatch ' + swatch} />{label}
                    {count != null && <span className="dim"> ({count})</span>}</span>} />
        </div>
    );
    return (
        <div className="map-panel">
            <div className="rail-title">OBJECTS</div>
            {row('routes', 'Deliveries — routes', shipments.length, 'obj-swatch--ramp')}
            {row('transit', 'In motion', inMotion, 'obj-swatch--teal')}
            {row('facilities', 'Facilities', FACILITIES.length, 'obj-swatch--violet')}
            {row('alerts', 'Open alerts', openAlerts, 'obj-swatch--red')}
            {row('origins', 'Origin cities', null, 'obj-swatch--grey')}

            <div className="risk-ramp">
                <div className="risk-ramp__bar" />
                <div className="risk-ramp__scale"><span>0</span><span>Risk score</span><span>100</span></div>
            </div>

            <div className="rail-title">OVERLAYS</div>
            {OVERLAY_META.map(o => (
                <div key={o.key} className={'overlay-row' + (overlays[o.key] ? ' overlay-row--on' : '')}>
                    <span className="overlay-row__label">{o.label}</span>
                    <Button variant="minimal" size="small" icon={overlays[o.key] ? 'eye-open' : 'eye-off'}
                        aria-label={`Toggle ${o.label}`} onClick={() => onToggleOverlay(o.key)} />
                </div>
            ))}

            <div className="rail-title">READING THE MAP</div>
            <div className="legend-row"><span className="legend-duo"><span className="legend-duo__solid" /><span className="legend-duo__dash" /></span> Travelled · remaining</div>
            <div className="legend-row"><span className="legend-line legend-line--dash" /> Loading / delivered</div>
            <div className="legend-row"><span className="legend-line legend-line--thick" style={{ background: '#34d399' }} /> Selected shipment</div>
            <div className="legend-row legend-row--hint">A route runs origin city → facility. Click anything to inspect it.</div>
        </div>
    );
}

export default function MapView({ shipments, alerts, selectedId, onSelect, show = DEFAULT_MAP_LAYERS, overlays = DEFAULT_OVERLAYS }) {
    const hostRef = useRef(null);
    const mapRef = useRef(null);
    const layersRef = useRef(null);

    // one-time map setup
    useEffect(() => {
        const map = L.map(hostRef.current, {
            zoomControl: false,
            attributionControl: true,
            scrollWheelZoom: true,
            // half-level steps make wheel zoom feel smooth instead of jumpy
            zoomSnap: 0.5,
            zoomDelta: 0.5,
            wheelPxPerZoomLevel: 90,
        });
        L.control.zoom({ position: 'topright' }).addTo(map);
        map.attributionControl.setPrefix(false);
        map.attributionControl.addAttribution('Basemap: Natural Earth');
        map.setMinZoom(3); map.setMaxZoom(8);
        // Flat vector base — country outlines only, no raster tiles. Quieter,
        // fully offline, and nothing to flash while zooming.
        L.geoJSON(COUNTRIES, {
            style: {
                color: 'rgba(255,255,255,0.12)', weight: 1,
                fillColor: '#1d1a24', fillOpacity: 1, interactive: false,
            },
        }).addTo(map);
        // ambient country labels — quiet chrome, non-interactive
        MAP_LABELS.forEach(l => {
            L.marker(l.at, {
                interactive: false, zIndexOffset: 50,
                icon: L.divIcon({ className: '', iconSize: null, iconAnchor: [30, 6], html: `<div class="map-country">${l.name}</div>` }),
            }).addTo(map);
        });
        map.fitBounds(EUROPE_BOUNDS, { padding: [10, 10] });
        layersRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        // the pane mounts inside a grid — make sure Leaflet measures it right.
        // The timer MUST be cleared on unmount: leaving the map view within
        // ~60ms (fast tab flips) otherwise fires invalidateSize on a removed map.
        const sizeTimer = setTimeout(() => map.invalidateSize(), 60);
        return () => { clearTimeout(sizeTimer); map.remove(); mapRef.current = null; };
    }, []);

    // redraw overlays whenever the data, selection or layer toggles change
    useEffect(() => {
        const map = mapRef.current, layers = layersRef.current;
        if (!map || !layers) return;
        layers.clearLayers();
        const facilityById = Object.fromEntries(FACILITIES.map(f => [f.id, f]));

        // ---- environmental overlays (below everything else) ----
        Object.entries(OVERLAY_BLOBS).forEach(([key, cfg]) => {
            if (!overlays[key]) return;
            cfg.spots.forEach(([lat, lng, km]) => {
                layers.addLayer(L.circle([lat, lng], { radius: km * 1000, stroke: false, fillColor: cfg.color, fillOpacity: 0.10, interactive: false }));
                layers.addLayer(L.circle([lat, lng], { radius: km * 550, stroke: false, fillColor: cfg.color, fillOpacity: 0.08, interactive: false }));
            });
        });

        // ---- shipment routes ----
        const originStops = {};   // city -> clamped point, deduped across shipments
        shipments.forEach(s => {
            const rawFrom = ORIGIN_COORDS[s.origin];
            const dest = facilityById[s.destId];
            if (!rawFrom || !dest) return;
            const { point: from, clipped } = clampOrigin(rawFrom, [dest.lat, dest.lng]);
            originStops[s.origin] = { point: from, clipped };
            const isSel = s.id === selectedId;
            const c = riskColor(s.riskScore);
            const inMotion = s.status === 'In transit' || s.status === 'Delayed';
            const tip = `${s.id} · ${s.origin} → ${dest.name} · ${s.status}`;
            const wire = (line) => {
                line.bindTooltip(tip, { sticky: true, direction: 'top' });
                line.on('click', () => onSelect(s.id));
                layers.addLayer(line);
            };
            const drawnAsProgress = show.transit && inMotion;
            // Base routes are a faint background net; when the in-motion layer
            // already draws a shipment's progress path, skip its base route so
            // the two layers compose instead of stacking.
            if (show.routes && !drawnAsProgress) {
                wire(L.polyline([from, [dest.lat, dest.lng]], {
                    color: c,
                    weight: isSel ? 3.5 : 2,
                    opacity: isSel ? 0.9 : 0.22,
                    dashArray: s.status === 'Delivered' ? '2 8' : s.status === 'Loading' ? '6 6' : null,
                }));
            }
            // In-motion: travelled part solid, remaining part dashed, chip at
            // the estimated position (derived from remaining ETA, ~48h trips).
            if (drawnAsProgress) {
                const t = Math.min(0.9, Math.max(0.1, 1 - s.etaH / 48));
                const pos = [from[0] + (dest.lat - from[0]) * t, from[1] + (dest.lng - from[1]) * t];
                const w = isSel ? 4 : 2.5;
                wire(L.polyline([from, pos], { color: c, weight: w, opacity: isSel ? 0.95 : 0.8 }));
                wire(L.polyline([pos, [dest.lat, dest.lng]], { color: c, weight: w, opacity: isSel ? 0.8 : 0.55, dashArray: '5 9' }));
                const chip = L.divIcon({
                    className: '',
                    html: `<div class="map-chip${isSel ? ' map-chip--sel' : ''}" style="border-color:${c};color:${c}">${bpSvg(MODE_ICON[s.mode] || 'Truck', 11)}</div>`,
                    iconSize: [22, 22], iconAnchor: [11, 11],
                });
                const dot = L.marker(pos, { icon: chip, zIndexOffset: isSel ? 400 : 300 });
                dot.bindTooltip(`${s.id} · ${s.mode} · ETA ${s.etaH}h`, { direction: 'top' });
                dot.on('click', () => onSelect(s.id));
                layers.addLayer(dot);
            }
        });

        // ---- selection pulse ring on the selected shipment's destination ----
        const sel = shipments.find(s => s.id === selectedId);
        if (sel && facilityById[sel.destId]) {
            const d = facilityById[sel.destId];
            layers.addLayer(L.marker([d.lat, d.lng], {
                interactive: false, zIndexOffset: 450,
                icon: L.divIcon({ className: '', iconSize: [44, 44], iconAnchor: [22, 22], html: '<div class="map-ring"></div>' }),
            }));
        }

        // ---- facility pins ----
        if (show.facilities) FACILITIES.forEach(f => {
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
        if (show.origins) Object.entries(originStops).forEach(([city, o]) => {
            const icon = L.divIcon({
                className: '',
                html: `<div class="map-origin"><span class="map-origin__dot"></span>${city}${o.clipped ? ' →' : ''}</div>`,
                iconSize: null, iconAnchor: [4, 4],
            });
            layers.addLayer(L.marker(o.point, { icon, zIndexOffset: 200, interactive: false }));
        });

        // ---- alert callouts (unacked only) ----
        if (show.alerts) {
            const open = alerts.filter(a => !a.acked)
                .map(a => ({ a, s: shipments.find(x => x.id === a.shipmentId) }))
                .filter(x => x.s && facilityById[x.s.destId]);
            // The top alert (critical first, then youngest) gets the full
            // control-tower card with the AI-analyzing shimmer.
            const rank = { critical: 0, warning: 1, info: 2 };
            open.sort((x, y) => (rank[x.a.severity] - rank[y.a.severity]) || (x.a.ageH - y.a.ageH));
            const featured = open[0];
            if (featured) {
                const { a, s } = featured;
                const dest = facilityById[s.destId];
                // Flip the card below/leftward when the anchor facility sits
                // near the top or right edge, so it never clips off the map
                // or collides with the zoom control.
                const pt = map.latLngToContainerPoint([dest.lat, dest.lng]);
                const below = pt.y < 240;
                const leftward = pt.x > map.getSize().x - 260;
                const wrapCls = 'ctl-wrap' + (below ? ' ctl-wrap--below' : '') + (leftward ? ' ctl-wrap--left' : '');
                const anchorX = leftward ? 218 : 12;
                const alertHtml = `<div class="ctl-alert">
                            <div class="ctl-alert__head"><span class="ctl-alert__pin">${bpSvg('WarningSign', 10)}</span> NEW ALERT · ${a.kind}</div>
                            <div class="ctl-alert__ai">${bpSvg('PredictiveAnalysis', 11)} AI analyzing<span class="ctl-dots"></span></div>
                        </div>`;
                const metricsHtml = `<div class="ctl-metrics">
                            <div class="ctl-metrics__title">${bpSvg('Office', 10)} ${dest.name}</div>
                            <div class="ctl-metrics__row"><span>Capacity</span><b>${dest.capacityPct}%</b></div>
                            <div class="ctl-metrics__row"><span>Shipment</span><b>${s.id}</b></div>
                            <div class="ctl-metrics__row"><span>Value at risk</span><b>$${s.valueK}k</b></div>
                        </div>`;
                const stemHtml = '<div class="ctl-stem"></div>';
                // reading order stays alert-first in both orientations: the stem
                // just moves to whichever side touches the anchored facility
                const inner = below ? stemHtml + alertHtml + metricsHtml : alertHtml + metricsHtml + stemHtml;
                const icon = L.divIcon({
                    className: '', iconSize: null, iconAnchor: [anchorX, below ? 0 : 208],
                    html: `<div class="${wrapCls}">${inner}</div>`,
                });
                const m = L.marker([dest.lat, dest.lng], { icon, zIndexOffset: 1200 });
                m.on('click', () => onSelect(s.id));
                layers.addLayer(m);
            }
            // the rest stay as compact pills, stacked per destination
            const stackAt = {};
            open.slice(1).forEach(({ a, s }) => {
                const dest = facilityById[s.destId];
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
        }
    }, [shipments, alerts, selectedId, onSelect, show, overlays]);

    return (
        <div className="map-outer">
            <div ref={hostRef} className="map-host" />
        </div>
    );
}
