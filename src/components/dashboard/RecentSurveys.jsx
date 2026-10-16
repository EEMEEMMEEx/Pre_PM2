import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Clock,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Printer,
  ExternalLink,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  Filter,
  FileDown,
  FileSpreadsheet,
  Check,
  Pencil,
  Trash2,
  AlertTriangle,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MapPin,
  RotateCcw,
  SlidersHorizontal,
  Radio,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { SurveyReportModal } from '@/components/export/SurveyReportModal';
import { SurveyPreviewModal } from '@/components/dashboard/SurveyPreviewModal';
import { exportSurveysToExcel } from '@/lib/excelExport';
import { deleteSurveys, getDeletedSurveyIds } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

export const SORT_OPTIONS = [
  { value: 'date_desc', label: 'เวลาบันทึก: ล่าสุด → เก่าสุด', shortLabel: 'ล่าสุด', icon: Clock },
  { value: 'date_asc', label: 'เวลาบันทึก: เก่าสุด → ล่าสุด', shortLabel: 'เก่าสุด', icon: Clock },
  { value: 'visitDate_desc', label: 'วันที่ลงพื้นที่: ล่าสุด → เก่าสุด', shortLabel: 'ลงพื้นที่ล่าสุด', icon: Clock },
  { value: 'visitDate_asc', label: 'วันที่ลงพื้นที่: เก่าสุด → ล่าสุด', shortLabel: 'ลงพื้นที่เก่าสุด', icon: Clock },
  { value: 'station_asc', label: 'ชื่อสถานี: ก → ฮ (A - Z)', shortLabel: 'สถานี ก-ฮ', icon: ArrowUp },
  { value: 'station_desc', label: 'ชื่อสถานี: ฮ → ก (Z - A)', shortLabel: 'สถานี ฮ-ก', icon: ArrowDown },
  { value: 'province_asc', label: 'จังหวัด: ก → ฮ', shortLabel: 'จังหวัด ก-ฮ', icon: MapPin },
  { value: 'province_desc', label: 'จังหวัด: ฮ → ก', shortLabel: 'จังหวัด ฮ-ก', icon: MapPin },
  { value: 'permit_asc', label: 'ผลขออนุญาต: อนุญาตก่อน', shortLabel: 'อนุญาตก่อน', icon: CheckCircle2 },
  { value: 'permit_desc', label: 'ผลขออนุญาต: ไม่อนุญาตก่อน', shortLabel: 'ไม่อนุญาตก่อน', icon: XCircle },
];

