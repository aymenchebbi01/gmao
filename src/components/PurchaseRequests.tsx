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
} from 'lucide-react';
import { SparePart } from '../types';
import { api } from '../services/api';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

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
    const [parts, setParts] = useState<SparePart[]>([]);
    const [items, setItems] = useState<PurchaseItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Header form
    const [requestedBy, setRequestedBy] = useState('');
    const [department, setDepartment] = useState('Maintenance');
    const [supplier, setSupplier] = useState('');
    const [notes, setNotes] = useState('');

    const refNum = `DA-${format(new Date(), 'yyyyMMdd')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

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
        doc.setFillColor(30, 64, 175); // Blue
        doc.rect(0, 0, 210, 32, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('THERMOPLASTICS', 14, 13);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Système de Gestion de Maintenance Assistée par Ordinateur', 14, 21);

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('DEMANDE D\'ACHAT', 210 - 14, 13, { align: 'right' });
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Réf: ${refNum}`, 210 - 14, 21, { align: 'right' });
        doc.text(`Date: ${format(new Date(), 'dd/MM/yyyy')}`, 210 - 14, 27, { align: 'right' });

        // ---- Info Block ----
        doc.setTextColor(30, 30, 30);
        doc.setFillColor(245, 247, 250);
        doc.rect(14, 38, 182, 30, 'F');
        doc.setDrawColor(220, 225, 235);
        doc.rect(14, 38, 182, 30, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 110, 130);
        doc.text('DEMANDEUR', 20, 46);
        doc.text('DÉPARTEMENT', 75, 46);
        doc.text('FOURNISSEUR SOUHAITÉ', 130, 46);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(20, 20, 20);
        doc.text(requestedBy || '—', 20, 54);
        doc.text(department || '—', 75, 54);
        doc.text(supplier || '—', 130, 54);

        // ---- Table ----
        const tableBody = items.map((item, i) => [
            String(i + 1),
            item.name,
            item.sku || '—',
            item.category || '—',
            String(item.qtyToOrder),
            item.unit,
            item.location || '—',
            item.remark || '',
        ]);

        autoTable(doc, {
            startY: 75,
            head: [['N°', 'Désignation', 'Référence', 'Catégorie', 'Qté', 'Unité', 'Emplacement', 'Remarque']],
            body: tableBody,
            theme: 'grid',
            headStyles: {
                fillColor: [30, 64, 175],
                textColor: 255,
                fontStyle: 'bold',
                fontSize: 8,
                halign: 'center',
            },
            bodyStyles: { fontSize: 8, cellPadding: 2.5 },
            columnStyles: {
                0: { halign: 'center', cellWidth: 10 },
                4: { halign: 'center', cellWidth: 12 },
                5: { halign: 'center', cellWidth: 14 },
            },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: 14, right: 14 },
        });

        const finalY = (doc as any).lastAutoTable.finalY + 12;

        // ---- Notes ----
        if (notes) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(80, 90, 110);
            doc.text('NOTES / OBSERVATIONS:', 14, finalY);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(30, 30, 30);
            const noteLines = doc.splitTextToSize(notes, 182);
            doc.text(noteLines, 14, finalY + 6);
        }

        // ---- Signature ----
        const sigY = Math.min(finalY + (notes ? 20 : 4), 260);
        doc.setDrawColor(200, 210, 220);
        doc.setFillColor(250, 251, 253);
        doc.rect(14, sigY, 85, 25, 'FD');
        doc.rect(111, sigY, 85, 25, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 110, 130);
        doc.text('Signature Demandeur', 56.5, sigY + 6, { align: 'center' });
        doc.text('Visa Responsable', 153.5, sigY + 6, { align: 'center' });

        // ---- Footer ----
        doc.setFontSize(7);
        doc.setTextColor(160, 170, 185);
        doc.setFont('helvetica', 'normal');
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.text(
                `Document généré le ${format(new Date(), 'dd/MM/yyyy à HH:mm')} — GMAO Thermoplastics`,
                105, 290, { align: 'center' }
            );
            doc.text(`Page ${i}/${pageCount}`, 196, 290, { align: 'right' });
        }

        doc.save(`Demande_Achat_${refNum}.pdf`);
        toast.success('PDF téléchargé avec succès');
    };

    const lowStockCount = items.filter(i => !i.isManual).length;

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Demande d'Achat</h1>
                    <p className="text-gray-500 text-sm mt-0.5">
                        Génération automatique basée sur les articles en rupture de stock.
                    </p>
                </div>
                <div className="flex items-center gap-3">
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
                        Télécharger PDF
                    </button>
                </div>
            </div>

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
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Référence</p>
                        <p className="text-sm font-bold text-gray-900 font-mono">{refNum}</p>
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
                                                <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{item.sku || '—'}</code>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">{item.category || '—'}</td>
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
        </div>
    );
}
