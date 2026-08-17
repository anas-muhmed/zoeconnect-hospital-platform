import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function parseConfidenceNumber(confidenceStr: string): number {
  if (!confidenceStr) return 50;
  const num = parseInt(confidenceStr.replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? 50 : Math.min(100, Math.max(0, num));
}
