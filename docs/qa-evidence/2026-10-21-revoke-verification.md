# หลักฐานการตรวจสอบ — Revoke GitHub token ที่รั่ว (2026-10-21)

ส่วนหนึ่งของงาน **D1** (revoke/rotate credential) และ **D7** (QA gate ต่อ release) · ผู้รวบรวม: P3

## 1. บริบท

GitHub token ถูกฝังไว้ใน bundle ตั้งแต่ v2.8.1 (`3e0baa7` "embed system write token") และถูกถอดออกใน v2.9.0 (`87020d4`)
แต่ค่าดังกล่าวยังแกะได้จาก 3 แหล่งที่เผยแพร่สาธารณะ จนกว่าจะเพิกถอนที่ต้นทาง:

1. `assets/index-Bo0eDo-P.js` บน Cloudflare R2 (bundle เก่าที่ deploy ไม่เคยลบ)
2. `assets/index-DOixsAy_.js` บน Cloudflare R2
3. git history สาธารณะของ `Thaidimaru/Pre_PM2` (blob ของ commit `3e0baa7`)

## 2. ผลการตรวจสอบ (หลัง revoke)

ตรวจโดยสกัดค่าจากทั้ง 3 แหล่ง แล้วเรียก GitHub API ด้วยค่านั้น · **ไม่มีการบันทึกหรือพิมพ์ค่า token ในเอกสารนี้** ใช้ fingerprint SHA-256 แทน

| แหล่งที่ยังมีค่าฝังอยู่ | fingerprint (sha256[:16]) | `GET /user` | `GET /rate_limit` | `GET /repos/Thaidimaru/Pre_PM2` |
|---|---|---|---|---|
| R2 `assets/index-Bo0eDo-P.js` | `e505cad6f4cf5ae5` | **401 Bad credentials** | 401 | 401 |
| R2 `assets/index-DOixsAy_.js` | `e505cad6f4cf5ae5` | **401 Bad credentials** | 401 | 401 |
| `raw.githubusercontent.com/.../3e0baa7/src/lib/api.js` | `e505cad6f4cf5ae5` | **401 Bad credentials** | 401 | 401 |

สรุป: ค่าที่พบทั้งสามแหล่งเป็นค่าเดียวกัน และถูกเพิกถอนแล้ว → **การ revoke ครั้งเดียวครอบคลุมทุกสำเนา** ไม่มี token ที่สองตกค้าง

อ้างอิงสถานะก่อน revoke (2026-10-20): ค่าเดียวกันให้ `GET /user` = `200` (`login=Thaidimaru`) และ core rate limit 5000

## 3. ผลกระทบต่อ production (ตรวจหลัง revoke)

| endpoint | ผล | ความหมาย |
|---|---|---|
| `/dashboard` | 200 | SPA ยังเปิดได้ |
| `/sw.js` | 200 | service worker ยังเสิร์ฟ |
| `/api/database` | 200 | station snapshot ปกติ |
| `/api/github-status` | 200 | snapshot ปกติ (CI ตอบ `configured:false`) |
| `/api/dashboard` | 200 · `updatedAt=2026-10-21T02:28:34Z` · 180 รายการ · ไม่มี `contactName`/`contactPosition`/`contactPhone`/`informantName` | snapshot ใหม่ + scrub PII แล้ว |
| `/api/sync-config`, `/sync-config` | **404** | ไม่มี endpoint แจก credential อีก |
| `assets/index-Bo0eDo-P.js`, `assets/index-DOixsAy_.js` | 200 | ไฟล์เก่ายังดาวน์โหลดได้ แต่ค่าข้างในใช้ไม่ได้แล้ว (เป็นงานทำความสะอาด `B2`/`D3`) |

## 4. ตรวจความสะอาดของ artifact ปัจจุบัน

- bundle ที่ใช้งานจริง `assets/index-CiDv2Xla.js` (925,348 bytes) = เวอร์ชัน `2.11.1`, ไม่พบ credential จริง, ไม่มีการอ้าง `sync-config`
- พบ pattern `ghp_…` 1 จุดใน bundle → ตรวจแล้วเป็น placeholder `ghp_xxxxxxxxxxxxxxxxxxxx` จาก `src/components/auth/GitHubTokenModal.jsx:184` ไม่ใช่ค่าจริง
- สแกน `src/`, `public/`, `scripts/`, `docs/` เพื่อหาค่าเดิม (`jII8mkLO`, `xC9h6gyN0n`, `gho_…`) → 0 hits
- public read path ยังทำงานโดยไม่ต้องใช้ token (`raw.githubusercontent.com` โหลดไฟล์สำรวจได้ 200) และ gh session ของทีม (`EEMEEMMEEx`) ไม่ได้รับผลกระทบ

## 5. งานที่ยังคงเหลือ (ไม่ใช่ส่วนของ P3)

- เครื่องหน้างานต้องมี Fine-grained PAT ของตนเองจึงจะเขียนขึ้น GitHub ได้ (งาน `D2`)
- ลบ bundle เก่า 2 ไฟล์บน R2 (งาน `B2` ของ P1 + `D3`) — ตอนนี้เป็นความสะอาดของ bucket ไม่ใช่ความปลอดภัย
- Account hardening ของบัญชี `Thaidimaru`: Sign out ทุก session, ยืนยัน 2FA, เปลี่ยนรหัสผ่าน (runbook อยู่ใน `docs/ops-credentials.md`)

## 6. วิธีตรวจซ้ำ (สำหรับผู้ตรวจคนถัดไป)

```powershell
# 1) ยืนยันว่าค่าเดิมใช้ไม่ได้แล้ว (ไม่ต้องพิมพ์ค่า token)
python scripts/verify_revoked_token.py --source r2-bundle-a
# 2) ยืนยันว่า endpoint แจก credential ไม่มีอยู่แล้ว
curl -s -o NUL -w "%{http_code}" https://pub-bc30fda8b7654fa09add325ab0f468e0.r2.dev/api/sync-config   # คาดหวัง 404
```

> หมายเหตุ: `scripts/verify_revoked_token.py` คือสคริปต์อ่านค่า fingerprint จากแหล่งที่กำหนดแล้วทดสอบกับ GitHub API (read-only)
