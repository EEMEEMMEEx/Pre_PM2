# แผนงานรายบุคคล — P1 (Backend / Deploy / Release)

อ้างจาก `WORK_PLAN.md` · อัปเดตล่าสุด 2026-10-21 · base reference: `upstream/main = e5f3c12`, production bundle `2.11.1`

## ขอบเขตงานของฉัน

| อนุญาตให้แก้ (exclusive) | ห้ามแก้ (ของคนอื่น) |
|---|---|
| `database.py`, `deploy_r2.py`, `export_pdf.py`, `export_photos.py` | `src/lib/api.js`, `src/components/**`, `public/**`, `index.html` → **P2** |
| `.github/workflows/deploy-r2.yml`, `.gitignore` | `docs/**`, `scripts/**`, `AGENTS.md`, `SECURITY.md`, `README.md` (ข้อความ) → **P3** |
| `GEMINI.md`, `tests/**` | `data/surveys/*.json`, `survey.db`, `DATABASE.xlsx` → ห้ามแตะจนกว่าจะได้รับอนุญาต |
| **`src/version.js`, `package.json`, `CHANGELOG.md`, `README.md:9` (badge)** — ฉันเป็นเจ้าเดียว | — |

กติกาที่ต้องปฏิบัติ: sync ก่อนทุกครั้ง `git fetch upstream; git merge --ff-only upstream/main` · branch `track-b/<id>` · 1 PR ต่องาน · push ที่แตะ `src/**`, `*.py`, `deploy_r2.py`, `package.json` = **trigger production deploy** · รัน `python deploy_r2.py` / `git rm --cached` / ลบไฟล์ = **ต้องขออนุญาตก่อน**

## ตารางสถานะของฉัน (สรุป)

| id | งาน | P | สถานะ | ผลลัพธ์ที่คาดหวัง (วัดได้) | พึ่งพา/ส่งผลถึง |
|---|---|---|---|---|---|
| B2 | `--purge-stale-assets` ใน `deploy_r2.py` | P0 | READY | bundle เก่าที่เก็บ token → HTTP 404 | P3 ใช้ต่อใน D3 |
| B3 | ปิด PII ที่เหลือใน CDN snapshot | P0 | READY | `/api/dashboard` `/api/database` `/api/onedrive-status` `/api/github-status` ไม่มีฟิลด์ต้องห้าม | P2 ตรวจใน C5 |
| B4 | ถอด `access-password.txt` จากการ track | P0 | GATED | repo clone ใหม่ไม่มีไฟล์รหัส · ระบบยัง login ได้ด้วย `FORM_PASSWORD` | P3 ตั้งรหัสก่อน (D2/D6) |
| B1 | rate-limit/lockout ที่ `POST /api/login` | P1 | READY | ครั้งที่ 11 ใน 5 นาที → `429` และ log ไม่มี attempt/รหัสผ่าน | P2 ใช้ shape นี้ใน C1 |
| B5 | ชุดเทสต์ Python (`tests/`) | P1 | READY | `npm run test:py` ผ่าน + เป็น gate ของทุก track | ทุกคนพึ่ง |
| B6 | กัน backup `survey-*.json` เข้า git | P1 | READY | `git status` สะอาดหลังบันทึกผ่านเซิร์ฟเวอร์ | P3 ตรวจใน D5 |
| B7 | prune audit 4 แถว + วิธี restore | P2 | READY | รายงานก่อน/หลังสตาร์ตเซิร์ฟเวอร์ + ขั้นตอนกู้ข้อมูล | P3 ประสาน |
| B9 | สลับลำดับอัปโหลด: `index.html` + SPA fallback เป็นรายการสุดท้าย | P0 | READY | deploy ที่ถูก cancel กลางทางไม่ทำให้ r2.dev พัง | ต้องรู้ก่อน merge แบบขนาน (ดูหัวข้อ ลำดับ merge ปลอดภัย) |
| B8 | Cloudflare Worker proxy (read/write) | P2 | BLOCKED | ไม่เหลือ GitHub API ตรงใน browser + PII ออกจาก repo สาธารณะ | ต้องข้อสรุปจาก D4 (P3) + P2 ทำ client adapter |
| RL | release metadata (version/CHANGELOG/badge) | P0 (ต่อเนื่อง) | DOING | ทุก PR มีเลขเวอร์ชันเดียว ไม่มีเลขค้างใน docs | ทุก track ส่งข้อมูลให้ฉัน |

