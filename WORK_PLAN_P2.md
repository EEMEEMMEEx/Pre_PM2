# แผนงานรายบุคคล — P2 (Frontend / Client sync / UX)

อ้างจาก `WORK_PLAN.md` · อัปเดตล่าสุด 2026-10-21 · production ปัจจุบัน = bundle `2.11.1` (ไม่มี token ฝัง, ไม่เรียก `/api/sync-config`)

## ขอบเขตงานของฉัน

| อนุญาตให้แก้ (exclusive) | ห้ามแก้ (ของคนอื่น) |
|---|---|
| `src/lib/api.js`, `src/components/**` (Navbar, Sidebar, auth, dashboard, field, export, ui) | `database.py`, `deploy_r2.py`, `export_*.py`, `.github/workflows/**`, `.gitignore` → **P1** |
| `public/sw.js`, `public/manifest.json`, `index.html` | `docs/**`, `scripts/**`, `AGENTS.md`, `SECURITY.md`, `README.md` (ข้อความ) → **P3** |
| `src/index.css`, `src/context/**`, `src/assets/**`, `src/lib/excelExport.js`, `src/lib/utils.js` | **`src/version.js`, `package.json`, `CHANGELOG.md`, `README.md:9` (badge) → P1 เท่านั้น** (ส่งเลขเวอร์ชัน + ข้อความให้เขา รวม) |
| — | `data/surveys/*.json`, `survey.db`, `DATABASE.xlsx` → ห้ามแตะ |

กติกา: sync ก่อน `git fetch upstream; git merge --ff-only upstream/main` · branch `track-c/<id>` · 1 PR ต่องาน · ห้ามใช้ emoji เป็นไอคอน UI (ใช้ `lucide-react`/inline SVG) · UI ภาษาไทยทั้งก้อน · ห้ามเพิ่ม dependency โดยไม่ถาม (ยังไม่มี toast/i18n library) · push ที่แตะ `src/**`/`public/**`/`index.html` = **trigger production deploy**

## ตารางสถานะของฉัน (สรุป)

| id | งาน | P | สถานะ | ผลลัพธ์ที่คาดหวัง (วัดได้) | พึ่งพา/ส่งผลถึง |
|---|---|---|---|---|---|
| C1 | แนบ `Authorization` เข้า `/api/save`, `/api/update`, `/api/delete` | P0 | READY | เครื่อง LAN บันทึก/แก้ไข/ลบได้หลัง login; ไม่ได้ login → เห็น 401 ภาษาไทย ไม่ fail เงียบ | ต้อง lock spec กับ P1 (B1) |
| C2 | ตัดสิน `LoginView.jsx` (dead code) → wire หรือลบ | P0 | READY | ไม่มี path ที่ผู้ใช้เข้าใจผิด; ถ้าลบต้องยืนยันตาม Deletion Protocol | คู่กับ C1 |
| B8c | client adapter ชี้ไป Worker proxy (เมื่อ B8 อนุมัติ) | P2 | BLOCKED | browser ไม่เรียก `api.github.com` ตรง + read ไม่ติด rate limit | รอข้อสรุป D4 (P3) + spec จาก P1 |
| C3 | UX onboarding PAT (โหมดอ่านอย่างเดียว + ตรวจ scope) | P1 | READY | ผู้ใช้หน้างานใส่ PAT เองได้, toast ไม่เด้งรัว, 403 scope แจ้งตรงจุด | ช่วยลดงาน D2 (P3) |
| C4 | ซ่อม Service Worker pre-cache fail | P1 | READY | ไม่มี `[SW] Core assets pre-cache partial error`; เปิด `/dashboard` ออฟไลน์ได้ | bump cache ต้องผ่านเลขเวอร์ชันของ P1 |
| C5 | ตรวจ dashboard + รายงาน A4 หลัง CDN snapshot ถูก scrub PII | P1 | READY | UI/render/PDF ถูกต้องทั้งเคส GitHub สำเร็จ และเคส rate-limited | รับผลจาก B3 (P1) |
| C6 | คุม quota localStorage (base64 photos) | P2 | READY | ไม่เกิน quota, ข้อมูลไม่หาย, commit ไม่บวม | ตรวจร่วมกัน D5 (P3) |
| C7 | Accessibility/DoD audit ฟอร์ม 7 ขั้น + dark/light | P2 | READY | ผ่านเช็กลิสต์ DoD ทุกข้อ (contrast/label/aria/touch/async) | — |

