import { useState, useEffect } from 'react';
import { Download, List, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { productionRecordService } from '../../services/productionApi';
import { ProductionRecord } from '../../types';
import TableFooter from '../common/TableFooter';
import type { SharedFilters } from './ProductionConsultation';

interface DetailedViewProps {
  externalFilters?: SharedFilters;
  searchSignal?: number;
  hideFilterBar?: boolean;
  showTitle?: boolean;
}

export default function ProductionDetailed({ externalFilters, searchSignal, hideFilterBar = false, showTitle = true }: DetailedViewProps) {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);

  const [filters, setFilters] = useState<SharedFilters>({
    dateStart: '',
    dateEnd: '',
    setNumber: '',
    itemNumber: '',
    workerId: '',
    workerName: '',
  });

  const activeFilters = externalFilters || filters;

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await productionRecordService.getRecords(activeFilters);
      setRecords(data);
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

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(records);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Detailed Production Feed');
    XLSX.writeFile(wb, `detailed_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDeleteRecord = async (id: string) => {
    if (!confirm('Are you sure you want to delete this production record?')) return;
    try {
      await productionRecordService.deleteRecord(id);
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const paginatedRecords = records.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="w-full font-sans space-y-4">
      <div className="flex items-center justify-between">
        {showTitle && (
          <div className="flex items-center gap-2">
            <List className="w-4 h-4 text-blue-600" />
            <h2 className="text-lg font-bold tracking-tight text-slate-800">Detailed Production</h2>
          </div>
        )}

        <button onClick={handleExport} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-gray-200 transition-all">
          <Download className="w-3.5 h-3.5" /> Export Detailed Feed
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-3">Date</th>
                <th className="p-3">Matricule</th>
                <th className="p-3">Worker Name</th>
                <th className="p-3">Line Name</th>
                <th className="p-3 text-right">Hours</th>
                <th className="p-3">Set Number</th>
                <th className="p-3">Item Ref</th>
                <th className="p-3 text-right">Qty</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedRecords.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/50">
                  <td className="p-3 font-semibold text-slate-700">{r.date}</td>
                  <td className="p-3 font-mono font-bold text-blue-700">{r.worker_id}</td>
                  <td className="p-3 font-medium text-slate-900">{r.worker_name || '-'}</td>
                  <td className="p-3 text-slate-600">{r.machine_name || '-'}</td>
                  <td className="p-3 text-right font-mono">{r.hours_worked || '-'}</td>
                  <td className="p-3 font-semibold text-slate-800">{r.set_number}</td>
                  <td className="p-3 text-slate-600">{r.item_number}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">{r.quantity.toLocaleString()}</td>
                  <td className="p-3 text-center">
                    <button onClick={() => r.id && handleDeleteRecord(r.id)} className="p-1 text-slate-400 hover:text-red-600 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {paginatedRecords.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 italic">No detailed production records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TableFooter
          totalItems={records.length}
          pageSize={pageSize}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
