# แผนงานที่ค้าง — Pre-PM Survey Control Room (แบ่ง 3 นักพัฒนา)

เอกสารประสานงานสำหรับทีมแก้โค้ด 3 คน · อ้างอิง `AGENTS.md`, `GEMINI.md`, `CHANGELOG.md`
สถานะอ้างอิง: `upstream/main = e5f3c12` · production R2 = bundle `2.11.1` (deploy 2026-10-21T02:28Z)

## 0. วิธีใช้และสัญลักษณ์

| สัญลักษณ์ | ความหมาย |
| --- | --- |
| P0 | ห้ามข้าม — ปิดช่องโหว่หรือระบบใช้งานไม่ได้ถ้าไม่ทำ |
| P1 | ต้องเสร็จในรอบนี้ (2–3 สัปดาห์ถัดไป) |
| P2 | คุณภาพ/หนี้ทางเทคนิค ทำเมื่อสายหลักโล่ง |
| READY | พร้อมลงมือ ไม่มีบล็อกเกอร์ |
| GATED | เริ่มได้ทันที แต่ **ต้องได้รับอนุญาต** ก่อนคำสั่งที่แตะ production/git |
| BLOCKED | ติดเงื่อนไข (ระบุในช่องหมายเหตุ) |
| DONE | เสร็จแล้ว (ใส่ sha / ลิงก์หลักฐาน) |

ไฟล์แผนรายบุคคล (แต่ละคนถือไฟล์ของตัวเอง ไม่ต้องคัดลอกงานข้ามไฟล์):

- **P1** → [WORK_PLAN_P1.md](WORK_PLAN_P1.md) (Backend / Deploy / Release)
- **P2** → [WORK_PLAN_P2.md](WORK_PLAN_P2.md) (Frontend / Client sync / UX)
- **P3** → [WORK_PLAN_P3.md](WORK_PLAN_P3.md) (Security ops / Data integrity / QA / Docs)

กติกาการอัปเดตไฟล์นี้: เจ้าของงานแก้สถานะในไฟล์ของตัวเองเท่านั้น · **P3 เป็นคนเดียวที่ sync ตาราง §3 ของไฟล์รวมนี้** (หลัง QA gate ทุกครั้ง) · ห้ามลบ id ที่ปิดแล้ว (ใช้เป็น record) · งานร่วม (B1/C1, B4, D3, B8) ดูลำดับทำก่อน-หลังในไฟล์ของเจ้าของขั้นนั้น

---

## 1. ฐานงานที่เสร็จแล้ว (อย่าทำซ้ำ)

| รายการ | เวอร์ชัน | sha / หลักฐาน | สถานะ |
| --- | --- | --- | --- |
| ถอด GitHub token ออกจาก bundle, เลิกเรียก `/api/sync-config`, guard `recordId`, rate-limit backoff, error text ภาษาไทย | 2.9.0 | `87020d4` → merge `7526ecf` | DONE |
| `database.py` auth จริง (bind `127.0.0.1`, `/login` ตรวจรหัส + bearer 8 ชม., guard path ข้อมูล/เขียน, CORS allowlist, `githubDeleted` ตามจริง) | 2.10.0 | `7a27d25` → merge `7526ecf` | DONE |
| `deploy_r2.py` เลิกอัปโหลด token + purge `/api/sync-config`,`/sync-config` + sanitize snapshot + `--dry-run`/`--purge-secrets-only` | 2.11.0 | `103af29` → merge `7526ecf` | DONE |
| ซ่อม CI (`initialize()` ก่อนสร้าง snapshot) + ย้าย purge ออกนอก `try` | 2.11.1 | `75ed619` → merge `7526ecf` | DONE |
| ตรวจแล้วบน production: `/api/sync-config` → **404**, `/api/dashboard` `updatedAt=2026-10-21T02:28:34Z` 180 รายการ **ไม่มี** `contactName/contactPosition/contactPhone/informantName`, bundle `index-CiDv2Xla.js` ไม่มี token | — | run `39533128570` | DONE |
| `PM-E2E-UNSYNCED-1` หายจาก `data/surveys` และ SQLite | — | `8cf371c` + startup prune v2.8.9 | DONE |

