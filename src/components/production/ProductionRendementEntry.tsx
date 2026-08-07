import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Save, Plus, Trash2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Database, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { productionRecordService, productionLineService, productionWorkerService, generateId } from '../../services/productionApi';
import { ProductionRecord, ProductionLine, ProductionWorker } from '../../types';

interface RecordWithId extends Omit<ProductionRecord, 'id' | 'created_at' | 'upload_id'> {
  tempId: string;
}

export default function ProductionRendementEntry({ displayName = '' }: { displayName?: string }) {
  const [activeTab, setActiveTab] = useState<'manual' | 'excel'>('manual');

  // Shared Data
  const [machines, setMachines] = useState<ProductionLine[]>([]);
  const [workers, setWorkers] = useState<ProductionWorker[]>([]);

  useEffect(() => {
    productionLineService.getLines().then(setMachines).catch(console.error);
    productionWorkerService.getWorkers().then(setWorkers).catch(console.error);
  }, []);

  // MANUAL ENTRY STATE
  const [manualLoading, setManualLoading] = useState(false);
  const [manualSuccess, setManualSuccess] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const createEmptyRecord = (): RecordWithId => ({
    tempId: generateId(),
    worker_id: '',
    worker_name: '',
    set_number: '',
    item_number: '',
    quantity: 0,
    machine_name: '',
    hours_worked: 0,
    date: new Date().toISOString().split('T')[0],
  });

  const [records, setRecords] = useState<RecordWithId[]>([
    createEmptyRecord()
  ]);

  const addRow = () => {
    setRecords(prev => [...prev, createEmptyRecord()]);
  };

  const removeRow = (tempId: string) => {
    if (records.length > 1) {
      setRecords(records.filter((r) => r.tempId !== tempId));
    }
  };

  const updateField = (tempId: string, field: string, value: string | number) => {
    setRecords(prev => prev.map(r => {
      if (r.tempId === tempId) {
        const updated = { ...r, [field]: value };
        if (field === 'worker_id') {
          const worker = workers.find(w => w.worker_id === value);
          if (worker) {
            updated.worker_name = worker.name;
          }
        }
        return updated;
      }
      return r;
    }));
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualLoading(true);
    setManualSuccess(false);
    setManualError(null);

    try {
      const invalid = records.some(r => r.quantity <= 0 || !r.date);
      if (invalid) {
        throw new Error('Please fill all required fields correctly (Quantity must be > 0 and Date is required).');
      }

      const sanitizedRecords = records.map(({ tempId, ...rest }) => rest);
      const uploadId = `manual_${Date.now()}`;
      await productionRecordService.addRecords(sanitizedRecords, uploadId);

      // Log each row as a user action
      for (const r of sanitizedRecords) {
        await fetch('/api/production/user-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: generateId(),
            user_name: displayName,
            action: 'Manual Entry',
            worker_id: r.worker_id || null,
            worker_name: r.worker_name || null,
            set_number: r.set_number || null,
            item_number: r.item_number || null,
            quantity: r.quantity,
            hours_worked: r.hours_worked || null,
            machine_name: r.machine_name || null,
            record_date: r.date,
          }),
        });
      }

      setManualSuccess(true);
      setRecords([createEmptyRecord()]);
    } catch (err: any) {
      setManualError(err.message || 'Failed to save records.');
    } finally {
      setManualLoading(false);
    }
  };

  // EXCEL IMPORT STATE
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [invalidRows, setInvalidRows] = useState<any[]>([]);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet, { raw: true });

        const isRowEmpty = (row: any) => {
          return Object.values(row).every(val => val === undefined || val === null || String(val).trim() === '');
        };

        const formatExcelValue = (val: any) => {
          if (val === undefined || val === null) return '';

          if (val instanceof Date) {
            const adjusted = new Date(val.getTime() + 12 * 60 * 60 * 1000);
            const year = adjusted.getFullYear();
            const month = String(adjusted.getMonth() + 1).padStart(2, '0');
            const day = String(adjusted.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          }

          if (typeof val === 'number') {
            if (val > 10000 && val < 60000) {
              const date = new Date(Math.round((val - 25569) * 86400 * 1000));
              const year = date.getUTCFullYear();
              const month = String(date.getUTCMonth() + 1).padStart(2, '0');
              const day = String(date.getUTCDate()).padStart(2, '0');
              return `${year}-${month}-${day}`;
            }
            return String(val);
          }

          const str = String(val).trim();
          if (!str) return '';

          if (/^\d{5}$/.test(str)) {
            const serial = parseInt(str);
            const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          }

          const ddmmyyyyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
          if (ddmmyyyyMatch) {
            const [_, d, m, y] = ddmmyyyyMatch;
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }

          if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            return str;
          }

          return str;
        };

        const mapped = json
          .filter(row => !isRowEmpty(row))
          .map((row) => {
            const date = formatExcelValue(row.Date || row.date || row['Date']);
            const worker_id = String(row.WorkerID || row.worker_id || row['Worker ID'] || '');
            const worker_name = String(row.WorkerName || row.worker_name || row['Worker Name'] || '');
            const machine_name = String(row.MachineName || row.machine_name || row['Machine Name'] || '').trim();
            const hours_worked = Number(row.HoursWorked || row.hours_worked || row['Hours Worked'] || 0);
            const set_number = String(row.SetNumber || row.set_number || row['Set Number'] || row['Set No.'] || '');
            const item_number = String(row.ItemNumber || row.item_number || row['Item Number'] || row['Item No.'] || '');
            const quantity = Number(row.Quantity || row.quantity || row['Quantity'] || 0);

            const reasons: string[] = [];
            if (!date) reasons.push('Missing or invalid Date');
            if (quantity <= 0) reasons.push('Quantity must be greater than 0');

            if (!machine_name) {
              reasons.push('Missing Machine Name');
            } else {
              const machineExists = machines.some(
                m => m.name.trim().toLowerCase() === machine_name.toLowerCase()
              );
              if (!machineExists) {
                reasons.push(`Machine '${machine_name}' does not exist in database`);
              }
            }

            const isValid = reasons.length === 0;

            return {
              originalRow: row,
              mappedRow: {
                date,
                worker_id,
                worker_name,
                machine_name,
                hours_worked,
                set_number,
                item_number,
                quantity
              },
              isValid,
              reason: reasons.join(', ')
            };
          });

        const valid = mapped.filter(item => item.isValid).map(item => item.mappedRow);
        const invalid = mapped.filter(item => !item.isValid).map(item => ({
          originalRow: item.originalRow,
          reason: item.reason
        }));

        if (valid.length === 0 && invalid.length === 0) {
          throw new Error('No production records found in the spreadsheet.');
        }

        setPreviewData(valid);
        setInvalidRows(invalid);
        setFile(file);
        setImportError(null);
        setImportSuccess(false);
      } catch (err: any) {
        setImportError(err.message || 'Error processing Excel file.');
        setPreviewData([]);
        setInvalidRows([]);
      }
    };
    reader.readAsBinaryString(file);
  };

  const downloadInvalidRows = () => {
    if (invalidRows.length === 0) return;

    const exportData = invalidRows.map(item => ({
      ...item.originalRow,
      'Rejection Reason': item.reason
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rejected Rows");
    const fileName = `failed_rows_${file ? file.name.replace(/\.[^/.]+$/, "") : "import"}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleUpload = async () => {
    if (previewData.length === 0) return;
    setImportLoading(true);
    setImportSuccess(false);
    setImportError(null);

    try {
      const uploadId = `upload_${Date.now()}`;
      if (importMode === 'replace') {
        await productionRecordService.replaceRecordsByDates(previewData, uploadId);
      } else {
        await productionRecordService.addRecords(previewData, uploadId);
      }
      setImportSuccess(true);
      setFile(null);
      setPreviewData([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setImportError(err.message || 'Failed to upload data.');
    } finally {
      setImportLoading(false);
    }
  };

  const resetExcelImport = () => {
    setFile(null);
    setPreviewData([]);
    setInvalidRows([]);
    setImportError(null);
    setImportSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10 font-sans h-full flex flex-col">

      {/* Tab Switcher */}
      <div className="flex justify-end mb-8 shrink-0">
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'manual'
                ? 'bg-white text-slate-900 shadow-sm border-slate-200'
                : 'text-slate-500 hover:text-slate-800'
              }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Manual Form
          </button>
          <button
            onClick={() => setActiveTab('excel')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'excel'
                ? 'bg-white text-slate-900 shadow-sm border-slate-200'
                : 'text-slate-500 hover:text-slate-800'
              }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Excel Import
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 min-h-0">
        <AnimatePresence mode="wait">
          {activeTab === 'manual' ? (
            <motion.div
              key="manual-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="h-full flex flex-col"
            >
              <datalist id="machine-list">
                {machines.map(m => (
                  <option key={m.id} value={m.name}>{m.name}</option>
                ))}
              </datalist>

              <datalist id="worker-list">
                {workers.map(w => (
                  <option key={w.id} value={w.worker_id}>{w.name}</option>
                ))}
              </datalist>

              <form onSubmit={handleManualSubmit} className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[900px]">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="p-4">Date</th>
                          <th className="p-4">Matricule</th>
                          <th className="p-4">Name</th>
                          <th className="p-4">Machine</th>
                          <th className="p-4 text-right">Hrs</th>
                          <th className="p-4">Set No.</th>
                          <th className="p-4">Item Ref</th>
                          <th className="p-4 text-right">Quantity</th>
                          <th className="p-4 w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {records.map((record) => (
                          <tr key={record.tempId} className="hover:bg-slate-50 transition-colors group">
                            <td className="p-2">
                              <input
                                type="date"
                                value={record.date}
                                onChange={(e) => updateField(record.tempId, 'date', e.target.value)}
                                className="w-full p-2 border border-transparent focus:border-slate-300 focus:bg-white rounded-lg text-sm font-mono outline-none transition-all"
                                required
                              />
                            </td>
                            <td className="p-2">
                              <input
                                list="worker-list"
                                placeholder="Select ID..."
                                value={record.worker_id}
                                onChange={(e) => updateField(record.tempId, 'worker_id', e.target.value)}
                                className="w-full p-2 border border-transparent focus:border-slate-300 focus:bg-white rounded-lg text-sm outline-none transition-all font-mono"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="Name..."
                                value={record.worker_name || ''}
                                readOnly
                                className="w-full p-2 border border-transparent bg-slate-50 rounded-lg text-sm text-slate-500 outline-none cursor-not-allowed"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                list="machine-list"
                                placeholder="Select or type..."
                                value={record.machine_name || ''}
                                onChange={(e) => updateField(record.tempId, 'machine_name', e.target.value)}
                                className="w-full p-2 border border-transparent focus:border-slate-300 focus:bg-white rounded-lg text-sm outline-none transition-all"
                              />
                            </td>
                            <td className="p-2 w-16">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                placeholder="0"
                                value={record.hours_worked || ''}
                                onChange={(e) => updateField(record.tempId, 'hours_worked', parseFloat(e.target.value) || 0)}
                                className="w-full p-2 border border-transparent focus:border-slate-300 focus:bg-white rounded-lg text-sm outline-none transition-all text-right font-mono"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="Set..."
                                value={record.set_number}
                                onChange={(e) => updateField(record.tempId, 'set_number', e.target.value)}
                                className="w-full p-2 border border-transparent focus:border-slate-300 focus:bg-white rounded-lg text-sm outline-none transition-all"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="Item..."
                                value={record.item_number}
                                onChange={(e) => updateField(record.tempId, 'item_number', e.target.value)}
                                className="w-full p-2 border border-transparent focus:border-slate-300 focus:bg-white rounded-lg text-sm outline-none transition-all"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="1"
                                value={record.quantity || ''}
                                onChange={(e) => updateField(record.tempId, 'quantity', parseInt(e.target.value) || 0)}
                                className={`w-full p-2 border border-transparent focus:border-slate-300 focus:bg-white rounded-lg text-sm font-mono text-right outline-none transition-all ${record.quantity <= 0 ? 'text-red-500' : ''}`}
                                required
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeRow(record.tempId)}
                                disabled={records.length === 1}
                                className="text-gray-350 hover:text-red-500 disabled:opacity-0 transition-all p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
                  <button
                    type="button"
                    onClick={addRow}
                    className="flex items-center gap-2 px-6 py-2.5 bg-white border border-gray-200 text-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-gray-50 transition-all shadow-sm shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Ligne
                  </button>

                  <div className="flex items-center gap-6 w-full sm:w-auto justify-end">
                    {manualSuccess && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-emerald-600 text-xs font-bold uppercase tracking-widest"
                      >
                        Sync Successful
                      </motion.span>
                    )}
                    {manualError && (
                      <span className="text-red-600 text-xs font-bold uppercase tracking-widest">
                        {manualError}
                      </span>
                    )}
                    <button
                      type="submit"
                      disabled={manualLoading}
                      className="flex items-center justify-center gap-2 px-10 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold tracking-wider uppercase hover:bg-slate-800 transition-all disabled:opacity-50 w-full sm:w-auto shadow-sm"
                    >
                      <Save className="w-4 h-4" />
                      {manualLoading ? 'Committing...' : 'Save'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="excel-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div className="flex justify-end shrink-0">
                <button
                  onClick={() => productionRecordService.downloadTemplate()}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-50 transition-all text-slate-600 bg-white shadow-sm"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Download Template
                </button>
              </div>

              {!file ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative group cursor-pointer border border-gray-200 border-dashed rounded-2xl p-16 text-center hover:bg-slate-50 transition-all bg-white shadow-sm"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                  />
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform shadow-sm">
                      <FileSpreadsheet className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">Click to Select Excel File</h3>
                    <p className="text-xs text-slate-400 mt-2">Support files: .xlsx, .xls, .csv</p>
                  </div>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm"
                >
                  <div className="bg-slate-900 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/10 rounded flex items-center justify-center">
                        <FileSpreadsheet className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Source Document</p>
                        <p className="text-sm font-medium text-white">{file.name}</p>
                      </div>
                    </div>
                    <button onClick={resetExcelImport} className="text-white/40 hover:text-white transition-colors p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                      <div className="space-y-4">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Storage Protocol</h3>
                        <div className="grid grid-cols-1 gap-2">
                          <button
                            onClick={() => setImportMode('append')}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${importMode === 'append' ? 'border-slate-900 bg-slate-50 text-slate-900 shadow-sm' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                          >
                            <Plus className="w-4 h-4" />
                            <div>
                              <p className="font-bold text-[11px] uppercase tracking-wide">Add New Records</p>
                            </div>
                          </button>
                          <button
                            onClick={() => setImportMode('replace')}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${importMode === 'replace' ? 'border-slate-900 bg-slate-50 text-slate-900 shadow-sm' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                          >
                            <Database className="w-4 h-4" />
                            <div>
                              <p className="font-bold text-[11px] uppercase tracking-wide">Replace Records</p>
                            </div>
                          </button>
                        </div>
                      </div>

                      <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4">Payload Verification</h3>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center text-[11px] font-medium">
                            <span className="text-slate-500 uppercase tracking-widest">Valid Entries</span>
                            <span className="text-slate-900 font-mono font-bold">{previewData.length}</span>
                          </div>
                          {invalidRows.length > 0 && (
                            <div className="flex justify-between items-center text-[11px] font-medium pt-3 border-t border-slate-200">
                              <span className="text-red-500 uppercase tracking-widest font-bold">Invalid Entries</span>
                              <span className="text-red-600 font-mono font-bold">{invalidRows.length}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-[11px] font-medium pt-3 border-t border-slate-200">
                            <span className="text-slate-500 uppercase tracking-widest">Date Cycles</span>
                            <span className="text-slate-900 font-mono font-bold">{new Set(previewData.map(d => d.date)).size}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {invalidRows.length > 0 && (
                      <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-left">
                        <div className="flex items-center gap-3 text-amber-800">
                          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider">Incomplete Import Preview</p>
                            <p className="text-xs text-amber-700 mt-0.5">
                              {invalidRows.length} row(s) contain validation errors and will be skipped.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={downloadInvalidRows}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shrink-0 shadow-sm"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          Download Rejected Rows
                        </button>
                      </div>
                    )}

                    <button
                      onClick={handleUpload}
                      disabled={importLoading || previewData.length === 0}
                      className="w-full flex items-center justify-center gap-2 py-4 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-[0.2em] hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      {importLoading ? 'Processing Protocol...' : 'Confirm System Write'}
                    </button>
                  </div>
                </motion.div>
              )}

              {importSuccess && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex flex-col gap-3 text-emerald-800"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">System Integration Complete.</span>
                  </div>
                  {invalidRows.length > 0 && (
                    <div className="mt-2 pt-3 border-t border-emerald-200/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-left">
                      <span className="text-xs text-emerald-700">
                        Notice: {invalidRows.length} row(s) were not imported because they were invalid.
                      </span>
                      <button
                        type="button"
                        onClick={downloadInvalidRows}
                        className="flex items-center justify-center gap-2 px-3 py-1.5 bg-amber-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shrink-0 shadow-sm"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Download {invalidRows.length} Rejected Rows
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {importError && (
                <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-800">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Error: {importError}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
