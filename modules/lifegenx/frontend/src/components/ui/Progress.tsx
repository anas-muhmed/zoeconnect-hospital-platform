import React from 'react';
import { cn } from '../../lib/utils';

export interface ProgressProps {
  value: number; // 0 to 100
  className?: string;
  barClassName?: string;
  color?: 'teal' | 'emerald' | 'amber' | 'rose' | 'sky';
}

export function Progress({ value, className, barClassName, color = 'teal' }: ProgressProps) {
  const colorStyles = {
    teal: 'bg-gradient-to-r from-teal-500 to-emerald-500',
    emerald: 'bg-gradient-to-r from-emerald-500 to-teal-400',
    amber: 'bg-gradient-to-r from-amber-500 to-yellow-400',
    rose: 'bg-gradient-to-r from-rose-500 to-pink-500',
    sky: 'bg-gradient-to-r from-sky-500 to-cyan-400'
  };

  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500 ease-out', colorStyles[color], barClassName)}
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200 dark:bg-slate-800/80', className)} />;
}