**สิ่งที่ยังเปิดช่องโหว่**: ค่า token เดิมยังแกะได้จาก bundle hashed เก่าบน R2 (`assets/index-Bo0eDo-P.js`, `assets/index-DOixsAy_.js` ยัง HTTP 200) และจาก git history สาธารณะ (introduce `3e0baa7`, remove `87020d4`) — **ต้อง revoke ที่ต้นทางเท่านั้น** (id `D1`)

---

## 2. การแบ่งขอบเขตและกติกาไม่ให้ชนกัน

| คน | บทบาท | ไฟล์ที่เป็นเจ้าของ (exclusive) |
| --- | --- | --- |
| **P1** | Backend / Deploy / Release | `database.py`, `deploy_r2.py`, `export_pdf.py`, `export_photos.py`, `.github/workflows/deploy-r2.yml`, `.gitignore`, `GEMINI.md`, `tests/**`, **`src/version.js` + `package.json` + `CHANGELOG.md`** |
| **P2** | Frontend / Client sync / UX | `src/lib/api.js`, `src/components/**`, `public/sw.js`, `public/manifest.json`, `index.html`, `src/index.css`, `src/context/**` |
| **P3** | Security ops / Data integrity / QA / Docs | `docs/**`, `scripts/**`, `AGENTS.md`, `SECURITY.md`, `README.md` (เฉพาะข้อความ; บรรทัด badge เป็นของ P1) |

กติกา:

1. **ไฟล์แชร์ห้ามแก้มือสอง**: `src/version.js`, `package.json`, `CHANGELOG.md`, `README.md:9 (badge)` เป็นของ P1 คนเดียว — P2/P3 แก้โค้ดแล้ว **ส่งเลขเวอร์ชัน + ข้อความ CHANGELOG ให้ P1 รวม** ก่อนเปิด PR
2. **sync ก่อนเสมอ**: `git fetch upstream; git merge --ff-only upstream/main` (ตอนนี้ FF ได้: `75ed619 → e5f3c12`) แล้วค่อยแตก branch
3. สาขา: `track-b/<id>`, `track-c/<id>`, `track-d/<id>` — 1 PR ต่องาน, base = `main`, ห้ามแก้ข้าม track ใน PR เดียว
4. **API contract เปลี่ยนต้องจับคู่ P1+P2** ก่อนลงมือ (เช่น B1 ↔ C1) — บันทึกข้อตกลงลง `GEMINI.md` §4.3 โดย P1
5. gate เดิมของ repo: push ที่แตะ `src/**`, `public/**`, `data/surveys/**`, `index.html`, `package.json`, `vite.config.mjs`, `deploy_r2.py`, `database.py` = **trigger production deploy** · รัน `python deploy_r2.py` / ลบไฟล์ / `git rm --cached` = **ต้องขออนุญาตก่อน**

---

## 3. งานคงค้างทั้งหมด (ตารางรวม)