## รายละเอียดงาน

### C1 (P0) ต่อ authentication ฝั่ง client สำหรับ local server
- บริบท: ตั้งแต่ v2.10.0 `database.py` บังคับ bearer token สำหรับคำขอ **นอก loopback** แต่ยังไม่มีที่ใดใน `src/lib/api.js` ส่ง header `Authorization` ให้ `/api/save` (บรรทัด ~611), `/api/update` (~786), `/api/delete` (~917) → เครื่องอื่นในวง LAN ที่เปิดผ่านเซิร์ฟเวอร์จะบันทึกไม่ได้
- ขั้นตอน:
  1. หลัง `loginUser()` สำเร็จ เก็บ token ใน `sessionStorage` (key `surveyApiToken`) — ไม่ใช้ `localStorage` (ลดอายุการครอบครอง)
  2. เพิ่ม helper `apiAuthHeaders()` ใน `src/lib/api.js` และแนบใน fetch ของ save/update/delete (ทั้งเส้นทาง `/api/*` และ path legacy `/save` `/update` `/delete`)
  3. เมื่อได้ `401` → ลอง login ใหม่ 1 ครั้ง → ยังผิด → toast + เปิด GitHubTokenModal แยกโมดัล (ใช้ event reason ใหม่ `api_token` ที่ตกลงกับ P1)
  4. เมื่อได้ `429` (จาก B1) → แจ้ง "กรอกรหัสผิดหลายครั้ง รอ X วินาที" และล็อกปุ่มชั่วคราว
  5. **static host (r2.dev) ต้องไม่เรียก backend เลย** — คงพฤติกรรม `isStaticHost()` อย่างเคร่งครัด
- Definition of Done: ทดสอบ 2 สถานะ (มี token / ไม่มี token) ผ่านจริงบน `REQUIRE_TOKEN=1` + `npm run dev` และบน `python database.py` ตรง ๆ; unit test mock fetch ในสไตล์เดิม (Node + mock) ต้องมี ≥ 4 เคส (แนบ header, ไม่มี header เมื่อ static, renew หลัง 401, ไม่ retryเกิน 1 ครั้ง)
- ความเสี่ยง: token หมดอายุระหว่างกรอกฟอร์มยาว → แก้ด้วย renew อัตโนมัติ 1 ครั้งต่อ request

### C2 (P0) จัดการ `src/components/auth/LoginView.jsx`
- หลักฐานปัจจุบัน: ไม่มีไฟล์ใด import `LoginView` (grep ทั้ง `src/`), `App.jsx` redirect `/login` กลับหน้า field → เป็น dead code ที่มี UI หลอกว่ามี login
- ทางเลือก: (ก) wire เข้า `App.jsx` เป็น gate ชั่วคราว (แสดงเฉพาะเมื่อ `!isStaticHost()` และเซิร์ฟเวอร์ตอบว่าต้อง auth) หรือ (ข) ลบไฟล์ + `sessionStorage.surveyToken` ที่ค้าง
- ผลลัพธ์ที่คาดหวัง: ผู้ใช้รู้จุด login จริง/ไม่มี login เลยอย่างใดอย่างหนึ่ง ไม่ก้ำกึ่ง
- gate: ถ้าเลือก (ข) → แสดง path และขอ `YES, DELETE <path>` ก่อน (Deletion Protocol ของ repo)

### C3 (P1) UX onboarding Fine-grained PAT
- ทำ: ชิปสถานะบน Navbar ที่อ่าน `getStoredGitHubToken()` ตรง ๆ (ไม่ต้องพึ่ง `/api/github-status` เพราะค่าที่ CI เผยแพร่บน R2 ตอบ `configured:false` ตลอด), ปุ่ม "ตั้งค่า Token" พร้อมลิงก์ `github.com/settings/personal-access-tokens/new`, ข้อความแยกกรณี `no_token` (มีแล้ว) / `bad_token` (มีแล้ว) / **scope ไม่พอ** (GitHub ตอบ 403 "Resource not accessible by personal access token") → บอกชัดว่าต้องให้ Contents: Read and write เฉพาะ repo `Thaidimaru/Pre_PM2`
- เพิ่ม: แถบ "โหมดอ่านอย่างเดียว — ข้อมูลจะค้างในเครื่องจนกว่าจะใส่ Token" พร้อมจำนวนรายการที่ค้างในคิว (นับจาก `getLocalSurveys()` ที่ `githubSynced !== true`)
- Definition of Done: headless render 2 เคส (มี/ไม่มี PAT) + cooldown ยังทำงาน (toast ไม่เกิน 1 ครั้ง/15 วินาที) + ข้อความไม่โชว์ raw code

