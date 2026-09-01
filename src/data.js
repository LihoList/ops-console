// A miniature "ontology" in the Foundry sense: object types, instances,
// links between them, and actions that mutate state. Everything is local —
// the point of this project is the modeling idiom, not a backend.

export const OBJECT_TYPES = [
    { key: 'shipment', label: 'Shipment', icon: 'truck', description: 'A load moving between facilities' },
    { key: 'facility', label: 'Facility', icon: 'office', description: 'Warehouse, port or cross-dock' },
    { key: 'alert', label: 'Alert', icon: 'warning-sign', description: 'Something that needs an operator' },
];

export const FACILITIES = [
    { id: 'FAC-01', name: 'Rotterdam Port T3', kind: 'Port', region: 'EU-West', capacityPct: 84, lat: 51.95, lng: 4.14 },
    { id: 'FAC-02', name: 'Duisburg Rail Hub', kind: 'Rail hub', region: 'EU-Central', capacityPct: 61, lat: 51.43, lng: 6.76 },
    { id: 'FAC-03', name: 'Lyon Cross-dock', kind: 'Cross-dock', region: 'EU-South', capacityPct: 47, lat: 45.76, lng: 4.84 },
    { id: 'FAC-04', name: 'Gdansk DC', kind: 'Distribution', region: 'EU-East', capacityPct: 72, lat: 54.35, lng: 18.65 },
    { id: 'FAC-05', name: 'Madrid DC', kind: 'Distribution', region: 'EU-South', capacityPct: 55, lat: 40.42, lng: -3.70 },
];

// Origin cities for map routes (shipments start here, end at a facility).
// Origins are picked from this list — free text would leave routes that
// can't be drawn on the map.
export const ORIGIN_COORDS = {
    Shanghai: [31.23, 121.47], Rotterdam: [51.92, 4.48], Hamburg: [53.55, 9.99],
    Antwerp: [51.22, 4.40], Valencia: [39.47, -0.38], Milan: [45.46, 9.19],
    Gdansk: [54.35, 18.65], Barcelona: [41.39, 2.17], Lyon: [45.76, 4.84],
    Duisburg: [51.43, 6.76], Istanbul: [41.01, 28.98], Oslo: [59.91, 10.75],
    Paderborn: [51.72, 8.75], Vienna: [48.21, 16.37], Warsaw: [52.23, 21.01],
    Marseille: [43.30, 5.37], Prague: [50.08, 14.44], Copenhagen: [55.68, 12.57],
};
export const ORIGINS = Object.keys(ORIGIN_COORDS).sort();

export const INITIAL_ALERTS = [
    { id: 'AL-101', shipmentId: 'SHP-2201', severity: 'critical', kind: 'Customs hold', detail: 'Missing HS code on 2 pallets', ageH: 6, acked: false },
    { id: 'AL-102', shipmentId: 'SHP-2201', severity: 'warning', kind: 'Temp excursion', detail: 'Reefer +2.1°C over limit for 40 min', ageH: 11, acked: false },
    { id: 'AL-103', shipmentId: 'SHP-2204', severity: 'warning', kind: 'ETA slip', detail: 'Driver hours cap — ETA +5h', ageH: 2, acked: false },
    { id: 'AL-104', shipmentId: 'SHP-2207', severity: 'critical', kind: 'Route closed', detail: 'A7 closed near Lyon, no reroute set', ageH: 1, acked: false },
    { id: 'AL-105', shipmentId: 'SHP-2210', severity: 'info', kind: 'Doc ready', detail: 'POD uploaded by carrier', ageH: 20, acked: true },
    { id: 'AL-106', shipmentId: 'SHP-2205', severity: 'warning', kind: 'Capacity', detail: 'Destination at 84% — dock slot at risk', ageH: 4, acked: false },
];

