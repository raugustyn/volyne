#!/usr/bin/env python3
"""Join the Volyn Excel sheet onto source points and write pie-chart values.

The viewer geojson keyval columns are shifted against the spreadsheet, so the
pies read this file instead of keyval.
"""

import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
XLSX = Path("/home/radek-augustyn/Desktop/Drozda/Volyn/Volyně - 4.1.2026_vyčištěná.xlsx")
GEOJSON = ROOT / "viewer/data/volyn_source.geojson"
OUT = ROOT / "viewer/data/source_pies.json"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# Column groups, in the same order as PIE_TYPES in viewer/js/map.js.
GROUPS = {
    "vek": ["N", "O", "P", "Q", "R", "S"],
    "zam": ["AM", "AN", "AO", "AP", "AQ", "AR", "AS"],
    "nar": ["AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK", "AL"],
    "dob": ["AT", "AU", "AV", "AW", "AX", "AY", "AZ", "BA", "BB"],
    "pud": ["CM", "CN", "CO", "CP", "CQ"],
    "osud": ["M", "W", "Y", "Z"],
}

EXPECTED = {
    "N": "0-14 let",
    "AA": "Češi",
    "AM": "inženýři, technici",
    "AT": "koně",
    "CM": "orná půda a zahrady",
    "M": "osob",
    "W": "osob",
    "Z": "osob",
}


def column_index(name):
    index = 0
    for char in name:
        index = index * 26 + ord(char) - 64
    return index


def column_name(index):
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def parse_number(raw):
    text = (raw or "").strip().replace(" ", "").replace(",", ".")
    if text in ("", "-"):
        return 0
    value = float(text)
    rounded = round(value)
    if abs(value - rounded) < 1e-6:
        return int(rounded)
    return round(value, 2)


def load_sheet(path):
    with zipfile.ZipFile(path) as archive:
        strings = []
        shared = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        for item in shared.findall(f"{NS}si"):
            strings.append("".join(text.text or "" for text in item.iter(f"{NS}t")))
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))

    def cell_value(cell):
        node = cell.find(f"{NS}v")
        if node is None or node.text is None:
            return ""
        if cell.attrib.get("t") == "s":
            return strings[int(node.text)]
        return node.text

    rows = {}
    for row in sheet.findall(f"{NS}sheetData/{NS}row"):
        cells = {}
        for cell in row.findall(f"{NS}c"):
            match = re.match(r"([A-Z]+)", cell.attrib["r"])
            cells[match.group(1)] = cell_value(cell)
        rows[int(row.attrib["r"])] = cells
    return rows


def main():
    rows = load_sheet(XLSX)
    headers = {}
    for row_number in (2, 5):
        for column, value in rows.get(row_number, {}).items():
            if value and column not in headers:
                headers[column] = value
    for column, expected in EXPECTED.items():
        found = ""
        for row_number in (2, 3, 4, 5):
            found = rows.get(row_number, {}).get(column) or found
        if expected not in found:
            raise SystemExit(f"{column} header {found!r} does not contain {expected!r}")

    records = {}
    district = ""
    municipality = ""
    for row_number in sorted(rows):
        cells = rows[row_number]
        if cells.get("A"):
            district = cells["A"].strip()
        if cells.get("B"):
            municipality = cells["B"].strip()
        name = cells.get("C", "").strip()
        if row_number < 8 or not name or name == "obec":
            continue
        key = (name, district, municipality)
        values = {
            group: [parse_number(cells.get(column, "")) for column in columns]
            for group, columns in GROUPS.items()
        }
        records.setdefault(key, []).append(values)

    geojson = json.loads(GEOJSON.read_text())
    output = {}
    missing = []
    for feature in geojson["features"]:
        props = feature["properties"]
        key = (props.get("name", "").strip(), props.get("district", "").strip(), props.get("municipality", "").strip())
        matches = records.get(key) or []
        if not matches:
            missing.append(key)
            continue
        output[str(props["id"])] = matches.pop(0)
    if missing:
        raise SystemExit(f"{len(missing)} source features without an Excel row, e.g. {missing[:5]}")
    OUT.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(output)} pies -> {OUT}")


if __name__ == "__main__":
    main()
