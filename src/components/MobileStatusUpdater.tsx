import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Machine } from '../types';
import { CheckCircle2, AlertCircle, Clock, Wrench, HardDrive, Loader2, Home } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
    machineId: string | null;
}

export default function MobileStatusUpdater({ machineId }: Props) {
    const [machine, setMachine] = useState<Machine | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);

    const [view, setView] = useState<'details' | 'status'>('details');

    useEffect(() => {
        if (!machineId) {
            setLoading(false);
            return;
        }

        const fetchMachine = async () => {
            try {
                const machines = await api.getMachines();
                const found = machines.find(m => m.id === machineId);
                if (found) setMachine(found);
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
        setUpdating(true);
        try {
            await api.updateMachine(machine.id, { status: newStatus });
            setMachine({ ...machine, status: newStatus });
            toast.success(`Status updated to ${newStatus}`);
            setView('details'); // Return to details view after updating
        } catch (error) {
            console.error(error);
            toast.error('Failed to update status');
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
                {machine.siteNumber && (
                    <div className="mt-4 inline-block bg-white/20 backdrop-blur px-4 py-1.5 rounded-full text-sm font-bold tracking-widest border border-white/30 relative z-10">
                        #{machine.siteNumber}
                    </div>
                )}
            </div>

            <div className="p-8 flex-1 flex flex-col bg-gray-50/50">
                {view === 'details' ? (
                    <div>
                        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Machine Information</h2>

                        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-6 space-y-4">
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

                        <button
                            onClick={() => setView('status')}
                            className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 transition-transform active:scale-95"
                        >
                            Change Status
                        </button>
                    </div>
                ) : (
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Update Status</h2>
                            <button onClick={() => setView('details')} className="text-blue-600 text-xs font-bold uppercase tracking-widest hover:underline">
                                Cancel
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <button
                                onClick={() => handleStatusChange('operational')}
                                disabled={updating || machine.status === 'operational'}
                                className={`flex items-center p-5 rounded-2xl border-2 transition-all w-full text-left ${machine.status === 'operational'
                                    ? 'border-green-500 bg-green-50 text-green-700 shadow-md shadow-green-100 font-bold'
                                    : 'border-transparent bg-white hover:bg-gray-50 hover:border-green-200 text-gray-700 shadow-sm'
                                    }`}
                            >
                                <div className={`p-3 rounded-full mr-4 ${machine.status === 'operational' ? 'bg-green-100' : 'bg-gray-100'}`}>
                                    <CheckCircle2 className={`w-8 h-8 ${machine.status === 'operational' ? 'text-green-600' : 'text-gray-400'}`} />
                                </div>
                                <div className="flex-1">
                                    <span className="block text-xl font-bold">Operational</span>
                                    <span className="block text-xs font-medium opacity-70 mt-1">Machine is running perfectly</span>
                                </div>
                            </button>

                            <button
                                onClick={() => handleStatusChange('down')}
                                disabled={updating || machine.status === 'down'}
                                className={`flex items-center p-5 rounded-2xl border-2 transition-all w-full text-left ${machine.status === 'down'
                                    ? 'border-red-500 bg-red-50 text-red-700 shadow-md shadow-red-100 font-bold'
                                    : 'border-transparent bg-white hover:bg-gray-50 hover:border-red-200 text-gray-700 shadow-sm'
                                    }`}
                            >
                                <div className={`p-3 rounded-full mr-4 ${machine.status === 'down' ? 'bg-red-100' : 'bg-gray-100'}`}>
                                    <AlertCircle className={`w-8 h-8 ${machine.status === 'down' ? 'text-red-600' : 'text-gray-400'}`} />
                                </div>
                                <div className="flex-1">
                                    <span className="block text-xl font-bold">Down</span>
                                    <span className="block text-xs font-medium opacity-70 mt-1">Machine has crashed or stopped</span>
                                </div>
                            </button>

                            <button
                                onClick={() => handleStatusChange('maintenance')}
                                disabled={updating || machine.status === 'maintenance'}
                                className={`flex items-center p-5 rounded-2xl border-2 transition-all w-full text-left ${machine.status === 'maintenance'
                                    ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-md shadow-amber-100 font-bold'
                                    : 'border-transparent bg-white hover:bg-gray-50 hover:border-amber-200 text-gray-700 shadow-sm'
                                    }`}
                            >
                                <div className={`p-3 rounded-full mr-4 ${machine.status === 'maintenance' ? 'bg-amber-100' : 'bg-gray-100'}`}>
                                    <Wrench className={`w-8 h-8 ${machine.status === 'maintenance' ? 'text-amber-600' : 'text-gray-400'}`} />
                                </div>
                                <div className="flex-1">
                                    <span className="block text-xl font-bold">Maintenance</span>
                                    <span className="block text-xs font-medium opacity-70 mt-1">Currently being repaired</span>
                                </div>
                            </button>

                            <button
                                onClick={() => handleStatusChange('idle')}
                                disabled={updating || machine.status === 'idle'}
                                className={`flex items-center p-5 rounded-2xl border-2 transition-all w-full text-left ${machine.status === 'idle'
                                    ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-md shadow-purple-100 font-bold'
                                    : 'border-transparent bg-white hover:bg-gray-50 hover:border-purple-200 text-gray-700 shadow-sm'
                                    }`}
                            >
                                <div className={`p-3 rounded-full mr-4 ${machine.status === 'idle' ? 'bg-purple-100' : 'bg-gray-100'}`}>
                                    <Clock className={`w-8 h-8 ${machine.status === 'idle' ? 'text-purple-600' : 'text-gray-400'}`} />
                                </div>
                                <div className="flex-1">
                                    <span className="block text-xl font-bold">Idle / Standby</span>
                                    <span className="block text-xs font-medium opacity-70 mt-1">Turned off or not scheduled</span>
                                </div>
                            </button>
                        </div>
                    </div>
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
