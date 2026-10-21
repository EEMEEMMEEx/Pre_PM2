# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [2.11.0] - 2026-10-21

### Security
- `deploy_r2.py` **ไม่อัปโหลด GitHub token ขึ้น bucket สาธารณะอีก** (เดิมเขียน `{token, repo, branch}` ลง `/api/sync-config` + `/sync-config` ซึ่งใครก็ดาวน์โหลดได้) และเพิ่ม `LEGACY_SECRET_KEYS` เพื่อ **purge object ทั้งสองทุกรอบ deploy** (idempotent, ล้มเหลวได้โดยไม่ทำให้ deploy crash) (`deploy_r2.py`)
- API snapshot ที่ขึ้น Cloudflare R2 ถูก sanitize ก่อนอัปโหลด: `sanitize_dashboard_payload()` ตัด `contactName` / `contactPosition` / `contactPhone` / `informantName` ออกจาก `recent[]` ทั้งระดับ root และ `fields` (ค่า实测บนข้อมูลจริง: 695 ค่าจาก 184 รายการ; `operatorName` และข้อมูลงานสำรวจอื่นคงเดิม, ไม่แก้ข้อมูลต้นทางใน SQLite/GitHub)
- เพิ่มโหมดตรวจสอบก่อนแตะ production: `--dry-run` (ไม่ใช้ credentials, ไม่เขียน/ลบ object, รายงานจำนวน PII ที่ถูกตัดและ key ที่ค้าง) และ `--purge-secrets-only` (ล้างเฉพาะ object ที่เคยแจก token) — ลดความจำเป็นในการ deploy จริงเพื่อพิสูจน์ว่าโค้ดถูก

### Added
- opt-in `--strip-station-contacts` (หรือ env `R2_STRIP_STATION_CONTACTS=1`) เพื่อตัด `contact_name`/`contact_position`/`contact_phone`/`house_no` จาก snapshot `/api/database` ด้วย — ตั้งเป็น opt-in เพราะฟอร์มภาคสนามบน r2.dev ใช้ข้อมูลนี้เติมอัตโนมัติ (FieldVisitView.jsx:81-84, 124-127); ค่าเริ่มต้นคงพฤติกรรมเดิม (63.3 KB → 197 stations)
- `deploy_r2.py` import boto3 แบบยอมให้ขาดได้ (`require_boto3()`) เพื่อให้ `--dry-run` รันบนเครื่องที่ยังไม่ติดตั้ง library โดยไม่เปลี่ยนพฤติกรรมของโหมด deploy จริง

### Changed
- เอกสาร: `AGENTS.md` (Security debt checklist แยกสถานะโค้ดเสร็จ/R2 ยังไม่ล้าง), `.agents/skills/backend-api-pro/SKILL.md` (นโยบาย snapshot ห้ามอัปโหลด secret + คำสั่งใหม่)
- ข้อจำกัดที่ยังเหลือ (ทราบและจงใจยังไม่แก้ในรอบนี้): ข้อมูลติดต่อชาวบ้านยังอยู่ใน `data/surveys/*.json` และ `DATABASE.xlsx` บน GitHub repo สาธารณะ — การปิดจริงต้องทำ repo/data เป็น private หรือใช้ server proxy

## [2.10.0] - 2026-10-21

