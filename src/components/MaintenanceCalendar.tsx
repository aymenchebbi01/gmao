import React, { useState, useEffect, useMemo } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  parseISO,
  differenceInDays,
  isValid
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  AlertTriangle,
  Wrench,
  Clock,
  CheckCircle2,
  Gauge
} from 'lucide-react';
import { api } from '../services/api';
import { Machine, WorkOrder } from '../types';
import { toast } from 'sonner';

// ─── Colour helpers ───────────────────────────────────────────────────────────

type DotKind = 'corrective' | 'preventive-done' | 'pm-overdue' | 'pm-upcoming';

const DOT_CLASSES: Record<DotKind, string> = {
  'corrective':      'bg-red-500',
  'preventive-done': 'bg-emerald-500',
  'pm-overdue':      'bg-rose-600 animate-pulse',
  'pm-upcoming':     'bg-amber-400',
};

const PILL_CLASSES: Record<DotKind, string> = {
  'corrective':      'bg-red-50 border-red-200 text-red-800',
  'preventive-done': 'bg-emerald-50 border-emerald-200 text-emerald-800',
  'pm-overdue':      'bg-rose-50 border-rose-300 text-rose-800',
  'pm-upcoming':     'bg-amber-50 border-amber-200 text-amber-800',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEntry {
  date: string;          // yyyy-MM-dd
  kind: DotKind;
  label: string;
  machineName?: string;
  daysRemaining?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MaintenanceCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [machines, setMachines] = useState<Machine[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [mList, wList] = await Promise.all([
          api.getMachines(),
          api.getWorkOrders(),
        ]);
        setMachines(mList);
        setWorkOrders(wList);
      } catch {
        toast.error('Failed to load calendar data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Build entries ─────────────────────────────────────────────────────────────
  const entries = useMemo<CalendarEntry[]>(() => {
    const result: CalendarEntry[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Work-order–based interventions (corrective + preventive done)
    workOrders.forEach(wo => {
      const rawDate = wo.completedAt || wo.date || wo.createdAt;
      if (!rawDate) return;
      const dateStr = rawDate.split('T')[0];

      if (wo.type === 'corrective') {
        result.push({
          date: dateStr,
          kind: 'corrective',
          label: wo.title,
          machineName: wo.machineName,
        });
      } else if (wo.type === 'preventive') {
        result.push({
          date: dateStr,
          kind: 'preventive-done',
          label: wo.title,
          machineName: wo.machineName,
        });
      }
    });

    // 2. Scheduled / upcoming PM from machine.nextMaintenance
    machines.forEach(m => {
      if (!m.nextMaintenance || !m.nextMaintenance.trim()) return;
      const dateStr = m.nextMaintenance.split('T')[0];
      try {
        const d = parseISO(dateStr);
        if (!isValid(d)) return;
        d.setHours(0, 0, 0, 0);
        const diff = differenceInDays(d, today);
        const kind: DotKind = diff < 0 ? 'pm-overdue' : 'pm-upcoming';
        result.push({
          date: dateStr,
          kind,
          label: `PM préventif – ${m.name}`,
          machineName: m.name,
          daysRemaining: diff,
        });
      } catch { /* skip */ }
    });

    return result;
  }, [workOrders, machines]);

  // ── Upcoming preventives by date side-panel ──────────────────────────────────
  const upcomingPM = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return machines
      .filter(m => {
        if (!m.nextMaintenance) return false;
        try {
          const d = parseISO(m.nextMaintenance.split('T')[0]);
          return isValid(d);
        } catch { return false; }
      })
      .map(m => {
        const d = parseISO(m.nextMaintenance!.split('T')[0]);
        d.setHours(0, 0, 0, 0);
        return { machine: m, date: d, diff: differenceInDays(d, today) };
      })
      .sort((a, b) => a.diff - b.diff);
  }, [machines]);

  // ── Upcoming preventives by working hours ──────────────────────────────────────
  const upcomingPMByHours = useMemo(() => {
    return machines
      .filter(m =>
        m.nextMaintenanceHours != null &&
        m.currentHours        != null &&
        m.nextMaintenanceHours > 0
      )
      .map(m => {
        const remaining = (m.nextMaintenanceHours ?? 0) - (m.currentHours ?? 0);
        return {
          machine: m,
          current: m.currentHours ?? 0,
          threshold: m.nextMaintenanceHours ?? 0,
          remaining,                      // negative = overdue
          pct: Math.min(100, Math.round(((m.currentHours ?? 0) / (m.nextMaintenanceHours ?? 1)) * 100)),
        };
      })
      .sort((a, b) => a.remaining - b.remaining);   // most urgent first
  }, [machines]);

  // ── Calendar grid ─────────────────────────────────────────────────────────────
  const monthStart  = startOfMonth(currentDate);
  const monthEnd    = endOfMonth(currentDate);
  const gridStart   = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd     = endOfWeek(monthEnd,   { weekStartsOn: 1 });
  const days        = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const entriesForDay = (day: Date): CalendarEntry[] => {
    const key = format(day, 'yyyy-MM-dd');
    return entries.filter(e => e.date === key);
  };

  // ── Selected day entries ───────────────────────────────────────────────────────
  const selectedEntries = useMemo(() => {
    if (!selectedDay) return [];
    return entries.filter(e => e.date === selectedDay);
  }, [selectedDay, entries]);

  // Overdue count (date + hours)
  const overdueCount =
    upcomingPM.filter(u => u.diff < 0).length +
    upcomingPMByHours.filter(u => u.remaining < 0).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="ml-3 text-sm font-medium text-gray-500">Chargement du calendrier…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Overdue Banner ── */}
      {overdueCount > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-4 flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-rose-500/20 flex-shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-rose-900">
              {overdueCount} maintenance{overdueCount > 1 ? 's préventives en retard' : ' préventive en retard'}
            </p>
            <p className="text-xs text-rose-700 font-medium mt-0.5">
              Une intervention est requise immédiatement.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">

        {/* ─────────────── CALENDAR ─────────────── */}
        <div className="bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100/60 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <CalendarIcon size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {format(currentDate, 'MMMM yyyy')}
                </h2>
                <p className="text-xs text-gray-400 font-medium">Calendrier des interventions</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                className="p-1.5 hover:bg-white rounded-lg transition-all text-gray-600"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-white rounded-lg transition-all"
              >
                Aujourd'hui
              </button>
              <button
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                className="p-1.5 hover:bg-white rounded-lg transition-all text-gray-600"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/60">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
              <div key={d} className="py-2.5 text-center text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 auto-rows-[96px] bg-gray-100 gap-[1px]">
            {days.map(day => {
              const dayStr     = format(day, 'yyyy-MM-dd');
              const isToday    = isSameDay(day, new Date());
              const inMonth    = isSameDay(startOfMonth(day), monthStart);
              const dayEntries = entriesForDay(day);
              const isSelected = selectedDay === dayStr;

              // collect unique dot kinds (max 4 dots)
              const dotKinds = [...new Set(dayEntries.map(e => e.kind))].slice(0, 4);

              return (
                <div
                  key={dayStr}
                  onClick={() => setSelectedDay(isSelected ? null : dayStr)}
                  className={`bg-white flex flex-col p-2 cursor-pointer transition-all select-none
                    ${!inMonth ? 'opacity-40' : ''}
                    ${isToday ? 'bg-blue-50/50 ring-1 ring-inset ring-blue-400/40' : ''}
                    ${isSelected ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/80' : 'hover:bg-gray-50'}
                  `}
                >
                  {/* Date number */}
                  <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full self-end mb-1
                    ${isToday ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-gray-700'}
                  `}>
                    {format(day, 'd')}
                  </span>

                  {/* Dots */}
                  {dotKinds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-auto">
                      {dotKinds.map(kind => (
                        <span
                          key={kind}
                          className={`w-2 h-2 rounded-full ${DOT_CLASSES[kind]}`}
                          title={kind}
                        />
                      ))}
                    </div>
                  )}

                  {/* Count badge */}
                  {dayEntries.length > 0 && (
                    <span className="text-[9px] font-bold text-gray-400 mt-0.5">
                      {dayEntries.length} évènement{dayEntries.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-4 border-t border-gray-100 bg-gray-50/40">
            {([
              ['corrective',      'Corrective'],
              ['preventive-done', 'Préventive réalisée'],
              ['pm-overdue',      'PM en retard'],
              ['pm-upcoming',     'PM planifiée'],
            ] as [DotKind, string][]).map(([kind, label]) => (
              <div key={kind} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${DOT_CLASSES[kind]}`} />
                <span className="text-[11px] font-medium text-gray-500">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ─────────────── SIDE PANEL ─────────────── */}
        <div className="space-y-4">

          {/* Day detail */}
          {selectedDay && (
            <div className="bg-white rounded-3xl border border-gray-100/60 shadow-xl shadow-blue-900/5 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                <p className="text-sm font-bold text-gray-800">
                  {format(parseISO(selectedDay), 'd MMMM yyyy')}
                </p>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="text-gray-400 hover:text-gray-600 text-xs font-bold"
                >
                  ✕
                </button>
              </div>
              {selectedEntries.length === 0 ? (
                <div className="py-10 text-center">
                  <CalendarIcon size={28} className="mx-auto text-gray-200 mb-2" />
                  <p className="text-xs text-gray-400 font-medium">Aucune intervention ce jour</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {selectedEntries.map((e, i) => (
                    <div key={i} className={`flex items-start gap-3 p-4 border-l-4 ${
                      e.kind === 'corrective'      ? 'border-l-red-400' :
                      e.kind === 'preventive-done' ? 'border-l-emerald-400' :
                      e.kind === 'pm-overdue'      ? 'border-l-rose-600' :
                                                     'border-l-amber-400'
                    }`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        e.kind === 'corrective'      ? 'bg-red-100 text-red-600' :
                        e.kind === 'preventive-done' ? 'bg-emerald-100 text-emerald-600' :
                        e.kind === 'pm-overdue'      ? 'bg-rose-100 text-rose-600' :
                                                       'bg-amber-100 text-amber-600'
                      }`}>
                        {e.kind === 'corrective' ? <AlertTriangle size={13} /> : <Wrench size={13} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{e.label}</p>
                        {e.machineName && (
                          <p className="text-[10px] text-gray-400 font-medium mt-0.5 truncate">{e.machineName}</p>
                        )}
                        <span className={`inline-block mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          e.kind === 'corrective'      ? 'bg-red-100 text-red-700' :
                          e.kind === 'preventive-done' ? 'bg-emerald-100 text-emerald-700' :
                          e.kind === 'pm-overdue'      ? 'bg-rose-100 text-rose-700' :
                                                         'bg-amber-100 text-amber-700'
                        }`}>
                          {e.kind === 'corrective'      ? 'Corrective' :
                           e.kind === 'preventive-done' ? 'Préventive' :
                           e.kind === 'pm-overdue'      ? 'PM en retard' :
                                                          'PM planifiée'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Upcoming preventives by date ── */}
          <div className="bg-white rounded-3xl border border-gray-100/60 shadow-xl shadow-blue-900/5 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <Clock size={15} className="text-blue-500" />
              <p className="text-sm font-bold text-gray-800">Préventifs planifiés (date)</p>
              <span className="ml-auto text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                {upcomingPM.length}
              </span>
            </div>

            {upcomingPM.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 size={28} className="mx-auto text-gray-200 mb-2" />
                <p className="text-xs text-gray-400 font-medium">Aucun préventif par date programmé</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-[320px] overflow-y-auto">
                {upcomingPM.map(({ machine: m, diff }) => {
                  const isOverdue = diff < 0;
                  const isSoon    = diff >= 0 && diff <= 14;
                  return (
                    <div key={m.id} className={`flex items-center gap-3 px-5 py-3 ${
                      isOverdue ? 'bg-rose-50/50' : isSoon ? 'bg-amber-50/40' : ''
                    }`}>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        isOverdue ? 'bg-rose-600 animate-pulse' :
                        isSoon    ? 'bg-amber-400' :
                                    'bg-emerald-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{m.name}</p>
                        <p className="text-[10px] text-gray-400 font-medium">
                          {format(parseISO(m.nextMaintenance!.split('T')[0]), 'd MMM yyyy')}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        isOverdue ? 'bg-rose-100 text-rose-700' :
                        isSoon    ? 'bg-amber-100 text-amber-700' :
                                    'bg-gray-100 text-gray-500'
                      }`}>
                        {isOverdue
                          ? `${Math.abs(diff)}j retard`
                          : diff === 0
                          ? "Aujourd'hui"
                          : `J-${diff}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Upcoming preventives by working hours ── */}
          <div className="bg-white rounded-3xl border border-gray-100/60 shadow-xl shadow-blue-900/5 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <Gauge size={15} className="text-indigo-500" />
              <p className="text-sm font-bold text-gray-800">Préventifs par heures</p>
              <span className="ml-auto text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                {upcomingPMByHours.length}
              </span>
            </div>

            {upcomingPMByHours.length === 0 ? (
              <div className="py-8 text-center">
                <Gauge size={28} className="mx-auto text-gray-200 mb-2" />
                <p className="text-xs text-gray-400 font-medium">Aucun seuil horaire configuré</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-[360px] overflow-y-auto">
                {upcomingPMByHours.map(({ machine: m, current, threshold, remaining, pct }) => {
                  const isOverdue = remaining < 0;
                  const isSoon    = remaining >= 0 && remaining <= 50;
                  return (
                    <div key={m.id} className={`px-5 py-3 ${
                      isOverdue ? 'bg-rose-50/50' : isSoon ? 'bg-amber-50/40' : ''
                    }`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          isOverdue ? 'bg-rose-600 animate-pulse' :
                          isSoon    ? 'bg-amber-400' :
                                      'bg-emerald-400'
                        }`} />
                        <p className="text-xs font-bold text-gray-800 flex-1 truncate">{m.name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                          isOverdue ? 'bg-rose-100 text-rose-700' :
                          isSoon    ? 'bg-amber-100 text-amber-700' :
                                      'bg-gray-100 text-gray-500'
                        }`}>
                          {isOverdue
                            ? `${Math.abs(remaining).toFixed(0)}h dépassé`
                            : `${remaining.toFixed(0)}h restant`}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isOverdue ? 'bg-rose-500' :
                            isSoon    ? 'bg-amber-400' :
                                        'bg-emerald-400'
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <p className="text-[9px] text-gray-400 font-medium mt-1">
                        {current.toFixed(0)} h / {threshold.toFixed(0)} h ({pct}%)
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
