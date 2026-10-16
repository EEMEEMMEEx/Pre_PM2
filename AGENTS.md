# Agent Operating Manual (1 หน้า)

คู่มืออ้างอิงเร็วสำหรับ AI Agent และผู้พัฒนาใน **NBTC Microwave — Pre-PM Survey Control Room (`Pre_PM2`)** ใช้คู่กับ Global Rules และ [`GEMINI.md`](GEMINI.md) (ภาพรวมสถาปัตยกรรม, โครงสร้างโฟลเดอร์, Graft)

## CRITICAL SAFETY RULES (Repo-Specific)

### ขอบเขตงาน (Workspace Path Restriction)
- ทำงาน **เฉพาะภายใน workspace ของ repo นี้** (`Pre_PM2/`) เท่านั้น
- **ห้าม** อ่าน/เขียน/ลบ/รันคำสั่งที่กระทบ path **นอก repo** (เช่น drive root `C:\`, `D:\`, โฟลเดอร์ OneDrive จริง, หรือโปรเจกต์อื่น) เว้นแต่ผู้ใช้สั่งชัดเจน
- ใช้ absolute path ได้ **เมื่อชี้ไปที่ไฟล์ภายใน workspace เท่านั้น**

### โปรโตคอลก่อนลบไฟล์ (Deletion Protocol)
ก่อนลบไฟล์หรือโฟลเดอร์ **ใดๆ** ภายใน repo (รวม `data/surveys/*.json`, `*.xlsx`, `survey.db`, `photos/`) ต้องได้รับยืนยันชัดเจน:
1. แสดง **path ที่แน่นอน** ที่จะลบ
2. อธิบาย **สิ่งที่จะหายไป** และ **เหตุผล**
3. รอการยืนยันจากผู้ใช้ (เช่น `YES, DELETE <path>`) — หากไม่ชัดเจนให้ยกเลิกทันที

### Git, Deploy & Destructive Actions
- ห้าม force push ไป `main`, ห้าม `git reset --hard`, `git clean -fdx`, หรือ `--amend` commit ที่ push แล้ว
- `main` คือ **ข้อมูลจริง**: แอปและเครื่อง field commit `data/surveys/*.json` ขึ้น `main` ตลอดเวลา → `git pull --rebase` ก่อน push เสมอ, ห้าม rewrite/ลบไฟล์ survey ใน history
- Push ที่แตะ `src/**`, `public/**`, `data/surveys/**`, `index.html`, `package.json`, `vite.config.mjs`, `deploy_r2.py`, `database.py` จะ **trigger deploy production อัตโนมัติ** (`.github/workflows/deploy-r2.yml`) → ห้าม push/รัน `python deploy_r2.py` โดยไม่ได้รับอนุญาต
- ห้ามแก้/เขียนทับ `DATABASE.xlsx` (Master Data) หรือ `survey.db` โดยไม่ได้สำรองและยืนยันก่อน

---

## MUST READ (Project Skills & Knowledge Base)
- **Debugging**: `.agents/skills/debug-mantra/SKILL.md` (reproduce → trace → falsify → cross-reference สำหรับ Pre-PM2)
- **Review / Audit**: `.agents/skills/scrutinize/SKILL.md`; ตกลงแผนก่อนลงมือ: `.agents/skills/grilling/SKILL.md`
- **Data & DB Safety**: `.agents/skills/db-safety/SKILL.md` (ป้องกันความปลอดภัยของ `survey.db`, `DATABASE.xlsx`, `data/surveys/`)
- **Backend & API Architecture**: `.agents/skills/backend-api-pro/SKILL.md` (Python `database.py` + Client API + R2 static compatibility)
- **Handoff & Ops Safety**: `.agents/skills/handoff-safety/SKILL.md` (คู่มือความปลอดภัยสำหรับผู้ดูแลระบบรับช่วงต่อ)
- **Post-Mortem / RCA**: `.agents/skills/post-mortem/SKILL.md` (บันทึกสรุปหลังแก้บัก Tri-Cloud / PWA)
- **UI/UX & Components**: `.agents/skills/ui-ux-pro-max/SKILL.md`, `.agents/skills/shadcn/SKILL.md`

---

## Stack & Data Flow (สรุป)
- **Frontend**: React 18 + Vite 5 + Tailwind CSS v4 (`src/index.css`) + Radix UI + Framer Motion + `lucide-react`; alias `@` → `src/`
- **Production hosting**: Cloudflare R2 public bucket (`pub-*.r2.dev`) = **static เท่านั้น** — ไม่มี server code; `/api/dashboard`, `/api/database`, `/api/github-status`, `/api/sync-config` เป็นไฟล์ snapshot ที่ `deploy_r2.py` อัปโหลด, `POST /api/*` บน r2.dev ได้ 401/404 เสมอ
- **Data source of truth (production)**: GitHub `Thaidimaru/Pre_PM2` → `data/surveys/<recordId>.json` เขียน/ลบผ่าน GitHub Contents API ใน [`src/lib/api.js`](src/lib/api.js) + localStorage (`nbtc_pre_pm_saved_surveys`) เป็น offline cache
- **Local server**: `python database.py` (port 8765, SQLite `survey.db`, `/api/export-pdf`, `/photos/*`) — มีเฉพาะเครื่อง local; dev proxy อยู่ใน `vite.config.mjs`
- **PWA**: `public/sw.js` (register ใน `src/main.jsx`, ปิดบน localhost)

---

## Security Gate (Secrets & Tokens)
- **Project Named Secrets**: ห้าม hardcode หรือเปิดเผย GitHub token (`GITHUB_TOKEN`/`GH_TOKEN`/`GITHUB_PAT`, `github-token.txt`), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `r2-credentials.json`, รหัสผ่านใน `access-password.txt` — ใช้ env/GitHub Secrets/ไฟล์ที่อยู่ใน `.gitignore` เท่านั้น (ในเอกสาร/คอมเมนต์ให้ใส่ `***`)
- **ห้ามส่ง secret ขึ้น R2 หรือ bundle frontend** — ทุกอย่างใน `dist/` และ R2 bucket อ่านได้สาธารณะ
- **GitHub write path**: ทุก PUT/DELETE ต้องใช้ `sha` ล่าสุด, retry 409 แบบจำกัดครั้ง, ห้าม commit ซ้ำ record เดิม, ห้าม force
- **Sensitive files**: `access-password.txt`, `DATABASE.xlsx`, `survey.db`, `SURVEY_DATA.xlsx` ห้ามถูก serve ผ่าน web/R2

> [!CAUTION]
> **Known security debt (ยังไม่แก้)**: [`src/lib/api.js:11`](src/lib/api.js) มี GitHub token hardcode ใน bundle และ [`deploy_r2.py:185-197`](deploy_r2.py) อัปโหลด token ขึ้น `/api/sync-config` สาธารณะ → ห้ามเพิ่มรูปแบบนี้, งานที่แตะส่วนนี้ต้อง revoke/rotate token และย้ายไป proxy ฝั่ง server (ต้องได้รับอนุญาตก่อน)

---

## Definition of Done — Frontend (UI/UX)
- **Primitives**: ใช้ `@/components/ui/*` (`dialog`, `select`, `radio-group`, `tooltip`, `glass-card`, ...) ก่อน custom markup; modal ใช้ `Dialog` (Radix) พร้อม overlay
- **Styling**: Tailwind v4 รองรับ Dark/Light (`useTheme()` จาก `@/context/ThemeContext`), ใช้ `cn()` จาก `@/lib/utils`
- **Iconography**: `lucide-react` หรือ inline SVG เท่านั้น — **ห้าม emoji** เป็นไอคอน UI
- **Accessibility & Interaction**: focus ชัด, contrast ≥ 4.5:1, ฟอร์มมี label, icon-only button มี `aria-label`, touch target ≥ 44×44px, `cursor-pointer`, disable ปุ่มระหว่าง async
- **Error feedback**: แสดงใกล้จุดผิดพลาด + แจ้งผู้ใช้ (ยังไม่มี toast library — ห้ามเพิ่ม dependency โดยไม่ถาม), ห้าม fail เงียบ, log พร้อม `recordId`
- **Static-host aware**: ฟีเจอร์ที่เรียก `/api/*` ต้องมี fallback เมื่อรันบน r2.dev (GitHub API หรือ client-side) — ห้ามลิงก์ตรงไป endpoint ที่มีเฉพาะ `database.py`
- **Print/PDF**: รายงาน A4 (`src/components/export/SurveyReportModal.jsx`) ต้องพิมพ์ได้ทั้ง Print dialog และดาวน์โหลด PDF
- **Responsive**: 375 / 768 / 1024 / 1440px ไม่มี horizontal overflow, ทดสอบ PWA standalone บนมือถือ
- **ภาษา**: UI เป็นภาษาไทย (ไม่มี i18n framework)

---

## Definition of Done — Data, Sync & Backend
- **Survey record**: 1 ไฟล์ต่อ record ที่ `data/surveys/<recordId>.json`, รูปแบบ `recordId` = `PM-<timestamp>-<hex4>`; ห้ามเปลี่ยน schema โดยไม่รองรับไฟล์เดิม
- **Concurrency**: การเขียน GitHub ต่อ record ต้อง serialize (กันซ้ำระหว่าง `submitSurvey`/`updateSurvey`/`syncPendingLocalSurveys` และหลาย tab ผ่าน BroadcastChannel)
- **Service Worker**: ห้าม cache request ข้าม origin (`api.github.com`, `raw.githubusercontent.com`), non-GET, หรือ `blob:`; bump cache name ทุกครั้งที่แก้ `sw.js`
- **Python (`database.py`, `deploy_r2.py`, `export_*.py`)**: dependency อยู่ใน `requirements.txt`; รักษา API contract ใน `GEMINI.md` §4.3
- **รูปภาพ**: ห้ามขยาย base64 ในไฟล์ survey โดยไม่จำเป็น (localStorage quota และขนาด commit)

---

## Changelog & Version Management
- **Authoritative Version**: `src/version.js` (`APP_VERSION`, `APP_BUILD_DATE`) — ต้องตรงกับ `package.json` (`version`) ทุกครั้ง; UI ต้อง import จาก `version.js` ห้าม hardcode
- ทุกการแก้ source/runtime (`src/**`, `public/**`, `index.html`, `*.py`, config) ต้อง bump อย่างน้อย PATCH (SemVer ตาม Global Rules §10); เอกสารล้วนไม่ต้อง bump
- **Changelog Entry**: เพิ่มบนสุดของ [`CHANGELOG.md`](CHANGELOG.md) ตามฟอร์แมต Keep a Changelog ที่ใช้อยู่:
  ```markdown
  ## [X.Y.Z] - YYYY-MM-DD

  ### Fixed | Added | Changed
  - สรุปการแก้ไขและเหตุผล (`path/to/file.jsx`)
  ```

---

## ข้อมูลระบบ เอกสาร และคำสั่งสำคัญ
- **Production**: Cloudflare R2 public bucket `https://pub-bc30fda8b7654fa09add325ab0f468e0.r2.dev/`
- **Data repo**: [https://github.com/Thaidimaru/Pre_PM2](https://github.com/Thaidimaru/Pre_PM2) (`data/surveys/`)
- **เอกสาร**: [`GEMINI.md`](GEMINI.md) (architecture/API), [`README.md`](README.md), [`CHANGELOG.md`](CHANGELOG.md)
- **คำสั่ง (จาก `package.json`)** — repo นี้ **ไม่มี** script `lint`/`test`:
  - `npm run dev` — Vite dev server :5173 (proxy `/api`, `/login`, `/database`, `/save`, `/photos` → :8765)
  - `npm run build` — **verification หลัก** (syntax/bundle error)
  - `npm run preview` — ทดสอบ build แบบ static (ใกล้เคียง r2.dev; SW ไม่ทำงานบน localhost)
  - `npm start` / `python database.py` — local API + SQLite :8765
  - `npm run deploy` / `python deploy_r2.py` — deploy ขึ้น R2 (**production — ต้องได้รับอนุญาต**)
  - `npm run export:pdf` / `export:archive` / `export:photos` — สร้างรายงาน PDF/รูปจาก local data
- **Graft**: `graft build`, `graft ask "<q>" --source`, `graft callers <symbol>` — ถ้า graft ใช้ไม่ได้ (เช่น native build ไม่รองรับ Node เวอร์ชันปัจจุบัน) ให้ fallback เป็น `rg`
