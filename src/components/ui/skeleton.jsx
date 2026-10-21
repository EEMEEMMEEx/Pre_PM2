import React from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/60 transition-colors',
        className
      )}
      {...props}
    />
  );
}
