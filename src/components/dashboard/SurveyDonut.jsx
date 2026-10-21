import React from 'react';
import { PieChart, Radio, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

export function SurveyDonut({ stats = {} }) {
  const { isDark } = useTheme();

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

  return (
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

        <div
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
            isDark
              ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
              : 'bg-purple-50 text-purple-700 border-purple-200'
          )}
          title="คำนวณเทียบจากสถานีทั้งหมดในระบบ (Base Inventory)"
        >
          <Radio className="h-3 w-3" />
          <span>ฐานข้อมูล {baseStations} สถานี</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-around gap-6 pt-5 pb-2 flex-1">
        {/* Donut graphic */}
        <div
          className={cn(
            'relative flex h-40 w-40 shrink-0 items-center justify-center rounded-full p-3.5 transition-shadow',
            isDark ? 'shadow-[0_0_24px_rgba(0,0,0,0.5)]' : 'shadow-md'
          )}
          style={{ background: donutGradient }}
        >
          <div
            className={cn(
              'flex h-28 w-28 flex-col items-center justify-center rounded-full shadow-inner border transition-colors text-center px-1',
              isDark ? 'bg-[#03152d] border-slate-800' : 'bg-white border-slate-200'
            )}
          >
            <span
              className={cn(
                'text-xl sm:text-2xl font-black font-mono tracking-tight leading-none',
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

        {/* Breakdown details */}
        <div className="flex w-full flex-col gap-2.5 sm:max-w-[260px]">
          {/* Allowed (อนุญาตเข้าพื้นที่) */}
          <div
            className={cn(
              'flex items-center justify-between rounded-xl border px-3 py-2 transition-colors',
              isDark
                ? 'border-emerald-500/20 bg-emerald-950/20'
                : 'border-emerald-200 bg-emerald-50/70 shadow-2xs'
            )}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className={cn('text-xs font-medium', isDark ? 'text-slate-200' : 'text-slate-800')}>
                อนุญาตเข้าพื้นที่
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={cn('font-mono font-bold text-sm', isDark ? 'text-emerald-400' : 'text-emerald-700')}>
                {allowed.toLocaleString()}
              </span>
              <span className={cn('text-[11px] font-mono font-semibold', isDark ? 'text-emerald-400/80' : 'text-emerald-600/90')}>
                ({allowedPct.toFixed(1)}%)
              </span>
            </div>
          </div>

          {/* Denied (ไม่อนุญาตเข้าพื้นที่) */}
          <div
            className={cn(
              'flex items-center justify-between rounded-xl border px-3 py-2 transition-colors',
              isDark
                ? 'border-rose-500/20 bg-rose-950/20'
                : 'border-rose-200 bg-rose-50/70 shadow-2xs'
            )}
          >
            <div className="flex items-center gap-2">
              <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
              <span className={cn('text-xs font-medium', isDark ? 'text-slate-200' : 'text-slate-800')}>
                ไม่อนุญาตเข้าพื้นที่
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={cn('font-mono font-bold text-sm', isDark ? 'text-rose-400' : 'text-rose-700')}>
                {denied.toLocaleString()}
              </span>
              <span className={cn('text-[11px] font-mono font-semibold', isDark ? 'text-rose-400/80' : 'text-rose-600/90')}>
                ({deniedPct.toFixed(1)}%)
              </span>
            </div>
          </div>

          {/* Unvisited / Pending (ยังไม่ได้ลงพื้นที่ / รอดำเนินการ) */}
          <div
            className={cn(
              'flex items-center justify-between rounded-xl border px-3 py-2 transition-colors',
              isDark
                ? 'border-purple-500/20 bg-purple-950/20'
                : 'border-purple-200 bg-purple-50/70 shadow-2xs'
            )}
          >
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-purple-400 shrink-0" />
              <span className={cn('text-xs font-medium', isDark ? 'text-slate-200' : 'text-slate-800')}>
                ยังไม่ได้ลงพื้นที่ / รอตรวจ
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={cn('font-mono font-bold text-sm', isDark ? 'text-purple-400' : 'text-purple-700')}>
                {unvisited.toLocaleString()}
              </span>
              <span className={cn('text-[11px] font-mono font-semibold', isDark ? 'text-purple-400/80' : 'text-purple-600/90')}>
                ({unvisitedPct.toFixed(1)}%)
              </span>
            </div>
          </div>

          {/* 100% Total Base Count Anchor Bar */}
          <div
            className={cn(
              'flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors mt-0.5',
              isDark
                ? 'border-slate-800 bg-slate-900/60 text-slate-400'
                : 'border-slate-200 bg-slate-100/70 text-slate-600'
            )}
          >
            <span className="font-medium">รวมสถานีทั้งหมดในระบบ:</span>
            <span className="font-mono font-bold text-xs">
              {baseStations.toLocaleString()} สถานี (100.0%)
            </span>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