### Security
- ต่อ `AuthService` เข้า request path จริง (เดิม `is_authorized()` ไม่เคยถูกเรียก): `database.py` ผูก `127.0.0.1` เป็น default (`HOST` ตั้ง override ได้) และ path ที่มีข้อมูลภาคสนาม/รูป/PDF (`/api/*`, `/database`, `/photos/*`) ต้องมี `Authorization: Bearer <token>` เมื่อคำขอมาจากนอกเครื่อง — คืน `401 unauthorized` พร้อมข้อความไทย (`database.py`)
- `POST /api/login` / `POST /login` ตรวจรหัสผ่านจริงแล้ว (เดิมตอบ `{"token": "public", "ok": true}` โดยไม่ตรวจอะไรเลย) → ผ่าน = token สุ่ม 32 bytes อายุ 8 ชม., ผิด/ว่าง = `401 invalid_password`
- ตัดรหัสผ่าน default `"admin"`: ถ้าไม่ได้ตั้ง `FORM_PASSWORD` หรือ `access-password.txt` ระบบสุ่มรหัสผ่านต่อ process และเตือนตอนสตาร์ต ทำให้การ login จากเครื่องอื่นถูกปิดไว้โดยดีฟอลต์ (`database.py` `AuthService`)
- CORS ไม่ใช้ `Access-Control-Allow-Origin: *` อีก (ทั้ง preflight, JSON, รูป, PDF) → สะท้อนเฉพาะ origin ใน `ALLOWED_ORIGINS`, origin อื่นได้ `403 origin_not_allowed`; ปิดช่อง CSRF/DNS-rebinding จากเว็บอื่นมายิง loopback
- ทุก path เขียน (`/api/save`, `/api/update`, `/api/delete`, `DELETE /api/survey/<id>`) และ `do_DELETE` ต้องผ่าน origin check + auth check ก่อนประมวลผล

### Fixed
- `delete_surveys` รายงาน `githubDeleted` ตามผลจริงของ GitHub Contents API (เดิมตรึงเป็น `true`Always ทั้งที่เซิร์ฟเวอร์ที่ไม่มี token ลบไม่สำเร็จ) พร้อมฟิลด์ `githubFailed[]` — ทำให้ client ที่ถือ PAT เห็นว่ายังต้องลบไฟล์บน GitHub เอง แทนที่จะเชื่อแล้วล้างแคชทิ้ง (`database.py`)
- `loginUser()` เป็น stub ที่คืน `token: 'public'` เสมอ → เรียก `POST /api/login` จริง คืน `{token, ok, error}` และคืน `ok: false, publicAccess: true` บน static host (`src/lib/api.js`)
- `LoginView` เก็บ `sessionStorage.surveyToken` แม้ login ไม่สำเร็จ → ตรวจ `data.ok && data.token` ก่อน และแสดงข้อความผิดพลาด (`src/components/auth/LoginView.jsx`)

### Added
- Env flags สำหรับ local server: `HOST`, `REQUIRE_TOKEN=1` (บังคับ token แม้แต่ loopback ใช้ทดสอบเส้นทาง 401), `ALLOWED_ORIGINS` — documented ใน `GEMINI.md` §4.3
- Startup notice บอกสถานะ bind/auth/password เมื่อรัน `python database.py` เพื่อให้เห็นว่าเซิร์ฟเวอร์กำลังเปิดถึงวง LAN หรือไม่
- อัปเดตเอกสาร contract: `GEMINI.md` §4.3 (auth, endpoints ที่ guard, response shape ของ delete), `AGENTS.md` (Stack & Data Flow + Security debt checklist ที่แยกสถานะ [x]/[ ] ชัดเจน)

## [2.9.0] - 2026-10-20

### Security
- ถอด GitHub token ที่ฝังอยู่ใน bundle ออกจาก `src/lib/api.js` และเลิกนอนาเข้าจาก `/api/sync-config` (เดิมเป็นไฟล์สาธารณะบน R2 ที่ใครก็ดาวน์โหลดได้) — การเขียนขึ้น GitHub ต้องใช้ Fine-grained PAT ที่ผู้ใช้ใส่เองผ่าน `GitHubTokenModal` เท่านั้น (`src/lib/api.js`, `src/components/auth/GitHubTokenModal.jsx`)
- กัน record ที่ไม่ใช่ข้อมูลภาคสนามหลุดขึ้น repo ข้อมูล: เพิ่ม `isCommittableRecordId()` ยอมรับเฉพาะรูปแบบ `PM-<15ตัวเลข>-<hex4>` (client) และ `PM-<YYYYmmdd>-<HHMMSS>-<hex4>` (server) ใน `syncPendingLocalSurveys` พร้อม `console.warn` เมื่อข้าม (`src/lib/api.js`)
- หยุดพฤติกรรม fail เงียบเมื่อถูก GitHub จำกัดโควตาคำขอ (unauthenticated = 60 req/hr/IP และแอปไม่มี token สาธารณะแล้ว): ตรวจ 429 หรือ 403 + `x-ratelimit-remaining: 0` แล้ว backoff 5 นาที คืน cache ล่าสุดพร้อมแจ้งผู้ใช้ (`src/lib/api.js`)

