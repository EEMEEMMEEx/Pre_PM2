import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Radio, Bell } from 'lucide-react';
import { ShinyText } from '@/components/ui/shiny-text';
import { KpiCards } from './KpiCards';
import { ProvinceChart } from './ProvinceChart';
import { SurveyDonut } from './SurveyDonut';
import { RecentSurveys } from './RecentSurveys';
import { fetchDashboardData } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

const initialStats = { surveys: 0, stations: 0, allowed: 0, denied: 0 };

export function DashboardView({ onNavigate, onEditSurvey }) {
  const { isDark } = useTheme();
  const [data, setData] = useState({
    stats: initialStats,
    provinces: [],
    recent: [],
    updatedAt: new Date().toISOString()
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(true);
  const [countdown, setCountdown] = useState(10);
  const [lastSyncTime, setLastSyncTime] = useState(() =>
    new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [newSurveyAlert, setNewSurveyAlert] = useState(null);
  const prevCountRef = useRef(null);

  const loadData = useCallback(async (isManual = false) => {
    try {
      if (isManual) setIsLoading(true);
      const json = await fetchDashboardData({ force: isManual });
      
      const prev = prevCountRef.current;
      const current = json?.stats?.surveys || 0;
      if (prev !== null && current > prev) {
        const diff = current - prev;
        setNewSurveyAlert(`ตรวจพบข้อมูลใหม่ +${diff} สถานี (รวม ${current} สถานี)`);
        setTimeout(() => setNewSurveyAlert(null), 8000);
      }
      prevCountRef.current = current;

      setData(json);
      setLastSyncTime(
        new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      setCountdown(10);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      if (isManual) setIsLoading(false);
    }
  }, []);

  // 1-second interval ticker for live countdown
  useEffect(() => {
    if (!isLiveActive) return;

    const timer = setInterval(() => {
      // Pause countdown if tab is hidden
      if (typeof document !== 'undefined' && document.hidden) return;

      setCountdown((prev) => {
        if (prev <= 1) {
          loadData(false);
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLiveActive, loadData]);

  // Initial load, BroadcastChannel & storage listeners
  useEffect(() => {
    loadData(true);

    let bc = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('nbtc_pre_pm_sync_channel');
        bc.onmessage = (event) => {
          if (event.data?.type === 'SURVEYS_UPDATED') {
            loadData(false);
          }
        };
      } catch (e) {}
    }

    const handleSurveysUpdated = () => {
      loadData(false);
    };
    window.addEventListener('nbtc-surveys-updated', handleSurveysUpdated);
    window.addEventListener('storage', handleSurveysUpdated);

    // Refresh immediately when user returns to this tab
    const handleVisibility = () => {
      if (!document.hidden && isLiveActive) {
        loadData(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (bc) bc.close();
      window.removeEventListener('nbtc-surveys-updated', handleSurveysUpdated);
      window.removeEventListener('storage', handleSurveysUpdated);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadData, isLiveActive]);

  return (
    <motion.main
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8"
      >
        {/* Real-time Alert Banner when new surveys arrive */}
        <AnimatePresence>
          {newSurveyAlert && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              className={cn(
                'flex items-center justify-between rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-md',
                isDark
                  ? 'border-emerald-500/40 bg-emerald-950/70 text-emerald-200 shadow-emerald-950/50'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-800 shadow-emerald-100'
              )}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                  <Bell className="h-4 w-4 animate-bounce" />
                </span>
                <div>
                  <p className="text-sm font-bold">{newSurveyAlert}</p>
                  <p className="text-xs opacity-80">ซิงค์และประมวลผลขึ้นหน้าจอควบคุมเรียบร้อยแล้วแบบเรียลไทม์</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNewSurveyAlert(null)}
                className="text-xs underline opacity-70 hover:opacity-100 cursor-pointer"
              >
                ปิด
              </button>
            </motion.div>
          )}
        </AnimatePresence>

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

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Live Real-time Status Badge */}
            <div
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all shadow-xs',
                isLiveActive
                  ? isDark
                    ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : isDark
                    ? 'border-slate-700 bg-slate-800/40 text-slate-400'
                    : 'border-slate-300 bg-slate-100 text-slate-500'
              )}
            >
              <span className="relative flex h-2.5 w-2.5">
                {isLiveActive && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={cn(
                    'relative inline-flex h-2.5 w-2.5 rounded-full',
                    isLiveActive ? 'bg-emerald-500' : 'bg-slate-400'
                  )}
                />
              </span>
              <span>{isLiveActive ? `เรียลไทม์ (${countdown}s)` : 'หยุดพัก'}</span>
              <button
                type="button"
                onClick={() => setIsLiveActive((prev) => !prev)}
                className={cn(
                  'ml-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer',
                  isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-white hover:bg-slate-200 text-slate-700'
                )}
                title={isLiveActive ? 'คลิกเพื่อหยุดการอัปเดตอัตโนมัติ' : 'คลิกเพื่อเริ่มการอัปเดตอัตโนมัติ'}
              >
                {isLiveActive ? 'พัก' : 'เปิด'}
              </button>
            </div>

            {/* Last Updated Timestamp */}
            <span
              className={cn(
                'hidden sm:inline-flex items-center text-xs px-2.5 py-2 rounded-xl border shadow-2xs',
                isDark ? 'border-slate-800 text-slate-400 bg-slate-900/40' : 'border-slate-200 text-slate-500 bg-white'
              )}
              title="เวลาที่ตรวจสอบข้อมูลล่าสุด"
            >
              ล่าสุด: {lastSyncTime}
            </span>

            {/* Manual Sync Button */}
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isLoading}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-xs',
                isDark
                  ? 'border-blue-500/30 bg-blue-950/40 text-sky-300 hover:bg-blue-900/40 hover:text-white'
                  : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-900'
              )}
              title="ตรวจสอบข้อมูลสดเดี๋ยวนี้"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin', isDark ? 'text-sky-400' : 'text-sky-600')} />
              <span>{isLoading ? 'กำลังซิงค์...' : 'อัปเดตสด'}</span>
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
          <RecentSurveys
            recent={data.recent}
            onNavigate={onNavigate}
            onEditSurvey={onEditSurvey}
            onRefresh={loadData}
          />
        </div>
      </motion.main>
  );
}
