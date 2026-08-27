#!/usr/bin/env node
/*
 * verify.cjs — independent tie-out for index.html
 *
 * Stubs just enough DOM to let the page's own <script> run headlessly (no browser needed —
 * this is the Node-based equivalent the build plan called for, since agent-browser's domain
 * allowlist blocks live rendering of this page in this environment).
 *
 * Then independently re-derives every key figure in plain JS and asserts the page's own
 * computed state (window.__CMCC_STATE__) matches. A mismatch here is a real bug, not a
 * screenshot difference.
 */
"use strict";
const fs = require("fs");
const path = require("path");

let failures = 0;
function assertEqual(actual, expected, label, tolerance) {
  const tol = tolerance || 0;
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) {
    failures++;
    console.error("FAIL:", label, "expected", expected, "got", actual);
  } else {
    console.log("pass:", label, "=", actual);
  }
}
function assertStrEqual(actual, expected, label) {
  const ok = actual === expected;
  if (!ok) {
    failures++;
    console.error("FAIL:", label, "expected", JSON.stringify(expected), "got", JSON.stringify(actual));
  } else {
    console.log("pass:", label, "=", actual);
  }
}

// ---- minimal DOM stub, now with a REAL classList and REAL attribute storage --
// (a prior version of this file had no-op stubs for both, which meant the explainer-toggle
// logic could never actually be exercised here even though the file existed. Fixed.)
function makeElementStub() {
  const classes = new Set();
  const attrs = {};
  const listeners = {};
  const el = {
    _text: "", _html: "",
    style: {},
    classList: {
      add(c){ classes.add(c); },
      remove(c){ classes.delete(c); },
      contains(c){ return classes.has(c); },
      toggle(c, force){
        const shouldHave = force !== undefined ? force : !classes.has(c);
        if (shouldHave) classes.add(c); else classes.delete(c);
        return shouldHave;
      },
    },
    dataset: {},
    children: [],
    // Real per-element listener capture (a prior version stubbed this as a no-op, which meant
    // the currency-toggle re-render cascade, tab-click/keydown navigation, and every slider's
    // "input" handler were never actually FIRED by this test suite -- only their initial-load
    // computation was. That gap is exactly how a real bug (renderReliabilityNote hardcoding
    // "$208K" instead of calling fmt(208000), so it never converts on a currency switch) slipped
    // through two verify.cjs runs. Fixed: fire(type) below lets tests actually trigger these.
    addEventListener(type, handler){ (listeners[type] = listeners[type] || []).push(handler); },
    fire(type, evt){ (listeners[type] || []).forEach((h) => h(evt || {})); },
    // .focus() has no meaningful stub behavior to verify; .click() synthesizes a real click the
    // same way a browser's element.click() does -- fires this element's own registered "click"
    // listeners. Needed because the new 1-9 tab-jump keyboard handler calls both directly on a
    // tab button (same pattern the pre-existing ArrowLeft/ArrowRight handler already used,
    // untested until now because nothing had ever fired a keydown at the document level before).
    focus(){},
    click(){ el.fire("click"); },
    setAttribute(name, value){ attrs[name] = String(value); },
    getAttribute(name){ return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    appendChild(child){ el.children.push(child); },
    querySelectorAll(){ return []; },
    // real .closest(selector) support for a "class name" selector only (all this page's own
    // code needs) -- checks the element itself, then walks up via a manually-wired _parent.
    closest(selector){
      let node = el;
      while (node) {
        const sel = selector.replace(/^\./, "");
        if (node.classList && node.classList.contains(sel)) return node;
        node = node._parent || null;
      }
      return null;
    },
  };
  return el;
}
// textContent/innerHTML/className need get/set on the real object, added after creation so
// `el` above can close over itself.
function withProperties(el) {
  let text = "", html = "", cls = "";
  Object.defineProperty(el, "textContent", { get(){ return text; }, set(v){ text = String(v); } });
  Object.defineProperty(el, "innerHTML", { get(){ return html; }, set(v){ html = String(v); } });
  Object.defineProperty(el, "className", {
    get(){ return cls; },
    set(v){ cls = v; el.classList = makeElementStub().classList; String(v).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c)); },
  });
  return el;
}

const elementsById = {};
function getOrCreate(id) {
  if (!elementsById[id]) elementsById[id] = withProperties(makeElementStub());
  return elementsById[id];
}

// Generic per-type capture for document-level listeners (a prior version only ever captured
// "click", silently dropping any other event type -- meaning the new global keydown listener
// for 1-9 tab-jump and "?" shortcuts would have been registered but untestable, the exact same
// defect class as the earlier no-op addEventListener bug, just one level up. Fixed generically.)
const documentHandlers = {};
const documentClickHandlers = []; // kept as a live alias so existing click-specific tests are unaffected

// Captured so verify.cjs can fire a real click on one of these AFTER the page script has already
// wired its click/keydown listeners onto them (the page only calls querySelectorAll(".tabbtn")
// once, at load, so this reference stays valid for the whole test run).
let lastTabButtonStubs = [];
const documentStub = {
  getElementById: (id) => getOrCreate(id),
  querySelectorAll: (sel) => {
    if (sel === ".tabbtn") {
      // All 11 real dataset.tab values the page defines (this list went stale at 7 during the
      // Phase 2/3 tab additions -- a real gap: it meant activateTab()/keyboard nav for exec,
      // framework, actions, and triage were never test-covered even by name. Fixed.)
      // Real visible labels too (a prior version left textContent unset on these stubs -- a real
      // gap: any test asserting a tab button's OWN displayed label, like the return-breadcrumb
      // test below, silently got an empty string instead of a real mismatch or a real match).
      var TAB_LABELS = { overview:"Overview", exec:"Executive Command", cost:"Cost", contingency:"Contingency & Risk",
        governance:"Vendor & Governance", portfolio:"Portfolio", ramp:"Commercial Ramp", framework:"Operating Framework",
        actions:"Actions", triage:"Attention & Triage", data:"Data Strategy", reference:"Reference" };
      lastTabButtonStubs = ["overview","exec","cost","contingency","governance","portfolio","ramp","framework","actions","triage","data","reference"].map((name) => {
        const b = withProperties(makeElementStub());
        b.dataset = { tab: name };
        b.textContent = TAB_LABELS[name];
        elementsById["panel-" + name] = elementsById["panel-" + name] || withProperties(makeElementStub());
        return b;
      });
      return lastTabButtonStubs;
    }
    if (sel === ".tabpanel") return Object.keys(elementsById).filter((k) => k.startsWith("panel-")).map((k) => elementsById[k]);
    return [];
  },
  // Real attribute storage (not a no-op) -- needed to actually test the theme toggle, which reads
  // its own current state back via getAttribute("data-theme"). A prior version of this stub always
  // returned null regardless of what was "set," which would have made a real toggle look like a
  // permanent no-op to any test that checked it (none did, until this pass).
  documentElement: (() => {
    const attrs = {};
    return {
      setAttribute(name, value){ attrs[name] = String(value); },
      getAttribute(name){ return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    };
  })(),
  // Plain settable field (not a real browser's live-tracked focus) -- lets a test simulate "this
  // element had focus when the palette opened" to check the palette's own focus-return-on-close
  // behavior, which reads document.activeElement at open time.
  activeElement: null,
  addEventListener(type, handler){
    (documentHandlers[type] = documentHandlers[type] || []).push(handler);
    if (type === "click") documentClickHandlers.push(handler);
  },
  fire(type, evt){ (documentHandlers[type] || []).forEach((h) => h(evt || {})); },
  createElement: () => withProperties(makeElementStub()),
};

const canvasCtxStub = {
  clearRect(){}, fillRect(){},
};
function getCanvasStub() {
  const c = makeElementStub();
  c.width = 420; c.height = 140;
  c.getContext = () => canvasCtxStub;
  return c;
}
elementsById["mcCanvas"] = getCanvasStub();

// Range inputs need their real declared HTML default values, not left undefined --
// the page reads pctComplete.value / drawdownPct.value on load, exactly like a real browser
// would from the <input value="18">/<input value="35"> attributes.
const pctCompleteStub = makeElementStub(); pctCompleteStub.value = "18";
const drawdownPctStub = makeElementStub(); drawdownPctStub.value = "35";
elementsById["pctComplete"] = pctCompleteStub;
elementsById["drawdownPct"] = drawdownPctStub;

// Phase 1 range-input stubs, values matching their real HTML defaults exactly.
const mcMinStub = makeElementStub(); mcMinStub.value = "1750000000";
const mcModeStub = makeElementStub(); mcModeStub.value = "1870000000";
const mcMaxStub = makeElementStub(); mcMaxStub.value = "2170000000";
elementsById["mcMin"] = mcMinStub;
elementsById["mcMode"] = mcModeStub;
elementsById["mcMax"] = mcMaxStub;
const wiScopeStub = makeElementStub(); wiScopeStub.value = "4";
const wiEscalationStub = makeElementStub(); wiEscalationStub.value = "2";
elementsById["wiScope"] = wiScopeStub;
elementsById["wiEscalation"] = wiEscalationStub;

// Phase 5: glossary search input, empty by default (matches the real HTML's no-value default).
const glossarySearchStub = makeElementStub(); glossarySearchStub.value = "";
elementsById["glossarySearch"] = glossarySearchStub;

// The real HTML declares shortcutsOverlay with the `hidden` boolean attribute, which a real
// browser reflects onto element.hidden = true automatically on parse. This stub doesn't parse
// HTML, so it must be pre-seeded the same way pctComplete's declared `value="18"` is above --
// otherwise shortcutsOpen() would read `hidden` as undefined (falsy) and report "open" at load.
const shortcutsOverlayStub = makeElementStub(); shortcutsOverlayStub.hidden = true;
elementsById["shortcutsOverlay"] = shortcutsOverlayStub;

// Same reasoning: the real HTML declares jumpBreadcrumb with the `hidden` boolean attribute.
const jumpBreadcrumbStub = makeElementStub(); jumpBreadcrumbStub.hidden = true;
elementsById["jumpBreadcrumb"] = jumpBreadcrumbStub;

// UX/nav upgrade pass: same `hidden`-attribute pre-seed requirement for the new command palette
// overlay, and the region what-if slider's own declared value="0" default.
const paletteOverlayStub = makeElementStub(); paletteOverlayStub.hidden = true;
elementsById["paletteOverlay"] = paletteOverlayStub;
const regionAdjustStub = makeElementStub(); regionAdjustStub.value = "0";
elementsById["regionAdjust"] = regionAdjustStub;

// Info-toggle button stub -- real enough to test the explainer-toggle click delegation.
// The page's own handler does: e.target.closest(".info-toggle") then reads btn.dataset.explainer.
const infoToggleBtnStub = withProperties(makeElementStub());
infoToggleBtnStub.classList.add("info-toggle");
infoToggleBtnStub.dataset = { explainer: "aace5709exp" };

// A second, distinct info-toggle button stub (one of the 17 formula/methodology explainers added
// for the 20-KPI catalog) -- proves the click delegation is genuinely generic (reads
// btn.dataset.explainer dynamically), not hardcoded to the one original button.
const infoToggleBtnStub2 = withProperties(makeElementStub());
infoToggleBtnStub2.classList.add("info-toggle");
infoToggleBtnStub2.dataset = { explainer: "exp20" };
elementsById["aace5709exp"] = withProperties(makeElementStub()); // the explainer panel itself

// A REAL backing store (not a no-op) -- a stress-test finding: the previous no-op version meant
// this build's headline "full localStorage persistence" claim (theme/lasttab/currency/explain-
// mode/visited/factoids-seen/region) was never actually exercised by this suite at all, only the
// in-memory behavior during a single page load. Kept as a plain object (not a Map) so a SECOND,
// later vm.runInContext() of the same page script can share this exact store and prove a
// simulated "reload" actually restores what the first run persisted -- see the dedicated
// "persistence round-trip" section near the end of this file.
const localStorageBackingStore = {};
const localStorageStub = {
  getItem(key){ return Object.prototype.hasOwnProperty.call(localStorageBackingStore, key) ? localStorageBackingStore[key] : null; },
  setItem(key, value){ localStorageBackingStore[key] = String(value); },
};

// Minimal history/location mock -- gives the browser-back/forward feature REAL exercise instead
// of a stated-but-untested limitation. Counting push/replace separately (not just the resulting
// hash) is what lets a later assertion tell "a direct tab click pushed" apart from "an internal
// jump replaced," which is the actual behavior distinction that feature depends on.
let mockHash = "";
let mockPushCount = 0, mockReplaceCount = 0;
const mockHistory = {
  pushState(hstate, title, url){ mockPushCount++; mockHash = url; },
  replaceState(hstate, title, url){ mockReplaceCount++; mockHash = url; },
};
const mockLocation = { get hash(){ return mockHash; } };

// window's OWN addEventListener (distinct from document's) -- a stress-test finding: the guard
// `typeof window.addEventListener === "function"` in the page's popstate-wiring code always
// evaluated false without this, silently no-op'ing the registration on every verify.cjs run. That
// left the actual "does clicking the browser Back button work" mechanism completely untested --
// only the pushState/replaceState half was. `window === sandbox` below, so this method lives
// directly on the sandbox object.
const windowHandlers = {};
function fireWindowEvent(type, evt) { (windowHandlers[type] || []).forEach((h) => h(evt || {})); }

const sandbox = {
  document: documentStub,
  window: {},
  localStorage: localStorageStub,
  history: mockHistory,
  location: mockLocation,
  addEventListener(type, handler) { (windowHandlers[type] = windowHandlers[type] || []).push(handler); },
  getComputedStyle: () => ({ getPropertyValue: () => "6 182 212" }),
  console,
  Math,
  // Real setTimeout/clearTimeout (Node's own) -- needed the moment hideTabDrawer() started
  // calling clearTimeout() to cancel a pending hover-open timer (a real bug fix, found via a live
  // Playwright inspection). A prior version of this sandbox had neither at all, since nothing had
  // exercised the tab-drawer's actual timer path before that fix existed.
  setTimeout,
  clearTimeout,
  // Real Date (Node's own) -- needed the moment renderEscalationGovernance() started calling
  // new Date() at page load to compute the escalation-assumption staleness guard.
  Date,
};
sandbox.window = sandbox; // window === global scope, same pattern the page's own IIFE expects

// ---- extract the page's own <script> and run it in the sandbox ----
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) { console.error("FAIL: could not find <script> block in index.html"); process.exit(1); }
const pageScript = match[1];

const vm = require("vm");
vm.createContext(sandbox);
try {
  vm.runInContext(pageScript, sandbox);
} catch (err) {
  console.error("FAIL: page script threw during headless execution:", err.message);
  process.exit(1);
}

const state = sandbox.window.__CMCC_STATE__;
if (!state) {
  console.error("FAIL: window.__CMCC_STATE__ was not set — page script did not complete");
  process.exit(1);
}

// Captured immediately, before any of the many later tests below click a tab of their own and
// change these -- this is the ONLY point where "what did initial page load itself do" can still
// be distinguished from "what did a later test's click do."
const initialHash = mockHash;
const initialReplaceCount = mockReplaceCount;
const initialPushCount = mockPushCount;
// The cold-load restoreInitialTab() call must NOT show a factoid toast for the starting tab --
// it would compete with the "New here? Take the tour" card already on Overview. Captured here,
// before any later test's own click could legitimately trigger Overview's factoid for real.
const initialShownFactoids = Object.assign({}, state.getShownFactoids());
const initialFactoidToastShowing = documentStub.getElementById("factoidToast").classList.contains("show");

console.log("--- Budget Bridge ---");
// Independent re-derivation: baseline 1,750,000,000 + 106,000,000 + 33,687,500 + 208,000 - 125,000,000
const expectedFinal = 1750000000 + 106000000 + 33687500 + 208000 - 125000000;
assertEqual(state.bridge.baseline, 1750000000, "bridge baseline");
assertEqual(state.bridge.final, expectedFinal, "bridge final forecast");
assertEqual(state.bridge.delta, expectedFinal - 1750000000, "bridge net variance");

console.log("--- Budget Bridge: Market Escalation formula (independent stress-test finding, 2026-08-26) ---");
// A stress-test finding: an earlier version hardcoded this step's dollar value as a bare literal
// while the src-note/README claimed it was "priced off the real rate" -- a claim the CODE didn't
// actually make true. Independent re-derivation via the raw literals (NOT a read of
// MARKET_ESCALATION_RATE/MARKET_ESCALATION_EXPOSED_PCT, which would just be re-checking the same
// constants the page's own formula already used).
const expectedMarketEscalation = Math.round(1750000000 * 0.35 * 0.055);
assertEqual(state.bridgeSteps[2].value, expectedMarketEscalation, "Market Escalation step value matches baseline x 35% exposed share x the real cited 5.5% rate");
assertEqual(state.marketEscalationValue, expectedMarketEscalation, "the exposed marketEscalationValue variable matches the same independent re-derivation");

