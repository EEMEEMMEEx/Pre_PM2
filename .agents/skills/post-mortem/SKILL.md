---
name: post-mortem
description: >-
  Write the canonical engineering record of a fixed bug in NBTC Microwave Pre-PM Survey (Pre_PM2)
  with a Tri-Cloud (R2/GitHub/SQLite) + PWA lens. Use after debug-mantra lands a validated fix.
  Trigger when the user asks for post-mortem, RCA, root cause writeup, or to document a fixed bug.
license: Internal project skill (no external redistribution terms)
---

# Post-Mortem / RCA (Pre-PM2)

บันทึกทางวิศวกรรมสำหรับสรุปสาเหตุและการแก้ไขข้อบกพร่อง (Root Cause Analysis) ใน **NBTC Microwave Pre-PM Survey (`Pre_PM2`)**

เขียนขึ้น**หลัง**จากแก้ไขบักและผ่านการทดสอบยืนยันผล (Verification) เรียบร้อยแล้ว

## เลเยอร์และสถาปัตยกรรมที่เกี่ยวข้อง

- **Frontend SPA**: React 18, Vite 5, Tailwind CSS v4, Radix UI
- **PDF & Export Engine**: Client-side jsPDF + html2canvas (`SurveyReportModal.jsx`) และ Server-side ReportLab (`export_pdf.py`)
- **Data Sync & Concurrency**: GitHub Contents API (`data/surveys/*.json`), ETag commit polling, BroadcastChannel, localStorage
- **Offline & PWA**: Service Worker (`public/sw.js`), Cache API
- **Local Server**: Python 3 `http.server`, SQLite (`survey.db`), `DATABASE.xlsx`

## โครงสร้างเอกสาร Post-Mortem

1. **Summary (สรุปภาพรวม)**: ปัญหาคืออะไร, สาเหตุคืออะไร, แก้ไขอย่างไรใน 1-2 ประโยค ระบุ version และ layer ที่ได้รับผลกระทบ
2. **Symptom (อาการที่พบ)**: ข้อความ error, HTTP Status Code (เช่น 401, 404, 409), พฤติกรรมที่ผิดปกติบนหน้าจอ
3. **Root Cause (สาเหตุที่แท้จริง)**: อธิบายกลไกที่ทำให้เกิดความผิดพลาด พร้อมอ้างอิงไฟล์และบรรทัดโค้ดที่เกี่ยวข้อง
4. **Fix & Implementation (แนวทางแก้ไข)**: สรุปโค้ดที่ปรับปรุง และมาตรการป้องกันไม่ให้เกิดซ้ำ
5. **Verification (การทดสอบยืนยัน)**: วิธีการและผลการทดสอบยืนยันว่าปัญหาได้รับการแก้ไขแล้วจริง
