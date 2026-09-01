export type UserRole = 'admin' | 'manager' | 'technician' | 'accounting' | 'production';

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
  installationDate?: string;
  statusReason?: string;
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
  currentMoule?: string;
  downStartTime?: string;
  updatedAt?: string;
  position3d?: {
    position: [number, number, number];
    rotation: [number, number, number];
  };

  // ── Technical specifications (all optional) ───────────────────────────────
  // Closing
  closingType?: string;
  // Mold dimensions
  moldThicknessMin?: number;
  moldThicknessMax?: number;
  centeringDiameter?: number;
  tieBarSpacingHorizontal?: number;
  tieBarSpacingVertical?: number;
  // Strokes / cores
  maxOpeningStroke?: number;
  maxEjectionStroke?: number;
  coreCount?: number;
  // Injection
  screwDiameter?: number;
  maxInjectableVolume?: number;
  coolingChannelCount?: number;
  // Regulation / accessories
  thermalRegulation?: string;
  accessories?: string;
  // Fluids
  hydraulicOilType?: string;
  lubricantType?: string;
  reservoirCapacity?: number;
}

export interface MachineProductionHistory {
  id: number;
  machineId: string;
  productName: string;
  mouleName: string;
  startDate: string;
  endDate?: string;
  qtyProduced?: number;
  qtyGood?: number;
  qtyBad?: number;
}

export type Product = ProductionProduct;

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
  failureCategory?: string;
  failureCause: string;
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

export interface BonLivraisonItem {
  partId?: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  remarks: string;
}

export interface BonLivraisonRecord {
  id: number;
  reference: string;
  date: string;
  requested_by: string;
  department?: string;
  machine_id?: string;
  machine_name?: string;
  reason?: string;
  notes?: string;
  items_json?: string;
  items_count?: number;
  created_at?: string;
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

export interface CalendarEvent {
  id: string;
  title: string;
  eventType: 'preventive' | 'corrective' | 'inspection' | 'downtime';
  equipmentId?: string;
  equipmentName?: string;
  location?: string;
  technicians?: string;
  estimatedDuration?: number;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  status?: 'planned' | 'in-progress' | 'done' | 'overdue';
  workOrderNumber?: string;
  notes?: string;
  startDate: string;
  endDate: string;
  recurrence?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'none';
  createdAt?: string;
  updatedAt?: string;
  isReadOnly?: boolean;
  isPrediction?: boolean;
  isRecurringInstance?: boolean;
  originalEventId?: string;
  source?: string;
  lastMaintenanceDate?: string;
  nextDueDate?: string;
  daysRemainingOrOverdue?: number;
}

// ── PRODUCTION MODULE TYPES (migrated from production101) ─────────────────────

/** Production cadence machine (renamed from "Machine" in production101 to avoid
 *  confusion with the GMAO Machine which is full maintenance equipment). */
export interface ProductionLine {
  id: string;
  name: string;
  cadence: number;
  category?: string;
}

export interface ProductionWorker {
  id: string;
  worker_id: string; // matricule
  name: string;
}

export interface ProductionRecord {
  id?: string;
  worker_id: string;
  worker_name?: string;
  set_number: string;
  item_number: string;
  quantity: number;
  date: string; // YYYY-MM-DD
  upload_id: string;
  created_at: string;
  machine_name?: string | null;
  machine_category?: string | null;
  hours_worked?: number | null;
}

export interface ProductionOrder {
  id: string;
  supplier: string;
  order_number: string;
  set_number: string;
  description?: string;
  expected_delivery_date: string;
  quantity_expected: number;
  quantity_delivered: number;
  is_delivered: 'yes' | 'no' | 'eliminated' | 'late' | 'in progress';
  actual_delivered_date?: string;
  actual_quantity_delivered?: number;
  comment?: string;
  department?: string;
  updated_by?: string;
  week?: string;
}

export interface ProductionPlanning {
  id: string;
  set_number: string;
  description?: string;
  quantity: number;
  week?: string;
  total_amount?: number | null;
  total_number_in_box?: number | null;
  total_number_of_pallets?: number | null;
  order_numbers?: string;
  created_at?: string;
}

export interface ProductionAggregatedResult {
  date: string;
  worker_id?: string;
  worker_name?: string;
  set_number: string;
  item_number: string;
  machine_category?: string;
  quantity: number;
}

export interface ProductionDashboardStats {
  todayTotal: number;
  pendingOrders: number;
  topWorker: string;
  planningItems: number;
}
