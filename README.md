# Cost Management Command Center

A cost-management methodology demo — 11 tabs covering an executive brief, CAPEX budget bridges
with a live tri-point Monte Carlo, a genuinely live-computed stage gate, schedule float read as a
cost-risk signal, EMV-based change-order settlement modeling, vendor/crew governance, multi-region
portfolio rollup, a cross-tab attention-triage digest, and a data-strategy pipeline (now with a
free, local DuckDB parity layer) — built around a synthetic capital-development program.

**Live:** https://tjaiyen.github.io/cost-management-command-center/

**Zero dependencies · no build step · no server.** Every number is computed live in the page's own
JavaScript. Open `index.html` directly in a browser and it works. (The optional DuckDB parity
pipeline is the one piece with a real dependency — see Verification below.)

## What's on each tab

- **Overview** — a rolled-up KPI board reading live off the other tabs' own computed state (not a
  separately-typed summary), plus a "Signal / Model / Govern" framing, a jump pill on every KPI
  tile straight to its source tab, a **forecast bullet chart** (baseline vs. current forecast vs.
  Monte Carlo P90 worst-case on one animated bar, click-through to Cost), and the entry point for
  the guided 20-stop Tour.
- **Executive Command** — a "90 seconds" board-status brief, reading live off Overview/Cost/
  Contingency/Operating Framework state. Has its own print stylesheet (⌘/Ctrl+P) that keeps only
  this brief on the printed page.
