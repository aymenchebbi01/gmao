import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, Edit3, Save, X, Server, Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, Search, AlertTriangle } from 'lucide-react';
import { productionLineService } from '../../services/productionApi';
import { ProductionLine } from '../../types';
import * as XLSX from 'xlsx';
import TableFooter from '../common/TableFooter';

const MACHINE_CATEGORIES = ['Tompographie', 'Assemblage', 'Blister', 'Spray', 'Table'];

export default function ProductionLinesMgmt() {
  const [machines, setMachines] = useState<ProductionLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);

  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  const [showAdd, setShowAdd] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', cadence: 0, category: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; cadence: number; category: string }>({ name: '', cadence: 0, category: '' });
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<{ name: string; cadence: number; category: string }[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await productionLineService.getLines();
      setMachines(data);
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await productionLineService.addLine(newForm);
      setNewForm({ name: '', cadence: 0, category: '' });
      setShowAdd(false);
      await fetchData();
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleStartEdit = (m: ProductionLine) => {
    setEditingId(m.id);
    setEditForm({ name: m.name, cadence: m.cadence, category: m.category || '' });
  };

  const handleSaveEdit = async (id: string) => {
    setLoading(true);
    try {
      await productionLineService.updateLine(id, editForm);
      setEditingId(null);
      await fetchData();
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      await productionLineService.deleteLine(id);
      await fetchData();
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDeleteAll = async () => {
    setLoading(true);
    try {
      await productionLineService.deleteAllLines();
      setConfirmDeleteAll(false);
      await fetchData();
    } catch (err) {
      console.error('Delete all error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportSuccess(false);
    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        const parsed = rows
          .map(r => {
            const rawCat = String(r['Category'] || r['Machine Category'] || '').trim();
            const validCat = MACHINE_CATEGORIES.find(c => c.toLowerCase() === rawCat.toLowerCase()) || '';
            return {
              name: String(r['Machine Name'] || r['name'] || r['MachineName'] || '').trim(),
              cadence: Number(r['Cadence (u/hr)'] || r['cadence'] || r['Cadence'] || 0),
              category: validCat,
            };
          })
          .filter(r => r.name && r.cadence > 0);

        if (parsed.length === 0) {
          setImportError('No valid rows found. Ensure columns are "Machine Name" and "Cadence (u/hr)".');
          setImportPreview([]);
        } else {
          setImportPreview(parsed);
        }
      } catch {
        setImportError('Could not read the file. Please use .xlsx format.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    if (importPreview.length === 0) return;
    setImportLoading(true);
    try {
      for (const m of importPreview) {
        await productionLineService.addLine(m);
      }
      setImportSuccess(true);
      setImportPreview([]);
      setImportFile(null);
      await fetchData();
    } catch (err) {
      setImportError('Import failed.');
      console.error(err);
    } finally {
      setImportLoading(false);
    }
  };

  const resetImport = () => {
    setImportPreview([]);
    setImportFile(null);
    setImportError('');
    setImportSuccess(false);
  };

  const filteredMachines = machines.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(m.cadence).includes(searchTerm)
  );

  const paginatedMachines = filteredMachines.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-10 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Server className="w-6 h-6 text-blue-600" />
            Production Lines & Cadence
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage production line cadences for Rendement efficiency calculations.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-xs tracking-wider uppercase transition-all"
          >
            <Upload className="w-4 h-4 text-blue-600" />
            Import Excel
          </button>

          <button
            onClick={() => productionLineService.downloadTemplate()}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2.5 rounded-xl font-bold text-xs tracking-wider uppercase transition-all"
            title="Download Template"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Template
          </button>

          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs tracking-wider uppercase shadow-sm shadow-blue-200 transition-all"
          >
            {showAdd ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showAdd ? 'Cancel' : 'Add Line'}
          </button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" />

      {importFile && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 bg-blue-50 border border-blue-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              <span>Import Preview: {importFile.name}</span>
            </div>
            <button onClick={resetImport} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>

          {importError && (
            <div className="mb-4 flex items-center gap-2 text-red-600 text-xs font-semibold bg-red-50 border border-red-200 p-3 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          {importPreview.length > 0 && (
            <div>
              <p className="text-xs text-slate-600 mb-3">Found <strong>{importPreview.length}</strong> valid production lines to import:</p>
              <div className="max-h-48 overflow-y-auto border border-blue-100 rounded-xl bg-white mb-4">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500 uppercase">
                    <tr>
                      <th className="p-2.5">Line Name</th>
                      <th className="p-2.5 text-right">Cadence (u/hr)</th>
                      <th className="p-2.5">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreview.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-bold text-slate-900">{item.name}</td>
                        <td className="p-2.5 text-right font-mono">{item.cadence}</td>
                        <td className="p-2.5 text-slate-600">{item.category || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={handleImportConfirm} disabled={importLoading} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50">
                  <Save className="w-4 h-4" />
                  {importLoading ? 'Importing...' : `Confirm Import (${importPreview.length})`}
                </button>
                <button onClick={resetImport} className="text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-2">Cancel</button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {showAdd && (
        <motion.form initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleCreate} className="bg-white border border-blue-100 p-6 rounded-2xl shadow-sm mb-8">
          <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">Add New Production Line</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Line Name</label>
              <input type="text" required placeholder="e.g. Presse 1" value={newForm.name} onChange={e => setNewForm({ ...newForm, name: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-blue-600 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Cadence (u/hr)</label>
              <input type="number" required min="1" placeholder="e.g. 500" value={newForm.cadence || ''} onChange={e => setNewForm({ ...newForm, cadence: Number(e.target.value) })} className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-blue-600 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Category</label>
              <select value={newForm.category} onChange={e => setNewForm({ ...newForm, category: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-600 outline-none">
                <option value="">Select Category...</option>
                {MACHINE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={loading} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm">Save Line</button>
          </div>
        </motion.form>
      )}

      {/* Search & List */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input type="text" placeholder="Search line or category..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none bg-slate-50/50" />
          </div>

          <div className="flex items-center gap-2">
            {!confirmDeleteAll ? (
              <button onClick={() => setConfirmDeleteAll(true)} className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Clear All
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 p-1.5 rounded-xl">
                <span className="text-xs text-red-700 font-bold px-2">Delete all lines?</span>
                <button onClick={handleDeleteAll} className="bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg hover:bg-red-700">Yes</button>
                <button onClick={() => setConfirmDeleteAll(false)} className="text-xs text-slate-500 hover:text-slate-700 px-2">No</button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Line Name</th>
                <th className="p-4">Category</th>
                <th className="p-4 text-right">Cadence (u/hr)</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedMachines.map(m => (
                <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                  {editingId === m.id ? (
                    <>
                      <td className="p-3">
                        <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full border rounded-lg px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-600" />
                      </td>
                      <td className="p-3">
                        <select value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })} className="w-full border rounded-lg px-2.5 py-1 text-sm bg-white outline-none focus:ring-1 focus:ring-blue-600">
                          <option value="">Select Category...</option>
                          {MACHINE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-3">
                        <input type="number" value={editForm.cadence} onChange={e => setEditForm({ ...editForm, cadence: Number(e.target.value) })} className="w-full border rounded-lg px-2.5 py-1 text-sm text-right outline-none focus:ring-1 focus:ring-blue-600 font-mono" />
                      </td>
                      <td className="p-3 text-center">
                        <button onClick={() => handleSaveEdit(m.id)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Save className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-4 font-bold text-slate-900">{m.name}</td>
                      <td className="p-4 text-slate-600">{m.category || <span className="text-slate-400 italic">Unassigned</span>}</td>
                      <td className="p-4 text-right font-mono font-bold text-blue-700">{m.cadence.toLocaleString()}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleStartEdit(m)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(m.id)} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {paginatedMachines.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400 italic">No production lines found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TableFooter
          totalItems={filteredMachines.length}
          pageSize={pageSize}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
