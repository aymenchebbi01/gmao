import React, { useState, useEffect } from 'react';
import { Search, Save, Trash2, Edit3, X, Check } from 'lucide-react';
import { productionRecordService, productionLineService, productionWorkerService } from '../../services/productionApi';
import { ProductionRecord, ProductionLine, ProductionWorker } from '../../types';
import TableFooter from '../common/TableFooter';

export default function ProductionManagement() {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<ProductionRecord>>({});
  const [filters, setFilters] = useState({
    workerId: '',
    date: '',
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const [machines, setMachines] = useState<ProductionLine[]>([]);
  const [workers, setWorkers] = useState<ProductionWorker[]>([]);

  useEffect(() => {
    productionLineService.getLines().then(setMachines).catch(console.error);
    productionWorkerService.getWorkers().then(setWorkers).catch(console.error);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await productionRecordService.getRecords({
        workerId: filters.workerId || undefined,
        dateStart: filters.date || undefined,
        dateEnd: filters.date || undefined,
      });
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
  }, [filters.date, filters.workerId]);

  const handleStartEdit = (record: ProductionRecord) => {
    setEditingId(record.id!);
    setEditFormData({
      worker_id: record.worker_id,
      worker_name: record.worker_name,
      set_number: record.set_number,
      item_number: record.item_number,
      quantity: record.quantity,
      machine_name: record.machine_name,
      hours_worked: record.hours_worked,
      date: record.date,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditFormData({});
  };

  const handleSaveEdit = async (recordId: string) => {
    setLoading(true);
    try {
      await productionRecordService.updateRecord(recordId, editFormData as any);
      setEditingId(null);
      await fetchData();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (recordId: string) => {
    setLoading(true);
    try {
      await productionRecordService.deleteRecord(recordId);
      setDeletingId(null);
      await fetchData();
    } catch (error) {
      console.error('Delete error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    setLoading(true);
    try {
      await productionRecordService.deleteAllRecords();
      setConfirmDeleteAll(false);
      await fetchData();
    } catch (error) {
      console.error('Delete all error:', error);
    } finally {
      setLoading(false);
    }
  };

  const paginatedRecords = records.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10 font-sans space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-bold tracking-tight text-slate-800">Raw Data Records Management</h2>
        </div>

        <div className="flex flex-wrap items-end gap-4 w-full md:w-auto">
          <div className="flex-1 md:w-48">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Matricule Filter</label>
            <input
              type="text"
              placeholder="Search Matricule..."
              value={filters.workerId}
              onChange={(e) => setFilters({ ...filters, workerId: e.target.value })}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-slate-800 font-mono shadow-xs"
            />
          </div>
          <div className="flex-1 md:w-48">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Date Filter</label>
            <input
              type="date"
              value={filters.date}
              onChange={(e) => setFilters({ ...filters, date: e.target.value })}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-slate-800 font-mono shadow-xs"
            />
          </div>

          <datalist id="worker-list">
            {workers.map(w => (
              <option key={w.id} value={w.worker_id}>{w.name}</option>
            ))}
          </datalist>

          <div className="w-full md:w-auto pt-4 md:pt-0">
            {confirmDeleteAll ? (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 p-1 rounded-xl">
                <span className="text-[9px] font-black text-red-600 uppercase px-2">Wipe all data?</span>
                <button
                  onClick={handleDeleteAll}
                  className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-[10px] font-bold uppercase hover:bg-red-700 shadow-xs"
                >
                  Yes, Delete
                </button>
                <button
                  onClick={() => setConfirmDeleteAll(false)}
                  className="px-4 py-1.5 bg-white text-gray-500 border border-gray-200 rounded-lg text-[10px] font-bold uppercase hover:bg-gray-50 shadow-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDeleteAll(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white text-red-500 border border-red-200 hover:bg-red-50 transition-all rounded-xl shadow-xs group whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Clear Database</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="bg-slate-50 border-b border-gray-100">
              <tr>
                <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</th>
                <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Matricule</th>
                <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Name</th>
                <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Machine Line</th>
                <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Hrs</th>
                <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Set No.</th>
                <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Item Ref</th>
                <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Qty</th>
                <th className="p-4 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-gray-400 font-medium">Syncing with server...</td>
                </tr>
              ) : paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-gray-400 font-medium text-sm">No records matching system parameters.</td>
                </tr>
              ) : (
                paginatedRecords.map((record) => (
                  <tr key={record.id} className={`group hover:bg-slate-50 transition-colors ${editingId === record.id ? 'bg-slate-50' : ''}`}>
                    {editingId === record.id ? (
                      <>
                        <td className="p-2">
                          <input
                            type="date"
                            value={editFormData.date}
                            onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                            className="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-slate-800 bg-white"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            list="worker-list"
                            value={editFormData.worker_id}
                            onChange={(e) => {
                              const val = e.target.value;
                              const worker = workers.find(w => w.worker_id === val);
                              setEditFormData({
                                ...editFormData,
                                worker_id: val,
                                worker_name: worker ? worker.name : editFormData.worker_name
                              });
                            }}
                            className="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-slate-800 bg-white font-mono"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={editFormData.worker_name || ''}
                            readOnly
                            className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-slate-50 text-slate-500 cursor-not-allowed"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={editFormData.machine_name || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, machine_name: e.target.value })}
                            className="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-slate-800 bg-white"
                          >
                            <option value="">--</option>
                            {machines.map(m => (
                              <option key={m.id} value={m.name}>{m.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 w-14">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={editFormData.hours_worked || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, hours_worked: parseFloat(e.target.value) || 0 })}
                            className="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-slate-800 bg-white text-right"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={editFormData.set_number}
                            onChange={(e) => setEditFormData({ ...editFormData, set_number: e.target.value })}
                            className="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-slate-800 bg-white"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={editFormData.item_number}
                            onChange={(e) => setEditFormData({ ...editFormData, item_number: e.target.value })}
                            className="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-slate-800 bg-white"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={editFormData.quantity}
                            onChange={(e) => setEditFormData({ ...editFormData, quantity: parseInt(e.target.value) || 0 })}
                            className="w-full p-2 border border-slate-300 rounded-lg text-xs text-right outline-none focus:border-slate-800 bg-white"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex justify-end gap-2 text-slate-800">
                            <button onClick={() => handleSaveEdit(record.id!)} className="p-2 hover:bg-slate-200 rounded transition-all">
                              <Check className="w-4 h-4 text-emerald-600" />
                            </button>
                            <button onClick={handleCancelEdit} className="p-2 hover:bg-slate-200 rounded transition-all">
                              <X className="w-4 h-4 text-gray-400" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-4 text-xs font-mono text-slate-400">{record.date}</td>
                        <td className="p-4 text-xs font-bold text-slate-800 font-mono">{record.worker_id}</td>
                        <td className="p-4 text-xs text-slate-600">{record.worker_name || 'N/A'}</td>
                        <td className="p-4 text-xs font-bold text-slate-700 bg-slate-50">{record.machine_name || '-'}</td>
                        <td className="p-4 text-xs font-bold text-slate-800 text-right">{record.hours_worked || '-'}</td>
                        <td className="p-4 text-xs text-slate-500">{record.set_number || '-'}</td>
                        <td className="p-4 text-xs text-slate-500 uppercase">{record.item_number || '-'}</td>
                        <td className="p-4 text-xs font-bold text-slate-900 text-right">{record.quantity.toLocaleString()}</td>
                        <td className="p-4 text-right">
                          {deletingId === record.id ? (
                            <div className="flex justify-end gap-2 items-center">
                              <span className="text-[10px] font-bold text-red-600 uppercase">Delete?</span>
                              <button
                                onClick={() => handleDelete(record.id!)}
                                className="p-1 px-2 bg-red-600 text-white rounded text-[10px] font-bold uppercase hover:bg-red-700"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setDeletingId(null)}
                                className="p-1 px-2 bg-gray-200 text-gray-600 rounded text-[10px] font-bold uppercase hover:bg-gray-300"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-3 transition-all">
                              <button
                                onClick={() => handleStartEdit(record)}
                                className="p-1 px-2 text-slate-500 hover:text-slate-800 transition-all flex items-center gap-1 bg-slate-50 border border-slate-100 rounded shadow-xs"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Modify</span>
                              </button>
                              <button
                                onClick={() => setDeletingId(record.id!)}
                                className="p-1 px-2 text-slate-500 hover:text-red-500 transition-all flex items-center gap-1 bg-slate-50 border border-slate-100 rounded shadow-xs"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Delete</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))
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
