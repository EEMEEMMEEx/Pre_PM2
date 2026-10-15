import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Radio } from 'lucide-react';
import { ShinyText } from '@/components/ui/shiny-text';
import { KpiCards } from './KpiCards';
import { ProvinceChart } from './ProvinceChart';
import { SurveyDonut } from './SurveyDonut';
import { RecentSurveys } from './RecentSurveys';
import { fetchDashboardData } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

const initialStats = { surveys: 0, stations: 0, allowed: 0, denied: 0 };

export function DashboardView({ onNavigate }) {
  const { isDark } = useTheme();
  const [data, setData] = useState({
    stats: initialStats,
    provinces: [],
    recent: [],
    updatedAt: new Date().toISOString()
  });
  const [isLoading, setIsLoading] = useState(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const json = await fetchDashboardData();
      setData(json);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.main
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8"
      >
        {/* Top Hero Banner */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2">
          <div>
            <div
              className={cn(
                'flex items-center gap-2 text-xs font-bold uppercase tracking-widest',
                isDark ? 'text-cyan-400' : 'text-sky-600'
              )}
            >
              <Radio className="h-3.5 w-3.5" />
              <span>Operational Telemetry & Control</span>
            </div>
            <h1
              className={cn(
                'mt-1 text-3xl font-extrabold tracking-normal leading-normal lg:text-4xl',
                isDark ? 'text-white' : 'text-slate-900'
              )}
            >
              <ShinyText>ศูนย์ควบคุมผลการตรวจเยี่ยมเจ้าของพื้นที่สถานีวิทยุคมนาคม (Pre-PM)</ShinyText>
            </h1>
            <p className={cn('mt-1 text-sm leading-relaxed', isDark ? 'text-slate-400' : 'text-slate-500')}>
              ติดตามความคืบหน้าการลงพื้นที่ตรวจเยี่ยมเจ้าของพื้นที่สถานีวิทยุคมนาคม (Pre-PM) แบบเรียลไทม์
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer',
                isDark
                  ? 'border-slate-700/80 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-xs'
              )}
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin', isDark ? 'text-cyan-400' : 'text-sky-600')} />
              <span>อัปเดตข้อมูล</span>
            </button>
          </div>
        </div>

        {/* KPI Metric Cards */}
        <KpiCards stats={data.stats} />

        {/* Analytics Row: Province Breakdown & Survey Result Donut */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Province Breakdown (compact & balanced) */}
          <div className="lg:col-span-6">
            <ProvinceChart provinces={data.provinces} totalSurveys={data.stats?.surveys} />
          </div>

          {/* Survey Donut */}
          <div className="lg:col-span-6">
            <SurveyDonut stats={data.stats} />
          </div>
        </div>

        {/* Survey Records & History Table (Full Width) */}
        <div className="w-full">
          <RecentSurveys recent={data.recent} onNavigate={onNavigate} />
        </div>
      </motion.main>
  );
}
