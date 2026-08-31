import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import { Machine, WorkOrder, AuditLog } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  Clock,
  Calendar,
  Layers,
  Search,
  RefreshCw,
  Sun,
  Sunrise,
  Moon,
  ArrowRight,
  AlertTriangle,
  Wrench,
  HardDrive,
  Download,
  Filter,
  CheckCircle2,
  AlertCircle,
  Activity,
  User,
  Zap,
  RotateCcw
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import TableFooter from './ui/TableFooter';

// ─── Shift Identification & Calculation Helpers ──────────────────────────────

export type ShiftId = 1 | 2 | 3;

export function getShiftForDate(date: Date): { id: ShiftId; label: string; name: string } {
  const h = date.getHours();
  if (h >= 6 && h < 14) {
    return { id: 1, label: 'S1', name: 'Shift 1 (06h–14h)' };
  }
  if (h >= 14 && h < 22) {
    return { id: 2, label: 'S2', name: 'Shift 2 (14h–22h)' };
  }
  return { id: 3, label: 'S3', name: 'Shift 3 (22h–06h)' };
}

export interface ShiftTimeBreakdown {
  totalMinutes: number;
  totalHours: number;
  s1Minutes: number;
  s1Hours: number;
  s2Minutes: number;
  s2Hours: number;
  s3Minutes: number;
  s3Hours: number;
  startShift: { id: ShiftId; label: string; name: string };
  endShift: { id: ShiftId; label: string; name: string };
  isMultiShift: boolean;
  shiftsCrossedCount: number;
}

export function calculateEventShiftBreakdown(startDateStr: string, endDateStr?: string | null): ShiftTimeBreakdown {
  const start = new Date(startDateStr);
  const end = endDateStr ? new Date(endDateStr) : new Date();

  const startShift = getShiftForDate(start);
  const endShift = getShiftForDate(end);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start.getTime() >= end.getTime()) {
    return {
      totalMinutes: 0,
      totalHours: 0,
      s1Minutes: 0,
      s1Hours: 0,
      s2Minutes: 0,
      s2Hours: 0,
      s3Minutes: 0,
      s3Hours: 0,
      startShift,
      endShift,
      isMultiShift: false,
      shiftsCrossedCount: 1
    };
  }

  let s1 = 0;
  let s2 = 0;
  let s3 = 0;

  let curr = new Date(start.getTime());
  const endMs = end.getTime();

  while (curr.getTime() < endMs) {
    const nextHour = new Date(curr);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);

    const sliceEndMs = Math.min(nextHour.getTime(), endMs);
    const minutesInSlice = (sliceEndMs - curr.getTime()) / 60000;

    const h = curr.getHours();
    if (h >= 6 && h < 14) {
      s1 += minutesInSlice;
    } else if (h >= 14 && h < 22) {
      s2 += minutesInSlice;
    } else {
      s3 += minutesInSlice;
    }

    curr = new Date(sliceEndMs);
  }

  const s1M = Math.round(s1);
  const s2M = Math.round(s2);
  const s3M = Math.round(s3);
  const totalM = s1M + s2M + s3M;

  let shiftsCrossed = 0;
  if (s1M > 0) shiftsCrossed++;
  if (s2M > 0) shiftsCrossed++;
  if (s3M > 0) shiftsCrossed++;
  if (shiftsCrossed === 0) shiftsCrossed = 1;

  const isMultiShift = shiftsCrossed > 1 || startShift.id !== endShift.id;

  return {
    totalMinutes: totalM,
    totalHours: Number((totalM / 60).toFixed(1)),
    s1Minutes: s1M,
    s1Hours: Number((s1M / 60).toFixed(1)),
    s2Minutes: s2M,
    s2Hours: Number((s2M / 60).toFixed(1)),
    s3Minutes: s3M,
    s3Hours: Number((s3M / 60).toFixed(1)),
    startShift,
    endShift,
    isMultiShift,
    shiftsCrossedCount: shiftsCrossed
  };
}

