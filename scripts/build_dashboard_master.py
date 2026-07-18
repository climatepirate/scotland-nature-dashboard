from __future__ import annotations

import csv
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "Data"
CLEAN_GIS_DIR = ROOT / "CLEAN GIS"

COMPANY_MASTER_CSV = DATA_DIR / "company_master.csv"
POSTCODE_HEX_CSV = CLEAN_GIS_DIR / "Postcode_Scorepoints HEX ID.csv"
OUTPUT_CSV = DATA_DIR / "dashboard_master.csv"


NOTEBOOK_COARSE_CATEGORY_MAP = {
    "Agriculture, forestry and fishing": "Primary & Resource Industries",
    "Mining and quarrying": "Primary & Resource Industries",
    "Manufacturing": "Primary & Resource Industries",
    "Electricity, gas, steam and air conditioning supply": "Primary & Resource Industries",
    "Water supply; sewerage, waste management and remediation activities": "Primary & Resource Industries",
    "Construction": "Primary & Resource Industries",
    "Wholesale and retail trade; repair of motor vehicles and motorcycles": "Consumer & Visitor Economy",
    "Transportation and storage": "Consumer & Visitor Economy",
    "Accommodation and food service activities": "Consumer & Visitor Economy",
    "Information and communication": "Business & Property Services",
    "Financial and insurance activities": "Business & Property Services",
    "Real estate activities": "Business & Property Services",
    "Professional, scientific and technical activities": "Business & Property Services",
    "Administrative and support service activities": "Business & Property Services",
    "Public administration and defence; compulsory social security": "Public & Community Services",
    "Education": "Public & Community Services",
    "Human health and social work activities": "Public & Community Services",
    "Arts, entertainment and recreation": "Public & Community Services",
    "Other service activities": "Public & Community Services",
    "Activities of households as employers; undifferentiated goods- and services-producing activities of households for own use": "Public & Community Services",
    "Activities of extraterritorial organizations and bodies": "Public & Community Services",
}

EXPECTED_COARSE_TOTALS = {
    "Business & Property Services": 92283,
    "Consumer & Visitor Economy": 49675,
    "Primary & Resource Industries": 44658,
    "Public & Community Services": 29258,
    "Unclassified": 36638,
}


def normalize_text(value: str | None) -> str:
    if value is None:
        return ""
    cleaned = str(value).strip()
    if cleaned.lower() in {"", "nan", "none", "null"}:
        return ""
    return cleaned


def normalize_section_name(value: str | None) -> str:
    cleaned = normalize_text(value)
    if not cleaned:
        return ""
    parts = [part.strip() for part in re.split(r"[;,|]+", cleaned) if normalize_text(part)]
    return parts[0] if parts else ""


def build_section_map() -> dict[str, str]:
    section_map: dict[str, str] = {}
    for section_name, category in NOTEBOOK_COARSE_CATEGORY_MAP.items():
        section_map[normalize_section_name(section_name)] = category
    return section_map


def is_truthy(value: str | None) -> bool:
    return normalize_text(value).lower() in {"true", "1", "yes", "y", "t"}


def read_postcode_lookup() -> dict[str, tuple[str, str]]:
    lookup: dict[str, tuple[str, str]] = {}
    with POSTCODE_HEX_CSV.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            postcode = normalize_text(row.get("postcode_clean")).upper()
            la_code = normalize_text(row.get("admin_district_code"))
            hex_id = normalize_text(row.get("hex_id"))
            if postcode:
                lookup[postcode] = (la_code, hex_id)
    return lookup


def derive_coarse_category(first_isic_section: str, scorable: bool, section_map: dict[str, str]) -> str:
    if not scorable:
        return "Unclassified"
    if not first_isic_section:
        return "Unclassified"
    return section_map.get(first_isic_section, "Unclassified")


def derive_active_flag(company_status: str) -> bool:
    status = normalize_text(company_status).lower()
    return status == "active"


