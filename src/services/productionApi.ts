import * as XLSX from 'xlsx';
import {
  ProductionRecord,
  ProductionAggregatedResult,
  ProductionLine,
  ProductionWorker,
  ProductionOrder,
  ProductionPlanning,
  ProductionDashboardStats,
} from '../types';

const API_BASE = '/api/production';

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API error');
  }
  return res.json();
}

// ── Production Lines (renamed from "machines" in production101) ──────────────
export const productionLineService = {
  async getLines(): Promise<ProductionLine[]> {
    return apiFetch(`${API_BASE}/lines`);
  },
  async addLine(line: Omit<ProductionLine, 'id'>): Promise<void> {
    await apiFetch(`${API_BASE}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...line, id: generateId() }),
    });
  },
  async updateLine(id: string, line: Omit<ProductionLine, 'id'>): Promise<void> {
    await apiFetch(`${API_BASE}/lines/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(line),
    });
  },
  async deleteLine(id: string): Promise<void> {
    await apiFetch(`${API_BASE}/lines/${id}`, { method: 'DELETE' });
  },
  async deleteAllLines(): Promise<void> {
    await apiFetch(`${API_BASE}/lines/all`, { method: 'DELETE' });
  },
  downloadTemplate() {
    const data = [
      { 'Machine Name': 'Presse 1', 'Cadence (u/hr)': 500, 'Category': 'Assemblage' },
      { 'Machine Name': 'Presse 2', 'Cadence (u/hr)': 350, 'Category': 'Tompographie' },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ProductionLines');
    XLSX.writeFile(wb, 'production_lines_template.xlsx');
  },
};

// ── Production Workers ───────────────────────────────────────────────────────
export const productionWorkerService = {
  async getWorkers(): Promise<ProductionWorker[]> {
    return apiFetch(`${API_BASE}/workers`);
  },
  async addWorker(worker: Omit<ProductionWorker, 'id'>): Promise<void> {
    await apiFetch(`${API_BASE}/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...worker, id: generateId() }),
    });
  },
  async updateWorker(id: string, worker: Omit<ProductionWorker, 'id'>): Promise<void> {
    await apiFetch(`${API_BASE}/workers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(worker),
    });
  },
  async deleteWorker(id: string): Promise<void> {
    await apiFetch(`${API_BASE}/workers/${id}`, { method: 'DELETE' });
  },
  async deleteAllWorkers(): Promise<void> {
    await apiFetch(`${API_BASE}/workers/all`, { method: 'DELETE' });
  },
};

