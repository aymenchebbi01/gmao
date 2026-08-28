import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, CartesianGrid
} from 'recharts';
import {
  Clock, AlertTriangle, Activity, HardDrive, Calendar,
  TrendingUp, BarChart2, Layers, ChevronDown, Check,
  Wrench, Search, RefreshCw, AlertCircle, Sun, Moon, Sunrise,
  X
} from 'lucide-react';
import { api } from '../services/api';
import { Machine, WorkOrder } from '../types';
import { FAILURE_CAUSE_CATEGORIES } from './WorkOrderList';

// ─── Theme Colors ─────────────────────────────────────────────────────────────
const C = {
  blue: '#378ADD',
  teal: '#1D9E75',
  red: '#E24B4A',
  amber: '#EF9F27',
  purple: '#8B5CF6',
  indigo: '#6366F1',
  gray: '#94A3B8',
};

const CHART_PALETTE = [
  '#E24B4A', // Red (highest impact)
  '#EF9F27', // Amber
  '#378ADD', // Blue
  '#1D9E75', // Teal
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#64748B', // Slate
];

// ─── Shift Calculation Engine ────────────────────────────────────────────────
interface ShiftDowntimeBreakdown {
  totalMinutes: number;
  totalHours: number;
  shift1Minutes: number;
  shift1Hours: number;
  shift2Minutes: number;
  shift2Hours: number;
  shift3Minutes: number;
  shift3Hours: number;
  currentShift: 1 | 2 | 3;
}

function getCurrentShift(date: Date = new Date()): 1 | 2 | 3 {
  const hours = date.getHours();
  if (hours >= 6 && hours < 14) return 1;
  if (hours >= 14 && hours < 22) return 2;
  return 3; // 22:00 to 05:59
}

function calculateShiftDowntime(startInput?: string | Date | null, endInput?: string | Date | null): ShiftDowntimeBreakdown {
  if (!startInput) {
    return {
      totalMinutes: 0,
      totalHours: 0,
      shift1Minutes: 0,
      shift1Hours: 0,
      shift2Minutes: 0,
      shift2Hours: 0,
      shift3Minutes: 0,
      shift3Hours: 0,
      currentShift: getCurrentShift(new Date())
    };
  }

  const start = new Date(startInput);
  const end = endInput ? new Date(endInput) : new Date();

  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0 || isNaN(diffMs) || isNaN(start.getTime())) {
    return {
      totalMinutes: 0,
      totalHours: 0,
      shift1Minutes: 0,
      shift1Hours: 0,
      shift2Minutes: 0,
      shift2Hours: 0,
      shift3Minutes: 0,
      shift3Hours: 0,
      currentShift: getCurrentShift(end)
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
    const minutesInHourSlice = (sliceEndMs - curr.getTime()) / 60000;

    const h = curr.getHours();
    if (h >= 6 && h < 14) {
      s1 += minutesInHourSlice;
    } else if (h >= 14 && h < 22) {
      s2 += minutesInHourSlice;
    } else {
      s3 += minutesInHourSlice;
    }

    curr = new Date(sliceEndMs);
  }

  const totalMin = s1 + s2 + s3;
  return {
    totalMinutes: Math.round(totalMin),
    totalHours: Number((totalMin / 60).toFixed(1)),
    shift1Minutes: Math.round(s1),
    shift1Hours: Number((s1 / 60).toFixed(1)),
    shift2Minutes: Math.round(s2),
    shift2Hours: Number((s2 / 60).toFixed(1)),
    shift3Minutes: Math.round(s3),
    shift3Hours: Number((s3 / 60).toFixed(1)),
    currentShift: getCurrentShift(end)
  };
}

function formatDurationHuman(minutes: number): string {
  if (minutes <= 0) return '0m';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

function formatDateTimeClean(dateStr?: string | null): string {
  if (!dateStr || dateStr.trim() === '') return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');

    if (dateStr.includes('T') || dateStr.includes(':') || dateStr.length > 10) {
      return `${day}/${month}/${year} ${hours}:${mins}`;
    }
    return `${day}/${month}/${year}`;
  } catch {
    return String(dateStr);
  }
}