console.log("--- Budget Bridge: 'largest single driver' selection (zero test coverage before this pass) ---");
assertEqual(state.bridgeSteps.length, 6, "bridgeSteps has 6 rows (base, 3 up-steps, 1 down-step, final)");
const upSteps = state.bridgeSteps.filter((s) => s.type === "up");
assertEqual(upSteps.length, 3, "exactly 3 'up'-type bridge steps exist");
// Independent re-derivation via Math.max over the raw values, NOT a second call to
// computeLargestDriver() -- the same tautology class already avoided for the interconnection check.
const expectedMaxUp = Math.max(...upSteps.map((s) => Math.abs(s.value)));
assertEqual(expectedMaxUp, 106000000, "the largest 'up' step at this build's real numbers is Scope Change ($106M > ~$33.7M Market Escalation > $208K Field Execution)");
const driverStep = state.computeLargestDriver(state.bridgeSteps);
assertStrEqual(driverStep.label.indexOf("Scope") !== -1, true, "computeLargestDriver() on the real bridgeSteps picks Scope Change, matching the independent re-derivation");
const bDriverText = elementsById["bDriver"].textContent;
if (bDriverText.indexOf("Scope") === -1) {
  failures++; console.error("FAIL: #bDriver does not name Scope Change as the largest driver:", bDriverText);
} else {
  console.log("pass: #bDriver correctly names Scope Change as the largest driver =", bDriverText);
}
// Direct test of the exclusion rule itself with a synthetic fixture, not just this build's own
// numbers -- proves a "down" step is excluded from consideration no matter how large its magnitude,
// the exact regression this function was extracted from renderBridge() to make testable.
const fixtureSteps = [
  { label:"Base", value: 1000, type:"base" },
  { label:"Small Up", value: 50, type:"up" },
  { label:"Huge Down", value: -99999, type:"down" },
];
const fixtureDriver = state.computeLargestDriver(fixtureSteps);
assertStrEqual(fixtureDriver.label, "Small Up", "computeLargestDriver() excludes a huge-magnitude 'down' step even when it dwarfs every 'up' step (never-exercised-by-default branch)");
const noUpFixture = [{ label:"Base", value: 1000, type:"base" }, { label:"Down only", value: -50, type:"down" }];
assertStrEqual(state.computeLargestDriver(noUpFixture), null, "computeLargestDriver() returns null when there are no 'up' steps at all, not a crash or a false positive");

console.log("--- Contingency Drawdown ---");
// Independent re-derivation: default sliders are 18% complete, 35% drawn -> ratio = 35/18
assertEqual(state.drawdownRatio, 35 / 18, "drawdown ratio (default sliders)", 0.0001);
if (state.drawdownRatio > 1.5) {
  console.log("pass: default sliders correctly trip the early-warning threshold (>1.5x)");
} else {
  failures++;
  console.error("FAIL: default sliders should trip the early-warning threshold but didn't");
}

console.log("--- Monte Carlo ---");
// Stochastic — can't assert an exact value, but P50 < P80 < P90 must always hold, and all
// three must fall within the [min, max] triangular bounds used by the page (1,750,000,000 / 2,170,000,000).
const mc = state.monteCarlo;
if (mc.p50 < mc.p80 && mc.p80 < mc.p90) {
  console.log("pass: Monte Carlo percentiles are correctly ordered (P50 < P80 < P90)");
} else {
  failures++;
  console.error("FAIL: Monte Carlo percentiles out of order:", mc);
}
if (mc.p50 >= 1750000000 && mc.p90 <= 2170000000) {
  console.log("pass: Monte Carlo percentiles fall within the declared triangular bounds");
} else {
  failures++;
  console.error("FAIL: Monte Carlo percentiles outside declared bounds:", mc);
}

console.log("--- WBS Allocation ---");
assertEqual(state.wbsSum, 100, "WBS percentages sum to 100");

console.log("--- Risk Register ---");
// Independent re-derivation of total expected value from the same 4 illustrative rows
const expectedRiskEV = (0.35*95000000) + (0.25*42000000) + (0.40*28000000) + (0.20*35000000);
assertEqual(state.totalRiskEV, expectedRiskEV, "total risk expected value", 0.01);

console.log("--- Risk Register: categorized exposure buckets (Execution / Escalation / Regulatory & Community) ---");
// Independent re-derivation, not a read of the page's own subtotal object.
const expectedExecutionEV = (0.35*95000000) + (0.25*42000000);
const expectedEscalationEV = 0.40*28000000;
const expectedRegCommunityEV = 0.20*35000000;
assertEqual(state.riskCategorySubtotals["Execution"], expectedExecutionEV, "Execution bucket EV", 0.01);
assertEqual(state.riskCategorySubtotals["Escalation"], expectedEscalationEV, "Escalation bucket EV", 0.01);
assertEqual(state.riskCategorySubtotals["Regulatory & Community"], expectedRegCommunityEV, "Regulatory & Community bucket EV", 0.01);
assertEqual(
  state.riskCategorySubtotals["Execution"] + state.riskCategorySubtotals["Escalation"] + state.riskCategorySubtotals["Regulatory & Community"],
  state.totalRiskEV,
  "the 3 category buckets sum back to the same total exposure the flat register reports (no risk silently dropped or double-counted by bucketing)",
  0.01
);
// Pure-function re-derivation directly, independent of the cached state object.
const rederivedSubtotals = state.computeRiskCategorySubtotals([
  { prob:0.35, impact:95000000, category:"Execution" },
  { prob:0.25, impact:42000000, category:"Execution" },
  { prob:0.40, impact:28000000, category:"Escalation" },
  { prob:0.20, impact:35000000, category:"Regulatory & Community" }
]);
assertEqual(rederivedSubtotals["Execution"], expectedExecutionEV, "computeRiskCategorySubtotals() called directly matches the independent re-derivation", 0.01);

console.log("--- Long-Lead Equipment Schedule-Risk Tracker ---");
assertEqual(state.lleItems.length, 5, "5 long-lead packages tracked");
const transformerRow = state.lleResult.find((r) => r.name.indexOf("transformer") !== -1);
if (!transformerRow) {
  failures++; console.error("FAIL: could not find the transformer row in lleResult");
} else {
  assertEqual(transformerRow.leadWeeks, 160, "transformer lead time is the real cited 160-week figure");
  assertEqual(transformerRow.buffer, transformerRow.availableWeeks - transformerRow.leadWeeks, "transformer buffer independently re-derives as available minus lead time");
  assertStrEqual(transformerRow.atRisk, transformerRow.buffer < 0, "transformer atRisk flag matches buffer < 0, not a hardcoded true/false");
  assertStrEqual(transformerRow.real, true, "the transformer row is badged 'real' (a cited lead-time figure)");
}
const generatorRow = state.lleResult.find((r) => r.name.indexOf("generator") !== -1);
if (!generatorRow) {
  failures++; console.error("FAIL: could not find the generator row in lleResult");
} else {
  assertEqual(generatorRow.leadWeeks, 78, "generator lead time is the real cited 78-week figure (within the 50-110wk real range)");
  assertStrEqual(generatorRow.real, true, "the generator row is badged 'real' (a second, independently-cited lead-time figure, added 2026-08-26)");
}
// Exactly the 2 cited rows (transformer, generator) should be badged real -- the other 3 stay
// illustrative since their lead-time figures aren't independently sourced.
const realCount = state.lleItems.filter((it) => it.real).length;
assertEqual(realCount, 2, "exactly 2 LLE rows are badged real (transformer + generator, both independently cited)");
// computeLLERisk() re-run directly on a synthetic fixture proves the buffer/atRisk math itself,
// not just this build's own current numbers (both branches: at-risk and clear).
const lleFixture = state.computeLLERisk([
  { name:"fixture at-risk item", leadWeeks:100, availableWeeks:80, real:false },
  { name:"fixture clear item", leadWeeks:40, availableWeeks:80, real:false }
]);
assertStrEqual(lleFixture[0].atRisk, true, "computeLLERisk() flags a package whose lead time exceeds its available window as at-risk");
assertStrEqual(lleFixture[1].atRisk, false, "computeLLERisk() clears a package with a positive buffer");

console.log("--- Escalation Assumption Governance (staleness guard) ---");
// computeEscalationAge() accepts an injectable "now" specifically so this test is deterministic
// regardless of the real calendar date the suite happens to run on.
const escNotStale = state.computeEscalationAge("2026-01-01", 90, new Date("2026-01-15"));
assertEqual(escNotStale.ageDays, 14, "escalation age re-derives as exactly 14 days for a 14-day-old fixture");
assertStrEqual(escNotStale.stale, false, "14 days old, 90-day cadence -> not stale");
const escStale = state.computeEscalationAge("2026-01-01", 90, new Date("2026-06-01"));
assertStrEqual(escStale.stale, true, "151 days old, 90-day cadence -> correctly trips stale");
assertEqual(escStale.ageDays, 151, "escalation age re-derives as exactly 151 days for the stale fixture");
// This build's own live default (real cadence, real "last validated" date, real current clock)
// must not be stale today -- a pre-registered expectation this run genuinely checks, not assumes.
assertStrEqual(state.escalationStatus.stale, false, "this build's own live escalation assumption is not stale as of today's run");

console.log("--- Director-grade visuals: Bullet chart (Portfolio Forecast) ---");
assertEqual(state.bulletResult.baseline, state.bridge.baseline, "bullet chart baseline matches the real budget-bridge baseline");
assertEqual(state.bulletResult.forecast, state.bridge.final, "bullet chart forecast matches the real budget-bridge final forecast");
assertEqual(state.bulletResult.worst, state.monteCarlo.p90, "bullet chart worst-case marker matches the real Monte Carlo P90");
const expectedAxisMax = Math.max(state.bulletResult.baseline, state.bulletResult.forecast, state.bulletResult.worst) * 1.08;
assertEqual(state.bulletResult.fillPct, Math.min(100, (state.bulletResult.forecast / expectedAxisMax) * 100), "bullet fill % independently re-derives", 0.001);
assertEqual(state.bulletResult.targetPct, Math.min(100, (state.bulletResult.baseline / expectedAxisMax) * 100), "bullet baseline-tick % independently re-derives", 0.001);

console.log("--- Director-grade visuals: Drawdown gauge (linear banded) ---");
assertStrEqual(state.bandForValue(0.5, [{max:1.0,cls:"success"},{max:1.5,cls:"warning"},{max:Infinity,cls:"danger"}]), "success", "bandForValue: 0.5 falls in the success band");
assertStrEqual(state.bandForValue(1.0, [{max:1.0,cls:"success"},{max:1.5,cls:"warning"},{max:Infinity,cls:"danger"}]), "success", "bandForValue: exactly at the 1.0 boundary is still inclusive of success (<=)");
assertStrEqual(state.bandForValue(1.2, [{max:1.0,cls:"success"},{max:1.5,cls:"warning"},{max:Infinity,cls:"danger"}]), "warning", "bandForValue: 1.2 falls in the warning band");
assertStrEqual(state.bandForValue(1.8, [{max:1.0,cls:"success"},{max:1.5,cls:"warning"},{max:Infinity,cls:"danger"}]), "danger", "bandForValue: 1.8 falls in the danger band (never-exercised-by-default branch)");
assertEqual(state.gaugeResult.value, state.drawdownRatio, "gauge value matches the real live drawdown ratio");
// The gauge's needle POSITION (not just its value/band) was never independently re-derived before
// this stress-test pass -- a hand-computed pct alongside the live one closes that hole.
const expectedGaugePct = Math.max(0, Math.min(1, (state.drawdownRatio - 0) / (2.0 - 0)));
assertEqual(state.gaugeResult.pct, expectedGaugePct, "gauge needle position (pct) independently re-derives from the real drawdown ratio over its declared 0-2.0x range", 0.0001);
// Gate 4's gauge uses an inverted 2-band array (below 1.0 = danger here, unlike the drawdown
// gauge's 3-band success-first ordering) -- its "success" (>= 1.0 coverage) branch was never
// exercised by any test, since the live default state is always BLOCKED. Test the shared
// bandForValue() helper directly against GATE4_GAUGE_BANDS with a synthetic cleared-gate value.
assertStrEqual(state.bandForValue(1.2, state.GATE4_GAUGE_BANDS), "success", "Gate 4 bands: a coverage ratio of 1.2 (a cleared gate) correctly classifies as success (never-exercised-by-default branch)");
assertStrEqual(state.bandForValue(0.4, state.GATE4_GAUGE_BANDS), "danger", "Gate 4 bands: a coverage ratio of 0.4 (this build's real, blocked state) classifies as danger");

console.log("--- Director-grade visuals: Risk heat-map (probability x impact buckets) ---");
assertStrEqual(state.probBucket(0.19), "Low", "probBucket: 0.19 is Low");
assertStrEqual(state.probBucket(0.20), "Med", "probBucket: exactly 0.20 is Med (inclusive lower bound)");
assertStrEqual(state.probBucket(0.34), "Med", "probBucket: 0.34 is Med");
assertStrEqual(state.probBucket(0.35), "High", "probBucket: exactly 0.35 is High (inclusive lower bound)");
assertStrEqual(state.impactBucket(29999999), "Low", "impactBucket: 29,999,999 is Low");
assertStrEqual(state.impactBucket(30000000), "Med", "impactBucket: exactly 30,000,000 is Med");
assertStrEqual(state.impactBucket(59999999), "Med", "impactBucket: 59,999,999 is Med");
assertStrEqual(state.impactBucket(60000000), "High", "impactBucket: exactly 60,000,000 is High");
assertEqual(state.heatmapCells.length, 4, "heat-map has exactly 4 risk cells (one per risk register row)");
state.heatmapCells.forEach((c) => {
  assertEqual(c.ev, c.prob * c.impact, `heat-map cell "${c.name}" EV re-derives as prob x impact`, 0.01);
});
const transformerCell = state.heatmapCells.find((c) => c.name.indexOf("Transformer") !== -1);
if (!transformerCell) {
  failures++; console.error("FAIL: could not find the transformer risk in heatmapCells");
} else {
  // Pre-registered: prob 0.35 -> High, impact 95,000,000 -> High -- the worst cell on the grid.
  assertStrEqual(transformerCell.probBucket, "High", "transformer risk lands in the High-probability row, as pre-registered");
  assertStrEqual(transformerCell.impactBucket, "High", "transformer risk lands in the High-impact column, as pre-registered");
}

console.log("--- Director-grade visuals: Maturity ladder (AACE RP 17R-97) ---");
assertEqual(state.AACE_CLASSES.length, 5, "5 AACE cost-estimate classes (Class 5 through Class 1)");
assertEqual(state.costEstimateClass, 3, "this build's illustrative current class is Class 3 (mid-procurement)");
assertEqual(state.ladderResult.current, state.costEstimateClass, "ladderResult.current matches the module-level costEstimateClass, not a stale copy");

console.log("--- Director-grade visuals: CPI stoplight grid (real 3-band threshold, deep-research pass 2026-08-26) ---");
assertEqual(state.stoplightResult.length, state.controlAccounts.length, "one stoplight tile per control account, no silent drop or duplicate");
// Independent re-derivation via the raw formula (real DOD-cited thresholds: <0.90 trouble,
// 0.90-0.94 watch, >=0.95 good), NOT a second call to cpiBand() with the same input -- same
// tautology class this build's other GUARDS entries avoid. The prior version of this test compared
// `a.cpi >= 1` to itself, which could never fail regardless of what the real code did -- fixed.
state.stoplightResult.forEach((a) => {
  const expectedBand = a.cpi >= 0.95 ? "good" : a.cpi >= 0.90 ? "watch" : "trouble";
  assertStrEqual(state.cpiBand(a.cpi), expectedBand, `stoplight tile "${a.name}" (CPI ${a.cpi.toFixed(4)}) bands as "${expectedBand}", independently re-derived from the real threshold literals`);
});
// This program's own real default data must exercise BOTH the "good" and "watch" bands (confirmed,
// not assumed) -- "trouble" (<0.90) is never hit by default, so it's tested via a fixture below.
const realBands = state.controlAccounts.map((a) => state.cpiBand(a.cpi));
assertStrEqual(realBands.includes("good") && realBands.includes("watch"), true, "this program's real default control accounts exercise both the 'good' and 'watch' CPI bands, not just one");
assertStrEqual(realBands.includes("trouble"), false, "this program's real default control accounts never hit 'trouble' (<0.90) -- confirmed, not assumed; that branch is tested via a fixture next");
assertStrEqual(state.cpiBand(0.8999), "trouble", "cpiBand(): just below 0.90 is 'trouble' (the real DOD-cited threshold), the never-exercised-by-default branch");
assertStrEqual(state.cpiBand(0.90), "watch", "cpiBand(): exactly 0.90 is 'watch', not 'trouble' -- the boundary is inclusive on the watch side");
assertStrEqual(state.cpiBand(0.9499), "watch", "cpiBand(): just below 0.95 is still 'watch', not 'good'");
assertStrEqual(state.cpiBand(0.95), "good", "cpiBand(): exactly 0.95 is 'good' -- the boundary is inclusive on the good side");

console.log("--- Director-grade visuals: Control-Account CV tornado ---");
const expectedCvRanking = state.controlAccounts.slice().sort((a, b) => Math.abs(b.cv) - Math.abs(a.cv)).map((a) => a.name);
assertStrEqual(JSON.stringify(state.cvTornadoResult.map((a) => a.name)), JSON.stringify(expectedCvRanking), "CV tornado ranking matches an independent sort by |CV| descending");

