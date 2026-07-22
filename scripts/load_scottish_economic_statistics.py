#!/usr/bin/env python3
"""Load and validate Scottish economic statistics from an XLSX workbook."""

from __future__ import annotations

import argparse
import json
import re
import zipfile
from collections import Counter
from pathlib import Path
import xml.etree.ElementTree as ET

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"

EXPECTED_COLUMNS = {
    "industry": "Industry",
    "annual_output": "Total Output (Direct and indirect)(\u00a3bn)",
    "employment": "Total Employment (Direct and Indirect)(FTE)",
}


def _letters_to_index(letters: str) -> int:
    result = 0
    for char in letters:
        result = (result * 26) + (ord(char) - ord("A") + 1)
    return result - 1


def _column_from_ref(cell_ref: str) -> int:
    letters = ""
    for char in cell_ref:
        if char.isalpha():
            letters += char
        else:
            break
    if not letters:
        raise ValueError(f"Invalid cell reference: {cell_ref}")
    return _letters_to_index(letters)


def _extract_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        xml_bytes = archive.read("xl/sharedStrings.xml")
    except KeyError:
        return []

    root = ET.fromstring(xml_bytes)
    values = []
    for si in root.findall(f"{{{NS_MAIN}}}si"):
        text_chunks = []
        for node in si.iter():
            if node.tag == f"{{{NS_MAIN}}}t":
                text_chunks.append(node.text or "")
        values.append("".join(text_chunks))
    return values


def _resolve_first_sheet_path(archive: zipfile.ZipFile) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    first_sheet = workbook.find(f"{{{NS_MAIN}}}sheets/{{{NS_MAIN}}}sheet")
    if first_sheet is None:
        raise ValueError("Workbook contains no sheets.")

    rel_id = first_sheet.attrib.get(f"{{{NS_REL}}}id")
    if not rel_id:
        raise ValueError("Unable to resolve first sheet relationship id.")

    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    for rel in rels.findall(f"{{{NS_PKG_REL}}}Relationship"):
        if rel.attrib.get("Id") == rel_id:
            target = rel.attrib.get("Target", "")
            if target.startswith("/"):
                return target.lstrip("/")
            return str(Path("xl") / target)

    raise ValueError("Unable to resolve first sheet target path.")


def _cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    value_node = cell.find(f"{{{NS_MAIN}}}v")

    if cell_type == "inlineStr":
        inline = cell.find(f"{{{NS_MAIN}}}is/{{{NS_MAIN}}}t")
        return (inline.text or "") if inline is not None else ""

    raw_value = value_node.text if value_node is not None and value_node.text is not None else ""

    if cell_type == "s":
        if raw_value == "":
            return ""
        index = int(raw_value)
        return shared_strings[index] if 0 <= index < len(shared_strings) else ""

    return raw_value


def _parse_first_sheet_rows(xlsx_path: Path) -> list[list[str]]:
    with zipfile.ZipFile(xlsx_path, "r") as archive:
        shared_strings = _extract_shared_strings(archive)
        sheet_path = _resolve_first_sheet_path(archive)
        sheet_xml = ET.fromstring(archive.read(sheet_path))

    rows = []
    for row_node in sheet_xml.findall(f"{{{NS_MAIN}}}sheetData/{{{NS_MAIN}}}row"):
        indexed_cells: dict[int, str] = {}
        max_index = -1

        for cell in row_node.findall(f"{{{NS_MAIN}}}c"):
            ref = cell.attrib.get("r", "")
            if not ref:
                continue
            idx = _column_from_ref(ref)
            indexed_cells[idx] = _cell_value(cell, shared_strings)
            if idx > max_index:
                max_index = idx

        if max_index < 0:
            rows.append([])
            continue

        row_values = [""] * (max_index + 1)
        for idx, value in indexed_cells.items():
            row_values[idx] = value
        rows.append(row_values)

    return rows


def _to_number(value: str):
    stripped = str(value or "")
    compact = stripped.strip()
    if compact == "":
        return None

    normalized = compact.replace(",", "")
    normalized = normalized.replace("\u00a3", "")
    normalized = normalized.replace("GBP", "")
    normalized = normalized.replace("gbp", "")
    normalized = re.sub(r"\\s+", "", normalized)

    try:
        return float(normalized)
    except ValueError:
        return "INVALID"


