import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Search, Filter, Download, Table as TableIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import { productionRecordService } from '../../services/productionApi';
import { ProductionRecord, ProductionAggregatedResult } from '../../types';
import TableFooter from '../common/TableFooter';

const MACHINE_CATEGORIES = ['Tompographie', 'Assemblage', 'Blister', 'Spray', 'Table'];

export interface SharedFilters {
  dateStart?: string;
  dateEnd?: string;
  setNumber?: string;
  itemNumber?: string;
  workerId?: string;
  workerName?: string;
  machineCategory?: string;
}

interface ConsultationViewProps {
  role?: string;
  externalFilters?: SharedFilters;
  searchSignal?: number;
  hideFilterBar?: boolean;
}

export default function ProductionConsultation({ role = 'admin', externalFilters, searchSignal, hideFilterBar = false }: ConsultationViewProps) {
  const isAdmin = role === 'admin' || role === 'manager';
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [aggregated, setAggregated] = useState<ProductionAggregatedResult[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);

  const [filters, setFilters] = useState<SharedFilters>({
    dateStart: '',
    dateEnd: '',
    setNumber: '',
    itemNumber: '',
    workerId: '',
    machineCategory: '',
  });

  const activeFilters = externalFilters || filters;

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await productionRecordService.getRecords(activeFilters);
      setRecords(data);
      setAggregated(productionRecordService.aggregateData(data));
      setCurrentPage(1);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchSignal, externalFilters]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(aggregated);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Aggregated Rendement');
    XLSX.writeFile(wb, `rendement_aggregated_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const paginatedAggregated = aggregated.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="w-full font-sans space-y-4">
      {!hideFilterBar && (
        <form onSubmit={handleSearch} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Filters</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 items-end">
            {isAdmin && (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Matricule</label>
                <input type="text" placeholder="Worker ID..." value={filters.workerId || ''} onChange={e => setFilters({ ...filters, workerId: e.target.value })} className="w-full border rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-600 bg-slate-50/50" />
              </div>
            )}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Start Date</label>
              <input type="date" value={filters.dateStart || ''} onChange={e => setFilters({ ...filters, dateStart: e.target.value })} className="w-full border rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-600 bg-slate-50/50" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">End Date</label>
              <input type="date" value={filters.dateEnd || ''} onChange={e => setFilters({ ...filters, dateEnd: e.target.value })} className="w-full border rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-600 bg-slate-50/50" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Set Number</label>
              <input type="text" placeholder="Set #" value={filters.setNumber || ''} onChange={e => setFilters({ ...filters, setNumber: e.target.value })} className="w-full border rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-600 bg-slate-50/50" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Item Ref</label>
              <input type="text" placeholder="Item Ref..." value={filters.itemNumber || ''} onChange={e => setFilters({ ...filters, itemNumber: e.target.value })} className="w-full border rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-600 bg-slate-50/50" />
            </div>
            <div>
              <button type="submit" className="w-full h-[34px] flex items-center justify-center gap-2 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors">
                <Search className="w-3.5 h-3.5" /> Search
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TableIcon className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Aggregated Summary Feed</span>
          </div>

          <button onClick={handleExport} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-gray-200 transition-all">
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-3">Date</th>
                {isAdmin && <th className="p-3">Matricule</th>}
                {isAdmin && <th className="p-3">Worker Name</th>}
                <th className="p-3">Category</th>
                <th className="p-3">Set Number</th>
                <th className="p-3">Item Ref</th>
                <th className="p-3 text-right">Aggregated Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedAggregated.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="p-3 font-semibold text-slate-700">{row.date}</td>
                  {isAdmin && <td className="p-3 font-mono font-bold text-blue-700">{row.worker_id || '-'}</td>}
                  {isAdmin && <td className="p-3 text-slate-800 font-medium">{row.worker_name || '-'}</td>}
                  <td className="p-3 text-slate-600">{row.machine_category || '-'}</td>
                  <td className="p-3 font-semibold text-slate-800">{row.set_number}</td>
                  <td className="p-3 text-slate-600">{row.item_number}</td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-600 text-sm">{row.quantity.toLocaleString()}</td>
                </tr>
              ))}
              {paginatedAggregated.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 5} className="p-8 text-center text-slate-400 italic">No aggregated records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TableFooter
          totalItems={aggregated.length}
          pageSize={pageSize}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
