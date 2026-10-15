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


def export_photos(by_folder: bool = False):
    """
    Export photos from SQLite survey.db to photos/ folder.
    
    :param by_folder: If True, organizes photos in subfolders named after record_id.
    """
    if not DB_PATH.exists():
        print(f"[ERROR] Database file not found: {DB_PATH}")
        sys.exit(1)

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
