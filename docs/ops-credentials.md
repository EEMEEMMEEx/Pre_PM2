# Runbook: Credential & การหมุน (Rotate) — Pre-PM Survey Control Room

เอกสารนี้เป็นคู่มือปฏิบัติการสำหรับผู้ดูแลบัญชี `Thaidimaru` และทีมภาคสนาม · จัดทำโดย P3 (งาน `D1`, `D2`, `D6`)

## 0. หลักการ

1. **ห้ามฝัง credential ในโค้ดหรือ artifact ที่เผยแพร่สาธารณะ** (bundle, `dist/`, R2, เอกสาร)
2. แต่ละเครื่องใช้ **Fine-grained PAT ของตนเอง** เก็บในเบราว์เซอร์ (`localStorage` ผ่าน `GitHubTokenModal`) หรือใน `github-token.txt` (เครื่อง admin, ถูก `.gitignore` แล้ว)
3. ทุก credential ต้องมีวันหมดอายุ ≤ 90 วัน และมีทะเบียนใน `docs/pat-register.md`
4. เมื่อเกิดการรั่ว: **revoke ที่ต้นทางก่อน** แล้วจึงทำความสะอาด artifact ภายหลัง

## 1. Revoke credential ที่รั่ว (ทำโดยเจ้าของบัญชีเท่านั้น)

ต้องล็อกอินด้วยบัญชีที่เป็นเจ้าของ token (กรณีนี้คือ `Thaidimaru`) — ผู้ใช้อื่นทำได้เพียงตรวจยืนยันผล

1. เปิด https://github.com/settings/applications → **Authorized OAuth Apps** → เลือกรายการ **GitHub CLI** (หรือ app ที่ให้ grant) → เมนู `…` → **Revoke**
2. ตรวจว่าไม่มี credential เก่าค้างที่:
   - https://github.com/settings/tokens (classic)
   - https://github.com/settings/personal-access-tokens (fine-grained)
3. ที่เครื่องต้นทางที่เคยล็อกอิน CLI: `gh auth status` แล้ว `gh auth logout` (ลบเฉพาะในเครื่อง ไม่ได้เพิกถอนฝั่งเซิร์ฟเวอร์)

### Account hardening (ทำหลัง revoke)

- https://github.com/settings/sessions → **Sign out of all sessions**
- เปิด/ยืนยัน 2FA ที่ https://github.com/settings/security
- เปลี่ยนรหัสผ่านบัญชี และตรวจว่าอีเมลกู้คืนยังใช้งานได้
- ตรวจ audit log ของ repo (Settings → Security → Audit log ถ้ามี) และตรวจว่าไม่มี deploy key / webhook / workflow ที่ไม่รู้จัก

### การยืนยันผล (ทีมทำได้)

```powershell
python scripts/verify_revoked_token.py            # ตรวจทุกแหล่งที่รู้จัก
python scripts/verify_revoked_token.py --source r2-bundle-a
```

คาดหวัง `401 Bad credentials` ทุกแหล่ง · สคริปต์จะพิมพ์เฉพาะ fingerprint (sha256[:16]) ไม่พิมพ์ค่า token

## 2. Rotate: ออก PAT ใหม่ตามบทบาท

### 2.1 เครื่องภาคสนาม (เบราว์เซอร์)

1. เปิด https://github.com/settings/personal-access-tokens/new (ต้องล็อกอินบัญชีเจ้าของข้อมูล)
2. ตั้งค่า:
   - Token name: `prepm-field-<ชื่อเครื่องหรือผู้ใช้>`
   - Expiration: ไม่เกิน 90 วัน
   - Repository access: **Only select repositories** → `Thaidimaru/Pre_PM2`
   - Permissions: **Contents = Read and write** (ไม่ต้องให้สิทธิ์อื่น)
3. คัดลอกค่า แล้ววางในแอป: Navbar → ไอคอน GitHub → ตั้งค่า Token → วาง → **ทดสอบการเชื่อมต่อ** → ต้องขึ้น `เชื่อมต่อแล้ว (<user>)`
4. บันทึกลงทะเบียน `docs/pat-register.md` (ห้ามบันทึกค่าจริง ให้บันทึกชื่อ + วันหมดอายุ)

### 2.2 เครื่อง admin ที่รัน `database.py` (ถ้าต้องการให้เซิร์ฟเวอร์ commit เอง)

- สร้าง PAT แยกอีกอัน (อย่าใช้ร่วมกับเครื่องภาคสนาม) แล้วใส่เป็น:
  - ไฟล์ `github-token.txt` ที่ root ของ repo (ถูก `.gitignore`) หรือ
  - ตัวแปรสภาพแวดล้อม `GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_PAT`
- ตรวจผล: เปิดแอปที่รันจากเซิร์ฟเวอร์นี้ แล้วดูสถานะ GitHub บน Navbar หรือเรียก `GET /api/github-status`

### 2.3 GitHub Actions

- ไม่ต้องทำอะไร: workflow deploy ใช้เพียง R2 secrets (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) ผ่าน GitHub Secrets
- ห้ามเพิ่ม PAT ส่วนตัวของคนใดคนหนึ่งลงใน repository secrets ของ workflow ที่เผยแพร่ artifact สาธารณะ

## 3. ข้อห้าม

- ห้ามนำ **classic token ที่มี scope `repo`** ไปใส่ใน `src/**`, `dist/**` หรือ endpoint สาธารณะใด ๆ
- ห้าม commit ไฟล์ที่มีค่าจริง: `github-token.txt`, `r2-credentials.json`, `access-password.txt`
- ห้าม `git rm --cached` ไฟล์รหัสผ่านก่อนตั้งรหัสใหม่ให้ใช้งานได้ (จะทำให้ login พัง)
- ห้าม force push / rewrite history เพื่อพยายามลบ credential ออกจาก history — ให้ revoke แทน

## 4. ตารางเวลาและเจ้าของงาน

| กิจกรรม | ความถี่ | ผู้รับผิดชอบ |
|---|---|---|
| ตรวจวันหมดอายุ PAT (ทะเบียน) | ทุกเดือน | P3 |
| หมุน PAT เครื่องภาคสนาม | ก่อนหมดอายุ ≤ 14 วัน | P3 + ผู้ถือเครื่อง |
| ตรวจว่าไม่มี credential ใน artifact สาธารณะ | ทุกรอบ release (`D7`) | P3 |
| Revoke เมื่อ suspect ว่าหลุด | ทันที | เจ้าของบัญชี |
