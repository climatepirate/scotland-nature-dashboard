from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "Data"

DEPENDENCY_INPUT = DATA_DIR / "company_ecosystem_service_long.csv"
PRESSURE_INPUT = DATA_DIR / "company_ecosystem_service_long_pressures.csv"
DASHBOARD_MASTER_INPUT = DATA_DIR / "dashboard_master.csv"

DEPENDENCY_BACKFILL_LOG = DATA_DIR / "stage2_dependency_backfill_log.csv"
PRESSURE_BACKFILL_LOG = DATA_DIR / "stage2_pressure_backfill_log.csv"
DEPENDENCY_UNMATCHED_LOG = DATA_DIR / "stage2_dependency_unmatched_company_ids.csv"
PRESSURE_UNMATCHED_LOG = DATA_DIR / "stage2_pressure_unmatched_company_ids.csv"
SUMMARY_LOG = DATA_DIR / "stage2_normalization_summary.json"


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

    # Normalize numeric-style ids (e.g., "123.0" -> "123")
    text = re.sub(r"^([0-9]+)\.0+$", r"\1", text)
    return text


def normalize_rating(value: object) -> str:
    if pd.isna(value):
        return ""
    text = str(value).strip().upper()
    if text in RATING_MAP:
        return text
    return ""


def to_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def ensure_columns(df: pd.DataFrame, required: list[str], label: str) -> list[str]:
    missing = [col for col in required if col not in df.columns]
    if missing:
        return [f"{label}: missing required columns {missing}"]
    return []


def collapse_duplicates_notebook_style(
    df: pd.DataFrame,
    company_col: str,
    factor_col: str,
    value_col: str,
) -> pd.DataFrame:
    # Notebook methodology: sort descending by analysis value and keep first record per pair.
    ordered = df.sort_values([company_col, value_col], ascending=[True, False], na_position="last")
    return ordered.drop_duplicates(subset=[company_col, factor_col], keep="first")


def normalize_dependency(
    dependency_df: pd.DataFrame,
    dashboard_company_ids: set[str],
) -> tuple[pd.DataFrame, dict[str, int], list[str]]:
    failures: list[str] = []

    required = ["company_id", "Ecosystem Service", "Dependency_score_numeric", "Rating"]
    failures.extend(ensure_columns(dependency_df, required, "dependency"))
    if failures:
        return pd.DataFrame(), {}, failures

    working = dependency_df.copy()
    input_rows = len(working)

    working["company_id_norm"] = working["company_id"].apply(normalize_company_id)
    working["service_norm"] = working["Ecosystem Service"].astype(str).str.strip()
    working["dependency_score_numeric_norm"] = to_numeric(working["Dependency_score_numeric"])
    working["rating_norm"] = working["Rating"].apply(normalize_rating)

    matched_mask = working["company_id_norm"].isin(dashboard_company_ids) & working["company_id_norm"].ne("")
    matched = working[matched_mask].copy()
    unmatched = working[~matched_mask].copy()

    unmatched_ids = sorted({x for x in unmatched["company_id_norm"].tolist() if x})
    pd.DataFrame({"company_id": unmatched_ids}).to_csv(DEPENDENCY_UNMATCHED_LOG, index=False)

    numeric_present = matched["dependency_score_numeric_norm"].notna()
    rating_mapped = matched["rating_norm"].isin(RATING_MAP)
    backfill_mask = (~numeric_present) & rating_mapped

    matched["rating_mapped_score"] = matched["rating_norm"].map(RATING_MAP)
    matched["dependency_value_for_analysis_norm"] = matched["dependency_score_numeric_norm"]
    matched.loc[backfill_mask, "dependency_value_for_analysis_norm"] = matched.loc[backfill_mask, "rating_mapped_score"]

    backfill_log_cols = [
        "company_id_norm",
        "service_norm",
        "Rating",
        "rating_norm",
        "rating_mapped_score",
        "Dependency_score_numeric",
        "dependency_score_numeric_norm",
    ]
    matched.loc[backfill_mask, backfill_log_cols].rename(
        columns={
            "company_id_norm": "company_id",
            "service_norm": "ecosystem_service",
        }
    ).to_csv(DEPENDENCY_BACKFILL_LOG, index=False)

    before_dup_count = int(matched.duplicated(subset=["company_id_norm", "service_norm"], keep=False).sum())
    collapsed = collapse_duplicates_notebook_style(
        matched,
        "company_id_norm",
        "service_norm",
        "dependency_value_for_analysis_norm",
    )
    after_dup_count = int(collapsed.duplicated(subset=["company_id_norm", "service_norm"], keep=False).sum())

    if after_dup_count != 0:
        failures.append("dependency: duplicates remained after notebook-style collapse")

    metrics = {
        "input_rows": int(input_rows),
        "matched_company_ids": int(matched["company_id_norm"].nunique()),
        "unmatched_company_ids": int(len(unmatched_ids)),
        "numeric_rows_retained": int(numeric_present.sum()),
        "rating_only_rows_backfilled": int(backfill_mask.sum()),
        "duplicate_rows_before_aggregation": int(before_dup_count),
        "duplicate_rows_after_aggregation": int(after_dup_count),
        "final_normalized_rows": int(len(collapsed)),
    }

    normalized = collapsed[
        [
            "company_id_norm",
            "service_norm",
            "dependency_score_numeric_norm",
            "rating_norm",
            "rating_mapped_score",
            "dependency_value_for_analysis_norm",
        ]
    ].rename(
        columns={
            "company_id_norm": "company_id",
            "service_norm": "ecosystem_service",
            "dependency_score_numeric_norm": "dependency_score_numeric",
            "dependency_value_for_analysis_norm": "dependency_value_for_analysis",
        }
    )

    return normalized, metrics, failures


