import React from 'react';
import { Activity, Radio, CheckCircle2, XCircle } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

export function KpiCards({ stats = {}, isLoading = false }) {
  const { isDark } = useTheme();
  const total = Number(stats.surveys) || 0;
  const stations = Number(stats.stations) > 0 ? Number(stats.stations) : 197;
  const allowed = Number(stats.allowed) || 0;
  const denied = Number(stats.denied) || 0;

  const totalPct = stations > 0 ? ((total / stations) * 100).toFixed(1) : '0.0';
  const allowedPct = stations > 0 ? ((allowed / stations) * 100).toFixed(1) : '0.0';
  const deniedPct = stations > 0 ? ((denied / stations) * 100).toFixed(1) : '0.0';

  const cards = [
    {
      label: 'ผลสำรวจทั้งหมด',
      value: total,
      subtext: `ความคืบหน้า ${totalPct}% ของสถานีทั้งหมด`,
      icon: Activity,
      iconColor: isDark ? 'text-blue-400' : 'text-blue-600',
      iconBoxClass: isDark
        ? 'bg-slate-900/60 border-slate-700/50'
        : 'bg-blue-50 border-blue-200/80 text-blue-600 shadow-2xs',
      cardClass: isDark
        ? 'bg-gradient-to-b from-blue-500/10 to-transparent hover:border-blue-500/40'
        : 'bg-white hover:bg-blue-50/20 border-slate-200/90 hover:border-blue-300 shadow-[0_4px_16px_rgba(37,99,235,0.06)]',
      valColor: isDark ? 'text-blue-400' : 'text-blue-600'
    },
    {
      label: 'สถานีในระบบ',
      value: stations,
      subtext: 'ฐานข้อมูลสถานี Master Database',
      icon: Radio,
      iconColor: isDark ? 'text-cyan-400' : 'text-sky-600',
      iconBoxClass: isDark
        ? 'bg-slate-900/60 border-slate-700/50'
        : 'bg-sky-50 border-sky-200/80 text-sky-600 shadow-2xs',
      cardClass: isDark
        ? 'bg-gradient-to-b from-cyan-500/10 to-transparent hover:border-cyan-500/40'
        : 'bg-white hover:bg-sky-50/20 border-slate-200/90 hover:border-sky-300 shadow-[0_4px_16px_rgba(14,165,233,0.06)]',
      valColor: isDark ? 'text-cyan-400' : 'text-sky-600'
    },
    {
      label: 'อนุญาตเข้าพื้นที่',
      value: allowed,
      subtext: `คิดเป็น ${allowedPct}% ของสถานีในระบบ`,
      icon: CheckCircle2,
      iconColor: isDark ? 'text-emerald-400' : 'text-emerald-600',
      iconBoxClass: isDark
        ? 'bg-slate-900/60 border-slate-700/50'
        : 'bg-emerald-50 border-emerald-200/80 text-emerald-600 shadow-2xs',
      cardClass: isDark
        ? 'bg-gradient-to-b from-emerald-500/10 to-transparent hover:border-emerald-500/40'
        : 'bg-white hover:bg-emerald-50/20 border-slate-200/90 hover:border-emerald-300 shadow-[0_4px_16px_rgba(16,185,129,0.06)]',
      valColor: isDark ? 'text-emerald-400' : 'text-emerald-600'
    },
    {
      label: 'ไม่อนุญาตเข้าพื้นที่',
      value: denied,
      subtext: `คิดเป็น ${deniedPct}% ของสถานีในระบบ`,
      icon: XCircle,
      iconColor: isDark ? 'text-rose-400' : 'text-rose-600',
      iconBoxClass: isDark
        ? 'bg-slate-900/60 border-slate-700/50'
        : 'bg-rose-50 border-rose-200/80 text-rose-600 shadow-2xs',
      cardClass: isDark
        ? 'bg-gradient-to-b from-rose-500/10 to-transparent hover:border-rose-500/40'
        : 'bg-white hover:bg-rose-50/20 border-slate-200/90 hover:border-rose-300 shadow-[0_4px_16px_rgba(244,63,94,0.06)]',
      valColor: isDark ? 'text-rose-400' : 'text-rose-600'
    }
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <GlassCard
            key={idx}
            className={cn(
              'flex flex-col justify-between transition-all duration-200',
              card.cardClass
            )}
          >
            <div>
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'text-sm font-semibold leading-normal',
                    isDark ? 'text-slate-300' : 'text-slate-600'
                  )}
                >
                  {card.label}
                </span>
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                    card.iconBoxClass
                  )}
                >
                  <Icon className={cn('h-5 w-5', card.iconColor)} />
                </div>
              </div>
              <div className={cn('mt-3 text-3xl font-extrabold tracking-normal leading-normal lg:text-4xl', card.valColor)}>
                <AnimatedCounter value={card.value} />
              </div>
            </div>

            <div className={cn('mt-2 text-[11px] font-medium border-t pt-2 opacity-80', isDark ? 'border-slate-800/80 text-slate-400' : 'border-slate-100 text-slate-500')}>
              {card.subtext}
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
