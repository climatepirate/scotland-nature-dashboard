from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "Data"
APP_DATA_DIR = ROOT / "dashboard_app" / "Data"

DASHBOARD_MASTER_CSV = DATA_DIR / "dashboard_master.csv"
COMPANY_MASTER_CSV = DATA_DIR / "company_master.csv"
DEPENDENCY_LONG_CSV = DATA_DIR / "company_ecosystem_service_long.csv"
PRESSURE_LONG_CSV = DATA_DIR / "company_ecosystem_service_long_pressures.csv"

DEPENDENCY_INDEX_OUT = DATA_DIR / "dependency_ridgeline_index.json"
PRESSURE_INDEX_OUT = DATA_DIR / "pressure_ridgeline_index.json"
APP_DEPENDENCY_INDEX_OUT = APP_DATA_DIR / "dependency_ridgeline_index.json"
APP_PRESSURE_INDEX_OUT = APP_DATA_DIR / "pressure_ridgeline_index.json"

ALL_SCOTLAND = "All Scotland"
UNCLASSIFIED = "Unclassified"
CATEGORY_ORDER = [
    "Business & Property Services",
    "Consumer & Visitor Economy",
    "Primary & Resource Industries",
    "Public & Community Services",
    "Unclassified",
]

RATING_MAP = {
    "VL": 2.0,
    "L": 3.0,
    "M": 4.0,
    "H": 5.0,
    "VH": 6.0,
}

