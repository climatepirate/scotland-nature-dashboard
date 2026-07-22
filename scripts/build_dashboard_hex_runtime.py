from __future__ import annotations

import json
import re
import sqlite3
import zipfile
from pathlib import Path
from typing import Iterable
import xml.etree.ElementTree as ET

import geopandas as gpd
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "Data"
CLEAN_GIS_DIR = ROOT / "CLEAN GIS"

DASHBOARD_MASTER_CSV = DATA_DIR / "dashboard_master.csv"
DEPENDENCY_INPUT_CSV = DATA_DIR / "company_ecosystem_service_long.csv"
PRESSURE_INPUT_CSV = DATA_DIR / "company_ecosystem_service_long_pressures.csv"
COMPANY_PROFILE_CSV = DATA_DIR / "company_integrated_profile.csv"
SOURCE_GPKG = CLEAN_GIS_DIR / "dashboard_hex_master_complete.gpkg"
SOURCE_LAYER = "dashboard_hex_master_complete__dashboard_hex_master"
QGIS_PROJECT = CLEAN_GIS_DIR / "CLEAN GIS.qgz"

OUTPUT_GPKG = CLEAN_GIS_DIR / "dashboard_hex_runtime.gpkg"
OUTPUT_SUMMARY_JSON = DATA_DIR / "dashboard_hex_runtime_summary.json"

GEOMETRY_LAYER = "dashboard_hex_geometry"
SUMMARY_TABLE = "dashboard_hex_filter_summary"
RUNTIME_LAYER = "dashboard_hex_runtime"

ALL_LOCAL_AUTHORITY = "__ALL__"
ALL_COARSE_CATEGORY = "__ALL__"

RATING_MAP = {
    "VL": 2.0,
    "L": 3.0,
    "M": 4.0,
    "H": 5.0,
    "VH": 6.0,
}

PRESSURE_RATING_MAP = {
    "VL": 4.0,
    "L": 5.0,
    "M": 7.0,
    "H": 9.0,
    "VH": 11.0,
}

