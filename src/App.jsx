// Dispatch — a tiny logistics ops console built with Palantir's Blueprint.
// The point is the Foundry idiom: an ontology of OBJECTS (shipments,
// facilities, alerts), LINKS between them, and ACTIONS that mutate state
// with an audit trail. All data is local and fictional.
import { useMemo, useState } from 'react';
import {
    Navbar, Alignment, InputGroup, Button, ButtonGroup, Tag, HTMLTable, Card,
    Dialog, DialogBody, DialogFooter, HTMLSelect, ProgressBar, Icon,
    Divider, NonIdealState, OverlayToaster, Position, Intent,
    FormGroup, NumericInput,
} from '@blueprintjs/core';
import {
    OBJECT_TYPES, FACILITIES, INITIAL_ALERTS, INITIAL_SHIPMENTS,
    STATUS_INTENT, SEVERITY_INTENT,
    computeRisk, ORIGINS,
} from './data.js';
import MapView, { MapLayersPanel, DEFAULT_MAP_LAYERS, DEFAULT_OVERLAYS } from './MapView.jsx';

// Toaster: created once, lazily (React 19-safe path is createAsync).
let toasterPromise = null;
async function toast(props) {
    if (!toasterPromise) toasterPromise = OverlayToaster.createAsync({ position: Position.TOP });
    (await toasterPromise).show(props);
}

const now = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

