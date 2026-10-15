"""
NBTC Microwave — Pre-PM Survey Official PDF Exporter
Generates official, print-ready Thai government standard A4 PDF reports (TH Sarabun New)
for all surveyed microwave repeater stations.
"""

import argparse
import base64
import datetime as dt
import html
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys

ROOT_DIR = Path(__file__).resolve().parent
ONEDRIVE_DATA_DIR = Path(r"C:\Users\utai3\OneDrive\NBTC Microwave\Data")
DATA_DIR = ONEDRIVE_DATA_DIR if ONEDRIVE_DATA_DIR.exists() else ROOT_DIR

DB_PATH = DATA_DIR / "survey.db"
DEFAULT_OUTPUT_PDF = DATA_DIR / "SURVEY_REPORTS_ALL.pdf"

THAI_MONTHS = [
    "", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
]


def format_thai_date(raw_date: str) -> str:
    """Format ISO or YYYY-MM-DD date into formal Thai date (e.g., 5 ตุลาคม 2569)."""
    if not raw_date or raw_date == "-":
        return "-"
    try:
        if isinstance(raw_date, str) and re.match(r"^\d{4}-\d{2}-\d{2}", raw_date):
            parts = raw_date[:10].split("-")
            year = int(parts[0]) + 543
            month = int(parts[1])
            day = int(parts[2])
            month_name = THAI_MONTHS[month] if 1 <= month <= 12 else str(month)
            return f"{day} {month_name} {year}"
        
        # Try datetime parsing
        d = dt.datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
        year = d.year + 543
        month_name = THAI_MONTHS[d.month]
        return f"{d.day} {month_name} {year}"
    except Exception:
        return str(raw_date)


def find_browser_executable(preferred: str = None) -> str:
    """Find Google Chrome or Microsoft Edge executable on the system."""
    candidates = []
    if preferred == "chrome":
        candidates = [
            shutil.which("chrome"),
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            shutil.which("msedge"),
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        ]
    elif preferred == "edge":
        candidates = [
            shutil.which("msedge"),
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            shutil.which("chrome"),
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ]
    else:
        candidates = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            shutil.which("chrome"),
            shutil.which("msedge"),
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        ]

    for c in candidates:
        if c and Path(c).exists():
            return str(c)

    raise FileNotFoundError("Neither Google Chrome nor Microsoft Edge was found on this system.")


def load_fonts_and_logos():
    """Load embedded fonts and logos as base64 data URIs."""
    font_reg_path = ROOT_DIR / "public" / "fonts" / "THSarabunNew.ttf"
    font_bold_path = ROOT_DIR / "public" / "fonts" / "THSarabunNew-Bold.ttf"
    if not font_bold_path.exists():
        font_bold_path = ROOT_DIR / "public" / "fonts" / "THSarabunNew Bold.ttf"

    font_reg_b64 = base64.b64encode(font_reg_path.read_bytes()).decode("ascii") if font_reg_path.exists() else ""
    font_bold_b64 = base64.b64encode(font_bold_path.read_bytes()).decode("ascii") if font_bold_path.exists() else ""

    nbtc_logo_path = ROOT_DIR / "src" / "assets" / "images" / "nbtc-logo-dashboard.png"
    forth_logo_path = ROOT_DIR / "src" / "assets" / "images" / "forth-logo.png"

    nbtc_logo_b64 = base64.b64encode(nbtc_logo_path.read_bytes()).decode("ascii") if nbtc_logo_path.exists() else ""
    forth_logo_b64 = base64.b64encode(forth_logo_path.read_bytes()).decode("ascii") if forth_logo_path.exists() else ""

    return {
        "font_reg": font_reg_b64,
        "font_bold": font_bold_b64,
        "nbtc_logo": f"data:image/png;base64,{nbtc_logo_b64}" if nbtc_logo_b64 else "",
        "forth_logo": f"data:image/png;base64,{forth_logo_b64}" if forth_logo_b64 else "",
    }


