from __future__ import annotations

import csv
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "Data"
CLEAN_GIS_DIR = ROOT / "CLEAN GIS"

COMPANY_MASTER_CSV = DATA_DIR / "company_master.csv"
DEPENDENCY_LONG_CSV = DATA_DIR / "company_ecosystem_service_long.csv"
PRESSURE_LONG_CSV = DATA_DIR / "company_ecosystem_service_long_pressures.csv"
POSTCODE_HEX_CSV = CLEAN_GIS_DIR / "Postcode_Scorepoints HEX ID.csv"
SOURCE_HEX_GPKG = CLEAN_GIS_DIR / "scot hex.gpkg"
LIVE_HEX_GPKG = CLEAN_GIS_DIR / "dashboard_hex_master_complete.gpkg"

OUTPUT_GPKG = CLEAN_GIS_DIR / "dashboard_hex_filter_aggregates.gpkg"
OUTPUT_STATS_CSV = DATA_DIR / "dashboard_statistics.csv"
OUTPUT_SECTOR_SUMMARY_CSV = DATA_DIR / "dashboard_sector_summary.csv"

TEMP_DEPENDENCY_FIELDS = {
    "Air Filtration": "avg_dep_air_filtration",
    "Biological control": "avg_dep_biological_control",
    "Biomass provisioning": "avg_dep_biomass_provisioning",
    "Education, scientific and research services": "avg_dep_education_scientific_and_research_services",
    "Flood control": "avg_dep_flood_control",
    "Genetic material": "avg_dep_genetic_material",
    "Global climate regulation": "avg_dep_global_climate_regulation",
    "Local (micro and meso) climate regulation": "avg_dep_local_micro_and_meso_climate_regulation",
    "Noise attenuation": "avg_dep_noise_attenuation",
    "Nursery population and habitat maintenance": "avg_dep_nursery_population_and_habitat_maintenance",
    "Other provisioning services - Animal-based energy": "avg_dep_other_provisioning_services_animal_based_energy",
    "Other regulating and maintenance service - Dilution by atmosphere and ecosystems": "avg_dep_other_regulating_and_maintenance_service_dilution_by_atmosphere_and_ecosystems",
    "Other regulating and maintenance service - Mediation of sensory impacts (other than noise)": "avg_dep_other_regulating_and_maintenance_service_mediation_of_sensory_impacts_other_than_noise",
    "Pollination": "avg_dep_pollination",
    "Rainfall pattern regulation": "avg_dep_rainfall_pattern_regulation",
    "Recreation related services": "avg_dep_recreation_related_services",
    "Soil and sediment retention": "avg_dep_soil_and_sediment_retention",
    "Soil quality regulation": "avg_dep_soil_quality_regulation",
    "Solid waste remediation": "avg_dep_solid_waste_remediation",
    "Spiritual, artistic and symbolic services": "avg_dep_spiritual_artistic_and_symbolic_services",
    "Storm mitigation": "avg_dep_storm_mitigation",
    "Visual amenity services": "avg_dep_visual_amenity_services",
    "Water flow regulation": "avg_dep_water_flow_regulation",
    "Water purification": "avg_dep_water_purification",
    "Water supply": "avg_dep_water_supply",
}

PRESSURE_FIELDS = {
    "Area of freshwater use": "avg_press_area_of_freshwater_use",
    "Area of land use": "avg_press_area_of_land_use",
    "Area of seabed use": "avg_press_area_of_seabed_use",
    "Disturbances (e.g noise, light)": "avg_press_disturbances_e_g_noise_light",
    "Emissions of GHG": "avg_press_emissions_of_ghg",
    "Emissions of non-GHG air pollutants": "avg_press_emissions_of_non_ghg_air_pollutants",
    "Emissions of nutrient soil and water pollutants": "avg_press_emissions_of_nutrient_soil_and_water_pollutants",
    "Emissions of toxic soil and water pollutants": "avg_press_emissions_of_toxic_soil_and_water_pollutants",
    "Generation and release of solid waste": "avg_press_generation_and_release_of_solid_waste",
    "Introduction of invasive species": "avg_press_introduction_of_invasive_species",
    "Other abiotic resource extraction": "avg_press_other_abiotic_resource_extraction",
    "Other biotic resource extraction (e.g. fish, timber)": "avg_press_other_biotic_resource_extraction_e_g_fish_timber",
    "Volume of water use": "avg_press_volume_of_water_use",
}