### C4 (P1) ซ่อม Service Worker ให้ตรงกับ R2 reality
- หลักฐานปัจจุบัน: เปิด `https://pub-…r2.dev/dashboard` แล้ว console มี `[SW] Core assets pre-cache partial error: TypeError: Failed to execute 'addAll' on 'Cache': Request failed` และ probe ยืนยัน `GET /` บน r2.dev = **404** (ส่วน `/index.html` = 200)
- ทำ: ตัด `'/'` ออกจาก `CORE_ASSETS` (หรือเปลี่ยนเป็น `'/index.html'`), แยก handling ของ navigation request เป็น network-first + fallback cache, log ชื่อ resource ที่ล้มเหลวรายตัว (แทนที่จะกลืน error รวม), คงกติกา: ไม่ cache ข้าม origin / ไม่ cache non-GET / ไม่ cache `blob:`
- ต้องทำควบคู่: bump cache name ตามกติกา "ทุกครั้งที่แก้ `sw.js`" — cache name ผูกกับ `APP_VERSION` ผ่าน `register('/sw.js?v=' + APP_VERSION)` → **ส่งคำขอเลขเวอร์ชันให้ P1** พร้อม PR
- Definition of Done: on production ไม่มี error pre-cache, ตั้ง offline แล้วเปิด `/dashboard` ได้, `GET /sw.js?v=<ใหม่>` คืน 200

### C5 (P1) ตรวจผลข้างเคียงจากการ scrub PII ที่ CDN
- เคสที่ต้องครอบคลุม: (ก) GitHub fetch สำเร็จ → ชื่อ/เบอร์ผู้ให้ข้อมูลยังมาจาก `data/surveys/*.json` (สาธารณะ) → ตาราง + รายงาน A4 สมบูรณ์ (ข) GitHub ถูก rate-limit/backoff → ใช้ snapshot ที่ scrub แล้ว → คอลัมน์ติดต่อต้องแสดง `-` ไม่โชว์ `undefined` และไม่ crash, ปุ่ม `A4`/`ดูข้อมูล`/`แก้ไข` ยังทำงาน (ค) snapshot เก่าค้างใน Cache-Control ไม่มี (ตั้ง `no-cache`) → ยังต้องบังคับ refresh ผ่าน `?_t=`
- Definition of Done:ผลตรวจทั้ง 3 เคสแนบใน PR (DOM/ภาพหน้าจอ + console) และยืนยันว่า `SurveyReportModal` ยังพิมพ์/ออก PDF ได้ (client-side `html2canvas-pro`)

### C6 (P2) คุม quota localStorage
- บริบท: กฎ repo ห้ามขยาย base64 ในไฟล์ survey โดยไม่จำเป็น (quota + ขนาด commit) และ `saveLocalSurvey` เก็บสูงสุด 200 รายการ พร้อม strip `dataUrl` เมื่อ quota เต็ม
- ทำ: ตรวจว่า record ที่ถูก strip แล้วยังแสดงรูปจาก GitHub ได้ (ไม่เกิดช่องว่าง), เพิ่มการล้าง tombstone เก่า (`nbtc_pre_pm_*`) ตามอายุ, และทดสอบเคส quota เต็มจริง
- ผลลัพธ์: บันทึกหน้างานไม่ fail เพราะ `QuotaExceededError` อีก

### C7 (P2) Accessibility / DoD audit
- เช็กลิสต์: ทุก input มี label · icon-only button มี `aria-label` · contrast ≥ 4.5:1 ทั้ง dark/light · touch target ≥ 44×44px · `cursor-pointer` · disable ปุ่มระหว่าง async · responsive 375/768/1024/1440 ไม่มี horizontal overflow · modal เป็น Radix `Dialog` พร้อม overlay และ focus คืน
- ผลลัพธ์: ฟอร์ม 7 ขั้นผ่านครบ และไม่มี emoji ตกค้างเป็นไอคอน

