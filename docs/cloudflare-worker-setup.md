# คู่มือการติดตั้งและใช้งาน Cloudflare Worker API Proxy (ทางเลือกที่ 2)

## สรุปภาพรวม (Overview)
ระบบศูนย์ควบคุมและบันทึกข้อมูลแบบสำรวจ **NBTC Microwave Pre-PM Control Room** ได้รับการออกแบบสถาปัตยกรรม **ทางเลือกที่ 2 (Cloudflare Worker Edge API Proxy)** เพื่อแก้ปัญหาการจัดการสิทธิ์หลายผู้ใช้งาน (Multi-User Access):

- **Zero-Client Token Configuration**: ผู้ดูแลระบบกำหนด GitHub Token เพียงครั้งเดียวในระบบคลาวด์ Cloudflare Worker Secrets
- **ทุกคนบันทึกข้อมูลได้ทันที**: เครื่องของผู้ใช้งานทุกคน (คอมพิวเตอร์สำนักงาน, โน้ตบุ๊ก, แท็บเล็ต, สมาร์ตโฟนภาคสนาม) สามารถบันทึก, แก้ไข, และลบข้อมูลแบบสำรวจขึ้น GitHub ได้ทันที โดยไม่ต้องตั้งค่า Token บนเครื่องของตนเอง
- **ความปลอดภัยสูงสุด**: Token จะถูกเข้ารหัสและจัดเก็บอยู่บน Cloudflare Edge Network เท่านั้น ไม่มีการเปิดเผยลงในไฟล์สาธารณะบน Cloudflare R2 ทำให้ไม่ถูกตรวจจับและเพิกถอนสิทธิ์จาก GitHub Secret Scanning

---

## สถาปัตยกรรมระบบ (Architecture Flow)

```
[ ผู้ใช้งาน / ทีมภาคสนาม ] 
        │
        │ (1) กรอกแบบสำรวจ & กดบันทึก (ไม่ต้องใส่ Token)
        ▼
[ เว็บแอป Pre-PM (Cloudflare R2 / Pages) ]
        │
        │ (2) POST /api/save (ส่งข้อมูลแบบสำรวจ)
        ▼
[ Cloudflare Worker Edge API Proxy ] ─── (3) ดึง GITHUB_TOKEN จาก Cloudflare Secrets
        │
        │ (4) เขียนไฟล์ data/surveys/<recordId>.json ผ่าน GitHub Contents API
        ▼
[ GitHub Repository: Thaidimaru/Pre_PM2 ] ─── (5) CI/CD & ข้อมูลสำรวจอัปเดตเรียลไทม์
```

---

## ขั้นตอนการติดตั้งและ Deploy (มี 2 วิธีให้เลือก)

### วิธีที่ 1: Deploy ผ่านคำสั่ง Wrangler CLI (แนะนำ - รวดเร็วที่สุดใน 1 นาที)

1. เปิด Terminal ในโฟลเดอร์โปรเจกต์ `Pre_PM2/`
2. เข้าสู่ระบบ Cloudflare (หากยังไม่เคยล็อกอิน):
   ```bash
   npx wrangler login
   ```
3. รันคำสั่ง deploy worker:
   ```bash
   npx wrangler deploy
   ```
   *เมื่อเสร็จสิ้น ระบบจะแสดง URL ของ Worker เช่น `https://pre-pm-api.<subdomain>.workers.dev`*

4. ใส่ GitHub Personal Access Token เข้าสู่ Worker Secret:
   ```bash
   npx wrangler secret put GITHUB_TOKEN
   ```
   *(ระบบจะให้วาง Token ของคุณลงไป แล้วกด Enter)*

5. นำ URL ที่ได้ (เช่น `https://pre-pm-api.<subdomain>.workers.dev`) ไปใส่ในช่อง **Cloudflare Worker API URL** ในหน้าต่างการตั้งค่าระบบ (Settings Modal) และกดปุ่ม **"บันทึก Worker URL"**

---

### วิธีที่ 2: Deploy ผ่านหน้าเว็บ Cloudflare Dashboard (ไม่ต้องติดตั้งเครื่องมือใดๆ)

