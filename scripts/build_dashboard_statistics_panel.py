from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

from isic_utils import canonicalize_section, derive_coarse_category, normalize_text, normalized_sections


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "Data"
CLEAN_GIS_DIR = ROOT / "CLEAN GIS"

COMPANY_MASTER_CSV = DATA_DIR / "company_master.csv"
INTEGRATED_PROFILE_CSV = DATA_DIR / "company_integrated_profile.csv"
POSTCODE_HEX_CSV = CLEAN_GIS_DIR / "Postcode_Scorepoints HEX ID.csv"
OUTPUT_JSON = DATA_DIR / "dashboard_statistics_panel.json"

ALL_SCOTLAND = "All Scotland"
ALL_CATEGORIES = "All Categories"
DEPENDENCY_THRESHOLD = 3.0
PRESSURE_THRESHOLD = 7.0

def read_postcode_lookup() -> dict[str, str]:
    lookup: dict[str, str] = {}
    with POSTCODE_HEX_CSV.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            postcode = (row.get("postcode_clean") or "").strip().upper()
            local_authority_code = (row.get("admin_district_code") or "").strip()
            if postcode and local_authority_code:
                lookup[postcode] = local_authority_code
    return lookup


def read_top_service_lookup() -> dict[str, str]:
    lookup: dict[str, str] = {}
    with INTEGRATED_PROFILE_CSV.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            company_id = (row.get("company_id") or "").strip()
            if not company_id:
                continue

            services = (row.get("top_5_ecosystem_services") or "").strip().strip('"')
            top_service = services.split(";", 1)[0].strip() if services else ""
            if top_service:
                lookup[company_id] = top_service

    return lookup


def get_first_isic_section(row: dict[str, str]) -> str:
    first_section = canonicalize_section(row.get("first_isic_section"))
    if first_section:
        return first_section

    sections = normalized_sections(row.get("isic_sections"))
    return sections[0] if sections else ""


def get_coarse_category(row: dict[str, str]) -> str:
    first_isic_section = get_first_isic_section(row)
    all_sections = normalized_sections(row.get("isic_sections"))
    return derive_coarse_category(first_isic_section, all_sections, True)


def build_output() -> None:
    postcode_lookup = read_postcode_lookup()
    top_service_lookup = read_top_service_lookup()

    buckets = defaultdict(lambda: {
        "company_count": 0,
        "moderate_high_dependency_count": 0,
        "moderate_high_pressure_count": 0,
        "category_counts": Counter(),
        "service_counts": Counter(),
    })

    overall_counts = Counter()
    corrected_category_counts = Counter()

    with COMPANY_MASTER_CSV.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            company_id = (row.get("company_id") or "").strip()
            postcode_clean = (row.get("postcode_clean") or "").strip().upper()
            local_authority_code = postcode_lookup.get(postcode_clean)
            if not company_id or not local_authority_code:
                continue

            unique_codes = (row.get("unique_codes") or "").strip()
            has_mapped_unique_code = unique_codes not in {"", "nan", "None"}
            coarse_category = get_coarse_category(row) if has_mapped_unique_code else "Unclassified"

            if has_mapped_unique_code:
                overall_counts["mapped_unique_code"] += 1
            else:
                overall_counts["no_mapped_unique_code"] += 1

            corrected_category_counts[coarse_category] += 1

            bucket_keys = [
                (local_authority_code, coarse_category),
                (local_authority_code, ALL_CATEGORIES),
                (ALL_SCOTLAND, coarse_category),
                (ALL_SCOTLAND, ALL_CATEGORIES),
            ]

            dep_mean = float((row.get("dep_mean") or 0) or 0)
            press_mean = float((row.get("press_mean") or 0) or 0)
            category_label = coarse_category
            service_label = top_service_lookup.get(company_id, "")

            for bucket_key in bucket_keys:
                bucket = buckets[bucket_key]
                bucket["company_count"] += 1
                if dep_mean >= DEPENDENCY_THRESHOLD:
                    bucket["moderate_high_dependency_count"] += 1
                if press_mean >= PRESSURE_THRESHOLD:
                    bucket["moderate_high_pressure_count"] += 1
                bucket["category_counts"][category_label] += 1
                if service_label:
                    bucket["service_counts"][service_label] += 1

    serialisable_buckets = {}
    for (local_authority_code, coarse_category), bucket in buckets.items():
        serialisable_buckets[f"{local_authority_code}||{coarse_category}"] = {
            "company_count": bucket["company_count"],
            "moderate_high_dependency_count": bucket["moderate_high_dependency_count"],
            "moderate_high_pressure_count": bucket["moderate_high_pressure_count"],
            "category_counts": dict(bucket["category_counts"]),
            "service_counts": dict(bucket["service_counts"]),
        }

    payload = {
        "thresholds": {
            "dependency": DEPENDENCY_THRESHOLD,
            "pressure": PRESSURE_THRESHOLD,
        },
        "all_scotland": ALL_SCOTLAND,
        "all_categories": ALL_CATEGORIES,
        "buckets": serialisable_buckets,
    }

    OUTPUT_JSON.write_text(json.dumps(payload, ensure_ascii=True, separators=(",", ":")) + "\n", encoding="utf-8")

    expected = {
        "Business & Property Services": 92283,
        "Consumer & Visitor Economy": 49675,
        "Primary & Resource Industries": 44658,
        "Public & Community Services": 29258,
        "Unclassified": 36638,
    }

    print("Overall counts:", dict(overall_counts))
    print("Corrected category counts:", dict(corrected_category_counts))

    if corrected_category_counts != Counter(expected):
        raise SystemExit(
            f"Corrected counts do not match expected values: {dict(corrected_category_counts)}"
        )

    total = sum(corrected_category_counts.values())
    substantive_total = total - corrected_category_counts["Unclassified"]
    if total != 252512 or substantive_total != 215874:
        raise SystemExit(
            f"Unexpected totals: total={total}, substantive={substantive_total}"
        )

    print(f"Wrote {OUTPUT_JSON}")
    print(f"Total companies: {total}")
    print(f"Substantive companies: {substantive_total}")
    print(f"Unclassified: {corrected_category_counts['Unclassified']}")


if __name__ == "__main__":
    build_output()
