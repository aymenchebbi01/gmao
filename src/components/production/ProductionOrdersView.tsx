import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Package, Search, Calendar, ChevronRight, CheckCircle,
    XCircle, Clock, Trash2, Edit2, AlertCircle, RefreshCw, ShieldAlert, Plus, Bell
} from 'lucide-react';
import { productionOrderService, productionPlanningService, generateId } from '../../services/productionApi';
import { ProductionOrder as Order, ProductionPlanning as Planning } from '../../types';
import TableFooter from '../common/TableFooter';
import { useAuth } from '../../contexts/AuthContext';

export default function ProductionOrdersView() {
    const { user } = useAuth();
    const currentUser = user;
    const isAdmin = currentUser?.role === 'admin';
    const [loading, setLoading] = useState(false);
    const [orders, setOrders] = useState<Order[]>([]);
    const [planningItems, setPlanningItems] = useState<Planning[]>([]);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [supplierFilter, setSupplierFilter] = useState('');
    const [dueSoonOnly, setDueSoonOnly] = useState(false);
    const [planningFilter, setPlanningFilter] = useState<string>('');
    const [weekFilter, setWeekFilter] = useState<string>('');

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(13);
    const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

    // Add modal state
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [addFormData, setAddFormData] = useState({
        supplier: '',
        order_number: '',
        set_number: '',
        description: '',
        quantity_expected: '0',
        expected_delivery_date: new Date().toISOString().split('T')[0],
        week: ''
    });

    // Edit modal state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [editFormData, setEditFormData] = useState({
        supplier: '',
        order_number: '',
        set_number: '',
        description: '',
        quantity_expected: '',
        is_delivered: 'in progress' as Order['is_delivered'],
        actual_delivered_date: '',
        actual_quantity_delivered: '',
        comment: '',
        department: '',
        updated_by: '',
        expected_delivery_date: '',
        week: ''
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await productionOrderService.getOrders();
            setOrders(data);
            try {
                const pData = await productionPlanningService.getPlanning();
                setPlanningItems(pData);
            } catch (pErr) {
                console.error("Failed to load planning items inside OrdersView:", pErr);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const getMatchingPlan = (setNumber: string, qtyExpected: number, orderNumber: string) => {
        const targetOrderNum = orderNumber.toLowerCase().trim();
        const targetSetNum = setNumber.toLowerCase().trim();

        // First, check if there is a plan explicitly referencing this order number
        const explicitMatch = planningItems.find(p => {
            if (!p.order_numbers) return false;
            const nums = p.order_numbers.split(',').map(s => s.toLowerCase().trim()).filter(Boolean);
            return nums.includes(targetOrderNum) && p.set_number.toLowerCase().trim() === targetSetNum;
        });

        if (explicitMatch) return explicitMatch;

        // If no explicit match, fall back to matching by set_number and quantity
        return planningItems.find(p =>
            (!p.order_numbers || p.order_numbers.trim() === '') &&
            p.set_number.toLowerCase().trim() === targetSetNum &&
            p.quantity === qtyExpected
        );
    };

    const getPlanWeekForSet = (setNumber: string, orderNumber?: string) => {
        if (orderNumber) {
            const targetOrderNum = orderNumber.toLowerCase().trim();
            const explicitMatch = planningItems.find(p => {
                if (!p.order_numbers) return false;
                const nums = p.order_numbers.split(',').map(s => s.toLowerCase().trim()).filter(Boolean);
                return nums.includes(targetOrderNum);
            });
            if (explicitMatch && explicitMatch.week) return explicitMatch.week;
        }
        const matchedPlan = planningItems.find(p => p.set_number.toLowerCase().trim() === setNumber.toLowerCase().trim());
        return (matchedPlan && matchedPlan.week) ? matchedPlan.week : null;
    };

    const getResolvedWeek = (order: Order) => {
        const inherited = getPlanWeekForSet(order.set_number, order.order_number);
        return inherited !== null ? inherited : (order.week || '');
    };

    const uniqueWeeks = useMemo(() => {
        const weeks = orders
            .map(o => getResolvedWeek(o))
            .filter(w => w.trim() !== '');
        return Array.from(new Set(weeks)).sort();
    }, [orders, planningItems]);

    useEffect(() => {
        fetchData();
    }, []);

    // Reset page to 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, supplierFilter, dueSoonOnly, planningFilter, weekFilter]);

    const handleEditClick = (order: Order) => {
        setSelectedOrder(order);
        setEditFormData({
            supplier: order.supplier,
            order_number: order.order_number,
            set_number: order.set_number,
            description: order.description || '',
            quantity_expected: String(order.quantity_expected),
            is_delivered: order.is_delivered,
            actual_delivered_date: order.actual_delivered_date || '',
            actual_quantity_delivered: order.actual_quantity_delivered !== undefined ? String(order.actual_quantity_delivered) : '',
            comment: order.comment || '',
            department: order.department || '',
            updated_by: order.updated_by || '',
            expected_delivery_date: order.expected_delivery_date,
            week: order.week || ''
        });
        setIsEditModalOpen(true);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedOrder) return;

        try {
            const updates: Partial<Order> = {
                supplier: editFormData.supplier,
                order_number: editFormData.order_number,
                set_number: editFormData.set_number,
                description: editFormData.description,
                quantity_expected: parseInt(editFormData.quantity_expected || '0'),
                is_delivered: editFormData.is_delivered,
                actual_delivered_date: editFormData.is_delivered === 'yes' ? editFormData.actual_delivered_date : '',
                actual_quantity_delivered: editFormData.is_delivered === 'yes' ? parseInt(editFormData.actual_quantity_delivered || '0') : 0,
                comment: editFormData.comment,
                department: editFormData.department || undefined,
                updated_by: currentUser?.displayName || currentUser?.username || 'Unknown',
                expected_delivery_date: editFormData.expected_delivery_date,
                week: getPlanWeekForSet(editFormData.set_number) || editFormData.week || ''
            };

            await productionOrderService.updateOrder(selectedOrder.id, updates);
            setIsEditModalOpen(false);
            fetchData();
        } catch (err) {
            console.error(err);
            alert("Failed to update order status.");
        }
    };

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const newOrder: Order = {
                id: generateId(),
                supplier: addFormData.supplier || 'Unknown',
                order_number: addFormData.order_number,
                set_number: addFormData.set_number,
                description: addFormData.description,
                quantity_expected: parseInt(addFormData.quantity_expected || '0') || 0,
                quantity_delivered: 0,
                is_delivered: 'in progress',
                expected_delivery_date: addFormData.expected_delivery_date,
                week: getPlanWeekForSet(addFormData.set_number) || addFormData.week
            };
            await productionOrderService.addOrder(newOrder);
            setIsAddModalOpen(false);
            setAddFormData({
                supplier: '',
                order_number: '',
                set_number: '',
                description: '',
                quantity_expected: '0',
                expected_delivery_date: new Date().toISOString().split('T')[0],
                week: ''
            });
            fetchData();
        } catch (err) {
            console.error(err);
            alert("Failed to add order manually.");
        }
    };

    const handleDeleteAll = async () => {
        try {
            await productionOrderService.clearAllOrders();
            setConfirmDeleteAll(false);
            fetchData();
        } catch (err) {
            console.error("Failed to delete all orders:", err);
            alert("Failed to clear all orders.");
        }
    };

    const handleDeleteClick = async (id: string) => {
        if (confirm("Are you sure you want to delete this order?")) {
            try {
                await productionOrderService.deleteOrder(id);
                fetchData();
            } catch (err) {
                console.error(err);
            }
        }
    };

    // Calculate due soon orders
    const today = new Date().getTime();
    const fiveDaysFromNow = today + 5 * 24 * 60 * 60 * 1000;
    const dueSoonOrdersCount = orders.filter(o => {
        if (o.is_delivered !== 'in progress') return false;
        if (!o.expected_delivery_date) return false;

        const isPlanned = getMatchingPlan(o.set_number, o.quantity_expected, o.order_number);
        if (!isPlanned) return false;

        const expected = new Date(o.expected_delivery_date).getTime();
        return expected <= fiveDaysFromNow;
    }).length;

    // Filter logic
    const filteredOrders = orders.filter(order => {
        const matchesSearch =
            order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.set_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (order.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.supplier.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesStatus = !statusFilter || order.is_delivered === statusFilter;
        const matchesSupplier = !supplierFilter || order.supplier.toLowerCase().includes(supplierFilter.toLowerCase());

        const matchesDueSoon = !dueSoonOnly || (
            order.is_delivered === 'in progress' &&
            getMatchingPlan(order.set_number, order.quantity_expected, order.order_number) &&
            new Date(order.expected_delivery_date).getTime() <= fiveDaysFromNow
        );

        const hasPlan = !!getMatchingPlan(order.set_number, order.quantity_expected, order.order_number);
        const matchesPlanning = !planningFilter ||
            (planningFilter === 'planned' && hasPlan) ||
            (planningFilter === 'unplanned' && !hasPlan);

        const matchesWeek = !weekFilter || getResolvedWeek(order) === weekFilter;

        return matchesSearch && matchesStatus && matchesSupplier && matchesDueSoon && matchesPlanning && matchesWeek;
    });

    const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const getStatusBadge = (status: Order['is_delivered']) => {
        const badges = {
            'yes': { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle, label: 'Delivered' },
            'no': { bg: 'bg-red-50 text-red-700 border-red-200', icon: XCircle, label: 'Not Delivered' },
            'eliminated': { bg: 'bg-slate-100 text-slate-700 border-slate-200', icon: ShieldAlert, label: 'Eliminated' },
            'late': { bg: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertCircle, label: 'Late' },
            'in progress': { bg: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock, label: 'In Progress' }
        };

        const config = badges[status] || badges['in progress'];
        const Icon = config.icon;

        return (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${config.bg}`}>
                <Icon className="w-3.5 h-3.5" />
                {config.label}
            </span>
        );
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden font-sans">
            <div className="p-6 lg:p-8 flex flex-col h-full overflow-hidden">

                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
                    <div>
                        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
                            {isEditModalOpen && selectedOrder
                                ? 'Edit Order Details'
                                : isAddModalOpen
                                    ? 'Add Manual Order'
                                    : 'Orders Consultation'}
                        </h2>
                    </div>
                    {!isEditModalOpen && !isAddModalOpen && (
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">
                                {filteredOrders.length} records
                            </span>
                            {isAdmin && (!confirmDeleteAll ? (
                                <button
                                    onClick={() => setConfirmDeleteAll(true)}
                                    disabled={orders.length === 0}
                                    className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg px-3 py-1.5 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Delete all orders (Admin only)"
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
                                Add Order
                            </button>
                        </div>
                    )}
                </div>

                {/* Main panel */}
                <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
                    <AnimatePresence mode="wait">
                        {isEditModalOpen && selectedOrder ? (
                            <motion.div
                                key="edit-form"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                                className="flex-1 flex flex-col overflow-hidden"
                            >
                                {/* Edit bar */}
                                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                                    <div className="flex items-center gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setIsEditModalOpen(false)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-650 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                                        >
                                            <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                            Back to Orders
                                        </button>
                                        <div className="h-6 w-px bg-slate-200 hidden sm:block" />
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Currently Updating</span>
                                            <h3 className="text-sm font-extrabold text-slate-800">
                                                PO: <span className="text-blue-600 font-bold">{selectedOrder.order_number}</span> &bull; Set: <span className="font-bold">{selectedOrder.set_number}</span>
                                            </h3>
                                        </div>
                                    </div>
                                    <div className="text-xs text-slate-400 font-medium">
                                        Last modified by: <span className="font-semibold text-slate-650">{selectedOrder.updated_by || 'System Default'}</span>
                                    </div>
                                </div>

                                {/* Scrollable Form Content */}
                                <form onSubmit={handleEditSubmit} className="flex-1 flex flex-col overflow-hidden">
                                    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">

                                            {/* Left Column: Order Specifications */}
                                            <div className="bg-slate-50/40 border border-slate-100 rounded-2xl p-6 flex flex-col gap-5">
                                                <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
                                                    <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                                                        <Package className="w-4 h-4" />
                                                    </div>
                                                    <h4 className="text-sm font-bold text-slate-800">Order Specifications</h4>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Supplier *</label>
                                                        <input
                                                            type="text"
                                                            required
                                                            value={editFormData.supplier}
                                                            onChange={e => setEditFormData({ ...editFormData, supplier: e.target.value })}
                                                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Order Number *</label>
                                                        <input
                                                            type="text"
                                                            required
                                                            value={editFormData.order_number}
                                                            onChange={e => setEditFormData({ ...editFormData, order_number: e.target.value })}
                                                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Set Number *</label>
                                                        <input
                                                            type="text"
                                                            required
                                                            value={editFormData.set_number}
                                                            onChange={e => setEditFormData({ ...editFormData, set_number: e.target.value })}
                                                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Qty Expected *</label>
                                                        <input
                                                            type="number"
                                                            required
                                                            min="0"
                                                            value={editFormData.quantity_expected}
                                                            onChange={e => setEditFormData({ ...editFormData, quantity_expected: e.target.value })}
                                                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                    <div className="sm:col-span-2">
                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                                                        <input
                                                            type="text"
                                                            value={editFormData.description}
                                                            onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
                                                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                                            Week {getPlanWeekForSet(editFormData.set_number) ? '(Linked)' : ''}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            disabled={!!getPlanWeekForSet(editFormData.set_number)}
                                                            value={getPlanWeekForSet(editFormData.set_number) || editFormData.week}
                                                            onChange={e => setEditFormData({ ...editFormData, week: e.target.value })}
                                                            placeholder={getPlanWeekForSet(editFormData.set_number) ? '' : "e.g. W22"}
                                                            className={`w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all ${getPlanWeekForSet(editFormData.set_number)
                                                                    ? 'bg-slate-100 text-slate-500 cursor-not-allowed font-semibold'
                                                                    : 'bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                                                                }`}
                                                        />
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Expected Delivery Date *</label>
                                                    <input
                                                        type="date"
                                                        required
                                                        value={editFormData.expected_delivery_date}
                                                        onChange={e => setEditFormData({ ...editFormData, expected_delivery_date: e.target.value })}
                                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                    />
                                                </div>
                                            </div>

                                            {/* Right Column: Delivery Status & Logistics */}
                                            <div className="bg-slate-50/40 border border-slate-100 rounded-2xl p-6 flex flex-col gap-5">
                                                <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
                                                    <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                                                        <CheckCircle className="w-4 h-4" />
                                                    </div>
                                                    <h4 className="text-sm font-bold text-slate-800">Delivery Status & Alerts</h4>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Is it delivered? *</label>
                                                    <select
                                                        required
                                                        value={editFormData.is_delivered}
                                                        onChange={e => setEditFormData({ ...editFormData, is_delivered: e.target.value as Order['is_delivered'] })}
                                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white outline-none transition-all"
                                                    >
                                                        <option value="in progress">In Progress</option>
                                                        <option value="yes">Yes (Delivered)</option>
                                                        <option value="no">No (Not Delivered)</option>
                                                        <option value="eliminated">Eliminated</option>
                                                        <option value="late">Late (Requires Rescheduling)</option>
                                                    </select>
                                                </div>

                                                {editFormData.is_delivered === 'late' && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 flex flex-col gap-2.5"
                                                    >
                                                        <div className="flex gap-2 text-amber-800">
                                                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                                            <div>
                                                                <h5 className="text-xs font-bold">Reschedule Late Delivery</h5>
                                                                <p className="text-[11px] text-amber-600/90 mt-0.5">Please ensure you have updated the Expected Delivery Date in the left column for this delayed order.</p>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}

                                                {editFormData.is_delivered === 'yes' && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4"
                                                    >
                                                        <div>
                                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Actual Delivery Date *</label>
                                                            <input
                                                                type="date"
                                                                required
                                                                value={editFormData.actual_delivered_date}
                                                                onChange={e => setEditFormData({ ...editFormData, actual_delivered_date: e.target.value })}
                                                                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Actual Qty Delivered *</label>
                                                            <input
                                                                type="number"
                                                                required
                                                                min="0"
                                                                value={editFormData.actual_quantity_delivered}
                                                                onChange={e => setEditFormData({ ...editFormData, actual_quantity_delivered: e.target.value })}
                                                                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                            />
                                                        </div>
                                                    </motion.div>
                                                )}

                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Concerned Department Alert</label>
                                                    <select
                                                        value={editFormData.department}
                                                        onChange={e => setEditFormData({ ...editFormData, department: e.target.value })}
                                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white outline-none transition-all"
                                                    >
                                                        <option value="">None / No Alert</option>
                                                        <option value="logistics">Logistics</option>
                                                        <option value="production">Production</option>
                                                        <option value="injection">Injection</option>
                                                        <option value="quality">Quality</option>
                                                        <option value="IT">IT</option>
                                                    </select>
                                                </div>

                                                <div className="flex-grow flex flex-col">
                                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Remarks & Comments</label>
                                                    <textarea
                                                        value={editFormData.comment}
                                                        onChange={e => setEditFormData({ ...editFormData, comment: e.target.value })}
                                                        className="w-full flex-grow border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none min-h-[100px]"
                                                        placeholder="Add any remarks or delivery specifications..."
                                                    />
                                                </div>
                                            </div>

                                        </div>
                                    </div>

                                    {/* Footer controls inside the card */}
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
                                            Save
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
                                            <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                            Back to Orders
                                        </button>
                                        <div className="h-6 w-px bg-slate-200" />
                                        <div>
                                            <h3 className="text-sm font-extrabold text-slate-800">Add Order Manually</h3>
                                        </div>
                                    </div>
                                </div>

                                <form onSubmit={handleAddSubmit} className="flex-1 flex flex-col overflow-hidden">
                                    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
                                        <div className="bg-slate-50/40 border border-slate-100 rounded-2xl p-6 flex flex-col gap-5 max-w-2xl mx-auto">
                                            <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
                                                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                                                    <Plus className="w-4 h-4" />
                                                </div>
                                                <h4 className="text-sm font-bold text-slate-800">New Order Specifications</h4>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Supplier *</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={addFormData.supplier}
                                                        onChange={e => setAddFormData({ ...addFormData, supplier: e.target.value })}
                                                        placeholder="e.g. Supplier Name"
                                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Order Number *</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={addFormData.order_number}
                                                        onChange={e => setAddFormData({ ...addFormData, order_number: e.target.value })}
                                                        placeholder="e.g. PO-XXXXX"
                                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                    />
                                                </div>
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
                                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Qty Expected *</label>
                                                    <input
                                                        type="number"
                                                        required
                                                        min="0"
                                                        value={addFormData.quantity_expected}
                                                        onChange={e => setAddFormData({ ...addFormData, quantity_expected: e.target.value })}
                                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div className="sm:col-span-2">
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                                                    <input
                                                        type="text"
                                                        value={addFormData.description}
                                                        onChange={e => setAddFormData({ ...addFormData, description: e.target.value })}
                                                        placeholder="e.g. Mechanical components"
                                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                                        Week {getPlanWeekForSet(addFormData.set_number) ? '(Linked)' : ''}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        disabled={!!getPlanWeekForSet(addFormData.set_number)}
                                                        value={getPlanWeekForSet(addFormData.set_number) || addFormData.week}
                                                        onChange={e => setAddFormData({ ...addFormData, week: e.target.value })}
                                                        placeholder={getPlanWeekForSet(addFormData.set_number) ? '' : "e.g. W22"}
                                                        className={`w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all ${getPlanWeekForSet(addFormData.set_number)
                                                                ? 'bg-slate-100 text-slate-500 cursor-not-allowed font-semibold'
                                                                : 'bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                                                            }`}
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Expected Delivery Date *</label>
                                                <input
                                                    type="date"
                                                    required
                                                    value={addFormData.expected_delivery_date}
                                                    onChange={e => setAddFormData({ ...addFormData, expected_delivery_date: e.target.value })}
                                                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all"
                                                />
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
                                            Create Order
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
                                {dueSoonOrdersCount > 0 && (
                                    <div className="bg-amber-50 border-b border-amber-100 p-4 flex items-center justify-between shrink-0">
                                        <div className="flex items-center gap-3 text-amber-800">
                                            <div className="p-2 bg-amber-100 rounded-full animate-pulse">
                                                <Bell className="w-5 h-5 text-amber-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold">Action Required</p>
                                                <p className="text-xs text-amber-700">You have {dueSoonOrdersCount} order(s) expected to be delivered within the next 5 days.</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setDueSoonOnly(!dueSoonOnly)}
                                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${dueSoonOnly
                                                ? 'bg-amber-600 text-white shadow-sm'
                                                : 'bg-white border border-amber-200 text-amber-700 hover:bg-amber-100'
                                                }`}
                                        >
                                            {dueSoonOnly ? 'View All Orders' : 'Filter Due Soon'}
                                        </button>
                                    </div>
                                )}

                                {/* Consultation Toolbar */}
                                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-3 items-center justify-between shrink-0">
                                    <div className="flex flex-wrap gap-3 items-center flex-1 min-w-0">
                                        <div className="relative w-full sm:max-w-xs">
                                            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="Search supplier, order, set..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                            />
                                        </div>

                                        <select
                                            value={statusFilter}
                                            onChange={(e) => setStatusFilter(e.target.value)}
                                            className="text-sm border border-slate-200 rounded-xl px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                        >
                                            <option value="">All Statuses</option>
                                            <option value="in progress">In Progress</option>
                                            <option value="yes">Delivered</option>
                                            <option value="no">Not Delivered</option>
                                            <option value="late">Late</option>
                                            <option value="eliminated">Eliminated</option>
                                        </select>

                                        <select
                                            value={planningFilter}
                                            onChange={(e) => setPlanningFilter(e.target.value)}
                                            className="text-sm border border-slate-200 rounded-xl px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                        >
                                            <option value="">All Planning Status</option>
                                            <option value="planned">Planned</option>
                                            <option value="unplanned">Not Planned</option>
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
                                    <table className="w-full text-left border-collapse min-w-[1100px]">
                                        <thead>
                                            <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                                                <th className="px-6 py-3.5">Supplier</th>
                                                <th className="px-6 py-3.5">Order Number</th>
                                                <th className="px-6 py-3.5">Set</th>
                                                <th className="px-6 py-3.5">Week</th>
                                                <th className="px-6 py-3.5">Planning Status</th>
                                                <th className="px-6 py-3.5">Description</th>
                                                <th className="px-6 py-3.5">Expected Deliv. Date</th>
                                                <th className="px-6 py-3.5 text-center">Qty Expected</th>
                                                <th className="px-6 py-3.5 text-center">Qty Delivered</th>
                                                <th className="px-6 py-3.5">Is Delivered?</th>
                                                <th className="px-6 py-3.5">Actual Deliv. Date</th>
                                                <th className="px-6 py-3.5 text-center">Actual Qty</th>
                                                <th className="px-6 py-3.5">Comment</th>
                                                <th className="px-6 py-3.5">Concerned Dept.</th>
                                                <th className="px-6 py-3.5">Changed By</th>
                                                <th className="px-6 py-3.5 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {loading ? (
                                                <tr>
                                                    <td colSpan={16} className="px-6 py-12 text-center text-slate-400 font-medium">
                                                        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-2" />
                                                        Fetching order tracking table...
                                                    </td>
                                                </tr>
                                            ) : paginatedOrders.length === 0 ? (
                                                <tr>
                                                    <td colSpan={16} className="px-6 py-12 text-center text-slate-400 font-medium">
                                                        No orders mapped. Try importing an Excel file to get started.
                                                    </td>
                                                </tr>
                                            ) : (
                                                paginatedOrders.map(order => {
                                                    const matchedPlan = getMatchingPlan(order.set_number, order.quantity_expected, order.order_number);
                                                    return (
                                                        <tr
                                                            key={order.id}
                                                            className="hover:bg-slate-50/50 transition-colors group"
                                                        >
                                                            <td className="px-6 py-4 text-sm font-semibold text-slate-800">{order.supplier}</td>
                                                            <td className="px-6 py-4 text-sm font-medium text-slate-600">{order.order_number}</td>
                                                            <td className="px-6 py-4 text-sm font-bold text-slate-800">{order.set_number}</td>
                                                            <td className="px-6 py-4 text-sm font-semibold text-blue-600">{getResolvedWeek(order) || '-'}</td>
                                                            <td className="px-6 py-4 text-sm">
                                                                {matchedPlan ? (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">
                                                                        <CheckCircle className="w-3.5 h-3.5" />
                                                                        Planned
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-slate-50 text-slate-450 border-slate-200">
                                                                        <XCircle className="w-3.5 h-3.5" />
                                                                        Not Planned
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 text-sm text-slate-500 max-w-[200px] truncate" title={order.description}>{order.description || '-'}</td>
                                                            <td className="px-6 py-4 text-sm text-slate-650">
                                                                <span className="flex items-center gap-1">
                                                                    <Calendar className="w-3.5 h-3.5 text-slate-450" />
                                                                    {order.expected_delivery_date}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 text-sm font-bold text-slate-700 text-center">{order.quantity_expected}</td>
                                                            <td className="px-6 py-4 text-sm font-semibold text-slate-600 text-center">{order.quantity_delivered}</td>
                                                            <td className="px-6 py-4 text-sm">
                                                                <button
                                                                    onClick={() => handleEditClick(order)}
                                                                    className="hover:scale-105 transition-transform text-left cursor-pointer"
                                                                >
                                                                    {getStatusBadge(order.is_delivered)}
                                                                </button>
                                                            </td>
                                                            <td className="px-6 py-4 text-sm text-slate-500">{order.actual_delivered_date || '-'}</td>
                                                            <td className="px-6 py-4 text-sm font-semibold text-slate-700 text-center">{order.actual_quantity_delivered || '-'}</td>
                                                            <td className="px-6 py-4 text-sm text-slate-500 max-w-[200px] truncate" title={order.comment}>{order.comment || '-'}</td>
                                                            <td className="px-6 py-4 text-sm text-slate-500">
                                                                {order.department ? (
                                                                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold uppercase tracking-wide border border-slate-200">
                                                                        {order.department}
                                                                    </span>
                                                                ) : '-'}
                                                            </td>
                                                            <td className="px-6 py-4 text-sm text-slate-500 font-medium">{order.updated_by || '-'}</td>
                                                            <td className="px-6 py-4 text-right">
                                                                <div className="flex gap-1.5 justify-end">
                                                                    <button
                                                                        onClick={() => handleEditClick(order)}
                                                                        className="p-1.5 border border-slate-200 bg-white text-blue-600 hover:bg-blue-50 rounded-lg shadow-sm"
                                                                        title="Manage Delivery Status"
                                                                    >
                                                                        <Edit2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteClick(order.id)}
                                                                        className="p-1.5 border border-slate-200 bg-white text-red-650 hover:bg-red-50 rounded-lg shadow-sm"
                                                                        title="Delete Order"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                        {filteredOrders.length > 0 && (() => {
                                            const qtyExpectedSum = filteredOrders.reduce((sum, o) => sum + (o.quantity_expected || 0), 0);
                                            const qtyDeliveredSum = filteredOrders.reduce((sum, o) => sum + (o.actual_quantity_delivered || o.quantity_delivered || 0), 0);
                                            const qtyRestSum = filteredOrders.reduce((sum, o) => {
                                                const expected = o.quantity_expected || 0;
                                                const delivered = o.actual_quantity_delivered || o.quantity_delivered || 0;
                                                return sum + Math.max(0, expected - delivered);
                                            }, 0);
                                            const uniqueSetsInFiltered = Array.from(new Set(
                                                filteredOrders.map(o => o.set_number.toLowerCase().trim())
                                            ));
                                            const qtyPlannedSum = planningItems
                                                .filter(p => uniqueSetsInFiltered.includes(p.set_number.toLowerCase().trim()))
                                                .reduce((sum, p) => sum + (p.quantity || 0), 0);

                                            return (
                                                <tfoot className="border-t-2 border-slate-200 bg-slate-100/90 font-bold text-slate-800 sticky bottom-0 z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                                                    <tr>
                                                        <td className="px-6 py-3.5 text-sm font-extrabold text-slate-700" colSpan={4}>TOTAL (Filtered)</td>
                                                        <td className="px-6 py-3.5 text-xs font-bold text-slate-650" colSpan={2}>
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] uppercase text-slate-400 tracking-wider">Planned Qty (Sets)</span>
                                                                <span className="text-sm font-extrabold text-blue-700">{qtyPlannedSum.toLocaleString()}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3.5"></td>
                                                        <td className="px-6 py-3.5 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[10px] uppercase text-slate-400 tracking-wider">Expected</span>
                                                                <span className="text-sm font-extrabold text-slate-800">{qtyExpectedSum.toLocaleString()}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3.5 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[10px] uppercase text-slate-400 tracking-wider">Delivered</span>
                                                                <span className="text-sm font-extrabold text-emerald-700">{qtyDeliveredSum.toLocaleString()}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3.5" colSpan={2}></td>
                                                        <td className="px-6 py-3.5 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[10px] uppercase text-slate-400 tracking-wider">Rest</span>
                                                                <span className="text-sm font-extrabold text-amber-700">{qtyRestSum.toLocaleString()}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3.5" colSpan={4}></td>
                                                    </tr>
                                                </tfoot>
                                            );
                                        })()}
                                    </table>
                                </div>
                                <TableFooter
                                    totalItems={filteredOrders.length}
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
