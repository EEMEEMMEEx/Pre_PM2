import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { GitBranch, CheckCircle2, AlertCircle, KeyRound, ExternalLink, X, Loader2, Trash2 } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import { getStoredGitHubToken, saveGitHubToken, clearGitHubToken, fetchGitHubStatus } from '@/lib/api';

export function GitHubTokenModal({ isOpen, onClose, onUpdated }) {
  const { isDark } = useTheme();
  const [tokenInput, setTokenInput] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [currentStatus, setCurrentStatus] = useState(null);

  useEffect(() => {
    if (isOpen) {
      const stored = getStoredGitHubToken();
      setTokenInput(stored);
      setTestResult(null);
      fetchGitHubStatus().then((st) => setCurrentStatus(st));
    }
  }, [isOpen]);

  const handleTestToken = async (tokenToTest) => {
    const t = (tokenToTest || tokenInput).trim();
    if (!t) {
      setTestResult({ ok: false, message: 'กรุณากรอก GitHub Token ก่อนทดสอบ' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${t}`,
          Accept: 'application/vnd.github+json',
        },
      });
      if (res.ok) {
        const u = await res.json();
        setTestResult({
          ok: true,
          message: `เชื่อมต่อสำเร็จ! ผู้ใช้งาน: ${u.login} (${u.name || 'ไม่มีชื่อแสดง'})`,
          user: u.login,
        });
      } else if (res.status === 401) {
        setTestResult({
          ok: false,
          message: 'Token ไม่ถูกต้อง หรือหมดอายุแล้ว (401 Bad credentials)',
        });
      } else {
        setTestResult({
          ok: false,
          message: `การเชื่อมต่อผิดพลาด (HTTP ${res.status})`,
        });
      }
    } catch (e) {
      setTestResult({
        ok: false,
        message: `ไม่สามารถเชื่อมต่อ GitHub API ได้: ${e.message}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    const t = tokenInput.trim();
    saveGitHubToken(t);
    const newStatus = await fetchGitHubStatus();
    setCurrentStatus(newStatus);
    if (onUpdated) onUpdated(newStatus);
    onClose();
  };

  const handleRemove = async () => {
    clearGitHubToken();
    setTokenInput('');
    setTestResult(null);
    const newStatus = await fetchGitHubStatus();
    setCurrentStatus(newStatus);
    if (onUpdated) onUpdated(newStatus);
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[94vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-5 sm:p-6 shadow-2xl transition-all',
            isDark
              ? 'border-blue-500/30 bg-[#07172b] text-white shadow-blue-950/50'
              : 'border-slate-200 bg-white text-slate-800 shadow-xl'
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl border',
                  isDark
                    ? 'border-sky-500/30 bg-sky-950/50 text-sky-400'
                    : 'border-sky-200 bg-sky-50 text-sky-600'
                )}
              >
                <GitBranch className="h-5 w-5" />
              </span>
              <div>
                <Dialog.Title className="text-base sm:text-lg font-bold tracking-tight">
                  ตั้งค่าการเชื่อมต่อ GitHub Sync
                </Dialog.Title>
                <Dialog.Description className="text-xs text-slate-400">
                  สถาปัตยกรรมคลาวด์ Cloudflare + GitHub + OneDrive
                </Dialog.Description>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {/* Status overview */}
            <div
              className={cn(
                'rounded-xl border p-3 text-xs flex items-center justify-between',
                currentStatus?.valid
                  ? isDark
                    ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : isDark
                    ? 'border-slate-700 bg-slate-800/40 text-slate-300'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
              )}
            >
              <div className="flex items-center gap-2">
                {currentStatus?.valid ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                )}
                <span>
                  สถานะปัจจุบัน:{' '}
                  <strong>
                    {currentStatus?.valid
                      ? `เชื่อมต่อแล้ว (${currentStatus.user || 'Authorized'})`
                      : 'ยังไม่ได้เชื่อมต่อหรือยังไม่ใส่ Token'}
                  </strong>
                </span>
              </div>
              <span className="font-mono text-[11px] opacity-75">Repo: Thaidimaru/Pre_PM2</span>
            </div>

            {/* Token Input */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-sky-400" />
                  GitHub Personal Access Token (PAT)
                </span>
                <a
                  href="https://github.com/settings/tokens/new?description=NBTC-PrePM-Sync&scopes=repo"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-sky-400 hover:underline flex items-center gap-1"
                >
                  สร้าง Token ที่นี่
                  <ExternalLink className="h-3 w-3" />
                </a>
              </label>
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => {
                  setTokenInput(e.target.value);
                  setTestResult(null);
                }}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx หรือ github_pat_..."
                className={cn(
                  'w-full rounded-xl border px-3.5 py-2.5 text-sm font-mono transition-colors focus:outline-none focus:ring-2',
                  isDark
                    ? 'border-slate-700 bg-slate-900/80 text-white placeholder:text-slate-500 focus:border-sky-500 focus:ring-sky-500/30'
                    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:ring-sky-500/20'
                )}
              />
              <p className="mt-1 text-[11px] text-slate-400">
                สิทธิ์ที่ต้องการ: <code>repo</code> หรือ <code>contents: write</code> (สำหรับส่งผลสำรวจเข้าโฟลเดอร์ <code>data/surveys</code>)
              </p>
            </div>

            {/* Test result display */}
            {testResult && (
              <div
                className={cn(
                  'rounded-xl border p-3 text-xs flex items-center gap-2',
                  testResult.ok
                    ? isDark
                      ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-200'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : isDark
                      ? 'border-rose-500/40 bg-rose-950/60 text-rose-200'
                      : 'border-rose-300 bg-rose-50 text-rose-800'
                )}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            {/* Architecture Explanatory Note */}
            <div
              className={cn(
                'rounded-xl border p-3 text-[11px] space-y-1',
                isDark ? 'border-sky-500/20 bg-sky-950/20 text-slate-300' : 'border-sky-100 bg-sky-50/60 text-slate-600'
              )}
            >
              <p className="font-semibold text-sky-400">การทำงานร่วมกัน 3 แพลตฟอร์ม:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li><strong>Cloudflare R2:</strong> รันเว็บแอปและหน้า Dashboard แบบเรียลไทม์ความเร็วสูง</li>
                <li><strong>GitHub:</strong> จัดเก็บข้อมูลสำรวจ (<code>data/surveys</code>) และซิงค์ข้อมูลระหว่างผู้ใช้</li>
                <li><strong>OneDrive:</strong> จัดเก็บรูปถ่ายความละเอียดสูง, ฐานข้อมูล SQLite และไฟล์ Excel ในเครื่องอย่างปลอดภัย</li>
              </ul>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-5 flex items-center justify-between gap-3 pt-3 border-t border-white/10">
            <div>
              {getStoredGitHubToken() && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-xl transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>ลบ Token</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleTestToken(tokenInput)}
                disabled={isTesting || !tokenInput.trim()}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer',
                  isDark
                    ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                )}
              >
                {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                <span>ทดสอบการเชื่อมต่อ</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1.5 rounded-xl border border-sky-400/40 bg-linear-to-r from-sky-500 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:from-sky-400 hover:to-blue-500 transition-all cursor-pointer"
              >
                <span>บันทึก Token</span>
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
