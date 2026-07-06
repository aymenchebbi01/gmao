import React, { useState, useEffect } from 'react';
import {
    Search,
    MapPin,
    HardDrive,
    Package,
    Hash,
    Filter,
    RefreshCw,
    Edit2,
    Save,
    X
} from 'lucide-react';
import { Machine } from '../types';
import { api } from '../services/api';
import { cn } from '../lib/utils';
import TableFooter from './ui/TableFooter';
import Modal from './ui/Modal';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

export default function MachineConsultation() {
    const { user } = useAuth();
    const isTechnician = user?.role === 'technician';
    const [machines, setMachines] = useState<Machine[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
    const [newProduct, setNewProduct] = useState('');
    const [newMoule, setNewMoule] = useState('');
    const [saving, setSaving] = useState(false);

    const fetchMachines = async () => {
        setLoading(true);
        try {
            const items = await api.getMachines();
            setMachines(items);
        } catch (error) {
            console.error("Error fetching machines:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMachines();
    }, []);

    const handleEditClick = (machine: Machine) => {
        setSelectedMachine(machine);
        setNewProduct(machine.injectingProduct || '');
        setNewMoule(machine.currentMoule || '');
        setIsEditModalOpen(true);
    };

    const handleUpdateProduct = async () => {
        if (!selectedMachine) return;
        setSaving(true);
        try {
            await api.updateMachine(selectedMachine.id, {
                injectingProduct: newProduct,
                currentMoule: newMoule,
                updatedAt: new Date().toISOString()
            });
            toast.success('Production information updated successfully');
            setIsEditModalOpen(false);
            fetchMachines();
        } catch (error) {
            console.error("Error updating product:", error);
            toast.error('Erreur lors de la mise à jour du produit');
        } finally {
            setSaving(false);
        }
    };

    const filteredItems = machines.filter(item => {
        const search = searchTerm.toLowerCase();
        return (
            item.name.toLowerCase().includes(search) ||
            (item.siteNumber && item.siteNumber.toLowerCase().includes(search)) ||
            (item.injectingProduct && item.injectingProduct.toLowerCase().includes(search)) ||
            (item.serialNumber && item.serialNumber.toLowerCase().includes(search))
        );
    });

    const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
    const pagedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return (
        <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Injected Product Consultation</h1>
                </div>
                <button
                    onClick={fetchMachines}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-all font-inter"
                >
                    <RefreshCw size={18} className={cn(loading && "animate-spin")} />
                    Refresh
                </button>
            </div>

            <div className="flex flex-col gap-4 p-4 bg-white border border-gray-100 shadow-sm sm:flex-row sm:items-center rounded-2xl">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search by product, machine number, or name..."
                        className="w-full pl-11 pr-4 py-3 text-sm bg-gray-50/50 border border-gray-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-inter font-medium"
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setCurrentPage(1);
                        }}
                    />
                </div>
            </div>

            <div className="bg-white border border-gray-100 shadow-xl shadow-gray-200/50 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100">
                                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Machine #
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Name
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Serial Number</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Location
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Injected Product
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Moule
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right font-inter">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={6} className="px-6 py-8">
                                            <div className="h-4 bg-gray-100 rounded w-full"></div>
                                        </td>
                                    </tr>
                                ))
                            ) : pagedItems.length > 0 ? (
                                pagedItems.map((machine) => (
                                    <tr key={machine.id} className="hover:bg-blue-50/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2.5 py-1 text-blue-700 text-xs font-bold font-inter">
                                                #{machine.siteNumber || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors font-inter">
                                                    {machine.name}
                                                </span>
                                                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-0.5 font-inter">
                                                    {machine.type}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <code className="text-xs font-mono  px-2 py-1 font-bold text-black-600">
                                                {machine.serialNumber}
                                            </code>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center text-sm text-gray-600 font-medium font-inter">
                                                <MapPin size={14} className="mr-2 text-gray-400" />
                                                {machine.location}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {machine.injectingProduct ? (
                                                <span className="text-xs font-bold text-emerald-700 font-inter">
                                                    {machine.injectingProduct}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-gray-400 italic font-inter font-medium tracking-tight">No product</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {machine.currentMoule ? (
                                                <span className="text-xs font-bold text-blue-700 font-inter">
                                                    {machine.currentMoule}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-gray-400 italic font-inter font-medium tracking-tight">No mold</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {!isTechnician && (
                                                <button
                                                    onClick={() => handleEditClick(machine)}
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                    title="Update Injected Product"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <div className="inline-flex flex-col items-center">
                                            <div className="p-4 bg-gray-50 rounded-full mb-3">
                                                <Search size={24} className="text-gray-300" />
                                            </div>
                                            <p className="text-sm font-bold text-gray-900 font-inter">No machines found</p>
                                            <p className="text-xs text-gray-500 mt-1 font-inter">Try searching for a different product or machine number.</p>
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

            {/* Edit Product Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title={`Update Injected Product - ${selectedMachine?.name}`}
            >
                <div className="space-y-6 p-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1 font-inter">
                                Injected Product
                            </label>
                            <div className="relative">
                                <Package className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Enter product..."
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium"
                                    value={newProduct}
                                    onChange={(e) => setNewProduct(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1 font-inter">
                                Current Moule
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Enter mold name..."
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium"
                                    value={newMoule}
                                    onChange={(e) => setNewMoule(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                    <p className="text-[11px] text-gray-400 ml-1 font-inter">
                        Update the product and mold currently assigned to this machine.
                    </p>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            onClick={() => setIsEditModalOpen(false)}
                            className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors font-inter"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleUpdateProduct}
                            disabled={saving}
                            className={cn(
                                "flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 font-inter",
                                saving && "opacity-70 cursor-not-allowed"
                            )}
                        >
                            {saving ? (
                                <RefreshCw size={16} className="animate-spin" />
                            ) : (
                                <Save size={16} />
                            )}
                            Save Changes
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
