from __future__ import annotations

import re


COARSE_CATEGORY_MAP = {
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


# These labels appear in existing data exports as abbreviated first sections.
SECTION_ALIASES = {
    "agriculture": "Agriculture, forestry and fishing",
    "electricity": "Electricity, gas, steam and air conditioning supply",
    "water supply": "Water supply; sewerage, waste management and remediation activities",
    "wholesale and retail trade": "Wholesale and retail trade; repair of motor vehicles and motorcycles",
    "professional": "Professional, scientific and technical activities",
    "public administration and defence": "Public administration and defence; compulsory social security",
    "arts": "Arts, entertainment and recreation",
    "activities of households as employers": "Activities of households as employers; undifferentiated goods- and services-producing activities of households for own use",
}


def normalize_text(value: str | None) -> str:
    if value is None:
        return ""
    cleaned = str(value).strip()
    if cleaned.lower() in {"", "nan", "none", "null"}:
        return ""
    return cleaned


def split_isic_sections(value: str | None) -> list[str]:
    cleaned = normalize_text(value)
    if not cleaned:
        return []

    # ISIC section labels themselves contain commas; only treat ';' and '|' as list delimiters.
    parts = [part.strip() for part in re.split(r"[;|]+", cleaned) if normalize_text(part)]
    return parts


def canonicalize_section(value: str | None) -> str:
    section = normalize_text(value)
    if not section:
        return ""

    section_key = re.sub(r"\s+", " ", section).strip().lower()
    return SECTION_ALIASES.get(section_key, section)


def normalized_sections(value: str | None) -> list[str]:
    return [canonicalize_section(item) for item in split_isic_sections(value)]


def derive_coarse_category(first_isic_section: str, all_sections: list[str], scorable: bool) -> str:
    if not scorable:
        return "Unclassified"

    if first_isic_section and first_isic_section in COARSE_CATEGORY_MAP:
        return COARSE_CATEGORY_MAP[first_isic_section]

    for section in all_sections:
        if section in COARSE_CATEGORY_MAP:
            return COARSE_CATEGORY_MAP[section]

    return "Unclassified"
