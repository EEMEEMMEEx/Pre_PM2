import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

/**
 * Lightweight toast system (ไม่เพิ่ม dependency ภายนอก)
 * ใช้ผ่าน `toast.error('...')` ได้จากทุก module และ mount `<ToastHost />` เพียงครั้งเดียวใน App
 */
const TOAST_EVENT = 'nbtc-toast';
let toastSeq = 0;

function dispatchToast(detail) {
  if (typeof window === 'undefined') return null;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
  return detail.id;
}

export const toast = {
  show({ type = 'info', message = '', duration } = {}) {
    const id = ++toastSeq;
    return dispatchToast({ id, type, message: String(message || ''), duration });
  },
  success(message, duration) {
    return toast.show({ type: 'success', message, duration });
  },
  error(message, duration) {
    return toast.show({ type: 'error', message, duration });
  },
  info(message, duration) {
    return toast.show({ type: 'info', message, duration });
  },
  warning(message, duration) {
    return toast.show({ type: 'warning', message, duration });
  },
};

const VARIANTS = {
  success: {
    Icon: CheckCircle2,
    iconClass: 'text-emerald-500',
    darkIconClass: 'text-emerald-400',
    barClass: 'bg-emerald-500',
  },
  error: {
    Icon: AlertTriangle,
    iconClass: 'text-rose-500',
    darkIconClass: 'text-rose-400',
    barClass: 'bg-rose-500',
  },
  warning: {
    Icon: AlertTriangle,
    iconClass: 'text-amber-500',
    darkIconClass: 'text-amber-400',
    barClass: 'bg-amber-500',
  },
  info: {
    Icon: Info,
    iconClass: 'text-sky-600',
    darkIconClass: 'text-sky-400',
    barClass: 'bg-sky-500',
  },
};

export function ToastHost() {
  const { isDark } = useTheme();
  const [items, setItems] = useState([]);

  const remove = useCallback((id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    const handle = (event) => {
      const detail = event.detail || {};
      const id = detail.id || ++toastSeq;
      const type = VARIANTS[detail.type] ? detail.type : 'info';
      const duration =
        typeof detail.duration === 'number' ? detail.duration : type === 'error' ? 8000 : 5000;

      setItems((prev) => [...prev.filter((item) => item.id !== id).slice(-3), { id, type, message: detail.message }]);
      if (duration > 0) {
        setTimeout(() => remove(id), duration);
      }
    };
    window.addEventListener(TOAST_EVENT, handle);
    return () => window.removeEventListener(TOAST_EVENT, handle);
  }, [remove]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
      aria-live="polite"
      role="status"
    >
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const variant = VARIANTS[item.type];
          const Icon = variant.Icon;
          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={cn(
                'pointer-events-auto relative flex w-full max-w-md items-start gap-2.5 overflow-hidden rounded-xl border py-2.5 pl-3 pr-2 shadow-xl backdrop-blur-md',
                isDark
                  ? 'border-[rgba(56,149,255,0.28)] bg-[linear-gradient(145deg,rgba(14,33,58,0.96),rgba(7,19,35,0.96))] text-slate-100'
                  : 'border-slate-200 bg-white/98 text-slate-800'
              )}
            >
              <span className={cn('absolute inset-y-0 left-0 w-1', variant.barClass)} aria-hidden="true" />
              <Icon
                className={cn('mt-0.5 h-4 w-4 shrink-0', isDark ? variant.darkIconClass : variant.iconClass)}
                aria-hidden="true"
              />
              <p className="flex-1 text-xs font-semibold leading-relaxed break-words whitespace-pre-line">
                {item.message}
              </p>
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label="ปิดการแจ้งเตือน"
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer',
                  isDark ? 'text-slate-400 hover:bg-slate-700/60 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                )}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default ToastHost;
