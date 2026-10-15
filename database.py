"""
NBTC Microwave — Survey Control Room (Pre-PM)
Modular Standalone Backend Server (Python 3 + SQLite)
"""

import base64
import datetime as dt
import json
import mimetypes
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('image/svg+xml', '.svg')
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import urllib.parse
from urllib.parse import unquote, quote, parse_qs, urlparse
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


# ==============================================================================
# 1. Configuration & Paths
# ==============================================================================

class AppConfig:
    ROOT = Path(__file__).resolve().parent
    DIST_DIR = ROOT / "dist"
    
    # Primary Data Storage: Personal OneDrive (utai323@gmail.com)
    ONEDRIVE_DATA_DIR = Path(r"C:\Users\utai3\OneDrive\NBTC Microwave\Data")
    DATA_DIR = ONEDRIVE_DATA_DIR if ONEDRIVE_DATA_DIR.exists() else ROOT
    
    DB_PATH = DATA_DIR / "survey.db"
    PHOTOS_DIR = DATA_DIR / "photos"
    SURVEY_PDF_PATH = DATA_DIR / "SURVEY_REPORTS_ALL_63.pdf" if (DATA_DIR / "SURVEY_REPORTS_ALL_63.pdf").exists() else (DATA_DIR / "SURVEY_REPORTS_ALL_56.pdf")
    SURVEYS_DIR = DATA_DIR / "surveys" if (DATA_DIR / "surveys").exists() else (ROOT / "data" / "surveys")
    
    HTML_PATH = ROOT / "index.html"
    PASSWORD_PATH = ROOT / "access-password.txt"
    DATABASE_XLSX = ROOT / "DATABASE.xlsx"
    AGWBS_XLSX = ROOT / "AGWBS.xlsx"
    ASSETS_DIR = ROOT / "assets"
    GITHUB_TOKEN_PATH = ROOT / "github-token.txt"
    
    HOST = "0.0.0.0"
    PORT = int(os.environ.get("PORT", 8765))
    TOKEN_LIFETIME_HOURS = 8
    SURVEY_RESET_DATE = "2026-10-05T00:00:00"
    XML_NAMESPACES = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


# ==============================================================================
# 2. Authentication Service
# ==============================================================================

class AuthService:
    def __init__(self):
        self._tokens = {}
        self._lock = threading.Lock()

    def get_configured_password(self) -> str:
        """Get password from environment variable or access-password.txt."""
        env_pass = os.environ.get("FORM_PASSWORD")
        if env_pass:
            return env_pass.strip()
        if AppConfig.PASSWORD_PATH.exists():
            return AppConfig.PASSWORD_PATH.read_text(encoding="utf-8-sig").strip()
        return "admin"

    def verify_password(self, attempt: str) -> bool:
        """Verify the user-provided password."""
        return bool(attempt and secrets.compare_digest(attempt.strip(), self.get_configured_password()))

    def create_token(self) -> str:
        """Generate a new secure authentication token."""
        token = secrets.token_urlsafe(32)
        expiry = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=AppConfig.TOKEN_LIFETIME_HOURS)
        with self._lock:
            self._tokens[token] = expiry
        return token

    def is_authorized(self, auth_header: str) -> bool:
        """Validate bearer token and clean up expired tokens."""
        if not auth_header:
            return False
        token = auth_header[7:].strip() if auth_header.startswith("Bearer ") else auth_header.strip()
        now = dt.datetime.now(dt.timezone.utc)
        with self._lock:
            expiry = self._tokens.get(token)
            if expiry and expiry > now:
                return True
            self._tokens.pop(token, None)
        return False


# ==============================================================================
# 3. Database & Storage Service
# ==============================================================================

