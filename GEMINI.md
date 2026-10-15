# NBTC Microwave — Pre-PM Survey Control Room

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->

---

## 1. Project Overview & Architecture
ระบบศูนย์ควบคุมและบันทึกข้อมูลการตรวจเยี่ยมเจ้าของพื้นที่สำหรับงานบำรุงรักษาเชิงป้องกันล่วงหน้า (Pre-Preventive Maintenance) สถานีวิทยุคมนาคม NBTC Microwave

- **Frontend**: Single Page Application (SPA) พัฒนาด้วย React 18, Vite 5, Tailwind CSS 4, Radix UI accessible primitives, Framer Motion, และ Lucide React
- **Tri-Cloud Architecture (Cloudflare + GitHub + OneDrive)**:
  1. **Cloudflare R2**: โฮสต์ SPA Frontend และ Edge API snapshots (`https://pub-bc30fda8b7654fa09add325ab0f468e0.r2.dev/dashboard`) ทำงานแบบเรียลไทม์ โหลดเร็วทั่วโลก
  2. **GitHub Sync**: บันทึกและดึงข้อมูลแบบสำรวจผ่าน `data/surveys/*.json` บน GitHub Repository (`Thaidimaru/Pre_PM2`) พร้อม Real-time commit ETag polling และ CI/CD Pipeline
  3. **OneDrive / On-Premises Engine**: จัดเก็บรูปถ่ายความละเอียดสูง (`photos/`), ฐานข้อมูล SQLite (`survey.db`), และ Master Excel (`DATABASE.xlsx`) ในเครื่องอย่างปลอดภัยโดยไม่เปลืองโควตา Cloudflare R2
- **Master Data**: `DATABASE.xlsx` รวบรวมรายชื่อสถานีและสถานที่ติดตั้งทั้งหมด

---

## 2. Directory Structure
```text
Pre-PM2/
├── src/
│   ├── components/
│   │   ├── auth/              # LoginView.jsx, GitHubTokenModal.jsx
│   │   ├── dashboard/         # DashboardView, KpiCards, ProvinceChart, SurveyDonut, RecentSurveys
│   │   ├── field/             # FieldVisitView.jsx (7-step survey record form)
│   │   ├── ui/                # Radix UI primitives & custom UI components
│   │   ├── Navbar.jsx         # Live Header, Clock, Real-time GitHub Status & Token trigger
│   │   └── Sidebar.jsx        # Navigation sidebar
│   ├── lib/
│   │   ├── api.js             # Client API service layer (Direct GitHub Sync, BroadcastChannel, Offline Fallback)
│   │   └── utils.js           # clsx + tailwind-merge helper (cn)
│   ├── App.jsx                # SPA Shell, Routing, Session state
│   ├── index.css              # Tailwind CSS 4.0 Theme & Tokens
│   ├── main.jsx               # Vite Entry Point
│   └── version.js             # Single Source of Truth for Application Version
├── .github/workflows/         # deploy-r2.yml (Automated GitHub Actions CI/CD to Cloudflare R2)
├── database.py                # Standalone Python 3 + SQLite Server & Local API Engine
├── deploy_r2.py               # Cloudflare R2 Frontend & API Snapshot Deployment Tool
├── export_photos.py           # Photo export utility from SQLite
├── export_pdf.py              # Official NBTC A4 PDF Report Generation Utility
├── DATABASE.xlsx              # Master Station Records
├── access-password.txt        # Default System Password
├── vite.config.mjs            # Vite configuration + API Proxy setup
└── package.json               # Node.js dependencies and scripts
```

---

## 3. Essential Commands

### Frontend
- **Start Dev Server**: `npm run dev` (Runs on http://localhost:5173, proxies `/api`, `/database`, `/save`, `/login` to `http://localhost:8765`)
- **Production Build**: `npm run build` (Outputs bundle to `dist/`)
- **Deploy to Cloudflare R2**: `python deploy_r2.py`
- **Preview Build**: `npm run preview`

### Backend (Local Python)
- **Start Local Server**: `python database.py` (Runs on port 8765, initializes tables in `survey.db` automatically)
- **Export Photos**: `python export_photos.py`
- **Generate PDF Reports**: `python export_pdf.py`

### Graft Context Engine
- **Refresh Graph**: `graft build`
- **Search Symbol/API**: `graft ask "<query>" --source`
- **Find Callers**: `graft callers <symbol>`

---

## 4. Mandatory Development Rules

### 1. Version Management (SemVer - Mandatory Single Source of Truth)
- **Authoritative Source**: `src/version.js` (`APP_VERSION`, `APP_BUILD_DATE`, `APP_TITLE`)
- **Package Manifest**: `package.json` (`version`)
- **Rule**: ทุกการแก้ไขซอร์สโค้ดหรือการตั้งค่ารันไทม์ **ต้องปรับเพิ่มเลขเวอร์ชันเสมอ** (อย่างน้อย PATCH) และอัปเดตทั้งใน `src/version.js` และ `package.json`

### 2. UI Icon Policy
- **ห้ามใช้ Unicode Emoji** เป็นไอคอน UI โดยเด็ดขาด
- ให้ใช้ **Lucide React** หรือ **Scalable Inline SVG** เท่านั้น

### 3. API Contract & Security
- **Authentication**: Token-based Authentication (Bearer token, HMAC SHA-256, 8-hour lifetime)
- **Endpoints**:
  - `POST /api/login` / `POST /login`
  - `GET /api/dashboard`
  - `GET /api/database` / `GET /database`
  - `POST /api/save` / `POST /save`
  - `GET /photos/<filename>` (Local) / Blobs (Cloud)
- **Sensitive File Protection**: ป้องกันการดาวน์โหลดโดยตรงผ่าน Web สำหรับ `access-password.txt`, `DATABASE.xlsx`, `survey.db`, `SURVEY_DATA.xlsx` ผ่าน Proxy rules ใน `vite.config.mjs` และการแยกเก็บข้อมูลออฟไลน์บน OneDrive