SERVICE_OUTPUT_LABELS = {
    **{v: k for k, v in TEMP_DEPENDENCY_FIELDS.items()},
    **{v: k for k, v in PRESSURE_FIELDS.items()},
}

PRESSURE_RATING_BACKFILL = {
    "VL": 4.0,
    "L": 5.0,
    "M": 7.0,
    "H": 9.0,
    "VH": 11.0,
}

ALL_SCOTLAND = "ALL"
ALL_CATEGORIES = "ALL"


def log(message: str) -> None:
    print(message, flush=True)


def ensure_inputs_exist() -> None:
    for path in [
        COMPANY_MASTER_CSV,
        DEPENDENCY_LONG_CSV,
        PRESSURE_LONG_CSV,
        POSTCODE_HEX_CSV,
        SOURCE_HEX_GPKG,
        LIVE_HEX_GPKG,
    ]:
        if not path.exists():
            raise FileNotFoundError(f"Missing required input: {path}")


def is_dormant_company(row: dict[str, str]) -> bool:
    if row.get("Accounts.AccountCategory") == "DORMANT":
        return True

    for key in [
        "SICCode.SicText_1",
        "SICCode.SicText_2",
        "SICCode.SicText_3",
        "SICCode.SicText_4",
        "sic_texts",
    ]:
        value = (row.get(key) or "")
        if "Dormant Company" in value or "DORMANT COMPANY" in value:
            return True

    return False


def is_scorable_company(row: dict[str, str]) -> bool:
    return (
        row.get("has_mapped_unique_code") == "True"
        and row.get("has_dependency_score") == "True"
        and row.get("has_pressure_score") == "True"
    )


def build_postcode_lookup() -> dict[str, tuple[str, str]]:
    lookup: dict[str, tuple[str, str]] = {}
    with POSTCODE_HEX_CSV.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            postcode = (row.get("postcode_clean") or "").strip().upper()
            hex_id = (row.get("hex_id") or "").strip()
            local_authority_code = (row.get("admin_district_code") or "").strip()
            if postcode and hex_id and local_authority_code:
                lookup[postcode] = (hex_id, local_authority_code)
    return lookup


