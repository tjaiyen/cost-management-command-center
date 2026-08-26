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
        governance:"Vendor & Governance", portfolio:"Portfolio", framework:"Operating Framework",
        actions:"Actions", triage:"Attention & Triage", data:"Data Strategy", reference:"Reference" };
      lastTabButtonStubs = ["overview","exec","cost","contingency","governance","portfolio","framework","actions","triage","data","reference"].map((name) => {
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
  documentElement: { setAttribute(){}, getAttribute(){ return null; } },
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

console.log("--- Live tab-rail status pill (Gate 4) reflects the real computed gate state ---");
const gate4Pill = elementsById["cntGate4"];
if (!gate4Pill) {
  failures++; console.error("FAIL: #cntGate4 was never registered by the page script");
} else {
  // Pre-registered expectation: this build's real default numbers already put Gate 4 BLOCKED
  // (0.47x coverage, established earlier this session) -- so the pill should be visible now.
  assertStrEqual(gate4Pill.hidden, false, "Gate 4 is blocked on this build's real default state, so the tab-rail pill is visible");
  assertStrEqual(gate4Pill.textContent, "Gate 4 blocked", "the pill's real text says 'Gate 4 blocked', not a placeholder");
  assertStrEqual(gate4Pill.classList.contains("warn"), true, "the pill carries the warn styling class while blocked");
}

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
assertEqual(state.GUARDS.length, 8, "exactly 8 live integrity checks are registered");
assertEqual(state.guardsResult.length, 8, "renderGuards() actually ran all 8 checks at page load, not a subset");
const guardsFailures = state.guardsResult.filter((r) => !r.pass);
if (guardsFailures.length === 0) {
  console.log("pass: all 8 live integrity checks pass on this build's real default state (pre-registered expectation, not assumed)");
} else {
  failures++;
  console.error("FAIL:", guardsFailures.length, "of 8 live integrity checks are failing:", JSON.stringify(guardsFailures));
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

console.log("--- KPI Catalog: exactly 20 rows, every 'real' badge carries a real citation, every tab is real ---");
assertEqual(state.kpiCatalog.length, 20, "KPI catalog has exactly 20 rows, not 19 or 21");
const KNOWN_TABS = ["overview","exec","cost","contingency","governance","portfolio","framework","actions","triage","data","reference"];
let realBadgeNoCitation = 0, unknownTab = 0;
state.kpiCatalog.forEach((k) => {
  if (k.badge === "real" && (!k.cite || k.cite === "—")) realBadgeNoCitation++;
  if (KNOWN_TABS.indexOf(k.tab) === -1) unknownTab++;
});
assertEqual(realBadgeNoCitation, 0, "every 'real'-badged KPI row carries an actual citation, not a bare claim");
assertEqual(unknownTab, 0, "every KPI row's jump target is one of the 11 real tabs, not a typo'd data-tab value");
const kpiNames = state.kpiCatalog.map((k) => k.kpi);
assertEqual(new Set(kpiNames).size, kpiNames.length, "no duplicate KPI names in the catalog");

console.log("");
if (failures > 0) {
  console.error(failures + " assertion(s) FAILED");
  process.exit(1);
} else {
  console.log("All assertions passed.");
  process.exit(0);
}
