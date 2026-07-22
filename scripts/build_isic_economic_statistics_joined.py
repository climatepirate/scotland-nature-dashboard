#!/usr/bin/env python3
"""Join validated Scottish Government economic statistics to canonical dashboard ISIC sections."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path


def create_sector_key(label: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(label or "").strip().lower()).strip("-")
    return f"isic-{slug}" if slug else "isic-unknown"


def load_canonical_isic_sections(data_dir: Path) -> list[str]:
    master_path = data_dir / "dashboard_master.csv"
    profile_path = data_dir / "company_integrated_profile.csv"

    profile_company_ids = set()
    with profile_path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            company_id = str(row.get("company_id") or "").strip().removesuffix(".0")
            if company_id:
                profile_company_ids.add(company_id)

    sections = set()
    with master_path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            if str(row.get("scorable_flag") or "").strip().lower() != "true":
                continue

            company_id = str(row.get("company_id") or "").strip().removesuffix(".0")
            if not company_id or company_id not in profile_company_ids:
                continue

            section = str(row.get("first_isic_section") or "").strip()
            if section:
                sections.add(section)

    return sorted(sections)


def coverage_for_section(section: str) -> tuple[str, str]:
    partial_sections = {
        "Agriculture, forestry and fishing": "Source industries Agriculture and Aquaculture cover only part of this broader ISIC Section.",
        "Manufacturing": "Source industries Fish & fruit processing and Meat Processing cover only part of Manufacturing.",
        "Accommodation and food service activities": "Source industry Food & beverage services does not fully cover accommodation and food service activities.",
        "Wholesale and retail trade; repair of motor vehicles and motorcycles": "Source industry Retail - excl. vehicles does not fully cover this broader ISIC Section.",
        "Water supply; sewerage, waste management and remediation activities": "Source industry Water & Sewage does not fully cover waste management and remediation activities.",
        "Human health and social work activities": "Source industry Health does not explicitly cover full social work scope in the ISIC Section.",
    }

    uncertain_sections = {
        "Electricity, gas, steam and air conditioning supply": "Source industries Electricity plus Gas & Air Conditioning may not fully represent steam and full air-conditioning scope.",
        "Public administration and defence; compulsory social security": "Source industry label appears aligned, but complete compulsory social-security scope is uncertain without a concordance note.",
    }

    if section in partial_sections:
        return "partial", partial_sections[section]
    if section in uncertain_sections:
        return "uncertain", uncertain_sections[section]
    if section == "Education":
        return "full", "Source industry label Education appears to align with the canonical ISIC Section."
    return "uncertain", "Coverage cannot be confirmed as complete from available source metadata."


def build_joined_dataset(data_dir: Path) -> dict:
    validated_path = data_dir / "scottish_economic_statistics.validated.json"
    mapping_path = data_dir / "scottish_government_to_isic_mapping.json"

    validated = json.loads(validated_path.read_text(encoding="utf-8"))
    mappings = json.loads(mapping_path.read_text(encoding="utf-8"))

    canonical_sections = load_canonical_isic_sections(data_dir)

    stats_rows = validated.get("rows", [])
    by_gov_label = {}
    duplicate_source_labels = []
    for row in stats_rows:
        label = str(row.get("governmentIndustryLabel") or "").strip()
        if not label:
            continue
        if label in by_gov_label:
            duplicate_source_labels.append(label)
        by_gov_label[label] = row

    section_buckets = {}
    failed_joins = []
    mapping_duplicates = set()
    seen_mapping_pairs = set()

    for row in mappings:
        mapping_type = str(row.get("mappingType") or "").strip()
        gov_label = str(row.get("governmentIndustryLabel") or "").strip()
        section = str(row.get("isicSection") or "").strip()

        if mapping_type == "excluded":
            continue
        if not gov_label or not section:
            failed_joins.append({
                "governmentIndustryLabel": gov_label,
                "isicSection": section,
                "reason": "mapping row missing industry or ISIC section",
            })
            continue

        pair = (gov_label, section)
        if pair in seen_mapping_pairs:
            mapping_duplicates.add(f"{gov_label} -> {section}")
            continue
        seen_mapping_pairs.add(pair)

        source = by_gov_label.get(gov_label)
        if source is None:
            failed_joins.append({
                "governmentIndustryLabel": gov_label,
                "isicSection": section,
                "reason": "government industry missing from validated statistics",
            })
            continue

        output = source.get("annualOutputBn")
        employment = source.get("employmentFte")

        if section not in section_buckets:
            section_buckets[section] = {
                "annualOutputBn": 0.0,
                "employmentFte": 0.0,
                "contributingGovernmentIndustries": [],
            }

        bucket = section_buckets[section]
        if isinstance(output, (int, float)):
            bucket["annualOutputBn"] += float(output)
        if isinstance(employment, (int, float)):
            bucket["employmentFte"] += float(employment)
        bucket["contributingGovernmentIndustries"].append(gov_label)

    rows = []
    matched_count = 0
    unavailable_count = 0
    for section in canonical_sections:
        key = create_sector_key(section)
        bucket = section_buckets.get(section)
        if bucket is None:
            unavailable_count += 1
            rows.append({
                "sectorKey": key,
                "isicSection": section,
                "annualOutputBn": None,
                "employmentFte": None,
                "contributingGovernmentIndustries": [],
                "coverageStatus": "unavailable",
                "coverageNote": "No mapped Scottish Government industry statistics currently available for this ISIC Section.",
            })
            continue

        matched_count += 1
        coverage_status, coverage_note = coverage_for_section(section)
        rows.append({
            "sectorKey": key,
            "isicSection": section,
            "annualOutputBn": round(bucket["annualOutputBn"], 6),
            "employmentFte": round(bucket["employmentFte"], 6),
            "contributingGovernmentIndustries": sorted(bucket["contributingGovernmentIndustries"]),
            "coverageStatus": coverage_status,
            "coverageNote": coverage_note,
        })

    rows.sort(key=lambda entry: entry["isicSection"])

    return {
        "sourceFiles": {
            "validatedEconomicStatistics": str(validated_path.as_posix()),
            "governmentToIsicMapping": str(mapping_path.as_posix()),
        },
        "rows": rows,
        "validation": {
            "matchedIsicSections": matched_count,
            "unavailableIsicSections": unavailable_count,
            "duplicateSourceIndustryLabels": sorted(set(duplicate_source_labels)),
            "duplicateMappingPairs": sorted(mapping_duplicates),
            "failedJoins": failed_joins,
        },
    }


def main() -> None:
    data_dir = Path("Data")
    out_path = data_dir / "isic_economic_statistics.joined.json"
    payload = build_joined_dataset(data_dir)
    out_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")

    print(json.dumps({
        "output": str(out_path.as_posix()),
        "matchedIsicSections": payload["validation"]["matchedIsicSections"],
        "unavailableIsicSections": payload["validation"]["unavailableIsicSections"],
        "failedJoins": len(payload["validation"]["failedJoins"]),
        "duplicateMappingPairs": len(payload["validation"]["duplicateMappingPairs"]),
    }, ensure_ascii=True))


if __name__ == "__main__":
    main()