### Added
- `promptGitHubToken(reason, cooldownMs)` throttle ต่อ reason (กัน modal/toast เด้งรัวจากการ poll ทุก 10 วินาที), `githubErrorText(code)` map error code → ภาษาไทย, และ error code `no_token`/`rate_limited` ในผลลัพธ์ `submitSurvey`/`updateSurvey`/`deleteSurveys` (`src/lib/api.js`)

### Changed
- ลบ `initSystemToken()` (ไม่มี caller ใดนอกไฟล์นี้) — client ไม่เรียก `/api/sync-config` อีก
- UI แสดงข้อความภาษาไทยแทน raw error code และแยกข้อความตามสาเหตุ no_token / bad_token / rate_limited (`src/components/Navbar.jsx`, `src/components/field/FieldVisitView.jsx`, `src/components/dashboard/RecentSurveys.jsx`)
- ข้อจำกัดที่ทราบ: ข้อมูลสำรวจและผู้ติดต่อใน `data/surveys/*.json` ยังอยู่ใน GitHub repo สาธารณะ — การปิดช่องนี้ต้องทำ repo เป็น private หรือเพิ่ม server proxy เป็นงานแยก

## [2.8.9] - 2026-10-20

### Fixed

- แก้ไขปัญหาข้อมูลไม่ยอมซิงค์ให้เท่ากันเมื่อกรอก แก้ไข หรือลบข้อมูลจากเครื่องอื่น (`src/lib/api.js`, `database.py`):
  - **ซิงค์การลบข้อมูลข้ามเครื่อง (Delete Synchronization)**: ยึดรายการไฟล์บน GitHub (`currentGhIds`) เป็น Single Source of Truth; รายการใดที่อยู่ใน R2 static snapshot หรือ `localStorage` แต่ไม่มีไฟล์อยู่บน GitHub แล้ว จะถูกตัดออกจาก Dashboard ทันทีและล้างออกจากแคช ป้องกันปัญหารายการที่ถูกลบไปแล้วฟื้นคืนชีพกลับมาแสดงซ้ำ
  - **ตรวจจับและซิงค์การแก้ไขข้อมูลข้ามเครื่อง (Edit Detection via Git SHA)**: บันทึกและเปรียบเทียบ Git Blob SHA (`nbtc_pre_pm_gh_file_shas`) เพื่อตรวจจับไฟล์ที่ถูกแก้ไขบนเครื่องอื่นและดึงข้อมูลเวอร์ชันใหม่ล่าสุดมาอัปเดตทันที พร้อมปรับการ Merge ให้ข้อมูลจริงจาก GitHub มีความสำคัญเหนือแคชเก่าของเบราว์เซอร์
  - **แก้ปัญหาการดึงข้อมูลและ Rate Limit**: เพิ่มการแนบ Authorization Header และ Cache-Busting (`_t=...`) ในการดาวน์โหลดไฟล์สำรวจจาก GitHub ป้องกันการติดแคช 5 นาทีของ CDN และ Rate limit
  - **เปิดการซิงค์ข้อมูลสดบน Localhost / Dev**: ปรับ `fetchDashboardData` ให้สามารถเรียกซิงค์ไฟล์สำรวจล่าสุดจาก GitHub ได้ในทุกสภาพแวดล้อม
  - **อัปเดต SQLite Seeding ใน Backend**: ปรับ `_seed_surveys_from_json` ใน `database.py` ให้ใช้ `ON CONFLICT(record_id) DO UPDATE` และล้างข้อมูลที่ถูกลบออกจาก SQLite โดยอัตโนมัติ

