import React, { useState, useMemo, useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  X,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Radio,
  MapPin,
  Calendar,
  User,
  FileText,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Filter,
  RotateCcw,
  Sparkles,
  Phone,
  Building,
  Check,
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import { fetchStations, normalizeStationKey, STATION_ALIASES } from '@/lib/api';
import { SurveyPreviewModal } from '@/components/dashboard/SurveyPreviewModal';

const CATEGORY_CONFIG = {
  total: {
    key: 'total',
    title: 'สถานีวิทยุคมนาคมทั้งหมดในระบบ',
    englishTitle: 'Total Base Inventory',
    description: 'รายชื่อสถานีวิทยุคมนาคมทั้งหมด 197 สถานี พร้อมสถานะการสำรวจและช่างผู้ตรวจเยี่ยม',
    badgeClass: 'bg-sky-500/15 border-sky-500/30 text-sky-400 dark:text-sky-300',
    icon: Radio,
    activeTabClass: 'border-sky-500 bg-sky-500/15 text-sky-600 dark:text-sky-300',
  },
  allowed: {
    key: 'allowed',
    title: 'สถานีที่อนุญาตให้เข้าพื้นที่',
    englishTitle: 'Permitted / Approved',
    description: 'รายชื่อสถานีที่ผลการตรวจเยี่ยมระบุว่า เจ้าของพื้นที่ยินยอมให้เข้าปฏิบัติงานบำรุงรักษา',
    badgeClass: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
    icon: CheckCircle2,
    activeTabClass: 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  },
  denied: {
    key: 'denied',
    title: 'สถานีที่ไม่อนุญาตให้เข้าพื้นที่',
    englishTitle: 'Rejected / Not Permitted',
    description: 'รายชื่อสถานีที่ผลการตรวจเยี่ยมระบุว่า ไม่อนุญาตให้เข้าพื้นที่ หรือติดเงื่อนไขการเข้าถึง',
    badgeClass: 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400',
    icon: XCircle,
    activeTabClass: 'border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-300',
  },
  unvisited: {
    key: 'unvisited',
    title: 'สถานีที่ยังไม่ได้ลงพื้นที่ / รอตรวจ',
    englishTitle: 'Pending / Unvisited',
    description: 'รายชื่อสถานีในฐานข้อมูลระบบที่ยังไม่ได้ทำการบันทึกข้อมูลการตรวจเยี่ยมภาคสนาม',
    badgeClass: 'bg-purple-500/15 border-purple-500/30 text-purple-600 dark:text-purple-400',
    icon: Clock,
    activeTabClass: 'border-purple-500 bg-purple-500/15 text-purple-600 dark:text-purple-300',
  },
};

const PAGE_SIZE_OPTIONS = [15, 25, 50, 100];

export function SurveyDrillDownModal({
  isOpen = false,
  onClose,
  initialCategory = 'total',
  stats = {},
  surveys = [],
  onNavigate,
  onEditSurvey,
}) {
  const { isDark } = useTheme();

  // Active Category Tab
  const [activeTab, setActiveTab] = useState(initialCategory || 'total');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('all');
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  // Preview Survey Modal State
  const [previewSurvey, setPreviewSurvey] = useState(null);

  // Master Station Directory (Loaded from cache or API)
  const [masterStations, setMasterStations] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const cached = localStorage.getItem('nbtc_cached_stations');
      if (cached) {
        const parsed = JSON.parse(cached);
        return Array.isArray(parsed.stations) ? parsed.stations : (Array.isArray(parsed) ? parsed : []);
      }
    } catch (e) {}
    return [];
  });

  // Sync initial category when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialCategory || 'total');
      setCurrentPage(1);
      setSearchQuery('');
      setSelectedProvince('all');
    }
  }, [isOpen, initialCategory]);

  // Load master station directory if not yet hydrated
  useEffect(() => {
    if (!isOpen) return;
    if (masterStations.length > 0) return;

    fetchStations()
      .then((data) => {
        const list = Array.isArray(data.stations) ? data.stations : (Array.isArray(data) ? data : []);
        if (list.length > 0) {
          setMasterStations(list);
        }
      })
      .catch((err) => {
        console.warn('Could not load master stations in drill-down modal:', err);
      });
  }, [isOpen, masterStations.length]);

  // Build unified station dataset merging master inventory and survey results
  const unifiedStations = useMemo(() => {
    // 1. Build lookup map from surveys keyed by station names & normalized keys
    const surveyByStationName = new Map();
    const surveyByRecordId = new Map();

    (surveys || []).forEach((s) => {
      if (!s) return;
      if (s.recordId) surveyByRecordId.set(s.recordId, s);

      const f = s.fields || {};
      const names = [
        s.station,
        s.stationName,
        f.station,
        f.stationName,
        f.village,
        f.contactVillage,
      ].filter(Boolean);

      names.forEach((name) => {
        const clean = String(name).trim();
        const norm = normalizeStationKey(clean);
        if (!surveyByStationName.has(clean)) surveyByStationName.set(clean, s);
        if (!surveyByStationName.has(norm)) surveyByStationName.set(norm, s);

        const alias = STATION_ALIASES[clean];
        if (alias) {
          const normAlias = normalizeStationKey(alias);
          if (!surveyByStationName.has(alias)) surveyByStationName.set(alias, s);
          if (!surveyByStationName.has(normAlias)) surveyByStationName.set(normAlias, s);
        }
      });
    });

    const matchedSurveyRecordIds = new Set();
    const result = [];

    // 2. Iterate through master stations
    (masterStations || []).forEach((st, idx) => {
      const v = String(st.village || '').trim();
      const normV = normalizeStationKey(v);
      const alias = STATION_ALIASES[v] || v;
      const normAlias = normalizeStationKey(alias);

      const matched =
        surveyByStationName.get(v) ||
        surveyByStationName.get(normV) ||
        surveyByStationName.get(alias) ||
        surveyByStationName.get(normAlias) ||
        null;

      if (matched && matched.recordId) {
        matchedSurveyRecordIds.add(matched.recordId);
      }

      const f = matched?.fields || {};
      const permitVal = matched ? (matched.permit || f.permit) : null;

      let status = 'unvisited';
      let statusLabel = 'ยังไม่ได้ลงพื้นที่ / รอตรวจ';

      if (matched) {
        if (permitVal === 'อนุญาต' || permitVal === 'on') {
          status = 'allowed';
          statusLabel = 'อนุญาตเข้าพื้นที่';
        } else if (permitVal === 'ไม่อนุญาต') {
          status = 'denied';
          statusLabel = 'ไม่อนุญาตเข้าพื้นที่';
        } else {
          status = 'allowed';
          statusLabel = permitVal || 'อนุญาตเข้าพื้นที่';
        }
      }

      const rawDate = matched ? (f.visitDate || f.visit_date || matched.savedAt || f.savedAt) : null;
      let formattedDate = '-';
      if (rawDate) {
        try {
          const d = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
            ? new Date(`${rawDate}T12:00:00`)
            : new Date(rawDate);
          if (!isNaN(d.getTime())) {
            formattedDate = d.toLocaleDateString('th-TH', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
          }
        } catch (e) {}
      }

      const inspectorName = matched
        ? (f.operatorName || f.surveyorName || f.inspector || matched.operatorName || '-')
        : '-';

      const siteId = st.id ? `SITE-${String(st.id).padStart(3, '0')}` : `SITE-${String(idx + 1).padStart(3, '0')}`;

      result.push({
        id: st.id || idx + 1,
        siteId,
        recordId: matched?.recordId || null,
        stationName: v || `สถานี #${idx + 1}`,
        province: st.province || f.province || matched?.province || '-',
        district: st.district || f.district || '-',
        subdistrict: st.subdistrict || f.subdistrict || '-',
        installationPlace: st.installation_place || st.installationPlace || f.installationPlace || '-',
        contactName: st.contact_name || st.contactName || f.contactName || '-',
        contactPhone: st.contact_phone || st.contactPhone || f.contactPhone || '',
        contactPosition: st.contact_position || st.contactPosition || f.contactPosition || '',
        status,
        statusLabel,
        surveyDate: formattedDate,
        rawDate,
        inspector: inspectorName,
        isSurveyed: Boolean(matched),
        surveyRecord: matched,
        masterRecord: st,
      });
    });

    // 3. Fallback for any survey in `surveys` that did not match master directory
    (surveys || []).forEach((s, idx) => {
      if (!s || !s.recordId || matchedSurveyRecordIds.has(s.recordId)) return;

      const f = s.fields || {};
      const permitVal = s.permit || f.permit;
      let status = 'allowed';
      let statusLabel = 'อนุญาตเข้าพื้นที่';
      if (permitVal === 'ไม่อนุญาต') {
        status = 'denied';
        statusLabel = 'ไม่อนุญาตเข้าพื้นที่';
      }

      const rawDate = f.visitDate || f.visit_date || s.savedAt || f.savedAt;
      let formattedDate = '-';
      if (rawDate) {
        try {
          const d = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
            ? new Date(`${rawDate}T12:00:00`)
            : new Date(rawDate);
          if (!isNaN(d.getTime())) {
            formattedDate = d.toLocaleDateString('th-TH', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
          }
        } catch (e) {}
      }

      result.push({
        id: `extra-${s.recordId}`,
        siteId: `SURVEY-${s.recordId.slice(-4).toUpperCase()}`,
        recordId: s.recordId,
        stationName: s.station || f.station || f.village || 'สถานีไม่ระบุชื่อ',
        province: s.province || f.province || '-',
        district: f.district || '-',
        subdistrict: f.subdistrict || '-',
        installationPlace: f.installationPlace || '-',
        contactName: f.contactName || '-',
        contactPhone: f.contactPhone || '',
        contactPosition: f.contactPosition || '',
        status,
        statusLabel,
        surveyDate: formattedDate,
        rawDate,
        inspector: f.operatorName || f.surveyorName || f.inspector || '-',
        isSurveyed: true,
        surveyRecord: s,
        masterRecord: null,
      });
    });

    return result;
  }, [masterStations, surveys]);

  // Distinct province list for filter dropdown
  const provinces = useMemo(() => {
    const set = new Set();
    unifiedStations.forEach((item) => {
      if (item.province && item.province !== '-') {
        set.add(item.province.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
  }, [unifiedStations]);

  // Overall counts for tabs
  const categoryCounts = useMemo(() => {
    let allowedCount = 0;
    let deniedCount = 0;
    let unvisitedCount = 0;

    unifiedStations.forEach((item) => {
      if (item.status === 'allowed') allowedCount++;
      else if (item.status === 'denied') deniedCount++;
      else unvisitedCount++;
    });

    const totalCount = unifiedStations.length > 0 ? unifiedStations.length : (Number(stats.stations) || 197);

    return {
      total: totalCount,
      allowed: allowedCount,
      denied: deniedCount,
      unvisited: unvisitedCount,
    };
  }, [unifiedStations, stats.stations]);

  // Filtered dataset based on activeTab, searchQuery, and selectedProvince
  const filteredStations = useMemo(() => {
    let list = unifiedStations;

    // Filter by Tab
    if (activeTab === 'allowed') {
      list = list.filter((item) => item.status === 'allowed');
    } else if (activeTab === 'denied') {
      list = list.filter((item) => item.status === 'denied');
    } else if (activeTab === 'unvisited') {
      list = list.filter((item) => item.status === 'unvisited');
    }

    // Filter by Province
    if (selectedProvince !== 'all') {
      list = list.filter((item) => item.province === selectedProvince);
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const normQ = normalizeStationKey(q);

      list = list.filter((item) => {
        const text = [
          item.stationName,
          normalizeStationKey(item.stationName),
          item.siteId,
          item.recordId || '',
          item.province,
          item.district,
          item.subdistrict,
          item.inspector,
          item.contactName,
          item.contactPhone,
          item.installationPlace,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return text.includes(q) || text.includes(normQ);
      });
    }

    return list;
  }, [unifiedStations, activeTab, selectedProvince, searchQuery]);

  // Pagination calculation
  const totalItems = filteredStations.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPageSafe = Math.min(currentPage, totalPages);

  const paginatedStations = useMemo(() => {
    const start = (currentPageSafe - 1) * pageSize;
    return filteredStations.slice(start, start + pageSize);
  }, [filteredStations, currentPageSafe, pageSize]);

  // Reset to page 1 on search or filter change
  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setCurrentPage(1);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleProvinceChange = (e) => {
    setSelectedProvince(e.target.value);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedProvince('all');
    setCurrentPage(1);
  };

  const activeConfig = CATEGORY_CONFIG[activeTab] || CATEGORY_CONFIG.total;
  const ActiveIcon = activeConfig.icon;

  if (!isOpen) return null;

  return (
    <>
      <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              'fixed inset-0 z-50 bg-black/80 backdrop-blur-md transition-all duration-200',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
            )}
          />

          <DialogPrimitive.Content
            aria-describedby="drilldown-modal-description"
            className={cn(
              'fixed left-1/2 top-1/2 z-50 flex flex-col -translate-x-1/2 -translate-y-1/2',
              'w-[96vw] max-w-6xl max-h-[92vh] rounded-2xl border shadow-2xl overflow-hidden duration-200',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              isDark
                ? 'border-blue-500/30 bg-[#041226] text-slate-100 shadow-[0_0_50px_rgba(0,0,0,0.8)]'
                : 'border-slate-200 bg-white text-slate-900 shadow-2xl'
            )}
          >
            {/* Modal Header */}
            <div
              className={cn(
                'flex flex-col gap-3 border-b px-5 py-4 shrink-0 transition-colors',
                isDark ? 'border-slate-800/80 bg-slate-950/80' : 'border-slate-200 bg-slate-50'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors',
                      isDark
                        ? 'bg-blue-500/15 border-blue-500/30 text-sky-400'
                        : 'bg-sky-100 border-sky-200 text-sky-700'
                    )}
                  >
                    <ActiveIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <DialogPrimitive.Title
                        className={cn(
                          'text-lg sm:text-xl font-bold tracking-normal leading-normal truncate',
                          isDark ? 'text-white' : 'text-slate-900'
                        )}
                      >
                        {activeConfig.title}
                      </DialogPrimitive.Title>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border',
                          activeConfig.badgeClass
                        )}
                      >
                        <span className="font-mono font-bold text-xs">
                          {categoryCounts[activeTab].toLocaleString()}
                        </span>
                        <span>สถานี</span>
                      </span>
                    </div>
                    <DialogPrimitive.Description
                      id="drilldown-modal-description"
                      className={cn('text-xs mt-0.5 line-clamp-1', isDark ? 'text-slate-400' : 'text-slate-500')}
                    >
                      {activeConfig.description}
                    </DialogPrimitive.Description>
                  </div>
                </div>

                <DialogPrimitive.Close
                  className={cn(
                    'rounded-xl p-2 transition-colors cursor-pointer shrink-0 border',
                    isDark
                      ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                      : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-200/80'
                  )}
                  title="ปิดหน้าต่าง (Esc)"
                  aria-label="ปิดหน้าต่าง"
                >
                  <X className="h-4 w-4" />
                </DialogPrimitive.Close>
              </div>

              {/* Status Tabs Navigation Bar */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-1 scrollbar-none">
                {Object.values(CATEGORY_CONFIG).map((cfg) => {
                  const isCurrent = activeTab === cfg.key;
                  const Icon = cfg.icon;
                  const count = categoryCounts[cfg.key];

                  return (
                    <button
                      key={cfg.key}
                      type="button"
                      onClick={() => handleTabChange(cfg.key)}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer',
                        isCurrent
                          ? isDark
                            ? 'border-sky-500/60 bg-sky-500/20 text-sky-300 shadow-xs'
                            : 'border-sky-400 bg-sky-100/80 text-sky-900 shadow-xs'
                          : isDark
                          ? 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                          : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      )}
                    >
                      <Icon className={cn('h-3.5 w-3.5', isCurrent ? 'text-sky-400' : 'opacity-60')} />
                      <span>{cfg.title.split(' ')[0]}</span>
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.2 text-[11px] font-mono font-bold',
                          isCurrent
                            ? isDark
                              ? 'bg-sky-400/20 text-sky-200'
                              : 'bg-sky-200 text-sky-900'
                            : isDark
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {count.toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div
              className={cn(
                'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-5 py-3 border-b shrink-0',
                isDark ? 'border-slate-800/80 bg-slate-900/40' : 'border-slate-200 bg-slate-50/70'
              )}
            >
              <div className="flex flex-1 items-center gap-2.5">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                  <Search className={cn('absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2', isDark ? 'text-slate-500' : 'text-slate-400')} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    placeholder="ค้นหาชื่อสถานี, Site ID, จังหวัด, อำเภอ, ช่าง..."
                    className={cn(
                      'w-full rounded-xl border pl-9 pr-8 py-2 text-xs transition-colors focus:outline-none focus:ring-2',
                      isDark
                        ? 'border-slate-800 bg-slate-950/70 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:ring-sky-500/20'
                        : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:ring-sky-500/20'
                    )}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer p-0.5"
                      title="ล้างคำค้นหา"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Province Dropdown Filter */}
                <div className="relative shrink-0">
                  <select
                    value={selectedProvince}
                    onChange={handleProvinceChange}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-xs font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2',
                      isDark
                        ? 'border-slate-800 bg-slate-950/70 text-slate-200 focus:border-sky-500 focus:ring-sky-500/20'
                        : 'border-slate-300 bg-white text-slate-800 focus:border-sky-500 focus:ring-sky-500/20'
                    )}
                  >
                    <option value="all">ทุกจังหวัด ({provinces.length} จ.)</option>
                    {provinces.map((prov) => (
                      <option key={prov} value={prov}>
                        จ.{prov}
                      </option>
                    ))}
                  </select>
                </div>

                {(searchQuery || selectedProvince !== 'all') && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-xl border px-2.5 py-2 text-xs font-semibold transition-colors cursor-pointer',
                      isDark
                        ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                        : 'border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    )}
                    title="ล้างตัวกรองทั้งหมด"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span className="hidden sm:inline">ล้างกรอง</span>
                  </button>
                )}
              </div>

              {/* Counter & Page Size Selector */}
              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 text-xs">
                <span className={cn('font-mono font-medium', isDark ? 'text-slate-400' : 'text-slate-500')}>
                  พบ <strong className={cn(isDark ? 'text-white' : 'text-slate-900')}>{totalItems.toLocaleString()}</strong> สถานี
                </span>

                <div className="flex items-center gap-1.5">
                  <span className={cn('text-[11px] hidden sm:inline', isDark ? 'text-slate-500' : 'text-slate-400')}>แสดง:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className={cn(
                      'rounded-lg border px-2 py-1 text-xs font-mono transition-colors cursor-pointer focus:outline-none',
                      isDark
                        ? 'border-slate-800 bg-slate-950 text-slate-300'
                        : 'border-slate-300 bg-white text-slate-700'
                    )}
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size} / หน้า
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Station List Table */}
            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[300px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead
                  className={cn(
                    'sticky top-0 z-10 border-b backdrop-blur-md text-[11px] font-bold uppercase tracking-wider',
                    isDark
                      ? 'border-slate-800 bg-slate-950/95 text-slate-400'
                      : 'border-slate-200 bg-slate-100/95 text-slate-600'
                  )}
                >
                  <tr>
                    <th className="py-3 px-3 text-center w-12 whitespace-nowrap">#</th>
                    <th className="py-3 px-3 w-28 whitespace-nowrap">Site ID</th>
                    <th className="py-3 px-4 min-w-[220px]">ชื่อสถานี / สถานที่ติดตั้ง</th>
                    <th className="py-3 px-3 w-36 whitespace-nowrap">จังหวัด / อำเภอ</th>
                    <th className="py-3 px-3 w-32 text-center whitespace-nowrap">ผลการขออนุญาต</th>
                    <th className="py-3 px-3 w-32 text-center whitespace-nowrap">วันที่ลงพื้นที่</th>
                    <th className="py-3 px-3 w-40 whitespace-nowrap">ช่างผู้ตรวจเยี่ยม</th>
                    <th className="py-3 px-4 w-28 text-center whitespace-nowrap">จัดการ</th>
                  </tr>
                </thead>

                <tbody className={cn('divide-y', isDark ? 'divide-slate-800/60' : 'divide-slate-200')}>
                  {paginatedStations.length > 0 ? (
                    paginatedStations.map((item, idx) => {
                      const rowNumber = (currentPageSafe - 1) * pageSize + idx + 1;
                      const isAllowed = item.status === 'allowed';
                      const isDenied = item.status === 'denied';
                      const isUnvisited = item.status === 'unvisited';

                      return (
                        <tr
                          key={item.siteId + '-' + item.id}
                          className={cn(
                            'transition-colors',
                            isDark
                              ? 'hover:bg-slate-800/40 text-slate-300'
                              : 'hover:bg-sky-50/60 text-slate-700'
                          )}
                        >
                          {/* Row Number */}
                          <td className="py-3 px-3 text-center font-mono opacity-50 text-[11px]">
                            {rowNumber}
                          </td>

                          {/* Site ID Badge */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={cn(
                                'inline-flex items-center px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold border',
                                isDark
                                  ? 'bg-slate-800/80 border-slate-700 text-slate-300'
                                  : 'bg-slate-100 border-slate-300 text-slate-700'
                              )}
                            >
                              {item.siteId}
                            </span>
                          </td>

                          {/* Station Name & Installation Location */}
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={cn(
                                  'font-bold text-sm tracking-tight leading-snug',
                                  isDark ? 'text-white' : 'text-slate-900'
                                )}
                              >
                                {item.stationName}
                              </span>

                              <div className="flex items-center gap-2 text-[11px] opacity-75 flex-wrap">
                                {item.installationPlace && item.installationPlace !== '-' && (
                                  <span className="inline-flex items-center gap-1">
                                    <Building className="h-3 w-3 shrink-0" />
                                    <span>{item.installationPlace}</span>
                                  </span>
                                )}
                                {item.contactName && item.contactName !== '-' && (
                                  <>
                                    <span className="opacity-40">•</span>
                                    <span>
                                      ผู้ให้ข้อมูล: <span className="font-medium">{item.contactName}</span>
                                      {item.contactPosition ? ` (${item.contactPosition})` : ''}
                                    </span>
                                  </>
                                )}
                                {item.contactPhone && (
                                  <>
                                    <span className="opacity-40">•</span>
                                    <span className="font-mono text-cyan-600 dark:text-cyan-400">
                                      {item.contactPhone}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Province & District */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1 font-bold text-xs text-slate-800 dark:text-slate-200">
                                <MapPin className="h-3 w-3 text-sky-500 shrink-0" />
                                <span>จ.{item.province}</span>
                              </div>
                              {item.district && item.district !== '-' && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 pl-4">
                                  อ.{item.district.replace(/^อ\./, '')}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Survey Status Badge */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {isAllowed && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border shadow-2xs',
                                  isDark
                                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                    : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                )}
                              >
                                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                                <span>อนุญาต</span>
                              </span>
                            )}

                            {isDenied && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border shadow-2xs',
                                  isDark
                                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                                    : 'bg-rose-50 border-rose-300 text-rose-800'
                                )}
                              >
                                <XCircle className="h-3 w-3 shrink-0 text-rose-500" />
                                <span>ไม่อนุญาต</span>
                              </span>
                            )}

                            {isUnvisited && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border shadow-2xs',
                                  isDark
                                    ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                                    : 'bg-purple-50 border-purple-300 text-purple-800'
                                )}
                              >
                                <Clock className="h-3 w-3 shrink-0 text-purple-400" />
                                <span>รอตรวจ</span>
                              </span>
                            )}
                          </td>

                          {/* Survey Date */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {item.surveyDate !== '-' ? (
                              <div className="inline-flex items-center gap-1.5 font-medium">
                                <Calendar className="h-3 w-3 opacity-50 shrink-0" />
                                <span>{item.surveyDate}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 text-[11px]">-</span>
                            )}
                          </td>

                          {/* Inspector / Technician */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {item.inspector !== '-' ? (
                              <div className="flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {item.inspector}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 text-[11px]">-</span>
                            )}
                          </td>

                          {/* Action Button */}
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {item.isSurveyed && item.surveyRecord ? (
                              <button
                                type="button"
                                onClick={() => setPreviewSurvey(item.surveyRecord)}
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer shadow-2xs',
                                  isDark
                                    ? 'border-sky-500/30 bg-sky-950/40 text-sky-300 hover:bg-sky-600/30 hover:border-sky-400 hover:text-white'
                                    : 'border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 hover:border-sky-400'
                                )}
                                title="ดูรายละเอียดข้อมูลการสำรวจและรูปภาพ"
                              >
                                <FileText className="h-3.5 w-3.5 shrink-0" />
                                <span>ดูข้อมูล</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  if (onNavigate) {
                                    onNavigate('field', {
                                      station: item.stationName,
                                      village: item.stationName,
                                      province: item.province,
                                      district: item.district,
                                      subdistrict: item.subdistrict,
                                      installationPlace: item.installationPlace,
                                      contactName: item.contactName,
                                      contactPhone: item.contactPhone,
                                      contactPosition: item.contactPosition,
                                    });
                                  }
                                }}
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer shadow-2xs',
                                  isDark
                                    ? 'border-purple-500/40 bg-purple-950/40 text-purple-300 hover:bg-purple-600/30 hover:border-purple-400 hover:text-white'
                                    : 'border-purple-300 bg-purple-50 text-purple-800 hover:bg-purple-100 hover:border-purple-400'
                                )}
                                title="เปิดแบบฟอร์มลงพื้นที่สำรวจสถานีนี้"
                              >
                                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                <span>ลงพื้นที่</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <div
                            className={cn(
                              'flex h-12 w-12 items-center justify-center rounded-2xl border mb-1',
                              isDark ? 'border-slate-800 bg-slate-900 text-slate-500' : 'border-slate-200 bg-slate-100 text-slate-400'
                            )}
                          >
                            <Search className="h-6 w-6" />
                          </div>
                          <p className={cn('text-sm font-bold', isDark ? 'text-slate-300' : 'text-slate-700')}>
                            {searchQuery || selectedProvince !== 'all'
                              ? 'ไม่พบข้อมูลสถานีที่ตรงกับเงื่อนไขการค้นหา'
                              : activeTab === 'denied'
                              ? 'ไม่พบสถานีที่ไม่อนุญาตเข้าพื้นที่ (0 สถานี)'
                              : activeTab === 'unvisited'
                              ? 'สำรวจครบถ้วนแล้วทุกสถานีในระบบ ไม่พบสถานีที่รอตรวจ'
                              : 'ไม่มีข้อมูลสถานีในหมวดหมู่นี้'}
                          </p>
                          {(searchQuery || selectedProvince !== 'all') && (
                            <button
                              type="button"
                              onClick={handleClearFilters}
                              className="mt-1 text-xs text-sky-500 hover:underline cursor-pointer"
                            >
                              ล้างคำค้นหาและตัวกรองทั้งหมด
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer & Pagination */}
            <div
              className={cn(
                'flex flex-col sm:flex-row items-center justify-between gap-3 border-t px-5 py-3 shrink-0 text-xs',
                isDark ? 'border-slate-800/80 bg-slate-950/80' : 'border-slate-200 bg-slate-50'
              )}
            >
              <div className={cn('opacity-75', isDark ? 'text-slate-400' : 'text-slate-500')}>
                {totalItems > 0 ? (
                  <span>
                    แสดง{' '}
                    <strong className={isDark ? 'text-slate-200' : 'text-slate-800'}>
                      {(currentPageSafe - 1) * pageSize + 1}
                    </strong>{' '}
                    -{' '}
                    <strong className={isDark ? 'text-slate-200' : 'text-slate-800'}>
                      {Math.min(currentPageSafe * pageSize, totalItems)}
                    </strong>{' '}
                    จากทั้งหมด{' '}
                    <strong className={isDark ? 'text-white' : 'text-slate-900'}>
                      {totalItems.toLocaleString()}
                    </strong>{' '}
                    สถานี
                  </span>
                ) : (
                  <span>0 รายการ</span>
                )}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPageSafe <= 1}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all disabled:opacity-40 cursor-pointer',
                      isDark
                        ? 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    )}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>ก่อนหน้า</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPageSafe <= 3) {
                        pageNum = i + 1;
                      } else if (currentPageSafe >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPageSafe - 2 + i;
                      }

                      const isSelected = pageNum === currentPageSafe;
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          className={cn(
                            'h-7 min-w-[28px] rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer',
                            isSelected
                              ? isDark
                                ? 'border-sky-500 bg-sky-500 text-slate-950'
                                : 'border-sky-600 bg-sky-600 text-white'
                              : isDark
                              ? 'border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                          )}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPageSafe >= totalPages}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all disabled:opacity-40 cursor-pointer',
                      isDark
                        ? 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    )}
                  >
                    <span>ถัดไป</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Survey Preview Detail Modal (Opens when user clicks "ดูข้อมูล") */}
      {previewSurvey && (
        <SurveyPreviewModal
          isOpen={Boolean(previewSurvey)}
          onClose={() => setPreviewSurvey(null)}
          surveyData={previewSurvey}
          onEdit={(survey) => {
            setPreviewSurvey(null);
            onClose();
            if (onEditSurvey) onEditSurvey(survey);
            else if (onNavigate) onNavigate('field', survey);
          }}
        />
      )}
    </>
  );
}
