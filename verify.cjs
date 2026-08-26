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

console.log("");
if (failures > 0) {
  console.error(failures + " assertion(s) FAILED");
  process.exit(1);
} else {
  console.log("All assertions passed.");
  process.exit(0);
}
