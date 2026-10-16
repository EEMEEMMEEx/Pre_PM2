---
name: debug-mantra
description: >-
  Four-mantra debugging discipline for NBTC Microwave Pre-PM Survey (Pre_PM2) —
  reproduce, trace the fail path, falsify the hypothesis, cross-reference every
  breadcrumb. Apply in order before proposing any fix. Trigger on /debug-mantra
  and proactively whenever debugging starts — user reports a bug, says something
  is broken/throwing/failing, asks to debug/diagnose/investigate, or pastes a
  stack trace or error log.
license: Internal project skill (no external redistribution terms)
---

# Debug Mantra

Four-step discipline for any debug session in **NBTC Microwave Pre-PM Survey (`Pre_PM2`)** — React 18 SPA + Vite 5 + Tailwind v4 + Python 3 SQLite backend (`database.py` port 8765) + Cloudflare R2 + GitHub Contents API sync. Internalize the mantra, then apply in order. After the four steps, use the **Pre-PM2 addendum** below for flow-specific repro and knobs.

## Mantra (internal — do not paraphrase)

> **Mantra:**
> 1. **First is reproducibility.** Can the issue be reproduced reliably?
> 2. **Know the fail path.** Debugger first; then source trace + knob enumeration; then in-code instrumentation.
> 3. **Question your hypothesis.** What would disprove it?
> 4. **Every run is a breadcrumb.** Cross-reference all of them.

## How to open a debug session (user-facing)

- **Default** (bug report, stack trace, "ไม่ work"): Apply all four steps silently. In the first response, use **one short line** only — e.g. "เริ่มจาก repro ก่อน" — then begin work. Do **not** paste the full mantra block unless asked.
- **`/debug-mantra`**: Recite the mantra block **verbatim** as the first thing in the response, then begin work.
- **User says "skip the mantra"**: Skip any recital; still apply all four steps silently.

---

## 1. Reproduce reliably

Build a runnable repro before anything else.

- **Reliable repro** → capture exact steps, inputs, and environment as a runnable artifact: failing command, browser console sequence, network request HAR, or curl.
- **Flaky repro** → the bug is not yet debuggable. Raise the rate first: repeat trigger, check race condition (e.g. concurrent GitHub write / ETag polling), narrow timing window.
- **No repro at all** → stop. Say so explicitly. Ask for console logs, network response bodies, or permission to instrument. Do **not** proceed to hypothesise.

Target: a fast, deterministic pass/fail signal.

## 2. Know the fail path

Once reproducible, find *where* the code breaks and *what stops it from breaking*. Try in this order:

1. **Browser Console & Network Inspector**: Check status codes (401 on R2 POST, 404/409 on GitHub API, 503 proxy error). Check if Service Worker intercepted the request.
2. **Source trace + knob enumeration**: Trace data flow from user interaction → `src/lib/api.js` → GitHub Contents API / Python backend / localStorage. List every knob that can influence outcome (tokens, ETags, offline flags, SW cache).
3. **In-code instrumentation**: Log statements at suspected fail site (tag with `[DBG-xxxx]` for easy cleanup).

## 3. Falsify the hypothesis

When a candidate root cause surfaces, scrutinise it **before** testing it.

- Does it actually explain the symptom end-to-end? (e.g. Is PDF failure really `revokeObjectURL` or a 404 from a server-only endpoint on static R2?)
- What is the simplest **proof**? What is the cleanest **disproof**?
- Run the **disproof first**. If the hypothesis dies, you saved yourself from chasing a phantom.
- Generate 2–3 ranked hypotheses. Avoid anchoring on the first plausible idea.

## 4. Every run is a breadcrumb

Maintain a running **ledger** of every experiment in this session:
- Update ledger after each test: what changed, what happened, what it ruled in or out.
- If any past observation contradicts the new hypothesis, refine or discard it.

---

## Pre-PM2 Addendum (หลัง mantra — สำหรับ Pre_PM2 เท่านั้น)

