import React, { useState, useEffect, useRef } from 'react';
import {
    Package,
    Plus,
    FileSpreadsheet,
    Search,
    Edit2,
    Trash2,
    Save,
    X,
    RefreshCw,
    Download,
    FileDown,
    DollarSign,
    Clock,
    Hash
} from 'lucide-react';
import { ProductionProduct } from '../types';
import { api } from '../services/api';
import { cn } from '../lib/utils';
import Modal from './ui/Modal';
import TableFooter from './ui/TableFooter';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';

export default function ProductManagement() {
    const { user } = useAuth();
    const isTechnician = user?.role === 'technician';
    const [products, setProducts] = useState<ProductionProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<ProductionProduct | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState<Partial<ProductionProduct>>({
        item: '',
        description: '',
        color: '',
        cycleTime: 0,
        qtyProduced: 0,
        priceTN: 0,
        priceMalta: 0
    });

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const data = await api.getProducts();
            setProducts(data);
        } catch (error) {
            toast.error('Error fetching products');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingProduct) {
                await api.updateProduct(editingProduct.id, formData);
                toast.success('Product updated successfully');
            } else {
                await api.saveProducts(formData as ProductionProduct);
                toast.success('Product added successfully');
            }
            setIsModalOpen(false);
            fetchProducts();
        } catch (error) {
            toast.error('Error saving product');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this product?')) return;
        try {
            await api.deleteProduct(id);
            toast.success('Product deleted');
            fetchProducts();
        } catch (error) {
            toast.error('Error deleting product');
        }
    };

    const openEditModal = (product: ProductionProduct) => {
        setEditingProduct(product);
        setFormData(product);
        setIsModalOpen(true);
    };

    const openCreateModal = () => {
        setEditingProduct(null);
        setFormData({
            item: '',
            description: '',
            color: '',
            cycleTime: 0,
            qtyProduced: 0,
            priceTN: 0,
            priceMalta: 0
        });
        setIsModalOpen(true);
    };

    // ── Download Import Template ──────────────────────────────────────────────
    const downloadTemplate = () => {
        const headers = [
            'Item',
            'Description',
            'Color',
            'Cycle time/s',
            'qty produced',
            'TN price',
            'Malta price'
        ];

        const sampleRows = [
            {
                Item: 'SAMPLE-001',
                Description: 'Example product description',
                Color: 'Black',
                'Cycle time/s': 28.5,
                'qty produced': 1000,
                'TN price': 1.250,
                'Malta price': 1.500
            },
            {
                Item: 'SAMPLE-002',
                Description: 'Another example product',
                Color: 'White',
                'Cycle time/s': 32.0,
                'qty produced': 2500,
                'TN price': 0.980,
                'Malta price': 1.200
            }
        ];

        const ws = XLSX.utils.json_to_sheet(sampleRows, { header: headers });

        // Style the header row width hints
        ws['!cols'] = [
            { wch: 18 }, // Item
            { wch: 32 }, // Description
            { wch: 14 }, // Color
            { wch: 14 }, // Cycle time/s
            { wch: 14 }, // qty produced
            { wch: 12 }, // TN price
            { wch: 14 }, // Malta price
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Items Template');
        XLSX.writeFile(wb, 'items_import_template.xlsx');
        toast.success('Template downloaded — fill it in and use "Import Excel" to upload');
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const bstr = event.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                if (data.length === 0) {
                    toast.error('The Excel file is empty');
                    return;
                }

                // Map Excel headers to our product fields
                const mappedProducts = data.map((row: any) => ({
                    item: String(row.Item || row.item || ''),
                    description: String(row.Description || row.description || ''),
                    color: String(row.Color || row.color || ''),
                    cycleTime: Number(row['Cycle time/s'] || row['Cycle Time'] || row.cycleTime || 0),
                    qtyProduced: Number(row['qty produced'] || row['Qty Produced'] || row.qtyProduced || 0),
                    priceTN: Number(row['TN price'] || row['TN Price'] || row.priceTN || 0),
                    priceMalta: Number(row['Malta price'] || row['Malta Price'] || row.priceMalta || 0)
                })).filter(p => p.item);

                if (mappedProducts.length === 0) {
                    toast.error('No valid products found in Excel file');
                    return;
                }

                await api.saveProducts(mappedProducts as ProductionProduct[]);
                toast.success(`${mappedProducts.length} products imported successfully`);
                fetchProducts();
                if (fileInputRef.current) fileInputRef.current.value = '';
            } catch (error) {
                toast.error('Error parsing Excel file');
                console.error(error);
            }
        };
        reader.readAsBinaryString(file);
    };

    const filteredItems = products.filter(p =>
        p.item.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.color.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
    const pagedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return (
        <div className="space-y-6 relative min-h-[600px]">
            {/* List View */}
            <div className={cn(
                "transition-all duration-500 ease-in-out",
                isModalOpen ? "blur-xl opacity-20 scale-95 pointer-events-none" : "blur-0 opacity-100 scale-100"
            )}>
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Items Management</h1>
                    </div>
                    <div className="flex gap-3">
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept=".xlsx, .xls"
                            onChange={handleFileUpload}
                        />
                        <button
                            onClick={downloadTemplate}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-violet-600 bg-violet-50 border border-violet-100 rounded-xl hover:bg-violet-100 transition-all font-inter"
                            title="Download an Excel template with the correct column headers"
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
                        <button
                            onClick={openCreateModal}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 font-inter"
                        >
                            <Plus size={18} />
                            Add Item
                        </button>
                        <button
                            onClick={fetchProducts}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                        >
                            <RefreshCw size={18} className={cn(loading && "animate-spin")} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-4 p-4 bg-white border border-gray-100 shadow-sm sm:flex-row sm:items-center rounded-2xl mt-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="Search by item, description, or color..."
                            className="w-full pl-11 pr-4 py-3 text-sm bg-gray-50/50 border border-gray-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-inter font-medium"
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setCurrentPage(1);
                            }}
                        />
                    </div>
                </div>

                <div className="bg-white border border-gray-100 shadow-xl shadow-gray-200/50 rounded-2xl overflow-hidden mt-6">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-100">
                                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Item</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Description</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Color</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Cycle (s)</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Qty Produced</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">TN Price</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Malta Price</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan={8} className="px-6 py-6">
                                                <div className="h-4 bg-gray-100 rounded w-full"></div>
                                            </td>
                                        </tr>
                                    ))
                                ) : pagedItems.length > 0 ? (
                                    pagedItems.map((p) => (
                                        <tr key={p.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-6 py-4">
                                                <span className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors font-inter">
                                                    {p.item}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm text-gray-500 font-medium font-inter">
                                                    {p.description}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-gray-600 font-medium font-inter capitalize">
                                                        {p.color}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-1 text-sm font-bold text-gray-700 font-inter">
                                                    <Clock size={14} className="text-gray-400" />
                                                    {p.cycleTime || 0}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm font-bold text-blue-600 font-inter">
                                                {(p.qtyProduced || 0).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-1 text-sm font-bold text-emerald-600 font-inter">
                                                    <DollarSign size={12} />
                                                    {(p.priceTN || 0).toFixed(3)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-1 text-sm font-bold text-amber-600 font-inter">
                                                    <DollarSign size={12} />
                                                    {(p.priceMalta || 0).toFixed(3)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {!isTechnician && (
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => openEditModal(p)}
                                                            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                                            title="Edit product"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(p.id)}
                                                            className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                                            title="Delete product"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center">
                                            <div className="inline-flex flex-col items-center">
                                                <div className="p-4 bg-gray-50 rounded-full mb-3">
                                                    <Package size={24} className="text-gray-300" />
                                                </div>
                                                <p className="text-sm font-bold text-gray-900 font-inter">No items found</p>
                                                <p className="text-xs text-gray-500 mt-1 font-inter">Add items manually or import an Excel file.</p>
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
            </div>

            {/* Form View Overlay */}
            {isModalOpen && (
                <div className="absolute inset-x-0 top-0 z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{editingProduct ? "Edit Item" : "Add New Item"}</h1>
                        </div>
                        <button
                            onClick={() => {
                                setIsModalOpen(false);
                                setEditingProduct(null);
                            }}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-inter"
                        >
                            Back to List
                        </button>
                    </div>

                    <div className="bg-white/90 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-2xl p-8">
                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
                                        Item / Reference
                                    </label>
                                    <input
                                        required
                                        type="text"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium"
                                        value={formData.item}
                                        onChange={e => setFormData({ ...formData, item: e.target.value })}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
                                        Description
                                    </label>
                                    <textarea
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium"
                                        value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
                                        Color
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium"
                                        value={formData.color}
                                        onChange={e => setFormData({ ...formData, color: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
                                        Cycle Time (s)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-bold"
                                        value={formData.cycleTime}
                                        onChange={e => setFormData({ ...formData, cycleTime: Number(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
                                        Qty Produced
                                    </label>
                                    <input
                                        type="number"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-bold"
                                        value={formData.qtyProduced}
                                        onChange={e => setFormData({ ...formData, qtyProduced: Number(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    {/* Spacer */}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
                                        TN Price
                                    </label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                        <input
                                            type="number"
                                            step="0.001"
                                            className="w-full pl-8 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-bold text-emerald-600"
                                            value={formData.priceTN}
                                            onChange={e => setFormData({ ...formData, priceTN: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 font-inter">
                                        Malta Price
                                    </label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                        <input
                                            type="number"
                                            step="0.001"
                                            className="w-full pl-8 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-bold text-amber-600"
                                            value={formData.priceMalta}
                                            onChange={e => setFormData({ ...formData, priceMalta: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsModalOpen(false);
                                        setEditingProduct(null);
                                    }}
                                    className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 font-inter"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all font-inter shadow-lg shadow-blue-500/20"
                                >
                                    <Save size={16} />
                                    {editingProduct ? 'Save Changes' : 'Add Item'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