def load_scottish_economic_statistics(xlsx_path: Path) -> dict:
    rows = _parse_first_sheet_rows(xlsx_path)
    if not rows:
        raise ValueError("Spreadsheet is empty.")

    header = rows[0]
    detected_columns = [str(value or "") for value in header]

    def column_index(name: str) -> int:
        try:
            return detected_columns.index(name)
        except ValueError as exc:
            raise ValueError(f"Required column missing: {name}") from exc

    industry_idx = column_index(EXPECTED_COLUMNS["industry"])
    output_idx = column_index(EXPECTED_COLUMNS["annual_output"])
    employment_idx = column_index(EXPECTED_COLUMNS["employment"])

    parsed_rows = []
    duplicate_counter = Counter()
    missing_output_values = []
    missing_employment_values = []
    invalid_numeric_values = []

    for sheet_row_index, source_row in enumerate(rows[1:], start=2):
        def value_at(index: int) -> str:
            return source_row[index] if index < len(source_row) else ""

        industry_raw = value_at(industry_idx)
        output_raw = value_at(output_idx)
        employment_raw = value_at(employment_idx)

        if str(industry_raw).strip() == "" and str(output_raw).strip() == "" and str(employment_raw).strip() == "":
            continue

        annual_output = _to_number(output_raw)
        employment_fte = _to_number(employment_raw)

        industry_label = str(industry_raw)
        if industry_label.strip() != "":
            duplicate_counter[industry_label] += 1

        if annual_output is None:
            missing_output_values.append({"row": sheet_row_index, "industry": industry_label})
        elif annual_output == "INVALID":
            invalid_numeric_values.append({
                "row": sheet_row_index,
                "field": "annualOutputBn",
                "industry": industry_label,
                "rawValue": str(output_raw),
            })

        if employment_fte is None:
            missing_employment_values.append({"row": sheet_row_index, "industry": industry_label})
        elif employment_fte == "INVALID":
            invalid_numeric_values.append({
                "row": sheet_row_index,
                "field": "employmentFte",
                "industry": industry_label,
                "rawValue": str(employment_raw),
            })

        parsed_rows.append({
            "governmentIndustryLabel": industry_label,
            "annualOutputBn": None if annual_output in (None, "INVALID") else annual_output,
            "employmentFte": None if employment_fte in (None, "INVALID") else employment_fte,
        })

    duplicates = [
        {"governmentIndustryLabel": label, "count": count}
        for label, count in duplicate_counter.items()
        if count > 1
    ]

    validation = {
        "rowsLoaded": len(parsed_rows),
        "duplicateIndustryLabels": duplicates,
        "missingOutputValues": missing_output_values,
        "missingEmploymentValues": missing_employment_values,
        "invalidNumericValues": invalid_numeric_values,
    }

    return {
        "sourceFile": str(xlsx_path.as_posix()),
        "detectedColumns": detected_columns,
        "rows": parsed_rows,
        "validation": validation,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Load and validate Scottish economic statistics workbook.")
    parser.add_argument(
        "--input",
        default="Data/scottish_economic_statistics.csv.xlsx",
        help="Path to input XLSX workbook.",
    )
    parser.add_argument(
        "--output",
        default="Data/scottish_economic_statistics.validated.json",
        help="Path to output JSON artifact.",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    result = load_scottish_economic_statistics(input_path)
    output_path.write_text(json.dumps(result, ensure_ascii=True, indent=2), encoding="utf-8")

    print(json.dumps({
        "output": str(output_path.as_posix()),
        "rowsLoaded": result["validation"]["rowsLoaded"],
        "duplicateIndustryLabels": len(result["validation"]["duplicateIndustryLabels"]),
        "missingOutputValues": len(result["validation"]["missingOutputValues"]),
        "missingEmploymentValues": len(result["validation"]["missingEmploymentValues"]),
        "invalidNumericValues": len(result["validation"]["invalidNumericValues"]),
    }, ensure_ascii=True))


if __name__ == "__main__":
    main()
