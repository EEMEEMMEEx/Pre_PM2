---
name: scrutinize
description: >-
  Outsider end-to-end review of a plan, PR, or code change in NBTC Microwave
  Pre-PM Survey (Pre_PM2). Questions intent and simpler alternatives, traces real
  code paths (not just the diff), verifies static-host compatibility, GitHub sync
  concurrency, and data integrity. Output concise actionable findings in Thai for the user.
license: Internal project skill (no external redistribution terms)
---

# Scrutinize (Pre-PM2 Review & Audit)

ตรวจทานและประเมินแผนงาน, PR หรือการแก้ไขโค้ดใน **NBTC Microwave Pre-PM Survey (`Pre_PM2`)** จากมุมมองบุคคลภายนอก (Outsider Stance)

## สโคปและโดเมนใน Pre-PM2

| Domain | ไฟล์หลัก | จุดสำคัญที่ต้องตรวจสอบ |
|---|---|---|
| **Survey Entry Form** | `src/components/field/FieldVisitView.jsx` | การกรอกข้อมูล 7 ขั้นตอน, รหัสสถานี, พิกัด GPS, การบีบอัดรูปถ่าย |
| **Dashboard & Table** | `src/components/dashboard/RecentSurveys.jsx`, `DashboardView.jsx` | การกรอง/ค้นหา, pagination, batch selection, ETag polling |
| **A4 Report & PDF** | `src/components/export/SurveyReportModal.jsx`, `export_pdf.py` | การ render A4, memory leak ขณะสร้าง PDF 32+ สถานี, การพิมพ์ผ่าน Print dialog |
| **Sync & Storage** | `src/lib/api.js`, `public/sw.js` | Direct GitHub sync, SHA verification, 409 retry, Service Worker bypass rules |
| **Backend & Local API** | `database.py`, `DATABASE.xlsx`, `survey.db` | Parameterized SQL, static fallback, การจัดการ error codes |
| **Deploy & Workflow** | `deploy_r2.py`, `.github/workflows/deploy-r2.yml` | การ bump version (`src/version.js`), ไม่ส่ง secret ขึ้น CDN |

## Checklist การตรวจทาน (Review Checklist)

1. **Static-Host Compatibility**: ฟีเจอร์ใหม่ทำงานได้บน Cloudflare R2 (`r2.dev`) โดยไม่ต้องพึ่งพา Python backend หรือไม่?
2. **Concurrency & SHA**: การเขียน/ลบ GitHub มีการ serialize และดึง `sha` ล่าสุดหรือไม่?
3. **PWA & Cache Invalidation**: มีการแตะ `sw.js` หรือไม่? ถ้ามีได้ bump `CACHE_NAME` หรือยัง?
4. **SemVer & Single Source of Truth**: มีการ bump เวอร์ชันใน `src/version.js` และ `package.json` ตรงกันหรือไม่?
5. **UI & Accessibility**: ใช้ Lucide React (ห้าม emoji), มี Dark/Light support, Touch targets ≥ 44px
