import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Package,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  History,
  Tag,
  DollarSign,
  Download
} from 'lucide-react';
import { SparePart } from '../types';
import { cn } from '../lib/utils';
import Modal from './ui/Modal';
import { Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
import { exportToCSV } from '../lib/exportUtils';
import { format } from 'date-fns';
import TableFooter from './ui/TableFooter';

export default function Inventory() {
  const [parts, setParts] = useState<SparePart[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);

  // Form state
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    sku: '',
    category: '',
    stock: 0,
    minStock: 5,
    unit: 'pcs',
    location: ''
  });

  useEffect(() => {
    const fetchParts = async () => {
      try {
        const items = await api.getSpareParts();
        setParts(items);
      } catch (error) {
        console.error("Error fetching parts:", error);
      }
    };

    fetchParts();
    const interval = setInterval(fetchParts, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEditMode && formData.id) {
        const { id, ...updateData } = formData;
        await api.updateSparePart(id, {
          ...updateData,
          updatedAt: new Date().toISOString(),
        });
        toast.success('Part updated successfully');
      } else {
        const { id, ...newData } = formData;
        await api.createSparePart({
          ...newData,
          id: `PART-${Date.now()}`,
          createdAt: new Date().toISOString(),
        } as SparePart);
        toast.success('Part added successfully');
      }
      setIsModalOpen(false);
      setIsEditMode(false);
      setFormData({
        id: '',
        name: '',
        sku: '',
        category: '',
        stock: 0,
        minStock: 5,
        unit: 'pcs',
        location: ''
      });
    } catch (error) {
      console.error("Error saving part:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (part: SparePart) => {
    setFormData({
      id: part.id || '',
      name: part.name || '',
      sku: part.sku || '',
      category: part.category || '',
      stock: part.stock || 0,
      minStock: part.minStock || 0,
      unit: part.unit || 'pcs',
      location: part.location || ''
    });
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleDeletePart = async (id: string) => {
    try {
      await api.deleteSparePart(id);
      toast.success('Part deleted successfully');
    } catch (error) {
      console.error("Error deleting part:", error);
      toast.error('Failed to delete part');
    }
  };

  const handleExport = () => {
    exportToCSV(parts, `inventory_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    toast.success('Inventory exported successfully');
  };

  const filteredParts = parts.filter(part =>
    part.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    part.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredParts.length / pageSize));
  const pagedParts = filteredParts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 relative min-h-[600px]">
      {/* List View (Blurred when form is open) */}
      <div className={cn(
        "transition-all duration-500 ease-in-out",
        isModalOpen ? "blur-xl opacity-20 scale-95 pointer-events-none" : "blur-0 opacity-100 scale-100"
      )}>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              <Download size={18} />
              Export CSV
            </button>
            <button
              onClick={() => {
                setIsEditMode(false);
                setFormData({
                  id: '',
                  name: '',
                  sku: '',
                  category: '',
                  stock: 0,
                  minStock: 5,
                  unit: 'pcs',
                  location: ''
                });
                setIsModalOpen(true);
              }}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Part
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mt-6">
          <div className="p-6 bg-white border border-gray-100 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500">Total Items</p>
              <Package className="text-blue-500" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{parts.length}</p>
          </div>
          <div className="p-6 bg-white border border-gray-100 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500">Low Stock Alerts</p>
              <AlertTriangle className="text-amber-500" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{parts.filter(p => p.stock <= p.minStock).length}</p>
          </div>
          <div className="p-6 bg-white border border-gray-100 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500">Categories</p>
              <Tag className="text-emerald-500" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {new Set(parts.map(p => p.category)).size}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search by name or SKU..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden mt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Part Info</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Ref</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Stock</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagedParts.map((part) => (
                  <tr key={part.id} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-gray-900">{part.name}</p>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{part.sku}</code>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <span className={cn(
                          "text-sm font-bold mr-2",
                          part.stock <= part.minStock ? "text-red-600" : "text-gray-900"
                        )}>
                          {part.stock} {part.unit}
                        </span>
                        {part.stock <= part.minStock && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 uppercase">
                            Low
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{part.location}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleEditClick(part)}
                          className="p-2 text-gray-400 hover:text-amber-600 transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeletePart(part.id)}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TableFooter
            totalItems={filteredParts.length}
            pageSize={pageSize}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>

      {/* Form View (Overlay) */}
      {isModalOpen && (
        <div className="absolute inset-x-0 top-0 z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{isEditMode ? "Edit Spare Part" : "Add New Spare Part"}</h1>
              <p className="text-gray-500">Fill in the details below to {isEditMode ? "update" : "register"} the part.</p>
            </div>
            <button
              onClick={() => {
                setIsModalOpen(false);
                setIsEditMode(false);
              }}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Back to List
            </button>
          </div>

          <div className="bg-white/90 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-2xl p-8">
            <form onSubmit={handleAddPart} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Part Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hydraulic Seal Kit"
                  className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Référence / Part Number</label>
                  <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      required
                      placeholder="SKU-12345"
                      className="w-full pl-10 pr-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Category</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Hydraulics"
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Stock</label>
                  <input
                    type="number"
                    required
                    min="0"
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Min Stock</label>
                  <input
                    type="number"
                    required
                    min="0"
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.minStock}
                    onChange={(e) => setFormData({ ...formData, minStock: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Unit</label>
                  <input
                    type="text"
                    required
                    placeholder="pcs, kg, m"
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Storage Location</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bin A-12"
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>
              </div>
              <div className="pt-6 flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsEditMode(false);
                  }}
                  className="flex-1 px-6 py-3 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-lg shadow-blue-500/20"
                >
                  {loading ? (isEditMode ? 'Saving...' : 'Adding...') : (isEditMode ? 'Save Changes' : 'Add Part')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
