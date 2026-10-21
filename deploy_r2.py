"""
NBTC Microwave — Cloudflare R2 Frontend Deployment Tool
Deploys lightweight SPA frontend bundle (dist/ ~600KB) to Cloudflare R2 bucket 'thaidimaru'.
Heavy survey photos, database, and export records remain strictly stored on OneDrive (utai323@gmail.com)
to preserve Cloudflare R2 storage quota and bandwidth.

v2.11.0 — ความปลอดภัยของ bucket สาธารณะ:
  * ไม่อัปโหลด GitHub token ขึ้น /api/sync-config อีกต่อไป และ purge object เก่าทุกรอบ deploy
  * snapshot ที่ขึ้น CDN ถูกตัดข้อมูลติดต่อของชาวบ้านออก (ค่าเริ่มต้นตัดเฉพาะ /api/dashboard;
    ใช้ --strip-station-contacts เพื่อตัดจาก /api/database ด้วย — หมายเหตุ: ฟอร์มภาคสนามใช้ข้อมูลนั้น
   ในการเติมอัตโนมัติบน r2.dev จึงเปิดเป็น opt-in)
  * --dry-run และ --purge-secrets-only สำหรับตรวจสอบ/ล้างของก่อน deploy จริง
"""

import argparse
import json
import mimetypes
import os
from pathlib import Path
import sys

# v2.11.0: import แบบยอมให้ขาด boto3 ได้ เพื่อให้ --dry-run รันบนเครื่องที่ยังไม่ติดตั้ง library
try:
    import boto3
    from botocore.config import Config
except ImportError:
    boto3 = None
    Config = None


def require_boto3():
    if boto3 is None:
        print("[ERROR] boto3 is not installed. Please install it using: pip install boto3")
        sys.exit(1)

ROOT_DIR = Path(__file__).resolve().parent
DIST_DIR = ROOT_DIR / "dist"
CREDENTIALS_FILE = ROOT_DIR / "r2-credentials.json"

DEFAULT_ACCOUNT_ID = "da30eb228f7c6f596214e6d5e0bef68d"
DEFAULT_BUCKET = "thaidimaru"
DEFAULT_ENDPOINT = f"https://{DEFAULT_ACCOUNT_ID}.r2.cloudflarestorage.com"

# Object เก่าที่เคยเผยแพร่ GitHub token สาธารณะ — ต้องถูกลบทิ้งทุกรอบ deploy (idempotent)
LEGACY_SECRET_KEYS = ("api/sync-config", "sync-config")

# ฟิลด์ข้อมูลติดต่อของประชาชนในรายการสำรวจ — ไม่ควรถูกแพ็คขึ้น CDN snapshot
PUBLIC_DASHBOARD_PII_FIELDS = (
    "contactName",
    "contactPosition",
    "contactPhone",
    "informantName",
    "contactVillage",
)
# ฟิลด์ข้อมูลติดต่อใน master stations (ใช้กับฟอร์มภาคสนาม จึงเป็น opt-in)
PUBLIC_STATION_PII_FIELDS = (
    "contact_name",
    "contact_position",
    "contact_phone",
    "house_no",
)
# ฟิลด์ path เครื่องและบัญชีส่วนตัวใน onedrive-status
PUBLIC_ONEDRIVE_PII_FIELDS = (
    "account",
    "folder",
    "surveysDir",
    "dbPath",
)
# ฟิลด์ชื่อบัญชีผู้ใช้ใน github-status
PUBLIC_GITHUB_PII_FIELDS = (
    "user",
)

# Ensure MIME types are properly registered
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("text/html", ".html")


def prepare_upload_files(dist_dir: Path):
    """แยกและเรียงลำดับไฟล์ใน dist/ เพื่อให้อัปโหลดแบบ atomic ปลอดภัยต่อ cancel-in-progress:
    - ชุดที่ 1: assets/**, fonts/**, images, sw.js, manifest.json และไฟล์ static ทั้งหมด (rel_key != 'index.html')
    - ชุดที่ 2: index.html เป็นไฟล์สุดท้ายเสมอ เพื่อเป็นจุด cutover หลังจาก asset ครบ
    """
    all_files = [p for p in dist_dir.rglob("*") if p.is_file()]
    non_html = sorted(
        [p for p in all_files if p.relative_to(dist_dir).as_posix() != "index.html"],
        key=lambda p: p.relative_to(dist_dir).as_posix(),
    )
    html_files = [p for p in all_files if p.relative_to(dist_dir).as_posix() == "index.html"]
    return non_html + html_files


