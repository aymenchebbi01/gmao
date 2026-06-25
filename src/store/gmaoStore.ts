import { create } from 'zustand';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MachineStatus = 'operational' | 'down' | 'maintenance' | 'idle' | 'retired';

export type NotificationType =
  | 'machine_down'
  | 'machine_maintenance'
  | 'pm_warning'
  | 'wo_completed'
  | 'hours_updated';

export interface DashboardNotification {
  id: string;
  type: NotificationType;
  machineId?: string;
  machineName?: string;
  woId?: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface GmaoState {
  machineStatus: Record<string, MachineStatus>;
  machineHours: Record<string, number>;
  notifications: DashboardNotification[];

  unreadCount: () => number;

  setMachineStatuses: (machines: { id: string; status: string }[]) => void;
  updateMachineStatus: (id: string, status: MachineStatus) => void;

  setMachineHours: (machines: { id: string; currentHours: number; status: string; operationalStartTime?: string }[]) => void;
  updateMachineHour: (id: string, hours: number) => void;

  addNotification: (n: Omit<DashboardNotification, 'id' | 'read'>) => void;
  prependNotifications: (ns: Omit<DashboardNotification, 'id' | 'read'>[]) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
}

function calcLiveHours(machine: { currentHours: number; status: string; operationalStartTime?: string }): number {
  if (machine.status === 'operational' && machine.operationalStartTime) {
    const start = new Date(machine.operationalStartTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    if (diffMs > 0) {
      return parseFloat((machine.currentHours + diffMs / 3_600_000).toFixed(2));
    }
  }
  return machine.currentHours || 0;
}

export const useGmaoStore = create<GmaoState>((set, get) => ({
  machineStatus: {},
  machineHours: {},
  notifications: [],

  unreadCount: () => get().notifications.filter(n => !n.read).length,

  setMachineStatuses: (machines) => {
    const map: Record<string, MachineStatus> = {};
    machines.forEach(m => { map[m.id] = m.status as MachineStatus; });
    set({ machineStatus: map });
  },
  updateMachineStatus: (id, status) =>
    set(s => ({ machineStatus: { ...s.machineStatus, [id]: status } })),

  setMachineHours: (machines) => {
    const map: Record<string, number> = {};
    machines.forEach(m => { map[m.id] = calcLiveHours(m); });
    set({ machineHours: map });
  },
  updateMachineHour: (id, hours) =>
    set(s => ({ machineHours: { ...s.machineHours, [id]: hours } })),

  addNotification: (n) => {
    const notif: DashboardNotification = {
      ...n,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      read: false,
    };
    set(s => ({ notifications: [notif, ...s.notifications].slice(0, 100) }));
  },
  prependNotifications: (ns) => {
    const mapped: DashboardNotification[] = ns.map(n => ({
      ...n,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      read: false,
    }));
    set(s => ({ notifications: [...mapped, ...s.notifications].slice(0, 100) }));
  },
  markAllRead: () =>
    set(s => ({ notifications: s.notifications.map(n => ({ ...n, read: true })) })),
  markRead: (id) =>
    set(s => ({
      notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n),
    })),
}));
