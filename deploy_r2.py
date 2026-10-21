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
PUBLIC_DASHBOARD_PII_FIELDS = ("contactName", "contactPosition", "contactPhone", "informantName")
# ฟิลด์ข้อมูลติดต่อใน master stations (ใช้กับฟอร์มภาคสนาม จึงเป็น opt-in)
PUBLIC_STATION_PII_FIELDS = ("contact_name", "contact_position", "contact_phone", "house_no")

# Ensure MIME types are properly registered
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("text/html", ".html")


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


def purge_legacy_secret_keys(s3, bucket_name: str):
    """ลบ object ที่เคยแจก GitHub token สาธารณะออกจาก bucket (ปลอดภัยที่จะรันซ้ำ)"""
    for key in LEGACY_SECRET_KEYS:
        try:
            s3.delete_object(Bucket=bucket_name, Key=key)
            print(f"  [OK] Purged legacy public secret object: /{key}")
        except Exception as e:
            print(f"  [WARN] Could not purge /{key}: {e}")


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


def preview_deployment(bucket_name: str, endpoint: str, strip_station_contacts: bool = False) -> int:
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
    files = [p for p in DIST_DIR.rglob("*") if p.is_file()]
    total = sum(p.stat().st_size for p in files)
    print(f"  dist/ files    : {len(files)} ({total / 1024:.1f} KB)")
    print(f"  SPA fallbacks  : dashboard/, field/, login/ + index, home")
    print(f"  will NOT upload: /api/sync-config (GitHub token) — ถอดออกแล้วใน v2.11.0")
    print(f"  will purge     : {', '.join('/' + k for k in LEGACY_SECRET_KEYS)} (รันเสมอ แม้ snapshot ล้มเหลว)")
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

        print(f"  /api/database  : {len(public_stations)} stations, {len(stations_json) / 1024:.1f} KB, contact values removed = {dropped_stations}")
        print(f"  /api/dashboard : {len(public_dashboard.get('recent') or [])} surveys, {len(dashboard_json) / 1024:.1f} KB, contact values removed = {dropped_dashboard}")

        leftovers = sorted({key for key in PUBLIC_DASHBOARD_PII_FIELDS if f'\"{key}\"' in dashboard_json})
        station_leftovers = sorted({key for key in PUBLIC_STATION_PII_FIELDS if f'\"{key}\"' in stations_json})
        print(f"  PII keys left in dashboard snapshot : {', '.join(leftovers) or 'none'}")
        print(f"  PII keys left in stations snapshot  : {', '.join(station_leftovers) or 'none'}")
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
    print(f" Data Storage    : Strictly OneDrive (utai323@gmail.com) — 0 bytes wasted on R2")
    print(f" Snapshot PII    : {'dashboard + stations' if strip_station_contacts else 'dashboard only'}")
    print("=" * 70)

    files_to_upload = [p for p in DIST_DIR.rglob("*") if p.is_file()]
    total_size = sum(p.stat().st_size for p in files_to_upload)
    print(f"\n[INFO] Found {len(files_to_upload)} file(s) ({total_size / 1024:.1f} KB total). Starting upload...\n")

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
        from database import DatabaseService

        DatabaseService.initialize()
        raw_stations = DatabaseService.get_stations()
        if strip_station_contacts:
            public_stations, dropped_station_fields = sanitize_stations(raw_stations)
        else:
            public_stations, dropped_station_fields = list(raw_stations), 0
        stations_data = {"stations": public_stations}
        stations_json = json.dumps(stations_data, ensure_ascii=False).encode("utf-8")
        for k in ["api/database", "database"]:
            s3.put_object(
                Bucket=bucket_name,
                Key=k,
                Body=stations_json,
                ContentType="application/json; charset=utf-8",
                CacheControl="no-cache",
            )
            print(f"  [OK] Uploaded API snapshot: /{k} [application/json] ({len(stations_json)/1024:.1f} KB, {len(public_stations)} stations)")

        if strip_station_contacts:
            print(f"  [OK] Station snapshot scrubbed: {dropped_station_fields} contact values removed")
        else:
            print(f"  [NOTE] Station snapshot still includes contact fields (needed by field form autofill on r2.dev).")
            print(f"         ใช้ --strip-station-contacts หากต้องการตัดออก (ฟอร์มจะต้องพิมพ์เอง)")

        public_dashboard, dropped_survey_fields = sanitize_dashboard_payload(DatabaseService.get_dashboard_payload())
        dashboard_json = json.dumps(public_dashboard, ensure_ascii=False).encode("utf-8")
        s3.put_object(
            Bucket=bucket_name,
            Key="api/dashboard",
            Body=dashboard_json,
            ContentType="application/json; charset=utf-8",
            CacheControl="no-cache",
        )
        print(f"  [OK] Uploaded API snapshot: /api/dashboard [application/json] ({len(dashboard_json)/1024:.1f} KB) with {len(public_dashboard.get('recent', []))} surveys")
        print(f"  [OK] Dashboard snapshot scrubbed: {dropped_survey_fields} contact values removed")

        gh_status = DatabaseService.check_github_auth()
        gh_status_json = json.dumps(gh_status, ensure_ascii=False).encode("utf-8")
        for k in ["api/github-status", "github-status"]:
            s3.put_object(
                Bucket=bucket_name,
                Key=k,
                Body=gh_status_json,
                ContentType="application/json; charset=utf-8",
                CacheControl="no-cache",
            )
            print(f"  [OK] Uploaded API snapshot: /{k} [application/json]")

        od_status = DatabaseService.get_onedrive_status()
        od_status_json = json.dumps(od_status, ensure_ascii=False).encode("utf-8")
        for k in ["api/onedrive-status", "onedrive-status"]:
            s3.put_object(
                Bucket=bucket_name,
                Key=k,
                Body=od_status_json,
                ContentType="application/json; charset=utf-8",
                CacheControl="no-cache",
            )
            print(f"  [OK] Uploaded API snapshot: /{k} [application/json] (OneDrive: utai323@gmail.com)")

        snapshot_ok = True
    except Exception as e:
        print(f"  [WARN] Could not upload API snapshots: {e}")
        print("  [WARN] snapshot เก่ายังคงอยู่บน bucket — แต่การล้าง object ที่แจก token จะรันแน่นอน")

    # v2.11.1: แยก purge ออกจาก try ของ snapshot — object ที่เคยแจก GitHub token ต้องถูกลบ
    # แม้การสร้าง snapshot จะล้มเหลว (เดิม purge อยู่ท้าย try จึงถูก skip ไปพร้อมกัน)
    purge_legacy_secret_keys(s3, bucket_name)

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

    if args.dry_run:
        sys.exit(preview_deployment(bucket, endpoint, args.strip_station_contacts))

    if args.purge_secrets_only:
        if not key_id or not secret:
            print("\n[ERROR] --purge-secrets-only ต้องใช้ R2 credentials (env R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY หรือ r2-credentials.json)")
            sys.exit(1)
        purge_legacy_secret_keys(get_s3_client(key_id, secret, endpoint), bucket)
        print("\n[SUCCESS] Purged legacy public secret objects.")
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
    )