def sanitize_dashboard_payload(payload: dict):
    """คืน (payload สำเนา, จำนวนค่าที่ตัดออก) โดยลบข้อมูลติดต่อออกจาก recent[] ทั้งหมด

    ใช้เฉพาะกับ snapshot ที่อัปขึ้น R2 สาธารณะ — `database.py` ยังส่งข้อมูลครบให้เซิร์ฟเวอร์ local,
    ฟอร์มภาคสนาม และรายงาน A4 ที่เรนเดอร์ฝั่ง client จากไฟล์ JSON บน GitHub
    """
    safe = dict(payload or {})
    sanitized_recent = []
    removed = 0
    for item in safe.get("recent") or []:
        entry = dict(item or {})
        fields = dict(entry.get("fields") or {})
        for key in PUBLIC_DASHBOARD_PII_FIELDS:
            if fields.get(key):
                removed += 1
            fields.pop(key, None)
            if key in entry:
                if entry.get(key):
                    removed += 1
                entry.pop(key, None)
        entry["fields"] = fields
        sanitized_recent.append(entry)
    safe["recent"] = sanitized_recent
    return safe, removed


def sanitize_stations(stations: list):
    """คืน (stations สำเนา, จำนวนค่าที่ตัดออก) โดยลบฟิลด์ติดต่อของชาวบ้านออกจาก master stations"""
    sanitized = []
    removed = 0
    for station in stations or []:
        row = dict(station or {})
        for key in PUBLIC_STATION_PII_FIELDS:
            if row.get(key):
                removed += 1
            row.pop(key, None)
        sanitized.append(row)
    return sanitized, removed


def sanitize_onedrive_payload(payload: dict):
    """คืน (payload สำเนา, จำนวนค่าที่ตัดออก) โดยตัดข้อมูล path เครื่องและ email บัญชีส่วนบุคคลออก

    เก็บเฉพาะสถานะการเชื่อมต่อภาพรวม:
    configured, connected, service, surveysCount, photosCount, status, message (แบบไม่มี email), updatedAt
    """
    safe = dict(payload or {})
    removed = 0
    for key in PUBLIC_ONEDRIVE_PII_FIELDS:
        if safe.get(key):
            removed += 1
        safe.pop(key, None)

    # ปรับ message ให้ไม่มีอีเมลส่วนตัว
    msg = safe.get("message") or ""
    if "@" in msg or "utai323" in msg:
        safe["message"] = "เชื่อมต่อศูนย์กลางจัดเก็บข้อมูล Microsoft OneDrive สำเร็จ"
        removed += 1

    return safe, removed


def sanitize_github_payload(payload: dict):
    """คืน (payload สำเนา, จำนวนค่าที่ตัดออก) โดยตัดชื่อบัญชี GitHub (user) ออกจาก public snapshot"""
    safe = dict(payload or {})
    removed = 0
    for key in PUBLIC_GITHUB_PII_FIELDS:
        if safe.get(key):
            removed += 1
        safe.pop(key, None)
    return safe, removed


# v2.11.6: key ของ snapshot ที่เสิร์ฟเป็น static file บน CDN และบน GitHub Pages
# (/api/database มี alias /database เพราะ client บางเส้นทางยิงแบบไม่มี prefix)
SNAPSHOT_KEYS = {
    "database": ("api/database", "database"),
    "dashboard": ("api/dashboard",),
    "github-status": ("api/github-status", "github-status"),
    "onedrive-status": ("api/onedrive-status", "onedrive-status"),
}