| id | งาน | คน | P | สถานะ | หมายเหตุ / บล็อกเกอร์ |
| --- | --- | --- | --- | --- | --- |
| D1 | revoke OAuth grant + triage บัญชี | P3 | P0 | BLOCKED (ต้องใช้บัญชี `Thaidimaru`) | fingerprint `e505cad6f4cf5ae5` |
| D2 | ออก Fine-grained PAT ต่อเครื่อง + ทะเบียน | P3 | P0 | READY | ทำควบคู่กับ D1 |
| D3 | จัดหา R2 credentials + รัน purge stale assets | P3 | P0 | BLOCKED (ไม่มี `r2-credentials.json` บนเครื่องนี้) | ร่วมกับ B2 |
| B2 | `--purge-stale-assets` ใน `deploy_r2.py` | P1 | P0 | READY | upload ก่อน delete เสมอ |
| B3 | ปิด PII ที่เหลือใน snapshot (`contactVillage`, `onedrive-status`, `github-status.user`) | P1 | P0 | READY | ประสาน C5 (รายงานยังต้องใช้ข้อมูล) |
| C1 | แนบ `Authorization` ฝั่ง client ใน `/api/save`, `/api/update`, `/api/delete` | P2 | P0 | READY | v2.10.0 บังคับ bearer → **ตอนนี้ LAN client เขียนไม่ได้** |
| C2 | จัดการ login gate/UI (`LoginView.jsx` เป็น dead code) | P2 | P0 | READY | ต้องคุยก่อนว่าจะเปิด LAN หรือไม่ |
| B4 | เลิก track `access-password.txt` + `.gitignore` + ตั้ง `FORM_PASSWORD` ใหม่ | P1+P3 | P0 | GATED | ห้ามทำก่อนตั้งรหัสใหม่ |
| B1 | `POST /api/login` rate-limit/lockout | P1 | P1 | READY | กันเดารหัสเมื่อเปิด LAN |
| C3 | PAT onboarding UX (โหมดอ่านอย่างเดียว + ตรวจ scope) | P2 | P1 | READY | ลดงาน helpdesk หน้างาน |
| C4 | ซ่อม SW pre-cache fail (`/` → 404 บน r2.dev) | P2 | P1 | READY | console: `addAll … Request failed` |
| C5 | ตรวจ dashboard + รายงาน A4 หลัง snapshot ไม่มี contact | P2 | P1 | READY | on r2.dev ยังแสดงเบอร์จาก GitHub |
| B5 | `tests/test_database.py` (stdlib unittest) คลุม auth/guard/CORS/delete | P1 | P1 | READY | repo ยังไม่มี test script |
| B6 | กัน backup `survey-*.json` ร่วงเข้า git | P1 | P1 | READY | upstream ถอด ignore line ออกแล้ว |
| D4 | PII inventory ทั้งระบบ + ข้อเสนอ (private repo/proxy) | P3 | P1 | READY | ผลลัพธ์เป็นเอกสาร + งานต่อยอด (B8) |
| D5 | Data reconciliation `data/surveys` ↔ SQLite ↔ GitHub listing | P3 | P1 | READY | สคริปต์ read-only |
| D6 | เขียน runbook `docs/ops-*.md`, เติม `SECURITY.md`, อัปเดต debt checklist | P3 | P1 | READY | `SECURITY.md` upstream ยังเป็น template ว่าง |
| D7 | QA matrix ต่อ release (build/preview/headless/offline/multi-tab) | P3 | P1 | READY | เป็น gate ก่อน merge |
| B7 | Prune audit 4 แถว + วิธี restore จาก history | P1 | P2 | READY | `PM-202610070225252-d5df` ฯลฯ |
| C6 | คุม quota localStorage (base64 photos) | P2 | P2 | READY | ตาม AGENTS DoD |
| C7 | Accessibility/DoD audit ฟอร์ม 7 ขั้น + dark/light contrast | P2 | P2 | READY | |
| D8 | ตรวจ PAT หมดอายุแล้วแอปแจ้งเตือน ไม่ fail เงียบ | P3 | P2 | READY | สรุปร่วมกับ C3 |
| B8 | Cloudflare Worker proxy สำหรับ read/write (แทน GitHub API ตรง) | P1+P2 | P2 | BLOCKED (ต้องตัดสินใจสถาปัตยกรรม + สิทธิ์ Cloudflare) | ทางออกถาวรของ PII |

---

## 4. รายละเอียดงานรายคน

### P1 — Backend, Deploy, Release

#### B1 (P1) login rate-limit + ตอบ 401 ให้เครื่องนอก

- ทำ: นับ attempt ต่อ IP (เช่น 10 ครั้ง/5 นาที) ใน `AuthService`, log เฉพาะ IP (ห้าม log รหัสผ่าน)
- ผลลัพธ์ที่คาดหวัง: สคริปต์เดารหัสต่อเนื่องไม่ได้; ผู้ใช้ใส่รหัสผิดเห็นข้อความไทยชัดเจน
- ตรวจ: `python database.py` แล้วยิง `POST /api/login` 12 ครั้ง → ครั้งที่ 11 ต้องได้ 429

