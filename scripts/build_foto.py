#!/usr/bin/env python3
"""Copy matched Volyn photographs into viewer/data/foto.

Only places with a single GeoJSON point are included. Each place becomes a
directory named "{id}_{adresar}". foto.json uses the same string as its key.
Captions come from the Word file. Loose images are copied; images embedded in
the document are extracted. A short heading in the Word file becomes a
subdirectory and is stored on the photo as "nadpis".
"""

import json
import re
import shutil
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "sources/volyn/fotografie_podklady"
OUT = ROOT / "viewer/data/foto"
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
VML = "{urn:schemas-microsoft-com:vml}"

# Leaf directory (relative to fotografie_podklady) -> source GeoJSON id.
# These are the places that matched one point.
PLACES = {
    "Bojarka": 19,
    "Boratín": 50,
    "Chomout": 5,
    "Dubno": 4,
    "Huště": 36,
    "Kupičov": 85,
    "Luck": 46,
    "Mirohošť": 10,
    "Mlynov": 28,
    "Moskovština": 29,
    "Mstěšín": 58,
    "Máslenka_Národní_muzeum": 27,
    "Podhájce": 32,
    "Roman/Michalovka": 150,
    "Roman/Mirotín": 308,
    "Roman/Mizoč": 283,
    "Roman/Novokrajev": 107,
    "Roman/Novosilky": 310,
    "Roman/Novostavce": 108,
    "Roman/Olšanka": 390,
    "Roman/Podlisky": 109,
    "Roman/Rovno": 152,
    "Roman/Semiduby": 237,
    "Roman/Senkevičovka": 176,
    "Roman/Staromylsk": 313,
    "Roman/Sviňuchy": 186,
    "Roman/Volkov": 269,
    "Roman/Zborov": 120,
    "Roman/Zdolbice": 318,
    "Roman/Zdolbunov": 319,
    "Roman/Zálesí": 317,
    "Roman/Závidov": 329,
    "Roman/Újezdce": 129,
    "Roman/Žitomír": 332,
    "Straklov": 15,
    "Ulbárov": 16,
}

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}


def paragraphs(docx):
    with zipfile.ZipFile(docx) as archive:
        xml = ET.fromstring(archive.read("word/document.xml"))
        rels = ET.fromstring(archive.read("word/_rels/document.xml.rels"))
        targets = {
            node.attrib["Id"]: node.attrib["Target"]
            for node in rels
            if node.attrib.get("Target")
        }
        rows = []
        body = xml.find(f"{W}body")
        for child in list(body):
            if child.tag != f"{W}p":
                continue
            text = "".join(node.text or "" for node in child.iter(f"{W}t")).strip()
            images = []
            for blip in child.iter(f"{A}blip"):
                rid = blip.attrib.get(f"{R}embed")
                if rid and rid in targets:
                    images.append(targets[rid])
            for imagedata in child.iter(f"{VML}imagedata"):
                rid = imagedata.attrib.get(f"{R}id")
                if rid and rid in targets:
                    images.append(targets[rid])
            if text or images:
                rows.append((text, images))
        blobs = {}
        for name in archive.namelist():
            if name.startswith("word/media/"):
                blobs[name] = archive.read(name)
                blobs[name.removeprefix("word/")] = blobs[name]
    return rows, blobs


def clean(text):
    return text.replace("\xa0", " ").replace("–", "–").replace("—", "—").strip()


def split_captions(text):
    text = clean(text)
    text = re.sub(r"^\d+\.\s*", "", text)
    parts = re.split(r"(?<=\S)(?=(?:NAD|H\s*8))", text, flags=re.I)
    return [part.strip() for part in parts if part.strip()]


def is_caption(text):
    return bool(re.match(r"(?:NAD|H\s*8)", clean(text), re.I))


def heading_and_caption(text):
    """Split 'Národní muzeum: H8-24010 …' into a heading plus a caption."""
    match = re.match(r"([^:]{1,40}):\s*((?:NAD|H\s*8).*)$", text, re.I)
    if not match or re.search(r"\d", match.group(1)):
        return None, text
    return match.group(1).strip(), match.group(2).strip()


def description_of(caption):
    match = re.match(r"^(?:NAD|H\s*8).*?(?:\s*:\s*|\s+[–—-]\s+)(.*)$", clean(caption), re.I)
    if match and match.group(1).strip():
        return match.group(1).strip()
    return clean(caption)


def stem_of(caption):
    match = re.match(
        r"^((?:H\s*8\s*[-_]?\s*\d+)|(?:NAD(?:[\w./-]| )*?))(?:\s*:\s*|\s+[–—-]\s+|\s+|$)",
        caption,
        re.I,
    )
    raw = match.group(1) if match else caption
    raw = re.sub(r"\s+", "", raw).replace("/", "-")
    raw = re.sub(r"[^0-9A-Za-z._-]", "", raw)
    return raw or "foto"


def code_of(text):
    """Return (kind, number, suffix) or None. kind is 'NAD' or 'H8'."""
    head = clean(text).split(":")[0]
    if re.match(r"H\s*8", head, re.I):
        h8 = re.search(r"H\s*8\s*[-_]?\s*(\d+)", head, re.I)
        if not h8:
            return None
        return ("H8", int(h8.group(1)), "")
    nad = re.search(r"NAD\s*[-_]?\s*1159\s*[-_]?\s*(.+)", head, re.I)
    if not nad:
        return None
    tokens = re.findall(r"\d+|[A-Za-z]+", nad.group(1))
    if tokens and tokens[0] == "1" and len(tokens) > 1 and tokens[1].isdigit():
        tokens = tokens[1:]
    if not tokens or not tokens[0].isdigit():
        return None
    suffix = "".join(tokens[1:]).lower()
    return ("NAD", int(tokens[0]), suffix)


