#!/usr/bin/env python3
"""Indian-finance-expert lookup script.

Stdlib-only (csv, argparse, json, pathlib). No third-party deps.

Usage examples:
    python search.py --section 80CCD(1B)
    python search.py --slabs --fy 2025 --regime new
    python search.py --rebate --fy 2025 --regime new
    python search.py --capital-gains --asset listed_equity
    python search.py --instrument PPF
    python search.py --itr ITR-2
    python search.py --dates --filter advance_tax
    python search.py --sanity 25L
    python search.py --list           # list all CSVs and their columns

Returns JSON to stdout. Caller (Claude or human) parses or prints.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def load_csv(name: str) -> list[dict[str, str]]:
    path = DATA_DIR / f"{name}.csv"
    if not path.exists():
        sys.stderr.write(f"missing: {path}\n")
        return []
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def emit(rows: list[dict[str, object]] | dict[str, object]) -> None:
    print(json.dumps(rows, indent=2, ensure_ascii=False))


def cmd_section(query: str) -> None:
    rows = load_csv("sections")
    q = query.strip().lower()
    matches = [
        r
        for r in rows
        if q in r["section"].lower() or q in r["name"].lower() or q in r["description"].lower()
    ]
    emit(matches if matches else {"error": f"no section match for {query!r}"})


def cmd_slabs(fy: int, regime: str) -> None:
    rows = load_csv("slabs")
    matches = [r for r in rows if r["fy_start"] == str(fy) and r["regime"] == regime]
    emit(matches if matches else {"error": f"no slabs for FY {fy} {regime} regime"})


def cmd_rebate(fy: int, regime: str) -> None:
    rows = load_csv("rebate_87a")
    matches = [r for r in rows if r["fy_start"] == str(fy) and r["regime"] == regime]
    emit(matches if matches else {"error": f"no 87A rebate for FY {fy} {regime}"})


def cmd_surcharge(fy: int, regime: str) -> None:
    rows = load_csv("surcharge")
    matches = [r for r in rows if r["fy_start"] == str(fy) and r["regime"] == regime]
    emit(matches if matches else {"error": f"no surcharge for FY {fy} {regime}"})


def cmd_capital_gains(asset: str | None) -> None:
    rows = load_csv("capital_gains")
    if asset:
        q = asset.strip().lower()
        rows = [r for r in rows if q in r["asset_class"].lower()]
    emit(rows if rows else {"error": f"no capital gains rule for asset {asset!r}"})


def cmd_instrument(name: str) -> None:
    rows = load_csv("instruments")
    q = name.strip().upper()
    matches = [
        r
        for r in rows
        if q == r["instrument"].upper() or q in r["full_name"].upper()
    ]
    emit(matches if matches else {"error": f"no instrument match for {name!r}"})


def cmd_itr(form: str | None) -> None:
    rows = load_csv("itr_forms")
    if form:
        q = form.strip().upper()
        rows = [r for r in rows if q in r["form"].upper()]
    emit(rows if rows else {"error": f"no ITR form match for {form!r}"})


def cmd_dates(filter_term: str | None) -> None:
    rows = load_csv("dates")
    if filter_term:
        q = filter_term.strip().lower()
        rows = [r for r in rows if q in r["event"].lower() or q in r["notes"].lower()]
    emit(rows if rows else {"error": f"no date entry for {filter_term!r}"})


def cmd_sanity(scenario: str | None) -> None:
    rows = load_csv("sanity_numbers")
    if scenario:
        q = scenario.strip().lower().replace(",", "").replace("rs", "").replace("inr", "")
        rows = [r for r in rows if q in r["scenario"].lower()]
    emit(rows if rows else {"error": f"no sanity number for {scenario!r}"})


def cmd_list() -> None:
    catalog = []
    for path in sorted(DATA_DIR.glob("*.csv")):
        with path.open(encoding="utf-8") as f:
            reader = csv.reader(f)
            cols = next(reader, [])
            row_count = sum(1 for _ in reader)
        catalog.append({"file": path.name, "columns": cols, "rows": row_count})
    emit(catalog)


def main() -> int:
    parser = argparse.ArgumentParser(description="Indian finance knowledge lookup.")
    parser.add_argument("--section", help="Search sections by section number, name, or description.")
    parser.add_argument("--slabs", action="store_true", help="Get tax slabs for --fy + --regime.")
    parser.add_argument("--rebate", action="store_true", help="Get 87A rebate for --fy + --regime.")
    parser.add_argument("--surcharge", action="store_true", help="Get surcharge for --fy + --regime.")
    parser.add_argument("--capital-gains", action="store_true", help="Capital gains rules. Optional --asset filter.")
    parser.add_argument("--instrument", help="Look up an instrument by short name (PPF/EPF/NPS_Tier1/SSY/SCSS/NSC/Tax_FD/ELSS).")
    parser.add_argument("--itr", help="Look up an ITR form (ITR-1..ITR-7). Empty = list all.", nargs="?", const="")
    parser.add_argument("--dates", action="store_true", help="Important dates. Optional --filter to narrow.")
    parser.add_argument("--sanity", help="Sanity-check totals for a scenario string (e.g. '25L', 'salaried_50L').", nargs="?", const="")
    parser.add_argument("--list", action="store_true", help="List all CSV files and their columns.")
    parser.add_argument("--fy", type=int, default=2025, help="Fiscal year start (default 2025 = FY 2025-26).")
    parser.add_argument("--regime", choices=["new", "old"], default="new")
    parser.add_argument("--asset", help="Capital-gains asset class filter.")
    parser.add_argument("--filter", dest="filter_", help="Generic filter term for --dates.")

    args = parser.parse_args()

    if args.list:
        cmd_list()
    elif args.section:
        cmd_section(args.section)
    elif args.slabs:
        cmd_slabs(args.fy, args.regime)
    elif args.rebate:
        cmd_rebate(args.fy, args.regime)
    elif args.surcharge:
        cmd_surcharge(args.fy, args.regime)
    elif args.capital_gains:
        cmd_capital_gains(args.asset)
    elif args.instrument:
        cmd_instrument(args.instrument)
    elif args.itr is not None:
        cmd_itr(args.itr or None)
    elif args.dates:
        cmd_dates(args.filter_)
    elif args.sanity is not None:
        cmd_sanity(args.sanity or None)
    else:
        parser.print_help()
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
