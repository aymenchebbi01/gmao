import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Filter, Plus, X, Layers, Table as TableIcon } from 'lucide-react';
import ProductionConsultation, { SharedFilters } from './ProductionConsultation';
import ProductionDetailed from './ProductionDetailed';
import ProductionRendementEntry from './ProductionRendementEntry';

const MACHINE_CATEGORIES = ['Tompographie', 'Assemblage', 'Blister', 'Spray', 'Table'];

interface RendementOverviewProps {
  role?: string;
  displayName?: string;
}

export default function ProductionRendementOverview({ role = 'admin', displayName = '' }: RendementOverviewProps) {
  const isAdmin = role === 'admin' || role === 'manager';
  const [showAddForm, setShowAddForm] = useState(false);

  const [filters, setFilters] = useState<SharedFilters>({
    workerId: '',
    dateStart: '',
    dateEnd: '',
    setNumber: '',
    itemNumber: '',
    machineCategory: '',
  });

  const [searchSignal, setSearchSignal] = useState(0);

  const handleSearch = () => {
    setSearchSignal(prev => prev + 1);
  };

  const handleReset = () => {
    setFilters({
      workerId: '',
      dateStart: '',
      dateEnd: '',
      setNumber: '',
      itemNumber: '',
      machineCategory: '',
    });
    setSearchSignal(prev => prev + 1);
  };

  return (
    <div className="flex h-full flex-col bg-slate-50 overflow-hidden font-sans">
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 z-20 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-blue-600" />
            Production Rendement Overview
          </h1>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-xs ${showAddForm
              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
              }`}
          >
            {showAddForm ? (
              <>
                <X className="w-4 h-4" />
                Close Form
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add New
              </>
            )}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-1 px--2 space-y-4">
        {showAddForm ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden bg-white border border-blue-100 rounded-2xl shadow-lg p-6 relative"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Add New Production
                </h3>
              </div>
              <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <ProductionRendementEntry displayName={displayName} />
          </motion.div>
        ) : (
          <>
            <div className="w-full bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Filters</h3>
                </div>
                {Object.values(filters).some(Boolean) && (
                  <button onClick={handleReset} className="text-[11px] font-semibold text-slate-400 hover:text-slate-700">
                    Clear all filters
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3 items-end">
                {isAdmin && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Matricule</label>
                    <input
                      type="text"
                      placeholder="Filter by matricule..."
                      value={filters.workerId || ''}
                      onChange={(e) => setFilters({ ...filters, workerId: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-blue-600 outline-none bg-slate-50/50"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={filters.dateStart || ''}
                    onChange={(e) => setFilters({ ...filters, dateStart: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-blue-600 outline-none bg-slate-50/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">End Date</label>
                  <input
                    type="date"
                    value={filters.dateEnd || ''}
                    onChange={(e) => setFilters({ ...filters, dateEnd: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-blue-600 outline-none bg-slate-50/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Set Number</label>
                  <input
                    type="text"
                    placeholder="Filter by set..."
                    value={filters.setNumber || ''}
                    onChange={(e) => setFilters({ ...filters, setNumber: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-blue-600 outline-none bg-slate-50/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Item Ref</label>
                  <input
                    type="text"
                    placeholder="Search items..."
                    value={filters.itemNumber || ''}
                    onChange={(e) => setFilters({ ...filters, itemNumber: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-blue-600 outline-none bg-slate-50/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                  <select
                    value={filters.machineCategory || ''}
                    onChange={(e) => setFilters({ ...filters, machineCategory: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-600 outline-none"
                  >
                    <option value="">All Categories</option>
                    {MACHINE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <button
                    onClick={handleSearch}
                    className="w-full h-[38px] flex items-center justify-center gap-2 bg-slate-900 text-white rounded-xl text-xs font-bold tracking-wider uppercase hover:bg-slate-800 transition-colors shadow-xs"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Search
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs p-6 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <TableIcon className="w-4 h-4 text-blue-600" />
                <h2 className="text-lg font-bold tracking-tight text-slate-800">Consultation</h2>
              </div>
              <ProductionConsultation role={role} externalFilters={filters} searchSignal={searchSignal} hideFilterBar={true} />
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs p-6 space-y-4">
              <ProductionDetailed externalFilters={filters} searchSignal={searchSignal} hideFilterBar={true} showTitle={true} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