// ── Production Records ────────────────────────────────────────────────────────
export const productionRecordService = {
  async addRecords(records: Omit<ProductionRecord, 'id' | 'created_at' | 'upload_id'>[], uploadId: string) {
    const payload = records.map(r => ({
      id: generateId(),
      ...r,
      upload_id: uploadId,
      created_at: new Date().toISOString(),
    }));
    await apiFetch(`${API_BASE}/records/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: payload }),
    });
  },

  async replaceRecordsByDates(records: Omit<ProductionRecord, 'id' | 'created_at' | 'upload_id'>[], uploadId: string) {
    const uniqueDates = Array.from(new Set(records.map(r => r.date)));
    const payload = records.map(r => ({
      id: generateId(),
      ...r,
      upload_id: uploadId,
      created_at: new Date().toISOString(),
    }));
    await apiFetch(`${API_BASE}/records/replace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: payload, dates: uniqueDates }),
    });
  },

  async getRecords(filters: {
    dateStart?: string; dateEnd?: string; setNumber?: string;
    itemNumber?: string; workerId?: string; workerName?: string; machineCategory?: string;
  }): Promise<ProductionRecord[]> {
    const params = new URLSearchParams();
    if (filters.dateStart) params.set('dateStart', filters.dateStart);
    if (filters.dateEnd) params.set('dateEnd', filters.dateEnd);
    if (filters.workerId) params.set('workerId', filters.workerId);
    if (filters.workerName) params.set('workerName', filters.workerName);
    if (filters.setNumber) params.set('setNumber', filters.setNumber);
    if (filters.itemNumber) params.set('itemNumber', filters.itemNumber);
    if (filters.machineCategory) params.set('machineCategory', filters.machineCategory);
    const qs = params.toString();
    return apiFetch(`${API_BASE}/records${qs ? '?' + qs : ''}`);
  },

  async deleteRecord(id: string) {
    await apiFetch(`${API_BASE}/records/${id}`, { method: 'DELETE' });
  },

  async deleteAllRecords() {
    await apiFetch(`${API_BASE}/records/all`, { method: 'DELETE' });
  },

  async updateRecord(id: string, data: Partial<Omit<ProductionRecord, 'id' | 'created_at'>>) {
    await apiFetch(`${API_BASE}/records/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  downloadTemplate() {
    const data = [
      {
        'Date': new Date().toISOString().split('T')[0],
        'Worker ID': 'W001',
        'Worker Name': 'John Doe',
        'Machine Name': 'Presse 1',
        'Hours Worked': 8,
        'Set Number': 'SET-A1',
        'Item Number': 'ITEM-100',
        'Quantity': 50,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'production_template.xlsx');
  },

  aggregateData(records: ProductionRecord[]): ProductionAggregatedResult[] {
    const groups: Record<string, number> = {};
    records.forEach(r => {
      const wName = r.worker_name || '';
      const sNum = r.set_number || '';
      const iNum = r.item_number || '';
      const mCat = r.machine_category || '';
      const key = `${r.date}|${r.worker_id}|${wName}|${sNum}|${iNum}|${mCat}`;
      groups[key] = (groups[key] || 0) + r.quantity;
    });
    return Object.entries(groups).map(([key, quantity]) => {
      const [date, worker_id, worker_name, set_number, item_number, machine_category] = key.split('|');
      return { date, worker_id, worker_name, set_number, item_number, machine_category, quantity };
    }).sort((a, b) => b.date.localeCompare(a.date));
  },
};

// ── Production Orders ─────────────────────────────────────────────────────────
export const productionOrderService = {
  async getOrders(filters?: {
    supplier?: string; status?: string; dateStart?: string; dateEnd?: string; orderNumber?: string;
  }): Promise<ProductionOrder[]> {
    const params = new URLSearchParams();
    if (filters) {
      if (filters.supplier) params.append('supplier', filters.supplier);
      if (filters.status) params.append('status', filters.status);
      if (filters.dateStart) params.append('dateStart', filters.dateStart);
      if (filters.dateEnd) params.append('dateEnd', filters.dateEnd);
      if (filters.orderNumber) params.append('orderNumber', filters.orderNumber);
    }
    return apiFetch(`${API_BASE}/orders?${params.toString()}`);
  },
  async saveOrdersBatch(orders: ProductionOrder[]): Promise<void> {
    await apiFetch(`${API_BASE}/orders/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders }),
    });
  },
  async addOrder(order: ProductionOrder): Promise<void> {
    await apiFetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    });
  },
  async updateOrder(id: string, updates: Partial<ProductionOrder>): Promise<void> {
    await apiFetch(`${API_BASE}/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },
  async deleteOrder(id: string): Promise<void> {
    await apiFetch(`${API_BASE}/orders/${id}`, { method: 'DELETE' });
  },
  async clearAllOrders(): Promise<void> {
    await apiFetch(`${API_BASE}/orders/all`, { method: 'DELETE' });
  },
};

// ── Production Planning ───────────────────────────────────────────────────────
export const productionPlanningService = {
  async getPlanning(): Promise<ProductionPlanning[]> {
    return apiFetch(`${API_BASE}/planning`);
  },
  async savePlanningBatch(records: ProductionPlanning[]): Promise<void> {
    await apiFetch(`${API_BASE}/planning/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    });
  },
  async addPlanning(record: ProductionPlanning): Promise<void> {
    await apiFetch(`${API_BASE}/planning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
  },
  async updatePlanning(id: string, updates: Partial<ProductionPlanning>): Promise<void> {
    await apiFetch(`${API_BASE}/planning/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },
  async deletePlanning(id: string): Promise<void> {
    await apiFetch(`${API_BASE}/planning/${id}`, { method: 'DELETE' });
  },
  async clearAllPlanning(): Promise<void> {
    await apiFetch(`${API_BASE}/planning/all`, { method: 'DELETE' });
  },
};

// ── Dashboard Stats ───────────────────────────────────────────────────────────
export const productionDashboardService = {
  async getStats(): Promise<ProductionDashboardStats> {
    return apiFetch(`${API_BASE}/dashboard-stats`);
  },
};
