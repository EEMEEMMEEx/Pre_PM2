# แผนแก้ไข: Download PDF (32) + Sync/Delete errors — Pre-PM Survey

> [!IMPORTANT]
> แผนอย่างเดียว ยังไม่แก้โค้ด — ตรวจโค้ดจริงแล้ว พบว่า **root cause ของ PDF ไม่ใช่ `revokeObjectURL`** ตามที่สันนิษฐานไว้ (ดูหัวข้อ 1)

## 0. สถานะ repo ตอนนี้
- Production (r2.dev) = **v2.8.1** = `HEAD`
- Working tree มีงานที่ **ยังไม่ commit** ระดับ **v2.8.3** อยู่ใน `RecentSurveys.jsx`, `SurveyReportModal.jsx`, `SurveyPreviewModal.jsx`, `version.js`, `package.json` — งานนี้แก้ปัญหา PDF ไปแล้วบางส่วน (เปลี่ยนไปสร้าง PDF ฝั่ง client) แต่ยัง deploy ไม่ได้
- `graft` ใช้ไม่ได้ (ไม่มี native build สำหรับ Node 26) → ใช้ `rg` แทน

---

## 1. Root cause (ยืนยันจากโค้ดแล้ว)

| # | อาการ | Root cause | หลักฐาน |
|---|---|---|---|
| 1 | `SURVEY_SELECTED_32_STATIONS.pdf — File wasn't available on site` | ใน v2.8.1 ปุ่มนี้เป็น `<a href="/api/export-pdf?ids=..." download>` ซึ่งเป็น endpoint ของ **Python server (`database.py`) เท่านั้น** ส่วน r2.dev เป็น static bucket → ได้ 404 → Chrome แสดงข้อความนี้ **ไม่ได้เกิดจาก Blob/revoke** | `git diff HEAD -- src/components/dashboard/RecentSurveys.jsx` (anchor ที่ถูกลบออกใน WIP), [database.py:1184-1200](file:///d:/APP/Pre_PM2/database.py#L1184-L1200) |
| 1b | (ความเสี่ยงใน WIP v2.8.3) | `handleDownloadPdfDirect` ใช้ `html2canvas@1.4.1` ซึ่ง **parse สี `oklch()` ไม่ได้** (Tailwind v4 ใช้ oklch เป็นค่าเริ่มต้น เช่น `border-slate-300` บน `.a4-sheet`) → throw แล้วเงียบ ๆ ไปเรียก `window.print()` แทน, ใช้ `scale:2` + JPEG 0.95 กับทุกหน้า (32 สถานี × ≥2 หน้า) อาจทำให้หน่วยความจำหมดบนมือถือ, ไม่มีการรอให้รูปโหลดเสร็จ และไม่แจ้ง error | [SurveyReportModal.jsx:741-786](file:///d:/APP/Pre_PM2/src/components/export/SurveyReportModal.jsx#L741-L786) |
| 2 | `POST /api/delete → 401` | r2.dev รับเฉพาะ GET/HEAD; POST จะได้ 401 ส่วนโค้ด fallback เฉพาะกรณี `404` แล้วค่อยไป GitHub DELETE (`database.py` ไม่มี auth ที่ `/api/delete` เลย เพราะฉะนั้น 401 ไม่ได้มาจาก token) | [api.js:649-678](file:///d:/APP/Pre_PM2/src/lib/api.js#L649-L678), [database.py:1315-1325](file:///d:/APP/Pre_PM2/database.py#L1315-L1325) |
| 2b | ลบไม่สำเร็จแต่ไม่มีอะไรแจ้ง | `deleteSurveyFromGitHubClient(...).catch(()=>{})` ไม่ดูผลลัพธ์ และ `deleteSurveys` คืน `deleted:true` ทุกครั้ง → รายการกลับมาโผล่ใหม่ตอน poll รอบถัดไป | [api.js:671-693](file:///d:/APP/Pre_PM2/src/lib/api.js#L671-L693) |
| 3 | `GET 404 → PUT 409` + commit ซ้ำ | **มีการเขียนไฟล์เดียวกันพร้อมกันหลายทาง:** `submitSurvey` บันทึก local → `notifySurveysUpdated` → `DashboardView` reload → `fetchDashboardData` → `syncPendingLocalSurveys()` ซึ่ง commit record เดิมซ้ำ (เพราะตอนนั้น `githubSynced` ยังไม่ถูก set) ทั้งสองฝั่ง GET ได้ 404 เหมือนกัน แล้ว PUT แบบไม่มี sha → ฝั่งที่มาทีหลังได้ 409 นอกจากนี้ BroadcastChannel ยังสั่งให้ tab อื่นทำซ้ำได้อีก (`isSyncingPending` กันได้แค่ตัวมันเอง) | [api.js:230-265](file:///d:/APP/Pre_PM2/src/lib/api.js#L230-L265), [api.js:493-519](file:///d:/APP/Pre_PM2/src/lib/api.js#L493-L519), git log: `c193ced` และ `e73f100` เป็น commit ซ้ำของ `PM-...-85cc` |
| 3b | sha เก่า (409 ตอน update/delete) | `sw.js` ดัก **GET ข้าม origin ทุกตัว** รวมถึง `api.github.com/.../file.json?ref=main` และ `raw.githubusercontent` แล้วตอบด้วย **stale-while-revalidate** (`cache:'no-store'` ไม่มีผลกับ `caches.match`) → ได้ sha เก่า → PUT/DELETE ได้ 409 | [sw.js:42-88](file:///d:/APP/Pre_PM2/public/sw.js#L42-L88) |
| 4 | Warning meta | มีแค่ `apple-mobile-web-app-capable` | [index.html:13](file:///d:/APP/Pre_PM2/index.html#L13) |

---

## 2. แผน (Planning mode — high-risk: sync/write path)

**Goal:** ให้ Download PDF (32) ได้ไฟล์ที่เปิดได้ครบ 32 สถานี, sync และ delete ทำงานโดยไม่มี 401/409 และไม่มี commit ซ้ำ

### Files
- [SurveyReportModal.jsx](file:///d:/APP/Pre_PM2/src/components/export/SurveyReportModal.jsx) — สร้าง PDF + แสดง progress + error
- [api.js](file:///d:/APP/Pre_PM2/src/lib/api.js) — `isStaticHost()`, write queue/lock, retry, delete result
- [RecentSurveys.jsx](file:///d:/APP/Pre_PM2/src/components/dashboard/RecentSurveys.jsx) — toast แทน `alert`, แสดงผลการลบบางส่วน
- [sw.js](file:///d:/APP/Pre_PM2/public/sw.js) + [main.jsx](file:///d:/APP/Pre_PM2/src/main.jsx) — bypass + cache version มาจาก `APP_VERSION`
- [index.html](file:///d:/APP/Pre_PM2/index.html) — meta tag
- `src/components/ui/toast.jsx` (ใหม่ หรือใช้ lib — ดู Q2)
- `src/version.js`, `package.json`, `CHANGELOG.md` — 2.8.3 → **2.8.4 (PATCH)**

### Steps

**S1. PDF (client-side, ต่อยอดจาก WIP)**
1. แก้ปัญหา oklch: ใช้ `html2canvas-pro` แทน `html2canvas` (Q1)
2. ก่อน capture ให้รอ `document.fonts.ready` และรอ `img.decode()` ของทุกรูปใน sheet
3. capture **ทีละหน้าตามลำดับ** แบ่งเป็นชุด (8 สถานีต่อชุด) แล้ว yield (`await new Promise(r=>setTimeout(r))`) ระหว่างชุด ใช้ `scale:1.5`, JPEG `0.85` และคืนหน่วยความจำ canvas (`canvas.width=0`) หลังใช้งาน
4. แสดง progress `กำลังสร้าง PDF หน้า i/N` บนปุ่ม (ใช้ state ที่มีอยู่แล้ว) และ disable ปุ่มไว้
5. ดาวน์โหลด: `pdf.output('blob')` → `new Blob([...],{type:'application/pdf'})` → `<a download>` → `click()` → `setTimeout(revokeObjectURL, 5000)` ส่วน iOS standalone ใช้ `navigator.canShare({files})` → `navigator.share` ถ้าไม่ได้จึง `window.open(url)`
6. ตั้งชื่อไฟล์ `SURVEY_SELECTED_${n}_STATIONS.pdf` (ตรงกับชื่อเดิมที่ผู้ใช้คุ้นเคย)
7. เมื่อเกิด error: toast + `console.error('[PDF]', recordIds, err)` **ไม่เรียก `window.print()` เองอัตโนมัติ** (ผู้ใช้ยังกดปุ่ม Print เองได้)

**S2. Service Worker**
- ส่งตรงไป network ไม่ดัก: request ข้าม origin (`api.github.com`, `raw.githubusercontent.com`), `blob:`/`data:`, `/api/export-pdf`, และ `/api/*` ที่ไม่ใช่ GET
- `GET /api/dashboard`, `/api/database` ยังคงเป็น network-first ไว้เพื่อให้ใช้งาน offline ได้ (Q3)
- `CACHE_NAME = 'pre-pm-nbtc-' + version` โดยอ่านจาก `register('/sw.js?v=' + APP_VERSION)` เพื่อให้เวอร์ชันมีแหล่งเดียว

**S3. GitHub sync (`commitSurveyToGitHubClient`)**
1. ป้องกันการเขียนซ้ำใน tab เดียว: ใช้ `inflightWrites: Map<recordId, Promise>` ถ้ามีคนเรียกซ้ำให้รอ promise เดิม และให้การเขียนทุกครั้ง **ต่อคิวกันแบบ serial** (เพราะทุกครั้งเขียนลง branch `main` เดียวกัน)
2. ป้องกันการเขียนซ้ำข้าม tab: `navigator.locks.request('gh-write:'+recordId, ...)` ถ้า browser ไม่รองรับก็ใช้ข้อ 1 อย่างเดียว
3. ลด 404: ถ้า `knownFileShas` (ได้มาจาก directory listing) มี sha ของไฟล์นี้ให้ใช้เลย ถ้าไม่มีจึง GET
4. retry: เมื่อได้ `409`/`422` ให้ GET sha ใหม่ (ไม่ผ่าน SW cache) แล้วลองใหม่ สูงสุด 3 ครั้ง backoff 500/1000/2000 ms และ **ถ้าเนื้อหาบน GitHub เหมือนกับ payload อยู่แล้ว ให้ถือว่าสำเร็จ** (ไม่ commit ซ้ำ)
5. `syncPendingLocalSurveys`: ข้าม record ที่กำลังเขียนอยู่ และ `submitSurvey`/`updateSurvey` ต้องตั้ง `githubSyncing` ก่อนเรียก `saveLocalSurvey`

**S4. Delete**
1. แยก `isStaticHost()` ออกมาเป็น helper (ย้ายมาจาก [api.js:285-290](file:///d:/APP/Pre_PM2/src/lib/api.js#L285-L290)) ถ้าเป็น static host ให้ **ข้าม `/api/delete`, `/delete`** แล้วไป GitHub DELETE เลย (ใช้กับ `/api/save` และ `/api/update` ด้วย — Q4)
2. GitHub DELETE: 409 ให้ GET sha ใหม่แล้ว retry (ใช้ helper ตัวเดียวกับ S3), 401/403 ให้ dispatch `nbtc-github-token-required` → Navbar เปิด `GitHubTokenModal`
3. `deleteSurveys` คืนค่า `{deletedIds, failed:[{id,reason}]}` และลบ local **เฉพาะรายการที่ลบบน GitHub สำเร็จ** หรือไม่พบไฟล์บน GitHub (behavior change — Q5)

**S5. UI feedback** — toast สำหรับ PDF fail / sync fail / delete fail (แสดงจำนวนและ recordId) แทน `alert()`

**S6.** เพิ่ม `<meta name="mobile-web-app-capable" content="yes">` และคง tag `apple-*` ไว้สำหรับ iOS

**S7.** Bump version, เขียน CHANGELOG, `npm run build`

### Verification
- `npm run build` (repo นี้ไม่มี script lint/test)
- หลัง build ให้ `rg oklch dist/assets/*.css` เพื่อยืนยันความเสี่ยงข้อ 1b
- `npm run preview` (จำลอง static host, ไม่มี Python) แล้วทดสอบ PDF ด้วย 32 รายการ
- SW ไม่ register บน localhost → ทดสอบ SW และ PWA บน r2.dev หลัง `python deploy_r2.py` (deploy เมื่อได้รับอนุญาตเท่านั้น)

### Risks
- การเขียน GitHub เป็น write path ของข้อมูลจริง: retry ต้องไม่ทับข้อมูลที่ใหม่กว่า จึงต้องเทียบเนื้อหาก่อนทุกครั้ง และ**ไม่**ใช้ force
- งาน WIP v2.8.3 ที่ยังไม่ commit จะถูกรวมไปใน 2.8.4 ด้วย
- `/api/delete` บน `database.py` ไม่มี auth (security gap ฝั่ง local) — อยู่นอก scope ของงานนี้ แต่ควรแจ้งไว้

---

## 3. คำถามที่ต้องตัดสินใจ (ถ้าไม่ตอบจะใช้ค่า default)
- **Q1** ใช้ `html2canvas-pro` แทน `html2canvas` ไหม? (default = ใช้, แต่ยืนยัน oklch ใน `dist` ก่อน — ถ้าไม่มี oklch ก็ไม่เปลี่ยน)
- **Q2** Toast: สร้าง component เองใน `ui/toast.jsx` (ใช้ framer-motion + lucide ที่มีอยู่แล้ว) หรือเพิ่ม `sonner`? (default = สร้างเอง ไม่เพิ่ม dependency)
- **Q3** `/api/dashboard` ยังให้ SW cache สำหรับ offline ไหม? (default = ยัง cache ต่อ)
- **Q4** ข้าม `/api/save` และ `/api/update` บน static host ด้วยไหม (ซึ่งน่าจะได้ 401 แบบเดียวกัน)? (default = ข้าม)
- **Q5** ถ้าลบบน GitHub ไม่สำเร็จ ให้คงรายการไว้ใน local แล้วแจ้ง error? (default = คงไว้)

---

## 4. Test checklist
1. ค้นหา "กาญจน" → เลือก 32 รายการ → เปิดรายงาน → กด **ดาวน์โหลด PDF (32)** → เห็น progress → ได้ไฟล์ `SURVEY_SELECTED_32_STATIONS.pdf` → เปิดได้ → จำนวนหน้าและชื่อสถานีครบ 32 แห่ง และมีรูป
2. ทำซ้ำในโหมด PWA บนมือถือ (Android Chrome และ iOS standalone)
3. Console: ไม่มี 401 ที่ `/api/*`, ไม่มี 409, ไม่มี warning meta
4. ลบ 1 รายการ และลบแบบ batch → GitHub commit `chore(survey): Delete ...` มีครั้งเดียวต่อรายการ → poll รอบถัดไปรายการไม่กลับมา
5. ลบโดยใช้ token ผิด → modal ให้ใส่ token เด้งขึ้น + toast แจ้ง error
6. Offline: บันทึก survey → กลับมา online → refresh → มี commit `feat(survey)` **1 ครั้ง** ต่อ record (ดู `git log`)
7. เปิด 2 tab พร้อมกันแล้วบันทึก → ไม่มี commit ซ้ำ
8. แก้ไข survey เดิม 2 ครั้งติดกัน → ไม่มี 409 (ยืนยันว่า SW ไม่ส่ง sha เก่า)
