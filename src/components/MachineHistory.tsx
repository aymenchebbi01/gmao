import React, { useState, useEffect } from 'react';
import { WorkOrder, Machine, MachineConditionHistory, MachineProductionHistory } from '../types';
import { format } from 'date-fns';
import { toDate, cn, calculateMachineLiveHours, formatHoursToDays } from '../lib/utils';
import { RECOMMENDED_TASKS } from '../constants/maintenanceTasks';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import {
  History,
  Calendar,
  User,
  Wrench,
  CheckCircle2,
  Clock,
  FileText,
  ChevronRight,
  ExternalLink,
  Activity,
  Zap,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Download,
  Package,
  Edit2,
  Trash2,
  X,
  Save,
  AlertCircle
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { THERMOPLASTICS_LOGO_BASE64 } from '../constants/logo';
import { toast } from 'sonner';
import TableFooter from './ui/TableFooter';

interface MachineHistoryProps {
  machineId: string;
  machineName: string;
}

// ─── Edit / Delete state helpers ────────────────────────────────────────────
interface EditProductionForm {
  id: number;
  productName: string;
  mouleName: string;
  startDate: string;
  endDate: string;
  qtyProduced?: number | string;
  qtyGood?: number | string;
  qtyBad?: number | string;
}

interface EditConditionForm {
  id: number;
  previousCondition: string;
  newCondition: string;
  timestamp: string;
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
          <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertCircle className="text-red-600" size={24} />
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
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-lg shadow-red-200 disabled:opacity-60"
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
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Start Date</label>
              <input
                type="datetime-local"
                value={form.startDate ? form.startDate.slice(0, 16) : ''}
                onChange={e => onChange({ ...form, startDate: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 hover:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">End Date <span className="text-gray-300 normal-case font-normal">(optional)</span></label>
              <input
                type="datetime-local"
                value={form.endDate ? form.endDate.slice(0, 16) : ''}
                onChange={e => onChange({ ...form, endDate: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 hover:bg-white transition-all"
              />
            </div>
          </div>

          {/* Quantities */}
          <div className="grid grid-cols-3 gap-3 pt-1 border-t border-gray-100">
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
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 hover:bg-white transition-all font-mono text-emerald-700"
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
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 hover:bg-white transition-all font-mono text-rose-700"
                placeholder="Bad"
              />
            </div>
          </div>

          {/* Mismatch non-blocking warning */}
          {(() => {
            const prodNum = form.qtyProduced !== '' && form.qtyProduced !== undefined && form.qtyProduced !== null ? Number(form.qtyProduced) : null;
            const goodNum = form.qtyGood !== '' && form.qtyGood !== undefined && form.qtyGood !== null ? Number(form.qtyGood) : null;
            const badNum = form.qtyBad !== '' && form.qtyBad !== undefined && form.qtyBad !== null ? Number(form.qtyBad) : null;
            const hasAll = prodNum !== null && goodNum !== null && badNum !== null && !isNaN(prodNum) && !isNaN(goodNum) && !isNaN(badNum);
            const mismatch = hasAll && (goodNum + badNum !== prodNum);

            if (!mismatch) return null;
            return (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                <AlertTriangle size={15} className="shrink-0 text-amber-600" />
                <span>
                  <strong>Note:</strong> Good Qty ({goodNum}) + Bad Qty ({badNum}) = {goodNum + badNum}, which does not match Qty Produced ({prodNum}).
                </span>
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end bg-gray-50/50 rounded-b-2xl">
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
            className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg shadow-blue-200 disabled:opacity-60"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save size={14} />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ─── Edit Condition Modal ─────────────────────────────────────────────────────
const CONDITION_OPTIONS = ['Excellent', 'Good', 'Fair', 'Poor', 'Critical'];

function EditConditionModal({
  form,
  onChange,
  onSave,
  onClose,
  loading
}: {
  form: EditConditionForm;
  onChange: (f: EditConditionForm) => void;
  onSave: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in slide-in-from-bottom-4 fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Activity className="text-emerald-600" size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Edit Condition Entry</h3>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Admin Action</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Previous Condition</label>
            <select
              value={form.previousCondition}
              onChange={e => onChange({ ...form, previousCondition: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-gray-50 hover:bg-white transition-all"
            >
              <option value="">— N/A —</option>
              {CONDITION_OPTIONS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">New Condition</label>
            <select
              value={form.newCondition}
              onChange={e => onChange({ ...form, newCondition: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-gray-50 hover:bg-white transition-all"
            >
              <option value="">— Select —</option>
              {CONDITION_OPTIONS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Timestamp</label>
            <input
              type="datetime-local"
              value={form.timestamp ? form.timestamp.slice(0, 16) : ''}
              onChange={e => onChange({ ...form, timestamp: e.target.value ? new Date(e.target.value).toISOString() : '' })}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-gray-50 hover:bg-white transition-all"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end bg-gray-50/50 rounded-b-2xl">
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
            className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-lg shadow-emerald-200 disabled:opacity-60"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save size={14} />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MachineHistory({ machineId, machineName }: MachineHistoryProps) {
  const { isAdmin } = useAuth();

  const [history, setHistory] = useState<WorkOrder[]>([]);
  const [conditionHistory, setConditionHistory] = useState<MachineConditionHistory[]>([]);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [productionHistory, setProductionHistory] = useState<MachineProductionHistory[]>([]);
  const [prodPage, setProdPage] = useState(1);
  const [prodPageSize, setProdPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [activeMetric, setActiveMetric] = useState<'mttr' | 'mtbf' | 'availability' | null>(null);

  const prodTotalPages = Math.ceil(productionHistory.length / prodPageSize) || 1;
  const paginatedProductionHistory = productionHistory.slice(
    (prodPage - 1) * prodPageSize,
    prodPage * prodPageSize
  );

  // ── Edit / Delete state – production ──
  const [editingProduction, setEditingProduction] = useState<EditProductionForm | null>(null);
  const [deletingProductionId, setDeletingProductionId] = useState<number | null>(null);
  const [productionSaving, setProductionSaving] = useState(false);
  const [productionDeleting, setProductionDeleting] = useState(false);

  // ── Edit / Delete state – condition ──
  const [editingCondition, setEditingCondition] = useState<EditConditionForm | null>(null);
  const [deletingConditionId, setDeletingConditionId] = useState<number | null>(null);
  const [conditionSaving, setConditionSaving] = useState(false);
  const [conditionDeleting, setConditionDeleting] = useState(false);

  useEffect(() => {
    if (!machineId) return;

    const fetchData = async () => {
      try {
        const [machines, orders, condHistory, prodHistory] = await Promise.all([
          api.getMachines(),
          api.getWorkOrders(),
          api.getMachineConditionHistory(machineId),
          api.getMachineProductionHistory(machineId)
        ]);

        const machineData = machines.find(m => m.id === machineId);
        if (machineData) {
          setMachine(machineData);
        }

        const machineHistory = orders
          .filter(o => o.machineId === machineId && o.status === 'completed')
          .sort((a, b) => new Date(b.completedAt || '').getTime() - new Date(a.completedAt || '').getTime());

        setHistory(machineHistory);
        setConditionHistory(condHistory);
        setProductionHistory(prodHistory);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching machine history:", error);
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [machineId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm text-gray-500">Loading history...</p>
      </div>
    );
  }

  // ── Metrics ──────────────────────────────────────────────────────────────────
  const currentHours = machine ? calculateMachineLiveHours(machine) : 0;

  let liveOperatingTime = machine?.totalOperatingTime || 0;
  let liveDownTime = machine?.totalDownTime || 0;

  const totalInterventionTime = history.reduce((acc, order) => acc + (order.intervention?.durationMinutes || 0), 0);
  liveDownTime = Math.max(liveDownTime, totalInterventionTime);

  if (machine) {
    const now = new Date();
    if (machine.status === 'operational' && machine.operationalStartTime) {
      const start = new Date(machine.operationalStartTime);
      const diffMin = (now.getTime() - start.getTime()) / (1000 * 60);
      if (diffMin > 0) liveOperatingTime += diffMin;
    } else if (machine.status === 'down' && machine.lastHoursUpdate) {
      const start = new Date(machine.lastHoursUpdate);
      const diffMin = (now.getTime() - start.getTime()) / (1000 * 60);
      if (diffMin > 0) liveDownTime += diffMin;
    }
  }

  const failureCount = machine?.failureCount || 0;
  const mtbfVal = failureCount > 0 ? (liveOperatingTime / failureCount / 60) : 0;
  const mttrVal = failureCount > 0 ? (liveDownTime / failureCount) : 0;

  const mtbf = failureCount > 0 ? mtbfVal.toFixed(1) : 'N/A';
  const mttr = failureCount > 0 ? mttrVal.toFixed(0) : 'N/A';
  const availabilityVal = (liveOperatingTime + liveDownTime) > 0
    ? (liveOperatingTime / (liveOperatingTime + liveDownTime)) * 100
    : 100;
  const availability = availabilityVal.toFixed(1);

  const getMtbfColor = (val: number) => {
    if (val === 0) return "text-gray-400";
    if (val >= 500) return "text-emerald-600";
    if (val >= 200) return "text-amber-600";
    return "text-red-600";
  };
  const getMttrColor = (val: number) => {
    if (val === 0) return "text-gray-400";
    if (val <= 60) return "text-emerald-600";
    if (val <= 180) return "text-amber-600";
    return "text-red-600";
  };
  const getAvailabilityColor = (val: number) => {
    if (val >= 95) return "text-emerald-600";
    if (val >= 85) return "text-amber-600";
    return "text-red-600";
  };
  const getMtbfBg = (val: number, active: boolean) => {
    if (active) return "bg-blue-600 border-blue-600 shadow-lg shadow-blue-200";
    if (val === 0) return "bg-white border-gray-100";
    if (val >= 500) return "bg-white border-emerald-100 hover:border-emerald-200 hover:shadow-emerald-50 shadow-sm";
    if (val >= 200) return "bg-white border-amber-100 hover:border-amber-200 hover:shadow-amber-50 shadow-sm";
    return "bg-white border-red-100 hover:border-red-200 hover:shadow-red-50 shadow-sm";
  };
  const getMttrBg = (val: number, active: boolean) => {
    if (active) return "bg-amber-600 border-amber-600 shadow-lg shadow-amber-200";
    if (val === 0) return "bg-white border-gray-100";
    if (val <= 60) return "bg-white border-emerald-100 hover:border-emerald-200 hover:shadow-emerald-50 shadow-sm";
    if (val <= 180) return "bg-white border-amber-100 hover:border-amber-200 hover:shadow-amber-50 shadow-sm";
    return "bg-white border-red-100 hover:border-red-200 hover:shadow-red-50 shadow-sm";
  };

  // ── Maintenance cycle ─────────────────────────────────────────────────────
  const cycleSize = 20000;
  const cycleIndex = Math.floor(currentHours / cycleSize);
  const cycleStart = cycleIndex * cycleSize;
  const hoursInCycle = currentHours - cycleStart;

  const nextTargetHours = (machine?.nextMaintenanceHours && machine.nextMaintenanceHours > currentHours)
    ? machine.nextMaintenanceHours
    : (() => {
      const nextInBase = RECOMMENDED_TASKS.find(t => t.hours > hoursInCycle);
      return nextInBase ? (cycleStart + nextInBase.hours) : (cycleStart + cycleSize + RECOMMENDED_TASKS[0].hours);
    })();

  const nextTask = {
    ...((RECOMMENDED_TASKS.find(t => (cycleStart + t.hours) >= nextTargetHours) || RECOMMENDED_TASKS[0])),
    hours: nextTargetHours
  };

  const lastThresholdBase = RECOMMENDED_TASKS.slice().reverse().find(t => t.hours <= hoursInCycle);
  const lastThresholdHours = lastThresholdBase ? (cycleStart + lastThresholdBase.hours) : cycleStart;
  const currentThreshold = lastThresholdBase || RECOMMENDED_TASKS[0];

  const intervalTotal = Math.max(nextTargetHours - lastThresholdHours, 1);
  const intervalCurrent = currentHours - lastThresholdHours;
  const progressPercent = Math.min(Math.max((intervalCurrent / intervalTotal) * 100, 0), 100);

  // ── PDF report ───────────────────────────────────────────────────────────────
  const generateHistoryReport = () => {
    if (!machine) return;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const today = new Date();

    try {
      doc.addImage(THERMOPLASTICS_LOGO_BASE64, 'PNG', 14, 10, 35, 15);
    } catch (e) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('THERMOPLASTICS', 14, 20);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('MACHINE MAINTENANCE REPORT', 105, 40, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on: ${format(today, 'dd/MM/yyyy HH:mm')}`, 105, 47, { align: 'center' });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Machine Information', 14, 60);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const machineInfo = [
      ['Machine Name', machine.name],
      ['Site Number', machine.siteNumber || 'N/A'],
      ['Serial Number', machine.serialNumber || 'N/A'],
      ['Installation Date', machine.installationDate ? format(new Date(machine.installationDate), 'dd/MM/yyyy') : 'N/A'],
      ['Location', machine.location || 'N/A'],
      ['Current Status', machine.status.toUpperCase()],
      ['Operating Days', formatHoursToDays(currentHours, true)]
    ];

    autoTable(doc, {
      startY: 63,
      body: machineInfo,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 12;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Preventive Maintenance Schedule', 14, finalY);

    finalY += 3;
    const planningInfo = [
      ['Next Maintenance', formatHoursToDays(nextTask.hours, true)],
      ['Days Remaining', formatHoursToDays(Math.max(0, nextTask.hours - currentHours), true)],
      ['Cycle Frequency', nextTask.frequency]
    ];

    autoTable(doc, {
      startY: finalY,
      body: planningInfo,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
      headStyles: { fillColor: [59, 130, 246] }
    });

    finalY = (doc as any).lastAutoTable.finalY + 12;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('3. Maintenance Recommendations', 14, finalY);

    finalY += 3;
    const recTasks = (currentHours < RECOMMENDED_TASKS[0].hours ? RECOMMENDED_TASKS[0] : currentThreshold).tasks.map(t => [t]);

    autoTable(doc, {
      startY: finalY,
      head: [[`Recommended tasks for the ${currentThreshold.hours} hrs threshold`]],
      body: recTasks,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9 }
    });

    finalY = (doc as any).lastAutoTable.finalY + 12;

    if (finalY > 240) {
      doc.addPage();
      finalY = 20;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('4. Completed Interventions History', 14, finalY);

    finalY += 3;
    const historyData = history.map(order => [
      order.completedAt ? format(new Date(order.completedAt), 'dd/MM/yyyy') : 'N/A',
      order.type.toUpperCase(),
      order.title,
      order.intervention?.actions || 'N/A',
      order.assignedName || 'N/A'
    ]);

    autoTable(doc, {
      startY: finalY,
      head: [['Date', 'Type', 'Title', 'Actions Taken', 'Technician']],
      body: historyData.length > 0 ? historyData : [['N/A', 'N/A', 'N/A', 'No interventions recorded', 'N/A']],
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 8 },
      columnStyles: {
        2: { cellWidth: 35 },
        3: { cellWidth: 80 }
      }
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    doc.setFontSize(8);
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.text(`Page ${i} of ${pageCount}`, 196, 285, { align: 'right' });
      doc.text('MAINTENANCE MANAGEMENT SYSTEM (CMMS)', 14, 285);
    }

    doc.save(`Maintenance_Report_${machine.siteNumber || machine.name}_${format(today, 'yyyyMMdd')}.pdf`);
    toast.success('PDF Report generated successfully');
  };

  // ── Production CRUD handlers ─────────────────────────────────────────────────
  const openEditProduction = (entry: MachineProductionHistory) => {
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
      setProductionHistory(prev =>
        prev.map(e => e.id === editingProduction.id
          ? {
              ...e,
              productName: editingProduction.productName,
              mouleName: editingProduction.mouleName,
              startDate: editingProduction.startDate,
              endDate: editingProduction.endDate || undefined,
              qtyProduced: cleanQtyProduced ?? undefined,
              qtyGood: cleanQtyGood ?? undefined,
              qtyBad: cleanQtyBad ?? undefined
            }
          : e
        )
      );
      toast.success('Production entry updated');
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
      setProductionHistory(prev => prev.filter(e => e.id !== deletingProductionId));
      toast.success('Production entry deleted');
      setDeletingProductionId(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete entry');
    } finally {
      setProductionDeleting(false);
    }
  };

  // ── Condition CRUD handlers ───────────────────────────────────────────────────
  const openEditCondition = (log: MachineConditionHistory) => {
    setEditingCondition({
      id: log.id,
      previousCondition: log.previousCondition || '',
      newCondition: log.newCondition || '',
      timestamp: log.timestamp || ''
    });
  };

  const saveCondition = async () => {
    if (!editingCondition) return;
    setConditionSaving(true);
    try {
      await api.updateMachineConditionHistory(editingCondition.id, {
        previousCondition: editingCondition.previousCondition,
        newCondition: editingCondition.newCondition,
        timestamp: editingCondition.timestamp
      });
      setConditionHistory(prev =>
        prev.map(e => e.id === editingCondition.id
          ? { ...e, previousCondition: editingCondition.previousCondition, newCondition: editingCondition.newCondition, timestamp: editingCondition.timestamp }
          : e
        )
      );
      toast.success('Condition entry updated');
      setEditingCondition(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update entry');
    } finally {
      setConditionSaving(false);
    }
  };

  const confirmDeleteCondition = async () => {
    if (deletingConditionId === null) return;
    setConditionDeleting(true);
    try {
      await api.deleteMachineConditionHistory(deletingConditionId);
      setConditionHistory(prev => prev.filter(e => e.id !== deletingConditionId));
      toast.success('Condition entry deleted');
      setDeletingConditionId(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete entry');
    } finally {
      setConditionDeleting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
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
      {editingCondition && (
        <EditConditionModal
          form={editingCondition}
          onChange={setEditingCondition}
          onSave={saveCondition}
          onClose={() => setEditingCondition(null)}
          loading={conditionSaving}
        />
      )}
      {deletingConditionId !== null && (
        <ConfirmDeleteDialog
          title="Delete Condition Entry"
          description="This action cannot be undone. The condition evolution record will be permanently removed from the database."
          onConfirm={confirmDeleteCondition}
          onCancel={() => setDeletingConditionId(null)}
          loading={conditionDeleting}
        />
      )}

      {/* Mini Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => setActiveMetric(activeMetric === 'mtbf' ? null : 'mtbf')}
          className={cn(
            "p-6 rounded-2xl border transition-all text-left group relative overflow-hidden",
            getMtbfBg(mtbfVal, activeMetric === 'mtbf')
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              "p-2 rounded-xl",
              activeMetric === 'mtbf' ? "bg-white/20 text-white" :
                mtbfVal >= 500 ? "bg-emerald-50 text-emerald-600" :
                  mtbfVal >= 200 ? "bg-amber-50 text-amber-600" :
                    mtbfVal > 0 ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
            )}>
              <Zap size={20} />
            </div>
            <TrendingUp className={activeMetric === 'mtbf' ? "text-white/40" : "text-gray-300"} size={16} />
          </div>
          <p className={cn("text-xs font-bold uppercase tracking-wider mb-1", activeMetric === 'mtbf' ? "text-blue-100" : "text-gray-400")}>MTBF</p>
          <h3 className={cn("text-3xl font-black", activeMetric === 'mtbf' ? "text-white" : getMtbfColor(mtbfVal))}>
            {mtbf} <span className="text-sm font-normal">hrs</span>
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <p className={cn("text-[10px]", activeMetric === 'mtbf' ? "text-blue-100" : "text-gray-500")}>Mean Time Between Failures</p>
            {mtbfVal > 0 && !activeMetric && (
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                mtbfVal >= 500 ? "bg-emerald-100 text-emerald-700" :
                  mtbfVal >= 200 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
              )}>
                {mtbfVal >= 500 ? "Excellent" : mtbfVal >= 200 ? "Good" : "Poor"}
              </span>
            )}
          </div>
        </button>

        <button
          onClick={() => setActiveMetric(activeMetric === 'mttr' ? null : 'mttr')}
          className={cn(
            "p-6 rounded-2xl border transition-all text-left group relative overflow-hidden",
            getMttrBg(mttrVal, activeMetric === 'mttr')
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              "p-2 rounded-xl",
              activeMetric === 'mttr' ? "bg-white/20 text-white" :
                mttrVal > 0 && mttrVal <= 60 ? "bg-emerald-50 text-emerald-600" :
                  mttrVal > 60 && mttrVal <= 180 ? "bg-amber-50 text-amber-600" :
                    mttrVal > 180 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
            )}>
              <Clock size={20} />
            </div>
            <Activity className={activeMetric === 'mttr' ? "text-white/40" : "text-gray-300"} size={16} />
          </div>
          <p className={cn("text-xs font-bold uppercase tracking-wider mb-1", activeMetric === 'mttr' ? "text-amber-100" : "text-gray-400")}>MTTR</p>
          <h3 className={cn("text-3xl font-black", activeMetric === 'mttr' ? "text-white" : getMttrColor(mttrVal))}>
            {mttr} <span className="text-sm font-normal">min</span>
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <p className={cn("text-[10px]", activeMetric === 'mttr' ? "text-amber-100" : "text-gray-500")}>Mean Time To Repair</p>
            {mttrVal > 0 && !activeMetric && (
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                mttrVal <= 60 ? "bg-emerald-100 text-emerald-700" :
                  mttrVal <= 180 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
              )}>
                {mttrVal <= 60 ? "Efficient" : mttrVal <= 180 ? "Average" : "Inefficient"}
              </span>
            )}
          </div>
        </button>

        <button
          onClick={() => setActiveMetric(activeMetric === 'availability' ? null : 'availability')}
          className={cn(
            "p-6 rounded-2xl border transition-all text-left group relative overflow-hidden",
            activeMetric === 'availability' ? "bg-emerald-600 border-emerald-600 shadow-lg shadow-emerald-200" :
              availabilityVal >= 95 ? "bg-white border-emerald-100 hover:border-emerald-200 hover:shadow-emerald-50 shadow-sm" :
                availabilityVal >= 85 ? "bg-white border-amber-100 hover:border-amber-200 hover:shadow-amber-50 shadow-sm" :
                  "bg-white border-red-100 hover:border-red-200 hover:shadow-red-50 shadow-sm"
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              "p-2 rounded-xl",
              activeMetric === 'availability' ? "bg-white/20 text-white" :
                availabilityVal >= 95 ? "bg-emerald-50 text-emerald-600" :
                  availabilityVal >= 85 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
            )}>
              <ShieldCheck size={20} />
            </div>
            <div className="flex items-center gap-1">
              <span className={cn("text-[10px] font-bold", activeMetric === 'availability' ? "text-emerald-100" : getAvailabilityColor(availabilityVal))}>
                {availability}%
              </span>
              <TrendingUp className={activeMetric === 'availability' ? "text-white/40" : "text-gray-300"} size={16} />
            </div>
          </div>
          <p className={cn("text-xs font-bold uppercase tracking-wider mb-1", activeMetric === 'availability' ? "text-emerald-100" : "text-gray-400")}>Availability Rate</p>
          <h3 className={cn("text-3xl font-black", activeMetric === 'availability' ? "text-white" : getAvailabilityColor(availabilityVal))}>{availability}%</h3>
          <div className="mt-2 w-full h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn("h-full transition-all duration-1000", activeMetric === 'availability' ? "bg-white" : availabilityVal >= 95 ? "bg-emerald-500" : availabilityVal >= 85 ? "bg-amber-500" : "bg-red-500")}
              style={{ width: `${availability}%` }}
            ></div>
          </div>
          <p className={cn("text-[10px] mt-2", activeMetric === 'availability' ? "text-emerald-100" : "text-gray-500")}>Operational Uptime Ratio</p>
        </button>
      </div>

      {/* Metric Details */}
      {activeMetric && (
        <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
              {activeMetric === 'mtbf' && <Zap className="text-blue-600" size={20} />}
              {activeMetric === 'mttr' && <Clock className="text-amber-600" size={20} />}
              {activeMetric === 'availability' && <ShieldCheck className="text-emerald-600" size={20} />}
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-tight">
                {activeMetric === 'mtbf' ? 'Mean Time Between Failures Analysis' :
                  activeMetric === 'mttr' ? 'Mean Time To Repair Analysis' :
                    'Availability & Performance Rate'}
              </h4>
              <p className="text-xs text-gray-500">Detailed breakdown for {machineName}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Key Data Points</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Total Operating Time</span>
                    <span className="font-mono font-bold">{(liveOperatingTime / 60).toFixed(1)} hrs</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Total Down Time</span>
                    <span className="font-mono font-bold">{(liveDownTime / 60).toFixed(1)} hrs</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Failure Count</span>
                    <span className="font-mono font-bold text-red-600">{failureCount}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs text-blue-800 font-medium leading-relaxed">
                  {activeMetric === 'mtbf' && "MTBF measures the average time between inherent failures of a system. A higher MTBF indicates a more reliable machine."}
                  {activeMetric === 'mttr' && "MTTR is the average time required to repair a failed component or device. A lower MTTR indicates more efficient maintenance processes."}
                  {activeMetric === 'availability' && "Availability is the probability that a system is operational at a given time. It is calculated as Uptime / (Uptime + Downtime)."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recommended Tasks */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-gray-50/50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Activity size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Recommended Maintenance</h3>
              <p className="text-[10px] text-gray-500">Based on current operational time: <span className="font-mono font-bold text-blue-600">{formatHoursToDays(currentHours, true)}</span></p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-gray-400 uppercase">Next Major Check</span>
            <span className="text-xs font-bold text-blue-600">{formatHoursToDays(nextTask.hours, true)} ({nextTask.frequency})</span>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-1000"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <span className="text-xs font-bold text-gray-600">{Math.round(progressPercent)}%</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center">
                <AlertTriangle size={14} className="mr-2 text-amber-500" />
                Tasks for {currentHours < RECOMMENDED_TASKS[0].hours ? RECOMMENDED_TASKS[0].hours : (lastThresholdHours || 500)} hrs threshold
              </h4>
              <ul className="space-y-2">
                {(currentHours < RECOMMENDED_TASKS[0].hours ? RECOMMENDED_TASKS[0] : currentThreshold).tasks.map((task, i) => (
                  <li key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100/50 text-xs text-gray-700">
                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"></div>
                    {task}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-blue-50/30 rounded-2xl p-6 border border-blue-100/50 flex flex-col justify-center items-center text-center">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                <Clock className="text-blue-600" size={32} />
              </div>
              <h4 className="text-sm font-bold text-gray-900 mb-2">Next Maintenance Cycle</h4>
              <p className="text-xs text-gray-500 mb-4">The machine will reach the next maintenance threshold in approximately</p>
              <div className="text-2xl font-black text-blue-600">
                {formatHoursToDays(nextTask.hours - currentHours, true)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Condition Evolution ──────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900 flex items-center">
            <Activity className="w-4 h-4 mr-2 text-emerald-600" />
            Condition Evolution ({conditionHistory.length})
          </h3>
          {isAdmin && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-[10px] font-bold text-amber-700 uppercase tracking-wide">
              <ShieldCheck size={10} />
              Admin Mode
            </span>
          )}
        </div>

        {conditionHistory.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {conditionHistory.map((log) => (
              <div key={log.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm group hover:border-gray-200 transition-all">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 uppercase font-bold">Previous</span>
                    <span className="text-xs font-medium text-gray-500 line-through">{log.previousCondition || 'N/A'}</span>
                  </div>
                  <ChevronRight size={16} className="text-gray-300" />
                  <div className="flex flex-col">
                    <span className="text-[10px] text-emerald-600 uppercase font-bold">New Condition</span>
                    <span className="text-sm font-bold text-gray-900">{log.newCondition}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="flex items-center justify-end text-[10px] text-gray-400 font-medium">
                      <Clock size={10} className="mr-1" />
                      {format(toDate(log.timestamp), 'MMM d, yyyy HH:mm')}
                    </div>
                  </div>
                  {/* Admin actions */}
                  {isAdmin && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEditCondition(log)}
                        title="Edit entry"
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => setDeletingConditionId(log.id)}
                        title="Delete entry"
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl p-6 text-center border border-dashed border-gray-200">
            <p className="text-xs text-gray-500 italic">No condition changes recorded yet.</p>
          </div>
        )}
      </div>

      {/* ── Production & Mold History ─────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900 flex items-center">
            <Package className="w-4 h-4 mr-2 text-blue-600" />
            Production & Mold History ({productionHistory.length})
          </h3>
          {isAdmin && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-[10px] font-bold text-amber-700 uppercase tracking-wide">
              <ShieldCheck size={10} />
              Admin Mode
            </span>
          )}
        </div>

        {productionHistory.length > 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mold (Moule)</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Start Date</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">End Date</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Qty Produced</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Good Qty</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Bad Qty</th>
                  {isAdmin && (
                    <th className="px-6 py-3 text-[10px] font-bold text-amber-500 uppercase tracking-wider text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginatedProductionHistory.map((entry) => (
                  <tr key={entry.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-emerald-700">{entry.productName || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-blue-700">{entry.mouleName || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500 font-medium">
                      {format(new Date(entry.startDate), 'MMM d, yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500 font-medium">
                      {entry.endDate ? format(new Date(entry.endDate), 'MMM d, yyyy HH:mm') : (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase">Current</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono font-medium text-slate-700">
                      {entry.qtyProduced !== undefined && entry.qtyProduced !== null ? entry.qtyProduced.toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono font-bold text-emerald-600">
                      {entry.qtyGood !== undefined && entry.qtyGood !== null ? entry.qtyGood.toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono font-bold text-rose-600">
                      {entry.qtyBad !== undefined && entry.qtyBad !== null ? entry.qtyBad.toLocaleString() : '—'}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditProduction(entry)}
                            title="Edit entry"
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => setDeletingProductionId(entry.id)}
                            title="Delete entry"
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <TableFooter
              totalItems={productionHistory.length}
              pageSize={prodPageSize}
              currentPage={prodPage}
              totalPages={prodTotalPages}
              onPageSizeChange={(size) => {
                setProdPageSize(size);
                setProdPage(1);
              }}
              onPageChange={setProdPage}
            />
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl p-6 text-center border border-dashed border-gray-200">
            <p className="text-xs text-gray-500 italic">No production history recorded yet.</p>
          </div>
        )}
      </div>

      {/* ── Completed Interventions ────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900 flex items-center">
            <History className="w-4 h-4 mr-2 text-blue-600" />
            Completed Interventions ({history.length})
          </h3>
          <button
            onClick={generateHistoryReport}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
          >
            <Download size={14} />
            Download History Report
          </button>
        </div>

        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-100 ml-[1px]"></div>

          <div className="space-y-6">
            {history.map((order, index) => (
              <div key={order.id} className="relative pl-10 group">
                <div className="absolute left-0 top-1 w-9 h-9 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-blue-50 z-10"></div>
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group-hover:border-blue-100">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                          order.type === 'preventive' ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
                        )}>
                          {order.type}
                        </span>
                        <h4 className="text-sm font-bold text-gray-900">{order.title}</h4>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2">{order.description}</p>
                    </div>

                    <div className="flex flex-col items-end text-right shrink-0">
                      <div className="flex items-center text-xs font-medium text-gray-900">
                        <Calendar size={12} className="mr-1.5 text-gray-400" />
                        {order.completedAt ? format(toDate(order.completedAt), 'MMM d, yyyy') : 'N/A'}
                      </div>
                      <div className="flex items-center text-[10px] text-gray-500 mt-1">
                        <Clock size={10} className="mr-1 text-gray-400" />
                        {order.intervention?.durationMinutes || 0} min duration
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center text-xs text-gray-600">
                        <User size={12} className="mr-1.5 text-gray-400" />
                        {order.assignedName || 'Technician'}
                      </div>
                      {order.intervention?.partsUsed && order.intervention.partsUsed.length > 0 && (
                        <div className="flex items-center text-xs text-gray-600">
                          <Wrench size={12} className="mr-1.5 text-gray-400" />
                          {order.intervention.partsUsed.length} parts used
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-gray-400">#{order.id}</span>
                    </div>
                  </div>

                  {order.intervention && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100/50">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Actions Taken</p>
                      <p className="text-xs text-gray-600 italic">"{order.intervention.actions}"</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
