import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { SparePart } from '../types';
import { Package, AlertCircle, Loader2, Save, ArrowUp, ArrowDown, History, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

interface Props {
    partId: string | null;
}

export default function MobileStockUpdater({ partId }: Props) {
    const { user } = useAuth();
    const [part, setPart] = useState<SparePart | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const hasScanLogged = useRef(false);

    const [stockInput, setStockInput] = useState<number>(0);
    const [adjustment, setAdjustment] = useState<number>(0);

    useEffect(() => {
        if (!partId) {
            setLoading(false);
            return;
        }

        const fetchPart = async () => {
            try {
                const parts = await api.getSpareParts();
                const found = parts.find(p => p.id === partId);
                if (found) {
                    setPart(found);
                    setStockInput(found.stock);

                    // Log QR scan only once per page load
                    if (!hasScanLogged.current) {
                        hasScanLogged.current = true;
                        const userLabel = user?.displayName || user?.username || 'Unknown User';
                        try {
                            await api.logSparePartAction(
                                'SCAN_QR',
                                found.id,
                                `User "${userLabel}" scanned QR code and accessed Spare Part '${found.name}'`
                            );
                        } catch (e) {
                            // Non-critical
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to fetch part:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchPart();
    }, [partId, user]);

    const handleUpdateStock = async (newTotal: number) => {
        if (!part) return;
        const oldStock = part.stock;
        setUpdating(true);
        try {
            const userLabel = user?.displayName || user?.username || 'Unknown User';
            await api.logSparePartAction(
                'UPDATE_STOCK',
                part.id,
                `User "${userLabel}" updated stock of '${part.name}' from ${oldStock} to ${newTotal}`
            );
            await api.updateSparePart(part.id, {
                ...part,
                stock: newTotal,
                updatedAt: new Date().toISOString()
            });
            setPart({ ...part, stock: newTotal });
            setStockInput(newTotal);
            setAdjustment(0);
            toast.success(`Stock updated to ${newTotal} ${part.unit}`);
        } catch (error) {
            console.error(error);
            toast.error('Failed to update stock');
        } finally {
            setUpdating(false);
        }
    };

    const applyAdjustment = () => {
        handleUpdateStock(part!.stock + adjustment);
    };

    if (loading) {
        return (
            <div className="min-h-[80vh] flex flex-col items-center justify-center">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                <p className="text-gray-500 font-medium">Loading Part Data...</p>
            </div>
        );
    }

    if (!part) {
        return (
            <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
                <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Part Not Found</h1>
                <p className="text-gray-500">The QR code scanned relates to an invalid or deleted spare part.</p>
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto bg-white min-h-[80vh] rounded-3xl shadow-xl overflow-hidden border border-gray-100 flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-8 text-white text-center relative overflow-hidden flex-shrink-0">
                <div className="absolute top-0 right-0 opacity-10 pointer-events-none">
                    <Package className="w-48 h-48 -mr-10 -mt-10" />
                </div>
                <h1 className="text-3xl font-black mb-2 relative z-10">{part.name}</h1>
                <p className="text-blue-100 uppercase tracking-widest text-sm font-bold opacity-80 relative z-10">Ref: {part.sku}</p>
                <div className="mt-4 inline-block bg-white/20 backdrop-blur px-4 py-1.5 rounded-full text-sm font-bold border border-white/30 relative z-10">
                    Location: {part.location || 'N/A'}
                </div>
            </div>

            <div className="p-8 flex-1 flex flex-col bg-gray-50/50">
                {/* Current Stock Card */}
                <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm mb-8 text-center">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Current Inventory</p>
                    <div className="flex items-center justify-center gap-2">
                        <span className={cn(
                            "text-5xl font-black tabular-nums",
                            part.stock <= part.minStock ? "text-red-600" : "text-gray-900"
                        )}>
                            {part.stock}
                        </span>
                        <span className="text-xl font-bold text-gray-400 self-end mb-2">{part.unit}</span>
                    </div>
                    {part.stock <= part.minStock && (
                        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-red-50 text-red-600 rounded-full text-xs font-bold border border-red-100">
                            <AlertCircle size={14} />
                            LOW STOCK ALERT
                        </div>
                    )}
                </div>

                {/* Quick Adjustments */}
                <div className="space-y-6">
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Update Quantity</h2>

                    <div className="flex items-center justify-center gap-4">
                        <button
                            onClick={() => setAdjustment(prev => prev - 1)}
                            className="w-16 h-16 flex items-center justify-center bg-white border border-gray-200 rounded-2xl shadow-sm active:scale-95 transition-all text-gray-600"
                        >
                            <ArrowDown size={24} />
                        </button>

                        <div className="flex-1 text-center py-4 bg-white border border-gray-100 rounded-2xl shadow-inner">
                            <span className={cn(
                                "text-3xl font-bold",
                                adjustment > 0 ? "text-emerald-600" : adjustment < 0 ? "text-red-600" : "text-gray-400"
                            )}>
                                {adjustment > 0 ? `+${adjustment}` : adjustment}
                            </span>
                        </div>

                        <button
                            onClick={() => setAdjustment(prev => prev + 1)}
                            className="w-16 h-16 flex items-center justify-center bg-white border border-gray-200 rounded-2xl shadow-sm active:scale-95 transition-all text-gray-600"
                        >
                            <ArrowUp size={24} />
                        </button>
                    </div>

                    {adjustment !== 0 && (
                        <button
                            onClick={applyAdjustment}
                            disabled={updating}
                            className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            {updating ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                            Apply Adjustment ({adjustment > 0 ? `+${adjustment}` : adjustment})
                        </button>
                    )}

                    <div className="relative pt-4">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-gray-200"></div>
                        </div>
                        <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold">
                            <span className="bg-gray-50/50 px-2 text-gray-400">OR SET EXACT</span>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <input
                            type="number"
                            className="flex-1 px-4 py-4 bg-white border border-gray-200 rounded-2xl text-lg font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all text-center"
                            value={stockInput}
                            onChange={(e) => setStockInput(parseInt(e.target.value) || 0)}
                        />
                        {stockInput !== part.stock && (
                            <button
                                onClick={() => handleUpdateStock(stockInput)}
                                disabled={updating}
                                className="px-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold active:scale-95 transition-all shadow-lg shadow-indigo-500/20"
                            >
                                Set
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-6 bg-gray-100 border-t border-gray-200 flex justify-center gap-6">
                <button
                    onClick={() => {
                        window.close();
                        window.location.href = "about:blank";
                    }}
                    className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                >
                    <X size={16} />
                    Close
                </button>
            </div>
        </div>
    );
}