console.log("--- Director-grade visuals: What-if sensitivity tornado ---");
const scenarios = state.computeSensitivityScenarios(state.bridge.baseline, 208000, -125000000, state.bridge.final);
assertEqual(scenarios.length, 4, "4 sensitivity scenarios (scope +/-10%, escalation +/-10%)");
const expectedScopeUp = (state.bridge.baseline + state.bridge.baseline * 0.10 + 208000 - 125000000) - state.bridge.final;
const scopeUpScenario = scenarios.find((s) => s.name === "Scope +10%");
if (!scopeUpScenario) {
  failures++; console.error("FAIL: could not find the 'Scope +10%' scenario");
} else {
  assertEqual(scopeUpScenario.delta, expectedScopeUp, "Scope +10% delta independently re-derives via the real computeWhatIf formula", 0.01);
}
const sortedByMagnitude = scenarios.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
assertStrEqual(JSON.stringify(scenarios.map((s) => s.name)), JSON.stringify(sortedByMagnitude.map((s) => s.name)), "sensitivity scenarios are already ranked by |delta| descending, not left in declaration order");
// Pre-registered: with a positive baseline, a "+10%" scope/escalation swing is unfavorable (cost up)
// and a "-10%" swing is favorable (cost down) -- both branches must appear, not just one direction.
const hasUnfavorable = scenarios.some((s) => s.delta > 0);
const hasFavorable = scenarios.some((s) => s.delta < 0);
assertStrEqual(hasUnfavorable && hasFavorable, true, "both a cost-increase and a cost-decrease scenario appear among the 4 (real +/- branches, not a one-sided demo)");

console.log("--- Phase 2 director-grade visuals: Net variance trend ---");
assertEqual(state.netVarianceTrendResult.values.length, 6, "net-variance trend has 6 points (5 illustrative + 1 real)");
assertEqual(state.netVarianceTrendResult.values[5], state.bridge.final - state.bridge.baseline, "the trend's final point is the real current net variance, not a 6th invented number");

console.log("--- Phase 2 director-grade visuals: Monte Carlo S-curve ---");
const flatCurve = state.computeCumulativeCurve([1, 1, 1, 1]);
assertStrEqual(JSON.stringify(flatCurve), JSON.stringify([25, 50, 75, 100]), "computeCumulativeCurve on 4 equal bins produces 25/50/75/100");
const realCurve = state.computeCumulativeCurve(state.lastMCHistogram.counts);
assertEqual(realCurve[realCurve.length - 1], 100, "the real S-curve's last bin reaches exactly 100% cumulative", 0.001);
let curveIsMonotonic = true;
for (let i = 1; i < realCurve.length; i++) { if (realCurve[i] < realCurve[i - 1]) curveIsMonotonic = false; }
assertStrEqual(curveIsMonotonic, true, "the real S-curve never decreases (a cumulative curve by construction)");

console.log("--- Phase 2 director-grade visuals: Cost-driver treemap ---");
assertEqual(state.treemapResult.total, state.bridge.baseline, "treemap's total BAC reconciles to the real budget-bridge baseline (same reconciliation GUARDS already checks)");
assertEqual(state.treemapResult.blocks.length, state.controlAccounts.length, "one treemap block per control account");
const treemapPctSum = state.treemapResult.blocks.reduce((s, b) => s + b.pct, 0);
assertEqual(treemapPctSum, 100, "treemap block percentages sum to 100", 0.01);

console.log("--- Phase 2 director-grade visuals: Market $/W ranked bar ---");
assertEqual(state.marketBenchmarkResult.length, 5, "5 real market benchmarks ranked");
const marketSorted = state.marketBenchmarkResult.every((m, i, arr) => i === 0 || arr[i - 1].value >= m.value);
assertStrEqual(marketSorted, true, "market benchmarks are ranked descending by $/W, not left in citation order");
assertEqual(state.marketBenchmarkResult[0].value, 15.2, "the top-ranked market is the real $15.2/W figure (Tokyo)");

console.log("--- Phase 2 director-grade visuals: Float burn-down ---");
assertEqual(state.floatBurndownResult.values.length, 4, "float burn-down plots all 4 real weekly readings");
assertStrEqual(JSON.stringify(state.floatBurndownResult.values), JSON.stringify([22, 19, 14, 13]), "float burn-down values match the real floatHistory readings exactly");

console.log("--- Phase 2 director-grade visuals: EMV two-bar comparison ---");
assertEqual(state.emvTwoBarResult.settleWins, state.emvDecision.recommend === "settle", "two-bar 'settleWins' flag matches the real computeEMVDecision() recommendation");
const expectedSettlePct = (state.emvDecision.settleNowCost / (Math.max(state.emvDecision.settleNowCost, state.emvDecision.disputeEV) * 1.15)) * 100;
assertEqual(state.emvTwoBarResult.settlePct, expectedSettlePct, "settle-bar height % independently re-derives from the real EMV decision", 0.01);
// The "dispute wins" branch (lose-styled settle bar, win-styled dispute bar) is never exercised by
// this build's own demo data (settle always wins there) -- computeTwoBarLayout() is pure
// specifically so this branch is directly testable with a synthetic fixture instead of needing to
// mutate and restore module state.
const disputeWinsLayout = state.computeTwoBarLayout(100000, 60000, "dispute");
assertStrEqual(disputeWinsLayout.settleWins, false, "computeTwoBarLayout() correctly flags dispute as the winner when disputeEV < settleNowCost (never-exercised-by-default branch)");
assertEqual(disputeWinsLayout.disputePct, (60000 / (100000 * 1.15)) * 100, "dispute-bar height % independently re-derives in the dispute-wins fixture", 0.01);

console.log("--- Phase 2 director-grade visuals: Consultant scatter plot (real AACE RP 18R-97 Class 1 asymmetric band, corrected 2026-08-26) ---");
assertEqual(state.consultantScatterResult.length, 3, "3 consultants plotted");
// Independent re-derivation via the real, asymmetric literals (-10% to +15%), NOT a second call to
// withinConsultantTolerance() with the same input -- same tautology class this build's GUARDS avoid.
const expectedTolerance = [
  ((1310000 - 1240000) / 1240000 * 100) >= -10 && ((1310000 - 1240000) / 1240000 * 100) <= 15,
  ((2085000 - 2100000) / 2100000 * 100) >= -10 && ((2085000 - 2100000) / 2100000 * 100) <= 15,
  ((702000 - 640000) / 640000 * 100) >= -10 && ((702000 - 640000) / 640000 * 100) <= 15
];
state.consultantScatterResult.forEach((c, i) => {
  assertStrEqual(c.withinTolerance, expectedTolerance[i], `consultant #${i + 1} (${c.name}) tolerance flag independently re-derives from its real pre-bid/actual figures against the real asymmetric band`);
});
// Under the OLD flat symmetric ±5% band, Consultant A (+5.6%) and Consultant C (+9.7%) both fell
// OUTSIDE tolerance -- confirming here that the real, wider AACE band now correctly clears both,
// not silently the same result under a different label.
assertStrEqual(state.consultantScatterResult[0].withinTolerance, true, "Consultant A (+5.6%) is WITHIN the real -10%/+15% AACE Class 1 band (would have failed the old, incorrect ±5% band)");
assertStrEqual(state.consultantScatterResult[2].withinTolerance, true, "Consultant C (+9.7%) is WITHIN the real -10%/+15% AACE Class 1 band (would have failed the old, incorrect ±5% band)");
// The warn (outside-tolerance) branch is never exercised by this program's own real default data
// under the new, wider band -- tested directly via a fixture instead, at both the real boundaries.
assertStrEqual(state.withinConsultantTolerance(15), true, "withinConsultantTolerance(): exactly +15% is WITHIN tolerance -- the upper boundary is inclusive");
assertStrEqual(state.withinConsultantTolerance(15.01), false, "withinConsultantTolerance(): just above +15% is OUTSIDE tolerance (the never-exercised-by-default warn branch)");
assertStrEqual(state.withinConsultantTolerance(-10), true, "withinConsultantTolerance(): exactly -10% is WITHIN tolerance -- the lower boundary is inclusive");
assertStrEqual(state.withinConsultantTolerance(-10.01), false, "withinConsultantTolerance(): just below -10% is OUTSIDE tolerance");

console.log("--- Phase 2 director-grade visuals: DQ sync-lag trend ---");
assertEqual(state.dqLagTrendResult.values.length, 5, "DQ lag trend has 5 points (4 illustrative + 1 real)");
assertEqual(state.dqLagTrendResult.values[4], 9, "the DQ trend's final point is the real dqDemoState.syncLagDays (9), not a 5th invented number");

console.log("--- Phase 2 director-grade visuals: LPF diverging bar ---");
assertEqual(state.lpfDivergingBarResult.length, 3, "3 trades ranked");
const lpfSorted = state.lpfDivergingBarResult.every((p, i, arr) => i === 0 || arr[i - 1].lpf <= p.lpf);
assertStrEqual(lpfSorted, true, "LPF diverging bar ranks worst (lowest LPF) first");
assertStrEqual(state.lpfDivergingBarResult[0].trade, "Mechanical / Piping", "the worst-ranked trade is the real Mechanical/Piping row (the only one below 1.0 LPF)");

console.log("--- Phase 2 director-grade visuals: Region ranked bar (all 4 at once) ---");
assertEqual(state.regionRankedBarResult.length, 4, "all 4 regions ranked together, not one at a time");
const expectedNAPct = state.computeRegionVariancePct(state.regions.find((r) => r.code === "NA"));
assertEqual(expectedNAPct, ((state.bridge.final - 1750000000) / 1750000000) * 100, "computeRegionVariancePct() independently re-derives NA's variance from its real baseline/forecast", 0.001);
const regionSorted = state.regionRankedBarResult.every((r, i, arr) => i === 0 || arr[i - 1].value >= r.value);
assertStrEqual(regionSorted, true, "regions are ranked descending by variance%, not left in declaration order");

console.log("--- Phase 2 director-grade visuals: Gate 4 radial gauge ---");
assertEqual(state.gate4GaugeResult.value, state.gateStatus.ratio, "Gate 4 gauge value matches the real live gateStatus.ratio");
assertStrEqual(state.gate4GaugeResult.cls, state.gateStatus.ratio < 1.0 ? "danger" : "success", "Gate 4 gauge band classification matches the real blocked/cleared threshold");

console.log("--- Interconnection Cost & Schedule Exposure (20-item deep-research pass, 2026-08-26) ---");
// Independent re-derivation via the raw formula (baseline x the cited % literals), NOT a second
// call to computeInterconnectionExposure() -- calling the exact same pure function with the exact
// same inputs would always agree with itself regardless of whether its own formula is correct, a
// tautology found and fixed (both here and in the matching GUARDS entry) by a /stress-test pass.
assertEqual(state.interconnectionResult.dollarLow, state.bridge.baseline * 0.30, "interconnection $ exposure low end independently re-derives as baseline x the real cited 30% floor", 0.01);
assertEqual(state.interconnectionResult.dollarHigh, state.bridge.baseline * 0.37, "interconnection $ exposure high end independently re-derives as baseline x the real cited 37% ceiling", 0.01);
// This build's own live default (12yr typical wait vs. a 3yr assumed schedule) is genuinely
// AT RISK -- pre-registered, not assumed. Then prove the OK branch too, since a well-behaved
// program with a longer assumed schedule window would clear it -- a branch the live default
// never exercises on its own.
assertStrEqual(state.interconnectionResult.atRisk, true, "this build's own live assumptions (12yr wait vs. 3yr assumed schedule) are correctly flagged at risk");
const clearedFixture = state.computeInterconnectionExposure(1750000000, { pctOfBudgetLow: 30, pctOfBudgetHigh: 37, typicalWaitYearsDataCenter: 12, assumedDevelopmentScheduleYears: 15 });
assertStrEqual(clearedFixture.atRisk, false, "computeInterconnectionExposure() correctly clears a program whose assumed schedule exceeds the typical wait (never-exercised-by-default branch)");
// Exact-tie boundary (assumed schedule === typical wait) -- neither the live default (12 vs 3) nor
// the cleared fixture above (12 vs 15) exercises this exact edge, flagged by an independent
// reviewer as a real coverage gap. atRisk uses strict '>' ("exceeds"), so an exact tie clears --
// a program with zero schedule margin isn't flagged, which is the documented, intended semantic.
const tieFixture = state.computeInterconnectionExposure(1750000000, { pctOfBudgetLow: 30, pctOfBudgetHigh: 37, typicalWaitYearsDataCenter: 5, assumedDevelopmentScheduleYears: 5 });
assertStrEqual(tieFixture.atRisk, false, "computeInterconnectionExposure() at the exact tie boundary (wait === assumed schedule) does not flag at-risk -- 'exceeds' is strict, not inclusive");

console.log("--- Commercial Ramp tab: reserve status, delay impact, SLA penalty, revenue yield (independent-reviewer finding, 2026-08-26 -- these had zero direct test coverage) ---");
// computeRampReserveStatus: this build's own live default, then the never-exercised exhausted branch.
assertEqual(state.computeRampReserveStatus(42000000, 18500000).remaining, 23500000, "computeRampReserveStatus: this program's real default (reserve 42M, incurred 18.5M) leaves 23.5M remaining");
assertStrEqual(state.computeRampReserveStatus(42000000, 18500000).exhausted, false, "this program's default reserve state is correctly NOT exhausted");
const exhaustedFixture = state.computeRampReserveStatus(10000000, 12000000);
assertStrEqual(exhaustedFixture.exhausted, true, "computeRampReserveStatus() correctly flags exhausted when incurred exceeds reserve (never-exercised-by-default branch)");
assertEqual(exhaustedFixture.remaining, -2000000, "computeRampReserveStatus() reports a negative remaining, not a clamped zero, when exhausted");
assertStrEqual(state.rampAlertContent(exhaustedFixture).className, "alert-card warn", "rampAlertContent() fires the warn branch when the reserve is exhausted");
assertStrEqual(state.rampAlertContent(state.computeRampReserveStatus(42000000, 18500000)).className, "alert-card ok", "rampAlertContent() fires the ok branch on this program's real (non-exhausted) default");
// computeRampDelayImpact: zero extra months is a no-op; a real slider drag adds burn correctly.
assertEqual(state.computeRampDelayImpact(42000000, 18500000, 0, 1200000).newRemaining, 23500000, "computeRampDelayImpact() at 0 extra months is a no-op on the remaining reserve");
assertEqual(state.computeRampDelayImpact(42000000, 18500000, 6, 1200000).additionalBurn, 7200000, "computeRampDelayImpact(): 6 extra months x $1.2M/mo burn = $7.2M additional burn");
assertEqual(state.computeRampDelayImpact(42000000, 18500000, 6, 1200000).newRemaining, 23500000 - 7200000, "computeRampDelayImpact(): new remaining correctly nets the additional burn off the original remaining");
assertEqual(state.computeRampDelayImpact(42000000, 18500000, -3, 1200000).additionalBurn, 0, "computeRampDelayImpact() clamps a negative extra-months input to zero burn, not a negative burn");
// computeSLAPenaltyExposure: this program's real default (a genuine breach), then the never-exercised no-breach branch.
const slaDefault = state.computeSLAPenaltyExposure(99.995, 99.97, 180000000);
assertEqual(slaDefault.penaltyExposure, 45000, "computeSLAPenaltyExposure(): this program's real default (99.995% committed vs 99.97% actual, $180M annual revenue) prices out to a $45,000 penalty exposure", 1);
assertStrEqual(slaDefault.breach, true, "this program's real default is correctly flagged as an SLA breach");
const slaNoBreach = state.computeSLAPenaltyExposure(99.9, 99.95, 180000000);
assertStrEqual(slaNoBreach.breach, false, "computeSLAPenaltyExposure() correctly clears when actual uptime exceeds committed (never-exercised-by-default branch)");
assertEqual(slaNoBreach.penaltyExposure, 0, "computeSLAPenaltyExposure() reports zero exposure when there's no breach, not a negative credit");
assertStrEqual(state.slaAlertContent(slaDefault).className, "alert-card warn", "slaAlertContent() fires the warn branch on this program's real (breaching) default");
assertStrEqual(state.slaAlertContent(slaNoBreach).className, "alert-card ok", "slaAlertContent() fires the ok branch when there's no breach");
// computeRevenuePerMW / computeAdjEbitdaMarginPct: this program's real default, landing inside the real cited 50-57% range.
// Independent-reviewer finding, 2026-08-26: the function was renamed from computeGrossMarginPct to
// computeAdjEbitdaMarginPct in production, but this suite only ever called it by the OLD name
// (which still worked via a backward-compat export alias) -- meaning the rename itself was never
// actually exercised under its real, current name. Test both directly, and assert they're the SAME
// function (not two independently-drifting implementations).
assertEqual(state.computeRevenuePerMW(180000000, 50), 3600000, "computeRevenuePerMW(): this program's real default ($180M revenue / 50 contracted MW) is $3.6M/MW/yr");
assertEqual(state.computeRevenuePerMW(180000000, 0), 0, "computeRevenuePerMW() guards divide-by-zero on zero contracted MW, not NaN/Infinity");
assertStrEqual(state.computeGrossMarginPct === state.computeAdjEbitdaMarginPct, true, "the computeGrossMarginPct export is a genuine alias for computeAdjEbitdaMarginPct (the same function reference), not a stale second copy");
const marginPct = state.computeAdjEbitdaMarginPct(180000000, 85000000);
assertStrEqual(marginPct >= 50 && marginPct <= 57, true, "computeAdjEbitdaMarginPct(): this program's real default margin genuinely lands inside Equinix's real cited 50-57% adjusted-EBITDA-margin range (corrected 2026-08-26 from a mislabeled '50-55% gross margin' claim), not just claimed to");
assertEqual(state.computeAdjEbitdaMarginPct(180000000, 0), 100, "computeAdjEbitdaMarginPct() at zero direct cost is a 100% margin, not a divide error");
assertEqual(state.computeAdjEbitdaMarginPct(0, 0), 0, "computeAdjEbitdaMarginPct() guards divide-by-zero on zero revenue, not NaN");