PRESSURE_FIELD_ALIASES = {
    "avg_press_emissions_of_ghg": "Emissions of GHG",
    "avg_press_disturbances_e_g_noise_light": "Disturbances (e.g noise, light)",
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


def normalize_label(value: object) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


def label_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def token_set(value: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", value.lower()))


def jaccard_score(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def parse_qgs_root(qgz_path: Path) -> ET.Element:
    with zipfile.ZipFile(qgz_path) as zf:
        qgs_name = next(name for name in zf.namelist() if name.endswith(".qgs"))
        return ET.fromstring(zf.read(qgs_name))


def local_tag(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def child_text(layer: ET.Element, name: str) -> str:
    for child in layer:
        if local_tag(child.tag) == name:
            return child.text or ""
    return ""


def collect_renderer_contracts(root: ET.Element) -> dict[str, str]:
    contracts: dict[str, str] = {}
    for layer in root.iter():
        if local_tag(layer.tag) != "maplayer":
            continue

        datasource = child_text(layer, "datasource")
        if (
            "dashboard_hex_runtime.gpkg|layername=dashboard_hex_runtime" not in datasource
            and "dashboard_hex_master_complete.gpkg|layername=dashboard_hex_master_complete__dashboard_hex_master" not in datasource
        ):
            continue

        layer_name = child_text(layer, "layername")
        dashboard_field = ""
        for option in layer.iter():
            if local_tag(option.tag) == "Option" and option.attrib.get("name") == "dashboard_field":
                dashboard_field = option.attrib.get("value", "")
                break

        if dashboard_field:
            contracts[layer_name] = dashboard_field

    return contracts


def normalize_dependency_facts(dep_df: pd.DataFrame, valid_company_ids: set[str]) -> pd.DataFrame:
    working = dep_df.copy()
    working["company_id"] = working["company_id"].apply(normalize_company_id)
    working = working[(working["company_id"] != "") & (working["company_id"].isin(valid_company_ids))].copy()

    working["metric_name"] = working["Ecosystem Service"].apply(normalize_label)
    working["score_numeric"] = pd.to_numeric(working["Dependency_score_numeric"], errors="coerce")
    working["rating_norm"] = working["Rating"].apply(normalize_rating)
    working["rating_mapped_score"] = working["rating_norm"].map(RATING_MAP)

    working["value"] = working["score_numeric"]
    backfill_mask = working["value"].isna() & working["rating_mapped_score"].notna()
    working.loc[backfill_mask, "value"] = working.loc[backfill_mask, "rating_mapped_score"]

    ordered = working.sort_values(
        ["company_id", "metric_name", "value"],
        ascending=[True, True, False],
        na_position="last",
    )
    collapsed = ordered.drop_duplicates(subset=["company_id", "metric_name"], keep="first")
    return collapsed[["company_id", "metric_name", "value"]]


def normalize_pressure_facts(press_df: pd.DataFrame, valid_company_ids: set[str]) -> pd.DataFrame:
    working = press_df.copy()
    working["company_id"] = working["company_id"].apply(normalize_company_id)
    working = working[(working["company_id"] != "") & (working["company_id"].isin(valid_company_ids))].copy()

    name_col = "Pressure" if "Pressure" in working.columns else "Ecosystem Service"
    working["metric_name"] = working[name_col].apply(normalize_label)
    working["score_numeric"] = pd.to_numeric(working["Pressure_score_numeric"], errors="coerce")
    working["rating_norm"] = working["Rating"].apply(normalize_rating)
    working["rating_mapped_score"] = working["rating_norm"].map(PRESSURE_RATING_MAP)

    working["value"] = working["score_numeric"]
    backfill_mask = working["value"].isna() & working["rating_mapped_score"].notna()
    working.loc[backfill_mask, "value"] = working.loc[backfill_mask, "rating_mapped_score"]

    ordered = working.sort_values(
        ["company_id", "metric_name", "value"],
        ascending=[True, True, False],
        na_position="last",
    )
    collapsed = ordered.drop_duplicates(subset=["company_id", "metric_name"], keep="first")
    return collapsed[["company_id", "metric_name", "value"]]


def normalize_company_vulnerability(profile_df: pd.DataFrame, valid_company_ids: set[str]) -> pd.DataFrame:
    working = profile_df.copy()
    working["company_id"] = working["company_id"].apply(normalize_company_id)
    working = working[(working["company_id"] != "") & (working["company_id"].isin(valid_company_ids))].copy()

    for col in [
        "functional_vulnerability",
        "financial_vulnerability",
        "combined_vulnerability",
        "functional_consequence_score",
        "financial_consequence_score",
        "combined_consequence_score",
    ]:
        working[col] = pd.to_numeric(working[col], errors="coerce")

    return working[
        [
            "company_id",
            "functional_vulnerability",
            "financial_vulnerability",
            "combined_vulnerability",
            "functional_consequence_score",
            "financial_consequence_score",
            "combined_consequence_score",
        ]
    ]


def dominant_score_from_counts(low_count: int, moderate_count: int, high_count: int) -> float | None:
    counts = {
        1.0: int(low_count),
        2.0: int(moderate_count),
        3.0: int(high_count),
    }
    max_count = max(counts.values())
    if max_count <= 0:
        return None

    # Tie-break toward higher severity for precautionary spatial interpretation.
    winners = [score for score, count in counts.items() if count == max_count]
    return max(winners)


def field_mapping_for_type(
    renderer_contracts: dict[str, str],
    fact_names: Iterable[str],
    prefix: str,
    aliases: dict[str, str] | None = None,
) -> tuple[dict[str, str], dict[str, str]]:
    fact_names = list(fact_names)
    fact_by_key = {label_key(name): name for name in fact_names}
    fact_tokens = {name: token_set(name) for name in fact_names}
    aliases = aliases or {}

    mapping: dict[str, str] = {}
    unresolved: dict[str, str] = {}

    for layer_name, field_name in renderer_contracts.items():
        if not field_name.startswith(prefix):
            continue

        if field_name in aliases and aliases[field_name] in fact_tokens:
            mapping[field_name] = aliases[field_name]
            continue

        direct = fact_by_key.get(label_key(layer_name))
        if direct:
            mapping[field_name] = direct
            continue

        layer_tokens = token_set(layer_name)
        best_name = ""
        best_score = -1.0
        for fact_name, tokens in fact_tokens.items():
            score = jaccard_score(layer_tokens, tokens)
            if score > best_score:
                best_name = fact_name
                best_score = score

        if best_name and best_score > 0.30:
            mapping[field_name] = best_name
        else:
            unresolved[field_name] = layer_name

    return mapping, unresolved


def aggregate_scope(
    scope_name: str,
    company_dim: pd.DataFrame,
    dep_facts: pd.DataFrame,
    press_facts: pd.DataFrame,
    dep_field_map: dict[str, str],
    press_field_map: dict[str, str],
    dep_company_total: pd.DataFrame,
    press_company_total: pd.DataFrame,
    vulnerability_company: pd.DataFrame,
) -> pd.DataFrame:
    scope_config = {
        "all": {
            "group_keys": ["hex_id"],
            "local_authority_value": ALL_LOCAL_AUTHORITY,
            "coarse_category_value": ALL_COARSE_CATEGORY,
        },
        "la": {
            "group_keys": ["local_authority", "hex_id"],
            "local_authority_value": None,
            "coarse_category_value": ALL_COARSE_CATEGORY,
        },
        "category": {
            "group_keys": ["coarse_category", "hex_id"],
            "local_authority_value": ALL_LOCAL_AUTHORITY,
            "coarse_category_value": None,
        },
        "la_category": {
            "group_keys": ["local_authority", "coarse_category", "hex_id"],
            "local_authority_value": None,
            "coarse_category_value": None,
        },
    }

    config = scope_config[scope_name]
    group_keys = config["group_keys"]

    base = company_dim.groupby(group_keys, as_index=False).agg(company_count=("company_id", "nunique"))

    company_with_totals = company_dim.merge(dep_company_total, on="company_id", how="left").merge(
        press_company_total, on="company_id", how="left"
    )
    company_with_totals["company_dependency_total"] = company_with_totals["company_dependency_total"].fillna(0.0)
    company_with_totals["company_pressure_total"] = company_with_totals["company_pressure_total"].fillna(0.0)

    totals = company_with_totals.groupby(group_keys, as_index=False).agg(
        total_dependency_score=("company_dependency_total", "sum"),
        total_pressure_score=("company_pressure_total", "sum"),
    )

    company_with_vulnerability = company_dim.merge(vulnerability_company, on="company_id", how="left")
    vulnerability_means = company_with_vulnerability.groupby(group_keys, as_index=False).agg(
        mean_functional_vulnerability=("functional_vulnerability", "mean"),
        mean_financial_vulnerability=("financial_vulnerability", "mean"),
        mean_combined_vulnerability=("combined_vulnerability", "mean"),
        max_functional_consequence_score=("functional_consequence_score", "max"),
        max_financial_consequence_score=("financial_consequence_score", "max"),
        max_combined_consequence_score=("combined_consequence_score", "max"),
        functional_limited_count=("functional_consequence_score", lambda s: int((s == 1).sum())),
        functional_moderate_count=("functional_consequence_score", lambda s: int((s == 2).sum())),
        functional_severe_count=("functional_consequence_score", lambda s: int((s == 3).sum())),
        financial_limited_count=("financial_consequence_score", lambda s: int((s == 1).sum())),
        financial_moderate_count=("financial_consequence_score", lambda s: int((s == 2).sum())),
        financial_severe_count=("financial_consequence_score", lambda s: int((s == 3).sum())),
        combined_limited_count=("combined_consequence_score", lambda s: int((s == 1).sum())),
        combined_moderate_count=("combined_consequence_score", lambda s: int((s == 2).sum())),
        combined_severe_count=("combined_consequence_score", lambda s: int((s == 3).sum())),
    )

    vulnerability_means["dominant_functional_consequence_score"] = vulnerability_means.apply(
        lambda row: dominant_score_from_counts(
            row["functional_limited_count"],
            row["functional_moderate_count"],
            row["functional_severe_count"],
        ),
        axis=1,
    )
    vulnerability_means["dominant_financial_consequence_score"] = vulnerability_means.apply(
        lambda row: dominant_score_from_counts(
            row["financial_limited_count"],
            row["financial_moderate_count"],
            row["financial_severe_count"],
        ),
        axis=1,
    )
    vulnerability_means["dominant_combined_consequence_score"] = vulnerability_means.apply(
        lambda row: dominant_score_from_counts(
            row["combined_limited_count"],
            row["combined_moderate_count"],
            row["combined_severe_count"],
        ),
        axis=1,
    )

    dep_means = dep_facts.groupby(group_keys, as_index=False).agg(mean_dep_score=("value", "mean"))
    press_means = press_facts.groupby(group_keys, as_index=False).agg(mean_press_score=("value", "mean"))

    result = base.merge(totals, on=group_keys, how="left").merge(dep_means, on=group_keys, how="left").merge(
        press_means, on=group_keys, how="left"
    )
    result = result.merge(vulnerability_means, on=group_keys, how="left")

    for field_name, metric_name in dep_field_map.items():
        metric_df = dep_facts[dep_facts["metric_name"] == metric_name]
        agg = metric_df.groupby(group_keys, as_index=False).agg(**{field_name: ("value", "mean")})
        result = result.merge(agg, on=group_keys, how="left")

    for field_name, metric_name in press_field_map.items():
        metric_df = press_facts[press_facts["metric_name"] == metric_name]
        agg = metric_df.groupby(group_keys, as_index=False).agg(**{field_name: ("value", "mean")})
        result = result.merge(agg, on=group_keys, how="left")

    result["filter_scope"] = scope_name

    if config["local_authority_value"] is None:
        if "local_authority" not in result.columns:
            result["local_authority"] = ALL_LOCAL_AUTHORITY
    else:
        result["local_authority"] = config["local_authority_value"]

    if config["coarse_category_value"] is None:
        if "coarse_category" not in result.columns:
            result["coarse_category"] = ALL_COARSE_CATEGORY
    else:
        result["coarse_category"] = config["coarse_category_value"]

    ordered_cols = ["filter_scope", "local_authority", "coarse_category", "hex_id"]
    ordered_cols += [col for col in result.columns if col not in ordered_cols]
    result = result[ordered_cols]

    nullable_metric_cols = {
        "mean_functional_vulnerability",
        "mean_financial_vulnerability",
        "mean_combined_vulnerability",
        "max_functional_consequence_score",
        "max_financial_consequence_score",
        "max_combined_consequence_score",
        "dominant_functional_consequence_score",
        "dominant_financial_consequence_score",
        "dominant_combined_consequence_score",
    }
    metric_cols = [
        col
        for col in result.columns
        if col
        not in {
            "filter_scope",
            "local_authority",
            "coarse_category",
            "hex_id",
        }
    ]
    for col in metric_cols:
        numeric = pd.to_numeric(result[col], errors="coerce")
        if col in nullable_metric_cols:
            result[col] = numeric
        else:
            result[col] = numeric.fillna(0.0)

    result["company_count"] = result["company_count"].astype(int)
    return result


def register_attributes_table(conn: sqlite3.Connection, table_name: str) -> None:
    cur = conn.cursor()
    cur.execute("DELETE FROM gpkg_contents WHERE table_name = ?", (table_name,))
    cur.execute(
        """
        INSERT INTO gpkg_contents
        (table_name, data_type, identifier, description, last_change, min_x, min_y, max_x, max_y, srs_id)
        VALUES (?, 'attributes', ?, '', datetime('now'), NULL, NULL, NULL, NULL, NULL)
        """,
        (table_name, table_name),
    )
    conn.commit()


def main() -> int:
    failures: list[str] = []

    qgs_root = parse_qgs_root(QGIS_PROJECT)
    renderer_contracts = collect_renderer_contracts(qgs_root)
    if not renderer_contracts:
        failures.append("no renderer contracts were found in the QGIS project; cannot build per-service runtime metrics")

    dashboard_master = pd.read_csv(
        DASHBOARD_MASTER_CSV,
        dtype={
            "company_id": "string",
            "hex_id": "string",
            "local_authority_code": "string",
            "coarse_category": "string",
        },
    )
    dashboard_master["company_id"] = dashboard_master["company_id"].apply(normalize_company_id)
    dashboard_master["hex_id"] = dashboard_master["hex_id"].fillna("").astype(str).str.strip()
    dashboard_master["local_authority_code"] = dashboard_master["local_authority_code"].fillna("").astype(str).str.strip()
    dashboard_master["coarse_category"] = dashboard_master["coarse_category"].fillna("").astype(str).str.strip()

    company_dim = dashboard_master[
        (dashboard_master["company_id"] != "")
        & (dashboard_master["hex_id"] != "")
        & (dashboard_master["local_authority_code"] != "")
        & (dashboard_master["coarse_category"] != "")
    ][["company_id", "hex_id", "local_authority_code", "coarse_category"]].copy()
    company_dim = company_dim.drop_duplicates(subset=["company_id"])
    company_dim = company_dim.rename(columns={"local_authority_code": "local_authority"})

    valid_company_ids = set(company_dim["company_id"].tolist())

    dep_input = pd.read_csv(DEPENDENCY_INPUT_CSV)
    press_input = pd.read_csv(PRESSURE_INPUT_CSV)
    profile_input = pd.read_csv(COMPANY_PROFILE_CSV)
    dep_norm = normalize_dependency_facts(dep_input, valid_company_ids)
    press_norm = normalize_pressure_facts(press_input, valid_company_ids)
    vulnerability_company = normalize_company_vulnerability(profile_input, valid_company_ids)

    dep_facts = dep_norm.merge(company_dim, on="company_id", how="inner")
    press_facts = press_norm.merge(company_dim, on="company_id", how="inner")

    dep_company_total = dep_norm.groupby("company_id", as_index=False).agg(company_dependency_total=("value", "sum"))
    press_company_total = press_norm.groupby("company_id", as_index=False).agg(company_pressure_total=("value", "sum"))

    dep_field_map, dep_unresolved = field_mapping_for_type(
        renderer_contracts,
        dep_norm["metric_name"].dropna().unique().tolist(),
        "avg_dep_",
        aliases={},
    )
    press_field_map, press_unresolved = field_mapping_for_type(
        renderer_contracts,
        press_norm["metric_name"].dropna().unique().tolist(),
        "avg_press_",
        aliases=PRESSURE_FIELD_ALIASES,
    )

    unresolved_fields = {**dep_unresolved, **press_unresolved}
    if unresolved_fields:
        failures.append(f"unresolved renderer metric fields: {unresolved_fields}")

    summary_parts = []
    for scope in ["all", "la", "category", "la_category"]:
        summary_parts.append(
            aggregate_scope(
                scope,
                company_dim,
                dep_facts,
                press_facts,
                dep_field_map,
                press_field_map,
                dep_company_total,
                press_company_total,
                vulnerability_company,
            )
        )

    summary_df = pd.concat(summary_parts, ignore_index=True)
    summary_df = summary_df.drop_duplicates(subset=["filter_scope", "local_authority", "coarse_category", "hex_id"])

    summary_df["total_dep_score"] = summary_df["total_dependency_score"]
    summary_df["total_press_score"] = summary_df["total_pressure_score"]

    geom_source = gpd.read_file(SOURCE_GPKG, layer=SOURCE_LAYER)
    if "hex_id" not in geom_source.columns:
        failures.append("source geometry layer missing hex_id")

    hex_geom = geom_source[["hex_id", "geometry"]].copy()
    hex_geom["hex_id"] = hex_geom["hex_id"].fillna("").astype(str).str.strip()
    hex_geom = hex_geom[hex_geom["hex_id"] != ""].drop_duplicates(subset=["hex_id"]).reset_index(drop=True)

    runtime_df = summary_df.merge(hex_geom, on="hex_id", how="inner")
    runtime_gdf = gpd.GeoDataFrame(runtime_df, geometry="geometry", crs=hex_geom.crs)

    if OUTPUT_GPKG.exists():
        OUTPUT_GPKG.unlink()

    gpd.GeoDataFrame(hex_geom, geometry="geometry", crs=hex_geom.crs).to_file(OUTPUT_GPKG, layer=GEOMETRY_LAYER, driver="GPKG")
    runtime_gdf.to_file(OUTPUT_GPKG, layer=RUNTIME_LAYER, driver="GPKG", mode="a")

    conn = sqlite3.connect(OUTPUT_GPKG)
    summary_df.to_sql(SUMMARY_TABLE, conn, if_exists="replace", index=False)
    register_attributes_table(conn, SUMMARY_TABLE)
    conn.close()

    expected_total = int(len(company_dim))
    all_total = int(
        summary_df[
            (summary_df["filter_scope"] == "all")
            & (summary_df["local_authority"] == ALL_LOCAL_AUTHORITY)
            & (summary_df["coarse_category"] == ALL_COARSE_CATEGORY)
        ]["company_count"].sum()
    )
    if all_total != expected_total:
        failures.append(f"national company total mismatch: {all_total} != {expected_total}")

    la_expected = company_dim.groupby("local_authority", as_index=False).agg(company_count=("company_id", "nunique"))
    la_actual = (
        summary_df[summary_df["filter_scope"] == "la"]
        .groupby("local_authority", as_index=False)
        .agg(company_count=("company_count", "sum"))
    )
    la_compare = la_expected.merge(la_actual, on="local_authority", suffixes=("_expected", "_actual"), how="outer").fillna(0)
    if not (la_compare["company_count_expected"].astype(int) == la_compare["company_count_actual"].astype(int)).all():
        failures.append("LA-only totals do not match dashboard_master")

    cat_expected = company_dim.groupby("coarse_category", as_index=False).agg(company_count=("company_id", "nunique"))
    cat_actual = (
        summary_df[summary_df["filter_scope"] == "category"]
        .groupby("coarse_category", as_index=False)
        .agg(company_count=("company_count", "sum"))
    )
    cat_compare = cat_expected.merge(cat_actual, on="coarse_category", suffixes=("_expected", "_actual"), how="outer").fillna(0)
    if not (cat_compare["company_count_expected"].astype(int) == cat_compare["company_count_actual"].astype(int)).all():
        failures.append("category-only totals do not match dashboard_master")

    la_cat_expected = company_dim.groupby(["local_authority", "coarse_category"], as_index=False).agg(
        company_count=("company_id", "nunique")
    )
    la_cat_actual = (
        summary_df[summary_df["filter_scope"] == "la_category"]
        .groupby(["local_authority", "coarse_category"], as_index=False)
        .agg(company_count=("company_count", "sum"))
    )
    la_cat_compare = la_cat_expected.merge(
        la_cat_actual,
        on=["local_authority", "coarse_category"],
        suffixes=("_expected", "_actual"),
        how="outer",
    ).fillna(0)
    if not (la_cat_compare["company_count_expected"].astype(int) == la_cat_compare["company_count_actual"].astype(int)).all():
        failures.append("LA x category totals do not match dashboard_master")

    stage2_dep_total = float(dep_norm["value"].sum())
    stage2_press_total = float(press_norm["value"].sum())

    all_rows = summary_df[
        (summary_df["filter_scope"] == "all")
        & (summary_df["local_authority"] == ALL_LOCAL_AUTHORITY)
        & (summary_df["coarse_category"] == ALL_COARSE_CATEGORY)
    ]
    all_dep_total = float(all_rows["total_dependency_score"].sum())
    all_press_total = float(all_rows["total_pressure_score"].sum())

    if abs(stage2_dep_total - all_dep_total) > 1e-6:
        failures.append("national dependency total does not match Stage 2")
    if abs(stage2_press_total - all_press_total) > 1e-6:
        failures.append("national pressure total does not match Stage 2")

    duplicate_rows = int(summary_df.duplicated(subset=["filter_scope", "local_authority", "coarse_category", "hex_id"]).sum())
    if duplicate_rows != 0:
        failures.append(f"duplicate summary rows found: {duplicate_rows}")

    if int(hex_geom["hex_id"].nunique()) != int(len(hex_geom)):
        failures.append("geometry layer does not preserve one row per hex")

    metric_fields = [
        c
        for c in summary_df.columns
        if c
        not in {
            "filter_scope",
            "local_authority",
            "coarse_category",
            "hex_id",
        }
    ]

    vulnerability_fields = [
        "mean_functional_vulnerability",
        "mean_financial_vulnerability",
        "mean_combined_vulnerability",
        "max_functional_consequence_score",
        "max_financial_consequence_score",
        "max_combined_consequence_score",
        "dominant_functional_consequence_score",
        "dominant_financial_consequence_score",
        "dominant_combined_consequence_score",
    ]
    vulnerability_field_null_counts = {
        field: int(summary_df[field].isna().sum()) for field in vulnerability_fields if field in summary_df.columns
    }
    vulnerability_field_non_null_counts = {
        field: int(summary_df[field].notna().sum()) for field in vulnerability_fields if field in summary_df.columns
    }

    summary = {
        "output_file": str(OUTPUT_GPKG),
        "geometry_table": GEOMETRY_LAYER,
        "summary_table": SUMMARY_TABLE,
        "runtime_layer": RUNTIME_LAYER,
        "geometry_rows": int(len(hex_geom)),
        "summary_rows": int(len(summary_df)),
        "runtime_rows": int(len(runtime_gdf)),
        "filter_states": {
            "all": int((summary_df["filter_scope"] == "all").sum()),
            "la": int((summary_df["filter_scope"] == "la").sum()),
            "category": int((summary_df["filter_scope"] == "category").sum()),
            "la_category": int((summary_df["filter_scope"] == "la_category").sum()),
        },
        "renderer_fields_in_project": renderer_contracts,
        "dependency_field_mapping": dep_field_map,
        "pressure_field_mapping": press_field_map,
        "unresolved_renderer_fields": unresolved_fields,
        "metric_fields": metric_fields,
        "vulnerability_fields": vulnerability_fields,
        "vulnerability_field_null_counts": vulnerability_field_null_counts,
        "vulnerability_field_non_null_counts": vulnerability_field_non_null_counts,
        "stage2_dependency_total": stage2_dep_total,
        "stage2_pressure_total": stage2_press_total,
        "all_scope_dependency_total": all_dep_total,
        "all_scope_pressure_total": all_press_total,
        "company_total_expected": expected_total,
        "company_total_all_scope": all_total,
        "validation_failures": failures,
    }
    OUTPUT_SUMMARY_JSON.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    print("geometry_rows=", len(hex_geom))
    print("summary_rows=", len(summary_df))
    print("runtime_rows=", len(runtime_gdf))
    print("filter_states_all=", int((summary_df["filter_scope"] == "all").sum()))
    print("filter_states_la=", int((summary_df["filter_scope"] == "la").sum()))
    print("filter_states_category=", int((summary_df["filter_scope"] == "category").sum()))
    print("filter_states_la_category=", int((summary_df["filter_scope"] == "la_category").sum()))
    print("metric_fields=", len(metric_fields))
    print("validation_failures=", "none" if not failures else failures)

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
