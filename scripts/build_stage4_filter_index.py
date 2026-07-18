from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "Data"

DASHBOARD_MASTER_CSV = DATA_DIR / "dashboard_master.csv"
OUTPUT_FILTER_INDEX_JSON = DATA_DIR / "dashboard_filter_index.json"
OUTPUT_SUMMARY_JSON = DATA_DIR / "stage4_filter_index_summary.json"

ALL_SCOTLAND = "All Scotland"
ALL_CATEGORIES = "All Categories"
EXPECTED_TOTAL = 252512


def normalize_text(value: object) -> str:
    if pd.isna(value):
        return ""
    text = str(value).strip()
    if text.lower() in {"", "nan", "none", "null"}:
        return ""
    return text


def build_bucket(df: pd.DataFrame) -> dict[str, object]:
    return {
        "company_count": int(len(df)),
        "hex_ids": sorted(set(df["hex_id"].tolist())),
        "company_ids": sorted(set(df["company_id"].tolist())),
    }


def main() -> int:
    failures: list[str] = []

    master = pd.read_csv(DASHBOARD_MASTER_CSV, dtype={"company_id": "string", "hex_id": "string"})
    master = master[["company_id", "hex_id", "local_authority_code", "coarse_category"]].copy()

    master["company_id"] = master["company_id"].apply(normalize_text)
    master["hex_id"] = master["hex_id"].apply(normalize_text)
    master["local_authority_code"] = master["local_authority_code"].apply(normalize_text)
    master["coarse_category"] = master["coarse_category"].apply(normalize_text)

    total_rows = len(master)

    if master["company_id"].eq("").any():
        failures.append("missing company_id values in dashboard_master")
    if master["local_authority_code"].eq("").any():
        failures.append("missing local_authority_code values in dashboard_master")
    if master["coarse_category"].eq("").any():
        failures.append("missing coarse_category values in dashboard_master")

    if master["company_id"].duplicated().any():
        dup_count = int(master["company_id"].duplicated(keep=False).sum())
        failures.append(f"duplicate company_id rows detected: {dup_count}")

    local_authorities = sorted(master["local_authority_code"].unique().tolist())
    coarse_categories = sorted(master["coarse_category"].unique().tolist())

    buckets: dict[str, dict[str, object]] = {}

    # All-Scotland / All-Categories bucket
    national_bucket_key = f"{ALL_SCOTLAND}||{ALL_CATEGORIES}"
    buckets[national_bucket_key] = build_bucket(master)

    # All-Scotland / category buckets
    for category in coarse_categories:
        subset = master[master["coarse_category"] == category]
        buckets[f"{ALL_SCOTLAND}||{category}"] = build_bucket(subset)

    # LA / All-Categories buckets
    for la_code in local_authorities:
        subset = master[master["local_authority_code"] == la_code]
        buckets[f"{la_code}||{ALL_CATEGORIES}"] = build_bucket(subset)

    # LA / category combination buckets (including empties)
    empty_combinations: list[str] = []
    combo_count = 0
    for la_code in local_authorities:
        la_subset = master[master["local_authority_code"] == la_code]
        for category in coarse_categories:
            combo_count += 1
            subset = la_subset[la_subset["coarse_category"] == category]
            bucket_key = f"{la_code}||{category}"
            buckets[bucket_key] = build_bucket(subset)
            if len(subset) == 0:
                empty_combinations.append(bucket_key)

    # Validation checks requested by user
    # 1) Every company appears in exactly one Local Authority
    la_counts = master.groupby("company_id")["local_authority_code"].nunique()
    if int((la_counts != 1).sum()) != 0:
        failures.append("not all companies map to exactly one Local Authority")

    # 2) Every company appears in exactly one Coarse Category
    category_counts = master.groupby("company_id")["coarse_category"].nunique()
    if int((category_counts != 1).sum()) != 0:
        failures.append("not all companies map to exactly one Coarse Category")

    # 3) Every company appears in exactly one LA x category combination
    master["combo_key"] = master["local_authority_code"] + "||" + master["coarse_category"]
    combo_counts_per_company = master.groupby("company_id")["combo_key"].nunique()
    if int((combo_counts_per_company != 1).sum()) != 0:
        failures.append("not all companies map to exactly one Local Authority x Coarse Category combination")

    # 4) Sum of company counts across all Local Authorities equals expected total
    la_total_sum = 0
    for la_code in local_authorities:
        la_total_sum += int(buckets[f"{la_code}||{ALL_CATEGORIES}"]["company_count"])
    if la_total_sum != EXPECTED_TOTAL:
        failures.append(f"sum of Local Authority company counts {la_total_sum} != {EXPECTED_TOTAL}")

    # 5) National count equals expected total
    national_count = int(buckets[national_bucket_key]["company_count"])
    if national_count != EXPECTED_TOTAL:
        failures.append(f"All Scotland company count {national_count} != {EXPECTED_TOTAL}")

    # Additional consistency checks
    if total_rows != EXPECTED_TOTAL:
        failures.append(f"dashboard_master row count {total_rows} != {EXPECTED_TOTAL}")

    # Build final filter index JSON
    payload = {
        "all_scotland": ALL_SCOTLAND,
        "all_categories": ALL_CATEGORIES,
        "local_authorities": [{"code": code} for code in local_authorities],
        "coarse_categories": coarse_categories,
        "buckets": buckets,
    }
    OUTPUT_FILTER_INDEX_JSON.write_text(json.dumps(payload, ensure_ascii=True, separators=(",", ":")) + "\n", encoding="utf-8")

    summary = {
        "local_authority_count": len(local_authorities),
        "coarse_category_count": len(coarse_categories),
        "la_x_category_combination_count": combo_count,
        "empty_combinations": empty_combinations,
        "empty_combination_count": len(empty_combinations),
        "expected_total": EXPECTED_TOTAL,
        "dashboard_master_rows": int(total_rows),
        "sum_local_authority_counts": int(la_total_sum),
        "all_scotland_count": int(national_count),
        "validation_failures": failures,
    }
    OUTPUT_SUMMARY_JSON.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    print("local_authority_count=", len(local_authorities))
    print("coarse_category_count=", len(coarse_categories))
    print("la_x_category_combination_count=", combo_count)
    print("empty_combination_count=", len(empty_combinations))

    if failures:
        print("validation_failures=")
        for failure in failures:
            print("-", failure)
        return 1

    print("validation_failures=none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
