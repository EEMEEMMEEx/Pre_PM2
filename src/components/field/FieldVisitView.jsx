import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Radio as RadioIcon,
  User,
  ShieldCheck,
  Zap,
  TreePine,
  Camera,
  CheckSquare,
  UploadCloud,
  Trash2,
  ZoomIn,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Pencil,
  ArrowLeft,
  Save,
  Undo2,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { ShinyText } from '@/components/ui/shiny-text';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { fetchStations, submitSurvey, updateSurvey, normalizeStationKey } from '@/lib/api';
import { SurveyReportModal } from '@/components/export/SurveyReportModal';
import { Printer, FileText, LayoutDashboard } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

export function FieldVisitView({ onNavigate, editingSurvey, onCancelEdit }) {
  const { isDark } = useTheme();
  const [stations, setStations] = useState([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [lastSavedReport, setLastSavedReport] = useState(null);
  const [formData, setFormData] = useState({
    permit: 'อนุญาต',
    radioStatus: 'ปกติ',
    receiveStatus: 'ปกติ',
    transmitStatus: 'ปกติ',
    powerStatus: 'ปกติ',
    batteryStatus: 'ปกติ',
    groundStatus: 'ปกติ'
  });
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [statusMessage, setStatusMessage] = useState({ text: '', type: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activePreviewPhoto, setActivePreviewPhoto] = useState(null);
  const fileInputRef = useRef(null);

  // Fetch stations for auto-completion immediately on mount
  useEffect(() => {
    fetchStations()
      .then((data) => {
        setStations(
          (data.stations || []).map((s) => ({
            village: s.village,
            arabicVillage: normalizeStationKey(s.village),
            subdistrict: s.subdistrict,
            district: s.district,
            province: s.province,
            installationPlace: s.installation_place || s.installationPlace,
            equipmentPlace: s.equipment_place || s.equipmentPlace,
            contactName: s.contact_name || s.contactName,
            contactPosition: s.contact_position || s.contactPosition,
            contactPhone: s.contact_phone || s.contactPhone || '',
            houseNo: s.house_no || s.houseNo || '',
          }))
        );
      })
      .catch((err) => {
        console.error('Failed to fetch station directory:', err);
      });
  }, []);

  const updateField = (field, value) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'receiveStatus') {
        next.transmitStatus = value;
      }
      return next;
    });
  };

  // Auto-fill installation and contact details when station is selected (supports Thai & Arabic digits)
  const activeStation = useMemo(() => {
    const query = (formData.station || '').trim();
    if (!query) return null;
    const normQuery = normalizeStationKey(query);
    return stations.find(
      (s) => s.village === query || s.arabicVillage === normQuery || normalizeStationKey(s.village) === normQuery
    );
  }, [stations, formData.station]);

  useEffect(() => {
    if (activeStation) {
      setFormData((prev) => ({
        ...prev,
        province: activeStation.province || '',
        district: activeStation.district || '',
        subdistrict: activeStation.subdistrict || '',
        installationPlace: activeStation.installationPlace || '',
        equipmentPlace: activeStation.equipmentPlace || '',
        contactName: activeStation.contactName || '',
        contactPosition: activeStation.contactPosition || '',
        contactVillage: activeStation.village || prev.contactVillage || '',
        contactPhone: activeStation.contactPhone || prev.contactPhone || ''
      }));
    }
  }, [activeStation]);

  // Compress uploaded photo to preserve bandwidth and quota
  const compressImageFile = (file, maxDimension = 1280, quality = 0.75) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64Data = dataUrl.split(',')[1];
          resolve({
            name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
            size: Math.round((base64Data.length * 3) / 4),
            type: 'image/jpeg',
            previewUrl: dataUrl,
            base64Data
          });
        };
        img.onerror = () => {
          const base64Data = (e.target.result || '').split(',')[1] || '';
          resolve({
            name: file.name,
            size: file.size,
            type: file.type || 'image/jpeg',
            previewUrl: e.target.result,
            base64Data
          });
        };
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  // Handle photo selection & base64 conversion with auto-compression
  const handlePhotoSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const file of files) {
      const photoObj = await compressImageFile(file);
      if (photoObj) {
        setSelectedPhotos((prev) => [...prev, photoObj]);
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle editing mode initialization
  const isEditMode = Boolean(editingSurvey && (editingSurvey.recordId || editingSurvey.fields?.recordId));

  useEffect(() => {
    if (editingSurvey) {
      const rawFields = editingSurvey.fields || editingSurvey;
      setFormData({
        ...rawFields,
        station: editingSurvey.station || rawFields.station || '',
        province: editingSurvey.province || rawFields.province || '',
        district: rawFields.district || '',
        subdistrict: rawFields.subdistrict || '',
        installationPlace: rawFields.installationPlace || '',
        equipmentPlace: rawFields.equipmentPlace || '',
        contactName: rawFields.contactName || '',
        contactPosition: rawFields.contactPosition || '',
        contactVillage: rawFields.contactVillage || '',
        contactPhone: rawFields.contactPhone || '',
        permit: rawFields.permit === 'on' ? 'อนุญาต' : (rawFields.permit || 'อนุญาต'),
        radioStatus: rawFields.radioStatus || 'ปกติ',
        receiveStatus: rawFields.receiveStatus || 'ปกติ',
        transmitStatus: rawFields.transmitStatus || 'ปกติ',
        powerStatus: rawFields.powerStatus || 'ปกติ',
        batteryStatus: rawFields.batteryStatus || 'ปกติ',
        groundStatus: rawFields.groundStatus || 'ปกติ',
      });

      const rawPhotos = editingSurvey.photos || rawFields.photos || [];
      const formatted = rawPhotos.map((p, idx) => ({
        id: p.id || idx + 1,
        name: p.name || `photo_${idx + 1}.jpg`,
        type: p.contentType || p.type || 'image/jpeg',
        size: p.size || 0,
        previewUrl: p.url || p.dataUrl || (p.data ? `data:${p.contentType || p.type || 'image/jpeg'};base64,${p.data}` : `/photos/${p.id || encodeURIComponent(p.name)}`),
        base64Data: p.data || (p.dataUrl ? p.dataUrl.split(',')[1] : ''),
        isExisting: true,
      }));
      setSelectedPhotos(formatted);
      setStatusMessage({
        text: `อยู่ในโหมดแก้ไขข้อมูลสถานี ${editingSurvey.station || rawFields.station || ''} (รหัส: ${editingSurvey.recordId})`,
        type: 'info'
      });
    }
  }, [editingSurvey]);

  const handleRemovePhoto = (index) => {
    setSelectedPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage({
      text: isEditMode ? 'กำลังบันทึกการแก้ไขข้อมูล...' : 'กำลังส่งข้อมูลและอัปโหลดรูปภาพ...',
      type: 'info'
    });

    try {
      const photosPayload = selectedPhotos.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        data: p.base64Data
      }));

      let result;
      if (isEditMode) {
        result = await updateSurvey(editingSurvey.recordId, formData, photosPayload);
      } else {
        result = await submitSurvey(formData, photosPayload);
      }

      const reportPhotos = selectedPhotos.map((p, idx) => ({
        id: p.id || idx + 1,
        name: p.name,
        contentType: p.type,
        url: p.previewUrl,
        dataUrl: p.base64Data ? `data:${p.type};base64,${p.base64Data}` : p.previewUrl,
      }));

      // Preserve snapshot of saved report for immediate export
      const recId = result.recordId || editingSurvey?.recordId;
      setLastSavedReport({
        recordId: recId,
        savedAt: new Date().toISOString(),
        station: formData.station,
        province: formData.province || activeStation?.province || '',
        permit: formData.permit,
        photos: reportPhotos,
        fields: {
          ...formData,
          recordId: recId,
          province: formData.province || activeStation?.province || '',
          district: formData.district || activeStation?.district || '',
          subdistrict: formData.subdistrict || activeStation?.subdistrict || '',
          photos: reportPhotos,
        }
      });

      let successText = isEditMode
        ? `บันทึกการแก้ไขข้อมูลสถานี ${formData.station || ''} (รหัส ${recId}) เรียบร้อยแล้ว`
        : `บันทึกข้อมูลรหัส ${recId} เรียบร้อยแล้ว`;
      if (result?.githubSynced) {
        successText += ' (ซิงค์ขึ้น GitHub ส่วนกลางสำเร็จ)';
      } else if (result?.githubError) {
        successText += ` (หมายเหตุ: ยังไม่ซิงค์ขึ้น GitHub: ${result.githubError})`;
      } else {
        successText += ' (บันทึกลงฐานข้อมูลแล้ว)';
      }

      setStatusMessage({
        text: successText,
        type: 'success'
      });

      if (!isEditMode) {
        // Clear form and photo previews for new entries
        setFormData({
          permit: 'อนุญาต',
          radioStatus: 'ปกติ',
          receiveStatus: 'ปกติ',
          transmitStatus: 'ปกติ',
          powerStatus: 'ปกติ',
          batteryStatus: 'ปกติ',
          groundStatus: 'ปกติ'
        });
        setSelectedPhotos([]);
      }
    } catch (err) {
      setStatusMessage({
        text: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์',
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = cn(
    'w-full rounded-xl border px-4 py-2.5 text-base transition-colors focus:outline-none focus:ring-2',
    isDark
      ? 'border-[rgba(115,149,174,0.25)] bg-[rgba(6,19,33,0.7)] text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/40'
      : 'border-slate-300 bg-slate-50/70 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-sky-500 focus:ring-sky-500/20 shadow-2xs'
  );
  const textareaClass = cn(inputClass, 'resize-y');
  const labelClass = cn('block text-sm font-semibold mb-1.5', isDark ? 'text-slate-300' : 'text-slate-700');
  const sectionHeaderBorder = isDark ? 'border-slate-800' : 'border-slate-200';
  const sectionIconBox = isDark ? 'bg-blue-500/20 text-cyan-400' : 'bg-sky-100 text-sky-600 border border-sky-200';
  const sectionTitle = cn('text-base font-bold tracking-normal leading-normal', isDark ? 'text-white' : 'text-slate-900');

  return (
    <motion.main
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Editing Mode Banner */}
        {isEditMode && (
          <div
            className={cn(
              'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border transition-all shadow-md',
              isDark
                ? 'bg-gradient-to-r from-amber-950/70 via-slate-900/90 to-amber-950/70 border-amber-500/50 text-amber-200'
                : 'bg-gradient-to-r from-amber-50 via-white to-amber-50 border-amber-300 text-amber-900'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
                <Pencil className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  โหมดแก้ไขข้อมูล (Editing Mode)
                </div>
                <div className="text-sm font-bold">
                  กำลังแก้ไขข้อมูลสถานี: <span className="font-semibold underline">{editingSurvey?.station || formData.station}</span>
                  <span className="ml-2 font-mono text-xs opacity-75">({editingSurvey?.recordId})</span>
                </div>
              </div>
            </div>
            {onCancelEdit && (
              <button
                type="button"
                onClick={onCancelEdit}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all self-end sm:self-auto shadow-2xs',
                  isDark
                    ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                )}
                title="ยกเลิกการแก้ไขและกลับสู่ Dashboard"
              >
                <Undo2 className="h-3.5 w-3.5" />
                <span>ยกเลิกการแก้ไข</span>
              </button>
            )}
          </div>
        )}

        {/* Form Header */}
        <div
          className={cn(
            'rounded-2xl border p-6 shadow-xl backdrop-blur-xl transition-colors',
            isDark
              ? 'border-blue-500/30 bg-gradient-to-r from-blue-950/60 via-slate-900/80 to-blue-950/60 text-white'
              : 'border-slate-200/90 bg-white/95 text-slate-900 shadow-md'
          )}
        >
          <div
            className={cn(
              'text-xs font-bold uppercase tracking-[0.2em]',
              isDark ? 'text-cyan-400' : 'text-sky-600'
            )}
          >
            FIELD VISIT / SITE RECORD
          </div>
          <h1
            className={cn(
              'mt-1 text-2xl font-extrabold tracking-normal leading-normal lg:text-3xl',
              isDark ? 'text-white' : 'text-slate-900'
            )}
          >
            <ShinyText>แบบบันทึกเข้าตรวจเยี่ยมเจ้าของพื้นที่</ShinyText>
          </h1>
          <p className={cn('mt-1 text-sm leading-relaxed', isDark ? 'text-slate-400' : 'text-slate-500')}>
            บันทึกการขออนุญาตเข้าพื้นที่ สภาพอุปกรณ์ภาคสนาม และภาพถ่ายประกอบการทำงาน
          </p>
        </div>

        {/* 01 ข้อมูลสถานี */}
        <GlassCard hoverEffect={false} className="space-y-4">
          <div className={cn('flex items-center gap-2.5 pb-3 border-b', sectionHeaderBorder)}>
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', sectionIconBox)}>
              <RadioIcon className="h-4 w-4" />
            </div>
            <h2 className={sectionTitle}>
              01 · ข้อมูลสถานี
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="station" className={labelClass}>
                ชื่อสถานี <span className="text-rose-400">*</span>
              </label>
              <input
                id="station"
                list="stations-list"
                required
                placeholder="พิมพ์เพื่อค้นหาชื่อสถานี..."
                value={formData.station || ''}
                onChange={(e) => updateField('station', e.target.value)}
                className={inputClass}
              />
              <datalist id="stations-list">
                {stations.map((s, idx) => (
                  <option key={idx} value={s.village}>
                    {s.province ? `${s.village} (${s.district}, ${s.province})` : s.village}
                  </option>
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="installationPlace" className={labelClass}>
                  สถานที่ติดตั้ง
                </label>
                <input
                  id="installationPlace"
                  type="text"
                  value={formData.installationPlace || ''}
                  onChange={(e) => updateField('installationPlace', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="equipmentPlace" className={labelClass}>
                  สถานที่วางเครื่อง
                </label>
                <input
                  id="equipmentPlace"
                  type="text"
                  value={formData.equipmentPlace || ''}
                  onChange={(e) => updateField('equipmentPlace', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="visitDate" className={labelClass}>
                  วันที่เข้าพื้นที่
                </label>
                <input
                  id="visitDate"
                  type="date"
                  value={formData.visitDate || ''}
                  onChange={(e) => updateField('visitDate', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="visitTime" className={labelClass}>
                  เวลาเข้าพื้นที่
                </label>
                <input
                  id="visitTime"
                  type="time"
                  value={formData.visitTime || ''}
                  onChange={(e) => updateField('visitTime', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </GlassCard>

        {/* 02 ผู้ให้ข้อมูลในพื้นที่ */}
        <GlassCard hoverEffect={false} className="space-y-4">
          <div className={cn('flex items-center gap-2.5 pb-3 border-b', sectionHeaderBorder)}>
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', sectionIconBox)}>
              <User className="h-4 w-4" />
            </div>
            <h2 className={sectionTitle}>
              02 · ผู้ให้ข้อมูลในพื้นที่
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="contactName" className={labelClass}>
                ชื่อ - สกุล
              </label>
              <input
                id="contactName"
                type="text"
                value={formData.contactName || ''}
                onChange={(e) => updateField('contactName', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="contactPosition" className={labelClass}>
                ตำแหน่ง
              </label>
              <input
                id="contactPosition"
                type="text"
                value={formData.contactPosition || ''}
                onChange={(e) => updateField('contactPosition', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="contactVillage" className={labelClass}>
                หน่วยงาน / หมู่บ้าน
              </label>
              <input
                id="contactVillage"
                type="text"
                value={formData.contactVillage || ''}
                onChange={(e) => updateField('contactVillage', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="contactPhone" className={labelClass}>
                เบอร์โทรศัพท์
              </label>
              <input
                id="contactPhone"
                type="tel"
                value={formData.contactPhone || ''}
                onChange={(e) => updateField('contactPhone', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </GlassCard>

        {/* 03 การขออนุญาตเข้าพื้นที่ (Radix UI Radio Group) */}
        <GlassCard hoverEffect={false} className="space-y-4">
          <div className={cn('flex items-center gap-2.5 pb-3 border-b', sectionHeaderBorder)}>
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', sectionIconBox)}>
              <ShieldCheck className="h-4 w-4" />
            </div>
            <h2 className={sectionTitle}>
              03 · การขออนุญาตเข้าพื้นที่
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className={cn('block text-sm font-semibold mb-2', isDark ? 'text-slate-300' : 'text-slate-700')}>
                ได้รับอนุญาตให้ดำเนินการหรือไม่ <span className="text-rose-400">*</span>
              </label>
              <RadioGroup
                value={formData.permit || 'อนุญาต'}
                onValueChange={(val) => updateField('permit', val)}
                className="flex flex-wrap gap-4"
              >
                <label
                  htmlFor="permit-allow"
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-5 py-3 text-sm font-medium cursor-pointer transition-colors',
                    isDark
                      ? 'border-[rgba(115,149,174,0.25)] bg-[rgba(6,19,33,0.7)] text-slate-200 hover:border-emerald-500/40'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-emerald-400 shadow-2xs'
                  )}
                >
                  <RadioGroupItem value="อนุญาต" id="permit-allow" />
                  <span className={isDark ? 'text-emerald-400 font-semibold' : 'text-emerald-600 font-semibold'}>อนุญาต</span>
                </label>
                <label
                  htmlFor="permit-deny"
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-5 py-3 text-sm font-medium cursor-pointer transition-colors',
                    isDark
                      ? 'border-[rgba(115,149,174,0.25)] bg-[rgba(6,19,33,0.7)] text-slate-200 hover:border-rose-500/40'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-rose-400 shadow-2xs'
                  )}
                >
                  <RadioGroupItem value="ไม่อนุญาต" id="permit-deny" />
                  <span className={isDark ? 'text-rose-400 font-semibold' : 'text-rose-600 font-semibold'}>ไม่อนุญาต</span>
                </label>
              </RadioGroup>
            </div>

            <div>
              <label htmlFor="accessLimit" className={labelClass}>
                ข้อจำกัดในการเข้าพื้นที่
              </label>
              <textarea
                id="accessLimit"
                rows={2}
                value={formData.accessLimit || ''}
                onChange={(e) => updateField('accessLimit', e.target.value)}
                placeholder="ระบุข้อจำกัดหรือเงื่อนไขเพิ่มเติม (ถ้ามี)..."
                className={textareaClass}
              />
            </div>
          </div>
        </GlassCard>

        {/* 04 บันทึกผลการตรวจสอบและประเมินสภาพระบบอุปกรณ์ (Equipment & Operational Assessment) */}
        <GlassCard hoverEffect={false} className="space-y-4">
          <div className={cn('flex items-center gap-2.5 pb-3 border-b', sectionHeaderBorder)}>
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', sectionIconBox)}>
              <Zap className="h-4 w-4" />
            </div>
            <h2 className={sectionTitle}>
              04 · บันทึกผลการตรวจสอบและประเมินสภาพระบบอุปกรณ์ (Equipment & Operational Assessment)
            </h2>
          </div>

          <div className="space-y-4">
            <div
              className={cn(
                'overflow-hidden rounded-xl border transition-colors',
                isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-white shadow-2xs'
              )}
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr
                    className={cn(
                      'border-b text-xs font-semibold transition-colors',
                      isDark ? 'border-slate-800 bg-slate-900/60 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'
                    )}
                  >
                    <th className="px-4 py-3 w-16 text-center">ลำดับ</th>
                    <th className="px-4 py-3">รายการตรวจประเมิน</th>
                    <th className="px-4 py-3 w-48 text-center">ผลการตรวจ</th>
                  </tr>
                </thead>
                <tbody className={cn('divide-y', isDark ? 'divide-slate-800/50' : 'divide-slate-200')}>
                  {[
                    ['radioStatus', 'สภาพการทำงานของเครื่องวิทยุคมนาคม', ['ปกติ', 'ไม่ปกติ']],
                    ['receiveStatus', 'ภาครับ - ส่งสัญญาณ (Receiver & Transmitter Status)', ['ปกติ', 'ไม่ปกติ']],
                    ['powerStatus', 'ระบบไฟฟ้าหลักของสถานี (Power Supply)', ['ปกติ', 'ไม่ปกติ']],
                    ['batteryStatus', 'แบตเตอรี่สำรอง (Backup Battery)', ['ปกติ', 'ไม่ปกติ']],
                    ['groundStatus', 'ระบบกราวด์ ( Ground System )', ['ปกติ', 'ไม่ปกติ']]
                  ].map(([key, label, options], idx) => (
                    <tr
                      key={key}
                      className={cn(
                        'transition-colors',
                        isDark ? 'hover:bg-slate-800/30' : 'hover:bg-sky-50/50'
                      )}
                    >
                      <td className={cn('px-4 py-3 text-center font-mono text-xs font-semibold', isDark ? 'text-slate-400' : 'text-slate-500')}>
                        {idx + 1}
                      </td>
                      <td className={cn('px-4 py-3 font-medium leading-normal', isDark ? 'text-slate-200' : 'text-slate-800')}>
                        {label}
                      </td>
                      <td className="px-4 py-2.5">
                        <Select
                          value={formData[key] || options[0]}
                          onValueChange={(val) => updateField(key, val)}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="เลือกคำตอบ" />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <label htmlFor="userProblem" className={labelClass}>
                ปัญหาเพิ่มเติมที่ผู้ใช้งานแจ้ง
              </label>
              <textarea
                id="userProblem"
                rows={2}
                value={formData.userProblem || ''}
                onChange={(e) => updateField('userProblem', e.target.value)}
                className={textareaClass}
              />
            </div>
          </div>
        </GlassCard>

        {/* 05 สภาพแวดล้อมหน้างาน */}
        <GlassCard hoverEffect={false} className="space-y-4">
          <div className={cn('flex items-center gap-2.5 pb-3 border-b', sectionHeaderBorder)}>
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', sectionIconBox)}>
              <TreePine className="h-4 w-4" />
            </div>
            <h2 className={sectionTitle}>
              05 · สภาพแวดล้อมหน้างาน
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="siteCondition" className={labelClass}>
                สภาพพื้นที่ติดตั้งอุปกรณ์
              </label>
              <textarea
                id="siteCondition"
                rows={2}
                value={formData.siteCondition || ''}
                onChange={(e) => updateField('siteCondition', e.target.value)}
                className={textareaClass}
              />
            </div>

            <div>
              <label htmlFor="antennaCondition" className={labelClass}>
                สภาพเสาอากาศและสายอากาศที่มองเห็นได้จากพื้น
              </label>
              <textarea
                id="antennaCondition"
                rows={2}
                value={formData.antennaCondition || ''}
                onChange={(e) => updateField('antennaCondition', e.target.value)}
                className={textareaClass}
              />
            </div>

            <div>
              <label htmlFor="workObstacle" className={labelClass}>
                อุปสรรคในการปฏิบัติงาน
              </label>
              <textarea
                id="workObstacle"
                rows={2}
                value={formData.workObstacle || ''}
                onChange={(e) => updateField('workObstacle', e.target.value)}
                className={textareaClass}
              />
            </div>
          </div>
        </GlassCard>

        {/* 06 ภาพถ่ายก่อนดำเนินงาน */}
        <GlassCard hoverEffect={false} className="space-y-4">
          <div className={cn('flex items-center gap-2.5 pb-3 border-b', sectionHeaderBorder)}>
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', sectionIconBox)}>
              <Camera className="h-4 w-4" />
            </div>
            <h2 className={sectionTitle}>
              06 · ภาพถ่ายก่อนดำเนินงาน
            </h2>
          </div>

          <div className="space-y-4">
            {/* Upload Drag & Drop Area */}
            <label
              htmlFor="photos-input"
              className={cn(
                'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200',
                isDark
                  ? 'border-blue-500/30 bg-blue-950/20 hover:border-blue-500/60 hover:bg-blue-950/30 text-slate-200'
                  : 'border-sky-300 bg-sky-50/50 hover:border-sky-400 hover:bg-sky-50 text-slate-800'
              )}
            >
              <UploadCloud className={cn('h-8 w-8 mb-2', isDark ? 'text-cyan-400' : 'text-sky-600')} />
              <div className={cn('text-sm font-semibold', isDark ? 'text-slate-200' : 'text-slate-800')}>
                คลิกเพื่อเลือกภาพถ่ายหน้างาน (สามารถเลือกพร้อมกันได้หลายภาพ)
              </div>
              <div className={cn('text-xs mt-1', isDark ? 'text-slate-400' : 'text-slate-500')}>
                รองรับไฟล์ JPG, PNG, WebP
              </div>
              <input
                ref={fileInputRef}
                id="photos-input"
                type="file"
                multiple
                accept="image/*"
                onChange={handlePhotoSelect}
                className="sr-only"
              />
            </label>

            {/* Photo Thumbnails */}
            {selectedPhotos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
                {selectedPhotos.map((photo, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'group relative aspect-square rounded-xl overflow-hidden border shadow-md transition-colors',
                      isDark ? 'border-blue-500/30 bg-slate-900' : 'border-slate-200 bg-slate-100'
                    )}
                  >
                    <img
                      src={photo.previewUrl}
                      alt={photo.name}
                      className="h-full w-full object-cover"
                    />

                    {/* Overlay controls */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActivePreviewPhoto(photo)}
                        className="rounded-lg bg-blue-600/80 p-2 text-white hover:bg-blue-600 transition-colors cursor-pointer"
                        title="ดูภาพขนาดใหญ่"
                      >
                        <ZoomIn className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="rounded-lg bg-rose-600/80 p-2 text-white hover:bg-rose-600 transition-colors cursor-pointer"
                        title="ลบภาพนี้"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-[11px] text-slate-300 truncate">
                      {photo.name}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>

        {/* 07 ยืนยันข้อมูล */}
        <GlassCard hoverEffect={false} className="space-y-4">
          <div className={cn('flex items-center gap-2.5 pb-3 border-b', sectionHeaderBorder)}>
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', sectionIconBox)}>
              <CheckSquare className="h-4 w-4" />
            </div>
            <h2 className={sectionTitle}>
              07 · ยืนยันข้อมูล
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="summary" className={labelClass}>
                สรุปสิ่งที่ได้รับแจ้งจากเจ้าของพื้นที่
              </label>
              <textarea
                id="summary"
                rows={3}
                value={formData.summary || ''}
                onChange={(e) => updateField('summary', e.target.value)}
                className={textareaClass}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="informantName" className={labelClass}>
                  ชื่อผู้ให้ข้อมูล
                </label>
                <input
                  id="informantName"
                  type="text"
                  value={formData.informantName || ''}
                  onChange={(e) => updateField('informantName', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="operatorName" className={labelClass}>
                  ชื่อผู้ปฏิบัติงาน
                </label>
                <input
                  id="operatorName"
                  type="text"
                  value={formData.operatorName || ''}
                  onChange={(e) => updateField('operatorName', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Submit Button with Framer Motion Spring */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="submit"
          disabled={isSubmitting}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-bold tracking-normal leading-normal text-slate-950 shadow-lg transition-all disabled:opacity-60 cursor-pointer',
            isEditMode
              ? 'bg-gradient-to-r from-amber-500 via-orange-400 to-amber-300 shadow-amber-500/20 hover:shadow-amber-500/30'
              : 'bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 shadow-blue-500/20 hover:shadow-cyan-500/30'
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{isEditMode ? 'กำลังบันทึกการแก้ไขข้อมูล...' : 'กำลังบันทึกข้อมูล...'}</span>
            </>
          ) : isEditMode ? (
            <>
              <Save className="h-5 w-5" />
              <span>บันทึกการแก้ไขข้อมูล (Update Survey)</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-5 w-5" />
              <span>บันทึกข้อมูลการเข้าตรวจเยี่ยม</span>
            </>
          )}
        </motion.button>

        {/* Status Feedback Message */}
        {statusMessage.text && (
          <div
            className={cn(
              'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4 text-sm font-medium transition-colors',
              statusMessage.type === 'success'
                ? isDark
                  ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : statusMessage.type === 'error'
                ? isDark
                  ? 'border-rose-500/40 bg-rose-950/40 text-rose-300'
                  : 'border-rose-300 bg-rose-50 text-rose-800'
                : isDark
                ? 'border-blue-500/40 bg-blue-950/40 text-blue-300'
                : 'border-sky-300 bg-sky-50 text-sky-800'
            )}
          >
            <div className="flex items-center gap-2.5">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
              ) : statusMessage.type === 'error' ? (
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-500" />
              ) : (
                <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin text-blue-500" />
              )}
              <span>{statusMessage.text}</span>
            </div>

            {statusMessage.type === 'success' && (
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('dashboard')}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs',
                      isDark
                        ? 'border-cyan-500/40 bg-cyan-950/70 text-cyan-200 hover:bg-cyan-900 hover:text-white'
                        : 'border-sky-300 bg-sky-600 text-white hover:bg-sky-700'
                    )}
                  >
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    <span>ไปยังหน้า Dashboard</span>
                  </button>
                )}
                {lastSavedReport && (
                  <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs',
                      isDark
                        ? 'border-emerald-500/40 bg-emerald-900/60 text-emerald-200 hover:bg-emerald-800 hover:text-white'
                        : 'border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700'
                    )}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>พิมพ์ / Export PDF</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </form>

      {/* Photo Preview Modal using Radix Dialog */}
      <Dialog
        open={Boolean(activePreviewPhoto)}
        onOpenChange={(open) => !open && setActivePreviewPhoto(null)}
      >
        <DialogContent className={cn('max-w-2xl p-4', isDark ? 'bg-slate-950/95 border-blue-500/40' : 'bg-white border-slate-200 shadow-xl')}>
          <DialogHeader>
            <DialogTitle className={cn('text-sm font-medium truncate', isDark ? 'text-slate-300' : 'text-slate-700')}>
              {activePreviewPhoto?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-hidden rounded-xl bg-black/60 max-h-[70vh] flex items-center justify-center">
            {activePreviewPhoto && (
              <img
                src={activePreviewPhoto.previewUrl}
                alt={activePreviewPhoto.name}
                className="max-h-[65vh] w-auto object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Survey A4 Report Modal for newly saved record */}
      <SurveyReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        surveyData={lastSavedReport || {}}
      />
    </motion.main>
  );
}