def suffix_rank(caption_suffix, file_suffix):
    if caption_suffix == file_suffix:
        return 3
    if caption_suffix == "" or file_suffix == "":
        return 2
    longer, shorter = (file_suffix, caption_suffix) if len(file_suffix) >= len(caption_suffix) else (caption_suffix, file_suffix)
    if longer.startswith(shorter) and longer[len(shorter):].isalpha():
        return 2
    return 0


def pair_score(caption_code, file_code):
    if not caption_code or not file_code or caption_code[0] != file_code[0]:
        return 0
    cap_num, cap_suf = caption_code[1], caption_code[2]
    fil_num, fil_suf = file_code[1], file_code[2]
    suffix_bonus = suffix_rank(cap_suf, fil_suf)
    if not suffix_bonus:
        return 0
    if cap_num == fil_num:
        return 10 + suffix_bonus
    if 1000 <= cap_num <= 1999 and cap_num - 1000 == fil_num:
        return 5 + suffix_bonus
    if 1000 <= fil_num <= 1999 and fil_num - 1000 == cap_num:
        return 5 + suffix_bonus
    return 0


def safe_heading(text):
    cleaned = re.sub(r'[\\/:*?"<>|]+', " ", text).strip(" .")
    return cleaned


def place_key(geo_id, directory):
    return f"{geo_id}_{directory.replace('/', '_')}"


def build_place(directory, geo_id):
    folder = SOURCE / directory
    docx_files = sorted(folder.glob("*.docx"))
    if len(docx_files) != 1:
        raise SystemExit(f"{directory}: expected one Word file, found {len(docx_files)}")
    rows, blobs = paragraphs(docx_files[0])
    loose = sorted(
        path for path in folder.iterdir()
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )

    records = []
    notes = []
    heading = None
    seen_title = False
    for text, images in rows:
        chunks = split_captions(text) if text else [""]
        # An image-only paragraph belongs to the previous caption.
        if not text:
            if records:
                records[-1]["embedded"].extend(images)
            continue
        for index, chunk in enumerate(chunks):
            if not seen_title and index == 0 and not is_caption(chunk):
                seen_title = True
                continue
            section, caption = heading_and_caption(chunk)
            if section:
                heading = safe_heading(section)
            if is_caption(caption):
                records.append({
                    "popis": description_of(caption),
                    "stem": stem_of(caption),
                    "code": code_of(caption),
                    "nadpis": heading,
                    "embedded": list(images) if index == len(chunks) - 1 else [],
                    "files": [],
                })
            elif len(chunk) <= 40 and "," not in chunk and not chunk.endswith("."):
                heading = safe_heading(chunk)
            else:
                notes.append(chunk)

    best_for_file = {}
    for record in records:
        if record["embedded"]:
            continue
        for path in loose:
            score = pair_score(record["code"], code_of(path.stem))
            current = best_for_file.get(path)
            if score and (current is None or score > current[0]):
                best_for_file[path] = (score, record)
    for path, (score, record) in best_for_file.items():
        record["files"].append(path)
    for record in records:
        record["files"].sort(key=lambda path: path.name)

    unmatched_files = [path.name for path in loose if path not in best_for_file]
    for path in loose:
        if path in best_for_file:
            continue
        records.append({
            "popis": "",
            "stem": path.stem,
            "code": None,
            "nadpis": None,
            "embedded": [],
            "files": [path],
        })
    unmatched_captions = [
        record["popis"] for record in records
        if not record["embedded"] and not record["files"]
    ]
    return records, notes, blobs, unmatched_files, unmatched_captions


def write_place(directory, geo_id, records, notes, blobs):
    key = place_key(geo_id, directory)
    destination = OUT / key
    photos = []
    for record in records:
        names = []
        if record["embedded"]:
            for offset, media in enumerate(record["embedded"], start=1):
                blob = blobs.get(media)
                if blob is None:
                    raise SystemExit(f"{directory}: missing embedded image {media}")
                extension = Path(media).suffix.lower() or ".jpg"
                stem = record["stem"]
                if len(record["embedded"]) > 1:
                    stem = f"{stem}-{offset}"
                filename = f"{stem}{extension}"
                names.append(filename)
                target = destination
                if record["nadpis"]:
                    target = target / record["nadpis"]
                target.mkdir(parents=True, exist_ok=True)
                (target / filename).write_bytes(blob)
        for path in record["files"]:
            filename = path.name
            target = destination
            if record["nadpis"]:
                target = target / record["nadpis"]
            target.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target / filename)
            names.append(filename)
        for filename in names:
            relative = f"{record['nadpis']}/{filename}" if record["nadpis"] else filename
            photo = {"popis": record["popis"], "soubor": relative}
            if record["nadpis"]:
                photo["nadpis"] = record["nadpis"]
            photos.append(photo)
    if not photos:
        return None
    entry = {
        "id": geo_id,
        "adresar": directory,
        "fotografie": photos,
    }
    if notes:
        entry["poznamky"] = notes
    return key, entry


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    catalog = {}
    for directory, geo_id in PLACES.items():
        records, notes, blobs, unmatched_files, unmatched_captions = build_place(directory, geo_id)
        written = write_place(directory, geo_id, records, notes, blobs)
        label = place_key(geo_id, directory)
        if written:
            key, entry = written
            catalog[key] = entry
            print(f"{label}: {len(entry['fotografie'])} fotek")
        else:
            print(f"{label}: bez fotografie")
        for name in unmatched_files:
            print(f"  soubor bez popisu: {name}")
        for caption in unmatched_captions:
            print(f"  popis bez fotky: {caption[:110]}")
    (OUT / "foto.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"{len(catalog)} míst -> {OUT / 'foto.json'}")


if __name__ == "__main__":
    main()
