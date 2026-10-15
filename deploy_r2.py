"""
NBTC Microwave — Cloudflare R2 Frontend Deployment Tool
Deploys lightweight SPA frontend bundle (dist/ ~600KB) to Cloudflare R2 bucket 'thaidimaru'.
Heavy survey photos, database, and export records remain strictly stored on OneDrive (utai323@gmail.com)
to preserve Cloudflare R2 storage quota and bandwidth.
"""

import argparse
import json
import mimetypes
import os
from pathlib import Path
import sys

try:
    import boto3
    from botocore.config import Config
except ImportError:
    print("[ERROR] boto3 is not installed. Please install it using: pip install boto3")
    sys.exit(1)

ROOT_DIR = Path(__file__).resolve().parent
DIST_DIR = ROOT_DIR / "dist"
CREDENTIALS_FILE = ROOT_DIR / "r2-credentials.json"

DEFAULT_ACCOUNT_ID = "da30eb228f7c6f596214e6d5e0bef68d"
DEFAULT_BUCKET = "thaidimaru"
DEFAULT_ENDPOINT = f"https://{DEFAULT_ACCOUNT_ID}.r2.cloudflarestorage.com"

# Ensure MIME types are properly registered
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("text/html", ".html")


def load_credentials(args):
    """Load R2 credentials from CLI, environment, or r2-credentials.json."""
    key_id = args.key or os.environ.get("R2_ACCESS_KEY_ID")
    secret = args.secret or os.environ.get("R2_SECRET_ACCESS_KEY")

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


def deploy_frontend_to_r2(key_id: str, secret: str, bucket_name: str, endpoint: str):
    """Upload all files from dist/ to Cloudflare R2."""
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

    # Upload SPA route fallbacks so direct navigation or refresh on /dashboard loads the web app
    index_html_path = DIST_DIR / "index.html"
    if index_html_path.exists():
        index_bytes = index_html_path.read_bytes()
        for spa_route in ["dashboard", "dashboard/index.html"]:
            s3.put_object(
                Bucket=bucket_name,
                Key=spa_route,
                Body=index_bytes,
                ContentType="text/html; charset=utf-8",
                CacheControl="no-cache, no-store, must-revalidate",
            )
            print(f"  [OK] Uploaded SPA route fallback: /{spa_route} [text/html]")

    # Upload lightweight API snapshots for instant CDN dashboard and station dropdowns
    try:
        from database import DatabaseService
        stations_data = {"stations": DatabaseService.get_stations()}
        stations_json = json.dumps(stations_data, ensure_ascii=False).encode("utf-8")
        for k in ["api/database", "database"]:
            s3.put_object(
                Bucket=bucket_name,
                Key=k,
                Body=stations_json,
                ContentType="application/json; charset=utf-8",
                CacheControl="no-cache",
            )
            print(f"  [OK] Uploaded API snapshot: /{k} [application/json] ({len(stations_json)/1024:.1f} KB)")

        dashboard_data = DatabaseService.get_dashboard_payload()
        dashboard_json = json.dumps(dashboard_data, ensure_ascii=False).encode("utf-8")
        s3.put_object(
            Bucket=bucket_name,
            Key="api/dashboard",
            Body=dashboard_json,
            ContentType="application/json; charset=utf-8",
            CacheControl="no-cache",
        )
        print(f"  [OK] Uploaded API snapshot: /api/dashboard [application/json] ({len(dashboard_json)/1024:.1f} KB) with {len(dashboard_data.get('recent', []))} surveys")

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
    except Exception as e:
        print(f"  [WARN] Could not upload API snapshots: {e}")

    print("\n" + "=" * 70)
    print("[SUCCESS] Frontend web application successfully deployed to Cloudflare R2!")
    print(f"  Bucket: {bucket_name}")
    print(f"  Files : {uploaded} web assets ({total_size / 1024:.1f} KB)")
    print(f"  Photos & Database: Stored safely in your OneDrive (saving R2 quota!)")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deploy NBTC Microwave Frontend to Cloudflare R2")
    parser.add_argument("--key", help="R2 Access Key ID")
    parser.add_argument("--secret", help="R2 Secret Access Key")
    parser.add_argument("--bucket", default=DEFAULT_BUCKET, help=f"R2 Bucket name (default: {DEFAULT_BUCKET})")
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT, help=f"R2 Endpoint URL")

    args = parser.parse_args()
    key_id, secret = load_credentials(args)

    if not key_id or not secret:
        print("\n[ERROR] Missing R2 credentials!")
        print("Please provide credentials using one of the following methods:")
        print("  1) CLI Arguments: python deploy_r2.py --key <ACCESS_KEY_ID> --secret <SECRET_ACCESS_KEY>")
        print("  2) Environment variables: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY")
        print("  3) Config file 'r2-credentials.json':")
        print("     {\n       \"accessKeyId\": \"your-key-id\",\n       \"secretAccessKey\": \"your-secret-key\"\n     }\n")
        sys.exit(1)

    deploy_frontend_to_r2(key_id, secret, args.bucket, args.endpoint)