PRESSURE_LABEL_MAP = {
    "Area of freshwater use": "Freshwater area use",
    "Area of land use": "Land use",
    "Area of seabed use": "Seabed use",
    "Volume of water use": "Water use",
    "Other biotic resource extraction (e.g. fish, timber)": "Biotic resource extraction",
    "Other abiotic resource extraction": "Abiotic resource extraction",
    "Emissions of GHG": "Greenhouse-gas emissions",
    "Emissions of non-GHG air pollutants": "Non-GHG air pollutants",
    "Emissions of nutrient soil and water pollutants": "Nutrient soil and water pollutants",
    "Emissions of toxic soil and water pollutants": "Toxic soil and water pollutants",
    "Generation and release of solid waste": "Solid-waste generation",
    "Introduction of invasive species": "Introduction of invasive species",
    "Disturbances (e.g noise, light)": "Disturbance: noise and light",
}


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def parse_float(value: object) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if text.lower() in {"", "nan", "none", "null"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def normalize_rating(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip().upper()
    return text if text in RATING_MAP else ""


def company_scope_from_dashboard_master() -> tuple[set[str], dict[str, tuple[str, str]]]:
    scoped_company_ids: set[str] = set()
    company_to_scope: dict[str, tuple[str, str]] = {}

    with DASHBOARD_MASTER_CSV.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            company_id = (row.get("company_id") or "").strip()
            local_authority = (row.get("local_authority_code") or "").strip()
            coarse_category = (row.get("coarse_category") or "").strip()
            scorable_flag = (row.get("scorable_flag") or "").strip().lower() == "true"

            if not company_id or not local_authority or not coarse_category:
                continue

            if not scorable_flag:
                continue

            scoped_company_ids.add(company_id)
            company_to_scope[company_id] = (local_authority, coarse_category)

    return scoped_company_ids, company_to_scope


def dependency_value_for_analysis(row: dict[str, str]) -> float | None:
    direct = parse_float(row.get("Dependency_value_for_analysis"))
    if direct is not None:
        return direct

    numeric = parse_float(row.get("Dependency_score_numeric"))
    if numeric is not None:
        return numeric

    rating = normalize_rating(row.get("Dependency_rating_clean") or row.get("Rating"))
    if rating in RATING_MAP:
        return RATING_MAP[rating]

    return None


def pressure_value_for_analysis(row: dict[str, str]) -> float | None:
    for field in ["Pressure_value_for_analysis", "Pressure_score_numeric", "Pressure_rating_score"]:
        value = parse_float(row.get(field))
        if value is not None:
            return value

    rating = normalize_rating(row.get("Pressure_rating_clean") or row.get("Rating"))
    if rating in RATING_MAP:
        return RATING_MAP[rating]

    return None


def collapse_max_per_pair(
    csv_path: Path,
    company_ids: set[str],
    label_field: str,
    value_fn,
    mapped_label_fn=lambda x: x,
) -> dict[tuple[str, str], float]:
    pair_to_max: dict[tuple[str, str], float] = {}

    with csv_path.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            company_id = (row.get("company_id") or "").strip()
            if company_id not in company_ids:
                continue

            raw_label = (row.get(label_field) or "").strip()
            if not raw_label:
                continue

            label = mapped_label_fn(raw_label)
            if not label:
                continue

            value = value_fn(row)
            if value is None:
                continue

            key = (company_id, label)
            current = pair_to_max.get(key)
            if current is None or value > current:
                pair_to_max[key] = value

    return pair_to_max


def build_index_records(
    pair_values: dict[tuple[str, str], float],
    company_to_scope: dict[str, tuple[str, str]],
    label_key_name: str,
    label_name: str,
) -> tuple[list[dict[str, object]], list[float]]:
    grouped_counts: dict[tuple[str, str, str], Counter] = defaultdict(Counter)
    all_scores: list[float] = []

    for (company_id, label), value in pair_values.items():
        scope = company_to_scope.get(company_id)
        if not scope:
            continue

        local_authority, coarse_category = scope
        rounded = round(value, 2)

        grouped_counts[(label, local_authority, coarse_category)][rounded] += 1
        grouped_counts[(label, ALL_SCOTLAND, coarse_category)][rounded] += 1
        all_scores.append(rounded)

    records: list[dict[str, object]] = []
    for (label, local_authority, coarse_category), counter in grouped_counts.items():
        score_counts = [[float(score), int(count)] for score, count in sorted(counter.items())]
        company_count = int(sum(counter.values()))
        records.append(
            {
                label_key_name: normalize_key(label),
                label_name: label,
                "local_authority_code": local_authority,
                "coarse_category": coarse_category,
                "company_count": company_count,
                "score_counts": score_counts,
            }
        )

    records.sort(key=lambda row: (row[label_name], row["local_authority_code"], row["coarse_category"]))
    return records, all_scores


def build_all_service_records(
    company_ids: set[str],
    company_to_scope: dict[str, tuple[str, str]],
    mean_field: str,
    label_key_name: str,
    label_name: str,
    label_value: str,
) -> tuple[list[dict[str, object]], list[float]]:
    grouped_counts: dict[tuple[str, str, str], Counter] = defaultdict(Counter)
    all_scores: list[float] = []

    with COMPANY_MASTER_CSV.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            company_id = (row.get("company_id") or "").strip()
            if company_id not in company_ids:
                continue

            value = parse_float(row.get(mean_field))
            if value is None:
                continue

            scope = company_to_scope.get(company_id)
            if not scope:
                continue

            local_authority, coarse_category = scope
            rounded = round(value, 2)
            grouped_counts[(label_value, local_authority, coarse_category)][rounded] += 1
            grouped_counts[(label_value, ALL_SCOTLAND, coarse_category)][rounded] += 1
            all_scores.append(rounded)

    records: list[dict[str, object]] = []
    for (label, local_authority, coarse_category), counter in grouped_counts.items():
        score_counts = [[float(score), int(count)] for score, count in sorted(counter.items())]
        company_count = int(sum(counter.values()))
        records.append(
            {
                label_key_name: normalize_key(label),
                label_name: label,
                "local_authority_code": local_authority,
                "coarse_category": coarse_category,
                "company_count": company_count,
                "score_counts": score_counts,
            }
        )

    records.sort(key=lambda row: (row[label_name], row["local_authority_code"], row["coarse_category"]))
    return records, all_scores


def build_dependency_index(company_ids: set[str], company_to_scope: dict[str, tuple[str, str]]) -> dict[str, object]:
    dep_pairs = collapse_max_per_pair(
        DEPENDENCY_LONG_CSV,
        company_ids,
        label_field="Ecosystem Service",
        value_fn=dependency_value_for_analysis,
    )

    dep_records, dep_scores = build_index_records(
        dep_pairs,
        company_to_scope,
        label_key_name="service_key",
        label_name="service_label",
    )

    all_records, all_scores = build_all_service_records(
        company_ids,
        company_to_scope,
        mean_field="dep_mean",
        label_key_name="service_key",
        label_name="service_label",
        label_value="All ecosystem dependencies",
    )

    records = dep_records + all_records
    records.sort(key=lambda row: (row["service_label"], row["local_authority_code"], row["coarse_category"]))

    all_values = dep_scores + all_scores
    score_domain = [float(min(all_values)), float(max(all_values))] if all_values else [0.0, 1.0]

    return {
        "category_order": CATEGORY_ORDER,
        "score_domain": score_domain,
        "records": records,
    }


def build_pressure_index(company_ids: set[str], company_to_scope: dict[str, tuple[str, str]]) -> dict[str, object]:
    pressure_pairs = collapse_max_per_pair(
        PRESSURE_LONG_CSV,
        company_ids,
        label_field="Ecosystem Service",
        value_fn=pressure_value_for_analysis,
        mapped_label_fn=lambda label: PRESSURE_LABEL_MAP.get(label, ""),
    )

    pressure_records, pressure_scores = build_index_records(
        pressure_pairs,
        company_to_scope,
        label_key_name="pressure_key",
        label_name="pressure_label",
    )

    all_records, all_scores = build_all_service_records(
        company_ids,
        company_to_scope,
        mean_field="press_mean",
        label_key_name="pressure_key",
        label_name="pressure_label",
        label_value="All ecosystem pressures",
    )

    records = pressure_records + all_records
    records.sort(key=lambda row: (row["pressure_label"], row["local_authority_code"], row["coarse_category"]))

    all_values = pressure_scores + all_scores
    score_domain = [float(min(all_values)), float(max(all_values))] if all_values else [0.0, 1.0]

    return {
        "category_order": CATEGORY_ORDER,
        "score_domain": score_domain,
        "records": records,
    }


def write_json(path: Path, payload: dict[str, object]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=True, separators=(",", ":")) + "\n", encoding="utf-8")


def main() -> int:
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)

    company_ids, company_to_scope = company_scope_from_dashboard_master()

    dependency_index = build_dependency_index(company_ids, company_to_scope)
    pressure_index = build_pressure_index(company_ids, company_to_scope)

    write_json(DEPENDENCY_INDEX_OUT, dependency_index)
    write_json(PRESSURE_INDEX_OUT, pressure_index)
    write_json(APP_DEPENDENCY_INDEX_OUT, dependency_index)
    write_json(APP_PRESSURE_INDEX_OUT, pressure_index)

    dep_unclassified_all_scotland = [
        row for row in dependency_index["records"]
        if row["local_authority_code"] == ALL_SCOTLAND and row["coarse_category"] == UNCLASSIFIED
    ]
    press_unclassified_all_scotland = [
        row for row in pressure_index["records"]
        if row["local_authority_code"] == ALL_SCOTLAND and row["coarse_category"] == UNCLASSIFIED
    ]

    print("scoped_company_count=", len(company_ids))
    print("dependency_records=", len(dependency_index["records"]))
    print("pressure_records=", len(pressure_index["records"]))
    print("dependency_all_scotland_unclassified_records=", len(dep_unclassified_all_scotland))
    print("pressure_all_scotland_unclassified_records=", len(press_unclassified_all_scotland))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