## [2.8.8] - 2026-10-20

### Changed

- ปรับขนาดและสัดส่วนของตัวอักษรให้อ่านง่าย สบายตา และสวยงามทั่วทั้งตารางประวัติการตรวจเยี่ยม (`src/components/dashboard/RecentSurveys.jsx`):
  - **แก้ไขการตัดบรรทัดรหัสรายการและวันที่**: เพิ่ม `whitespace-nowrap` และกำหนดความกว้างขั้นต่ำของคอลัมน์ (`min-w`) ป้องกันรหัสรายการยาว (เช่น `PM-20261015...`) และวันที่ (เช่น `2026-10-08`) แตกกระจายเป็น 3-4 บรรทัดย่อย
  - **ฟอร์แมตวันที่แบบไทยให้อ่านง่าย**: แปลงรูปแบบวันที่ตรวจเยี่ยมให้อ่านเข้าใจง่ายในทันที (เช่น `8 ต.ค. 69` พร้อมระบุเวลาบันทึก `16 ต.ค. 10:28 น.` ด้านล่างอย่างเป็นระเบียบ)
  - **จัดลำดับชั้นข้อมูลชื่อสถานีและผู้ติดต่อ**: ขยายขนาดชื่อสถานีให้อ่านชัดเจน (`15px font-bold`) และมีชื่อสถานี fallback ที่ถูกต้องเสมอ ปรับขนาดข้อมูลผู้ให้ข้อมูล เบอร์โทรศัพท์ และช่าง ให้มีวรรคตอนและสัดส่วนที่ลงตัว
  - **ป้องกันปุ่มจัดการ (Actions) ตัดบรรทัดเบียดกัน**: จัดกลุ่มปุ่ม `ดูข้อมูล`, `แก้ไข`, `ลบ`, `A4` ให้อยู่ในแถวเดียวพร้อมขนาดไอคอนและช่องว่างที่พอดี ป้องกันตัวหนังสือตกบรรทัดหรือไอคอนซ้อนทับตัวอักษร
  - **ปรับขนาดและระยะห่างของตัวกรองและข้อความ Toolbar**: ขยายขนาดช่องค้นหาและตัวเลือกจังหวัดเป็น `text-sm` และปรับปุ่ม Filter Pills ให้กดง่ายและเห็นชัดเจนทั้งโหมดสว่างและมืด

## [2.8.7] - 2026-10-16

### Added

- เพิ่มปุ่ม **กรองข้อมูล (Filter)** และ **Sort (จัดเรียง)** ตรง Toolbar เหนือตารางประวัติการกรอกข้อมูลการตรวจเยี่ยมทั้งหมด (`src/components/dashboard/RecentSurveys.jsx`):
  - **ปุ่มกรองข้อมูล**: คลิกเพื่อเปิด/ปิดแผงตัวกรอง (Expandable Filter Panel) ได้อย่างสะดวก พร้อม Badge แสดงจำนวนเงื่อนไขตัวกรองที่ทำงานอยู่ (`activeFilterCount`)
  - **ปุ่ม Sort (จัดเรียง)**: แสดงสถานะการเรียงปัจจุบัน (เช่น `Sort: ล่าสุด`, `Sort: สถานี ก-ฮ`, `Sort: จังหวัด ก-ฮ`) และคลิกเพื่อเปิด Dropdown Menu เลือกรูปแบบการจัดเรียงได้ทันที พร้อมไอคอนสถานะและการปิดอัตโนมัติเมื่อคลิกนอกพื้นที่หรือกด Escape
  - **ปุ่มล้างตัวกรองด่วน (Quick Clear Filters)**: แสดงขึ้นมาทันทีเมื่อมีการกรองหรือเรียงลำดับที่ไม่ใช่ค่าเริ่มต้น เพื่อให้สามารถรีเซ็ตกลับสู่สถานะปกติได้ในคลิกเดียว
  - ย้ายและปรับโครงสร้างแผงตัวกรอง (Filter Panel) ให้เปิด-ปิดอยู่ใต้ Toolbar ได้อย่างสวยงาม ไม่บดบังพื้นที่ตารางเมื่อไม่ได้ใช้งาน

