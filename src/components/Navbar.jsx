import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Menu, X, Sun, Moon, GitBranch, AlertCircle } from 'lucide-react';
import { APP_VERSION } from '@/version';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import { fetchGitHubStatus } from '@/lib/api';
import nbtcLogo from '@/assets/images/nbtc-logo-dashboard.png';

export function Navbar({ onToggleMobileMenu, isMobileMenuOpen }) {
  const { isDark, toggleTheme } = useTheme();
  const [githubStatus, setGithubStatus] = useState({ configured: false, valid: false, repo: 'Thaidimaru/Pre_PM2' });
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [timeStr, setTimeStr] = useState(() =>
    new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    fetchGitHubStatus().then((st) => {
      if (st) setGithubStatus(st);
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStr(
        new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const dateStr = new Date().toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  return (
    <header
      className={cn(
        'sticky top-0 z-40 h-[88px] w-full border-b backdrop-blur-xl transition-colors duration-300',
        isDark
          ? 'border-[rgba(28,139,255,0.45)] bg-[linear-gradient(90deg,#021735,#031b40)] shadow-[0_8px_30px_rgba(0,0,0,0.32)] text-white'
          : 'border-slate-200/80 bg-[linear-gradient(90deg,#ffffff,#f8fafc)] shadow-[0_4px_20px_rgba(0,0,0,0.06)] text-slate-800'
      )}
    >
      <div className="mx-auto flex h-full items-center justify-between px-4 sm:px-6 lg:px-10">
        {/* Brand & Mobile Menu Toggle */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Mobile hamburger toggle (visible on screens < lg) */}
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl border transition-colors lg:hidden focus:outline-none focus:ring-2 focus:ring-blue-500',
              isDark
                ? 'border-blue-500/30 bg-blue-950/40 text-slate-200 hover:bg-blue-900/40 hover:text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-xs'
            )}
            aria-label={isMobileMenuOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
          >
            {isMobileMenuOpen ? <X className="h-5 w-5 text-cyan-400" /> : <Menu className="h-5 w-5" />}
          </button>

          <img
            src={nbtcLogo}
            alt="NBTC Logo"
            onError={(e) => {
              if (e.currentTarget.src !== '/assets/images/nbtc-logo-dashboard.png') {
                e.currentTarget.src = '/assets/images/nbtc-logo-dashboard.png';
              }
            }}
            className="h-10 sm:h-12 lg:h-14 w-auto object-contain drop-shadow-[0_0_12px_rgba(8,127,255,0.3)]"
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span
                className={cn(
                  'text-[10px] sm:text-xs font-bold tracking-[0.15em] sm:tracking-[0.2em]',
                  isDark ? 'text-cyan-400' : 'text-sky-600'
                )}
              >
                Pre Preventive Maintenance
              </span>
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold border',
                  isDark
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                    : 'bg-sky-50 text-sky-700 border-sky-200 shadow-xs'
                )}
              >
                v{APP_VERSION}
              </span>
            </div>
            <span
              className={cn(
                'text-base sm:text-lg font-extrabold tracking-wide lg:text-xl',
                isDark ? 'text-white' : 'text-slate-900'
              )}
            >
              NBTC
            </span>
          </div>
        </div>

        {/* Right Section: Mobile Theme Toggle & Desktop System Strip */}
        <div className="flex items-center gap-3">
          {/* Mobile Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className={cn(
              'flex md:hidden h-10 w-10 items-center justify-center rounded-xl border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500',
              isDark
                ? 'border-blue-500/30 bg-blue-950/40 text-amber-400 hover:bg-blue-900/40'
                : 'border-slate-300 bg-white text-indigo-600 hover:bg-slate-100 shadow-xs'
            )}
            title={isDark ? 'เปลี่ยนเป็นโหมดสว่าง (Light Mode)' : 'เปลี่ยนเป็นโหมดมืด (Dark Mode)'}
            aria-label={isDark ? 'เปลี่ยนเป็นโหมดสว่าง (Light Mode)' : 'เปลี่ยนเป็นโหมดมืด (Dark Mode)'}
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {/* Live System Strip (Tablet & Desktop) */}
          <div
            className={cn(
              'hidden md:flex items-center gap-4 text-sm',
              isDark ? 'text-slate-300' : 'text-slate-600'
            )}
          >
            {/* Online / Offline status indicator */}
            <div
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1 transition-colors',
                isOnline
                  ? isDark
                    ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-xs'
                  : isDark
                    ? 'border-amber-500/30 bg-amber-950/40 text-amber-300'
                    : 'border-amber-300 bg-amber-50 text-amber-700 shadow-xs'
              )}
              title={isOnline ? 'เชื่อมต่ออินเทอร์เน็ตปกติ' : 'ออฟไลน์: บันทึกข้อมูลลงเครื่องอัตโนมัติ'}
            >
              <span className="relative flex h-2.5 w-2.5">
                {isOnline && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={cn(
                    'relative inline-flex h-2.5 w-2.5 rounded-full',
                    isOnline ? 'bg-emerald-500' : 'bg-amber-500'
                  )}
                />
              </span>
              <span className="text-xs font-medium">
                {isOnline ? 'ระบบทำงานปกติ' : 'ออฟไลน์ (โหมดในพื้นที่)'}
              </span>
            </div>

            {/* GitHub sync status indicator */}
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                githubStatus.valid
                  ? isDark
                    ? 'border-sky-500/30 bg-sky-950/40 text-sky-300'
                    : 'border-sky-300 bg-sky-50 text-sky-700 shadow-xs'
                  : githubStatus.configured
                    ? isDark
                      ? 'border-amber-500/30 bg-amber-950/40 text-amber-300'
                      : 'border-amber-300 bg-amber-50 text-amber-700 shadow-xs'
                    : isDark
                      ? 'border-slate-700 bg-slate-800/40 text-slate-400'
                      : 'border-slate-300 bg-slate-100 text-slate-500'
              )}
              title={
                githubStatus.valid
                  ? `GitHub Sync: เชื่อมต่อแล้ว (${githubStatus.repo} [${githubStatus.branch || 'main'}])`
                  : githubStatus.message || (githubStatus.configured ? 'GitHub Token ไม่ถูกต้อง' : 'GitHub Sync: รอการตั้งค่า GITHUB_TOKEN บน Vercel/เซิร์ฟเวอร์')
              }
            >
              {githubStatus.valid ? (
                <GitBranch className={cn('h-3.5 w-3.5', isDark ? 'text-sky-400' : 'text-sky-600')} />
              ) : githubStatus.configured ? (
                <AlertCircle className={cn('h-3.5 w-3.5', isDark ? 'text-amber-400' : 'text-amber-600')} />
              ) : (
                <GitBranch className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span>
                {githubStatus.valid
                  ? 'GitHub เชื่อมต่อ'
                  : githubStatus.configured
                    ? 'Token มีปัญหา'
                    : 'รอตั้งค่า Token'}
              </span>
            </div>

            <div className={cn('h-6 w-px', isDark ? 'bg-slate-700/60' : 'bg-slate-300')} />

            {/* Date & Time */}
            <div className="flex items-center gap-2">
              <Calendar className={cn('h-4 w-4', isDark ? 'text-cyan-400' : 'text-sky-600')} />
              <span>{dateStr}</span>
            </div>

            <div
              className={cn(
                'flex items-center gap-2 font-mono font-semibold',
                isDark ? 'text-white' : 'text-slate-900'
              )}
            >
              <Clock className={cn('h-4 w-4', isDark ? 'text-blue-400' : 'text-blue-600')} />
              <span>{timeStr} น.</span>
            </div>

            <div className={cn('h-6 w-px', isDark ? 'bg-slate-700/60' : 'bg-slate-300')} />

            {/* Theme Toggle Button (Desktop) */}
            <button
              type="button"
              onClick={toggleTheme}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500',
                isDark
                  ? 'border-blue-500/30 bg-blue-950/40 text-slate-200 hover:bg-blue-900/50 hover:text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-xs'
              )}
              title={isDark ? 'เปลี่ยนเป็นโหมดสว่าง (Light Mode)' : 'เปลี่ยนเป็นโหมดมืด (Dark Mode)'}
              aria-label={isDark ? 'เปลี่ยนเป็นโหมดสว่าง (Light Mode)' : 'เปลี่ยนเป็นโหมดมืด (Dark Mode)'}
            >
              {isDark ? (
                <>
                  <Sun className="h-4 w-4 text-amber-400" />
                  <span>โหมดสว่าง</span>
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 text-indigo-600" />
                  <span>โหมดมืด</span>
                </>
              )}
            </button>


          </div>
        </div>
      </div>
    </header>
  );
}