def normalize_pressure(
    pressure_df: pd.DataFrame,
    dashboard_company_ids: set[str],
) -> tuple[pd.DataFrame, dict[str, int], list[str]]:
    failures: list[str] = []

    pressure_name_col = "Pressure" if "Pressure" in pressure_df.columns else "Ecosystem Service"
    required = ["company_id", pressure_name_col, "Pressure_score_numeric", "Rating"]
    failures.extend(ensure_columns(pressure_df, required, "pressure"))
    if failures:
        return pd.DataFrame(), {}, failures

    working = pressure_df.copy()
    input_rows = len(working)

    working["company_id_norm"] = working["company_id"].apply(normalize_company_id)
    working["pressure_norm"] = working[pressure_name_col].astype(str).str.strip()
    working["pressure_score_numeric_norm"] = to_numeric(working["Pressure_score_numeric"])
    working["rating_norm"] = working["Rating"].apply(normalize_rating)

    matched_mask = working["company_id_norm"].isin(dashboard_company_ids) & working["company_id_norm"].ne("")
    matched = working[matched_mask].copy()
    unmatched = working[~matched_mask].copy()

    unmatched_ids = sorted({x for x in unmatched["company_id_norm"].tolist() if x})
    pd.DataFrame({"company_id": unmatched_ids}).to_csv(PRESSURE_UNMATCHED_LOG, index=False)

    numeric_present = matched["pressure_score_numeric_norm"].notna()
    rating_mapped = matched["rating_norm"].isin(RATING_MAP)
    backfill_mask = (~numeric_present) & rating_mapped

    matched["rating_mapped_score"] = matched["rating_norm"].map(RATING_MAP)
    matched["pressure_value_for_analysis_norm"] = matched["pressure_score_numeric_norm"]
    matched.loc[backfill_mask, "pressure_value_for_analysis_norm"] = matched.loc[backfill_mask, "rating_mapped_score"]

    backfill_log_cols = [
        "company_id_norm",
        "pressure_norm",
        "Rating",
        "rating_norm",
        "rating_mapped_score",
        "Pressure_score_numeric",
        "pressure_score_numeric_norm",
    ]
    matched.loc[backfill_mask, backfill_log_cols].rename(
        columns={
            "company_id_norm": "company_id",
            "pressure_norm": "pressure",
        }
    ).to_csv(PRESSURE_BACKFILL_LOG, index=False)

    before_dup_count = int(matched.duplicated(subset=["company_id_norm", "pressure_norm"], keep=False).sum())
    collapsed = collapse_duplicates_notebook_style(
        matched,
        "company_id_norm",
        "pressure_norm",
        "pressure_value_for_analysis_norm",
    )
    after_dup_count = int(collapsed.duplicated(subset=["company_id_norm", "pressure_norm"], keep=False).sum())

    if after_dup_count != 0:
        failures.append("pressure: duplicates remained after notebook-style collapse")

    metrics = {
        "input_rows": int(input_rows),
        "matched_company_ids": int(matched["company_id_norm"].nunique()),
        "unmatched_company_ids": int(len(unmatched_ids)),
        "numeric_rows_retained": int(numeric_present.sum()),
        "rating_only_rows_backfilled": int(backfill_mask.sum()),
        "duplicate_rows_before_aggregation": int(before_dup_count),
        "duplicate_rows_after_aggregation": int(after_dup_count),
        "final_normalized_rows": int(len(collapsed)),
    }

    normalized = collapsed[
        [
            "company_id_norm",
            "pressure_norm",
            "pressure_score_numeric_norm",
            "rating_norm",
            "rating_mapped_score",
            "pressure_value_for_analysis_norm",
        ]
    ].rename(
        columns={
            "company_id_norm": "company_id",
            "pressure_norm": "pressure",
            "pressure_score_numeric_norm": "pressure_score_numeric",
            "pressure_value_for_analysis_norm": "pressure_value_for_analysis",
        }
    )

    return normalized, metrics, failures


