---
name: backend-api-pro
description: >-
  Backend and API architecture guidelines for Pre-PM Survey (Pre_PM2) — Python 3
  HTTP server (database.py), SQLite (survey.db), Client API layer (src/lib/api.js),
  GitHub Contents API sync, and Cloudflare R2 static snapshot compatibility.
license: Internal project skill (no external redistribution terms)
---

# Backend & API Architecture Guidelines (Pre-PM2)

## Overview

คู่มือการพัฒนาและรักษาความเข้ากันได้ของระบบ Backend และ Client API สำหรับ **NBTC Microwave Pre-PM Survey (`Pre_PM2`)**
ครอบคลุมทั้ง:
1. **Local Backend (`database.py`)**: Python 3 `http.server` + SQLite (`survey.db`) สำหรับเครื่อง local / OneDrive
2. **Client API Layer (`src/lib/api.js`)**: Direct GitHub sync, BroadcastChannel, Offline localStorage cache
3. **Production Static Snapshots (`deploy_r2.py`)**: อัปโหลดข้อมูล snapshot ไปยัง Cloudflare R2
   - v2.11.0: snapshot ที่ขึ้น CDN ถูก `sanitize_dashboard_payload()` ตัด `contactName`/`contactPosition`/`contactPhone`/`informantName` ออกจาก `recent[]` (ข้อมูลติดต่อในเครื่อง local ยังครบ)
   - **ห้ามเพิ่มการอัปโหลด secret ใด ๆ ขึ้น bucket สาธารณะ** — `/api/sync-config` และ `/sync-config` ถอดออกแล้วและถูก purge ทุกรอบ deploy (`LEGACY_SECRET_KEYS`)
   - ตัวเลือกใหม่: `--dry-run` (ตรวจสอบสิ่งที่จะอัปโหลด/ลบโดยไม่แตะ R2), `--purge-secrets-only` (ล้าง object ที่เคยแจก token อย่างเดียว), `--strip-station-contacts` หรือ env `R2_STRIP_STATION_CONTACTS=1`

---

## API Contracts & Endpoints

### 1. Local Python Server (`database.py` :8765)

| Endpoint | Method | Purpose | Payload / Response |
|---|---|---|---|
| `/api/login`, `/login` | `POST` | ตรวจสอบรหัสผ่านจริง (`FORM_PASSWORD` หรือ `access-password.txt`) แล้วออก bearer token อายุ 8 ชม. | `{password}` → `200 {"token": "<43 chars>", "ok": true}` / `401 {"token": null, "ok": false, "error": "invalid_password"}` |
| `/api/dashboard` | `GET` | ดึงสถิติและรายการสำรวจทั้งหมด | `{stats, provinces, recent: [...]}` |
| `/api/database`, `/database` | `GET` | ดึงข้อมูล Master Stations จาก `DATABASE.xlsx` | `[{"station": "...", "province": "..."}, ...]` |
| `/api/save`, `/save` | `POST` | บันทึกแบบสำรวจใหม่/แก้ไข | `{"fields": {...}, "photos": [...]}` → `{"saved": true, "recordId": "..."}` |
| `/api/update`, `/api/update` | `POST` | แก้ไขแบบสำรวจตาม `recordId` | `{"recordId": "...", "fields": {...}}` → `{"saved": true, "updated": true}` |
| `/api/delete`, `/delete` | `POST` / `DELETE` | ลบแบบสำรวจ (เดี่ยวหรือ batch) | `{"recordIds": ["PM-..."]}` → `{"deleted": true, "count": N, "deletedIds": [...], "githubDeleted": bool, "githubFailed": [{id, reason}]}` |
| `/api/export-pdf` | `GET` | ส่งออก PDF รวม (มีเฉพาะเครื่อง local) | Query: `?ids=PM-1,PM-2` → Content-Type: `application/pdf` |
| `/photos/<filename>` | `GET` | อ่านไฟล์รูปถ่ายจากโฟลเดอร์ `photos/` | Image binary |