## รายละเอียดงาน

### B2 (P0) เพิ่ม `--purge-stale-assets` ใน `deploy_r2.py`
- วัตถุประสงค์: ปิดทางเข้าถึง token ที่ยังแกะได้จาก hashed bundle เก่าบน R2 และป้องกัน asset บวมทุก release
- ขั้นตอน: (1) เก็บ `Key` ของ `assets/*` จาก `dist/` (2) upload bundle + snapshot + SPA fallback ตามเดิม (3) **หลัง upload สำเร็จ** list object ใน bucket แล้ว `delete_object` เฉพาะ `assets/*` ที่ไม่อยู่ใน `dist/` (4) `--dry-run` ต้องพิมพ์รายชื่อที่ "จะถูกลบ" ก่อนเสมอ (5) ห้ามลบ `index.html`/`sw.js`/`manifest.json`/`api/*`
- ไฟล์ที่แตะ: `deploy_r2.py` (รวม `LEGACY_SECRET_KEYS` ให้เป็นชุดเดียวกับ `--purge-stale-assets`)
- Definition of Done: dry-run แสดง 2 คีย์ `index-Bo0eDo-P.js`, `index-DOixsAy_.js` → รันจริง (ได้รับอนุญาต) → ทั้งคู่ `HTTP 404`, `/index.html` + asset ใหม่ `HTTP 200`, `/dashboard` `200`, แอปเปิดได้ตามปกติ
- มาตรการปลอดภัย: ทำเฉพาะ release ที่ `index.html` ตั้ง `no-cache` แล้ว (จริง) และ SW cache name เปลี่ยนตาม `APP_VERSION` → ผู้ใช้เก่าดึง shell ใหม่ทันที
- ความเสี่ยง: ลบเร็วเกินไปขณะ user กำลังโหลดหน้า → แก้ด้วยการรัน purge หลัง upload เสร็จ + ในรอบ deploy เท่านั้น (ไม่รันเองนอก release)

### B3 (P0) ปิด PII ที่ยังค้างใน CDN snapshot
- วัตถุประสงค์: ให้ค่าที่เผยแพร่บน bucket สาธารณะไม่มีข้อมูลส่วนบุคคลมากเกินจำเป็น
- ขั้นตอน: (1) เพิ่ม `contactVillage` ใน `PUBLIC_DASHBOARD_PII_FIELDS` (2) ตัด `account`/`folder`/`surveysDir`/`dbPath` จาก `/api/onedrive-status` (เก็บ `configured`, `connected`, `surveysCount`, `photosCount`, `status`, `updatedAt`) (3) ตัด `user` ออกจาก `/api/github-status` (4) `--dry-run` เพิ่มบรรทัด "PII keys left in …" ให้ครบทุก snapshot (5) ตัดสินใจร่วมกับ P3/P2 ว่าจะเปิด `R2_STRIP_STATION_CONTACTS=1` ใน workflow หรือไม่ (ปัจจุบัน default = คงไว้เพื่อ auto-fill)
- Definition of Done: probe สาธารณะหลัง deploy → ไม่พบ `contactName`, `contactPosition`, `contactPhone`, `informantName`, `contactVillage`, Gmail, local path, ชื่อบัญชี ในไฟล์ snapshot ใด ๆ
- ข้อแม้ที่ต้องบอก P2: แอปบน r2.dev ยังแสดงชื่อ/เบอร์ผู้ให้ข้อมูลได้ตามปกติ เพราะมาจาก `data/surveys/*.json` บน GitHub (ไม่ใช่ snapshot) → อย่านับเป็นบั๊ก

