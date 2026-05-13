export type UserRole = 'admin' | 'manager' | 'technician';

export interface UserProfile {
  uid: string;
  username: string;
  password?: string;
  displayName: string;
  role: UserRole;
  updatedAt?: string;
}

export interface PreventiveTask {
  id: string;
  type: 'inspection' | 'cleaning' | 'lubrication' | 'replacement' | 'adjustment';
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'hours';
  frequencyHours?: number;
  description: string;
}

export interface Machine {
  id: string;
  name: string;
  serialNumber: string;
  type: string;
  manufacturingYear: number;
  location: string;
  siteNumber?: string;
  clampingForce: number;
  status: 'operational' | 'down' | 'maintenance' | 'idle' | 'retired';
  lastMaintenance?: string;
  nextMaintenance?: string;
  nextMaintenanceHours?: number;
  imageUrl?: string;
  currentHours: number;
  operationalStartTime?: string; // ISO string when it became operational
  lastHoursUpdate?: string; // ISO string when hours were last synced to DB
  totalOperatingTime: number; // in minutes
  totalDownTime: number; // in minutes
  failureCount: number;
  condition: string;
  manualUrl?: string;
  preventivePlan: PreventiveTask[];
  injectingProduct?: string;
  updatedAt?: string;
  position3d?: {
    position: [number, number, number];
    rotation: [number, number, number];
  };
}

export interface ProductionProduct {
  id: string;
  item: string;
  description: string;
  color: string;
  cycleTime: number;
  qtyProduced: number;
  priceTN: number;
  priceMalta: number;
  updatedAt?: string;
}

export interface FaultType {
  id: string;
  name: string;
  parentId: string | null; // null for root categories like "Mechanical", "Electrical"
}

export interface InterventionPart {
  partId: string;
  name: string;
  quantity: number;
}

export interface InterventionReport {
  issuerName: string;
  issuerSector: string;
  requesterName: string;
  requestDate: string;
  technicians: string;
  system?: string;
  date?: string;
  location: string;
  malfunctionDescription: string;
  operations: {
    replacement: boolean;
    diagnostic: boolean;
    improvement: boolean;
    control: boolean;
  };
  maintenanceType: 'corrective' | 'preventive';
  failureCause: 'wear' | 'user' | 'product' | 'other';
  relatedCause: string;
  interventionTime: string;
  actions: string;
  difficulties: string;
  partsUsed: InterventionPart[];
  startTime: string;
  endTime: string;
  durationMinutes: number;
  comments: string;
  completedAt: string;
  currentHours?: number;
}

export interface WorkOrder {
  id: string;
  machineId: string;
  machineName?: string;
  type: 'corrective' | 'preventive';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  title: string;
  description: string;
  assignedTo?: string;
  assignedName?: string;
  createdAt: string;
  createdBy?: string;
  createdByName?: string;
  completedAt?: string;
  parentFaultId?: string;
  childFaultIds?: string[];
  // Initial intervention fields
  issuerName?: string;
  issuerSector?: string;
  requesterName?: string;
  requestDate?: string;
  technicians?: string;
  system?: string;
  date?: string;
  location?: string;
  malfunctionDescription?: string;
  reportNumber?: string;
  intervention?: InterventionReport;
  updatedAt?: string;
}

export interface SparePart {
  id: string;
  name: string;
  sku: string;
  category: string;
  location: string;
  stock: number;
  minStock: number;
  unit: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  username: string;
  action: string;
  entityType: 'machine' | 'workOrder' | 'sparePart' | 'user';
  entityId: string;
  details: string;
  createdAt: string;
}

export interface DowntimeTrend {
  date: string;
  downtimeMinutes: number;
}

export interface PartConsumption {
  partName: string;
  quantity: number;
}

export interface TechnicianPerformance {
  technicianName: string;
  completedOrders: number;
  avgDurationMinutes: number;
}

export interface MttrTrend {
  date: string;
  mttrMinutes: number;
}

export interface MtbfTrend {
  date: string;
  mtbfHours: number;
}

export interface MachineConditionHistory {
  id: number;
  machineId: string;
  previousCondition: string;
  newCondition: string;
  timestamp: string;
}

export interface MachineRendement {
  id?: number;
  date: string;
  machineNumber: string;
  item: string;
  targetQty: number;
  qtyShift1: number;
  qtyShift2: number;
  qtyShift3: number;
  efficiencyShift1: number;
  efficiencyShift2: number;
  efficiencyShift3: number;
  actualCycleTime?: number;
  actualCavitiesRunning?: number;
  trs?: number;
  comment?: string;
  priceMarket?: 'TN' | 'Malta';
  createdAt?: string;
}