// ---- random shipment generator (for the "Randomize" buttons) ----
const RND_MODES = ['Ocean', 'Rail', 'Road'];
const RND_STATUSES = ['In transit', 'Loading', 'Delayed', 'At customs'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function randomShipmentFields() {
    const status = pick(RND_STATUSES);
    return {
        origin: pick(ORIGINS),
        destId: pick(FACILITIES).id,
        mode: pick(RND_MODES),
        status,
        priority: pick(['P1', 'P2', 'P2', 'P3', 'P3']),
        etaH: 4 + Math.floor(Math.random() * 44),
        valueK: 30 + Math.floor(Math.random() * 420),
    };
}
const EMPTY_FORM = { origin: 'Hamburg', destId: FACILITIES[0].id, mode: 'Road', status: 'Loading', priority: 'P2', etaH: 24, valueK: 100 };

const VIEW_TABS = [
    { key: 'map', icon: 'map', label: 'Network view' },
    { key: 'table', icon: 'th', label: 'Table' },
    { key: 'alerts', icon: 'warning-sign', label: 'Alerts' },
];

export default function App() {
    const [shipments, setShipments] = useState(INITIAL_SHIPMENTS);
    const [alerts, setAlerts] = useState(INITIAL_ALERTS);
    const [selectedId, setSelectedId] = useState(null);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [priorityFilter, setPriorityFilter] = useState('All');
    const [rerouteOpen, setRerouteOpen] = useState(false);
    const [rerouteDest, setRerouteDest] = useState(FACILITIES[0].id);
    const [aboutOpen, setAboutOpen] = useState(false);
    // shipment form: null = closed, {mode:'create'|'edit', fields} = open
    const [form, setForm] = useState(null);
    const [view, setView] = useState('map');   // 'map' | 'table' | 'alerts'
    const [mapShow, setMapShow] = useState(DEFAULT_MAP_LAYERS);
    const [overlays, setOverlays] = useState(DEFAULT_OVERLAYS);
    const toggleMapLayer = (k) => setMapShow(m => ({ ...m, [k]: !m[k] }));
    const toggleOverlay = (k) => setOverlays(o => ({ ...o, [k]: !o[k] }));
    const [log, setLog] = useState([
        { t: '08:02', text: 'Shift handover accepted (Operator)' },
    ]);

    const facilityById = useMemo(() => Object.fromEntries(FACILITIES.map(f => [f.id, f])), []);
    const selected = shipments.find(s => s.id === selectedId) || null;
    const selectedAlerts = alerts.filter(a => a.shipmentId === selectedId);
    const openAlertCount = alerts.filter(a => !a.acked).length;

    const visible = shipments.filter(s => {
        if (statusFilter !== 'All' && s.status !== statusFilter) return false;
        if (priorityFilter !== 'All' && s.priority !== priorityFilter) return false;
        const q = query.trim().toLowerCase();
        if (q && ![s.id, s.ref, s.origin, facilityById[s.destId]?.name].join(' ').toLowerCase().includes(q)) return false;
        return true;
    });

    // ---- KPI ribbon numbers (all derived live from state) ----
    const active = shipments.filter(s => s.status !== 'Delivered');
    const late = active.filter(s => s.status === 'Delayed' || s.status === 'At customs').length;
    const onTimePct = active.length ? Math.round(100 * (1 - late / active.length)) : 100;
    const valueM = (active.reduce((m, s) => m + s.valueK, 0) / 1000).toFixed(1);
    const inMotionCount = shipments.filter(s => s.status === 'In transit' || s.status === 'Delayed').length;

    function addLog(text) {
        setLog(l => [{ t: now(), text: `${text} (Operator)` }, ...l].slice(0, 8));
    }

    // ---- ACTIONS (the Foundry idiom: named, auditable mutations) ----
    function actReroute() {
        const dest = facilityById[rerouteDest];
        setShipments(list => list.map(s => s.id === selectedId ? { ...s, destId: rerouteDest, status: 'In transit', riskScore: computeRisk({ ...s, status: 'In transit' }) } : s));
        setRerouteOpen(false);
        addLog(`Reroute: ${selectedId} → ${dest.name}`);
        toast({ message: `${selectedId} rerouted to ${dest.name}`, intent: Intent.SUCCESS, icon: 'route' });
    }
    function actAckAlerts() {
        setAlerts(list => list.map(a => a.shipmentId === selectedId ? { ...a, acked: true } : a));
        addLog(`Acknowledged ${selectedAlerts.filter(a => !a.acked).length} alert(s) on ${selectedId}`);
        toast({ message: 'Alerts acknowledged', intent: Intent.PRIMARY, icon: 'tick' });
    }
    function actDeliver() {
        setShipments(list => list.map(s => s.id === selectedId ? { ...s, status: 'Delivered', etaH: 0, riskScore: computeRisk({ ...s, status: 'Delivered', etaH: 0 }) } : s));
        addLog(`Marked delivered: ${selectedId}`);
        toast({ message: `${selectedId} marked as delivered`, intent: Intent.SUCCESS, icon: 'tick-circle' });
    }
    function nextShipmentId() {
        const max = shipments.reduce((m, s) => Math.max(m, parseInt(s.id.split('-')[1], 10) || 0), 2200);
        return `SHP-${max + 1}`;
    }
    function actCreateShipment(fields) {
        const id = nextShipmentId();
        const ref = `PO-${88500 + Math.floor(Math.random() * 400)}`;
        setShipments(list => [{ id, ref, ...fields, riskScore: computeRisk(fields) }, ...list]);
        setSelectedId(id);
        setForm(null);
        addLog(`Created ${id} — ${fields.origin} → ${facilityById[fields.destId]?.name}`);
        toast({ message: `${id} created`, intent: Intent.SUCCESS, icon: 'plus' });
    }
    function actEditShipment(fields) {
        // keep the same shape Deliver produces: a delivered shipment has no ETA
        const norm = { ...fields, etaH: fields.status === 'Delivered' ? 0 : fields.etaH };
        setShipments(list => list.map(s => s.id === selectedId ? { ...s, ...norm, riskScore: computeRisk(norm) } : s));
        setForm(null);
        addLog(`Edited ${selectedId}`);
        toast({ message: `${selectedId} updated`, intent: Intent.PRIMARY, icon: 'edit' });
    }
    function actRandomShipment() {
        actCreateShipment(randomShipmentFields());
    }

    return (
        <div className="bp6-dark app-root">
            <Navbar>
                <Navbar.Group align={Alignment.LEFT}>
                    <Icon icon="cargo-ship" size={18} style={{ marginRight: 10 }} />
                    <Navbar.Heading><strong>Dispatch</strong> · supply chain control tower</Navbar.Heading>
                    <Navbar.Divider />
                    <Tag minimal intent={openAlertCount ? Intent.WARNING : Intent.NONE} icon="warning-sign">
                        {openAlertCount} open alerts
                    </Tag>
                </Navbar.Group>
                <Navbar.Group align={Alignment.RIGHT}>
                    <Button intent={Intent.PRIMARY} icon="plus" text="New shipment"
                        onClick={() => setForm({ mode: 'create', fields: { ...EMPTY_FORM } })} />
                    <Button icon="random" title="Create a shipment with randomized parameters"
                        style={{ marginLeft: 8 }} onClick={actRandomShipment} />
                    <Navbar.Divider />
                    <InputGroup leftIcon="search" placeholder="Search shipments…" value={query}
                        onChange={e => setQuery(e.target.value)} style={{ width: 220 }} />
                    <Navbar.Divider />
                    <Button variant="minimal" icon="info-sign" text="About" onClick={() => setAboutOpen(true)} />
                </Navbar.Group>
            </Navbar>

            {/* ---- KPI ribbon + view tabs (the control-tower header) ---- */}
            <div className="kpis">
                <div className="kpi">
                    <div className="kpi__num">{onTimePct}%<span className="kpi__delta">▲ {active.length - late} of {active.length}</span></div>
                    <div className="kpi__cap">On time, in full</div>
                </div>
                <div className="kpi">
                    <div className="kpi__num">${valueM}M</div>
                    <div className="kpi__cap">Value in motion <span className="dim">· {inMotionCount} moving</span></div>
                </div>
                <div className="kpi">
                    <div className="kpi__num">{shipments.length}</div>
                    <div className="kpi__cap">Deliveries <span className="dim">· {active.length} active</span></div>
                </div>
                <div className={'kpi kpi--card' + (openAlertCount ? ' kpi--hot' : '')}
                    onClick={() => setView('alerts')} role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView('alerts'); } }}>
                    <div className="kpi__num">{FACILITIES.length}</div>
                    <div className="kpi__cap">Facilities <span className="kpi__hotnote">{openAlertCount} open alerts</span></div>
                </div>
                <div className="kpi">
                    <div className="kpi__num">{ORIGINS.length}</div>
                    <div className="kpi__cap">Origin cities <span className="dim">· 13 countries</span></div>
                </div>
                <div className="kpis__spacer" />
                <div className="view-tabs">
                    {VIEW_TABS.map(t => (
                        <button key={t.key} type="button"
                            className={'view-tab' + (view === t.key ? ' view-tab--active' : '')}
                            onClick={() => setView(t.key)}>
                            <Icon icon={t.icon} size={13} /> {t.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="app-body">
                {/* ---- Ontology rail ---- */}
                <aside className="ontology">
                    <div className="rail-title">ONTOLOGY</div>
                    {OBJECT_TYPES.map(t => {
                        const count = t.key === 'shipment' ? shipments.length : t.key === 'facility' ? FACILITIES.length : alerts.length;
                        const active2 = t.key === 'shipment';
                        return (
                            <Card key={t.key} title={t.description} className={'otype' + (active2 ? ' otype--active' : '')}>
                                <Icon icon={t.icon} />
                                <span className="otype-label">{t.label}</span>
                                <Tag minimal round>{count}</Tag>
                            </Card>
                        );
                    })}
                    <Divider style={{ margin: '14px 0' }} />
                    <div className="rail-note">
                        Objects link to each other; actions mutate them and land in the audit log.
                        The idiom is the point.
                    </div>
                    {view === 'map' && (
                        <>
                            <Divider style={{ margin: '14px 0' }} />
                            <MapLayersPanel show={mapShow} onToggle={toggleMapLayer}
                                overlays={overlays} onToggleOverlay={toggleOverlay}
                                shipments={shipments} alerts={alerts} />
                        </>
                    )}
                </aside>

                {/* ---- Main pane: map / table / alerts / stubs ---- */}
                <main className="table-pane">
                    <div className="filters">
                        {(view === 'map' || view === 'table') && (
                            <>
                                <HTMLSelect value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                                    options={['All', 'In transit', 'Delayed', 'At customs', 'Loading', 'Delivered']} />
                                <HTMLSelect value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
                                    options={['All', 'P1', 'P2', 'P3']} />
                                <span className="filters-count">{visible.length} of {shipments.length} shipments</span>
                            </>
                        )}
                        {view === 'alerts' && <span className="filters-count">{alerts.length} alerts · {openAlertCount} open</span>}
                    </div>

                    {view === 'map' && (
                        <MapView shipments={visible} alerts={alerts} selectedId={selectedId}
                            onSelect={setSelectedId} show={mapShow} overlays={overlays} />
                    )}

                    {view === 'table' && (visible.length === 0 ? (
                        <NonIdealState icon="search" title="No shipments match" description="Loosen the filters." />
                    ) : (
                        <HTMLTable interactive striped className="ship-table">
                            <thead>
                                <tr>
                                    <th>ID</th><th>Ref</th><th>Route</th><th>Mode</th><th>Status</th>
                                    <th>Prio</th><th>ETA</th><th>Value</th><th>Risk</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map(s => (
                                    <tr key={s.id} onClick={() => setSelectedId(s.id)} tabIndex={0}
                                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(s.id); } }}
                                        className={s.id === selectedId ? 'row--selected' : ''}>
                                        <td className="mono">{s.id}</td>
                                        <td className="mono dim">{s.ref}</td>
                                        <td>{s.origin} → {facilityById[s.destId]?.name}</td>
                                        <td>{s.mode}</td>
                                        <td><Tag minimal intent={STATUS_INTENT[s.status]}>{s.status}</Tag></td>
                                        <td><Tag minimal round intent={s.priority === 'P1' ? Intent.DANGER : Intent.NONE}>{s.priority}</Tag></td>
                                        <td className="mono">{s.etaH ? s.etaH + 'h' : '—'}</td>
                                        <td className="mono">${s.valueK}k</td>
                                        <td className="risk-cell">
                                            <ProgressBar value={s.riskScore / 100} stripes={false} animate={false}
                                                intent={s.riskScore > 60 ? Intent.DANGER : s.riskScore > 35 ? Intent.WARNING : Intent.SUCCESS} />
                                            <span className="mono">{s.riskScore}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </HTMLTable>
                    ))}

                    {view === 'alerts' && (
                        <div className="alerts-list">
                            {alerts.map(a => {
                                const s = shipments.find(x => x.id === a.shipmentId);
                                return (
                                    <Card key={a.id} interactive className={'linked-card alert-card' + (a.acked ? ' alert--acked' : '')}
                                        onClick={() => { setSelectedId(a.shipmentId); }}>
                                        <Tag minimal intent={SEVERITY_INTENT[a.severity]}>{a.severity}</Tag>
                                        <div style={{ flex: 1 }}>
                                            <div>{a.kind} <span className="dim">· {a.ageH}h ago{a.acked ? ' · acked' : ''}</span></div>
                                            <div className="dim">{a.detail}</div>
                                        </div>
                                        <span className="mono dim">{a.shipmentId}{s ? ` · $${s.valueK}k` : ''}</span>
                                    </Card>
                                );
                            })}
                        </div>
                    )}

                </main>

                {/* ---- Object detail + actions ---- */}
                <aside className="detail">
                    {!selected ? (
                        <NonIdealState icon="select" title="No shipment selected"
                            description="Click a table row, or a route, chip or callout on the map." />
                    ) : (
                        <>
                            <div className="detail-head">
                                <div>
                                    <div className="detail-id mono">{selected.id}</div>
                                    <div className="dim">{selected.ref} · {selected.mode}</div>
                                </div>
                                <Tag large intent={STATUS_INTENT[selected.status]}>{selected.status}</Tag>
                            </div>

                            <div className="props">
                                <div><span className="dim">Origin</span><span>{selected.origin}</span></div>
                                <div><span className="dim">Destination</span><span>{facilityById[selected.destId]?.name}</span></div>
                                <div><span className="dim">ETA</span><span>{selected.etaH ? selected.etaH + ' h' : 'arrived'}</span></div>
                                <div><span className="dim">Value</span><span>${selected.valueK}k</span></div>
                                <div><span className="dim">Risk</span><span>{selected.riskScore}/100</span></div>
                            </div>

                            <div className="rail-title">LINKED · FACILITY</div>
                            <Card className="linked-card">
                                <Icon icon="office" />
                                <div>
                                    <div>{facilityById[selected.destId]?.name}</div>
                                    <div className="dim">{facilityById[selected.destId]?.kind} · {facilityById[selected.destId]?.region} · {facilityById[selected.destId]?.capacityPct}% capacity</div>
                                </div>
                            </Card>

                            <div className="rail-title">LINKED · ALERTS ({selectedAlerts.length})</div>
                            {selectedAlerts.length === 0 && <div className="dim" style={{ padding: '2px 0 8px' }}>No alerts on this shipment.</div>}
                            {selectedAlerts.map(a => (
                                <Card key={a.id} className={'linked-card alert-card' + (a.acked ? ' alert--acked' : '')}>
                                    <Tag minimal intent={SEVERITY_INTENT[a.severity]}>{a.severity}</Tag>
                                    <div>
                                        <div>{a.kind} <span className="dim">· {a.ageH}h ago{a.acked ? ' · acked' : ''}</span></div>
                                        <div className="dim">{a.detail}</div>
                                    </div>
                                </Card>
                            ))}

                            <div className="rail-title">ACTIONS</div>
                            <ButtonGroup fill vertical={false} className="actions-row">
                                <Button icon="route" text="Reroute…" disabled={selected.status === 'Delivered'} onClick={() => {
                                    // preselect the first facility that isn't the current destination —
                                    // stale state here made the select show one thing and submit another
                                    setRerouteDest(FACILITIES.find(f => f.id !== selected.destId).id);
                                    setRerouteOpen(true);
                                }} />
                                <Button icon="tick" text="Ack alerts"
                                    disabled={selectedAlerts.every(a => a.acked)} onClick={actAckAlerts} />
                                <Button icon="tick-circle" intent={Intent.SUCCESS} text="Delivered"
                                    disabled={selected.status === 'Delivered'} onClick={actDeliver} />
                            </ButtonGroup>
                            <ButtonGroup fill className="actions-row">
                                <Button icon="edit" text="Edit shipment…" onClick={() => setForm({
                                    mode: 'edit',
                                    fields: {
                                        origin: selected.origin, destId: selected.destId, mode: selected.mode,
                                        status: selected.status, priority: selected.priority,
                                        etaH: selected.etaH, valueK: selected.valueK,
                                    }
                                })} />
                            </ButtonGroup>

                            <div className="rail-title">ACTION LOG</div>
                            <div className="audit">
                                {log.map((e, i) => (
                                    <div key={i} className="audit-row">
                                        <span className="mono dim">{e.t}</span>
                                        <span>{e.text}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </aside>
            </div>

            {/* ---- Reroute action dialog ---- */}
            <Dialog isOpen={rerouteOpen} onClose={() => setRerouteOpen(false)} title={`Reroute ${selectedId}`} icon="route" className="bp6-dark">
                <DialogBody>
                    <p className="dim">Pick a new destination facility. The shipment goes back to “In transit” and the action is logged.</p>
                    <HTMLSelect fill value={rerouteDest} onChange={e => setRerouteDest(e.target.value)}
                        options={FACILITIES.filter(f => f.id !== selected?.destId).map(f => ({ label: `${f.name} — ${f.capacityPct}% capacity`, value: f.id }))} />
                </DialogBody>
                <DialogFooter actions={
                    <>
                        <Button text="Cancel" onClick={() => setRerouteOpen(false)} />
                        <Button intent={Intent.PRIMARY} icon="route" text="Reroute" onClick={actReroute} />
                    </>
                } />
            </Dialog>

            {/* ---- Create / edit shipment ---- */}
            <Dialog isOpen={!!form} onClose={() => setForm(null)} className="bp6-dark"
                title={form?.mode === 'edit' ? `Edit ${selectedId}` : 'New shipment'}
                icon={form?.mode === 'edit' ? 'edit' : 'plus'}>
                {form && (
                    <>
                        <DialogBody>
                            <div className="form-grid">
                                <FormGroup label="Origin city">
                                    <HTMLSelect fill value={form.fields.origin}
                                        onChange={e => setForm(f => ({ ...f, fields: { ...f.fields, origin: e.target.value } }))}
                                        options={ORIGINS} />
                                </FormGroup>
                                <FormGroup label="Destination facility">
                                    <HTMLSelect fill value={form.fields.destId}
                                        onChange={e => setForm(f => ({ ...f, fields: { ...f.fields, destId: e.target.value } }))}
                                        options={FACILITIES.map(fa => ({ label: fa.name, value: fa.id }))} />
                                </FormGroup>
                                <FormGroup label="Mode">
                                    <HTMLSelect fill value={form.fields.mode}
                                        onChange={e => setForm(f => ({ ...f, fields: { ...f.fields, mode: e.target.value } }))}
                                        options={['Road', 'Rail', 'Ocean']} />
                                </FormGroup>
                                <FormGroup label="Status">
                                    <HTMLSelect fill value={form.fields.status}
                                        onChange={e => setForm(f => ({ ...f, fields: { ...f.fields, status: e.target.value } }))}
                                        options={['Loading', 'In transit', 'Delayed', 'At customs', 'Delivered']} />
                                </FormGroup>
                                <FormGroup label="Priority">
                                    <HTMLSelect fill value={form.fields.priority}
                                        onChange={e => setForm(f => ({ ...f, fields: { ...f.fields, priority: e.target.value } }))}
                                        options={['P1', 'P2', 'P3']} />
                                </FormGroup>
                                <FormGroup label="ETA (hours)">
                                    <NumericInput fill min={0} max={240} clampValueOnBlur value={form.fields.etaH}
                                        onValueChange={v => setForm(f => ({ ...f, fields: { ...f.fields, etaH: Number.isFinite(v) ? Math.max(0, Math.min(240, v)) : 0 } }))} />
                                </FormGroup>
                                <FormGroup label="Value ($k)">
                                    <NumericInput fill min={1} max={2000} clampValueOnBlur value={form.fields.valueK}
                                        onValueChange={v => setForm(f => ({ ...f, fields: { ...f.fields, valueK: Number.isFinite(v) ? Math.max(1, Math.min(2000, v)) : 1 } }))} />
                                </FormGroup>
                                <FormGroup label={`Risk score — ${computeRisk(form.fields)} (computed)`} className="form-span"
                                    helperText="Derived from status, priority, ETA, value and mode — not an input.">
                                    <ProgressBar value={computeRisk(form.fields) / 100} stripes={false} animate={false}
                                        intent={computeRisk(form.fields) > 60 ? Intent.DANGER : computeRisk(form.fields) > 35 ? Intent.WARNING : Intent.SUCCESS} />
                                </FormGroup>
                            </div>
                        </DialogBody>
                        <DialogFooter
                            actions={
                                <>
                                    <Button text="Cancel" onClick={() => setForm(null)} />
                                    <Button intent={Intent.PRIMARY}
                                        icon={form.mode === 'edit' ? 'edit' : 'plus'}
                                        text={form.mode === 'edit' ? 'Save changes' : 'Create shipment'}
                                        onClick={() => form.mode === 'edit'
                                            ? actEditShipment(form.fields)
                                            : actCreateShipment(form.fields)} />
                                </>
                            }>
                            <Button icon="random" variant="minimal" text="Randomize"
                                onClick={() => setForm(f => ({ ...f, fields: randomShipmentFields() }))} />
                        </DialogFooter>
                    </>
                )}
            </Dialog>

            {/* ---- About ---- */}
            <Dialog isOpen={aboutOpen} onClose={() => setAboutOpen(false)} title="About this demo" icon="info-sign" className="bp6-dark">
                <DialogBody>
                    <p><strong>Dispatch</strong> is a small evening project: a logistics ops console
                        built with <a href="https://github.com/palantir/blueprint" target="_blank" rel="noreferrer">Blueprint</a>,
                        Palantir’s open-source React toolkit for data-dense interfaces.</p>
                    <p>It models a miniature ontology — shipments, facilities and alerts as linked
                        objects — with auditable actions on top. That objects → links → actions idiom
                        is what I wanted to get a feel for.</p>
                    <p className="dim">Fictional data. Not affiliated with Palantir. — Daniil Lutsyk</p>
                </DialogBody>
            </Dialog>
        </div>
    );
}