1. เข้าสู่ [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. ในเมนูด้านซ้าย เลือก **Compute (Workers) > Workers & Pages**
3. คลิกปุ่ม **Create application** ➔ เลือกแท็บ **Workers** ➔ คลิก **Create Worker**
4. ตั้งชื่อ Worker เช่น `pre-pm-api` ➔ คลิกปุ่ม **Deploy**
5. ในหน้าถัดไป คลิกปุ่ม **Edit code** (Quick Editor):
   - ลบโค้ดเริ่มต้นทั้งหมดในโปรแกรมแก้ไขออก
   - เปิดไฟล์ [`worker/index.js`](../worker/index.js) ในโปรเจกต์นี้ คัดลอกโค้ดทั้งหมดมาวาง
   - คลิกปุ่ม **Save and deploy** ที่มุมขวาบน
6. กลับมาที่หน้ารายละเอียดของ Worker ➔ เลือกแท็บ **Settings** ➔ เมนู **Variables and Secrets**
7. ภายใต้หัวข้อ **Secrets** คลิกปุ่ม **Add**:
   - Variable name: `GITHUB_TOKEN`
   - Value: วาง Fine-grained PAT ของคุณ (ที่เปิดสิทธิ์ `Contents: Read and write` สำหรับ Repo `Thaidimaru/Pre_PM2`)
   - คลิก **Save and deploy**
8. คัดลอก URL ของ Worker (เช่น `https://pre-pm-api.your-subdomain.workers.dev`) นำไปวางในหน้าต่างตั้งค่าระบบของเว็บ Pre-PM แล้วกด **"บันทึก Worker URL"**

---

## การเปิดใช้งานในเว็บแอปพลิเคชัน Pre-PM

1. เปิดเว็บแอปพลิเคชัน Pre-PM ในเบราว์เซอร์
2. คลิกที่ปุ่มไอคอน **ฟันเฟือง (Settings Gear)** บนแถบ Header ด้านบน
3. ป้อนรหัสผ่านความปลอดภัย: `Welcomw@01` แล้วกด **"ยืนยันและปลดล็อก"**
4. ในแท็บ **GitHub Sync**:
   - นำ Worker URL ที่ deploy แล้วมาวางในช่อง **Cloudflare Worker API URL**
   - กดปุ่ม **"ทดสอบ Worker"** เพื่อตรวจสอบว่า Worker ออนไลน์และเชื่อมต่อกับ GitHub สำเร็จ
   - กดปุ่ม **"บันทึก Worker URL"**
5. **เสร็จสมบูรณ์!** ระบบจะแสดงแถบสถานะสีเขียว:
   > **เชื่อมต่อผ่าน Cloudflare Worker API** `[ผู้ใช้ทุกคนซิงค์ได้อัตโนมัติ]`

---

## คำถามที่พบบ่อย (FAQ)

### 1. เครื่องของเจ้าหน้าที่คนอื่นต้องใส่ Token หรือกรอกรหัสผ่านไหม?
**ไม่ต้องเลยครับ!** ผู้ใช้งานภาคสนามทุกคนสามารถเปิดใช้งานเว็บไซต์ กรอกแบบสำรวจ และกดบันทึกได้ทันที ข้อมูลจะถูกส่งผ่าน Edge Proxy และคอมมิตขึ้น GitHub ส่วนกลางให้โดยอัตโนมัติ

### 2. รหัสผ่านความปลอดภัย (Welcomw@01) ใช้ทำอะไร?
ใช้สำหรับปกป้องการเข้าถึงหน้าต่าง **การตั้งค่าระบบ (Settings Modal)** เท่านั้น เพื่อป้องกันไม่ให้ผู้ใช้งานทั่วไปแก้ไข URL หรือลบการตั้งค่าศูนย์กลาง โดยจะไม่ขัดจังหวะการบันทึกข้อมูลภาคสนามใดๆ ทั้งสิ้น

### 3. หากมีแบบสำรวจที่บันทึกค้างไว้ในเครื่องก่อนหน้านี้ จะเกิดอะไรขึ้น?
ระบบมีระบบซิงค์พื้นหลังอัตโนมัติ (`syncPendingLocalSurveys`) ทันทีที่มีการเชื่อมต่อกับ Cloudflare Worker สำเร็จ รายการสำรวจที่ค้างอยู่ในเครื่องจะถูกส่งขึ้น GitHub ทันที
