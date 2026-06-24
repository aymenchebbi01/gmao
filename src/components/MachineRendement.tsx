import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Activity,
    Plus,
    Edit2,
    Trash2,
    Save,
    X,
    RefreshCw,
    Calendar,
    Target,
    TrendingUp,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Download,
    Search,
    Monitor,
} from 'lucide-react';
import { MachineRendement as MachineRendementType, ProductionProduct, Machine } from '../types';
import { api } from '../services/api';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { THERMOPLASTICS_LOGO_BASE64 } from '../constants/logo';
import { format } from 'date-fns';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';

// ─── SearchableSelect Component ──────────────────────────────────────────────

interface SearchableSelectProps<T> {
    options: T[];
    value: string;
    onChange: (value: string) => void;
    getLabel: (option: T) => string;
    getValue: (option: T) => string;
    getDescription?: (option: T) => string;
    placeholder?: string;
}

function SearchableSelect<T>({
    options,
    value,
    onChange,
    getLabel,
    getValue,
    getDescription,
    placeholder = "Select..."
}: SearchableSelectProps<T>) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    const filtered = useMemo(() => {
        if (!search) return options;
        const lowSearch = search.toLowerCase();
        return options.filter(opt => {
            const label = getLabel(opt).toLowerCase();
            const desc = getDescription ? getDescription(opt).toLowerCase() : '';
            return label.includes(lowSearch) || desc.includes(lowSearch);
        });
    }, [options, search, getLabel, getDescription]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = useMemo(() =>
        options.find(o => String(getValue(o)) === String(value)),
        [options, value, getValue]);

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium text-left"
            >
                <span className={cn(!value && "text-gray-400")}>
                    {selectedOption ? getLabel(selectedOption) : placeholder}
                </span>
                <ChevronDown size={14} className={cn("text-gray-400 transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute z-[60] mt-2 w-full bg-white border border-gray-100 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="p-2 border-b border-gray-50 bg-gray-50/50 flex items-center gap-2">
                        <Search size={14} className="text-gray-400" />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Search..."
                            className="bg-transparent border-none text-sm outline-none w-full font-medium"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="p-1 text-gray-400 hover:text-gray-600">
                                <X size={12} />
                            </button>
                        )}
                    </div>
                    <div className="max-h-60 overflow-y-auto py-1">
                        {filtered.length === 0 ? (
                            <div className="px-4 py-3 text-xs text-gray-400 text-center italic">No items found</div>
                        ) : (
                            filtered.map((opt, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
                                        onChange(getValue(opt));
                                        setIsOpen(false);
                                        setSearch('');
                                    }}
                                    className={cn(
                                        "w-full text-left px-4 py-2 text-sm transition-colors hover:bg-blue-50",
                                        value === getValue(opt) ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700"
                                    )}
                                >
                                    <div className="flex flex-col">
                                        <span className="font-bold">{getLabel(opt)}</span>
                                        {getDescription && (
                                            <span className="text-[10px] text-gray-400 line-clamp-1">{getDescription(opt)}</span>
                                        )}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Target qty = (qtyProduced × 8h-in-seconds) / cycleTime */
function calcTarget(product: ProductionProduct): number {
    if (!product.cycleTime || product.cycleTime === 0) return 0;
    return Math.round((product.qtyProduced * 8 * 3600) / product.cycleTime);
}

function calcEfficiency(qty: number, target: number): number {
    if (!target || target === 0) return 0;
    return Math.round((qty / target) * 100);
}

function calcTRS(cycleTime: number, cavities: number): number {
    if (!cycleTime || cycleTime === 0) return 0;
    return Math.round((3600 * cavities / cycleTime) * 8);
}

function effColor(pct: number) {
    if (pct >= 90) return 'text-emerald-600 bg-emerald-50';
    if (pct >= 70) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
}

function effBadge(pct: number) {
    return (
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums', effColor(pct))}>
            {pct.toFixed(1)}%
        </span>
    );
}

// ─── empty form ─────────────────────────────────────────────────────────────

const emptyForm = (): Omit<MachineRendementType, 'id' | 'createdAt'> => ({
    date: new Date().toISOString().slice(0, 10),
    machineNumber: '',
    item: '',
    targetQty: 0,
    qtyShift1: 0,
    qtyShift2: 0,
    qtyShift3: 0,
    efficiencyShift1: 0,
    efficiencyShift2: 0,
    efficiencyShift3: 0,
    actualCycleTime: 0,
    actualCavitiesRunning: 0,
    trs: 0,
    comment: '',
    priceMarket: 'TN',
});

// ─── component ──────────────────────────────────────────────────────────────

export default function MachineRendement() {
    const [records, setRecords] = useState<MachineRendementType[]>([]);
    const [products, setProducts] = useState<ProductionProduct[]>([]);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterDate, setFilterDate] = useState('');
    const [filterItem, setFilterItem] = useState('');
    const [filterMachine, setFilterMachine] = useState('');
    const [filterMarket, setFilterMarket] = useState<'TN' | 'Malta' | ''>('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<MachineRendementType | null>(null);
    const [form, setForm] = useState(emptyForm());

    // ── pagination state ──────────────────────────────────────────────────────
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // ── fetch ────────────────────────────────────────────────────────────────

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [recs, prods, machs] = await Promise.all([
                api.getRendement(),
                api.getProducts(),
                api.getMachines()
            ]);
            setRecords(recs);
            setProducts(prods);
            setMachines(machs);
        } catch {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAll(); }, []);

    // ── derived: selected product ─────────────────────────────────────────────

    const selectedProduct = useMemo(
        () => products.find(p => p.item === form.item) ?? null,
        [products, form.item]
    );

    // When item changes, recalculate target & efficiencies
    useEffect(() => {
        if (!selectedProduct) return;
        const tgt = calcTarget(selectedProduct);
        setForm(f => ({
            ...f,
            targetQty: tgt,
            efficiencyShift1: calcEfficiency(f.qtyShift1, tgt),
            efficiencyShift2: calcEfficiency(f.qtyShift2, tgt),
            efficiencyShift3: calcEfficiency(f.qtyShift3, tgt),
        }));
    }, [selectedProduct]);

    // ── recalc efficiencies whenever qty changes ──────────────────────────────

    const handleQtyChange = (shift: 1 | 2 | 3, value: number) => {
        setForm(f => {
            const tgt = f.targetQty;
            return {
                ...f,
                [`qtyShift${shift}`]: value,
                [`efficiencyShift${shift}`]: calcEfficiency(value, tgt),
            };
        });
    };

    const handleTRSInputChange = (field: 'actualCycleTime' | 'actualCavitiesRunning', value: number) => {
        setForm(f => {
            const next = { ...f, [field]: value };
            return {
                ...next,
                trs: calcTRS(next.actualCycleTime || 0, next.actualCavitiesRunning || 0)
            };
        });
    };

    // ── open modal ────────────────────────────────────────────────────────────

    const openCreate = () => {
        setEditingRecord(null);
        setForm(emptyForm());
        setIsModalOpen(true);
    };

    const openEdit = (rec: MachineRendementType) => {
        setEditingRecord(rec);
        setForm({
            date: rec.date,
            machineNumber: rec.machineNumber || '',
            item: rec.item,
            targetQty: rec.targetQty,
            qtyShift1: rec.qtyShift1,
            qtyShift2: rec.qtyShift2,
            qtyShift3: rec.qtyShift3,
            efficiencyShift1: rec.efficiencyShift1,
            efficiencyShift2: rec.efficiencyShift2,
            efficiencyShift3: rec.efficiencyShift3,
            actualCycleTime: rec.actualCycleTime || 0,
            actualCavitiesRunning: rec.actualCavitiesRunning || 0,
            trs: rec.trs || 0,
            comment: rec.comment || '',
            priceMarket: rec.priceMarket || 'TN',
        });
        setIsModalOpen(true);
    };

    // ── save ─────────────────────────────────────────────────────────────────

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.item) { toast.error('Please select an item'); return; }
        if (!form.machineNumber) { toast.error('Please select a machine'); return; }
        try {
            if (editingRecord?.id != null) {
                await api.updateRendement(editingRecord.id, form as MachineRendementType);
                toast.success('Record updated');
            } else {
                await api.createRendement(form as MachineRendementType);
                toast.success('Record saved');
            }
            setIsModalOpen(false);
            fetchAll();
        } catch {
            toast.error('Failed to save record');
        }
    };

    // ── delete ────────────────────────────────────────────────────────────────

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this record?')) return;
        try {
            await api.deleteRendement(id);
            toast.success('Record deleted');
            fetchAll();
        } catch {
            toast.error('Failed to delete');
        }
    };

    // ── filtered records ─────────────────────────────────────────────────────

    const filtered = useMemo(() => {
        return records.filter(r => {
            const matchesDate = !filterDate || r.date === filterDate;
            const matchesItem = !filterItem || r.item.toLowerCase().includes(filterItem.toLowerCase());
            const matchesMachine = !filterMachine || (r.machineNumber || '').toLowerCase().includes(filterMachine.toLowerCase());
            const matchesMarket = !filterMarket || r.priceMarket === filterMarket;
            return matchesDate && matchesItem && matchesMachine && matchesMarket;
        });
    }, [records, filterDate, filterItem, filterMachine, filterMarket]);

    const chartData = useMemo(() => {
        const map = new Map<string, number>();
        filtered.forEach(r => {
            const total = r.qtyShift1 + r.qtyShift2 + r.qtyShift3;
            map.set(r.item, (map.get(r.item) || 0) + total);
        });
        return Array.from(map.entries())
            .map(([name, qty]) => ({ name, qty }))
            .sort((a, b) => b.qty - a.qty);
    }, [filtered]);

    // ── export ────────────────────────────────────────────────────────────────

    const handleExport = () => {
        const rows = filtered.map(r => ({
            Date: r.date,
            'Mch N°': r.machineNumber,
            Item: r.item,
            'Target Qty': r.targetQty,
            'Qty Shift 1': r.qtyShift1,
            'Qty Shift 2': r.qtyShift2,
            'Qty Shift 3': r.qtyShift3,
            'Total Qty': r.qtyShift1 + r.qtyShift2 + r.qtyShift3,
            'Price Target': (() => {
                const prod = products.find(p => p.item === r.item);
                if (!prod) return 0;
                const price = r.priceMarket === 'Malta' ? prod.priceMalta : prod.priceTN;
                return Number(((r.targetQty / 1000) * price).toFixed(2));
            })(),
            'Price Actual': (() => {
                const prod = products.find(p => p.item === r.item);
                if (!prod) return 0;
                const price = r.priceMarket === 'Malta' ? prod.priceMalta : prod.priceTN;
                const totalQty = r.qtyShift1 + r.qtyShift2 + r.qtyShift3;
                return Number(((totalQty / 1000) * price).toFixed(2));
            })(),
            'Efficiency Shift 1 (%)': r.efficiencyShift1,
            'Efficiency Shift 2 (%)': r.efficiencyShift2,
            'Efficiency Shift 3 (%)': r.efficiencyShift3,
            'Avg Efficiency (%)': ((r.efficiencyShift1 + r.efficiencyShift2 + r.efficiencyShift3) / 3).toFixed(1),
            'TRS': r.trs || 0,
            'Comment': r.comment || '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Rendement');
        XLSX.writeFile(wb, `machine-rendement-${new Date().toISOString().slice(0, 10)}.xlsx`);
        toast.success('Exported to Excel');
    };

    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const today = new Date();

        try {
            doc.addImage(THERMOPLASTICS_LOGO_BASE64, 'PNG', 14, 10, 35, 15);
        } catch (e) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.text('THERMOPLASTICS', 14, 20);
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('MACHINE RENDEMENT REPORT', 148, 22, { align: 'center' });

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated on: ${format(today, 'dd/MM/yyyy HH:mm')}`, 148, 27, { align: 'center' });

        // Add Active Search Filters context if any are set
        let filtersY = 32;
        const activeFilters: string[] = [];
        if (filterDate) activeFilters.push(`Date: ${filterDate}`);
        if (filterMachine) activeFilters.push(`Machine N°: #${filterMachine}`);
        if (filterItem) activeFilters.push(`Item: ${filterItem}`);
        if (filterMarket) activeFilters.push(`Market: ${filterMarket}`);

        if (activeFilters.length > 0) {
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text(`Active Filters: ${activeFilters.join('  |  ')}`, 14, filtersY);
            filtersY += 6;
        }

        // Summary Info Cards table
        const summaryData = [
            ['Total Records', filtered.length.toString(), 'Total Qty Produced', totalQty.toLocaleString()],
            ['Avg Efficiency', `${avgEff.toFixed(1)}%`, 'TRS Total', (totals.qty1 + totals.qty2 + totals.qty3).toLocaleString()],
            ['Price Target Total', `${totals.priceTarget.toFixed(2)} EUR`, 'Price Actual Total', `${totals.priceActual.toFixed(2)} EUR`]
        ];

        autoTable(doc, {
            startY: filtersY,
            body: summaryData,
            theme: 'plain',
            styles: { fontSize: 8, cellPadding: 1.5 },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 35 },
                1: { cellWidth: 40 },
                2: { fontStyle: 'bold', cellWidth: 40 },
                3: { cellWidth: 40 }
            }
        });

        let finalY = (doc as any).lastAutoTable.finalY + 8;

        const tableBody = filtered.map(r => {
            const prod = products.find(p => p.item === r.item);
            const price = r.priceMarket === 'Malta' ? (prod?.priceMalta || 0) : (prod?.priceTN || 0);
            const total = r.qtyShift1 + r.qtyShift2 + r.qtyShift3;
            const priceTarget = (r.targetQty / 1000) * price;
            const priceActual = (total / 1000) * price;
            return [
                r.date,
                `#${String(r.machineNumber || '').trim() || '---'}`,
                r.item,
                r.priceMarket || 'TN',
                r.targetQty.toLocaleString(),
                r.qtyShift1.toLocaleString(),
                `${r.efficiencyShift1.toFixed(1)}%`,
                r.qtyShift2.toLocaleString(),
                `${r.efficiencyShift2.toFixed(1)}%`,
                r.qtyShift3.toLocaleString(),
                `${r.efficiencyShift3.toFixed(1)}%`,
                (r.trs || 0).toLocaleString(),
                priceTarget.toFixed(2),
                priceActual.toFixed(2),
                r.comment || ''
            ];
        });

        autoTable(doc, {
            startY: finalY,
            head: [['Date', 'Mch N°', 'Item', 'Market', 'Target Qty', 'Shift 1', 'Eff. S1', 'Shift 2', 'Eff. S2', 'Shift 3', 'Eff. S3', 'TRS', 'Target Price', 'Actual Price', 'Comment']],
            body: tableBody,
            foot: [[
                'Totals',
                '',
                '',
                '',
                totals.targetQty.toLocaleString(),
                totals.qty1.toLocaleString(),
                '',
                totals.qty2.toLocaleString(),
                '',
                totals.qty3.toLocaleString(),
                '',
                '',
                totals.priceTarget.toFixed(2),
                totals.priceActual.toFixed(2),
                ''
            ]],
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235], fontSize: 7, cellPadding: 1.5, halign: 'center' }, // blue-600
            footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7, cellPadding: 1.5, halign: 'center' },
            bodyStyles: { fontSize: 7, cellPadding: 1.5 },
            styles: { fontSize: 7 },
            columnStyles: {
                0: { cellWidth: 16 },
                1: { cellWidth: 14 },
                2: { cellWidth: 20 },
                3: { cellWidth: 12 },
                4: { cellWidth: 18, halign: 'right' },
                5: { cellWidth: 15, halign: 'right' },
                6: { cellWidth: 13, halign: 'center' },
                7: { cellWidth: 15, halign: 'right' },
                8: { cellWidth: 13, halign: 'center' },
                9: { cellWidth: 15, halign: 'right' },
                10: { cellWidth: 13, halign: 'center' },
                11: { cellWidth: 14, halign: 'center' },
                12: { cellWidth: 18, halign: 'right' },
                13: { cellWidth: 18, halign: 'right' },
                14: { cellWidth: 30 } // comment
            }
        });

        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(8);
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.text(`Page ${i} of ${pageCount}`, 283, 202, { align: 'right' });
            doc.text('MAINTENANCE & PRODUCTION SYSTEM (CMMS)', 14, 202);
        }

        doc.save(`Machine_Rendement_Report_${format(today, 'yyyyMMdd')}.pdf`);
        toast.success('PDF report exported successfully');
    };

    // ── summary cards ─────────────────────────────────────────────────────────

    const avgEff = useMemo(() => {
        if (!filtered.length) return 0;
        const sum = filtered.reduce((acc, r) =>
            acc + (r.efficiencyShift1 + r.efficiencyShift2 + r.efficiencyShift3) / 3, 0);
        return sum / filtered.length;
    }, [filtered]);

    const totalQty = useMemo(() =>
        filtered.reduce((acc, r) => acc + r.qtyShift1 + r.qtyShift2 + r.qtyShift3, 0),
        [filtered]
    );

    const totals = useMemo(() => {
        return filtered.reduce((acc, r) => {
            const prod = products.find(p => p.item === r.item);
            const price = r.priceMarket === 'Malta' ? (prod?.priceMalta || 0) : (prod?.priceTN || 0);
            const totalActualQty = r.qtyShift1 + r.qtyShift2 + r.qtyShift3;

            acc.targetQty += r.targetQty;
            acc.qty1 += r.qtyShift1;
            acc.qty2 += r.qtyShift2;
            acc.qty3 += r.qtyShift3;
            acc.priceTarget += (r.targetQty / 1000) * price;
            acc.priceActual += (totalActualQty / 1000) * price;
            return acc;
        }, { targetQty: 0, qty1: 0, qty2: 0, qty3: 0, priceTarget: 0, priceActual: 0 });
    }, [filtered, products]);

    // ── pagination logic ──────────────────────────────────────────────────────
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const paginatedRecords = filtered.slice(startIndex, startIndex + pageSize);

    useEffect(() => {
        setCurrentPage(1);
    }, [filterDate, filterItem, filterMachine, filterMarket, pageSize]);

    // ── render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6 relative min-h-[800px]">
            {/* List View */}
            <div className={cn(
                "transition-all duration-500 ease-in-out",
                isModalOpen ? "blur-xl opacity-20 scale-95 pointer-events-none" : "blur-0 opacity-100 scale-100"
            )}>
                {/* ── Header ── */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            Rendement Machines
                        </h1>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <button
                            onClick={handleExport}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl hover:bg-emerald-100 transition-all font-inter"
                        >
                            <Download size={16} />
                            Export Excel
                        </button>
                        <button
                            onClick={handleExportPDF}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-700 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-all font-inter"
                        >
                            <Download size={16} />
                            Export PDF
                        </button>
                        <button
                            onClick={openCreate}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                        >
                            <Plus size={16} />
                            Add Rendement
                        </button>
                        <button
                            onClick={fetchAll}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                            title="Refresh"
                        >
                            <RefreshCw size={18} className={cn(loading && 'animate-spin')} />
                        </button>
                    </div>
                </div>

                {/* ── Summary Cards ── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                    <SummaryCard
                        icon={<Activity size={20} className="text-blue-600" />}
                        label="Total Records"
                        value={filtered.length.toString()}
                        bg="bg-blue-50"
                    />
                    <SummaryCard
                        icon={<Target size={20} className="text-purple-600" />}
                        label="Total Qty Produced"
                        value={totalQty.toLocaleString()}
                        bg="bg-purple-50"
                    />
                    <SummaryCard
                        icon={<TrendingUp size={20} className={avgEff >= 80 ? 'text-emerald-600' : 'text-amber-600'} />}
                        label="Avg Efficiency"
                        value={`${avgEff.toFixed(1)}%`}
                        bg={avgEff >= 80 ? 'bg-emerald-50' : 'bg-amber-50'}
                    />
                </div>

                {/* ── Chart Section ── */}
                {filtered.length > 0 && (
                    <div className="p-6 bg-white border border-gray-100 shadow-sm rounded-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 mt-6">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Production by Item</h3>
                                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mt-1">Quantity Produced (Total Shifts)</p>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-lg">
                                <TrendingUp size={14} className="text-blue-600" />
                                <span className="text-xs font-bold text-blue-700">Live Production Data</span>
                            </div>
                        </div>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorQty" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                                        dy={10}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: '12px',
                                            border: 'none',
                                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                            fontSize: '12px',
                                            fontWeight: '700'
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="qty"
                                        stroke="#2563eb"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorQty)"
                                        animationDuration={1500}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* ── Filters ── */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-white border border-gray-100 shadow-sm rounded-2xl mt-6">
                    <div className="flex items-center gap-4">
                        <Calendar size={18} className="text-gray-400 flex-shrink-0" />
                        <div className="flex items-center gap-2 flex-1">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Date</label>
                            <input
                                type="date"
                                value={filterDate}
                                onChange={e => setFilterDate(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                            />
                            {filterDate && (
                                <button
                                    onClick={() => setFilterDate('')}
                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <Monitor size={18} className="text-gray-400 flex-shrink-0" />
                        <div className="flex items-center gap-2 flex-1">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Machine N°</label>
                            <div className="relative w-full">
                                <input
                                    type="text"
                                    placeholder="Machine No..."
                                    value={filterMachine}
                                    onChange={e => setFilterMachine(e.target.value)}
                                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                />
                                {filterMachine && (
                                    <button
                                        onClick={() => setFilterMachine('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <Search size={18} className="text-gray-400 flex-shrink-0" />
                        <div className="flex items-center gap-2 flex-1">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Item</label>
                            <div className="relative w-full">
                                <input
                                    type="text"
                                    placeholder="Search items..."
                                    value={filterItem}
                                    onChange={e => setFilterItem(e.target.value)}
                                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                />
                                {filterItem && (
                                    <button
                                        onClick={() => setFilterItem('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <Target size={18} className="text-gray-400 flex-shrink-0" />
                        <div className="flex items-center gap-2 flex-1">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Market</label>
                            <select
                                value={filterMarket}
                                onChange={e => setFilterMarket(e.target.value as any)}
                                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                            >
                                <option value="">All Markets</option>
                                <option value="TN">TN Price</option>
                                <option value="Malta">Malta Price</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* ── Table ── */}
                <div className="bg-white border border-gray-100 shadow-xl shadow-gray-200/50 rounded-2xl overflow-hidden mt-6">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[1000px]">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-100">
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Date</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Mch N°</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Item</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Market</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Target Qty</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Shift 1 Qty</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Eff. S1</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Shift 2 Qty</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Eff. S2</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Shift 3 Qty</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Eff. S3</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">TRS</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Price Target</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Price Actual</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Comment</th>
                                    <th className="px-5 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan={16} className="px-5 py-5">
                                                <div className="h-4 bg-gray-100 rounded w-full" />
                                            </td>
                                        </tr>
                                    ))
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={16} className="px-5 py-16 text-center">
                                            <div className="inline-flex flex-col items-center">
                                                <div className="p-4 bg-gray-50 rounded-full mb-3">
                                                    <Activity size={28} className="text-gray-300" />
                                                </div>
                                                <p className="text-sm font-bold text-gray-900">No records found</p>
                                                <p className="text-xs text-gray-400 mt-1">Click "Add Record" to get started.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedRecords.map(rec => (
                                        <tr key={rec.id} className="hover:bg-blue-50/20 transition-colors group">
                                            <td className="px-5 py-4 text-sm font-semibold text-gray-700">{rec.date}</td>
                                            <td className="px-5 py-4">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-blue-50 text-black-700 text-xs font-bold">
                                                    #{String(rec.machineNumber || '').trim() || '---'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="text-sm font-bold text-gray-900">{rec.item}</span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                    rec.priceMarket === 'Malta' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                                                )}>
                                                    {rec.priceMarket || 'TN'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <span className="text-sm font-bold text-gray-700 tabular-nums">
                                                    {rec.targetQty.toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-center text-sm font-bold text-gray-700 tabular-nums">
                                                {rec.qtyShift1.toLocaleString()}
                                            </td>
                                            <td className="px-5 py-4 text-center">{effBadge(rec.efficiencyShift1)}</td>
                                            <td className="px-5 py-4 text-center text-sm font-bold text-gray-700 tabular-nums">
                                                {rec.qtyShift2.toLocaleString()}
                                            </td>
                                            <td className="px-5 py-4 text-center">{effBadge(rec.efficiencyShift2)}</td>
                                            <td className="px-5 py-4 text-center text-sm font-bold text-gray-700 tabular-nums">
                                                {rec.qtyShift3.toLocaleString()}
                                            </td>
                                            <td className="px-5 py-4 text-center">{effBadge(rec.efficiencyShift3)}</td>
                                            <td className="px-5 py-4 text-center">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold tabular-nums">
                                                    {(rec.trs || 0).toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <span className="text-sm font-bold text-emerald-600 tabular-nums">
                                                    {(() => {
                                                        const prod = products.find(p => p.item === rec.item);
                                                        if (!prod) return '0.00';
                                                        const price = rec.priceMarket === 'Malta' ? prod.priceMalta : prod.priceTN;
                                                        return ((rec.targetQty / 1000) * price).toFixed(2);
                                                    })()}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <span className="text-sm font-bold text-blue-600 tabular-nums">
                                                    {(() => {
                                                        const prod = products.find(p => p.item === rec.item);
                                                        if (!prod) return '0.00';
                                                        const price = rec.priceMarket === 'Malta' ? prod.priceMalta : prod.priceTN;
                                                        const totalQty = rec.qtyShift1 + rec.qtyShift2 + rec.qtyShift3;
                                                        return ((totalQty / 1000) * price).toFixed(2);
                                                    })()}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="text-xs text-gray-500 max-w-[200px] truncate" title={rec.comment}>
                                                    {rec.comment || '---'}
                                                </p>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => openEdit(rec)}
                                                        className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                                    >
                                                        <Edit2 size={15} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(rec.id!)}
                                                        className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {filtered.length > 0 && (
                                <tfoot className="sticky bottom-0 z-20 bg-white border-t-4 border-gray-100 font-bold shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)]">
                                    <tr className="divide-x divide-gray-50">
                                        <td colSpan={4} className="px-5 py-4 text-xs font-black text-gray-500 uppercase tracking-wider bg-gray-50/95 backdrop-blur-sm">Totals</td>
                                        <td className="px-5 py-4 text-center text-sm text-gray-900 tabular-nums bg-gray-50/95 backdrop-blur-sm">
                                            {totals.targetQty.toLocaleString()}
                                        </td>
                                        <td className="px-5 py-4 text-center text-sm text-gray-900 tabular-nums bg-gray-50/95 backdrop-blur-sm">
                                            {totals.qty1.toLocaleString()}
                                        </td>
                                        <td className="px-5 py-4 bg-gray-50/95 backdrop-blur-sm" />
                                        <td className="px-5 py-4 text-center text-sm text-gray-900 tabular-nums bg-gray-50/95 backdrop-blur-sm">
                                            {totals.qty2.toLocaleString()}
                                        </td>
                                        <td className="px-5 py-4 bg-gray-50/95 backdrop-blur-sm" />
                                        <td className="px-5 py-4 text-center text-sm text-gray-900 tabular-nums bg-gray-50/95 backdrop-blur-sm">
                                            {totals.qty3.toLocaleString()}
                                        </td>
                                        <td className="px-5 py-4 bg-gray-50/95 backdrop-blur-sm" />
                                        <td className="px-5 py-4 bg-gray-50/95 backdrop-blur-sm" />
                                        <td className="px-5 py-4 text-center text-sm text-emerald-600 tabular-nums bg-gray-50/95 backdrop-blur-sm">
                                            {totals.priceTarget.toFixed(2)}
                                        </td>
                                        <td className="px-5 py-4 text-center text-sm text-blue-600 tabular-nums bg-gray-50/95 backdrop-blur-sm">
                                            {totals.priceActual.toFixed(2)}
                                        </td>
                                        <td colSpan={2} className="px-5 py-4 bg-gray-50/95 backdrop-blur-sm" />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    {/* ── Pagination Footer ── */}
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-8">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Items</span>
                                <span className="text-sm font-bold text-gray-700">{totalItems}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Selected Items</span>
                                <span className="text-sm font-bold text-gray-700">0</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Page Size:</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => setPageSize(Number(e.target.value))}
                                    className="bg-white border border-gray-200 rounded-lg text-xs font-bold px-2 py-1.5 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                >
                                    {[10, 25, 50, 100].map(sz => (
                                        <option key={sz} value={sz}>{sz}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                    <ChevronsLeft size={16} />
                                </button>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                    <ChevronLeft size={16} />
                                </button>

                                <div className="flex items-center px-3 py-1.5 bg-white border border-gray-200 rounded-lg">
                                    <span className="text-xs font-bold text-blue-600">{currentPage}</span>
                                    <span className="mx-2 text-gray-300 text-xs">/</span>
                                    <span className="text-xs font-bold text-gray-400">{totalPages || 1}</span>
                                </div>

                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages || totalPages === 0}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                    <ChevronRight size={16} />
                                </button>
                                <button
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage === totalPages || totalPages === 0}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                    <ChevronsRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Form View Overlay ── */}
            {isModalOpen && (
                <div className="absolute inset-x-0 top-0 z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">
                                {editingRecord ? 'Edit Rendement Record' : 'New Rendement Record'}
                            </h1>
                            <p className="text-gray-500">Fill in the details below to save the rendement record.</p>
                        </div>
                        <button
                            onClick={() => setIsModalOpen(false)}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-inter"
                        >
                            Back to List
                        </button>
                    </div>

                    <div className="bg-white/90 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-2xl p-8">
                        <form onSubmit={handleSave} className="space-y-5">
                            {/* Date + Machine */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Date</label>
                                    <input
                                        required
                                        type="date"
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium"
                                        value={form.date}
                                        onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Machine No</label>
                                    <SearchableSelect
                                        options={machines}
                                        value={form.machineNumber}
                                        getLabel={m => String(m.siteNumber || m.name || 'Unknown').trim()}
                                        getValue={m => String(m.siteNumber || m.name || '').trim()}
                                        getDescription={m => `${m.name || ''} ${m.type ? '- ' + m.type : ''}`}
                                        onChange={val => setForm(f => ({ ...f, machineNumber: val }))}
                                        placeholder="Select machine..."
                                    />
                                </div>
                            </div>

                            {/* Item and Price Market */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Item</label>
                                    <SearchableSelect
                                        options={products}
                                        value={form.item}
                                        getLabel={p => p.item}
                                        getValue={p => p.item}
                                        getDescription={p => p.description}
                                        onChange={val => setForm(f => ({ ...f, item: val }))}
                                        placeholder="Select item..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Price Market</label>
                                    <select
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium h-[42px]"
                                        value={form.priceMarket || 'TN'}
                                        onChange={e => setForm(f => ({ ...f, priceMarket: e.target.value as 'TN' | 'Malta' }))}
                                    >
                                        <option value="TN">TN Price</option>
                                        <option value="Malta">Malta Price</option>
                                    </select>
                                </div>
                            </div>

                            {/* Target Qty (read-only) */}
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                                    Target Qty to Produce <span className="normal-case font-normal text-gray-400">(auto-calculated)</span>
                                </label>
                                <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl">
                                    <Target size={16} className="text-blue-500 flex-shrink-0" />
                                    <span className="text-lg font-bold text-blue-700 tabular-nums">
                                        {form.targetQty.toLocaleString()}
                                    </span>
                                    {selectedProduct && (
                                        <span className="text-xs text-blue-400 ml-auto">
                                            = ({selectedProduct.qtyProduced.toLocaleString()} × 28800) ÷ {selectedProduct.cycleTime}s
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* TRS Calculation Section */}
                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-1.5 bg-blue-100 rounded-lg text-blue-600">
                                        <TrendingUp size={16} />
                                    </div>
                                    <h3 className="text-sm font-bold text-gray-900">TRS</h3>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Actual Cycle Time (sec)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            className="w-full px-3 py-2 bg-white border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold tabular-nums"
                                            value={form.actualCycleTime}
                                            onChange={e => handleTRSInputChange('actualCycleTime', Number(e.target.value))}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Actual Cavities Running</label>
                                        <input
                                            type="number"
                                            min="0"
                                            className="w-full px-3 py-2 bg-white border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold tabular-nums"
                                            value={form.actualCavitiesRunning}
                                            onChange={e => handleTRSInputChange('actualCavitiesRunning', Number(e.target.value))}
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-gray-200/50">
                                    <span className="text-xs font-bold text-gray-500">TRS:</span>
                                    <span className="text-lg font-black text-blue-600 tabular-nums">
                                        {(form.trs || 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            {/* Shifts */}
                            <div className="space-y-3">
                                {([1, 2, 3] as const).map(shift => (
                                    <div key={shift} className="grid grid-cols-2 gap-3 items-end">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                                                Qty Produced – Shift {shift}
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold tabular-nums"
                                                value={form[`qtyShift${shift}`]}
                                                onChange={e => handleQtyChange(shift, Number(e.target.value))}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                                                Efficiency Shift {shift}
                                            </label>
                                            <div className={cn(
                                                'flex items-center gap-2 px-3 py-2.5 rounded-xl border font-bold tabular-nums text-sm',
                                                effColor(form[`efficiencyShift${shift}`]),
                                                'border-transparent'
                                            )}>
                                                <TrendingUp size={14} />
                                                {form[`efficiencyShift${shift}`].toFixed(1)}%
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Comment */}
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Comment / Problems encountered</label>
                                <textarea
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium min-h-[80px]"
                                    placeholder="Describe any problems or notes here..."
                                    value={form.comment}
                                    onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                                >
                                    <Save size={15} />
                                    {editingRecord ? 'Update' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── summary card sub-component ──────────────────────────────────────────────

function SummaryCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: string; bg: string }) {
    return (
        <div className={cn('flex items-center gap-4 p-5 rounded-2xl border border-white shadow-sm', bg)}>
            <div className="p-2.5 bg-white rounded-xl shadow-sm flex-shrink-0">{icon}</div>
            <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</p>
                <p className="text-xl font-bold text-gray-900 tabular-nums mt-0.5">{value}</p>
            </div>
        </div>
    );
}
