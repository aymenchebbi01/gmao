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

export default function MachineConsultation() {
    const [machines, setMachines] = useState<Machine[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
    const [newProduct, setNewProduct] = useState('');
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
        setIsEditModalOpen(true);
    };

    const handleUpdateProduct = async () => {
        if (!selectedMachine) return;
        setSaving(true);
        try {
            await api.updateMachine(selectedMachine.id, {
                injectingProduct: newProduct,
                updatedAt: new Date().toISOString()
            });
            toast.success('Produit injecté mis à jour avec succès');
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
                    <h1 className="text-2xl font-bold text-gray-900">Consultation des produits injectés</h1>
                </div>
                <button
                    onClick={fetchMachines}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-all font-inter"
                >
                    <RefreshCw size={18} className={cn(loading && "animate-spin")} />
                    Actualiser
                </button>
            </div>

            <div className="flex flex-col gap-4 p-4 bg-white border border-gray-100 shadow-sm sm:flex-row sm:items-center rounded-2xl">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Rechercher par produit, numéro de machine, ou nom..."
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
                                    Machine
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Nom
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Numéro de série</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Emplacement
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Produit injecté
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
                                                <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-xl border border-emerald-100 w-fit">
                                                    <Package size={14} className="text-emerald-600" />
                                                    <span className="text-xs font-bold text-emerald-700 font-inter">
                                                        {machine.injectingProduct}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-400 italic font-inter font-medium tracking-tight">Aucun produit assigné</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleEditClick(machine)}
                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                title="Modifier le produit injecté"
                                            >
                                                <Edit2 size={16} />
                                            </button>
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
                                            <p className="text-sm font-bold text-gray-900 font-inter">Aucune machine trouvée</p>
                                            <p className="text-xs text-gray-500 mt-1 font-inter">Essayez de rechercher un autre produit ou numéro.</p>
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
                title={`Modifier le produit injecté - ${selectedMachine?.name}`}
            >
                <div className="space-y-6 p-1">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1 font-inter">
                            Nom du produit injecté
                        </label>
                        <div className="relative">
                            <Package className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="Entrer le nom du produit..."
                                className="w-full pl-10 pr-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-inter font-medium"
                                value={newProduct}
                                onChange={(e) => setNewProduct(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <p className="mt-2 text-[11px] text-gray-400 ml-1 font-inter">
                            Ce champ identifie le produit actuellement en cours de production sur cette machine.
                        </p>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            onClick={() => setIsEditModalOpen(false)}
                            className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors font-inter"
                        >
                            Annuler
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
                            Enregistrer
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
