import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Server,
  Plus,
  Trash2,
  Edit2,
  X,
  FileDown,
  FileSpreadsheet,
  AlertCircle,
  Search,
  RefreshCw,
  Clock
} from 'lucide-react';
import { productionLineService } from '../../services/productionApi';
import { ProductionLine } from '../../types';
import * as XLSX from 'xlsx';
import TableFooter from '../ui/TableFooter';
import Modal from '../ui/Modal';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

const MACHINE_CATEGORIES = ['Tompographie', 'Assemblage', 'Blister', 'Spray', 'Table'];

export default function ProductionLinesMgmt() {
  const [machines, setMachines] = useState<ProductionLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<ProductionLine | null>(null);
  const [formData, setFormData] = useState({ name: '', cadence: 0, category: '' });
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<{ name: string; cadence: number; category: string }[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState('');
  const [importLoading, setImportLoading] = useState(false);

  const fetchLines = async () => {
    setLoading(true);
    try {
      const data = await productionLineService.getLines();
      setMachines(data);
    } catch (err) {
      toast.error('Error fetching production lines');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLines();
  }, []);

  const openCreateModal = () => {
    setEditingLine(null);
    setFormData({ name: '', cadence: 0, category: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (m: ProductionLine) => {
    setEditingLine(m);
    setFormData({ name: m.name, cadence: m.cadence, category: m.category || '' });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingLine) {
        await productionLineService.updateLine(editingLine.id, formData);
        toast.success('Production line updated');
      } else {
        await productionLineService.addLine(formData);
        toast.success('Production line added');
      }
      setIsModalOpen(false);
      fetchLines();
    } catch (err) {
      toast.error('Error saving line record');
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this line?')) return;
    try {
      await productionLineService.deleteLine(id);
      toast.success('Line deleted');
      fetchLines();
    } catch (err) {
      toast.error('Error deleting line');
      console.error(err);
    }
  };

  const handleDeleteAll = async () => {
    try {
      await productionLineService.deleteAllLines();
      setConfirmDeleteAll(false);
      toast.success('All lines cleared');
      fetchLines();
    } catch (err) {
      toast.error('Error clearing lines database');
      console.error(err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        const parsed = rows
          .map(r => {
            const rawCat = String(r['Category'] || r['Machine Category'] || '').trim();
            const validCat = MACHINE_CATEGORIES.find(c => c.toLowerCase() === rawCat.toLowerCase()) || '';
            return {
              name: String(r['Machine Name'] || r['name'] || r['MachineName'] || '').trim(),
              cadence: Number(r['Cadence (u/hr)'] || r['cadence'] || r['Cadence'] || 0),
              category: validCat,
            };
          })
          .filter(r => r.name && r.cadence > 0);

        if (parsed.length === 0) {
          setImportError('No valid rows found. Columns should be "Machine Name" and "Cadence (u/hr)".');
          setImportPreview([]);
        } else {
          setImportPreview(parsed);
        }
      } catch {
        setImportError('Could not read the file. Please use .xlsx format.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    if (importPreview.length === 0) return;
    setImportLoading(true);
    try {
      for (const m of importPreview) {
        await productionLineService.addLine(m);
      }
      toast.success(`${importPreview.length} lines imported successfully`);
      setImportPreview([]);
      setImportFile(null);
      fetchLines();
    } catch (err) {
      toast.error('Import failed');
      console.error(err);
    } finally {
      setImportLoading(false);
    }
  };

  const resetImport = () => {
    setImportPreview([]);
    setImportFile(null);
    setImportError('');
  };

  const filteredItems = machines.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(m.cadence).includes(searchTerm)
  );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pagedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 relative min-h-[600px] font-sans">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Server className="w-6 h-6 text-blue-600" />
            Production Lines
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <input ref={fileInputRef} type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" />

          <button
            onClick={() => productionLineService.downloadTemplate()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-violet-600 bg-violet-50 border border-violet-100 rounded-xl hover:bg-violet-100 transition-all font-inter"
            title="Download Excel Template"
          >
            <FileDown size={18} />
            Download Template
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl hover:bg-emerald-100 transition-all font-inter"
          >
            <FileSpreadsheet size={18} />
            Import Excel
          </button>

          {!confirmDeleteAll ? (
            <button
              onClick={() => setConfirmDeleteAll(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-all font-inter"
            >
              <Trash2 size={18} />
              Clear All
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 p-1.5 rounded-xl">
              <span className="text-xs text-red-700 font-bold px-2">Delete all?</span>
              <button
                onClick={handleDeleteAll}
                className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-lg hover:bg-red-700 transition-all"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmDeleteAll(false)}
                className="text-xs text-slate-500 hover:text-slate-700 px-2"
              >
                No
              </button>
            </div>
          )}

          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 font-inter"
          >
            <Plus size={18} />
            Add Line
          </button>

          <button
            onClick={fetchLines}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
            title="Refresh list"
          >
            <RefreshCw size={18} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Excel Import Preview */}
      {importFile && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-blue-50/60 border border-blue-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-blue-900 font-bold text-sm font-inter">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              <span>Import Preview: {importFile.name}</span>
            </div>
            <button onClick={resetImport} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>

          {importError && (
            <div className="mb-4 flex items-center gap-2 text-red-600 text-xs font-semibold bg-red-50 border border-red-200 p-3 rounded-xl">
              <AlertCircle size={16} className="shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          {importPreview.length > 0 && (
            <div>
              <p className="text-xs text-gray-600 mb-3 font-inter">Found <strong>{importPreview.length}</strong> valid production lines to import:</p>
              <div className="max-h-48 overflow-y-auto border border-blue-100 rounded-xl bg-white mb-4">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-100 font-bold text-gray-400 uppercase">
                    <tr>
                      <th className="p-2.5">Line Name</th>
                      <th className="p-2.5 text-center">Cadence (u/hr)</th>
                      <th className="p-2.5">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {importPreview.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-bold text-gray-900 font-inter">{item.name}</td>
                        <td className="p-2.5 text-center font-mono font-bold text-blue-600">{item.cadence}</td>
                        <td className="p-2.5 text-gray-600 font-inter">{item.category || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={resetImport} className="px-4 py-2 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
                <button onClick={handleImportConfirm} disabled={importLoading} className="px-5 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-md">
                  {importLoading ? 'Importing...' : `Confirm & Save (${importPreview.length})`}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Search Card */}
      <div className="flex flex-col gap-4 p-4 bg-white border border-gray-100 shadow-sm sm:flex-row sm:items-center rounded-2xl mt-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by machine line, category, or cadence..."
            className="w-full pl-11 pr-4 py-3 text-sm bg-gray-50/50 border border-gray-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-inter font-medium"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white border border-gray-100 shadow-xl shadow-gray-200/50 rounded-2xl overflow-hidden mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Line Name</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Cadence (u/hr)</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={4} className="px-6 py-6">
                      <div className="h-4 bg-gray-100 rounded w-full"></div>
                    </td>
                  </tr>
                ))
              ) : pagedItems.length > 0 ? (
                pagedItems.map((m) => (
                  <tr key={m.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors font-inter">
                        {m.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-sm font-bold text-blue-600 font-mono">
                        <Clock size={14} className="text-gray-400" />
                        {m.cadence}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 font-medium font-inter">
                        {m.category || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditModal(m)}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Edit line"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                          title="Delete line"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="inline-flex flex-col items-center">
                      <div className="p-4 bg-gray-50 rounded-full mb-3">
                        <Server size={24} className="text-gray-300" />
                      </div>
                      <p className="text-sm font-bold text-gray-900 font-inter">No production lines found</p>
                      <p className="text-xs text-gray-500 mt-1 font-inter font-medium">Add production lines manually or import from Excel.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TableFooter
          totalItems={filteredItems.length}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Modal Dialog for Add / Edit */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingLine ? "Edit Production Line" : "Add Production Line"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
              Line / Machine Name *
            </label>
            <input
              required
              type="text"
              placeholder="e.g. Presse 1"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
              Cadence (Units / Hour) *
            </label>
            <input
              required
              type="number"
              min="1"
              placeholder="e.g. 500"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium font-mono"
              value={formData.cadence || ''}
              onChange={e => setFormData({ ...formData, cadence: parseInt(e.target.value) || 0 })}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
              Category
            </label>
            <select
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium bg-white"
              value={formData.category}
              onChange={e => setFormData({ ...formData, category: e.target.value })}
            >
              <option value="">Select Category...</option>
              {MACHINE_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors font-inter"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 font-inter"
            >
              Save Line
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


