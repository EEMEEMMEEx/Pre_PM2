import React, { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Settings,
  Shield,
  ShieldCheck,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  X,
  RefreshCw,
  Download,
  FolderCheck,
  HardDrive,
  FileText,
  Image as ImageIcon,
  Check,
  ArrowRight
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import {
  fetchOneDriveStatus,
  fetchDashboardData
} from '@/lib/api';
import { toast } from '@/components/ui/toast';

// Passcode strictly required by system specification
const REQUIRED_PASSCODE = 'Welcomw@01';

export function SettingsModal({ isOpen, onClose, initialTab, onGitHubUpdated }) {
  const { isDark } = useTheme();

  // Purely component-local security state — NEVER saved to localStorage or sessionStorage
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [passcodeError, setPasscodeError] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  // OneDrive states
  const [oneDriveStatus, setOneDriveStatus] = useState(null);
  const [isSyncingOneDrive, setIsSyncingOneDrive] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const passcodeInputRef = useRef(null);

  // Reset all authentication and local form state every time modal closes or opens
  useEffect(() => {
    if (isOpen) {
      setIsUnlocked(false);
      setPasscodeInput('');
      setShowPasscode(false);
      setPasscodeError('');
      setIsShaking(false);
      setSyncSuccess(false);
      setIsSyncingOneDrive(false);

      fetchOneDriveStatus().then((st) => setOneDriveStatus(st));

      // Auto-focus passcode input on open
      setTimeout(() => {
        passcodeInputRef.current?.focus();
      }, 150);
    } else {
      // Immediate state purge on dismiss/close
      setIsUnlocked(false);
      setPasscodeInput('');
      setPasscodeError('');
      setShowPasscode(false);
      setSyncSuccess(false);
      setIsSyncingOneDrive(false);
    }
  }, [isOpen]);

  // Handle closing modal with complete auth reset
  const handleClose = () => {
    setIsUnlocked(false);
    setPasscodeInput('');
    setPasscodeError('');
    setShowPasscode(false);
    setSyncSuccess(false);
    setIsSyncingOneDrive(false);
    onClose?.();
  };

  // Passcode verification logic
  const handleVerifyPasscode = (e) => {
    e?.preventDefault?.();
    const cleanInput = passcodeInput.trim();

    if (!cleanInput) {
      setPasscodeError('กรุณากรอกรหัสผ่านความปลอดภัย');
      triggerShake();
      return;
    }

    if (cleanInput === REQUIRED_PASSCODE) {
      setIsUnlocked(true);
      setPasscodeError('');
      setIsShaking(false);
    } else {
      setPasscodeError('รหัสผ่านความปลอดภัยไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
      triggerShake();
      passcodeInputRef.current?.focus();
      passcodeInputRef.current?.select();
    }
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  // --- OneDrive Handlers ---
  const handleForceSyncOneDrive = async () => {
    setIsSyncingOneDrive(true);
    setSyncSuccess(false);
    try {
      await fetchDashboardData({ force: true });
      const updatedStatus = await fetchOneDriveStatus();
      setOneDriveStatus(updatedStatus);
      setSyncSuccess(true);
      toast.success('ซิงค์ข้อมูลกับ OneDrive สำเร็จ');
      setTimeout(() => setSyncSuccess(false), 3000);
    } catch (e) {
      console.warn('Sync error:', e);
      toast.error('การซิงค์ OneDrive ขัดข้อง: ' + (e.message || ''));
    } finally {
      setIsSyncingOneDrive(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const data = await fetchDashboardData();
      const jsonStr = JSON.stringify(data?.recent || [], null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NBTC_OneDrive_Surveys_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('ดาวน์โหลดไฟล์สำรองข้อมูล JSON เรียบร้อยแล้ว');
    } catch (e) {
      toast.error('ไม่สามารถดาวน์โหลดข้อมูลสำรองได้: ' + e.message);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md transition-all duration-200" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[95vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border shadow-2xl transition-all duration-200 focus:outline-none',
            isUnlocked ? 'max-w-2xl' : 'max-w-md',
            isDark
              ? 'border-blue-500/30 bg-[#061428] text-white shadow-[0_20px_60px_rgba(0,0,0,0.7)]'
              : 'border-slate-200 bg-white text-slate-800 shadow-2xl'
          )}
        >
          {/* =========================================================================
              VIEW 1: SECURITY PASSCODE VERIFICATION (LOCKED STATE)
             ========================================================================= */}
          {!isUnlocked ? (
            <div className="p-6 sm:p-7">
              {/* Header with glowing Security Badge */}
              <div className="flex flex-col items-center text-center">
                <div
                  className={cn(
                    'relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border shadow-lg transition-transform',
                    isDark
                      ? 'border-cyan-500/40 bg-gradient-to-b from-cyan-950/60 to-blue-950/80 text-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.25)]'
                      : 'border-sky-300 bg-gradient-to-b from-sky-50 to-blue-50 text-sky-600 shadow-md'
                  )}
                >
                  <Shield className="h-8 w-8" />
                  <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-slate-950 shadow-xs">
                    <Lock className="h-3.5 w-3.5 stroke-[2.5]" />
                  </div>
                </div>

                <Dialog.Title className="text-xl font-bold tracking-tight">
                  ยืนยันความปลอดภัย
                </Dialog.Title>
                <Dialog.Description
                  className={cn(
                    'mt-1.5 text-xs sm:text-sm max-w-xs leading-relaxed',
                    isDark ? 'text-slate-300' : 'text-slate-600'
                  )}
                >
                  กรุณากรอกรหัสผ่านเพื่อเข้าถึงการตั้งค่าระบบ (Microsoft OneDrive)
                </Dialog.Description>
              </div>

              {/* Security Form */}
              <form onSubmit={handleVerifyPasscode} className="mt-6 space-y-4">
                <div className={cn('transition-transform duration-150', isShaking && 'animate-shake')}>
                  <label
                    htmlFor="security-passcode-input"
                    className="block text-xs font-semibold mb-1.5 text-left"
                  >
                    รหัสผ่านความปลอดภัย (Security Passcode)
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <input
                      id="security-passcode-input"
                      ref={passcodeInputRef}
                      type={showPasscode ? 'text' : 'password'}
                      value={passcodeInput}
                      onChange={(e) => {
                        setPasscodeInput(e.target.value);
                        if (passcodeError) setPasscodeError('');
                      }}
                      placeholder="••••••••••••"
                      autoComplete="off"
                      className={cn(
                        'w-full rounded-xl border py-2.5 pl-10 pr-10 text-sm tracking-wider font-mono transition-all focus:outline-none focus:ring-2',
                        passcodeError
                          ? 'border-rose-500 bg-rose-500/10 focus:ring-rose-500/30'
                          : isDark
                          ? 'border-slate-700 bg-slate-900/90 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500/30'
                          : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:ring-sky-500/20'
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasscode((prev) => !prev)}
                      className={cn(
                        'absolute inset-y-0 right-0 flex items-center pr-3 transition-colors cursor-pointer',
                        isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600'
                      )}
                      aria-label={showPasscode ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                      title={showPasscode ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                    >
                      {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {passcodeError && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-400 animate-fade-in">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{passcodeError}</span>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className={cn(
                      'rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer',
                      isDark
                        ? 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                        : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                    )}
                  >
                    ยกเลิก
                  </button>

                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:from-cyan-400 hover:to-blue-500 active:scale-95 transition-all cursor-pointer"
                  >
                    <span>ยืนยันและปลดล็อก</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </form>

              {/* Close Button top-right */}
              <button
                type="button"
                onClick={handleClose}
                className={cn(
                  'absolute right-4 top-4 rounded-lg p-1.5 transition-colors cursor-pointer',
                  isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-800'
                )}
                aria-label="ปิด"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            /* =========================================================================
                VIEW 2: UNLOCKED CONSOLIDATED SETTINGS PANEL (MICROSOFT ONEDRIVE)
               ========================================================================= */
            <div className="p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-start justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-xl border shadow-md',
                      isDark
                        ? 'border-blue-500/40 bg-blue-950/60 text-cyan-400'
                        : 'border-sky-300 bg-sky-50 text-sky-600'
                    )}
                  >
                    <Settings className="h-6 w-6" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <Dialog.Title className="text-lg sm:text-xl font-bold tracking-tight">
                        การตั้งค่าระบบ (System Settings)
                      </Dialog.Title>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                          isDark
                            ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        )}
                        title="เข้าถึงผ่านการยืนยันรหัสผ่านความปลอดภัยแล้ว (สถานะจะรีเซ็ตทันทีเมื่อปิดหน้าต่าง)"
                      >
                        <ShieldCheck className="h-3 w-3 text-emerald-400" />
                        <span>ปลดล็อกแล้ว</span>
                      </span>
                    </div>
                    <Dialog.Description className="text-xs text-slate-400 mt-0.5">
                      จัดการศูนย์ข้อมูล Microsoft OneDrive
                    </Dialog.Description>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClose}
                  className={cn(
                    'rounded-lg p-1.5 transition-colors cursor-pointer',
                    isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                  )}
                  aria-label="ปิดและล็อคระบบ"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Direct Microsoft OneDrive Content */}
              <div className="mt-4 space-y-4 animate-fade-in">
                {/* Account & Status Overview Card */}
                <div
                  className={cn(
                    'rounded-xl border p-4 space-y-2.5 transition-all',
                    isDark
                      ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
                      : 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider">
                        OneDrive เชื่อมต่อและพร้อมใช้งาน
                      </span>
                    </div>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-[11px] font-semibold border',
                        isDark
                          ? 'border-emerald-500/40 bg-emerald-900/40 text-emerald-300'
                          : 'border-emerald-300 bg-white text-emerald-700'
                      )}
                    >
                      Primary Cloud Hub
                    </span>
                  </div>

                  <div className="text-xs space-y-1 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="opacity-75 font-sans">บัญชีผู้ดูแล:</span>
                      <strong className="text-sm font-semibold tracking-wide text-sky-400">
                        {oneDriveStatus?.account || 'utai323@gmail.com'}
                      </strong>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11.5px] opacity-80 break-all font-sans">
                      <FolderCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <span>โฟลเดอร์หลัก: <code>OneDrive/NBTC Microwave/Data/</code></span>
                    </div>
                  </div>
                </div>

                {/* Storage Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div
                    className={cn(
                      'rounded-xl border p-3 flex flex-col justify-between',
                      isDark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-50'
                    )}
                  >
                    <div className="flex items-center gap-2 text-slate-400 mb-1">
                      <FileText className="h-4 w-4 text-sky-400" />
                      <span className="font-semibold text-slate-300">แบบสำรวจ</span>
                    </div>
                    <div className="text-lg font-bold font-mono text-sky-400">
                      {oneDriveStatus?.surveysCount || 180} สถานี
                    </div>
                    <span className="text-[10.5px] text-slate-500 mt-1">ไฟล์ JSON ซิงค์เรียลไทม์</span>
                  </div>

                  <div
                    className={cn(
                      'rounded-xl border p-3 flex flex-col justify-between',
                      isDark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-50'
                    )}
                  >
                    <div className="flex items-center gap-2 text-slate-400 mb-1">
                      <ImageIcon className="h-4 w-4 text-cyan-400" />
                      <span className="font-semibold text-slate-300">ภาพถ่ายภาคสนาม</span>
                    </div>
                    <div className="text-lg font-bold font-mono text-cyan-400">
                      {oneDriveStatus?.photosCount || 108} รูป
                    </div>
                    <span className="text-[10.5px] text-slate-500 mt-1">จัดเก็บบน OneDrive ปลอดภัย</span>
                  </div>

                  <div
                    className={cn(
                      'rounded-xl border p-3 flex flex-col justify-between',
                      isDark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-50'
                    )}
                  >
                    <div className="flex items-center gap-2 text-slate-400 mb-1">
                      <HardDrive className="h-4 w-4 text-emerald-400" />
                      <span className="font-semibold text-slate-300">ฐานข้อมูล Master</span>
                    </div>
                    <div className="text-sm font-bold font-mono text-emerald-400 truncate">
                      survey.db + Excel
                    </div>
                    <span className="text-[10.5px] text-slate-500 mt-1">DATABASE.xlsx ครบถ้วน</span>
                  </div>
                </div>

                {/* Sync Actions */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleForceSyncOneDrive}
                    disabled={isSyncingOneDrive}
                    className={cn(
                      'w-full sm:flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold border transition-all cursor-pointer shadow-xs',
                      syncSuccess
                        ? 'border-emerald-500 bg-emerald-600 text-white'
                        : isDark
                        ? 'border-sky-500/50 bg-sky-600 hover:bg-sky-500 text-white'
                        : 'border-sky-600 bg-sky-600 hover:bg-sky-700 text-white'
                    )}
                  >
                    {syncSuccess ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span>ซิงค์ข้อมูลสำเร็จแล้ว</span>
                      </>
                    ) : isSyncingOneDrive ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>กำลังซิงค์ข้อมูลจาก OneDrive...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        <span>ซิงค์ข้อมูลเดี๋ยวนี้ (Force Sync)</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadBackup}
                    className={cn(
                      'w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold border transition-colors cursor-pointer',
                      isDark
                        ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 shadow-xs'
                    )}
                    title="ดาวน์โหลดไฟล์ JSON สำรองของแบบสำรวจทั้งหมด"
                  >
                    <Download className="h-4 w-4 text-emerald-500" />
                    <span>สำรองข้อมูล (JSON)</span>
                  </button>
                </div>
              </div>

              {/* Bottom Complete / Close Button */}
              <div className="mt-6 pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  เมื่อปิดหน้าต่าง ระบบจะล็อคการเข้าถึงอัตโนมัติ
                </span>
                <button
                  type="button"
                  onClick={handleClose}
                  className={cn(
                    'rounded-xl border px-4 py-2 text-xs font-semibold transition-colors cursor-pointer',
                    isDark
                      ? 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                      : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  )}
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