console.log("--- Multi-Region Rollup ---");
assertEqual(state.regions.length, 4, "region count");
const regionCodes = state.regions.map((r) => r.code).sort().join(",");
assertStrEqual(regionCodes, "APAC,EMEA,LATAM,NA", "region codes match the declared 4-region rollup");

console.log("--- Currency Toggle (testing the real production formatInCurrency function) ---");
// Regression test for the exact bug a stress test found live: negative amounts must show the
// sign BEFORE the currency symbol ("-$140,000"), never between symbol and digits ("$-140,000").
assertStrEqual(state.formatInCurrency(-140000, "USD"), "-$140,000", "negative USD sign placement");
assertStrEqual(state.formatInCurrency(140000, "USD"), "$140,000", "positive USD formatting unaffected by the sign fix");
// Independent re-derivation of the GBP conversion using the same declared rate, not a copy of
// the production code's internal math.
const gbpRate = state.CURRENCIES.GBP.rate;
const expectedGbp = "£" + Math.round(2450000 * gbpRate).toLocaleString("en-GB");
assertStrEqual(state.formatInCurrency(2450000, "GBP"), expectedGbp, "GBP conversion matches independent re-derivation");
// All 4 declared currencies must actually format without throwing and must contain their symbol.
["USD", "GBP", "JPY", "BRL"].forEach((code) => {
  const out = state.formatInCurrency(1000000, code);
  const sym = state.CURRENCIES[code].symbol;
  if (out.indexOf(sym) !== 0) {
    failures++;
    console.error("FAIL: " + code + " output does not start with its own symbol:", out);
  } else {
    console.log("pass: " + code + " formats with its own symbol =", out);
  }
});

console.log("--- Alert Cards (both branches, via the real pure functions) ---");
// A prior stress-test round could only verify these by reading the code -- these now actually
// call the page's real drawdownAlertContent/dqAlertContent functions with both a triggering and
// a non-triggering input, and check the returned className/html, not a re-implementation.
const warnDrawdown = state.drawdownAlertContent(18, 35); // the page's own default slider values
assertStrEqual(warnDrawdown.level, "warn", "drawdown alert: default sliders produce the WARN branch");
if (warnDrawdown.html.indexOf("Detected:") === -1 || warnDrawdown.html.indexOf("Probable cause:") === -1 || warnDrawdown.html.indexOf("Suggested action:") === -1) {
  failures++; console.error("FAIL: drawdown WARN alert is missing one of the 3 required prescriptive sections");
} else { console.log("pass: drawdown WARN alert carries all 3 prescriptive sections"); }
const okDrawdown = state.drawdownAlertContent(90, 20); // physical progress far ahead of drawdown
assertStrEqual(okDrawdown.level, "ok", "drawdown alert: a non-triggering input produces the OK branch (never exercised by the default demo state)");

const warnDQ = state.dqAlertContent(4, 20, 14); // 20-day lag > 14-day threshold
assertStrEqual(warnDQ.level, "warn", "data-quality alert: a lag over threshold produces the WARN branch (never exercised by the hardcoded demo values)");
if (warnDQ.html.indexOf("Detected:") === -1 || warnDQ.html.indexOf("Probable cause:") === -1 || warnDQ.html.indexOf("Suggested action:") === -1) {
  failures++; console.error("FAIL: data-quality WARN alert is missing one of the 3 required prescriptive sections");
} else { console.log("pass: data-quality WARN alert carries all 3 prescriptive sections"); }
const okDQ = state.dqAlertContent(4, 9, 14); // the page's own actual demo values
assertStrEqual(okDQ.level, "ok", "data-quality alert: the page's real demo values (9-day lag) produce the OK branch");

console.log("--- Explainer Toggle (actually firing the real click-delegation handler) ---");
if (documentClickHandlers.length === 0) {
  failures++;
  console.error("FAIL: no click handler was registered on document -- the explainer-toggle delegation never ran");
} else {
  const explainerEl = elementsById["aace5709exp"];
  const clickHandler = documentClickHandlers[0];
  const fakeEvent = { target: infoToggleBtnStub };

  const beforeOpen = explainerEl.classList.contains("open");
  const beforeAria = infoToggleBtnStub.getAttribute("aria-expanded");
  clickHandler(fakeEvent); // simulate the first real click
  const afterFirstClick = explainerEl.classList.contains("open");
  const ariaAfterFirstClick = infoToggleBtnStub.getAttribute("aria-expanded");

  if (beforeOpen === true) {
    failures++; console.error("FAIL: explainer started open before any click -- test setup invalid");
  }
  assertStrEqual(String(afterFirstClick), "true", "first click opens the explainer panel");
  assertStrEqual(ariaAfterFirstClick, "true", "first click sets aria-expanded=true");

  clickHandler(fakeEvent); // simulate a second click -- should close it again
  const afterSecondClick = explainerEl.classList.contains("open");
  const ariaAfterSecondClick = infoToggleBtnStub.getAttribute("aria-expanded");
  assertStrEqual(String(afterSecondClick), "false", "second click closes the explainer panel again");
  assertStrEqual(ariaAfterSecondClick, "false", "second click sets aria-expanded=false");

  // Fire the SAME click handler against a DIFFERENT explainer button (one of the 17 new
  // formula/methodology toggles from the 20-KPI catalog build) -- proves the delegation is
  // genuinely generic, not something that happens to work only for the one original button.
  const explainerEl2 = elementsById["exp20"];
  const fakeEvent2 = { target: infoToggleBtnStub2 };
  clickHandler(fakeEvent2);
  assertStrEqual(String(explainerEl2.classList.contains("open")), "true", "the SAME click delegation correctly opens a different (Gate 4 / exp20) explainer, not just the original one");
  assertStrEqual(explainerEl2.textContent.length > 0, true, "exp20's explainer div actually has real filled-in content, not an empty placeholder");

  // A click that doesn't land on (or inside) an .info-toggle must be a no-op, not a crash.
  const unrelatedEvent = { target: withProperties(makeElementStub()) };
  let threw = false;
  try { clickHandler(unrelatedEvent); } catch (e) { threw = true; }
  if (threw) { failures++; console.error("FAIL: clicking an unrelated element threw instead of being ignored"); }
  else { console.log("pass: clicking an unrelated element is a safe no-op"); }

  // The top disclaimer was collapsed into the same toggle mechanism this round (it used to be an
  // always-visible block repeating on every tab -- TJ's own report). Same generic delegation, a
  // third distinct button this time (aace5709exp, exp20, and now this) -- proves it's genuinely
  // reusable, not coincidentally working for two cases.
  const disclaimerToggleBtnStub = withProperties(makeElementStub());
  disclaimerToggleBtnStub.classList.add("info-toggle");
  disclaimerToggleBtnStub.dataset = { explainer: "fullDisclaimer" };
  const fullDisclaimerEl = documentStub.getElementById("fullDisclaimer"); // force-create if the click delegation hasn't touched it yet
  const disclaimerFakeEvent = { target: disclaimerToggleBtnStub };
  assertStrEqual(fullDisclaimerEl.classList.contains("open"), false, "the full disclaimer starts collapsed, matching its real HTML default (no 'open' class)");
  clickHandler(disclaimerFakeEvent);
  assertStrEqual(fullDisclaimerEl.classList.contains("open"), true, "clicking the disclaimer toggle expands the full disclaimer");
  clickHandler(disclaimerFakeEvent);
  assertStrEqual(fullDisclaimerEl.classList.contains("open"), false, "clicking it again collapses it");
}

console.log("--- Content Consistency (every disclaimer 'real' claim must resolve elsewhere in the page) ---");
// Regression test for the exact bug a research pass found live: the disclaimer named Turner &
// Townsend's cost index as a real fact, but nothing else in the page actually cited it -- an
// untraceable "real" claim. Every RP code and every named source the disclaimer claims as real
// must appear again outside the disclaimer itself (in the Cost tab card or the Reference glossary),
// not just floating in the intro paragraph.
// Matches by id, not an exact class-string (the disclaimer became a collapsible toggle+explainer
// -- id="fullDisclaimer" -- so its class attribute is now "explainer disclaimer", not just
// "disclaimer"; matching by id is also just more robust regardless of future class reordering).
const disclaimerMatch = html.match(/<div class="explainer disclaimer" id="fullDisclaimer">([\s\S]*?)<\/div>/);
if (!disclaimerMatch) {
  failures++; console.error("FAIL: could not find the top disclaimer block");
} else {
  const disclaimerText = disclaimerMatch[1];
  const restOfPage = html.slice(disclaimerMatch.index + disclaimerMatch[0].length);
  const claimedRPs = disclaimerText.match(/\d\dR-\d\d/g) || [];
  if (claimedRPs.length === 0) {
    failures++; console.error("FAIL: disclaimer claims no RP codes -- regex broke or content changed unexpectedly");
  } else {
    claimedRPs.forEach((rp) => {
      if (restOfPage.indexOf(rp) === -1) {
        failures++; console.error("FAIL: disclaimer claims " + rp + " as real, but it never appears again in the page (untraceable claim)");
      } else {
        console.log("pass: disclaimer's claimed " + rp + " resolves elsewhere in the page");
      }
    });
  }
  if (disclaimerText.indexOf("Turner") !== -1 && restOfPage.indexOf("Turner") === -1) {
    failures++; console.error("FAIL: disclaimer claims Turner & Townsend as a real source but it's never cited again in the page");
  } else if (disclaimerText.indexOf("Turner") !== -1) {
    console.log("pass: Turner & Townsend citation in the disclaimer resolves elsewhere in the page");
  }
}

console.log("--- New real market benchmarks actually present in the page ---");
["15.2", "14.5", "14.2", "13.3", "12.9"].forEach((v) => {
  if (html.indexOf(v) === -1) { failures++; console.error("FAIL: expected market benchmark $" + v + "/W not found in page"); }
  else { console.log("pass: market benchmark $" + v + "/W present"); }
});
if (html.indexOf("60%") === -1 || html.indexOf("21%") === -1) {
  failures++; console.error("FAIL: expected 2026 escalation outlook survey figures (60%/21%) not found");
} else {
  console.log("pass: 2026 escalation outlook survey figures (60%/21%) present");
}

console.log("--- New standards citations don't overclaim (no fabricated data, no oversight overclaim) ---");
if (html.indexOf("does not publish official per-tier cost figures") === -1) {
  failures++; console.error("FAIL: Uptime Institute glossary entry is missing its explicit no-official-cost-figures caveat");
} else {
  console.log("pass: Uptime Institute citation explicitly states no official per-tier cost data exists");
}
if (html.indexOf("not as evidence of having overseen one directly") === -1) {
  failures++; console.error("FAIL: RICS/ICMS glossary entry is missing its explicit not-oversight-experience caveat");
} else {
  console.log("pass: RICS/ICMS citation explicitly disclaims oversight-experience overclaim");
}

console.log("--- Phase 1: Control Account Ledger (drills down from WBS) ---");
// Independent re-derivation: BAC per account = baseline * (WBS % / 100); since WBS % sums to 100,
// the accounts' BAC must sum back to the exact same baseline.
const bacSum = state.controlAccounts.reduce((s, a) => s + a.bac, 0);
assertEqual(bacSum, state.bridge.baseline, "control-account BAC sum reconciles to bridge baseline");
// Independent re-derivation of CPI/CV for one account, from the same inputs the page itself used.
const acct0 = state.computeControlAccounts(state.bridge.baseline, [{ name: "x", pct: 52 }], [0.72], [1.04])[0];
assertEqual(acct0.bac, Math.round(state.bridge.baseline * 0.52), "control-account BAC re-derivation (52% WBS row)");
assertEqual(acct0.cv, acct0.ev - acct0.ac, "control-account CV = EV - AC");
assertEqual(acct0.cpi, acct0.ev / acct0.ac, "control-account CPI = EV / AC", 0.0001);

console.log("--- Phase 1: What-If Forecast Sandbox (independent re-derivation) ---");
const expectedWhatIf = state.bridge.baseline + state.bridge.baseline * 0.04 + state.bridge.baseline * 0.02 + 208000 - 125000000;
assertEqual(state.lastWhatIf, expectedWhatIf, "what-if forecast (default 4% scope / 2% escalation) matches independent re-derivation");
// The real $208K driver and real contingency drawdown must never move with the sandbox sliders --
// re-derive at a different scope/escalation pair and confirm those two terms are still present unchanged.
const whatIfAtZero = state.computeWhatIf(state.bridge.baseline, 0, 0, 208000, -125000000);
assertEqual(whatIfAtZero, state.bridge.baseline + 208000 - 125000000, "what-if at 0%/0% still carries the real $208K driver and real drawdown unchanged");

console.log("--- Phase 1: Monte Carlo tri-point slider bounds + clamp function ---");
assertEqual(state.mcBounds.min, 1750000000, "Monte Carlo tri-point default optimistic bound");
assertEqual(state.mcBounds.max, 2170000000, "Monte Carlo tri-point default pessimistic bound");
assertEqual(state.clampMode(1750000000, 1870000000, 2170000000), 1870000000, "clampMode: a mode already inside [min,max] passes through unchanged");
assertEqual(state.clampMode(1750000000, 1600000000, 2170000000), 1750000000, "clampMode: a mode below min clamps up to min (never naturally triggered by a well-behaved drag)");
assertEqual(state.clampMode(1750000000, 2300000000, 2170000000), 2170000000, "clampMode: a mode above max clamps down to max (never naturally triggered by a well-behaved drag)");

console.log("--- Live tab-rail status pill (Gate 4) reflects the real computed gate state ---");
const gate4Pill = elementsById["cntGate4"];
if (!gate4Pill) {
  failures++; console.error("FAIL: #cntGate4 was never registered by the page script");
} else {
  // Pre-registered expectation: this build's real default numbers already put Gate 4 BLOCKED
  // (~0.81x coverage post-rescale, still <1.0) -- so the pill should be visible now.
  assertStrEqual(gate4Pill.hidden, false, "Gate 4 is blocked on this build's real default state, so the tab-rail pill is visible");
  assertStrEqual(gate4Pill.textContent, "Gate 4 blocked", "the pill's real text says 'Gate 4 blocked', not a placeholder");
  assertStrEqual(gate4Pill.classList.contains("warn"), true, "the pill carries the warn styling class while blocked");
}

console.log("--- Phase 2: Operating Framework Gate 4 (independent re-derivation) ---");
// Independent re-derivation of the exact gate math: reserve 175,000,000 - drawn 125,000,000 =
// 50,000,000 remaining; 50,000,000 / totalRiskEV must be < 1.00, i.e. genuinely BLOCKED, not a
// static "pending" bar.
const expectedRemaining = 175000000 - 125000000;
assertEqual(state.gateStatus.remaining, expectedRemaining, "Gate 4 remaining contingency = reserve - drawn");
assertEqual(state.gateStatus.ratio, expectedRemaining / state.totalRiskEV, "Gate 4 coverage ratio matches independent re-derivation", 0.0001);
assertStrEqual(state.gateStatus.blocked, true, "Gate 4 is genuinely computed BLOCKED with this build's real numbers, not just styled that way");
// Direct test of the pure function across both branches, not just the one the demo data produces.
const clearedGate = state.computeGateStatus(500000, 50000, 100000); // remaining 450k >> 100k EV
assertStrEqual(clearedGate.blocked, false, "computeGateStatus: a healthy reserve/risk ratio produces the CLEARED branch (never exercised by the hardcoded demo state)");
const zeroRiskGate = state.computeGateStatus(200000, 140000, 0); // no priced risk at all
// assertEqual's Math.abs(actual-expected) breaks on Infinity (Infinity-Infinity = NaN) -- check directly.
if (zeroRiskGate.ratio === Infinity) { console.log("pass: computeGateStatus: zero risk exposure divides to Infinity coverage, not a crash =", zeroRiskGate.ratio); }
else { failures++; console.error("FAIL: computeGateStatus with zero risk exposure expected Infinity, got", zeroRiskGate.ratio); }

console.log("--- Phase 3: Actions register (aging summary, independent re-derivation) ---");
// Independent re-derivation: 3 open rows (A-01/A-02/A-03), 1 closed (A-04); only A-02 (21d) exceeds
// the 14-day threshold among the open ones.
assertEqual(state.actionsSummary.openCount, 3, "3 open action items");
assertEqual(state.actionsSummary.staleCount, 1, "exactly 1 open action item exceeds the 14-day threshold");
assertStrEqual(state.actionsSummary.staleItems[0].id, "A-02", "the stale item is the real 21-day-old one, not a different row");
// Direct test of the pure function with arbitrary inputs, not just the page's own hardcoded rows.
const noStale = state.actionAgingSummary([{ status:"open", ageDays:2 }, { status:"closed", ageDays:99 }], 14);
assertEqual(noStale.staleCount, 0, "actionAgingSummary: a closed item's age never counts toward staleness regardless of how old it is");

