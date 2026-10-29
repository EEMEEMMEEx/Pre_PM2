import React, { useState } from 'react';
import { PieChart, Radio, CheckCircle2, XCircle, Clock, ChevronRight, Sparkles } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import { SurveyDrillDownModal } from './SurveyDrillDownModal';

export function SurveyDonut({ stats = {}, surveys = [], onNavigate, onEditSurvey }) {
  const { isDark } = useTheme();

  // Drill-down Detail Modal State: null | 'allowed' | 'denied' | 'unvisited' | 'total'
  const [drillDownCategory, setDrillDownCategory] = useState(null);

  // Total base station inventory in the system (สถานีในระบบ เช่น 197 สถานี)
  const baseStations = Number(stats.stations) > 0 ? Number(stats.stations) : 197;
  // Total surveys completed so far (ผลสำรวจทั้งหมด เช่น 180 สถานี)
  const surveyedTotal = Number(stats.surveys) || 0;
  // Breakdown of survey results
  const allowed = Number(stats.allowed) || 0;
  const denied = Number(stats.denied) || 0;

  // Remaining unvisited or pending stations (สถานีที่ยังไม่ได้ลงพื้นที่ / รอดำเนินการ เช่น 197 - 180 = 17)
  const unvisited = Math.max(baseStations - allowed - denied, 0);

  // Proportions calculated strictly relative to the total base count (100% = baseStations)
  const allowedPct = baseStations > 0 ? (allowed / baseStations) * 100 : 0;
  const deniedPct = baseStations > 0 ? (denied / baseStations) * 100 : 0;
  const unvisitedPct = baseStations > 0 ? (unvisited / baseStations) * 100 : 0;

  // Overall survey progress percentage relative to total base inventory (e.g. 180 / 197 = 91.4%)
  const surveyProgressPct = baseStations > 0 ? (Math.min(surveyedTotal, baseStations) / baseStations) * 100 : 0;

  // Conic gradient mapping 100% of the entire station inventory:
  // Emerald (Allowed) -> Rose (Denied) -> Purple (Unvisited/Pending)
  const donutGradient =
    baseStations > 0
      ? `conic-gradient(#10b981 0% ${allowedPct}%, #f43f5e ${allowedPct}% ${allowedPct + deniedPct}%, #8b5cf6 ${allowedPct + deniedPct}% 100%)`
      : 'conic-gradient(#10b981 0% 0%, #1e293b 0% 100%)';

  const handleOpenDrillDown = (category) => {
    setDrillDownCategory(category);
  };

  const handleCardKeyDown = (e, category) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleOpenDrillDown(category);
    }
  };

  return (
    <>
      <GlassCard className="flex flex-col h-full" hoverEffect={false}>
        {/* Panel Title & Base Inventory Badge */}
        <div className={cn('flex items-center justify-between pb-3.5 border-b', isDark ? 'border-slate-800/80' : 'border-slate-200')}>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg',
                isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700'
              )}
            >
              <PieChart className="h-4 w-4" />
            </div>
            <div>
              <h2 className={cn('text-base sm:text-lg font-bold tracking-normal leading-normal', isDark ? 'text-white' : 'text-slate-900')}>
                สัดส่วนผลการสำรวจ
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleOpenDrillDown('total')}
            className={cn(
              'group flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer',
              'hover:scale-105 active:scale-95 shadow-2xs',
              isDark
                ? 'bg-purple-500/10 text-purple-300 border-purple-500/20 hover:border-purple-400 hover:bg-purple-500/20'
                : 'bg-purple-50 text-purple-700 border-purple-200 hover:border-purple-300 hover:bg-purple-100'
            )}
            title="คลิกเพื่อดูรายชื่อสถานีทั้งหมดในระบบ (Drill-down)"
          >
            <Radio className="h-3 w-3 group-hover:scale-110 transition-transform text-purple-400" />
            <span>ฐานข้อมูล {baseStations} สถานี</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-around gap-6 pt-5 pb-2 flex-1">
          {/* Donut graphic (Interactive) */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleOpenDrillDown('total')}
            onKeyDown={(e) => handleCardKeyDown(e, 'total')}
            className={cn(
              'group relative flex h-40 w-40 shrink-0 items-center justify-center rounded-full p-3.5 transition-all duration-300 cursor-pointer select-none',
              'hover:scale-105 hover:rotate-1 active:scale-95',
              isDark ? 'shadow-[0_0_24px_rgba(0,0,0,0.5)] hover:shadow-[0_0_32px_rgba(139,92,246,0.35)]' : 'shadow-md hover:shadow-lg'
            )}
            style={{ background: donutGradient }}
            title="คลิกเพื่อเจาะลึกดูรายชื่อสถานีทั้งหมด (Drill-down)"
            aria-label="ดูภาพรวมสัดส่วนผลการสำรวจทั้งหมด"
          >
            <div
              className={cn(
                'flex h-28 w-28 flex-col items-center justify-center rounded-full shadow-inner border transition-all text-center px-1',
                'group-hover:border-purple-400/50',
                isDark ? 'bg-[#03152d] border-slate-800' : 'bg-white border-slate-200'
              )}
            >
              <span
                className={cn(
                  'text-xl sm:text-2xl font-black font-mono tracking-tight leading-none group-hover:scale-105 transition-transform',
                  isDark ? 'text-white' : 'text-slate-900'
                )}
              >
                {surveyProgressPct.toFixed(1)}%
              </span>
              <span className={cn('text-[11px] font-semibold mt-1 leading-tight', isDark ? 'text-emerald-400' : 'text-emerald-600')}>
                สำรวจแล้ว
              </span>
              <span className={cn('text-[10px] font-mono opacity-70 mt-0.5 leading-tight', isDark ? 'text-slate-400' : 'text-slate-500')}>
                {surveyedTotal}/{baseStations} สถานี
              </span>
            </div>
          </div>

          {/* Breakdown details: 4 Clickable Drill-down Cards */}
          <div className="flex w-full flex-col gap-2.5 sm:max-w-[280px]">
            {/* 1. Allowed (อนุญาตเข้าพื้นที่) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleOpenDrillDown('allowed')}
              onKeyDown={(e) => handleCardKeyDown(e, 'allowed')}
              className={cn(
                'group flex items-center justify-between rounded-xl border px-3 py-2.5 transition-all duration-200 cursor-pointer select-none',
                'hover:scale-[1.015] hover:shadow-md active:scale-[0.99]',
                isDark
                  ? 'border-emerald-500/20 bg-emerald-950/20 hover:border-emerald-400/60 hover:bg-emerald-900/35'
                  : 'border-emerald-200 bg-emerald-50/70 hover:border-emerald-400 hover:bg-emerald-100/70 shadow-2xs'
              )}
              title="คลิกเพื่อดูรายชื่อสถานีที่อนุญาตเข้าพื้นที่ (Drill-down)"
              aria-label="ดูรายชื่อสถานีที่อนุญาตเข้าพื้นที่"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 group-hover:scale-110 transition-transform" />
                <span className={cn('text-xs font-semibold group-hover:text-emerald-500 dark:group-hover:text-emerald-300 transition-colors truncate', isDark ? 'text-slate-200' : 'text-slate-800')}>
                  อนุญาตเข้าพื้นที่
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-baseline gap-1">
                  <span className={cn('font-mono font-bold text-sm', isDark ? 'text-emerald-400' : 'text-emerald-700')}>
                    {allowed.toLocaleString()}
                  </span>
                  <span className={cn('text-[11px] font-mono font-semibold', isDark ? 'text-emerald-400/80' : 'text-emerald-600/90')}>
                    ({allowedPct.toFixed(1)}%)
                  </span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-emerald-500 shrink-0" />
              </div>
            </div>

            {/* 2. Denied (ไม่อนุญาตเข้าพื้นที่) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleOpenDrillDown('denied')}
              onKeyDown={(e) => handleCardKeyDown(e, 'denied')}
              className={cn(
                'group flex items-center justify-between rounded-xl border px-3 py-2.5 transition-all duration-200 cursor-pointer select-none',
                'hover:scale-[1.015] hover:shadow-md active:scale-[0.99]',
                isDark
                  ? 'border-rose-500/20 bg-rose-950/20 hover:border-rose-400/60 hover:bg-rose-900/35'
                  : 'border-rose-200 bg-rose-50/70 hover:border-rose-400 hover:bg-rose-100/70 shadow-2xs'
              )}
              title="คลิกเพื่อดูรายชื่อสถานีที่ไม่อนุญาตเข้าพื้นที่ (Drill-down)"
              aria-label="ดูรายชื่อสถานีที่ไม่อนุญาตเข้าพื้นที่"
            >
              <div className="flex items-center gap-2 min-w-0">
                <XCircle className="h-4 w-4 text-rose-500 shrink-0 group-hover:scale-110 transition-transform" />
                <span className={cn('text-xs font-semibold group-hover:text-rose-500 dark:group-hover:text-rose-300 transition-colors truncate', isDark ? 'text-slate-200' : 'text-slate-800')}>
                  ไม่อนุญาตเข้าพื้นที่
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-baseline gap-1">
                  <span className={cn('font-mono font-bold text-sm', isDark ? 'text-rose-400' : 'text-rose-700')}>
                    {denied.toLocaleString()}
                  </span>
                  <span className={cn('text-[11px] font-mono font-semibold', isDark ? 'text-rose-400/80' : 'text-rose-600/90')}>
                    ({deniedPct.toFixed(1)}%)
                  </span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-rose-500 shrink-0" />
              </div>
            </div>

            {/* 3. Unvisited / Pending (ยังไม่ได้ลงพื้นที่ / รอตรวจ) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleOpenDrillDown('unvisited')}
              onKeyDown={(e) => handleCardKeyDown(e, 'unvisited')}
              className={cn(
                'group flex items-center justify-between rounded-xl border px-3 py-2.5 transition-all duration-200 cursor-pointer select-none',
                'hover:scale-[1.015] hover:shadow-md active:scale-[0.99]',
                isDark
                  ? 'border-purple-500/20 bg-purple-950/20 hover:border-purple-400/60 hover:bg-purple-900/35'
                  : 'border-purple-200 bg-purple-50/70 hover:border-purple-400 hover:bg-purple-100/70 shadow-2xs'
              )}
              title="คลิกเพื่อดูรายชื่อสถานีที่ยังไม่ได้ลงพื้นที่หรือรอตรวจ (Drill-down)"
              aria-label="ดูรายชื่อสถานีที่ยังไม่ได้ลงพื้นที่หรือรอตรวจ"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Clock className="h-4 w-4 text-purple-400 shrink-0 group-hover:scale-110 transition-transform" />
                <span className={cn('text-xs font-semibold group-hover:text-purple-400 dark:group-hover:text-purple-300 transition-colors truncate', isDark ? 'text-slate-200' : 'text-slate-800')}>
                  ยังไม่ได้ลงพื้นที่ / รอตรวจ
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-baseline gap-1">
                  <span className={cn('font-mono font-bold text-sm', isDark ? 'text-purple-400' : 'text-purple-700')}>
                    {unvisited.toLocaleString()}
                  </span>
                  <span className={cn('text-[11px] font-mono font-semibold', isDark ? 'text-purple-400/80' : 'text-purple-600/90')}>
                    ({unvisitedPct.toFixed(1)}%)
                  </span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-purple-400 shrink-0" />
              </div>
            </div>

            {/* 4. 100% Total Base Count Anchor Bar */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleOpenDrillDown('total')}
              onKeyDown={(e) => handleCardKeyDown(e, 'total')}
              className={cn(
                'group flex items-center justify-between rounded-xl border px-3 py-2 text-xs transition-all duration-200 cursor-pointer select-none mt-0.5',
                'hover:scale-[1.015] hover:shadow-md active:scale-[0.99]',
                isDark
                  ? 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-sky-500/50 hover:bg-slate-800/90 hover:text-white'
                  : 'border-slate-200 bg-slate-100/70 text-slate-700 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-900 shadow-2xs'
              )}
              title="คลิกเพื่อดูรายชื่อสถานีทั้งหมดในระบบ 197 สถานี (Drill-down)"
              aria-label="ดูรายชื่อสถานีทั้งหมดในระบบฐานข้อมูล"
            >
              <div className="flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-sky-500 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="font-semibold">รวมสถานีทั้งหมดในระบบ:</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-mono font-bold text-xs text-sky-600 dark:text-sky-400">
                  {baseStations.toLocaleString()} สถานี (100.0%)
                </span>
                <ChevronRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-sky-500 shrink-0" />
              </div>
            </div>

            {/* Subtle Hint */}
            <div className="text-[10.5px] text-center font-medium opacity-60 mt-0.5 flex items-center justify-center gap-1 text-slate-500 dark:text-slate-400">
              <Sparkles className="h-3 w-3 text-sky-500 shrink-0" />
              <span>คลิกที่การ์ดสถานะเพื่อเจาะลึกดูรายละเอียดรายชื่อสถานี</span>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Drill-down Detail Modal */}
      {drillDownCategory && (
        <SurveyDrillDownModal
          isOpen={Boolean(drillDownCategory)}
          onClose={() => setDrillDownCategory(null)}
          initialCategory={drillDownCategory}
          stats={stats}
          surveys={surveys}
          onNavigate={onNavigate}
          onEditSurvey={onEditSurvey}
        />
      )}
    </>
  );
}
export default SurveyDonut;