#### B2 (P0) purge stale hashed assets

- ทำ: เพิ่ม flag `--purge-stale-assets` — หลัง upload สำเร็จ จึง list `assets/*` บน bucket แล้วลบเฉพาะ key ที่ไม่มีใน `dist/`; แสดงรายการใน `--dry-run` ก่อนเสมอ
- ผลลัพธ์: bundle เก่าที่เก็บ token (`index-Bo0eDo-P.js`, `index-DOixsAy_.js`) → HTTP 404 และจำนวน object ไม่บวมทุก release
- ตรวจ: dry-run → รายชื่อตรง 2 คีย์ → รันจริง (ต้องได้สิทธิ์) → `curl -I` คาดหวัง 404 ทั้งคู่
- gate: **ต้องขออนุญาตก่อนรันจริง**

#### B3 (P0) ปิด PII ที่ยังค้างใน snapshot สาธารณะ

- ทำ: เพิ่ม `contactVillage` ใน `PUBLIC_DASHBOARD_PII_FIELDS`; ตัด `folder`/`surveysDir`/`dbPath`/`account` จาก `/api/onedrive-status` (เก็บเฉพาะ counts/status), ตัด `user` จาก `/api/github-status`; ให้ `--dry-run` รายงานคีย์ที่ยังค้าง
- ผลลัพธ์ที่คาดหวัง: ค่าที่เผยแพร่บน CDN ไม่มีข้อมูลติดต่อ/ชื่อบัญชี/email/local path
- ต้องประสาน: P2 — รายงาน A4 ต้องยังพิมพ์ชื่อผู้ให้ข้อมูลได้ (ให้มาจาก GitHub record ไม่ใช่ CDN snapshot)

#### B4 (P0) ปลด `access-password.txt` จากการ track

- ทำ (ลำดับสำคัญ): ตั้ง `FORM_PASSWORD` ค่าใหม่บนเครื่อง admin → ตรวจว่า login ผ่าน → `git rm --cached access-password.txt` (ไฟล์ยังอยู่บนดิสก์) → เพิ่มบรรทัดใน `.gitignore` → บันทึกวิธีใช้ใน `docs/ops-credentials.md` (P3)
- ผลลัพธ์: clone ใหม่ไม่มีรหัสผ่านแนบมา; ค่าเดิมที่เปิดเผยไปแล้วถูกใช้ไม่ได้
- gate: `git rm --cached` + push = **ต้องได้รับอนุญาต**; ห้าม rewrite history

#### B5 (P1) ชุดเทสต์ Python

- ทำ: `tests/test_database.py` ด้วย stdlib `unittest` (ไม่เพิ่ม dependency) คลุม `verify_password`, `create_token/is_authorized` (หมดอายุ), `peer_is_loopback`, `origin_allowed`, `require_local_or_authorized` (ทดสอบด้วย `REQUIRE_TOKEN=1`), `delete_surveys` คืน `githubDeleted` ตามจริง, `sanitize_dashboard_payload`/`sanitize_stations`
- ผลลัพธ์: มี `npm run test:py` เป็น gate กลางของทุก track (P1 เป็นผู้เพิ่ม script ใน `package.json`)

#### B6 (P1) กัน backup PII เข้า git

- ทำ: เลือก 1 ทาง — (ก) คืนบรรทัด `survey-*.json` ใน `.gitignore` หรือ (ข) ให้ `save_survey()` เขียน backup ลง `data/archive_local/` (gitignored) — แนะนำ (ก) เพราะเล็กและคงพฤติกรรมเดิม
- ผลลัพธ์: `git status` ไม่มี `survey-<timestamp>.json` โผล่มาอีก

#### B7 (P2) Prune audit

