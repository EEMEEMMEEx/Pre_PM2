import React, { useState, useEffect } from 'react';
import {
  X,
  Radio as RadioIcon,
  MapPin,
  User,
  Phone,
  Calendar,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  ZoomIn,
  Image as ImageIcon,
  Printer,
  FileText,
  Copy,
  Check,
  ExternalLink,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import { findStationByName } from '@/lib/api';

/**
 * Robust photo source resolver for base64 data, dataUrl, or server url
 */
export const getPhotoSrc = (photo) => {
  if (!photo) return '';
  if (photo.dataUrl) return photo.dataUrl;
  if (photo.data) {
    return photo.data.startsWith('data:')
      ? photo.data
      : `data:${photo.type || photo.contentType || 'image/jpeg'};base64,${photo.data}`;
  }
  return photo.url || '';
};

export function SurveyPreviewModal({
  isOpen,
  onClose,
  surveyData = {},
  onOpenOfficialReport,
  onEdit,
  onDelete,
}) {
  const { isDark } = useTheme();
  const [copied, setCopied] = useState(false);
  const [activePhoto, setActivePhoto] = useState(null);

  if (!isOpen) return null;

  const rawFields = surveyData.fields || {};
  const fields = { ...surveyData, ...rawFields };

  const stationName = fields.station || fields.village || fields.stationSelect || surveyData.station || 'สถานีวิทยุคมนาคม NBTC Microwave';
  const stationLookup = findStationByName(stationName);

  const recordId = surveyData.recordId || fields.recordId || fields.record_id || '-';
  const province = fields.province || surveyData.province || stationLookup?.province || '';
  const district = fields.district || surveyData.district || stationLookup?.district || '';
  const subdistrict = fields.subdistrict || surveyData.subdistrict || stationLookup?.subdistrict || '';
  const installationPlace = fields.installationPlace || fields.installation_place || stationLookup?.installation_place || stationLookup?.installationPlace || '-';
  const equipmentPlace = fields.equipmentPlace || fields.equipment_place || stationLookup?.equipment_place || stationLookup?.equipmentPlace || installationPlace || '-';

  // Format full location
  const locationParts = [];
  if (installationPlace && installationPlace !== '-') locationParts.push(installationPlace);
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
  const fullLocation = locationParts.length > 0 ? locationParts.join(' ') : (fields.village || fields.station || '-');

  // Visit Date & Time
  const rawDate = fields.visitDate || fields.visit_date || fields.savedAt || surveyData.savedAt;
  let visitDateStr = '-';
  if (rawDate) {
    try {
      const dateObj = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
        ? new Date(`${rawDate}T12:00:00`)
        : new Date(rawDate);
      if (!isNaN(dateObj.getTime())) {
        visitDateStr = dateObj.toLocaleDateString('th-TH', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
      }
    } catch {}
  }

  const rawTime = fields.visitTime || fields.visit_time;
  const visitTime = rawTime
    ? `${rawTime} น.`
    : (fields.savedAt || surveyData.savedAt
      ? new Date(fields.savedAt || surveyData.savedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
      : '-');

  // Contact Info
  const contactName = fields.contactName || fields.contact_name || stationLookup?.contact_name || fields.informantName || fields.informant_name || '-';
  const contactPosition = fields.contactPosition || fields.contact_position || stationLookup?.contact_position || 'เจ้าของพื้นที่ / ผู้ดูแลสถานี';
  const contactVillage = fields.contactVillage || fields.contact_village || (subdistrict ? `ต.${subdistrict.replace(/^ต\./, '')}` : '-');
  const contactPhone = fields.contactPhone || fields.contact_phone || fields.phone || fields.tel || stationLookup?.contact_phone || stationLookup?.contactPhone || '-';

  // Permission
  const permit = fields.permit || surveyData.permit || 'อนุญาต';
  const isPermitted = permit === 'อนุญาต' || permit === 'on' || permit === 'true' || permit === true;
  const accessLimit = fields.accessLimit || fields.access_limit || 'ไม่มีข้อจำกัด';

  // Assessment fields
  const radioStatus = fields.radioStatus || fields.radio_status || 'ปกติ';
  const isRadioNormal = radioStatus === 'ปกติ';

  const receiveStatus = fields.receiveStatus || fields.receive_status || 'ปกติ';
  const isReceiveNormal = receiveStatus === 'ปกติ' || receiveStatus === 'ไม่พบ' || receiveStatus === 'ไม่พบปัญหา';

  const transmitStatus = fields.transmitStatus || fields.transmit_status || 'ปกติ';
  const isTransmitNormal = transmitStatus === 'ปกติ' || transmitStatus === 'ไม่พบ' || transmitStatus === 'ไม่พบปัญหา';
  const isSignalNormal = isReceiveNormal && isTransmitNormal;

  const powerStatus = fields.powerStatus || fields.power_status || 'ปกติ';
  const isPowerNormal = powerStatus === 'ปกติ' || powerStatus === 'ไม่มี' || powerStatus === 'ไม่มีปัญหา';

  const batteryStatus = fields.batteryStatus || fields.battery_status || 'ปกติ';
  const isBatteryNormal = batteryStatus === 'ปกติ' || batteryStatus === 'ไม่มี' || batteryStatus === 'ไม่มีปัญหา';

  const groundStatus = fields.groundStatus || fields.ground_status || 'ปกติ';
  const isGroundNormal = groundStatus === 'ปกติ' || groundStatus === 'ไม่มี' || groundStatus === 'ไม่มีปัญหา' || groundStatus === 'ไม่พบ';

  const userProblem = fields.userProblem || fields.user_problem || 'ไม่พบปัญหาเพิ่มเติม';
  const siteCondition = fields.siteCondition || fields.site_condition || 'สภาพพื้นที่ปกติ พร้อมสำหรับการปฏิบัติงาน';
  const antennaCondition = fields.antennaCondition || fields.antenna_condition || 'สภาพเสาและสายอากาศอยู่ในเกณฑ์ปกติ';
  const workObstacle = fields.workObstacle || fields.work_obstacle || 'ไม่มีอุปสรรคในการปฏิบัติงาน';
  const summary = fields.summary || fields.userSummary || 'เจ้าของพื้นที่ให้ความร่วมมือในการเข้าตรวจเยี่ยมและตรวจสอบสภาพระบบอุปกรณ์เป็นอย่างดี';
  const informantName = fields.informantName || fields.informant_name || (contactName !== '-' ? contactName : '');
  const operatorName = fields.operatorName || fields.operator_name || 'วิศวกรผู้ควบคุมงาน';

  // Photos with full base64 data resolution
  const rawPhotos = Array.isArray(surveyData.photos) && surveyData.photos.length > 0
    ? surveyData.photos
    : (Array.isArray(fields.photos) && fields.photos.length > 0 ? fields.photos : []);

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

  const photos = resolvedPhotos;

  // Preload photos from GitHub raw JSON if missing base64 or running on static hosting
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen, recordId]);

  // Format file size
  const formatSize = (bytes) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Copy Record ID
  const handleCopyRecordId = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(recordId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const sectionCardClass = cn(
    'rounded-xl border p-4 shadow-xs transition-colors',
    isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-white'
  );
  const sectionTitleClass = cn(
    'flex items-center gap-2 text-sm font-bold border-b pb-2.5 mb-3 transition-colors',
    isDark ? 'text-cyan-300 border-slate-800' : 'text-sky-700 border-slate-200'
  );
  const sectionIconClass = isDark ? 'text-cyan-400' : 'text-sky-600';
  const labelClass = isDark ? 'text-slate-400' : 'text-slate-500';
  const valBoldClass = isDark ? 'text-white' : 'text-slate-900';
  const valMediumClass = isDark ? 'text-slate-200' : 'text-slate-800';

  // Download Single Photo
  const handleDownloadPhoto = (photo, e) => {
    if (e) e.stopPropagation();
    const src = getPhotoSrc(photo);
    if (!src) return;
    const isData = src.startsWith('data:');
    const downloadUrl = !isData && src.includes('?') ? `${src}&download=1` : (!isData ? `${src}?download=1` : src);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = photo.name || `survey-photo-${photo.id || Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download All Photos
  const handleDownloadAllPhotos = () => {
    photos.forEach((photo, idx) => {
      setTimeout(() => {
        handleDownloadPhoto(photo);
      }, idx * 300);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4 backdrop-blur-md overflow-y-auto">
      {/* Modal Container */}
      <div
        className={cn(
          'relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border shadow-2xl overflow-hidden my-auto transition-colors',
          isDark
            ? 'border-blue-500/30 bg-slate-900 text-slate-200'
            : 'border-slate-300 bg-white text-slate-800 shadow-xl'
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b px-4 sm:px-6 py-3.5 shrink-0 transition-colors',
            isDark ? 'border-slate-800 bg-slate-950/90' : 'border-slate-200 bg-slate-50'
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                isDark
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                  : 'bg-sky-100 text-sky-600 border-sky-200'
              )}
            >
              <RadioIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={cn('text-base font-bold truncate', isDark ? 'text-white' : 'text-slate-900')}>
                  {stationName}
                </h3>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border',
                    isPermitted
                      ? isDark
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : isDark
                      ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                      : 'bg-rose-50 border-rose-300 text-rose-700'
                  )}
                >
                  {isPermitted ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {isPermitted ? 'อนุญาตเข้าพื้นที่' : 'ไม่อนุญาต'}
                </span>
              </div>
              <div className={cn('flex items-center gap-2 text-xs mt-0.5', isDark ? 'text-slate-400' : 'text-slate-500')}>
                <span>รหัสรายการ:</span>
                <span className={cn('font-mono font-semibold', isDark ? 'text-cyan-400' : 'text-sky-600')}>{recordId}</span>
                <button
                  type="button"
                  onClick={handleCopyRecordId}
                  className={cn('p-1 transition-colors cursor-pointer', isDark ? 'hover:text-white' : 'hover:text-slate-900')}
                  title="คัดลอกรหัสรายการ"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            {/* Edit Button */}
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(surveyData)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs',
                  isDark
                    ? 'border-amber-500/40 bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 hover:border-amber-400 hover:text-white'
                    : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:border-amber-400'
                )}
                title="แก้ไขข้อมูลการตรวจเยี่ยมนี้"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>แก้ไข</span>
              </button>
            )}

            {/* Delete Button */}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(surveyData)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs',
                  isDark
                    ? 'border-rose-500/40 bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 hover:border-rose-400 hover:text-white'
                    : 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 hover:border-rose-400'
                )}
                title="ลบรายการตรวจเยี่ยมนี้"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>ลบ</span>
              </button>
            )}

            {/* Official Report A4 Modal Button */}
            {onOpenOfficialReport && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenOfficialReport(surveyData);
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs',
                  isDark
                    ? 'border-blue-500/30 bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 hover:border-blue-400 hover:text-white'
                    : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-400'
                )}
                title="เปิดแบบรายงานการตรวจเยี่ยมทางการขนาด A4"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>รายงาน A4</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-xl border transition-colors cursor-pointer',
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

        {/* Scrollable Content Body */}
        <div
          className={cn(
            'flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 transition-colors',
            isDark ? 'bg-gradient-to-b from-slate-900/60 to-slate-950' : 'bg-slate-100/60'
          )}
        >
          
          {/* Section 1: Station & Location Details */}
          <div className={sectionCardClass}>
            <h4 className={sectionTitleClass}>
              <MapPin className={cn('h-4 w-4', sectionIconClass)} />
              <span>1. ข้อมูลสถานีและสถานที่ติดตั้ง (Station & Location)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
              <div>
                <span className={cn('block mb-0.5', labelClass)}>ชื่อสถานี</span>
                <span className={cn('font-semibold text-sm', valBoldClass)}>{stationName}</span>
              </div>
              <div>
                <span className={cn('block mb-0.5', labelClass)}>สถานที่วางเครื่อง</span>
                <span className={cn('font-medium', valMediumClass)}>{equipmentPlace}</span>
              </div>
              <div className="md:col-span-2">
                <span className={cn('block mb-0.5', labelClass)}>สถานที่ติดตั้ง</span>
                <span className={cn('font-medium', valMediumClass)}>{fullLocation}</span>
              </div>
              <div>
                <span className={cn('block mb-0.5', labelClass)}>วันที่ตรวจเยี่ยม</span>
                <span className={cn('font-medium flex items-center gap-1.5', valMediumClass)}>
                  <Calendar className={cn('h-3.5 w-3.5', labelClass)} />
                  {visitDateStr}
                </span>
              </div>
              <div>
                <span className={cn('block mb-0.5', labelClass)}>เวลาที่ตรวจเยี่ยม</span>
                <span className={cn('font-medium flex items-center gap-1.5', valMediumClass)}>
                  <Clock className={cn('h-3.5 w-3.5', labelClass)} />
                  {visitTime}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Contact & Permission Details */}
          <div className={sectionCardClass}>
            <h4 className={sectionTitleClass}>
              <User className={cn('h-4 w-4', sectionIconClass)} />
              <span>2. ข้อมูลผู้ให้ข้อมูล / เจ้าของพื้นที่ และการขออนุญาต (Site Owner & Permission)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
              <div>
                <span className={cn('block mb-0.5', labelClass)}>ชื่อ - สกุล</span>
                <span className={cn('font-semibold text-sm', valBoldClass)}>{contactName}</span>
              </div>
              <div>
                <span className={cn('block mb-0.5', labelClass)}>ตำแหน่ง</span>
                <span className={cn('font-medium', valMediumClass)}>{contactPosition}</span>
              </div>
              <div>
                <span className={cn('block mb-0.5', labelClass)}>หน่วยงาน / หมู่บ้าน</span>
                <span className={cn('font-medium', valMediumClass)}>{contactVillage}</span>
              </div>
              <div>
                <span className={cn('block mb-0.5', labelClass)}>เบอร์โทรศัพท์</span>
                {contactPhone && contactPhone !== '-' ? (
                  <a
                    href={`tel:${contactPhone}`}
                    className={cn('font-mono hover:underline flex items-center gap-1', isDark ? 'text-cyan-400' : 'text-sky-600')}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {contactPhone}
                  </a>
                ) : (
                  <span className="text-slate-500">-</span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">ผลการขออนุญาตเข้าพื้นที่</span>
                <span className={`inline-flex items-center gap-1.5 font-semibold px-2.5 py-0.5 rounded-lg text-xs ${
                  isPermitted ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}>
                  {isPermitted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  <span>{isPermitted ? 'อนุญาตให้เข้าพื้นที่' : 'ไม่อนุญาตให้เข้าพื้นที่'}</span>
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">ข้อจำกัดในการเข้าพื้นที่</span>
                <span className="font-medium text-slate-200">{accessLimit}</span>
              </div>
            </div>
          </div>

          {/* Section 3: Equipment Assessment */}
          <div className={sectionCardClass}>
            <h4 className={sectionTitleClass}>
              <ShieldCheck className={cn('h-4 w-4', sectionIconClass)} />
              <span>3. บันทึกผลการตรวจสอบและประเมินสภาพระบบอุปกรณ์ (Equipment & Operational Assessment)</span>
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className={cn('border-b text-xs font-semibold', isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600')}>
                    <th className="py-2 px-2.5">รายการประเมิน</th>
                    <th className="py-2 px-2.5 text-center">สถานะ</th>
                    <th className="py-2 px-2.5">รายละเอียด / ข้อสังเกต</th>
                  </tr>
                </thead>
                <tbody className={cn('divide-y', isDark ? 'divide-slate-800/60' : 'divide-slate-200')}>
                  <tr>
                    <td className={cn('py-2 px-2.5 font-medium', valMediumClass)}>1. สภาพการทำงานของเครื่องวิทยุคมนาคม</td>
                    <td className="py-2 px-2.5 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                        isRadioNormal ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                      }`}>
                        {isRadioNormal ? 'ปกติ' : 'ไม่ปกติ'}
                      </span>
                    </td>
                    <td className={cn('py-2 px-2.5', labelClass)}>{isRadioNormal ? 'เครื่องวิทยุทำงานปกติ' : 'พบข้อขัดข้องในการใช้งาน'}</td>
                  </tr>
                  <tr>
                    <td className={cn('py-2 px-2.5 font-medium', valMediumClass)}>2. ภาครับ - ส่งสัญญาณ (Receiver & Transmitter Status)</td>
                    <td className="py-2 px-2.5 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                        isSignalNormal ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                      }`}>
                        {isSignalNormal ? 'ปกติ' : 'ไม่ปกติ'}
                      </span>
                    </td>
                    <td className={cn('py-2 px-2.5', labelClass)}>{isSignalNormal ? 'รับและส่งสัญญาณได้ตามปกติ ชัดเจน' : 'พบข้อขัดข้องในการรับหรือส่งสัญญาณ'}</td>
                  </tr>
                  <tr>
                    <td className={cn('py-2 px-2.5 font-medium', valMediumClass)}>3. ระบบไฟฟ้าหลักของสถานี (Power Supply)</td>
                    <td className="py-2 px-2.5 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                        isPowerNormal ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                      }`}>
                        {isPowerNormal ? 'ปกติ' : 'ไม่ปกติ'}
                      </span>
                    </td>
                    <td className={cn('py-2 px-2.5', labelClass)}>{isPowerNormal ? 'ระบบไฟฟ้าจ่ายไฟสม่ำเสมอ' : 'ระบบไฟฟ้าขัดข้อง/ไฟตกบ่อย'}</td>
                  </tr>
                  <tr>
                    <td className={cn('py-2 px-2.5 font-medium', valMediumClass)}>4. แบตเตอรี่สำรอง (Backup Battery)</td>
                    <td className="py-2 px-2.5 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                        isBatteryNormal ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                      }`}>
                        {isBatteryNormal ? 'ปกติ' : 'ไม่ปกติ'}
                      </span>
                    </td>
                    <td className={cn('py-2 px-2.5', labelClass)}>{isBatteryNormal ? 'แบตเตอรี่สำรองพร้อมจ่ายไฟ' : 'แบตเตอรี่เสื่อม/เก็บไฟไม่อยู่'}</td>
                  </tr>
                  <tr>
                    <td className={cn('py-2 px-2.5 font-medium', valMediumClass)}>5. ระบบกราวด์ ( Ground System )</td>
                    <td className="py-2 px-2.5 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                        isGroundNormal ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                      }`}>
                        {isGroundNormal ? 'ปกติ' : 'ไม่ปกติ'}
                      </span>
                    </td>
                    <td className={cn('py-2 px-2.5', labelClass)}>{isGroundNormal ? 'ระบบกราวด์สมบูรณ์ ต่อลงดินเรียบร้อย' : 'ระบบกราวด์มีปัญหา/หลุดหลวม'}</td>
                  </tr>
                  <tr>
                    <td className={cn('py-2 px-2.5 font-medium', labelClass)}>ปัญหาเพิ่มเติมที่ผู้ใช้งานแจ้ง</td>
                    <td colSpan={2} className={cn('py-2 px-2.5', valMediumClass)}>{userProblem}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: Site Environmental & Summary */}
          <div className={sectionCardClass}>
            <h4 className={sectionTitleClass}>
              <FileText className={cn('h-4 w-4', sectionIconClass)} />
              <span>4. สภาพแวดล้อมและสรุปผล (Environment & Summary)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
              <div>
                <span className={cn('block mb-0.5', labelClass)}>สภาพพื้นที่ติดตั้งอุปกรณ์</span>
                <span className={cn('font-medium', valMediumClass)}>{siteCondition}</span>
              </div>
              <div>
                <span className={cn('block mb-0.5', labelClass)}>สภาพเสาอากาศและสายอากาศ</span>
                <span className={cn('font-medium', valMediumClass)}>{antennaCondition}</span>
              </div>
              <div className="md:col-span-2">
                <span className={cn('block mb-0.5', labelClass)}>อุปสรรคและข้อจำกัดในการปฏิบัติงาน</span>
                <span className={cn('font-medium', valMediumClass)}>{workObstacle}</span>
              </div>
              <div className={cn('md:col-span-2 p-3 rounded-lg border transition-colors', isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-slate-50 border-slate-200')}>
                <span className={cn('block mb-1 font-semibold', labelClass)}>สรุปผลการตรวจเยี่ยมและข้อคิดเห็น</span>
                <p className={cn('leading-relaxed', valMediumClass)}>{summary}</p>
              </div>
              <div>
                <span className={cn('block mb-0.5', labelClass)}>ผู้ให้ข้อมูล / เจ้าของพื้นที่</span>
                <span className={cn('font-semibold', valBoldClass)}>{informantName || contactName}</span>
              </div>
              <div>
                <span className={cn('block mb-0.5', labelClass)}>เจ้าหน้าที่ผู้ตรวจเยี่ยม</span>
                <span className={cn('font-semibold', valBoldClass)}>{operatorName}</span>
              </div>
            </div>
          </div>

          {/* Section 5: Uploaded Photos Gallery */}
          <div className={sectionCardClass}>
            <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5 mb-3', isDark ? 'border-slate-800' : 'border-slate-200')}>
              <div className="flex items-center gap-2">
                <ImageIcon className={cn('h-4 w-4', sectionIconClass)} />
                <h4 className={cn('text-sm font-bold', isDark ? 'text-cyan-300' : 'text-sky-700')}>
                  5. รูปภาพที่อัปโหลดจากการตรวจเยี่ยม
                </h4>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold border', isDark ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300' : 'bg-sky-100 border-sky-200 text-sky-700')}>
                  {photos.length} รูป
                </span>
              </div>

              {photos.length > 1 && (
                <button
                  type="button"
                  onClick={handleDownloadAllPhotos}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer self-start sm:self-auto',
                    isDark
                      ? 'border-cyan-500/30 bg-cyan-950/50 text-cyan-300 hover:bg-cyan-600/30 hover:text-white'
                      : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100'
                  )}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>ดาวน์โหลดรูปภาพทั้งหมด</span>
                </button>
              )}
            </div>

            {resolvedPhotos.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {resolvedPhotos.map((photo, index) => {
                  const photoSrc = getPhotoSrc(photo);
                  return (
                    <div
                      key={photo.id || index}
                      className={cn(
                        'group relative flex flex-col rounded-xl border overflow-hidden shadow-xs transition-all duration-200',
                        isDark ? 'border-slate-800 bg-slate-900/80 hover:border-cyan-500/50' : 'border-slate-200 bg-white hover:border-sky-300 shadow-2xs'
                      )}
                    >
                      {/* Thumbnail Image */}
                      <div
                        onClick={() => setActivePhoto(photo)}
                        className="relative h-44 w-full bg-black/50 overflow-hidden cursor-pointer flex items-center justify-center"
                      >
                        <img
                          src={photoSrc}
                          alt={photo.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                          onError={(e) => {
                            if (recordId && recordId !== '-' && (!photoSrc || !photoSrc.startsWith('data:'))) {
                              fetch(`https://raw.githubusercontent.com/Thaidimaru/Pre_PM2/main/data/surveys/${encodeURIComponent(recordId)}.json`)
                                .then((r) => (r.ok ? r.json() : null))
                                .then((data) => {
                                  const match =
                                    data?.photos?.[index] ||
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
                        {/* Zoom Indicator Overlay */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <span className="flex items-center gap-1 rounded-lg bg-black/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm border border-white/20">
                            <ZoomIn className="h-3.5 w-3.5" />
                            <span>ดูรูปขนาดใหญ่</span>
                          </span>
                        </div>
                      </div>

                    {/* Photo Info & Download Button */}
                    <div className={cn('p-2.5 flex items-center justify-between gap-2 transition-colors', isDark ? 'bg-slate-950/80' : 'bg-slate-50')}>
                      <div className="min-w-0">
                        <p className={cn('text-xs font-medium truncate', valMediumClass)} title={photo.name}>
                          {photo.name || `photo_${index + 1}.jpg`}
                        </p>
                        {photo.size ? (
                          <span className={cn('text-[11px]', labelClass)}>
                            {formatSize(photo.size)}
                          </span>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleDownloadPhoto(photo, e)}
                        className={cn(
                          'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition-all cursor-pointer shrink-0 shadow-2xs',
                          isDark
                            ? 'border-cyan-500/40 bg-cyan-950/60 text-cyan-300 hover:bg-cyan-600 hover:text-white'
                            : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-400'
                        )}
                        title="ดาวน์โหลดรูปภาพนี้"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>ดาวน์โหลด</span>
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>
            ) : (
              <div className={cn('flex flex-col items-center justify-center py-8 px-4 text-center rounded-xl border border-dashed transition-colors', isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50 border-slate-300')}>
                <ImageIcon className={cn('h-9 w-9 mb-2', isDark ? 'text-slate-600' : 'text-slate-400')} />
                <p className={cn('text-sm font-medium', isDark ? 'text-slate-400' : 'text-slate-600')}>
                  ไม่มีรูปภาพแนบในบันทึกรายการนี้
                </p>
                <p className={cn('text-xs mt-0.5', labelClass)}>
                  สามารถอัปโหลดรูปภาพแนบเพิ่มเติมในการบันทึกตรวจเยี่ยมครั้งถัดไป
                </p>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Lightbox Modal for Full Resolution Photo */}
      <Dialog
        open={Boolean(activePhoto)}
        onOpenChange={(open) => !open && setActivePhoto(null)}
      >
        <DialogContent className={cn('max-w-3xl p-4', isDark ? 'bg-slate-950/98 border-blue-500/40 text-slate-200' : 'bg-white border-slate-200 text-slate-800 shadow-2xl')}>
          <div className={cn('flex items-center justify-between pb-3 border-b', isDark ? 'border-slate-800' : 'border-slate-200')}>
            <div className="min-w-0 pr-4">
              <h4 className={cn('text-sm font-bold truncate', valBoldClass)}>
                {activePhoto?.name}
              </h4>
              {activePhoto?.size ? (
                <span className={cn('text-xs', labelClass)}>
                  ขนาดไฟล์: {formatSize(activePhoto.size)}
                </span>
              ) : null}
            </div>
            {activePhoto && (
              <button
                type="button"
                onClick={() => handleDownloadPhoto(activePhoto)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-1.5 text-xs font-bold text-white shadow-md hover:from-blue-500 hover:to-cyan-400 transition-all cursor-pointer shrink-0"
              >
                <Download className="h-4 w-4" />
                <span>ดาวน์โหลดรูปภาพ</span>
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center justify-center rounded-xl bg-black/80 max-h-[75vh] overflow-hidden p-2">
            {activePhoto && (
              <img
                src={getPhotoSrc(activePhoto)}
                alt={activePhoto.name}
                className="max-h-[70vh] w-auto max-w-full object-contain rounded-lg shadow-2xl"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