def main() -> int:
    failures: list[str] = []

    dashboard_master = pd.read_csv(DASHBOARD_MASTER_INPUT, dtype={"company_id": "string"})
    dep_input = pd.read_csv(DEPENDENCY_INPUT)
    pressure_input = pd.read_csv(PRESSURE_INPUT)

    dashboard_master["company_id_norm"] = dashboard_master["company_id"].apply(normalize_company_id)
    dashboard_company_ids = set(dashboard_master["company_id_norm"].dropna().astype(str).tolist())
    dashboard_company_ids.discard("")

    dep_norm, dep_metrics, dep_failures = normalize_dependency(dep_input, dashboard_company_ids)
    pressure_norm, pressure_metrics, pressure_failures = normalize_pressure(pressure_input, dashboard_company_ids)

    failures.extend(dep_failures)
    failures.extend(pressure_failures)

    if dep_norm.empty:
        failures.append("dependency: normalization produced zero rows")
    if pressure_norm.empty:
        failures.append("pressure: normalization produced zero rows")

    summary = {
        "rating_mapping": RATING_MAP,
        "dependency": dep_metrics,
        "pressure": pressure_metrics,
        "validation_failures": failures,
    }
    SUMMARY_LOG.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    print("dependency_input_rows=", dep_metrics.get("input_rows", 0))
    print("pressure_input_rows=", pressure_metrics.get("input_rows", 0))

    print("dependency_matched_company_ids=", dep_metrics.get("matched_company_ids", 0))
    print("dependency_unmatched_company_ids=", dep_metrics.get("unmatched_company_ids", 0))
    print("pressure_matched_company_ids=", pressure_metrics.get("matched_company_ids", 0))
    print("pressure_unmatched_company_ids=", pressure_metrics.get("unmatched_company_ids", 0))

    print("dependency_numeric_rows_retained=", dep_metrics.get("numeric_rows_retained", 0))
    print("dependency_rating_only_rows_backfilled=", dep_metrics.get("rating_only_rows_backfilled", 0))
    print("pressure_numeric_rows_retained=", pressure_metrics.get("numeric_rows_retained", 0))
    print("pressure_rating_only_rows_backfilled=", pressure_metrics.get("rating_only_rows_backfilled", 0))

    print("dependency_duplicates_before=", dep_metrics.get("duplicate_rows_before_aggregation", 0))
    print("dependency_duplicates_after=", dep_metrics.get("duplicate_rows_after_aggregation", 0))
    print("pressure_duplicates_before=", pressure_metrics.get("duplicate_rows_before_aggregation", 0))
    print("pressure_duplicates_after=", pressure_metrics.get("duplicate_rows_after_aggregation", 0))

    print("dependency_final_normalized_rows=", dep_metrics.get("final_normalized_rows", 0))
    print("pressure_final_normalized_rows=", pressure_metrics.get("final_normalized_rows", 0))

    if failures:
        print("validation_failures=")
        for failure in failures:
            print("-", failure)
        return 1

    print("validation_failures=none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