console.log("--- Phase 3: Attention & Triage (cross-tab digest, independent re-derivation) ---");
// With this build's real default state -- drawdown WARN (1.94x), Gate 4 BLOCKED (0.47x coverage),
// 1 stale action, an SLA breach (99.97% actual < 99.995% committed Tier IV) -- and DQ health OK
// (9-day lag < 14-day threshold) + the ramp reserve NOT exhausted -- triage must surface exactly
// 4 items, not 3 or 5, and DQ must NOT be one of them. (Commercial Ramp's 2 alert states were
// rolled into this digest in the brainstorm UX pass, 2026-08-26 -- SLA breach is real-default-on,
// ramp-reserve-exhausted is not.)
assertEqual(state.triageItems.length, 4, "triage surfaces exactly 4 items with this build's real default state");
const triageTabs = state.triageItems.map((t) => t.tab).sort().join(",");
assertStrEqual(triageTabs, "actions,contingency,framework,ramp", "triage items are exactly contingency+framework+actions+ramp(SLA breach) -- governance (DQ) correctly absent since DQ is OK by default");
// computeTriageItems reads live DOM/module state rather than taking parameters (it deliberately
// re-checks the same alert functions already tested above, not a second implementation) -- confirm
// it's genuinely exposed for direct inspection rather than only reachable through renderTriage().
if (typeof state.computeTriageItems === "function") {
  console.log("pass: computeTriageItems is exposed as a callable function for direct inspection");
} else {
  failures++; console.error("FAIL: computeTriageItems was not exposed on window.__CMCC_STATE__");
}

console.log("--- Phase 4: Schedule float as a cost-risk input signal (independent re-derivation) ---");
// Independent re-derivation: history [22,19,14,13] over 4 weeks -> (22-13)/3 = 3.0 days/week.
assertEqual(state.computeFloatErosionRate([{floatDays:22},{floatDays:19},{floatDays:14},{floatDays:13}]), 3.0, "float erosion rate re-derivation");
assertEqual(state.floatSignal.remaining, 13, "float remaining matches the last real history entry");
assertEqual(state.floatSignal.weeksToZero, 13 / 3.0, "weeks-to-zero re-derivation", 0.0001);
assertStrEqual(state.floatSignal.elevated, true, "this build's real float history correctly trips ELEVATED (weeksToZero 4.3 < 8)");
// Direct test of the OK branch, which the hardcoded demo history never naturally triggers.
const healthyFloat = state.floatRiskSignal([{floatDays:40},{floatDays:38},{floatDays:37}]); // slow erosion
assertStrEqual(healthyFloat.elevated, false, "floatRiskSignal: slow erosion produces the non-elevated branch (never exercised by the hardcoded demo history)");
// A single-reading history (no erosion computable) must not crash on divide-by-zero-length.
const singleReading = state.computeFloatErosionRate([{floatDays:20}]);
assertEqual(singleReading, 0, "computeFloatErosionRate: a single reading returns 0, not NaN or a crash");

console.log("--- Phase 4: Change-order settlement EMV decision (independent re-derivation) ---");
// Independent re-derivation: 0.45*40000 + 0.35*85000 + 0.20*150000 + 18000 = 95750; settle-now is
// 92000, which is lower, so the real recommendation must be "settle" (a close, realistic call).
const expectedDisputeEV = 0.45 * 40000 + 0.35 * 85000 + 0.20 * 150000 + 18000;
assertEqual(state.emvDecision.disputeEV, expectedDisputeEV, "dispute EV re-derivation");
assertStrEqual(state.emvDecision.recommend, "settle", "this build's real numbers correctly recommend SETTLE (92,000 < 95,750 dispute EV)");
// Direct test of the DISPUTE branch, which the hardcoded demo numbers don't naturally produce.
const disputeWins = state.computeEMVDecision(200000, [{prob:1, cost:50000}], 0);
assertStrEqual(disputeWins.recommend, "dispute", "computeEMVDecision: a clearly cheaper dispute path produces the DISPUTE branch (never exercised by the hardcoded demo numbers)");

console.log("--- Phase 4: Crew Labor Productivity Factor (independent re-derivation) ---");
assertEqual(state.computeLPF(1240, 1180), 1240 / 1180, "LPF re-derivation (Electrical row)");
const lpfByTrade = {}; state.productivityResult.forEach((p) => { lpfByTrade[p.trade] = p.lpf; });
if (lpfByTrade["Electrical"] >= 1 && lpfByTrade["Mechanical / Piping"] < 1 && lpfByTrade["Civil / Structural"] >= 1) {
  console.log("pass: LPF correctly flags Mechanical/Piping as the one productivity-loss trade (>=1 good, <1 loss), matching this build's real demo rows");
} else {
  failures++; console.error("FAIL: expected exactly Mechanical/Piping to be the sub-1.0 LPF row, got", lpfByTrade);
}

console.log("--- Phase 5: Glossary search + category filter (independent re-derivation) ---");
assertEqual(state.visibleGlossaryItems.length, state.allGlossaryItems.length, "with no query and 'all' category, every glossary item is visible by default");
// Independent re-derivation: searching "escalation" must match at least RP 58R-10/68R-11's real
// definitions (which literally contain the word) -- and must NOT match every single term.
const escResults = state.filterGlossaryItems(state.allGlossaryItems, "escalation", "all");
if (escResults.length > 0 && escResults.length < state.allGlossaryItems.length) {
  console.log("pass: searching 'escalation' narrows to a real subset (" + escResults.length + " of " + state.allGlossaryItems.length + "), not everything or nothing");
} else {
  failures++; console.error("FAIL: expected 'escalation' search to narrow to a partial subset, got", escResults.length, "of", state.allGlossaryItems.length);
}
// Category filter alone (no search text) must return only that category's rows.
const aaceOnly = state.filterGlossaryItems(state.allGlossaryItems, "", "aace");
const allAace = aaceOnly.every((r) => r.category === "aace");
assertStrEqual(allAace, true, "category filter 'aace' returns only aace-category rows");
assertEqual(aaceOnly.length, state.allGlossaryItems.filter((r) => r.category === "aace").length, "category filter count matches an independent count of aace-category rows");
// New "Industry Vocabulary" category (AOR/EOR, LLE, QS) added per a JD-gap analysis -- confirm it's
// real, filterable content, not just an unused category label with zero rows.
const vocabOnly = state.filterGlossaryItems(state.allGlossaryItems, "", "vocab");
assertEqual(vocabOnly.length, 3, "the new 'vocab' category has exactly 3 rows (AOR/EOR, LLE, Quantity Surveying)");
const aorSearch = state.filterGlossaryItems(state.allGlossaryItems, "AOR", "all");
assertStrEqual(aorSearch.some((r) => r.term.indexOf("AOR") !== -1), true, "searching 'AOR' actually finds the AOR/EOR glossary term");
// A query that matches nothing must return an empty array, not throw or return everything.
const noMatch = state.filterGlossaryItems(state.allGlossaryItems, "zzz-no-such-term-zzz", "all");
assertEqual(noMatch.length, 0, "a nonsense query correctly returns zero results, not a fallback to everything");

console.log("--- Stress-test fix: actually FIRE the currency-toggle change event (not just unit-test formatInCurrency) ---");
// Pre-registered expectation (B35): switching to GBP must convert EVERY dollar figure the page
// displays, including the Contingency tab's reliability note -- the same $208K figure that's
// already proven (Phase 1 test above) to convert correctly in the Cost tab's budget bridge.
// A prior version of this suite never fired this handler at all (addEventListener was a no-op
// for every element except document), so this exact currency-inconsistency bug shipped
// undetected. Firing it for real is the fix to the test suite, not just to the page.
const currencySelectEl = elementsById["currencySelect"];
if (!currencySelectEl) {
  failures++; console.error("FAIL: no #currencySelect element was ever registered -- the page never called getElementById('currencySelect')?");
} else {
  currencySelectEl.value = "GBP";
  currencySelectEl.fire("change");
  const reliabilityHtml = elementsById["reliabilityNote"].innerHTML;
  if (reliabilityHtml.indexOf("£") !== -1 && reliabilityHtml.indexOf("$208K") === -1) {
    console.log("pass: switching to GBP converts the reliability note's $208K figure too, not just the Cost tab's copy of it");
  } else {
    failures++; console.error("FAIL: reliability note did not convert to GBP after firing the currency change event:", reliabilityHtml);
  }
  // Reset back to USD so every assertion below this point still sees the page's default currency.
  currencySelectEl.value = "USD";
  currencySelectEl.fire("change");
}

console.log("--- Stress-test fix: actually FIRE a click on one of the 4 tabs added in Phases 2-3 ---");
// A prior version of this suite's own .tabbtn stub list was stale at 7 tabs (missing exec,
// framework, actions, triage), and per-element addEventListener was a no-op -- so activateTab()
// was never actually exercised for any tab, let alone the newer ones. Both fixed above; prove it.
const execBtn = lastTabButtonStubs.find((b) => b.dataset.tab === "exec");
const overviewBtn = lastTabButtonStubs.find((b) => b.dataset.tab === "overview");
if (!execBtn || !overviewBtn) {
  failures++; console.error("FAIL: could not find the exec/overview tab button stubs to click-test");
} else {
  execBtn.fire("click");
  assertStrEqual(execBtn.getAttribute("aria-selected"), "true", "clicking the Executive Command tab sets its own aria-selected=true");
  assertStrEqual(overviewBtn.getAttribute("aria-selected"), "false", "...and correctly clears aria-selected on the previously-active Overview tab");
  assertStrEqual(elementsById["panel-exec"].classList.contains("active"), true, "clicking the tab activates the real panel-exec element");
  assertStrEqual(elementsById["panel-overview"].classList.contains("active"), false, "...and deactivates the previously-active panel-overview");
  // Return focus to Overview so this test doesn't change which tab later assertions implicitly assume is active.
  overviewBtn.fire("click");
}

console.log("--- Global 1-9 tab-jump + \"?\" shortcuts overlay (actually firing document keydown) ---");
assertStrEqual(elementsById["shortcutsOverlay"].hidden, true, "shortcuts overlay starts hidden, matching its real HTML default");
documentStub.fire("keydown", { key: "?", target: {} });
assertStrEqual(elementsById["shortcutsOverlay"].hidden, false, "pressing ? opens the shortcuts overlay");
documentStub.fire("keydown", { key: "Escape", target: {} });
assertStrEqual(elementsById["shortcutsOverlay"].hidden, true, "pressing Escape closes it again");
// Typing "3" into a real form field must NOT jump tabs -- only a bare keypress should.
overviewBtn.setAttribute("aria-selected", "true"); // reset known state before this check
documentStub.fire("keydown", { key: "3", target: { tagName: "INPUT" } });
assertStrEqual(overviewBtn.getAttribute("aria-selected"), "true", "pressing '3' while typing in an input does NOT trigger the tab-jump shortcut");
// A bare "3" keypress (not typing) must jump to the 3rd real tab -- cost, per the real tab order.
documentStub.fire("keydown", { key: "3", target: {} });
assertStrEqual(lastTabButtonStubs[2].dataset.tab, "cost", "the 3rd tab in real DOM order is 'cost' (sanity-check the index math against)");
assertStrEqual(lastTabButtonStubs[2].getAttribute("aria-selected"), "true", "pressing '3' (not typing) jumps straight to the 3rd tab (Cost)");
overviewBtn.fire("click"); // reset back to Overview for later assertions

console.log("--- Sidebar arrow-key navigation (Down/Up, relocated from a horizontal rail's Left/Right -- previously untested at all, in either direction) ---");
// The tabbtn keydown handler calls e.preventDefault() unconditionally (unlike the palette's own
// guarded `if (e.preventDefault)` version), so these fixtures need a real (stub) preventDefault.
const noop = () => {};
overviewBtn.fire("keydown", { key: "ArrowDown", preventDefault: noop });
assertStrEqual(lastTabButtonStubs[1].getAttribute("aria-selected"), "true", "ArrowDown on the 1st tab (Overview) moves selection to the 2nd (Executive Command)");
lastTabButtonStubs[1].fire("keydown", { key: "ArrowUp", preventDefault: noop });
assertStrEqual(overviewBtn.getAttribute("aria-selected"), "true", "ArrowUp from the 2nd tab returns selection to the 1st (Overview)");
// Wrap-around at both ends -- the modulo arithmetic behind this was also never exercised.
overviewBtn.fire("keydown", { key: "ArrowUp", preventDefault: noop });
assertStrEqual(lastTabButtonStubs[lastTabButtonStubs.length - 1].getAttribute("aria-selected"), "true", "ArrowUp from the 1st tab wraps around to the LAST tab (Reference), not a dead stop");
lastTabButtonStubs[lastTabButtonStubs.length - 1].fire("keydown", { key: "ArrowDown", preventDefault: noop });
assertStrEqual(overviewBtn.getAttribute("aria-selected"), "true", "ArrowDown from the last tab wraps back around to the 1st (Overview)");

console.log("--- Mobile sidebar overlay (hamburger toggle): open/close via button, backdrop click, Escape, and auto-close after selecting a tab ---");
{
  const sidebarToggleBtnEl = elementsById["sidebarToggle"];
  const sidebarBackdropElTest = elementsById["sidebarBackdrop"];
  const sidebarElTest = elementsById["sidebar"];
  if (!sidebarToggleBtnEl || !sidebarBackdropElTest || !sidebarElTest) {
    failures++; console.error("FAIL: one or more sidebar-overlay elements were never registered");
  } else {
    assertStrEqual(sidebarElTest.classList.contains("open"), false, "the sidebar overlay starts closed, matching its real default (no .open class in the HTML)");
    sidebarToggleBtnEl.fire("click");
    assertStrEqual(sidebarElTest.classList.contains("open"), true, "clicking the hamburger opens the sidebar overlay");
    assertStrEqual(sidebarBackdropElTest.classList.contains("open"), true, "...and shows its backdrop");
    assertStrEqual(sidebarToggleBtnEl.getAttribute("aria-expanded"), "true", "...and the toggle button's own aria-expanded reflects the open state");
    sidebarToggleBtnEl.fire("click");
    assertStrEqual(sidebarElTest.classList.contains("open"), false, "clicking the hamburger again closes it");
    assertStrEqual(sidebarToggleBtnEl.getAttribute("aria-expanded"), "false", "...and aria-expanded flips back too");

    sidebarToggleBtnEl.fire("click");
    sidebarBackdropElTest.fire("click");
    assertStrEqual(sidebarElTest.classList.contains("open"), false, "clicking the backdrop closes the sidebar overlay");

    sidebarToggleBtnEl.fire("click");
    documentStub.fire("keydown", { key: "Escape", target: {} });
    assertStrEqual(sidebarElTest.classList.contains("open"), false, "pressing Escape closes the sidebar overlay too (same priority chain as the palette/shortcuts overlays)");

    sidebarToggleBtnEl.fire("click");
    assertStrEqual(sidebarElTest.classList.contains("open"), true, "sanity check: the overlay is genuinely open before the next assertion");
    overviewBtn.fire("click");
    assertStrEqual(sidebarElTest.classList.contains("open"), false, "selecting a tab while the mobile overlay is open automatically closes it (harmless no-op on desktop, since .open has no CSS effect there)");

    // Label + focus management (self-review finding): the button's own accessible name must flip
    // with its state (not stay permanently "Open navigation"), and focus should move into the
    // drawer on open, then back to the toggle on close -- only when the drawer was genuinely open
    // (an ordinary desktop tab click, which also calls closeSidebarOverlay(), must NOT steal focus
    // back to the toggle button every time).
    let overviewFocusCalls = 0;
    const realOverviewFocus = overviewBtn.focus.bind(overviewBtn);
    overviewBtn.focus = () => { overviewFocusCalls++; realOverviewFocus(); };
    let toggleFocusCalls = 0;
    const realToggleFocus = sidebarToggleBtnEl.focus.bind(sidebarToggleBtnEl);
    sidebarToggleBtnEl.focus = () => { toggleFocusCalls++; realToggleFocus(); };

    assertStrEqual(sidebarToggleBtnEl.getAttribute("aria-label"), "Open navigation", "the toggle button's label starts as 'Open navigation', matching its real closed default");
    sidebarToggleBtnEl.fire("click");
    assertStrEqual(sidebarToggleBtnEl.getAttribute("aria-label"), "Close navigation", "opening the drawer flips the label to 'Close navigation', not a permanently-stale 'Open'");
    // Overview happens to be the active tab at this point in the suite, so this only proves focus
    // lands SOMEWHERE real -- the dedicated "focuses whichever tab is actually active" test below
    // (with a DIFFERENT tab made active first) is what actually proves the real fix.
    assertEqual(overviewFocusCalls, 1, "opening the drawer moves focus to a real tab button, not leaving it stranded on the toggle");
    overviewBtn.fire("click"); // select a tab from the open drawer
    assertStrEqual(sidebarToggleBtnEl.getAttribute("aria-label"), "Open navigation", "closing the drawer (via tab selection) flips the label back");
    assertEqual(toggleFocusCalls, 1, "closing a GENUINELY-open drawer returns focus to the toggle button");

    toggleFocusCalls = 0;
    overviewBtn.fire("click"); // an ORDINARY desktop tab click -- closeSidebarOverlay() still fires, but the drawer was never open
    assertEqual(toggleFocusCalls, 0, "an ordinary tab click (drawer never open) does NOT steal focus back to the toggle button -- ordinary desktop navigation is unaffected by mobile-only focus management");

    // 3-way mutual exclusion (palette / shortcuts / mobile nav drawer) -- completes the pairwise
    // palette<->shortcuts exclusion an earlier stress-test round already fixed.
    sidebarToggleBtnEl.fire("click");
    assertStrEqual(sidebarElTest.classList.contains("open"), true, "sanity check: the drawer is open before testing cross-overlay exclusion");
    const paletteBtnElForSidebarTest = elementsById["paletteBtn"];
    if (paletteBtnElForSidebarTest) {
      paletteBtnElForSidebarTest.fire("click");
      assertStrEqual(elementsById["paletteOverlay"].hidden, false, "opening the palette while the drawer is open still opens the palette");
      assertStrEqual(sidebarElTest.classList.contains("open"), false, "...and closes the mobile nav drawer (3rd overlay added to the existing pairwise exclusion)");
      documentStub.fire("keydown", { key: "Escape", target: {} }); // close the palette again
    }
    sidebarToggleBtnEl.fire("click");
    assertStrEqual(sidebarElTest.classList.contains("open"), true, "sanity check: the drawer is open again before testing the other direction");
    const shortcutsBtnElForSidebarTest = elementsById["shortcutsBtn"];
    if (shortcutsBtnElForSidebarTest) {
      shortcutsBtnElForSidebarTest.fire("click");
      assertStrEqual(elementsById["shortcutsOverlay"].hidden, false, "opening shortcuts while the drawer is open still opens shortcuts");
      assertStrEqual(sidebarElTest.classList.contains("open"), false, "...and closes the mobile nav drawer too");
      documentStub.fire("keydown", { key: "Escape", target: {} }); // close shortcuts again
    }

    // Independent-reviewer finding: opening the drawer previously ALWAYS focused tabButtons[0]
    // (Overview), regardless of which tab was actually active -- real WAI-ARIA APG guidance is
    // that a tablist receiving focus should land on its already-selected tab. Prove the real fix
    // by making a DIFFERENT tab active first.
    const costTabBtn = lastTabButtonStubs.find((b) => b.dataset.tab === "cost");
    if (costTabBtn) {
      costTabBtn.fire("click");
      let costFocusCalls = 0;
      const realCostFocus = costTabBtn.focus.bind(costTabBtn);
      costTabBtn.focus = () => { costFocusCalls++; realCostFocus(); };
      const overviewFocusCallsBefore = overviewFocusCalls; // snapshot -- earlier tests in this
      // same block already reopened the drawer with Overview active several times, so an absolute
      // count here would be order-dependent; comparing before/after this ONE action is what
      // actually isolates it.
      sidebarToggleBtnEl.fire("click");
      assertEqual(costFocusCalls, 1, "opening the drawer while Cost is the active tab focuses COST, not always Overview (the exact regression an independent reviewer found)");
      assertEqual(overviewFocusCalls, overviewFocusCallsBefore, "...and does NOT also (re-)focus Overview -- its own focus-call count is unchanged by this action");
      sidebarToggleBtnEl.fire("click"); // close via the toggle -- already proven this path works above
      overviewBtn.fire("click"); // reset to Overview for later assertions
    }

    // The in-drawer close button (also an independent-reviewer finding: the open drawer's own
    // z-index sits above the sticky header, visually covering the hamburger toggle that opened it
    // -- the expected "tap it again to close" gesture was dead via mouse).
    const sidebarCloseBtnEl = elementsById["sidebarClose"];
    if (!sidebarCloseBtnEl) { failures++; console.error("FAIL: #sidebarClose was never registered"); }
    else {
      sidebarToggleBtnEl.fire("click");
      assertStrEqual(sidebarElTest.classList.contains("open"), true, "sanity check: the drawer is open before testing its own close button");
      sidebarCloseBtnEl.fire("click");
      assertStrEqual(sidebarElTest.classList.contains("open"), false, "the in-drawer close button closes the overlay -- a real close affordance that doesn't depend on reaching the (now-covered) hamburger button");
    }
  }
}

