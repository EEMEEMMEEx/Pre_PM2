#!/usr/bin/env python3
"""สแกนหาข้อมูลส่วนบุคคล (PII) ในแหล่งข้อมูลของโปรเจกต์ (read-only)

ตรวจ:
  1. data/surveys/*.json            — ฟิลด์ติดต่อผู้ให้ข้อมูล/ประชาชน
  2. DATABASE.xlsx, AGWBS.xlsx       — master data สถานี (อ่านผ่าน database.DatabaseService._read_xlsx_rows)
  3. survey.db (ตาราง surveys)       — เปิดแบบ read-only
  4. snapshot สาธารณะบน Cloudflare R2 — /api/dashboard, /api/database, /api/onedrive-status, /api/github-status
  5. bundle ที่ใช้งานจริง             — ตรวจ pattern ของ credential ที่ไม่ควรมี

ตัวอย่าง:
    python scripts/pii_scan.py
    python scripts/pii_scan.py --json
    python scripts/pii_scan.py --no-network      # เฉพาะข้อมูลในเครื่อง

สคริปต์นี้ไม่เขียนข้อมูลใด ๆ — ใช้ประกอบงาน D4 (PII inventory) และ QA gate D7
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SURVEYS_DIR = ROOT / "data" / "surveys"
DB_PATH = ROOT / "survey.db"
R2_BASE = "https://pub-bc30fda8b7654fa09add325ab0f468e0.r2.dev"

# ฟิลด์ที่มีข้อมูลส่วนบุคคลในไฟล์สำรวจ (ตรงกับ PUBLIC_DASHBOARD_PII_FIELDS ใน deploy_r2.py + village)
SURVEY_PII_FIELDS = ("contactName", "contactPosition", "contactPhone", "informantName", "contactVillage")
STATION_PII_FIELDS = ("contact_name", "contact_position", "contact_phone", "house_no")
SECRET_PATTERNS = (
    ("github_oauth", re.compile(r"gho_[A-Za-z0-9]{20,}")),
    ("github_classic", re.compile(r"ghp_(?!x{10,})[A-Za-z0-9]{20,}")),
    ("github_finegrained", re.compile(r"github_pat_[A-Za-z0-9_]{20,}")),
    ("aws_key", re.compile(r"AKIA[0-9A-Z]{16}")),
)


def mask(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if len(text) <= 4:
        return "*" * len(text)
    return text[:2] + "*" * max(1, len(text) - 4) + text[-2:]


def scan_surveys() -> dict:
    result = {"files": 0, "with_any_pii": 0, "field_counts": Counter(), "samples": []}
    if not SURVEYS_DIR.exists():
        return result
    for path in sorted(SURVEYS_DIR.glob("*.json")):
        if not path.is_file():
            continue
        result["files"] += 1
        try:
            record = json.loads(path.read_text(encoding="utf-8-sig"))
        except Exception:
            continue
        fields = record.get("fields") or {}
        hit = False
        for key in SURVEY_PII_FIELDS:
            value = fields.get(key)
            if value:
                result["field_counts"][key] += 1
                hit = True
                if len(result["samples"]) < 5:
                    result["samples"].append({"file": path.name, "field": key, "masked": mask(value)})
        if hit:
            result["with_any_pii"] += 1
    result["field_counts"] = dict(result["field_counts"])
    return result


def scan_workbook(name: str) -> dict:
    path = ROOT / name
    if not path.exists():
        return {"exists": False}
    try:
        sys.path.insert(0, str(ROOT))
        from database import DatabaseService  # import แบบอ่านข้อมูลเท่านั้น ไม่เรียก initialize()

        rows = DatabaseService._read_xlsx_rows(path)
    except Exception as err:
        return {"exists": True, "error": str(err)}
    # DATABASE.xlsx มีแถวชื่อเรื่อง (merged) อยู่บนหัว → หา header จริง = แถวแรกที่มีช่องไม่ว่าง >= 3 ช่อง
    header_idx = 0
    for idx, row in enumerate(rows[:6]):
        filled = [c for c in row if str(c).strip()]
        if len(filled) >= 3:
            header_idx = idx
            break
    header = [str(h).strip() for h in (rows[header_idx] if rows else [])]
    body = rows[header_idx + 1:] if len(rows) > header_idx + 1 else []
    counts = {}
    for idx, col in enumerate(header):
        vals = [r[idx] for r in body if idx < len(r) and str(r[idx]).strip()]
        if vals:
            counts[col or ("col%d" % idx)] = len(vals)
    return {"exists": True, "rows": len(body), "columns_with_values": counts}


def scan_db() -> dict:
    if not DB_PATH.exists():
        return {"exists": False}
    uri = "file:%s?mode=ro&immutable=1" % DB_PATH.as_posix()
    conn = sqlite3.connect(uri, uri=True)
    try:
        total = conn.execute("SELECT COUNT(*) FROM surveys").fetchone()[0]
        counts = Counter()
        for (fields_json,) in conn.execute("SELECT fields_json FROM surveys"):
            try:
                fields = json.loads(fields_json or "{}")
            except Exception:
                continue
            for key in SURVEY_PII_FIELDS:
                if fields.get(key):
                    counts[key] += 1
        return {"exists": True, "rows": total, "field_counts": dict(counts)}
    finally:
        conn.close()


def fetch(path: str) -> tuple:
    req = urllib.request.Request(R2_BASE + path, headers={"User-Agent": "prepm-pii-scan"})
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except Exception as err:
        return None, str(err)


def scan_public_snapshots() -> dict:
    out = {}
    for label, path in (
        ("dashboard", "/api/dashboard"),
        ("stations", "/api/database"),
        ("onedrive_status", "/api/onedrive-status"),
        ("github_status", "/api/github-status"),
    ):
        status, body = fetch(path)
        entry = {"status": status, "bytes": len(body) if status else 0}
        if status == 200:
            entry["survey_pii_keys"] = [k for k in SURVEY_PII_FIELDS if '"%s"' % k in body]
            entry["station_pii_keys"] = [k for k in STATION_PII_FIELDS if '"%s"' % k in body]
            entry["personal_markers"] = [m for m in ("@gmail.com", "/Users/", "/home/runner", "utai323") if m in body]
        out[label] = entry
    return out


def scan_bundle() -> dict:
    status, html = fetch("/index.html")
    if status != 200:
        return {"status": status, "error": html[:120]}
    match = re.search(r"assets/index-[\w-]+\.js", html)
    if not match:
        return {"status": status, "error": "ไม่พบ bundle ใน index.html"}
    asset = match.group(0)
    bstatus, bundle = fetch("/" + asset)
    findings = []
    if bstatus == 200:
        for name, pattern in SECRET_PATTERNS:
            hits = pattern.findall(bundle)
            if hits:
                findings.append({"pattern": name, "count": len(hits), "sample_masked": mask(hits[0][:24])})
    return {"status": bstatus, "asset": asset, "bytes": len(bundle) if bstatus == 200 else 0, "secret_findings": findings}


def main() -> int:
    parser = argparse.ArgumentParser(description="สแกน PII ในแหล่งข้อมูลและ snapshot สาธารณะ (read-only)")
    parser.add_argument("--json", action="store_true", help="แสดงผลเป็น JSON")
    parser.add_argument("--no-network", action="store_true", help="ไม่ตรวจ snapshot/bundle บน Cloudflare R2")
    args = parser.parse_args()

    report = {
        "surveys": scan_surveys(),
        "workbooks": {name: scan_workbook(name) for name in ("DATABASE.xlsx", "AGWBS.xlsx")},
        "sqlite": scan_db(),
    }
    if not args.no_network:
        report["public_snapshots"] = scan_public_snapshots()
        report["bundle"] = scan_bundle()

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    surveys = report["surveys"]
    print("== data/surveys ==")
    print("ไฟล์ %d · มี PII อย่างน้อย 1 ฟิลด์ %d ไฟล์" % (surveys["files"], surveys["with_any_pii"]))
    for key, count in sorted(surveys["field_counts"].items(), key=lambda kv: -kv[1]):
        print("  %-16s %d ไฟล์" % (key, count))
    for sample in surveys["samples"]:
        print("  ตัวอย่าง: %s → %s = %s" % (sample["file"], sample["field"], sample["masked"]))
    print("")
    print("== SQLite (survey.db) ==")
    db = report["sqlite"]
    if db.get("exists"):
        print("แถว %d" % db["rows"])
        for key, count in sorted(db["field_counts"].items(), key=lambda kv: -kv[1]):
            print("  %-16s %d แถว" % (key, count))
    else:
        print("ไม่พบ survey.db")
    print("")
    print("== XLSX ==")
    for name, info in report["workbooks"].items():
        if not info.get("exists"):
            print("%s: ไม่พบ" % name)
            continue
        if info.get("error"):
            print("%s: อ่านไม่ได้ (%s)" % (name, info["error"][:80]))
            continue
        cols = info["columns_with_values"]
        contact_cols = {k: v for k, v in cols.items() if any(t in k for t in ("ชื่อ", "โทร", "ตำแหน่ง", "บ้านเลขที่"))}
        print("%s: %d แถว · คอลัมน์ที่มีค่า %d · คอลัมน์ติดต่อ %s" % (name, info["rows"], len(cols), contact_cols or "ไม่พบ"))
    if "public_snapshots" in report:
        print("")
        print("== snapshot สาธารณะ (Cloudflare R2) ==")
        for label, info in report["public_snapshots"].items():
            line = "%-16s HTTP %s" % (label, info["status"])
            if info.get("survey_pii_keys") is not None:
                line += " | survey PII keys=%s" % (info["survey_pii_keys"] or "ไม่มี")
            if info.get("station_pii_keys") is not None:
                line += " | station PII keys=%s" % (info["station_pii_keys"] or "ไม่มี")
            if info.get("personal_markers"):
                line += " | markers=%s" % info["personal_markers"]
            print(line)
        bundle = report["bundle"]
        print("bundle %s HTTP %s · %s bytes · secret findings=%s" % (
            bundle.get("asset", "-"), bundle.get("status"), bundle.get("bytes", 0), bundle.get("secret_findings") or "ไม่มี"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