def build_snapshot_payloads(strip_station_contacts: bool = False):
    """สร้าง payload ของ snapshot ทั้ง 4 ตัวพร้อม sanitize PII แล้ว

    เป็นแหล่งความจริงเดียวที่ใช้ทั้ง:
      * การอัปโหลดขึ้น Cloudflare R2 (deploy_frontend_to_r2)
      * การเขียนเป็นไฟล์ static สำหรับ GitHub Pages (--write-snapshots)

    คืน (payloads, report) โดย payloads เป็น dict ของ bytes ที่พร้อมเขียน/อัปโหลด
    และ report เป็น dict สรุปจำนวนเพื่อพิมพ์ log/ตรวจสอบ

    หมายเหตุ: ฟังก์ชันนี้ไม่แตะเครือข่าย — ผู้เรียกเป็นคนตัดสินใจว่าจะอัปโหลดหรือเขียนไฟล์
    """
    from database import DatabaseService

    # CI checkout ไม่มี survey.db -> initialize() สร้างตาราง + sync สถานีจาก xlsx + seed จาก data/surveys/
    DatabaseService.initialize()

    raw_stations = DatabaseService.get_stations()
    if strip_station_contacts:
        public_stations, dropped_station_fields = sanitize_stations(raw_stations)
    else:
        public_stations, dropped_station_fields = list(raw_stations), 0

    public_dashboard, dropped_survey_fields = sanitize_dashboard_payload(
        DatabaseService.get_dashboard_payload()
    )
    public_gh, dropped_gh = sanitize_github_payload(DatabaseService.check_github_auth())
    public_od, dropped_od = sanitize_onedrive_payload(DatabaseService.get_onedrive_status())

    payloads = {
        "database": json.dumps({"stations": public_stations}, ensure_ascii=False).encode("utf-8"),
        "dashboard": json.dumps(public_dashboard, ensure_ascii=False).encode("utf-8"),
        "github-status": json.dumps(public_gh, ensure_ascii=False).encode("utf-8"),
        "onedrive-status": json.dumps(public_od, ensure_ascii=False).encode("utf-8"),
    }

    report = {
        "stations": len(public_stations),
        "surveys": len(public_dashboard.get("recent") or []),
        "dashboard_stats": public_dashboard.get("stats") or {},
        "provinces": len(public_dashboard.get("provinces") or []),
        "github_valid": public_gh.get("valid"),
        "onedrive_status": public_od.get("status"),
        "dropped_station_fields": dropped_station_fields,
        "dropped_survey_fields": dropped_survey_fields,
        "dropped_gh": dropped_gh,
        "dropped_od": dropped_od,
    }
    return payloads, report


def write_snapshots_to_dir(
    out_dir: Path,
    strip_station_contacts: bool = False,
    dist_dir: Path = None,
):
    """เขียน snapshot เป็นไฟล์ static ใต้ out_dir เพื่อฝังใน artifact ของ GitHub Pages

    GitHub Pages ไม่มี backend และ workflow ไม่ได้อัปโหลดขึ้น R2 -> ไม่มี /api/* เลย
    ทำให้แอปต้อง fallback ไปยิง GitHub API ซึ่งโควตา unauthenticated เพียง 60 req/ชม.
    ไม่พอสำหรับ 180 ไฟล์ (cold load ต้องใช้ ~182 คำขอ) -> dashboard แสดง 0

    การเขียน snapshot ตอน build ทำให้หน้า Pages ได้ตัวเลขทันทีเหมือน r2.dev
    โดยไม่ต้องใช้โควตา GitHub API ของผู้ใช้แต่ละคน
    ข้อมูลจะ lag ตามรอบ deploy (อัปเดตทุกครั้งที่ push เข้า main ที่ trigger workflow)

    คืน (written_paths, report)
    """
    target_dist = dist_dir if dist_dir is not None else DIST_DIR
    payloads, report = build_snapshot_payloads(strip_station_contacts)

    written = []
    for name, aliases in SNAPSHOT_KEYS.items():
        body = payloads[name]
        for key in aliases:
            dest = out_dir / key
            # alias บางตัวมี '/' -> ต้องสร้างโฟลเดอร์ก่อน
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(body)
            written.append(dest)

    print(f"  [OK] เขียน snapshot {len(payloads)} ตัว ลง {out_dir} ({len(written)} ไฟล์รวม alias)")
    print(f"       /api/database        : {report['stations']} stations, {len(payloads['database']) / 1024:.1f} KB")
    print(f"       /api/dashboard       : {report['surveys']} surveys, {len(payloads['dashboard']) / 1024:.1f} KB, stations={report['dashboard_stats'].get('stations')}, provinces={report['provinces']}")
    print(f"       /api/github-status   : valid={report['github_valid']}")
    print(f"       /api/onedrive-status : status={report['onedrive_status']}")

    # ยืนยันว่าไม่มี PII หลุดลงไฟล์ static ที่ทุกคนอ่านได้ (เหมือนที่ R2 ตรวจ)
    leftovers = sorted({key for key in PUBLIC_DASHBOARD_PII_FIELDS if f'"{key}"' in payloads['dashboard'].decode('utf-8')})
    od_leftovers = sorted({key for key in PUBLIC_ONEDRIVE_PII_FIELDS if f'"{key}"' in payloads['onedrive-status'].decode('utf-8')})
    gh_leftovers = sorted({key for key in PUBLIC_GITHUB_PII_FIELDS if f'"{key}"' in payloads['github-status'].decode('utf-8')})
    station_leftovers = sorted({key for key in PUBLIC_STATION_PII_FIELDS if f'"{key}"' in payloads['database'].decode('utf-8')})
    if leftovers or od_leftovers or gh_leftovers:
        raise RuntimeError(
            f"PII หลุดลง snapshot: dashboard={leftovers} onedrive={od_leftovers} github={gh_leftovers}"
        )
    if strip_station_contacts and station_leftovers:
        raise RuntimeError(f"PII หลุดลง stations snapshot: {station_leftovers}")
    print("  [OK] ตรวจ PII ใน snapshot ที่เขียนลงไฟล์: ไม่พบฟิลด์ติดต่อหลุด")

    return written, report


