import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Users, Search, Calendar, LineChart as ChartIcon, Package, AlertTriangle, PieChart as PieIcon, Activity } from 'lucide-react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { productionRecordService, productionLineService, productionOrderService, productionPlanningService } from '../../services/productionApi';
import { ProductionRecord, ProductionLine, ProductionOrder, ProductionPlanning } from '../../types';

// Curated modern color palette for pie charts
const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#8b5cf6', '#14b8a6', '#64748b'];

export default function ProductionDashboardView() {
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState<ProductionRecord[]>([]);
    const [machines, setMachines] = useState<ProductionLine[]>([]);
    const [orders, setOrders] = useState<ProductionOrder[]>([]);
    const [planning, setPlanning] = useState<ProductionPlanning[]>([]);

    // Filters state
    const [filters, setFilters] = useState({
        workerName: '',
        setFilter: '',
        dateStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        dateEnd: new Date().toISOString().split('T')[0],
    });

    const fetchDashboardData = async () => {
        try {
            const [prodRes, machRes, orderRes, planRes] = await Promise.all([
                productionRecordService.getRecords({
                    dateStart: filters.dateStart,
                    dateEnd: filters.dateEnd
                }),
                productionLineService.getLines(),
                productionOrderService.getOrders(),
                productionPlanningService.getPlanning()
            ]);
            setRecords(prodRes);
            setMachines(machRes);
            setOrders(orderRes);
            setPlanning(planRes);
        } catch (err) {
            console.error("Dashboard failed to load", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, [filters.dateStart, filters.dateEnd]);

    const workerPerformanceData = useMemo(() => {
        const machineMap = new Map<string, number>(machines.map(m => [m.name, m.cadence]));
        const workerStats = new Map<string, { totalTaux: number, count: number, name: string }>();

        records.forEach(r => {
            const workerKey = r.worker_id || r.worker_name || 'Unknown';
            if (workerKey !== 'Unknown' && (r.hours_worked || 0) > 0 && r.machine_name) {
                const cadence = machineMap.get(r.machine_name);
                if (cadence) {
                    const expected = r.hours_worked! * cadence;
                    const taux = expected > 0 ? (r.quantity / expected) * 100 : 0;

                    const stats = workerStats.get(workerKey) || { totalTaux: 0, count: 0, name: r.worker_name || r.worker_id };
                    stats.totalTaux += taux;
                    stats.count += 1;
                    if (r.worker_name && r.worker_name.length > stats.name.length) stats.name = r.worker_name;
                    workerStats.set(workerKey, stats);
                }
            }
        });

        return Array.from(workerStats.entries())
            .map(([id, stats]) => ({
                id,
                name: stats.name,
                displayName: stats.name.split(' ')[0].toUpperCase(),
                rendement: parseFloat((stats.totalTaux / stats.count).toFixed(1))
            }))
            .filter(w => w.name.toLowerCase().includes(filters.workerName.toLowerCase()))
            .sort((a, b) => b.rendement - a.rendement)
            .slice(0, 30);
    }, [records, machines, filters.workerName]);

    const setQuantityData = useMemo(() => {
        const setMap = new Map<string, { expected: number; delivered: number }>();
        orders.forEach(o => {
            if (o.set_number && o.set_number.toLowerCase().includes(filters.setFilter.toLowerCase())) {
                const current = setMap.get(o.set_number) || { expected: 0, delivered: 0 };
                current.expected += o.quantity_expected || 0;
                const deliveredQty = o.is_delivered === 'yes' ? (o.actual_quantity_delivered || 0) : (o.quantity_delivered || 0);
                current.delivered += deliveredQty;
                setMap.set(o.set_number, current);
            }
        });
        return Array.from(setMap.entries()).map(([set_number, vals]) => ({
            set_number,
            "Quantity Expected": vals.expected,
            "Quantity Delivered": vals.delivered
        }));
    }, [orders, filters.setFilter]);

    const delayCausesData = useMemo(() => {
        const causeMap = new Map<string, number>();
        orders.forEach(o => {
            if (o.comment && o.comment.trim() !== '') {
                const commentKey = o.comment.trim();
                causeMap.set(commentKey, (causeMap.get(commentKey) || 0) + 1);
            }
        });
        return Array.from(causeMap.entries()).map(([name, value]) => ({
            name,
            value
        })).sort((a, b) => b.value - a.value);
    }, [orders]);

    const statusDistributionData = useMemo(() => {
        const counts = {
            'In Time (Delivered)': 0,
            'In Progress': 0,
            'Late': 0,
            'Eliminated': 0,
            'Not Delivered': 0
        };
        orders.forEach(o => {
            if (o.is_delivered === 'yes') counts['In Time (Delivered)']++;
            else if (o.is_delivered === 'in progress') counts['In Progress']++;
            else if (o.is_delivered === 'late') counts['Late']++;
            else if (o.is_delivered === 'eliminated') counts['Eliminated']++;
            else if (o.is_delivered === 'no') counts['Not Delivered']++;
        });
        return Object.entries(counts)
            .filter(([_, val]) => val > 0)
            .map(([name, value]) => ({
                name,
                value
            }));
    }, [orders]);

    const planningDistributionData = useMemo(() => {
        let plannedCount = 0;
        let unplannedCount = 0;

        orders.forEach(o => {
            const hasPlan = planning.some(p => p.set_number.toLowerCase().trim() === o.set_number.toLowerCase().trim());
            if (hasPlan) plannedCount++;
            else unplannedCount++;
        });

        const data = [];
        if (plannedCount > 0) data.push({ name: 'Planned Orders', value: plannedCount });
        if (unplannedCount > 0) data.push({ name: 'Unplanned Orders', value: unplannedCount });
        return data;
    }, [orders, planning]);

    const setDatesData = useMemo(() => {
        const setMap = new Map<string, { expectedTime: number; actualTime: number | null }>();
        orders.forEach(o => {
            if (o.set_number && o.set_number.toLowerCase().includes(filters.setFilter.toLowerCase())) {
                const expectedTime = o.expected_delivery_date ? new Date(o.expected_delivery_date).getTime() : 0;
                const actualTime = o.actual_delivered_date ? new Date(o.actual_delivered_date).getTime() : null;

                if (expectedTime > 0) {
                    const existing = setMap.get(o.set_number);
                    if (!existing || expectedTime > existing.expectedTime) {
                        setMap.set(o.set_number, { expectedTime, actualTime });
                    }
                }
            }
        });
        return Array.from(setMap.entries())
            .map(([set_number, vals]) => ({
                set_number,
                expectedTime: vals.expectedTime,
                actualTime: vals.actualTime ?? undefined
            }))
            .sort((a, b) => a.expectedTime - b.expectedTime);
    }, [orders, filters.setFilter]);

    const categoryPerformanceData = useMemo(() => {
        const machineMap = new Map<string, number>(machines.map(m => [m.name, m.cadence]));
        const categoryMap = new Map<string, { sum: number; count: number }>();

        records.forEach(r => {
            if (!r.machine_name || !r.hours_worked || r.hours_worked <= 0) return;
            const cadence = machineMap.get(r.machine_name);
            if (!cadence) return;
            const expected = r.hours_worked * cadence;
            const taux = expected > 0 ? (r.quantity / expected) * 100 : 0;
            const category = r.machine_category || 'Uncategorized';
            const entry = categoryMap.get(category) ?? { sum: 0, count: 0 };
            entry.sum += taux;
            entry.count += 1;
            categoryMap.set(category, entry);
        });

        return Array.from(categoryMap.entries()).map(([category, v]) => ({
            category,
            rendement: parseFloat((v.sum / v.count).toFixed(1)),
        })).sort((a, b) => b.rendement - a.rendement);
    }, [records, machines]);

    const dailyProductionData = useMemo(() => {
        const machineMap = new Map<string, number>(machines.map(m => [m.name, m.cadence]));
        const dateMap = new Map<string, { actual: number; expected: number }>();

        records.forEach(r => {
            if (!r.machine_name || !r.hours_worked || r.hours_worked <= 0) return;
            const cadence = machineMap.get(r.machine_name);
            if (!cadence) return;
            const expected = r.hours_worked * cadence;
            const entry = dateMap.get(r.date) ?? { actual: 0, expected: 0 };
            entry.actual += r.quantity;
            entry.expected += expected;
            dateMap.set(r.date, entry);
        });

        return Array.from(dateMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-15)
            .map(([date, v]) => {
                const parts = date.split('-');
                return {
                    date: `${parts[2]}/${parts[1]}`,
                    'Production Réelle': v.actual,
                    'Objectif Attendu': v.expected,
                };
            });
    }, [records, machines]);

    const formatDateTick = (tickVal: number) => {
        if (!tickVal) return '';
        try {
            return new Date(tickVal).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });
        } catch { return ''; }
    };

    const formatDateTooltip = (value: any) => {
        if (!value) return 'N/A';
        try {
            return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        } catch { return value; }
    };

    if (loading && records.length === 0) return <div className="p-12 text-center font-bold text-gray-400 italic">Loading Production Dashboard...</div>;

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-y-auto font-sans">
            <div className="flex-1 p-6 lg:p-10 flex flex-col gap-8 w-full max-w-7xl mx-auto">
                {/* Header & Filters */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-slate-800">Production Dashboard</h2>
                        <p className="text-sm text-slate-500 mt-1">Output metrics, worker performance, orders timeline & planning analytics</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search employee..."
                                value={filters.workerName}
                                onChange={(e) => setFilters({ ...filters, workerName: e.target.value })}
                                className="pl-9 pr-4 py-1.5 bg-slate-50 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none w-36 transition-all"
                            />
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search set..."
                                value={filters.setFilter}
                                onChange={(e) => setFilters({ ...filters, setFilter: e.target.value })}
                                className="pl-9 pr-4 py-1.5 bg-slate-50 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none w-36 transition-all"
                            />
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <input
                                type="date"
                                value={filters.dateStart}
                                onChange={(e) => setFilters({ ...filters, dateStart: e.target.value })}
                                className="bg-transparent border-none text-xs font-medium focus:outline-none text-slate-600"
                            />
                            <span className="text-slate-300 text-xs">-</span>
                            <input
                                type="date"
                                value={filters.dateEnd}
                                onChange={(e) => setFilters({ ...filters, dateEnd: e.target.value })}
                                className="bg-transparent border-none text-xs font-medium focus:outline-none text-slate-600"
                            />
                        </div>
                    </div>
                </div>

                {/* Section 1: Worker Performance & Daily Trend */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-xs">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <Users className="w-5 h-5 text-blue-600" />
                                <h3 className="text-base font-bold text-slate-800">Top Worker Realization Taux (%)</h3>
                            </div>
                            <span className="text-xs font-semibold text-slate-400">{workerPerformanceData.length} workers</span>
                        </div>
                        <div className="h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={workerPerformanceData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="displayName" tick={{ fill: '#64748b', fontSize: 10 }} interval={0} angle={-45} textAnchor="end" />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 150]} />
                                    <Tooltip formatter={(value: any) => [`${value}%`, 'Taux de réalisation']} />
                                    <Bar dataKey="rendement" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-xs">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <Activity className="w-5 h-5 text-emerald-600" />
                                <h3 className="text-base font-bold text-slate-800">Daily Production Volume (Target vs Actual)</h3>
                            </div>
                        </div>
                        <div className="h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dailyProductionData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="Objectif Attendu" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Production Réelle" fill="#10b981" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Section 2: Orders Expected vs Delivered & Status Distribution */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white border border-slate-200 p-6 rounded-3xl shadow-xs">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <Package className="w-5 h-5 text-indigo-600" />
                                <h3 className="text-base font-bold text-slate-800">Orders: Expected vs Delivered by Set</h3>
                            </div>
                        </div>
                        <div className="h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={setQuantityData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="set_number" tick={{ fill: '#64748b', fontSize: 10 }} interval={0} angle={-30} textAnchor="end" />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="Quantity Expected" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Quantity Delivered" fill="#10b981" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-xs">
                        <div className="flex items-center gap-2 mb-6">
                            <PieIcon className="w-5 h-5 text-amber-600" />
                            <h3 className="text-base font-bold text-slate-800">Order Delivery Status</h3>
                        </div>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={statusDistributionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}>
                                        {statusDistributionData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Section 3: Delay Causes & Planning Distribution */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-xs">
                        <div className="flex items-center gap-2 mb-6">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                            <h3 className="text-base font-bold text-slate-800">Delay & Issue Comments Breakdown</h3>
                        </div>
                        <div className="h-64 w-full">
                            {delayCausesData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={delayCausesData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name}: ${value}`}>
                                            {delayCausesData.map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">No order comments registered.</div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-xs">
                        <div className="flex items-center gap-2 mb-6">
                            <Calendar className="w-5 h-5 text-blue-600" />
                            <h3 className="text-base font-bold text-slate-800">Planned vs Unplanned Orders</h3>
                        </div>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={planningDistributionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name}: ${value}`}>
                                        {planningDistributionData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#f59e0b'} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