## [2.8.6] - 2026-10-16

### Fixed

- แก้ไขปัญหาการกดปุ่มลบรายการแล้วรายการยังคงแสดงอยู่: นำ Tombstone Pattern (`nbtc_pre_pm_deleted_surveys`) มาใช้เพื่อบันทึกรายการที่ถูกลบลงใน LocalStorage ทันที และตัดรายการดังกล่าวออกจาก `mergeDashboardWithLocal`, `fetchDashboardData`, `serverData.recent` และ GitHub cache ทำให้ข้อมูลที่ถูกลบหายไปทันที (0ms) และไม่กลับมาแสดงซ้ำแม้ static snapshot `/api/dashboard` บน Cloudflare R2 จะยังมีข้อมูลเก่าอยู่ (`src/lib/api.js`, `src/components/dashboard/RecentSurveys.jsx`).
- คำนวณยอดรวมสถานี (KPI Cards) และสถิติจังหวัดใหม่ตามข้อมูลที่เหลืออยู่จริงหลังจากหักรายการที่ถูกลบออก (`src/lib/api.js`).
- เพิ่ม `"githubDeleted": True` ในการตอบกลับของ `DatabaseService.delete_surveys` เพื่อให้ฝั่ง client ทราบว่าลบทั้งใน SQLite และ GitHub แล้ว (`database.py`).

### Added

- เพิ่มฟังก์ชั่นฟิลเตอร์และจัดเรียงข้อมูลแบบครบวงจรในประวัติการตรวจเยี่ยม (`src/components/dashboard/RecentSurveys.jsx`):
  - **ตัวกรองจังหวัด (Province Filter)**: เลือกกรองตามจังหวัดแบบไดนามิกจากรายการที่มีอยู่จริง พร้อมแสดงจำนวนสถานีในแต่ละจังหวัด
  - **ตัวกรองสถานะระบบ (System Status Filter)**: กรองตามระบบวิทยุสื่อสารและระบบไฟฟ้า (ปกติ / มีปัญหา)
  - **ตัวกรองรูปภาพ (Photo Filter)**: กรองรายการที่มีรูปภาพ หรือไม่มีรูปภาพ
  - **การจัดเรียง (Sorting)**: จัดเรียงตามเวลาบันทึก (ล่าสุด/เก่าสุด), ชื่อสถานี (ก-ฮ / ฮ-ก), จังหวัด (ก-ฮ / ฮ-ก), วันที่ลงพื้นที่ (ล่าสุด/เก่าสุด) และผลการขออนุญาต ทั้งผ่าน Dropdown ใน Toolbar และการคลิกที่หัวตาราง (`<thead>`) พร้อมไอคอนทิศทาง `ArrowUp`/`ArrowDown`/`ArrowUpDown`
  - **ปุ่มล้างตัวกรอง (Clear Filters)**: รีเซ็ตเงื่อนไขการค้นหา กรอง และจัดเรียงทั้งหมดกลับเป็นค่าเริ่มต้นในคลิกเดียว

## [2.8.5] - 2026-10-16

### Fixed

- แก้ไข GitHub Actions deploy step (`deploy_r2.py`) ล้มเหลวด้วย exit code 1 เมื่อตัวแปร R2 ว่างเปล่า: เพิ่ม fallback สำหรับ `R2_ACCOUNT_ID` (`da30eb228f7c6f596214e6d5e0bef68d`) และ `R2_BUCKET` (`thaidimaru`) ผ่าน `secrets || vars || default` ป้องกัน endpoint กลายเป็น `https://.r2.cloudflarestorage.com` (`.github/workflows/deploy-r2.yml`).
- ป้องกัน `deploy_r2.py` รับค่าสตริงว่าง `""` จาก CLI argument แล้วไปเขียนทับ default bucket / endpoint พร้อมเพิ่ม fallback และระบบ graceful skip เมื่อรันบน fork ที่ยังไม่ได้ตั้งค่า secret (`deploy_r2.py`, `.github/workflows/deploy-r2.yml`).

