# แผนงานรายบุคคล — P3 (Security ops / Data integrity / QA / Docs)

อ้างจาก WORK_PLAN.md · อัปเดตล่าสุด 2026-10-21 · production = bundle 2.11.1 (/api/sync-config = 404 แล้ว, /api/dashboard scrub แล้ว)

## ขอบเขตงานของฉัน

| อนุญาตให้สร้าง/แก้ (exclusive) | อ่านอย่างเดียว (ห้ามแก้) | ห้ามแก้ (ของคนอื่น) |
|---|---|---|
| docs/** (runbook, PII inventory, QA evidence) | data/surveys/*.json, survey.db, DATABASE.xlsx, AGWBS.xlsx, photos/ | database.py, deploy_r2.py, export_*.py, .github/workflows/** → **P1** |
| scripts/** (audit/read-only tooling) | src/**, public/** | src/lib/api.js, src/components/**, public/sw.js, index.html → **P2** |
| AGENTS.md, SECURITY.md, README.md (เฉพาะเนื้อหา, ไม่นับบรรทัด badge) | dist/** (ไว้ตรวจผล build) | .gitignore, **src/version.js, package.json, CHANGELOG.md** → **P1** |

กติกาที่ต้องปฏิบัติ: sync ก่อน git fetch upstream; git merge --ff-only upstream/main · branch track-d/<id> · งานของ P3 ส่วนใหญ่คือตรวจ/บันทึก/ดำเนินการที่ต้นทาง → ห้ามเขียนทับข้อมูลของแอป ทุกสคริปต์ต้อง read-only เว้นแต่ได้รับอนุมัติเป็นลายลักษณ์อักษร · การลบหรือแก้ data/** ต้องผ่าน Deletion Protocol (YES, DELETE <path>)

## ตารางสถานะของฉัน (สรุป)

| id | งาน | P | สถานะ | ผลลัพธ์ที่คาดหวัง (วัดได้) | พึงพา/ส่งผลถึง |
|---|---|---|---|---|---|
| D1 | ประสาน + ยืนยันผล revoke OAuth grant ของบัญชี Thaidimaru | P0 | BLOCKED (ต้องเจ้าของบัญชีลงมือ) | GET /user ด้วยค่าเดิม → 401 Bad credentials + บันทึกหลักฐาน | เปิดทาง D2 · ปิดรอยรั่วร่วมกับ B2/D3 |
| D2 | ออก Fine-grained PAT รายเครื่อง + ทะเบียน | P0 | READY | ทุกเครื่อง sync ได้จริง มีทะเบียน + คิว rotate ไม่เกิน 90 วัน | ลดงานช่วยของ P2 (C3) |
| D3 | จัดหา R2 credentials + รัน purge (ร่วมกับ B2) | P0 | BLOCKED (ยังไม่มี r2-credentials.json) | bundle เก่าที่เก็บ token → 404 ทั้ง 2 คีย์ + หลักฐาน before/after | ต้อง P1 ทำ B2 ก่อน |
| B4-1 | ตั้ง FORM_PASSWORD ใหม่ + ทดสอบ login (ขั้นแรกของ B4) | P0 | READY | login ผ่านด้วยรหัสใหม่, ค่าเดิมใช้ไม่ได้ | P1 ทำขั้น git rm --cached ต่อ |
| D4 | PII inventory ทั้งระบบ + ทางเลือกสถาปัตยกรรม | P1 | READY | เอกสาร docs/pii-inventory.md พร้อมข้อเสนอ 1 อัน (รวมผลถึง B8) | P1/P2 ใช้ประกอบการตัดสินใจ |
| D5 | Data reconciliation 3 แหล่ง (ไฟล์ ↔ SQLite ↔ GitHub) | P1 | READY | ตัวเลขเท่ากันต่อ release + ตรวจเจอ record ที่ฟื้นคืนกลับมาแสดง | ใช้เป็น QA gate ใน D7 |
| D6 | Runbook docs/ops-*.md + เติม SECURITY.md + อัปเดต debt checklist | P1 | READY | คนใหม่รับช่วงได้โดยไม่ต้องถาม | ทุก track อ้างอิง |
| D7 | QA gate ต่อ release (build/preview/headless/offline/multi-tab) | P1 | READY | ทุก PR มีหลักฐาน PASS/FAIL/NOT RUN ต่อเช็กลิสต์ | gate ก่อน merge |
| V1 | ตรวจรับ production หลัง deploy รอบใหม่ | P0 | BLOCKED (รอ deploy รอบใหม่) | endpoint สาธารณะไม่มี token/PII ต้องห้าม, shell ใหม่ทำงาน | นับเป็นส่วนของ D7 |
| D8 | ทดสอบ PAT หมดอายุ → แอปแจ้งเตือน ไม่ fail เงียบ | P2 | READY | modal เด้ง + ข้อมูลค้างในคิวไม่หาย + toast ไม่รัว | ร่วมกับ P2 (C3) |

## รายละเอียดงาน

### D1 (P0) revoke/rotate credential ที่ต้นทาง — งานที่ปิดช่องโหว่ตัวจริง
- ข้อเท็จจริงที่ตรวจแล้ว (2026-10-21): ค่าที่รั่วเป็น OAuth token (prefix gho_, 40 ตัว, fingerprint sha256[:16] = e505cad6f4cf5ae5) ของบัญชี **Thaidimaru** scopes gist, read:org, repo, workflow (= ชุด default ของ GitHub CLI) · **ยังใช้ได้อยู่** (GET /rate_limit → core limit 5000) · มีสิทธิ์ **admin** บน repo Pre_PM2, Pre_PM, Pre-PM
- ตำแหน่งที่ยังแกะค่าได้: bundle hashed บน R2 ที่ deploy ไม่เคยลบ (assets/index-Bo0eDo-P.js, assets/index-DOixsAy_.js ยัง HTTP 200) และ git history สาธารณะ (introduce 3e0baa7, remove 87020d4) · ตรวจแล้วว่า **GitHub code search ไม่ได้ index ค่านี้** (2 ผลลัพธ์เป็น repo ผู้อื่นที่บังเอิญมีสตริง 8 ตัวอักษรซ้ำกัน)
- ขั้นตอนสำหรับเจ้าของบัญชี: Settings → Applications → Authorized OAuth Apps → (GitHub CLI หรือ app ที่ให้ grant นี้) → **Revoke** · เช็ก Settings → tokens (classic + fine-grained) ว่ามีค่าอื่นค้างอีกไหม · Settings → sessions → Sign out of all sessions · เปิด 2FA · เปลี่ยนรหัสผ่านบัญชี · ที่เครื่องที่เคย gh auth login ให้ gh auth status แล้ว gh auth logout (อันนี้ลบเฉพาะฝั่งเครื่อง ไม่ใช่ฝั่งเซิร์ฟเวอร์)
- งานของฉัน: เตรียมหลักฐาน (fingerprint, sha ที่ introduce/remove, ผล probe) · หลัง revoke ให้รันตัวตรวจยืนยันว่าคาดหวัง 401 แล้วบันทึกลง docs/ops-credentials.md
- ข้อแม้สำคัญ: ต้องทำหลังจาก bundle 2.11.1 ขึ้น R2 แล้วเท่านั้น (สำเร็จแล้ว) และควรทำใกล้ ๆ กับ D2 เพราะช่วงรอยต่อเครื่อง field จะ sync ไม่ได้

### D2 (P0) ทะเบียน Fine-grained PAT ต่อเครื่อง
- ค่าที่ตั้ง: Fine-grained · Repository access = Only select repositories → Thaidimaru/Pre_PM2 · Permissions = Contents: **Read and write** (อย่างเดียว) · Expiration ไม่เกิน 90 วัน · ชื่อ prepm-field-<เครื่องหรือชื่อผู้ใช้>
- ตารางทะเบียน (สร้าง docs/pat-register.md): เครื่อง / ผู้ถือ / ชื่อ PAT / วันออก / วันหมดอายุ / สถานะ (Active, Revoked) / หมายเหตุ — **ห้ามบันทึกค่า token ในไฟล์หรือแชท ให้ใส่ *** แทน**
- วิธีแจกให้หน้างาน: เปิดแอป → ไอคอน GitHub บน Navbar → ตั้งค่า Token → วาง → ปุ่ม ทดสอบการเชื่อมต่อ → ต้องขึ้น เชื่อมต่อแล้ว (<user>)
- ผลลัพธ์ที่คาดหวัง: สุ่ม 2 เครื่องส่งข้อมูลแล้วมี commit 1 ครั้งต่อ record ใน data/surveys/ (ไม่มี commit ซ้ำ) และมีปฏิทิน rotate ล่วงหน้า
- ทำงานคู่กับ P2 (C3): ถ้า UX ยังทำให้ผู้ใช้สับสนระหว่างโหมดอ่านอย่างเดียวกับ token ผิด ให้ร่วมกันแก้

### D3 (P0) ปิดรอยรั่วบน R2 (ต้องอาศัย B2 ของ P1)
- ลำดับ: ① P1 merge B2 (--purge-stale-assets) → ② ฉันขอหรือรับ R2 credentials (env R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY หรือไฟล์ r2-credentials.json ที่ gitignore แล้ว) → ③ รัน python deploy_r2.py --dry-run เก็บผล → ④ ขออนุญาตแล้วรัน purge → ⑤ บันทึก before/after
- คำสั่งตรวจ: curl -sI https://pub-bc30fda8b7654fa09add325ab0f468e0.r2.dev/assets/index-Bo0eDo-P.js | head -1 (คาดหวัง 404) และเดียวกันกับ index-DOixsAy_.js
- gate: ทุกคำสั่งที่เขียน bucket ต้องได้รับอนุญาต · ห้ามรันโดยไม่มีผล --dry-run ประกอบ

### B4-1 (P0) ตั้ง FORM_PASSWORD ใหม่ (ขั้นแรกของงานร่วม B4)
- ทำ: กำหนดรหัสผ่านใหม่ (ไม่ใช้ค่าเดิมที่เปิดเผยไปแล้ว) · ตั้งบนเครื่อง admin (env หรือไฟล์ access-password.txt ท้องถิ่น) · ทดสอบ POST /api/login → 200 + token, รหัสผิด → 401
- จากนั้นหยุดและส่งต่อให้ P1 ทำ git rm --cached access-password.txt + แก้ .gitignore (ถ้าสลับลำดับ = ระบบ login พัง) · บันทึกวิธีใช้และตำแหน่งเก็บใน docs/ops-credentials.md

### D4 (P1) PII inventory และทางเลือกสถาปัตยกรรม
- สคริปต์: scripts/pii_scan.py (read-only, stdlib เท่านั้น) สแกน data/surveys/*.json, DATABASE.xlsx และ Fixed_Database*.xlsx, photos/, และ endpoint สาธารณะ (/api/dashboard, /api/database, /api/onedrive-status, /api/github-status)
- รายงานต่อฟิลด์: จำนวน record ที่มีค่า, ตัวอย่างรูปแบบแบบปกปิด (เช่น 08*—), ผู้ที่เข้าถึงได้ (public repo / CDN / ในเครื่อง), ความเสี่ยง
- ข้อมูลตั้งต้นที่วัดแล้ว: 172/178 record มี contactPhone และ contactName, 152/178 มี informantName, สถานี 181/197 มี contact_phone บน snapshot สาธารณะ, CDN snapshot เคยมีค่าติดต่อ 156/162 record (scrub แล้วรอบนี้)
- ทางเลือกที่ต้องชั่ง: (ก) ย้าย data/surveys ไป private repo + proxy read (ข) Worker proxy ทั้ง read และ write = B8 (ค) ลดหรือปกปิดฟิลด์ในไฟล์ที่ commit (ง) คงไว้แล้วยอมรับความเสี่ยง → เขียนเป็น docs/pii-inventory.md พร้อมข้อเสนอ 1 อัน
- ผลลัพธ์ที่คาดหวัง: ทีมมีข้อมูลตัดสินใจเรื่อง B8 และไม่โต้แย้งกันว่าข้อมูลอยู่ที่ไหนบ้าง

### D5 (P1) Data reconciliation 3 แหล่ง
- สคริปต์: scripts/audit_data.py เทียบ ① ไฟล์ใน data/surveys ② แถวใน survey.db (เปิดด้วย mode=ro&immutable=1) ③ listing บน GitHub contents/data/surveys?ref=main → รายงาน 3 กลุ่ม: ตรงกัน / ไฟล์หายแต่ยังอยู่ใน DB (startup prune จะลบ) / อยู่บน GitHub แต่ไม่มีในเครื่อง
- สถานะอ้างอิง ณ 2026-10-21: ไฟล์ 180, SQLite 184 (ต่างกัน 4 แถวที่ upstream ลบไฟล์แล้ว: PM-202610070225252-d5df, PM-202610111446282-b724, PM-202610150739107-0f3c, PM-202610150756126-bd86)
- gate: สคริปต์ต้องไม่มีคำสั่งเขียนข้อมูล · ถ้าต้องลบหรือ restore ให้เปิดงานใหม่ตาม Deletion Protocol
- ผลลัพธ์ที่คาดหวัง: ตัวเลข 180 = 180 = 180 ต่อ release และตรวจเจอ record ที่ฟื้นคืนกลับมาแสดงตั้งแต่วันแรก

### D6 (P1) เอกสารปฏิบัติการ
- สร้าง: docs/ops-credentials.md (D1/D2/B4 + ตารางทะเบียน PAT), docs/ops-local-server.md (env ทั้งหมด: HOST, PORT, REQUIRE_TOKEN, ALLOWED_ORIGINS, FORM_PASSWORD, GITHUB_TOKEN หรือ github-token.txt, วิธีเปิดให้ LAN ใช้อย่างปลอดภัย), docs/pii-inventory.md, docs/qa-evidence/<release>.md
- เติม: SECURITY.md (ตอนนี้ยังเป็น template ว่างของ GitHub — ใส่เวอร์ชันที่ซัพพอร์ตจริง 2.11.x, ช่องทางรายงานช่องโหว่, นโยบาย rotate credential)
- อัปเดต: AGENTS.md security debt checklist — เลื่อน [ ] → [x] เฉพาะข้อที่มีหลักฐานแล้ว (ที่ยังเหลือ: revoke, access-password, PII ใน repo สาธารณะ)
- ผลลัพธ์: ผู้ดูแลคนใหม่หรือ agent รับช่วงต่อได้โดยไม่ทำข้อมูลเสียหาย (ตาม skill handoff-safety)

### D7 (P1) QA gate ต่อ release (ใช้กับทุก track)
- เช็กลิสต์: npm run build exit 0 · ตรวจ bundle ว่ามีเลขเวอร์ชันถูกต้อง/ไม่มี token/ไม่มี sync-config · python -m py_compile ทุก .py · npm run test:py (เมื่อ P1 ทำ B5 เสร็จ) · python deploy_r2.py --dry-run exit 0 · headless Edge บน npm run preview (ไม่มี Uncaught) · ทดสอบ offline 1 รอบ + multi-tab BroadcastChannel · ลบ 1 record แล้วตรวจ 3 แหล่ง · แนบหลักฐาน
- หน้าที่ฉัน: รันรายการนี้ต่อ PR และต่อ release แล้วสรุปเป็น PASS/FAIL/NOT RUN พร้อมเหตุผล (Global Rules ข้อ 7)
- ผลลัพธ์ที่คาดหวัง: ไม่มี PR ที่ merge โดยไม่มีหลักฐานการตรวจ

### V1 (P0) ตรวจรับ production หลัง deploy รอบใหม่
- หลัง B2/B3/D3: /api/sync-config = 404 (ได้แล้ว) · assets/index-Bo0eDo-P.js และ index-DOixsAy_.js = 404 · /api/dashboard ไม่มี contactName, contactPosition, contactPhone, informantName, contactVillage · /api/onedrive-status ไม่มี Gmail และ local path · /api/github-status ไม่มี user · /index.html ชี้ bundle ใหม่ และ /dashboard เรนเดอร์ได้
- เก็บผลลง docs/qa-evidence/

### D8 (P2) ทดสอบกรณี PAT หมดอายุหรือถูกเพิกถอน
- เคส: (ก) PAT หมดอายุ (ข) PAT ที่ไม่มี scope Contents (ค) internet หลุดระหว่างส่งข้อมูล → ต้องเห็น modal หรือ toast ที่ตรงสาเหตุ, ข้อมูลยังอยู่ใน localStorage และซิงค์ต่อเมื่อกลับมาปกติ
- ทำงานคู่กับ P2 (C3) เพื่อปรับข้อความให้ตรง

## ลำดับการทำงานของฉัน (2 สัปดาห์แรก)

| สัปดาห์ | งาน | ต้องมีก่อน |
|---|---|---|
| 1 | B4-1 ตั้ง FORM_PASSWORD → ดัน D1 ให้เจ้าของบัญชี revoke → D2 ออก PAT ชุดแรก 2 เครื่อง | — |
| 1 | D6 (runbook + SECURITY.md) · เริ่มสคริปต์ D4 | — |
| 2 | D3 (เมื่อ B2 merge) · V1 · D5 audit · D7 ต่อเนื่อง | R2 credentials + สิทธิ์รัน |
| 2 | D8 | C3 จาก P2 เสร็จ |

## Checklist ก่อนปิดงานแต่ละ id
1. มีหลักฐาน (คำสั่ง + ผลลัพธ์ + วันที่) ในตารางความคืบหน้า และอัปเดตสถานะใน WORK_PLAN.md §3 (เฉพาะคอลัมน์ของ id นั้น)
2. ไม่มี secret ในเอกสารหรือสคริปต์ (ใส่ *** หรือ fingerprint สั้นแทน)
3. สคริปต์ใน scripts/ เป็น read-only และมี --help สั้น
4. ถ้าแตะข้อมูลจริง ต้องมี YES, DELETE/CHANGE <path> จากเจ้าของข้อมูล + สำรองก่อน

## บันทึกความคืบหน้า (เติมเอง)

| วันที่ | id | สถานะใหม่ | หลักฐาน | หมายเหตุ |
|---|---|---|---|---|
| 2026-10-21 | D1 | BLOCKED | fingerprint e505cad6f4cf5ae5 · /api/sync-config = 404 แต่ bundle เก่า = 200 | ต้องให้ Thaidimaru ลงมือ |
| 2026-10-21 | D3 | BLOCKED | ไม่มี r2-credentials.json บนเครื่องนี้ | รอ P1 ทำ B2 + ขอ credentials |
| | B4-1 | READY | | ต้องทำก่อน P1 เสมอ |

## จุดประสานงาน (กันทำงานซ้ำและกันแก้ไฟล์ทับกัน)

| งานร่วม | ส่วนของฉัน | ส่วนของอีกคน | ลำดับที่ต้องรักษา |
|---|---|---|---|
| B4 (3 ขั้น) | ① ตั้ง `FORM_PASSWORD` + ทดสอบ login · ③ บันทึกเอกสาร | P1 ทำ ② `git rm --cached` + `.gitignore` | ห้าม P1 ไปขั้น ② ก่อนฉันยืนยันว่า login ผ่าน |
| B2 ↔ D3 | รัน `--dry-run` → ขออนุญาต → รัน purge + เก็บ before/after | P1 เขียน flag แล้ว merge | ฉันรันได้หลัง merge เท่านั้น |
| B1 ↔ C1 | บันทึกผลทดสอบ 401/429 ของฝั่ง client ลง `docs/qa-evidence/` | P1 ให้ spec, P2 ใช้ | QA ของฉันรันทีหลัง C1 เสร็จ |
| B3 ↔ C5 ↔ V1 | ตรวจ endpoint สาธารณะหลัง deploy (V1) | P1 scrub, P2 ตรวจ UI | ลำดับ: P1 merge+deploy → P2 ตรวจ UI → ฉันตรวจ production |
| D4 ↔ B8 | ทำ PII inventory + ข้อเสนอทางเลือก | P1 spec proxy, P2 client adapter | ข้อเสนอของฉันคือ input การตัดสินใจ ไม่ใช่งานโค้ด |
| เอกสารรวม | ฉันเป็นคน sync ตาราง §3 ของ `WORK_PLAN.md` คนเดียว | P1 รวมเลขเวอร์ชัน/CHANGELOG | เจ้าของงานแก้ไฟล์ตัวเองก่อน แล้วฉันจึง sync |

ไฟล์ของเพื่อนร่วมทีม: [WORK_PLAN_P1.md](WORK_PLAN_P1.md) · [WORK_PLAN_P2.md](WORK_PLAN_P2.md) · ไฟล์รวม: [WORK_PLAN.md](WORK_PLAN.md)

ข้อห้ามเฉพาะตัวของ P3: ห้ามแก้อย่างใดใน `database.py`, `deploy_r2.py`, `src/**`, `public/**` — ทุกสิ่งที่ตรวจพบให้เปิดเป็นงานของ P1/P2 พร้อมหลักฐาน (กันแก้ไฟล์เดียวกันสองมือ)

### หมายเหตุเมื่อรันขนานกับอีก 2 track
- งานที่เริ่มได้ทันทีโดยไม่ชนใคร: D2 (ทะเบียน PAT), D4 (PII inventory), D5 (audit script), D6 (docs/), B4-1 (ตั้ง FORM_PASSWORD ฝั่งเครื่อง + ทดสอบ login)
- `README.md` มีสองมือ: ฉันแก้เฉพาะเนื้อหา ห้ามแตะบรรทัด 9 (badge เป็นของ P1) — เปิดเป็น PR แยกเพื่อไม่ให้ conflict
- ห้ามรันคำสั่งที่เขียน bucket/R2 ก่อน `B2` ของ P1 merge และต้องรอให้ deploy run ก่อนหน้าจบก่อน merge ถัดไป (workflow ตั้ง `cancel-in-progress: true` · `index.html` เคยถูกอัปโหลดที่ 2/28 ก่อน asset ที่ 9/28 → เสี่ยง site พังชั่วคราว)
- ทุกครั้งที่ deploy เสร็จ ให้รัน V1 + D7 แล้วจึง sync สถานะลงในตาราง §3 ของ `WORK_PLAN.md` (ฉันเป็นมือเดียวที่แก้ไฟล์รวม)
- งาน `D1` เป็นงานของคนละบัญชี (Thaidimaru) → ทีมอื่นทำได้แค่เตรียมหลักฐานกับตรวจยืนยันผล 401
