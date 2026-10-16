---
name: handoff-safety
description: >-
  Guardrails for successor maintainers of NBTC Microwave Pre-PM Survey (Pre_PM2).
  Prevents worst-case ops: blind trust of AI, production R2 damage, secret leaks,
  unsafe git/deploy, overwriting master data, and "disable security to make it work".
  Apply proactively on every high-risk request (deploy, tokens, DB/Excel, git rewrite, mass delete).
license: Internal project skill (no external redistribution terms)
---

# Handoff Safety (Pre-PM2 Maintainers)

คู่มือความปลอดภัยสำหรับผู้ดูแลระบบและผู้พัฒนารับช่วงต่อใน **NBTC Microwave Pre-PM Survey (`Pre_PM2`)**

**สื่อสารกับผู้ใช้เป็นภาษาไทย** กระชับ ชัดเจน ไม่ใช้ศัพท์เทคนิคเกินจำเป็น

---

## Mission

1. **ปกป้องข้อมูลจริงในระบบ**:
   - ไฟล์สำรวจหน้างานบน GitHub Repository (`Thaidimaru/Pre_PM2` สาขา `main` โฟลเดอร์ `data/surveys/*.json`)
   - ฐานข้อมูล Master สถานี `DATABASE.xlsx`
   - ฐานข้อมูลเครื่อง Local `survey.db`
2. **ไม่ปิดระบบความปลอดภัยเพื่อให้ระบบทำงานได้ชั่วคราว** (ห้ามเปิดเผย Token หรือตัดการตรวจ SHA)
3. **อธิบายขอบเขตผลกระทบ (Blast Radius) เป็นภาษาไทยอย่างชัดเจนก่อนลงมือทำ**
4. เลือกทางเลือกที่**ผลกระทบเล็กที่สุดและย้อนกลับได้เสมอ** หากไม่แน่ใจให้หยุดถาม

---

## สัญญาณไฟประเมินความเสี่ยง (Risk Traffic Light)

### เขียว (Green) — ทำได้ทันทีพร้อมแจ้ง 1 บรรทัด
- อ่านไฟล์, ค้นหาโค้ด, ตรวจสอบ logic
- ทดสอบ build ด้วย `npm run build` หรือ `npm run preview`
- แก้ไข UI, ข้อความ, จัด styling ที่ไม่มีผลต่อ data flow บน local
- รันสคริปต์แบบ read-only

### เหลือง (Yellow) — หยุดอธิบายผลกระทบ รอผู้ใช้ยืนยัน
- แก้ไข logic ใน `src/lib/api.js` (การ sync ข้อมูล, ETag, retry)
- แก้ไข Service Worker `public/sw.js` (อาจทำให้เครื่องผู้ใช้ cache ไฟล์เก่า)
- Commit โค้ดลง git local
- แก้ไข schema ใน `database.py`

### แดง (Red) — Hard Deny ต้องได้รับคำยืนยันชัดเจนแบบระบุเป้าหมาย
- **Deploy ขึ้น Production R2**: รัน `python deploy_r2.py` หรือ push ที่ trigger GitHub Actions
- **Git Rewrite**: `git push --force`, `git reset --hard`, `git clean -fdx`
- **ลบหรือแก้ไขข้อมูลสำรวจ**: ลบไฟล์ใน `data/surveys/*.json` หรือเขียนทับ `DATABASE.xlsx`
- **Secrets**: ใส่ GitHub Token หรือ R2 Credentials ลงใน source code หรือส่งขึ้น R2

**รูปแบบคำยืนยันสำหรับระดับสีแดง (Red):**
```text
YES, RUN <action> ON <target> — เข้าใจผลกระทบ: <ระบุผลกระทบ 1 บรรทัด>
```

---

## รายการเหตุการณ์ร้ายแรงที่ต้องป้องกัน (Worst-case Catalog)

| สิ่งที่ต้องป้องกัน | พฤติกรรมที่ AI ต้องปฏิบัติ |
|---|---|
| ข้อมูลสำรวจบน GitHub หาย | ห้ามลบไฟล์ใน `data/surveys/` โดยไม่ผ่าน deletion protocol และห้าม commit ทับข้อมูลผู้อื่น |
| Master Data เสียหาย | ห้ามเขียนทับ `DATABASE.xlsx` โดยไม่มีไฟล์ backup `.bak` |
| Token รั่วไหล | ห้ามบันทึก token ลงใน git repository หรือ bundle ลงใน `dist/` สาธารณะ |
| Production รวนจาก Service Worker | ตรวจสอบว่า `sw.js` ไม่แคช request ข้าม origin หรือแคช blob URL |
| Force Push ลบประวัติ | ห้าม force push ไปยังสาขา `main` เพราะเครื่องหน้างานกำลัง sync ข้อมูลอยู่ตลอดเวลา |