def purge_legacy_secret_keys(s3, bucket_name: str):
    """ลบ object ที่เคยแจก GitHub token สาธารณะออกจาก bucket (ปลอดภัยที่จะรันซ้ำ)"""
    for key in LEGACY_SECRET_KEYS:
        try:
            s3.delete_object(Bucket=bucket_name, Key=key)
            print(f"  [OK] Purged legacy public secret object: /{key}")
        except Exception as e:
            print(f"  [WARN] Could not purge /{key}: {e}")


def find_stale_assets(s3, bucket_name: str, dist_dir: Path = DIST_DIR) -> list:
    """ค้นหา object ภายใต้ prefix 'assets/' บน bucket ที่ไม่อยู่ใน dist/assets/

    ความปลอดภัย (Hardened Guardrails):
    - ค้นหาเฉพาะ key ที่ขึ้นต้นด้วย 'assets/'
    - กรองไม่ให้แตะ root files (index.html, sw.js, manifest.json, favicon.png ฯลฯ)
    - กรองไม่ให้แตะ API snapshots (api/*, database ฯลฯ)
    """
    if not dist_dir.exists():
        return []

    current_asset_keys = {
        p.relative_to(dist_dir).as_posix()
        for p in dist_dir.rglob("*")
        if p.is_file() and p.relative_to(dist_dir).as_posix().startswith("assets/")
    }

    stale_keys = []
    try:
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket_name, Prefix="assets/"):
            for obj in page.get("Contents") or []:
                key = obj.get("Key", "")
                if key.startswith("assets/") and key not in current_asset_keys:
                    stale_keys.append(key)
    except Exception as e:
        print(f"  [WARN] Could not list bucket objects for stale asset check: {e}")
    return stale_keys


def purge_stale_assets(s3, bucket_name: str, dist_dir: Path = DIST_DIR, dry_run: bool = False) -> list:
    """ลบ assets เก่า (assets/*) บน bucket ที่ไม่อยู่ใน dist/ เพื่อป้องกัน asset บวมและล้าง token ใน bundle เก่า

    กฎความปลอดภัย:
    1. ตรวจสอบว่า key ขึ้นต้นด้วย 'assets/' เท่านั้น
    2. ห้ามลบ root files หรือ API snapshots โดยเด็ดขาด
    3. หาก dry_run=True จะคืนรายชื่อแต่ไม่ส่งคำสั่ง delete_object
    """
    stale_keys = find_stale_assets(s3, bucket_name, dist_dir)
    if not stale_keys:
        print("  [OK] No stale assets found on bucket.")
        return []

    print(f"  [INFO] Found {len(stale_keys)} stale asset(s) on bucket:")
    for k in stale_keys:
        print(f"    - /{k}")

    if dry_run:
        print(f"  [DRY RUN] Would purge {len(stale_keys)} stale asset(s).")
        return stale_keys

    purged = []
    for key in stale_keys:
        if not key.startswith("assets/"):
            print(f"  [SKIP] Guard blocked non-asset key: /{key}")
            continue
        try:
            s3.delete_object(Bucket=bucket_name, Key=key)
            print(f"  [OK] Purged stale asset: /{key}")
            purged.append(key)
        except Exception as e:
            print(f"  [WARN] Failed to purge stale asset /{key}: {e}")

    return purged


def load_credentials(args):
    """Load R2 credentials from CLI, environment, or r2-credentials.json."""
    raw_key = (args.key or "").strip()
    raw_secret = (args.secret or "").strip()

    key_id = raw_key or os.environ.get("R2_ACCESS_KEY_ID", "").strip() or None
    secret = raw_secret or os.environ.get("R2_SECRET_ACCESS_KEY", "").strip() or None

    if not key_id or not secret:
        if CREDENTIALS_FILE.exists():
            try:
                data = json.loads(CREDENTIALS_FILE.read_text(encoding="utf-8"))
                key_id = key_id or data.get("accessKeyId") or data.get("access_key_id")
                secret = secret or data.get("secretAccessKey") or data.get("secret_access_key")
            except Exception as e:
                print(f"[WARN] Failed to parse {CREDENTIALS_FILE.name}: {e}")

    return key_id, secret