def fetch_survey_data(db_path: Path = DB_PATH) -> list:
    """Fetch all surveys and their photos directly from survey.db."""
    if not db_path.exists():
        raise FileNotFoundError(f"Database not found at {db_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Synchronize latest survey records from data/surveys/*.json
    try:
        from database import DatabaseService
        DatabaseService._seed_surveys_from_json(conn)
    except Exception as e:
        print(f"[WARN] Survey JSON synchronization skipped: {e}")

    # Load stations mapping
    stations_map = {}
    try:
        st_rows = cursor.execute("SELECT * FROM stations").fetchall()
        for r in st_rows:
            v = str(r["village"] or "").strip()
            if v:
                stations_map[v] = dict(r)
    except Exception:
        pass

    # Load all photos grouped by survey_id
    photos_by_survey = {}
    try:
        p_rows = cursor.execute("SELECT id, survey_id, name, content_type, data FROM survey_photos ORDER BY id ASC").fetchall()
        for p in p_rows:
            sid = p["survey_id"]
            p_b64 = base64.b64encode(p["data"]).decode("ascii")
            photos_by_survey.setdefault(sid, []).append({
                "id": p["id"],
                "name": p["name"] or f"photo_{p['id']}.jpg",
                "contentType": p["content_type"] or "image/jpeg",
                "dataUrl": f"data:{p['content_type'] or 'image/jpeg'};base64,{p_b64}"
            })
    except Exception as e:
        print(f"[WARN] Error loading survey photos: {e}")

    # Load surveys
    surveys = []
    try:
        s_rows = cursor.execute(
            "SELECT id, record_id, saved_at, fields_json FROM surveys WHERE saved_at >= '2026-10-05T00:00:00' ORDER BY saved_at ASC, id ASC"
        ).fetchall()

        for s in s_rows:
            sid = s["id"]
            rec_id = s["record_id"]
            saved_at = s["saved_at"]
            try:
                fields = json.loads(s["fields_json"])
            except Exception:
                fields = {}

            # Fallback station lookup
            station_name = str(fields.get("station") or fields.get("stationSelect") or fields.get("village") or "").strip()
            st_info = stations_map.get(station_name, {})

            province = fields.get("province") or st_info.get("province") or ""
            district = fields.get("district") or st_info.get("district") or ""
            subdistrict = fields.get("subdistrict") or st_info.get("subdistrict") or ""
            installation_place = fields.get("installationPlace") or fields.get("installation_place") or st_info.get("installation_place") or ""
            equipment_place = fields.get("equipmentPlace") or fields.get("equipment_place") or st_info.get("equipment_place") or installation_place or "-"

            contact_name = fields.get("contactName") or fields.get("contact_name") or st_info.get("contact_name") or fields.get("informantName") or fields.get("informant_name") or "-"
            contact_position = fields.get("contactPosition") or fields.get("contact_position") or st_info.get("contact_position") or "เจ้าของพื้นที่ / ผู้ดูแลสถานี"
            contact_village = fields.get("contactVillage") or fields.get("contact_village") or (f"ต.{subdistrict.replace('ต.', '')}" if subdistrict else "-")
            contact_phone = fields.get("contactPhone") or fields.get("contact_phone") or fields.get("phone") or st_info.get("contact_phone") or "-"

            permit = fields.get("permit") or "อนุญาต"
            is_permitted = permit in ("อนุญาต", "on", "true", True)

            photos = photos_by_survey.get(sid, [])

            surveys.append({
                "id": sid,
                "recordId": rec_id,
                "savedAt": saved_at,
                "station": station_name,
                "province": province,
                "district": district,
                "subdistrict": subdistrict,
                "installationPlace": installation_place,
                "equipmentPlace": equipment_place,
                "contactName": contact_name,
                "contactPosition": contact_position,
                "contactVillage": contact_village,
                "contactPhone": contact_phone,
                "permit": "อนุญาต" if is_permitted else "ไม่อนุญาต",
                "isPermitted": is_permitted,
                "accessLimit": fields.get("accessLimit") or fields.get("access_limit") or "ไม่มีข้อจำกัด",
                "radioStatus": fields.get("radioStatus") or fields.get("radio_status") or "ปกติ",
                "receiveStatus": fields.get("receiveStatus") or fields.get("receive_status") or "ปกติ",
                "transmitStatus": fields.get("transmitStatus") or fields.get("transmit_status") or "ปกติ",
                "powerStatus": fields.get("powerStatus") or fields.get("power_status") or "ปกติ",
                "batteryStatus": fields.get("batteryStatus") or fields.get("battery_status") or "ปกติ",
                "groundStatus": fields.get("groundStatus") or fields.get("ground_status") or "ปกติ",
                "userProblem": fields.get("userProblem") or fields.get("user_problem") or "ไม่พบปัญหาเพิ่มเติม",
                "siteCondition": fields.get("siteCondition") or fields.get("site_condition") or "สภาพพื้นที่ปกติ พร้อมสำหรับการปฏิบัติงาน",
                "antennaCondition": fields.get("antennaCondition") or fields.get("antenna_condition") or "สภาพเสาและสายอากาศอยู่ในเกณฑ์ปกติ",
                "workObstacle": fields.get("workObstacle") or fields.get("work_obstacle") or "ไม่มีอุปสรรคในการปฏิบัติงาน",
                "summary": fields.get("summary") or fields.get("userSummary") or "เจ้าของพื้นที่ให้ความร่วมมือในการเข้าตรวจเยี่ยมและตรวจสอบสภาพระบบอุปกรณ์เป็นอย่างดี",
                "informantName": fields.get("informantName") or fields.get("informant_name") or (contact_name if contact_name != "-" else ""),
                "operatorName": fields.get("operatorName") or fields.get("operator_name") or "วิศวกรผู้ควบคุมงาน",
                "visitDate": fields.get("visitDate") or fields.get("visit_date") or saved_at[:10],
                "visitTime": fields.get("visitTime") or fields.get("visit_time") or (saved_at[11:16] if len(saved_at) >= 16 else "-"),
                "photos": photos,
            })
    finally:
        conn.close()

    return surveys


def generate_html_document(surveys: list, assets: dict, include_photos: bool = True) -> str:
    """Generate the complete multi-page HTML document for headless Chromium printing."""
    font_reg = assets.get("font_reg", "")
    font_bold = assets.get("font_bold", "")
    nbtc_logo = assets.get("nbtc_logo", "")
    forth_logo = assets.get("forth_logo", "")

    # Calculate statistics
    total_stations = len(surveys)
    allowed_count = sum(1 for s in surveys if s["isPermitted"])
    denied_count = total_stations - allowed_count
    total_photos = sum(len(s["photos"]) for s in surveys)

    # Province breakdown
    prov_counts = {}
    for s in surveys:
        p = s["province"] or "ไม่ระบุจังหวัด"
        prov_counts[p] = prov_counts.get(p, 0) + 1

    current_thai_date = format_thai_date(dt.date.today().isoformat())

    html_parts = []

    # HTML Shell and Styles
    html_parts.append(f"""<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>รายงานผลการสำรวจ Pre-PM — NBTC Microwave (ทั้งหมด {total_stations} สถานี)</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');

@font-face {{
  font-family: 'TH Sarabun New';
  font-style: normal;
  font-weight: 400;
  src: url('data:font/truetype;base64,{font_reg}') format('truetype');
}}

@font-face {{
  font-family: 'TH Sarabun New';
  font-style: normal;
  font-weight: 700;
  src: url('data:font/truetype;base64,{font_bold}') format('truetype');
}}

@page {{
  size: A4 portrait;
  margin: 0;
}}

* {{
  box-sizing: border-box;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}}

body {{
  margin: 0;
  padding: 0;
  background-color: #ffffff;
  color: #000000;
  font-family: 'TH Sarabun New', 'Sarabun', 'Noto Sans Thai', Tahoma, sans-serif;
  font-size: 13.5px;
  line-height: 1.25;
}}

.a4-page {{
  width: 210mm;
  height: 296mm;
  max-height: 296mm;
  padding: 8mm 11mm 8mm 11mm;
  page-break-after: always;
  break-after: page;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background-color: #ffffff;
}}

.a4-page:last-child {{
  page-break-after: avoid;
  break-after: avoid;
}}

/* Header */
.doc-header {{
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid #000000;
  padding-bottom: 4px;
  margin-bottom: 4px;
}}
.header-logo-nbtc {{
  width: 85px;
  height: 60px;
  object-fit: contain;
}}
.header-logo-forth {{
  width: 90px;
  height: 24px;
  object-fit: contain;
}}
.header-title-box {{
  flex: 1;
  text-align: center;
  padding: 0 8px;
}}
.header-title-box h1 {{
  font-size: 13.5px;
  font-weight: 700;
  margin: 0;
  line-height: 1.15;
  color: #111827;
}}
.header-title-box h2 {{
  font-size: 13.5px;
  font-weight: 700;
  margin: 2px 0 0 0;
  line-height: 1.15;
  color: #374151;
}}
.header-title-box h3 {{
  font-size: 13px;
  font-weight: 700;
  margin: 2px 0 0 0;
  line-height: 1.15;
  color: #4b5563;
}}

/* Subheader Meta */
.doc-meta {{
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
  padding-bottom: 4px;
  color: #111827;
}}
.doc-meta-bold {{
  font-weight: 700;
  color: #000000;
}}
.font-mono {{
  font-family: Consolas, monospace;
}}

/* Tables */
.section-title {{
  background-color: #f3f4f6;
  font-weight: 700;
  border: 1px solid #000000;
  padding: 2px 8px;
  font-size: 13.5px;
  color: #000000;
  margin-top: 3px;
}}
table.report-table {{
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #000000;
  border-top: none;
  font-size: 13px;
  line-height: 1.25;
  margin-bottom: 3px;
}}
table.report-table th, table.report-table td {{
  border: 1px solid #000000;
  padding: 2.5px 6px;
}}
.th-bg {{
  background-color: #f9fafb;
  font-weight: 700;
  color: #000000;
}}
.text-center {{
  text-align: center;
}}
.text-right {{
  text-align: right;
}}

/* Badges */
.badge-ok {{
  display: inline-block;
  padding: 1px 6px;
  background-color: #ecfdf5;
  color: #065f46;
  font-weight: 700;
  border-radius: 3px;
  border: 1px solid #10b981;
  font-size: 11.5px;
}}
.badge-fail {{
  display: inline-block;
  padding: 1px 6px;
  background-color: #fff1f2;
  color: #9f1239;
  font-weight: 700;
  border-radius: 3px;
  border: 1px solid #f43f5e;
  font-size: 11.5px;
}}

/* Summary Box */
.summary-box {{
  border: 1px solid #000000;
  border-top: none;
  padding: 6px 8px;
  font-size: 13px;
  min-height: 55px;
  background-color: #ffffff;
  color: #000000;
}}

/* Footer */
.page-footer {{
  padding-top: 3px;
  margin-top: 2px;
  border-top: 1px solid #9ca3af;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #4b5563;
}}

/* Photos Grid */
.photo-grid {{
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding-top: 4px;
}}
.photo-card {{
  border: 1px solid #000000;
  padding: 5px;
  background-color: #ffffff;
  border-radius: 2px;
  display: flex;
  flex-direction: column;
  align-items: center;
}}
.photo-img-box {{
  height: 175px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f9fafb;
  overflow: hidden;
  margin-bottom: 4px;
  border: 1px solid #e5e7eb;
}}
.photo-img {{
  max-height: 175px;
  max-width: 100%;
  object-fit: contain;
}}
.photo-meta {{
  width: 100%;
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  padding: 0 2px;
}}

/* Cover / Overview Cards */
.cover-box {{
  border: 2px solid #1e3a8a;
  border-radius: 8px;
  padding: 16px;
  margin: 10px 0;
  background-color: #f8fafc;
}}
.stat-grid {{
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin: 12px 0;
}}
.stat-card {{
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px;
  text-align: center;
  background-color: #ffffff;
}}
.stat-val {{
  font-size: 22px;
  font-weight: 700;
  color: #0284c7;
}}
.stat-lbl {{
  font-size: 12px;
  color: #475569;
  font-weight: 600;
}}
</style>
</head>
<body>
""")

    # =========================================================================
    # PAGE 0: Executive Cover & Overall Summary
    # =========================================================================
    html_parts.append(f"""
<div class="a4-page">
  <div>
    <!-- Header with Logos -->
    <div class="doc-header">
      <img src="{nbtc_logo}" class="header-logo-nbtc" alt="NBTC Logo">
      <div class="header-title-box">
        <h1>สำนักงานคณะกรรมการกิจการกระจายเสียง กิจการโทรทัศน์ และกิจการโทรคมนาคมแห่งชาติ (กสทช.)</h1>
        <h2>โครงการเพิ่มประสิทธิภาพระบบโครงข่ายสื่อสารด้วยอุปกรณ์ทวนสัญญาณผ่านคลื่นความถี่สูง (SHF)</h2>
        <h3>สัญญาเลขที่ 8680228 ลงวันที่ 23 กรกฎาคม 2568</h3>
      </div>
      <img src="{forth_logo}" class="header-logo-forth" alt="FORTH Logo">
    </div>

    <!-- Title Banner -->
    <div style="text-align: center; margin: 16px 0 8px 0; padding: 12px 16px; background-color: #0f172a; color: #ffffff; border-radius: 6px;">
      <h2 style="margin: 0; font-size: 19px; font-weight: 700; letter-spacing: 0.5px;">
        รายงานผลการตรวจเยี่ยมเจ้าของพื้นที่สำหรับงานบำรุงรักษาเชิงป้องกันล่วงหน้า (Pre-PM)
      </h2>
      <p style="margin: 4px 0 0 0; font-size: 13.5px; color: #38bdf8;">
        ระบบศูนย์ควบคุมและฐานข้อมูลสถานีวิทยุคมนาคม NBTC Microwave (รวมทั้งหมด {total_stations} สถานี)
      </p>
    </div>

    <!-- KPI Statistics Grid -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-val">{total_stations}</div>
        <div class="stat-lbl">สถานีที่สำรวจแล้ว</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #059669;">{allowed_count}</div>
        <div class="stat-lbl">อนุญาตให้เข้าพื้นที่</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #e11d48;">{denied_count}</div>
        <div class="stat-lbl">ไม่อนุญาต / ติดปัญหา</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #7c3aed;">{total_photos}</div>
        <div class="stat-lbl">ภาพถ่ายแนบรวม (รูป)</div>
      </div>
    </div>

    <!-- Province Summary Section -->
    <div class="section-title" style="margin-top: 10px;">
      สรุปจำนวนสถานีที่เข้าตรวจเยี่ยม แยกตามรายจังหวัด ({len(prov_counts)} จังหวัด)
    </div>
    <table class="report-table">
      <thead>
        <tr style="background-color: #f1f5f9; font-weight: 700;">
          <th style="width: 10%;" class="text-center">ลำดับ</th>
          <th style="width: 50%;">จังหวัด</th>
          <th style="width: 20%;" class="text-center">จำนวนสถานีที่ตรวจเยี่ยม</th>
          <th style="width: 20%;" class="text-center">สัดส่วน (%)</th>
        </tr>
      </thead>
      <tbody>
""")

    sorted_provinces = sorted(prov_counts.items(), key=lambda x: x[1], reverse=True)
    for p_idx, (p_name, count) in enumerate(sorted_provinces):
        pct = (count / total_stations) * 100 if total_stations else 0
        html_parts.append(f"""
        <tr>
          <td class="text-center">{p_idx + 1}</td>
          <td style="font-weight: 600;">{html.escape(p_name)}</td>
          <td class="text-center" style="font-weight: 700;">{count} สถานี</td>
          <td class="text-center">{pct:.1f}%</td>
        </tr>
""")

    html_parts.append(f"""
        <tr style="background-color: #f8fafc; font-weight: 700;">
          <td colspan="2" class="text-center">รวมทั้งสิ้น</td>
          <td class="text-center" style="color: #0284c7;">{total_stations} สถานี</td>
          <td class="text-center">100.0%</td>
        </tr>
      </tbody>
    </table>

    <!-- Project Information Notes -->
    <div style="margin-top: 10px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 12px; background-color: #f8fafc; font-size: 12.5px; line-height: 1.35;">
      <strong>หมายเหตุการรายงาน:</strong><br/>
      ๑. ข้อมูลผลสำรวจในรายงานฉบับนี้ ได้รับการจัดเก็บผ่านระบบ Pre-PM Survey Mobile & Web Application ของบริษัท ฟอร์ท คอร์ปอเรชั่น จำกัด (มหาชน)<br/>
      ๒. เอกสารรายงานแต่ละสถานีประกอบด้วยแบบบันทึกผลการตรวจเยี่ยมอย่างเป็นทางการ และภาคผนวกภาพถ่ายสภาพสถานที่จริง<br/>
      ๓. ข้อมูลทั้งหมดพร้อมนำส่งสำนักงาน กสทช. เพื่อประกอบการดำเนินงานบำรุงรักษาเชิงป้องกันตามสัญญาเลขที่ 8680228 ต่อไป
    </div>
  </div>

  <!-- Cover Footer -->
  <div class="page-footer">
    <span>โครงการบำรุงรักษาเชิงป้องกันล่วงหน้า (Pre-PM) — บริษัท ฟอร์ท คอร์ปอเรชั่น จำกัด (มหาชน)</span>
    <span>วันที่จัดพิมพ์: {current_thai_date}</span>
  </div>
</div>
""")

    # =========================================================================
    # MASTER INDEX PAGES (Index Table of all 56 surveys)
    # =========================================================================
    INDEX_PAGE_SIZE = 28
    for page_chunk_idx in range(0, total_stations, INDEX_PAGE_SIZE):
        chunk_surveys = surveys[page_chunk_idx:page_chunk_idx + INDEX_PAGE_SIZE]
        page_num = (page_chunk_idx // INDEX_PAGE_SIZE) + 1
        total_index_pages = (total_stations + INDEX_PAGE_SIZE - 1) // INDEX_PAGE_SIZE

        html_parts.append(f"""
<div class="a4-page">
  <div>
    <div class="doc-header">
      <img src="{nbtc_logo}" class="header-logo-nbtc" alt="NBTC Logo">
      <div class="header-title-box">
        <h1>สารบัญรายการตรวจเยี่ยมเจ้าของพื้นที่สถานีวิทยุคมนาคม Pre-PM (Master Index)</h1>
        <h2>โครงการบำรุงรักษาเชิงป้องกันล่วงหน้า — สัญญาเลขที่ 8680228</h2>
      </div>
      <img src="{forth_logo}" class="header-logo-forth" alt="FORTH Logo">
    </div>

    <div class="section-title">
      ตารางรายการสถานีที่ตรวจเยี่ยมทั้งหมด (หน้า {page_num} จาก {total_index_pages}) — ลำดับที่ {page_chunk_idx + 1} ถึง {min(page_chunk_idx + len(chunk_surveys), total_stations)}
    </div>

    <table class="report-table" style="font-size: 12px;">
      <thead>
        <tr style="background-color: #f1f5f9; font-weight: 700;">
          <th style="width: 5%;" class="text-center">ลำดับ</th>
          <th style="width: 18%;">รหัสรายการ</th>
          <th style="width: 25%;">ชื่อสถานี</th>
          <th style="width: 14%;">อำเภอ</th>
          <th style="width: 14%;">จังหวัด</th>
          <th style="width: 10%;" class="text-center">ผลขออนุญาต</th>
          <th style="width: 8%;" class="text-center">รูปแนบ</th>
          <th style="width: 6%;" class="text-center">รายงาน</th>
        </tr>
      </thead>
      <tbody>
""")

        for sub_idx, s in enumerate(chunk_surveys):
            global_no = page_chunk_idx + sub_idx + 1
            badge = '<span class="badge-ok">อนุญาต</span>' if s["isPermitted"] else '<span class="badge-fail">ไม่อนุญาต</span>'
            p_count = len(s["photos"])
            photo_badge = f'<span style="color: #0284c7; font-weight: 700;">{p_count}</span>' if p_count > 0 else '<span style="color: #9ca3af;">0</span>'

            html_parts.append(f"""
        <tr>
          <td class="text-center">{global_no}</td>
          <td class="font-mono" style="font-size: 11px;">{html.escape(s['recordId'])}</td>
          <td style="font-weight: 600;">{html.escape(s['station'])}</td>
          <td>{html.escape(s['district'] or '-')}</td>
          <td>{html.escape(s['province'] or '-')}</td>
          <td class="text-center">{badge}</td>
          <td class="text-center">{photo_badge}</td>
          <td class="text-center" style="font-weight: 700; color: #1e3a8a;">#{global_no}</td>
        </tr>
""")

        html_parts.append(f"""
      </tbody>
    </table>
  </div>

  <div class="page-footer">
    <span>สารบัญรายการสถานี Pre-PM ทั้งหมด {total_stations} สถานี</span>
    <span>สารบัญหน้า {page_num} จาก {total_index_pages}</span>
  </div>
</div>
""")

    # =========================================================================
    # INDIVIDUAL SURVEY REPORT PAGES (56 Stations)
    # =========================================================================
    for idx, s in enumerate(surveys):
        station_no = idx + 1
        st_name = html.escape(s["station"] or "-")
        record_id = html.escape(s["recordId"] or "-")
        visit_date_th = format_thai_date(s["visitDate"])
        visit_time = f"{s['visitTime']} น." if s["visitTime"] and s["visitTime"] != "-" else "-"

        # Calculate photos pages for this station
        station_photos = s["photos"] if include_photos else []
        PHOTOS_PER_PAGE = 6
        photo_chunks = [station_photos[i:i + PHOTOS_PER_PAGE] for i in range(0, len(station_photos), PHOTOS_PER_PAGE)]
        station_total_pages = 1 + len(photo_chunks)

        # Operational status checks
        radio_ok = s["radioStatus"] == "ปกติ"
        receive_ok = s["receiveStatus"] in ("ปกติ", "ไม่พบ", "ไม่พบปัญหา")
        transmit_ok = s["transmitStatus"] in ("ปกติ", "ไม่พบ", "ไม่พบปัญหา")
        signal_ok = receive_ok and transmit_ok
        power_ok = s["powerStatus"] in ("ปกติ", "ไม่มี", "ไม่มีปัญหา")
        battery_ok = s["batteryStatus"] in ("ปกติ", "ไม่มี", "ไม่มีปัญหา")
        ground_ok = s["groundStatus"] in ("ปกติ", "ไม่มี", "ไม่มีปัญหา", "ไม่พบ")

        # Full location string
        loc_parts = []
        if s["subdistrict"]:
            loc_parts.append(f"ต.{s['subdistrict'].replace('ต.', '')}")
        if s["district"]:
            loc_parts.append(f"อ.{s['district'].replace('อ.', '')}")
        if s["province"]:
            loc_parts.append(f"จ.{s['province'].replace('จ.', '')}")
        loc_str = " ".join(loc_parts) or "-"

        # ---------------------------------------------------------------------
        # Report Page 1: Official Thai Government Survey Sheet
        # ---------------------------------------------------------------------
        html_parts.append(f"""
<div class="a4-page">
  <div>
    <!-- 1. Header with Logos & Project Title -->
    <div class="doc-header">
      <img src="{nbtc_logo}" class="header-logo-nbtc" alt="NBTC Logo">
      <div class="header-title-box">
        <h1>โครงการเพิ่มประสิทธิภาพระบบโครงข่ายสื่อสารด้วยอุปกรณ์ทวนสัญญาณผ่านคลื่นความถี่สูง (SHF)</h1>
        <h2>เพื่อสนับสนุนการปฏิบัติราชการและแก้ไขปัญหาให้กับประชาชนในพื้นที่ห่างไกล</h2>
        <h3>สัญญาเลขที่ 8680228 ลงวันที่ 23 กรกฎาคม 2568</h3>
      </div>
      <img src="{forth_logo}" class="header-logo-forth" alt="FORTH Logo">
    </div>

    <!-- Document Meta Subheader -->
    <div class="doc-meta">
      <div>
        <span class="doc-meta-bold">รหัสรายการสำรวจ: </span>
        <span class="font-mono doc-meta-bold">{record_id}</span>
      </div>
      <div>
        <span class="doc-meta-bold">วันที่บันทึกตรวจเยี่ยม: </span>
        <span>{visit_date_th}</span>
      </div>
    </div>

    <!-- Section 1: ข้อมูลสถานีและสถานที่ติดตั้ง -->
    <div class="section-title">
      1. ข้อมูลสถานีและสถานที่ติดตั้ง (Station & Location Details)
    </div>
    <table class="report-table">
      <tbody>
        <tr>
          <td class="th-bg" style="width: 18%;">ชื่อสถานี</td>
          <td style="width: 32%; font-weight: 700;">{st_name}</td>
          <td class="th-bg" style="width: 20%;">สถานที่วางเครื่อง</td>
          <td style="width: 30%;">{html.escape(s['equipmentPlace'] or '-')}</td>
        </tr>
        <tr>
          <td class="th-bg">สถานที่ติดตั้ง</td>
          <td>{html.escape(s['installationPlace'] or '-')}</td>
          <td class="th-bg">ตำบล / อำเภอ / จังหวัด</td>
          <td>{html.escape(loc_str)}</td>
        </tr>
      </tbody>
    </table>

    <!-- Section 2: ข้อมูลเจ้าของพื้นที่และการขออนุญาต -->
    <div class="section-title">
      2. ข้อมูลผู้ให้ข้อมูล / เจ้าของพื้นที่ และการขออนุญาตเข้าพื้นที่ (Site Owner & Access Permission)
    </div>
    <table class="report-table">
      <tbody>
        <tr>
          <td class="th-bg" style="width: 18%;">ชื่อ - สกุล</td>
          <td style="width: 32%; font-weight: 700;">{html.escape(s['contactName'] or '-')}</td>
          <td class="th-bg" style="width: 20%;">ตำแหน่ง</td>
          <td style="width: 30%;">{html.escape(s['contactPosition'] or '-')}</td>
        </tr>
        <tr>
          <td class="th-bg">หน่วยงาน / หมู่บ้าน</td>
          <td>{html.escape(s['contactVillage'] or '-')}</td>
          <td class="th-bg">เบอร์โทรศัพท์</td>
          <td class="font-mono">{html.escape(s['contactPhone'] or '-')}</td>
        </tr>
        <tr>
          <td class="th-bg">ผลการขออนุญาต</td>
          <td>
            <span class="{'badge-ok' if s['isPermitted'] else 'badge-fail'}">
              {'อนุญาตให้เข้าพื้นที่' if s['isPermitted'] else 'ไม่อนุญาตให้เข้าพื้นที่'}
            </span>
          </td>
          <td class="th-bg">ข้อจำกัดในการเข้าพื้นที่</td>
          <td>{html.escape(s['accessLimit'] or '-')}</td>
        </tr>
      </tbody>
    </table>

    <!-- Section 3: ผลการตรวจสอบและประเมินสภาพระบบอุปกรณ์ -->
    <div class="section-title">
      3. บันทึกผลการตรวจสอบและประเมินสภาพระบบอุปกรณ์ (Equipment & Operational Assessment)
    </div>
    <table class="report-table">
      <thead>
        <tr style="background-color: #f3f4f6; font-weight: 700; text-align: center;">
          <th style="width: 7%;">ลำดับ</th>
          <th style="width: 43%; text-align: left;">รายการตรวจประเมิน</th>
          <th style="width: 20%;">ผลการตรวจ</th>
          <th style="width: 30%; text-align: left;">รายละเอียด / ข้อสังเกต</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="text-center">1</td>
          <td>สภาพการทำงานของเครื่องวิทยุคมนาคม</td>
          <td class="text-center font-bold">
            <span class="{'badge-ok' if radio_ok else 'badge-fail'}">{'ปกติ' if radio_ok else 'ไม่ปกติ'}</span>
          </td>
          <td>{'เครื่องวิทยุทำงานปกติ' if radio_ok else 'พบข้อขัดข้องในการใช้งาน'}</td>
        </tr>
        <tr>
          <td class="text-center">2</td>
          <td>ภาครับ - ส่งสัญญาณ (Receiver & Transmitter)</td>
          <td class="text-center font-bold">
            <span class="{'badge-ok' if signal_ok else 'badge-fail'}">{'ปกติ' if signal_ok else 'ไม่ปกติ'}</span>
          </td>
          <td>{'รับและส่งสัญญาณได้ตามปกติ ชัดเจน' if signal_ok else 'พบข้อขัดข้องในการรับหรือส่งสัญญาณ'}</td>
        </tr>
        <tr>
          <td class="text-center">3</td>
          <td>ระบบไฟฟ้าหลักของสถานี (Power Supply)</td>
          <td class="text-center font-bold">
            <span class="{'badge-ok' if power_ok else 'badge-fail'}">{'ปกติ' if power_ok else 'ไม่ปกติ'}</span>
          </td>
          <td>{'ระบบไฟฟ้าจ่ายไฟสม่ำเสมอ' if power_ok else 'ระบบไฟฟ้าขัดข้อง / ไฟตกบ่อย'}</td>
        </tr>
        <tr>
          <td class="text-center">4</td>
          <td>แบตเตอรี่สำรอง (Backup Battery)</td>
          <td class="text-center font-bold">
            <span class="{'badge-ok' if battery_ok else 'badge-fail'}">{'ปกติ' if battery_ok else 'ไม่ปกติ'}</span>
          </td>
          <td>{'แบตเตอรี่สำรองพร้อมจ่ายไฟ' if battery_ok else 'แบตเตอรี่เสื่อมสภาพ / เก็บไฟไม่อยู่'}</td>
        </tr>
        <tr>
          <td class="text-center">5</td>
          <td>ระบบกราวด์ (Ground System)</td>
          <td class="text-center font-bold">
            <span class="{'badge-ok' if ground_ok else 'badge-fail'}">{'ปกติ' if ground_ok else 'ไม่ปกติ'}</span>
          </td>
          <td>{'ระบบกราวด์สมบูรณ์ ต่อลงดินเรียบร้อย' if ground_ok else 'ระบบกราวด์มีปัญหา / หลุดหลวม'}</td>
        </tr>
        <tr>
          <td class="th-bg text-center" colspan="2">ปัญหาเพิ่มเติมที่ผู้ใช้งานแจ้ง</td>
          <td colspan="2">{html.escape(s['userProblem'] or '-')}</td>
        </tr>
      </tbody>
    </table>

    <!-- Section 4: สภาพแวดล้อมหน้างานและอาคารสถานที่ -->
    <div class="section-title">
      4. สภาพแวดล้อมหน้างานและอาคารสถานที่ (Site Environmental & Physical Conditions)
    </div>
    <table class="report-table">
      <tbody>
        <tr>
          <td class="th-bg" style="width: 35%;">สภาพพื้นที่ติดตั้งอุปกรณ์</td>
          <td style="width: 65%;">{html.escape(s['siteCondition'] or '-')}</td>
        </tr>
        <tr>
          <td class="th-bg">สภาพเสาอากาศและสายอากาศ (มองเห็นจากพื้น)</td>
          <td>{html.escape(s['antennaCondition'] or '-')}</td>
        </tr>
        <tr>
          <td class="th-bg">อุปสรรคและข้อจำกัดในการปฏิบัติงาน</td>
          <td>{html.escape(s['workObstacle'] or '-')}</td>
        </tr>
      </tbody>
    </table>

    <!-- Section 5: สรุปผลการตรวจเยี่ยม -->
    <div class="section-title">
      5. สรุปผลการตรวจเยี่ยมและข้อคิดเห็น (Survey Summary & Recommendations)
    </div>
    <div class="summary-box" style="min-height: 38px; padding: 5px 8px;">
      {html.escape(s['summary'] or '-')}
    </div>

    <!-- Section 6: ลายมือชื่อผู้ให้ข้อมูลและผู้ตรวจเยี่ยม -->
    <div class="section-title">
      6. ลายมือชื่อผู้ให้ข้อมูลและเจ้าหน้าที่ผู้ตรวจเยี่ยม (Verification & Signatures)
    </div>
    <table class="report-table" style="margin-top: 0;">
      <tbody>
        <tr>
          <td style="width: 50%; text-align: center; padding: 8px; vertical-align: top;">
            <p style="margin: 0 0 20px 0; font-size: 12px; color: #374151;">ลงชื่อ....................................................................</p>
            <p style="margin: 0; font-weight: 700; font-size: 13px; color: #000000;">( {html.escape(s['informantName'] or s['contactName'] or '....................................................................')} )</p>
            <p style="margin: 2px 0 0 0; font-size: 11.5px; color: #374151;">{html.escape(s['contactPosition'] or 'ผู้ให้ข้อมูล / เจ้าของพื้นที่')}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #4b5563;">วันที่ .......... / .......... / ..........</p>
          </td>
          <td style="width: 50%; text-align: center; padding: 8px; vertical-align: top;">
            <p style="margin: 0 0 20px 0; font-size: 12px; color: #374151;">ลงชื่อ....................................................................</p>
            <p style="margin: 0; font-weight: 700; font-size: 13px; color: #000000;">( {html.escape(s['operatorName'] or '....................................................................')} )</p>
            <p style="margin: 2px 0 0 0; font-size: 11.5px; color: #374151;">ผู้ปฏิบัติงาน / เจ้าหน้าที่ตรวจเยี่ยม</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #4b5563;">วันที่ {visit_date_th if visit_date_th != '-' else '.......... / .......... / ..........'}</p>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Page 1 Footer -->
  <div class="page-footer">
    <span>โครงการบำรุงรักษาเชิงป้องกันล่วงหน้า (Pre-PM) — {st_name} (รหัส: {record_id})</span>
    <span>หน้า 1 จาก {station_total_pages}</span>
  </div>
</div>
""")

        # ---------------------------------------------------------------------
        # Report Page 2+: Photo Appendix Pages (if photos exist)
        # ---------------------------------------------------------------------
        for p_page_idx, p_chunk in enumerate(photo_chunks):
            current_appx_page = p_page_idx + 2
            html_parts.append(f"""
<div class="a4-page">
  <div>
    <!-- Appendix Header -->
    <div class="doc-header">
      <img src="{nbtc_logo}" class="header-logo-nbtc" alt="NBTC Logo">
      <div class="header-title-box">
        <h1>ภาคผนวก: ภาพถ่ายจากการเข้าตรวจเยี่ยมหน้างาน (Field Visit Documentation)</h1>
        <h2>สถานี: {st_name} | รหัสรายการ: {record_id} | วันที่: {visit_date_th}</h2>
      </div>
      <img src="{forth_logo}" class="header-logo-forth" alt="FORTH Logo">
    </div>

    <div class="section-title" style="margin-bottom: 6px;">
      ภาพถ่ายสภาพสถานที่และอุปกรณ์จริง — ชุดที่ {p_page_idx + 1} (ภาพที่ {p_page_idx * PHOTOS_PER_PAGE + 1} ถึง {p_page_idx * PHOTOS_PER_PAGE + len(p_chunk)} จาก {len(station_photos)} รูป)
    </div>

    <!-- Photos Grid (Max 6 per page: 2 cols x 3 rows) -->
    <div class="photo-grid">
""")

            for p_sub_idx, photo in enumerate(p_chunk):
                global_p_no = p_page_idx * PHOTOS_PER_PAGE + p_sub_idx + 1
                p_name = html.escape(photo["name"] or f"photo_{global_p_no}.jpg")
                p_data_url = photo["dataUrl"]

                html_parts.append(f"""
      <div class="photo-card">
        <div class="photo-img-box">
          <img src="{p_data_url}" class="photo-img" alt="{p_name}" loading="eager">
        </div>
        <div class="photo-meta">
          <span style="font-weight: 700; color: #000000;">รูปที่ {global_p_no}</span>
          <span class="font-mono" style="color: #4b5563; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="{p_name}">
            {p_name}
          </span>
        </div>
      </div>
""")

            html_parts.append(f"""
    </div>
  </div>

  <!-- Appendix Footer -->
  <div class="page-footer">
    <span>ภาคผนวกภาพถ่ายหน้างาน Pre-PM — {st_name}</span>
    <span>หน้า {current_appx_page} จาก {station_total_pages}</span>
  </div>
</div>
""")

    # Close HTML
    html_parts.append("""
</body>
</html>
""")

    return "".join(html_parts)


def export_pdf(
    output_path: Path = DEFAULT_OUTPUT_PDF,
    include_photos: bool = True,
    station_filter: str = None,
    record_filter: str = None,
    record_ids: list = None,
    preferred_browser: str = None,
    split_folder: Path = None,
    archive_folder: Path = None,
) -> Path:
    """
    Main export function: fetches surveys, renders HTML, and invokes headless Chromium to print PDF.
    """
    print("=" * 70)
    print("NBTC Microwave — Pre-PM Survey Official PDF Exporter")
    print("=" * 70)

    # 1. Fetch survey records
    print("[1/4] Fetching surveys and photo records from SQLite database...")
    surveys = fetch_survey_data(DB_PATH)
    if not surveys:
        print("[ERROR] No survey records found in survey.db.")
        sys.exit(1)

    # Apply filters if requested
    if record_ids:
        target_ids = {str(x).strip() for x in record_ids if str(x).strip()}
        surveys = [s for s in surveys if str(s.get("recordId", "")).strip() in target_ids or str(s.get("id", "")).strip() in target_ids]
        print(f"      Filtered by record_ids ({len(target_ids)} target(s)): {len(surveys)} record(s)")
    if station_filter:
        q = station_filter.lower().strip()
        surveys = [s for s in surveys if q in s["station"].lower() or q in s["province"].lower()]
        print(f"      Filtered by station/province '{station_filter}': {len(surveys)} record(s)")
    if record_filter:
        q = record_filter.strip()
        surveys = [s for s in surveys if q in s["recordId"] or str(s["id"]) == q]
        print(f"      Filtered by recordId/id '{record_filter}': {len(surveys)} record(s)")

    if not surveys:
        print("[ERROR] No surveys matched the specified filters.")
        sys.exit(1)

    total_photos = sum(len(s["photos"]) for s in surveys)
    print(f"      Found {len(surveys)} survey record(s) and {total_photos} photo(s).")

    # 2. Load Assets
    print("[2/4] Loading official logos and TH Sarabun New fonts...")
    assets = load_fonts_and_logos()

    # 3. Build HTML
    print(f"[3/4] Generating official A4 HTML layout (photos={'included' if include_photos else 'excluded'})...")
    html_content = generate_html_document(surveys, assets, include_photos=include_photos)

    # Write temporary HTML file
    temp_html = ROOT_DIR / "temp_survey_export.html"
    temp_html.write_text(html_content, encoding="utf-8")
    print(f"      Temporary HTML document built: {len(html_content)/(1024*1024):.2f} MB")

    # 4. Invoke headless Chrome/Edge to print PDF
    print("[4/4] Invoking Chromium headless engine to generate vector A4 PDF...")
    browser_exe = find_browser_executable(preferred_browser)
    print(f"      Using browser engine: {browser_exe}")

    output_path = Path(output_path).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        browser_exe,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--no-pdf-header-footer",
        f"--print-to-pdf={output_path}",
        str(temp_html.resolve()),
    ]

    try:
        res = subprocess.run(cmd, capture_output=True, timeout=180)
        if res.returncode != 0:
            print(f"[WARN] Browser returned non-zero code {res.returncode}: {res.stderr.decode('utf-8', errors='ignore')}")

        if not output_path.exists() or output_path.stat().st_size == 0:
            raise RuntimeError(f"Failed to create output PDF at {output_path}")

        pdf_size_mb = output_path.stat().st_size / (1024 * 1024)
        print("\n" + "=" * 70)
        print(f"[SUCCESS] Official PDF exported successfully!")
        print(f"  File: {output_path}")
        print(f"  Size: {pdf_size_mb:.2f} MB")
        print(f"  Surveys: {len(surveys)} stations")
        print(f"  Total Photos: {total_photos} attachments")
        print("=" * 70)

        # Handle split per-station export if requested
        if split_folder:
            split_folder = Path(split_folder).resolve()
            split_folder.mkdir(parents=True, exist_ok=True)
            print(f"\n[SPLIT] Generating individual PDF files into: {split_folder}")
            for idx, s in enumerate(surveys):
                clean_name = re.sub(r'[\\/*?:"<>|]', "", f"{idx+1:02d}_{s['station']}_{s['recordId']}")
                station_pdf_path = split_folder / f"{clean_name}.pdf"
                st_html = generate_html_document([s], assets, include_photos=include_photos)
                st_temp_html = split_folder / f"temp_{s['recordId']}.html"
                st_temp_html.write_text(st_html, encoding="utf-8")
                subprocess.run([
                    browser_exe,
                    "--headless=new",
                    "--disable-gpu",
                    "--no-pdf-header-footer",
                    f"--print-to-pdf={station_pdf_path}",
                    str(st_temp_html.resolve())
                ], capture_output=True, timeout=60)
                if st_temp_html.exists():
                    st_temp_html.unlink()
                if station_pdf_path.exists():
                    print(f"  [OK] Exported #{idx+1}: {station_pdf_path.name} [{station_pdf_path.stat().st_size / 1024:.1f} KB]")
            print(f"[SUCCESS] All individual station PDFs exported to '{split_folder}'.")

        # Handle structured archive organized by Province/District
        if archive_folder:
            archive_folder = Path(archive_folder).resolve()
            archive_folder.mkdir(parents=True, exist_ok=True)
            print(f"\n[ARCHIVE] Generating structured archive PDFs into: {archive_folder}")
            for idx, s in enumerate(surveys):
                province = (s.get("province") or "ไม่ระบุจังหวัด").strip()
                district = (s.get("district") or "ทั่วไป").strip()
                subfolder = archive_folder / province / district
                subfolder.mkdir(parents=True, exist_ok=True)

                clean_station = re.sub(r'[\\/*?:"<>|]', "", s['station']).strip()
                clean_rec = re.sub(r'[\\/*?:"<>|]', "", s['recordId']).strip()
                station_pdf_path = subfolder / f"PM_{clean_station}_{clean_rec}.pdf"

                st_html = generate_html_document([s], assets, include_photos=include_photos)
                st_temp_html = subfolder / f"temp_{clean_rec}.html"
                st_temp_html.write_text(st_html, encoding="utf-8")
                subprocess.run([
                    browser_exe,
                    "--headless=new",
                    "--disable-gpu",
                    "--no-pdf-header-footer",
                    f"--print-to-pdf={station_pdf_path}",
                    str(st_temp_html.resolve())
                ], capture_output=True, timeout=60)
                if st_temp_html.exists():
                    st_temp_html.unlink()
                if station_pdf_path.exists():
                    print(f"  [OK] Archived #{idx+1} ({province}/{district}): {station_pdf_path.name} [{station_pdf_path.stat().st_size / 1024:.1f} KB]")
            print(f"[SUCCESS] All station reports archived successfully into '{archive_folder}'.")

    finally:
        if temp_html.exists():
            temp_html.unlink()

    return output_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NBTC Microwave Pre-PM Survey Official PDF Exporter")
    parser.add_argument("-o", "--output", default=str(DEFAULT_OUTPUT_PDF), help="Target output PDF filepath")
    parser.add_argument("--no-photos", action="store_true", help="Exclude photo appendix pages")
    parser.add_argument("--station", help="Filter by station name or province")
    parser.add_argument("--id", help="Filter by survey recordId or ID")
    parser.add_argument("--browser", choices=["chrome", "edge"], help="Force specific browser executable")
    parser.add_argument("--split", metavar="DIR", help="Also export individual PDF per station into this directory")
    parser.add_argument(
        "--archive",
        nargs="?",
        const=str(DATA_DIR / "Reports"),
        help="Batch archive organized by Province/District into specified directory (default: Data/Reports)",
    )

    args = parser.parse_args()

    export_pdf(
        output_path=Path(args.output),
        include_photos=not args.no_photos,
        station_filter=args.station,
        record_filter=args.id,
        preferred_browser=args.browser,
        split_folder=Path(args.split) if args.split else None,
        archive_folder=Path(args.archive) if args.archive else None,
    )