export const INITIAL_SHIPMENTS = [
    { id: 'SHP-2201', ref: 'PO-88412', origin: 'Shanghai', destId: 'FAC-01', mode: 'Ocean', status: 'At customs', priority: 'P1', etaH: 18, valueK: 412, riskScore: 87 },
    { id: 'SHP-2202', ref: 'PO-88433', origin: 'Rotterdam', destId: 'FAC-02', mode: 'Rail', status: 'In transit', priority: 'P3', etaH: 9, valueK: 76, riskScore: 21 },
    { id: 'SHP-2203', ref: 'PO-88437', origin: 'Duisburg', destId: 'FAC-04', mode: 'Road', status: 'In transit', priority: 'P2', etaH: 14, valueK: 158, riskScore: 34 },
    { id: 'SHP-2204', ref: 'PO-88450', origin: 'Valencia', destId: 'FAC-03', mode: 'Road', status: 'Delayed', priority: 'P1', etaH: 26, valueK: 240, riskScore: 68 },
    { id: 'SHP-2205', ref: 'PO-88461', origin: 'Gdansk', destId: 'FAC-01', mode: 'Road', status: 'In transit', priority: 'P2', etaH: 31, valueK: 95, riskScore: 55 },
    { id: 'SHP-2206', ref: 'PO-88465', origin: 'Antwerp', destId: 'FAC-05', mode: 'Road', status: 'Loading', priority: 'P3', etaH: 44, valueK: 61, riskScore: 12 },
    { id: 'SHP-2207', ref: 'PO-88472', origin: 'Milan', destId: 'FAC-03', mode: 'Road', status: 'Delayed', priority: 'P1', etaH: 8, valueK: 380, riskScore: 91 },
    { id: 'SHP-2208', ref: 'PO-88476', origin: 'Rotterdam', destId: 'FAC-04', mode: 'Rail', status: 'In transit', priority: 'P3', etaH: 21, valueK: 44, riskScore: 18 },
    { id: 'SHP-2209', ref: 'PO-88480', origin: 'Hamburg', destId: 'FAC-02', mode: 'Rail', status: 'Loading', priority: 'P2', etaH: 37, valueK: 132, riskScore: 26 },
    { id: 'SHP-2210', ref: 'PO-88488', origin: 'Lyon', destId: 'FAC-05', mode: 'Road', status: 'Delivered', priority: 'P3', etaH: 0, valueK: 88, riskScore: 5 },
    { id: 'SHP-2211', ref: 'PO-88491', origin: 'Barcelona', destId: 'FAC-03', mode: 'Road', status: 'In transit', priority: 'P2', etaH: 12, valueK: 205, riskScore: 41 },
    { id: 'SHP-2212', ref: 'PO-88495', origin: 'Rotterdam', destId: 'FAC-05', mode: 'Road', status: 'In transit', priority: 'P1', etaH: 16, valueK: 310, riskScore: 49 },
];

// Risk is a derived property, not an input — recomputed whenever a
// shipment is created, edited or mutated by an action.
export function computeRisk({ status, priority, etaH, valueK, mode }) {
    if (status === 'Delivered') return 0;             // nothing left at risk
    const base = { 'Delayed': 45, 'At customs': 40, 'In transit': 15, 'Loading': 10 }[status] ?? 15;
    let score = base;
    score += { P1: 20, P2: 10, P3: 0 }[priority] ?? 0;
    score += Math.min(20, Math.round(valueK / 20));   // value at stake
    if (status !== 'Delivered' && etaH < 12) score += 10; // tight window
    if (mode === 'Ocean') score += 5;                 // longer, less recoverable
    return Math.max(0, Math.min(100, score));
}

export const STATUS_INTENT = {
    'At customs': 'warning',
    'Delayed': 'danger',
    'In transit': 'primary',
    'Loading': 'none',
    'Delivered': 'success',
};

export const SEVERITY_INTENT = { critical: 'danger', warning: 'warning', info: 'none' };