console.log("--- Tab hover/focus-preview mini-drawer (actually firing focus/blur) ---");
const costTabBtnForDrawer = lastTabButtonStubs.find((b) => b.dataset.tab === "cost");
if (!costTabBtnForDrawer) {
  failures++; console.error("FAIL: could not find the Cost tab button to test the drawer against");
} else {
  costTabBtnForDrawer.fire("focus");
  const drawerEl = elementsById["tabDrawer"];
  assertStrEqual(drawerEl.classList.contains("open"), true, "focusing a tab button opens its preview drawer");
  if (drawerEl.innerHTML.indexOf("Budget bridge") === -1) {
    failures++; console.error("FAIL: drawer content doesn't mention the Cost tab's real note text -- wrong tab's info shown?");
  } else {
    console.log("pass: drawer shows the focused tab's OWN real note text (Cost), not a different tab's");
  }
  costTabBtnForDrawer.fire("blur");
  assertStrEqual(drawerEl.classList.contains("open"), false, "blurring the tab button closes the preview drawer");
}

console.log("--- Guided Tour (actually firing Start/Next/Prev/Exit, walking the real 20-KPI catalog) ---");
const startTourBtnEl = elementsById["startTourBtn"];
const tourNextBtnEl = elementsById["tourNextBtn"];
const tourPrevBtnEl = elementsById["tourPrevBtn"];
const tourExitBtnEl = elementsById["tourExitBtn"];
if (!startTourBtnEl || !tourNextBtnEl || !tourPrevBtnEl || !tourExitBtnEl) {
  failures++; console.error("FAIL: one or more tour control buttons were never registered by the page script");
} else {
  startTourBtnEl.fire("click");
  assertStrEqual(state.isTourActive(), true, "Start Tour activates the tour");
  assertEqual(state.getTourStep(), 0, "tour starts at step 0");
  assertStrEqual(elementsById["panel-" + state.kpiCatalog[0].tab].classList.contains("active"), true, "step 0 actually activates KPI #1's real tab (" + state.kpiCatalog[0].tab + ")");

  tourNextBtnEl.fire("click");
  assertEqual(state.getTourStep(), 1, "Next advances to step 1");
  assertStrEqual(elementsById["panel-" + state.kpiCatalog[1].tab].classList.contains("active"), true, "step 1 activates KPI #2's real tab (" + state.kpiCatalog[1].tab + ")");

  tourPrevBtnEl.fire("click");
  assertEqual(state.getTourStep(), 0, "Prev returns to step 0");

  // Prev at step 0 must clamp, not go negative -- an off-by-one here would silently wrap or crash.
  tourPrevBtnEl.fire("click");
  assertEqual(state.getTourStep(), 0, "Prev at step 0 clamps at 0 rather than going negative");

  // Next at the last step must clamp at length-1, not run past the real 20-item array.
  for (let i = 0; i < 25; i++) tourNextBtnEl.fire("click");
  assertEqual(state.getTourStep(), state.kpiCatalog.length - 1, "Next clamps at the last real KPI (index " + (state.kpiCatalog.length - 1) + "), never runs past the array");

  tourExitBtnEl.fire("click");
  assertStrEqual(state.isTourActive(), false, "Exit tour deactivates the tour");

  // Reset to Overview so later assertions' implicit "Overview is active" assumption still holds.
  overviewBtn.fire("click");
}

console.log("--- Return-to-origin breadcrumb (actually firing a real cross-tab jump click) ---");
const fakeJumpBtn = withProperties(makeElementStub());
fakeJumpBtn.classList.add("triage-jump");
fakeJumpBtn.dataset = { jump: "cost" };
documentStub.fire("click", { target: fakeJumpBtn }); // currentTab is "overview" here -> jumps to "cost"
assertStrEqual(elementsById["jumpBreadcrumb"].hidden, false, "jumping from Overview to Cost shows the return breadcrumb");
assertStrEqual(elementsById["jumpBreadcrumbLabel"].textContent, "Overview", "breadcrumb label names the real origin tab (Overview), not a placeholder");
elementsById["jumpBreadcrumbReturn"].fire("click");
assertStrEqual(elementsById["panel-overview"].classList.contains("active"), true, "clicking the breadcrumb's Return button actually re-activates the real origin tab");
assertStrEqual(elementsById["jumpBreadcrumb"].hidden, true, "...and hides the breadcrumb again");

overviewBtn.fire("click"); // back to Overview (an ordinary click) before jumping again
documentStub.fire("click", { target: fakeJumpBtn }); // jump overview -> cost again
elementsById["jumpBreadcrumbClose"].fire("click"); // dismiss via the X this time, not Return
assertStrEqual(elementsById["jumpBreadcrumb"].hidden, true, "the dismiss (X) button also hides the breadcrumb");

overviewBtn.fire("click"); // back to Overview again before the third jump
documentStub.fire("click", { target: fakeJumpBtn }); // jump overview -> cost a third time
assertStrEqual(elementsById["jumpBreadcrumb"].hidden, false, "sanity check: breadcrumb is genuinely showing before the next assertion");
overviewBtn.fire("click"); // an ORDINARY tab click (via the real tab button, not a .triage-jump)
assertStrEqual(elementsById["jumpBreadcrumb"].hidden, true, "an ordinary tab click (not a jump) invalidates any pending return breadcrumb");

console.log("--- Live Integrity Gate (GUARDS) -- firing every check directly, not trusting the page's own summary ---");
assertEqual(state.GUARDS.length, 18, "exactly 18 live integrity checks are registered");
assertEqual(state.guardsResult.length, 18, "renderGuards() actually ran all 18 checks at page load, not a subset");
const guardsFailures = state.guardsResult.filter((r) => !r.pass);
if (guardsFailures.length === 0) {
  console.log("pass: all 18 live integrity checks pass on this build's real default state (pre-registered expectation, not assumed)");
} else {
  failures++;
  console.error("FAIL:", guardsFailures.length, "of 18 live integrity checks are failing:", JSON.stringify(guardsFailures));
}
// Independently re-run each check a second time by calling .run() directly (not just trusting
// renderGuards()'s own cached result array) -- proves each check is genuinely self-contained and
// re-derives cleanly, not a fluke of render order.
const rerunResults = state.GUARDS.map((g) => g.run());
assertStrEqual(rerunResults.every((r) => r[0]), true, "every GUARDS check independently re-passes when called a second time, fresh");
const complianceCheck = state.GUARDS.find((g) => g.n.indexOf("Compliance sweep") !== -1);
if (!complianceCheck) {
  failures++; console.error("FAIL: could not find the compliance-sweep check among GUARDS");
} else {
  assertStrEqual(complianceCheck.run()[1], "clean", "the compliance sweep reports 'clean' on this build's real rendered content");
}

console.log("--- KPI Catalog: exactly 24 rows, every 'real' badge carries a real citation, every tab is real ---");
assertEqual(state.kpiCatalog.length, 24, "KPI catalog has exactly 24 rows, not 23 or 25");
const KNOWN_TABS = ["overview","exec","cost","contingency","governance","portfolio","ramp","framework","actions","triage","data","reference"];
let realBadgeNoCitation = 0, unknownTab = 0;
state.kpiCatalog.forEach((k) => {
  if (k.badge === "real" && (!k.cite || k.cite === "—")) realBadgeNoCitation++;
  if (KNOWN_TABS.indexOf(k.tab) === -1) unknownTab++;
});
assertEqual(realBadgeNoCitation, 0, "every 'real'-badged KPI row carries an actual citation, not a bare claim");
assertEqual(unknownTab, 0, "every KPI row's jump target is one of the 11 real tabs, not a typo'd data-tab value");
const kpiNames = state.kpiCatalog.map((k) => k.kpi);
assertEqual(new Set(kpiNames).size, kpiNames.length, "no duplicate KPI names in the catalog");

console.log("--- UX/nav upgrade pass (brainstorm build, 2026-08-26): theme toggle (pre-existing, previously untested) ---");
{
  const themeBtnEl = elementsById["themeBtn"];
  if (!themeBtnEl) { failures++; console.error("FAIL: #themeBtn was never registered by the page script"); }
  else {
    const before = documentStub.documentElement.getAttribute("data-theme");
    themeBtnEl.fire("click");
    const after = documentStub.documentElement.getAttribute("data-theme");
    assertStrEqual(after === "dark" || after === "light", true, "clicking the theme toggle sets a real 'dark' or 'light' data-theme value");
    assertStrEqual(after !== before, true, "clicking the theme toggle actually flips the value, not a no-op");
    assertStrEqual(themeBtnEl.getAttribute("aria-pressed"), after === "dark" ? "true" : "false", "the toggle's own aria-pressed reflects its new state");
    themeBtnEl.fire("click"); // toggle back so it can't affect anything below
  }
}

console.log("--- Exploration progress: visited-tab tracking + the 'Did you know?' one-time factoid toast (both wired through the same activateTab() call, tested together) ---");
{
  assertStrEqual(!!initialShownFactoids.overview, false, "cold page load suppresses Overview's own factoid toast (it would compete with the 'Take the tour' card)");
  assertStrEqual(initialFactoidToastShowing, false, "the factoid toast is not showing immediately after cold page load");
  assertStrEqual(!!state.visitedTabs.actions, false, "the 'actions' tab is not yet marked visited (pre-registered: never clicked earlier in this run)");
  assertStrEqual(!!state.getShownFactoids().actions, false, "the 'actions' tab factoid has not been shown yet either");
  const actionsBtn = lastTabButtonStubs.find((b) => b.dataset.tab === "actions");
  if (!actionsBtn) { failures++; console.error("FAIL: could not find the actions tab button stub"); }
  else {
    actionsBtn.fire("click");
    assertStrEqual(state.visitedTabs.actions, true, "clicking actions marks it visited in the shared visitedTabs object");
    assertStrEqual(actionsBtn.classList.contains("visited"), true, "the clicked tab button gains the .visited class");
    assertStrEqual(actionsBtn.getAttribute("aria-label"), "Actions (visited)", "a screen-reader user gets the same 'visited' signal via aria-label, not just the sighted-only color dot (self-review finding)");
    const progressEl = elementsById["tourProgress"];
    assertStrEqual(progressEl.textContent.indexOf(" of 12 explored") !== -1, true, "the progress indicator reports 'N of 12 explored'");
    assertStrEqual(elementsById["factoidToast"].classList.contains("show"), true, "visiting a tab for the first time shows its 'Did you know?' toast");
    assertStrEqual(elementsById["factoidText"].textContent, state.TAB_FACTOIDS.actions, "the toast shows that tab's own real factoid text, not a placeholder");
    assertStrEqual(state.getShownFactoids().actions, true, "the factoid is now marked shown, so it won't repeat");
    elementsById["factoidClose"].fire("click");
    assertStrEqual(elementsById["factoidToast"].classList.contains("show"), false, "the close button dismisses the toast");
    if (overviewBtn) overviewBtn.fire("click");
    actionsBtn.fire("click");
    assertStrEqual(elementsById["factoidToast"].classList.contains("show"), false, "revisiting the same tab a second time does not re-show its already-seen factoid");
    if (overviewBtn) overviewBtn.fire("click");
  }
}

console.log('--- "Explain it simply" toggle: technical vs. plain-English explainer text ---');
{
  // A count-only check (30 === 30) would pass even if one key were typo'd -- e.g. a "simple" entry
  // under a name that doesn't match any real technical id would silently leave that id's simple
  // mode falling back to its own technical text (renderExplainers()'s own `|| kpiExplainers[id]`
  // fallback), invisibly, while some OTHER id ended up with two entries. Compare the actual key
  // SETS, not just their sizes (self-review finding, 2026-08-26).
  const techKeys = Object.keys(state.kpiExplainers).sort();
  const simpleKeys = Object.keys(state.kpiExplainersSimple).sort();
  assertStrEqual(JSON.stringify(simpleKeys), JSON.stringify(techKeys), "kpiExplainersSimple has EXACTLY the same key set as kpiExplainers, not just the same count");
  assertStrEqual(state.getExplainMode(), "technical", "explain mode starts 'technical', matching this build's real default");
  const explainBtnEl = elementsById["explainBtn"];
  if (!explainBtnEl) { failures++; console.error("FAIL: #explainBtn was never registered"); }
  else {
    explainBtnEl.fire("click");
    assertStrEqual(state.getExplainMode(), "simple", "clicking the toggle switches to simple mode");
    assertStrEqual(explainBtnEl.getAttribute("aria-pressed"), "true", "the toggle reflects its own on-state via aria-pressed");
    assertStrEqual(elementsById["exp01"].textContent, state.kpiExplainersSimple.exp01, "exp01's rendered text actually switches to the simple version, not just the internal mode flag");
    explainBtnEl.fire("click");
    assertStrEqual(state.getExplainMode(), "technical", "clicking again switches back to technical mode");
    assertStrEqual(elementsById["exp01"].textContent, state.kpiExplainers.exp01, "exp01's rendered text switches back to the technical version");
  }
}