// ─── Helper to resolve cause labels & category ────────────────────────────────
function resolveCauseInfo(causeId?: string) {
  if (!causeId || causeId.trim() === '') {
    return {
      id: 'unspecified',
      category: 'Unspecified',
      labelFr: 'Non spécifié',
      labelEn: 'Unspecified',
      displayName: 'Non spécifié / Unspecified',
    };
  }

  for (const cat of FAILURE_CAUSE_CATEGORIES) {
    const found = cat.causes.find(c => c.id === causeId);
    if (found) {
      return {
        id: found.id,
        category: cat.labelEn,
        categoryFr: cat.labelFr,
        labelFr: found.labelFr,
        labelEn: found.labelEn,
        displayName: `${found.labelFr} (${found.labelEn})`,
      };
    }
  }

  if (causeId === 'wear') {
    return { id: 'wear', category: 'Mechanical', labelFr: 'Usure normale', labelEn: 'Normal Wear', displayName: 'Usure normale (Normal Wear)' };
  }
  if (causeId === 'user') {
    return { id: 'user', category: 'Human / Process', labelFr: 'Erreur utilisateur', labelEn: 'User Error', displayName: 'Erreur utilisateur (User Error)' };
  }
  if (causeId === 'product') {
    return { id: 'product', category: 'Equipment', labelFr: 'Défaut produit/pièce', labelEn: 'Product/Part Defect', displayName: 'Défaut produit (Product Defect)' };
  }
  if (causeId === 'other' || causeId === 'other_custom') {
    return { id: 'other', category: 'Other', labelFr: 'Autre cause', labelEn: 'Other Cause', displayName: 'Autre (Other)' };
  }

  return {
    id: causeId,
    category: 'Other',
    labelFr: causeId,
    labelEn: causeId,
    displayName: causeId,
  };
}

// ─── KPI Card Component ───────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  accentColor: string;
  icon: React.ReactNode;
}