### 0. กฎ repo (บังคับ)

- **Security Gate** ([`AGENTS.md`](../../../AGENTS.md)): ห้าม log / dump / commit — GitHub tokens (`ghp_***`), R2 credentials, `access-password.txt`, ข้อมูลรูป base64 ขนาดใหญ่
- Instrumentation ใช้ prefix `[DBG-xxxx]` — ลบออกก่อนจบงาน
- สถาปัตยกรรมเป็น Tri-Cloud: Static hosting (R2) + Live Data (GitHub `data/surveys/`) + Local/OneDrive (SQLite, photos)

### 1. ระบุ flow + layer ก่อน reproduce

| อาการ / สัญญาณ | Layer | จุดเริ่ม trace |
|---|---|---|
| ดาวน์โหลด PDF ไม่ได้ / "File wasn't available" | PDF Export | `SurveyReportModal.jsx` (client jsPDF) vs `database.py:1184` (`/api/export-pdf`) |
| POST `/api/*` ได้ 401 หรือ 404 | Static Hosting / API | Host คือ `r2.dev` (static bucket — ไม่มี POST backend) หรือ local dev (`:8765`) |
| GET 404 แล้ว PUT 409 บน GitHub | Concurrency Sync | `src/lib/api.js`: `submitSurvey` ชนกับ `syncPendingLocalSurveys` หรือหลาย tab |
| แก้ไข/ลบ แล้วได้ 409 Conflict | Cache Stale SHA | `public/sw.js` cache GitHub GET request ส่ง sha เก่าให้ client |
| สำรวจแล้วข้อมูลไม่ขึ้น Dashboard | Local / GitHub Sync | `localStorage.getItem('nbtc_pre_pm_saved_surveys')` vs `fetchSurveysFromGitHubClient` |
| รัน local แล้วต่อ API ไม่ได้ (503) | Dev Proxy | `vite.config.mjs` proxy error — เช็คว่ารัน `python database.py` (:8765) หรือยัง |

### 2. Repro มาตรฐานของ Pre-PM2

| ประเภท | คำสั่ง / วิธีทดสอบ |
|---|---|
| Frontend Dev | `npm run dev` (เปิด `http://localhost:5173`, proxy ไปที่ port 8765) |
| Static Preview (เหมือน R2) | `npm run build && npm run preview` (ทดสอบแบบ static ไม่มี Python server) |
| Local Python Server | `python database.py` (รัน API + SQLite :8765) |
| Official A4 PDF Export | `python export_pdf.py` หรือคลิกพรีวิว A4 ใน `SurveyReportModal` |
| Photo Export | `python export_photos.py` |
| Syntax & Build Verification | `npm run build` |

### 3. Knobs ที่มักพลาด (flip ทีละตัว)

- **Host Environment**: `window.location.hostname` เป็น localhost vs `pub-*.r2.dev`
- **GitHub Token**: `localStorage.getItem('nbtc_github_token')` vs `initSystemToken()` vs `github-token.txt`
- **Service Worker Cache**: `CACHE_NAME` ใน `sw.js` ยังไม่ bump หรือ SW intercept requests ที่เป็น `blob:` หรือ `api.github.com`
- **BroadcastChannel**: การเปิดหลาย tab พร้อมกัน trigger sync ซ้ำผ่าน `nbtc_pre_pm_sync_channel`
- **Data Model**: `recordId` format `PM-<timestamp>-<hex4>`, ฟิลด์ nested `fields.station` vs root `station`

### 4. ห้ามแก้ก่อน repro + falsify

- **ห้าม** สันนิษฐานว่า endpoint ฝั่ง server ทำงานได้บน production R2 (r2.dev รองรับเฉพาะ GET/HEAD ของ static files)
- **ห้าม** แก้ปัญหา 409 ด้วยการ force overwrite หรือข้ามการตรวจสอบ sha
- **ห้าม** ลบไฟล์สำรวจใน `data/surveys/*.json` เพื่อแก้ปัญหา sync ติดขัด
