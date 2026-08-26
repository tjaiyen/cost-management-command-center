#!/usr/bin/env python3
"""
run_pipeline.py -- a free, local, DuckDB-based second proof layer for this dashboard's own math.

Reads the same raw numbers index.html hardcodes in its bridgeSteps/wbsData arrays (kept in
lockstep by hand -- this proves the SQL aggregation/formula layer produces the same total as the
browser's own JS, not an independently-entered dataset, same scoping note the reference build's
own pipeline README carries), computes the budget-bridge final forecast and the control-account
BAC split via SQL instead of JavaScript, and asserts parity against index.html's real numbers.

Requires: pip install duckdb (a dedicated venv is recommended, e.g. `python3 -m venv .venv &&
.venv/bin/pip install duckdb`) -- no other dependency, no paid API, no network call.

Usage: python3 pipeline/run_pipeline.py
"""
import csv
import os
import sys

import duckdb

HERE = os.path.dirname(os.path.abspath(__file__))


def load_csv(name):
    path = os.path.join(HERE, name)
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def main():
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE bridge_steps (label VARCHAR, value BIGINT, type VARCHAR)")
    for row in load_csv("seed_bridge_steps.csv"):
        con.execute(
            "INSERT INTO bridge_steps VALUES (?, ?, ?)",
            [row["label"], int(row["value"]), row["type"]],
        )

    con.execute("CREATE TABLE wbs (name VARCHAR, pct BIGINT)")
    for row in load_csv("seed_wbs.csv"):
        con.execute("INSERT INTO wbs VALUES (?, ?)", [row["name"], int(row["pct"])])

    failures = 0

    # Parity check 1: budget-bridge final forecast = SUM(all step values), base + ups - downs.
    final_forecast = con.execute("SELECT SUM(value) FROM bridge_steps").fetchone()[0]
    expected_final = 1750000000 + 106000000 + 33687500 + 208000 - 125000000
    if final_forecast == expected_final:
        print(f"pass: budget-bridge final forecast (SQL) = {final_forecast}, matches index.html's own JS derivation")
    else:
        failures += 1
        print(f"FAIL: budget-bridge final forecast (SQL) = {final_forecast}, expected {expected_final}", file=sys.stderr)

    # Parity check 2: WBS percentages sum to 100 (SQL side, independent of the JS reduce()).
    wbs_sum = con.execute("SELECT SUM(pct) FROM wbs").fetchone()[0]
    if wbs_sum == 100:
        print(f"pass: WBS percentage sum (SQL) = {wbs_sum}")
    else:
        failures += 1
        print(f"FAIL: WBS percentage sum (SQL) = {wbs_sum}, expected 100", file=sys.stderr)

    # Parity check 3: control-account BAC per row = baseline * (pct/100), summing back to baseline
    # -- the same relationship index.html's computeControlAccounts() relies on.
    baseline = 1750000000
    bac_rows = con.execute(
        "SELECT name, ROUND(? * pct / 100.0) AS bac FROM wbs", [baseline]
    ).fetchall()
    bac_sum = sum(row[1] for row in bac_rows)
    if bac_sum == baseline:
        print(f"pass: control-account BAC sum (SQL) = {bac_sum}, reconciles to baseline {baseline}")
    else:
        failures += 1
        print(f"FAIL: control-account BAC sum (SQL) = {bac_sum}, expected {baseline}", file=sys.stderr)

    print()
    if failures:
        print(f"{failures} parity check(s) FAILED", file=sys.stderr)
        sys.exit(1)
    print("All SQL/JS parity checks passed.")
    sys.exit(0)


if __name__ == "__main__":
    main()