function KpiCard({ label, value, subValue, accentColor, icon }: KpiCardProps) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)',
      }}
    >
      <div style={{ height: 4, background: accentColor }} />
      <div style={{ padding: '18px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: accentColor + '18',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: accentColor,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          {label}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', lineHeight: 1.1, fontFamily: 'monospace' }}>
          {value}
        </div>
        {subValue && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#64748b', fontWeight: 500 }}>
            {subValue}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DowntimeAnalysis() {
  const [activeTab, setActiveTab] = useState<'overall' | 'machine'>('overall');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | '365d' | 'custom'>('30d');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const [selectedMachineId, setSelectedMachineId] = useState<string>('');
  const [machineSearch, setMachineSearch] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Fetch Data ──────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      const [woData, machData] = await Promise.all([
        api.getWorkOrders(),
        api.getMachines(),
      ]);
      setWorkOrders(woData || []);
      setMachines(machData || []);
      if (machData && machData.length > 0 && !selectedMachineId) {
        setSelectedMachineId(machData[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch data for downtime analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Update date bounds on preset change
  const handlePresetChange = (preset: '7d' | '30d' | '90d' | '365d' | 'custom') => {
    setDateRange(preset);
    if (preset === 'custom') return;

    const days = preset === '7d' ? 7 : preset === '30d' ? 30 : preset === '90d' ? 90 : 365;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  // ── Filtered Work Orders ────────────────────────────────────────────────────
  const relevantOrders = useMemo(() => {
    return workOrders.filter(wo => {
      if (wo.status !== 'completed' && !wo.intervention?.durationMinutes) return false;

      const dateStr = wo.completedAt || wo.createdAt || wo.intervention?.completedAt || wo.intervention?.date;
      if (!dateStr) return false;
      const orderDate = dateStr.substring(0, 10);

      return orderDate >= startDate && orderDate <= endDate;
    });
  }, [workOrders, startDate, endDate]);

  // ── Overall Aggregation ─────────────────────────────────────────────────────
  const overallAnalysis = useMemo(() => {
    const causeMap: Record<string, {
      causeId: string;
      displayName: string;
      category: string;
      totalMinutes: number;
      count: number;
      affectedMachineIds: Set<string>;
      shiftCounts: { s1: number; s2: number; s3: number };
      latestStart: string | null;
      latestFinish: string | null;
    }> = {};

    let totalDowntimeMinutes = 0;
    const allAffectedMachines = new Set<string>();

    relevantOrders.forEach(wo => {
      const durationMin = Number(wo.intervention?.durationMinutes) || 0;
      if (durationMin <= 0) return;

      totalDowntimeMinutes += durationMin;
      if (wo.machineId) allAffectedMachines.add(wo.machineId);

      const causeKey = wo.intervention?.failureCause || 'unspecified';
      if (!causeMap[causeKey]) {
        const info = resolveCauseInfo(causeKey);
        causeMap[causeKey] = {
          causeId: causeKey,
          displayName: info.displayName,
          category: info.category,
          totalMinutes: 0,
          count: 0,
          affectedMachineIds: new Set<string>(),
          shiftCounts: { s1: 0, s2: 0, s3: 0 },
          latestStart: null,
          latestFinish: null,
        };
      }

      causeMap[causeKey].totalMinutes += durationMin;
      causeMap[causeKey].count += 1;
      if (wo.machineId) {
        causeMap[causeKey].affectedMachineIds.add(wo.machineId);
      }

      // Track start & finish timestamps
      const woStart = wo.intervention?.startTime || wo.createdAt || wo.intervention?.date || '';
      const woFinish = wo.intervention?.endTime || wo.completedAt || wo.intervention?.completedAt || '';

      if (woStart) {
        if (!causeMap[causeKey].latestStart || new Date(woStart).getTime() > new Date(causeMap[causeKey].latestStart!).getTime()) {
          causeMap[causeKey].latestStart = woStart;
        }
      }
      if (woFinish) {
        if (!causeMap[causeKey].latestFinish || new Date(woFinish).getTime() > new Date(causeMap[causeKey].latestFinish!).getTime()) {
          causeMap[causeKey].latestFinish = woFinish;
        }
      }

      // Determine which shift this incident fell in
      const incidentDateStr = wo.createdAt || wo.completedAt || wo.intervention?.date;
      if (incidentDateStr) {
        const incidentShift = getCurrentShift(new Date(incidentDateStr));
        if (incidentShift === 1) causeMap[causeKey].shiftCounts.s1 += 1;
        else if (incidentShift === 2) causeMap[causeKey].shiftCounts.s2 += 1;
        else causeMap[causeKey].shiftCounts.s3 += 1;
      }
    });

    const causesList = Object.values(causeMap).map(c => ({
      causeId: c.causeId,
      name: c.displayName,
      category: c.category,
      totalMinutes: c.totalMinutes,
      totalHours: Number((c.totalMinutes / 60).toFixed(1)),
      count: c.count,
      affectedMachinesCount: c.affectedMachineIds.size,
      percentage: totalDowntimeMinutes > 0 ? Number(((c.totalMinutes / totalDowntimeMinutes) * 100).toFixed(1)) : 0,
      avgDurationMinutes: c.count > 0 ? Math.round(c.totalMinutes / c.count) : 0,
      shiftCounts: c.shiftCounts,
      downStart: c.latestStart,
      downFinish: c.latestFinish,
    }));

    causesList.sort((a, b) => b.totalMinutes - a.totalMinutes);

    const topByHours = causesList.length > 0 ? causesList[0] : null;
    const topByCount = causesList.length > 0 ? [...causesList].sort((a, b) => b.count - a.count)[0] : null;

    return {
      totalHours: Number((totalDowntimeMinutes / 60).toFixed(1)),
      totalMinutes: totalDowntimeMinutes,
      totalIncidents: relevantOrders.length,
      distinctMachinesCount: allAffectedMachines.size,
      topByHours,
      topByCount,
      causesList,
    };
  }, [relevantOrders]);

  // ── Per-Machine Aggregation ─────────────────────────────────────────────────
  const selectedMachine = useMemo(() => {
    return machines.find(m => m.id === selectedMachineId);
  }, [machines, selectedMachineId]);

  const machineAnalysis = useMemo(() => {
    if (!selectedMachineId) {
      return {
        totalHours: 0,
        totalMinutes: 0,
        totalIncidents: 0,
        topByHours: null,
        topByCount: null,
        causesList: [],
        timeline: [],
      };
    }

    const machineOrders = relevantOrders.filter(wo => wo.machineId === selectedMachineId);

    const causeMap: Record<string, {
      causeId: string;
      displayName: string;
      category: string;
      totalMinutes: number;
      count: number;
    }> = {};

    let totalDowntimeMinutes = 0;

    const dailyMap: Record<string, number> = {};
    const curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
      const dateKey = curr.toISOString().split('T')[0];
      dailyMap[dateKey] = 0;
      curr.setDate(curr.getDate() + 1);
    }

    machineOrders.forEach(wo => {
      const durationMin = Number(wo.intervention?.durationMinutes) || 0;
      if (durationMin <= 0) return;

      totalDowntimeMinutes += durationMin;

      const dateStr = wo.completedAt || wo.createdAt || wo.intervention?.completedAt || wo.intervention?.date;
      if (dateStr) {
        const dateKey = dateStr.substring(0, 10);
        if (dailyMap[dateKey] !== undefined) {
          dailyMap[dateKey] += Number((durationMin / 60).toFixed(2));
        }
      }

      const causeKey = wo.intervention?.failureCause || 'unspecified';
      if (!causeMap[causeKey]) {
        const info = resolveCauseInfo(causeKey);
        causeMap[causeKey] = {
          causeId: causeKey,
          displayName: info.displayName,
          category: info.category,
          totalMinutes: 0,
          count: 0,
        };
      }

      causeMap[causeKey].totalMinutes += durationMin;
      causeMap[causeKey].count += 1;
    });

    const causesList = Object.values(causeMap).map(c => ({
      causeId: c.causeId,
      name: c.displayName,
      category: c.category,
      totalMinutes: c.totalMinutes,
      totalHours: Number((c.totalMinutes / 60).toFixed(1)),
      count: c.count,
      percentage: totalDowntimeMinutes > 0 ? Number(((c.totalMinutes / totalDowntimeMinutes) * 100).toFixed(1)) : 0,
      avgDurationMinutes: c.count > 0 ? Math.round(c.totalMinutes / c.count) : 0,
    }));

    causesList.sort((a, b) => b.totalMinutes - a.totalMinutes);

    const topByHours = causesList.length > 0 ? causesList[0] : null;
    const topByCount = causesList.length > 0 ? [...causesList].sort((a, b) => b.count - a.count)[0] : null;

    const timeline = Object.entries(dailyMap).map(([date, hours]) => ({
      date: date.substring(5),
      fullDate: date,
      hours: Number(hours.toFixed(1)),
    }));

    return {
      totalHours: Number((totalDowntimeMinutes / 60).toFixed(1)),
      totalMinutes: totalDowntimeMinutes,
      totalIncidents: machineOrders.length,
      topByHours,
      topByCount,
      causesList,
      timeline,
    };
  }, [relevantOrders, selectedMachineId, startDate, endDate]);

  const filteredMachines = useMemo(() => {
    if (!machineSearch.trim()) return machines;
    const q = machineSearch.toLowerCase();
    return machines.filter(m =>
      (m.name && m.name.toLowerCase().includes(q)) ||
      (m.siteNumber && m.siteNumber.toLowerCase().includes(q)) ||
      (m.serialNumber && m.serialNumber.toLowerCase().includes(q)) ||
      (m.location && m.location.toLowerCase().includes(q))
    );
  }, [machines, machineSearch]);

  return (
    <div className="space-y-6 max-w-full pb-10">
      {/* ── Top Header ────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Downtime Cause Analysis
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
                Fiche Suivi Arrêts
              </span>
            </div>
          </div>
        </div>

        {/* View Toggle Tabs */}
        <div className="flex items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex items-center shadow-xs">
            <button
              onClick={() => setActiveTab('overall')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'overall'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >

              Overall Plant
            </button>
            <button
              onClick={() => setActiveTab('machine')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'machine'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >

              Per-Machine
            </button>
          </div>

          <button
            onClick={fetchData}
            title="Refresh Data"
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Date Range Filter Bar (Historical Analysis) ───────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mr-1">
            <Calendar size={13} />
            Search Period:
          </span>
          {(['7d', '30d', '90d', '365d'] as const).map(preset => (
            <button
              key={preset}
              onClick={() => handlePresetChange(preset)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold tracking-wide transition-all ${dateRange === preset
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
                }`}
            >
              {preset === '7d' ? 'Last 7 Days' : preset === '30d' ? 'Last 30 Days' : preset === '90d' ? 'Last 90 Days' : 'This Year'}
            </button>
          ))}
          <button
            onClick={() => setDateRange('custom')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold tracking-wide transition-all ${dateRange === 'custom'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
          >
            Custom
          </button>
        </div>

        {/* Custom Range Inputs */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase">From</span>
            <input
              type="date"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                setDateRange('custom');
              }}
              className="text-xs font-medium border border-gray-200 rounded-xl px-2.5 py-1.5 bg-slate-50/50 outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase">To</span>
            <input
              type="date"
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                setDateRange('custom');
              }}
              className="text-xs font-medium border border-gray-200 rounded-xl px-2.5 py-1.5 bg-slate-50/50 outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── OVERALL PLANT VIEW ─────────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overall' && (
        <div className="space-y-6 animate-in fade-in">
          {/* KPI Summary Row — Top 2 Causes Only */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <KpiCard
              label="Top Cause (by Hours)"
              value={overallAnalysis.topByHours ? `${overallAnalysis.topByHours.totalHours} hrs` : 'None'}
              subValue={overallAnalysis.topByHours ? overallAnalysis.topByHours.name : 'No downtime recorded'}
              accentColor={C.amber}
              icon={<TrendingUp size={16} />}
            />
            <KpiCard
              label="Top Cause (by Frequency)"
              value={overallAnalysis.topByCount ? `${overallAnalysis.topByCount.count} times` : 'None'}
              subValue={overallAnalysis.topByCount ? overallAnalysis.topByCount.name : 'No downtime recorded'}
              accentColor={C.teal}
              icon={<Layers size={16} />}
            />
          </div>

          {/* Downtime Causes Chart Card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">

                <h2 className="text-base font-bold text-slate-800">
                  Total Downtime Hours by Failure Cause
                </h2>
              </div>
            </div>

            {overallAnalysis.causesList.length === 0 ? (
              <div className="py-16 text-center text-slate-400 italic">

                No downtime records found within the selected date range.
              </div>
            ) : (
              <div className="h-[360px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={overallAnalysis.causesList}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      type="number"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      unit="h"
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={180}
                      tickFormatter={(val: string) => val.length > 25 ? `${val.substring(0, 23)}...` : val}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xl text-xs space-y-1.5">
                              <p className="font-bold text-slate-900">{data.name}</p>
                              <p className="text-slate-500 font-medium">Category: <span className="font-semibold text-slate-700">{data.category}</span></p>
                              <div className="pt-1 border-t border-gray-100 flex items-center justify-between gap-4">
                                <span className="text-slate-500">Downtime:</span>
                                <span className="font-mono font-bold text-rose-600">{data.totalHours} hrs</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-slate-500">Impact Share:</span>
                                <span className="font-mono font-bold text-blue-600">{data.percentage}%</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-slate-500">Incidents:</span>
                                <span className="font-mono font-bold text-slate-800">{data.count} occurrences</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-slate-500">Machines Affected:</span>
                                <span className="font-mono font-bold text-slate-800">{data.affectedMachinesCount} machines</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="totalHours" radius={[0, 6, 6, 0]}>
                      {overallAnalysis.causesList.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Ranked Cause Breakdown Table */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Detailed Cause
                </h3>
              </div>

            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-gray-100">
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-12 text-center">#</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Failure Cause</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Incidents</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Machines</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Total Hours</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Downtime Start</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Downtime Finish</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Shifts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {overallAnalysis.causesList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                        No failure records found for this period.
                      </td>
                    </tr>
                  ) : (
                    overallAnalysis.causesList.map((row, idx) => (
                      <tr key={row.causeId} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-3.5 text-center font-bold text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-bold text-slate-900">{row.name}</span>
                          {row.causeId === 'unspecified' && (
                            <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200">
                              Legacy/Missing
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                            {row.category}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-700">
                          {row.count}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate-600">
                          {row.affectedMachinesCount}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-extrabold text-rose-600">
                          {row.totalHours} hrs
                        </td>
                        <td className="px-5 py-3.5 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                          {formatDateTimeClean(row.downStart)}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                          {formatDateTimeClean(row.downFinish)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {row.shiftCounts.s1 > 0 && (
                              <span
                                title={`Shift 1 (06h–14h): ${row.shiftCounts.s1} incident${row.shiftCounts.s1 > 1 ? 's' : ''}`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-100 text-amber-800 border border-amber-200"
                              >
                                <Sun size={9} className="text-amber-600" />
                                S1·{row.shiftCounts.s1}
                              </span>
                            )}
                            {row.shiftCounts.s2 > 0 && (
                              <span
                                title={`Shift 2 (14h–22h): ${row.shiftCounts.s2} incident${row.shiftCounts.s2 > 1 ? 's' : ''}`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-blue-100 text-blue-800 border border-blue-200"
                              >
                                <Sunrise size={9} className="text-blue-600" />
                                S2·{row.shiftCounts.s2}
                              </span>
                            )}
                            {row.shiftCounts.s3 > 0 && (
                              <span
                                title={`Shift 3 (22h–06h): ${row.shiftCounts.s3} incident${row.shiftCounts.s3 > 1 ? 's' : ''}`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-purple-100 text-purple-800 border border-purple-200"
                              >
                                <Moon size={9} className="text-purple-600" />
                                S3·{row.shiftCounts.s3}
                              </span>
                            )}
                            {row.shiftCounts.s1 === 0 && row.shiftCounts.s2 === 0 && row.shiftCounts.s3 === 0 && (
                              <span className="text-slate-300 text-[10px] italic">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── PER-MACHINE VIEW ───────────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'machine' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Unified Integrated Searchable Machine Picker */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider shrink-0">
                <HardDrive size={15} className="text-blue-600" />
                Select Machine:
              </div>

              {/* Single Searchable Dropdown Combobox */}
              <div className="relative flex-1 max-w-xl" ref={dropdownRef}>
                <div
                  onClick={() => setIsDropdownOpen(prev => !prev)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs bg-slate-50 hover:bg-slate-100 border border-gray-200 rounded-xl cursor-pointer transition-all shadow-2xs group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Search size={14} className="text-slate-400 shrink-0 group-hover:text-blue-600 transition-colors" />
                    {selectedMachine ? (
                      <span className="font-bold text-slate-900 truncate">
                        {selectedMachine.siteNumber ? `[${selectedMachine.siteNumber}] ` : ''}
                        {selectedMachine.name}
                        {selectedMachine.location ? ` — ${selectedMachine.location}` : ''}
                      </span>
                    ) : (
                      <span className="text-slate-400">Search & select machine...</span>
                    )}
                  </div>
                  <ChevronDown
                    size={15}
                    className={`text-slate-400 shrink-0 ml-2 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180 text-blue-600' : ''}`}
                  />
                </div>

                {/* Popover Menu */}
                {isDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* Inline Search Filter Input */}
                    <div className="p-2.5 border-b border-gray-100 bg-slate-50/70">
                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          autoFocus
                          placeholder="Type name, site #, serial, or location..."
                          value={machineSearch}
                          onChange={e => setMachineSearch(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-slate-900"
                        />
                        {machineSearch && (
                          <button
                            onClick={e => { e.stopPropagation(); setMachineSearch(''); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Machine List Options */}
                    <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                      {filteredMachines.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400 italic">
                          No machine found matching &quot;{machineSearch}&quot;
                        </div>
                      ) : (
                        filteredMachines.map(m => {
                          const isSelected = m.id === selectedMachineId;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setSelectedMachineId(m.id);
                                setIsDropdownOpen(false);
                                setMachineSearch('');
                              }}
                              className={`w-full px-3.5 py-2.5 text-left text-xs flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50/70 font-bold text-blue-900' : 'text-slate-800'
                                }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                {m.siteNumber && (
                                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                                    #{m.siteNumber}
                                  </span>
                                )}
                                <span className="truncate">{m.name}</span>
                                {m.location && (
                                  <span className="text-[10px] text-slate-400 font-normal truncate">
                                    ({m.location})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${m.status === 'operational'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : m.status === 'down'
                                    ? 'bg-rose-100 text-rose-700'
                                    : m.status === 'maintenance'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}>
                                  {m.status === 'maintenance' ? 'Maint' : m.status}
                                </span>
                                {isSelected && <Check size={14} className="text-blue-600" />}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {selectedMachine && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span>Equipment: <strong className="text-slate-800">{selectedMachine.name}</strong></span>
                {selectedMachine.siteNumber && <span>Site: <strong className="text-slate-800">{selectedMachine.siteNumber}</strong></span>}
                {selectedMachine.serialNumber && <span>S/N: <strong className="font-mono text-slate-800">{selectedMachine.serialNumber}</strong></span>}
                {selectedMachine.location && <span>Location: <strong className="text-slate-800">{selectedMachine.location}</strong></span>}
                <span className="flex items-center gap-1.5 ml-auto">
                  Status:
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${selectedMachine.status === 'operational'
                    ? 'bg-emerald-100 text-emerald-700'
                    : selectedMachine.status === 'down'
                      ? 'bg-rose-100 text-rose-700'
                      : selectedMachine.status === 'maintenance'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                    {selectedMachine.status === 'maintenance' ? 'Maintenance (Down)' : selectedMachine.status}
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Machine Specific KPI Cards — Top 2 Causes Only */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <KpiCard
              label="Most Severe Cause"
              value={machineAnalysis.topByHours ? `${machineAnalysis.topByHours.totalHours} hrs` : 'None'}
              subValue={machineAnalysis.topByHours ? machineAnalysis.topByHours.name : 'No stoppages recorded'}
              accentColor={C.amber}
              icon={<AlertTriangle size={16} />}
            />
            <KpiCard
              label="Most Frequent Cause"
              value={machineAnalysis.topByCount ? `${machineAnalysis.topByCount.count} times` : 'None'}
              subValue={machineAnalysis.topByCount ? machineAnalysis.topByCount.name : 'No stoppages recorded'}
              accentColor={C.teal}
              icon={<Wrench size={16} />}
            />
          </div>

          {/* Trend Sparkline / Timeline Chart */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  Downtime Trend over Period ({startDate} to {endDate})
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Daily downtime (hours)
              </span>
            </div>

            <div className="h-[220px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={machineAnalysis.timeline} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorDowntime" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E24B4A" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#E24B4A" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} unit="h" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-lg text-xs space-y-1">
                            <p className="font-bold text-slate-800">{data.fullDate}</p>
                            <p className="text-rose-600 font-mono font-extrabold">
                              {data.hours} hrs downtime
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="hours"
                    stroke="#E24B4A"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorDowntime)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Machine Causes Breakdown Bar Chart & Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Causes Bar Chart */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-rose-600" />
                  <h3 className="text-sm font-bold text-slate-800">
                    Causes for {selectedMachine?.name || 'Machine'}
                  </h3>
                </div>
              </div>

              {machineAnalysis.causesList.length === 0 ? (
                <div className="py-12 text-center text-slate-400 italic text-xs">
                  No stoppages recorded for this machine in the selected timeframe.
                </div>
              ) : (
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={machineAnalysis.causesList}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                      barCategoryGap="20%"
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                      <XAxis type="number" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} unit="h" />
                      <YAxis
                        dataKey="name"
                        type="category"
                        stroke="#64748b"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        width={150}
                        tickFormatter={(val: string) => val.length > 20 ? `${val.substring(0, 18)}...` : val}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-lg text-xs space-y-1">
                                <p className="font-bold text-slate-800">{data.name}</p>
                                <p className="text-rose-600 font-mono font-bold">{data.totalHours} hrs ({data.percentage}%)</p>
                                <p className="text-slate-500">{data.count} occurrences</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="totalHours" radius={[0, 6, 6, 0]}>
                        {machineAnalysis.causesList.map((_, index) => (
                          <Cell key={`cell-mach-${index}`} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Top Frequent Causes Ranked List */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <h3 className="text-sm font-bold text-slate-800">
                    Recurring Failure Patterns
                  </h3>
                </div>
                <span className="text-xs text-slate-400">
                  What always happens to this machine
                </span>
              </div>

              {machineAnalysis.causesList.length === 0 ? (
                <div className="py-12 text-center text-slate-400 italic text-xs">
                  No issues recorded in this period.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                  {machineAnalysis.causesList.map((item, idx) => (
                    <div
                      key={item.causeId}
                      className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between gap-3 hover:bg-slate-100/70 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-500 shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-slate-900 leading-tight">
                            {item.name}
                          </p>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold">
                            {item.category} • {item.count} incident{item.count > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-mono font-extrabold text-rose-600 block">
                          {item.totalHours} hrs
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 font-bold">
                          {item.percentage}% share
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