- **Cost** — the CAPEX budget bridge (6-column waterfall) with a **net-variance trend sparkline**
  (illustrative history ending at the real current figure), a live what-if forecast sandbox (scope%
  / escalation% sliders, holding the real $208K driver and real contingency drawdown constant) and
  a **"which lever moves the total most" sensitivity tornado** (±10% scope/escalation swing, ranked
  by real $ impact via that same sandbox function), a data-center cost-driver benchmark card (real
  published cost-split percentages, per-MW premiums) with the 5 real 2025 market $/W benchmarks now
  a **ranked bar** instead of flat tiles, a **cost-driver treemap** (dollar-weighted control-account
  blocks), an **AACE RP 17R-97 estimate-maturity ladder** (Class 5→1, click/hover any class for its
  definition), an escalation-assumption governance card (last re-validated date vs. a fixed
  re-validation cadence, live-computed staleness), WBS cost allocation (now click-to-detail,
  cross-referencing the real control-account $ figure per category), a **Long-Lead Equipment
  Schedule-Risk Tracker** (procurement lead time vs. available schedule window per package,
  flagging a negative buffer as at-risk — two independently real, cited figures: substation
  transformer lead times running 160+ weeks in 2026, up from ~140 in 2023, and standby generators
  at 50–110 weeks with at least one major manufacturer sold out of high-horsepower units through
  2028), an **Interconnection Cost & Schedule Exposure** card (grid interconnection's real, cited
  30–37%-of-budget cost share and up-to-12-year data-center-scale wait, compared against this
  program's own assumed development schedule), and a control-account drill-down ledger
  (BAC/EV/AC/CV/CPI per account) paired with a **CPI stoplight grid** and a **CV tornado chart**
  ranking accounts by how far off-plan they are.
- **Contingency & Risk** — the contingency-drawdown early-warning slider (now paired with a **live
  banded gauge** that tracks the sliders in real time), a real, re-runnable triangular-distribution
  Monte Carlo simulation (**AACE International RP 57R-09**) with a live Beta-PERT tri-point
  playground (drag optimistic/most-likely/pessimistic, min≤mode≤max enforced), a **cumulative
  probability S-curve** plotted from the same 2,000-draw simulation as the histogram, and a
  reliability note tying the real $208K variance to the simulated band; a **probability × impact
  risk heat-map** (click any bubble for its detail) feeding a priced risk register
  (**AACE RP 40R-08**) — categorized into Execution / Escalation / Regulatory & Community buckets,
  each tracked and re-priced separately rather than blended into one contingency number; schedule
  float read as a cost-risk *input signal* (not schedule ownership), now with a **burn-down line**
  projected to the real "weeks to zero" figure; and an EMV-based change-order settlement decision
  (settle vs. dispute), now with a **two-bar comparison** highlighting the recommended path.
- **Vendor & Governance** — a consultant deliverable scorecard with a **pre-bid-vs-actual scatter
  plot** (±5% tolerance band shaded), a data-quality reconciliation health indicator with a
  **sync-lag trend sparkline**, and a crew Labor Productivity Factor table by trade with a
  **diverging bar** ranked against the 1.0 benchmark.
- **Portfolio** — a multi-region cost rollup (North America / Asia-Pacific / Europe / Latin
  America — the same four regions a real data-center platform actually operates in, used here only
  as realistic labels), now with **all 4 regions ranked on one bar** above the one-at-a-time tabs.
- **Operating Framework** — a genuinely *computed* Gate 4 (Contingency Coverage Ratio = remaining
  reserve ÷ total priced risk EV; currently BLOCKED on this build's own real numbers, not a bar
  someone set to "pending"), now paired with a **live radial-style gauge**, plus the illustrative
  4-gate stage track.
- **Actions** — a commercial action-item register (RFI pricing follow-ups, accrual
  reconciliations) with real staleness-aging logic — scoped to cost/commercial items, not a full
  project RAID register.
- **Attention & Triage** — a cross-tab digest of "what actually needs a human right now,"
  generated by re-checking the same alert functions already computed elsewhere, not a second model.
- **Data Strategy** — a pipeline architecture diagram, the real-vs-illustrative badge-discipline
  writeup, a free/local DuckDB SQL layer proving parity with the browser's own JS math, and a
  **Live Integrity Gate** — 13 reconciliation checks that run in your browser on every page load,
  not just in a Node test file someone would have to clone the repo to see (including a live
  escalation-assumption staleness check and a cross-region cost-reporting schema check).
- **Reference** — the 20-KPI catalog (operational question → KPI → jump-to-tab → real/illustrative
  badge → citation, one row per built visual across all 11 tabs), plus a searchable,
  category-filterable glossary of every AACE Recommended Practice, every real data-center cost
  figure, every other real industry standard (RICS/ICMS, Uptime Institute Tier I–IV), and (added
  from a real JD-gap analysis, 2026-08-26) an **Industry Vocabulary** category — AOR/EOR, LLE, and
  Quantity Surveying, the real construction/data-center terms a job-posting comparison found
  missing from the dashboard's own vocabulary — used anywhere in the build, each with its own
  citation.

## Real vs. illustrative

The program itself is synthetic — no employer, client, or agency data appears anywhere in this
repository. Real facts are threaded through it and badge-labeled inline wherever they appear:

- A real $208K variance root-cause trace.
- A real 100+ bid-package contingency/change-order-tracking history, $50M+ per project.
- **AACE International's real Recommended Practices**: RP 57R-09 (Monte Carlo contingency), RP
  65R-11 and RP 44R-08 (expected-value contingency, a distinct complementary method), RP 17R-97
  (Cost Estimate Classification), RP 40R-08 (risk-driver methodology), RP 58R-10 and RP 68R-11
  (index-based escalation estimating, the latter adding Monte Carlo), RP 86R-14 (variance analysis
  and reporting, aligned to ANSI/EIA-748 EVMS).
- Real published 2026 data-center cost-driver figures: electrical/power infrastructure at 40–45%
  of total cost, cooling at 15–25% (second-largest driver), liquid-cooled at $4.5–5.2M/MW vs.
  ~$1.8M/MW air-cooled, and a real quoted carrying-cost figure ($2.8M/month for idle equipment
  awaiting a missing transformer on a 50MW site).
- **Turner & Townsend's real *Data Centre Construction Cost Index 2025-2026*** (9th year, 52
  markets, ~250 experts surveyed): 5 real market benchmarks in US$/W (Tokyo $15.2, Singapore
  $14.5, Zurich $14.2, Silicon Valley $13.3, New Jersey $12.9), a real 5.5% YoY cost-per-watt
  increase for air-cooled builds in 2025, a real 7–10% AI/liquid-cooled cost premium (an
  independent second source corroborating the liquid-cooling figure above), and a real 2026
  outlook survey (60% expect +5–15% cost growth, 21% expect >15%) — verified directly against
  the report's own pages, not taken from a search summary.
- A real data-center substation transformer lead-time figure — stretching from roughly 140 weeks
  in 2023 to 160+ weeks in 2026, with the largest high-voltage units running up to ~200+ weeks —
  corroborated across the Turner & Townsend index above and independent 2026 industry reporting
  (Build.inc, PowerMag, Terrapin Consulting Group), backing the Cost tab's LLE tracker.
