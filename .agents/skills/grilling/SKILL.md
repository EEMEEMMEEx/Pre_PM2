---
name: grilling
description: >-
  Interview the user one question at a time to stress-test a plan or design before
  implementation in NBTC Microwave Pre-PM Survey (Pre_PM2). Walk the design tree
  branch-by-branch until shared understanding. Trigger on /grill, "grill this plan",
  "stress-test this design" — NOT for PR/diff review (scrutinize) or debugging (debug-mantra).
disable-model-invocation: true
license: Internal project skill (no external redistribution terms)
---

# Grilling (Pre-PM2 Design Stress-Test)

การสัมภาษณ์แบบเจาะลึกทีละข้ออย่างเป็นระบบเพื่อทดสอบความสมบูรณ์ของ **แผนงานหรือการออกแบบก่อนลงมือเขียนโค้ดจริง** ในโปรเจกต์ **NBTC Microwave Pre-PM Survey (`Pre_PM2`)**

## กฎของโปรเจกต์ที่ต้องยึดถือเสมอ (Repo Rules)

- **ความปลอดภัย**: ปฏิบัติตาม [`AGENTS.md`](../../../AGENTS.md); ห้ามเปิดเผย secrets/tokens ในโค้ดหรือคอมมิต
- **Frontend Standard**: React 18 + Vite 5 + Tailwind CSS v4; รองรับทั้ง Dark Mode และ Light Mode; ห้ามใช้ emoji เป็นไอคอน ให้ใช้ `lucide-react` เท่านั้น
- **UI Primitives**: เรียกใช้ `@/components/ui/*` (Radix UI) ก่อน custom markup เสมอ
- **Data Flow & Cloud**: ตระหนักถึง Tri-Cloud architecture (Cloudflare R2 static hosting, GitHub repo สำหรับ live data, Local SQLite/OneDrive สำหรับรูปขนาดใหญ่)
- **Version Control**: ทุกฟีเจอร์หรือการแก้ไขต้องอัปเดตเวอร์ชันผ่าน `src/version.js` และ `package.json` เสมอ

## Protocol

1. ถามผู้ใช้ทีละ 1 คำถาม พร้อมระบุคำตอบที่ AI แนะนำและเหตุผลสั้นๆ
2. หากคำถามใดสามารถหาคำตอบได้จากใน Codebase ให้ค้นหาใน Codebase ก่อนถาม
3. เมื่อตกลงรายละเอียดครบทุกสาขาแล้ว ให้สรุปแผนงานก่อนเข้าสู่ขั้นตอนลงมือปฏิบัติ
