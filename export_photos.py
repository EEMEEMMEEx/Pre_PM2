"""
NBTC Microwave — Pre-PM Photo Exporter
Utility script to extract photos stored as BLOBs in survey.db into the photos/ directory.
"""

import os
import sys
import json
import sqlite3
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
ONEDRIVE_DATA_DIR = Path(r"C:\Users\utai3\OneDrive\NBTC Microwave\Data")
DATA_DIR = ONEDRIVE_DATA_DIR if ONEDRIVE_DATA_DIR.exists() else ROOT_DIR

DB_PATH = DATA_DIR / "survey.db"
OUTPUT_DIR = DATA_DIR / "photos"


def export_photos_from_json(by_folder: bool = False):
    """Fallback export directly from data/surveys/*.json files."""
    import base64
    surveys_dir = ROOT_DIR / "data" / "surveys"
    if not surveys_dir.exists():
        print(f"[ERROR] Neither survey.db nor data/surveys/ found.")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(surveys_dir.glob("*.json"))
    print(f"[INFO] Exporting photos directly from {len(files)} survey JSON files to: {OUTPUT_DIR}\n")

    exported_count = 0
    for p in files:
        try:
            doc = json.loads(p.read_text(encoding="utf-8"))
            record_id = doc.get("recordId") or p.stem
            fields = doc.get("fields") or {}
            station_name = fields.get("station") or doc.get("station") or ""
            photos = doc.get("photos") or fields.get("photos") or []
            if not isinstance(photos, list):
                continue
            for idx, photo in enumerate(photos):
                raw_name = photo.get("name") or f"photo_{idx+1}.jpg"
                b64 = photo.get("base64Data") or (photo.get("url", "").split("base64,")[1] if "base64," in photo.get("url", "") else None) or (photo.get("dataUrl", "").split("base64,")[1] if "base64," in photo.get("dataUrl", "") else None)
                if not b64:
                    continue
                photo_bytes = base64.b64decode(b64)
                if by_folder:
                    target_dir = OUTPUT_DIR / record_id
                    target_dir.mkdir(parents=True, exist_ok=True)
                    dest_path = target_dir / raw_name
                else:
                    dest_path = OUTPUT_DIR / f"{record_id}_{raw_name}"
                dest_path.write_bytes(photo_bytes)
                exported_count += 1
                station_info = f" ({station_name})" if station_name else ""
                print(f"  [OK] Exported #{exported_count}: {dest_path.name}{station_info} [{len(photo_bytes)/1024:.1f} KB]")
        except Exception as e:
            print(f"  [WARN] Failed to process {p.name}: {e}")

    print(f"\n[SUCCESS] Successfully exported {exported_count} photo(s) from JSON records to '{OUTPUT_DIR}'.")


def export_photos(by_folder: bool = False):
    """
    Export photos from SQLite survey.db or fallback to data/surveys/*.json.
    
    :param by_folder: If True, organizes photos in subfolders named after record_id.
    """
    if not DB_PATH.exists():
        print(f"[INFO] Database file not found at {DB_PATH}. Falling back to data/surveys/*.json exporter.")
        export_photos_from_json(by_folder=by_folder)
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        query = """
            SELECT 
                p.id, 
                p.survey_id, 
                p.name, 
                p.content_type, 
                p.data, 
                s.record_id, 
                s.fields_json
            FROM survey_photos p
            LEFT JOIN surveys s ON p.survey_id = s.id
            ORDER BY p.id ASC
        """
        photos = cursor.execute(query).fetchall()

        if not photos:
            print("[INFO] No photos found in survey.db.")
            return

        print(f"[INFO] Found {len(photos)} photo(s) in survey.db. Exporting to: {OUTPUT_DIR}\n")

        exported_count = 0
        for row in photos:
            photo_id = row["id"]
            record_id = row["record_id"] or f"survey_{row['survey_id']}"
            raw_name = row["name"] or f"photo_{photo_id}.jpg"
            photo_data = row["data"]

            # Try to get station name from fields_json for context
            station_name = ""
            if row["fields_json"]:
                try:
                    fields = json.loads(row["fields_json"])
                    station_name = fields.get("station") or fields.get("stationSelect") or ""
                except Exception:
                    pass

            # Destination file path
            if by_folder:
                target_dir = OUTPUT_DIR / record_id
                target_dir.mkdir(parents=True, exist_ok=True)
                dest_path = target_dir / raw_name
            else:
                # Prepend record_id if filename might collide
                filename = f"{record_id}_{raw_name}" if record_id else raw_name
                dest_path = OUTPUT_DIR / filename

            # Write binary image data
            dest_path.write_bytes(photo_data)
            size_kb = len(photo_data) / 1024
            station_info = f" ({station_name})" if station_name else ""
            print(f"  [OK] Exported #{photo_id}: {dest_path.name}{station_info} [{size_kb:.1f} KB]")
            exported_count += 1

        print(f"\n[SUCCESS] Successfully exported {exported_count} photo(s) to '{OUTPUT_DIR}'.")

    finally:
        conn.close()


if __name__ == "__main__":
    # Support '--folder' flag to organize in subfolders
    by_folder = "--folder" in sys.argv
    export_photos(by_folder=by_folder)