class DatabaseService:
    # Station aliases mapping legacy survey station names to official new names
    STATION_ALIASES = {
        "หมู่ 10 สำราญเหนือ (ศรีสุขสำราญ)": "หมู่ 10 บ้านสำราญเหนือ",
        "หมู่ 8 วังหยี (เหมกน้อย)": "หมู่ 8 บ้านเหมกน้อย",
        "หมู่ 8 ทุ่งเอื้อง (ลำขนุน)": "หมู่ 8 บ้านลำขนุน",
        "หมู่ 10 หน้าโกฏิ (หัวดอน)": "หมู่ 10 หัวดอน",
        "หมู่ 6 บางอุดม (บางมะขาม)": "หมู่ 6 บางมะขาม",
        "หมู่ 9 บางคณฑี (น้ำทรัพย์)": "หมู่ 9 น้ำทรัพย์",
        "หมู่ 7 บ้านใหม่วังเรือง (บ้านใหม่วังเรือน)": "หมู่ 7 บ้านใหม่วังเรือง",
        "หมู่ 13 วังคำแพง (วังกำแพง)": "หมู่ 13 บ้านวังกำแพง",
        "หมู่ 6 บ้านเกาะแก้วอนุสรณ์": "หมู่ 6 บ้านเกาะแก้ว",
        "หมู่ 5 บ้านตากฟ้า": "หมู่ 5 ตากฟ้า",
        "หมู่ 1 ลาดแคใต้": "หมู่ 1 บ้านลาดแค",
        "หมู่ 14 หนองใหญ่ใต้": "หมู่ 14 บ้านหนองใหญ่โต",
        "หมู่ 17 คลองโปร่ง": "หมู่ 17 บ้านคลองโป่ง",
    }

    THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙"

    @classmethod
    def normalize_station_key(cls, name: str) -> str:
        s = str(name or "").strip()
        for idx, d in enumerate(cls.THAI_DIGITS):
            s = s.replace(d, str(idx))
        return " ".join(s.split())

    @staticmethod
    def connect() -> sqlite3.Connection:
        """Create a connection with sqlite3.Row factory."""
        conn = sqlite3.connect(AppConfig.DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    @classmethod
    def initialize(cls):
        """Create tables and seed station / legacy survey data if missing."""
        AppConfig.PHOTOS_DIR.mkdir(parents=True, exist_ok=True)

        with cls.connect() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS stations (
                    id INTEGER PRIMARY KEY,
                    village TEXT NOT NULL,
                    subdistrict TEXT,
                    district TEXT,
                    province TEXT,
                    installation_place TEXT,
                    equipment_place TEXT,
                    contact_name TEXT,
                    contact_position TEXT,
                    contact_phone TEXT,
                    house_no TEXT
                );

                CREATE TABLE IF NOT EXISTS surveys (
                    id INTEGER PRIMARY KEY,
                    record_id TEXT NOT NULL UNIQUE,
                    saved_at TEXT NOT NULL,
                    fields_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS survey_photos (
                    id INTEGER PRIMARY KEY,
                    survey_id INTEGER NOT NULL REFERENCES surveys(id),
                    name TEXT NOT NULL,
                    content_type TEXT NOT NULL,
                    data BLOB NOT NULL
                );
            """)

            # Ensure contact_phone and house_no columns exist if upgrading from older schema
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(stations)")
            existing_cols = {c[1] for c in cursor.fetchall()}
            if "contact_phone" not in existing_cols:
                conn.execute("ALTER TABLE stations ADD COLUMN contact_phone TEXT")
            if "house_no" not in existing_cols:
                conn.execute("ALTER TABLE stations ADD COLUMN house_no TEXT")

            # Synchronize stations from DATABASE.xlsx and AGWBS.xlsx
            cls._sync_stations(conn)

            # Seed survey JSON files from root and data/surveys/
            cls._seed_surveys_from_json(conn)

    @classmethod
    def _sync_stations(cls, conn: sqlite3.Connection):
        """Parse and synchronize master station records from DATABASE.xlsx and AGWBS.xlsx."""
        stations_to_insert = []
        seen = set()

        # 1. Sync from DATABASE.xlsx
        if AppConfig.DATABASE_XLSX.exists():
            try:
                rows = cls._read_xlsx_rows(AppConfig.DATABASE_XLSX)
                # Find header row and column mapping dynamically
                header_idx = -1
                col_map = {}
                for idx, row in enumerate(rows[:5]):
                    row_str = " ".join(str(c) for c in row if c)
                    if "หมู่บ้าน" in row_str or "สถานี" in row_str:
                        header_idx = idx
                        for c_idx, val in enumerate(row):
                            val_s = re.sub(r"\s+", "", str(val).strip())
                            if "หมู่บ้าน" in val_s or "สถานี" in val_s:
                                col_map["village"] = c_idx
                            elif "ตำบล" in val_s:
                                col_map["subdistrict"] = c_idx
                            elif "อำเภอ" in val_s:
                                col_map["district"] = c_idx
                            elif "จังหวัด" in val_s:
                                col_map["province"] = c_idx
                            elif "พื้นที่ตั้งเสา" in val_s or "สถานที่ติดตั้ง" in val_s:
                                col_map["installation_place"] = c_idx
                            elif "พื้นที่วางเครื่อง" in val_s or "สถานที่วางเครื่อง" in val_s:
                                col_map["equipment_place"] = c_idx
                            elif "เจ้าหน้าที่" in val_s or "ชื่อ" in val_s:
                                col_map["contact_name"] = c_idx
                            elif "ตำแหน่ง" in val_s:
                                col_map["contact_position"] = c_idx
                            elif "โทร" in val_s or "เบอร์" in val_s:
                                col_map["contact_phone"] = c_idx
                            elif "บ้านเลขที่" in val_s:
                                col_map["house_no"] = c_idx
                        break

                if header_idx != -1 and "village" in col_map:
                    v_col = col_map["village"]
                    for row in rows[header_idx + 1:]:
                        if len(row) > v_col and row[v_col]:
                            village = cls.normalize_station_key(str(row[v_col]).strip())
                            if not village or village in seen:
                                continue
                            # Skip note / footnote rows
                            if "หมายเหตุ" in village or village.startswith("ลำดับที่"):
                                continue
                            tor_val = row[0] if len(row) > 0 else ""
                            if isinstance(tor_val, str) and "หมายเหตุ" in tor_val:
                                continue

                            seen.add(village)
                            stations_to_insert.append((
                                village,
                                str(row[col_map["subdistrict"]]).strip() if "subdistrict" in col_map and len(row) > col_map["subdistrict"] else "",
                                str(row[col_map["district"]]).strip() if "district" in col_map and len(row) > col_map["district"] else "",
                                str(row[col_map["province"]]).strip() if "province" in col_map and len(row) > col_map["province"] else "",
                                str(row[col_map["installation_place"]]).strip() if "installation_place" in col_map and len(row) > col_map["installation_place"] else "",
                                str(row[col_map["equipment_place"]]).strip() if "equipment_place" in col_map and len(row) > col_map["equipment_place"] else "",
                                str(row[col_map["contact_name"]]).strip() if "contact_name" in col_map and len(row) > col_map["contact_name"] else "",
                                str(row[col_map["contact_position"]]).strip() if "contact_position" in col_map and len(row) > col_map["contact_position"] else "",
                                str(row[col_map["contact_phone"]]).strip() if "contact_phone" in col_map and len(row) > col_map["contact_phone"] else "",
                                str(row[col_map["house_no"]]).strip() if "house_no" in col_map and len(row) > col_map["house_no"] else ""
                            ))
            except Exception as e:
                print(f"Warning: Failed to sync DATABASE.xlsx: {e}")

        # 2. Sync from AGWBS.xlsx (BSGW sheet)
        if AppConfig.AGWBS_XLSX.exists():
            try:
                rows = cls._read_xlsx_rows(AppConfig.AGWBS_XLSX)
                start_idx = 1 if (len(rows) > 0 and "สถานี" in str(rows[0][0])) else 0
                for row in rows[start_idx:]:
                    if len(row) > 0 and row[0]:
                        village = str(row[0]).strip()
                        if village and village not in seen and village != "สถานี":
                            seen.add(village)
                            stations_to_insert.append((
                                village,
                                str(row[1]).strip() if len(row) > 1 else "",
                                str(row[2]).strip() if len(row) > 2 else "",
                                str(row[3]).strip() if len(row) > 3 else "",
                                "",
                                "",
                                "",
                                "",
                                "",
                                ""
                            ))
            except Exception as e:
                print(f"Warning: Failed to sync AGWBS.xlsx: {e}")

        if stations_to_insert:
            conn.execute("DELETE FROM stations")
            conn.executemany("""
                INSERT INTO stations
                (village, subdistrict, district, province, installation_place,
                 equipment_place, contact_name, contact_position, contact_phone, house_no)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, stations_to_insert)

    @classmethod
    def _seed_surveys_from_json(cls, conn: sqlite3.Connection):
        """Import pre-existing survey-*.json files into SQLite."""
        for path in sorted(AppConfig.ROOT.glob("survey-*.json")):
            try:
                record = json.loads(path.read_text(encoding="utf-8-sig"))
                record_id = record.get("recordId") or path.stem
                saved_at = record.get("savedAt") or dt.datetime.fromtimestamp(
                    path.stat().st_mtime, dt.timezone.utc
                ).isoformat()
                fields = record.get("fields", {})
                conn.execute(
                    "INSERT OR IGNORE INTO surveys(record_id, saved_at, fields_json) VALUES (?, ?, ?)",
                    (record_id, saved_at, json.dumps(fields, ensure_ascii=False))
                )
            except Exception as e:
                print(f"Warning: Failed to seed {path.name}: {e}")

        # 2. Seed from all survey JSON directories (Git data/surveys and OneDrive surveys)
        survey_dirs = []
        git_surveys_dir = AppConfig.ROOT / "data" / "surveys"
        if git_surveys_dir.exists():
            survey_dirs.append(git_surveys_dir)
        if AppConfig.DATA_DIR != AppConfig.ROOT:
            od_surveys_dir = AppConfig.DATA_DIR / "surveys"
            od_surveys_dir.mkdir(parents=True, exist_ok=True)
            if od_surveys_dir not in survey_dirs:
                survey_dirs.append(od_surveys_dir)

        seen_files = set()
        for s_dir in survey_dirs:
            for path in sorted(s_dir.glob("*.json")):
                if path.name in seen_files:
                    continue
                seen_files.add(path.name)
                try:
                    content_text = path.read_text(encoding="utf-8-sig")
                    record = json.loads(content_text)
                    record_id = record.get("recordId") or path.stem
                    saved_at = record.get("savedAt") or dt.datetime.fromtimestamp(
                        path.stat().st_mtime, dt.timezone.utc
                    ).isoformat()
                    fields = record.get("fields", {})
                    conn.execute(
                        "INSERT OR IGNORE INTO surveys(record_id, saved_at, fields_json) VALUES (?, ?, ?)",
                        (record_id, saved_at, json.dumps(fields, ensure_ascii=False))
                    )
                    s_row = conn.execute("SELECT id FROM surveys WHERE record_id = ?", (record_id,)).fetchone()
                    if s_row:
                        s_id = s_row[0]
                        for p in record.get("photos", []):
                            raw_b64 = p.get("data", "")
                            if raw_b64:
                                p_name = p.get("name", "photo")
                                p_exists = conn.execute("SELECT id FROM survey_photos WHERE survey_id = ? AND name = ?", (s_id, p_name)).fetchone()
                                if not p_exists:
                                    try:
                                        p_bytes = base64.b64decode(raw_b64)
                                        conn.execute(
                                            "INSERT INTO survey_photos (survey_id, name, content_type, data) VALUES (?, ?, ?, ?)",
                                            (s_id, p_name, p.get("contentType") or p.get("type") or "image/jpeg", p_bytes)
                                        )
                                    except Exception:
                                        pass

                    # Sync file across survey directories
                    for other_dir in survey_dirs:
                        if other_dir != path.parent:
                            target_file = other_dir / path.name
                            if not target_file.exists():
                                try:
                                    target_file.write_text(content_text, encoding="utf-8")
                                except Exception:
                                    pass
                except Exception as e:
                    print(f"Warning: Failed to seed {path.name}: {e}")

    @staticmethod
    def _read_xlsx_rows(path: Path) -> list:
        """Fast OpenXML spreadsheet parser without third-party dependencies."""
        ns = AppConfig.XML_NAMESPACES
        with zipfile.ZipFile(path) as archive:
            shared_strings = []
            if "xl/sharedStrings.xml" in archive.namelist():
                shared = ET.fromstring(archive.read("xl/sharedStrings.xml"))
                shared_strings = ["".join(item.itertext()) for item in shared.findall("m:si", ns)]

            sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
            rows = []
            for row in sheet.findall(".//m:sheetData/m:row", ns):
                values = {}
                for cell in row.findall("m:c", ns):
                    ref = cell.get("r", "")
                    col_letters = "".join(char for char in ref if char.isalpha())
                    if col_letters:
                        col_idx = 0
                        for char in col_letters:
                            col_idx = col_idx * 26 + ord(char.upper()) - 64
                        
                        val_elem = cell.find("m:v", ns)
                        if val_elem is not None and val_elem.text:
                            text = val_elem.text
                            values[col_idx - 1] = shared_strings[int(text)] if cell.get("t") == "s" else text
                        else:
                            values[col_idx - 1] = ""
                
                max_col = max(values.keys(), default=-1)
                rows.append([values.get(i, "") for i in range(max_col + 1)])
            return rows

    @classmethod
    def get_stations(cls) -> list:
        """Return all station records."""
        with cls.connect() as conn:
            rows = conn.execute("SELECT * FROM stations ORDER BY id").fetchall()
            return [dict(row) for row in rows]

    @classmethod
    def get_dashboard_payload(cls) -> dict:
        """Compile live dashboard KPI statistics, province bars, and recent entries."""
        with cls.connect() as conn:
            cls._seed_surveys_from_json(conn)
            stations = [dict(s) for s in conn.execute("SELECT * FROM stations").fetchall()]
            surveys = [dict(r) for r in conn.execute(
                "SELECT id, record_id, saved_at, fields_json FROM surveys WHERE saved_at >= ? ORDER BY saved_at DESC",
                (AppConfig.SURVEY_RESET_DATE,)
            ).fetchall()]
            photo_rows = [dict(p) for p in conn.execute("SELECT id, survey_id, name, content_type, length(data) as size FROM survey_photos").fetchall()]

        # Map photos by survey_id
        photos_by_survey = {}
        for p in photo_rows:
            photos_by_survey.setdefault(p["survey_id"], []).append({
                "id": p["id"],
                "name": p["name"],
                "contentType": p["content_type"],
                "size": p["size"],
                "url": f"/api/photos/{p['id']}"
            })

        # Map stations by village name for accurate lookup, including alias resolution and numeral normalization
        station_map = {}
        for s in stations:
            if s.get("village"):
                v = s["village"].strip()
                station_map[v] = s
                norm_v = cls.normalize_station_key(v)
                if norm_v not in station_map:
                    station_map[norm_v] = s

        for alias, target in cls.STATION_ALIASES.items():
            norm_target = cls.normalize_station_key(target)
            target_obj = station_map.get(target) or station_map.get(norm_target)
            if target_obj:
                if alias not in station_map:
                    station_map[alias] = target_obj
                norm_alias = cls.normalize_station_key(alias)
                if norm_alias not in station_map:
                    station_map[norm_alias] = target_obj

        allowed = 0
        denied = 0
        province_counts = {}
        recent = []

        for survey in surveys:
            try:
                fields = json.loads(survey["fields_json"])
            except Exception:
                fields = {}

            permit = fields.get("permit", "")
            if permit in ("อนุญาต", "on"):
                allowed += 1
            elif permit == "ไม่อนุญาต":
                denied += 1

            station_name = str(fields.get("station") or fields.get("stationSelect") or "").strip()
            norm_station_name = cls.normalize_station_key(station_name)
            station_info = station_map.get(station_name) or station_map.get(norm_station_name) or {}
            province = station_info.get("province") or fields.get("province") or "ไม่ระบุจังหวัด"
            province_counts[province] = province_counts.get(province, 0) + 1

            permit_label = "อนุญาต" if permit in ("อนุญาต", "on") else (permit or "ยังไม่ระบุ")
            survey_photos_list = photos_by_survey.get(survey["id"], [])
            merged_fields = {
                "station": station_name,
                "subdistrict": station_info.get("subdistrict", "") if station_info else "",
                "district": station_info.get("district", "") if station_info else "",
                "province": province,
                "installationPlace": (station_info.get("installation_place", "") if station_info else "") or fields.get("installationPlace", ""),
                "equipmentPlace": (station_info.get("equipment_place", "") if station_info else "") or fields.get("equipmentPlace", ""),
                "contactName": (station_info.get("contact_name", "") if station_info else "") or fields.get("contactName", ""),
                "contactPosition": (station_info.get("contact_position", "") if station_info else "") or fields.get("contactPosition", ""),
                "contactPhone": (station_info.get("contact_phone", "") if station_info else "") or fields.get("contactPhone", "") or fields.get("contact_phone", ""),
                "photos": survey_photos_list,
                **fields
            }
            # Also ensure nested location and contact fallbacks are populated if empty in fields
            if not merged_fields.get("installationPlace") and station_info:
                merged_fields["installationPlace"] = station_info.get("installation_place", "")
            if not merged_fields.get("equipmentPlace") and station_info:
                merged_fields["equipmentPlace"] = station_info.get("equipment_place", "")
            if not merged_fields.get("contactName") and station_info:
                merged_fields["contactName"] = station_info.get("contact_name", "")
            if not merged_fields.get("contactPosition") and station_info:
                merged_fields["contactPosition"] = station_info.get("contact_position", "")
            if not merged_fields.get("contactPhone") and station_info:
                merged_fields["contactPhone"] = station_info.get("contact_phone", "")
            if not merged_fields.get("subdistrict") and station_info:
                merged_fields["subdistrict"] = station_info.get("subdistrict", "")
            if not merged_fields.get("district") and station_info:
                merged_fields["district"] = station_info.get("district", "")
            if not merged_fields.get("photos"):
                merged_fields["photos"] = survey_photos_list

            recent.append({
                "recordId": survey["record_id"],
                "savedAt": survey["saved_at"],
                "station": station_name or "ไม่ระบุสถานี",
                "province": province,
                "permit": permit_label,
                "fields": merged_fields,
                "photos": survey_photos_list
            })

        top_provinces = sorted(
            [{"name": name, "count": count} for name, count in province_counts.items()],
            key=lambda x: x["count"],
            reverse=True
        )[:8]

        return {
            "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "stats": {
                "surveys": len(surveys),
                "stations": len(stations),
                "allowed": allowed,
                "denied": denied
            },
            "provinces": top_provinces,
            "recent": recent
        }

    @classmethod
    def get_github_token(cls) -> str:
        """Get GitHub personal access token from env or github-token.txt."""
        for env_key in ("GITHUB_TOKEN", "GH_TOKEN", "GITHUB_PAT"):
            val = os.environ.get(env_key)
            if val and val.strip():
                return val.strip()
        if AppConfig.GITHUB_TOKEN_PATH.exists():
            try:
                val = AppConfig.GITHUB_TOKEN_PATH.read_text(encoding="utf-8-sig").strip()
                if val:
                    return val
            except Exception:
                pass
        return ""

    _cached_auth_status = None
    _last_auth_time = 0

    @classmethod
    def check_github_auth(cls) -> dict:
        import time
        now = time.time()
        if cls._cached_auth_status and (now - cls._last_auth_time) < 30:
            return cls._cached_auth_status

        token = cls.get_github_token()
        repo = os.environ.get("GITHUB_REPO", "Thaidimaru/Pre_PM2")
        branch = os.environ.get("GITHUB_BRANCH", "main")

        if not token:
            cls._cached_auth_status = {
                "configured": False,
                "valid": False,
                "reason": "no_token",
                "message": "ยังไม่ได้ระบุ GITHUB_TOKEN บนเซิร์ฟเวอร์",
                "repo": repo,
                "branch": branch
            }
            cls._last_auth_time = now
            return cls._cached_auth_status

        try:
            req = urllib.request.Request(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "NBTC-PrePM-Survey-App"
                }
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    cls._cached_auth_status = {
                        "configured": True,
                        "valid": True,
                        "user": data.get("login", "authorized"),
                        "message": "เชื่อมต่อ GitHub สำเร็จ",
                        "repo": repo,
                        "branch": branch
                    }
        except urllib.error.HTTPError as e:
            if e.code == 401:
                cls._cached_auth_status = {
                    "configured": True,
                    "valid": False,
                    "reason": "bad_credentials",
                    "message": "GitHub Token หมดอายุหรือถูกเพิกถอน (401 Bad credentials) กรุณาอัปเดต Token ใหม่",
                    "repo": repo,
                    "branch": branch
                }
            else:
                cls._cached_auth_status = {
                    "configured": True,
                    "valid": False,
                    "reason": "http_error",
                    "message": f"GitHub API error: HTTP {e.code}",
                    "repo": repo,
                    "branch": branch
                }
        except Exception as e:
            cls._cached_auth_status = {
                "configured": True,
                "valid": False,
                "reason": "network_error",
                "message": f"ไม่สามารถเชื่อมต่อ GitHub ได้: {e}",
                "repo": repo,
                "branch": branch
            }

        cls._last_auth_time = now
        return cls._cached_auth_status

    @classmethod
    def commit_survey_to_github(cls, record_id: str, survey_payload: dict) -> dict:
        """Commit survey JSON directly to GitHub repository (Thaidimaru/Pre_PM2)."""
        token = cls.get_github_token()
        if not token:
            return {"success": False, "reason": "no_token"}

        repo = os.environ.get("GITHUB_REPO", "Thaidimaru/Pre_PM2")
        branch = os.environ.get("GITHUB_BRANCH", "main")
        file_path = f"data/surveys/{record_id}.json"
        station_name = survey_payload.get("fields", {}).get("station") or "Station"

        try:
            # Check if file already exists on GitHub to obtain sha for update
            existing_sha = None
            req_get = urllib.request.Request(
                f"https://api.github.com/repos/{repo}/contents/{file_path}?ref={branch}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "NBTC-PrePM-Survey-App",
                    "X-GitHub-Api-Version": "2022-11-28",
                }
            )
            try:
                with urllib.request.urlopen(req_get, timeout=10) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        existing_sha = data.get("sha")
            except Exception:
                pass

            content_bytes = json.dumps(survey_payload, ensure_ascii=False, indent=2).encode("utf-8")
            content_b64 = base64.b64encode(content_bytes).decode("ascii")

            body_dict = {
                "message": f"feat(survey): Pre-PM survey {record_id} - {station_name}",
                "content": content_b64,
                "branch": branch,
                "committer": {
                    "name": "NBTC Survey System",
                    "email": "survey-bot@nbtc.local",
                }
            }
            if existing_sha:
                body_dict["sha"] = existing_sha

            req_put = urllib.request.Request(
                f"https://api.github.com/repos/{repo}/contents/{file_path}",
                data=json.dumps(body_dict).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "Content-Type": "application/json",
                    "User-Agent": "NBTC-PrePM-Survey-App",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                method="PUT"
            )
            with urllib.request.urlopen(req_put, timeout=15) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                return {
                    "success": True,
                    "commitUrl": res_data.get("commit", {}).get("html_url", ""),
                    "sha": res_data.get("content", {}).get("sha", "")
                }
        except Exception as e:
            print(f"Warning: Failed to commit {record_id} to GitHub: {e}")
            return {"success": False, "message": str(e)}

    @classmethod
    def save_survey(cls, fields: dict, photos: list) -> tuple:
        """Save survey record to SQLite, store photos, save to data/surveys, and commit to GitHub."""
        timestamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        record_id = f"PM-{timestamp}-{secrets.token_hex(2)}"
        saved_at = dt.datetime.now(dt.timezone.utc).isoformat()

        with cls.connect() as conn:
            cursor = conn.execute(
                "INSERT INTO surveys (record_id, saved_at, fields_json) VALUES (?, ?, ?)",
                (record_id, saved_at, json.dumps(fields, ensure_ascii=False))
            )
            survey_id = cursor.lastrowid

            for photo in photos:
                raw_b64 = photo.get("data", "")
                if raw_b64:
                    photo_bytes = base64.b64decode(raw_b64)
                    conn.execute(
                        "INSERT INTO survey_photos (survey_id, name, content_type, data) VALUES (?, ?, ?, ?)",
                        (survey_id, photo.get("name", "photo"), photo.get("type", "image/jpeg"), photo_bytes)
                    )

        # Write to data/surveys/{record_id}.json
        gh_res = {"success": False}
        try:
            AppConfig.SURVEYS_DIR.mkdir(parents=True, exist_ok=True)
            survey_file = AppConfig.SURVEYS_DIR / f"{record_id}.json"
            full_survey_data = {
                "recordId": record_id,
                "savedAt": saved_at,
                "station": fields.get("station") or fields.get("stationSelect") or "ไม่ระบุสถานี",
                "province": fields.get("province", ""),
                "permit": "อนุญาต" if fields.get("permit") == "on" else (fields.get("permit") or "ยังไม่ระบุ"),
                "fields": fields,
                "photos": [
                    {
                        "id": idx + 1,
                        "name": p.get("name") or f"photo_{idx + 1}.jpg",
                        "contentType": p.get("type") or "image/jpeg",
                        "data": p.get("data", "")
                    }
                    for idx, p in enumerate(photos)
                ]
            }
            survey_file.write_text(json.dumps(full_survey_data, ensure_ascii=False, indent=2), encoding="utf-8")
            gh_res = cls.commit_survey_to_github(record_id, full_survey_data)
        except Exception as e:
            print(f"Warning: Failed to write survey to {AppConfig.SURVEYS_DIR}: {e}")

        # Write local backup JSON for compatibility with legacy export scripts
        backup_file = AppConfig.ROOT / f"survey-{timestamp}.json"
        try:
            backup_data = {
                "recordId": record_id,
                "savedAt": saved_at,
                "fields": fields
            }
            backup_file.write_text(json.dumps(backup_data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            print(f"Warning: Failed to write backup {backup_file.name}: {e}")

        return record_id, gh_res

    @classmethod
    def delete_survey_from_github(cls, record_id: str) -> dict:
        """Delete survey JSON from GitHub repository (Thaidimaru/Pre_PM2)."""
        token = cls.get_github_token()
        if not token:
            return {"success": False, "reason": "no_token"}

        repo = os.environ.get("GITHUB_REPO", "Thaidimaru/Pre_PM2")
        branch = os.environ.get("GITHUB_BRANCH", "main")
        file_path = f"data/surveys/{record_id}.json"

        try:
            req_get = urllib.request.Request(
                f"https://api.github.com/repos/{repo}/contents/{file_path}?ref={branch}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "NBTC-PrePM-Survey-App",
                    "X-GitHub-Api-Version": "2022-11-28",
                }
            )
            existing_sha = None
            try:
                with urllib.request.urlopen(req_get, timeout=10) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        existing_sha = data.get("sha")
            except Exception:
                pass

            if not existing_sha:
                return {"success": True, "reason": "file_not_found_on_github"}

            body_dict = {
                "message": f"chore(survey): Delete Pre-PM survey {record_id}",
                "sha": existing_sha,
                "branch": branch,
                "committer": {
                    "name": "NBTC Survey System",
                    "email": "survey-bot@nbtc.local",
                }
            }
            req_del = urllib.request.Request(
                f"https://api.github.com/repos/{repo}/contents/{file_path}",
                data=json.dumps(body_dict).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "Content-Type": "application/json",
                    "User-Agent": "NBTC-PrePM-Survey-App",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                method="DELETE"
            )
            with urllib.request.urlopen(req_del, timeout=15) as resp:
                return {"success": True}
        except Exception as e:
            print(f"Warning: Failed to delete {record_id} from GitHub: {e}")
            return {"success": False, "message": str(e)}

    @classmethod
    def update_survey(cls, record_id: str, fields: dict, photos: list = None) -> tuple:
        """Update existing survey in SQLite, update photos, update JSON files, and commit to GitHub."""
        now_iso = dt.datetime.now(dt.timezone.utc).isoformat()
        with cls.connect() as conn:
            s_row = conn.execute("SELECT id, saved_at, fields_json FROM surveys WHERE record_id = ?", (record_id,)).fetchone()
            if not s_row:
                rec_id, gh_res = cls.save_survey(fields, photos or [])
                return True, gh_res

            survey_id = s_row["id"]
            saved_at = s_row["saved_at"]

            fields["updatedAt"] = now_iso
            conn.execute(
                "UPDATE surveys SET fields_json = ? WHERE id = ?",
                (json.dumps(fields, ensure_ascii=False), survey_id)
            )

            if photos is not None:
                existing_p_rows = conn.execute(
                    "SELECT id, name, content_type, data FROM survey_photos WHERE survey_id = ?",
                    (survey_id,)
                ).fetchall()
                existing_ids = {r["id"] for r in existing_p_rows}
                existing_names = {r["name"]: r["id"] for r in existing_p_rows}

                retained_ids = set()
                new_photos = []

                for p in photos:
                    p_id = p.get("id")
                    raw_b64 = p.get("data") or p.get("base64Data") or ""
                    p_name = p.get("name") or "photo.jpg"
                    p_type = p.get("type") or p.get("contentType") or "image/jpeg"

                    if p_id and int(p_id) in existing_ids and not raw_b64:
                        retained_ids.add(int(p_id))
                    elif not p_id and p_name in existing_names and not raw_b64:
                        retained_ids.add(existing_names[p_name])
                    elif raw_b64:
                        try:
                            p_bytes = base64.b64decode(raw_b64)
                            new_photos.append((p_name, p_type, p_bytes))
                        except Exception as e:
                            print(f"Warning: Failed to decode photo {p_name}: {e}")

                for r in existing_p_rows:
                    if r["id"] not in retained_ids:
                        conn.execute("DELETE FROM survey_photos WHERE id = ?", (r["id"],))

                for p_name, p_type, p_bytes in new_photos:
                    conn.execute(
                        "INSERT INTO survey_photos (survey_id, name, content_type, data) VALUES (?, ?, ?, ?)",
                        (survey_id, p_name, p_type, p_bytes)
                    )

            p_rows = conn.execute(
                "SELECT id, name, content_type, data FROM survey_photos WHERE survey_id = ? ORDER BY id ASC",
                (survey_id,)
            ).fetchall()
            final_photos = [
                {
                    "id": pr["id"],
                    "name": pr["name"],
                    "contentType": pr["content_type"],
                    "data": base64.b64encode(pr["data"]).decode("ascii") if pr["data"] else ""
                }
                for pr in p_rows
            ]

        full_survey_data = {
            "recordId": record_id,
            "savedAt": saved_at,
            "updatedAt": now_iso,
            "station": fields.get("station") or fields.get("stationSelect") or "ไม่ระบุสถานี",
            "province": fields.get("province", ""),
            "permit": "อนุญาต" if fields.get("permit") == "on" else (fields.get("permit") or "ยังไม่ระบุ"),
            "fields": fields,
            "photos": final_photos
        }

        for s_dir in (AppConfig.SURVEYS_DIR, AppConfig.ROOT / "data" / "surveys"):
            try:
                s_dir.mkdir(parents=True, exist_ok=True)
                (s_dir / f"{record_id}.json").write_text(
                    json.dumps(full_survey_data, ensure_ascii=False, indent=2),
                    encoding="utf-8"
                )
            except Exception as e:
                print(f"Warning: Failed to write survey file to {s_dir}: {e}")

        gh_res = cls.commit_survey_to_github(record_id, full_survey_data)

        try:
            if AppConfig.SURVEY_PDF_PATH and AppConfig.SURVEY_PDF_PATH.exists():
                AppConfig.SURVEY_PDF_PATH.unlink(missing_ok=True)
        except Exception:
            pass

        return True, gh_res

    @classmethod
    def delete_surveys(cls, record_ids: list) -> dict:
        """Delete one or more surveys by record_id from SQLite, local files, and GitHub."""
        if not record_ids:
            return {"deleted": False, "count": 0}

        deleted_count = 0
        with cls.connect() as conn:
            for rec_id in record_ids:
                s_row = conn.execute("SELECT id FROM surveys WHERE record_id = ?", (rec_id,)).fetchone()
                if s_row:
                    s_id = s_row["id"]
                    conn.execute("DELETE FROM survey_photos WHERE survey_id = ?", (s_id,))
                    conn.execute("DELETE FROM surveys WHERE id = ?", (s_id,))
                    deleted_count += 1

        for rec_id in record_ids:
            for s_dir in (AppConfig.SURVEYS_DIR, AppConfig.ROOT / "data" / "surveys"):
                try:
                    target_file = s_dir / f"{rec_id}.json"
                    if target_file.exists():
                        target_file.unlink(missing_ok=True)
                except Exception as e:
                    print(f"Warning: Failed to delete file {target_file}: {e}")

            for p in AppConfig.ROOT.glob("survey-*.json"):
                try:
                    data = json.loads(p.read_text(encoding="utf-8-sig"))
                    if data.get("recordId") == rec_id:
                        p.unlink(missing_ok=True)
                except Exception:
                    pass

            try:
                cls.delete_survey_from_github(rec_id)
            except Exception as e:
                print(f"Warning: Failed to delete {rec_id} from GitHub: {e}")

        try:
            if AppConfig.SURVEY_PDF_PATH and AppConfig.SURVEY_PDF_PATH.exists():
                AppConfig.SURVEY_PDF_PATH.unlink(missing_ok=True)
        except Exception:
            pass

        return {"deleted": True, "count": deleted_count, "deletedIds": record_ids}


# Initialize Singletons
auth_service = AuthService()


# ==============================================================================
# 4. HTTP Request Handler & Static Router
# ==============================================================================

class SurveyRequestHandler(BaseHTTPRequestHandler):
    def send_json_response(self, status_code: int, payload: dict):
        """Send JSON response with UTF-8 encoding."""
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def serve_file(self, file_path: Path, content_type: str = None):
        """Send static file with correct content type and caching."""
        if not file_path.is_file():
            self.send_json_response(404, {"error": "File not found"})
            return

        if not content_type:
            content_type, _ = mimetypes.guess_type(str(file_path))
            content_type = content_type or "application/octet-stream"

        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        """Handle GET requests for static assets, pages, and API endpoints."""
        parsed_path = unquote(self.path).split("?", 1)[0].rstrip("/")
        if parsed_path == "":
            parsed_path = "/"

        # 1. Main Application Pages (SPA)
        if parsed_path in ("/", "/html", "/dashboard", "/login", "/field"):
            dist_html = AppConfig.DIST_DIR / "index.html"
            html_to_serve = dist_html if dist_html.exists() else AppConfig.HTML_PATH
            self.serve_file(html_to_serve, "text/html; charset=utf-8")
            return

        # 2. Static Assets (/assets/css/..., /assets/js/..., /assets/...)
        if parsed_path.startswith("/assets/"):
            rel_path = parsed_path[8:].lstrip("/")
            
            # Check dist/assets first if dist exists
            dist_asset = (AppConfig.DIST_DIR / "assets" / rel_path).resolve()
            if dist_asset.is_file() and (AppConfig.DIST_DIR in dist_asset.parents):
                self.serve_file(dist_asset)
                return

            target_path = (AppConfig.ASSETS_DIR / rel_path).resolve()
            # Guard against path traversal outside the assets directory
            if AppConfig.ASSETS_DIR in target_path.parents and target_path.is_file():
                self.serve_file(target_path)
                return
            self.send_json_response(404, {"error": "Asset not found"})
            return

        # 2.1 Any root static files in dist/ (e.g. favicon, images)
        if AppConfig.DIST_DIR.exists():
            clean_rel = parsed_path.lstrip("/")
            dist_file = (AppConfig.DIST_DIR / clean_rel).resolve()
            if AppConfig.DIST_DIR in dist_file.parents and dist_file.is_file():
                self.serve_file(dist_file)
                return

        # 3. API: Live Dashboard Metrics
        if parsed_path == "/api/dashboard":
            payload = DatabaseService.get_dashboard_payload()
            self.send_json_response(200, payload)
            return

        # 4. API: Station Master Database
        if parsed_path in ("/database", "/api/database"):
            stations = DatabaseService.get_stations()
            self.send_json_response(200, {"stations": stations})
            return

        # 4.1 Photo Serving & Download: /api/photos/<id>, /photos/<id>, /photos/<name>, /api/photo?recordId=...
        if parsed_path.startswith("/api/photos/") or parsed_path.startswith("/photos/") or parsed_path == "/api/photo":
            query_str = self.path.split("?", 1)[1] if "?" in self.path else ""
            query_params = parse_qs(query_str)
            target_param = parsed_path.split("/")[-1] if parsed_path != "/api/photo" else ""
            with DatabaseService.connect() as conn:
                row = None
                if target_param and target_param.isdigit():
                    row = conn.execute(
                        "SELECT name, content_type, data FROM survey_photos WHERE id = ?",
                        (int(target_param),)
                    ).fetchone()
                elif target_param:
                    row = conn.execute(
                        "SELECT name, content_type, data FROM survey_photos WHERE name = ? ORDER BY id DESC LIMIT 1",
                        (target_param,)
                    ).fetchone()
                elif parsed_path == "/api/photo":
                    rec_id = (query_params.get("recordId") or query_params.get("id") or [""])[0].strip()
                    try:
                        idx_val = int((query_params.get("index") or ["0"])[0])
                    except ValueError:
                        idx_val = 0
                    s_row = conn.execute("SELECT id FROM surveys WHERE record_id = ?", (rec_id,)).fetchone()
                    if s_row:
                        p_rows = conn.execute(
                            "SELECT name, content_type, data FROM survey_photos WHERE survey_id = ? ORDER BY id ASC",
                            (s_row["id"],)
                        ).fetchall()
                        if 0 <= idx_val < len(p_rows):
                            row = p_rows[idx_val]

                if row:
                    name = row["name"] or "photo.jpg"
                    ctype = row["content_type"] or "image/jpeg"
                    data = row["data"]
                    is_download = "download=1" in query_str or "dl=1" in query_str
                    disp = "attachment" if is_download else "inline"

                    self.send_response(200)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Content-Length", str(len(data)))
                    safe_name = quote(name)
                    self.send_header("Content-Disposition", f"{disp}; filename*=UTF-8''{safe_name}")
                    self.send_header("Cache-Control", "public, max-age=86400")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(data)
                    return
            self.send_json_response(404, {"error": "Photo not found"})
            return

        # 4.2 API: Specific Survey Details & Photos: /api/survey/<record_id>
        if parsed_path.startswith("/api/survey/"):
            rec_id = parsed_path[12:].split("/")[0].strip()
            with DatabaseService.connect() as conn:
                s_row = conn.execute("SELECT id, record_id, saved_at, fields_json FROM surveys WHERE record_id = ?", (rec_id,)).fetchone()
                if not s_row:
                    self.send_json_response(404, {"error": "Survey not found"})
                    return
                p_rows = conn.execute(
                    "SELECT id, name, content_type, length(data) as size FROM survey_photos WHERE survey_id = ?",
                    (s_row["id"],)
                ).fetchall()
                photos = [
                    {"id": r["id"], "name": r["name"], "contentType": r["content_type"], "size": r["size"], "url": f"/api/photos/{r['id']}"}
                    for r in p_rows
                ]
                try:
                    fields = json.loads(s_row["fields_json"])
                except Exception:
                    fields = {}
            self.send_json_response(200, {
                "recordId": s_row["record_id"],
                "savedAt": s_row["saved_at"],
                "fields": fields,
                "photos": photos
            })
            return

        # 4.3 API: GitHub Sync Status
        if parsed_path == "/api/github-status":
            status = DatabaseService.check_github_auth()
            self.send_json_response(200, status)
            return

        # 4.4 API: Export Survey Reports to PDF (Supports custom selected IDs)
        if parsed_path in ("/api/export-pdf", "/api/export/pdf", "/api/export-all-pdf"):
            ids_param = query_params.get("ids", [""])[0] if "query_params" in locals() else ""
            if not ids_param:
                ids_param = parse_qs(urlparse(self.path).query).get("ids", [""])[0]

            if ids_param:
                selected_ids = [x.strip() for x in ids_param.split(",") if x.strip()]
                temp_pdf = AppConfig.DATA_DIR / f"SURVEY_EXPORT_{len(selected_ids)}_STATIONS.pdf"
                try:
                    from export_pdf import export_pdf
                    export_pdf(output_path=temp_pdf, record_ids=selected_ids)
                    if temp_pdf.exists():
                        data = temp_pdf.read_bytes()
                        self.send_response(200)
                        self.send_header("Content-Type", "application/pdf")
                        self.send_header("Content-Length", str(len(data)))
                        self.send_header("Content-Disposition", f'attachment; filename="SURVEY_SELECTED_{len(selected_ids)}_STATIONS.pdf"')
                        self.send_header("Cache-Control", "no-cache")
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.end_headers()
                        self.wfile.write(data)
                        return
                    else:
                        self.send_json_response(500, {"error": "Selected PDF could not be generated"})
                        return
                except Exception as e:
                    self.send_json_response(500, {"error": f"Failed to generate selected PDF: {e}"})
                    return

            # Default: Export all surveys
            pdf_file = AppConfig.SURVEY_PDF_PATH
            if not pdf_file.exists():
                try:
                    from export_pdf import export_pdf
                    export_pdf(output_path=pdf_file)
                except Exception as e:
                    self.send_json_response(500, {"error": f"Failed to generate PDF: {e}"})
                    return

            if pdf_file.exists():
                data = pdf_file.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Content-Disposition", f'attachment; filename="{pdf_file.name}"')
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(data)
                return
            else:
                self.send_json_response(500, {"error": "PDF file could not be generated"})
                return

        # 5. Not Found
        self.send_json_response(404, {"error": "Not found"})

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_POST(self):
        """Handle POST requests for login, survey submission, editing, and deletion."""
        path = self.path.rstrip("/")
        content_length = int(self.headers.get("Content-Length", 0))

        try:
            body_bytes = self.rfile.read(content_length) if content_length > 0 else b"{}"
            payload = json.loads(body_bytes.decode("utf-8") or "{}")

            # 1. Login Endpoint
            if path in ("/login", "/api/login"):
                self.send_json_response(200, {"token": "public", "ok": True})
                return

            # 2. Save Survey Endpoint (Auto-detects update if recordId present or isUpdate flag)
            if path in ("/save", "/api/save"):
                fields = payload.get("fields", {})
                photos = payload.get("photos", [])
                record_id = payload.get("recordId") or fields.get("recordId")

                if record_id:
                    ok, gh_res = DatabaseService.update_survey(record_id, fields, photos)
                    self.send_json_response(200, {
                        "saved": True,
                        "updated": ok,
                        "recordId": record_id,
                        "savedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                        "githubSynced": bool(gh_res.get("success")),
                        "commitUrl": gh_res.get("commitUrl"),
                        "githubError": gh_res.get("message") if not gh_res.get("success") else None
                    })
                    return

                record_id, gh_res = DatabaseService.save_survey(fields, photos)
                self.send_json_response(200, {
                    "saved": True,
                    "recordId": record_id,
                    "savedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                    "githubSynced": bool(gh_res.get("success")),
                    "commitUrl": gh_res.get("commitUrl"),
                    "githubError": gh_res.get("message") if not gh_res.get("success") else None
                })
                return

            # 3. Update Survey Endpoint
            if path in ("/update", "/api/update"):
                fields = payload.get("fields", {})
                photos = payload.get("photos", None)
                record_id = payload.get("recordId") or fields.get("recordId")
                if not record_id:
                    self.send_json_response(400, {"error": "Missing recordId"})
                    return

                ok, gh_res = DatabaseService.update_survey(record_id, fields, photos)
                self.send_json_response(200, {
                    "saved": True,
                    "updated": ok,
                    "recordId": record_id,
                    "savedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                    "githubSynced": bool(gh_res.get("success")),
                    "commitUrl": gh_res.get("commitUrl"),
                    "githubError": gh_res.get("message") if not gh_res.get("success") else None
                })
                return

            # 4. Delete Survey Endpoint (supports batch recordIds: [...] or single recordId: "...")
            if path in ("/delete", "/api/delete"):
                record_ids = payload.get("recordIds")
                if not record_ids and payload.get("recordId"):
                    record_ids = [payload.get("recordId")]
                if not record_ids:
                    self.send_json_response(400, {"error": "Missing recordIds or recordId"})
                    return

                res = DatabaseService.delete_surveys(record_ids)
                self.send_json_response(200, res)
                return

            self.send_json_response(404, {"error": "Not found"})

        except Exception as err:
            self.send_json_response(500, {"error": str(err)})

    def do_DELETE(self):
        """Handle DELETE requests for single or batch surveys."""
        parsed_path = unquote(self.path).split("?", 1)[0].rstrip("/")
        if parsed_path.startswith("/api/survey/"):
            rec_id = parsed_path[12:].split("/")[0].strip()
            if rec_id:
                res = DatabaseService.delete_surveys([rec_id])
                self.send_json_response(200, res)
                return

        if parsed_path in ("/api/delete", "/delete"):
            content_length = int(self.headers.get("Content-Length", 0))
            body_bytes = self.rfile.read(content_length) if content_length > 0 else b"{}"
            try:
                payload = json.loads(body_bytes.decode("utf-8") or "{}")
                record_ids = payload.get("recordIds") or ([payload.get("recordId")] if payload.get("recordId") else [])
                res = DatabaseService.delete_surveys(record_ids)
                self.send_json_response(200, res)
                return
            except Exception as err:
                self.send_json_response(500, {"error": str(err)})
                return

        self.send_json_response(404, {"error": "Not found"})

    def log_message(self, fmt, *args):
        """Clean single-line request logging."""
        pass


# ==============================================================================
# 5. Application Entry Point
# ==============================================================================

def run_server():
    DatabaseService.initialize()
    server = ThreadingHTTPServer((AppConfig.HOST, AppConfig.PORT), SurveyRequestHandler)
    print("=" * 60)
    print(" NBTC Microwave — Survey Control Room Server")
    print(f" Address : http://localhost:{AppConfig.PORT}")
    print(f" Pages   : http://localhost:{AppConfig.PORT}/ (Dashboard & Field Form)")
    print(f" Storage : {AppConfig.DATA_DIR}")
    print("=" * 60)
    server.serve_forever()


if __name__ == "__main__":
    run_server()
