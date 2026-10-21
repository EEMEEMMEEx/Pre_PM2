# Runbook: Local Server (`database.py`) — Pre-PM Survey Control Room

เอกสารนี้สรุปวิธีรันและตั้งค่า local server สำหรับเครื่องผู้ดูแล · จัดทำโดย P3 (งาน `D6`)

## 1. ภาพรวม

- `python database.py` = HTTP server (ค่าเริ่มต้น `127.0.0.1:8765`) + SQLite (`survey.db`) + เสิร์ฟ SPA ที่ build แล้ว (`dist/`)
- ใช้เฉพาะเครื่องผู้ดูแล/เครื่อง admin — เครื่องภาคสนามใช้แอปบน Cloudflare R2 และซิงค์ข้อมูลผ่าน GitHub ด้วย PAT ของตนเอง
- ข้อมูลจริง: `survey.db`, `photos/`, `data/surveys/*.json` (ตัวหลังถูก commit ขึ้น repo)

## 2. ตัวแปรสภาพแวดล้อม

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `HOST` | `127.0.0.1` | ที่อยู่ที่ผูก (ตั้ง `0.0.0.0` เมื่อจงใจเปิดให้วง LAN — ต้องเข้าใจข้อ 3) |
| `PORT` | `8765` | พอร์ตของเซิร์ฟเวอร์ |
| `REQUIRE_TOKEN` | ปิด | `1` = บังคับ Bearer token แม้คำขอมาจาก loopback (ใช้ทดสอบเส้นทาง 401 หรือล็อกดาวน์เครื่อง) |
| `ALLOWED_ORIGINS` | `http://localhost:8765`, `http://127.0.0.1:8765`, `http://localhost:5173`, `http://127.0.0.1:5173` | origin ของเบราว์เซอร์ที่อนุญาตให้เรียก API (คั่นด้วย `,`) |
| `FORM_PASSWORD` | — | รหัสผ่านสำหรับ `POST /api/login` (ถ้าไม่ตั้ง จะอ่านจาก `access-password.txt`; ถ้าไม่มีทั้งคู่ ระบบสุ่มรหัสต่อ process) |
| `GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_PAT` | — | PAT สำหรับให้เซิร์ฟเวอร์ commit ข้อมูลขึ้น GitHub (หรือใช้ไฟล์ `github-token.txt` ที่ root — ถูก `.gitignore`) |
| `GITHUB_REPO` / `GITHUB_BRANCH` | `Thaidimaru/Pre_PM2` / `main` | ปลายทางของ GitHub sync ฝั่งเซิร์ฟเวอร์ |

## 3. นโยบายการเข้าถึง (v2.10.0 เป็นต้นมา)

- คำขอจาก **loopback** (เครื่องเดียวกับเซิร์ฟเวอร์ หรือ vite dev proxy) ใช้งานได้ตามปกติ
- คำขอ **จากนอกเครื่อง** ต้องมี `Authorization: Bearer <token>` จาก `POST /api/login` (อายุ 8 ชั่วโมง) มิฉะนั้นได้ `401 unauthorized`
- path ที่ถูกป้องกัน: `/api/*`, `/database`, `/photos/*` (มีข้อมูลส่วนบุคคล) รวมถึงทุก path ที่เขียนข้อมูล
- **CORS** สะท้อนเฉพาะ origin ใน `ALLOWED_ORIGINS` — เบราว์เซอร์จาก IP อื่นต้องเพิ่ม origin นั้นก่อน
- ถ้าเปิดให้ LAN จริง: ตั้ง `FORM_PASSWORD` ให้แข็งแรง, ใส่ origin ของผู้ใช้, และพิจารณา `REQUIRE_TOKEN=1` บนเครื่องที่ถือข้อมูลอ่อนไหว

## 4. ขั้นตอนรัน

```powershell
# 1) ติดตั้ง/ตรวจ dependencies (โปรเจกต์นี้ใช้ stdlib เป็นหลัก)
python --version            # แนะนำ 3.11+

# 2) ตั้งรหัสผ่าน (อย่าใช้ค่าเดิมที่เคยเปิดเผย)
$env:FORM_PASSWORD = "<ตั้งค่าใหม่>"

# 3) (ถ้าต้องการให้เซิร์ฟเวอร์ commit ขึ้น GitHub)
#    วาง PAT ใน github-token.txt ที่ root (ถูก gitignore) หรือ
$env:GITHUB_TOKEN = "<fine-grained PAT ของเครื่อง admin>"

# 4) รันเซิร์ฟเวอร์
python database.py
```

ผลลัพธ์ที่คาดหวังตอนสตาร์ต: บอก `Address`/`Storage`/สถานะ `Auth` และเตือนถ้าเปิดให้ LAN หรือยังไม่ได้ตั้งรหัสผ่าน

## 5. พฤติกรรมการจัดการข้อมูลตอนสตาร์ต (ต้องรู้ก่อนรัน)

1. `initialize()` สร้างตาราง, sync รายชื่อสถานีจาก `DATABASE.xlsx`/`AGWBS.xlsx`, และ seed ข้อมูลสำรวจจาก `data/surveys/`
2. มี **startup prune**: แถวใน `survey.db` ที่ไฟล์ JSON ถูกลบไปแล้วจะถูกลบออกจากฐานข้อมูล (ตรงกับหลักการ "Git เป็น source of truth")
3. ก่อนรันครั้งแรกหลังมีการลบข้อมูลจำนวนมาก ให้สำรอง `survey.db` และ `data/surveys/` ไว้ก่อน — ตัวอย่างที่เคยทำ: สำเนาไปที่ `%TEMP%\prepm_backup_<timestamp>`
4. `save_survey()` เขียนไฟล์สำรอง `survey-<timestamp>.json` ที่ root ของ repo — ปัจจุบัน `.gitignore` ยังไม่กันไฟล์นี้ (งาน `B6` ของ P1) ระวังอย่า `git add .`

## 6. การตรวจสอบสุขภาพเซิร์ฟเวอร์

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8765/" -UseBasicParsing | Select-Object StatusCode   # ต้องได้ 200
Invoke-WebRequest -Uri "http://127.0.0.1:8765/api/dashboard" -UseBasicParsing | Select-Object StatusCode
python scripts/audit_data.py      # ตรวจว่าไฟล์/SQLite/GitHub ตรงกัน
python scripts/pii_scan.py        # ตรวจข้อมูลส่วนบุคคลในเครื่องและ snapshot
```

## 7. ข้อห้าม

- ห้ามเปิด `HOST=0.0.0.0` โดยไม่มีรหัสผ่านที่ตั้งไว้ และไม่มี origin ที่จำกัด
- ห้าม commit `survey.db`, `photos/`, `access-password.txt`, `github-token.txt`, `r2-credentials.json`
- ห้ามลบ/แก้ `data/surveys/*.json` หรือ `survey.db` โดยไม่มีคำยืนยัน `YES, DELETE <path>` และไม่มีสำรอง
