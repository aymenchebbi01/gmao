import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Machine, SparePart, InterventionPart } from '../types';
import { CheckCircle2, AlertCircle, Clock, Wrench, HardDrive, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

interface Props {
    machineId: string | null;
}

export default function MobileStatusUpdater({ machineId }: Props) {
    const { user } = useAuth();
    const [machine, setMachine] = useState<Machine | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const hasScanLogged = useRef(false);

    const [view, setView] = useState<'details' | 'status' | 'report'>('details');
    const [productInput, setProductInput] = useState('');
    const [mouleInput, setMouleInput] = useState('');
    const [reasonInput, setReasonInput] = useState('');
    const [pendingStatus, setPendingStatus] = useState<Machine['status'] | null>(null);

    // Active maintenance order tracking & report filing states
    const [activeWorkOrder, setActiveWorkOrder] = useState<any | null>(null);
    const [techsName, setTechsName] = useState(user?.displayName || user?.username || '');
    const [actionsTaken, setActionsTaken] = useState('');
    const [duration, setDuration] = useState(30);
    const [cause, setCause] = useState<'wear' | 'user' | 'product' | 'other'>('wear');
    const [finalMachineStatus, setFinalMachineStatus] = useState<'operational' | 'idle' | 'down'>('operational');

    // Spare parts state for mobile reports
    const [spareParts, setSpareParts] = useState<SparePart[]>([]);
    const [partsUsed, setPartsUsed] = useState<InterventionPart[]>([]);
    const [selectedPartId, setSelectedPartId] = useState('');
    const [selectedPartQty, setSelectedPartQty] = useState(1);

    useEffect(() => {
        if (!machineId) {
            setLoading(false);
            return;
        }

        const fetchMachine = async () => {
            try {
                const [machines, orders, allParts] = await Promise.all([
                    api.getMachines(),
                    api.getWorkOrders(),
                    api.getSpareParts()
                ]);
                const found = machines.find(m => m.id === machineId);
                if (found) {
                    setMachine(found);
                    setProductInput(found.injectingProduct || '');
                    setMouleInput(found.currentMoule || '');
                    setReasonInput(found.statusReason || '');
                    setPendingStatus(found.status);
                    setSpareParts(allParts || []);

                    // Find if there is an active work order (pending or in-progress) for this machine
                    const activeOrder = orders.find(o => o.machineId === machineId && (o.status === 'in-progress' || o.status === 'pending'));
                    if (activeOrder) {
                        setActiveWorkOrder(activeOrder);
                    }

                    // Log QR scan only once per page load
                    if (!hasScanLogged.current) {
                        hasScanLogged.current = true;
                        const userLabel = user?.displayName || user?.username || 'Unknown User';
                        try {
                            await api.logMachineAction(
                                'SCAN_QR',
                                found.id,
                                `User "${userLabel}" scanned QR code and accessed Machine '${found.name}'`
                            );
                        } catch (e) {
                            // Non-critical: don't block UI if audit log fails
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
    }, [machineId]);

    const handleStatusChange = async (newStatus: Machine['status']) => {
        if (!machine) return;
        const oldStatus = machine.status;
        setUpdating(true);
        try {
            const userLabel = user?.displayName || user?.username || 'Unknown User';
            // Log status change before updating
            if (oldStatus !== newStatus) {
                try {
                    await api.logMachineAction(
                        'CHANGE_STATUS',
                        machine.id,
                        `User "${userLabel}" changed status of Machine '${machine.name}' from '${oldStatus}' to '${newStatus}'`
                    );
                } catch (e) {
                    // Non-critical
                }
            }
            if ((newStatus === 'down' || newStatus === 'maintenance') && !reasonInput.trim()) {
                toast.error('Please provide a reason for this status change');
                return;
            }

            // Create a work order automatically if changing to maintenance
            if (newStatus === 'maintenance') {
                const woId = `WO-${Date.now()}`;
                const newWorkOrder = {
                    id: woId,
                    machineId: machine.id,
                    machineName: machine.name,
                    type: 'corrective' as const,
                    priority: 'high' as const,
                    status: 'in-progress' as const,
                    title: `Corrective Maintenance: ${reasonInput || machine.name}`,
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

            await api.updateMachine(machine.id, { 
                status: newStatus, 
                injectingProduct: productInput,
                currentMoule: mouleInput,
                statusReason: (newStatus === 'operational' || newStatus === 'idle') ? '' : reasonInput
            });
            setMachine({ 
                ...machine, 
                status: newStatus, 
                injectingProduct: productInput,
                currentMoule: mouleInput,
                statusReason: (newStatus === 'operational' || newStatus === 'idle') ? '' : reasonInput
            });
            toast.success(`Machine updated successfully`);
            if (newStatus === 'operational' || newStatus === 'idle') setReasonInput('');
            setView('details');
        } catch (error) {
            console.error(error);
            toast.error('Failed to update status');
        } finally {
            setUpdating(false);
        }
    };

    const handleSubmitReport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeWorkOrder || !machine) return;
        if (!techsName.trim()) {
            toast.error('Please enter the technician name');
            return;
        }
        if (!actionsTaken.trim()) {
            toast.error('Please describe actions taken');
            return;
        }
        setUpdating(true);
        try {
            const userLabel = user?.displayName || user?.username || 'Unknown User';
            const nowStr = new Date().toISOString();

            const intervention: any = {
                issuerName: activeWorkOrder.issuerName || userLabel,
                issuerSector: activeWorkOrder.issuerSector || 'Maintenance',
                requesterName: activeWorkOrder.requesterName || userLabel,
                requestDate: activeWorkOrder.requestDate || activeWorkOrder.createdAt,
                technicians: techsName,
                location: machine.location,
                malfunctionDescription: activeWorkOrder.description || machine.statusReason || '',
                operations: {
                    replacement: partsUsed.length > 0,
                    diagnostic: true,
                    improvement: false,
                    control: true
                },
                maintenanceType: 'corrective',
                failureCause: cause,
                relatedCause: '',
                interventionTime: `${duration} minutes`,
                actions: actionsTaken,
                difficulties: '',
                partsUsed: partsUsed,
                startTime: activeWorkOrder.createdAt,
                endTime: nowStr,
                durationMinutes: duration,
                comments: 'Completed via Mobile QR scanner',
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
                            stock: (partData.stock || 0) - part.quantity
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
                    `User "${userLabel}" completed maintenance for Machine '${machine.name}' via QR. Machine set to '${finalMachineStatus}'.`
                );
            } catch (e) {}

            toast.success('Intervention report filed & work order resolved!');
            
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
            <div className="min-h-[80vh] flex flex-col items-center justify-center">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                <p className="text-gray-500 font-medium">Loading Machine Data...</p>
            </div>
        );
    }

    if (!machine) {
        return (
            <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
                <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Machine Not Found</h1>
                <p className="text-gray-500">The QR code scanned relates to an invalid or deleted machine.</p>
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto bg-white min-h-[80vh] rounded-3xl shadow-xl overflow-hidden border border-gray-100 flex flex-col">
            <div className="bg-blue-600 p-8 text-white text-center relative overflow-hidden flex-shrink-0">
                <div className="absolute top-0 right-0 opacity-10 pointer-events-none">
                    <HardDrive className="w-48 h-48 -mr-10 -mt-10" />
                </div>
                <h1 className="text-3xl font-black mb-2 relative z-10">{machine.name}</h1>
                <p className="text-blue-100 uppercase tracking-widest text-sm font-bold opacity-80 relative z-10">SN: {machine.serialNumber}</p>
                {machine.injectingProduct && (
                    <div className="mt-4 inline-block bg-white/20 backdrop-blur px-4 py-1.5 rounded-full text-[11px] font-bold border border-white/30 relative z-10">
                        Product: {machine.injectingProduct}
                    </div>
                )}
                {machine.currentMoule && (
                    <div className="mt-4 ml-2 inline-block bg-white/20 backdrop-blur px-4 py-1.5 rounded-full text-[11px] font-bold border border-white/30 relative z-10">
                        Moule: {machine.currentMoule}
                    </div>
                )}
                {machine.siteNumber && (
                    <div className="mt-4 ml-2 inline-block bg-white/20 backdrop-blur px-4 py-1.5 rounded-full text-sm font-bold tracking-widest border border-white/30 relative z-10">
                        #{machine.siteNumber}
                    </div>
                )}
                {machine.statusReason && (machine.status === 'down' || machine.status === 'maintenance') && (
                    <div className="mt-4 px-4 py-2 bg-red-500/20 backdrop-blur rounded-xl text-[10px] font-medium border border-red-500/30 text-white relative z-10 w-full text-left italic">
                        Reason: {machine.statusReason}
                    </div>
                )}
            </div>

            <div className="p-8 flex-1 flex flex-col bg-gray-50/50">
                {view === 'details' ? (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Machine Information</h2>

                            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
                                <div>
                                    <span className="block text-xs font-bold text-gray-400 capitalize">Current Status</span>
                                    <div className="flex items-center mt-1">
                                        <span className={`inline-block w-3 h-3 rounded-full mr-2 ${machine.status === 'operational' ? 'bg-green-500' :
                                            machine.status === 'down' ? 'bg-red-500' :
                                                machine.status === 'maintenance' ? 'bg-amber-500' : 'bg-purple-500'
                                            }`} />
                                        <span className="font-bold text-gray-900 capitalize">{machine.status}</span>
                                    </div>
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-gray-400 capitalize">Location</span>
                                    <span className="font-semibold text-gray-900 mt-1 block">{machine.location}</span>
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-gray-400 capitalize">Condition</span>
                                    <span className="font-semibold text-gray-900 mt-1 block">{machine.condition}</span>
                                </div>
                            </div>
                        </div>

                        {activeWorkOrder && (
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm space-y-3">
                                <div className="flex items-center gap-2 text-amber-800">
                                    <Wrench className="w-5 h-5 animate-bounce" />
                                    <span className="text-xs font-bold uppercase tracking-wider">Active Work Order</span>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-950">{activeWorkOrder.title}</h3>
                                    <p className="text-xs text-gray-600 mt-1">{activeWorkOrder.description}</p>
                                </div>
                                <div className="text-[10px] text-gray-400">
                                    Opened: {new Date(activeWorkOrder.createdAt).toLocaleString()}
                                </div>
                                <button
                                    onClick={() => setView('report')}
                                    className="w-full mt-2 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-md shadow-amber-500/20 transition-transform active:scale-95 flex items-center justify-center gap-2 text-xs"
                                >
                                    🛠️ Fill Intervention Report
                                </button>
                            </div>
                        )}

                        <button
                            onClick={() => setView('status')}
                            className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 transition-transform active:scale-95"
                        >
                            Change Status
                        </button>
                    </div>
                ) : view === 'status' ? (
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Update Status & Product</h2>
                            <button onClick={() => setView('details')} className="text-blue-600 text-xs font-bold uppercase tracking-widest hover:underline">
                                Cancel
                            </button>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Current Product</label>
                                <input
                                    type="text"
                                    placeholder="Enter current product..."
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    value={productInput}
                                    onChange={(e) => setProductInput(e.target.value)}
                                />
                            </div>
                            
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Current Moule (Mold)</label>
                                <input
                                    type="text"
                                    placeholder="Enter mold name..."
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    value={mouleInput}
                                    onChange={(e) => setMouleInput(e.target.value)}
                                />
                            </div>

                            {(productInput !== (machine.injectingProduct || '') || mouleInput !== (machine.currentMoule || '')) && (
                                <button
                                    onClick={() => handleStatusChange(machine.status)}
                                    disabled={updating}
                                    className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/20"
                                >
                                    Save Setup Changes
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <button
                                onClick={() => {
                                    setPendingStatus('operational');
                                    handleStatusChange('operational');
                                }}
                                disabled={updating || machine.status === 'operational'}
                                className={`flex items-center p-5 rounded-2xl border-2 transition-all w-full text-left ${pendingStatus === 'operational'
                                    ? 'border-green-500 bg-green-50 text-green-700 shadow-md shadow-green-100 font-bold'
                                    : 'border-transparent bg-white hover:bg-gray-50 hover:border-green-200 text-gray-700 shadow-sm'
                                    }`}
                            >
                                <div className={`p-3 rounded-full mr-4 ${pendingStatus === 'operational' ? 'bg-green-100' : 'bg-gray-100'}`}>
                                    <CheckCircle2 className={`w-8 h-8 ${pendingStatus === 'operational' ? 'text-green-600' : 'text-gray-400'}`} />
                                </div>
                                <div className="flex-1">
                                    <span className="block text-xl font-bold">Operational</span>
                                    <span className="block text-xs font-medium opacity-70 mt-1">Machine is running perfectly</span>
                                </div>
                            </button>

                            <button
                                onClick={() => setPendingStatus('down')}
                                disabled={updating || machine.status === 'down'}
                                className={`flex items-center p-5 rounded-2xl border-2 transition-all w-full text-left ${pendingStatus === 'down'
                                    ? 'border-red-500 bg-red-50 text-red-700 shadow-md shadow-red-100 font-bold'
                                    : 'border-transparent bg-white hover:bg-gray-50 hover:border-red-200 text-gray-700 shadow-sm'
                                    }`}
                            >
                                <div className={`p-3 rounded-full mr-4 ${pendingStatus === 'down' ? 'bg-red-100' : 'bg-gray-100'}`}>
                                    <AlertCircle className={`w-8 h-8 ${pendingStatus === 'down' ? 'text-red-600' : 'text-gray-400'}`} />
                                </div>
                                <div className="flex-1">
                                    <span className="block text-xl font-bold">Down</span>
                                    <span className="block text-xs font-medium opacity-70 mt-1">Machine has crashed or stopped</span>
                                </div>
                            </button>

                            <button
                                onClick={() => setPendingStatus('maintenance')}
                                disabled={updating || machine.status === 'maintenance'}
                                className={`flex items-center p-5 rounded-2xl border-2 transition-all w-full text-left ${pendingStatus === 'maintenance'
                                    ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-md shadow-amber-100 font-bold'
                                    : 'border-transparent bg-white hover:bg-gray-50 hover:border-amber-200 text-gray-700 shadow-sm'
                                    }`}
                            >
                                <div className={`p-3 rounded-full mr-4 ${pendingStatus === 'maintenance' ? 'bg-amber-100' : 'bg-gray-100'}`}>
                                    <Wrench className={`w-8 h-8 ${pendingStatus === 'maintenance' ? 'text-amber-600' : 'text-gray-400'}`} />
                                </div>
                                <div className="flex-1">
                                    <span className="block text-xl font-bold">Maintenance</span>
                                    <span className="block text-xs font-medium opacity-70 mt-1">Currently being repaired</span>
                                </div>
                            </button>

                            <button
                                onClick={() => {
                                    setPendingStatus('idle');
                                    handleStatusChange('idle');
                                }}
                                disabled={updating || machine.status === 'idle'}
                                className={`flex items-center p-5 rounded-2xl border-2 transition-all w-full text-left ${pendingStatus === 'idle'
                                    ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-md shadow-purple-100 font-bold'
                                    : 'border-transparent bg-white hover:bg-gray-50 hover:border-purple-200 text-gray-700 shadow-sm'
                                    }`}
                            >
                                <div className={`p-3 rounded-full mr-4 ${pendingStatus === 'idle' ? 'bg-purple-100' : 'bg-gray-100'}`}>
                                    <Clock className={`w-8 h-8 ${pendingStatus === 'idle' ? 'text-purple-600' : 'text-gray-400'}`} />
                                </div>
                                <div className="flex-1">
                                    <span className="block text-xl font-bold">Idle / Standby</span>
                                    <span className="block text-xs font-medium opacity-70 mt-1">Turned off or not scheduled</span>
                                </div>
                            </button>
                        </div>

                        {(pendingStatus === 'down' || pendingStatus === 'maintenance') && (
                            <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                                    <label className="block text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2 ml-1">Reason for {pendingStatus} Status</label>
                                    <textarea
                                        placeholder="Explain why the machine is being stopped..."
                                        className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all resize-none min-h-[100px]"
                                        value={reasonInput}
                                        onChange={(e) => setReasonInput(e.target.value)}
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => handleStatusChange(pendingStatus!)}
                                        disabled={updating || !reasonInput.trim()}
                                        className="w-full mt-4 py-4 bg-amber-600 text-white font-bold rounded-xl shadow-lg shadow-amber-500/30 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        Confirm {pendingStatus} Status
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <form onSubmit={handleSubmitReport} className="space-y-5">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Intervention Report</h2>
                            <button type="button" onClick={() => setView('details')} className="text-blue-600 text-xs font-bold uppercase tracking-widest hover:underline">
                                Back
                            </button>
                        </div>

                        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Technician Name</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Enter technician name..."
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    value={techsName}
                                    onChange={(e) => setTechsName(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Duration (minutes)</label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    value={duration}
                                    onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Root Failure Cause</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['wear', 'user', 'product', 'other'] as const).map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setCause(c)}
                                            className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                                                cause === c
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold'
                                                    : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600'
                                            }`}
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Actions Taken</label>
                                <textarea
                                    required
                                    placeholder="Describe actions taken to repair..."
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none min-h-[100px]"
                                    value={actionsTaken}
                                    onChange={(e) => setActionsTaken(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Next Machine Status</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['operational', 'idle', 'down'] as const).map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setFinalMachineStatus(s)}
                                            className={`py-2.5 px-2 rounded-xl border text-xs font-bold capitalize transition-all ${
                                                finalMachineStatus === s
                                                    ? s === 'operational'
                                                        ? 'border-green-500 bg-green-50 text-green-700 shadow-sm shadow-green-100 font-bold'
                                                        : s === 'idle'
                                                        ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm shadow-purple-100 font-bold'
                                                        : 'border-red-500 bg-red-50 text-red-700 shadow-sm shadow-red-100 font-bold'
                                                    : 'border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 text-gray-600'
                                            }`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Spare Parts Used Input Section */}
                            <div className="border-t border-gray-100 pt-4 space-y-3">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Spare Parts Used</label>
                                
                                {partsUsed.length > 0 && (
                                    <div className="space-y-2">
                                        {partsUsed.map((p, idx) => (
                                            <div key={idx} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 text-xs font-semibold text-blue-900">
                                                <div className="flex flex-col">
                                                    <span>{p.name}</span>
                                                    <span className="text-[10px] text-gray-400 font-medium">Qty: {p.quantity}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setPartsUsed(prev => prev.filter((_, i) => i !== idx))}
                                                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <select
                                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                            value={selectedPartId}
                                            onChange={(e) => setSelectedPartId(e.target.value)}
                                        >
                                            <option value="">-- Add spare part --</option>
                                            {spareParts.map(sp => (
                                                <option key={sp.id} value={sp.id} disabled={sp.stock <= 0}>
                                                    {sp.name} - Stock: {sp.stock} {sp.unit}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="w-16">
                                        <input
                                            type="number"
                                            min="1"
                                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-center font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                            value={selectedPartQty}
                                            onChange={(e) => setSelectedPartQty(Math.max(1, parseInt(e.target.value) || 1))}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!selectedPartId) return;
                                            const part = spareParts.find(sp => sp.id === selectedPartId);
                                            if (!part) return;
                                            
                                            if (partsUsed.some(p => p.partId === selectedPartId)) {
                                                toast.error('This part has already been added');
                                                return;
                                            }

                                            if (selectedPartQty > part.stock) {
                                                toast.error(`Only ${part.stock} ${part.unit} available in stock!`);
                                                return;
                                            }

                                            setPartsUsed(prev => [...prev, {
                                                partId: part.id,
                                                name: part.name,
                                                quantity: selectedPartQty
                                            }]);
                                            setSelectedPartId('');
                                            setSelectedPartQty(1);
                                        }}
                                        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={updating}
                            className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 transition-transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {updating ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Submitting Report...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-5 h-5" />
                                    Submit Report & Resolve
                                </>
                            )}
                        </button>
                    </form>
                )}
            </div>

            <div className="p-4 bg-gray-100 border-t border-gray-200 flex justify-center">
                <button
                    onClick={() => {
                        window.close();
                        window.location.href = "about:blank";
                    }}
                    className="flex items-center text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                >
                    Close Page
                </button>
            </div>
        </div>
    );
}
