from __future__ import annotations

import json
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "Data"
CLEAN_GIS_DIR = ROOT / "CLEAN GIS"

DASHBOARD_MASTER_CSV = DATA_DIR / "dashboard_master.csv"
DEPENDENCY_INPUT_CSV = DATA_DIR / "company_ecosystem_service_long.csv"
PRESSURE_INPUT_CSV = DATA_DIR / "company_ecosystem_service_long_pressures.csv"

BASE_HEX_GPKG = CLEAN_GIS_DIR / "scot hex.gpkg"
OUTPUT_GPKG = CLEAN_GIS_DIR / "dashboard_hex_master_complete.gpkg"
OUTPUT_SUMMARY_JSON = DATA_DIR / "stage3_hex_runtime_summary.json"

BASE_HEX_LAYER = "grid"
OUTPUT_LAYER_PRIMARY = "dashboard_hex_master"
OUTPUT_LAYER_COMPAT = "dashboard_hex_master_complete__dashboard_hex_master"

RATING_MAP = {
    "VL": 2.0,
    "L": 3.0,
    "M": 4.0,
    "H": 5.0,
    "VH": 6.0,
}


def normalize_company_id(value: object) -> str:
    if pd.isna(value):
        return ""
    text = str(value).strip()
    if text.lower() in {"", "nan", "none", "null"}:
        return ""
    return re.sub(r"^([0-9]+)\.0+$", r"\1", text)


def normalize_rating(value: object) -> str:
    if pd.isna(value):
        return ""
    text = str(value).strip().upper()
    return text if text in RATING_MAP else ""


def slugify_field_name(value: object) -> str:
    text = str(value).strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return re.sub(r"_+", "_", text).strip("_")


def normalize_dependency_facts(dep_df: pd.DataFrame, valid_company_ids: set[str]) -> pd.DataFrame:
    working = dep_df.copy()
    working["company_id"] = working["company_id"].apply(normalize_company_id)
    working = working[(working["company_id"] != "") & (working["company_id"].isin(valid_company_ids))].copy()

    working["ecosystem_service"] = working["Ecosystem Service"].astype(str).str.strip()
    working["dependency_score_numeric"] = pd.to_numeric(working["Dependency_score_numeric"], errors="coerce")
    working["rating_norm"] = working["Rating"].apply(normalize_rating)
    working["rating_mapped_score"] = working["rating_norm"].map(RATING_MAP)

    working["dependency_value_for_analysis"] = working["dependency_score_numeric"]
    backfill_mask = working["dependency_value_for_analysis"].isna() & working["rating_mapped_score"].notna()
    working.loc[backfill_mask, "dependency_value_for_analysis"] = working.loc[backfill_mask, "rating_mapped_score"]

    ordered = working.sort_values(
        ["company_id", "ecosystem_service", "dependency_value_for_analysis"],
        ascending=[True, True, False],
        na_position="last",
    )
    collapsed = ordered.drop_duplicates(subset=["company_id", "ecosystem_service"], keep="first")
    return collapsed[["company_id", "ecosystem_service", "dependency_value_for_analysis"]]


def normalize_pressure_facts(press_df: pd.DataFrame, valid_company_ids: set[str]) -> pd.DataFrame:
    working = press_df.copy()
    working["company_id"] = working["company_id"].apply(normalize_company_id)
    working = working[(working["company_id"] != "") & (working["company_id"].isin(valid_company_ids))].copy()

    pressure_name_col = "Pressure" if "Pressure" in working.columns else "Ecosystem Service"
    working["pressure"] = working[pressure_name_col].astype(str).str.strip()
    working["pressure_score_numeric"] = pd.to_numeric(working["Pressure_score_numeric"], errors="coerce")
    working["rating_norm"] = working["Rating"].apply(normalize_rating)
    working["rating_mapped_score"] = working["rating_norm"].map(RATING_MAP)

    working["pressure_value_for_analysis"] = working["pressure_score_numeric"]
    backfill_mask = working["pressure_value_for_analysis"].isna() & working["rating_mapped_score"].notna()
    working.loc[backfill_mask, "pressure_value_for_analysis"] = working.loc[backfill_mask, "rating_mapped_score"]

    ordered = working.sort_values(
        ["company_id", "pressure", "pressure_value_for_analysis"],
        ascending=[True, True, False],
        na_position="last",
    )
    collapsed = ordered.drop_duplicates(subset=["company_id", "pressure"], keep="first")
    return collapsed[["company_id", "pressure", "pressure_value_for_analysis"]]