### B4 (P0) ถอด `access-password.txt` จากการ track (ทำเป็นคู่)
- ลำดับที่ถูกต้อง (ห้ามสลับ): ① P3 ตั้ง `FORM_PASSWORD` ค่าใหม่ + ทดสอบ `POST /api/login` ผ่าน → ② ฉัน `git rm --cached access-password.txt` + เพิ่มบรรทัดใน `.gitignore` → ③ push (ต้องได้รับอนุญาต) → ④ P3 บันทึกวิธีใช้ใน `docs/ops-credentials.md`
- ไฟล์ที่แตะ: `.gitignore` (ฉัน) · `access-password.txt` on disk ไม่ลบ
- Definition of Done: `git ls-files -- access-password.txt` = ว่าง, login ยังผ่าน, ไม่มี secret ใหม่ใน `dist/`
- ความเสี่ยง: ค่าเดิมยังอยู่ใน history สาธารณะ → จึงต้องเปลี่ยนรหัส (ไม่ใช่แค่ untrack)

### B1 (P1) rate-limit/lockout `POST /api/login`
- ขั้นตอน: นับ attempt ต่อ IP (10 ครั้ง/5 นาที, คืน status `429` + `Retry-After`), ไม่ log attempt/รหัส (log เฉพาะ IP + time), ทดสอบด้วย `REQUIRE_TOKEN=1`
- Definition of Done: สคริปต์เดารหัสได้สูงสุด 10 ครั้ง/window; ผู้ใช้ปกติไม่กระทบ; มี unit test ใน B5

### B5 (P1) ชุดเทสต์ Python (stdlib `unittest` เท่านั้น — ห้ามเพิ่ม dependency)
- ครอบคลุม: `verify_password`, `create_token` + `is_authorized` (อายุ/หมดอายุ), `peer_is_loopback`, `origin_allowed`, `require_local_or_authorized` (กรณี `REQUIRE_TOKEN=1`), `delete_surveys` คืน `githubDeleted`/`githubFailed` ตามจริง, `sanitize_dashboard_payload`, `sanitize_stations`, `purge_legacy_secret_keys` (fake s3)
- สั่งรัน: เพิ่ม `"test:py": "python -m unittest discover -s tests"` ใน `package.json` (ฉันแก้ไฟล์นี้คนเดียว)
- Definition of Done: ผ่านทุกเคส + ผูกเป็น gate ใน PR template ของทุก track

### B6 (P1) กัน backup `survey-*.json` ร่วงเข้า git
- บริบท: upstream ถอดบรรทัด `survey-*.json` ออกจาก `.gitignore` (commit `e23cc82`) แต่ `save_survey()` ยังเขียนไฟล์ backup ระดับ root → PII อาจถูก `git add .`
- ทำ: คืนบรรทัด `survey-*.json` ใน `.gitignore` (ทางเลือก ก) และโน้ตไว้ใน `docs/ops-local-server.md` (P3 เขียน)

### B7 (P2) prune audit
- ทำ: สคริปต์/ขั้นตอนรายงาน record ที่ไฟล์หายแต่ยังอยู่ใน SQLite (ข้อมูล ณ 2026-10-21: `PM-202610070225252-d5df`, `PM-202610111446282-b724`, `PM-202610150739107-0f3c`, `PM-202610150756126-bd86`) + วิธี restore จาก git history (ตำแหน่ง backup ชั่วคราว `%TEMP%\\prepm_backup_202610210139296`)
- Definition of Done: ก่อนสตาร์ตเซิร์ฟเวอร์ครั้งถัดไป ทีมรู้ผลล่วงหน้า และไม่มีข้อสงสัยว่าข้อมูล "หายเอง"

