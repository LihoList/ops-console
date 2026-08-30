// Dispatch — a tiny logistics ops console built with Palantir's Blueprint.
// The point is the Foundry idiom: an ontology of OBJECTS (shipments,
// facilities, alerts), LINKS between them, and ACTIONS that mutate state
// with an audit trail. All data is local and fictional.
import { useMemo, useState } from 'react';
import {
    Navbar, Alignment, InputGroup, Button, ButtonGroup, Tag, HTMLTable, Card,
    Dialog, DialogBody, DialogFooter, HTMLSelect, ProgressBar, Icon, Tooltip,
    Divider, NonIdealState, OverlayToaster, Position, Intent,
} from '@blueprintjs/core';
import {
    OBJECT_TYPES, FACILITIES, INITIAL_ALERTS, INITIAL_SHIPMENTS,
    STATUS_INTENT, SEVERITY_INTENT,
} from './data.js';

// Toaster: created once, lazily (React 19-safe path is createAsync).
let toasterPromise = null;
async function toast(props) {
    if (!toasterPromise) toasterPromise = OverlayToaster.createAsync({ position: Position.TOP });
    (await toasterPromise).show(props);
}

const now = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function App() {
    const [shipments, setShipments] = useState(INITIAL_SHIPMENTS);
    const [alerts, setAlerts] = useState(INITIAL_ALERTS);
    const [selectedId, setSelectedId] = useState('SHP-2207');
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [priorityFilter, setPriorityFilter] = useState('All');
    const [rerouteOpen, setRerouteOpen] = useState(false);
    const [rerouteDest, setRerouteDest] = useState(FACILITIES[0].id);
    const [aboutOpen, setAboutOpen] = useState(false);
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

    function addLog(text) {
        setLog(l => [{ t: now(), text: `${text} (Operator)` }, ...l].slice(0, 8));
    }

    // ---- ACTIONS (the Foundry idiom: named, auditable mutations) ----
    function actReroute() {
        const dest = facilityById[rerouteDest];
        setShipments(list => list.map(s => s.id === selectedId ? { ...s, destId: rerouteDest, status: 'In transit' } : s));
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
        setShipments(list => list.map(s => s.id === selectedId ? { ...s, status: 'Delivered', etaH: 0 } : s));
        addLog(`Marked delivered: ${selectedId}`);
        toast({ message: `${selectedId} marked as delivered`, intent: Intent.SUCCESS, icon: 'tick-circle' });
    }

    return (
        <div className="bp6-dark app-root">
            <Navbar>
                <Navbar.Group align={Alignment.LEFT}>
                    <Icon icon="cargo-ship" size={18} style={{ marginRight: 10 }} />
                    <Navbar.Heading><strong>Dispatch</strong> · ops console</Navbar.Heading>
                    <Navbar.Divider />
                    <Tag minimal intent={openAlertCount ? Intent.WARNING : Intent.NONE} icon="warning-sign">
                        {openAlertCount} open alerts
                    </Tag>
                </Navbar.Group>
                <Navbar.Group align={Alignment.RIGHT}>
                    <InputGroup leftIcon="search" placeholder="Search shipments…" value={query}
                        onChange={e => setQuery(e.target.value)} style={{ width: 240 }} />
                    <Navbar.Divider />
                    <Button variant="minimal" icon="info-sign" text="About" onClick={() => setAboutOpen(true)} />
                </Navbar.Group>
            </Navbar>

            <div className="app-body">
                {/* ---- Ontology rail ---- */}
                <aside className="ontology">
                    <div className="rail-title">ONTOLOGY</div>
                    {OBJECT_TYPES.map(t => {
                        const count = t.key === 'shipment' ? shipments.length : t.key === 'facility' ? FACILITIES.length : alerts.length;
                        const active = t.key === 'shipment';
                        return (
                            <Tooltip key={t.key} content={active ? t.description : `${t.description} — modeled; list view TBD`} placement="right">
                                <Card interactive={active} className={'otype' + (active ? ' otype--active' : '')}>
                                    <Icon icon={t.icon} />
                                    <span className="otype-label">{t.label}</span>
                                    <Tag minimal round>{count}</Tag>
                                </Card>
                            </Tooltip>
                        );
                    })}
                    <Divider style={{ margin: '14px 0' }} />
                    <div className="rail-note">
                        Objects link to each other; actions mutate them and land in the audit log.
                        The idiom is the point.
                    </div>
                </aside>

                {/* ---- Object table ---- */}
                <main className="table-pane">
                    <div className="filters">
                        <HTMLSelect value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                            options={['All', 'In transit', 'Delayed', 'At customs', 'Loading', 'Delivered']} />
                        <HTMLSelect value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
                            options={['All', 'P1', 'P2', 'P3']} />
                        <span className="filters-count">{visible.length} of {shipments.length} shipments</span>
                    </div>
                    {visible.length === 0 ? (
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
                                    <tr key={s.id} onClick={() => setSelectedId(s.id)}
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
                    )}
                </main>

                {/* ---- Object detail + actions ---- */}
                <aside className="detail">
                    {!selected ? (
                        <NonIdealState icon="select" title="Pick a shipment" />
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
                                <Button icon="route" text="Reroute…" onClick={() => setRerouteOpen(true)} />
                                <Button icon="tick" text="Ack alerts"
                                    disabled={selectedAlerts.every(a => a.acked)} onClick={actAckAlerts} />
                                <Button icon="tick-circle" intent={Intent.SUCCESS} text="Delivered"
                                    disabled={selected.status === 'Delivered'} onClick={actDeliver} />
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
