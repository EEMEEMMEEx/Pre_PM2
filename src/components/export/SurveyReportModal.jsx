import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, FileText, Download, Loader2 } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import { findStationByName } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import nbtcLogo from '@/assets/images/nbtc-logo-dashboard.png';
import forthLogo from '@/assets/images/forth-logo.png';

/**
 * Robust photo source resolver for base64 data, dataUrl, or server url
 */
export function getPhotoSrc(photo) {
  if (!photo) return '';
  if (photo.dataUrl) return photo.dataUrl;
  if (photo.data) {
    return photo.data.startsWith('data:')
      ? photo.data
      : `data:${photo.type || photo.contentType || 'image/jpeg'};base64,${photo.data}`;
  }
  return photo.url || '';
}

/**
 * StationA4ReportPages - Renders Page 1 (Official Form) and Page 2+ (Photo Appendix)
 * for a single survey record adhering to Thai government standard A4 (TH Sarabun New).
 */
function StationA4ReportPages({ surveyData = {}, stationIndex = 0, totalStations = 1 }) {
  const page1Ref = useRef(null);

  // Extract recorded survey fields
  const rawFields = surveyData.fields || {};
  const fields = { ...surveyData, ...rawFields };

  // Station info fallback from master database
  const stationName =
    fields.station ||
    fields.village ||
    fields.stationSelect ||
    surveyData.station ||
    'สถานีวิทยุคมนาคม NBTC Microwave';
  const stationLookup = findStationByName(stationName);

  const province = fields.province || surveyData.province || stationLookup?.province || '';
  const district = fields.district || surveyData.district || stationLookup?.district || '';
  const subdistrict = fields.subdistrict || surveyData.subdistrict || stationLookup?.subdistrict || '';
  const installationPlace =
    fields.installationPlace ||
    fields.installation_place ||
    stationLookup?.installation_place ||
    stationLookup?.installationPlace ||
    '';
  const equipmentPlace =
    fields.equipmentPlace ||
    fields.equipment_place ||
    stationLookup?.equipment_place ||
    stationLookup?.equipmentPlace ||
    installationPlace ||
    '-';

  // Format full location text
  const locationParts = [];
  if (installationPlace && installationPlace !== '-') {
    locationParts.push(installationPlace);
  }
  if (subdistrict) {
    const cleanSub = subdistrict.replace(/^ต\./, '').trim();
    if (cleanSub) locationParts.push(`ต.${cleanSub}`);
  }
  if (district) {
    const cleanDist = district.replace(/^อ\./, '').trim();
    if (cleanDist) locationParts.push(`อ.${cleanDist}`);
  }
  if (province) {
    const cleanProv = province.replace(/^จ\./, '').trim();
    if (cleanProv) locationParts.push(`จ.${cleanProv}`);
  }
  const locationText =
    locationParts.length > 0 ? locationParts.join(' ') : fields.village || fields.station || '-';

  // Visit Date & Time
  const rawDate = fields.visitDate || fields.visit_date || fields.savedAt || surveyData.savedAt;
  let visitDateStr = '-';
  if (rawDate) {
    try {
      const dateObj =
        typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
          ? new Date(`${rawDate}T12:00:00`)
          : new Date(rawDate);
      if (!isNaN(dateObj.getTime())) {
        visitDateStr = dateObj.toLocaleDateString('th-TH', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      }
    } catch {}
  }
  if (visitDateStr === '-') {
    visitDateStr = new Date().toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  const rawTime = fields.visitTime || fields.visit_time;
  const visitTime = rawTime
    ? `${rawTime} น.`
    : fields.savedAt || surveyData.savedAt
    ? new Date(fields.savedAt || surveyData.savedAt).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
      }) + ' น.'
    : '-';

  const recordId =
    surveyData.recordId ||
    fields.recordId ||
    fields.record_id ||
    `PM-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 15)}`;

  // Contact Info
  const contactName =
    fields.contactName ||
    fields.contact_name ||
    stationLookup?.contact_name ||
    fields.informantName ||
    fields.informant_name ||
    '-';
  const contactPosition =
    fields.contactPosition ||
    fields.contact_position ||
    stationLookup?.contact_position ||
    'เจ้าของพื้นที่ / ผู้ดูแลสถานี';
  const contactVillage =
    fields.contactVillage ||
    fields.contact_village ||
    (subdistrict ? `ต.${subdistrict.replace(/^ต\./, '')}` : '-');
  const contactPhone =
    fields.contactPhone ||
    fields.contact_phone ||
    fields.phone ||
    fields.tel ||
    stationLookup?.contact_phone ||
    stationLookup?.contactPhone ||
    '-';

  // Permission
  const permit = fields.permit || surveyData.permit || 'อนุญาต';
  const isPermitted = permit === 'อนุญาต' || permit === 'on' || permit === 'true' || permit === true;
  const accessLimit = fields.accessLimit || fields.access_limit || 'ไม่มีข้อจำกัด';

  // Equipment & Operational Assessment Fields
  const radioStatus = fields.radioStatus || fields.radio_status || 'ปกติ';
  const isRadioNormal = radioStatus === 'ปกติ';

  const receiveStatus = fields.receiveStatus || fields.receive_status || 'ปกติ';
  const isReceiveNormal =
    receiveStatus === 'ปกติ' || receiveStatus === 'ไม่พบ' || receiveStatus === 'ไม่พบปัญหา';

  const transmitStatus = fields.transmitStatus || fields.transmit_status || 'ปกติ';
  const isTransmitNormal =
    transmitStatus === 'ปกติ' || transmitStatus === 'ไม่พบ' || transmitStatus === 'ไม่พบปัญหา';
  const isSignalNormal = isReceiveNormal && isTransmitNormal;

  const powerStatus = fields.powerStatus || fields.power_status || 'ปกติ';
  const isPowerNormal =
    powerStatus === 'ปกติ' || powerStatus === 'ไม่มี' || powerStatus === 'ไม่มีปัญหา';

  const batteryStatus = fields.batteryStatus || fields.battery_status || 'ปกติ';
  const isBatteryNormal =
    batteryStatus === 'ปกติ' || batteryStatus === 'ไม่มี' || batteryStatus === 'ไม่มีปัญหา';

  const groundStatus = fields.groundStatus || fields.ground_status || 'ปกติ';
  const isGroundNormal =
    groundStatus === 'ปกติ' ||
    groundStatus === 'ไม่มี' ||
    groundStatus === 'ไม่มีปัญหา' ||
    groundStatus === 'ไม่พบ';

  const userProblem = fields.userProblem || fields.user_problem || 'ไม่พบปัญหาเพิ่มเติม';

  // Environment & Site Conditions
  const siteCondition =
    fields.siteCondition || fields.site_condition || 'สภาพพื้นที่ปกติ พร้อมสำหรับการปฏิบัติงาน';
  const antennaCondition =
    fields.antennaCondition || fields.antenna_condition || 'สภาพเสาและสายอากาศอยู่ในเกณฑ์ปกติ';
  const workObstacle =
    fields.workObstacle || fields.work_obstacle || 'ไม่มีอุปสรรคในการปฏิบัติงาน';

  // Summary & Signatures
  const summary =
    fields.summary ||
    fields.userSummary ||
    'เจ้าของพื้นที่ให้ความร่วมมือในการเข้าตรวจเยี่ยมและตรวจสอบสภาพระบบอุปกรณ์เป็นอย่างดี';
  const informantName =
    fields.informantName || fields.informant_name || (contactName !== '-' ? contactName : '');
  const operatorName = fields.operatorName || fields.operator_name || 'วิศวกรผู้ควบคุมงาน';

  // Photo attachments with full base64 data resolution
  const rawPhotos =
    Array.isArray(surveyData.photos) && surveyData.photos.length > 0
      ? surveyData.photos
      : Array.isArray(fields.photos) && fields.photos.length > 0
      ? fields.photos
      : [];

  const [resolvedPhotos, setResolvedPhotos] = useState(() => {
    return rawPhotos.map((p, idx) => {
      const src = getPhotoSrc(p);
      return {
        ...p,
        id: p.id || idx + 1,
        name: p.name || `photo_${idx + 1}.jpg`,
        dataUrl: src.startsWith('data:') ? src : (p.dataUrl || null),
        url: src || (p.id ? `/api/photos/${p.id}` : ''),
      };
    });
  });

  // Re-sync when surveyData changes
  useEffect(() => {
    setResolvedPhotos(
      rawPhotos.map((p, idx) => {
        const src = getPhotoSrc(p);
        return {
          ...p,
          id: p.id || idx + 1,
          name: p.name || `photo_${idx + 1}.jpg`,
          dataUrl: src.startsWith('data:') ? src : (p.dataUrl || null),
          url: src || (p.id ? `/api/photos/${p.id}` : ''),
        };
      })
    );
  }, [surveyData]);

  // Preload photos from GitHub raw JSON if missing base64 or running on static hosting
  useEffect(() => {
    const hasMissingDataUrl = resolvedPhotos.some((p) => !p.dataUrl);
    const isStaticHost =
      typeof window !== 'undefined' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1';

    if (recordId && recordId !== '-' && (hasMissingDataUrl || isStaticHost)) {
      const ghUrl = `https://raw.githubusercontent.com/Thaidimaru/Pre_PM2/main/data/surveys/${encodeURIComponent(recordId)}.json`;
      fetch(ghUrl)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.photos) && data.photos.length > 0) {
            setResolvedPhotos((prev) =>
              prev.map((photo, idx) => {
                const match =
                  data.photos[idx] ||
                  data.photos.find((p) => p.name === photo.name) ||
                  data.photos[0];
                if (match && match.data) {
                  const b64 = match.data.startsWith('data:')
                    ? match.data
                    : `data:${match.type || match.contentType || 'image/jpeg'};base64,${match.data}`;
                  return {
                    ...photo,
                    dataUrl: b64,
                    url: b64,
                  };
                }
                return photo;
              })
            );
          }
        })
        .catch(() => {});
    }
  }, [recordId]);

  // Split photos into chunks of 6 per appendix page
  const PHOTOS_PER_PAGE = 6;
  const photoPages = [];
  for (let i = 0; i < resolvedPhotos.length; i += PHOTOS_PER_PAGE) {
    photoPages.push(resolvedPhotos.slice(i, i + PHOTOS_PER_PAGE));
  }
  const totalPages = 1 + photoPages.length;

  return (
    <div className="w-full flex flex-col items-center gap-6 print:block print:w-full print:m-0 print:p-0">
      {/* ========================================================================= */}
      {/* PAGE 1: Official Survey Report */}
      {/* ========================================================================= */}
      <div
        ref={page1Ref}
        className="a4-sheet font-sarabun text-black bg-white shadow-2xl border border-slate-300 rounded-sm w-[210mm] min-h-[297mm] h-[297mm] mx-auto text-[13px] leading-tight relative box-border flex flex-col justify-between print:m-0 print:border-none print:shadow-none"
        style={{
          fontFamily: "'Sarabun', 'Noto Sans Thai', 'Inter', system-ui, sans-serif",
          color: '#000000',
          backgroundColor: '#ffffff',
          padding: '8mm 12mm 8mm 12mm',
        }}
      >
        <div>
          {/* Header with Logos & Project Title */}
          <div className="flex items-center justify-between pb-1.5 border-b-2 border-black mb-1.5">
            {/* Left Logo - NBTC */}
            <div className="w-24 shrink-0 flex items-center justify-start">
              <img
                src={nbtcLogo}
                alt="NBTC Logo"
                style={{ height: '72px', width: 'auto' }}
                className="object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>

            {/* Document Titles */}
            <div className="flex-1 text-center px-2">
              <h1 className="text-[15.5px] font-bold tracking-tight text-black leading-tight">
                โครงการเพิ่มประสิทธิภาพระบบโครงข่ายสื่อสารด้วยอุปกรณ์ทวนสัญญาณผ่านคลื่นความถี่สูง (SHF)
              </h1>
              <p className="text-[13px] font-semibold text-neutral-800 leading-snug">
                เพื่อสนับสนุนการปฏิบัติราชการและแก้ไขปัญหาให้กับประชาชนในพื้นที่ห่างไกล
              </p>
              <p className="text-[12px] font-medium text-neutral-700 leading-normal">
                สัญญาเลขที่ 8680228 ลงวันที่ 23 กรกฎาคม 2568
              </p>
            </div>

            {/* Right Logo - FORTH */}
            <div className="w-24 shrink-0 flex items-center justify-end">
              <img
                src={forthLogo}
                alt="FORTH Logo"
                style={{ height: '32px', width: 'auto' }}
                className="object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          </div>

          {/* Metadata Bar */}
          <div className="flex justify-between items-center text-[12px] pb-1.5 mb-1.5 border-b border-black text-black">
            <div>
              <span className="font-bold">รหัสรายการ:</span>{' '}
              <span className="font-mono font-semibold">{recordId}</span>
            </div>
            <div>
              <span className="font-bold">วันที่ตรวจเยี่ยม:</span> <span>{visitDateStr}</span>
            </div>
          </div>

          {/* Section 1: ข้อมูลสถานีและสถานที่ติดตั้ง */}
          <div className="mb-2">
            <div className="bg-neutral-100 font-bold border border-black px-2.5 py-1 text-[13.5px] text-black">
              1. ข้อมูลสถานีและสถานที่ติดตั้ง (Station Information & Location)
            </div>
            <table className="w-full border-collapse border border-t-0 border-black text-[13px] leading-[1.3]">
              <tbody>
                <tr>
                  <td className="border border-black py-1 px-3 w-[28%] font-bold bg-neutral-50/80">
                    ชื่อสถานีวิทยุคมนาคม
                  </td>
                  <td className="border border-black py-1 px-3 w-[72%] font-bold text-black" colSpan={3}>
                    {stationName}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black py-1 px-3 font-bold bg-neutral-50/80">
                    สถานที่ติดตั้งอุปกรณ์
                  </td>
                  <td className="border border-black py-1 px-3 text-black" colSpan={3}>
                    {locationText}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black py-1 px-3 font-bold bg-neutral-50/80">
                    จุดติดตั้งตู้เครื่องวิทยุ
                  </td>
                  <td className="border border-black py-1 px-3 text-black" colSpan={3}>
                    {equipmentPlace}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section 2: ข้อมูลเจ้าของพื้นที่และผลการตรวจเยี่ยม */}
          <div className="mb-2">
            <div className="bg-neutral-100 font-bold border border-black px-2.5 py-1 text-[13.5px] text-black">
              2. ข้อมูลเจ้าของพื้นที่และการอนุญาต (Owner & Site Permission)
            </div>
            <table className="w-full border-collapse border border-t-0 border-black text-[13px] leading-[1.3]">
              <tbody>
                <tr>
                  <td className="border border-black py-1 px-3 w-[28%] font-bold bg-neutral-50/80">
                    ชื่อผู้ติดต่อ / ผู้ให้ข้อมูล
                  </td>
                  <td className="border border-black py-1 px-3 w-[36%] text-black">{contactName}</td>
                  <td className="border border-black py-1 px-3 w-[16%] font-bold bg-neutral-50/80">
                    ตำแหน่ง / หน้าที่
                  </td>
                  <td className="border border-black py-1 px-3 w-[20%] text-black">
                    {contactPosition}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black py-1 px-3 font-bold bg-neutral-50/80">
                    สังกัด / ชุมชน / หมู่บ้าน
                  </td>
                  <td className="border border-black py-1 px-3 text-black">{contactVillage}</td>
                  <td className="border border-black py-1 px-3 font-bold bg-neutral-50/80">
                    เบอร์โทรศัพท์
                  </td>
                  <td className="border border-black py-1 px-3 text-black font-mono">
                    {contactPhone}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black py-1 px-3 font-bold bg-neutral-50/80">
                    ผลการประสานงานเข้าพื้นที่
                  </td>
                  <td className="border border-black py-1 px-3 text-black font-semibold" colSpan={3}>
                    {isPermitted ? (
                      <span className="text-black font-bold">
                        [ / ] อนุญาตให้เข้าพื้นที่ปฏิบัติงาน
                      </span>
                    ) : (
                      <span className="text-black font-bold">
                        [ X ] ไม่อนุญาตให้เข้าพื้นที่ปฏิบัติงาน
                      </span>
                    )}
                    <span className="ml-4 font-normal text-black">
                      (เงื่อนไข / ข้อจำกัด: {accessLimit})
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section 3: ผลการประเมินสภาพระบบวิทยุ */}
          <div className="mb-2">
            <div className="bg-neutral-100 font-bold border border-black px-2.5 py-1 text-[13.5px] text-black">
              3. ผลการตรวจสอบและประเมินสภาพระบบวิทยุคมนาคม (System Assessment)
            </div>
            <table className="w-full border-collapse border border-t-0 border-black text-[13px] leading-[1.3] text-black">
              <thead>
                <tr className="bg-neutral-50 text-black font-bold text-center">
                  <th className="border border-black py-1 px-1.5 w-[8%]">ลำดับ</th>
                  <th className="border border-black py-1 px-3 w-[42%] text-left">
                    รายการประเมินและตรวจสอบ
                  </th>
                  <th className="border border-black py-1 px-2 w-[15%]">สถานะ</th>
                  <th className="border border-black py-1 px-3 w-[35%] text-left">รายละเอียด / ข้อสังเกต</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-black py-1 px-1.5 text-center text-black">1</td>
                  <td className="border border-black py-1 px-3 text-black">
                    สภาพเครื่องวิทยุคมนาคม ( Radio Transceiver )
                  </td>
                  <td className="border border-black py-1 px-2 text-center font-semibold text-black">
                    <span className="text-black font-bold">{isRadioNormal ? 'ปกติ' : 'ไม่ปกติ'}</span>
                  </td>
                  <td className="border border-black py-1 px-3 text-black">
                    {isRadioNormal ? 'ไฟสถานะเครื่องปกติ ไม่มีไฟเตือน Alarm' : 'พบไฟเตือนความผิดปกติ'}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black py-1 px-1.5 text-center text-black">2</td>
                  <td className="border border-black py-1 px-3 text-black">
                    สัญญาณรับ-ส่งวิทยุ ( RF Signal / Link )
                  </td>
                  <td className="border border-black py-1 px-2 text-center font-semibold text-black">
                    <span className="text-black font-bold">{isSignalNormal ? 'ปกติ' : 'ไม่ปกติ'}</span>
                  </td>
                  <td className="border border-black py-1 px-3 text-black">
                    {isSignalNormal ? 'รับ-ส่งสัญญาณเสถียร ไม่พบสัญญาณรบกวน' : 'สัญญาณอ่อน/มีสัญญาณรบกวน'}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black py-1 px-1.5 text-center text-black">3</td>
                  <td className="border border-black py-1 px-3 text-black">
                    ระบบจ่ายไฟฟ้าหลัก ( AC Power Supply )
                  </td>
                  <td className="border border-black py-1 px-2 text-center font-semibold text-black">
                    <span className="text-black font-bold">{isPowerNormal ? 'ปกติ' : 'ไม่ปกติ'}</span>
                  </td>
                  <td className="border border-black py-1 px-3 text-black">
                    {isPowerNormal ? 'แรงดันไฟฟ้าปกติ เบรกเกอร์ทำงานสมบูรณ์' : 'กระแสไฟฟ้าขัดข้อง/แรงดันตก'}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black py-1 px-1.5 text-center text-black">4</td>
                  <td className="border border-black py-1 px-3 text-black">
                    ระบบไฟฟ้าสำรอง / แบตเตอรี่ ( Backup Battery )
                  </td>
                  <td className="border border-black py-1 px-2 text-center font-semibold text-black">
                    <span className="text-black font-bold">{isBatteryNormal ? 'ปกติ' : 'ไม่ปกติ'}</span>
                  </td>
                  <td className="border border-black py-1 px-3 text-black">
                    {isBatteryNormal ? 'แรงดันแบตเตอรี่พร้อมใช้งาน' : 'แบตเตอรี่เสื่อมสภาพ/แรงดันต่ำ'}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black py-1 px-1.5 text-center text-black">5</td>
                  <td className="border border-black py-1 px-3 text-black">ระบบกราวด์ ( Ground System )</td>
                  <td className="border border-black py-1 px-2 text-center font-semibold text-black">
                    <span className="text-black font-bold">{isGroundNormal ? 'ปกติ' : 'ไม่ปกติ'}</span>
                  </td>
                  <td className="border border-black py-1 px-3 text-black">
                    {isGroundNormal ? 'ระบบกราวด์สมบูรณ์ ต่อลงดินเรียบร้อย' : 'ระบบกราวด์มีปัญหา/หลุดหลวม'}
                  </td>
                </tr>
                <tr>
                  <td
                    className="border border-black py-1 px-3 text-center font-bold bg-neutral-50/80 text-black"
                    colSpan={2}
                  >
                    ปัญหาเพิ่มเติมที่ผู้ใช้งานแจ้ง
                  </td>
                  <td className="border border-black py-1 px-3 text-black" colSpan={2}>
                    {userProblem}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section 4: สภาพแวดล้อมหน้างาน */}
          <div className="mb-2">
            <div className="bg-neutral-100 font-bold border border-black px-2.5 py-1 text-[13.5px] text-black">
              4. สภาพแวดล้อมหน้างานและอาคารสถานที่ (Site Environmental & Physical Conditions)
            </div>
            <table className="w-full border-collapse border border-t-0 border-black text-[13px] leading-[1.3]">
              <tbody>
                <tr>
                  <td className="border border-black py-1 px-3 w-[35%] font-bold bg-neutral-50/80">
                    สภาพพื้นที่ติดตั้งอุปกรณ์
                  </td>
                  <td className="border border-black py-1 px-3 w-[65%] text-black">{siteCondition}</td>
                </tr>
                <tr>
                  <td className="border border-black py-1 px-3 font-bold bg-neutral-50/80">
                    สภาพเสาอากาศและสายอากาศ (มองเห็นจากพื้น)
                  </td>
                  <td className="border border-black py-1 px-3 text-black">
                    {antennaCondition}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black py-1 px-3 font-bold bg-neutral-50/80">
                    อุปสรรคและข้อจำกัดในการปฏิบัติงาน
                  </td>
                  <td className="border border-black py-1 px-3 text-black">{workObstacle}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section 5: สรุปผลการตรวจเยี่ยม */}
          <div className="mb-1.5">
            <div className="bg-neutral-100 font-bold border border-black px-2.5 py-0.5 text-[13.5px] text-black">
              5. สรุปผลการตรวจเยี่ยมและข้อคิดเห็น (Survey Summary & Recommendations)
            </div>
            <div className="border border-t-0 border-black p-2.5 text-[12.5px] leading-relaxed min-h-[60px] bg-white text-black">
              {summary}
            </div>
          </div>
        </div>

        {/* Footer for Page 1 */}
        <div className="pt-1.5 mt-1 border-t border-black/30 flex justify-between items-center text-[11px] text-neutral-600">
          <span>
            โครงการบำรุงรักษาเชิงป้องกันล่วงหน้า (Pre-Preventive Maintenance: Pre-PM) — {stationName}
            {totalStations > 1 && ` [สถานีที่ ${stationIndex + 1}/${totalStations}]`}
          </span>
          <span>หน้า 1 จาก {totalPages}</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PAGE 2+: Photo Documentation Appendix (Rendered if photos exist) */}
      {/* ========================================================================= */}
      {photoPages.map((pagePhotos, pageIndex) => (
        <div
          key={pageIndex}
          className="a4-sheet font-sarabun text-black bg-white shadow-2xl border border-slate-300 rounded-sm w-[210mm] min-h-[297mm] h-[297mm] mx-auto text-[13px] leading-tight relative box-border flex flex-col justify-between print:m-0 print:border-none print:shadow-none"
          style={{
            fontFamily: "'Sarabun', 'Noto Sans Thai', 'Inter', system-ui, sans-serif",
            color: '#000000',
            backgroundColor: '#ffffff',
            padding: '12mm 15mm 12mm 15mm',
          }}
        >
          <div>
            {/* Header for Photo Appendix */}
            <div className="flex items-center justify-between pb-2 border-b-2 border-black mb-3">
              <div className="w-32 shrink-0 flex items-center justify-start">
                <img
                  src={nbtcLogo}
                  alt="NBTC Logo"
                  style={{ height: '48px', width: 'auto' }}
                  className="object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
              <div className="flex-1 text-center px-2">
                <h2 className="text-[16px] font-bold text-black tracking-tight leading-tight">
                  ภาพถ่ายประกอบการเข้าตรวจเยี่ยมเจ้าของพื้นที่ (Pre-PM)
                </h2>
                <p className="text-[12.5px] text-neutral-800">
                  สถานี: <span className="font-bold text-black">{stationName}</span> | รหัสรายการ:{' '}
                  <span className="font-mono font-bold">{recordId}</span> | วันที่: {visitDateStr}
                </p>
              </div>
              <div className="w-32 shrink-0 flex items-center justify-end">
                <img
                  src={forthLogo}
                  alt="FORTH Logo"
                  style={{ height: '24px', width: 'auto' }}
                  className="object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            </div>

            {/* Grid of photos (max 6 per page: 2 columns x 3 rows) */}
            <div className="grid grid-cols-2 gap-3.5 pt-1">
              {pagePhotos.map((photo, idx) => {
                const globalIndex = pageIndex * PHOTOS_PER_PAGE + idx + 1;
                const photoSrc = getPhotoSrc(photo);
                return (
                  <div
                    key={photo.id || idx}
                    className="border border-black p-2 bg-white rounded-sm flex flex-col items-center"
                  >
                    <div className="h-44 w-full flex items-center justify-center bg-neutral-50 overflow-hidden mb-1.5 border border-neutral-200 rounded-sm">
                      <img
                        src={photoSrc}
                        alt={photo.name}
                        className="max-h-44 w-auto max-w-full object-contain"
                        loading="eager"
                        onError={(e) => {
                          // Fallback to GitHub raw survey JSON if relative /api/photos/ failed
                          if (recordId && recordId !== '-' && (!photoSrc || !photoSrc.startsWith('data:'))) {
                            fetch(`https://raw.githubusercontent.com/Thaidimaru/Pre_PM2/main/data/surveys/${encodeURIComponent(recordId)}.json`)
                              .then((r) => (r.ok ? r.json() : null))
                              .then((data) => {
                                const match =
                                  data?.photos?.[globalIndex - 1] ||
                                  data?.photos?.find((p) => p.name === photo.name);
                                if (match && match.data) {
                                  const b64 = match.data.startsWith('data:')
                                    ? match.data
                                    : `data:${match.type || 'image/jpeg'};base64,${match.data}`;
                                  e.currentTarget.src = b64;
                                }
                              })
                              .catch(() => {});
                          }
                        }}
                      />
                    </div>
                    <div className="w-full flex items-center justify-between text-[12px] text-neutral-900 px-1">
                      <span className="font-bold font-sarabun text-black">รูปที่ {globalIndex}</span>
                      <span
                        className="font-mono text-[11px] text-neutral-600 truncate max-w-[180px]"
                        title={photo.name}
                      >
                        {photo.name || `photo_${globalIndex}.jpg`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer for Photo Appendix Page */}
          <div className="pt-1.5 mt-2 border-t border-black/30 flex justify-between items-center text-[11px] text-neutral-600">
            <span>
              การบำรุงรักษาเชิงป้องกันล่วงหน้า (Pre-Preventive Maintenance: Pre-PM) — {stationName}
              {totalStations > 1 && ` [สถานีที่ ${stationIndex + 1}/${totalStations}]`}
            </span>
            <span>
              หน้า {pageIndex + 2} จาก {totalPages}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * SurveyReportModal - Pre-PM Survey A4 Printable Report Modal
 * Supports both single station report and multi-station batch printable report.
 */
export function SurveyReportModal({ isOpen, onClose, surveyData = {}, surveys = [] }) {
  const { isDark } = useTheme();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(null);

  // Manage body class for zero-offset print layout and scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('survey-modal-open');
    } else {
      document.body.classList.remove('survey-modal-open');
    }
    return () => {
      document.body.classList.remove('survey-modal-open');
    };
  }, [isOpen]);

  const activeSurveys =
    Array.isArray(surveys) && surveys.length > 0
      ? surveys
      : surveyData && Object.keys(surveyData).length > 0
      ? [surveyData]
      : [];

  const isMulti = activeSurveys.length > 1;
  const firstSurvey = activeSurveys[0] || {};
  const firstStation = firstSurvey.station || firstSurvey.fields?.station || 'สถานี';
  const firstRecord = firstSurvey.recordId || firstSurvey.fields?.recordId || '';

  // Native Print Action (triggers Chrome/Edge print dialog)
  const handlePrint = () => {
    window.print();
  };

  // รอให้รูปทั้งหมดใน sheet โหลด/ถอดรหัสเสร็จก่อน capture (กันรูปหายใน PDF)
  const waitForSheetImages = async (root) => {
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(
      images.map((img) => {
        if (img.complete && img.naturalWidth > 0) {
          return typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve();
        }
        return new Promise((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, 8000);
        });
      })
    );
  };

  // ดาวน์โหลด blob: <a download> ปกติ, iOS standalone ใช้ Web Share API ก่อน
  const downloadPdfBlob = async (blob, filename) => {
    const isIosStandalone =
      typeof navigator !== 'undefined' &&
      /iP(hone|ad|od)/.test(navigator.userAgent) &&
      (window.navigator.standalone === true ||
        (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches));

    if (isIosStandalone) {
      try {
        const file = new File([blob], filename, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return;
        }
      } catch (shareErr) {
        if (shareErr && shareErr.name === 'AbortError') return;
      }
      const shareUrl = URL.createObjectURL(blob);
      window.open(shareUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(shareUrl), 60000);
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // Direct Client-Side PDF Generation and Download
  const handleDownloadPdfDirect = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    setPdfProgress({ current: 0, total: 0 });

    try {
      if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
        await document.fonts.ready.catch(() => {});
      }

      const { jsPDF } = await import('jspdf');
      // html2canvas-pro รองรับสี oklch() ของ Tailwind v4 (html2canvas 1.4.1 parse ไม่ได้)
      const html2canvas = (await import('html2canvas-pro')).default;
      const reportArea = document.getElementById('printable-report-area');
      if (!reportArea) throw new Error('ไม่พบพื้นที่รายงาน');

      const sheets = Array.from(reportArea.querySelectorAll('.a4-sheet'));
      if (sheets.length === 0) throw new Error('ไม่พบหน้ารายงาน');

      setPdfProgress({ current: 0, total: sheets.length });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const CHUNK_SIZE = 8;
      for (let i = 0; i < sheets.length; i++) {
        if (i > 0) pdf.addPage('a4', 'portrait');
        const sheet = sheets[i];
        await waitForSheetImages(sheet);

        const canvas = await html2canvas(sheet, {
          scale: 1.5,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 1200,
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');

        // คืนหน่วยความจำ canvas ทันที (32 สถานี × หลายหน้า บนมือถือ)
        canvas.width = 0;
        canvas.height = 0;

        setPdfProgress({ current: i + 1, total: sheets.length });

        // yield ระหว่างชุด เพื่อไม่ให้ main thread/หน่วยความจำตึง
        if ((i + 1) % CHUNK_SIZE === 0 && i + 1 < sheets.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      const cleanName = (firstStation || 'STATION').replace(/[\s/\\?%*:|"<>]/g, '_');
      const filename = isMulti
        ? `SURVEY_SELECTED_${activeSurveys.length}_STATIONS.pdf`
        : `SURVEY_REPORT_${cleanName}_${firstRecord || ''}.pdf`;

      const blob = pdf.output('blob');
      await downloadPdfBlob(blob, filename);
    } catch (err) {
      const recordIds = activeSurveys.map((s) => s.recordId || s.fields?.recordId).filter(Boolean);
      console.error('[PDF]', recordIds, err);
      toast.error(
        `สร้างไฟล์ PDF ไม่สำเร็จ: ${err?.message || 'unknown error'}\nลองใช้ปุ่ม "พิมพ์ / บันทึก PDF" แทน`
      );
    } finally {
      setIsGeneratingPdf(false);
      setPdfProgress(null);
    }
  };

  if (!isOpen || activeSurveys.length === 0) return null;

  return createPortal(
    <div
      id="survey-report-modal-portal"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-2 sm:p-4 backdrop-blur-md overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:overflow-visible print:block"
    >
      {/* Modal Container */}
      <div
        className={cn(
          'relative flex max-h-[94vh] w-full max-w-5xl flex-col rounded-2xl border shadow-2xl overflow-hidden my-auto transition-colors print:max-h-none print:w-full print:border-none print:shadow-none print:rounded-none print:bg-white print:static print:overflow-visible print:m-0 print:p-0',
          isDark ? 'border-blue-500/30 bg-slate-900 text-slate-200' : 'border-slate-300 bg-white text-slate-800'
        )}
      >
        {/* Modal Action Header (Hidden in Print) */}
        <div
          className={cn(
            'flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b px-4 sm:px-6 py-3.5 no-print print:hidden transition-colors',
            isDark ? 'border-slate-800 bg-slate-950/90' : 'border-slate-200 bg-slate-50'
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors',
                isDark
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                  : 'bg-sky-100 text-sky-600 border-sky-200'
              )}
            >
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className={cn('text-sm font-bold leading-tight truncate', isDark ? 'text-white' : 'text-slate-900')}>
                {isMulti
                  ? `แบบรายงานการตรวจเยี่ยมเจ้าของพื้นที่ Pre-PM (รวม ${activeSurveys.length} สถานีที่เลือก)`
                  : 'แบบรายงานการตรวจเยี่ยมเจ้าของพื้นที่ Pre-PM (A4 Official Report)'}
              </h3>
              <p className={cn('text-xs truncate', isDark ? 'text-slate-400' : 'text-slate-500')}>
                {isMulti ? (
                  <span>
                    เลือกรายงานรวม{' '}
                    <strong className={cn('font-bold', isDark ? 'text-cyan-300' : 'text-sky-700')}>
                      {activeSurveys.length} สถานี
                    </strong>{' '}
                    | ดาวน์โหลดไฟล์ .pdf โดยตรง หรือพิมพ์/บันทึกผ่าน Print Dialog
                  </span>
                ) : (
                  <span>
                    สถานี:{' '}
                    <span className={cn('font-semibold', isDark ? 'text-cyan-300' : 'text-sky-700')}>
                      {firstStation}
                    </span>{' '}
                    | รหัส:{' '}
                    <span className={cn('font-mono font-semibold', isDark ? 'text-cyan-400' : 'text-sky-600')}>
                      {firstRecord}
                    </span>
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 self-end sm:self-auto shrink-0">
            {/* Button 1: Direct PDF Download */}
            <button
              type="button"
              disabled={isGeneratingPdf}
              aria-busy={isGeneratingPdf}
              onClick={handleDownloadPdfDirect}
              className="inline-flex items-center gap-1.5 sm:gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-3.5 sm:px-4 py-2 text-xs font-bold text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-cyan-400 transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              title="ดาวน์โหลดไฟล์ .pdf โดยตรงลงเครื่องคอมพิวเตอร์"
            >
              {isGeneratingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>
                {isGeneratingPdf
                  ? pdfProgress && pdfProgress.total > 0
                    ? `กำลังสร้าง PDF หน้า ${pdfProgress.current}/${pdfProgress.total}...`
                    : 'กำลังเตรียมไฟล์ PDF...'
                  : isMulti
                  ? `ดาวน์โหลด PDF (${activeSurveys.length})`
                  : 'ดาวน์โหลด PDF'}
              </span>
            </button>

            {/* Button 2: Print Document / Save as PDF via Browser */}
            <button
              type="button"
              onClick={handlePrint}
              className={cn(
                'inline-flex items-center gap-1.5 sm:gap-2 rounded-xl border px-3 sm:px-3.5 py-2 text-xs font-bold transition-all duration-200 cursor-pointer shadow-sm',
                isDark
                  ? 'border-cyan-500/40 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-600/30 hover:border-cyan-400 hover:text-white'
                  : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:border-slate-400'
              )}
              title="พิมพ์เอกสารออกเครื่องพิมพ์ หรือบันทึกเป็น PDF ทางการผ่านหน้าต่างพิมพ์ (Ctrl+P)"
            >
              <Printer className="h-4 w-4" />
              <span>พิมพ์ / บันทึก PDF</span>
            </button>

            {/* Close Modal Button */}
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl border transition-colors cursor-pointer ml-1',
                isDark
                  ? 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              )}
              title="ปิดหน้าต่าง"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable A4 Preview Container */}
        <div
          className={cn(
            'flex-1 overflow-x-auto overflow-y-auto p-3 sm:p-5 md:p-6 flex flex-col items-center gap-6 transition-colors print:p-0 print:bg-white print:overflow-visible print:block',
            isDark ? 'bg-slate-950/70' : 'bg-slate-200/80'
          )}
        >
          <div
            id="printable-report-area"
            className="flex flex-col items-center gap-8 w-full print:block print:w-full print:m-0 print:p-0"
          >
            {activeSurveys.map((survey, sIdx) => (
              <StationA4ReportPages
                key={survey.recordId || sIdx}
                surveyData={survey}
                stationIndex={sIdx}
                totalStations={activeSurveys.length}
              />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default SurveyReportModal;
