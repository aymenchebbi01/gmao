import React, { useState, useEffect } from 'react';
import {
  Database,
  Search,
  Edit2,
  Trash2,
  RefreshCw,
  Calendar,
  Check,
  X,
  User,
  Clock,
  Hash
} from 'lucide-react';
import { productionRecordService, productionLineService, productionWorkerService } from '../../services/productionApi';
import { ProductionRecord, ProductionLine, ProductionWorker } from '../../types';
import TableFooter from '../ui/TableFooter';
import Modal from '../ui/Modal';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

export default function ProductionManagement() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [editingRecord, setEditingRecord] = useState<ProductionRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<ProductionRecord>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);

  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const [machines, setMachines] = useState<ProductionLine[]>([]);
  const [workers, setWorkers] = useState<ProductionWorker[]>([]);

  useEffect(() => {
    productionLineService.getLines().then(setMachines).catch(console.error);
    productionWorkerService.getWorkers().then(setWorkers).catch(console.error);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await productionRecordService.getRecords({
        workerId: searchTerm || undefined,
        dateStart: dateFilter || undefined,
        dateEnd: dateFilter || undefined,
      });
      setRecords(data);
    } catch (error) {
      toast.error('Error fetching production records');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateFilter]);

  const openEditModal = (record: ProductionRecord) => {
    setEditingRecord(record);
    setEditFormData({
      worker_id: record.worker_id,
      worker_name: record.worker_name,
      set_number: record.set_number,
      item_number: record.item_number,
      quantity: record.quantity,
      machine_name: record.machine_name,
      hours_worked: record.hours_worked,
      date: record.date,
    });
    setIsModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord?.id) return;
    try {
      await productionRecordService.updateRecord(editingRecord.id, editFormData as any);
      toast.success('Record updated successfully');
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Error updating record');
      console.error(error);
    }
  };

  const handleDelete = async (recordId: string) => {
    if (!confirm('Are you sure you want to delete this raw production record?')) return;
    try {
      await productionRecordService.deleteRecord(recordId);
      toast.success('Record deleted');
      fetchData();
    } catch (error) {
      toast.error('Error deleting record');
      console.error(error);
    }
  };

  const handleDeleteAll = async () => {
    try {
      await productionRecordService.deleteAllRecords();
      setConfirmDeleteAll(false);
      toast.success('All raw production records cleared');
      fetchData();
    } catch (error) {
      toast.error('Error clearing database');
      console.error(error);
    }
  };

  const filteredItems = records.filter(r =>
    (r.worker_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.worker_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.set_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.item_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.machine_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pagedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 relative min-h-[600px] font-sans">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="w-6 h-6 text-blue-600" />
            Production Management
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {!confirmDeleteAll ? (
            <button
              onClick={() => setConfirmDeleteAll(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-all font-inter"
            >
              <Trash2 size={18} />
              Clear Database
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 p-1.5 rounded-xl">
              <span className="text-xs text-red-700 font-bold px-2">Wipe all raw data?</span>
              <button
                onClick={handleDeleteAll}
                className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-lg hover:bg-red-700 transition-all"
              >
                Yes, Wipe
              </button>
              <button
                onClick={() => setConfirmDeleteAll(false)}
                className="text-xs text-slate-500 hover:text-slate-700 px-2"
              >
                Cancel
              </button>
            </div>
          )}

          <button
            onClick={fetchData}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
            title="Refresh list"
          >
            <RefreshCw size={18} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Filter Card */}
      <div className="flex flex-col gap-4 p-4 bg-white border border-gray-100 shadow-sm sm:flex-row sm:items-center rounded-2xl mt-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by matricule, name, set, item, or machine..."
            className="w-full pl-11 pr-4 py-3 text-sm bg-gray-50/50 border border-gray-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-inter font-medium"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className="w-full sm:w-48">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-4 py-3 text-sm bg-gray-50/50 border border-gray-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-inter font-medium"
          />
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white border border-gray-100 shadow-xl shadow-gray-200/50 rounded-2xl overflow-hidden mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Matricule</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Name</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Machine Line</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Hours</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Set No.</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Item Ref</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Qty Produced</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={9} className="px-6 py-6">
                      <div className="h-4 bg-gray-100 rounded w-full"></div>
                    </td>
                  </tr>
                ))
              ) : pagedItems.length > 0 ? (
                pagedItems.map((r) => (
                  <tr key={r.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-gray-600 font-inter">
                        {r.date}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors font-mono">
                        {r.worker_id}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-700 font-semibold font-inter">
                        {r.worker_name || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 font-medium font-inter">
                        {r.machine_name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-sm font-bold text-gray-700 font-inter">
                        <Clock size={14} className="text-gray-400" />
                        {r.hours_worked}h
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-slate-800 font-inter">
                        {r.set_number}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 font-medium font-inter">
                        {r.item_number}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-sm font-bold text-blue-600 font-inter">
                      {r.quantity.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditModal(r)}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Edit record"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(r.id!)}
                          className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                          title="Delete record"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <div className="inline-flex flex-col items-center">
                      <div className="p-4 bg-gray-50 rounded-full mb-3">
                        <Database size={24} className="text-gray-300" />
                      </div>
                      <p className="text-sm font-bold text-gray-900 font-inter">No raw production records found</p>
                      <p className="text-xs text-gray-500 mt-1 font-inter">Check back after workers submit output records.</p>
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

      {/* Modal Dialog for Edit Record */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Edit Raw Production Record"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
                Date *
              </label>
              <input
                required
                type="date"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium"
                value={editFormData.date || ''}
                onChange={e => setEditFormData({ ...editFormData, date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
                Hours Worked *
              </label>
              <input
                required
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium font-mono"
                value={editFormData.hours_worked || ''}
                onChange={e => setEditFormData({ ...editFormData, hours_worked: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
                Matricule *
              </label>
              <input
                required
                type="text"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium font-mono"
                value={editFormData.worker_id || ''}
                onChange={e => {
                  const val = e.target.value;
                  const worker = workers.find(w => w.worker_id === val);
                  setEditFormData({
                    ...editFormData,
                    worker_id: val,
                    worker_name: worker ? worker.name : editFormData.worker_name
                  });
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
                Worker Name
              </label>
              <input
                type="text"
                readOnly
                className="w-full px-4 py-2.5 bg-gray-100 border border-gray-100 rounded-xl text-sm font-inter font-medium text-gray-500 cursor-not-allowed"
                value={editFormData.worker_name || ''}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
              Machine / Production Line *
            </label>
            <select
              required
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium bg-white"
              value={editFormData.machine_name || ''}
              onChange={e => setEditFormData({ ...editFormData, machine_name: e.target.value })}
            >
              <option value="">Select Line...</option>
              {machines.map(m => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
                Set Number *
              </label>
              <input
                required
                type="text"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium"
                value={editFormData.set_number || ''}
                onChange={e => setEditFormData({ ...editFormData, set_number: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
                Item Ref *
              </label>
              <input
                required
                type="text"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium"
                value={editFormData.item_number || ''}
                onChange={e => setEditFormData({ ...editFormData, item_number: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
                Quantity *
              </label>
              <input
                required
                type="number"
                min="1"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium font-mono"
                value={editFormData.quantity || ''}
                onChange={e => setEditFormData({ ...editFormData, quantity: parseInt(e.target.value) || 0 })}
              />
            </div>
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
              Save Record
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