## [2.8.4] - 2026-10-16

### Fixed

- ปุ่ม "ดาวน์โหลด PDF" บน static host (r2.dev) เดิมชี้ไปที่ `/api/export-pdf` ซึ่งมีเฉพาะ local server ทำให้ได้ 404/401: เปลี่ยนมาสร้าง PDF ฝั่ง client ด้วย `html2canvas-pro` ที่รองรับสี `oklch()` ของ Tailwind v4 (`src/components/export/SurveyReportModal.jsx`).
- การสร้าง PDF ล้มเหลวแบบเงียบและไม่แจ้งผู้ใช้: เพิ่ม progress "กำลังสร้าง PDF หน้า i/N", รอ `document.fonts.ready` และรอรูปโหลดครบก่อน capture, capture ทีละ 8 หน้า, ปรับเป็น `scale: 1.5` / JPEG 0.85 และคืนหน่วยความจำ canvas หลังใช้; เมื่อ error จะแจ้งผ่าน toast และไม่เรียก `window.print()` อัตโนมัติ (`SurveyReportModal.jsx`).
- `409/422` และ commit ซ้ำจาก sha เก่า: Service Worker ไม่ดักจับ request ข้าม origin (`api.github.com`, `raw.githubusercontent.com`), `blob:`/`data:` และ non-GET อีกต่อไป และผูก cache name กับ `APP_VERSION` ผ่าน `register('/sw.js?v=' + APP_VERSION)` (`public/sw.js`, `src/main.jsx`).
- `POST /api/delete → 401` บน static host: ข้าม `/api/save`, `/api/update`, `/api/delete` เมื่อตรวจพบ static host แล้วใช้ GitHub Contents API โดยตรง (`src/lib/api.js`).
- ลบข้อมูลไม่สำเร็จแต่ไม่มีอะไรแจ้ง: `deleteSurveys` คืน `{ deletedIds, failed }`, serialize การเขียน, retry 409/422 พร้อมเทียบเนื้อหาก่อนเขียน/ลบ และลบออกจาก local cache เฉพาะรายการที่สำเร็จหรือไม่พบไฟล์บน GitHub (`src/lib/api.js`, `src/components/dashboard/RecentSurveys.jsx`).
- `SurveyPreviewModal` เรียก GitHub raw JSON ซ้ำไม่หยุด: effect ผูก dependency กับ state ที่ตัวเองเป็นคนเซ็ต (`resolvedPhotos`) ทำให้เกิด loop — แก้เป็น dependency `[isOpen, recordId]`, เพิ่ม `AbortController` และอัปเดต state เฉพาะเมื่อข้อมูลรูปเปลี่ยนจริง (`src/components/dashboard/SurveyPreviewModal.jsx`).
- กัน field ภายในฝั่ง client (`githubSyncing`, `githubSyncingAt`, `githubSynced`) หลุดขึ้นไฟล์ survey บน GitHub ซึ่งจะทำให้ schema เพี้ยนและ dedupe ไม่ทำงาน (`src/lib/api.js`).

### Added

- Global toast component (`src/components/ui/toast.jsx`) ใช้แทน `alert()` สำหรับ PDF/delete/token error พร้อม mount ใน `App.jsx` และเปิด GitHubTokenModal อัตโนมัติเมื่อ token หมดอายุ (`src/components/Navbar.jsx`).
- `<meta name="mobile-web-app-capable" content="yes">` สำหรับ PWA บน Android (`index.html`).

### Changed