- ทำ: สคริปต์รายงาน record ที่ไฟล์หายแต่ยังอยู่ใน SQLite (ตอนนี้ 4 รายการ) + ขั้นตอน restore จาก git history
- ผลลัพธ์: ก่อนสตาร์ตเซิร์ฟเวอร์ครั้งถัดไป ทีมรู้ว่า 4 แถวจะถูกลบ และมีทางกู้

#### งาน release metadata (P1 ทำคนเดียว)

- รวมเลขเวอร์ชัน + `CHANGELOG.md` ต่อ PR ของทุก track, ตรวจ `README.md:9` badge ตาม rules §10, และ FF `upstream/main` ก่อน merge เสมอ

### P2 — Frontend, Client sync, UX

#### C1 (P0) ต่อ authorization ฝั่ง client

- ทำ: เก็บ API token จาก `POST /api/login` ใน `sessionStorage` (`surveyApiToken`), แนบ `Authorization` ใน fetch `/api/save`, `/api/update`, `/api/delete` และ `do_DELETE`; เมื่อได้ 401 ให้ renew หนึ่งครั้งแล้ว prompt; **static host ไม่เรียก backend เลย (คงเดิม)**
- ผลลัพธ์ที่คาดหวัง: เครื่องในวง LAN ที่รันผ่าน `database.py` บันทึก/แก้ไข/ลบได้จริงหลัง login (ปัจจุบันได้ 401)
- ตรวจ: ตั้ง `REQUIRE_TOKEN=1` + `npm run dev` → login → submit 1 record → 200; ไม่ login → เห็น 401 ข้อความไทย ไม่ fail เงียบ
- ต้องประสาน: B1 (shape ของ 401/429)

#### C2 (P0) login gate/UI ของ `LoginView.jsx`

- ทำ: ตัดสิน 1 ทาง — (ก) wire `LoginView` เข้า `App.jsx` (route `/login` + guard เฉพาะกรณีที่ไม่ใช่ static host และเซิร์ฟเวอร์แจ้งว่าต้อง auth) หรือ (ข) ลบไฟล์และคง flow GitHub เท่านั้น
- ผลลัพธ์: ไม่มี dead code ที่ทำให้ผู้ใช้สับสน; ผู้ดูแล LAN รู้จุด login
- gate: ถ้าเลือก (ข) ต้องยืนยันการลบไฟล์ตาม Deletion Protocol

#### C3 (P1) PAT onboarding UX

- ทำ: ชิปสถานะ "เชื่อมต่อ GitHub / โหมดอ่านอย่างเดียว" บน Navbar (อิง `getStoredGitHubToken()` จริง ไม่ไปเชื่อ snapshot ที่ CI ตอบ `no_token`), ปุ่ม "ตั้งค่า Token" พร้อมลิงก์ fine-grained, แยกข้อความเมื่อ 403 "Resource not accessible by personal access token" = scope ไม่พอ
- ผลลัพธ์: หน้างานแก้เองได้ (ใส่ PAT) ไม่ต้องโทรหา DevOps
- ตรวจ: headless render กรณีมี/ไม่มี PAT → ข้อความถูกต้อง, toast ไม่เด้งรัว (cooldown ทำงาน)

#### C4 (P1) Service Worker ให้ตรงกับ R2 reality

- ทำ: `public/sw.js` — ตัด `'/'` ออกจาก `CORE_ASSETS` (หรือใช้ `'/index.html'`), network-first สำหรับ navigations, log ชื่อ resource ที่ pre-cache ล้ม (ห้ามเงียบ), ทดสอบ upgrade path ของ cache `pre-pm-nbtc-<version>`
- ผลลัพธ์: ไม่มี `[SW] Core assets pre-cache partial error`; เปิด `/dashboard` แบบออฟไลน์ได้จริง
- gate: ต้อง bump cache name ทุกครั้งที่แก้ `sw.js` (AGENTS DoD) → ประสาน P1 เรื่องเลขเวอร์ชัน

#### C5 (P1) ตรวจผลการย้าย PII ออกจาก snapshot

