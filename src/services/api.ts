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
  MachineConditionHistory
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
  getMachineConditionHistory: async (id: string): Promise<MachineConditionHistory[]> => {
    const res = await fetch(`${API_BASE}/machines/${id}/condition-history`);
    return handleResponse(res);
  },

  // Work Orders
  getWorkOrders: async (): Promise<WorkOrder[]> => {
    const res = await fetch(`${API_BASE}/work-orders`);
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
  getAuditLogs: async (): Promise<AuditLog[]> => {
    const res = await fetch(`${API_BASE}/audit-logs`);
    return handleResponse(res);
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
  }
};