- ลด commit ซ้ำด้วย write queue + payload dedupe (`inflightWrites`), `navigator.locks` ต่อ record และให้ `syncPendingLocalSurveys` ข้าม record ที่กำลังเขียนอยู่ (`src/lib/api.js`).

## [2.0.6] - 2026-09-09

### Fixed

- Fixed radial gradient styling in `ProvinceChart.jsx` using Tailwind CSS v4 compatible syntax (`bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))]`).
- Cleaned up unused Lucide React icon imports across dashboard components (`BarChart3`, `Sparkles`).

### Added

- Added standalone lightweight Node.js API server (`server.js`) and photo export script (`scripts/export-photos.js`).
- Updated `vercel.json` route rewrites and function packaging configuration.

## [2.0.3] - 2026-09-08

### Fixed

- Fixed Thai font rendering, text alignment, and diacritic clipping issues across the application.
- Integrated comprehensive Google Fonts (`Noto Sans Thai`, `Prompt`, `Sarabun`, and `Inter`) with full weights in `index.html`.
- Configured font fallback stack and modern typography standards in `src/index.css` (`font-size-adjust: from-font`, `letter-spacing: normal`, `line-break: relaxed`, `text-wrap: pretty`, and line-height `1.6`).
- Fixed text gradient clipping in `ShinyText` component by applying vertical padding, box-decoration-break cloning, and proper line height.
- Resolved Thai character spacing and tone mark distortion by replacing `tracking-tight` and `tracking-wide` with `tracking-normal leading-normal` on all Thai headings, cards, and buttons.

## [2.0.2] - 2026-09-08

### Fixed

- Fixed 404 error when loading `nbtc-logo-dashboard.png` by configuring the `public/` directory with static assets and importing the image module directly in `Navbar` and `LoginView`.

## [2.0.1] - 2026-09-08

### Changed

- Modernized frontend architecture to Single Page Application (SPA) powered by React 18, Vite 5, Tailwind CSS 4, and Radix UI accessible primitives.
- Upgraded UI styling to responsive Dark Cyber Glassmorphism theme with Framer Motion animations and Lucide React icons.
- Centralized application version management with authoritative single source of truth (`src/version.js`).
- Added standalone utility script `export_photos.py` to extract SQLite survey photos into local storage.
- Updated `database.py`, `netlify.toml`, and `vercel.json` with client-side SPA routing fallbacks and build artifact integration.

## [1.0.0] - 2026-09-08

### Added

- **Survey Control Room Dashboard**:
  - Live statistics display (total surveys, database stations, access granted / denied).
  - Provincial distribution bar chart with real-time station count.
  - Recent survey activity log table with auto-polling every 30 seconds.
  - Modern Glassmorphism aesthetic theme (`dashboard-theme.css`) with spotlight and shine effects.
- **Field Visit / Site Record Form**:
  - 7 structured sections covering Station Info, Local Informant, Site Access Permit, Radio & Power Status, Site Environment, Photo Documentation, and Sign-off Confirmation.
  - Real-time station search autocomplete connected to `DATABASE.xlsx`.
  - Multi-photo upload support with client-side preview and payload optimization.
- **Dual Server Architecture**:
  - **Cloud Serverless**: Netlify Functions (`netlify/functions/api.js`) with Netlify Blobs storage and Vercel serverless integration (`api/handler.js`).
  - **Local / Standalone**: Python threaded HTTP server (`database.py`) with SQLite backend (`survey.db`) and automated startup script (`server.ps1`).
- **Security & Access Control**:
  - Token-based HMAC SHA-256 authentication with configurable password via environment variables (`FORM_PASSWORD`) or `access-password.txt`.
  - URL rewrites preventing direct access to sensitive data files (`DATABASE.xlsx`, `access-password.txt`, `survey.db`).
- **Data Exporting**:
  - Automated PowerShell script (`export-surveys.ps1`) for exporting survey records into structured Excel sheets (`SURVEY_DATA.xlsx`).