- ทำ: ไล่เคส (ก) r2.dev ที่ GitHub fetch สำเร็จ (contact มาจาก record) (ข) GitHub rate-limited (ใช้ snapshot ที่ scrub แล้ว) → UI ต้องไม่ crash/ไม่แสดงค่า `undefined`, รายงาน A4 ยังถูกต้อง, ปุ่มพิมพ์/PDF ทำงาน
- ผลลัพธ์: test evidence แนบใน PR

**C6 (P2)** คุม quota localStorage (base64 photos) ไม่ให้กระทบการบันทึกหน้างาน
**C7 (P2)** accessibility/DoD audit ฟอร์ม 7 ขั้น: contrast ≥ 4.5:1, label ครบ, `aria-label` สำหรับ icon-only button, touch target ≥ 44px, disable ปุ่มระหว่าง async

### P3 — Security ops, Data integrity, QA, Docs

#### D1 (P0, BLOCKED) revoke/rotate credential ต้นทาง — ต้องทำโดยเจ้าของบัญชี `Thaidimaru`

- ขั้นตอน: Settings → Applications → Authorized OAuth Apps (GitHub CLI) → **Revoke** · เช็ก Settings → tokens (classic + fine-grained) ว่ามีค่าอื่นค้างอีกไหม · Sign out all sessions · เปิด 2FA · เปลี่ยนรหัสบัญชี
- ผลลัพธ์ที่คาดหวัง: `GET /user` ด้วยค่าเดิม → **401 Bad credentials** (ยืนยันด้วย fingerprint, ไม่พิมพ์ค่า)
- งานต่อเนื่องของทีม: P3 ตรวจ 401 แล้วบันทึกเป็นหลักฐาน; ข้อแม้ — **revoke หลัง bundle 2.11.1 ขึ้น R2 แล้วเท่านั้น** (สำเร็จแล้ว) และต้องทำร่วมกับ D2 เพราะช่วงรอยต่อเครื่องfield จะ sync ไม่ได้

#### D2 (P0) ทะเบียน Fine-grained PAT

- ทำ: สร้าง PAT ต่อเครื่อง (Repository access = เฉพาะ `Thaidimaru/Pre_PM2`, Permissions = Contents: Read and write, expiry ≤ 90 วัน, ชื่อ `prepm-field-<เครื่อง>`), ตารางทะเบียน: เครื่อง / ผู้ใช้ / วันออก / วันหมดอายุ / สถานะ, วิธีใส่ในแอป (GitHubTokenModal) — **ห้าม capture ค่า token ในแชทหรือเอกสาร (ใส่ `***`)**
- ผลลัพธ์: ทุกเครื่อง sync ได้ครบ และรู้คิว rotate ล่วงหน้า
- ตรวจ: สุ่ม 2 เครื่องส่งข้อมูล → มี commit บน GitHub 1 ครั้งต่อ record (ไม่มี commit ซ้ำ)

#### D3 (P0) ปิดรอยรั่วบน R2 ร่วมกับ B2

- ทำ: ส่งมอบ R2 credentials ให้ผู้ดูแล (env หรือ `r2-credentials.json` ที่ gitignore ไว้แล้ว), รัน `python deploy_r2.py --dry-run` → บันทึกผล → รัน `--purge-stale-assets` → เก็บหลักฐาน before/after (200 → 404)
- gate: ทุกคำสั่งที่เขียน bucket ต้องได้รับอนุญาต

#### D4 (P1) PII inventory + ข้อเสนอทางสถาปัตยกรรม

- ทำ: `scripts/pii_scan.py` (read-only) สแกน `data/surveys/*.json` (ล่าสุด 172/178 record มี `contactPhone`), `DATABASE.xlsx`, `Fixed_Database*.xlsx`, `photos/`, snapshot สาธารณะ → รายงานฟิลด์/จำนวน/ผู้ที่เข้าถึงได้ + ทางเลือก (private data repo, Worker proxy, ลดฟิลด์, ปกปิดบางส่วน) พร้อมต้นทุนของแต่ละทาง
- ผลลัพธ์: `docs/pii-inventory.md` + งานเข้า backlog (รวม B8)