function formatDurationPretty(minutes: number): string {
  if (minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatTimestamp(str?: string | null): string {
  if (!str) return '—';
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${h}:${m}`;
  } catch {
    return str;
  }
}

// ─── Shift Event Interface ───────────────────────────────────────────────────

export interface ShiftDowntimeEvent {
  id: string;
  sourceType: 'work_order' | 'machine_status' | 'audit_log';
  machineId: string;
  machineName: string;
  siteNumber?: string;
  location?: string;
  title: string;
  description: string;
  eventType: 'corrective' | 'preventive' | 'status_down' | 'status_maintenance';
  status: 'completed' | 'ongoing' | 'in-progress' | 'pending';
  startTime: string;
  endTime: string | null;
  technicians?: string;
  failureCause?: string;
  failureCategory?: string;
  breakdown: ShiftTimeBreakdown;
}

export default function ShiftHistory() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Raw data
  const [machines, setMachines] = useState<Machine[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState<'all' | '1' | '2' | '3' | 'crossings'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ongoing' | 'completed'>('all');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all' | 'custom'>('30d');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);

  // Fetch all relevant data
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [machs, wos, logs] = await Promise.all([
        api.getMachines().catch(() => []),
        api.getWorkOrders().catch(() => []),
        api.getAuditLogs().catch(() => [])
      ]);
      setMachines(machs || []);
      setWorkOrders(wos || []);
      setAuditLogs(logs || []);
    } catch (e) {
      console.error('Failed to load shift history data', e);
      toast.error('Failed to load downtime history records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Construct Unified Downtime Events ───────────────────────────────────────
  const allEvents = useMemo<ShiftDowntimeEvent[]>(() => {
    const events: ShiftDowntimeEvent[] = [];
    const processedKeys = new Set<string>();

    const machineMap = new Map<string, Machine>();
    machines.forEach(m => machineMap.set(m.id, m));

    // 1. Process Work Orders (Primary Source for Maintenance & Interventions)
    workOrders.forEach(wo => {
      const mach = machineMap.get(wo.machineId);
      const startTime = wo.intervention?.startTime || wo.createdAt;
      const isCompleted = wo.status === 'completed' && !!(wo.intervention?.endTime || wo.completedAt);
      const endTime = isCompleted ? (wo.intervention?.endTime || wo.completedAt || null) : null;

      if (!startTime) return;

      const breakdown = calculateEventShiftBreakdown(startTime, endTime);
      const eventId = `wo-${wo.id}`;
      processedKeys.add(eventId);

      events.push({
        id: eventId,
        sourceType: 'work_order',
        machineId: wo.machineId,
        machineName: wo.machineName || mach?.name || wo.machineId,
        siteNumber: mach?.siteNumber,
        location: wo.location || mach?.location,
        title: wo.title || `Work Order ${wo.id}`,
        description: wo.intervention?.malfunctionDescription || wo.description || '',
        eventType: wo.type === 'preventive' ? 'preventive' : 'corrective',
        status: isCompleted ? 'completed' : (wo.status === 'in-progress' ? 'in-progress' : 'ongoing'),
        startTime,
        endTime,
        technicians: wo.intervention?.technicians || wo.assignedName || wo.createdByName,
        failureCause: wo.intervention?.failureCause,
        failureCategory: wo.intervention?.failureCategory,
        breakdown
      });
    });

    // 2. Process Currently Active Down / Maintenance Machines (if not already captured by active WO)
    machines.forEach(m => {
      if (m.status === 'down' || m.status === 'maintenance') {
        const startTime = m.downStartTime || m.lastMaintenance || new Date().toISOString();
        const hasActiveWO = events.some(e => e.machineId === m.id && e.status !== 'completed');

        if (!hasActiveWO) {
          const breakdown = calculateEventShiftBreakdown(startTime, null);
          events.push({
            id: `mach-active-${m.id}`,
            sourceType: 'machine_status',
            machineId: m.id,
            machineName: m.name,
            siteNumber: m.siteNumber,
            location: m.location,
            title: `Active Machine ${m.status === 'down' ? 'Breakdown' : 'Maintenance'}`,
            description: m.statusReason || `Machine reported as ${m.status}.`,
            eventType: m.status === 'down' ? 'status_down' : 'status_maintenance',
            status: 'ongoing',
            startTime,
            endTime: null,
            technicians: 'On Shift',
            failureCause: m.statusReason ? 'Reported Downtime' : undefined,
            breakdown
          });
        }
      }
    });

    // Sort descending by start time
    events.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    return events;
  }, [machines, workOrders]);

  // ── Date Filtering ──────────────────────────────────────────────────────────
  const handleDateRangeSelect = (preset: '7d' | '30d' | '90d' | 'all' | 'custom') => {
    setDateRange(preset);
    setCurrentPage(1);
    const end = new Date();
    setEndDate(end.toISOString().split('T')[0]);

    if (preset === '7d') {
      const s = new Date();
      s.setDate(s.getDate() - 7);
      setStartDate(s.toISOString().split('T')[0]);
    } else if (preset === '30d') {
      const s = new Date();
      s.setDate(s.getDate() - 30);
      setStartDate(s.toISOString().split('T')[0]);
    } else if (preset === '90d') {
      const s = new Date();
      s.setDate(s.getDate() - 90);
      setStartDate(s.toISOString().split('T')[0]);
    } else if (preset === 'all') {
      setStartDate('2020-01-01');
    }
  };

  // ── Filtered Events Computation ─────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    return allEvents.filter(ev => {
      // 1. Search Query
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          ev.machineName.toLowerCase().includes(q) ||
          (ev.siteNumber || '').toLowerCase().includes(q) ||
          (ev.location || '').toLowerCase().includes(q) ||
          ev.title.toLowerCase().includes(q) ||
          ev.description.toLowerCase().includes(q) ||
          (ev.technicians || '').toLowerCase().includes(q) ||
          (ev.failureCause || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      // 2. Machine Filter
      if (machineFilter && ev.machineId !== machineFilter) {
        return false;
      }

      // 3. Status Filter
      if (statusFilter === 'completed' && ev.status !== 'completed') return false;
      if (statusFilter === 'ongoing' && ev.status === 'completed') return false;

      // 4. Shift Filter (Crucial: awareness of shift crossing)
      if (shiftFilter === '1' && ev.breakdown.s1Minutes <= 0) return false;
      if (shiftFilter === '2' && ev.breakdown.s2Minutes <= 0) return false;
      if (shiftFilter === '3' && ev.breakdown.s3Minutes <= 0) return false;
      if (shiftFilter === 'crossings' && !ev.breakdown.isMultiShift) return false;

      // 5. Date Range Filter
      if (startDate) {
        const evDate = ev.startTime.split('T')[0];
        if (evDate < startDate) return false;
      }
      if (endDate) {
        const evDate = ev.startTime.split('T')[0];
        if (evDate > endDate) return false;
      }

      return true;
    });
  }, [allEvents, search, machineFilter, shiftFilter, statusFilter, startDate, endDate]);

  // ── Pagination Calculation ──────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEvents.slice(start, start + pageSize);
  }, [filteredEvents, currentPage, pageSize]);

  // ── CSV Export ──────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (filteredEvents.length === 0) {
      toast.error('No shift events to export');
      return;
    }

    const headers = [
      'ID',
      'Machine',
      'Site #',
      'Location',
      'Event Type',
      'Status',
      'Start Time',
      'End Time',
      'Start Shift',
      'End Shift',
      'Shift Crossing',
      'Total Duration (hrs)',
      'Shift 1 (hrs)',
      'Shift 2 (hrs)',
      'Shift 3 (hrs)',
      'Failure Cause',
      'Technician / Issuer',
      'Description'
    ];

    const rows = filteredEvents.map(e => [
      e.id,
      `"${(e.machineName || '').replace(/"/g, '""')}"`,
      `"${(e.siteNumber || '').replace(/"/g, '""')}"`,
      `"${(e.location || '').replace(/"/g, '""')}"`,
      e.eventType,
      e.status,
      e.startTime,
      e.endTime || 'Ongoing',
      `Shift ${e.breakdown.startShift.id}`,
      `Shift ${e.breakdown.endShift.id}`,
      e.breakdown.isMultiShift ? 'YES' : 'NO',
      e.breakdown.totalHours,
      e.breakdown.s1Hours,
      e.breakdown.s2Hours,
      e.breakdown.s3Hours,
      `"${(e.failureCause || '').replace(/"/g, '""')}"`,
      `"${(e.technicians || '').replace(/"/g, '""')}"`,
      `"${(e.description || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `shift_downtime_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Shift downtime history exported to CSV');
  };

  return (
    <div className="space-y-6 max-w-full pb-10 font-sans">
      {/* ── Top Header Banner ───────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Shift History
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
                Suivi des Postes
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Machine downtime and maintenance event timeline with multi-shift crossing awareness
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all"
            title="Refresh records"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin text-blue-600')} />
            Refresh
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md shadow-indigo-500/20"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Filter Controls Bar ─────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search machine, issue, reason, cause, technician..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-gray-200 rounded-2xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          {/* Date range picker tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200 text-xs font-bold">
              {(['7d', '30d', '90d', 'all'] as const).map(preset => (
                <button
                  key={preset}
                  onClick={() => handleDateRangeSelect(preset)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg transition-all',
                    dateRange === preset
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  )}
                >
                  {preset === '7d' ? '7 Days' : preset === '30d' ? '30 Days' : preset === '90d' ? '90 Days' : 'All Time'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
              <input
                type="date"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  setDateRange('custom');
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 bg-slate-50 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <span>to</span>
              <input
                type="date"
                value={endDate}
                onChange={e => {
                  setEndDate(e.target.value);
                  setDateRange('custom');
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 bg-slate-50 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
        </div>

        {/* Second Row: Specific Filters */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-100 text-xs font-semibold">
          {/* Shift selector filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Shift Filter:</span>
            <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
              <button
                onClick={() => { setShiftFilter('all'); setCurrentPage(1); }}
                className={cn('px-2.5 py-1 rounded-lg text-xs transition-all', shiftFilter === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800')}
              >
                All Shifts
              </button>
              <button
                onClick={() => { setShiftFilter('1'); setCurrentPage(1); }}
                className={cn('px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1', shiftFilter === '1' ? 'bg-amber-500 text-white font-bold shadow-xs' : 'text-slate-500 hover:text-amber-700')}
              >
                <Sun size={12} /> S1
              </button>
              <button
                onClick={() => { setShiftFilter('2'); setCurrentPage(1); }}
                className={cn('px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1', shiftFilter === '2' ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-500 hover:text-blue-700')}
              >
                <Sunrise size={12} /> S2
              </button>
              <button
                onClick={() => { setShiftFilter('3'); setCurrentPage(1); }}
                className={cn('px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1', shiftFilter === '3' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-500 hover:text-purple-700')}
              >
                <Moon size={12} /> S3
              </button>
              <button
                onClick={() => { setShiftFilter('crossings'); setCurrentPage(1); }}
                className={cn('px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1', shiftFilter === 'crossings' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-500 hover:text-indigo-700')}
              >
                <ArrowRight size={12} /> Multi-Shift Only
              </button>
            </div>
          </div>

          {/* Machine selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Machine:</span>
            <select
              value={machineFilter}
              onChange={e => { setMachineFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-1.5 bg-slate-50 border border-gray-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">All Machines ({machines.length})</option>
              {machines.map(m => (
                <option key={m.id} value={m.id}>
                  {m.siteNumber ? `[#${m.siteNumber}] ` : ''}{m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Status:</span>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
              className="px-3 py-1.5 bg-slate-50 border border-gray-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All Events</option>
              <option value="completed">Completed Only</option>
              <option value="ongoing">Active / Ongoing</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Shift Downtime Events Table ─────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-3xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-gray-200 text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Machine</th>
                <th className="px-5 py-3.5">Event / Description</th>
                <th className="px-5 py-3.5">Start Time &amp; Shift</th>
                <th className="px-5 py-3.5">End Time &amp; Shift</th>
                <th className="px-5 py-3.5 text-right">Total Duration</th>
                <th className="px-5 py-3.5">Shift Span &amp; Breakdown</th>
                <th className="px-5 py-3.5">Failure Cause</th>
                <th className="px-5 py-3.5">Technician</th>
                <th className="px-5 py-3.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw size={18} className="animate-spin text-blue-600" />
                      <span>Loading shift downtime history...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedEvents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400 italic">
                    No downtime or maintenance events found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedEvents.map(ev => {
                  const b = ev.breakdown;
                  return (
                    <tr key={ev.id} className="hover:bg-slate-50/60 transition-colors group">
                      {/* Machine */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-blue-500" />
                          <div>
                            <span className="font-bold text-slate-900 block">{ev.machineName}</span>
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                              {ev.siteNumber && <span>#{ev.siteNumber}</span>}
                              {ev.location && <span>• {ev.location}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Event / Description */}
                      <td className="px-5 py-3.5 max-w-xs">
                        <div className="font-bold text-slate-800 truncate" title={ev.title}>
                          {ev.title}
                        </div>
                        {ev.description && (
                          <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5" title={ev.description}>
                            {ev.description}
                          </div>
                        )}
                      </td>

                      {/* Start Time & Shift */}
                      <td className="px-5 py-3.5 whitespace-nowrap font-mono text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border',
                            b.startShift.id === 1 ? 'bg-amber-50 text-amber-800 border-amber-200' :
                              b.startShift.id === 2 ? 'bg-blue-50 text-blue-800 border-blue-200' :
                                'bg-purple-50 text-purple-800 border-purple-200'
                          )}>
                            {b.startShift.id === 1 ? <Sun size={10} /> : b.startShift.id === 2 ? <Sunrise size={10} /> : <Moon size={10} />}
                            S{b.startShift.id}
                          </span>
                          <span className="text-slate-800 font-bold">{formatTimestamp(ev.startTime)}</span>
                        </div>
                      </td>

                      {/* End Time & Shift */}
                      <td className="px-5 py-3.5 whitespace-nowrap font-mono text-[11px]">
                        {ev.endTime ? (
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border',
                              b.endShift.id === 1 ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                b.endShift.id === 2 ? 'bg-blue-50 text-blue-800 border-blue-200' :
                                  'bg-purple-50 text-purple-800 border-purple-200'
                            )}>
                              {b.endShift.id === 1 ? <Sun size={10} /> : b.endShift.id === 2 ? <Sunrise size={10} /> : <Moon size={10} />}
                              S{b.endShift.id}
                            </span>
                            <span className="text-slate-800">{formatTimestamp(ev.endTime)}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Ongoing Active
                          </span>
                        )}
                      </td>

                      {/* Total Duration */}
                      <td className="px-5 py-3.5 text-right font-mono font-black text-rose-600 whitespace-nowrap text-sm">
                        {formatDurationPretty(b.totalMinutes)}
                        <span className="block text-[10px] font-normal text-slate-400">({b.totalHours} hrs)</span>
                      </td>

                      {/* Shift Span & Breakdown (Single Row with Multi-Shift Span Awareness) */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="space-y-1">
                          {/* Span Header Indicator */}
                          <div className="flex items-center gap-1 text-[11px] font-bold">
                            {b.isMultiShift ? (
                              <span className="inline-flex items-center gap-1 text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md font-mono text-[10px]">
                                <span>Shift {b.startShift.id}</span>
                                <ArrowRight size={10} className="text-indigo-500" />
                                <span>Shift {b.endShift.id}</span>
                                <span className="text-[9px] text-indigo-500 font-semibold">({b.shiftsCrossedCount} shifts)</span>
                              </span>
                            ) : (
                              <span className="text-slate-600 font-mono text-[11px]">
                                Shift {b.startShift.id} only
                              </span>
                            )}
                          </div>

                          {/* Shift Slice Breakdown Badges */}
                          <div className="flex items-center gap-1.5">
                            {b.s1Minutes > 0 && (
                              <span
                                title={`Shift 1 share: ${b.s1Hours} hrs (${formatDurationPretty(b.s1Minutes)})`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200"
                              >
                                <Sun size={9} className="text-amber-600" />
                                S1: {formatDurationPretty(b.s1Minutes)}
                              </span>
                            )}
                            {b.s2Minutes > 0 && (
                              <span
                                title={`Shift 2 share: ${b.s2Hours} hrs (${formatDurationPretty(b.s2Minutes)})`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200"
                              >
                                <Sunrise size={9} className="text-blue-600" />
                                S2: {formatDurationPretty(b.s2Minutes)}
                              </span>
                            )}
                            {b.s3Minutes > 0 && (
                              <span
                                title={`Shift 3 share: ${b.s3Hours} hrs (${formatDurationPretty(b.s3Minutes)})`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-50 text-purple-800 border border-purple-200"
                              >
                                <Moon size={9} className="text-purple-600" />
                                S3: {formatDurationPretty(b.s3Minutes)}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Failure Cause */}
                      <td className="px-5 py-3.5">
                        {ev.failureCause ? (
                          <div>
                            <span className="font-bold text-slate-800 block truncate max-w-[140px]" title={ev.failureCause}>
                              {ev.failureCause}
                            </span>
                            {ev.failureCategory && (
                              <span className="text-[10px] text-slate-400 uppercase font-semibold">
                                {ev.failureCategory}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 italic">—</span>
                        )}
                      </td>

                      {/* Technician */}
                      <td className="px-5 py-3.5 font-medium text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <User size={12} className="text-slate-400 shrink-0" />
                          <span className="truncate max-w-[120px]" title={ev.technicians}>
                            {ev.technicians || 'N/A'}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5 text-center whitespace-nowrap">
                        {ev.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 size={11} className="text-emerald-600" />
                            Resolved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            <Clock size={11} className="text-amber-600" />
                            In Progress
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Standard Table Footer with Pagination */}
        <TableFooter
          totalItems={filteredEvents.length}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageSizeChange={size => {
            setPageSize(size);
            setCurrentPage(1);
          }}
          onPageChange={page => setCurrentPage(page)}
        />
      </div>
    </div>
  );
}