- **RICS/ICMS and Uptime Institute Tier I–IV** — real, named industry standards, cited honestly:
  ICMS as the real framework tier-one cost consultancies report against (not evidence of having
  overseen one), and Uptime Institute's tiers with an explicit note that no official per-tier cost
  figures exist publicly (checked against the source directly, not assumed).

Everything else — the program name, specific dollar amounts, dates, vendor labels, risk-register
rows, action items, dispute figures, productivity hours — is invented to make the methodology
legible, marked `illustrative` throughout.

## Interaction features

- **Currency toggle** (USD/GBP/JPY/BRL, header) — converts this program's own illustrative dollar
  figures only; cited real industry benchmarks stay in their originally published currency.
- **Contextual explainer toggles on all 20 KPIs** — click the (i) next to any KPI to see its real
  formula, a plain-language meaning, and diagnostic guidance inline, without leaving the tab (17
  buttons cover all 20 — 3 pairs share one heading/section).
- **A guided, 20-stop Tour** — walks the KPI catalog's own 20 rows in sequence, switching tabs live
  and showing each one's operational question (Start/Next/Prev/Exit, clamped at both ends).
- **Structured, dual-encoded alert cards** — every warning (contingency drawdown, data quality,
  Gate 4, float erosion) shows Detected / Probable Cause / Suggested Action, with a shape (▲/●)
  alongside color, not color alone.
- **Colorblind-safe status colors** — success/warning/danger now use hues from the real Okabe-Ito
  (2008) colorblind-safe palette, not just a generic red/amber/green — the specific RGB values were
  computed and WCAG 2.1 AA contrast-checked (≥4.5:1) against this page's own actual background
  colors in both themes (an external doc's claim to use this palette turned out to cite the wrong
  hex values entirely — verified independently before adopting the real ones instead).
- **Skip-to-content link + `scope="col"` on all 29 table headers** — real WCAG fixes (2.4.1 Bypass
  Blocks; explicit column-header association), not aspirational ones.
