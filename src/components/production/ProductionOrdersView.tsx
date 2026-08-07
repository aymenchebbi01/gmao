import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package, Search, Calendar, CheckCircle,
  XCircle, Clock, Trash2, Edit2, AlertCircle, Plus, RefreshCw, X
} from 'lucide-react';
import { productionOrderService, productionPlanningService, generateId } from '../../services/productionApi';
import { ProductionOrder, ProductionPlanning } from '../../types';
import TableFooter from '../common/TableFooter';
import { useAuth } from '../../contexts/AuthContext';

export default function ProductionOrdersView() {
  const { user } = useAuth();
  const userName = user?.displayName || user?.username || 'Admin';

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [planningItems, setPlanningItems] = useState<ProductionPlanning[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [dueSoonOnly, setDueSoonOnly] = useState(false);
  const [planningFilter, setPlanningFilter] = useState<string>('');
  const [weekFilter, setWeekFilter] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);

  // Add modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({
    supplier: '',
    order_number: '',
    set_number: '',
    description: '',
    quantity_expected: '0',
    expected_delivery_date: new Date().toISOString().split('T')[0],
    week: ''
  });

  // Edit modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(null);
  const [editFormData, setEditFormData] = useState({
    supplier: '',
    order_number: '',
    set_number: '',
    description: '',
    quantity_expected: '',
    is_delivered: 'in progress' as ProductionOrder['is_delivered'],
    actual_delivered_date: '',
    actual_quantity_delivered: '',
    comment: '',
    department: '',
    updated_by: '',
    expected_delivery_date: '',
    week: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [fetchedOrders, fetchedPlanning] = await Promise.all([
        productionOrderService.getOrders(),
        productionPlanningService.getPlanning()
      ]);
      setOrders(fetchedOrders);
      setPlanningItems(fetchedPlanning);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, statusFilter, supplierFilter, dueSoonOnly, planningFilter, weekFilter]);

  // Suppliers & Weeks list
  const uniqueSuppliers = useMemo(() => Array.from(new Set(orders.map(o => o.supplier).filter(Boolean))).sort(), [orders]);
  const uniqueWeeks = useMemo(() => Array.from(new Set(orders.map(o => o.week).filter(Boolean))).sort(), [orders]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await productionOrderService.addOrder({
        id: generateId(),
        supplier: addFormData.supplier || 'Unknown',
        order_number: addFormData.order_number,
        set_number: addFormData.set_number,
        description: addFormData.description || undefined,
        quantity_expected: parseInt(addFormData.quantity_expected || '0'),
        quantity_delivered: 0,
        expected_delivery_date: addFormData.expected_delivery_date,
        is_delivered: 'in progress',
        week: addFormData.week || undefined
      });
      setIsAddModalOpen(false);
      setAddFormData({ supplier: '', order_number: '', set_number: '', description: '', quantity_expected: '0', expected_delivery_date: new Date().toISOString().split('T')[0], week: '' });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenEdit = (order: ProductionOrder) => {
    setSelectedOrder(order);
    setEditFormData({
      supplier: order.supplier || '',
      order_number: order.order_number || '',
      set_number: order.set_number || '',
      description: order.description || '',
      quantity_expected: String(order.quantity_expected || '0'),
      is_delivered: order.is_delivered,
      actual_delivered_date: order.actual_delivered_date || new Date().toISOString().split('T')[0],
      actual_quantity_delivered: order.actual_quantity_delivered ? String(order.actual_quantity_delivered) : String(order.quantity_expected || 0),
      comment: order.comment || '',
      department: order.department || '',
      updated_by: userName,
      expected_delivery_date: order.expected_delivery_date || '',
      week: order.week || ''
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      await productionOrderService.updateOrder(selectedOrder.id, {
        supplier: editFormData.supplier,
        order_number: editFormData.order_number,
        set_number: editFormData.set_number,
        description: editFormData.description || undefined,
        quantity_expected: parseInt(editFormData.quantity_expected || '0'),
        is_delivered: editFormData.is_delivered,
        actual_delivered_date: editFormData.is_delivered === 'yes' ? editFormData.actual_delivered_date : undefined,
        actual_quantity_delivered: editFormData.is_delivered === 'yes' ? parseInt(editFormData.actual_quantity_delivered || '0') : undefined,
        comment: editFormData.comment || undefined,
        department: editFormData.department || undefined,
        updated_by: userName,
        expected_delivery_date: editFormData.expected_delivery_date,
        week: editFormData.week || undefined
      });
      setIsEditModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteOrder = async (id: string) => {
    if (!confirm('Are you sure you want to delete this order?')) return;
    try {
      await productionOrderService.deleteOrder(id);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // Filter calculations
  const filteredOrders = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return orders.filter(o => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches = o.order_number.toLowerCase().includes(term) || o.set_number.toLowerCase().includes(term) || o.supplier.toLowerCase().includes(term) || (o.description || '').toLowerCase().includes(term);
        if (!matches) return false;
      }
      if (statusFilter && o.is_delivered !== statusFilter) return false;
      if (supplierFilter && o.supplier !== supplierFilter) return false;
      if (weekFilter && o.week !== weekFilter) return false;
      if (planningFilter && o.set_number !== planningFilter) return false;
      if (dueSoonOnly) {
        if (o.is_delivered === 'yes' || o.is_delivered === 'eliminated') return false;
        const diffDays = Math.ceil((new Date(o.expected_delivery_date).getTime() - new Date(today).getTime()) / (1000 * 3600 * 24));
        if (diffDays < 0 || diffDays > 7) return false;
      }
      return true;
    });
  }, [orders, searchTerm, statusFilter, supplierFilter, weekFilter, planningFilter, dueSoonOnly]);

  const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 font-sans space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-600" />
            Supplier Orders Tracking
          </h1>
          <p className="text-xs text-slate-500 mt-1">Track expected deliveries, actual received quantities, and order statuses</p>
        </div>

        <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-all">
          <Plus className="w-4 h-4" /> Add Order
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input type="text" placeholder="Search order/set/supplier..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-600 bg-slate-50/50" />
          </div>

          <div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-xs bg-white outline-none focus:ring-2 focus:ring-blue-600">
              <option value="">All Statuses</option>
              <option value="in progress">In Progress</option>
              <option value="yes">Delivered</option>
              <option value="no">Not Delivered</option>
              <option value="late">Late</option>
              <option value="eliminated">Eliminated</option>
            </select>
          </div>

          <div>
            <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-xs bg-white outline-none focus:ring-2 focus:ring-blue-600">
              <option value="">All Suppliers</option>
              {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <select value={weekFilter} onChange={e => setWeekFilter(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-xs bg-white outline-none focus:ring-2 focus:ring-blue-600">
              <option value="">All Weeks</option>
              {uniqueWeeks.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>

          <div>
            <select value={planningFilter} onChange={e => setPlanningFilter(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-xs bg-white outline-none focus:ring-2 focus:ring-blue-600">
              <option value="">All Planning Sets</option>
              {planningItems.map(p => <option key={p.id} value={p.set_number}>{p.set_number}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setDueSoonOnly(!dueSoonOnly)} className={`w-full py-2 px-3 rounded-xl text-xs font-bold uppercase transition-all ${dueSoonOnly ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              Due Soon (7d)
            </button>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-3">Order #</th>
                <th className="p-3">Supplier</th>
                <th className="p-3">Set Number</th>
                <th className="p-3">Expected Date</th>
                <th className="p-3 text-right">Expected Qty</th>
                <th className="p-3 text-right">Actual Qty</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedOrders.map(o => (
                <tr key={o.id} className="hover:bg-slate-50/50">
                  <td className="p-3 font-mono font-bold text-blue-700">{o.order_number}</td>
                  <td className="p-3 font-semibold text-slate-800">{o.supplier}</td>
                  <td className="p-3 text-slate-600">{o.set_number}</td>
                  <td className="p-3 text-slate-600">{o.expected_delivery_date}</td>
                  <td className="p-3 text-right font-mono font-bold">{o.quantity_expected.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-600">{(o.actual_quantity_delivered || o.quantity_delivered || 0).toLocaleString()}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      o.is_delivered === 'yes' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      o.is_delivered === 'late' ? 'bg-red-50 text-red-700 border border-red-200' :
                      o.is_delivered === 'eliminated' ? 'bg-slate-100 text-slate-500' :
                      'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                      {o.is_delivered}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleOpenEdit(o)} className="p-1 text-slate-500 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteOrder(o.id)} className="p-1 text-slate-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 italic">No orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TableFooter
          totalItems={filteredOrders.length}
          pageSize={pageSize}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <h3 className="text-base font-bold text-slate-900">Add New Order</h3>
              <button onClick={() => setIsAddModalOpen(false)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Order #</label>
                  <input type="text" required value={addFormData.order_number} onChange={e => setAddFormData({ ...addFormData, order_number: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-600" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Supplier</label>
                  <input type="text" required value={addFormData.supplier} onChange={e => setAddFormData({ ...addFormData, supplier: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-600" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Set Number</label>
                  <input type="text" required value={addFormData.set_number} onChange={e => setAddFormData({ ...addFormData, set_number: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-600" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Expected Qty</label>
                  <input type="number" min="1" value={addFormData.quantity_expected} onChange={e => setAddFormData({ ...addFormData, quantity_expected: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-600 font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Expected Date</label>
                  <input type="date" required value={addFormData.expected_delivery_date} onChange={e => setAddFormData({ ...addFormData, expected_delivery_date: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-600" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Week</label>
                  <input type="text" placeholder="e.g. S32" value={addFormData.week} onChange={e => setAddFormData({ ...addFormData, week: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-600" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Description</label>
                <textarea rows={2} value={addFormData.description} onChange={e => setAddFormData({ ...addFormData, description: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-600" />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider">Save Order</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <h3 className="text-base font-bold text-slate-900">Update Order: {selectedOrder.order_number}</h3>
              <button onClick={() => setIsEditModalOpen(false)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
            </div>

            <form onSubmit={handleUpdateOrder} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Status</label>
                  <select value={editFormData.is_delivered} onChange={e => setEditFormData({ ...editFormData, is_delivered: e.target.value as any })} className="w-full border rounded-xl px-3 py-2 text-xs bg-white outline-none focus:ring-2 focus:ring-blue-600">
                    <option value="in progress">In Progress</option>
                    <option value="yes">Delivered</option>
                    <option value="no">Not Delivered</option>
                    <option value="late">Late</option>
                    <option value="eliminated">Eliminated</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Actual Delivered Qty</label>
                  <input type="number" min="0" value={editFormData.actual_quantity_delivered} onChange={e => setEditFormData({ ...editFormData, actual_quantity_delivered: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-600" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Comment / Notes</label>
                <textarea rows={2} value={editFormData.comment} onChange={e => setEditFormData({ ...editFormData, comment: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-600" />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider">Update Order</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