def build_filtered_company_base(postcode_lookup: dict[str, tuple[str, str]], workspace_db: Path) -> tuple[Counter, list[str]]:
    metrics = Counter()
    included_company_ids: list[str] = []

    connection = sqlite3.connect(workspace_db)
    try:
        connection.execute(
            """
            CREATE TABLE company_base (
                company_id TEXT PRIMARY KEY,
                company_name TEXT,
                postcode_clean TEXT,
                hex_id TEXT,
                local_authority_code TEXT,
                coarse_category TEXT,
                isic_section TEXT,
                dep_score REAL,
                press_score REAL
            )
            """
        )

        insert_rows: list[tuple[str, str, str, str, str, str, str, float, float]] = []

        with COMPANY_MASTER_CSV.open("r", newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                metrics["company_rows_seen"] += 1

                if is_dormant_company(row):
                    metrics["excluded_dormant"] += 1
                    continue

                if not is_scorable_company(row):
                    metrics["excluded_unscorable"] += 1
                    continue

                company_id = (row.get("company_id") or "").strip()
                postcode_clean = (row.get("postcode_clean") or "").strip().upper()
                postcode_match = postcode_lookup.get(postcode_clean)
                if not company_id or not postcode_match:
                    metrics["excluded_missing_postcode_bridge"] += 1
                    continue

                dep_score_raw = (row.get("dep_score") or "0").strip()
                press_score_raw = (row.get("press_score") or "0").strip()
                dep_score = float(dep_score_raw or 0)
                press_score = float(press_score_raw or 0)

                hex_id, local_authority_code = postcode_match
                isic_section = (row.get("first_isic_section") or "").strip()
                coarse_category = (row.get("Coarse Category") or "Unclassified").strip() or "Unclassified"

                insert_rows.append(
                    (
                        company_id,
                        (row.get("CompanyName") or "").strip(),
                        postcode_clean,
                        hex_id,
                        local_authority_code,
                        coarse_category,
                        isic_section,
                        dep_score,
                        press_score,
                    )
                )
                included_company_ids.append(company_id)
                metrics["included_companies"] += 1

                if len(insert_rows) >= 5000:
                    connection.executemany(
                        "INSERT INTO company_base VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        insert_rows,
                    )
                    insert_rows.clear()

        if insert_rows:
            connection.executemany(
                "INSERT INTO company_base VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                insert_rows,
            )

        connection.execute("CREATE INDEX company_base_hex_idx ON company_base (hex_id)")
        connection.execute("CREATE INDEX company_base_filter_idx ON company_base (local_authority_code, coarse_category)")
        connection.execute("CREATE INDEX company_base_section_idx ON company_base (isic_section, coarse_category)")
        connection.commit()
    finally:
        connection.close()

    return metrics, included_company_ids


def load_company_id_set(company_ids: list[str], workspace_db: Path) -> None:
    connection = sqlite3.connect(workspace_db)
    try:
        connection.execute("CREATE TABLE included_company_ids (company_id TEXT PRIMARY KEY)")
        connection.executemany(
            "INSERT INTO included_company_ids VALUES (?)",
            [(company_id,) for company_id in company_ids],
        )
        connection.commit()
    finally:
        connection.close()


def build_dependency_service_values(workspace_db: Path) -> None:
    connection = sqlite3.connect(workspace_db)
    try:
        connection.execute(
            """
            CREATE TABLE dependency_service_values (
                company_id TEXT PRIMARY KEY,
                avg_dep_air_filtration REAL DEFAULT 0,
                avg_dep_biological_control REAL DEFAULT 0,
                avg_dep_biomass_provisioning REAL DEFAULT 0,
                avg_dep_education_scientific_and_research_services REAL DEFAULT 0,
                avg_dep_flood_control REAL DEFAULT 0,
                avg_dep_genetic_material REAL DEFAULT 0,
                avg_dep_global_climate_regulation REAL DEFAULT 0,
                avg_dep_local_micro_and_meso_climate_regulation REAL DEFAULT 0,
                avg_dep_noise_attenuation REAL DEFAULT 0,
                avg_dep_nursery_population_and_habitat_maintenance REAL DEFAULT 0,
                avg_dep_other_provisioning_services_animal_based_energy REAL DEFAULT 0,
                avg_dep_other_regulating_and_maintenance_service_dilution_by_atmosphere_and_ecosystems REAL DEFAULT 0,
                avg_dep_other_regulating_and_maintenance_service_mediation_of_sensory_impacts_other_than_noise REAL DEFAULT 0,
                avg_dep_pollination REAL DEFAULT 0,
                avg_dep_rainfall_pattern_regulation REAL DEFAULT 0,
                avg_dep_recreation_related_services REAL DEFAULT 0,
                avg_dep_soil_and_sediment_retention REAL DEFAULT 0,
                avg_dep_soil_quality_regulation REAL DEFAULT 0,
                avg_dep_solid_waste_remediation REAL DEFAULT 0,
                avg_dep_spiritual_artistic_and_symbolic_services REAL DEFAULT 0,
                avg_dep_storm_mitigation REAL DEFAULT 0,
                avg_dep_visual_amenity_services REAL DEFAULT 0,
                avg_dep_water_flow_regulation REAL DEFAULT 0,
                avg_dep_water_purification REAL DEFAULT 0,
                avg_dep_water_supply REAL DEFAULT 0
            )
            """
        )

        per_company_service_max: dict[str, dict[str, float]] = defaultdict(dict)
        included_ids = {row[0] for row in connection.execute("SELECT company_id FROM included_company_ids")}

        with DEPENDENCY_LONG_CSV.open("r", newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                company_id = (row.get("company_id") or "").strip()
                if company_id not in included_ids:
                    continue

                service = (row.get("Ecosystem Service") or "").strip()
                field_name = TEMP_DEPENDENCY_FIELDS.get(service)
                if not field_name:
                    continue

                value_raw = (row.get("Dependency_value_for_analysis") or "").strip()
                if not value_raw:
                    continue

                value = float(value_raw)
                current = per_company_service_max[company_id].get(field_name)
                if current is None or value > current:
                    per_company_service_max[company_id][field_name] = value

        insert_rows = []
        for company_id in included_ids:
            service_values = per_company_service_max.get(company_id, {})
            insert_rows.append(
                tuple([company_id] + [service_values.get(field_name, 0.0) for field_name in TEMP_DEPENDENCY_FIELDS.values()])
            )

        placeholders = ", ".join(["?"] * (1 + len(TEMP_DEPENDENCY_FIELDS)))
        connection.executemany(
            f"INSERT INTO dependency_service_values VALUES ({placeholders})",
            insert_rows,
        )
        connection.commit()
    finally:
        connection.close()


def build_pressure_service_values(workspace_db: Path) -> None:
    connection = sqlite3.connect(workspace_db)
    try:
        connection.execute(
            """
            CREATE TABLE pressure_service_values (
                company_id TEXT PRIMARY KEY,
                avg_press_area_of_freshwater_use REAL DEFAULT 0,
                avg_press_area_of_land_use REAL DEFAULT 0,
                avg_press_area_of_seabed_use REAL DEFAULT 0,
                avg_press_disturbances_e_g_noise_light REAL DEFAULT 0,
                avg_press_emissions_of_ghg REAL DEFAULT 0,
                avg_press_emissions_of_non_ghg_air_pollutants REAL DEFAULT 0,
                avg_press_emissions_of_nutrient_soil_and_water_pollutants REAL DEFAULT 0,
                avg_press_emissions_of_toxic_soil_and_water_pollutants REAL DEFAULT 0,
                avg_press_generation_and_release_of_solid_waste REAL DEFAULT 0,
                avg_press_introduction_of_invasive_species REAL DEFAULT 0,
                avg_press_other_abiotic_resource_extraction REAL DEFAULT 0,
                avg_press_other_biotic_resource_extraction_e_g_fish_timber REAL DEFAULT 0,
                avg_press_volume_of_water_use REAL DEFAULT 0
            )
            """
        )

        per_company_service_values: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
        included_ids = {row[0] for row in connection.execute("SELECT company_id FROM included_company_ids")}

        with PRESSURE_LONG_CSV.open("r", newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                company_id = (row.get("company_id") or "").strip()
                if company_id not in included_ids:
                    continue

                service = (row.get("Ecosystem Service") or "").strip()
                field_name = PRESSURE_FIELDS.get(service)
                if not field_name:
                    continue

                value: float | None = None
                numeric_score = (row.get("Score") or "").strip()
                if numeric_score:
                    value = float(numeric_score)
                else:
                    rating = (row.get("Pressure_rating_clean") or row.get("Rating") or "").strip()
                    present = (row.get("Pressure_present") or "").strip() in {"1", "True"}
                    if present and rating in PRESSURE_RATING_BACKFILL:
                        value = PRESSURE_RATING_BACKFILL[rating]
                    elif (row.get("Pressure_value_for_analysis") or "").strip() == "0.0":
                        value = 0.0

                if value is None:
                    continue

                per_company_service_values[company_id][field_name].append(value)

        insert_rows = []
        for company_id in included_ids:
            service_values = per_company_service_values.get(company_id, {})
            ordered_values = []
            for field_name in PRESSURE_FIELDS.values():
                values = service_values.get(field_name, [])
                ordered_values.append(sum(values) / len(values) if values else 0.0)
            insert_rows.append(tuple([company_id] + ordered_values))

        placeholders = ", ".join(["?"] * (1 + len(PRESSURE_FIELDS)))
        connection.executemany(
            f"INSERT INTO pressure_service_values VALUES ({placeholders})",
            insert_rows,
        )
        connection.commit()
    finally:
        connection.close()


def build_rollup_aggregate_table(workspace_db: Path) -> None:
    connection = sqlite3.connect(workspace_db)
    try:
        dependency_columns = ",\n                ".join(
            [f"AVG({field_name}) AS {field_name}" for field_name in TEMP_DEPENDENCY_FIELDS.values()]
        )
        pressure_columns = ",\n                ".join(
            [f"AVG({field_name}) AS {field_name}" for field_name in PRESSURE_FIELDS.values()]
        )

        connection.execute(
            f"""
            CREATE TABLE aggregate_rows AS
            WITH company_enriched AS (
                SELECT
                    b.company_id,
                    b.hex_id,
                    b.local_authority_code,
                    b.coarse_category,
                    b.dep_score,
                    b.press_score,
                    b.isic_section,
                    {", ".join([f"d.{field_name}" for field_name in TEMP_DEPENDENCY_FIELDS.values()])},
                    {", ".join([f"p.{field_name}" for field_name in PRESSURE_FIELDS.values()])}
                FROM company_base b
                JOIN dependency_service_values d ON d.company_id = b.company_id
                JOIN pressure_service_values p ON p.company_id = b.company_id
            ),
            rolled AS (
                SELECT
                    hex_id,
                    local_authority_code,
                    coarse_category,
                    COUNT(*) AS company_count,
                    SUM(dep_score) AS total_dep_score,
                    SUM(press_score) AS total_press_score,
                    AVG(dep_score) AS mean_dep_score,
                    AVG(press_score) AS mean_press_score,
                    {dependency_columns},
                    {pressure_columns}
                FROM company_enriched
                GROUP BY hex_id, local_authority_code, coarse_category

                UNION ALL

                SELECT
                    hex_id,
                    local_authority_code,
                    '{ALL_CATEGORIES}' AS coarse_category,
                    COUNT(*) AS company_count,
                    SUM(dep_score) AS total_dep_score,
                    SUM(press_score) AS total_press_score,
                    AVG(dep_score) AS mean_dep_score,
                    AVG(press_score) AS mean_press_score,
                    {dependency_columns},
                    {pressure_columns}
                FROM company_enriched
                GROUP BY hex_id, local_authority_code

                UNION ALL

                SELECT
                    hex_id,
                    '{ALL_SCOTLAND}' AS local_authority_code,
                    coarse_category,
                    COUNT(*) AS company_count,
                    SUM(dep_score) AS total_dep_score,
                    SUM(press_score) AS total_press_score,
                    AVG(dep_score) AS mean_dep_score,
                    AVG(press_score) AS mean_press_score,
                    {dependency_columns},
                    {pressure_columns}
                FROM company_enriched
                GROUP BY hex_id, coarse_category

                UNION ALL

                SELECT
                    hex_id,
                    '{ALL_SCOTLAND}' AS local_authority_code,
                    '{ALL_CATEGORIES}' AS coarse_category,
                    COUNT(*) AS company_count,
                    SUM(dep_score) AS total_dep_score,
                    SUM(press_score) AS total_press_score,
                    AVG(dep_score) AS mean_dep_score,
                    AVG(press_score) AS mean_press_score,
                    {dependency_columns},
                    {pressure_columns}
                FROM company_enriched
                GROUP BY hex_id
            )
            SELECT * FROM rolled
            """
        )
        connection.execute("CREATE INDEX aggregate_rows_hex_idx ON aggregate_rows (hex_id)")
        connection.execute("CREATE INDEX aggregate_rows_filter_idx ON aggregate_rows (local_authority_code, coarse_category)")
        connection.commit()
    finally:
        connection.close()


def write_statistics_csv(workspace_db: Path) -> None:
    connection = sqlite3.connect(workspace_db)
    try:
        row = connection.execute(
            f"""
            SELECT
                '{ALL_SCOTLAND}' AS local_authority_code,
                '{ALL_CATEGORIES}' AS coarse_category,
                COUNT(*) AS company_count,
                SUM(dep_score) AS total_dep_score,
                SUM(press_score) AS total_press_score,
                AVG(dep_score) AS mean_dep_score,
                AVG(press_score) AS mean_press_score
            FROM company_base
            """
        ).fetchone()

        with OUTPUT_STATS_CSV.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow([
                "local_authority_code",
                "coarse_category",
                "company_count",
                "total_dep_score",
                "total_press_score",
                "mean_dep_score",
                "mean_press_score",
            ])
            writer.writerow(row)
    finally:
        connection.close()


def median(values: list[float]) -> float:
    ordered = sorted(values)
    size = len(ordered)
    midpoint = size // 2
    if size % 2 == 1:
        return ordered[midpoint]
    return (ordered[midpoint - 1] + ordered[midpoint]) / 2.0


def write_sector_summary_csv(workspace_db: Path) -> None:
    connection = sqlite3.connect(workspace_db)
    try:
        company_rows = connection.execute(
            """
            SELECT
                b.company_id,
                b.isic_section,
                b.coarse_category,
                b.dep_score,
                b.press_score,
                d.*, p.*
            FROM company_base b
            JOIN dependency_service_values d ON d.company_id = b.company_id
            JOIN pressure_service_values p ON p.company_id = b.company_id
            """
        ).fetchall()
        column_names = [description[0] for description in connection.execute(
            """
            SELECT
                b.company_id,
                b.isic_section,
                b.coarse_category,
                b.dep_score,
                b.press_score,
                d.*, p.*
            FROM company_base b
            JOIN dependency_service_values d ON d.company_id = b.company_id
            JOIN pressure_service_values p ON p.company_id = b.company_id
            LIMIT 0
            """
        ).description]

        group_scores: dict[tuple[str, str], dict[str, list[float]]] = defaultdict(lambda: {"dep": [], "press": []})
        dependency_service_totals: dict[tuple[str, str], Counter] = defaultdict(Counter)
        pressure_service_totals: dict[tuple[str, str], Counter] = defaultdict(Counter)

        for row in company_rows:
            record = dict(zip(column_names, row))
            section = record["isic_section"] or "Unclassified"
            coarse_category = record["coarse_category"] or "Unclassified"
            key = (section, coarse_category)
            group_scores[key]["dep"].append(float(record["dep_score"] or 0))
            group_scores[key]["press"].append(float(record["press_score"] or 0))

            for field_name in TEMP_DEPENDENCY_FIELDS.values():
                dependency_service_totals[key][field_name] += float(record[field_name] or 0)
            for field_name in PRESSURE_FIELDS.values():
                pressure_service_totals[key][field_name] += float(record[field_name] or 0)

        with OUTPUT_SECTOR_SUMMARY_CSV.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow([
                "ISIC Section",
                "Coarse Category",
                "company_count",
                "mean_dep_score",
                "median_dep_score",
                "mean_press_score",
                "median_press_score",
                "top_ecosystem_services",
                "top_pressures",
            ])

            for (section, coarse_category) in sorted(group_scores.keys()):
                dep_values = group_scores[(section, coarse_category)]["dep"]
                press_values = group_scores[(section, coarse_category)]["press"]
                top_dependency_fields = [
                    SERVICE_OUTPUT_LABELS[field_name]
                    for field_name, _ in dependency_service_totals[(section, coarse_category)].most_common(5)
                    if dependency_service_totals[(section, coarse_category)][field_name] > 0
                ]
                top_pressure_fields = [
                    SERVICE_OUTPUT_LABELS[field_name]
                    for field_name, _ in pressure_service_totals[(section, coarse_category)].most_common(5)
                    if pressure_service_totals[(section, coarse_category)][field_name] > 0
                ]
                writer.writerow([
                    section,
                    coarse_category,
                    len(dep_values),
                    sum(dep_values) / len(dep_values),
                    median(dep_values),
                    sum(press_values) / len(press_values),
                    median(press_values),
                    "; ".join(top_dependency_fields),
                    "; ".join(top_pressure_fields),
                ])
    finally:
        connection.close()


def export_aggregate_rows_csv(workspace_db: Path, aggregate_csv: Path) -> None:
    connection = sqlite3.connect(workspace_db)
    try:
        cursor = connection.execute("SELECT * FROM aggregate_rows")
        headers = [description[0] for description in cursor.description]
        with aggregate_csv.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(headers)
            writer.writerows(cursor)
    finally:
        connection.close()


def build_output_geopackage(workspace_db: Path) -> None:
    if OUTPUT_GPKG.exists():
        OUTPUT_GPKG.unlink()

    subprocess.run(
        [
            "ogr2ogr",
            "-f",
            "GPKG",
            str(OUTPUT_GPKG),
            str(SOURCE_HEX_GPKG),
            "grid",
            "-nln",
            "dashboard_hex_filter_aggregates",
        ],
        check=True,
    )

    connection = sqlite3.connect(OUTPUT_GPKG)
    try:
        trigger_names = [
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'dashboard_hex_filter_aggregates'"
            )
        ]
        for trigger_name in trigger_names:
            connection.execute(f'DROP TRIGGER IF EXISTS "{trigger_name}"')

        aggregate_columns = [
            "local_authority_code TEXT",
            "coarse_category TEXT",
            "company_count INTEGER",
            "total_dep_score REAL",
            "total_press_score REAL",
            "mean_dep_score REAL",
            "mean_press_score REAL",
        ] + [f"{field_name} REAL" for field_name in TEMP_DEPENDENCY_FIELDS.values()] + [
            f"{field_name} REAL" for field_name in PRESSURE_FIELDS.values()
        ]
        for column_sql in aggregate_columns:
            connection.execute(f"ALTER TABLE dashboard_hex_filter_aggregates ADD COLUMN {column_sql}")

        connection.execute("DELETE FROM dashboard_hex_filter_aggregates")
        connection.execute(f"ATTACH DATABASE '{SOURCE_HEX_GPKG}' AS source_hex")
        connection.execute(f"ATTACH DATABASE '{workspace_db}' AS workspace")

        output_columns = [
            "geom",
            "id",
            "left",
            "top",
            "right",
            "bottom",
            "row_index",
            "col_index",
            "hex_id",
            "local_authority_code",
            "coarse_category",
            "company_count",
            "total_dep_score",
            "total_press_score",
            "mean_dep_score",
            "mean_press_score",
        ] + list(TEMP_DEPENDENCY_FIELDS.values()) + list(PRESSURE_FIELDS.values())

        select_columns = [
            "g.geom",
            "g.id",
            "g.left",
            "g.top",
            "g.right",
            "g.bottom",
            "g.row_index",
            "g.col_index",
            "g.hex_id",
            "a.local_authority_code",
            "a.coarse_category",
            "a.company_count",
            "a.total_dep_score",
            "a.total_press_score",
            "a.mean_dep_score",
            "a.mean_press_score",
        ] + [f"a.{field_name}" for field_name in TEMP_DEPENDENCY_FIELDS.values()] + [
            f"a.{field_name}" for field_name in PRESSURE_FIELDS.values()
        ]

        connection.execute(
            f"""
            INSERT INTO dashboard_hex_filter_aggregates ({', '.join(output_columns)})
            SELECT {', '.join(select_columns)}
            FROM source_hex.grid g
            JOIN workspace.aggregate_rows a ON a.hex_id = g.hex_id
            """
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS dashboard_hex_filter_aggregates_filter_idx ON dashboard_hex_filter_aggregates (local_authority_code, coarse_category)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS dashboard_hex_filter_aggregates_hex_idx ON dashboard_hex_filter_aggregates (hex_id)"
        )
        connection.commit()
    finally:
        connection.close()


def validate_against_live_dashboard(workspace_db: Path) -> list[str]:
    issues: list[str] = []

    connection = sqlite3.connect(workspace_db)
    try:
        produced = connection.execute(
            f"""
            SELECT
                COUNT(*) AS company_count,
                SUM(dep_score) AS total_dep_score,
                SUM(press_score) AS total_press_score,
                AVG(dep_score) AS mean_dep_score,
                AVG(press_score) AS mean_press_score
            FROM company_base
            """
        ).fetchone()
    finally:
        connection.close()

    live_connection = sqlite3.connect(LIVE_HEX_GPKG)
    try:
        live = live_connection.execute(
            """
            SELECT
                SUM(company_count) AS company_count,
                SUM(company_count * mean_dep_score) AS total_dep_score,
                SUM(company_count * mean_press_score) AS total_press_score
            FROM dashboard_hex_master_complete__dashboard_hex_master
            """
        ).fetchone()
    finally:
        live_connection.close()

    if int(round(produced[0] or 0)) != int(round(live[0] or 0)):
        issues.append(
            f"company_count mismatch: produced={int(round(produced[0] or 0))}, live={int(round(live[0] or 0))}"
        )
    if int(round(produced[1] or 0)) != int(round(live[1] or 0)):
        issues.append(
            f"total_dep_score mismatch: produced={int(round(produced[1] or 0))}, live={int(round(live[1] or 0))}"
        )
    if int(round(produced[2] or 0)) != int(round(live[2] or 0)):
        issues.append(
            f"total_press_score mismatch: produced={int(round(produced[2] or 0))}, live={int(round(live[2] or 0))}"
        )

    return issues


def main() -> int:
    ensure_inputs_exist()

    OUTPUT_STATS_CSV.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_GPKG.parent.mkdir(parents=True, exist_ok=True)
    Path(__file__).resolve().parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="dashboard_filter_pipeline_") as temp_dir:
        workspace_db = Path(temp_dir) / "workspace.sqlite"

        log("Building postcode lookup...")
        postcode_lookup = build_postcode_lookup()

        log("Filtering company base..." )
        metrics, included_company_ids = build_filtered_company_base(postcode_lookup, workspace_db)
        load_company_id_set(included_company_ids, workspace_db)

        log("Collapsing dependency services to per-company max values...")
        build_dependency_service_values(workspace_db)

        log("Collapsing pressure services to per-company mean values...")
        build_pressure_service_values(workspace_db)

        log("Building aggregate rows with rollups...")
        build_rollup_aggregate_table(workspace_db)

        log("Writing summary CSV outputs...")
        write_statistics_csv(workspace_db)
        write_sector_summary_csv(workspace_db)

        log("Materializing output GeoPackage...")
        build_output_geopackage(workspace_db)

        issues = validate_against_live_dashboard(workspace_db)

    log("Done.")
    log(f"Included companies: {metrics['included_companies']}")
    log(f"Excluded dormant: {metrics['excluded_dormant']}")
    log(f"Excluded unscorable: {metrics['excluded_unscorable']}")
    log(f"Wrote: {OUTPUT_GPKG}")
    log(f"Wrote: {OUTPUT_STATS_CSV}")
    log(f"Wrote: {OUTPUT_SECTOR_SUMMARY_CSV}")
    if issues:
        log("Validation against current live dashboard: FAILED")
        for issue in issues:
            log(f"  - {issue}")
        return 1

    log("Validation against current live dashboard: PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())