def get_s3_client(key_id: str, secret: str, endpoint: str):
    """Initialize boto3 S3 client configured for Cloudflare R2."""
    require_boto3()
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key_id,
        aws_secret_access_key=secret,
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def preview_deployment(
    bucket_name: str,
    endpoint: str,
    strip_station_contacts: bool = False,
    purge_stale_assets_enabled: bool = False,
    key_id: str = None,
    secret: str = None,
) -> int:
    """แสดงสิ่งที่ *จะ*ถูกอัปโหลด/ลบ โดยไม่แตะ object ใดบน R2

    หมายเหตุ: เรียก DatabaseService เหมือนคำขอ /api/dashboard ปกติ จึงมีการ seed/prune SQLite แบบ idempotent
    """
    print("=" * 70)
    print(" DRY RUN — ไม่มีการเขียนหรือลบ object บน Cloudflare R2")
    print("=" * 70)
    print(f"  target bucket : {bucket_name} @ {endpoint}")
    if not DIST_DIR.exists() or not any(DIST_DIR.iterdir()):
        print("  [ERROR] 'dist/' is missing or empty. Run 'npm run build' first.")
        return 1
    files = prepare_upload_files(DIST_DIR)
    total = sum(p.stat().st_size for p in files)
    asset_count = len([p for p in files if p.relative_to(DIST_DIR).as_posix() != "index.html"])
    print(f"  dist/ files    : {len(files)} ({total / 1024:.1f} KB)")
    print(f"  upload order   : 1) assets & static ({asset_count}) -> 2) /index.html (cutover) -> 3) SPA fallbacks (11) -> 4) API snapshots")
    print(f"  SPA fallbacks  : dashboard/, field/, login/ + index, home")
    print(f"  will NOT upload: /api/sync-config (GitHub token) — ถอดออกแล้วใน v2.11.0")
    print(f"  will purge     : {', '.join('/' + k for k in LEGACY_SECRET_KEYS)} (รันเสมอ แม้ snapshot ล้มเหลว)")
    if purge_stale_assets_enabled:
        if key_id and secret and boto3 is not None:
            try:
                s3 = get_s3_client(key_id, secret, endpoint)
                stale = find_stale_assets(s3, bucket_name, DIST_DIR)
                if stale:
                    print(f"  stale assets to purge ({len(stale)}): {', '.join('/' + k for k in stale)}")
                else:
                    print("  stale assets to purge : none found on bucket")
            except Exception as e:
                print(f"  stale assets check     : [WARN] Could not query remote bucket: {e}")
        else:
            print("  stale assets to purge  : enabled via --purge-stale-assets (ต้องมี R2 credentials เพื่อดึงรายชื่อจาก bucket จริง)")
    else:
        print("  stale assets purge     : disabled (use --purge-stale-assets to inspect/purge old assets on bucket)")
    print("  note v2.11.1   : เรียก DatabaseService.initialize() ก่อนสร้าง snapshot (CI checkout ไม่มี survey.db)")
    try:
        from database import DatabaseService

        raw_stations = DatabaseService.get_stations()
        if strip_station_contacts:
            public_stations, dropped_stations = sanitize_stations(raw_stations)
        else:
            public_stations, dropped_stations = list(raw_stations), 0
        stations_json = json.dumps({"stations": public_stations}, ensure_ascii=False)

        public_dashboard, dropped_dashboard = sanitize_dashboard_payload(
            DatabaseService.get_dashboard_payload()
        )
        dashboard_json = json.dumps(public_dashboard, ensure_ascii=False)

        public_gh, dropped_gh = sanitize_github_payload(DatabaseService.check_github_auth())
        gh_json = json.dumps(public_gh, ensure_ascii=False)

        public_od, dropped_od = sanitize_onedrive_payload(DatabaseService.get_onedrive_status())
        od_json = json.dumps(public_od, ensure_ascii=False)

        print(f"  /api/database        : {len(public_stations)} stations, {len(stations_json) / 1024:.1f} KB, contact values removed = {dropped_stations}")
        print(f"  /api/dashboard       : {len(public_dashboard.get('recent') or [])} surveys, {len(dashboard_json) / 1024:.1f} KB, contact values removed = {dropped_dashboard}")
        print(f"  /api/onedrive-status : status={public_od.get('status')}, PII/local path values removed = {dropped_od}")
        print(f"  /api/github-status   : valid={public_gh.get('valid')}, PII values removed = {dropped_gh}")

        leftovers = sorted({key for key in PUBLIC_DASHBOARD_PII_FIELDS if f'"{key}"' in dashboard_json})
        station_leftovers = sorted({key for key in PUBLIC_STATION_PII_FIELDS if f'"{key}"' in stations_json})
        od_leftovers = sorted({key for key in PUBLIC_ONEDRIVE_PII_FIELDS if f'"{key}"' in od_json})
        gh_leftovers = sorted({key for key in PUBLIC_GITHUB_PII_FIELDS if f'"{key}"' in gh_json})

        print(f"  PII keys left in dashboard snapshot : {', '.join(leftovers) or 'none'}")
        print(f"  PII keys left in stations snapshot  : {', '.join(station_leftovers) or 'none'}")
        print(f"  PII keys left in onedrive snapshot  : {', '.join(od_leftovers) or 'none'}")
        print(f"  PII keys left in github snapshot    : {', '.join(gh_leftovers) or 'none'}")
        if leftovers or od_leftovers or gh_leftovers:
            return 2
        if strip_station_contacts and station_leftovers:
            return 2
        return 0
    except Exception as e:
        print(f"  [ERROR] snapshot preview failed: {e}")
        return 1


