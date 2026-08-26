# Cost Management Command Center

A cost-management methodology demo — 7 tabs covering CAPEX budget bridges, AACE-standard Monte
Carlo contingency sizing, vendor governance, multi-region portfolio rollup, and a data-strategy
pipeline — built around a synthetic capital-development program.

**Live:** https://tjaiyen.github.io/cost-management-command-center/

**Zero dependencies · no build step · no server.** Every number is computed live in the page's own
JavaScript. Open `index.html` directly in a browser and it works.

## What's on each tab

- **Overview** — a rolled-up KPI board reading live off the other tabs' own computed state (not a
  separately-typed summary), plus a "Signal / Model / Govern" framing.
- **Cost** — the CAPEX budget bridge (waterfall), a data-center cost-driver benchmark card (real
  published electrical/cooling cost-split percentages and per-MW cooling-topology premiums), and
  WBS cost allocation.
- **Contingency & Risk** — the contingency-drawdown early-warning slider, a real, re-runnable
  triangular-distribution Monte Carlo simulation (**AACE International RP 57R-09**) producing live
  P50/P80/P90 figures, and a priced risk register (expected-value methodology per **AACE RP
  40R-08**).
- **Vendor & Governance** — a consultant deliverable scorecard (pre-bid vs. actual variance) and a
  data-quality reconciliation health indicator.
- **Portfolio** — a multi-region cost rollup (North America / Asia-Pacific / Europe / Latin
  America — the same four regions a real data-center platform actually operates in, used here only
  as realistic labels) and a 4-gate stage-gate progress tracker.
- **Data Strategy** — a pipeline architecture diagram, and a section documenting the real-vs-
  illustrative badge discipline this whole build follows.
- **Reference** — a glossary of every AACE Recommended Practice and every real data-center cost
  figure used anywhere in the build, each with its own citation.

## Real vs. illustrative

The program itself is synthetic — no employer, client, or agency data appears anywhere in this
repository. Real facts are threaded through it and badge-labeled inline wherever they appear:

- A real $208K variance root-cause trace.
- A real 100+ bid-package contingency/change-order-tracking history, $50M+ per project.
- **AACE International's real Recommended Practices**: RP 57R-09 (Monte Carlo contingency), RP
  65R-11 and RP 44R-08 (expected-value contingency, a distinct complementary method), RP 17R-97
  (Cost Estimate Classification), RP 40R-08 (risk-driver methodology).
- Real published 2026 data-center cost-driver figures: electrical/power infrastructure at 40–45%
  of total cost, cooling at 15–25% (second-largest driver), liquid-cooled at $4.5–5.2M/MW vs.
  ~$1.8M/MW air-cooled, and a real quoted carrying-cost figure ($2.8M/month for idle equipment
  awaiting a missing transformer on a 50MW site).

Everything else — the program name, specific dollar amounts, dates, vendor labels, risk-register
rows, consultant names — is invented to make the methodology legible, marked `illustrative`
throughout.

## Interaction features

Beyond the 7 tabs and the marts they display:

- **Currency toggle** (USD/GBP/JPY/BRL, header) — converts this program's own illustrative dollar
  figures only; cited real industry benchmarks stay in their originally published currency (stated
  explicitly in the on-page disclaimer, not a silent inconsistency).
- **Contextual explainer toggles** — click the (i) next to a badge (e.g. AACE RP 57R-09) to see the
  method explained inline, without leaving the tab.
- **Structured, dual-encoded alert cards** — the contingency-drawdown and data-quality warnings show
  Detected / Probable Cause / Suggested Action, with a shape (▲/●) alongside color, not color alone.

## Verification

`node verify.cjs` — an independent Node-based tie-out. Stubs a real (not no-op) `classList`,
attribute storage, and click-event delegation so the page's own `<script>` runs headlessly with
its actual interaction logic exercised, not just its math. Independently re-derives the
budget-bridge total, the contingency-drawdown ratio, the Monte Carlo percentile ordering and
bounds, the WBS percentage sum, the risk register's total expected value, the region rollup, the
currency-conversion logic (calling the page's real `formatInCurrency`), **both branches of both
alert cards** (calling the real `drawdownAlertContent`/`dqAlertContent` pure functions directly,
including the branches the hardcoded demo state never naturally triggers), and **the explainer
toggle by actually firing its click handler** (open → verify `aria-expanded`/open class → click
again → verify it closes, plus an unrelated-click no-op check) — all exposed on
`window.__CMCC_STATE__` specifically so the tests exercise production code, never a
reimplementation. **29 assertions, all passing** (`node verify.cjs | grep -c "^pass:"` → 29) as of
the last run. This exists because a
sandboxed environment building this repo could not get a live
browser render (a domain-allowlist guard blocks it, deliberately) — a Node-based tie-out doesn't
need one.

## Fit brief

[`ada-fit.html`](ada-fit.html) is a requirement-by-requirement coverage brief against a specific
real job posting (Ada Infrastructure's Senior Associate, Cost Management — req R7887) — including
the requirements this background does *not* clear. `noindex,nofollow` — not meant to be discovered
by search engines, just linked directly when relevant.

## Status

Built 2026-08-25, expanded to 7 tabs the same day. **Published 2026-08-25** — public repo created,
pushed to `main`, GitHub Pages enabled and confirmed live (build status `built`, page returns HTTP
200) at https://tjaiyen.github.io/cost-management-command-center/.

## Design lineage

Architecture (single self-contained HTML file, tab-based navigation, theme tokens, real-vs-
illustrative badge discipline, a Node-based verify script) follows the same author's other
case-study work: [tj-finance-portfolio](https://github.com/tjaiyen/tj-finance-portfolio) (dbt +
DuckDB projects) and
[project-controls-command-center](https://github.com/tjaiyen/project-controls-command-center) (the
full-scale version of this same discipline — 20 KPIs, 11 tabs, 2,260 tests, built around a
synthetic capital transit program). This repo deliberately covers only the tabs a Cost Management
Associate role actually owns (cost, contingency, vendor governance, portfolio, data strategy) —
schedule health, field telemetry, and RAID-register territory from the full-scale reference are
explicitly out of scope, not silently dropped; see
`AdaInfra_FullScale_CommandCenter_BuildPlan_2026-08-25.md` in the prep vault for the scoping
rationale.
