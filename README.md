# Dispatch — a tiny ops console built with Palantir's Blueprint

An evening project: a logistics operations console built with
[Blueprint](https://github.com/palantir/blueprint), Palantir's open-source
React toolkit for data-dense interfaces.

I built it while preparing to talk to Palantir about a Forward Deployed
Software Engineer role. Reading about Foundry and AIP, the idea that stuck
with me was the ontology: real-world things modeled as **objects**, connected
by **links**, changed through auditable **actions**. The fastest way to
understand an idiom is to build in it — so this app models a miniature
version of exactly that:

- **Objects** — shipments, facilities, alerts (fictional data)
- **Links** — a shipment's destination facility, its alerts
- **Actions** — *Reroute*, *Acknowledge alerts*, *Mark delivered* — named
  mutations that land in an action log, not ad-hoc edits

![Dispatch screenshot](docs/screenshot.png)

## Run

```bash
npm install
npm run dev
```

## Notes

- UI: `@blueprintjs/core` v6 (dark theme), Vite + React.
- All data is local and fictional; there is no backend on purpose —
  the modeling idiom is the point.
- Not affiliated with Palantir. Blueprint is their open-source UI toolkit.

— Daniil Lutsyk