def build_membership_flags(valid_master: pd.DataFrame, hex_index: pd.Index) -> tuple[pd.DataFrame, list[str], list[str]]:
    local_authorities = sorted(valid_master["local_authority_code"].unique().tolist())
    coarse_categories = sorted(valid_master["coarse_category"].unique().tolist())

    la_flags = pd.crosstab(valid_master["hex_id"], valid_master["local_authority_code"]).reindex(
        index=hex_index, columns=local_authorities, fill_value=0
    )
    cat_flags = pd.crosstab(valid_master["hex_id"], valid_master["coarse_category"]).reindex(
        index=hex_index, columns=coarse_categories, fill_value=0
    )

    la_field_map = {code: f"la_{code.lower()}" for code in local_authorities}
    cat_field_map = {category: f"cat_{slugify_field_name(category)}" for category in coarse_categories}

    la_flags = la_flags.rename(columns=la_field_map).astype(int)
    cat_flags = cat_flags.rename(columns=cat_field_map).astype(int)

    membership_flags = pd.concat([la_flags, cat_flags], axis=1)
    return membership_flags, list(la_field_map.values()), list(cat_field_map.values())


def main() -> int:
    failures: list[str] = []

    dashboard_master = pd.read_csv(DASHBOARD_MASTER_CSV, dtype={"company_id": "string", "hex_id": "string"})
    dashboard_master["company_id"] = dashboard_master["company_id"].apply(normalize_company_id)
    dashboard_master["hex_id"] = dashboard_master["hex_id"].fillna("").astype(str).str.strip()
    dashboard_master["local_authority_code"] = dashboard_master["local_authority_code"].fillna("").astype(str).str.strip()
    dashboard_master["coarse_category"] = dashboard_master["coarse_category"].fillna("").astype(str).str.strip()

    valid_master = dashboard_master[(dashboard_master["company_id"] != "") & (dashboard_master["hex_id"] != "")].copy()
    valid_company_ids = set(valid_master["company_id"].tolist())

    dep_input = pd.read_csv(DEPENDENCY_INPUT_CSV)
    pressure_input = pd.read_csv(PRESSURE_INPUT_CSV)

    dep_norm = normalize_dependency_facts(dep_input, valid_company_ids)
    pressure_norm = normalize_pressure_facts(pressure_input, valid_company_ids)

    dep_company_totals = (
        dep_norm.groupby("company_id", as_index=False)["dependency_value_for_analysis"]
        .sum(min_count=1)
        .rename(columns={"dependency_value_for_analysis": "company_dependency_total"})
    )
    pressure_company_totals = (
        pressure_norm.groupby("company_id", as_index=False)["pressure_value_for_analysis"]
        .sum(min_count=1)
        .rename(columns={"pressure_value_for_analysis": "company_pressure_total"})
    )

    company_hex = valid_master[["company_id", "hex_id"]].drop_duplicates(subset=["company_id"])

    company_metrics = company_hex.merge(dep_company_totals, on="company_id", how="left").merge(
        pressure_company_totals, on="company_id", how="left"
    )

    company_metrics["company_dependency_total"] = company_metrics["company_dependency_total"].fillna(0.0)
    company_metrics["company_pressure_total"] = company_metrics["company_pressure_total"].fillna(0.0)

    hex_agg = (
        company_metrics.groupby("hex_id", as_index=False)
        .agg(
            company_count=("company_id", "count"),
            total_dependency_score=("company_dependency_total", "sum"),
            total_pressure_score=("company_pressure_total", "sum"),
        )
    )

    # Compatibility aliases retained while publishing the contract fields.
    hex_agg["total_dep_score"] = hex_agg["total_dependency_score"]
    hex_agg["total_press_score"] = hex_agg["total_pressure_score"]

    base_hex = gpd.read_file(BASE_HEX_GPKG, layer=BASE_HEX_LAYER)
    if "hex_id" not in base_hex.columns:
        failures.append("base hex geometry missing required hex_id column")

    base_hex["hex_id"] = base_hex["hex_id"].fillna("").astype(str).str.strip()
    runtime = base_hex.merge(hex_agg, on="hex_id", how="left")

    membership_flags, local_authority_fields, coarse_category_fields = build_membership_flags(
        valid_master, runtime["hex_id"]
    )
    runtime = runtime.merge(membership_flags, left_on="hex_id", right_index=True, how="left")

    runtime["company_count"] = runtime["company_count"].fillna(0).astype(int)
    for col in ["total_dependency_score", "total_pressure_score", "total_dep_score", "total_press_score"]:
        runtime[col] = runtime[col].fillna(0.0)
    for col in local_authority_fields + coarse_category_fields:
        runtime[col] = runtime[col].fillna(0).astype(int)

    runtime_index = runtime.set_index("hex_id").index
    expected_la_flags = pd.crosstab(valid_master["hex_id"], valid_master["local_authority_code"]).reindex(
        index=runtime_index, columns=sorted(valid_master["local_authority_code"].unique().tolist()), fill_value=0
    )
    expected_cat_flags = pd.crosstab(valid_master["hex_id"], valid_master["coarse_category"]).reindex(
        index=runtime_index, columns=sorted(valid_master["coarse_category"].unique().tolist()), fill_value=0
    )
    expected_la_flags.columns = local_authority_fields
    expected_cat_flags.columns = coarse_category_fields

    runtime_la_flags = runtime.set_index("hex_id")[local_authority_fields]
    runtime_cat_flags = runtime.set_index("hex_id")[coarse_category_fields]
    la_flags_match = runtime_la_flags.equals(expected_la_flags)
    category_flags_match = runtime_cat_flags.equals(expected_cat_flags)

    if not la_flags_match:
        failures.append("Local Authority membership flags do not match the company master derivation")
    if not category_flags_match:
        failures.append("Coarse Category membership flags do not match the company master derivation")

    one_row_per_hex_preserved = bool(len(runtime) == len(base_hex) and runtime["hex_id"].nunique() == len(runtime))
    if not one_row_per_hex_preserved:
        failures.append("runtime layer does not preserve one row per hex")

    # Write authoritative runtime layer.
    if OUTPUT_GPKG.exists():
        OUTPUT_GPKG.unlink()

    runtime.to_file(OUTPUT_GPKG, layer=OUTPUT_LAYER_PRIMARY, driver="GPKG")
    runtime.to_file(OUTPUT_GPKG, layer=OUTPUT_LAYER_COMPAT, driver="GPKG", mode="a")

    n_hexes = int(len(runtime))
    n_populated_hexes = int((runtime["company_count"] > 0).sum())
    total_company_count_represented = int(runtime["company_count"].sum())

    stage2_dependency_total = float(dep_norm["dependency_value_for_analysis"].sum(skipna=True))
    stage2_pressure_total = float(pressure_norm["pressure_value_for_analysis"].sum(skipna=True))

    hex_dependency_total = float(runtime["total_dependency_score"].sum())
    hex_pressure_total = float(runtime["total_pressure_score"].sum())

    dependency_totals_match = abs(stage2_dependency_total - hex_dependency_total) < 1e-6
    pressure_totals_match = abs(stage2_pressure_total - hex_pressure_total) < 1e-6

    if not dependency_totals_match:
        failures.append("national dependency total mismatch between Stage 2 normalized facts and hex aggregate")
    if not pressure_totals_match:
        failures.append("national pressure total mismatch between Stage 2 normalized facts and hex aggregate")

    summary = {
        "output_file": str(OUTPUT_GPKG),
        "hexes": n_hexes,
        "populated_hexes": n_populated_hexes,
        "total_company_count_represented": total_company_count_represented,
        "new_local_authority_fields": len(local_authority_fields),
        "new_coarse_category_fields": len(coarse_category_fields),
        "stage2_dependency_total": stage2_dependency_total,
        "stage2_pressure_total": stage2_pressure_total,
        "hex_dependency_total": hex_dependency_total,
        "hex_pressure_total": hex_pressure_total,
        "dependency_totals_match": dependency_totals_match,
        "pressure_totals_match": pressure_totals_match,
        "la_flags_match": la_flags_match,
        "category_flags_match": category_flags_match,
        "one_row_per_hex_preserved": one_row_per_hex_preserved,
        "validation_failures": failures,
    }
    OUTPUT_SUMMARY_JSON.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    print("hexes=", n_hexes)
    print("populated_hexes=", n_populated_hexes)
    print("total_company_count_represented=", total_company_count_represented)
    print("new_local_authority_fields=", len(local_authority_fields))
    print("new_coarse_category_fields=", len(coarse_category_fields))
    print("dependency_totals_match=", dependency_totals_match)
    print("pressure_totals_match=", pressure_totals_match)
    print("la_flags_match=", la_flags_match)
    print("category_flags_match=", category_flags_match)
    print("one_row_per_hex_preserved=", one_row_per_hex_preserved)

    if failures:
        print("validation_failures=")
        for failure in failures:
            print("-", failure)
        return 1

    print("validation_failures=none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