- **An altitude-grouped nav rail, a global 1–9 tab-jump + "?" keyboard-shortcuts overlay, a
  hover/focus-preview mini-drawer on every tab, a sticky in-tab section-anchor rail (Cost and
  Contingency & Risk), and a "return to origin tab" breadcrumb after any cross-tab jump** — ported
  from [project-controls-command-center](https://tjaiyen.github.io/project-controls-command-center/)'s
  own UI patterns (inspected its real HTML/CSS, not just its README), reimplemented at this
  build's own scale rather than copied verbatim from a much larger, more evolved system.
- **A live "Gate 4 blocked" status pill directly on the Operating Framework tab button** — visible
  the moment coverage falls below 1.00x, hidden entirely once it clears — ported from the same
  reference build's `#cntGate5` pattern.
- **Live Beta-PERT tri-point sliders** driving the real Monte Carlo simulation, with a simplified
  progressive-reveal histogram animation (not a physical ball-drop — stated honestly, not oversold).
- **A what-if forecast sandbox**, a searchable/filterable glossary, and a cross-tab triage digest
  that re-checks other tabs' own alert state rather than maintaining a second notion of "what's wrong."

## Verification (three independent layers)

1. **`node verify.cjs`** — an independent Node-based tie-out. Stubs a real (not no-op) `classList`,
   attribute storage, and click-event delegation so the page's own `<script>` runs headlessly with
   its actual interaction logic exercised, not just its math. Independently re-derives every
   computed figure on the page — the budget bridge, control-account ledger, what-if sandbox, Monte
   Carlo tri-point bounds, contingency drawdown, Gate 4 coverage ratio, schedule float erosion,
   EMV settlement decision, crew LPF, glossary search/filter, currency conversion — and exercises
   **both branches of every alert/verdict function**, including the branches this build's own
   hardcoded demo state never naturally triggers — including, after a `/stress-test` round,
   actually *firing* the currency-toggle `change` event and a tab-button `click` rather than only
   unit-testing the pure functions underneath them (that gap in the test harness itself is exactly
   how one real bug — a hardcoded `"$208K"` string that never converted with the currency
   toggle — shipped undetected for a full phase), firing every Guided Tour control
   (Start/Next/Prev/Exit) end to end including its clamp-at-the-edges behavior, firing the global
   1-9/"?" keyboard shortcuts and a real focus/blur cycle on the tab hover-preview drawer, firing
   a full cross-tab jump → return-breadcrumb → dismiss sequence, and firing every Live Integrity
   Gate check directly (not trusting the page's own pass/fail summary) plus confirming the Gate 4
   tab-rail status pill's real visible/hidden/text/class state, and (added with the proactive
   market-challenges build) independently re-deriving the Long-Lead Equipment buffer/at-risk math,
   the categorized risk-exposure subtotals, and the escalation-staleness age calculation against
   injected fixture dates rather than the real clock, and (added with the director-grade-visuals
   build) independently re-deriving the bullet chart's fill/target/worst-case percentages, the
   gauge's band classification at both boundary and never-exercised-by-default values, the risk
   heat-map's probability/impact bucket boundaries, the CPI stoplight and CV tornado's
   classification/ranking against a fresh independent sort, and the sensitivity tornado's ±10%
   scenario deltas re-derived via the real `computeWhatIf()` formula, and (added with the
   Phase 2 director-grade-visuals build) the net-variance and DQ-lag trends' real final point, the
   Monte Carlo S-curve's cumulative math (including a hand-computed 4-bin fixture), the treemap's
   BAC reconciliation, the market-benchmark and region rankings against a fresh independent sort,
   the float burn-down's exact readings, the EMV two-bar's height math, the consultant scatter's
   tolerance-band classification (including the one row that fails it), and the LPF diverging bar's
   ranking, and (added by a `/stress-test` audit) the gauge's needle-position math, Gate 4's
   never-exercised "cleared" band, and the EMV two-bar's never-exercised "dispute wins" layout
   (extracted into its own pure `computeTwoBarLayout()` specifically so that branch is testable),
   and (added with the JD-gap glossary category) that the new "Industry Vocabulary" category is
   real, filterable content — 3 rows, a search for "AOR" actually finds the AOR/EOR term. Also
   (added with the interconnection tracker, from a 20-item real industry/company research pass)
   the $ exposure re-derivation against the real cited 30–37% range and both the at-risk and
   cleared schedule-verdict branches.
   **235 assertions, all passing**
   (`node verify.cjs | grep -c "^pass:"` → 235) as of the last run. Exists because this repo was
   built in a sandboxed environment that could not get a live browser render (a domain-allowlist
   guard blocks it, deliberately) — a Node-based tie-out doesn't need one.
2. **`node stress.cjs`** — a distinct adversarial sweep, not a renamed copy of verify.cjs: no
   employer-name leak in the public demo, every `real`-badged section actually explains itself
   (checked against the real section text, not a fixed character window — an earlier, cruder
   version of this exact check produced 4 false failures on genuinely-cited content before being
   fixed to scope by `<section>` instead), illustrative sections never carry a bare "real" badge,
   structural tag/tab-count balance, a coverage-of-coverage check that every verdict function has
   both branches tested in verify.cjs, and that README's own stated tab count matches the live
   markup, and (added with the 20-KPI catalog, grown to 29 as later phases added their own) that
   all formula/methodology explainer divs
   have matching content in both directions — no silently-empty tooltip, no orphaned content
   nobody can see, that TAB_INFO's 11 entries exactly match the 11 real tabs, that every
   anchor-rail link resolves to a real section id, and (added with the proactive market-challenges
   build) that the risk register's 4 category buckets, the LLE tracker's single real-badged row,
   and both new GUARDS entries are actually present in the source. Also (added with the
   director-grade-visuals build) that all 7 new visuals' render functions and HTML containers
   exist, that every animated one goes through the shared `runOnFrame()` guard rather than calling
   `requestAnimationFrame()` directly (it doesn't exist in verify.cjs's Node vm sandbox — a bare
   call would throw before a single assertion ran), and a regression guard for a real mobile-layout
   bug this build's own Playwright inspection caught — a pre-existing, uncontained ~100px
   horizontal overflow in the 6-column CAPEX Budget Bridge chart on a 390px viewport, fixed with
   the same overflow-x:auto + min-width floor pattern already used for 8 tables on this page. Also
   (added with the Phase 2 director-grade-visuals build) that all 13 new render functions, their
   HTML containers, and their 4 new explainers exist, that the WBS bar's upgraded click-to-detail
   handler is actually wired, and that every $-displaying Phase 2 visual re-renders on the currency
   toggle — the same class of gap the proactive-framework build's own risk-category-subtotals fix
   had already closed once. Also (added by a `/stress-test` audit, combining this session's own
   review with an independent fresh-context reviewer) regression guards for: two tornado-bar
   visuals missing keyboard focus, 4 dynamic alert containers missing `aria-live`, CPI stoplight
   tiles relying on color alone with no ✓/⚠ marker, the maturity ladder's badge missing its
   real-vs-illustrative src-note, the "compliance sweep" GUARDS check's title overclaiming its own
   scope (broadened from 4 hardcoded containers to the real ~35), and the escalation-staleness
   date math mixing a UTC-parsed date string with a local-time `new Date()` "now". Also (added
   with a real JD-gap analysis against the vault's own AdaInfra_JD_InsightMap doc, 2026-08-26) that
   `ada-fit.html` has all 22 coverage rows its own lede claims (a real audit found 9 missing), and a
   general structural guard that every glossary category has a matching render target — the exact
   defect class caught mid-build when the new "Industry Vocabulary" category was added without one.
   Also (added with the interconnection tracker) that its render targets, explainer, and
   currency-toggle re-render all actually exist, and that the LLE section's upgraded generator
   citation states the real range rather than a bare claim.
   **129 checks, all passing**
   (`node stress.cjs | grep -c "^pass:"` → 129) as of the last
   run. Scoped honestly to this build's actual surface area — explicitly **not** an attempt to
   match [project-controls-command-center](https://tjaiyen.github.io/project-controls-command-center/)'s
   own `stress.cjs` at its literal 2,974-assertion scale (accumulated over a much larger build).
3. **`python3 pipeline/run_pipeline.py`** — a free, local, DuckDB-based second proof layer,
   independent of the browser's own JavaScript. Reads the same raw budget-bridge/WBS numbers
   `index.html` hardcodes (kept in lockstep by hand — this proves the SQL aggregation/formula layer
   matches the JS derivation, not an independently-entered dataset, same scoping note the
   reference build's own pipeline carries) and re-derives the budget-bridge total, the WBS
   percentage sum, and the control-account BAC split via SQL instead of JS. Requires
   `pip install duckdb` (a dedicated venv is recommended: `python3 -m venv .venv && .venv/bin/pip
   install duckdb`) — no other dependency, no paid API, no network call.

## Fit brief

[`ada-fit.html`](ada-fit.html) is a requirement-by-requirement coverage brief against a specific
real job posting (Ada Infrastructure's Senior Associate, Cost Management — req R7887) — including
the requirements this background does *not* clear. `noindex,nofollow` — not meant to be discovered
by search engines, just linked directly when relevant. **Audited against the vault's own JD Insight
Map 2026-08-26** — the brief's own lede claims "requirement-by-requirement," but it was missing
coverage rows for 9 of the JD's 21 Responsibilities/Requirements lines; all 9 added (13/13
Responsibilities, 9/9 Requirements now have their own row), each sourced from the InsightMap's own
already-written evidence, not a new claim.

## Status

Built 2026-08-25 (7 tabs), published the same day. Expanded to full scale 2026-08-26 across 5
phases — Cost-tab deep dive, Executive Command + Operating Framework, Actions + Attention &
Triage, schedule-as-cost-signal + EMV + productivity, and this verification-layer parity pass — to
match [project-controls-command-center](https://tjaiyen.github.io/project-controls-command-center/)'s
scale, per an explicit build-to-parity request. Each phase built, verified, committed, and pushed
before starting the next. Comprehensively visually inspected via real Playwright 2026-08-26,
fixing 4 findings (a tab-click/hover-drawer overlap bug and 3 mobile/overflow affordance gaps).
Added a proactive-solutions layer 2026-08-26, grounded in a vault market-challenges review of
Ada's own public data-center cost pressures: a Long-Lead Equipment Schedule-Risk Tracker (real
transformer lead-time citation), risk-register category buckets (Execution / Escalation /
Regulatory & Community), and 2 new Live Integrity Gate checks (escalation-assumption staleness,
cross-region schema consistency). Added 7 director-grade visuals 2026-08-26 — a bullet chart, a
live banded gauge, a probability×impact heat-map, an AACE maturity ladder, a CPI stoplight grid,
and 2 diverging tornado charts — from a brainstorm of director-grade upgrades to the existing
20-KPI catalog; each animates in, exposes its exact figure on hover/focus, and drills further on
click, verified via real Playwright (light/dark/mobile, all 7 interactions, zero console errors)
before shipping. Caught and fixed one real bug along the way (a bullet-chart CSS-scoping miss) and one pre-existing
mobile bug unrelated to this build (the CAPEX Budget Bridge chart's uncontained overflow on narrow
viewports, called out as its own item in the commit rather than folded in silently). Shipped the
remaining 12 of the 20-item brainstorm 2026-08-26 (Phase 2): a net-variance trend sparkline, a
Monte Carlo cumulative S-curve, a dollar-weighted cost-driver treemap, a ranked market-$/W bar, a
click-to-detail upgrade to the existing WBS bar, a float burn-down line, a settle-vs-dispute
two-bar comparison, a consultant pre-bid-vs-actual scatter plot, a DQ sync-lag trend, an LPF
diverging bar, an all-4-regions ranked bar, and a Gate 4 radial-style gauge (reusing the drawdown
gauge's own primitive). Verified with real Playwright across light/dark/mobile/currency-toggle —
zero new bugs found this pass, unlike Phase 1's two. Two shared reusable primitives (a small SVG
line chart, a horizontal ranked bar) came out of this pass and now back 6 of the 12 visuals.

Ran a real JD-gap analysis 2026-08-26 against the vault's own AdaInfra_JD_InsightMap_2026-08-20.md:
added an "Industry Vocabulary" glossary category (AOR/EOR, LLE, Quantity Surveying — real
construction/data-center terms this dashboard's own vocabulary was missing), and audited
`ada-fit.html` against every JD line the InsightMap doc had already analyzed — found and filled 9
missing coverage rows (its own lede claims "requirement-by-requirement"; it wasn't, until this
pass). Caught and fixed one real bug introduced along the way: adding the glossary category without
its own render target left it correctly counted/filterable but invisibly unrendered — a general
structural guard now catches this defect class for any future category, not just this one.

Ran a real "20 mission/business-critical industry challenges" deep-research pass 2026-08-26 (real
2026 sources: Wood Mackenzie, RMI, Eckert Seamans, Data Center Knowledge, EnkiAI, PowerMag, and
public reporting on Ares/Ada Infrastructure's own real project footprint). Honest finding: most of
the 20 were already covered by prior phases — a validation of existing coverage, not padding. Shipped
the one genuine net-new gap: an **Interconnection Cost & Schedule Exposure** tracker (grid
interconnection's real 30–37%-of-budget cost share and up-to-12-year data-center-scale wait,
compared against an assumed development schedule) — plus upgraded the LLE tracker's generator row
to a second independently-cited real figure (was illustrative). 3 items were deliberately kept out
of scope as Investment/Treasury-lane concerns, not Cost Management's (financing/interest-rate
structure, tenant-concentration/AI-bubble risk, GPU allocation risk). 2 items are real, current, and
specific to Ada's own actual site (a 2026 moratorium vote covering its Spotsylvania County, VA
campus) — deliberately kept vault-only, never the public dashboard, the same discipline already
applied to the earlier market-challenges build.

## Design lineage

Architecture (single self-contained HTML file, tab-based navigation, theme tokens, real-vs-
illustrative badge discipline, a Node-based verify script) follows the same author's other
case-study work: [tj-finance-portfolio](https://github.com/tjaiyen/tj-finance-portfolio) (dbt +
DuckDB projects) and
[project-controls-command-center](https://github.com/tjaiyen/project-controls-command-center) — a
larger sibling project (20 KPIs, 13 tabs, 12,191 lines, 2,974+124 tests, a DuckDB pipeline, built
around a synthetic capital transit program). **Correction (`/stress-test` audit, 2026-08-26):** an
earlier draft of this section claimed this repo underwent "a 5-phase expansion" that "mapped that
reference's tabs" to match its scale — that never happened, and the metrics said so on inspection:
this build sits at **11 tabs / ~3,030 lines**, not 13 / 12,191. What's true instead: a handful of
individual mechanisms were selectively borrowed from that sibling project across several separate,
unplanned feature requests over this repo's history — the GUARDS live-integrity-gate pattern, the
Gate-4 tab-rail status pill, and the general "real-vs-illustrative badge" discipline itself. Two
adaptations worth calling out on their own: Schedule became a cost-risk *input signal* here (float
erosion feeding contingency reassessment), not full CPM ownership; and the sibling project's live
Cloudflare-Worker "Ask AI" feature (a real Anthropic API key backing free-text chat) was
deliberately **not** replicated here — that's a live paid-API commitment gated on an explicit ask,
per this project's own cost-discipline rule, not something borrowing a few mechanisms implies.
