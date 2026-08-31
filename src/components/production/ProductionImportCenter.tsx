import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Download, Trash2, Calendar, Package, Users } from 'lucide-react';
import * as XLSX from 'xlsx';
import { productionOrderService, productionPlanningService, productionWorkerService, generateId } from '../../services/productionApi';

export default function ProductionImportCenter() {
  const [activeTab, setActiveTab] = useState<'orders' | 'planning' | 'employees'>('orders');

  // --- EMPLOYEES IMPORT STATE ---
  const [employeesPreview, setEmployeesPreview] = useState<any[]>([]);
  const [employeesFile, setEmployeesFile] = useState<File | null>(null);
  const employeesFileInputRef = useRef<HTMLInputElement>(null);

  // --- ORDERS IMPORT STATE ---
  const [ordersImporting, setOrdersImporting] = useState(false);
  const [ordersPreview, setOrdersPreview] = useState<any[]>([]);
  const [ordersFile, setOrdersFile] = useState<File | null>(null);
  const ordersFileInputRef = useRef<HTMLInputElement>(null);

  // --- PLANNING IMPORT STATE ---
  const [planningImporting, setPlanningImporting] = useState(false);
  const [planningPreview, setPlanningPreview] = useState<any[]>([]);
  const [planningFile, setPlanningFile] = useState<File | null>(null);
  const planningFileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);

  const getColumnValue = (row: any, keys: string[]) => {
    for (const key of keys) {
      const foundKey = Object.keys(row).find(
        k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === key.toLowerCase().replace(/[^a-z0-9]/g, '')
      );
      if (foundKey && row[foundKey] !== undefined) {
        return row[foundKey];
      }
    }
    return undefined;
  };

  const formatExcelDate = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'number') {
      const date = new Date((val - (25567 + 2)) * 86400 * 1000);
      return date.toISOString().split('T')[0];
    }
    if (val instanceof Date) {
      return val.toISOString().split('T')[0];
    }
    const strVal = String(val).trim();
    const parsed = Date.parse(strVal);
    if (!isNaN(parsed)) {
      return new Date(parsed).toISOString().split('T')[0];
    }
    return strVal;
  };

  // EMPLOYEES IMPLEMENTATION
  const handleEmployeesTemplate = () => {
    productionWorkerService.downloadTemplate();
  };

  const handleEmployeesFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEmployeesFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        const mapped = data.map((r: any) => {
          const worker_id = String(getColumnValue(r, ['matricule', 'workerid', 'worker_id', 'id']) || '').trim();
          const name = String(getColumnValue(r, ['fullname', 'full_name', 'name', 'workername', 'worker_name']) || '').trim();
          return { worker_id, name };
        }).filter(item => item.worker_id && item.name);

        setEmployeesPreview(mapped);
      } catch (err) {
        console.error(err);
        alert('Could not read the Excel file.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const confirmEmployeesImport = async () => {
    if (employeesPreview.length === 0) return;
    setLoading(true);
    try {
      await productionWorkerService.saveWorkersBatch(employeesPreview);
      alert(`Imported ${employeesPreview.length} employees successfully!`);
      setEmployeesPreview([]);
      setEmployeesFile(null);
    } catch (err) {
      console.error(err);
      alert('Failed to save imported employees.');
    } finally {
      setLoading(false);
    }
  };

  // ORDERS IMPLEMENTATION
  const handleOrdersTemplate = () => {
    const headers = [
      "Supplier",
      "Order Number",
      "Set",
      "Description",
      "Expected Delivery Date",
      "Quantity Expected",
      "Quantity Delivered",
      "Week"
    ];
    const sampleData = [
      headers,
      ["Example Corp", "PO-2026-001", "SET-A1", "Mechanical Parts", "2026-06-15", 500, 0, "W21"]
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(sampleData);
    worksheet['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 30 },
      { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 10 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders Template");
    XLSX.writeFile(workbook, "Orders_Import_Template.xlsx");
  };

  const handleOrdersFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOrdersImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const parsedOrders: any[] = [];
      for (const row of jsonData) {
        const order_raw = getColumnValue(row, ['ordernumber', 'numcommande', 'commandenumber', 'order', 'ref', 'reference']);
        const set_raw = getColumnValue(row, ['set', 'setnumber', 'jeu', 'numjeu', 'set_number']);

        if (!order_raw || !set_raw) continue;

        const order_number = String(order_raw).trim();
        const set_number = String(set_raw).trim();
        if (!order_number || !set_number) continue;

        const supplier = String(getColumnValue(row, ['supplier', 'fournisseur', 'fabricant', 'client', 'vendor']) || 'Unknown').trim();
        const description = String(getColumnValue(row, ['description', 'designation', 'details', 'desc']) || '').trim();

        let expected_delivery_date = formatExcelDate(getColumnValue(row, ['expecteddeliverydate', 'dateprevue', 'datelivraisonprevue', 'expecteddate', 'date']));
        if (!expected_delivery_date) {
          expected_delivery_date = new Date().toISOString().split('T')[0];
        }

        const quantity_expected = parseInt(String(getColumnValue(row, ['quantityexpected', 'quantiteprevue', 'qteprevue', 'expectedqty', 'qty', 'quantite']) || '0'), 10) || 0;
        const quantity_delivered = parseInt(String(getColumnValue(row, ['quantitydelivered', 'quantitelivree', 'qtelivree', 'deliveredqty']) || '0'), 10) || 0;
        const week = String(getColumnValue(row, ['week', 'semaine', 'wk']) || '').trim();

        parsedOrders.push({
          id: generateId(),
          supplier,
          order_number,
          set_number,
          description,
          expected_delivery_date,
          quantity_expected,
          quantity_delivered,
          is_delivered: 'in progress',
          actual_delivered_date: '',
          actual_quantity_delivered: 0,
          comment: '',
          week
        });
      }

      if (parsedOrders.length === 0) {
        alert("Could not extract any valid orders. Please check your Excel headers. Required at least: Order Number and Set.");
      } else {
        setOrdersPreview(parsedOrders);
        setOrdersFile(file);
      }
    } catch (err: any) {
      console.error(err);
      alert("Error reading Excel file: " + err.message);
    } finally {
      setOrdersImporting(false);
      if (ordersFileInputRef.current) ordersFileInputRef.current.value = '';
    }
  };

  const confirmOrdersImport = async () => {
    if (ordersPreview.length === 0) return;
    setLoading(true);
    try {
      await productionOrderService.saveOrdersBatch(ordersPreview);
      alert(`Imported ${ordersPreview.length} orders successfully!`);
      setOrdersPreview([]);
      setOrdersFile(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save imported orders.");
    } finally {
      setLoading(false);
    }
  };

  // PLANNING IMPLEMENTATION
  const handlePlanningTemplate = () => {
    const headers = [
      "Set",
      "Week",
      "Description",
      "Quantity",
      "Total Amount",
      "Total Number in Box",
      "Total Number of Pallets"
    ];
    const sampleData = [
      headers,
      ["SET-A1", "W21", "Standard Production Plan 1", 500, 12500.00, 50, 10],
      ["SET-B2", "W22", "High Priority Running", 1200, 30000.00, 120, 24]
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(sampleData);
    worksheet['!cols'] = [
      { wch: 15 }, { wch: 10 }, { wch: 40 }, { wch: 15 },
      { wch: 18 }, { wch: 22 }, { wch: 25 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Planning Template");
    XLSX.writeFile(workbook, "Planning_Import_Template.xlsx");
  };

  const handlePlanningFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPlanningImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const parsedPlanning: any[] = [];
      for (const row of jsonData) {
        const set_raw = getColumnValue(row, ['set', 'setnumber', 'jeu', 'numjeu', 'set_number', 'setnum', 'setnumbe', 'setno']);
        if (!set_raw) continue;

        const set_number = String(set_raw).trim();
        if (!set_number) continue;

        const description = String(getColumnValue(row, ['description', 'designation', 'details', 'desc', 'comment', 'commentaire', 'libelle', 'name', 'nom']) || '').trim();
        const quantity = parseInt(String(getColumnValue(row, ['quantity', 'quantite', 'qte', 'qty', 'plannedqty', 'quantiteplanifiee', 'qteplanifiee', 'plannedquantity', 'planned', 'planifie', 'quantiteprevue', 'expectedqty']) || '0'), 10) || 0;
        const week = String(getColumnValue(row, ['week', 'semaine', 'wk', 'sem', 'wkno', 'weeknumber', 'numsemaine']) || '').trim();

        const totalAmountRaw = getColumnValue(row, ['totalamount', 'montanttotal', 'amount', 'montant', 'total_amount', 'valeur', 'value', 'totalmontant']);
        const total_amount = totalAmountRaw !== undefined && totalAmountRaw !== '' ? parseFloat(String(totalAmountRaw)) || null : null;

        const totalInBoxRaw = getColumnValue(row, ['totalnumberinbox', 'nombreboite', 'nbrboite', 'boite', 'box', 'nbinbox', 'qtyinbox', 'total_number_in_box', 'numberinbox', 'qteenboite']);
        const total_number_in_box = totalInBoxRaw !== undefined && totalInBoxRaw !== '' ? parseInt(String(totalInBoxRaw), 10) || null : null;

        const totalPalletsRaw = getColumnValue(row, ['totalnumberofpallets', 'nombrepalette', 'nbrpalette', 'palette', 'pallets', 'nbpallets', 'total_number_of_pallets', 'numberofpallets', 'nbdepalettes']);
        const total_number_of_pallets = totalPalletsRaw !== undefined && totalPalletsRaw !== '' ? parseInt(String(totalPalletsRaw), 10) || null : null;

        parsedPlanning.push({
          id: generateId(),
          set_number,
          description,
          quantity,
          week,
          total_amount,
          total_number_in_box,
          total_number_of_pallets
        });
      }

      if (parsedPlanning.length === 0) {
        alert("Could not extract any valid planning items. Please check your Excel headers. Required at least: Set.");
      } else {
        setPlanningPreview(parsedPlanning);
        setPlanningFile(file);
      }
    } catch (err: any) {
      console.error(err);
      alert("Error reading Excel file: " + err.message);
    } finally {
      setPlanningImporting(false);
      if (planningFileInputRef.current) planningFileInputRef.current.value = '';
    }
  };

  const confirmPlanningImport = async () => {
    if (planningPreview.length === 0) return;
    setLoading(true);
    try {
      await productionPlanningService.savePlanningBatch(planningPreview);
      alert(`Imported ${planningPreview.length} planning records successfully!`);
      setPlanningPreview([]);
      setPlanningFile(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save imported planning records.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10 font-sans h-full flex flex-col text-slate-800 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-4 shrink-0">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Production Import</h2>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-xs shrink-0">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'orders' ? 'bg-white text-slate-900 shadow-xs border-slate-200' : 'text-slate-500 hover:text-slate-800'
              }`}
          >
            <Package className="w-3.5 h-3.5" />
            Orders Import
          </button>
          <button
            onClick={() => setActiveTab('planning')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'planning' ? 'bg-white text-slate-900 shadow-xs border-slate-200' : 'text-slate-500 hover:text-slate-800'
              }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Planning Import
          </button>
          <button
            onClick={() => setActiveTab('employees')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'employees' ? 'bg-white text-slate-900 shadow-xs border-slate-200' : 'text-slate-500 hover:text-slate-800'
              }`}
          >
            <Users className="w-3.5 h-3.5" />
            Employees Import
          </button>
        </div>
      </div>

      <input ref={ordersFileInputRef} type="file" accept=".xlsx, .xls" onChange={handleOrdersFileChange} className="hidden" />
      <input ref={planningFileInputRef} type="file" accept=".xlsx, .xls" onChange={handlePlanningFileChange} className="hidden" />
      <input ref={employeesFileInputRef} type="file" accept=".xlsx, .xls" onChange={handleEmployeesFileChange} className="hidden" />

      {activeTab === 'orders' ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase text-slate-900">Orders Import</h3>
            </div>
            <button onClick={handleOrdersTemplate} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
              <Download className="w-3.5 h-3.5" /> Download Template
            </button>
          </div>

          <div onClick={() => ordersFileInputRef.current?.click()} className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all">
            <FileSpreadsheet className="w-10 h-10 text-blue-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">{ordersFile ? ordersFile.name : 'Click to select Orders Excel file'}</p>
            <p className="text-xs text-slate-400 mt-1">Accepts .xlsx, .xls</p>
          </div>

          {ordersPreview.length > 0 && (
            <div className="space-y-4 border border-blue-100 bg-blue-50/20 p-5 rounded-2xl animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-100">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Review Parsed Orders ({ordersPreview.length} records)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    File: <span className="font-semibold text-slate-700">{ordersFile?.name}</span>. Please review the orders before committing to the database.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOrdersPreview([]);
                      setOrdersFile(null);
                    }}
                    disabled={loading}
                    className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                  >
                    Cancel / Discard
                  </button>
                  <button
                    onClick={confirmOrdersImport}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase shadow-sm shadow-blue-500/20 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Confirm & Save Orders'}
                  </button>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-xl bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-bold text-slate-500 uppercase sticky top-0 border-b border-gray-100">
                    <tr>
                      <th className="p-2.5">Order #</th>
                      <th className="p-2.5">Supplier</th>
                      <th className="p-2.5">Set</th>
                      <th className="p-2.5">Description</th>
                      <th className="p-2.5">Expected Date</th>
                      <th className="p-2.5">Week</th>
                      <th className="p-2.5 text-right">Expected Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ordersPreview.map((o, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-mono font-bold text-blue-700">{o.order_number}</td>
                        <td className="p-2.5 text-slate-800">{o.supplier}</td>
                        <td className="p-2.5 font-semibold text-slate-700">{o.set_number}</td>
                        <td className="p-2.5 text-slate-600 max-w-[200px] truncate">{o.description || '—'}</td>
                        <td className="p-2.5 text-slate-600">{o.expected_delivery_date}</td>
                        <td className="p-2.5 font-mono text-slate-600">{o.week || '—'}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900">{o.quantity_expected?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'employees' ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase text-slate-900">Employees Import</h3>
            </div>
            <button onClick={handleEmployeesTemplate} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
              <Download className="w-3.5 h-3.5" /> Download Template
            </button>
          </div>

          <div onClick={() => employeesFileInputRef.current?.click()} className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all">
            <FileSpreadsheet className="w-10 h-10 text-blue-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">{employeesFile ? employeesFile.name : 'Click to select Employees Excel file'}</p>
            <p className="text-xs text-slate-400 mt-1">Accepts .xlsx, .xls (Columns: Matricule, Full Name)</p>
          </div>

          {employeesPreview.length > 0 && (
            <div className="space-y-4 border border-blue-100 bg-blue-50/20 p-5 rounded-2xl animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-100">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Review Parsed Employees ({employeesPreview.length} records)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    File: <span className="font-semibold text-slate-700">{employeesFile?.name}</span>. Review employees before saving to database.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEmployeesPreview([]);
                      setEmployeesFile(null);
                    }}
                    disabled={loading}
                    className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                  >
                    Cancel / Discard
                  </button>
                  <button
                    onClick={confirmEmployeesImport}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase shadow-sm shadow-blue-500/20 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Confirm & Save Employees'}
                  </button>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-xl bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-bold text-slate-500 uppercase sticky top-0 border-b border-gray-100">
                    <tr>
                      <th className="p-2.5">Matricule</th>
                      <th className="p-2.5">Full Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {employeesPreview.map((w, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-mono font-bold text-blue-700">{w.worker_id}</td>
                        <td className="p-2.5 font-semibold text-slate-800">{w.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase text-slate-900">Planning Import</h3>
            </div>
            <button onClick={handlePlanningTemplate} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
              <Download className="w-3.5 h-3.5" /> Download Template
            </button>
          </div>

          <div onClick={() => planningFileInputRef.current?.click()} className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all">
            <FileSpreadsheet className="w-10 h-10 text-blue-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">{planningFile ? planningFile.name : 'Click to select Planning Excel file'}</p>
            <p className="text-xs text-slate-400 mt-1">Accepts .xlsx, .xls</p>
          </div>

          {planningPreview.length > 0 && (
            <div className="space-y-4 border border-blue-100 bg-blue-50/20 p-5 rounded-2xl animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-100">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Review Parsed Planning Items ({planningPreview.length} records)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    File: <span className="font-semibold text-slate-700">{planningFile?.name}</span>. Review planning records before saving.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPlanningPreview([]);
                      setPlanningFile(null);
                    }}
                    disabled={loading}
                    className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                  >
                    Cancel / Discard
                  </button>
                  <button
                    onClick={confirmPlanningImport}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase shadow-sm shadow-blue-500/20 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Confirm & Save Planning'}
                  </button>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-xl bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-bold text-slate-500 uppercase sticky top-0 border-b border-gray-100">
                    <tr>
                      <th className="p-2.5">Set</th>
                      <th className="p-2.5">Week</th>
                      <th className="p-2.5">Description</th>
                      <th className="p-2.5 text-right">Target Qty</th>
                      <th className="p-2.5 text-right">Total Amount</th>
                      <th className="p-2.5 text-right">In Box</th>
                      <th className="p-2.5 text-right">Pallets</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {planningPreview.map((p, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-bold text-blue-700">{p.set_number}</td>
                        <td className="p-2.5 font-mono text-slate-600">{p.week || '—'}</td>
                        <td className="p-2.5 text-slate-700 max-w-[200px] truncate">{p.description || '—'}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900">{p.quantity?.toLocaleString()}</td>
                        <td className="p-2.5 text-right font-mono text-emerald-600">{p.total_amount != null ? p.total_amount.toFixed(2) : '—'}</td>
                        <td className="p-2.5 text-right font-mono text-slate-600">{p.total_number_in_box != null ? p.total_number_in_box : '—'}</td>
                        <td className="p-2.5 text-right font-mono text-slate-600">{p.total_number_of_pallets != null ? p.total_number_of_pallets : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