def deploy_frontend_to_r2(
    key_id: str,
    secret: str,
    bucket_name: str,
    endpoint: str,
    strip_station_contacts: bool = False,
    purge_stale: bool = False,
):
    """Upload all files from dist/ to Cloudflare R2, refresh API snapshots, and purge leaked secrets."""
    if not DIST_DIR.exists() or not any(DIST_DIR.iterdir()):
        print("[ERROR] 'dist/' directory is missing or empty. Please build the frontend first via 'npm run build'.")
        sys.exit(1)

    s3 = get_s3_client(key_id, secret, endpoint)

    print("=" * 70)
    print(" Cloudflare R2 Frontend Deployment — NBTC Microwave")
    print("=" * 70)
    print(f" Target Endpoint : {endpoint}")
    print(f" Target Bucket   : {bucket_name}")
    print(f" Source Directory: {DIST_DIR}")
    print(f" Data Storage    : Strictly OneDrive Local — 0 bytes wasted on R2")
    print(f" Snapshot PII    : {'dashboard + stations' if strip_station_contacts else 'dashboard only'}")
    print("=" * 70)

    files_to_upload = prepare_upload_files(DIST_DIR)
    total_size = sum(p.stat().st_size for p in files_to_upload)
    asset_count = len([p for p in files_to_upload if p.relative_to(DIST_DIR).as_posix() != "index.html"])
    print(f"\n[INFO] Found {len(files_to_upload)} file(s) ({total_size / 1024:.1f} KB total). Starting upload...\n")
    print(f"  [INFO] Upload sequence: {asset_count} asset/static files first, followed by /index.html and SPA route fallbacks (atomic cutover).\n")

    uploaded = 0
    for file_path in files_to_upload:
        rel_key = file_path.relative_to(DIST_DIR).as_posix()
        content_type, _ = mimetypes.guess_type(file_path.name)
        content_type = content_type or "application/octet-stream"

        cache_control = "no-cache, no-store, must-revalidate" if rel_key == "index.html" else "public, max-age=31536000, immutable"

        extra_args = {
            "ContentType": content_type,
            "CacheControl": cache_control,
        }

        file_bytes = file_path.read_bytes()
        s3.put_object(
            Bucket=bucket_name,
            Key=rel_key,
            Body=file_bytes,
            **extra_args,
        )
        uploaded += 1
        print(f"  [OK] Uploaded ({uploaded}/{len(files_to_upload)}): /{rel_key} [{content_type}] ({len(file_bytes)/1024:.1f} KB)")

    # Upload SPA route fallbacks so direct navigation or refresh loads the web app
    index_html_path = DIST_DIR / "index.html"
    if index_html_path.exists():
        index_bytes = index_html_path.read_bytes()
        spa_routes = [
            "dashboard", "dashboard/index.html", "dashboard/",
            "field", "field/index.html", "field/",
            "login", "login/index.html", "login/",
            "index", "home",
        ]
        for spa_route in spa_routes:
            s3.put_object(
                Bucket=bucket_name,
                Key=spa_route,
                Body=index_bytes,
                ContentType="text/html; charset=utf-8",
                CacheControl="no-cache, no-store, must-revalidate",
            )
            print(f"  [OK] Uploaded SPA route fallback: /{spa_route} [text/html]")

    # Upload lightweight API snapshots for instant CDN dashboard and station dropdowns
    # v2.11.1: GitHub Actions checkout ไม่มี survey.db → get_stations() เดิมล้มเหลวด้วย
    # "no such table: stations" ทำให้ block นี้หลุดไป except (ไม่เคยอัปโหลด snapshot และไม่เคย purge token)
    # initialize() สร้างตาราง + sync สถานีจาก DATABASE.xlsx/AGWBS.xlsx และ seed จาก data/surveys/ ตามปกติของเซิร์ฟเวอร์
    snapshot_ok = False
    try:
        # v2.11.6: ใช้ build_snapshot_payloads() ร่วมกับ --write-snapshots ของ GitHub Pages
        # เพื่อให้ sanitize PII และโครงสร้าง payload เป็นแหล่งความจริงเดียว (ไม่แตกเป็นสองทาง)
        payloads, report = build_snapshot_payloads(strip_station_contacts)

        for name, aliases in SNAPSHOT_KEYS.items():
            body = payloads[name]
            for k in aliases:
                s3.put_object(
                    Bucket=bucket_name,
                    Key=k,
                    Body=body,
                    ContentType="application/json; charset=utf-8",
                    CacheControl="no-cache",
                )
                print(f"  [OK] Uploaded API snapshot: /{k} [application/json] ({len(body)/1024:.1f} KB)")

        print(f"  [OK] Dashboard snapshot: {report['surveys']} surveys, stations={report['dashboard_stats'].get('stations')}, provinces={report['provinces']}")
        print(f"  [OK] Contact values removed: dashboard={report['dropped_survey_fields']}, github={report['dropped_gh']}, onedrive={report['dropped_od']}")
        if strip_station_contacts:
            print(f"  [OK] Station snapshot scrubbed: {report['dropped_station_fields']} contact values removed")
        else:
            print(f"  [NOTE] Station snapshot still includes contact fields (needed by field form autofill on r2.dev).")
            print(f"         ใช้ --strip-station-contacts หากต้องการตัดออก (ฟอร์มจะต้องพิมพ์เอง)")
        snapshot_ok = True
    except Exception as e:
        print(f"  [WARN] Could not upload API snapshots: {e}")
        print("  [WARN] snapshot เก่ายังคงอยู่บน bucket — แต่การล้าง object ที่แจก token จะรันแน่นอน")

    # v2.11.1: แยก purge ออกจาก try ของ snapshot — object ที่เคยแจก GitHub token ต้องถูกลบ
    # แม้การสร้าง snapshot จะล้มเหลว (เดิม purge อยู่ท้าย try จึงถูก skip ไปพร้อมกัน)
    purge_legacy_secret_keys(s3, bucket_name)

    # v2.11.3 (B2): ลบ stale hashed assets บน bucket หลัง upload frontend และ snapshot สำเร็จครบถ้วน
    if purge_stale:
        print("\n[INFO] Checking and purging stale hashed assets from Cloudflare R2...")
        purge_stale_assets(s3, bucket_name, DIST_DIR)

    print("\n" + "=" * 70)
    print("[SUCCESS] Frontend web application successfully deployed to Cloudflare R2!")
    print(f"  Bucket: {bucket_name}")
    print(f"  Files : {uploaded} web assets ({total_size / 1024:.1f} KB)")
    print(f"  Snapshots : {'อัปโหลดแล้ว + sanitize PII' if snapshot_ok else 'ไม่สำเร็จ — snapshot เก่ายังอยู่บน bucket'}")
    print(f"  Photos & Database: Stored safely in your OneDrive (saving R2 quota!)")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deploy NBTC Microwave Frontend to Cloudflare R2")
    parser.add_argument("--key", help="R2 Access Key ID")
    parser.add_argument("--secret", help="R2 Secret Access Key")
    parser.add_argument("--bucket", default=DEFAULT_BUCKET, help=f"R2 Bucket name (default: {DEFAULT_BUCKET})")
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT, help="R2 Endpoint URL")
    parser.add_argument("--allow-skip", action="store_true", help="Skip deployment with warning if credentials are not configured")
    parser.add_argument(
        "--strip-station-contacts",
        action="store_true",
        default=os.environ.get("R2_STRIP_STATION_CONTACTS", "").strip().lower() in ("1", "true", "yes", "on"),
        help="ตัดฟิลด์ติดต่อของชาวบ้านออกจาก /api/database snapshot ด้วย (ฟอร์มภาคสนามจะเสีย auto-fill บน r2.dev; ตั้ง R2_STRIP_STATION_CONTACTS=1 ได้สำหรับ CI)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="แสดงรายการที่จะอัปโหลด/ลบ และผล sanitize โดยไม่แตะ R2 (ไม่ต้องมี credentials)",
    )
    parser.add_argument(
        "--purge-secrets-only",
        action="store_true",
        help="ลบเฉพาะ object เก่าที่เคยเผยแพร่ GitHub token (/api/sync-config, /sync-config) แล้วจบ",
    )
    parser.add_argument(
        "--purge-stale-assets",
        action="store_true",
        default=os.environ.get("R2_PURGE_STALE_ASSETS", "").strip().lower() in ("1", "true", "yes", "on"),
        help="ลบ assets เก่า (assets/*) บน bucket ที่ไม่อยู่ใน dist/ เพื่อป้องกัน asset บวมและล้าง token ที่หลงเหลือใน hashed bundle เก่า",
    )
    parser.add_argument(
        "--purge-stale-assets-only",
        action="store_true",
        help="ลบเฉพาะ assets เก่า (assets/*) บน bucket ที่ไม่อยู่ใน dist/ แล้วจบ (ไม่ deploy)",
    )
    parser.add_argument(
        "--write-snapshots",
        metavar="DIR",
        help="เขียน snapshot /api/* เป็นไฟล์ static ใต้ DIR แล้วจบ (ไม่แตะ R2, ไม่ต้องมี credentials) — ใช้กับ GitHub Pages",
    )

    args = parser.parse_args()
    key_id, secret = load_credentials(args)

    raw_bucket = (args.bucket or "").strip()
    bucket = raw_bucket or os.environ.get("R2_BUCKET", "").strip() or DEFAULT_BUCKET

    raw_endpoint = (args.endpoint or "").strip()
    if not raw_endpoint or raw_endpoint.startswith("https://.r2"):
        account_id = os.environ.get("R2_ACCOUNT_ID", "").strip() or DEFAULT_ACCOUNT_ID
        endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    else:
        endpoint = raw_endpoint

    if args.write_snapshots:
        # v2.11.6: GitHub Pages ไม่มี backend และไม่ได้อัปโหลดขึ้น R2 -> ต้องฝัง snapshot เข้า artifact ตอน build
        out_dir = Path(args.write_snapshots).resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
        print("=" * 70)
        print(" Static API Snapshots for GitHub Pages — NBTC Microwave")
        print("=" * 70)
        print(f" Output Directory: {out_dir}")
        print(f" Snapshot PII    : {'dashboard + stations' if args.strip_station_contacts else 'dashboard only'}")
        print("=" * 70)
        try:
            write_snapshots_to_dir(out_dir, strip_station_contacts=args.strip_station_contacts)
        except Exception as e:
            print(f"\n[ERROR] สร้าง snapshot ไม่สำเร็จ: {e}")
            sys.exit(1)
        print("\n[SUCCESS] เขียน snapshot สำหรับ GitHub Pages เรียบร้อย")
        sys.exit(0)

    if args.dry_run:
        sys.exit(
            preview_deployment(
                bucket,
                endpoint,
                strip_station_contacts=args.strip_station_contacts,
                purge_stale_assets_enabled=args.purge_stale_assets or args.purge_stale_assets_only,
                key_id=key_id,
                secret=secret,
            )
        )

    if args.purge_secrets_only:
        if not key_id or not secret:
            print("\n[ERROR] --purge-secrets-only ต้องใช้ R2 credentials (env R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY หรือ r2-credentials.json)")
            sys.exit(1)
        purge_legacy_secret_keys(get_s3_client(key_id, secret, endpoint), bucket)
        print("\n[SUCCESS] Purged legacy public secret objects.")
        sys.exit(0)

    if args.purge_stale_assets_only:
        if not key_id or not secret:
            print("\n[ERROR] --purge-stale-assets-only ต้องใช้ R2 credentials (env R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY หรือ r2-credentials.json)")
            sys.exit(1)
        s3 = get_s3_client(key_id, secret, endpoint)
        purge_stale_assets(s3, bucket, DIST_DIR)
        print("\n[SUCCESS] Purged stale assets from bucket.")
        sys.exit(0)

    if not key_id or not secret:
        if args.allow_skip or os.environ.get("R2_ALLOW_SKIP") == "1":
            print("\n[WARN] Cloudflare R2 credentials (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY) not set. Skipping deployment.")
            sys.exit(0)

        print("\n[ERROR] Missing R2 credentials!")
        print("Please provide credentials using one of the following methods:")
        print("  1) CLI Arguments: python deploy_r2.py --key <ACCESS_KEY_ID> --secret <SECRET_ACCESS_KEY>")
        print("  2) Environment variables: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY")
        print("  3) Config file 'r2-credentials.json':")
        print("     {\n       \"accessKeyId\": \"your-key-id\",\n       \"secretAccessKey\": \"your-secret-key\"\n     }\n")
        sys.exit(1)

    deploy_frontend_to_r2(
        key_id,
        secret,
        bucket,
        endpoint,
        strip_station_contacts=args.strip_station_contacts,
        purge_stale=args.purge_stale_assets,
    )

