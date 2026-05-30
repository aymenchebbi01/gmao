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

export function formatHoursToDays(hours: number, longFormat = false): string {
  if (hours === undefined || hours === null || isNaN(hours) || hours <= 0) {
    return '0 y 0 m 0 d 0 h 0 m';
  }

  // Convert total hours into minutes
  const totalMinutes = Math.round(hours * 60);

  const minutesInHour = 60;
  const minutesInDay = 24 * minutesInHour; // 1440
  const minutesInMonth = 30 * minutesInDay; // 43200
  const minutesInYear = 365 * minutesInDay; // 525600

  let remaining = totalMinutes;

  const years = Math.floor(remaining / minutesInYear);
  remaining %= minutesInYear;

  const months = Math.floor(remaining / minutesInMonth);
  remaining %= minutesInMonth;

  const days = Math.floor(remaining / minutesInDay);
  remaining %= minutesInDay;

  const hrs = Math.floor(remaining / minutesInHour);
  remaining %= minutesInHour;

  const mins = remaining;

  return `${years} y ${months} m ${days} d ${hrs} h ${mins} m`;
}

