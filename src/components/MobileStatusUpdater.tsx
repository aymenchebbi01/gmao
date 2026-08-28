import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Machine, SparePart, InterventionPart, ProductionProduct } from '../types';
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Wrench, 
  HardDrive, 
  Loader2, 
  X, 
  Plus, 
  Layers, 
  Box, 
  MapPin, 
  Activity,
  Save,
  Hash,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { cn, calculateMachineLiveHours } from '../lib/utils';
import { format, differenceInMinutes } from 'date-fns';
import { FAILURE_CAUSE_CATEGORIES } from './WorkOrderList';

interface Props {
  machineId: string | null;
}

export default function MobileStatusUpdater({ machineId }: Props) {
  const { user } = useAuth();
  const [machine, setMachine] = useState<Machine | null>(null);
  const [productsList, setProductsList] = useState<ProductionProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const hasScanLogged = useRef(false);

  const [view, setView] = useState<'details' | 'status' | 'report'>('details');
  const [productInput, setProductInput] = useState('');
  const [mouleInput, setMouleInput] = useState('');
  const [conditionInput, setConditionInput] = useState('Good');
  const [qtyProducedInput, setQtyProducedInput] = useState('');
  const [qtyGoodInput, setQtyGoodInput] = useState('');
  const [qtyBadInput, setQtyBadInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [pendingStatus, setPendingStatus] = useState<Machine['status'] | null>(null);

  // Active maintenance order tracking & report filing states
  const [activeWorkOrder, setActiveWorkOrder] = useState<any | null>(null);
  const [techsName, setTechsName] = useState(user?.displayName || user?.username || '');
  const [actionsTaken, setActionsTaken] = useState('');
  const [difficulties, setDifficulties] = useState('');
  const [startTime, setStartTime] = useState(() => {
    const d = new Date(Date.now() - 30 * 60 * 1000);
    return format(d, "yyyy-MM-dd'T'HH:mm");
  });
  const [endTime, setEndTime] = useState(() => {
    return format(new Date(), "yyyy-MM-dd'T'HH:mm");
  });
  const [calculatedTime, setCalculatedTime] = useState('30min');
  const [failureCategory, setFailureCategory] = useState<string>('mechanical');
  const [failureCause, setFailureCause] = useState<string>('mech_lubrication');
  const [relatedCause, setRelatedCause] = useState<string>('');
  const [operations, setOperations] = useState({
    replacement: false,
    diagnostic: true,
    improvement: false,
    control: true,
  });
  const [maintenanceType, setMaintenanceType] = useState<'corrective' | 'preventive'>('corrective');
  const [finalMachineStatus, setFinalMachineStatus] = useState<'operational' | 'idle' | 'down'>('operational');

  // Auto-calculate intervention time from startTime and endTime
  useEffect(() => {
    if (startTime && endTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const diff = differenceInMinutes(end, start);
        if (diff >= 0) {
          const h = Math.floor(diff / 60);
          const m = diff % 60;
          const timeStr = h > 0 ? `${h}h ${m}min` : `${m}min`;
          setCalculatedTime(timeStr);
        } else {
          setCalculatedTime('Invalid (End before Start)');
        }
      }
    }
  }, [startTime, endTime]);

  // Spare parts state for mobile reports
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [partsUsed, setPartsUsed] = useState<InterventionPart[]>([]);
  const [selectedPartId, setSelectedPartId] = useState('');
  const [selectedPartQty, setSelectedPartQty] = useState(1);

  // Live hours calculation
  const [liveHours, setLiveHours] = useState(0);

  useEffect(() => {
    if (!machineId) {
      setLoading(false);
      return;
    }

    const fetchMachine = async () => {
      try {
        const [machines, orders, allParts, allProducts, prodHistory] = await Promise.all([
          api.getMachines(),
          api.getWorkOrders(),
          api.getSpareParts(),
          api.getProducts().catch(() => []),
          api.getMachineProductionHistory(machineId).catch(() => [])
        ]);
        const found = machines.find(m => m.id === machineId);
        if (found) {
          setMachine(found);
          setProductInput(found.injectingProduct || '');
          setMouleInput(found.currentMoule || '');
          setConditionInput(found.condition || 'Good');
          setReasonInput(found.statusReason || '');
          setPendingStatus(found.status);
          setSpareParts(allParts || []);
          setProductsList(allProducts || []);
          setLiveHours(calculateMachineLiveHours(found));

          // Populate current quantities from active production history entry if available
          if (prodHistory && prodHistory.length > 0) {
            const activeEntry = prodHistory.find((p: any) => p.endDate === null) || prodHistory[0];
            if (activeEntry) {
              setQtyProducedInput(activeEntry.qtyProduced != null ? String(activeEntry.qtyProduced) : '');
              setQtyGoodInput(activeEntry.qtyGood != null ? String(activeEntry.qtyGood) : '');
              setQtyBadInput(activeEntry.qtyBad != null ? String(activeEntry.qtyBad) : '');
            }
          }

          // Find if there is an active work order (pending or in-progress) for this machine
          const activeOrder = orders.find(o => o.machineId === machineId && (o.status === 'in-progress' || o.status === 'pending'));
          if (activeOrder) {
            setActiveWorkOrder(activeOrder);
            if (activeOrder.type) setMaintenanceType(activeOrder.type);
          }

          // Log QR scan only once per page load
          if (!hasScanLogged.current) {
            hasScanLogged.current = true;
            const userLabel = user?.displayName || user?.username || 'Mobile Scanner';
            try {
              await api.logMachineAction(
                'SCAN_QR',
                found.id,
                'User "' + userLabel + '" scanned QR code and accessed Machine \'' + found.name + '\''
              );
            } catch (e) {
              // Non-critical
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch machine:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMachine();
  }, [machineId, user]);

  // Live timer for operating hours
  useEffect(() => {
    if (!machine) return;
    const interval = setInterval(() => {
      setLiveHours(calculateMachineLiveHours(machine));
    }, 30000);
    return () => clearInterval(interval);
  }, [machine]);

  const handleStatusChange = async (newStatus: Machine['status']) => {
    if (!machine) return;
    const oldStatus = machine.status;
    setUpdating(true);
    try {
      const userLabel = user?.displayName || user?.username || 'Mobile User';

      if ((newStatus === 'down' || newStatus === 'maintenance') && !reasonInput.trim()) {
        toast.error('Please provide a reason for this status change');
        setUpdating(false);
        return;
      }

      // Create a work order automatically if changing to maintenance
      if (newStatus === 'maintenance' && !activeWorkOrder) {
        let latestOrders: any[] = [];
        try {
          latestOrders = await api.getWorkOrders();
        } catch (e) {
          console.error("Failed to fetch work orders for sequential ID", e);
        }

        const year = new Date().getFullYear();
        const prefix = 'WO-' + year + '-';
        const yearOrders = latestOrders.filter(o => o.id && o.id.startsWith(prefix));

        let nextNum = 1;
        if (yearOrders.length > 0) {
          const maxNum = Math.max(...yearOrders.map(o => {
            const parts = o.id.split('-');
            return parseInt(parts[parts.length - 1]) || 0;
          }));
          nextNum = isFinite(maxNum) && maxNum >= 0 ? maxNum + 1 : 1;
        }
        const woId = prefix + nextNum.toString().padStart(4, '0');

        const newWorkOrder = {
          id: woId,
          machineId: machine.id,
          machineName: machine.name,
          type: 'corrective' as const,
          priority: 'high' as const,
          status: 'in-progress' as const,
          title: 'Corrective Maintenance: ' + (reasonInput || machine.name),
          description: reasonInput || 'Status changed to maintenance via mobile QR scan.',
          createdAt: new Date().toISOString(),
          createdBy: user?.uid || 'system',
          createdByName: userLabel,
          issuerName: userLabel,
          issuerSector: 'Maintenance',
          requesterName: userLabel,
          requestDate: new Date().toISOString(),
          location: machine.location,
          malfunctionDescription: reasonInput || 'Downtime reported via QR.',
          assignedTo: user?.uid || 'system',
          assignedName: userLabel,
          reportNumber: woId.replace('WO', 'REP')
        };
        await api.createWorkOrder(newWorkOrder);
        setActiveWorkOrder(newWorkOrder);
      }

      const updatePayload: any = {
        status: newStatus,
        injectingProduct: productInput,
        currentMoule: mouleInput,
        condition: conditionInput,
        statusReason: (newStatus === 'operational' || newStatus === 'idle') ? '' : reasonInput,
        qtyProduced: qtyProducedInput !== '' ? Number(qtyProducedInput) : null,
        qtyGood: qtyGoodInput !== '' ? Number(qtyGoodInput) : null,
        qtyBad: qtyBadInput !== '' ? Number(qtyBadInput) : null,
      };

      if (newStatus === 'operational' && oldStatus !== 'operational') {
        updatePayload.operationalStartTime = new Date().toISOString();
        updatePayload.downStartTime = null;
      } else if ((newStatus === 'down' || newStatus === 'maintenance') && (oldStatus !== 'down' && oldStatus !== 'maintenance')) {
        updatePayload.downStartTime = new Date().toISOString();
        updatePayload.operationalStartTime = null;
      }

      await api.updateMachine(machine.id, updatePayload);

      setMachine({
        ...machine,
        ...updatePayload
      });

      // Log action
      try {
        await api.logMachineAction(
          'CHANGE_STATUS',
          machine.id,
          'User "' + userLabel + '" updated Machine \'' + machine.name + '\' -> Status: ' + newStatus + ', Product: \'' + productInput + '\', Moule: \'' + mouleInput + '\', Condition: \'' + conditionInput + '\''
        );
      } catch (e) {}

      toast.success('Machine status & setup updated successfully');
      if (newStatus === 'operational' || newStatus === 'idle') setReasonInput('');
      setView('details');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update machine');
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveSetup = async () => {
    if (!machine) return;
    setUpdating(true);
    try {
      const userLabel = user?.displayName || user?.username || 'Mobile User';
      const updatePayload: any = {
        injectingProduct: productInput,
        currentMoule: mouleInput,
        condition: conditionInput,
        qtyProduced: qtyProducedInput !== '' ? Number(qtyProducedInput) : null,
        qtyGood: qtyGoodInput !== '' ? Number(qtyGoodInput) : null,
        qtyBad: qtyBadInput !== '' ? Number(qtyBadInput) : null,
      };

      await api.updateMachine(machine.id, updatePayload);

      setMachine({
        ...machine,
        injectingProduct: productInput,
        currentMoule: mouleInput,
        condition: conditionInput
      });

      try {
        await api.logMachineAction(
          'UPDATE_SETUP',
          machine.id,
          'User "' + userLabel + '" updated setup for Machine \'' + machine.name + '\' -> Product: \'' + productInput + '\', Moule: \'' + mouleInput + '\', Qty: ' + (qtyProducedInput || 'N/A')
        );
      } catch (e) {}

      toast.success('Product, mold setup & quantities saved successfully');
      setView('details');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save setup');
    } finally {
      setUpdating(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkOrder || !machine) return;
    if (!techsName.trim()) {
      toast.error('Please enter technician name');
      return;
    }
    if (!actionsTaken.trim()) {
      toast.error('Please describe actions taken');
      return;
    }
    setUpdating(true);
    try {
      const userLabel = user?.displayName || user?.username || 'Mobile User';
      const nowStr = new Date().toISOString();

      const startD = new Date(startTime);
      const endD = new Date(endTime);
      const diff = (!isNaN(startD.getTime()) && !isNaN(endD.getTime())) 
        ? Math.max(1, differenceInMinutes(endD, startD)) 
        : 30;
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      const interventionTimeFormatted = h > 0 ? `${h}h ${m}min` : `${m}min`;

      const intervention: any = {
        issuerName: activeWorkOrder.issuerName || userLabel,
        issuerSector: activeWorkOrder.issuerSector || 'Maintenance',
        requesterName: activeWorkOrder.requesterName || userLabel,
        requestDate: activeWorkOrder.requestDate || (activeWorkOrder.createdAt ? format(new Date(activeWorkOrder.createdAt), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')),
        technicians: techsName,
        location: machine.location,
        malfunctionDescription: activeWorkOrder.description || machine.statusReason || '',
        operations: {
          replacement: partsUsed.length > 0 || operations.replacement,
          diagnostic: operations.diagnostic,
          improvement: operations.improvement,
          control: operations.control
        },
        maintenanceType: maintenanceType,
        failureCategory: failureCategory,
        failureCause: failureCause,
        relatedCause: relatedCause,
        interventionTime: interventionTimeFormatted,
        actions: actionsTaken,
        difficulties: difficulties,
        partsUsed: partsUsed,
        startTime: startTime,
        endTime: endTime,
        durationMinutes: diff,
        comments: 'Completed via Mobile QR Scanner',
        completedAt: nowStr,
        currentHours: machine.currentHours
      };

      // 1. Complete work order
      const updatePayload: any = {
        status: 'completed',
        completedAt: nowStr,
        intervention
      };

      if (!activeWorkOrder.assignedTo) {
        updatePayload.assignedTo = user?.uid || 'system';
        updatePayload.assignedName = userLabel;
      }
      if (!activeWorkOrder.reportNumber) {
        updatePayload.reportNumber = activeWorkOrder.id.replace('WO', 'REP');
      }

      await api.updateWorkOrder(activeWorkOrder.id, updatePayload);

      // 2. Set new machine status
      await api.updateMachine(machine.id, {
        status: finalMachineStatus,
        statusReason: '',
        lastMaintenance: nowStr
      });

      // 3. Decrement stock for each spare part used
      for (const part of partsUsed) {
        try {
          const latestParts = await api.getSpareParts();
          const partData = latestParts.find(p => p.id === part.partId);
          if (partData) {
            await api.updateSparePart(part.partId, {
              stock: Math.max(0, (partData.stock || 0) - part.quantity)
            });
          }
        } catch (e) {
          console.error("Failed to update stock for part:", part.partId, e);
        }
      }

      // Log status change
      try {
        await api.logMachineAction(
          'CHANGE_STATUS',
          machine.id,
          'User "' + userLabel + '" resolved Work Order \'' + activeWorkOrder.id + '\' for Machine \'' + machine.name + '\'. Machine set to \'' + finalMachineStatus + '\'.'
        );
      } catch (e) {}

      toast.success('Intervention report filed & work order completed!');

      // Reset state
      setMachine({
        ...machine,
        status: finalMachineStatus,
        statusReason: '',
        lastMaintenance: nowStr
      });
      setActiveWorkOrder(null);
      setView('details');
      setActionsTaken('');
      setDifficulties('');
      setPartsUsed([]);
      setSelectedPartId('');
      setSelectedPartQty(1);
    } catch (error) {
      console.error(error);
      toast.error('Failed to submit report');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-600 font-semibold text-sm">Loading Machine Data...</p>
      </div>
    );
  }

  if (!machine) {
    return (
      <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-black text-gray-900 mb-2">Machine Not Found</h1>
        <p className="text-gray-500 text-sm">The QR code scanned points to an invalid or deleted machine ID.</p>
      </div>
    );
  }

  const selectedCategoryObj = FAILURE_CAUSE_CATEGORIES.find(c => c.id === failureCategory);

  return (
    <div className="max-w-md mx-auto bg-white min-h-[90vh] rounded-3xl shadow-xl overflow-hidden border border-gray-100 flex flex-col my-2">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 p-6 text-white relative overflow-hidden flex-shrink-0">
        <div className="absolute top-0 right-0 opacity-10 pointer-events-none">
          <HardDrive className="w-48 h-48 -mr-10 -mt-10" />
        </div>

        <div className="flex items-center justify-between relative z-10 mb-2">
          <div className="flex items-center gap-2">
            <span className={cn(
              "w-3 h-3 rounded-full animate-pulse",
              machine.status === 'operational' ? "bg-emerald-400" :
              machine.status === 'down' ? "bg-rose-400" :
              machine.status === 'maintenance' ? "bg-amber-400" : "bg-purple-400"
            )} />
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-blue-200">
              {machine.status}
            </span>
          </div>
          {machine.siteNumber && (
            <span className="bg-white/20 backdrop-blur px-3 py-1 rounded-full text-xs font-bold font-mono tracking-wider border border-white/20">
              #{machine.siteNumber}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-black relative z-10 text-white tracking-tight">{machine.name}</h1>
        <p className="text-blue-200 text-xs font-mono font-medium relative z-10 mt-0.5">SN: {machine.serialNumber}</p>

        {/* Live Metrics Pills */}
        <div className="mt-4 flex flex-wrap gap-2 relative z-10">
          <div className="bg-white/15 backdrop-blur px-3 py-1.5 rounded-xl text-xs font-bold border border-white/20 flex items-center gap-1.5">
            <Clock size={13} className="text-blue-200" />
            <span>{liveHours.toFixed(1)} hrs</span>
          </div>
          {machine.injectingProduct && (
            <div className="bg-white/15 backdrop-blur px-3 py-1.5 rounded-xl text-xs font-bold border border-white/20 flex items-center gap-1.5">
              <Box size={13} className="text-blue-200" />
              <span>{machine.injectingProduct}</span>
            </div>
          )}
          {machine.currentMoule && (
            <div className="bg-white/15 backdrop-blur px-3 py-1.5 rounded-xl text-xs font-bold border border-white/20 flex items-center gap-1.5">
              <Layers size={13} className="text-blue-200" />
              <span>{machine.currentMoule}</span>
            </div>
          )}
        </div>

        {machine.statusReason && (machine.status === 'down' || machine.status === 'maintenance') && (
          <div className="mt-3 px-3.5 py-2 bg-rose-500/25 backdrop-blur rounded-xl text-xs font-medium border border-rose-400/30 text-rose-100 relative z-10">
            <span className="font-bold uppercase text-[10px] block text-rose-300">Reason for Downtime:</span>
            {machine.statusReason}
          </div>
        )}
      </div>

      {/* Main Body */}
      <div className="p-6 flex-1 flex flex-col bg-slate-50/60">
        {view === 'details' ? (
          <div className="space-y-5">
            {/* Active Work Order Banner */}
            {activeWorkOrder && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                    <Wrench className="w-4 h-4 text-amber-600 animate-spin" />
                    <span>Active Work Order</span>
                  </div>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                    {activeWorkOrder.id}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{activeWorkOrder.title}</h3>
                  <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{activeWorkOrder.description}</p>
                </div>
                <button
                  onClick={() => setView('report')}
                  className="w-full mt-2 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-md shadow-amber-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 text-xs"
                >
                  <Wrench size={14} />
                  Fill Intervention Report
                </button>
              </div>
            )}

            {/* Quick Info Card */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-xs space-y-3">
              <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Machine Attributes</h2>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 bg-gray-50 rounded-xl">
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Location</span>
                  <span className="font-bold text-gray-800 flex items-center gap-1 mt-0.5">
                    <MapPin size={12} className="text-blue-600" />
                    {machine.location || 'N/A'}
                  </span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl">
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Condition</span>
                  <span className={cn(
                    "font-bold mt-0.5 block",
                    machine.condition === 'Excellent' || machine.condition === 'Good' ? "text-emerald-600" :
                    machine.condition === 'Fair' ? "text-amber-600" : "text-rose-600"
                  )}>
                    {machine.condition || 'Good'}
                  </span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl">
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Machine Type</span>
                  <span className="font-bold text-gray-800 mt-0.5 block truncate">{machine.type || 'Standard'}</span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl">
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Clamping Force</span>
                  <span className="font-bold text-gray-800 mt-0.5 block">{machine.clampingForce || 0} T</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-2">
              <button
                onClick={() => setView('status')}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/25 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
              >
                <Activity size={18} />
                Update Status & Setup
              </button>

              {activeWorkOrder && (
                <button
                  onClick={() => setView('report')}
                  className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
                >
                  <Wrench size={18} />
                  Complete Active Intervention
                </button>
              )}
            </div>
          </div>
        ) : view === 'status' ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Update Machine Status</h2>
              <button onClick={() => setView('details')} className="text-blue-600 text-xs font-bold hover:underline">
                Cancel
              </button>
            </div>

            {/* Setup inputs (Product & Mold) */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-xs space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Product Name / Item
                </label>
                {productsList.length > 0 ? (
                  <select
                    value={productInput}
                    onChange={(e) => setProductInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Select or Type Product...</option>
                    {productsList.map(p => (
                      <option key={p.id} value={p.item}>{p.item} {p.description ? '(' + p.description + ')' : ''}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. Cap 28mm Blue"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={productInput}
                    onChange={(e) => setProductInput(e.target.value)}
                  />
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Current Moule (Mold)
                </label>
                <input
                  type="text"
                  placeholder="e.g. M-2024-04"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={mouleInput}
                  onChange={(e) => setMouleInput(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Machine Condition
                </label>
                <select
                  value={conditionInput}
                  onChange={(e) => setConditionInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="Excellent">Excellent</option>
                  <option value="Good">Good</option>
                  <option value="Fair">Fair</option>
                  <option value="Poor">Poor</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              {/* Quantities Section */}
              <div className="pt-2 border-t border-gray-100 space-y-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  <Hash size={13} className="text-blue-600" />
                  <span>Production Quantities</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Produced (Total)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={qtyProducedInput}
                      onChange={(e) => setQtyProducedInput(e.target.value)}
                      className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-emerald-600 uppercase tracking-wider mb-1">
                      Good Qty
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={qtyGoodInput}
                      onChange={(e) => setQtyGoodInput(e.target.value)}
                      className="w-full px-2.5 py-2 bg-emerald-50/50 border border-emerald-200 rounded-xl text-xs font-mono font-bold text-emerald-800 outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-rose-600 uppercase tracking-wider mb-1">
                      Bad (Scrap)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={qtyBadInput}
                      onChange={(e) => setQtyBadInput(e.target.value)}
                      className="w-full px-2.5 py-2 bg-rose-50/50 border border-rose-200 rounded-xl text-xs font-mono font-bold text-rose-800 outline-none focus:ring-2 focus:ring-rose-500/20"
                    />
                  </div>
                </div>

                {/* Non-blocking Qty Mismatch Warning */}
                {qtyProducedInput !== '' && (qtyGoodInput !== '' || qtyBadInput !== '') && 
                 (Number(qtyGoodInput || 0) + Number(qtyBadInput || 0) !== Number(qtyProducedInput)) && (
                  <div className="flex items-start gap-1.5 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-800 font-medium leading-tight">
                    <AlertTriangle size={12} className="text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Note: Good ({qtyGoodInput || 0}) + Bad ({qtyBadInput || 0}) = {Number(qtyGoodInput || 0) + Number(qtyBadInput || 0)} ≠ Total ({qtyProducedInput})
                    </span>
                  </div>
                )}
              </div>

              {/* Dedicated Save Setup & Quantities Button */}
              <button
                type="button"
                onClick={handleSaveSetup}
                disabled={updating}
                className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 text-xs"
              >
                {updating ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Save Product, Mold & Quantities
              </button>
            </div>

            {/* Separator */}
            <div className="flex items-center gap-2 my-2">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">or change status</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Status Selectors */}
            <div className="grid grid-cols-1 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setPendingStatus('operational');
                  handleStatusChange('operational');
                }}
                disabled={updating}
                className={cn(
                  "flex items-center p-3.5 rounded-2xl border-2 transition-all text-left",
                  machine.status === 'operational'
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800 font-bold"
                    : "border-gray-100 bg-white hover:border-emerald-200 text-gray-700"
                )}
              >
                <div className="p-2 rounded-xl mr-3 bg-emerald-100 text-emerald-600">
                  <CheckCircle2 size={22} />
                </div>
                <div className="flex-1">
                  <span className="block text-sm font-bold">Operational</span>
                  <span className="block text-[11px] text-gray-500">Machine is running in production</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPendingStatus('down')}
                disabled={updating}
                className={cn(
                  "flex items-center p-3.5 rounded-2xl border-2 transition-all text-left",
                  machine.status === 'down' || pendingStatus === 'down'
                    ? "border-rose-500 bg-rose-50 text-rose-800 font-bold"
                    : "border-gray-100 bg-white hover:border-rose-200 text-gray-700"
                )}
              >
                <div className="p-2 rounded-xl mr-3 bg-rose-100 text-rose-600">
                  <AlertCircle size={22} />
                </div>
                <div className="flex-1">
                  <span className="block text-sm font-bold">Down (Breakdown)</span>
                  <span className="block text-[11px] text-gray-500">Machine stopped due to malfunction</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPendingStatus('maintenance')}
                disabled={updating}
                className={cn(
                  "flex items-center p-3.5 rounded-2xl border-2 transition-all text-left",
                  machine.status === 'maintenance' || pendingStatus === 'maintenance'
                    ? "border-amber-500 bg-amber-50 text-amber-800 font-bold"
                    : "border-gray-100 bg-white hover:border-amber-200 text-gray-700"
                )}
              >
                <div className="p-2 rounded-xl mr-3 bg-amber-100 text-amber-600">
                  <Wrench size={22} />
                </div>
                <div className="flex-1">
                  <span className="block text-sm font-bold">Maintenance</span>
                  <span className="block text-[11px] text-gray-500">Scheduled or ongoing repair</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPendingStatus('idle');
                  handleStatusChange('idle');
                }}
                disabled={updating}
                className={cn(
                  "flex items-center p-3.5 rounded-2xl border-2 transition-all text-left",
                  machine.status === 'idle'
                    ? "border-purple-500 bg-purple-50 text-purple-800 font-bold"
                    : "border-gray-100 bg-white hover:border-purple-200 text-gray-700"
                )}
              >
                <div className="p-2 rounded-xl mr-3 bg-purple-100 text-purple-600">
                  <Clock size={22} />
                </div>
                <div className="flex-1">
                  <span className="block text-sm font-bold">Idle / Standby</span>
                  <span className="block text-[11px] text-gray-500">Turned off or awaiting mold/orders</span>
                </div>
              </button>
            </div>

            {/* Downtime Reason Box */}
            {(pendingStatus === 'down' || pendingStatus === 'maintenance') && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3">
                <label className="block text-[11px] font-bold text-rose-800 uppercase tracking-wider">
                  Reason for {pendingStatus} *
                </label>
                <textarea
                  placeholder="Describe the issue or reason for downtime..."
                  className="w-full px-3.5 py-2.5 bg-white border border-rose-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rose-500/20 resize-none min-h-[80px]"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleStatusChange(pendingStatus!)}
                  disabled={updating || !reasonInput.trim()}
                  className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md shadow-rose-500/20 transition-all active:scale-95 disabled:opacity-50 text-xs"
                >
                  {updating ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Confirm ' + pendingStatus + ' Status'}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Intervention Report Filing View */
          <form onSubmit={handleSubmitReport} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Intervention Report</h2>
              <button type="button" onClick={() => setView('details')} className="text-blue-600 text-xs font-bold hover:underline">
                Back
              </button>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-xs space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Technician Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Technician full name"
                  className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={techsName}
                  onChange={(e) => setTechsName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Intervention Time {calculatedTime && <span className="text-blue-600 ml-1.5 font-bold">(Calculated: {calculatedTime})</span>}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block text-[9px] text-gray-400 font-semibold mb-0.5">Start Time</span>
                    <input
                      type="datetime-local"
                      required
                      className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-medium"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <span className="block text-[9px] text-gray-400 font-semibold mb-0.5">End Time</span>
                    <input
                      type="datetime-local"
                      required
                      className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-medium"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Maintenance Type
                </label>
                <select
                  value={maintenanceType}
                  onChange={(e) => setMaintenanceType(e.target.value as 'corrective' | 'preventive')}
                  className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 font-bold"
                >
                  <option value="corrective">Corrective</option>
                  <option value="preventive">Preventive</option>
                </select>
              </div>

              {/* Categorized Failure Cause Selection */}
              <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl space-y-2">
                <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider">
                  Failure Cause Category
                </label>
                <select
                  value={failureCategory}
                  onChange={(e) => {
                    const newCat = e.target.value;
                    setFailureCategory(newCat);
                    const firstCause = FAILURE_CAUSE_CATEGORIES.find(c => c.id === newCat)?.causes[0]?.id || '';
                    setFailureCause(firstCause);
                  }}
                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg font-bold text-blue-900 outline-none text-xs"
                >
                  {FAILURE_CAUSE_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.labelFr} / {cat.labelEn}</option>
                  ))}
                </select>

                <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider mt-2">
                  Specific Failure Cause
                </label>
                <select
                  value={failureCause}
                  onChange={(e) => setFailureCause(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-gray-800 outline-none text-xs font-semibold"
                >
                  {selectedCategoryObj?.causes.map(cause => (
                    <option key={cause.id} value={cause.id}>{cause.labelFr} ({cause.labelEn})</option>
                  ))}
                </select>

                {failureCategory === 'other' && (
                  <input
                    type="text"
                    placeholder="Specify other cause details..."
                    className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-xs outline-none mt-1.5"
                    value={relatedCause}
                    onChange={(e) => setRelatedCause(e.target.value)}
                  />
                )}
              </div>

              {/* Actions Taken */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Actions Taken *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe repair actions performed..."
                  className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 resize-none text-xs"
                  value={actionsTaken}
                  onChange={(e) => setActionsTaken(e.target.value)}
                />
              </div>

              {/* Difficulties */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Difficulties Encountered (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. seized bolt, delayed part delivery..."
                  className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs"
                  value={difficulties}
                  onChange={(e) => setDifficulties(e.target.value)}
                />
              </div>

              {/* Spare Parts Used */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Spare Parts Used
                </label>
                {partsUsed.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg mb-1.5 text-xs">
                    <span className="font-semibold text-gray-700">{p.name} (x{p.quantity})</span>
                    <button
                      type="button"
                      onClick={() => setPartsUsed(partsUsed.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}

                <div className="flex gap-2 mt-2">
                  <select
                    value={selectedPartId}
                    onChange={(e) => setSelectedPartId(e.target.value)}
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none"
                  >
                    <option value="">Add a spare part...</option>
                    {spareParts.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    className="w-16 px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-center outline-none"
                    value={selectedPartQty}
                    onChange={(e) => setSelectedPartQty(parseInt(e.target.value) || 1)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const foundPart = spareParts.find(p => p.id === selectedPartId);
                      if (foundPart) {
                        setPartsUsed([...partsUsed, { partId: foundPart.id, name: foundPart.name, quantity: selectedPartQty }]);
                        setSelectedPartId('');
                        setSelectedPartQty(1);
                      }
                    }}
                    className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Resulting Machine Status */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Machine Status After Repair
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['operational', 'idle', 'down'] as const).map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFinalMachineStatus(st)}
                      className={cn(
                        "py-2 rounded-xl text-xs font-bold capitalize border transition-all",
                        finalMachineStatus === st
                          ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                          : "bg-gray-50 text-gray-700 border-gray-200"
                      )}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={updating}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/25 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {updating ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              Submit Intervention Report
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
