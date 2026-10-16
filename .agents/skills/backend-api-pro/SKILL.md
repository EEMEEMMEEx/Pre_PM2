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

---

## API Contracts & Endpoints

### 1. Local Python Server (`database.py` :8765)

| Endpoint | Method | Purpose | Payload / Response |
|---|---|---|---|
| `/api/login`, `/login` | `POST` | ตรวจสอบรหัสผ่านระบบ | `{"token": "public", "ok": true}` |
| `/api/dashboard` | `GET` | ดึงสถิติและรายการสำรวจทั้งหมด | `{stats, provinces, recent: [...]}` |
| `/api/database`, `/database` | `GET` | ดึงข้อมูล Master Stations จาก `DATABASE.xlsx` | `[{"station": "...", "province": "..."}, ...]` |
| `/api/save`, `/save` | `POST` | บันทึกแบบสำรวจใหม่/แก้ไข | `{"fields": {...}, "photos": [...]}` → `{"saved": true, "recordId": "..."}` |
| `/api/update`, `/api/update` | `POST` | แก้ไขแบบสำรวจตาม `recordId` | `{"recordId": "...", "fields": {...}}` → `{"saved": true, "updated": true}` |
| `/api/delete`, `/delete` | `POST` / `DELETE` | ลบแบบสำรวจ (เดี่ยวหรือ batch) | `{"recordIds": ["PM-..."]}` → `{"deleted": true, "count": N}` |
| `/api/export-pdf` | `GET` | ส่งออก PDF รวม (มีเฉพาะเครื่อง local) | Query: `?ids=PM-1,PM-2` → Content-Type: `application/pdf` |
| `/photos/<filename>` | `GET` | อ่านไฟล์รูปถ่ายจากโฟลเดอร์ `photos/` | Image binary |

### 2. Client-Side GitHub API Layer (`src/lib/api.js`)

ใช้สำหรับ Production (Cloudflare R2) ที่ไม่มี Python Server ทำงาน:
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
