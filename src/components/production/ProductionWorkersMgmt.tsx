import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  RefreshCw,
  X,
  User,
  ShieldAlert,
  FileDown,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { productionWorkerService } from '../../services/productionApi';
import { ProductionWorker } from '../../types';
import TableFooter from '../ui/TableFooter';
import Modal from '../ui/Modal';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';

export default function ProductionWorkersMgmt() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [workers, setWorkers] = useState<ProductionWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<ProductionWorker | null>(null);
  const [formData, setFormData] = useState({ worker_id: '', name: '' });
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<{ worker_id: string; name: string }[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState('');
  const [importLoading, setImportLoading] = useState(false);

  const fetchWorkers = async () => {
    setLoading(true);
    try {
      const data = await productionWorkerService.getWorkers();
      setWorkers(data);
    } catch (err) {
      toast.error('Error fetching employees');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
  }, []);

  const openCreateModal = () => {
    setEditingWorker(null);
    setFormData({ worker_id: '', name: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (w: ProductionWorker) => {
    setEditingWorker(w);
    setFormData({ worker_id: w.worker_id, name: w.name });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingWorker) {
        await productionWorkerService.updateWorker(editingWorker.id, formData);
        toast.success('Employee updated successfully');
      } else {
        await productionWorkerService.addWorker(formData);
        toast.success('Employee registered successfully');
      }
      setIsModalOpen(false);
      fetchWorkers();
    } catch (err) {
      toast.error('Error saving employee record');
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this employee?')) return;
    try {
      await productionWorkerService.deleteWorker(id);
      toast.success('Employee deleted');
      fetchWorkers();
    } catch (err) {
      toast.error('Error deleting employee');
      console.error(err);
    }
  };

  const handleDeleteAll = async () => {
    try {
      await productionWorkerService.deleteAllWorkers();
      setConfirmDeleteAll(false);
      toast.success('All employees cleared');
      fetchWorkers();
    } catch (err) {
      toast.error('Error clearing employee database');
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
            const worker_id = String(r['Matricule'] || r['matricule'] || r['Worker ID'] || r['worker_id'] || r['WorkerId'] || r['ID'] || r['id'] || '').trim();
            const name = String(r['Full Name'] || r['full name'] || r['FullName'] || r['Name'] || r['name'] || r['Worker Name'] || r['worker_name'] || '').trim();
            return { worker_id, name };
          })
          .filter(r => r.worker_id && r.name);

        if (parsed.length === 0) {
          setImportError('No valid rows found. Columns should be "Matricule" and "Full Name".');
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
      await productionWorkerService.saveWorkersBatch(importPreview);
      toast.success(`${importPreview.length} employees imported successfully`);
      setImportPreview([]);
      setImportFile(null);
      fetchWorkers();
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

  const filteredItems = workers.filter(w =>
    w.worker_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pagedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 relative min-h-[600px] font-sans">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Employees
          </h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input ref={fileInputRef} type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" />

          <button
            onClick={() => productionWorkerService.downloadTemplate()}
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
          {isAdmin && (!confirmDeleteAll ? (
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
          ))}

          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 font-inter"
          >
            <Plus size={18} />
            Add Employee
          </button>

          <button
            onClick={fetchWorkers}
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
              <p className="text-xs text-gray-600 mb-3 font-inter">Found <strong>{importPreview.length}</strong> valid employees to import:</p>
              <div className="max-h-48 overflow-y-auto border border-blue-100 rounded-xl bg-white mb-4">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-100 font-bold text-gray-400 uppercase">
                    <tr>
                      <th className="p-2.5">Matricule</th>
                      <th className="p-2.5">Full Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {importPreview.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-mono font-bold text-gray-900 font-inter">{item.worker_id}</td>
                        <td className="p-2.5 font-bold text-blue-600 font-inter">{item.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={resetImport}
                  disabled={importLoading}
                  className="px-4 py-2 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all font-inter"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportConfirm}
                  disabled={importLoading}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20 font-inter disabled:opacity-60"
                >
                  {importLoading ? <RefreshCw size={14} className="animate-spin" /> : null}
                  Confirm & Import ({importPreview.length} Employees)
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
            placeholder="Search by matricule or name..."
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
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Matricule</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Full Name</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={3} className="px-6 py-6">
                      <div className="h-4 bg-gray-100 rounded w-full"></div>
                    </td>
                  </tr>
                ))
              ) : pagedItems.length > 0 ? (
                pagedItems.map((w) => (
                  <tr key={w.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors font-mono">
                        {w.worker_id}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-700 font-semibold font-inter">
                        {w.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditModal(w)}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Edit employee"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(w.id)}
                          className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                          title="Delete employee"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center">
                    <div className="inline-flex flex-col items-center">
                      <div className="p-4 bg-gray-50 rounded-full mb-3">
                        <User size={24} className="text-gray-300" />
                      </div>
                      <p className="text-sm font-bold text-gray-900 font-inter">No employees found</p>
                      <p className="text-xs text-gray-500 mt-1 font-inter">Register an employee using the button above.</p>
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
        title={editingWorker ? "Edit Employee" : "Register Employee"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
              Matricule (Worker ID) *
            </label>
            <input
              required
              type="text"
              placeholder="e.g. W001"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium font-mono"
              value={formData.worker_id}
              onChange={e => setFormData({ ...formData, worker_id: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
              Full Name *
            </label>
            <input
              required
              type="text"
              placeholder="e.g. John Doe"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
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
              Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
