import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toDate(date: any): Date {
  if (!date) return new Date();
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  if (date.seconds !== undefined) return new Date(date.seconds * 1000);
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function calculateMachineLiveHours(machine: { status: string; currentHours: number; operationalStartTime?: string }) {
  if (machine.status === 'operational' && machine.operationalStartTime) {
    const start = new Date(machine.operationalStartTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    if (diffMs > 0) {
      const diffHours = diffMs / (1000 * 60 * 60);
      return parseFloat((machine.currentHours + diffHours).toFixed(2));
    }
  }
  return machine.currentHours || 0;
}