console.log("--- Command Palette (Ctrl/Cmd+K): pure search function + real DOM open/close/keyboard nav ---");
{
  const emptyQueryResults = state.paletteSearch("", state.paletteIndex);
  assertStrEqual(emptyQueryResults.length > 0 && emptyQueryResults.length <= 8, true, "an empty query returns a short non-empty browse list, not everything or nothing");
  const mcResults = state.paletteSearch("monte carlo", state.paletteIndex);
  assertStrEqual(mcResults.some((r) => r.label.toLowerCase().indexOf("monte carlo") !== -1), true, "searching 'monte carlo' finds the real Monte Carlo KPI catalog row");
  const nonsenseResults = state.paletteSearch("zzz-no-such-zzz", state.paletteIndex);
  assertEqual(nonsenseResults.length, 0, "a nonsense query correctly returns zero results, not a fallback to everything");
  const kindsPresent = new Set(state.paletteIndex.map((it) => it.kind));
  assertStrEqual(kindsPresent.has("Tab") && kindsPresent.has("KPI") && kindsPresent.has("Glossary"), true, "the palette index covers all 3 real sources (tabs, KPIs, glossary terms), not just one");

  const paletteBtnEl = elementsById["paletteBtn"];
  const paletteInputEl = elementsById["paletteInput"];
  if (!paletteBtnEl || !paletteInputEl) { failures++; console.error("FAIL: palette button/input were never registered"); }
  else {
    assertStrEqual(elementsById["paletteOverlay"].hidden, true, "the palette starts hidden, matching its real HTML default");
    paletteBtnEl.fire("click");
    assertStrEqual(elementsById["paletteOverlay"].hidden, false, "clicking the search button opens the palette");
    paletteInputEl.value = "cost";
    paletteInputEl.fire("input");
    assertStrEqual(elementsById["paletteResults"].innerHTML.indexOf("Cost") !== -1, true, "typing 'cost' renders at least one real matching result");
    paletteInputEl.fire("keydown", { key: "Enter" });
    assertStrEqual(elementsById["paletteOverlay"].hidden, true, "pressing Enter on a result closes the palette");
    assertStrEqual(state.getCurrentTab(), "cost", "pressing Enter actually navigated to the top matching result's own tab");
    // ArrowDown must actually MOVE the selection, not just be accepted without effect -- pre-
    // registered via a direct call to the real search function: for query "cost", index 1 is the
    // "Portfolio Forecast" KPI (tab: overview), distinct from index 0's "Cost" tab.
    const costQueryResults = state.paletteSearch("cost", state.paletteIndex);
    assertStrEqual(costQueryResults[1] && costQueryResults[1].action.tab, "overview", "pre-registered: the 2nd 'cost' result is a KPI targeting Overview, distinct from the 1st (Cost tab itself)");
    paletteBtnEl.fire("click");
    paletteInputEl.value = "cost";
    paletteInputEl.fire("input");
    assertStrEqual(paletteInputEl.getAttribute("aria-activedescendant"), "paletteItem0", "rendering results points aria-activedescendant at the first (default-selected) option");
    paletteInputEl.fire("keydown", { key: "ArrowDown" });
    assertStrEqual(paletteInputEl.getAttribute("aria-activedescendant"), "paletteItem1", "ArrowDown moves aria-activedescendant to the newly-highlighted option (screen-reader accessible, not just a visual highlight -- self-review finding)");
    assertStrEqual(documentStub.getElementById("paletteItem1").getAttribute("aria-selected"), "true", "the new selection is marked aria-selected (looked up via getElementById, since renderPaletteResults()'s innerHTML string is what named these ids, not a real parsed child tree in this stub)");
    assertStrEqual(documentStub.getElementById("paletteItem0").getAttribute("aria-selected"), "false", "...and the previous selection is un-marked");
    paletteInputEl.fire("keydown", { key: "Enter" });
    assertStrEqual(state.getCurrentTab(), "overview", "ArrowDown then Enter activates the SECOND result, not the first -- selection genuinely moves, not just accepted as a no-op keypress");

    // Focus-return-on-close (self-review finding): whatever had focus when the palette opened
    // should get it back when it closes, however it closes (Escape here) -- otherwise a keyboard
    // user's focus silently falls back to document.body.
    const fakeFocusTarget = withProperties(makeElementStub());
    let focusCallCount = 0;
    fakeFocusTarget.focus = () => { focusCallCount++; };
    documentStub.activeElement = fakeFocusTarget;
    paletteBtnEl.fire("click");
    documentStub.fire("keydown", { key: "Escape", target: {} });
    assertEqual(focusCallCount, 1, "closing the palette (via Escape) returns focus to whatever had it before the palette opened");

    // The empty-results branch (rendered HTML, not just paletteSearch()'s own return value) was
    // never actually checked against the DOM.
    paletteBtnEl.fire("click");
    paletteInputEl.value = "zzz-no-such-zzz";
    paletteInputEl.fire("input");
    assertStrEqual(elementsById["paletteResults"].innerHTML.indexOf("No matches") !== -1, true, "a nonsense query renders the real empty-state message in the DOM, not just returning [] from the pure function");
    documentStub.fire("keydown", { key: "Escape", target: {} });
    documentStub.activeElement = null; // reset so this fixture can't leak into any later test
  }
  // The global Ctrl/Cmd+K handler, not just the header button.
  documentStub.fire("keydown", { key: "k", metaKey: true, target: {} });
  assertStrEqual(elementsById["paletteOverlay"].hidden, false, "Cmd+K opens the palette via the global keydown handler");
  documentStub.fire("keydown", { key: "Escape", target: {} });
  assertStrEqual(elementsById["paletteOverlay"].hidden, true, "Escape closes the palette (checked before the shortcuts overlay in the same handler)");
  if (overviewBtn) overviewBtn.fire("click"); // reset to Overview in case a palette jump landed elsewhere

  // Self-review finding: a palette jump can land anywhere, which would leave the guided Tour's own
  // step counter stale against whatever tab actually ended up active if the tour was mid-session.
  if (startTourBtnEl && paletteInputEl) {
    startTourBtnEl.fire("click");
    assertStrEqual(state.isTourActive(), true, "sanity check: the tour is genuinely active before this probe");
    paletteBtnEl.fire("click");
    paletteInputEl.value = "cost";
    paletteInputEl.fire("input");
    paletteInputEl.fire("keydown", { key: "Enter" });
    assertStrEqual(state.isTourActive(), false, "activating a palette result while the guided Tour is active correctly ends the tour, instead of leaving its step counter stale");
    if (overviewBtn) overviewBtn.fire("click"); // reset to Overview
  }
}

console.log("--- Drill-down click-to-detail: CV tornado / sensitivity tornado / LPF bar / Control Account Ledger (previously the one visualization pattern on this page with no drill-down at all) ---");
{
  // Click now binds to the WIDE row (id "...Row0"), keydown to the narrow bar (id "...Bar0") --
  // both fired here so each element's own listener is actually exercised (stress-test finding,
  // 2026-08-26: previously both were on the same narrow bar, inconsistent with the region ranked
  // bar's row-click pattern; the row-click test below is what actually caught the retrofit).
  const cvRow0 = elementsById["cvRow0"];
  if (!cvRow0) { failures++; console.error("FAIL: could not find cvRow0 to click-test"); }
  else {
    cvRow0.fire("click");
    const t = elementsById["cvTornadoDetail"].innerHTML;
    assertStrEqual(t.indexOf("CV") !== -1 && t.indexOf("CPI") !== -1, true, "clicking a CV tornado ROW (not just the narrow bar) shows a real CV/CPI reconciliation, not the placeholder text");
  }
  const sensRow0 = elementsById["sensRow0"];
  if (!sensRow0) { failures++; console.error("FAIL: could not find sensRow0 to click-test"); }
  else {
    sensRow0.fire("click");
    const t = elementsById["sensitivityDetail"].innerHTML;
    assertStrEqual(t.indexOf("vs. the current forecast") !== -1, true, "clicking a sensitivity tornado ROW (not just the narrow bar) shows a real scenario detail, not the placeholder text");
  }
  const lpfRow0 = elementsById["lpfRow0"];
  if (!lpfRow0) { failures++; console.error("FAIL: could not find lpfRow0 to click-test"); }
  else {
    lpfRow0.fire("click");
    const t = elementsById["lpfDetail"].innerHTML;
    assertStrEqual(t.indexOf("LPF") !== -1 && t.indexOf("benchmark") !== -1, true, "clicking an LPF ROW (not just the narrow bar) shows a real productivity detail, not the placeholder text");
  }
  const calRow0 = elementsById["calRow0"];
  if (!calRow0) { failures++; console.error("FAIL: could not find calRow0 to click-test"); }
  else {
    calRow0.fire("click");
    const t = elementsById["calDetail"].innerHTML;
    assertStrEqual(t.indexOf("BAC") !== -1 && t.indexOf("CPI") !== -1, true, "clicking a control-account row shows a real BAC/EV/AC/CPI reconciliation, not the placeholder text");
  }
  // Keyboard activation (Enter), not just a mouse click -- proves the drill-down is keyboard-accessible.
  const cvBar1 = elementsById["cvBar1"];
  if (cvBar1) {
    elementsById["cvTornadoDetail"].innerHTML = "reset-marker";
    cvBar1.fire("keydown", { key: "Enter" });
    assertStrEqual(elementsById["cvTornadoDetail"].innerHTML !== "reset-marker", true, "an Enter keypress on a CV tornado bar also triggers its detail (keyboard-accessible, not mouse-only)");
  }
}

console.log("--- Region ranked-bar click switches the active region (previously view-only) + region what-if slider ---");
{
  const regionRow0 = elementsById["regionRankedBarRow0"];
  if (!regionRow0) { failures++; console.error("FAIL: could not find regionRankedBarRow0 to click-test"); }
  else {
    regionRow0.fire("click");
    assertStrEqual(state.getActiveRegion(), "APAC", "clicking the top-ranked region bar (APAC, the largest variance% at this build's real numbers) switches the active region to it");
  }
  assertEqual(state.computeRegionWhatIf(1000000, 10), 1100000, "computeRegionWhatIf: a +10% swing on 1,000,000 is 1,100,000");
  assertEqual(state.computeRegionWhatIf(1000000, -10), 900000, "computeRegionWhatIf: a -10% swing on 1,000,000 is 900,000");
  assertEqual(state.computeRegionWhatIf(1000000, 0), 1000000, "computeRegionWhatIf: a 0% swing is a no-op");
  assertEqual(state.getRegionAdjustResult().pct, 0, "the region-adjust slider starts at 0%, matching its declared HTML default and this build's reset-on-switch behavior");
  const regionAdjustEl = elementsById["regionAdjust"];
  if (!regionAdjustEl) { failures++; console.error("FAIL: #regionAdjust was never registered"); }
  else {
    regionAdjustEl.value = "10";
    regionAdjustEl.fire("input");
    assertEqual(state.getRegionAdjustResult().pct, 10, "dragging the slider to +10% updates the live result");
    const activeForecast = state.regions.find((r) => r.code === state.getActiveRegion()).forecast;
    const expectedAdjusted = state.computeRegionWhatIf(activeForecast, 10);
    assertEqual(state.getRegionAdjustResult().adjusted, expectedAdjusted, "the adjusted forecast independently re-derives from the active region's real forecast");
  }
  const regionRow3 = elementsById["regionRankedBarRow3"];
  if (!regionRow3) { failures++; console.error("FAIL: could not find regionRankedBarRow3 to click-test"); }
  else {
    regionRow3.fire("click");
    assertStrEqual(state.getActiveRegion(), "NA", "clicking the bottom-ranked region bar (NA, the smallest variance%) switches to it, as pre-registered from the real ranking order");
    assertEqual(state.getRegionAdjustResult().pct, 0, "switching regions resets the what-if slider back to 0%, per its own stated promise");
  }
}

console.log("--- Browser back/forward support: real history.pushState (direct tab click) vs .replaceState (internal jump) ---");
{
  assertStrEqual(initialHash, "#t-overview", "the page's own initial restoreInitialTab() call replaceState'd the URL hash to the real starting tab");
  assertEqual(initialReplaceCount, 1, "the very first load performs exactly one replaceState call, not a push (a fresh load is not a user-driven navigation)");
  assertEqual(initialPushCount, 0, "the very first load never pushes a history entry");
  const costTabBtn = lastTabButtonStubs.find((b) => b.dataset.tab === "cost");
  const pushBefore = mockPushCount;
  costTabBtn.fire("click");
  assertEqual(mockPushCount, pushBefore + 1, "a direct top-level tab click PUSHES a new history entry");
  assertStrEqual(mockHash, "#t-cost", "the URL hash updates to the newly clicked tab");
  if (overviewBtn) overviewBtn.fire("click"); // back to a known tab (this also pushes -- not what's measured next)
  const pushBefore2 = mockPushCount, replaceBefore2 = mockReplaceCount;
  documentStub.fire("click", { target: fakeJumpBtn }); // overview -> cost via a .triage-jump (internal cross-reference, not a direct tab click)
  assertEqual(mockPushCount, pushBefore2, "an internal .triage-jump does NOT push a new history entry");
  assertEqual(mockReplaceCount, replaceBefore2 + 1, "an internal .triage-jump replaces the current history entry instead");
  if (overviewBtn) overviewBtn.fire("click"); // reset back to Overview

  // Real popstate reception (the actual browser Back/Forward button mechanism) -- previously
  // untested: the page's own `typeof window.addEventListener === "function"` guard always
  // evaluated false in this sandbox (window had no addEventListener of its own), so the
  // registration silently no-op'd on every prior run of this suite (independent-reviewer finding).
  fireWindowEvent("popstate", { state: { cmccTab: "framework" } });
  assertStrEqual(state.getCurrentTab(), "framework", "a real popstate event (simulating the browser Back/Forward button) actually re-activates the tab named in its own state, proving the registration genuinely fired");
  if (overviewBtn) overviewBtn.fire("click"); // reset back to Overview
}

console.log("--- 10-feature UX/UI brainstorm pass (2026-08-26): CSV export ---");
const csvRows = [{ a: "Plain", b: 1 }, { a: "Has, comma", b: 2 }, { a: 'Has "quote"', b: 3 }, { a: "Has\nnewline", b: 4 }];
const csvCols = [{ label: "A", key: "a" }, { label: "B", key: "b" }];
const csvOut = state.arrayToCSV(csvRows, csvCols);
const csvLines = csvOut.split("\r\n");
assertEqual(csvLines.length, 5, "arrayToCSV: header + 4 data rows = 5 lines, not fewer (a naive split would undercount an embedded newline)");
assertStrEqual(csvLines[0], "A,B", "arrayToCSV: header row matches the column labels exactly");
assertStrEqual(csvLines[2], '"Has, comma",2', "arrayToCSV: a field containing a comma is quoted");
assertStrEqual(csvLines[3], '"Has ""quote""",3', "arrayToCSV: an embedded quote is doubled, not left unescaped");
assertStrEqual(state.downloadCSV("test.csv", "a,b"), false, "downloadCSV() degrades to a clean `false` (not a throw) in this sandbox, which has no real Blob/URL");
// Second-pass stress-test finding: a bare \r (not just \n) must also be quoted, since rows are
// joined with \r\n -- an unescaped \r could otherwise misalign a naive line-based CSV parser.
const crRow = [{ a: "Has\ronlyCR", b: 9 }];
const crOut = state.arrayToCSV(crRow, csvCols);
assertStrEqual(crOut.split("\r\n")[1], '"Has\ronlyCR",9', "arrayToCSV: a field containing a bare \\r (not \\n) is also quoted");

console.log("--- 10-feature UX/UI brainstorm pass: notification bell (reads the SAME computeTriageItems() Triage renders) ---");
assertEqual(state.getAlertBellItems().length, state.triageItems.length, "the header bell's item count matches Attention & Triage's own item count exactly -- one alert model, not two");
assertStrEqual(elementsById["alertBellCount"].hidden, false, "the bell's count badge is visible when this build's real default state has active alerts (4, per the Triage section above)");
// Second-pass stress-test finding: clicking the bell must move DOM focus into the Triage tab's own
// button, not just switch the panel visually (a keyboard/screen-reader user's Tab would otherwise
// continue through the header instead of the newly-active panel's content).
const triageTabBtnForFocus = lastTabButtonStubs.find((b) => b.dataset.tab === "triage");
if (elementsById["alertBellBtn"] && triageTabBtnForFocus) {
  let triageFocusCalls = 0;
  triageTabBtnForFocus.focus = () => { triageFocusCalls++; };
  elementsById["alertBellBtn"].fire("click");
  assertStrEqual(triageFocusCalls >= 1, true, "clicking the alert bell moves DOM focus to the Triage tab button, not just the panel");
} else {
  failures++; console.error("FAIL: alertBellBtn or the Triage tab button stub not found in the DOM stub");
}

console.log("--- 10-feature UX/UI brainstorm pass: range-position chip (pure function) ---");
assertStrEqual(state.rangeChipHTML(12, 30, 12, " mo").indexOf("--rc-pct:0.0%") !== -1, true, "rangeChipHTML: a value at the low end of the range positions at 0%");
assertStrEqual(state.rangeChipHTML(12, 30, 30, " mo").indexOf("--rc-pct:100.0%") !== -1, true, "rangeChipHTML: a value at the high end of the range positions at 100%");
assertStrEqual(state.rangeChipHTML(0, 100, 50, "%").indexOf("--rc-pct:50.0%") !== -1, true, "rangeChipHTML: a value at the exact midpoint positions at 50%");
assertStrEqual(state.rangeChipHTML(0, 100, 150, "%").indexOf("--rc-pct:100.0%") !== -1, true, "rangeChipHTML: a value ABOVE the range clamps to 100%, doesn't overflow the track");
assertStrEqual(state.rangeChipHTML(0, 100, -50, "%").indexOf("--rc-pct:0.0%") !== -1, true, "rangeChipHTML: a value BELOW the range clamps to 0%, doesn't underflow the track");

