import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import {
  Layers,
  Search,
  RefreshCw,
  Loader2,
  Box,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  HardDrive,
  CalendarDays,
  X,
  Edit2,
  Trash2,
  AlertCircle,
  Package,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import TableFooter from './ui/TableFooter';

interface ProductionHistoryEntry {
  id: number;
  machineId: string;
  machineName: string;
  siteNumber?: string;
  location?: string;
  machineStatus?: string;
  productName: string;
  mouleName: string;
  startDate: string;
  endDate?: string | null;
  qtyProduced?: number | null;
  qtyGood?: number | null;
  qtyBad?: number | null;
}

interface EditProductionForm {
  id: number;
  productName: string;
  mouleName: string;
  startDate: string;
  endDate?: string;
  qtyProduced?: number | string;
  qtyGood?: number | string;
  qtyBad?: number | string;
}

function formatDate(str?: string | null): string {
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

function calcDuration(start?: string | null, end?: string | null): string {
  if (!start) return '—';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = Math.max(0, Math.floor((e - s) / 60000));
  if (diff < 60) return `${diff}min`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const days = Math.floor(h / 24);
  const remH = h % 24;
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
}

// ─── Shared Modal backdrop ────────────────────────────────────────────────────
function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>
  );
}

// ─── Confirm Delete Dialog ────────────────────────────────────────────────────
function ConfirmDeleteDialog({
  title,
  description,
  onConfirm,
  onCancel,
  loading
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <ModalBackdrop onClose={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in slide-in-from-bottom-4 fade-in p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertCircle className="text-rose-600" size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500 mt-1">{description}</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-lg shadow-rose-200 disabled:opacity-60"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            Delete
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ─── Edit Production Modal ────────────────────────────────────────────────────
function EditProductionModal({
  form,
  onChange,
  onSave,
  onClose,
  loading
}: {
  form: EditProductionForm;
  onChange: (f: EditProductionForm) => void;
  onSave: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-in slide-in-from-bottom-4 fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
              <Package className="text-blue-600" size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Edit Production Entry</h3>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Admin Action</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Product Name</label>
              <input
                type="text"
                value={form.productName}
                onChange={e => onChange({ ...form, productName: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 hover:bg-white transition-all"
                placeholder="Product name"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Mold (Moule)</label>
              <input
                type="text"
                value={form.mouleName}
                onChange={e => onChange({ ...form, mouleName: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 hover:bg-white transition-all"
                placeholder="Mold name"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Start Date & Time</label>
              <input
                type="datetime-local"
                value={form.startDate ? form.startDate.slice(0, 16) : ''}
                onChange={e => onChange({ ...form, startDate: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 hover:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">End Date & Time</label>
              <input
                type="datetime-local"
                value={form.endDate ? form.endDate.slice(0, 16) : ''}
                onChange={e => onChange({ ...form, endDate: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 hover:bg-white transition-all"
              />
              <span className="text-[10px] text-gray-400 mt-1 block">Leave blank if currently ongoing</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Qty Produced</label>
              <input
                type="number"
                min="0"
                value={form.qtyProduced ?? ''}
                onChange={e => onChange({ ...form, qtyProduced: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 hover:bg-white transition-all font-mono"
                placeholder="Total"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1.5">Good Qty</label>
              <input
                type="number"
                min="0"
                value={form.qtyGood ?? ''}
                onChange={e => onChange({ ...form, qtyGood: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-emerald-50/50 hover:bg-white transition-all font-mono font-bold text-emerald-800"
                placeholder="Good"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-rose-600 uppercase tracking-wider mb-1.5">Bad Qty (Scrap)</label>
              <input
                type="number"
                min="0"
                value={form.qtyBad ?? ''}
                onChange={e => onChange({ ...form, qtyBad: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-rose-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent bg-rose-50/50 hover:bg-white transition-all font-mono font-bold text-rose-800"
                placeholder="Scrap"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-60"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Edit2 size={14} />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

type SortField = 'startDate' | 'endDate' | 'machineName' | 'productName' | 'mouleName' | 'qtyProduced' | 'qtyGood' | 'qtyBad';
type SortDir = 'asc' | 'desc';

export default function ProductionMoldHistory() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [rows, setRows] = useState<ProductionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');

  const [sortField, setSortField] = useState<SortField>('startDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);

  // Edit and Delete States
  const [editingProduction, setEditingProduction] = useState<EditProductionForm | null>(null);
  const [deletingProductionId, setDeletingProductionId] = useState<number | null>(null);
  const [productionSaving, setProductionSaving] = useState(false);
  const [productionDeleting, setProductionDeleting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await api.getAllProductionHistory();
      setRows(data || []);
    } catch (e) {
      console.error('Failed to fetch production history', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let r = [...rows];
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x =>
        (x.machineName || '').toLowerCase().includes(q) ||
        (x.siteNumber || '').toLowerCase().includes(q) ||
        (x.productName || '').toLowerCase().includes(q) ||
        (x.mouleName || '').toLowerCase().includes(q)
      );
    }

    r.sort((a, b) => {
      let av: any = a[sortField];
      let bv: any = b[sortField];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      av = av ?? '';
      bv = bv ?? '';
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return r;
  }, [rows, search, sortField, sortDir]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 text-gray-300" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-blue-600" />
      : <ChevronDown className="w-3 h-3 text-blue-600" />;
  };

  const TH = ({ label, field, right }: { label: string; field?: SortField; right?: boolean }) => (
    <th
      onClick={field ? () => handleSort(field) : undefined}
      className={cn(
        'px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap',
        field && 'cursor-pointer hover:text-slate-600 select-none',
        right && 'text-right'
      )}
    >
      <span className={cn('inline-flex items-center gap-1', right && 'justify-end w-full')}>
        {label}
        {field && <SortIcon field={field} />}
      </span>
    </th>
  );

  // ── Production CRUD Handlers ───────────────────────────────────────────────
  const openEditProduction = (entry: ProductionHistoryEntry) => {
    setEditingProduction({
      id: entry.id,
      productName: entry.productName || '',
      mouleName: entry.mouleName || '',
      startDate: entry.startDate || '',
      endDate: entry.endDate || '',
      qtyProduced: entry.qtyProduced !== undefined && entry.qtyProduced !== null ? entry.qtyProduced : '',
      qtyGood: entry.qtyGood !== undefined && entry.qtyGood !== null ? entry.qtyGood : '',
      qtyBad: entry.qtyBad !== undefined && entry.qtyBad !== null ? entry.qtyBad : ''
    });
  };

  const saveProduction = async () => {
    if (!editingProduction) return;
    setProductionSaving(true);
    try {
      const parseVal = (v: any) => (v !== '' && v !== undefined && v !== null && !isNaN(Number(v))) ? Number(v) : null;
      const cleanQtyProduced = parseVal(editingProduction.qtyProduced);
      const cleanQtyGood = parseVal(editingProduction.qtyGood);
      const cleanQtyBad = parseVal(editingProduction.qtyBad);

      await api.updateMachineProductionHistory(editingProduction.id, {
        productName: editingProduction.productName,
        mouleName: editingProduction.mouleName,
        startDate: editingProduction.startDate,
        endDate: editingProduction.endDate || null,
        qtyProduced: cleanQtyProduced,
        qtyGood: cleanQtyGood,
        qtyBad: cleanQtyBad
      });

      setRows(prev =>
        prev.map(e => e.id === editingProduction.id
          ? {
            ...e,
            productName: editingProduction.productName,
            mouleName: editingProduction.mouleName,
            startDate: editingProduction.startDate,
            endDate: editingProduction.endDate || null,
            qtyProduced: cleanQtyProduced,
            qtyGood: cleanQtyGood,
            qtyBad: cleanQtyBad
          }
          : e
        )
      );

      toast.success('Production entry updated successfully');
      setEditingProduction(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update entry');
    } finally {
      setProductionSaving(false);
    }
  };

  const confirmDeleteProduction = async () => {
    if (deletingProductionId === null) return;
    setProductionDeleting(true);
    try {
      await api.deleteMachineProductionHistory(deletingProductionId);
      setRows(prev => prev.filter(e => e.id !== deletingProductionId));
      toast.success('Production entry deleted successfully');
      setDeletingProductionId(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete entry');
    } finally {
      setProductionDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="text-sm font-medium">Loading production history...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      {/* Modals */}
      {editingProduction && (
        <EditProductionModal
          form={editingProduction}
          onChange={setEditingProduction}
          onSave={saveProduction}
          onClose={() => setEditingProduction(null)}
          loading={productionSaving}
        />
      )}
      {deletingProductionId !== null && (
        <ConfirmDeleteDialog
          title="Delete Production Entry"
          description="This action cannot be undone. The production/mold history record will be permanently removed from the database."
          onConfirm={confirmDeleteProduction}
          onCancel={() => setDeletingProductionId(null)}
          loading={productionDeleting}
        />
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Production History</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-gray-200 text-slate-600 hover:border-gray-300 transition-all shadow-xs active:scale-95"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search Bar + Count */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search machine, product, mould…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-xs"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>
        <span className="text-xs text-slate-400 font-semibold shrink-0">
          {filtered.length} / {rows.length} records
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-gray-100">
                <TH label="Machine" field="machineName" />
                <TH label="Product" field="productName" />
                <TH label="Mould" field="mouleName" />
                <TH label="Start" field="startDate" />
                <TH label="End" field="endDate" />
                <TH label="Duration" />
                <TH label="Produced" field="qtyProduced" right />
                <TH label="Good" field="qtyGood" right />
                <TH label="Bad" field="qtyBad" right />
                {isAdmin && (
                  <th className="px-4 py-3 text-[10px] font-bold text-amber-600 uppercase tracking-wider text-right">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 10 : 9} className="p-10 text-center text-slate-400 italic">
                    {rows.length === 0
                      ? 'No production history records found.'
                      : 'No records match your search.'}
                  </td>
                </tr>
              ) : (
                paginatedRows.map(row => {
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            row.machineStatus === 'operational' ? 'bg-emerald-500' :
                              row.machineStatus === 'down' ? 'bg-rose-500' :
                                row.machineStatus === 'maintenance' ? 'bg-amber-500' : 'bg-slate-300'
                          )} />
                          <div>
                            <span className="font-bold text-slate-900">{row.machineName || row.machineId}</span>
                            {row.siteNumber && (
                              <span className="ml-1.5 text-[10px] font-bold text-slate-400">#{row.siteNumber}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-800">
                        {row.productName || <span className="text-slate-300 italic">—</span>}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-700">
                        {row.mouleName || <span className="text-slate-300 italic">—</span>}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <CalendarDays size={10} className="text-slate-400 shrink-0" />
                          {formatDate(row.startDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {row.endDate
                          ? formatDate(row.endDate)
                          : <span className="text-emerald-600 font-semibold italic">ongoing</span>}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {calcDuration(row.startDate, row.endDate)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-800">
                        {row.qtyProduced != null ? row.qtyProduced.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-700">
                        {row.qtyGood != null ? row.qtyGood.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-rose-600">
                        {row.qtyBad != null ? row.qtyBad.toLocaleString() : '—'}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditProduction(row)}
                              title="Edit entry"
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all active:scale-95"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => setDeletingProductionId(row.id)}
                              title="Delete entry"
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-all active:scale-95"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Pagination */}
        <TableFooter
          totalItems={filtered.length}
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
