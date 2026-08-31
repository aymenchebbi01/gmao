import React, { useState, useEffect } from 'react';
import {
    ShoppingCart,
    Download,
    Plus,
    Trash2,
    RefreshCw,
    FileText,
    Package,
    CheckCircle2,
    Edit2,
    Search,
    X,
    Send
} from 'lucide-react';
import { SparePart } from '../types';
import { api } from '../services/api';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { THERMOPLASTICS_LOGO_BASE64 } from '../constants/logo';
import { useAuth } from '../contexts/AuthContext';
import TableFooter from './ui/TableFooter';

export interface PurchaseItem {
    id: string;
    name: string;
    sku: string;
    category: string;
    location: string;
    unit: string;
    currentStock: number;
    minStock: number;
    qtyToOrder: number;
    remark: string;
    isManual?: boolean;
    imageDataUrl?: string; // base64 data URL for item photo
}

const defaultManualItem = (): PurchaseItem => ({
    id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    name: '',
    sku: '',
    category: '',
    location: '',
    unit: 'pcs',
    currentStock: 0,
    minStock: 0,
    qtyToOrder: 1,
    remark: '',
    isManual: true,
    imageDataUrl: undefined,
});

export default function PurchaseRequests() {
    const { user, isAdmin } = useAuth();
    const [history, setHistory] = useState<any[]>([]);
    const [lastRef, setLastRef] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [sendingEmailId, setSendingEmailId] = useState<number | null>(null);

    // Spare parts list for auto-complete when creating a PR
    const [spareParts, setSpareParts] = useState<SparePart[]>([]);

    // History search and edit states
    const [historySearch, setHistorySearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Admin Edit modal state
    const [editingRequest, setEditingRequest] = useState<any | null>(null);
    const [editDemandeur, setEditDemandeur] = useState('');
    const [editSupplier, setEditSupplier] = useState('');
    const [editDepartment, setEditDepartment] = useState('');

    // New Purchase Request inline form state
    const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
    const [createRequestedBy, setCreateRequestedBy] = useState('');
    const [createDepartment, setCreateDepartment] = useState('Maintenance');
    const [createSupplier, setCreateSupplier] = useState('');
    const [createNotes, setCreateNotes] = useState('');
    const [createItems, setCreateItems] = useState<PurchaseItem[]>([]);
    const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

    const getStatusStyle = (status: string) => {
        const val = status || 'Waiting for validation';
        switch (val) {
            case 'Waiting for validation':
                return 'bg-amber-50 text-amber-700 border-amber-100';
            case 'Waiting for reception':
                return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'In progress':
                return 'bg-purple-50 text-purple-700 border-purple-100';
            case 'Purchased':
                return 'bg-emerald-50 text-emerald-700 border-emerald-100';
            case 'Cancelled':
                return 'bg-red-50 text-red-700 border-red-100';
            default:
                return 'bg-gray-50 text-gray-700 border-gray-100';
        }
    };

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const data = await api.getPurchaseRequests();
            setHistory(data);
            const lr = await api.getLastPurchaseRequestRef();
            setLastRef(lr.lastRef);
        } catch (err) {
            console.error('Failed to load history', err);
            toast.error('Erreur lors du chargement des demandes d\'achat');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    const generateNextRef = (currentLastRef: string | null) => {
        const year = new Date().getFullYear();
        if (!currentLastRef) return `DA-${year}00001`;

        const parts = currentLastRef.split('-');
        if (parts.length < 2) return `DA-${year}00001`;

        const refPart = parts[1]; // e.g. "202600001"
        const refYear = parseInt(refPart.substring(0, 4));
        const seq = parseInt(refPart.substring(4));

        if (refYear < year) {
            return `DA-${year}00001`;
        }

        const nextSeq = (seq + 1).toString().padStart(5, '0');
        return `DA-${year}${nextSeq}`;
    };

    const currentRefNum = generateNextRef(lastRef);

    const handleEditClick = (req: any) => {
        setEditingRequest(req);
        setEditDemandeur(req.requested_by || '');
        setEditSupplier(req.supplier || '');
        setEditDepartment(req.department || '');
    };

    const handleSaveEdit = async () => {
        if (!editingRequest) return;
        try {
            const updated = {
                ...editingRequest,
                requested_by: editDemandeur,
                supplier: editSupplier,
                department: editDepartment
            };
            await api.updatePurchaseRequest(editingRequest.id, updated);
            toast.success('Demande d\'achat mise à jour');
            setEditingRequest(null);
            fetchHistory();
        } catch (err) {
            toast.error('Échec de la mise à jour');
        }
    };

    const handleDeleteRequest = async (id: number) => {
        if (!window.confirm('Voulez-vous vraiment supprimer cette demande d\'achat de l\'historique ?')) return;
        try {
            await api.deletePurchaseRequest(id);
            toast.success('Demande d\'achat supprimée de l\'historique');
            fetchHistory();
        } catch (err) {
            toast.error('Échec de la suppression');
        }
    };

    const handleSendEmail = async (id: number) => {
        setSendingEmailId(id);
        try {
            await api.sendPurchaseRequestEmail(id);
            toast.success('Demande d\'achat envoyée à la comptabilité ✓');
        } catch (err: any) {
            toast.error(err.message || 'Échec de l\'envoi de l\'email');
        } finally {
            setSendingEmailId(null);
        }
    };

    // Open creation inline form
    const handleOpenCreateModal = async () => {
        setCreateRequestedBy(user?.displayName || user?.username || '');
        setCreateDepartment('Maintenance');
        setCreateSupplier('');
        setCreateNotes('');
        setCreateItems([defaultManualItem()]);
        setIsCreateFormOpen(true);

        try {
            const allParts = await api.getSpareParts();
            setSpareParts(allParts);
        } catch (err) {
            console.error('Failed to fetch spare parts', err);
        }
    };

    // Handle item image upload
    const handleItemImageUpload = (itemId: string, file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            setCreateItems(prev => prev.map(i => i.id === itemId ? { ...i, imageDataUrl: dataUrl } : i));
        };
        reader.readAsDataURL(file);
    };

    const handleAddCreateItem = () => {
        setCreateItems(prev => [...prev, defaultManualItem()]);
    };

    const handleUpdateCreateItem = (id: string, field: keyof PurchaseItem, value: any) => {
        setCreateItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    };

    const handleRemoveCreateItem = (id: string) => {
        if (createItems.length <= 1) {
            toast.error('Une demande doit contenir au moins un article');
            return;
        }
        setCreateItems(prev => prev.filter(i => i.id !== id));
    };

    const handleSelectSparePart = (itemId: string, partId: string) => {
        const selected = spareParts.find(p => p.id === partId);
        if (!selected) return;

        setCreateItems(prev => prev.map(item => {
            if (item.id === itemId) {
                return {
                    ...item,
                    name: selected.name,
                    sku: selected.sku || '',
                    category: selected.category || '',
                    location: selected.location || '',
                    unit: selected.unit || 'pcs',
                    currentStock: selected.stock || 0,
                    minStock: selected.minStock || 0,
                    isManual: false,
                };
            }
            return item;
        }));
    };

    const generatePDFForRequest = (
        refNum: string,
        reqBy: string,
        dept: string,
        supp: string,
        remarks: string,
        prItems: PurchaseItem[]
    ) => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        // ---- Header ----
        try {
            doc.addImage(THERMOPLASTICS_LOGO_BASE64, 'PNG', 14, 10, 35, 15);
        } catch (e) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.text('THERMOPLASTICS', 14, 20);
        }

        // Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('DEMANDE D\'ACHAT', 105, 18, { align: 'center' });

        // Horizontal Line
        doc.setDrawColor(0);
        doc.setLineWidth(0.4);
        doc.line(14, 30, 196, 30);

        // Meta Info
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`N° DA : ${refNum}`, 14, 40);
        doc.text(`Date d'émission : ${format(new Date(), 'dd/MM/yyyy')}`, 130, 40);

        // Table — include photo column if any item has an image
        const hasImages = prItems.some(i => !!i.imageDataUrl);
        const tableHead = hasImages
            ? [['Reference', 'Désignation Article', 'Quantité', 'Unité', 'Stock actuel', 'Fournisseur', 'Photo']]
            : [['Reference', 'Désignation Article', 'Quantité', 'Unité', 'Stock actuel', 'Fournisseur']];

        const tableBody = prItems.map((item) => {
            const base = [
                item.sku || '',
                item.name,
                String(item.qtyToOrder),
                item.unit,
                item.isManual ? '' : String(item.currentStock),
                supp || '',
            ];
            if (hasImages) base.push(item.imageDataUrl ? '' : ''); // placeholder — images added didDrawCell
            return base;
        });


        const columnStylesBase: any = {
            0: { cellWidth: 28 },
            1: { cellWidth: hasImages ? 38 : 45 },
            2: { halign: 'center' as const, cellWidth: 18 },
            3: { halign: 'center' as const, cellWidth: 14 },
            4: { halign: 'center' as const, cellWidth: 22 },
            5: { halign: 'center' as const, cellWidth: hasImages ? 22 : undefined },
        };
        if (hasImages) columnStylesBase[6] = { cellWidth: 30, halign: 'center' as const };

        autoTable(doc, {
            startY: 46,
            head: tableHead,
            body: tableBody,
            theme: 'grid',
            headStyles: {
                fillColor: [255, 255, 255],
                textColor: [0, 0, 0],
                fontStyle: 'bold',
                fontSize: 9,
                halign: 'center',
                lineWidth: 0.2,
                lineColor: [0, 0, 0]
            },
            bodyStyles: {
                fontSize: 9,
                cellPadding: 3,
                textColor: [0, 0, 0],
                lineWidth: 0.2,
                lineColor: [0, 0, 0],
                minCellHeight: hasImages ? 28 : 10,
            },
            columnStyles: columnStylesBase,
            margin: { left: 14, right: 14 },
            didDrawCell: (data: any) => {
                if (!hasImages) return;
                const col = data.column.index;
                const row = data.row.index;
                if (data.section === 'body' && col === 6 && row < prItems.length) {
                    const item = prItems[row];
                    if (item.imageDataUrl) {
                        try {
                            const ext = item.imageDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
                            doc.addImage(
                                item.imageDataUrl,
                                ext,
                                data.cell.x + 2,
                                data.cell.y + 2,
                                26,
                                24
                            );
                        } catch (_) { }
                    }
                }
            },
        });

        let finalY = (doc as any).lastAutoTable.finalY + 15;

        if (finalY > 230) {
            doc.addPage();
            finalY = 20;
        }

        // Remarks
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const remarkText = remarks ? `Remarque : ${remarks}` : 'Remarque : ..............................................................................................................................................';
        doc.text(remarkText, 14, finalY);

        finalY += 10;

        // Signatures Block
        doc.setLineWidth(0.2);
        doc.rect(14, finalY, 91, 14);
        doc.rect(105, finalY, 91, 14);

        doc.setFontSize(9);
        doc.text(`Demandeur : ${reqBy || '....................................................'}`, 16, finalY + 5);
        doc.text(`Visa : .................................................................`, 16, finalY + 11);

        doc.text(`Validation supérieur hiérarchique: .............................`, 107, finalY + 5);
        doc.text(`Date : .................................................................`, 107, finalY + 11);

        finalY += 25;
        doc.text(`Visa Directeur des opérations: .........................................................................`, 105, finalY, { align: 'center' });

        doc.setFontSize(8);
        doc.text('Page : 1 / 1', 14, 285);
        doc.text('DASACH03/V01/01032025/WN', 196, 285, { align: 'right' });

        const pdfBase64 = doc.output('datauristring');
        doc.save(`Demande_Achat_${refNum}.pdf`);
        return pdfBase64;
    };

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const validItems = createItems.filter(i => i.name.trim() !== '');
        if (validItems.length === 0) {
            toast.error('Veuillez ajouter au moins un article avec un nom valide');
            return;
        }

        setIsSubmittingCreate(true);
        try {
            const pdfBase64 = generatePDFForRequest(
                currentRefNum,
                createRequestedBy,
                createDepartment,
                createSupplier,
                createNotes,
                validItems
            );

            await api.savePurchaseRequest({
                reference: currentRefNum,
                date: format(new Date(), 'yyyy-MM-dd'),
                requested_by: createRequestedBy,
                department: createDepartment,
                supplier: createSupplier,
                items_count: validItems.length,
                pdf_data: pdfBase64
            });

            toast.success(`Demande d'achat ${currentRefNum} créée et enregistrée !`);
            setIsCreateFormOpen(false);
            fetchHistory();
        } catch (err) {
            console.error('Failed to create purchase request', err);
            toast.error('Erreur lors de la création de la demande d\'achat');
        } finally {
            setIsSubmittingCreate(false);
        }
    };

    // --- History computed values ---
    const filteredHistory = history.filter(req => {
        const query = historySearch.toLowerCase();
        const matchesSearch = (
            req.reference.toLowerCase().includes(query) ||
            (req.requested_by || '').toLowerCase().includes(query) ||
            (req.supplier || '').toLowerCase().includes(query) ||
            (req.department || '').toLowerCase().includes(query)
        );
        const matchesStatus = !statusFilter || (req.status || 'Waiting for validation') === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const totalPages = Math.ceil(filteredHistory.length / pageSize) || 1;
    const paginatedHistory = filteredHistory.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const statusCounts = {
        total: history.length,
        waiting_validation: history.filter(r => (r.status || 'Waiting for validation') === 'Waiting for validation').length,
        waiting_reception: history.filter(r => (r.status || 'Waiting for validation') === 'Waiting for reception').length,
        in_progress: history.filter(r => (r.status || 'Waiting for validation') === 'In progress').length,
        purchased: history.filter(r => (r.status || 'Waiting for validation') === 'Purchased').length,
        cancelled: history.filter(r => (r.status || 'Waiting for validation') === 'Cancelled').length,
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    };

    const resetFilters = () => {
        setHistorySearch('');
        setStatusFilter('');
        setCurrentPage(1);
    };

    return (
        <div className="space-y-6 relative min-h-[800px]">
            {/* Main Content with Blur Effect */}
            <div className={cn(
                "transition-all duration-500 ease-in-out space-y-6",
                (isCreateFormOpen || !!editingRequest) ? "blur-xl opacity-20 scale-95 pointer-events-none" : "blur-0 opacity-100 scale-100"
            )}>
                {/* Page Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Demande d'Achat</h1>
                        <p className="text-xs text-gray-500 mt-0.5">Gestion et suivi des demandes d'achat</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={fetchHistory}
                            disabled={loading}
                            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50"
                            title="Actualiser l'historique"
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                        {user?.role !== 'accounting' && (
                            <button
                                onClick={handleOpenCreateModal}
                                className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                            >
                                <Plus size={18} />
                                Nouvelle Demande
                            </button>
                        )}
                    </div>
                </div>

                {/* Summary Stats Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 flex flex-col gap-1">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total</p>
                        <p className="text-2xl font-bold text-gray-900">{statusCounts.total}</p>
                    </div>
                    <button
                        onClick={() => { setStatusFilter(statusFilter === 'Waiting for validation' ? '' : 'Waiting for validation'); setCurrentPage(1); }}
                        className={cn("text-left bg-amber-50 border rounded-2xl p-4 flex flex-col gap-1 transition-all hover:shadow-md", statusFilter === 'Waiting for validation' ? 'border-amber-400 ring-2 ring-amber-300' : 'border-amber-100')}
                    >
                        <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Waiting for validation</p>
                        <p className="text-2xl font-bold text-amber-700">{statusCounts.waiting_validation}</p>
                    </button>
                    <button
                        onClick={() => { setStatusFilter(statusFilter === 'Waiting for reception' ? '' : 'Waiting for reception'); setCurrentPage(1); }}
                        className={cn("text-left bg-blue-50 border rounded-2xl p-4 flex flex-col gap-1 transition-all hover:shadow-md", statusFilter === 'Waiting for reception' ? 'border-blue-400 ring-2 ring-blue-300' : 'border-blue-100')}
                    >
                        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Waiting for reception</p>
                        <p className="text-2xl font-bold text-blue-700">{statusCounts.waiting_reception}</p>
                    </button>
                    <button
                        onClick={() => { setStatusFilter(statusFilter === 'In progress' ? '' : 'In progress'); setCurrentPage(1); }}
                        className={cn("text-left bg-purple-50 border rounded-2xl p-4 flex flex-col gap-1 transition-all hover:shadow-md", statusFilter === 'In progress' ? 'border-purple-400 ring-2 ring-purple-300' : 'border-purple-100')}
                    >
                        <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider">In progress</p>
                        <p className="text-2xl font-bold text-purple-700">{statusCounts.in_progress}</p>
                    </button>
                    <button
                        onClick={() => { setStatusFilter(statusFilter === 'Purchased' ? '' : 'Purchased'); setCurrentPage(1); }}
                        className={cn("text-left bg-emerald-50 border rounded-2xl p-4 flex flex-col gap-1 transition-all hover:shadow-md", statusFilter === 'Purchased' ? 'border-emerald-400 ring-2 ring-emerald-300' : 'border-emerald-100')}
                    >
                        <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Purchased</p>
                        <p className="text-2xl font-bold text-emerald-700">{statusCounts.purchased}</p>
                    </button>
                    <button
                        onClick={() => { setStatusFilter(statusFilter === 'Cancelled' ? '' : 'Cancelled'); setCurrentPage(1); }}
                        className={cn("text-left bg-red-50 border rounded-2xl p-4 flex flex-col gap-1 transition-all hover:shadow-md", statusFilter === 'Cancelled' ? 'border-red-400 ring-2 ring-red-300' : 'border-red-100')}
                    >
                        <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Cancelled</p>
                        <p className="text-2xl font-bold text-red-700">{statusCounts.cancelled}</p>
                    </button>
                </div>

                {/* Filter Bar */}
                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="Rechercher (Réf, demandeur, fournisseur...)"
                            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            value={historySearch}
                            onChange={e => { setHistorySearch(e.target.value); setCurrentPage(1); }}
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                        className={cn(
                            "px-3 py-2.5 text-sm border rounded-xl outline-none transition-all min-w-[190px]",
                            statusFilter ? 'border-blue-400 ring-2 ring-blue-100 font-semibold' : 'border-gray-200'
                        )}
                    >
                        <option value="">Tous les statuts</option>
                        <option value="Waiting for validation">Waiting for validation</option>
                        <option value="Waiting for reception">Waiting for reception</option>
                        <option value="In progress">In progress</option>
                        <option value="Purchased">Purchased</option>
                        <option value="Cancelled">Cancelled</option>
                    </select>
                    {(historySearch || statusFilter) && (
                        <button
                            onClick={resetFilters}
                            className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors whitespace-nowrap"
                        >
                            <X size={14} /> Clear filters
                        </button>
                    )}
                </div>

                {/* Table */}
                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="bg-gray-50/70 border-b border-gray-100">
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Référence</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Demandeur</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Fournisseur</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Articles</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Statut</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-16 text-center">
                                            <div className="flex items-center justify-center gap-2 text-gray-500">
                                                <RefreshCw size={18} className="animate-spin text-blue-600" />
                                                <span>Chargement des demandes d'achat...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : paginatedHistory.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-16 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                                                    <FileText size={24} className="text-gray-400" />
                                                </div>
                                                <p className="text-sm font-semibold text-gray-500">Aucune demande trouvée</p>
                                                <p className="text-xs text-gray-400">
                                                    {historySearch || statusFilter
                                                        ? 'Aucun résultat pour les filtres actuels.'
                                                        : 'Aucune demande d\'achat enregistrée.'}
                                                </p>
                                                {(historySearch || statusFilter) && (
                                                    <button
                                                        onClick={resetFilters}
                                                        className="mt-1 text-xs text-blue-600 hover:underline"
                                                    >
                                                        Réinitialiser les filtres
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : paginatedHistory.map((req) => (
                                    <tr key={req.id} className="hover:bg-gray-50/60 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="font-mono font-bold text-blue-600">{req.reference}</span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            {format(new Date(req.date), 'dd/MM/yyyy')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-medium text-gray-900">{req.requested_by}</div>
                                            <div className="text-xs text-gray-500">{req.department}</div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">{req.supplier || '—'}</td>
                                        <td className="px-6 py-4">
                                            <span className="px-2.5 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
                                                {req.items_count} pos.
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {user?.role === 'accounting' ? (
                                                <select
                                                    value={req.status || 'Waiting for validation'}
                                                    onChange={async (e) => {
                                                        const newStatus = e.target.value;
                                                        try {
                                                            await api.updatePurchaseRequestStatus(req.id, newStatus);
                                                            toast.success('Statut mis à jour');
                                                            fetchHistory();
                                                        } catch (err) {
                                                            toast.error('Erreur de mise à jour');
                                                        }
                                                    }}
                                                    className={cn(
                                                        "px-2.5 py-1 rounded-full text-xs font-bold border outline-none cursor-pointer uppercase transition-all",
                                                        getStatusStyle(req.status)
                                                    )}
                                                >
                                                    <option value="Waiting for validation">Waiting for validation</option>
                                                    <option value="Waiting for reception">Waiting for reception</option>
                                                    <option value="In progress">In progress</option>
                                                    <option value="Purchased">Purchased</option>
                                                    <option value="Cancelled">Cancelled</option>
                                                </select>
                                            ) : (
                                                <span className={cn(
                                                    "px-2.5 py-1 rounded-full text-xs font-bold border uppercase inline-block",
                                                    getStatusStyle(req.status)
                                                )}>
                                                    {req.status || 'Waiting for validation'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => {
                                                        const link = document.createElement('a');
                                                        link.href = req.pdf_data;
                                                        link.download = `Demande_Achat_${req.reference}.pdf`;
                                                        link.click();
                                                    }}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                                                    title="Télécharger PDF"
                                                >
                                                    <Download size={13} />
                                                    PDF
                                                </button>
                                                {user?.role !== 'accounting' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleSendEmail(req.id)}
                                                            disabled={sendingEmailId === req.id}
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                                            title="Envoyer par email"
                                                        >
                                                            {sendingEmailId === req.id ? (
                                                                <RefreshCw size={13} className="animate-spin" />
                                                            ) : (
                                                                <Send size={13} />
                                                            )}
                                                            Envoyer
                                                        </button>
                                                        {isAdmin && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleEditClick(req)}
                                                                    className="p-1 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-all"
                                                                    title="Modifier"
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteRequest(req.id)}
                                                                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                                                                    title="Supprimer"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Standard Table Footer */}
                    <TableFooter
                        totalItems={filteredHistory.length}
                        pageSize={pageSize}
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageSizeChange={size => {
                            setPageSize(size);
                            setCurrentPage(1);
                        }}
                        onPageChange={handlePageChange}
                    />
                </div>
            </div>

            {/* ── Inline Create Form Overlay (same pattern as Rendement/Inventory) ── */}
            {isCreateFormOpen && (
                <div className="absolute inset-x-0 top-0 z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Form Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Nouvelle Demande d'Achat</h1>
                            <p className="text-sm font-mono font-semibold text-blue-600 mt-0.5">Référence : {currentRefNum}</p>
                        </div>
                        <button
                            onClick={() => setIsCreateFormOpen(false)}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            ← Retour à la liste
                        </button>
                    </div>

                    <div className="bg-white/90 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-2xl p-8">
                        <form onSubmit={handleCreateSubmit} className="space-y-6">
                            {/* General Information */}
                            <div className="bg-gray-50/70 border border-gray-100 rounded-2xl p-5 space-y-4">
                                <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider">Informations Générales</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Demandeur *</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="Nom du demandeur"
                                            className="w-full px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                                            value={createRequestedBy}
                                            onChange={e => setCreateRequestedBy(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Département</label>
                                        <input
                                            type="text"
                                            placeholder="ex: Maintenance"
                                            className="w-full px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                                            value={createDepartment}
                                            onChange={e => setCreateDepartment(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Fournisseur</label>
                                        <input
                                            type="text"
                                            placeholder="Nom du fournisseur"
                                            className="w-full px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                                            value={createSupplier}
                                            onChange={e => setCreateSupplier(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Notes / Remarques</label>
                                        <input
                                            type="text"
                                            placeholder="Remarques éventuelles"
                                            className="w-full px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                                            value={createNotes}
                                            onChange={e => setCreateNotes(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Items */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Liste des Articles</h4>
                                    <button
                                        type="button"
                                        onClick={handleAddCreateItem}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                    >
                                        <Plus size={14} />
                                        Ajouter un article
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {createItems.map((item, idx) => (
                                        <div key={item.id} className="bg-gray-50/80 border border-gray-100 rounded-2xl p-4 space-y-3">
                                            {/* Row top: index + delete */}
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Article {idx + 1}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveCreateItem(item.id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Supprimer"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>

                                            {/* Stock picker */}
                                            {spareParts.length > 0 && (
                                                <select
                                                    className="w-full text-xs text-gray-600 bg-white border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                                    onChange={(e) => { if (e.target.value) handleSelectSparePart(item.id, e.target.value); }}
                                                    defaultValue=""
                                                >
                                                    <option value="">— Choisir depuis le Stock (optionnel) —</option>
                                                    {spareParts.map(p => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.name} ({p.sku || 'Sans réf'}) — Stock: {p.stock} {p.unit}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}

                                            {/* Main fields row */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                                                <div className="lg:col-span-2">
                                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Désignation *</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        placeholder="Nom de l'article"
                                                        className="w-full px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                                                        value={item.name}
                                                        onChange={e => handleUpdateCreateItem(item.id, 'name', e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Référence SKU</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Réf SKU"
                                                        className="w-full px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-sm font-mono focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                                                        value={item.sku}
                                                        onChange={e => handleUpdateCreateItem(item.id, 'sku', e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Qté *</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        required
                                                        className="w-full text-center px-3 py-2.5 bg-white border border-blue-100 rounded-xl text-sm font-bold text-blue-700 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                                                        value={item.qtyToOrder}
                                                        onChange={e => handleUpdateCreateItem(item.id, 'qtyToOrder', Math.max(1, parseInt(e.target.value) || 1))}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Unité</label>
                                                    <input
                                                        type="text"
                                                        placeholder="pcs"
                                                        className="w-full px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                                                        value={item.unit}
                                                        onChange={e => handleUpdateCreateItem(item.id, 'unit', e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            {/* Remark + Image upload */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Remarque</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Remarque sur cet article..."
                                                        className="w-full px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                                                        value={item.remark}
                                                        onChange={e => handleUpdateCreateItem(item.id, 'remark', e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Photo de l'article (PDF)</label>
                                                    <div className="flex items-center gap-3">
                                                        <label className="flex items-center gap-2 px-3 py-2 bg-white border border-dashed border-gray-200 rounded-xl text-xs font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-all flex-1">
                                                            <Package size={14} />
                                                            {item.imageDataUrl ? 'Changer la photo' : 'Importer une photo'}
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="hidden"
                                                                onChange={e => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) handleItemImageUpload(item.id, file);
                                                                }}
                                                            />
                                                        </label>
                                                        {item.imageDataUrl && (
                                                            <div className="relative flex-shrink-0">
                                                                <img
                                                                    src={item.imageDataUrl}
                                                                    alt="aperçu"
                                                                    className="w-12 h-12 object-cover rounded-xl border border-gray-200 shadow-sm"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleUpdateCreateItem(item.id, 'imageDataUrl', undefined)}
                                                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                                                                >
                                                                    <X size={10} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Form Actions */}
                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateFormOpen(false)}
                                    className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all active:scale-95"
                                >
                                    Annuler
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingCreate}
                                    className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <Download size={16} />
                                    {isSubmittingCreate ? 'Génération...' : 'Générer & Enregistrer (PDF)'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal (Admin only) */}
            {editingRequest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-200" style={{ position: 'fixed' }}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 border border-gray-100 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Modifier la Demande</h3>
                            <button onClick={() => setEditingRequest(null)} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                                <X size={18} />
                            </button>
                        </div>
                        <p className="text-xs text-blue-600 font-mono font-bold mb-4 bg-blue-50 px-3 py-1 rounded-lg w-fit">Réf : {editingRequest.reference}</p>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">Demandeur</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    value={editDemandeur}
                                    onChange={e => setEditDemandeur(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">Département</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    value={editDepartment}
                                    onChange={e => setEditDepartment(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">Fournisseur</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    value={editSupplier}
                                    onChange={e => setEditSupplier(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() => setEditingRequest(null)}
                                className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                className="px-4 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
                            >
                                Enregistrer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
