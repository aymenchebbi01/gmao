import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, Edit3, Save, X, User, Search } from 'lucide-react';
import { productionWorkerService } from '../../services/productionApi';
import { ProductionWorker } from '../../types';
import TableFooter from '../common/TableFooter';

export default function ProductionWorkersMgmt() {
  const [workers, setWorkers] = useState<ProductionWorker[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);
  const [searchTerm, setSearchTerm] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [newForm, setNewForm] = useState({ worker_id: '', name: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ worker_id: '', name: '' });
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await productionWorkerService.getWorkers();
      setWorkers(data);
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await productionWorkerService.addWorker(newForm);
      setNewForm({ worker_id: '', name: '' });
      setShowAdd(false);
      await fetchData();
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleStartEdit = (w: ProductionWorker) => {
    setEditingId(w.id);
    setEditForm({ worker_id: w.worker_id, name: w.name });
  };

  const handleSaveEdit = async (id: string) => {
    setLoading(true);
    try {
      await productionWorkerService.updateWorker(id, editForm);
      setEditingId(null);
      await fetchData();
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      await productionWorkerService.deleteWorker(id);
      await fetchData();
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDeleteAll = async () => {
    setLoading(true);
    try {
      await productionWorkerService.deleteAllWorkers();
      setConfirmDeleteAll(false);
      await fetchData();
    } catch (err) {
      console.error('Delete all error:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredWorkers = workers.filter(w =>
    w.worker_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedWorkers = filteredWorkers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-10 font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            <User className="w-6 h-6 text-blue-600" />
            Employees & Workers
          </h2>
          <p className="text-sm text-slate-400 mt-1">{filteredWorkers.length} employee{filteredWorkers.length !== 1 ? 's' : ''} registered</p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-700 transition-all shadow-sm"
          >
            {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showAdd ? 'Cancel' : 'Register Employee'}
          </button>
        </div>
      </div>

      <div className="mb-6">
        <div className="relative max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by matricule or name..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all bg-white shadow-sm"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {showAdd && (
        <motion.form
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleCreate}
          className="bg-white border border-gray-200 p-6 rounded-2xl mb-8 shadow-sm flex flex-col sm:flex-row items-end gap-6"
        >
          <div className="flex-1 w-full">
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-2">Matricule (Worker ID)</label>
            <input
              type="text"
              required
              placeholder="e.g. W001"
              value={newForm.worker_id}
              onChange={e => setNewForm({ ...newForm, worker_id: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none"
            />
          </div>

          <div className="flex-1 w-full">
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-2">Full Name</label>
            <input
              type="text"
              required
              placeholder="e.g. John Doe"
              value={newForm.name}
              onChange={e => setNewForm({ ...newForm, name: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Cancel</button>
            <button type="submit" disabled={loading} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm">Save</button>
          </div>
        </motion.form>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Employee List</span>

          {!confirmDeleteAll ? (
            <button onClick={() => setConfirmDeleteAll(true)} className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-xl transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Clear All
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 p-1.5 rounded-xl">
              <span className="text-xs text-red-700 font-bold px-2">Delete all employees?</span>
              <button onClick={handleDeleteAll} className="bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg hover:bg-red-700">Yes</button>
              <button onClick={() => setConfirmDeleteAll(false)} className="text-xs text-slate-500 hover:text-slate-700 px-2">No</button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Matricule</th>
                <th className="p-4">Full Name</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedWorkers.map(w => (
                <tr key={w.id} className="hover:bg-slate-50/80 transition-colors">
                  {editingId === w.id ? (
                    <>
                      <td className="p-3">
                        <input type="text" value={editForm.worker_id} onChange={e => setEditForm({ ...editForm, worker_id: e.target.value })} className="w-full border rounded-lg px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-600 font-mono" />
                      </td>
                      <td className="p-3">
                        <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full border rounded-lg px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-600" />
                      </td>
                      <td className="p-3 text-center">
                        <button onClick={() => handleSaveEdit(w.id)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Save className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-4 font-mono font-bold text-blue-700">{w.worker_id}</td>
                      <td className="p-4 font-semibold text-slate-900">{w.name}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleStartEdit(w)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(w.id)} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {paginatedWorkers.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-400 italic">No employees found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TableFooter
          totalItems={filteredWorkers.length}
          pageSize={pageSize}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
