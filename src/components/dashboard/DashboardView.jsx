import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Radio, Bell } from 'lucide-react';
import { ShinyText } from '@/components/ui/shiny-text';
import { GlassCard } from '@/components/ui/glass-card';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCards } from './KpiCards';
import { ProvinceChart } from './ProvinceChart';
import { SurveyDonut } from './SurveyDonut';
import { RecentSurveys } from './RecentSurveys';
import { fetchDashboardData, getCachedDashboardData } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

const initialStats = { surveys: 0, stations: 197, allowed: 0, denied: 0 };

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI Metric Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <GlassCard key={i} className="flex flex-col justify-between p-5 h-32" hoverEffect={false}>
            <div>
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-9 w-9 rounded-lg" />
              </div>
              <Skeleton className="h-8 w-24 mt-3 rounded-lg" />
            </div>
            <Skeleton className="h-3 w-36 mt-2 rounded" />
          </GlassCard>
        ))}
      </div>

      {/* Analytics Row: Province & Donut Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Province Skeleton */}
        <div className="lg:col-span-6">
          <GlassCard className="p-5 h-[340px] flex flex-col justify-between" hoverEffect={false}>
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-5 w-48" />
              </div>
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <div className="space-y-3 py-4 flex-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-7 w-full rounded-lg" />
              ))}
            </div>
          </GlassCard>
        </div>

        {/* Donut Skeleton */}
        <div className="lg:col-span-6">
          <GlassCard className="p-5 h-[340px] flex flex-col justify-between" hoverEffect={false}>
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-5 w-36" />
              </div>
              <Skeleton className="h-5 w-28 rounded-full" />
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-4 flex-1">
              <Skeleton className="h-36 w-36 rounded-full" />
              <div className="space-y-3 w-full sm:max-w-[220px]">
                <Skeleton className="h-9 w-full rounded-xl" />
                <Skeleton className="h-9 w-full rounded-xl" />
                <Skeleton className="h-9 w-full rounded-xl" />
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Table Skeleton */}
      <GlassCard className="p-5" hoverEffect={false}>
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <div className="space-y-3 pt-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

export function DashboardView({ onNavigate, onEditSurvey }) {
  const { isDark } = useTheme();

  // Instant SWR Hydration: Initialize from cached snapshot in localStorage if present (0ms render)
  const [data, setData] = useState(() => {
    const cached = getCachedDashboardData();
    if (cached && (cached.stats?.surveys > 0 || cached.recent?.length > 0)) {
      return cached;
    }
    return {
      stats: initialStats,
      provinces: [],
      recent: [],
      updatedAt: null
    };
  });

  const hasExistingData = Boolean(data.updatedAt || data.stats?.surveys > 0 || data.recent?.length > 0);
  const [isInitialLoading, setIsInitialLoading] = useState(!hasExistingData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(true);
  const [countdown, setCountdown] = useState(10);
  const [lastSyncTime, setLastSyncTime] = useState(() =>
    new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [newSurveyAlert, setNewSurveyAlert] = useState(null);
  const prevCountRef = useRef(data.stats?.surveys || null);

  const loadData = useCallback(async (isManual = false) => {
    try {
      if (isManual) setIsRefreshing(true);
      const json = await fetchDashboardData({ force: isManual });

      if (json && json.stats) {
        const prev = prevCountRef.current;
        const current = json?.stats?.surveys || 0;
        if (prev !== null && current > prev) {
          const diff = current - prev;
          setNewSurveyAlert(`ตรวจพบข้อมูลใหม่ +${diff} สถานี (รวม ${current} สถานี)`);
          setTimeout(() => setNewSurveyAlert(null), 8000);
        }
        prevCountRef.current = current;

        setData(json);
      }

      setLastSyncTime(
        new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      setCountdown(10);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsInitialLoading(false);
      if (isManual) setIsRefreshing(false);
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

  // Initial load on mount, BroadcastChannel & storage listeners
  useEffect(() => {
    // Immediate lifecycle data fetch on mount without requiring manual user interaction
    loadData(false);

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

          {/* Manual Sync Button (strictly for on-demand refresh) */}
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-xs',
              isDark
                ? 'border-blue-500/30 bg-blue-950/40 text-sky-300 hover:bg-blue-900/40 hover:text-white'
                : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-900'
            )}
            title="ตรวจสอบข้อมูลสดเดี๋ยวนี้ (รีเฟรชตามต้องการ)"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin', isDark ? 'text-sky-400' : 'text-sky-600')} />
            <span>{isRefreshing ? 'กำลังซิงค์...' : 'อัปเดตสด'}</span>
          </button>
        </div>
      </div>

      {/* Render Skeleton while initial load has no cached data, otherwise render live components */}
      {isInitialLoading && !hasExistingData ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* KPI Metric Cards */}
          <KpiCards stats={data.stats} />

          {/* Analytics Row: Province Breakdown & Survey Result Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Province Breakdown (compact & balanced) */}
            <div className="lg:col-span-6">
              <ProvinceChart provinces={data.provinces} totalSurveys={data.stats?.surveys} />
            </div>

            {/* Survey Donut: Proportions aligned relative to total base count */}
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
              onRefresh={() => loadData(true)}
            />
          </div>
        </>
      )}
    </motion.main>
  );
}

export default DashboardView;