## ลำดับการทำงานของฉัน (2 สัปดาห์แรก)

| สัปดาห์ | งาน | ต้องมีก่อน |
|---|---|---|
| 1 | lock spec กับ P1 (C1 ↔ B1) → ลงมือ C1 → C2 | shape 401/429 จาก P1 |
| 1 | C3 (โหมดอ่านอย่างเดียว + scope 403) | — |
| 2 | C4 (SW fix) → C5 (ตรวจผล B3) | B3 merge + deploy แล้ว, เลขเวอร์ชันใหม่จาก P1 |
| 2 | C6, C7 (งานคุณภาพ) | — |

## Checklist ก่อนเปิด PR (ทุกครั้ง)
1. `npm run build` exit 0 (verification หลักของ repo นี้ — ไม่มี lint/test script ฝั่ง JS)
2. headless Edge `--dump-dom` ผ่าน (`npm run preview`) และ **ไม่มี `Uncaught`** ใน console
3. ตรวจ static-host aware: ฟีเจอร์ที่เรียก `/api/*` ต้องมี fallback เมื่ออยู่บน r2.dev
4. ไม่มี raw error code ใน UI · ข้อความไทยใกล้จุดผิดพลาด · log มี `recordId`
5. ส่งเลขเวอร์ชัน + ข้อความ CHANGELOG ให้ P1 รวมก่อนเปิด PR
6. แนบหลักฐาน PASS/FAIL/NOT RUN พร้อมเหตุผล

## บันทึกความคืบหน้า (เติมเอง)

| วันที่ | id | สถานะใหม่ | หลักฐาน (sha / คำสั่ง / ภาพ) | หมายเหตุ |
|---|---|---|---|---|
| 2026-10-21 | — | — | baseline: bundle `index-CiDv2Xla.js` = 2.11.1 | ยังไม่ส่ง C1 |
|  | C1 | READY |  |  |
|  | C2 | READY |  |  |

## จุดประสานงาน (กันทำงานซ้ำและกันแก้ไฟล์ทับกัน)

| งานร่วม | ส่วนของฉัน | ส่วนของอีกคน | ลำดับที่ต้องรักษา |
|---|---|---|---|
| C1 ↔ B1 | ต่อ `Authorization` + retry/renew ใน `src/lib/api.js` | P1 กำหนด shape `401`/`429` | รอ spec จาก P1 ก่อนเริ่ม · P1 ห้ามแก้มือในไฟล์นี้ |
| C2 ↔ C1 | เลือก wire หรือลบ `LoginView.jsx` | — | ถ้าลบ ต้องได้ `YES, DELETE <path>` ตาม Deletion Protocol |
| C3 ↔ D2 | UX โหมดอ่านอย่างเดียว + ตรวจ scope `Contents: write` | P3 ออก PAT และทำทะเบียน | P3 ห้ามรอ UX และฉันห้ามสร้าง PAT เองในนาม `Thaidimaru` |
| C4 ↔ RL | แก้ `public/sw.js` (ไฟล์ของฉันคนเดียว) | P1 รวมเลข `APP_VERSION` เพื่อ bump cache name | ส่งคำขอเลขเวอร์ชันให้ P1 พร้อม PR |
| C5 ↔ B3 | ตรวจว่า UI/รายงานยังถูกต้องหลัง scrub | P1 ทำ scrub + deploy | งาน P1 ต้อง merge + deploy ก่อน แล้วฉันจึงตรวจ |
| C6/C7 ↔ D7 | งานคุณภาพ + หลักฐาน | P3 ตรวจเป็น QA gate | ส่งหลักฐานให้ P3 ก่อน merge |

ไฟล์ของเพื่อนร่วมทีม: [WORK_PLAN_P1.md](WORK_PLAN_P1.md) · [WORK_PLAN_P3.md](WORK_PLAN_P3.md) · ไฟล์รวม: [WORK_PLAN.md](WORK_PLAN.md) (P3 เป็นคน sync ตาราง §3)