def build_dashboard_master() -> int:
    section_map = build_section_map()
    postcode_lookup = read_postcode_lookup()

    coarse_totals = Counter()
    seen_company_ids: set[str] = set()
    duplicate_company_ids = 0

    total_rows = 0
    scorable_count = 0
    unscorable_count = 0

    postcode_present_count = 0
    postcode_mapped_count = 0
    la_mapped_count = 0
    hex_mapped_count = 0

    validation_failures: list[str] = []

    fieldnames = [
        "company_id",
        "company_name",
        "postcode_clean",
        "hex_id",
        "local_authority_code",
        "isic_section",
        "first_isic_section",
        "coarse_category",
        "active_flag",
        "scorable_flag",
        "data_quality_flags",
    ]

    with COMPANY_MASTER_CSV.open("r", newline="", encoding="utf-8-sig") as source, OUTPUT_CSV.open(
        "w", newline="", encoding="utf-8"
    ) as target:
        reader = csv.DictReader(source)
        writer = csv.DictWriter(target, fieldnames=fieldnames)
        writer.writeheader()

        for row in reader:
            total_rows += 1

            company_id = normalize_text(row.get("company_id"))
            company_name = normalize_text(row.get("CompanyName"))
            postcode_clean = normalize_text(row.get("postcode_clean")).upper()
            isic_section = normalize_section_name(row.get("isic_sections"))

            first_isic_section = normalize_section_name(row.get("first_isic_section"))
            if not first_isic_section:
                first_isic_section = isic_section

            mapped_unique_code = normalize_text(row.get("unique_codes"))
            has_mapped_unique_code = bool(mapped_unique_code)
            has_mapped_unique_code_flag = is_truthy(row.get("has_mapped_unique_code"))
            scorable_flag = has_mapped_unique_code or has_mapped_unique_code_flag

            if scorable_flag:
                scorable_count += 1
            else:
                unscorable_count += 1

            coarse_category = derive_coarse_category(first_isic_section, scorable_flag, section_map)
            coarse_totals[coarse_category] += 1

            local_authority_code = ""
            hex_id = ""
            if postcode_clean:
                postcode_present_count += 1
                mapped = postcode_lookup.get(postcode_clean)
                if mapped:
                    postcode_mapped_count += 1
                    local_authority_code, hex_id = mapped

            if local_authority_code:
                la_mapped_count += 1
            if hex_id:
                hex_mapped_count += 1

            quality_flags: list[str] = []
            if not company_id:
                quality_flags.append("missing_company_id")
            if not postcode_clean:
                quality_flags.append("missing_postcode")
            if postcode_clean and not local_authority_code:
                quality_flags.append("missing_local_authority_mapping")
            if postcode_clean and not hex_id:
                quality_flags.append("missing_hex_mapping")
            if not first_isic_section:
                quality_flags.append("missing_first_isic_section")
            if coarse_category == "Unclassified" and scorable_flag:
                quality_flags.append("unmapped_or_missing_section")
            if not scorable_flag:
                quality_flags.append("unscorable_company")

            if company_id in seen_company_ids:
                duplicate_company_ids += 1
                quality_flags.append("duplicate_company_id")
            seen_company_ids.add(company_id)

            writer.writerow(
                {
                    "company_id": company_id,
                    "company_name": company_name,
                    "postcode_clean": postcode_clean,
                    "hex_id": hex_id,
                    "local_authority_code": local_authority_code,
                    "isic_section": isic_section,
                    "first_isic_section": first_isic_section,
                    "coarse_category": coarse_category,
                    "active_flag": "true" if derive_active_flag(row.get("CompanyStatus", "")) else "false",
                    "scorable_flag": "true" if scorable_flag else "false",
                    "data_quality_flags": ";".join(quality_flags),
                }
            )

    if duplicate_company_ids > 0:
        validation_failures.append(f"duplicate company_id rows: {duplicate_company_ids}")

    if coarse_totals != Counter(EXPECTED_COARSE_TOTALS):
        validation_failures.append("coarse category totals do not match expected corrected totals")

    if total_rows != sum(coarse_totals.values()):
        validation_failures.append("row count mismatch between output rows and coarse totals")

    print("Wrote", OUTPUT_CSV)
    print("row_count=", total_rows)
    print("company_id_unique=", duplicate_company_ids == 0)
    print("coarse_totals=", dict(coarse_totals))
    print("scorable_count=", scorable_count)
    print("unscorable_count=", unscorable_count)
    print("postcode_present_count=", postcode_present_count)
    print("postcode_mapped_count=", postcode_mapped_count)
    print("local_authority_mapped_count=", la_mapped_count)
    print("hex_mapped_count=", hex_mapped_count)

    if total_rows:
        print("postcode_present_coverage_pct=", round((postcode_present_count / total_rows) * 100, 3))
        print("local_authority_coverage_pct=", round((la_mapped_count / total_rows) * 100, 3))
        print("hex_coverage_pct=", round((hex_mapped_count / total_rows) * 100, 3))

    if postcode_present_count:
        print(
            "postcode_to_bridge_match_pct=",
            round((postcode_mapped_count / postcode_present_count) * 100, 3),
        )

    if validation_failures:
        print("validation_failures=")
        for failure in validation_failures:
            print("-", failure)
    else:
        print("validation_failures=none")

    return 0 if not validation_failures else 1


if __name__ == "__main__":
    raise SystemExit(build_dashboard_master())
