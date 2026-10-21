"""
ตรวจ snapshot ที่จะฝังใน artifact ของ GitHub Pages (v2.11.6)

ใช้ใน CI หลัง 'python deploy_r2.py --write-snapshots dist' เพื่อ fail fast
ถ้า snapshot ไม่ถูกสร้าง หรือไม่มีข้อมูลจริง (ซึ่งจะทำให้หน้า Pages แสดง 0 อีกครั้ง)

ทำงานด้วย Python stdlib เท่านั้น — ไม่ต้องพึ่ง dependency ใด ๆ

Exit code:
  0 = ผ่าน
  1 = ไม่ผ่าน (ไฟล์ขาด / ไม่มีข้อมูล / PII หลุด)
"""

import json
import sys
from pathlib import Path

# snapshot ที่แอปยิงหาบน static host (r2.dev และ GitHub Pages)
REQUIRED_SNAPSHOTS = (
    "api/dashboard",
    "api/database",
    "api/github-status",
    "api/onedrive-status",
)

# ฟิลด์ติดต่อของประชาชน — ต้องไม่หลุดลงไฟล์ที่ทุกคนอ่านได้
PII_FIELDS = (
    "contactName",
    "contactPosition",
    "contactPhone",
    "informantName",
    "contactVillage",
)


def verify_snapshots(dist_dir: Path) -> int:
    root = Path(dist_dir)
    if not root.is_dir():
        print(f"[ERROR] ไม่พบโฟลเดอร์: {root}")
        return 1

    missing = [key for key in REQUIRED_SNAPSHOTS if not (root / key).is_file()]
    if missing:
        print("[ERROR] snapshot ที่ต้องมีแต่หายไป:")
        for key in missing:
            print(f"  - {key}")
        return 1

    print(f"[OK] พบ snapshot ครบ {len(REQUIRED_SNAPSHOTS)} รายการ ใต้ {root}")

    dashboard_path = root / "api/dashboard"
    try:
        raw = dashboard_path.read_text(encoding="utf-8")
        dashboard = json.loads(raw)
    except Exception as e:
        print(f"[ERROR] อ่าน/parse {dashboard_path} ไม่ได้: {e}")
        return 1

    stats = dashboard.get("stats") or {}
    recent = dashboard.get("recent") or []
    provinces = dashboard.get("provinces") or []

    print(f"     surveys   = {stats.get('surveys')}")
    print(f"     stations  = {stats.get('stations')}")
    print(f"     allowed   = {stats.get('allowed')}")
    print(f"     denied    = {stats.get('denied')}")
    print(f"     recent[]  = {len(recent)}")
    print(f"     provinces = {len(provinces)}")

    # เคสที่ทำให้งานนี้ไม่มีประโยชน์: snapshot ว่าง -> Pages จะแสดง 0 เหมือนเดิม
    if len(recent) == 0:
        print("[ERROR] dashboard snapshot มี recent[] ว่าง — Pages จะแสดง 0 อีกครั้ง")
        return 1

    if (stats.get("stations") or 0) == 0:
        print("[ERROR] stations=0 — ตรวจว่า DATABASE.xlsx / AGWBS.xlsx ถูก checkout มาด้วย")
        return 1

    # ตรวจ PII ในทุก snapshot ที่เป็น JSON (ไม่ใช่แค่ dashboard)
    for key in REQUIRED_SNAPSHOTS:
        text = (root / key).read_text(encoding="utf-8")
        leaked = [field for field in PII_FIELDS if f'"{field}"' in text]
        if leaked:
            print(f"[ERROR] พบฟิลด์ติดต่อหลุดใน {key}: {', '.join(leaked)}")
            return 1
    print("[OK] ตรวจ PII ในทุก snapshot: ไม่พบฟิลด์ติดต่อหลุด")

    # ตรวจว่า JSON ทุกไฟล์ parse ได้
    for key in REQUIRED_SNAPSHOTS:
        try:
            json.loads((root / key).read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[ERROR] {key} ไม่ใช่ JSON ที่ถูกต้อง: {e}")
            return 1
    print("[OK] JSON ทุกไฟล์ parse ได้")

    print("[SUCCESS] snapshot สำหรับ GitHub Pages ผ่านการตรวจสอบ")
    return 0


def main(argv) -> int:
    if len(argv) != 2:
        print("usage: python scripts/verify_pages_snapshots.py <dist-dir>")
        return 1
    return verify_snapshots(Path(argv[1]))


if __name__ == "__main__":
    sys.exit(main(sys.argv))
