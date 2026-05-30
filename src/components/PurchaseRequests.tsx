import React, { useState, useEffect } from 'react';
import {
    ShoppingCart,
    AlertTriangle,
    Download,
    Plus,
    Trash2,
    RefreshCw,
    FileText,
    Package,
    History,
    CheckCircle2,
    Edit2,
    Search,
    X
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

interface PurchaseItem {
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
}

const defaultManualItem = (): PurchaseItem => ({
    id: `manual-${Date.now()}`,
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
});

export default function PurchaseRequests() {
    const { user, isAdmin } = useAuth();
    const [parts, setParts] = useState<SparePart[]>([]);
    const [items, setItems] = useState<PurchaseItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Header form
    const [requestedBy, setRequestedBy] = useState(user?.displayName || user?.username || '');
    const [department, setDepartment] = useState('Maintenance');
    const [supplier, setSupplier] = useState('');
    const [notes, setNotes] = useState('');

    const [activeView, setActiveTab] = useState<'generator' | 'history'>('generator');
    const [history, setHistory] = useState<any[]>([]);
    const [lastRef, setLastRef] = useState<string | null>(null);

    // History search and edit states
    const [historySearch, setHistorySearch] = useState('');
    const [editingRequest, setEditingRequest] = useState<any | null>(null);
    const [editDemandeur, setEditDemandeur] = useState('');
    const [editSupplier, setEditSupplier] = useState('');
    const [editDepartment, setEditDepartment] = useState('');

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

    const fetchHistory = async () => {
        try {
            const data = await api.getPurchaseRequests();
            setHistory(data);
            const lr = await api.getLastPurchaseRequestRef();
            setLastRef(lr.lastRef);
        } catch (err) {
            console.error('Failed to load history', err);
        }
    };

    const fetchAndBuild = async () => {
        setLoading(true);
        try {
            const allParts = await api.getSpareParts();
            setParts(allParts);
            const lowStock = allParts.filter(p => p.stock <= p.minStock);
            const built: PurchaseItem[] = lowStock.map(p => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                category: p.category,
                location: p.location,
                unit: p.unit,
                currentStock: p.stock,
                minStock: p.minStock,
                qtyToOrder: Math.max(1, p.minStock - p.stock + p.minStock), // reorder enough to double minStock
                remark: '',
                isManual: false,
            }));
            setItems(prev => {
                // Keep any manual items already added
                const manualItems = prev.filter(i => i.isManual);
                return [...built, ...manualItems];
            });
        } catch (err) {
            toast.error('Failed to load inventory');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAndBuild();
        fetchHistory();
    }, []);

    const updateItem = (id: string, field: keyof PurchaseItem, value: any) => {
        setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    };

    const removeItem = (id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
    };

    const addManualItem = () => {
        setItems(prev => [...prev, defaultManualItem()]);
    };

    const generatePDF = () => {
        if (items.length === 0) {
            toast.error('No items to include in the request');
            return;
        }

        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        // ---- Header ----
        // Logo
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
        doc.text(`N° DA : ${currentRefNum}`, 14, 40);
        doc.text(`Date d’émission : ${format(new Date(), 'dd/MM/yyyy')}`, 130, 40);

        // ---- Table ----
        const tableBody = items.map((item) => [
            item.sku || '',
            item.name,
            String(item.qtyToOrder),
            item.unit,
            item.isManual ? '' : String(item.currentStock),
            supplier || '',
        ]);

        // Add 3 empty rows to match the "form" look if the list is short
        if (tableBody.length < 5) {
            for (let i = 0; i < 3; i++) {
                tableBody.push(['', '', '', '', '', '']);
            }
        }

        autoTable(doc, {
            startY: 46,
            head: [['Reference', 'Désignation Article', 'Quantité', 'unité', 'Stock actuel', 'Fournisseur']],
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
                lineColor: [0, 0, 0]
            },
            columnStyles: {
                0: { cellWidth: 30 },
                1: { cellWidth: 45 },
                2: { halign: 'center', cellWidth: 20 },
                3: { halign: 'center', cellWidth: 15 },
                4: { halign: 'center', cellWidth: 25 },
                5: { halign: 'center' },
            },
            margin: { left: 14, right: 14 },
        });

        let finalY = (doc as any).lastAutoTable.finalY + 15;

        // Ensure we don't go off page
        if (finalY > 230) {
            doc.addPage();
            finalY = 20;
        }

        // ---- Remark ----
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const remarkText = notes ? `Remarque : ${notes}` : 'Remarque : ..............................................................................................................................................';
        doc.text(remarkText, 14, finalY);

        finalY += 10;

        // ---- Signatures Block ----
        doc.setLineWidth(0.2);
        doc.rect(14, finalY, 91, 14); // Demandeur box
        doc.rect(105, finalY, 91, 14); // Validation box

        doc.setFontSize(9);
        doc.text(`Demandeur : ${requestedBy || '....................................................'}`, 16, finalY + 5);
        doc.text(`Visa : .................................................................`, 16, finalY + 11);

        doc.text(`Validation supérieur hiérarchique: .............................`, 107, finalY + 5);
        doc.text(`Date : .................................................................`, 107, finalY + 11);

        finalY += 25;

        // Director Signature
        doc.text(`Visa Directeur des opérations: .........................................................................`, 105, finalY, { align: 'center' });

        // ---- Bottom Footer ----
        doc.setFontSize(8);
        doc.text('Page : 1 / 1', 14, 285);
        doc.text('DASACH03/V01/01032025/WN', 196, 285, { align: 'right' });

        const pdfBase64 = doc.output('datauristring');

        doc.save(`Demande_Achat_${currentRefNum}.pdf`);

        // Save to DB
        api.savePurchaseRequest({
            reference: currentRefNum,
            date: format(new Date(), 'yyyy-MM-dd'),
            requested_by: requestedBy,
            department: department,
            supplier: supplier,
            items_count: items.length,
            pdf_data: pdfBase64
        }).then(() => {
            fetchHistory();
        }).catch(err => {
            console.error('Failed to save PR to history', err);
        });

        toast.success('Demande d\'achat générée selon le modèle');
    };

    const lowStockCount = items.filter(i => !i.isManual).length;

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex bg-gray-100 p-1 rounded-xl">
                        <button
                            onClick={() => setActiveTab('generator')}
                            className={cn(
                                "px-4 py-1.5 text-sm font-medium rounded-lg transition-all",
                                activeView === 'generator' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"
                            )}
                        >
                            Générateur
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={cn(
                                "px-4 py-1.5 text-sm font-medium rounded-lg transition-all",
                                activeView === 'history' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"
                            )}
                        >
                            Historique
                        </button>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Demande d'Achat</h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {activeView === 'generator' && (
                        <>
                            <button
                                onClick={fetchAndBuild}
                                disabled={loading}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50"
                            >
                                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                                Actualiser
                            </button>
                            <button
                                onClick={generatePDF}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                            >
                                <Download size={16} />
                                Générer & Télécharger
                            </button>
                        </>
                    )}
                </div>
            </div>

            {activeView === 'generator' ? (
                <>
                    {/* Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 flex items-center gap-4">
                            <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                                <AlertTriangle size={20} className="text-red-500" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Articles en rupture</p>
                                <p className="text-2xl font-bold text-gray-900">{lowStockCount}</p>
                            </div>
                        </div>
                        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                                <ShoppingCart size={20} className="text-blue-500" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Total articles DA</p>
                                <p className="text-2xl font-bold text-gray-900">{items.length}</p>
                            </div>
                        </div>
                        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 flex items-center gap-4">
                            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                                <FileText size={20} className="text-emerald-500" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Référence (Prochaine)</p>
                                <p className="text-sm font-bold text-gray-900 font-mono">{currentRefNum}</p>
                            </div>
                        </div>
                    </div>

                    {/* Header Form */}
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6">
                        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Informations de la demande</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Demandeur</label>
                                <input
                                    type="text"
                                    placeholder="Votre nom"
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    value={requestedBy}
                                    onChange={e => setRequestedBy(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Département</label>
                                <input
                                    type="text"
                                    placeholder="ex: Maintenance"
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    value={department}
                                    onChange={e => setDepartment(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Fournisseur</label>
                                <input
                                    type="text"
                                    placeholder="Fournisseur souhaité"
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    value={supplier}
                                    onChange={e => setSupplier(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Notes</label>
                                <input
                                    type="text"
                                    placeholder="Observations..."
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                            <h2 className="text-sm font-bold text-gray-700">Articles à commander</h2>
                            <button
                                onClick={addManualItem}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                                <Plus size={14} />
                                Ajouter manuellement
                            </button>
                        </div>
                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : items.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Package size={40} className="mb-3 text-gray-300" />
                                <p className="font-semibold text-gray-500">Aucun article en rupture de stock</p>
                                <p className="text-sm mt-1">Tous les stocks sont à des niveaux suffisants.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="bg-gray-50/70 border-b border-gray-100">
                                            <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Désignation</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Référence</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Catégorie</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Stock actuel</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Stock min.</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-blue-500 uppercase tracking-wider text-center">Qté à commander</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Unité</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Remarque</th>
                                            <th className="px-4 py-3" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {items.map(item => (
                                            <tr key={item.id} className={cn('group hover:bg-gray-50/60 transition-colors', item.isManual && 'bg-blue-50/30')}>
                                                <td className="px-4 py-3">
                                                    {item.isManual ? (
                                                        <input
                                                            className="w-full min-w-[140px] bg-white border border-gray-200 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                                            value={item.name}
                                                            placeholder="Nom de la pièce"
                                                            onChange={e => updateItem(item.id, 'name', e.target.value)}
                                                        />
                                                    ) : (
                                                        <span className="font-semibold text-gray-800">{item.name}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {item.isManual ? (
                                                        <input
                                                            className="w-28 bg-white border border-gray-200 rounded-lg px-2 py-1 text-sm font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                                            value={item.sku}
                                                            placeholder="Réf."
                                                            onChange={e => updateItem(item.id, 'sku', e.target.value)}
                                                        />
                                                    ) : (
                                                        <span className="text-gray-500">{item.sku}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-gray-500">{item.category}</td>
                                                <td className="px-4 py-3 text-center">
                                                    {item.isManual ? '—' : (
                                                        <span className={cn('font-bold', item.currentStock <= item.minStock ? 'text-red-600' : 'text-gray-800')}>
                                                            {item.currentStock}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center text-gray-500">{item.isManual ? '—' : item.minStock}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        className="w-20 text-center bg-white border border-blue-200 rounded-lg px-2 py-1 text-sm font-bold text-blue-700 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
                                                        value={item.qtyToOrder}
                                                        onChange={e => updateItem(item.id, 'qtyToOrder', Math.max(1, parseInt(e.target.value) || 1))}
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    {item.isManual ? (
                                                        <input
                                                            className="w-16 bg-white border border-gray-200 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                                                            value={item.unit}
                                                            onChange={e => updateItem(item.id, 'unit', e.target.value)}
                                                        />
                                                    ) : (
                                                        <span className="text-gray-500">{item.unit}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input
                                                        className="w-full min-w-[120px] bg-transparent border-b border-gray-200 focus:border-blue-400 px-1 py-0.5 text-sm outline-none transition-colors"
                                                        value={item.remark}
                                                        placeholder="Remarque..."
                                                        onChange={e => updateItem(item.id, 'remark', e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => removeItem(item.id)}
                                                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Retirer"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {items.length > 0 && (
                            <div className="px-6 py-4 border-t border-gray-50 flex items-center justify-between">
                                <p className="text-xs text-gray-400">{items.length} article(s) dans la demande</p>
                                <button
                                    onClick={generatePDF}
                                    className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                                >
                                    <Download size={16} />
                                    Télécharger la Demande d'Achat (PDF)
                                </button>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                /* History View */
                <div className="space-y-4">
                    {/* Search Bar */}
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 flex items-center gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text"
                                placeholder="Rechercher une demande (Réf, demandeur, fournisseur...)"
                                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                value={historySearch}
                                onChange={e => setHistorySearch(e.target.value)}
                            />
                        </div>
                    </div>

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
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {history
                                        .filter(req => {
                                            const query = historySearch.toLowerCase();
                                            return (
                                                req.reference.toLowerCase().includes(query) ||
                                                (req.requested_by || '').toLowerCase().includes(query) ||
                                                (req.supplier || '').toLowerCase().includes(query) ||
                                                (req.department || '').toLowerCase().includes(query)
                                            );
                                        })
                                        .map((req) => (
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
                                                    <span className="px-2 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
                                                        {req.items_count} positions
                                                    </span>
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
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    {history.filter(req => {
                                        const query = historySearch.toLowerCase();
                                        return (
                                            req.reference.toLowerCase().includes(query) ||
                                            (req.requested_by || '').toLowerCase().includes(query) ||
                                            (req.supplier || '').toLowerCase().includes(query) ||
                                            (req.department || '').toLowerCase().includes(query)
                                        );
                                    }).length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">
                                                Aucune demande d'achat dans l'historique.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Edit Modal (Admin only) */}
                    {editingRequest && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
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
            )}
        </div>
    );
}

