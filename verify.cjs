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
    addEventListener(){},
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

// The one real DOM event this file needs to simulate: the top-level click-delegation listener
// the page registers for the explainer-toggle feature. Captured here so verify.cjs can fire it.
const documentClickHandlers = [];

const documentStub = {
  getElementById: (id) => getOrCreate(id),
  querySelectorAll: (sel) => {
    if (sel === ".tabbtn") {
      // return 7 fake tab buttons with the real dataset.tab values the page defines
      return ["overview","cost","contingency","governance","portfolio","data","reference"].map((name) => {
        const b = withProperties(makeElementStub());
        b.dataset = { tab: name };
        return b;
      });
    }
    if (sel === ".tabpanel") return [];
    return [];
  },
  documentElement: { setAttribute(){}, getAttribute(){ return null; } },
  addEventListener(type, handler){ if (type === "click") documentClickHandlers.push(handler); },
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
const mcMinStub = makeElementStub(); mcMinStub.value = "2450000";
const mcModeStub = makeElementStub(); mcModeStub.value = "2620000";
const mcMaxStub = makeElementStub(); mcMaxStub.value = "3050000";
elementsById["mcMin"] = mcMinStub;
elementsById["mcMode"] = mcModeStub;
elementsById["mcMax"] = mcMaxStub;
const wiScopeStub = makeElementStub(); wiScopeStub.value = "4";
const wiEscalationStub = makeElementStub(); wiEscalationStub.value = "2";
elementsById["wiScope"] = wiScopeStub;
elementsById["wiEscalation"] = wiEscalationStub;

// Info-toggle button stub -- real enough to test the explainer-toggle click delegation.
// The page's own handler does: e.target.closest(".info-toggle") then reads btn.dataset.explainer.
const infoToggleBtnStub = withProperties(makeElementStub());
infoToggleBtnStub.classList.add("info-toggle");
infoToggleBtnStub.dataset = { explainer: "aace5709exp" };
elementsById["aace5709exp"] = withProperties(makeElementStub()); // the explainer panel itself

const localStorageStub = { getItem(){ return null; }, setItem(){} };

const sandbox = {
  document: documentStub,
  window: {},
  localStorage: localStorageStub,
  getComputedStyle: () => ({ getPropertyValue: () => "6 182 212" }),
  console,
  Math,
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

console.log("--- Budget Bridge ---");
// Independent re-derivation: baseline 2,450,000 + 96,000 + 61,000 + 208,000 - 140,000
const expectedFinal = 2450000 + 96000 + 61000 + 208000 - 140000;
assertEqual(state.bridge.baseline, 2450000, "bridge baseline");
assertEqual(state.bridge.final, expectedFinal, "bridge final forecast");
assertEqual(state.bridge.delta, expectedFinal - 2450000, "bridge net variance");

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
// three must fall within the [min, max] triangular bounds used by the page (2,450,000 / 3,050,000).
const mc = state.monteCarlo;
if (mc.p50 < mc.p80 && mc.p80 < mc.p90) {
  console.log("pass: Monte Carlo percentiles are correctly ordered (P50 < P80 < P90)");
} else {
  failures++;
  console.error("FAIL: Monte Carlo percentiles out of order:", mc);
}
if (mc.p50 >= 2450000 && mc.p90 <= 3050000) {
  console.log("pass: Monte Carlo percentiles fall within the declared triangular bounds");
} else {
  failures++;
  console.error("FAIL: Monte Carlo percentiles outside declared bounds:", mc);
}

console.log("--- WBS Allocation ---");
assertEqual(state.wbsSum, 100, "WBS percentages sum to 100");

console.log("--- Risk Register ---");
// Independent re-derivation of total expected value from the same 4 illustrative rows
const expectedRiskEV = (0.35*180000) + (0.25*96000) + (0.40*61000) + (0.20*75000);
assertEqual(state.totalRiskEV, expectedRiskEV, "total risk expected value", 0.01);

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

  // A click that doesn't land on (or inside) an .info-toggle must be a no-op, not a crash.
  const unrelatedEvent = { target: withProperties(makeElementStub()) };
  let threw = false;
  try { clickHandler(unrelatedEvent); } catch (e) { threw = true; }
  if (threw) { failures++; console.error("FAIL: clicking an unrelated element threw instead of being ignored"); }
  else { console.log("pass: clicking an unrelated element is a safe no-op"); }
}

console.log("--- Content Consistency (every disclaimer 'real' claim must resolve elsewhere in the page) ---");
// Regression test for the exact bug a research pass found live: the disclaimer named Turner &
// Townsend's cost index as a real fact, but nothing else in the page actually cited it -- an
// untraceable "real" claim. Every RP code and every named source the disclaimer claims as real
// must appear again outside the disclaimer itself (in the Cost tab card or the Reference glossary),
// not just floating in the intro paragraph.
const disclaimerMatch = html.match(/<div class="disclaimer">([\s\S]*?)<\/div>/);
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
const expectedWhatIf = state.bridge.baseline + state.bridge.baseline * 0.04 + state.bridge.baseline * 0.02 + 208000 - 140000;
assertEqual(state.lastWhatIf, expectedWhatIf, "what-if forecast (default 4% scope / 2% escalation) matches independent re-derivation");
// The real $208K driver and real contingency drawdown must never move with the sandbox sliders --
// re-derive at a different scope/escalation pair and confirm those two terms are still present unchanged.
const whatIfAtZero = state.computeWhatIf(state.bridge.baseline, 0, 0, 208000, -140000);
assertEqual(whatIfAtZero, state.bridge.baseline + 208000 - 140000, "what-if at 0%/0% still carries the real $208K driver and real drawdown unchanged");

console.log("--- Phase 1: Monte Carlo tri-point slider bounds + clamp function ---");
assertEqual(state.mcBounds.min, 2450000, "Monte Carlo tri-point default optimistic bound");
assertEqual(state.mcBounds.max, 3050000, "Monte Carlo tri-point default pessimistic bound");
assertEqual(state.clampMode(2450000, 2620000, 3050000), 2620000, "clampMode: a mode already inside [min,max] passes through unchanged");
assertEqual(state.clampMode(2450000, 2000000, 3050000), 2450000, "clampMode: a mode below min clamps up to min (never naturally triggered by a well-behaved drag)");
assertEqual(state.clampMode(2450000, 3200000, 3050000), 3050000, "clampMode: a mode above max clamps down to max (never naturally triggered by a well-behaved drag)");

console.log("--- Phase 2: Operating Framework Gate 4 (independent re-derivation) ---");
// Independent re-derivation of the exact gate math: reserve 200,000 - drawn 140,000 = 60,000
// remaining; 60,000 / totalRiskEV must be < 1.00, i.e. genuinely BLOCKED, not a static "pending" bar.
const expectedRemaining = 200000 - 140000;
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
// 1 stale action -- and DQ health OK (9-day lag < 14-day threshold) -- triage must surface exactly
// 3 items, not 4, and DQ must NOT be one of them.
assertEqual(state.triageItems.length, 3, "triage surfaces exactly 3 items with this build's real default state");
const triageTabs = state.triageItems.map((t) => t.tab).sort().join(",");
assertStrEqual(triageTabs, "actions,contingency,framework", "triage items are exactly contingency+framework+actions -- governance (DQ) correctly absent since DQ is OK by default");
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

console.log("");
if (failures > 0) {
  console.error(failures + " assertion(s) FAILED");
  process.exit(1);
} else {
  console.log("All assertions passed.");
  process.exit(0);
}