### B8 (P2) Cloudflare Worker proxy (ร่วมออกแบบกับ P2)
- สถานะ: BLOCKED — ต้องได้ข้อสรุปจาก D4 (PII inventory, P3) + สิทธิ์ Cloudflare + ตัดสินใจ owner
- ส่วนของฉัน: spec endpoint (`/sync/commit`, `/sync/delete`, `/records`), scoped secret ใน Worker, rate limit + allow-list origin, contract ให้ P2 ทำ client adapter
- ผลลัพธ์ที่คาดหวัง: browser ไม่มีทางเห็น credential, read path ไม่ติด GitHub rate limit, PII ออกจาก repo สาธารณะได้จริง

### B9 (P0) ทำ deploy ให้ atomic ต่อการ cancel (จำเป็นถ้าจะ merge ขนานกันจริง)
- หลักฐาน: deploy run `39533128570` อัปโหลด `/index.html` เป็นไฟล์ที่ **2 จาก 28** ส่วน `assets/index-CiDv2Xla.js` อยู่ที่ 9 และ `index-BfOHmdUs.css` อยู่ที่ 13 · workflow ตั้ง `concurrency: group r2-deploy, cancel-in-progress: true` (deploy-r2.yml:19-21)
- ปัญหา: ถ้ามี push ซ้ำขณะกำลังอัปโหลด → run เก่าถูก cancel → R2 เหลือ `index.html` ใหม่ที่ชี้ hashed asset ที่ **ยังไม่ถูกอัปโหลด** = r2.dev พังจนกว่า deploy ครั้งถัดไปจะจบ · หน้าต่างเสี่ยงประมาณครึ่งแรกของขั้นตอน deploy (รอบจริง ~40 วินาที)
- ทำ: ใน `deploy_frontend_to_r2()` แยก `files_to_upload` เป็น 2 ชุด — (ชุด 1) `assets/**` + `fonts/**` + image/อื่น อัปโหลดก่อน · (ชุด 2) `index.html` และ SPA route fallbacks อัปโหลดท้ายสุด · `--dry-run` พิมพ์ลำดับใหม่ให้ดู · ไม่เปลี่ยนพฤติกรรมอื่น
- Definition of Done: test ที่ mock s3 client ตรวจว่า `index.html` เป็นคีย์ลำดับท้าย ๆ เสมอ · log ของ deploy รอบถัดไปแสดง `Uploaded (…/28): /index.html` เป็นตัวเลขสูงสุด · รัน `npm run build` แล้ว `--dry-run` exit 0
- gate: การรัน deploy จริงต้องได้รับอนุญาตเหมือนเดิม แต่งานนี้ลดความเสี่ยงของ release ที่ merge ใกล้กันหลาย PR

### ลำดับ merge ที่ปลอดภัยเมื่อ 3 track ทำงานพร้อมกัน
1. P1 merge `B9` + `B2` เป็นตัวแรก (เครื่องมือ deploy ให้อดทนต่อการ cancel) แล้วค่อยให้ track อื่นตาม
2. ทุก merge ที่แตะ path ใน workflow ให้ **รอ run ก่อนหน้าจบ** (`gh run watch` หรือ `gh run list --limit 1`) เพื่อไม่ให้ cancel ซ้ำซ้อน
3. ถ้าเร่งงาน: รวม PR ของ 2–3 งานเป็น release เดียวต่อรอบ (deploy ครั้งเดียว) ดีกว่า merge ทีละ PR ติดกัน
4. P3 เป็นคนตรวจ `V1` หลัง deploy ทุกครั้ง (endpoint สาธารณะ + shell ใหม่) — ห้ามถือว่า merge แล้วคือเสร็จ

### RL (P0 ต่อเนื่อง) บทบาท release owner
- รวม `src/version.js` + `package.json` + `CHANGELOG.md` + badge `README.md:9` ต่อ release ตาม SemVer (fix = PATCH, feature = MINOR)
- ตรวจ: ไม่มีเลขเวอร์ชัน hardcode ค้าง, ทุก track ส่งข้อความ CHANGELOG มาให้ฉันก่อนเปิด PR, FF `upstream/main` ก่อน merge เสมอ

## ลำดับการทำงานของฉัน (2 สัปดาห์แรก)