### 1.1 Authorization Model (v2.10.0)
- Default bind `HOST=127.0.0.1`; คำขอจาก **loopback** ผ่านได้โดยไม่ต้องมี token (รองรับ `npm run dev` proxy และเครื่องที่รันเซิร์ฟเวอร์เอง)
- คำขอจาก **นอกเครื่อง** บน path ข้อมูล (`/api/*`, `/database`, `/photos/*`) ต้องมี `Authorization: Bearer <token>` จาก `POST /api/login` → ไม่ผ่านได้ `401 {"error": "unauthorized"}`
- `POST /api/save|/update|/delete` และ `do_DELETE` ตรวจ Origin ก่อน (ไม่อยู่ใน allowlist → `403 origin_not_allowed`) แล้วจึงตรวจ token
- CORS สะท้อนเฉพาะ `ALLOWED_ORIGINS` (ไม่ใช้ `*`); env: `HOST`, `PORT`, `REQUIRE_TOKEN=1` (บังคับ token แม้ loopback), `ALLOWED_ORIGINS`, `FORM_PASSWORD`
- ถ้าไม่ได้ตั้ง `FORM_PASSWORD`/ไฟล์รหัสผ่าน ระบบสุ่มรหัสต่อ process → login จากเครื่องอื่นใช้ไม่ได้จนกว่าจะตั้งรหัสถาวร (loopback ยังทำงานปกติ)
- `githubDeleted` ในผลลบข้อมูลบอกตามจริงว่าเซิร์ฟเวอร์ลบไฟล์บน GitHub สำเร็จหรือไม่ — client ที่ถือ PAT ต้องไปลบเองเมื่อค่าเป็น `false`

### 2. Client-Side GitHub API Layer (`src/lib/api.js`)

ใช้สำหรับ Production (Cloudflare R2) ที่ไม่มี Python Server ทำงาน (GitHub token **ไม่ถูกฝังใน bundle อีกแล้ว (v2.9.0) — ใช้ Fine-grained PAT ที่ผู้ใช้ใส่ใน `GitHubTokenModal` และเก็บใน `localStorage` เท่านั้น):
- **Write**: `commitSurveyToGitHubClient(survey, token)` → `PUT https://api.github.com/repos/Thaidimaru/Pre_PM2/contents/data/surveys/<recordId>.json`
- **Delete**: `deleteSurveyFromGitHubClient(recordId, token)` → `DELETE https://api.github.com/repos/Thaidimaru/Pre_PM2/contents/data/surveys/<recordId>.json`
- **Read & Polling**: `fetchSurveysFromGitHubClient()` ใช้ ETag commit polling เพื่อประหยัด rate limit
- **Concurrency**: ต้องตรวจสอบ `sha` ล่าสุดเสมอ และมี lock/queue เพื่อป้องกัน 409 Conflict

---

## Development & Security Guidelines

### 1. Database Safety & Parameterization (Python / SQLite)
```python
# ถูกต้อง: ใช้ Parameterized Query เสมอ
cursor.execute("SELECT * FROM surveys WHERE record_id = ?", (record_id,))

# ห้ามเด็ดขาด: ห้ามใช้ String Concatenation หรือ F-strings ใน SQL
# cursor.execute(f"SELECT * FROM surveys WHERE record_id = '{record_id}'")  # อันตราย
```

### 2. Static-Host Awareness
ฟังก์ชันใดๆ ใน `src/lib/api.js` ต้องตระหนักว่าบน Production (`r2.dev`) จะไม่มีเซิร์ฟเวอร์รับคำขอ POST:
```javascript
const isStaticHost =
  typeof window !== 'undefined' &&
  (window.location.hostname.includes('r2.dev') ||
   window.location.hostname.includes('cloudflare'));

if (isStaticHost) {
  // ข้าม POST /api/* และส่งตรงไปยัง GitHub API หรือจัดการบน client
}
```

### 3. Concurrency & Mutex for GitHub Writes
ทุกการบันทึกหรือลบไฟล์ JSON บน GitHub ต้อง:
- GET ตรวจสอบว่ามีไฟล์อยู่หรือไม่ ถ้ามีให้นำ `sha` ล่าสุดมาใส่ใน body
- หากเกิด 409 Conflict ให้ retry สูงสุด 3 ครั้ง พร้อม exponential backoff
- ป้องกันการส่ง request ซ้ำซ้อนสำหรับ `recordId` เดียวกันในเวลาเดียวกัน
