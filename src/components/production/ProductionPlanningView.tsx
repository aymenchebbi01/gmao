import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Calendar, Plus, Trash2, Edit2, Search, X } from 'lucide-react';
import { productionPlanningService, generateId } from '../../services/productionApi';
import { ProductionPlanning } from '../../types';
import TableFooter from '../common/TableFooter';

export default function ProductionPlanningView() {
  const [loading, setLoading] = useState(false);
  const [planningItems, setPlanningItems] = useState<ProductionPlanning[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);

  const [showAdd, setShowAdd] = useState(false);
  const [newForm, setNewForm] = useState({
    set_number: '',
    description: '',
    quantity: '0',
    week: '',
    total_amount: '',
    total_number_in_box: '',
    total_number_of_pallets: '',
    order_numbers: '',
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    set_number: '',
    description: '',
    quantity: '0',
    week: '',
    total_amount: '',
    total_number_in_box: '',
    total_number_of_pallets: '',
    order_numbers: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await productionPlanningService.getPlanning();
      setPlanningItems(data);
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
    try {
      await productionPlanningService.addPlanning({
        id: generateId(),
        set_number: newForm.set_number,
        description: newForm.description || undefined,
        quantity: parseInt(newForm.quantity || '0'),
        week: newForm.week || undefined,
        total_amount: newForm.total_amount ? parseFloat(newForm.total_amount) : undefined,
        total_number_in_box: newForm.total_number_in_box ? parseInt(newForm.total_number_in_box) : undefined,
        total_number_of_pallets: newForm.total_number_of_pallets ? parseInt(newForm.total_number_of_pallets) : undefined,
        order_numbers: newForm.order_numbers || undefined,
      });
      setShowAdd(false);
      setNewForm({ set_number: '', description: '', quantity: '0', week: '', total_amount: '', total_number_in_box: '', total_number_of_pallets: '', order_numbers: '' });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartEdit = (p: ProductionPlanning) => {
    setEditingId(p.id);
    setEditForm({
      set_number: p.set_number,
      description: p.description || '',
      quantity: String(p.quantity || 0),
      week: p.week || '',
      total_amount: p.total_amount !== undefined && p.total_amount !== null ? String(p.total_amount) : '',
      total_number_in_box: p.total_number_in_box !== undefined && p.total_number_in_box !== null ? String(p.total_number_in_box) : '',
      total_number_of_pallets: p.total_number_of_pallets !== undefined && p.total_number_of_pallets !== null ? String(p.total_number_of_pallets) : '',
      order_numbers: p.order_numbers || '',
    });
  };

  const handleSaveEdit = async (id: string) => {
    try {
      await productionPlanningService.updatePlanning(id, {
        set_number: editForm.set_number,
        description: editForm.description || undefined,
        quantity: parseInt(editForm.quantity || '0'),
        week: editForm.week || undefined,
        total_amount: editForm.total_amount ? parseFloat(editForm.total_amount) : undefined,
        total_number_in_box: editForm.total_number_in_box ? parseInt(editForm.total_number_in_box) : undefined,
        total_number_of_pallets: editForm.total_number_of_pallets ? parseInt(editForm.total_number_of_pallets) : undefined,
        order_numbers: editForm.order_numbers || undefined,
      });
      setEditingId(null);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this planning item?')) return;
    try {
      await productionPlanningService.deletePlanning(id);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredItems = planningItems.filter(p =>
    p.set_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.week || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 font-sans space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-600" />
            Weekly Production Planning
          </h1>
          <p className="text-xs text-slate-500 mt-1">Manage weekly planned quantities, set numbers, and pallet targets</p>
        </div>

        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-all">
          {showAdd ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showAdd ? 'Cancel' : 'Add Planning Item'}
        </button>
      </div>

      {showAdd && (
        <motion.form initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleCreate} className="bg-white border border-gray-200 p-6 rounded-2xl shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">New Planning Entry</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Set Number</label>
              <input type="text" required value={newForm.set_number} onChange={e => setNewForm({ ...newForm, set_number: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-600" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Week</label>
              <input type="text" placeholder="e.g. S32" value={newForm.week} onChange={e => setNewForm({ ...newForm, week: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-600" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Target Quantity</label>
              <input type="number" min="1" value={newForm.quantity} onChange={e => setNewForm({ ...newForm, quantity: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-600" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Order #s</label>
              <input type="text" placeholder="e.g. ORD-100, ORD-101" value={newForm.order_numbers} onChange={e => setNewForm({ ...newForm, order_numbers: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-600" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Cancel</button>
            <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm">Save Entry</button>
          </div>
        </motion.form>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input type="text" placeholder="Search by set, description, or week..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-600 bg-slate-50/50" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-3">Week</th>
                <th className="p-3">Set Number</th>
                <th className="p-3">Description</th>
                <th className="p-3 text-right">Target Quantity</th>
                <th className="p-3">Related Order #s</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedItems.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  {editingId === p.id ? (
                    <>
                      <td className="p-2"><input type="text" value={editForm.week} onChange={e => setEditForm({ ...editForm, week: e.target.value })} className="w-full border rounded px-2 py-1 text-xs" /></td>
                      <td className="p-2"><input type="text" value={editForm.set_number} onChange={e => setEditForm({ ...editForm, set_number: e.target.value })} className="w-full border rounded px-2 py-1 text-xs font-bold" /></td>
                      <td className="p-2"><input type="text" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="w-full border rounded px-2 py-1 text-xs" /></td>
                      <td className="p-2"><input type="number" value={editForm.quantity} onChange={e => setEditForm({ ...editForm, quantity: e.target.value })} className="w-full border rounded px-2 py-1 text-xs text-right font-mono" /></td>
                      <td className="p-2"><input type="text" value={editForm.order_numbers} onChange={e => setEditForm({ ...editForm, order_numbers: e.target.value })} className="w-full border rounded px-2 py-1 text-xs" /></td>
                      <td className="p-2 text-center">
                        <button onClick={() => handleSaveEdit(p.id)} className="px-2 py-1 bg-blue-600 text-white rounded text-[10px] font-bold mr-1">Save</button>
                        <button onClick={() => setEditingId(null)} className="px-2 py-1 bg-slate-200 text-slate-600 rounded text-[10px]">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3 font-semibold text-slate-700">{p.week || '-'}</td>
                      <td className="p-3 font-bold text-slate-900">{p.set_number}</td>
                      <td className="p-3 text-slate-600">{p.description || '-'}</td>
                      <td className="p-3 text-right font-mono font-bold text-blue-600">{p.quantity.toLocaleString()}</td>
                      <td className="p-3 font-mono text-slate-500">{p.order_numbers || '-'}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleStartEdit(p)} className="p-1 text-slate-500 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(p.id)} className="p-1 text-slate-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {paginatedItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 italic">No planning items found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TableFooter
          totalItems={filteredItems.length}
          pageSize={pageSize}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
