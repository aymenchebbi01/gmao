import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Download,
  Package,
  Calendar,
  User,
  Building2,
  HardDrive,
  CheckCircle2,
  Printer,
  RotateCcw,
  Search,
  ArrowLeft,
  Eye,
  X
} from 'lucide-react';
import { Machine, SparePart, BonLivraisonRecord, BonLivraisonItem } from '../types';
import { api } from '../services/api';
import { format } from 'date-fns';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { THERMOPLASTICS_LOGO } from '../constants/logo';
import TableFooter from './ui/TableFooter';
import Modal from './ui/Modal';
import { useAuth } from '../contexts/AuthContext';

export default function BonLivraison() {
  const { isAdmin } = useAuth();
  const [records, setRecords] = useState<BonLivraisonRecord[]>([]);
  const [parts, setParts] = useState<SparePart[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'create'>('list');
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Form State
  const [bonNumber, setBonNumber] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [requester, setRequester] = useState('');
  const [department, setDepartment] = useState('Maintenance');
  const [machineId, setMachineId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [items, setItems] = useState<BonLivraisonItem[]>([
    { name: '', sku: '', quantity: 1, unit: 'pcs', remarks: '' }
  ]);

  // View Record Details Modal
  const [selectedRecord, setSelectedRecord] = useState<BonLivraisonRecord | null>(null);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [recordsData, partsData, machinesData] = await Promise.all([
        api.getBonLivraisons(),
        api.getSpareParts(),
        api.getMachines()
      ]);
      setRecords(recordsData || []);
      setParts(partsData || []);
      setMachines(machinesData || []);
    } catch (err) {
      console.error("Error loading BL data:", err);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const openCreateForm = async () => {
    try {
      const res = await api.getLastBonLivraisonRef();
      const currentYear = new Date().getFullYear();
      setBonNumber(res.nextRef || `BL${currentYear}0001`);
    } catch {
      const currentYear = new Date().getFullYear();
      setBonNumber(`BL${currentYear}0001`);
    }
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setRequester('');
    setDepartment('Maintenance');
    setMachineId('');
    setReason('');
    setNotes('');
    setItems([{ name: '', sku: '', quantity: 1, unit: 'pcs', remarks: '' }]);
    setView('create');
  };

  const handleAddItem = () => {
    setItems(prev => [...prev, { name: '', sku: '', quantity: 1, unit: 'pcs', remarks: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      toast.warning('Au moins un article est requis dans le bon.');
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof BonLivraisonItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSelectPart = (index: number, partId: string) => {
    const selected = parts.find(p => p.id === partId);
    if (selected) {
      setItems(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          partId: selected.id,
          name: selected.name,
          sku: selected.sku,
          unit: selected.unit || 'pcs'
        };
        return updated;
      });
    }
  };

  // ── PDF Generator ─────────────────────────────────────────────────────────
  const generatePDFBlob = (blRef: string, blDate: string, blRequester: string, blDept: string, blMachineLabel: string, blReason: string, blNotes: string, blItems: BonLivraisonItem[]) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // 1. Header with Logo (Exact same as Intervention Report / Fiche Technique PDF)
    const logoUrl = THERMOPLASTICS_LOGO;
    try {
      doc.addImage(logoUrl, 'PNG', 12, 12, 50, 15);
    } catch (e) {
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text('Thermoplastics', 15, 22);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('Design & Manufacture', 15, 26);
    }

    // Document Title (Matching Intervention Report / Fiche Technique style)
    doc.setFontSize(16);
    doc.setTextColor(0, 51, 102);
    doc.setFont("helvetica", "bold");
    doc.text('BON DE LIVRAISON / SORTIE DE STOCK', 65, 24);
    doc.line(65, 25, 190, 25);

    let currentY = 32;

    // Helper for Section Banner (Exact color [31, 73, 125] and dimensions)
    const drawSectionHeader = (title: string, y: number) => {
      doc.setFillColor(31, 73, 125);
      doc.rect(10, y, 190, 6, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(title, 105, y + 4.2, { align: 'center' });
      doc.setTextColor(0);
    };

    // ── SECTION 1: Informations Générales du Bon ──────────────────────────────
    drawSectionHeader('Informations Générales du Bon', currentY);
    currentY += 6;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text('N° de Bon:', 12, currentY + 6.5);
    doc.text('Département / Service:', 107, currentY + 6.5);

    doc.text('Date:', 12, currentY + 13.5);
    doc.text('Machine Concernée:', 107, currentY + 13.5);

    doc.text('Demandeur:', 12, currentY + 20.5);
    doc.text('Motif / Usage:', 107, currentY + 20.5);

    doc.setFont("helvetica", "normal");
    doc.text(blRef, 42, currentY + 6.5);
    doc.text(blDept || '—', 152, currentY + 6.5);

    doc.text(format(new Date(blDate), 'dd/MM/yyyy'), 42, currentY + 13.5);
    doc.text(blMachineLabel || 'N/A', 152, currentY + 13.5);

    doc.text(blRequester, 42, currentY + 20.5);
    doc.text(blReason || 'Maintenance / Réparation', 152, currentY + 20.5);

    currentY += 26;
    doc.setDrawColor(0);
    doc.setLineWidth(0.1);
    doc.line(10, currentY, 200, currentY);

    // ── SECTION 2: Articles & Pièces Demandées ────────────────────────────────
    drawSectionHeader('Articles & Pièces Demandées', currentY);
    currentY += 6;

    const tableData = blItems.map((item, index) => [
      index + 1,
      item.name,
      item.sku || '—',
      `${item.quantity} ${item.unit || 'pcs'}`,
      item.remarks || '—'
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Désignation Article', 'Référence (SKU)', 'Quantité', 'Observations']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'center'
      },
      styles: {
        fontSize: 8.5,
        cellPadding: 2,
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 70 },
        2: { cellWidth: 35 },
        3: { halign: 'center', cellWidth: 25 },
        4: { cellWidth: 50 }
      },
      margin: { left: 10, right: 10 }
    });

    currentY = (doc as any).lastAutoTable.finalY + 4;
    doc.line(10, currentY, 200, currentY);

    // ── SECTION 3: Notes & Instructions (if present) ──────────────────────────
    if (blNotes && blNotes.trim()) {
      drawSectionHeader('Notes & Observations Complémentaires', currentY);
      currentY += 6;
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      const splitNotes = doc.splitTextToSize(blNotes, 185);
      doc.text(splitNotes, 12, currentY + 5);
      currentY += Math.max(12, splitNotes.length * 5 + 4);
      doc.line(10, currentY, 200, currentY);
    }

    // ── SECTION 4: Visa & Signatures ─────────────────────────────────────────
    drawSectionHeader('Visa & Signatures', currentY);
    currentY += 6;

    const sigHeight = 24;
    const colWidth = 190 / 3;

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text('Demandeur (Bénéficiaire)', 10 + 5, currentY + 5);
    doc.text('Responsable Magasin / Stock', 10 + colWidth + 5, currentY + 5);
    doc.text('Responsable Maintenance', 10 + 2 * colWidth + 5, currentY + 5);

    // Vertical signature column dividers
    doc.line(10 + colWidth, currentY, 10 + colWidth, currentY + sigHeight);
    doc.line(10 + 2 * colWidth, currentY, 10 + 2 * colWidth, currentY + sigHeight);

    currentY += sigHeight;
    doc.line(10, currentY, 200, currentY);

    // ── Outer Page Border (Size-to-content) ───────────────────────────────────
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0);
    doc.setLineWidth(0.1);
    doc.rect(10, 10, 190, currentY - 10);

    return doc;
  };

  const handleDownloadRecordPDF = (rec: BonLivraisonRecord) => {
    let parsedItems: BonLivraisonItem[] = [];
    try {
      parsedItems = rec.items_json ? JSON.parse(rec.items_json) : [];
    } catch {
      parsedItems = [];
    }
    const doc = generatePDFBlob(
      rec.reference,
      rec.date,
      rec.requested_by,
      rec.department || '',
      rec.machine_name || '',
      rec.reason || '',
      rec.notes || '',
      parsedItems
    );
    doc.save(`BonLivraison_${rec.reference}.pdf`);
    toast.success(`Bon de Livraison ${rec.reference} téléchargé`);
  };

  const handleSaveAndDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requester.trim()) {
      toast.error('Veuillez indiquer le nom du demandeur.');
      return;
    }

    const validItems = items.filter(it => it.name.trim() !== '');
    if (validItems.length === 0) {
      toast.error('Veuillez renseigner au moins une pièce ou article.');
      return;
    }

    setSaving(true);
    try {
      const selectedMachine = machines.find(m => m.id === machineId);
      const machineLabel = selectedMachine
        ? `${selectedMachine.name} (#${selectedMachine.siteNumber || selectedMachine.id}) - ${selectedMachine.location}`
        : '';

      const payload = {
        reference: bonNumber,
        date,
        requested_by: requester,
        department,
        machine_id: machineId,
        machine_name: machineLabel,
        reason,
        notes,
        items_json: JSON.stringify(validItems),
        items_count: validItems.length
      };

      const res = await api.saveBonLivraison(payload);
      const savedRef = res.reference || bonNumber;

      // Generate & download PDF
      const doc = generatePDFBlob(
        savedRef,
        date,
        requester,
        department,
        machineLabel,
        reason,
        notes,
        validItems
      );
      doc.save(`BonLivraison_${savedRef}.pdf`);

      toast.success(`Bon de Livraison ${savedRef} enregistré avec succès !`, {
        description: 'Document PDF téléchargé. Aucune déduction de stock effectuée.'
      });

      // Refresh list and go back
      await fetchInitialData();
      setView('list');
    } catch (err) {
      console.error("Error saving Bon de Livraison:", err);
      toast.error("Erreur lors de l'enregistrement du Bon de Livraison");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async (id: number, ref: string) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer le bon de livraison ${ref} ?`)) {
      return;
    }
    try {
      await api.deleteBonLivraison(id);
      toast.success(`Bon de livraison ${ref} supprimé`);
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error("Error deleting BL:", err);
      toast.error("Erreur lors de la suppression");
    }
  };

  // ── Filter & Pagination ───────────────────────────────────────────────────
  const filteredRecords = useMemo(() => {
    const s = searchTerm.toLowerCase();
    return records.filter(r =>
      r.reference.toLowerCase().includes(s) ||
      (r.requested_by && r.requested_by.toLowerCase().includes(s)) ||
      (r.department && r.department.toLowerCase().includes(s)) ||
      (r.machine_name && r.machine_name.toLowerCase().includes(s)) ||
      (r.reason && r.reason.toLowerCase().includes(s))
    );
  }, [records, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const pagedRecords = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // ── RENDER: CREATE FORM ───────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setView('list')}
              className="p-2 text-gray-500 hover:text-gray-900 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all shadow-xs"
              title="Retour à la liste"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
                <FileText className="text-blue-600" size={26} />
                Nouveau Bon de Livraison BL
              </h1>
              <p className="text-xs text-gray-500 mt-0.5 font-mono">
                Référence : <span className="font-bold text-blue-600">{bonNumber}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Main Form Card */}
        <form onSubmit={handleSaveAndDownload} className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 space-y-6">
          {/* Document Metadata Grid */}
          <div>
            <h2 className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-4">
              Informations Générales
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">
                  N° de Bon
                </label>
                <input
                  type="text"
                  value={bonNumber}
                  onChange={e => setBonNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/80 border border-gray-200 rounded-xl text-sm font-mono font-bold text-blue-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">
                  Demandeur / Bénéficiaire *
                </label>
                <input
                  type="text"
                  placeholder="Nom du demandeur..."
                  value={requester}
                  onChange={e => setRequester(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">
                  Département / Service
                </label>
                <input
                  type="text"
                  placeholder="ex: Maintenance, Injection, Atelier"
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">
                  Machine Concernée (optionnel)
                </label>
                <select
                  value={machineId}
                  onChange={e => setMachineId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                >
                  <option value="">Sélectionner une machine...</option>
                  {machines.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} (#{m.siteNumber || m.id}) - {m.location}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">
                  Motif / Justification
                </label>
                <input
                  type="text"
                  placeholder="ex: Maintenance corrective presse 4"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Articles Table */}
          <div className="border-t border-gray-100 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xs font-bold text-blue-600 uppercase tracking-widest">
                  Articles & Pièces Demandées
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Sélectionnez dans la liste du stock ou saisissez librement les détails
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                <Plus size={14} />
                Ajouter une ligne
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-gray-50/60 rounded-xl border border-gray-100 grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                >
                  {/* Part selector */}
                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Pièce du Magasin
                    </label>
                    <select
                      value={item.partId || ''}
                      onChange={e => handleSelectPart(idx, e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    >
                      <option value="">Sélectionner une pièce en stock...</option>
                      {parts.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku}) — Stock: {p.stock} {p.unit}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Name / Description */}
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Désignation *
                    </label>
                    <input
                      type="text"
                      placeholder="Nom de l'article"
                      value={item.name}
                      onChange={e => handleItemChange(idx, 'name', e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* SKU */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Référence
                    </label>
                    <input
                      type="text"
                      placeholder="Ref-12345"
                      value={item.sku}
                      onChange={e => handleItemChange(idx, 'sku', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Quantity + Unit */}
                  <div className="md:col-span-2 flex gap-1.5">
                    <div className="w-16">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                        Qté
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 1)}
                        className="w-full px-2 py-2 bg-white border border-gray-200 rounded-lg text-xs text-center font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                        Unité
                      </label>
                      <input
                        type="text"
                        placeholder="pcs"
                        value={item.unit}
                        onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                        className="w-full px-2 py-2 bg-white border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Remove button */}
                  <div className="md:col-span-1 flex items-end justify-center pt-4 md:pt-0">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Supprimer la ligne"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="border-t border-gray-100 pt-6">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">
              Notes & Observations Complémentaires
            </label>
            <textarea
              rows={3}
              placeholder="Instructions de livraison, remarques particulières..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none"
            />
          </div>

          {/* Form Actions */}
          <div className="border-t border-gray-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-gray-400">
              ℹ️ <span className="font-semibold text-gray-600">Note:</span> La validation enregistre le bon et télécharge le document sans modifier les stocks.
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setView('list')}
                className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-7 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                <Download size={18} />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ── RENDER: LIST VIEW ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <FileText className="text-blue-600" size={28} />
            Bon de Livraison BL
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Historique et génération des bons de livraison et de sortie de stock
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openCreateForm}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20"
          >
            <Plus size={18} />
            Nouveau Bon de Livraison
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-4 bg-white border border-gray-100 shadow-sm rounded-2xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher par N° de bon, demandeur, machine, département..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  N° de Bon
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Demandeur
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Département
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Machine Concernée
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">
                  Articles
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="px-6 py-6">
                      <div className="h-4 bg-gray-100 rounded w-full"></div>
                    </td>
                  </tr>
                ))
              ) : pagedRecords.length > 0 ? (
                pagedRecords.map(rec => {
                  let parsedItems: BonLivraisonItem[] = [];
                  try {
                    parsedItems = rec.items_json ? JSON.parse(rec.items_json) : [];
                  } catch {
                    parsedItems = [];
                  }

                  return (
                    <tr key={rec.id} className="hover:bg-blue-50/30 transition-colors group">
                      <td className="px-6 py-4">
                        <span className="font-mono font-bold text-sm text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                          {rec.reference}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">
                          <Calendar size={14} className="text-gray-400" />
                          {rec.date ? format(new Date(rec.date), 'dd/MM/yyyy') : '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
                          <User size={14} className="text-gray-400" />
                          {rec.requested_by}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {rec.department || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-700 max-w-[200px] truncate" title={rec.machine_name || 'N/A'}>
                          {rec.machine_name || <span className="text-gray-400 italic">N/A</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
                          <Package size={12} className="mr-1 text-gray-500" />
                          {rec.items_count || parsedItems.length} article(s)
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => setSelectedRecord(rec)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Voir les détails"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleDownloadRecordPDF(rec)}
                            className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                            title="Télécharger le PDF"
                          >
                            <Download size={16} />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteRecord(rec.id, rec.reference)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Supprimer"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="inline-flex flex-col items-center">
                      <div className="p-4 bg-gray-50 rounded-2xl mb-3">
                        <FileText size={32} className="text-gray-300" />
                      </div>
                      <p className="text-base font-bold text-gray-900">Aucun bon de livraison trouvé</p>
                      <p className="text-xs text-gray-500 mt-1 mb-4">
                        Créez votre premier bon de livraison pour enregistrer une sortie de stock.
                      </p>
                      <button
                        onClick={openCreateForm}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20"
                      >
                        <Plus size={14} />
                        Créer un Bon de Livraison
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TableFooter
          totalItems={filteredRecords.length}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageSizeChange={s => { setPageSize(s); setCurrentPage(1); }}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Record Detail Modal */}
      <Modal
        isOpen={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        title={`Détails du Bon de Livraison — ${selectedRecord?.reference}`}
      >
        {selectedRecord && (() => {
          let parsedItems: BonLivraisonItem[] = [];
          try {
            parsedItems = selectedRecord.items_json ? JSON.parse(selectedRecord.items_json) : [];
          } catch {
            parsedItems = [];
          }

          return (
            <div className="space-y-5 p-1">
              <div className="grid grid-cols-2 gap-4 bg-gray-50/70 p-4 rounded-xl text-xs">
                <div>
                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[10px]">N° de Bon</span>
                  <span className="font-mono font-bold text-blue-700 text-sm">{selectedRecord.reference}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[10px]">Date</span>
                  <span className="font-semibold text-gray-800">{format(new Date(selectedRecord.date), 'dd/MM/yyyy')}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[10px]">Demandeur</span>
                  <span className="font-semibold text-gray-800">{selectedRecord.requested_by}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[10px]">Département</span>
                  <span className="font-semibold text-gray-800">{selectedRecord.department || '—'}</span>
                </div>
                {selectedRecord.machine_name && (
                  <div className="col-span-2">
                    <span className="text-gray-400 font-bold uppercase tracking-wider block text-[10px]">Machine Concernée</span>
                    <span className="font-semibold text-gray-800">{selectedRecord.machine_name}</span>
                  </div>
                )}
                {selectedRecord.reason && (
                  <div className="col-span-2">
                    <span className="text-gray-400 font-bold uppercase tracking-wider block text-[10px]">Motif</span>
                    <span className="font-semibold text-gray-800">{selectedRecord.reason}</span>
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Articles Demandés ({parsedItems.length})
                </h4>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 font-bold text-gray-500">
                      <tr>
                        <th className="px-3 py-2">Désignation</th>
                        <th className="px-3 py-2">Réf</th>
                        <th className="px-3 py-2 text-center">Quantité</th>
                        <th className="px-3 py-2">Observations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {parsedItems.map((it, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50">
                          <td className="px-3 py-2 font-medium text-gray-800">{it.name}</td>
                          <td className="px-3 py-2 font-mono text-gray-500">{it.sku || '—'}</td>
                          <td className="px-3 py-2 text-center font-bold text-gray-900">{it.quantity} {it.unit}</td>
                          <td className="px-3 py-2 text-gray-500">{it.remarks || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedRecord.notes && (
                <div>
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Notes</h4>
                  <p className="text-xs text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-100">
                    {selectedRecord.notes}
                  </p>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  className="px-4 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDownloadRecordPDF(selectedRecord);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20"
                >
                  <Download size={14} />
                  Télécharger PDF
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
