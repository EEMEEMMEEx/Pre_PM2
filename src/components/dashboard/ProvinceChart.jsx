import React from 'react';
import { MapPin } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

export function ProvinceChart({ provinces = [], totalSurveys = 0 }) {
  const { isDark } = useTheme();
  const displayProvinces = provinces.slice(0, 10);
  const maxProvinceCount = Math.max(...displayProvinces.map((p) => p.count), 1);
  const totalCount =
    totalSurveys || provinces.reduce((sum, p) => sum + (p.count || 0), 0) || 1;

  return (
    <GlassCard className="flex flex-col" hoverEffect={false}>
      {/* Panel Title */}
      <div
        className={cn(
          'flex items-center justify-between pb-3.5 border-b',
          isDark ? 'border-slate-800/80' : 'border-slate-200'
        )}
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              isDark ? 'bg-blue-500/20 text-cyan-300' : 'bg-sky-100 text-sky-600'
            )}
          >
            <MapPin className="h-4 w-4" />
          </div>
          <h2
            className={cn(
              'text-base sm:text-lg font-bold tracking-normal leading-normal',
              isDark ? 'text-white' : 'text-slate-900'
            )}
          >
            สรุปผลการสำรวจรายจังหวัด (10 อันดับแรก)
          </h2>
        </div>

        {displayProvinces.length > 0 && (
          <div
            className={cn(
              'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              isDark
                ? 'bg-blue-500/10 text-cyan-300 border-blue-500/20'
                : 'bg-sky-50 text-sky-700 border-sky-200'
            )}
          >
            <span>{displayProvinces.length} จังหวัด</span>
            <span className="opacity-40">•</span>
            <span>{totalCount.toLocaleString()} สถานี</span>
          </div>
        )}
      </div>

      {/* Province Breakdown List */}
      <div className="pt-4 flex-1 flex flex-col">
        <div
          className={cn(
            'overflow-hidden rounded-xl border transition-colors shadow-2xs',
            isDark ? 'border-slate-800/80 bg-slate-950/30' : 'border-slate-200 bg-white'
          )}
        >
          {/* Header Row */}
          <div
            className={cn(
              'grid grid-cols-12 gap-2 px-3.5 py-2.5 text-xs font-semibold border-b',
              isDark
                ? 'bg-slate-900/60 text-slate-400 border-slate-800/80'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            )}
          >
            <span className="col-span-1 text-center">ลำดับ</span>
            <span className="col-span-5">จังหวัด</span>
            <span className="col-span-3 text-center">สัดส่วน</span>
            <span className="col-span-3 text-right">จำนวนสถานี</span>
          </div>

          {/* Rows */}
          <div className={cn('divide-y', isDark ? 'divide-slate-800/40' : 'divide-slate-100')}>
            {displayProvinces.length > 0 ? (
              displayProvinces.map((prov, i) => {
                const barPct = Math.max(8, Math.min(100, (prov.count / maxProvinceCount) * 100));
                const pctOfTotal = ((prov.count / totalCount) * 100).toFixed(1);

                return (
                  <div
                    key={prov.name}
                    className={cn(
                      'grid grid-cols-12 gap-2 items-center px-3.5 py-2 text-sm transition-colors',
                      isDark ? 'hover:bg-slate-800/30' : 'hover:bg-sky-50/50'
                    )}
                  >
                    {/* Rank */}
                    <div className="col-span-1 flex items-center justify-center">
                      {i === 0 ? (
                        <span
                          className={cn(
                            'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold border shadow-xs',
                            isDark
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-amber-100 text-amber-800 border-amber-300'
                          )}
                        >
                          1
                        </span>
                      ) : i === 1 ? (
                        <span
                          className={cn(
                            'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold border shadow-xs',
                            isDark
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                              : 'bg-cyan-100 text-cyan-800 border-cyan-300'
                          )}
                        >
                          2
                        </span>
                      ) : i === 2 ? (
                        <span
                          className={cn(
                            'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold border shadow-xs',
                            isDark
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                              : 'bg-blue-100 text-blue-800 border-blue-300'
                          )}
                        >
                          3
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'text-xs font-mono',
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          )}
                        >
                          {i + 1}
                        </span>
                      )}
                    </div>

                    {/* Province Name */}
                    <span
                      className={cn(
                        'col-span-5 font-medium truncate',
                        prov.name === 'ไม่ระบุจังหวัด'
                          ? isDark ? 'text-slate-400 italic' : 'text-slate-500 italic'
                          : isDark ? 'text-slate-200' : 'text-slate-800'
                      )}
                      title={prov.name}
                    >
                      {prov.name}
                    </span>

                    {/* Compact Proportion Bar */}
                    <div className="col-span-3 flex items-center justify-center px-1">
                      <div
                        className={cn(
                          'h-1.5 w-full max-w-[110px] rounded-full overflow-hidden transition-colors',
                          isDark ? 'bg-slate-800/80' : 'bg-slate-200'
                        )}
                        title={`${barPct.toFixed(0)}% ของจังหวัดสูงสุด`}
                      >
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-teal-300 transition-all duration-700 shadow-xs"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Count & Total Pct */}
                    <div className="col-span-3 flex items-baseline justify-end gap-1.5">
                      <span
                        className={cn(
                          'font-mono font-bold text-sm',
                          isDark ? 'text-cyan-300' : 'text-sky-600'
                        )}
                      >
                        {prov.count.toLocaleString()}
                      </span>
                      <span
                        className={cn(
                          'text-[11px]',
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        )}
                      >
                        สถานี
                      </span>
                      <span
                        className={cn(
                          'hidden sm:inline-block text-[10px] font-mono',
                          isDark ? 'text-slate-500' : 'text-slate-400'
                        )}
                      >
                        ({pctOfTotal}%)
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={cn('py-12 text-center text-sm', isDark ? 'text-slate-500' : 'text-slate-400')}>
                ยังไม่มีข้อมูลจังหวัด
              </div>
            )}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
