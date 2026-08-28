import {
  Machine,
  WorkOrder,
  SparePart,
  UserProfile,
  FaultType,
  AuditLog,
  DowntimeTrend,
  PartConsumption,
  TechnicianPerformance,
  MttrTrend,
  MtbfTrend,
  MachineConditionHistory,
  ProductionProduct,
  MachineRendement,
  CalendarEvent
} from '../types';

const API_BASE = '/api';

async function handleResponse(res: Response) {
  const contentType = res.headers.get('content-type');
  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const error = (data && typeof data === 'object' && data.error) || data || res.statusText;
    throw new Error(error);
  }
  return data;
}

export const api = {
  // Machines
  getMachines: async (): Promise<Machine[]> => {
    const res = await fetch(`${API_BASE}/machines`);
    return handleResponse(res);
  },
  createMachine: async (machine: Machine): Promise<void> => {
    const res = await fetch(`${API_BASE}/machines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(machine)
    });
    await handleResponse(res);
  },
  updateMachine: async (id: string, machine: Partial<Machine>): Promise<void> => {
    const res = await fetch(`${API_BASE}/machines/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(machine)
    });
    await handleResponse(res);
  },
  deleteMachine: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/machines/${id}`, { method: 'DELETE' });
    await handleResponse(res);
  },
  clearAllMachines: async (): Promise<void> => {
    const res = await fetch(`${API_BASE}/machines`, { method: 'DELETE' });
    await handleResponse(res);
  },
  getMachineConditionHistory: async (id: string): Promise<MachineConditionHistory[]> => {
    const res = await fetch(`${API_BASE}/machines/${id}/condition-history`);
    return handleResponse(res);
  },
  updateMachineConditionHistory: async (id: number, data: { previousCondition: string; newCondition: string; timestamp: string }): Promise<void> => {
    const res = await fetch(`${API_BASE}/machine-condition-history/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    await handleResponse(res);
  },
  deleteMachineConditionHistory: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/machine-condition-history/${id}`, { method: 'DELETE' });
    await handleResponse(res);
  },
  getMachineProductionHistory: async (id: string): Promise<any[]> => {
    const res = await fetch(`${API_BASE}/machines/${id}/production-history`);
    return handleResponse(res);
  },
  getAllProductionHistory: async (): Promise<any[]> => {
    const res = await fetch(`${API_BASE}/production-history`);
    return handleResponse(res);
  },
  updateMachineProductionHistory: async (id: number, data: { productName: string; mouleName: string; startDate: string; endDate: string | null; qtyProduced?: number | null; qtyGood?: number | null; qtyBad?: number | null }): Promise<void> => {
    const res = await fetch(`${API_BASE}/machine-production-history/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    await handleResponse(res);
  },
  deleteMachineProductionHistory: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/machine-production-history/${id}`, { method: 'DELETE' });
    await handleResponse(res);
  },

  // Work Orders
  getWorkOrders: async (): Promise<WorkOrder[]> => {
    const res = await fetch(`${API_BASE}/work-orders`);
    return handleResponse(res);
  },
  getInterventions: async (from: string, to: string): Promise<any[]> => {
    const res = await fetch(`${API_BASE}/interventions?from=${from}&to=${to}`);
    return handleResponse(res);
  },
  createWorkOrder: async (workOrder: WorkOrder): Promise<void> => {
    const res = await fetch(`${API_BASE}/work-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workOrder)
    });
    await handleResponse(res);
  },
  updateWorkOrder: async (id: string, workOrder: Partial<WorkOrder>): Promise<void> => {
    const res = await fetch(`${API_BASE}/work-orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workOrder)
    });
    await handleResponse(res);
  },
  deleteInterventionReport: async (workOrderId: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/work-orders/${workOrderId}/intervention`, { method: 'DELETE' });
    await handleResponse(res);
  },
  deleteWorkOrder: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/work-orders/${id}`, { method: 'DELETE' });
    await handleResponse(res);
  },

  // Spare Parts
  getSpareParts: async (): Promise<SparePart[]> => {
    const res = await fetch(`${API_BASE}/spare-parts`);
    return handleResponse(res);
  },
  updateSparePart: async (id: string, part: Partial<SparePart>): Promise<void> => {
    const res = await fetch(`${API_BASE}/spare-parts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(part)
    });
    await handleResponse(res);
  },
  createSparePart: async (part: SparePart): Promise<void> => {
    const res = await fetch(`${API_BASE}/spare-parts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(part)
    });
    await handleResponse(res);
  },
  deleteSparePart: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/spare-parts/${id}`, { method: 'DELETE' });
    await handleResponse(res);
  },

  // Users
  getUsers: async (): Promise<UserProfile[]> => {
    const res = await fetch(`${API_BASE}/users`);
    return handleResponse(res);
  },
  updateUser: async (uid: string, user: Partial<UserProfile>): Promise<void> => {
    const res = await fetch(`${API_BASE}/users/${uid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    await handleResponse(res);
  },
  deleteUser: async (uid: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/users/${uid}`, { method: 'DELETE' });
    await handleResponse(res);
  },

  // Audit Logs
  getAuditLogs: async (date?: string, username?: string): Promise<AuditLog[]> => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (username) params.append('username', username);

    const queryString = params.toString();
    const url = queryString ? `${API_BASE}/audit-logs?${queryString}` : `${API_BASE}/audit-logs`;
    const res = await fetch(url);
    return handleResponse(res);
  },
  logMachineAction: async (action: string, entityId: string, details: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/audit-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, entityType: 'machine', entityId, details })
    });
    await handleResponse(res);
  },
  logSparePartAction: async (action: string, entityId: string, details: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/audit-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, entityType: 'spare-part', entityId, details })
    });
    await handleResponse(res);
  },

  // Analytics
  getDowntimeTrends: async (): Promise<DowntimeTrend[]> => {
    const res = await fetch(`${API_BASE}/analytics/downtime-trends`);
    return handleResponse(res);
  },
  getPartConsumption: async (): Promise<PartConsumption[]> => {
    const res = await fetch(`${API_BASE}/analytics/part-consumption`);
    return handleResponse(res);
  },
  getTechnicianPerformance: async (): Promise<TechnicianPerformance[]> => {
    const res = await fetch(`${API_BASE}/analytics/technician-performance`);
    return handleResponse(res);
  },
  getMttrTrends: async (): Promise<MttrTrend[]> => {
    const res = await fetch(`${API_BASE}/analytics/mttr-trends`);
    return handleResponse(res);
  },
  getMtbfTrends: async (): Promise<MtbfTrend[]> => {
    const res = await fetch(`${API_BASE}/analytics/mtbf-trends`);
    return handleResponse(res);
  },

  // File Upload
  uploadFile: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });
    return handleResponse(res);
  },

  // Production Products
  getProducts: async (): Promise<ProductionProduct[]> => {
    const res = await fetch(`${API_BASE}/products`);
    return handleResponse(res);
  },
  saveProducts: async (products: ProductionProduct[] | ProductionProduct): Promise<void> => {
    const res = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(products)
    });
    await handleResponse(res);
  },
  updateProduct: async (id: string, product: Partial<ProductionProduct>): Promise<void> => {
    const res = await fetch(`${API_BASE}/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });
    await handleResponse(res);
  },
  deleteProduct: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/products/${id}`, { method: 'DELETE' });
    await handleResponse(res);
  },

  // Purchase Requests
  getPurchaseRequests: async (): Promise<any[]> => {
    const res = await fetch(`${API_BASE}/purchase-requests`);
    return handleResponse(res);
  },
  getLastPurchaseRequestRef: async (): Promise<{ lastRef: string | null }> => {
    const res = await fetch(`${API_BASE}/purchase-requests/last-ref`);
    return handleResponse(res);
  },
  savePurchaseRequest: async (data: any): Promise<void> => {
    const res = await fetch(`${API_BASE}/purchase-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    await handleResponse(res);
  },
  updatePurchaseRequest: async (id: number | string, data: any): Promise<void> => {
    const res = await fetch(`${API_BASE}/purchase-requests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    await handleResponse(res);
  },
  deletePurchaseRequest: async (id: number | string): Promise<void> => {
    const res = await fetch(`${API_BASE}/purchase-requests/${id}`, { method: 'DELETE' });
    await handleResponse(res);
  },
  sendPurchaseRequestEmail: async (id: number | string): Promise<void> => {
    const res = await fetch(`${API_BASE}/purchase-requests/${id}/send`, {
      method: 'POST'
    });
    await handleResponse(res);
  },
  updatePurchaseRequestStatus: async (id: number | string, status: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/purchase-requests/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    await handleResponse(res);
  },

  // Machine Rendement
  getRendement: async (date?: string): Promise<MachineRendement[]> => {
    const url = date ? `${API_BASE}/machine-rendement?date=${date}` : `${API_BASE}/machine-rendement`;
    const res = await fetch(url);
    return handleResponse(res);
  },
  createRendement: async (data: MachineRendement): Promise<{ id: number }> => {
    const res = await fetch(`${API_BASE}/machine-rendement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },
  updateRendement: async (id: number, data: MachineRendement): Promise<void> => {
    const res = await fetch(`${API_BASE}/machine-rendement/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    await handleResponse(res);
  },
  deleteRendement: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/machine-rendement/${id}`, { method: 'DELETE' });
    await handleResponse(res);
  },

  // Calendar Events
  getCalendarEvents: async (month?: string): Promise<CalendarEvent[]> => {
    const url = month ? `${API_BASE}/calendar-events?month=${month}` : `${API_BASE}/calendar-events`;
    const res = await fetch(url);
    return handleResponse(res);
  },
  createCalendarEvent: async (event: Partial<CalendarEvent>): Promise<CalendarEvent> => {
    const res = await fetch(`${API_BASE}/calendar-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
    return handleResponse(res);
  },
  updateCalendarEvent: async (id: string, event: Partial<CalendarEvent>): Promise<void> => {
    const res = await fetch(`${API_BASE}/calendar-events/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
    await handleResponse(res);
  },
  deleteCalendarEvent: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/calendar-events/${id}`, { method: 'DELETE' });
    await handleResponse(res);
  },

  // Backups
  getBackups: async (): Promise<{ filename: string; sizeBytes: number; createdAt: string }[]> => {
    const res = await fetch(`${API_BASE}/backups`);
    return handleResponse(res);
  },
  createBackup: async (): Promise<{ message: string; filename: string }> => {
    const res = await fetch(`${API_BASE}/backups/create`, { method: 'POST' });
    return handleResponse(res);
  },
  downloadLiveBackup: () => {
    window.open(`${API_BASE}/backups/download`, '_blank');
  },
  downloadBackup: (filename: string) => {
    window.open(`${API_BASE}/backups/download/${encodeURIComponent(filename)}`, '_blank');
  },
  restoreBackup: async (filename: string): Promise<{ message: string; safety: string }> => {
    const res = await fetch(`${API_BASE}/backups/restore/${encodeURIComponent(filename)}`, { method: 'POST' });
    return handleResponse(res);
  },
  restoreUploadedBackup: async (file: File): Promise<{ message: string; safety: string }> => {
    const formData = new FormData();
    formData.append('dbfile', file);
    const res = await fetch(`${API_BASE}/backups/restore-upload`, { method: 'POST', body: formData });
    return handleResponse(res);
  },
  getServerIp: async (): Promise<{ ip: string; port: number }> => {
    const res = await fetch(`${API_BASE}/server-ip`);
    return handleResponse(res);
  },
};