#### D5 (P1) Data reconciliation

- ทำ: `scripts/audit_data.py` เทียบ 3 แหล่ง (ไฟล์ ↔ SQLite ↔ listing GitHub) รายงาน diff + วิธีแก้ (prune/restore/push) โดยไม่เขียนข้อมูลเอง
- ผลลัพธ์: ตัวเลข `180 = 180 = 180` ต่อ release; ตรวจเจอ record ที่กลับมาเกิดใหม่ (resurrect) ตั้งแต่วันแรก

#### D6 (P1) เอกสารปฏิบัติการ

- ทำ: `docs/ops-credentials.md` (D1/D2/B4 runbook), `docs/ops-local-server.md` (`HOST`, `PORT`, `REQUIRE_TOKEN`, `ALLOWED_ORIGINS`, `FORM_PASSWORD`, `github-token.txt`), เติม `SECURITY.md` ให้เป็นจริง (เวอร์ชันที่ซัพพอร์ต + ช่องทางรายงานช่องโหว่ — upstream ตอนนี้เป็น template ว่าง), อัปเดต security debt ใน `AGENTS.md` ให้เลื่อน `[ ] → [x]` เฉพาะข้อที่ทำเสร็จจริง
- ผลลัพธ์: คนใหม่รับช่วงได้โดยไม่ต้องถาม (ตาม skill `handoff-safety`)

#### D7 (P1) QA gate ต่อ release

- ทำ: เช็กลิสต์ต่อรอบ — `npm run build` PASS, bundle assertion (ไม่มี token/`sync-config`, มีเลขเวอร์ชัน), `--dry-run` PASS, preview + headless Edge (ไม่มี `Uncaught`), ทดสอบ offline 1 รอบ, multi-tab BroadcastChannel, ลบ 1 record แล้วตรวจทั้ง 3 แหล่ง, (เมื่อมี R2 keys) production probes
- ผลลัพธ์: แนบผลเป็นคอมเมนต์ PR; ที่ไม่ได้รันต้องเขียน NOT RUN + เหตุผล (Global Rules §7)

**D8 (P2)** ทดสอบกรณี PAT หมดอายุ → แอปต้องเด้ง modal และข้อมูลไม่หาย (ร่วมกับ C3)

---

## 5. ลำดับและ dependency

```text
สัปดาห์นี้ (P0)
  D1 revoke ──────────────┐  (เจ้าของบัญชีต้องทำ เป็นหัวใจของการปิดช่องโหว่)
  D2 PAT รายเครื่อง ───────┴─► D8/C3 ตรวจ UX ช่วงรอยต่อ
  C1 + B1 (API contract) ──► ทดสอบ write ผ่าน LAN ──► D6 runbook
  B3 (PII snapshot) ───────► C5 (ตรวจ UI/รายงานไม่พัง)
  B2 (purge flag) ─────────► D3 (รันจริง ต้องมี R2 keys + อนุญาต)
  B4 (untrack password) ───► ต้องมี FORM_PASSWORD ใหม่วันเดียวกัน (P1 + P3)
สัปดาห์ถัดไป (P1)
  B5 tests ──► D7 QA gate (ทุก track ใช้ script เดียวกัน)
  B6 .gitignore backup ──► D5 audit
  C2 login gate, C4 SW fix, D4 PII inventory, D6 docs
ต่อเนื่อง (P2)
  B8 Worker proxy ← สรุปจาก D4 (ทางออกถาวรของ read + write)
  C6 quota, C7 accessibility, B7 prune audit
```

ข้อควรระวัง: อย่า revoke ก่อน bundle ใหม่ขึ้น R2 (ผ่านแล้ว) และอย่าลืมว่า bundle/hash เก่ายังเก็บค่าไว้ → B2 + D3 ควรจบในสัปดาห์เดียวกัน

## 6. ประตูอนุญาตและข้อห้าม (สรุปซ้ำสำหรับทีมใหม่)