console.log("--- 10-feature UX/UI brainstorm pass: reading-mode toggle (third display mode, independent of light/dark) ---");
assertStrEqual(state.getReadMode(), "off", "reading mode starts 'off', matching this build's real default (no persisted preference in this sandbox run)");
if (elementsById["readModeBtn"]) {
  elementsById["readModeBtn"].fire("click");
  assertStrEqual(state.getReadMode(), "on", "clicking the reading-mode toggle switches it on");
  assertStrEqual(elementsById["readModeBtn"].getAttribute("aria-pressed"), "true", "the toggle's own aria-pressed reflects its new state");
  elementsById["readModeBtn"].fire("click");
  assertStrEqual(state.getReadMode(), "off", "clicking again switches it back off");
} else {
  failures++; console.error("FAIL: #readModeBtn not found in the DOM stub");
}

console.log("--- 10-feature UX/UI brainstorm pass: keyboard row-navigation (Up/Down between table rows, CLAMPED not wrapped) ---");
if (elementsById["calRow0"] && elementsById["calRow1"]) {
  // >= 1, not === 1: renderControlAccounts() re-runs on every currency toggle exercised earlier
  // in this same suite, and this sandbox's persistent-by-id stub (unlike a real browser's
  // innerHTML-driven element teardown) keeps every prior run's listeners registered too -- a
  // known test-harness artifact, not evidence of a real duplicate-wiring bug in production.
  let row1FocusCalls = 0;
  elementsById["calRow1"].focus = () => { row1FocusCalls++; };
  elementsById["calRow0"].fire("keydown", { key: "ArrowDown", preventDefault: noop });
  assertStrEqual(row1FocusCalls >= 1, true, "ArrowDown on control-account row 0 moves focus to row 1 (via wireArrowKeyRowNav, index-based getElementById -- not querySelectorAll)");
  // This one IS exactly 0, regardless of stacked listeners: the nextIdx===i early-return means
  // NONE of the (possibly many) stacked instances ever call .focus() at the boundary.
  let row0FocusCalls = 0;
  elementsById["calRow0"].focus = () => { row0FocusCalls++; };
  elementsById["calRow0"].fire("keydown", { key: "ArrowUp", preventDefault: noop });
  assertEqual(row0FocusCalls, 0, "ArrowUp on the FIRST row is CLAMPED (a genuine no-op, caught by testing: an earlier version redundantly re-focused the row on itself instead of doing nothing)");
} else {
  failures++; console.error("FAIL: calRow0/calRow1 not found in the DOM stub -- control-account ledger not rendered?");
}
// Independent-reviewer finding, 2026-08-26: CV tornado / sensitivity tornado / LPF bar render
// their OWN bars directly (not through the shared renderRankedBar()), and had gotten NO keyboard
// nav at all until this fix -- confirming each of the 3 directly, not just via a source-text count.
[["cvBar", "CV tornado"], ["sensBar", "sensitivity tornado"], ["lpfBar", "LPF diverging bar"]].forEach(([prefix, label]) => {
  if (elementsById[prefix + "0"] && elementsById[prefix + "1"]) {
    let calls = 0;
    elementsById[prefix + "1"].focus = () => { calls++; };
    elementsById[prefix + "0"].fire("keydown", { key: "ArrowDown", preventDefault: noop });
    assertStrEqual(calls >= 1, true, `ArrowDown on the ${label}'s first bar moves focus to the second (previously had no keyboard row-nav at all)`);
  } else {
    failures++; console.error(`FAIL: ${prefix}0/${prefix}1 not found in the DOM stub -- ${label} not rendered?`);
  }
});

console.log("--- 10-feature UX/UI brainstorm pass: deep-linkable KPI anchors ---");
{
  const savedHash = mockHash;
  mockHash = "#t-cost/exp0708";
  const parsed1 = state.tabFromLocationHash();
  assertStrEqual(parsed1 && parsed1.tab, "cost", "tabFromLocationHash() parses the tab segment from a KPI-anchored hash");
  assertStrEqual(parsed1 && parsed1.kpi, "exp0708", "tabFromLocationHash() parses the KPI-anchor segment (the part after '/')");
  mockHash = "#t-overview";
  const parsed2 = state.tabFromLocationHash();
  assertStrEqual(parsed2 && parsed2.tab, "overview", "tabFromLocationHash() still parses a tab-only hash correctly (no '/' present)");
  assertStrEqual(parsed2 && parsed2.kpi, null, "tabFromLocationHash() reports a null kpi (not undefined, not an empty string) when no anchor segment is present");
  mockHash = savedHash;
}
{
  const kpiTarget = elementsById["exp01"];
  assertStrEqual(kpiTarget.classList.contains("open"), false, "sanity check: exp01's explainer starts closed before the deep-link probe");
  const opened = state.openKpiAnchor("exp01");
  assertStrEqual(opened, true, "openKpiAnchor() returns true when the target explainer div exists");
  assertStrEqual(kpiTarget.classList.contains("open"), true, "openKpiAnchor() opens the target explainer div directly, by id");
  // Tests the `!id` guard specifically, not `!target` -- this sandbox's own getElementById
  // auto-vivifies a fresh stub for ANY id (unlike a real browser, which returns null for an
  // unknown one), so the `!target` branch is genuinely untestable through this harness; a falsy
  // id never reaches getElementById at all, so THIS branch is real and reachable here.
  assertStrEqual(state.openKpiAnchor(null), false, "openKpiAnchor() returns false (not a throw) for a falsy id -- a missing deep-link anchor degrades cleanly");
  kpiTarget.classList.remove("open"); // restore, so this probe doesn't leak into later assertions
}
{
  // End-to-end, through the REAL popstate handler -- not tabFromLocationHash()/openKpiAnchor() in
  // isolation (independent-reviewer finding, 2026-08-26: those two unit tests above both passed
  // even though the real flow was broken). Pre-registered expectation: after a popstate carrying
  // a kpi anchor, the explainer opens AND the URL/history state still carries that same anchor --
  // NOT silently dropped by activateTab's own internal tabHistorySync call. The bug this catches:
  // activateTab(name) previously called tabHistorySync(name, ...) with no kpi argument at all,
  // which replaceState'd the URL back down to "#t-cost" the instant the tab activated, erasing the
  // very anchor openKpiAnchor() was about to open -- confirmed by reproducing it first (mockHash
  // came back as "#t-cost", not "#t-cost/expDrawdownAnchor"), then fixed by threading kpiAnchor
  // through activateTab() itself.
  const expTarget = elementsById["exp03"]; // a real explainer id already used elsewhere on the Cost tab
  expTarget.classList.remove("open"); // sanity: start closed, independent of any earlier probe
  const savedHash2 = mockHash;
  fireWindowEvent("popstate", { state: { cmccTab: "cost", cmccKpi: "exp03" } });
  assertStrEqual(state.getCurrentTab(), "cost", "a popstate carrying a kpi anchor still activates the right TAB");
  assertStrEqual(expTarget.classList.contains("open"), true, "...and genuinely opens that KPI's own explainer div");
  assertStrEqual(mockHash, "#t-cost/exp03", "...and the URL hash still carries the kpi anchor afterward -- NOT silently rewritten back down to a bare '#t-cost' by activateTab's own history sync");
  mockHash = savedHash2;
  expTarget.classList.remove("open"); // restore
}

console.log("--- 10-feature UX/UI brainstorm pass: Data Freshness audit view ---");
assertStrEqual(Array.isArray(state.dataFreshnessLog) && state.dataFreshnessLog.length > 0, true, "dataFreshnessLog is a real, non-empty array");
const freshSorted = state.sortFreshnessLog(state.dataFreshnessLog);
let freshOrderOk = true;
let sawNull = false;
for (let i = 0; i < freshSorted.length; i++) {
  if (freshSorted[i].year === null) { sawNull = true; continue; }
  if (sawNull) { freshOrderOk = false; break; } // a real year appearing AFTER a null -- nulls must sort last
  if (i > 0 && freshSorted[i - 1].year !== null && freshSorted[i].year > freshSorted[i - 1].year) { freshOrderOk = false; break; }
}
assertStrEqual(freshOrderOk, true, "sortFreshnessLog: real years sort newest-first, and every null-year entry sorts after every dated one");
assertStrEqual(state.getDataFreshnessResult().length, state.dataFreshnessLog.length, "renderDataFreshness() rendered every log entry, not a truncated subset");

console.log("--- 10-feature UX/UI brainstorm pass: slider history/undo (pure stack logic) ---");
const testHist = state.makeSliderHistory(3);
assertEqual(testHist.size(), 0, "a fresh history stack starts empty");
testHist.push({ v: 1 }); testHist.push({ v: 2 }); testHist.push({ v: 3 });
assertEqual(testHist.size(), 3, "pushing 3 entries onto a max-3 stack keeps all 3");
testHist.push({ v: 4 });
assertEqual(testHist.size(), 3, "pushing a 4th entry onto a max-3 stack evicts the oldest, not grows unbounded");
const back1 = testHist.back();
assertStrEqual(JSON.stringify(back1), JSON.stringify({ v: 3 }), "back() discards the current top (v:4) and returns what was before it (v:3)");
assertEqual(testHist.size(), 2, "back() actually shrinks the stack by one (it's an undo, not a peek)");
const emptyHist = state.makeSliderHistory(5);
assertStrEqual(emptyHist.back(), null, "back() on an empty stack returns null, not a throw");
emptyHist.push({ v: 1 });
assertStrEqual(emptyHist.back(), null, "back() with only 1 entry (nothing to go back TO) returns null rather than discarding the only entry");
assertEqual(state.getWiHistorySize(), 1, "the live what-if sandbox's own history stack starts with exactly 1 entry (the initial slider position), on this build's real default state");
if (elementsById["wiScope"]) {
  elementsById["wiScope"].value = "10";
  elementsById["wiScope"].fire("input");
  assertEqual(state.getWiHistorySize(), 2, "dragging the scope slider pushes a new entry onto the live history stack");
  if (elementsById["wiHistoryBackBtn"]) {
    elementsById["wiHistoryBackBtn"].fire("click");
    assertEqual(state.getWiHistorySize(), 1, "clicking Undo pops the live stack back down by one");
    assertStrEqual(String(elementsById["wiScope"].value), "4", "Undo actually restores the slider's own prior value (this build's real default, 4%), not just the internal stack");
  } else {
    failures++; console.error("FAIL: #wiHistoryBackBtn not found in the DOM stub");
  }
} else {
  failures++; console.error("FAIL: #wiScope not found in the DOM stub");
}

console.log("--- Persistence round-trip: a REAL simulated reload restores every persisted key (stress-test finding, 2026-08-26 -- the old localStorage stub was a total no-op, so this build's headline 'full persistence' claim was never actually exercised by this suite) ---");
{
  // Explicit, deterministic values written directly to the shared backing store -- NOT whatever
  // the rest of this suite's cumulative clicks happened to leave behind (that would make this
  // test's outcome depend on every other test's exact order, exactly the fragility a stress-test
  // pass should remove, not introduce). This tests the RESTORE contract in isolation: given key K
  // holds value V, does a fresh load apply V.
  localStorageBackingStore["cmcc-theme"] = "dark";
  localStorageBackingStore["cmcc-lasttab"] = "contingency";
  localStorageBackingStore["cmcc-currency"] = "GBP";
  localStorageBackingStore["cmcc-explain"] = "simple";
  localStorageBackingStore["cmcc-visited"] = "overview,cost";
  localStorageBackingStore["cmcc-factoids-seen"] = "overview";
  localStorageBackingStore["cmcc-region"] = "EMEA";
  localStorageBackingStore["cmcc-readmode"] = "on"; // independent-reviewer finding, 2026-08-26: this key existed but wasn't in this fixture

  // A genuinely fresh DOM + sandbox (mirrors the minimal stub set built at the top of this file),
  // sharing ONLY localStorageStub (the same backing store) with the first run above -- a real
  // second "page load," not a re-read of the first run's already-live state.
  const elementsById2 = {};
  function getOrCreate2(id) { if (!elementsById2[id]) elementsById2[id] = withProperties(makeElementStub()); return elementsById2[id]; }
  const documentStub2 = {
    getElementById: (id) => getOrCreate2(id),
    querySelectorAll: (sel) => {
      if (sel === ".tabbtn") {
        return ["overview", "exec", "cost", "contingency", "governance", "portfolio", "ramp", "framework", "actions", "triage", "data", "reference"].map((name) => {
          const b = withProperties(makeElementStub());
          b.dataset = { tab: name };
          elementsById2["panel-" + name] = elementsById2["panel-" + name] || withProperties(makeElementStub());
          return b;
        });
      }
      if (sel === ".tabpanel") return Object.keys(elementsById2).filter((k) => k.startsWith("panel-")).map((k) => elementsById2[k]);
      return [];
    },
    documentElement: (() => {
      const attrs2 = {};
      return {
        setAttribute(name, value) { attrs2[name] = String(value); },
        getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs2, name) ? attrs2[name] : null; },
      };
    })(),
    activeElement: null,
    addEventListener() {},
    createElement: () => withProperties(makeElementStub()),
  };
  elementsById2["mcCanvas"] = Object.assign(makeElementStub(), { width: 420, height: 140, getContext: () => ({ clearRect() {}, fillRect() {} }) });
  ["pctComplete", "drawdownPct", "mcMin", "mcMode", "mcMax", "wiScope", "wiEscalation", "glossarySearch", "regionAdjust"].forEach((id) => {
    elementsById2[id] = makeElementStub(); elementsById2[id].value = "0";
  });
  elementsById2["pctComplete"].value = "18"; elementsById2["drawdownPct"].value = "35";
  elementsById2["mcMin"].value = "1750000000"; elementsById2["mcMode"].value = "1870000000"; elementsById2["mcMax"].value = "2170000000";
  elementsById2["wiScope"].value = "4"; elementsById2["wiEscalation"].value = "2";
  elementsById2["shortcutsOverlay"] = Object.assign(makeElementStub(), { hidden: true });
  elementsById2["jumpBreadcrumb"] = Object.assign(makeElementStub(), { hidden: true });
  elementsById2["paletteOverlay"] = Object.assign(makeElementStub(), { hidden: true });

  const sandbox2 = {
    document: documentStub2,
    window: {},
    localStorage: localStorageStub, // the SAME backing store as the first run -- this IS the point
    history: { pushState() {}, replaceState() {} },
    location: { hash: "" },
    getComputedStyle: () => ({ getPropertyValue: () => "6 182 212" }),
    console, Math, setTimeout, clearTimeout, Date,
  };
  sandbox2.window = sandbox2;
  vm.createContext(sandbox2);
  try {
    vm.runInContext(pageScript, sandbox2);
  } catch (err) {
    failures++;
    console.error("FAIL: the simulated-reload page script threw:", err.message);
  }
  const state2 = sandbox2.window.__CMCC_STATE__;
  if (!state2) {
    failures++;
    console.error("FAIL: the simulated reload's window.__CMCC_STATE__ was not set");
  } else {
    assertStrEqual(documentStub2.documentElement.getAttribute("data-theme"), "dark", "a fresh load restores the persisted theme");
    assertStrEqual(state2.getCurrentTab(), "contingency", "a fresh load restores the persisted last-active tab");
    assertStrEqual(elementsById2["currencySelect"] && elementsById2["currencySelect"].value, "GBP", "a fresh load restores the persisted currency");
    assertStrEqual(state2.getExplainMode(), "simple", "a fresh load restores the persisted explain-mode");
    assertStrEqual(!!state2.visitedTabs.overview && !!state2.visitedTabs.cost, true, "a fresh load restores the persisted visited-tabs set");
    assertStrEqual(!!state2.getShownFactoids().overview, true, "a fresh load restores the persisted shown-factoids set");
    assertStrEqual(state2.getActiveRegion(), "EMEA", "a fresh load restores the persisted active region (the exact gap an independent reviewer found: this key was previously claimed as persisted but never actually was)");
    assertStrEqual(documentStub2.documentElement.getAttribute("data-readmode"), "on", "a fresh load restores the persisted reading-mode preference (independent-reviewer finding, 2026-08-26: this key existed since the 10-feature brainstorm pass but was never exercised by this fixture)");
    // Factoid-suppression scoping (independent-reviewer finding): the cold-load suppression must
    // apply ONLY when the restored tab is Overview -- this fixture's persisted last-tab is
    // "contingency" (not Overview), and contingency's factoid was NOT in the persisted seen-set,
    // so it must fire on this very load, not be silently suppressed forever just because it's a
    // cold start. A prior version suppressed unconditionally on every cold load regardless of
    // which tab was restored, confirmed by simulating 5 consecutive cold loads that never once
    // fired a non-Overview tab's factoid.
    assertStrEqual(!!state2.getShownFactoids().contingency, true, "a cold load restoring a NON-Overview tab still shows that tab's own factoid (suppression is Overview-specific, not blanket) -- contingency was not in the persisted seen-set, so this can only be true if the cold-load suppression let it fire");
  }
}

console.log("");
if (failures > 0) {
  console.error(failures + " assertion(s) FAILED");
  process.exit(1);
} else {
  console.log("All assertions passed.");
  process.exit(0);
}
