# Security Policy

## Supported Versions

โครงการนี้ deploy แบบ static (Cloudflare R2) จึงถือว่า **เฉพาะเวอร์ชันที่ deploy อยู่จริง** เท่านั้นที่ได้รับการสนับสนุน

| Version | Supported |
| --- | --- |
| 2.11.x (production) | ได้รับการสนับสนุน |
| 2.9.x – 2.10.x | ไม่สนับสนุน — โปรดอัปเดตเป็น 2.11.x |
| ต่ำกว่า 2.9.0 | ไม่สนับสนุน — มี credential ฝังอยู่ใน bundle |

## Reporting a Vulnerability

หากพบช่องโหว่หรือ credential รั่วไหล:

1. **ห้ามเปิดเป็น public issue** และห้ามส่งค่า credential ในช่องทางสาธารณะ
2. แจ้งผู้ดูแลบัญชี `Thaidimaru` โดยตรง พร้อมระบุ: endpoint หรือไฟล์, ขั้นตอนทำซ้ำ, และผลกระทบที่คาดว่าเป็น
3. หากเป็น credential: **revoke ที่ต้นทางก่อน** แล้วจึงแจ้งทีม (ดู `docs/ops-credentials.md`) และบันทึกหลักฐานตามรูปแบบใน `docs/qa-evidence/`

เป้าหมายการตอบสนอง: ยืนยันรับเรื่องภายใน 3 วันทำการ · ประเมินและ revoke ภายใน 24 ชั่วโมงหากเป็น credential

## Security Practices ของโครงการ

- **ไม่ฝัง credential ใน artifact สาธารณะ** — ห้ามใส่ token ใน `src/**`, `dist/**` หรือ endpoint ที่เผยแพร่บน R2 (ดู `AGENTS.md` §Security Gate)
- **การเขียนข้อมูลขึ้น GitHub** ใช้ Fine-grained PAT รายเครื่อง (Contents: Read and write เฉพาะ repo) เก็บในเบราว์เซอร์ของผู้ใช้
- **local server** (`database.py`) ผูก `127.0.0.1` เป็นค่าเริ่มต้น และต้องมี Bearer token เมื่อเรียกจากนอกเครื่อง (อายุ 8 ชั่วโมง)
- **CORS** สะท้อนเฉพาะ origin ที่อนุญาต ไม่ใช้ `*`
- **การหมุน credential** และทะเบียน PAT อยู่ใน `docs/ops-credentials.md` และ `docs/pat-register.md`
- **เครื่องมือตรวจสอบที่รันได้เอง** (read-only ทั้งหมด): `python scripts/verify_revoked_token.py`, `python scripts/pii_scan.py`, `python scripts/audit_data.py`