| การกระทำ | ใครสั่งได้ | เงื่อนไข |
| --- | --- | --- |
| push ที่แตะ `src/**`, `*.py`, `deploy_r2.py`, `package.json` | เจ้าของ repo | trigger production deploy อัตโนมัติ |
| รัน `python deploy_r2.py` / `--purge-*` | เจ้าของ repo + R2 keys | ต้องมี `--dry-run` + หลักฐาน before/after |
| ลบ/แก้ `data/surveys/*.json`, `survey.db`, `DATABASE.xlsx` | เจ้าของข้อมูล | ต้องได้ `YES, DELETE <path>` + สำรองก่อน |
| `git rm --cached` / แก้ `.gitignore` ที่เกี่ยวกับ secret | เจ้าของ repo | ตั้งค่าใหม่ให้ใช้ได้ก่อนถอดจากการ track |
| revoke/rotate token, เปลี่ยนรหัสบัญชี/2FA | บัญชี `Thaidimaru` เท่านั้น | ทีมอื่นทำได้แค่ตรวจยืนยันผล |
| force push / `reset --hard` / amend ที่ push แล้ว | ห้าม | — |

## 7. Definition of Done ร่วมของทุกงาน

1. `npm run build` exit 0 + `python -m py_compile` (ถ้าแตะ `.py`) + `npm run test:py` (เมื่อ B5 เสร็จ)
2. ไม่มี raw error code โผล่ใน UI; ทุกความล้มเหลวมีข้อความไทย + `console` log อ้างอิง `recordId`
3. ฟีเจอร์บน r2.dev ไม่พึ่ง endpoint ที่มีเฉพาะ `database.py`
4. version bump + `CHANGELOG.md` (ผ่าน P1 เท่านั้น) และไม่มีเลขเวอร์ชัน hardcode ค้าง (ตรวจ `README.md:9`)
5. หลักฐานแนบ PR: คำสั่งที่รัน + ผล PASS/FAIL/NOT RUN พร้อมเหตุผล
6. อัปเดต `GEMINI.md` §4.3 / `docs/ops-*.md` เมื่อ contract หรือ env เปลี่ยน
7. ผ่าน security/data audit: ไม่มี secret ใหม่ใน `dist/`, snapshot ไม่มีฟิลด์ที่ตกลงตัดแล้ว

## 8. ความเสี่ยงหลักที่ยังเปิด (risk register)

| ความเสี่ยง | ระดับ | งานที่ปิด |
| --- | --- | --- |
| token เดิมยังใช้ได้ และแกะได้จาก bundle เก่า + git history สาธารณะ | สูงสุด | D1 + B2/D3 |
| `data/surveys/*.json` และ `DATABASE.xlsx` มีข้อมูลส่วนบุคคลชาวบ้านบน repo สาธารณะ | สูง | D4 → B8 (private repo/proxy) |
| LAN client เขียนข้อมูลไม่ได้ถ้า client ยังไม่ส่ง bearer token | สูง (กระทบใช้งานจริง) | C1 + B1 |
| `access-password.txt` ยังถูก track (ค่าเดิมเปิดเผย) | สูง | B4 |
| snapshot `/api/database` ยังเก็บ `contact_*` (181/197 สถานีมีเบอร์) — ตั้งใจคงไว้เพื่อ auto-fill | กลาง | ตัดสินกับ C5 + `R2_STRIP_STATION_CONTACTS=1` (B3) |
| `/api/login` ยังไม่กัน brute force; API token เก็บใน memory (หายเมื่อ restart) | กลาง | B1 + D6 |
| repo ไม่มี automated test/lint | กลาง | B5 + D7 |
| SW pre-cache fail เพราะ `/` บน r2.dev ตอบ 404 | ต่ำ | C4 |

---

สร้าง 2026-10-21 · เอกสารล้วน จึงไม่ bump เวอร์ชันแอป (ตาม `AGENTS.md` §Changelog & Version Management) · ผู้ประสานงาน release: **P1**
