import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Package, Search, Trash2, Edit2, RefreshCw, Calendar,
    CheckCircle, XCircle, Clock, AlertCircle, ShieldAlert, Plus, Bell, AlertTriangle,
    ChevronLeft, FileText, ChevronDown, ChevronUp
} from 'lucide-react';
import { productionPlanningService, productionOrderService, generateId } from '../../services/productionApi';
import { ProductionPlanning as Planning, ProductionOrder as Order } from '../../types';
import TableFooter from '../common/TableFooter';
import { useAuth } from '../../contexts/AuthContext';

export default function ProductionPlanningView() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [loading, setLoading] = useState(false);
    const [planning, setPlanning] = useState<Planning[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [deliveryStatusFilter, setDeliveryStatusFilter] = useState('');
    const [weekFilter, setWeekFilter] = useState('');

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(13);
    const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

    // Add modal state
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [addFormData, setAddFormData] = useState({
        set_number: '',
        description: '',
        quantity: '0',
        week: '',
        total_amount: '',
        total_number_in_box: '',
        total_number_of_pallets: ''
    });

    // Edit modal state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedPlanning, setSelectedPlanning] = useState<Planning | null>(null);
    const [editFormData, setEditFormData] = useState({
        set_number: '',
        description: '',
        quantity: '',
        week: '',
        total_amount: '',
        total_number_in_box: '',
        total_number_of_pallets: ''
    });

    // Order number input states
    const [addOrderNumbers, setAddOrderNumbers] = useState<string[]>([]);
    const [editOrderNumbers, setEditOrderNumbers] = useState<string[]>([]);
    const [addOrderNumberInput, setAddOrderNumberInput] = useState('');
    const [editOrderNumberInput, setEditOrderNumberInput] = useState('');

    // Alert banner expand/collapse state
    const [isAlertsExpanded, setIsAlertsExpanded] = useState(false);

    const uniqueWeeks = React.useMemo(() => {
        const weeks = planning
            .map(p => p.week)
            .filter((w): w is string => !!w && w.trim() !== '');
        return Array.from(new Set(weeks)).sort();
    }, [planning]);

    const getOrderQty = (orderNum: string, setNum: string) => {
        const order = orders.find(o => 
            o.order_number.toLowerCase().trim() === orderNum.toLowerCase().trim() && 
            o.set_number.toLowerCase().trim() === setNum.toLowerCase().trim()
        );
        return order ? order.quantity_expected : null;
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await productionPlanningService.getPlanning();
            setPlanning(data);
            try {
                const ordersData = await productionOrderService.getOrders();
                setOrders(ordersData);
            } catch (err) {
                console.error("Failed to load orders in PlanningView:", err);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const getAggregatedDeliveryStatus = (setNumber: string, orderNumbersStr?: string): 'yes' | 'no' | 'eliminated' | 'late' | 'in progress' | 'not ordered' => {
        const targetSet = setNumber.toLowerCase().trim();
        const linkedOrderNumbers = orderNumbersStr 
            ? orderNumbersStr.split(',').map(s => s.toLowerCase().trim()).filter(Boolean)
            : [];

        // Find matching orders
        let matchingOrders = orders.filter(o => o.set_number.toLowerCase().trim() === targetSet);

        // If specific order numbers are defined, restrict to those specific orders
        if (linkedOrderNumbers.length > 0) {
            matchingOrders = matchingOrders.filter(o => linkedOrderNumbers.includes(o.order_number.toLowerCase().trim()));
        }

        if (matchingOrders.length === 0) {
            return 'not ordered';
        }

        const statuses = matchingOrders.map(o => o.is_delivered);

        if (statuses.includes('no')) {
            return 'no';
        } else if (statuses.includes('late')) {
            return 'late';
        } else if (statuses.includes('in progress')) {
            return 'in progress';
        } else if (statuses.includes('yes')) {
            return 'yes';
        } else if (statuses.includes('eliminated')) {
            return 'eliminated';
        }

        return 'in progress';
    };

    const getDeliveryStatusBadge = (setNumber: string, orderNumbersStr?: string) => {
        const status = getAggregatedDeliveryStatus(setNumber, orderNumbersStr);

        if (status === 'not ordered') {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-slate-50 text-slate-500 border-slate-200">
                    <Clock className="w-3.5 h-3.5" />
                    Not Ordered
                </span>
            );
        }

        const badges = {
            'yes': { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle, label: 'Delivered' },
            'no': { bg: 'bg-red-50 text-red-700 border-red-200', icon: XCircle, label: 'Not Delivered' },
            'eliminated': { bg: 'bg-slate-100 text-slate-700 border-slate-200', icon: ShieldAlert, label: 'Canceled' },
            'late': { bg: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertCircle, label: 'Rescheduled' },
            'in progress': { bg: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock, label: 'In Progress' }
        };

        const config = badges[status] || badges['in progress'];
        const Icon = config.icon;

        return (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.bg}`}>
                <Icon className="w-3.5 h-3.5" />
                {config.label}
            </span>
        );
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Reset page to 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, deliveryStatusFilter, weekFilter]);

    const handleEditClick = (item: Planning) => {
        setSelectedPlanning(item);
        setEditFormData({
            set_number: item.set_number,
            description: item.description || '',
            quantity: String(item.quantity),
            week: item.week || '',
            total_amount: item.total_amount != null ? String(item.total_amount) : '',
            total_number_in_box: item.total_number_in_box != null ? String(item.total_number_in_box) : '',
            total_number_of_pallets: item.total_number_of_pallets != null ? String(item.total_number_of_pallets) : ''
        });
        setEditOrderNumbers(item.order_numbers ? item.order_numbers.split(',').map(s => s.trim()).filter(Boolean) : []);
        setEditOrderNumberInput('');
        setIsEditModalOpen(true);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPlanning) return;

        try {
            const updates: Partial<Planning> = {
                set_number: editFormData.set_number,
                description: editFormData.description,
                quantity: parseInt(editFormData.quantity || '0', 10) || 0,
                week: editFormData.week || '',
                total_amount: editFormData.total_amount !== '' ? parseFloat(editFormData.total_amount) || undefined : undefined,
                total_number_in_box: editFormData.total_number_in_box !== '' ? parseInt(editFormData.total_number_in_box, 10) || undefined : undefined,
                total_number_of_pallets: editFormData.total_number_of_pallets !== '' ? parseInt(editFormData.total_number_of_pallets, 10) || undefined : undefined,
                order_numbers: editOrderNumbers.join(', ')
            };

            await productionPlanningService.updatePlanning(selectedPlanning.id, updates);
            setIsEditModalOpen(false);
            setEditOrderNumbers([]);
            setEditOrderNumberInput('');
            fetchData();
        } catch (err) {
            console.error(err);
            alert("Failed to update planning record.");
        }
    };

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const newPlan: Planning = {
                id: generateId(),
                set_number: addFormData.set_number.trim(),
                description: addFormData.description.trim(),
                quantity: parseInt(addFormData.quantity || '0', 10) || 0,
                week: addFormData.week.trim(),
                total_amount: addFormData.total_amount !== '' ? parseFloat(addFormData.total_amount) || undefined : undefined,
                total_number_in_box: addFormData.total_number_in_box !== '' ? parseInt(addFormData.total_number_in_box, 10) || undefined : undefined,
                total_number_of_pallets: addFormData.total_number_of_pallets !== '' ? parseInt(addFormData.total_number_of_pallets, 10) || undefined : undefined,
                order_numbers: addOrderNumbers.join(', ')
            };
            await productionPlanningService.addPlanning(newPlan);
            setIsAddModalOpen(false);
            setAddFormData({
                set_number: '',
                description: '',
                quantity: '0',
                week: '',
                total_amount: '',
                total_number_in_box: '',
                total_number_of_pallets: ''
            });
            setAddOrderNumbers([]);
            setAddOrderNumberInput('');
            fetchData();
        } catch (err) {
            console.error(err);
            alert("Failed to add planning record manually.");
        }
    };

    const handleDeleteAll = async () => {
        try {
            await productionPlanningService.clearAllPlanning();
            setConfirmDeleteAll(false);
            fetchData();
        } catch (err) {
            console.error("Failed to delete all planning:", err);
            alert("Failed to clear all planning.");
        }
    };

    const handleDeleteClick = async (id: string) => {
        if (confirm("Are you sure you want to delete this planning record?")) {
            try {
                await productionPlanningService.deletePlanning(id);
                fetchData();
            } catch (err) {
                console.error(err);
            }
        }
    };

    // Filter logic
    const filteredPlanning = planning.filter(item => {
        const matchesSearch =
            item.set_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.week || '').toLowerCase().includes(searchTerm.toLowerCase());

        const deliveryStatus = getAggregatedDeliveryStatus(item.set_number, item.order_numbers);
        const matchesDeliveryStatus = !deliveryStatusFilter || deliveryStatus === deliveryStatusFilter;

        const matchesWeek = !weekFilter || item.week === weekFilter;

        return matchesSearch && matchesDeliveryStatus && matchesWeek;
    });

    const paginatedPlanning = filteredPlanning.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // Calculate missing plans
    const missingPlansSummary = React.useMemo(() => {
        const todayTime = new Date();
        todayTime.setHours(0, 0, 0, 0);
        const fiveDaysFromNow = todayTime.getTime() + 5 * 24 * 60 * 60 * 1000;

        const missing = orders.filter(order => {
            if (order.is_delivered !== 'in progress') return false;
            if (!order.expected_delivery_date) return false;

            const planExists = planning.some(p => p.set_number.toLowerCase().trim() === order.set_number.toLowerCase().trim());
            if (planExists) return false;

            const expected = new Date(order.expected_delivery_date);
            expected.setHours(0, 0, 0, 0);
            const expectedTime = expected.getTime();

            return expectedTime >= todayTime.getTime() && expectedTime <= fiveDaysFromNow;
        });

        const summaryMap: { [set: string]: { set_number: string; quantity: number; earliestDate: string; week?: string; order_numbers: string[] } } = {};
        for (const order of missing) {
            const setKey = order.set_number.trim().toLowerCase();
            if (!summaryMap[setKey]) {
                summaryMap[setKey] = {
                    set_number: order.set_number,
                    quantity: 0,
                    earliestDate: order.expected_delivery_date,
                    week: order.week,
                    order_numbers: []
                };
            }
            summaryMap[setKey].quantity += order.quantity_expected;
            if (!summaryMap[setKey].order_numbers.includes(order.order_number)) {
                summaryMap[setKey].order_numbers.push(order.order_number);
            }
            if (new Date(order.expected_delivery_date) < new Date(summaryMap[setKey].earliestDate)) {
                summaryMap[setKey].earliestDate = order.expected_delivery_date;
                summaryMap[setKey].week = order.week;
            }
        }
        return Object.values(summaryMap);
    }, [orders, planning]);

    const handleCreatePlanFromAlert = (setNumber: string, quantity: number, week?: string, orderNumbers?: string[]) => {
        setAddFormData({
            set_number: setNumber,
            description: `Plan for set ${setNumber}`,
            quantity: String(quantity),
            week: week || '',
            total_amount: '',
            total_number_in_box: '',
            total_number_of_pallets: ''
        });
        setAddOrderNumbers(orderNumbers || []);
        setAddOrderNumberInput('');
        setIsAddModalOpen(true);
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden font-sans">
            <div className="p-6 lg:p-8 flex flex-col h-full overflow-hidden">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
                    <div>
                        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
                            {isEditModalOpen && selectedPlanning
                                ? 'Edit Production Plan'
                                : isAddModalOpen
                                    ? 'Create Production Plan'
                                    : 'Planning Consultation'}
                        </h2>
                    </div>
                    {!isEditModalOpen && !isAddModalOpen && (
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">
                                {filteredPlanning.length} records
                            </span>
                            {isAdmin && (!confirmDeleteAll ? (
                                <button
                                    onClick={() => setConfirmDeleteAll(true)}
                                    disabled={planning.length === 0}
                                    className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg px-3 py-1.5 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Delete all planning (Admin only)"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete All
                                </button>
                            ) : (
                                <div className="flex items-center gap-2 bg-red-50 border border-red-200 p-1 rounded-lg">
                                    <span className="text-xs text-red-700 font-bold px-1.5">Delete all?</span>
                                    <button
                                        onClick={handleDeleteAll}
                                        className="bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded hover:bg-red-700 transition-all shadow-xs"
                                    >
                                        Yes
                                    </button>
                                    <button
                                        onClick={() => setConfirmDeleteAll(false)}
                                        className="text-xs text-slate-500 hover:text-slate-700 px-1.5"
                                    >
                                        No
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 border border-blue-500 rounded-lg px-3 py-1.5 transition-colors shadow-sm"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Add Plan
                            </button>
                        </div>
                    )}
                </div>

                {/* Main panel */}
                <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
                    <AnimatePresence mode="wait">
                        {isEditModalOpen && selectedPlanning ? (
                            <motion.div
                                key="edit-form"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                                className="flex-1 flex flex-col overflow-hidden"
                            >
                                {/* Back bar */}
                                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                                    <div className="flex items-center gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setIsEditModalOpen(false)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                                        >
                                            <ChevronLeft className="w-3.5 h-3.5" />
                                            Back to Planning
                                        </button>
                                        <div className="h-6 w-px bg-slate-200 hidden sm:block" />
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Modify Record</span>
                                            <h3 className="text-sm font-extrabold text-slate-800">
                                                Updating Production Plan for {selectedPlanning.set_number}
                                            </h3>
                                        </div>
                                    </div>
                                </div>

                                {/* Scrollable Form Content */}
                                <form onSubmit={handleEditSubmit} className="flex-1 flex flex-col overflow-hidden">
                                    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
                                        <div className="max-w-4xl mx-auto bg-slate-50/40 border border-slate-150 rounded-2xl p-6 lg:p-8 flex flex-col gap-6">
                                            <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
                                                <div className="p-1.5 bg-indigo-50 text-indigo-650 rounded-lg">
                                                    <Edit2 className="w-4 h-4" />
                                                </div>
                                                <h4 className="text-sm font-bold text-slate-800">Plan Details & Metric Updates</h4>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="flex flex-col gap-4">
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Set Number *</label>
                                                        <input
                                                            type="text"
                                                            required
                                                            value={editFormData.set_number}
                                                            onChange={e => setEditFormData({ ...editFormData, set_number: e.target.value })}
                                                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition-all font-semibold"
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Week</label>
                                                            <input
                                                                type="text"
                                                                value={editFormData.week}
                                                                onChange={e => setEditFormData({ ...editFormData, week: e.target.value })}
                                                                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition-all"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Quantity *</label>
                                                            <input
                                                                type="number"
                                                                required
                                                                min="0"
                                                                value={editFormData.quantity}
                                                                onChange={e => setEditFormData({ ...editFormData, quantity: e.target.value })}
                                                                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition-all font-semibold"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Linked Order Numbers</label>
                                                        
                                                        <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px] items-center">
                                                            {editOrderNumbers.map((ordNum, idx) => {
                                                                const qty = getOrderQty(ordNum, editFormData.set_number);
                                                                return (
                                                                    <span 
                                                                        key={idx} 
                                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm"
                                                                    >
                                                                        {ordNum}{qty !== null ? ` (Qty: ${qty})` : ''}
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setEditOrderNumbers(editOrderNumbers.filter(n => n !== ordNum))}
                                                                            className="hover:text-indigo-900 transition-colors text-indigo-400 font-bold ml-1"
                                                                        >
                                                                            &times;
                                                                        </button>
                                                                    </span>
                                                                );
                                                            })}
                                                            {editOrderNumbers.length === 0 && (
                                                                <span className="text-xs text-slate-400 italic">No specific orders linked. Will match all orders for this set.</span>
                                                            )}
                                                        </div>

                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                placeholder="Type order number & press Enter"
                                                                value={editOrderNumberInput}
                                                                onChange={e => setEditOrderNumberInput(e.target.value)}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        const trimmed = editOrderNumberInput.trim();
                                                                        if (trimmed && !editOrderNumbers.includes(trimmed)) {
                                                                            setEditOrderNumbers([...editOrderNumbers, trimmed]);
                                                                            setEditOrderNumberInput('');
                                                                        }
                                                                    }
                                                                }}
                                                                className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition-all"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const trimmed = editOrderNumberInput.trim();
                                                                    if (trimmed && !editOrderNumbers.includes(trimmed)) {
                                                                        setEditOrderNumbers([...editOrderNumbers, trimmed]);
                                                                        setEditOrderNumberInput('');
                                                                    }
                                                                }}
                                                                className="px-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center transition-colors"
                                                            >
                                                                <Plus className="w-4 h-4" />
                                                            </button>
                                                        </div>

                                                        {editFormData.set_number.trim() && (
                                                            (() => {
                                                                const setLower = editFormData.set_number.trim().toLowerCase();
                                                                const suggestions = (Array.from(new Set(
                                                                    orders
                                                                        .filter(o => o.set_number.toLowerCase().trim() === setLower)
                                                                        .map(o => o.order_number.trim())
                                                                )) as string[]).filter(num => !editOrderNumbers.includes(num));

                                                                if (suggestions.length === 0) return null;

                                                                return (
                                                                    <div className="mt-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                                                                            Suggested Order Numbers:
                                                                        </span>
                                                                        <div className="flex flex-wrap gap-1.5">
                                                                            {suggestions.map((sug, idx) => {
                                                                                const qty = getOrderQty(sug, editFormData.set_number);
                                                                                return (
                                                                                    <button
                                                                                        key={idx}
                                                                                        type="button"
                                                                                        onClick={() => setEditOrderNumbers([...editOrderNumbers, sug])}
                                                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border border-dashed border-slate-300 text-slate-500 hover:text-indigo-650 hover:border-indigo-350 hover:bg-indigo-50/50 transition-all active:scale-95 bg-white"
                                                                                    >
                                                                                        {sug}{qty !== null ? ` (Qty: ${qty})` : ''}
                                                                                        <Plus className="w-2.5 h-2.5 text-indigo-500" />
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()
                                                        )}
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                                                        <textarea
                                                            value={editFormData.description}
                                                            onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
                                                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition-all resize-none min-h-[120px]"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-4 bg-slate-50/50 p-5 rounded-xl border border-slate-100 justify-center">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <FileText className="w-4 h-4 text-indigo-500" />
                                                        <span className="text-xs font-bold text-slate-700">Optional Planning Metrics</span>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Total Amount (€)</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={editFormData.total_amount}
                                                            onChange={e => setEditFormData({ ...editFormData, total_amount: e.target.value })}
                                                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition-all"
                                                            placeholder="e.g. 12500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nb in Box</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={editFormData.total_number_in_box}
                                                            onChange={e => setEditFormData({ ...editFormData, total_number_in_box: e.target.value })}
                                                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition-all"
                                                            placeholder="e.g. 50"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nb Pallets</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={editFormData.total_number_of_pallets}
                                                            onChange={e => setEditFormData({ ...editFormData, total_number_of_pallets: e.target.value })}
                                                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition-all"
                                                            placeholder="e.g. 4"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer controls inside card */}
                                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex gap-3 justify-end shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setIsEditModalOpen(false)}
                                            className="px-6 py-2.5 text-sm font-bold text-slate-650 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-sm transition-colors"
                                        >
                                            Save Changes
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        ) : isAddModalOpen ? (
                            <motion.div
                                key="add-form"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                                className="flex-1 flex flex-col overflow-hidden"
                            >
                                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                                    <div className="flex items-center gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setIsAddModalOpen(false)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-650 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                                        >
                                            <ChevronLeft className="w-3.5 h-3.5" />
                                            Back to Planning
                                        </button>
                                        <div className="h-6 w-px bg-slate-200" />
                                        <div>
                                            <h3 className="text-sm font-extrabold text-slate-800">Create Production Plan Manually</h3>
                                        </div>
                                    </div>
                                </div>

                                <form onSubmit={handleAddSubmit} className="flex-1 flex flex-col overflow-hidden">
                                    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
                                        <div className="max-w-2xl mx-auto bg-slate-50/40 border border-slate-100 rounded-2xl p-6 flex flex-col gap-5">
                                            <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
                                                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                                                    <Plus className="w-4 h-4" />
                                                </div>
                                                <h4 className="text-sm font-bold text-slate-800">New Plan Specifications</h4>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Set Number *</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={addFormData.set_number}
                                                        onChange={e => setAddFormData({ ...addFormData, set_number: e.target.value })}
                                                        placeholder="e.g. 72110"
                                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all font-semibold"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Quantity *</label>
                                                    <input
                                                        type="number"
                                                        required
                                                        min="0"
                                                        value={addFormData.quantity}
                                                        onChange={e => setAddFormData({ ...addFormData, quantity: e.target.value })}
                                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all font-semibold"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Week</label>
                                                    <input
                                                        type="text"
                                                        value={addFormData.week}
                                                        onChange={e => setAddFormData({ ...addFormData, week: e.target.value })}
                                                        placeholder="e.g. W22"
                                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                                                    <input
                                                        type="text"
                                                        value={addFormData.description}
                                                        onChange={e => setAddFormData({ ...addFormData, description: e.target.value })}
                                                        placeholder="e.g. Production Set Description"
                                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Linked Order Numbers</label>
                                                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px] items-center">
                                                    {addOrderNumbers.map((ordNum, idx) => (
                                                        <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm">
                                                            {ordNum}
                                                            <button
                                                                type="button"
                                                                onClick={() => setAddOrderNumbers(addOrderNumbers.filter(n => n !== ordNum))}
                                                                className="hover:text-indigo-900 transition-colors text-indigo-400 font-bold ml-1"
                                                            >
                                                                &times;
                                                            </button>
                                                        </span>
                                                    ))}
                                                    {addOrderNumbers.length === 0 && (
                                                        <span className="text-xs text-slate-400 italic">No specific orders linked. Will match all orders for this set.</span>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        placeholder="Type order number & press Enter"
                                                        value={addOrderNumberInput}
                                                        onChange={e => setAddOrderNumberInput(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                const trimmed = addOrderNumberInput.trim();
                                                                if (trimmed && !addOrderNumbers.includes(trimmed)) {
                                                                    setAddOrderNumbers([...addOrderNumbers, trimmed]);
                                                                    setAddOrderNumberInput('');
                                                                }
                                                            }
                                                        }}
                                                        className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition-all"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const trimmed = addOrderNumberInput.trim();
                                                            if (trimmed && !addOrderNumbers.includes(trimmed)) {
                                                                setAddOrderNumbers([...addOrderNumbers, trimmed]);
                                                                setAddOrderNumberInput('');
                                                            }
                                                        }}
                                                        className="px-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center transition-colors"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Total Amount (€)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={addFormData.total_amount}
                                                        onChange={e => setAddFormData({ ...addFormData, total_amount: e.target.value })}
                                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nb in Box</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={addFormData.total_number_in_box}
                                                        onChange={e => setAddFormData({ ...addFormData, total_number_in_box: e.target.value })}
                                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nb Pallets</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={addFormData.total_number_of_pallets}
                                                        onChange={e => setAddFormData({ ...addFormData, total_number_of_pallets: e.target.value })}
                                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex gap-3 justify-end shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setIsAddModalOpen(false)}
                                            className="px-6 py-2.5 text-sm font-bold text-slate-650 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-sm transition-colors"
                                        >
                                            Create Plan
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="table-view"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ duration: 0.2 }}
                                className="flex-1 flex flex-col overflow-hidden"
                            >
                                {/* Missing plans alert banner */}
                                {missingPlansSummary.length > 0 && (
                                    <div className="bg-amber-50 border-b border-amber-100 transition-all shrink-0">
                                        <div className="p-4 flex items-center justify-between">
                                            <div className="flex items-center gap-3 text-amber-800">
                                                <div className="p-2 bg-amber-100 rounded-full animate-pulse">
                                                    <Bell className="w-5 h-5 text-amber-600" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold">Planning Alert</p>
                                                    <p className="text-xs text-amber-700">
                                                        There are {missingPlansSummary.length} set(s) with active orders arriving within 5 days that lack a production plan.
                                                    </p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => setIsAlertsExpanded(!isAlertsExpanded)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-200 text-amber-800 rounded-xl text-xs font-bold hover:bg-amber-100 transition-colors shadow-sm"
                                            >
                                                {isAlertsExpanded ? (
                                                    <>
                                                        Hide Details <ChevronUp className="w-4 h-4" />
                                                    </>
                                                ) : (
                                                    <>
                                                        View Unplanned Sets ({missingPlansSummary.length}) <ChevronDown className="w-4 h-4" />
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        {isAlertsExpanded && (
                                            <div className="px-4 pb-4 border-t border-amber-100/60 pt-3 bg-amber-50/50">
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {missingPlansSummary.map((item, idx) => (
                                                        <div key={idx} className="bg-white border border-amber-200/80 rounded-xl p-3.5 flex flex-col justify-between shadow-sm">
                                                            <div>
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className="text-sm font-extrabold text-slate-800 font-mono">Set {item.set_number}</span>
                                                                    {item.week && (
                                                                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                                                                            {item.week}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs font-medium text-slate-600">
                                                                    Total Expected Qty: <span className="font-bold text-slate-800">{item.quantity.toLocaleString()}</span>
                                                                </p>
                                                                <p className="text-[11px] text-slate-400 mt-0.5">
                                                                    Earliest Date: <span className="font-semibold text-slate-600">{item.earliestDate}</span>
                                                                </p>
                                                            </div>

                                                            <button
                                                                onClick={() => handleCreatePlanFromAlert(item.set_number, item.quantity, item.week, item.order_numbers)}
                                                                className="mt-3 flex items-center justify-center gap-1.5 w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                                Create Plan for Set {item.set_number}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Consultation Toolbar */}
                                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-3 items-center justify-between shrink-0">
                                    <div className="flex flex-wrap gap-3 items-center flex-1 min-w-0">
                                        <div className="relative w-full sm:max-w-xs">
                                            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="Search set, description, week..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                            />
                                        </div>

                                        <select
                                            value={deliveryStatusFilter}
                                            onChange={(e) => setDeliveryStatusFilter(e.target.value)}
                                            className="text-sm border border-slate-200 rounded-xl px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                        >
                                            <option value="">All Delivery Statuses</option>
                                            <option value="in progress">In Progress</option>
                                            <option value="yes">Delivered</option>
                                            <option value="no">Not Delivered</option>
                                            <option value="late">Rescheduled</option>
                                            <option value="eliminated">Canceled</option>
                                            <option value="not ordered">Not Ordered</option>
                                        </select>

                                        <select
                                            value={weekFilter}
                                            onChange={(e) => setWeekFilter(e.target.value)}
                                            className="text-sm border border-slate-200 rounded-xl px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                        >
                                            <option value="">All Weeks</option>
                                            {uniqueWeeks.map(wk => (
                                                <option key={wk} value={wk}>{wk}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Table List */}
                                <div className="flex-1 overflow-x-auto overflow-y-auto">
                                    <table className="w-full text-left border-collapse min-w-[900px]">
                                        <thead>
                                            <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                                                <th className="px-6 py-3.5">Week</th>
                                                <th className="px-6 py-3.5">Set</th>
                                                <th className="px-6 py-3.5">Delivery Status</th>
                                                <th className="px-6 py-3.5">Linked Orders</th>
                                                <th className="px-6 py-3.5">Description</th>
                                                <th className="px-6 py-3.5 text-center">Planned Quantity</th>
                                                <th className="px-6 py-3.5 text-right">Total Amount (€)</th>
                                                <th className="px-6 py-3.5 text-center">Nb in Box</th>
                                                <th className="px-6 py-3.5 text-center">Nb Pallets</th>
                                                <th className="px-6 py-3.5 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {loading ? (
                                                <tr>
                                                    <td colSpan={10} className="px-6 py-12 text-center text-slate-400 font-medium">
                                                        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-2" />
                                                        Fetching planning data...
                                                    </td>
                                                </tr>
                                            ) : paginatedPlanning.length === 0 ? (
                                                <tr>
                                                    <td colSpan={10} className="px-6 py-12 text-center text-slate-400 font-medium">
                                                        No production plans found. Try adding a plan manually or uploading Excel.
                                                    </td>
                                                </tr>
                                            ) : (
                                                paginatedPlanning.map(item => (
                                                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                                                        <td className="px-6 py-4 text-sm font-semibold text-blue-600">{item.week || '-'}</td>
                                                        <td className="px-6 py-4 text-sm font-bold text-slate-800">{item.set_number}</td>
                                                        <td className="px-6 py-4 text-sm">
                                                            {getDeliveryStatusBadge(item.set_number, item.order_numbers)}
                                                        </td>
                                                        <td className="px-6 py-4 text-sm">
                                                            {item.order_numbers ? (
                                                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                                    {item.order_numbers.split(',').map((ord, i) => (
                                                                        <span key={i} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-mono font-semibold border border-slate-200">
                                                                            {ord.trim()}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <span className="text-slate-400 text-xs italic">All Set Orders</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-slate-500 max-w-[220px] truncate" title={item.description}>{item.description || '-'}</td>
                                                        <td className="px-6 py-4 text-sm font-extrabold text-slate-800 text-center">{item.quantity.toLocaleString()}</td>
                                                        <td className="px-6 py-4 text-sm font-semibold text-slate-700 text-right">
                                                            {item.total_amount != null ? `€${item.total_amount.toLocaleString()}` : '-'}
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-slate-600 text-center">{item.total_number_in_box || '-'}</td>
                                                        <td className="px-6 py-4 text-sm text-slate-600 text-center">{item.total_number_of_pallets || '-'}</td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="flex gap-1.5 justify-end">
                                                                <button
                                                                    onClick={() => handleEditClick(item)}
                                                                    className="p-1.5 border border-slate-200 bg-white text-blue-600 hover:bg-blue-50 rounded-lg shadow-sm"
                                                                    title="Edit Plan"
                                                                >
                                                                    <Edit2 className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteClick(item.id)}
                                                                    className="p-1.5 border border-slate-200 bg-white text-red-650 hover:bg-red-50 rounded-lg shadow-sm"
                                                                    title="Delete Plan"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <TableFooter
                                    totalItems={filteredPlanning.length}
                                    pageSize={pageSize}
                                    currentPage={currentPage}
                                    onPageChange={setCurrentPage}
                                    onPageSizeChange={setPageSize}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