| สัปดาห์ | งาน | ต้องมีก่อน |
|---|---|---|
| 1 | B2 (code + dry-run) → B3 → RL ทุก PR | B5 อย่างน้อยส่วน sanitize เพื่อใช้ยืนยัน |
| 1 | B4 (ขั้น ②) | P3 ทำขั้น ① เสร็จ |
| 2 | B1 → B5 ครบชุด → B6 | — |
| 2 | B7 → เตรียม spec B8 | P3 ส่งรายงาน D4 |

## Checklist ก่อนเปิด PR (ทุกครั้ง)
1. `python -m py_compile database.py deploy_r2.py export_pdf.py export_photos.py` → exit 0
2. `npm run test:py` ผ่าน (หลัง B5 เสร็จ) · `npm run build` ไม่พัง (เพราะ CI deploy ด้วย)
3. `python deploy_r2.py --dry-run` → exit 0 + อ่านผล PII/purge แล้วถูกต้อง
4. ไม่มี secret/value token ใน diff (ตรวจ `git -c core.pager=cat diff`)
5. เลขเวอร์ชัน + CHANGELOG ผ่านมือฉัน · แนบหลักฐาน PASS/FAIL/NOT RUN ใน PR

## บันทึกความคืบหน้า (เติมเอง)

| วันที่ | id | สถานะใหม่ | หลักฐาน (sha / run id / คำสั่ง) | หมายเหตุ |
|---|---|---|---|---|
| 2026-10-21 | RL | DOING | `75ed619` → merge `7526ecf` · run `39533128570` | production = 2.11.1 |
|  | B2 | READY |  |  |
|  | B3 | READY |  |  |
|  | B4 | GATED |  | รอนับหนึ่ง `FORM_PASSWORD` จาก P3 |

## จุดประสานงาน (กันทำงานซ้ำและกันแก้ไฟล์ทับกัน)

| งานร่วม | ส่วนของฉัน | ส่วนของอีกคน | ลำดับที่ต้องรักษา |
|---|---|---|---|
| B1 ↔ C1 | ส่ง spec status ของ `/api/login` (`401 invalid_password`, `429` + `Retry-After`) และคง `{token, ok}` เดิม | P2 แนบ header ฝั่ง client | ฉันส่ง spec ก่อน → P2 ค่อยโค้ด · ห้ามแก้ `src/lib/api.js` โดย P1 |
| B3 ↔ C5 | ทำ scrub ใน `deploy_r2.py` แล้ว deploy | P2 ตรวจ UI/รายงาน A4 | งานของฉันต้อง merge + deploy ก่อน แล้ว P2 จึงตรวจ |
| B4 | ขั้น ② `git rm --cached` + `.gitignore` | P3 ทำขั้น ① ตั้ง `FORM_PASSWORD` และขั้น ③ บันทึกเอกสาร | ห้ามทำขั้นของฉันก่อน P3 เสร็จ (รหัสใหม่ต้อง login ได้จริง) |
| B2 ↔ D3 | เขียน `--purge-stale-assets` + merge | P3 รันจริง (ต้องมี R2 keys + อนุญาต) | P3 ห้ามรันก่อนงานฉัน merge |
| B8 | spec endpoint + secret ฝั่ง Worker | P2 ทำ client adapter, P3 ส่งรายงาน D4 | รอข้อสรุปจาก P3 (D4) ก่อน |
| Release metadata | รวมเลขเวอร์ชัน + CHANGELOG + badge | P2/P3 ส่งตัวเลขและข้อความมาให้ฉัน | ห้าม P2/P3 แก้ `src/version.js`, `package.json`, `CHANGELOG.md` เอง |

ไฟล์ของเพื่อนร่วมทีม: [WORK_PLAN_P2.md](WORK_PLAN_P2.md) · [WORK_PLAN_P3.md](WORK_PLAN_P3.md) · ไฟล์รวม: [WORK_PLAN.md](WORK_PLAN.md) (P3 เป็นคน sync ตาราง §3)