export function RecentSurveys({ recent = [], onNavigate, onEditSurvey, onRefresh }) {
  const { isDark } = useTheme();
  const [reportSurveys, setReportSurveys] = useState(null);
  const [selectedPreview, setSelectedPreview] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pageSize, setPageSize] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [permitFilter, setPermitFilter] = useState('all');
  const [provinceFilter, setProvinceFilter] = useState('all');
  const [systemFilter, setSystemFilter] = useState('all');
  const [photoFilter, setPhotoFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc');
  const [locallyDeletedIds, setLocallyDeletedIds] = useState(new Set());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortDropdownRef = useRef(null);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (permitFilter !== 'all') count++;
    if (provinceFilter !== 'all') count++;
    if (systemFilter !== 'all') count++;
    if (photoFilter !== 'all') count++;
    return count;
  }, [searchQuery, permitFilter, provinceFilter, systemFilter, photoFilter]);

  // Current active sort option
  const currentSortOption = useMemo(
    () => SORT_OPTIONS.find((opt) => opt.value === sortBy) || SORT_OPTIONS[0],
    [sortBy]
  );

  // Close sort dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target)) {
        setIsSortOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsSortOpen(false);
      }
    };

    if (isSortOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSortOpen]);

  // Dynamic provinces list with counts
  const provincesList = useMemo(() => {
    const deletedTombstones = getDeletedSurveyIds();
    const map = new Map();
    recent.forEach((item) => {
      if (!item || locallyDeletedIds.has(item.recordId) || deletedTombstones.has(item.recordId)) return;
      const prov = item.province || item.fields?.province;
      if (prov && typeof prov === 'string' && prov.trim()) {
        const clean = prov.trim();
        map.set(clean, (map.get(clean) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [recent, locallyDeletedIds]);

  const filteredSurveys = useMemo(() => {
    const deletedTombstones = getDeletedSurveyIds();
    let list = recent.filter(
      (item) => item && !locallyDeletedIds.has(item.recordId) && !deletedTombstones.has(item.recordId)
    );

    // 1. Permit Filter
    if (permitFilter !== 'all') {
      list = list.filter((item) => {
        const p = item.permit || item.fields?.permit || '';
        if (permitFilter === 'อนุญาต') return p === 'อนุญาต' || p === 'on';
        if (permitFilter === 'ไม่อนุญาต') return p === 'ไม่อนุญาต';
        return p !== 'อนุญาต' && p !== 'on' && p !== 'ไม่อนุญาต';
      });
    }

    // 2. Province Filter
    if (provinceFilter !== 'all') {
      list = list.filter((item) => {
        const prov = (item.province || item.fields?.province || '').trim();
        return prov === provinceFilter;
      });
    }

    // 3. System Status Filter (Radio & Power)
    if (systemFilter !== 'all') {
      list = list.filter((item) => {
        const f = item.fields || {};
        const radio = f.radioStatus || 'ปกติ';
        const power = f.powerStatus || 'ปกติ';
        if (systemFilter === 'radio_ok') return radio === 'ปกติ';
        if (systemFilter === 'radio_issue') return radio !== 'ปกติ';
        if (systemFilter === 'power_ok') return power === 'ปกติ';
        if (systemFilter === 'power_issue') return power !== 'ปกติ';
        return true;
      });
    }

    // 4. Photos Filter
    if (photoFilter !== 'all') {
      list = list.filter((item) => {
        const hasPhotos = Array.isArray(item.photos) && item.photos.length > 0;
        if (photoFilter === 'with_photos') return hasPhotos;
        if (photoFilter === 'no_photos') return !hasPhotos;
        return true;
      });
    }

    // 5. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item) => {
        const fields = item.fields || {};
        const station = (item.station || fields.station || '').toLowerCase();
        const province = (item.province || fields.province || '').toLowerCase();
        const district = (fields.district || '').toLowerCase();
        const subdistrict = (fields.subdistrict || '').toLowerCase();
        const recordId = (item.recordId || '').toLowerCase();
        const contact = (fields.contactName || fields.informantName || '').toLowerCase();
        const operator = (fields.operatorName || '').toLowerCase();
        const summary = (fields.summary || '').toLowerCase();
        return (
          station.includes(q) ||
          province.includes(q) ||
          district.includes(q) ||
          subdistrict.includes(q) ||
          recordId.includes(q) ||
          contact.includes(q) ||
          operator.includes(q) ||
          summary.includes(q)
        );
      });
    }

    // 6. Sorting
    const sorted = [...list];
    sorted.sort((a, b) => {
      const aFields = a.fields || {};
      const bFields = b.fields || {};

      switch (sortBy) {
        case 'date_asc': {
          const timeA = new Date(a.savedAt || 0).getTime();
          const timeB = new Date(b.savedAt || 0).getTime();
          return timeA - timeB;
        }
        case 'date_desc': {
          const timeA = new Date(a.savedAt || 0).getTime();
          const timeB = new Date(b.savedAt || 0).getTime();
          return timeB - timeA;
        }
        case 'station_asc': {
          const nameA = String(a.station || aFields.station || '');
          const nameB = String(b.station || bFields.station || '');
          return nameA.localeCompare(nameB, 'th');
        }
        case 'station_desc': {
          const nameA = String(a.station || aFields.station || '');
          const nameB = String(b.station || bFields.station || '');
          return nameB.localeCompare(nameA, 'th');
        }
        case 'province_asc': {
          const provA = String(a.province || aFields.province || '');
          const provB = String(b.province || bFields.province || '');
          return provA.localeCompare(provB, 'th') || String(a.station || '').localeCompare(String(b.station || ''), 'th');
        }
        case 'province_desc': {
          const provA = String(a.province || aFields.province || '');
          const provB = String(b.province || bFields.province || '');
          return provB.localeCompare(provA, 'th') || String(a.station || '').localeCompare(String(b.station || ''), 'th');
        }
        case 'visitDate_desc': {
          const dateA = String(aFields.visitDate || a.savedAt || '');
          const dateB = String(bFields.visitDate || b.savedAt || '');
          return dateB.localeCompare(dateA);
        }
        case 'visitDate_asc': {
          const dateA = String(aFields.visitDate || a.savedAt || '');
          const dateB = String(bFields.visitDate || b.savedAt || '');
          return dateA.localeCompare(dateB);
        }
        case 'permit_asc': {
          const pA = a.permit || aFields.permit || '';
          const pB = b.permit || bFields.permit || '';
          return pA.localeCompare(pB, 'th');
        }
        case 'permit_desc': {
          const pA = a.permit || aFields.permit || '';
          const pB = b.permit || bFields.permit || '';
          return pB.localeCompare(pA, 'th');
        }
        default:
          return String(b.savedAt || '').localeCompare(String(a.savedAt || ''));
      }
    });

    return sorted;
  }, [recent, locallyDeletedIds, searchQuery, permitFilter, provinceFilter, systemFilter, photoFilter, sortBy]);

  const isFiltered =
    searchQuery.trim() !== '' ||
    permitFilter !== 'all' ||
    provinceFilter !== 'all' ||
    systemFilter !== 'all' ||
    photoFilter !== 'all' ||
    sortBy !== 'date_desc';

  const handleResetFilters = () => {
    setSearchQuery('');
    setPermitFilter('all');
    setProvinceFilter('all');
    setSystemFilter('all');
    setPhotoFilter('all');
    setSortBy('date_desc');
    setCurrentPage(1);
  };

  const handleHeaderSort = (field) => {
    setCurrentPage(1);
    if (field === 'station') {
      setSortBy((prev) => (prev === 'station_asc' ? 'station_desc' : 'station_asc'));
    } else if (field === 'province') {
      setSortBy((prev) => (prev === 'province_asc' ? 'province_desc' : 'province_asc'));
    } else if (field === 'date') {
      setSortBy((prev) => (prev === 'date_desc' ? 'date_asc' : 'date_desc'));
    } else if (field === 'permit') {
      setSortBy((prev) => (prev === 'permit_asc' ? 'permit_desc' : 'permit_asc'));
    }
  };

  const totalItems = filteredSurveys.length;
  const effectivePageSize = pageSize === 'all' ? totalItems || 1 : Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const startIndex = (safeCurrentPage - 1) * effectivePageSize;
  const endIndex = pageSize === 'all' ? totalItems : Math.min(startIndex + effectivePageSize, totalItems);
  const displayedItems = pageSize === 'all' ? filteredSurveys : filteredSurveys.slice(startIndex, endIndex);

  // Selection Logic
  const isAllSelected =
    displayedItems.length > 0 && displayedItems.every((item) => selectedIds.has(item.recordId));
  const isSomeSelected =
    displayedItems.some((item) => selectedIds.has(item.recordId)) && !isAllSelected;

  const handleToggleSelect = (recordId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isAllSelected) {
        displayedItems.forEach((item) => next.delete(item.recordId));
      } else {
        displayedItems.forEach((item) => next.add(item.recordId));
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds(new Set(filteredSurveys.map((item) => item.recordId)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleExportExcel = (customList) => {
    const listToExport = customList
      ? customList
      : selectedIds.size > 0
      ? recent.filter((r) => selectedIds.has(r.recordId) || (r.fields?.recordId && selectedIds.has(r.fields.recordId)))
      : filteredSurveys.length > 0
      ? filteredSurveys
      : recent;
    if (!listToExport || listToExport.length === 0) return;
    const filename =
      selectedIds.size > 0
        ? `SURVEY_SELECTED_${selectedIds.size}_STATIONS.xlsx`
        : `SURVEY_DATA_ALL_${listToExport.length}_STATIONS.xlsx`;
    exportSurveysToExcel(listToExport, filename);
  };

  const handleExportBatchPdf = () => {
    const listToExport =
      selectedIds.size > 0
        ? recent.filter((r) => selectedIds.has(r.recordId) || (r.fields?.recordId && selectedIds.has(r.fields.recordId)))
        : filteredSurveys.length > 0
        ? filteredSurveys
        : recent;
    if (!listToExport || listToExport.length === 0) return;
    setReportSurveys(listToExport);
  };

  const handleExecuteDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const idsToDelete = deleteTarget.isBatch
        ? deleteTarget.ids
        : [deleteTarget.recordId];

      // Instant UI removal: row disappears in 0ms!
      setLocallyDeletedIds((prev) => {
        const next = new Set(prev);
        idsToDelete.forEach((id) => next.add(id));
        return next;
      });

      // Remove from selection
      setSelectedIds((prev) => {
        const next = new Set(prev);
        idsToDelete.forEach((id) => next.delete(id));
        return next;
      });

      const result = await deleteSurveys(idsToDelete);

      const failed = Array.isArray(result?.failed) ? result.failed : [];
      if (failed.length > 0 && failed.some((f) => f.reason !== 'no_token_saved_locally')) {
        console.warn('[delete] failed remote records:', failed);
        toast.success(`ลบข้อมูลในเครื่องสำเร็จ (${idsToDelete.length} รายการ) แต่อาจต้องตรวจสอบการซิงค์ GitHub`);
      } else {
        toast.success(`ลบข้อมูลสำเร็จ ${idsToDelete.length} รายการ`);
      }

      setDeleteTarget(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('เกิดข้อผิดพลาดในการลบข้อมูล: ' + (err?.message || 'unknown error'));
    } finally {
      setIsDeleting(false);
    }
  };

  const getBadge = (permit) => {
    if (permit === 'อนุญาต') {
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border',
            isDark
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'bg-emerald-50 border-emerald-300 text-emerald-700'
          )}
        >
          <CheckCircle2 className="h-3 w-3" />
          {permit}
        </span>
      );
    }
    if (permit === 'ไม่อนุญาต') {
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border',
            isDark
              ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
              : 'bg-rose-50 border-rose-300 text-rose-700'
          )}
        >
          <XCircle className="h-3 w-3" />
          {permit}
        </span>
      );
    }
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border',
          isDark
            ? 'bg-purple-500/15 border-purple-500/30 text-purple-400'
            : 'bg-purple-50 border-purple-300 text-purple-700'
        )}
      >
        <AlertCircle className="h-3 w-3" />
        {permit || 'รอพิจารณา'}
      </span>
    );
  };

  return (
    <>
      <GlassCard className="flex flex-col" hoverEffect={false}>
        {/* Panel Title & Action */}
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 pb-4 border-b',
            isDark ? 'border-slate-800/80' : 'border-slate-200'
          )}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg',
                isDark ? 'bg-cyan-500/20 text-cyan-300' : 'bg-sky-100 text-sky-600'
              )}
            >
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                  <h2
                    className={cn(
                      'text-lg font-bold tracking-normal leading-tight',
                      isDark ? 'text-white' : 'text-slate-900'
                    )}
                  >
                    ประวัติการกรอกข้อมูลการตรวจเยี่ยมทั้งหมด
                  </h2>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-mono font-bold border flex items-center gap-1.5',
                    isDark
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  )}
                >
                  <span>เรียลไทม์</span>
                  <span className="opacity-40">•</span>
                  <span>{recent.length} สถานี</span>
                </span>
              </div>
              <p className={cn('text-xs mt-0.5', isDark ? 'text-slate-400' : 'text-slate-500')}>
                แสดงข้อมูลภาคสนามครบถ้วนทุกรายการแบบเรียลไทม์ คลิกที่ชื่อสถานีเพื่อดูรายละเอียดและภาพถ่าย หรือเลือกเพื่อ Export
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Export PDF Button (All or Selected) */}
            <button
              type="button"
              onClick={handleExportBatchPdf}
              className={cn(
                'group inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer shadow-2xs',
                selectedIds.size > 0
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white border-cyan-400 shadow-md'
                  : isDark
                  ? 'border-cyan-500/30 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-600/30 hover:border-cyan-400 hover:text-white'
                  : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-400'
              )}
              title={
                selectedIds.size > 0
                  ? `เปิดพรีวิวและดาวน์โหลด/พิมพ์ PDF รายงานทางการสำหรับ ${selectedIds.size} สถานีที่เลือก`
                  : `เปิดพรีวิวและดาวน์โหลด/พิมพ์ PDF รายงานทางการทั้งหมด (${recent.length} สถานี พร้อมรูปถ่าย)`
              }
            >
              <FileDown className="h-3.5 w-3.5" />
              <span>
                {selectedIds.size > 0
                  ? `Export PDF ที่เลือก (${selectedIds.size})`
                  : `Export PDF ทั้งหมด (${recent.length})`}
              </span>
            </button>

            {/* Export Excel Button */}
            <button
              type="button"
              onClick={() => handleExportExcel()}
              className={cn(
                'group inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer shadow-2xs',
                selectedIds.size > 0
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-md hover:bg-emerald-500'
                  : isDark
                  ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-600/30 hover:border-emerald-400 hover:text-white'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400'
              )}
              title={
                selectedIds.size > 0
                  ? `ส่งออกไฟล์ Excel สำหรับ ${selectedIds.size} สถานีที่เลือก`
                  : `ส่งออกผลการสำรวจทั้งหมดเป็นไฟล์ Excel (.xlsx)`
              }
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>
                {selectedIds.size > 0
                  ? `Excel ที่เลือก (${selectedIds.size})`
                  : `Export Excel (${recent.length})`}
              </span>
            </button>

            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('field')}
                className={cn(
                  'group inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer',
                  isDark
                    ? 'border-blue-500/30 bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 hover:border-blue-500/50 hover:text-white'
                    : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-400 shadow-2xs'
                )}
              >
                <span>บันทึกใหม่</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>

        {/* Floating Batch Actions Bar when items are selected */}
        {selectedIds.size > 0 && (
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 p-2.5 px-4 rounded-xl border mt-1 mb-2 transition-all shadow-sm',
              isDark
                ? 'bg-gradient-to-r from-cyan-950/70 via-slate-900/90 to-blue-950/70 border-cyan-500/40 text-cyan-200'
                : 'bg-gradient-to-r from-sky-50 via-white to-blue-50 border-sky-300 text-sky-900'
            )}
          >
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 font-bold">
                ✓
              </span>
              <span>
                เลือกแล้ว{' '}
                <strong className={cn('font-mono font-bold', isDark ? 'text-cyan-300' : 'text-sky-700')}>
                  {selectedIds.size}
                </strong>{' '}
                รายการ
              </span>
              <span className="opacity-40">•</span>
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-xs underline hover:text-cyan-300 cursor-pointer font-medium opacity-85"
              >
                เลือกทั้งหมดในผลค้นหา ({filteredSurveys.length})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Batch PDF Export / Print */}
              <button
                type="button"
                onClick={handleExportBatchPdf}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md hover:from-blue-500 hover:to-cyan-400 cursor-pointer transition-all border border-cyan-400/40"
                title="เปิดพรีวิวและดาวน์โหลด/พิมพ์เอกสารรายงาน A4 ทางการ (PDF) สำหรับสถานีที่เลือก"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>Export PDF ที่เลือก ({selectedIds.size})</span>
              </button>

              {/* Batch Excel Export */}
              <button
                type="button"
                onClick={() => handleExportExcel()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-md cursor-pointer transition-all border border-emerald-500/40"
                title="ส่งออกรายการที่เลือกเป็นไฟล์ Excel (.xlsx)"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Excel ({selectedIds.size})</span>
              </button>

              {/* Batch Delete */}
              <button
                type="button"
                onClick={() =>
                  setDeleteTarget({
                    isBatch: true,
                    count: selectedIds.size,
                    ids: Array.from(selectedIds),
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600/90 hover:bg-rose-500 text-white shadow-md cursor-pointer transition-all border border-rose-500/40"
                title="ลบรายการที่เลือกทั้งหมดออกจากระบบ"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>ลบที่เลือก ({selectedIds.size})</span>
              </button>

              {/* Clear Selection */}
              <button
                type="button"
                onClick={handleClearSelection}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer',
                  isDark
                    ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                )}
                title="ยกเลิกการเลือกทั้งหมด"
              >
                <X className="h-3 w-3" />
                <span>ยกเลิก</span>
              </button>
            </div>
          </div>
        )}

        {/* Toolbar: Count info, Filters, Sort & Page Size Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-1 text-xs">
          <div className={cn('font-medium flex items-center gap-2 flex-wrap', isDark ? 'text-slate-400' : 'text-slate-600')}>
            <span>
              แสดง{' '}
              <span className={cn('font-bold font-mono', isDark ? 'text-cyan-300' : 'text-sky-600')}>
                {totalItems > 0 ? startIndex + 1 : 0} - {endIndex}
              </span>{' '}
              จาก{isFiltered ? 'ที่ค้นพบ ' : 'ทั้งหมด '}
              <span className={cn('font-bold font-mono', isDark ? 'text-cyan-300' : 'text-sky-600')}>
                {totalItems}
              </span>{' '}
              สถานี
              {isFiltered && (
                <span className={cn('ml-1', isDark ? 'text-slate-500' : 'text-slate-400')}>
                  (จากประวัติทั้งหมด {recent.length} สถานี)
                </span>
              )}
            </span>

            {/* Real-time Indicator Pill */}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border',
                isDark
                  ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              )}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>เรียลไทม์</span>
            </span>
          </div>

          {/* Quick Toolbar Actions: Filter Button, Sort Dropdown Button, Quick Reset, Page Size */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setIsFilterOpen((prev) => !prev)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-2xs',
                isFilterOpen || activeFilterCount > 0
                  ? isDark
                    ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300 shadow-cyan-950/40'
                    : 'bg-sky-50 border-sky-400 text-sky-800 shadow-sky-100'
                  : isDark
                    ? 'border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900'
              )}
              title={isFilterOpen ? 'ซ่อนแผงตัวกรอง' : 'เปิดแผงตัวกรองข้อมูล'}
              aria-expanded={isFilterOpen}
            >
              <Filter className={cn('h-3.5 w-3.5 transition-transform', isFilterOpen && 'scale-110 text-cyan-400')} />
              <span>กรองข้อมูล</span>
              {activeFilterCount > 0 && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-[18px] h-4.5 px-1 rounded-full text-[10px] font-bold font-mono',
                    isDark
                      ? 'bg-cyan-400 text-slate-950'
                      : 'bg-sky-600 text-white'
                  )}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Sort Dropdown Button */}
            <div className="relative" ref={sortDropdownRef}>
              <button
                type="button"
                onClick={() => setIsSortOpen((prev) => !prev)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-2xs',
                  isSortOpen || sortBy !== 'date_desc'
                    ? isDark
                      ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300 shadow-cyan-950/40'
                      : 'bg-sky-50 border-sky-400 text-sky-800 shadow-sky-100'
                    : isDark
                      ? 'border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                )}
                title="จัดเรียงข้อมูลตามเงื่อนไขต่างๆ"
                aria-expanded={isSortOpen}
              >
                <ArrowUpDown className="h-3.5 w-3.5 text-cyan-500" />
                <span>Sort: {currentSortOption.shortLabel}</span>
                <ChevronDown className={cn('h-3 w-3 opacity-60 transition-transform', isSortOpen && 'rotate-180')} />
              </button>

              {/* Sort Dropdown Menu */}
              {isSortOpen && (
                <div
                  className={cn(
                    'absolute right-0 top-full mt-1.5 w-64 rounded-xl border shadow-xl z-30 p-1.5 flex flex-col gap-0.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150',
                    isDark
                      ? 'bg-slate-900/95 border-slate-700 text-slate-200 shadow-black/60'
                      : 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-300/50'
                  )}
                >
                  <div className={cn('px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider border-b mb-1 flex items-center justify-between', isDark ? 'text-slate-400 border-slate-800' : 'text-slate-500 border-slate-100')}>
                    <span>จัดเรียงตาม (Sort by)</span>
                    <span className="text-[10px] font-normal lowercase opacity-75">คลิกเพื่อเลือก</span>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
                    {SORT_OPTIONS.map((opt) => {
                      const isSelected = sortBy === opt.value;
                      const IconComp = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setSortBy(opt.value);
                            setCurrentPage(1);
                            setIsSortOpen(false);
                          }}
                          className={cn(
                            'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left',
                            isSelected
                              ? isDark
                                ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                                : 'bg-sky-100 text-sky-800 font-bold'
                              : isDark
                                ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <IconComp className={cn('h-3.5 w-3.5', isSelected ? (isDark ? 'text-cyan-400' : 'text-sky-600') : 'opacity-50')} />
                            <span>{opt.label}</span>
                          </div>
                          {isSelected && <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Clear Filters Button (shown whenever filters or sort are non-default) */}
            {isFiltered && (
              <button
                type="button"
                onClick={handleResetFilters}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-2xs',
                  isDark
                    ? 'border-amber-500/40 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 hover:text-white'
                    : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:border-amber-400'
                )}
                title="ล้างตัวกรองและการจัดเรียงทั้งหมดกลับเป็นค่าเริ่มต้น"
              >
                <RotateCcw className="h-3 w-3" />
                <span className="hidden sm:inline">ล้างตัวกรอง</span>
              </button>
            )}

            {/* Quick Page Size Buttons */}
            <div
              className={cn(
                'inline-flex items-center gap-1 p-0.5 rounded-xl border text-xs',
                isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-300 bg-slate-100'
              )}
            >
              <span className={cn('px-2 text-[11px] font-semibold', isDark ? 'text-slate-400' : 'text-slate-500')}>
                แสดง:
              </span>
              {[
                { label: `ทั้งหมด (${totalItems})`, value: 'all' },
                { label: '50', value: 50 },
                { label: '25', value: 25 },
                { label: '10', value: 10 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setPageSize(opt.value);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                    pageSize === opt.value
                      ? isDark
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow-xs'
                        : 'bg-sky-600 text-white font-bold shadow-xs'
                      : isDark
                        ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Expandable Filter Panel */}
        {isFilterOpen && (
          <div
            className={cn(
              'p-3 sm:p-4 rounded-xl border mt-1 mb-2 flex flex-col gap-3 transition-all duration-200',
              isDark
                ? 'bg-slate-900/90 border-slate-800 shadow-lg shadow-black/40'
                : 'bg-slate-50/90 border-slate-200 shadow-sm'
            )}
          >
            {/* Filter Panel Header / Row 1: Search + Province + Clear + Close */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
              {/* Search Box */}
              <div className="relative flex-1 min-w-[220px]">
                <Search
                  className={cn(
                    'absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5',
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  )}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="ค้นหาสถานี, จังหวัด, อำเภอ, รหัส, ผู้แจ้ง, ช่าง..."
                  className={cn(
                    'w-full pl-8 pr-7 py-1.5 rounded-lg border text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500',
                    isDark
                      ? 'border-slate-700 bg-slate-900/90 text-slate-100 placeholder:text-slate-500 hover:border-slate-600'
                      : 'border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 hover:border-slate-400 shadow-2xs'
                  )}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                    className={cn(
                      'absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full transition-colors cursor-pointer',
                      isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800'
                    )}
                    title="ล้างคำค้นหา"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Province Dropdown Filter */}
                <div className="relative flex items-center">
                  <MapPin className={cn('absolute left-2.5 h-3.5 w-3.5 pointer-events-none', isDark ? 'text-cyan-400' : 'text-sky-600')} />
                  <select
                    value={provinceFilter}
                    onChange={(e) => {
                      setProvinceFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className={cn(
                      'pl-8 pr-7 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none bg-no-repeat bg-right',
                      isDark
                        ? 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600'
                        : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 shadow-2xs'
                    )}
                    title="กรองตามจังหวัด"
                  >
                    <option value="all">
                      ทุกจังหวัด ({provincesList.reduce((acc, p) => acc + p.count, 0)})
                    </option>
                    {provincesList.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} ({p.count})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reset Filters in Panel */}
                {isFiltered && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer shadow-2xs',
                      isDark
                        ? 'border-amber-500/40 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 hover:text-white'
                        : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:border-amber-400'
                    )}
                    title="ล้างตัวกรองและการจัดเรียงทั้งหมดกลับเป็นค่าเริ่มต้น"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>ล้างตัวกรอง</span>
                  </button>
                )}

                {/* Close filter panel button */}
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(false)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer',
                    isDark
                      ? 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                  )}
                  title="ปิดแผงตัวกรอง"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>ปิด</span>
                </button>
              </div>
            </div>

            {/* Row 2: Secondary Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
              {/* Permit Filter Pills */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className={cn('text-[11px] font-semibold mr-0.5', isDark ? 'text-slate-400' : 'text-slate-500')}>
                  ขออนุญาต:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPermitFilter('all');
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'px-2 py-0.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border',
                    permitFilter === 'all'
                      ? isDark
                        ? 'bg-blue-600/30 border-blue-500/50 text-white font-semibold'
                        : 'bg-sky-100 border-sky-300 text-sky-800 font-semibold'
                      : isDark
                      ? 'border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  )}
                >
                  ทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPermitFilter('อนุญาต');
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'px-2 py-0.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border inline-flex items-center gap-1',
                    permitFilter === 'อนุญาต'
                      ? isDark
                        ? 'bg-emerald-500/25 border-emerald-500/50 text-emerald-300 font-semibold'
                        : 'bg-emerald-50 border-emerald-400 text-emerald-800 font-semibold'
                      : isDark
                      ? 'border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-emerald-400'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-emerald-50'
                  )}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  <span>อนุญาต</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPermitFilter('ไม่อนุญาต');
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'px-2 py-0.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border inline-flex items-center gap-1',
                    permitFilter === 'ไม่อนุญาต'
                      ? isDark
                        ? 'bg-rose-500/25 border-rose-500/50 text-rose-300 font-semibold'
                        : 'bg-rose-50 border-rose-400 text-rose-800 font-semibold'
                      : isDark
                      ? 'border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-rose-400'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-rose-50'
                  )}
                >
                  <XCircle className="h-3 w-3" />
                  <span>ไม่อนุญาต</span>
                </button>
              </div>

              <span className={cn('hidden sm:inline', isDark ? 'text-slate-700' : 'text-slate-300')}>|</span>

              {/* Photo Filter Pills */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className={cn('text-[11px] font-semibold mr-0.5', isDark ? 'text-slate-400' : 'text-slate-500')}>
                  รูปถ่าย:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoFilter('all');
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'px-2 py-0.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border',
                    photoFilter === 'all'
                      ? isDark
                        ? 'bg-cyan-600/30 border-cyan-500/50 text-cyan-200 font-semibold'
                        : 'bg-cyan-100 border-cyan-300 text-cyan-800 font-semibold'
                      : isDark
                      ? 'border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  )}
                >
                  ทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoFilter('with_photos');
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'px-2 py-0.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border inline-flex items-center gap-1',
                    photoFilter === 'with_photos'
                      ? isDark
                        ? 'bg-cyan-500/25 border-cyan-500/50 text-cyan-300 font-semibold'
                        : 'bg-sky-100 border-sky-400 text-sky-800 font-semibold'
                      : isDark
                      ? 'border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-cyan-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-sky-50'
                  )}
                >
                  <ImageIcon className="h-3 w-3" />
                  <span>มีรูปภาพ</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoFilter('no_photos');
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'px-2 py-0.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border',
                    photoFilter === 'no_photos'
                      ? isDark
                        ? 'bg-slate-700/60 border-slate-600 text-white font-semibold'
                        : 'bg-slate-200 border-slate-300 text-slate-800 font-semibold'
                      : isDark
                      ? 'border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  )}
                >
                  ไม่มีรูป
                </button>
              </div>

              <span className={cn('hidden sm:inline', isDark ? 'text-slate-700' : 'text-slate-300')}>|</span>

              {/* System Status Filter Pills */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className={cn('text-[11px] font-semibold mr-0.5', isDark ? 'text-slate-400' : 'text-slate-500')}>
                  ระบบ:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSystemFilter('all');
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'px-2 py-0.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border',
                    systemFilter === 'all'
                      ? isDark
                        ? 'bg-blue-600/30 border-blue-500/50 text-white font-semibold'
                        : 'bg-sky-100 border-sky-300 text-sky-800 font-semibold'
                      : isDark
                      ? 'border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  )}
                >
                  ทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSystemFilter('radio_issue');
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'px-2 py-0.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border inline-flex items-center gap-1',
                    systemFilter === 'radio_issue'
                      ? isDark
                        ? 'bg-amber-500/25 border-amber-500/50 text-amber-300 font-semibold'
                        : 'bg-amber-100 border-amber-400 text-amber-800 font-semibold'
                      : isDark
                      ? 'border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-amber-400'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-amber-50'
                  )}
                  title="กรองเฉพาะสถานีที่วิทยุสื่อสารมีปัญหา"
                >
                  <AlertCircle className="h-3 w-3" />
                  <span>วิทยุมีปัญหา</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSystemFilter('power_issue');
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'px-2 py-0.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border inline-flex items-center gap-1',
                    systemFilter === 'power_issue'
                      ? isDark
                        ? 'bg-amber-500/25 border-amber-500/50 text-amber-300 font-semibold'
                        : 'bg-amber-100 border-amber-400 text-amber-800 font-semibold'
                      : isDark
                      ? 'border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-amber-400'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-amber-50'
                  )}
                  title="กรองเฉพาะสถานีที่ระบบไฟฟ้ามีปัญหา"
                >
                  <AlertCircle className="h-3 w-3" />
                  <span>ไฟฟ้ามีปัญหา</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table Container with scrollbar */}
        <div
          className={cn(
            'overflow-x-auto overflow-y-auto rounded-xl border mt-2 custom-scrollbar transition-colors shadow-2xs',
            pageSize === 'all' ? 'max-h-[720px]' : 'max-h-[500px]',
            isDark ? 'border-slate-800/80 bg-slate-950/20' : 'border-slate-200 bg-white'
          )}
        >
          <table className="w-full text-left text-sm relative border-collapse">
            <thead
              className={cn(
                'sticky top-0 z-10 backdrop-blur-md shadow-xs',
                isDark ? 'bg-slate-900/95 text-slate-400' : 'bg-slate-50/95 text-slate-500'
              )}
            >
              <tr className={cn('border-b text-xs font-semibold', isDark ? 'border-slate-800' : 'border-slate-200')}>
                {/* Select All Checkbox */}
                <th className="py-2.5 pl-3 pr-1 w-9 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeSelected;
                    }}
                    onChange={handleToggleSelectAll}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900/60 text-cyan-500 focus:ring-cyan-500 cursor-pointer accent-cyan-500"
                    title={isAllSelected ? 'ยกเลิกการเลือกทั้งหมด' : 'เลือกทั้งหมดในหน้านี้'}
                    aria-label="เลือกทั้งหมดในหน้านี้"
                  />
                </th>
                <th className="py-2.5 px-2 text-center w-10">#</th>
                <th className="py-2.5 pr-3 pl-2">รหัสรายการ</th>
                <th
                  onClick={() => handleHeaderSort('station')}
                  className={cn(
                    'py-2.5 px-3 cursor-pointer select-none transition-colors group',
                    isDark ? 'hover:text-cyan-300' : 'hover:text-sky-700'
                  )}
                  title="คลิกเพื่อจัดเรียงตามชื่อสถานี"
                >
                  <div className="flex items-center gap-1.5">
                    <span>สถานี / ข้อมูลติดต่อ</span>
                    {sortBy === 'station_asc' ? (
                      <ArrowUp className="h-3.5 w-3.5 text-cyan-400" />
                    ) : sortBy === 'station_desc' ? (
                      <ArrowDown className="h-3.5 w-3.5 text-cyan-400" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-75" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('province')}
                  className={cn(
                    'py-2.5 px-3 cursor-pointer select-none transition-colors group',
                    isDark ? 'hover:text-cyan-300' : 'hover:text-sky-700'
                  )}
                  title="คลิกเพื่อจัดเรียงตามจังหวัด"
                >
                  <div className="flex items-center gap-1.5">
                    <span>จังหวัด / อำเภอ</span>
                    {sortBy === 'province_asc' ? (
                      <ArrowUp className="h-3.5 w-3.5 text-cyan-400" />
                    ) : sortBy === 'province_desc' ? (
                      <ArrowDown className="h-3.5 w-3.5 text-cyan-400" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-75" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('permit')}
                  className={cn(
                    'py-2.5 px-3 text-center cursor-pointer select-none transition-colors group',
                    isDark ? 'hover:text-cyan-300' : 'hover:text-sky-700'
                  )}
                  title="คลิกเพื่อจัดเรียงตามผลขออนุญาต"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>ผลการขออนุญาต</span>
                    {sortBy === 'permit_asc' ? (
                      <ArrowUp className="h-3.5 w-3.5 text-cyan-400" />
                    ) : sortBy === 'permit_desc' ? (
                      <ArrowDown className="h-3.5 w-3.5 text-cyan-400" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-75" />
                    )}
                  </div>
                </th>
                <th className="py-2.5 px-3 text-center">ระบบวิทยุ / ไฟฟ้า</th>
                <th className="py-2.5 px-3 text-center">รูปภาพ</th>
                <th
                  onClick={() => handleHeaderSort('date')}
                  className={cn(
                    'py-2.5 px-3 text-right cursor-pointer select-none transition-colors group',
                    isDark ? 'hover:text-cyan-300' : 'hover:text-sky-700'
                  )}
                  title="คลิกเพื่อจัดเรียงตามเวลาบันทึก"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>เวลาบันทึก</span>
                    {sortBy === 'date_desc' ? (
                      <ArrowDown className="h-3.5 w-3.5 text-cyan-400" />
                    ) : sortBy === 'date_asc' ? (
                      <ArrowUp className="h-3.5 w-3.5 text-cyan-400" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-75" />
                    )}
                  </div>
                </th>
                <th className="py-2.5 pl-3 pr-3 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className={cn('divide-y', isDark ? 'divide-slate-800/50' : 'divide-slate-200')}>
              {displayedItems.length > 0 ? (
                displayedItems.map((item, rowIdx) => {
                  const isSelected = selectedIds.has(item.recordId);
                  const f = item.fields || {};
                  return (
                    <tr
                      key={item.recordId}
                      className={cn(
                        'transition-colors',
                        isSelected
                          ? isDark
                            ? 'bg-cyan-500/10 hover:bg-cyan-500/15'
                            : 'bg-sky-50/80 hover:bg-sky-100/60'
                          : isDark
                          ? 'hover:bg-slate-800/30'
                          : 'hover:bg-sky-50/50'
                      )}
                    >
                      {/* Checkbox column */}
                      <td className="py-3 pl-3 pr-1 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.recordId)}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-900/60 text-cyan-500 focus:ring-cyan-500 cursor-pointer accent-cyan-500"
                          title={`เลือกสถานี ${item.station}`}
                          aria-label={`เลือกสถานี ${item.station}`}
                        />
                      </td>

                      {/* Row index # */}
                      <td className="py-3 px-2 text-center text-xs font-mono opacity-50">
                        {startIndex + rowIdx + 1}
                      </td>

                      {/* Clickable Record ID */}
                      <td className="py-3 pr-3 pl-2 font-mono text-xs">
                        <button
                          type="button"
                          onClick={() => setSelectedPreview(item)}
                          className={cn(
                            'group inline-flex items-center gap-1.5 transition-colors font-mono cursor-pointer text-left',
                            isDark ? 'text-cyan-400 hover:text-cyan-300' : 'text-sky-600 hover:text-sky-700'
                          )}
                          title="คลิกเพื่อพรีวิวข้อมูลที่กรอกและรูปภาพ"
                        >
                          <span className="group-hover:underline underline-offset-2 font-semibold">
                            {item.recordId}
                          </span>
                          <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                        </button>
                      </td>

                      {/* Clickable Station Name + Contact & Phone */}
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => setSelectedPreview(item)}
                          className={cn(
                            'text-left font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 flex-wrap',
                            isDark ? 'text-slate-200 hover:text-cyan-300' : 'text-slate-800 hover:text-sky-600'
                          )}
                          title="คลิกเพื่อพรีวิวข้อมูลที่กรอกและรูปภาพ"
                        >
                          <span className="hover:underline underline-offset-2 font-semibold text-sm">
                            {item.station}
                          </span>
                        </button>
                        <div className={cn('text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap', isDark ? 'text-slate-400' : 'text-slate-500')}>
                          <span>
                            ผู้ให้ข้อมูล:{' '}
                            <span className={cn('font-medium', isDark ? 'text-slate-300' : 'text-slate-700')}>
                              {f.contactName || f.informantName || '-'}
                            </span>
                          </span>
                          {(f.contactPhone || f.contact_phone) && (
                            <>
                              <span className="opacity-40">•</span>
                              <span className="font-mono text-cyan-400/90">{f.contactPhone || f.contact_phone}</span>
                            </>
                          )}
                          {f.operatorName && (
                            <>
                              <span className="opacity-40">•</span>
                              <span>ช่าง: {f.operatorName}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Province & District */}
                      <td className={cn('py-3 px-3 text-xs', isDark ? 'text-slate-300' : 'text-slate-700')}>
                        <div className="font-medium">{item.province}</div>
                        {f.district && <div className="text-[11px] opacity-75">อ.{f.district}</div>}
                      </td>

                      {/* Permit Badge */}
                      <td className="py-3 px-3 text-center">{getBadge(item.permit)}</td>

                      {/* Radio & Power Status */}
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex flex-col gap-1 items-center">
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10.5px] font-medium border',
                              f.radioStatus === 'ปกติ' || !f.radioStatus
                                ? isDark
                                  ? 'border-emerald-500/30 text-emerald-300 bg-emerald-950/30'
                                  : 'border-emerald-300 text-emerald-700 bg-emerald-50'
                                : isDark
                                  ? 'border-amber-500/40 text-amber-300 bg-amber-950/40'
                                  : 'border-amber-300 text-amber-700 bg-amber-50'
                            )}
                          >
                            วิทยุ: {f.radioStatus || 'ปกติ'}
                          </span>
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10.5px] font-medium border',
                              f.powerStatus === 'ปกติ' || !f.powerStatus
                                ? isDark
                                  ? 'border-sky-500/30 text-sky-300 bg-blue-950/30'
                                  : 'border-sky-300 text-sky-700 bg-sky-50'
                                : isDark
                                  ? 'border-amber-500/40 text-amber-300 bg-amber-950/40'
                                  : 'border-amber-300 text-amber-700 bg-amber-50'
                            )}
                          >
                            ไฟ: {f.powerStatus || 'ปกติ'}
                          </span>
                        </div>
                      </td>

                      {/* Photos Thumbnail Badge */}
                      <td className="py-3 px-3 text-center">
                        {item.photos && item.photos.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setSelectedPreview(item)}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium border transition-all cursor-pointer hover:scale-105 shadow-2xs',
                              isDark
                                ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25'
                                : 'bg-sky-100 border-sky-300 text-sky-700 hover:bg-sky-200'
                            )}
                            title={`คลิกเพื่อดูรูปถ่าย ${item.photos.length} รูป`}
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                            <span>{item.photos.length} รูป</span>
                          </button>
                        ) : (
                          <span className="text-xs opacity-40">-</span>
                        )}
                      </td>

                      {/* Saved Time / Visit Date */}
                      <td
                        className={cn(
                          'py-3 px-3 text-right text-xs',
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        )}
                      >
                        {f.visitDate ? (
                          <div>
                            <div className={cn('font-medium', isDark ? 'text-slate-200' : 'text-slate-800')}>
                              {f.visitDate}
                            </div>
                            <div className="text-[10.5px] opacity-75 font-mono">
                              {new Date(item.savedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} {new Date(item.savedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        ) : (
                          new Date(item.savedAt).toLocaleString('th-TH', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 pl-3 pr-3 text-center">
                        <div className="flex items-center justify-center gap-1 flex-nowrap">
                          {/* Preview Details Button */}
                          <button
                            type="button"
                            onClick={() => setSelectedPreview(item)}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-all cursor-pointer shadow-2xs',
                              isDark
                                ? 'border-sky-500/40 bg-sky-950/40 text-sky-300 hover:bg-sky-600/30 hover:border-sky-400 hover:text-white'
                                : 'border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 hover:border-sky-400'
                            )}
                            title="ดูรายละเอียดข้อมูลทั้งหมดและภาพถ่าย"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span className="hidden xl:inline">ดูข้อมูล</span>
                          </button>

                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (onEditSurvey) onEditSurvey(item);
                              else if (onNavigate) onNavigate('field', item);
                            }}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-all cursor-pointer shadow-2xs',
                              isDark
                                ? 'border-amber-500/40 bg-amber-950/40 text-amber-300 hover:bg-amber-600/30 hover:border-amber-400 hover:text-white'
                                : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:border-amber-400'
                            )}
                            title="แก้ไขข้อมูลการตรวจเยี่ยมนี้"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="hidden xl:inline">แก้ไข</span>
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-all cursor-pointer shadow-2xs',
                              isDark
                                ? 'border-rose-500/40 bg-rose-950/40 text-rose-300 hover:bg-rose-600/30 hover:border-rose-400 hover:text-white'
                                : 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 hover:border-rose-400'
                            )}
                            title="ลบรายการนี้"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="hidden xl:inline">ลบ</span>
                          </button>

                          {/* Export Official A4 Button */}
                          <button
                            type="button"
                            onClick={() => setReportSurveys([item])}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-all cursor-pointer shadow-2xs',
                              isDark
                                ? 'border-cyan-500/30 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-600/30 hover:border-cyan-400 hover:text-white'
                                : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-400'
                            )}
                            title="ส่งออกรายงาน A4 ทางการ (Export PDF / Print)"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            <span className="hidden xl:inline">A4</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className={cn('py-8 text-center', isDark ? 'text-slate-500' : 'text-slate-400')}>
                    {isFiltered ? (
                      <div className="flex flex-col items-center gap-2">
                        <span>ไม่พบข้อมูลที่ตรงกับคำค้นหาหรือตัวกรอง</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setPermitFilter('all');
                          }}
                          className={cn(
                            'text-xs underline font-medium cursor-pointer',
                            isDark ? 'text-cyan-400 hover:text-cyan-300' : 'text-sky-600 hover:text-sky-800'
                          )}
                        >
                          ล้างตัวกรองทั้งหมด
                        </button>
                      </div>
                    ) : (
                      'ยังไม่มีผลสำรวจ'
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer: Pagination or All-Items Status */}
        {pageSize === 'all' ? (
          <div
            className={cn(
              'flex items-center justify-between pt-3 mt-2 border-t text-xs',
              isDark ? 'border-slate-800/60 text-slate-400' : 'border-slate-200 text-slate-600'
            )}
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>
                กำลังแสดงข้อมูลครบถ้วนทั้งหมด <strong>{totalItems}</strong> สถานี (อัปเดตเรียลไทม์)
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPageSize(25);
                setCurrentPage(1);
              }}
              className="text-xs text-sky-400 hover:underline cursor-pointer"
            >
              สลับเป็นแบ่งหน้า (25 สถานี/หน้า)
            </button>
          </div>
        ) : totalPages > 1 ? (
          <div
            className={cn(
              'flex items-center justify-between pt-3 mt-2 border-t text-xs',
              isDark ? 'border-slate-800/60 text-slate-400' : 'border-slate-200 text-slate-600'
            )}
          >
            <div className="font-medium">
              หน้า <span className="font-bold font-mono">{safeCurrentPage}</span> จาก{' '}
              <span className="font-bold font-mono">{totalPages}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-xs',
                  isDark
                    ? 'border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-2xs'
                )}
                title="หน้าก่อนหน้า"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>ก่อนหน้า</span>
              </button>

              <div className="hidden sm:flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                  .filter((pageNum) => {
                    if (totalPages <= 5) return true;
                    return (
                      pageNum === 1 ||
                      pageNum === totalPages ||
                      Math.abs(pageNum - safeCurrentPage) <= 1
                    );
                  })
                  .map((pageNum, idx, arr) => {
                    const prevNum = arr[idx - 1];
                    const showEllipsis = prevNum && pageNum - prevNum > 1;
                    return (
                      <React.Fragment key={pageNum}>
                        {showEllipsis && <span className="px-1 text-slate-500">...</span>}
                        <button
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          className={cn(
                            'h-7 min-w-[1.75rem] px-1.5 rounded-md text-xs font-mono font-semibold transition-colors cursor-pointer',
                            safeCurrentPage === pageNum
                              ? isDark
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                : 'bg-sky-100 text-sky-700 border border-sky-300'
                              : isDark
                              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          )}
                        >
                          {pageNum}
                        </button>
                      </React.Fragment>
                    );
                  })}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-xs',
                  isDark
                    ? 'border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-2xs'
                )}
                title="หน้าถัดไป"
              >
                <span>ถัดไป</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}
      </GlassCard>

      {/* Survey Preview Modal (Detail & Photos with Download) */}
      <SurveyPreviewModal
        isOpen={Boolean(selectedPreview)}
        onClose={() => setSelectedPreview(null)}
        surveyData={selectedPreview || {}}
        onOpenOfficialReport={(reportData) => {
          setSelectedPreview(null);
          setReportSurveys([reportData]);
        }}
        onEdit={(item) => {
          setSelectedPreview(null);
          if (onEditSurvey) onEditSurvey(item);
          else if (onNavigate) onNavigate('field', item);
        }}
        onDelete={(item) => {
          setSelectedPreview(null);
          setDeleteTarget(item);
        }}
      />

      {/* Unified Official A4 Printable Report Modal */}
      <SurveyReportModal
        isOpen={Boolean(reportSurveys && reportSurveys.length > 0)}
        onClose={() => setReportSurveys(null)}
        surveys={reportSurveys || []}
      />

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md overflow-y-auto">
          <div
            className={cn(
              'relative w-full max-w-md rounded-2xl border p-6 shadow-2xl transition-colors',
              isDark
                ? 'border-rose-500/40 bg-slate-900 text-slate-100 shadow-rose-950/40'
                : 'border-rose-300 bg-white text-slate-900 shadow-xl'
            )}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold">
                  {deleteTarget.isBatch
                    ? 'ยืนยันการลบข้อมูลหลายรายการ'
                    : 'ยืนยันการลบข้อมูลการตรวจเยี่ยม'}
                </h3>
                <p className={cn('mt-2 text-xs leading-relaxed', isDark ? 'text-slate-300' : 'text-slate-600')}>
                  {deleteTarget.isBatch ? (
                    <>
                      คุณต้องการลบข้อมูลการตรวจเยี่ยมที่เลือกจำนวน{' '}
                      <strong className="text-rose-400 font-bold font-mono">{deleteTarget.count}</strong> สถานี
                      ออกจากระบบหรือไม่?
                    </>
                  ) : (
                    <>
                      คุณต้องการลบข้อมูลการตรวจเยี่ยมสถานี{' '}
                      <strong className="text-rose-400 font-bold">{deleteTarget.station}</strong>{' '}
                      (รหัส: <span className="font-mono text-cyan-400 font-semibold">{deleteTarget.recordId}</span>) หรือไม่?
                    </>
                  )}
                </p>
                <div
                  className={cn(
                    'mt-3 rounded-lg border p-2.5 text-[11px] font-medium leading-relaxed',
                    isDark ? 'border-rose-500/30 bg-rose-950/30 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-700'
                  )}
                >
                  ⚠️ ข้อมูลบันทึกและรูปภาพแนบทั้งหมดจะถูกลบออกจากฐานข้อมูลและไฟล์ถาวร ไม่สามารถกู้คืนได้
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className={cn(
                  'rounded-xl border px-4 py-2 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50',
                  isDark
                    ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                )}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleExecuteDelete}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:from-rose-500 hover:to-red-500 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>กำลังลบ...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>ยืนยันการลบ</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
