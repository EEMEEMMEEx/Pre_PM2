import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Radio, Eye, EyeOff, ArrowRight, AlertCircle, Loader2, Sun, Moon } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { ShinyText } from '@/components/ui/shiny-text';
import { APP_VERSION } from '@/version';
import { loginUser, saveLocalApiToken } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import nbtcLogo from '@/assets/images/nbtc-logo-dashboard.png';

export function LoginView({ onLoginSuccess, onCancel }) {
  const { isDark, toggleTheme } = useTheme();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const data = await loginUser(password);
      if (!data?.ok || !data?.token) {
        throw new Error(data?.error === 'invalid_password' ? 'รหัสผ่านไม่ถูกต้อง' : (data?.error || 'ไม่สามารถเข้าสู่ระบบได้'));
      }
      saveLocalApiToken(data.token);
      if (onLoginSuccess) onLoginSuccess(data.token);
    } catch (err) {
      setErrorMsg(err.message || 'ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบรหัสผ่าน');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-80px)] items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <GlassCard
          className={cn(
            'p-8 sm:p-10 transition-colors',
            isDark ? 'border-blue-500/30' : 'border-slate-200 bg-white/95 shadow-xl'
          )}
          hoverEffect={false}
        >
          {/* Brand Header & Theme Toggle */}
          <div className={cn('flex items-center justify-between pb-6 border-b', isDark ? 'border-slate-800' : 'border-slate-200')}>
            <div className="flex items-center gap-3.5">
              <img
                src={nbtcLogo}
                alt="NBTC Logo"
                onError={(e) => {
                  if (e.currentTarget.src !== '/assets/images/nbtc-logo-dashboard.png') {
                    e.currentTarget.src = '/assets/images/nbtc-logo-dashboard.png';
                  }
                }}
                className="h-12 w-auto object-contain drop-shadow-[0_0_10px_rgba(8,127,255,0.4)]"
              />
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs font-bold tracking-[0.18em]', isDark ? 'text-cyan-400' : 'text-sky-600')}>
                    Pre Preventive Maintenance
                  </span>
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.2 text-[10px] font-semibold border',
                      isDark
                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                        : 'bg-sky-50 text-sky-700 border-sky-200'
                    )}
                  >
                    v{APP_VERSION}
                  </span>
                </div>
                <span className={cn('text-base font-extrabold', isDark ? 'text-white' : 'text-slate-900')}>
                  NBTC MICROWAVE
                </span>
              </div>
            </div>

            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500',
                isDark
                  ? 'border-blue-500/30 bg-blue-950/40 text-amber-400 hover:bg-blue-900/40'
                  : 'border-slate-300 bg-white text-indigo-600 hover:bg-slate-100 shadow-xs'
              )}
              title={isDark ? 'เปลี่ยนเป็นโหมดสว่าง (Light Mode)' : 'เปลี่ยนเป็นโหมดมืด (Dark Mode)'}
              aria-label={isDark ? 'เปลี่ยนเป็นโหมดสว่าง (Light Mode)' : 'เปลี่ยนเป็นโหมดมืด (Dark Mode)'}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          <div className="mt-6 mb-6">
            <h1 className={cn('text-2xl font-bold tracking-normal leading-normal', isDark ? 'text-white' : 'text-slate-900')}>
              <ShinyText>เข้าสู่ระบบ</ShinyText>
            </h1>
            <p className={cn('mt-1.5 text-xs leading-relaxed', isDark ? 'text-slate-400' : 'text-slate-500')}>
              กรุณากรอกรหัสผ่านเพื่อเข้าใช้งาน Dashboard ศูนย์ควบคุม และแบบบันทึกการสำรวจ Field Visit
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label
                htmlFor="login-password"
                className={cn('block text-sm font-semibold mb-1.5', isDark ? 'text-slate-300' : 'text-slate-700')}
              >
                รหัสผ่านสำหรับเข้าใช้งาน
              </label>
              <div className="relative">
                <div className={cn('pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5', isDark ? 'text-slate-400' : 'text-slate-500')}>
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่าน..."
                  required
                  autoFocus
                  className={cn(
                    'w-full rounded-xl pl-10 pr-11 py-2.5 text-base focus:outline-none focus:ring-2',
                    isDark
                      ? 'border border-[rgba(115,149,174,0.3)] bg-[rgba(6,19,33,0.85)] text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/40'
                      : 'border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:ring-sky-500/20 shadow-xs'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className={cn(
                    'absolute inset-y-0 right-0 flex items-center pr-3 transition-colors',
                    isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600'
                  )}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </motion.div>
            )}

            <div className="flex flex-col gap-2">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-blue-500/25 hover:shadow-cyan-500/35 transition-all disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>กำลังตรวจสอบ...</span>
                  </>
                ) : (
                  <>
                    <span>เข้าสู่ระบบ</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </motion.button>

              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className={cn(
                    'w-full py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer',
                    isDark
                      ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/50'
                      : 'border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  )}
                >
                  ยกเลิก / กลับ
                </button>
              )}
            </div>
          </form>

          {/* Footer note */}
          <div className="mt-6 text-center text-[11px] text-slate-400 leading-normal">
            ระบบความปลอดภัยยืนยันตัวตนด้วยสิทธิ์ประจำสถานี • Pre-PM Platform
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
