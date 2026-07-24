from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "scripts" / "pmtiles_build_config.json"


def log(message: str) -> None:
    print(f"[pmtiles-build] {message}", flush=True)


class BuildError(RuntimeError):
    pass


@dataclass
class ArtifactSpec:
    name: str
    source_gpkg: Path
    source_layer: str
    geometry_column: str
    expected_crs: str
    target_layer: str
    minzoom: int
    maxzoom: int
    required_fields: list[str]
    include_fields: list[str] | None
    include_all_fields: bool


@dataclass
class BuildConfig:
    output_dir: Path
    context_output_dir: Path
    temp_dir: Path | None
    context_geojson: list["ContextGeoJSONSpec"]
    artifacts: list[ArtifactSpec]


@dataclass
class ContextGeoJSONSpec:
    name: str
    source_path: Path
    source_layer: str
    output_file: str
    include_fields: list[str]
    simplify_tolerance: float | None


def run_cmd(args: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        cmd = " ".join(args)
        raise BuildError(
            f"Command failed ({result.returncode}): {cmd}\n"
            f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    return result


def assert_tools_available() -> None:
    required = ["ogr2ogr", "ogrinfo", "tippecanoe", "pmtiles"]
    missing = [tool for tool in required if shutil.which(tool) is None]
    if missing:
        raise BuildError(
            "Missing required external tools: "
            + ", ".join(missing)
            + ". Install GDAL (ogr2ogr/ogrinfo), Tippecanoe, and PMTiles CLI."
        )


def parse_config(path: Path) -> BuildConfig:
    payload = json.loads(path.read_text(encoding="utf-8"))
    output_dir = ROOT / payload["output_dir"]
    context_output_dir = ROOT / payload.get("context_output_dir", "dashboard_app/Data/context")

    temp_dir_value = payload.get("temp_dir")
    temp_dir = (ROOT / temp_dir_value) if temp_dir_value else None

    context_geojson: list[ContextGeoJSONSpec] = []
    for raw in payload.get("context_geojson", []):
        context_geojson.append(
            ContextGeoJSONSpec(
                name=raw["name"],
                source_path=ROOT / raw["source_path"],
                source_layer=raw["source_layer"],
                output_file=raw["output_file"],
                include_fields=list(raw.get("include_fields", [])),
                simplify_tolerance=float(raw["simplify_tolerance"]) if "simplify_tolerance" in raw else None,
            )
        )

    artifacts: list[ArtifactSpec] = []
    for raw in payload["artifacts"]:
        artifacts.append(
            ArtifactSpec(
                name=raw["name"],
                source_gpkg=ROOT / raw["source_gpkg"],
                source_layer=raw["source_layer"],
                geometry_column=raw.get("geometry_column", "geom"),
                expected_crs=raw.get("expected_crs", "EPSG:3857"),
                target_layer=raw["target_layer"],
                minzoom=int(raw.get("minzoom", 0)),
                maxzoom=int(raw.get("maxzoom", 12)),
                required_fields=list(raw.get("required_fields", [])),
                include_fields=list(raw["include_fields"]) if "include_fields" in raw else None,
                include_all_fields=bool(raw.get("include_all_fields", False)),
            )
        )

    return BuildConfig(
        output_dir=output_dir,
        context_output_dir=context_output_dir,
        temp_dir=temp_dir,
        context_geojson=context_geojson,
        artifacts=artifacts,
    )


def quote_ident(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def get_columns(conn: sqlite3.Connection, table_name: str) -> list[str]:
    pragma_sql = f"PRAGMA table_info({quote_ident(table_name)})"
    rows = conn.execute(pragma_sql).fetchall()
    return [row[1] for row in rows]


def get_geometry_meta(conn: sqlite3.Connection, table_name: str) -> tuple[str, str, int]:
    row = conn.execute(
        """
        SELECT column_name, geometry_type_name, srs_id
        FROM gpkg_geometry_columns
        WHERE table_name = ?
        """,
        (table_name,),
    ).fetchone()
    if row is None:
        raise BuildError(f"Layer {table_name} has no entry in gpkg_geometry_columns.")
    return str(row[0]), str(row[1]), int(row[2])


def get_epsg_label(conn: sqlite3.Connection, srs_id: int) -> str:
    row = conn.execute(
        """
        SELECT organization, organization_coordsys_id
        FROM gpkg_spatial_ref_sys
        WHERE srs_id = ?
        """,
        (srs_id,),
    ).fetchone()
    if row is None:
        return f"UNKNOWN:{srs_id}"
    org = str(row[0]).upper() if row[0] else "UNKNOWN"
    code = int(row[1]) if row[1] is not None else srs_id
    return f"{org}:{code}"


def get_row_count(conn: sqlite3.Connection, table_name: str) -> int:
    row = conn.execute(f"SELECT COUNT(*) FROM {quote_ident(table_name)}").fetchone()
    return int(row[0]) if row else 0


def count_invalid_geometries(source_gpkg: Path, layer: str, geom_col: str) -> int:
    sql = (
        f"SELECT COUNT(*) AS invalid_count FROM {quote_ident(layer)} "
        f"WHERE {quote_ident(geom_col)} IS NULL OR ST_IsEmpty({quote_ident(geom_col)}) "
        f"OR ST_IsValid({quote_ident(geom_col)}) = 0"
    )
    result = run_cmd(["ogrinfo", "-q", "-dialect", "SQLITE", str(source_gpkg), "-sql", sql])

    match = re.search(r"invalid_count\s*\([^)]*\)\s*=\s*([0-9]+)", result.stdout)
    if not match:
        raise BuildError(
            "Could not parse geometry validity output from ogrinfo. "
            "Ensure your GDAL build supports ST_IsValid in SQLITE dialect."
        )
    return int(match.group(1))


def build_select_sql(spec: ArtifactSpec, available_columns: list[str]) -> str:
    if spec.include_all_fields:
        return f"SELECT * FROM {quote_ident(spec.source_layer)}"

    if not spec.include_fields:
        raise BuildError(f"Artifact {spec.name} has neither include_all_fields nor include_fields configured.")

    missing = [field for field in spec.include_fields if field not in available_columns]
    if missing:
        raise BuildError(
            f"Artifact {spec.name} include_fields missing in source layer {spec.source_layer}: {missing}"
        )

    ordered = [spec.geometry_column] + spec.include_fields
    select_cols = ", ".join(quote_ident(col) for col in ordered)
    return f"SELECT {select_cols} FROM {quote_ident(spec.source_layer)}"


def export_temp_geojson(spec: ArtifactSpec, select_sql: str, output_path: Path) -> None:
    args = [
        "ogr2ogr",
        "-f",
        "GeoJSON",
        str(output_path),
        str(spec.source_gpkg),
        "-dialect",
        "SQLITE",
        "-sql",
        select_sql,
        "-t_srs",
        "EPSG:4326",
        "-nlt",
        "PROMOTE_TO_MULTI",
    ]
    run_cmd(args)

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise BuildError(f"Temporary export is empty for artifact {spec.name}: {output_path}")


def build_mbtiles(spec: ArtifactSpec, geojsonseq_path: Path, mbtiles_path: Path) -> None:
    args = [
        "tippecanoe",
        "--force",
        "--read-parallel",
        "--minimum-zoom",
        str(spec.minzoom),
        "--maximum-zoom",
        str(spec.maxzoom),
        "--layer",
        spec.target_layer,
        "--output",
        str(mbtiles_path),
        "--no-feature-limit",
        "--no-tile-size-limit",
        str(geojsonseq_path),
    ]
    run_cmd(args)

    if not mbtiles_path.exists() or mbtiles_path.stat().st_size == 0:
        raise BuildError(f"MBTiles output missing/empty for artifact {spec.name}: {mbtiles_path}")


def load_mbtiles_metadata(mbtiles_path: Path) -> dict[str, str]:
    conn = sqlite3.connect(mbtiles_path)
    try:
        rows = conn.execute("SELECT name, value FROM metadata").fetchall()
        return {str(k): str(v) for k, v in rows}
    finally:
        conn.close()


def validate_mbtiles(spec: ArtifactSpec, mbtiles_path: Path) -> None:
    metadata = load_mbtiles_metadata(mbtiles_path)
    if metadata.get("format") != "pbf":
        raise BuildError(f"MBTiles format is not pbf for artifact {spec.name}.")

    json_blob = metadata.get("json", "")
    if not json_blob:
        raise BuildError(f"MBTiles metadata json missing for artifact {spec.name}.")

    parsed = json.loads(json_blob)
    vector_layers = parsed.get("vector_layers", [])
    layer = next((item for item in vector_layers if item.get("id") == spec.target_layer), None)
    if layer is None:
        raise BuildError(
            f"MBTiles metadata does not contain expected vector layer {spec.target_layer} for artifact {spec.name}."
        )

    fields = set(layer.get("fields", {}).keys())
    required = set(spec.required_fields)
    missing_required = sorted(required - fields)
    if missing_required:
        raise BuildError(
            f"MBTiles layer {spec.target_layer} missing required fields for artifact {spec.name}: {missing_required}"
        )

    conn = sqlite3.connect(mbtiles_path)
    try:
        tile_rows = conn.execute("SELECT COUNT(*) FROM tiles").fetchone()
        tile_count = int(tile_rows[0]) if tile_rows else 0
    finally:
        conn.close()

    if tile_count == 0:
        raise BuildError(f"MBTiles has zero tiles for artifact {spec.name}.")


def list_layer_columns_vector(source_path: Path, source_layer: str) -> list[str]:
    result = run_cmd(["ogrinfo", "-so", str(source_path), source_layer])
    columns: list[str] = []
    for raw_line in result.stdout.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("Geometry:"):
            continue
        if line.startswith("Layer ") or line.startswith("Feature Count") or line.startswith("Extent"):
            continue
        if ":" not in line:
            continue

        left, _right = line.split(":", 1)
        field_name = left.strip()
        if field_name and field_name.replace("_", "").replace("-", "").isalnum():
            columns.append(field_name)
    return columns


def validate_context_spec(spec: ContextGeoJSONSpec) -> None:
    if not spec.source_path.exists():
        raise BuildError(f"Context source does not exist for {spec.name}: {spec.source_path}")

    if not re.fullmatch(r"[a-z0-9_]+\.geojson", spec.output_file):
        raise BuildError(
            f"Context output file must be stable lowercase snake_case .geojson for {spec.name}: {spec.output_file}"
        )

    source_columns = list_layer_columns_vector(spec.source_path, spec.source_layer)
    missing = [field for field in spec.include_fields if field not in source_columns]
    if missing:
        raise BuildError(
            f"Context layer {spec.name} is missing configured fields in {spec.source_layer}: {missing}"
        )


def build_context_geojson(spec: ContextGeoJSONSpec, output_dir: Path) -> dict[str, Any]:
    validate_context_spec(spec)

    output_path = output_dir / spec.output_file
    args = [
        "ogr2ogr",
        "-overwrite",
        "-f",
        "GeoJSON",
        str(output_path),
        str(spec.source_path),
        spec.source_layer,
        "-t_srs",
        "EPSG:4326",
        "-nlt",
        "PROMOTE_TO_MULTI",
        "-makevalid",
        "-lco",
        "RFC7946=YES",
        "-lco",
        "COORDINATE_PRECISION=6",
    ]

    if spec.include_fields:
        args.extend(["-select", ",".join(spec.include_fields)])

    if spec.simplify_tolerance is not None and spec.simplify_tolerance > 0:
        args.extend(["-simplify", str(spec.simplify_tolerance)])

    run_cmd(args)

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise BuildError(f"Context GeoJSON output missing/empty for {spec.name}: {output_path}")

    return {
        "name": spec.name,
        "source_path": str(spec.source_path.relative_to(ROOT)),
        "source_layer": spec.source_layer,
        "output_geojson": str(output_path.relative_to(ROOT)),
        "geojson_bytes": output_path.stat().st_size,
        "fields": spec.include_fields,
        "simplify_tolerance": spec.simplify_tolerance,
    }


def convert_to_pmtiles(mbtiles_path: Path, pmtiles_path: Path) -> None:
    if pmtiles_path.exists():
        pmtiles_path.unlink()

    run_cmd(["pmtiles", "convert", str(mbtiles_path), str(pmtiles_path)])

    if not pmtiles_path.exists() or pmtiles_path.stat().st_size == 0:
        raise BuildError(f"PMTiles output missing/empty: {pmtiles_path}")


def validate_artifact_source(spec: ArtifactSpec) -> tuple[list[str], int]:
    if not spec.source_gpkg.exists():
        raise BuildError(f"Source GeoPackage does not exist: {spec.source_gpkg}")

    conn = sqlite3.connect(spec.source_gpkg)
    try:
        if not table_exists(conn, spec.source_layer):
            raise BuildError(f"Layer {spec.source_layer} not found in {spec.source_gpkg}")

        columns = get_columns(conn, spec.source_layer)
        if not columns:
            raise BuildError(f"No columns discovered for layer {spec.source_layer} in {spec.source_gpkg}")

        missing_required = [field for field in spec.required_fields if field not in columns]
        if missing_required:
            raise BuildError(
                f"Source layer {spec.source_layer} missing required fields for artifact {spec.name}: {missing_required}"
            )

        geom_col, geom_type, srs_id = get_geometry_meta(conn, spec.source_layer)
        if geom_col != spec.geometry_column:
            raise BuildError(
                f"Configured geometry_column={spec.geometry_column} does not match GPKG geometry column {geom_col} "
                f"for layer {spec.source_layer}"
            )

        geometry_upper = geom_type.upper()
        if "POLYGON" not in geometry_upper:
            raise BuildError(
                f"Unsupported geometry type for artifact {spec.name}: {geom_type}. Expected Polygon/MultiPolygon."
            )

        epsg_label = get_epsg_label(conn, srs_id)
        if epsg_label.upper() != spec.expected_crs.upper():
            raise BuildError(
                f"CRS mismatch for artifact {spec.name}: expected {spec.expected_crs}, found {epsg_label}"
            )

        row_count = get_row_count(conn, spec.source_layer)
        if row_count <= 0:
            raise BuildError(f"Source layer {spec.source_layer} has zero rows.")

        return columns, row_count
    finally:
        conn.close()


def build_artifact(spec: ArtifactSpec, output_dir: Path, temp_workspace: Path) -> dict[str, Any]:
    log(f"[{spec.name}] validating source layer {spec.source_layer}")
    columns, row_count = validate_artifact_source(spec)

    log(f"[{spec.name}] checking geometry validity")
    invalid_count = count_invalid_geometries(spec.source_gpkg, spec.source_layer, spec.geometry_column)
    if invalid_count > 0:
        raise BuildError(
            f"Artifact {spec.name} has {invalid_count} invalid/empty geometries in source layer {spec.source_layer}."
        )

    select_sql = build_select_sql(spec, columns)

    temp_geojson = temp_workspace / f"{spec.name}.geojson"
    temp_mbtiles = temp_workspace / f"{spec.name}.mbtiles"
    output_pmtiles = output_dir / f"{spec.name}.pmtiles"

    log(f"[{spec.name}] exporting temporary GeoJSON with reprojection to EPSG:4326")
    export_temp_geojson(spec, select_sql, temp_geojson)

    log(f"[{spec.name}] building MBTiles via Tippecanoe")
    build_mbtiles(spec, temp_geojson, temp_mbtiles)

    log(f"[{spec.name}] validating MBTiles metadata and required fields")
    validate_mbtiles(spec, temp_mbtiles)

    log(f"[{spec.name}] converting MBTiles to PMTiles")
    convert_to_pmtiles(temp_mbtiles, output_pmtiles)

    return {
        "name": spec.name,
        "source_gpkg": str(spec.source_gpkg.relative_to(ROOT)),
        "source_layer": spec.source_layer,
        "target_layer": spec.target_layer,
        "row_count": row_count,
        "pmtiles": str(output_pmtiles.relative_to(ROOT)),
        "pmtiles_bytes": output_pmtiles.stat().st_size,
    }


def build_all(config: BuildConfig) -> dict[str, Any]:
    assert_tools_available()

    config.output_dir.mkdir(parents=True, exist_ok=True)
    config.context_output_dir.mkdir(parents=True, exist_ok=True)

    if config.temp_dir:
        config.temp_dir.mkdir(parents=True, exist_ok=True)
        temp_context = tempfile.TemporaryDirectory(dir=str(config.temp_dir))
    else:
        temp_context = tempfile.TemporaryDirectory()

    with temp_context as temp_path:
        temp_workspace = Path(temp_path)
        log(f"Using temporary workspace: {temp_workspace}")

        artifact_summaries: list[dict[str, Any]] = []
        for spec in config.artifacts:
            artifact_summaries.append(build_artifact(spec, config.output_dir, temp_workspace))

        context_summaries: list[dict[str, Any]] = []
        for spec in config.context_geojson:
            log(f"[{spec.name}] exporting static context GeoJSON")
            context_summaries.append(build_context_geojson(spec, config.context_output_dir))

    summary = {
        "output_dir": str(config.output_dir.relative_to(ROOT)),
        "context_output_dir": str(config.context_output_dir.relative_to(ROOT)),
        "artifacts": artifact_summaries,
        "context_geojson": context_summaries,
    }
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Build PMTiles artifacts from GeoPackage sources.")
    parser.add_argument(
        "--config",
        default=str(DEFAULT_CONFIG),
        help="Path to the PMTiles build config JSON.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.is_absolute():
        config_path = (ROOT / config_path).resolve()

    if not config_path.exists():
        print(f"Config file not found: {config_path}", file=sys.stderr)
        return 2

    try:
        config = parse_config(config_path)
        summary = build_all(config)
        log("Build completed successfully.")
        print(json.dumps(summary, indent=2))
        return 0
    except BuildError as exc:
        print(f"PMTiles build failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
