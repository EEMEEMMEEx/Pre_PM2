import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { 
  Cloud, 
  CheckCircle2, 
  RefreshCw, 
  Download, 
  FolderCheck, 
  HardDrive, 
  FileText, 
  Image as ImageIcon, 
  ShieldCheck, 
  X, 
  GitBranch, 
  Check 
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import { fetchOneDriveStatus, fetchDashboardData } from '@/lib/api';

export function OneDriveSyncModal({ isOpen, onClose, onOpenGitHubModal }) {
  const { isDark } = useTheme();
  const [status, setStatus] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSyncSuccess(false);
      fetchOneDriveStatus().then((st) => setStatus(st));
    }
  }, [isOpen]);

  const handleForceSync = async () => {
    setIsSyncing(true);
    setSyncSuccess(false);
    try {
      await fetchDashboardData({ force: true });
      const updatedStatus = await fetchOneDriveStatus();
      setStatus(updatedStatus);
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
    } catch (e) {
      console.warn('Sync error:', e);
    } finally {
      setIsSyncing(false);
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
    } catch (e) {
      alert('ไม่สามารถดาวน์โหลดข้อมูลสำรองได้: ' + e.message);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[94vw] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-5 sm:p-6 shadow-2xl transition-all',
            isDark
              ? 'border-sky-500/30 bg-[#07172b] text-white shadow-blue-950/60'
              : 'border-slate-200 bg-white text-slate-800 shadow-xl'
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-3.5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-xl border shadow-sm',
                  isDark
                    ? 'border-sky-500/40 bg-sky-950/60 text-sky-400'
                    : 'border-sky-300 bg-sky-50 text-sky-600'
                )}
              >
                <Cloud className="h-6 w-6" />
              </span>
              <div>
                <Dialog.Title className="text-base sm:text-lg font-bold tracking-tight">
                  ศูนย์กลางจัดเก็บและซิงค์ข้อมูล — Microsoft OneDrive
                </Dialog.Title>
                <Dialog.Description
                  className={cn('text-xs mt-0.5', isDark ? 'text-slate-400' : 'text-slate-500')}
                >
                  ระบบหลักสำหรับบันทึก ซิงค์ และสำรองข้อมูลแบบสำรวจ NBTC Microwave
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className={cn(
                  'rounded-lg p-1.5 transition-colors cursor-pointer',
                  isDark
                    ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Account & Connection Card */}
          <div className="mt-4 space-y-3.5">
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
                    OneDrive เชื่อมต่อและซิงค์สมบูรณ์
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
                  <span className="opacity-75 font-sans">บัญชี OneDrive:</span>
                  <strong className="text-sm font-semibold tracking-wide text-sky-400">
                    {status?.account || 'utai323@gmail.com'}
                  </strong>
                </div>
                <div className="flex items-center gap-1.5 text-[11.5px] opacity-80 break-all font-sans">
                  <FolderCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span>โฟลเดอร์หลัก: <code>OneDrive/NBTC Microwave/Data/</code></span>
                </div>
              </div>
            </div>

            {/* Storage Items Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              {/* Surveys JSON */}
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
                  {status?.surveysCount || 91} สถานี
                </div>
                <span className="text-[10.5px] text-slate-500 mt-1">ไฟล์ JSON ซิงค์เรียลไทม์</span>
              </div>

              {/* Photos Folder */}
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
                  จัดเก็บบน OneDrive
                </div>
                <span className="text-[10.5px] text-slate-500 mt-1">ปลอดภัย ไม่เปลืองโควตา R2</span>
              </div>

              {/* Master DB */}
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
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
              <button
                type="button"
                onClick={handleForceSync}
                disabled={isSyncing}
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
                ) : isSyncing ? (
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

            {/* Fallback & Advanced option */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>ศูนย์กลางหลัก: Microsoft OneDrive (utai323@gmail.com)</span>
              </span>
              {onOpenGitHubModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenGitHubModal();
                  }}
                  className="inline-flex items-center gap-1 text-sky-400 hover:underline cursor-pointer"
                >
                  <GitBranch className="h-3 w-3" />
                  <span>ตั้งค่า GitHub สำรอง</span>
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
