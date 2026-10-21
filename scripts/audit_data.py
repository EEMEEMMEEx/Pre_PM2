#!/usr/bin/env python3
"""ตรวจความสอดคล้องของข้อมูลสำรวจ 3 แหล่ง: ไฟล์ JSON, SQLite (survey.db), และ GitHub (read-only)

แหล่งข้อมูล:
  1. ไฟล์  data/surveys/*.json           (source of truth ที่ commit ขึ้น git)
  2. แถว   survey.db ตาราง surveys       (เปิดแบบ read-only เท่านั้น)
  3. listing  GitHub contents/data/surveys?ref=main  (public read)

ตัวอย่าง:
    python scripts/audit_data.py
    python scripts/audit_data.py --json
    python scripts/audit_data.py --no-github      # ตรวจเฉพาะในเครื่อง (ไม่ต่อเน็ต)

สคริปต์นี้ไม่เขียนข้อมูลใด ๆ ทั้งสิ้น — ใช้ประกอบ QA gate (งาน D5/D7)
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SURVEYS_DIR = ROOT / "data" / "surveys"
DB_PATH = ROOT / "survey.db"
GITHUB_LISTING = "https://api.github.com/repos/Thaidimaru/Pre_PM2/contents/data/surveys?ref=main"


def local_file_ids() -> set:
    if not SURVEYS_DIR.exists():
        return set()
    return {p.stem for p in SURVEYS_DIR.glob("*.json") if p.is_file()}


def db_ids() -> tuple:
    if not DB_PATH.exists():
        return None, set()
    uri = "file:%s?mode=ro&immutable=1" % DB_PATH.as_posix()
    conn = sqlite3.connect(uri, uri=True)
    try:
        rows = conn.execute("SELECT record_id FROM surveys").fetchall()
    finally:
        conn.close()
    return len(rows), {r[0] for r in rows}


def github_ids() -> set:
    req = urllib.request.Request(GITHUB_LISTING, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "prepm-audit-data",
    })
    with urllib.request.urlopen(req, timeout=20) as resp:
        items = json.loads(resp.read().decode("utf-8") or "[]")
    return {i["name"][:-5] for i in items if i.get("type") == "file" and i.get("name", "").endswith(".json")}


def main() -> int:
    parser = argparse.ArgumentParser(description="ตรวจความสอดคล้องข้อมูลสำรวจ 3 แหล่ง (read-only)")
    parser.add_argument("--no-github", action="store_true", help="ข้ามการตรวจ listing บน GitHub")
    parser.add_argument("--json", action="store_true", help="แสดงผลเป็น JSON")
    parser.add_argument("--limit", type=int, default=20, help="จำนวน id สูงสุดที่แสดงต่อกลุ่ม (ค่าเริ่มต้น 20)")
    args = parser.parse_args()

    files = local_file_ids()
    db_count, db = db_ids()
    gh = None
    gh_error = None
    if not args.no_github:
        try:
            gh = github_ids()
        except Exception as err:
            gh_error = str(err)

    report = {
        "files": len(files),
        "db_rows": db_count,
        "github_files": None if gh is None else len(gh),
        "github_error": gh_error,
        "only_in_db_will_be_pruned": sorted(db - files)[: args.limit],
        "only_in_db_total": len(db - files),
        "only_in_files_not_in_db": sorted(files - db)[: args.limit],
        "only_in_files_not_in_db_total": len(files - db),
    }
    if gh is not None:
        report["only_on_github_not_local"] = sorted(gh - files)[: args.limit]
        report["only_on_github_not_local_total"] = len(gh - files)
        report["local_not_on_github"] = sorted(files - gh)[: args.limit]
        report["local_not_on_github_total"] = len(files - gh)

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    print("files            = %d" % report["files"])
    print("db_rows          = %s" % report["db_rows"])
    print("github_files     = %s%s" % (report["github_files"], (" (error: %s)" % gh_error) if gh_error else ""))
    print("")
    print("ไฟล์หายแต่ยังอยู่ใน SQLite (startup prune จะลบ): %d" % report["only_in_db_total"])
    for rid in report["only_in_db_will_be_pruned"]:
        print("  - %s" % rid)
    print("")
    print("มีไฟล์แต่ยังไม่อยู่ใน SQLite (จะถูก seed เมื่อสตาร์ตเซิร์ฟเวอร์): %d" % report["only_in_files_not_in_db_total"])
    for rid in report["only_in_files_not_in_db"][:5]:
        print("  - %s" % rid)
    if gh is not None:
        print("")
        print("อยู่บน GitHub แต่ไม่มีในเครื่อง: %d" % report["only_on_github_not_local_total"])
        print("มีในเครื่องแต่ไม่อยู่บน GitHub: %d" % report["local_not_on_github_total"])
        for rid in report["local_not_on_github"][:5]:
            print("  - %s" % rid)
    return 0


if __name__ == "__main__":
    sys.exit(main())
