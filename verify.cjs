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

// ---- minimal DOM stub ----
function makeElementStub() {
  const el = {
    _text: "", _html: "",
    style: {},
    classList: { add(){}, remove(){}, contains(){ return false; } },
    dataset: {},
    children: [],
    addEventListener(){},
    setAttribute(){},
    getAttribute(){ return null; },
    appendChild(child){ el.children.push(child); },
    querySelectorAll(){ return []; },
  };
  Object.defineProperty(el, "textContent", { get(){ return el._text; }, set(v){ el._text = String(v); } });
  Object.defineProperty(el, "innerHTML", { get(){ return el._html; }, set(v){ el._html = String(v); } });
  Object.defineProperty(el, "className", { get(){ return el._class || ""; }, set(v){ el._class = v; } });
  return el;
}

const elementsById = {};
function getOrCreate(id) {
  if (!elementsById[id]) elementsById[id] = makeElementStub();
  return elementsById[id];
}

const documentStub = {
  getElementById: (id) => getOrCreate(id),
  querySelectorAll: (sel) => {
    if (sel === ".tabbtn") {
      // return 7 fake tab buttons with the real dataset.tab values the page defines
      return ["overview","cost","contingency","governance","portfolio","data","reference"].map((name) => {
        const b = makeElementStub();
        b.dataset = { tab: name };
        return b;
      });
    }
    if (sel === ".tabpanel") return [];
    return [];
  },
  documentElement: { setAttribute(){}, getAttribute(){ return null; } },
  addEventListener(){}, // the page's top-level explainer-toggle delegation registers this; never fires here
  createElement: () => makeElementStub(),
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

console.log("");
if (failures > 0) {
  console.error(failures + " assertion(s) FAILED");
  process.exit(1);
} else {
  console.log("All assertions passed.");
  process.exit(0);
}
