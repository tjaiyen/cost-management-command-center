# Cost Management Command Center

A cost-management methodology demo — CAPEX budget bridge, AACE RP 57R-09 Monte Carlo contingency
sizing, and WBS cost allocation — built around a synthetic capital-development program.

**Live:** (not yet published — see Status below)

**Zero dependencies · no build step · no server.** Every number is computed live in the page's own
JavaScript. Open `index.html` directly in a browser and it works.

## What's on the page

- **CAPEX Budget Bridge** — underwriting baseline → scope change → market escalation → field-
  execution variance → contingency drawdown → current forecast, rendered as a live waterfall.
- **Contingency Drawdown & Monte Carlo** — a draggable % complete / contingency-drawn pair flagging
  an early-warning state when drawdown outpaces physical progress, plus a real, re-runnable
  triangular-distribution Monte Carlo simulation (2,000 draws) producing live P50/P80/P90 figures —
  following **AACE International RP 57R-09** ("Integrated Cost and Schedule Risk Analysis Using Risk
  Drivers and Monte Carlo Simulation of a CPM Model"), a real, named industry practice.
- **WBS Cost Allocation** — a bar breakdown across Architect/Engineer of Record, General Contractors
  & trades, long-lead equipment, and utility interconnection.
- **Two sections named as not-yet-built** (consultant deliverable scorecard, data-quality
  reconciliation health) rather than silently omitted.

## Real vs. illustrative

The program itself is synthetic — no employer, client, or agency data appears anywhere in this
repository. Three real facts are threaded through it and badge-labeled inline wherever they appear:

- A real $208K variance root-cause trace (a structural BOM-posting gap, not a bid overrun).
- A real 100+ bid-package contingency/change-order-tracking history, $50M+ per project.
- AACE International RP 57R-09 as the real, named method behind the Monte Carlo band.

Everything else — the program name, specific dollar amounts, dates, vendor labels — is invented to
make the methodology legible, and is marked `illustrative` throughout.

## Fit brief

[`ada-fit.html`](ada-fit.html) is a requirement-by-requirement coverage brief against a specific
real job posting (Ada Infrastructure's Senior Associate, Cost Management — req R7887) — including
the requirements this background does *not* clear. `noindex,nofollow` — not meant to be discovered
by search engines, just linked directly when relevant.

## Status

Built 2026-08-25. **Local only — not yet pushed to GitHub, no live URL yet.** Publishing this
(creating the remote repo, enabling GitHub Pages) is a deliberate, separate step from building it.

## Design lineage

Architecture (single self-contained HTML file, theme tokens, real-vs-illustrative badge
discipline) follows the same author's other case-study work:
[tj-finance-portfolio](https://github.com/tjaiyen/tj-finance-portfolio) (dbt + DuckDB projects) and
[project-controls-command-center](https://github.com/tjaiyen/project-controls-command-center) (the
full-scale version of this same discipline — 20 KPIs, 11 tabs, 2,260 tests, built around a
synthetic capital transit program) — this repo is deliberately scoped smaller, to a single role's
actual requirements rather than the full project-controls discipline.
