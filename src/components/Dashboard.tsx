import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
  Settings, Bell, AlertCircle, Wrench, X, AlertTriangle,
  Clipboard, Clock, CheckCircle2, Edit2, ArrowUpRight,
  TrendingDown, TrendingUp, Minus, ChevronRight
} from 'lucide-react';
import { Machine, WorkOrder, AuditLog } from '../types';
import { cn, calculateMachineLiveHours } from '../lib/utils';
import { api } from '../services/api';
import { useGmaoStore } from '../store/gmaoStore';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  blue: '#378ADD',
  teal: '#1D9E75',
  red: '#E24B4A',
  amber: '#EF9F27',
  gray: '#9ca3af',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function last7DaysBuckets() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { name: DAYS_SHORT[d.getDay()], date: d.toISOString().split('T')[0], corrective: 0, preventive: 0 };
  });
}

function last30DaysBuckets() {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return { name: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }), date: d.toISOString().split('T')[0], corrective: 0, preventive: 0 };
  });
}

function bucketOrders(orders: WorkOrder[], buckets: ReturnType<typeof last7DaysBuckets>) {
  const b = buckets.map(x => ({ ...x }));
  orders.forEach(o => {
    if (!o.createdAt) return;
    const date = new Date(o.createdAt).toISOString().split('T')[0];
    const slot = b.find(d => d.date === date);
    if (!slot) return;
    else if (o.type === 'preventive') slot.preventive++;
    else slot.corrective++;
  });
  return b;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function pmHoursRemaining(machine: Machine, liveHours: number) {
  if (!machine.nextMaintenanceHours) return null;
  return machine.nextMaintenanceHours - liveHours;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// KPI Card
interface KpiCardProps {
  label: string;
  value: string | number;
  accentColor: string;
  icon: React.ReactNode;
  delta?: { text: string; direction: 'up' | 'down' | 'neutral'; positive: boolean };
}
function KpiCard({ label, value, accentColor, icon, delta }: KpiCardProps) {
  const deltaColor = delta
    ? delta.direction === 'neutral' ? '#EF9F27' : delta.positive ? '#1D9E75' : '#E24B4A'
    : undefined;

  return (
    <div style={{
      background: 'var(--color-background-primary)',
      border: '0.5px solid var(--color-border-tertiary)',
      borderRadius: 12,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Top accent bar */}
      <div style={{ height: 3, background: accentColor }} />
      <div style={{ padding: '16px 18px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: accentColor + '20',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: accentColor, flexShrink: 0,
          }}>
            {icon}
          </div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1 }}>
          {value}
        </div>
        {delta && (
          <div style={{ marginTop: 8, fontSize: 10, color: deltaColor, display: 'flex', alignItems: 'center', gap: 3 }}>
            {delta.direction === 'up' ? <TrendingUp size={11} /> : delta.direction === 'down' ? <TrendingDown size={11} /> : <Minus size={11} />}
            {delta.text}
          </div>
        )}
      </div>
    </div>
  );
}

// SVG Donut
interface DonutProps {
  segments: { label: string; value: number; color: string }[];
  total: number;
}
function SvgDonut({ segments, total }: DonutProps) {
  const r = 52;
  const cx = 72;
  const cy = 72;
  const strokeW = 18;
  const circumference = 2 * Math.PI * r;
  const nonZero = segments.filter(s => s.value > 0);

  let offset = 0;
  const arcs = nonZero.map(seg => {
    const frac = total > 0 ? seg.value / total : 0;
    const dash = frac * circumference;
    const gap = circumference - dash;
    const arc = { ...seg, strokeDasharray: `${dash} ${gap}`, strokeDashoffset: -offset };
    offset += dash;
    return arc;
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <div style={{ flexShrink: 0 }}>
        <svg width={144} height={144} viewBox="0 0 144 144">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border-tertiary)" strokeWidth={strokeW} />
          {arcs.map((arc, i) => (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeW}
              strokeDasharray={arc.strokeDasharray}
              strokeDashoffset={arc.strokeDashoffset}
              strokeLinecap="butt"
              style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px`, transition: 'stroke-dasharray 0.4s ease' }}
            />
          ))}
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize={20} fontWeight={500} fill="var(--color-text-primary)">{total}</text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fill="var(--color-text-muted)">machines</text>
        </svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{seg.label}</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Custom Bar Chart tooltip
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.color }} />
          <span style={{ color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>{p.name}: <strong>{p.value}</strong></span>
        </div>
      ))}
    </div>
  );
}

// ─── Audit log → human-readable notification helper ─────────────────────────
function parseAuditLog(
  log: AuditLog,
  machineMap: Record<string, string>, // id → name
  sparePartsMap: Map<string, any>
): { type: string; title: string; message: string } | null {
  const entityType = (log.entityType || '').toLowerCase();
  const action = (log.action || '').toLowerCase();
  const details = (log.details || '');

  // 1. Work Order Creation
  if (entityType === 'workorder' && action === 'create') {
    const title = 'Work Order';
    let message = details;
    const woMatch = details.match(/(WO-\d{4}-\d+)/);
    if (woMatch) {
      message = `Work order created: ${woMatch[1]}`;
    }
    return { type: 'wo_created', title, message };
  }

  // 2. Inventory alerts (low stock)
  if (entityType === 'sparepart' || entityType === 'spare-part') {
    if (action !== 'delete') {
      const part = sparePartsMap.get(log.entityId);
      if (part && part.stock <= part.minStock) {
        return {
          type: 'inventory_alert',
          title: part.name,
          message: `Low stock alert: ${part.stock} ${part.unit || 'units'} left (min: ${part.minStock})`
        };
      }
    }
  }

  // 3. Machine status changes
  if (entityType === 'machine') {
    const isStatusChange = action.includes('status') || details.includes("'status'") || details.includes('status changed') || action === 'change_status';
    if (isStatusChange) {
      const entityName = machineMap[log.entityId] || log.entityId;
      const statusMatch = details.match(/status.*from\s*['"]?(\w+)['"]?\s*to\s*['"]?(\w+)['"]?/i);
      
      let type = 'hours_updated';
      let message = details;

      if (statusMatch) {
        const toStatus = statusMatch[2];
        if (toStatus === 'down') {
          type = 'machine_down';
          message = 'Machine went down';
        } else if (toStatus === 'maintenance') {
          type = 'machine_maintenance';
          message = 'Placed in maintenance';
        } else if (toStatus === 'operational') {
          type = 'wo_completed';
          message = 'Returned to operational';
        } else {
          message = `Status changed to ${toStatus}`;
        }
      } else {
        if (details.toLowerCase().includes('down')) {
          type = 'machine_down';
          message = 'Machine went down';
        } else if (details.toLowerCase().includes('maintenance')) {
          type = 'machine_maintenance';
          message = 'Placed in maintenance';
        } else if (details.toLowerCase().includes('operational')) {
          type = 'wo_completed';
          message = 'Returned to operational';
        }
      }
      return { type, title: entityName, message };
    }
  }

  return null;
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [machines, setMachines] = useState<Machine[]>([]);
  // stable lookup map: machineId → machine name
  const machineNameMapRef = useRef<Record<string, string>>({});
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('dash-dismissed') || '[]')); }
    catch { return new Set(); }
  });

  // Zustand store slices
  const machineStatus = useGmaoStore(s => s.machineStatus);
  const machineHours = useGmaoStore(s => s.machineHours);
  const notifications = useGmaoStore(s => s.notifications);
  const unreadCount = useGmaoStore(s => s.unreadCount());
  const setMachineStatuses = useGmaoStore(s => s.setMachineStatuses);
  const setMachineHoursStore = useGmaoStore(s => s.setMachineHours);
  const markAllRead = useGmaoStore(s => s.markAllRead);
  const prependNotifications = useGmaoStore(s => s.prependNotifications);

  const lastAuditIdRef = useRef<string | null>(null);

  // ── Derived stats ──
  const total = machines.length;
  const downList = machines.filter(m => m.status === 'down');
  const maintList = machines.filter(m => m.status === 'maintenance');
  const operational = machines.filter(m => m.status === 'operational').length;
  const idle = machines.filter(m => m.status === 'idle').length;
  const pendingOrders = orders.filter(o => o.status !== 'completed' && o.status !== 'cancelled').length;
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
    .slice(0, 5);

  const completedWithDuration = orders.filter(o => o.status === 'completed' && o.intervention?.durationMinutes);
  const avgMttr = completedWithDuration.length > 0
    ? (completedWithDuration.reduce((sum, o) => sum + (o.intervention?.durationMinutes || 0), 0) / completedWithDuration.length / 60).toFixed(1)
    : '0';

  // ── Data fetching ──
  const fetchMachines = useCallback(async () => {
    try {
      const data = await api.getMachines();
      setMachines(data);
      setMachineStatuses(data);
      setMachineHoursStore(data);
      // Keep name map in sync so audit log parser can resolve IDs → names
      const map: Record<string, string> = {};
      data.forEach(m => { map[m.id] = m.name; });
      machineNameMapRef.current = map;
    } catch (e) { /* silent */ }
  }, [setMachineStatuses, setMachineHoursStore]);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await api.getWorkOrders();
      setOrders(data);
    } catch (e) { /* silent */ }
  }, []);

  const buildChartData = useCallback((allOrders: WorkOrder[], ds: string, de: string) => {
    // Filter orders by date range (empty = no filter)
    const filtered = allOrders.filter(o => {
      if (!o.createdAt) return true;
      const d = o.createdAt.split('T')[0];
      if (ds && d < ds) return false;
      if (de && d > de) return false;
      return true;
    });
    // Build day-by-day buckets covering the selected range (or last 30 days as default view)
    const buckets = last30DaysBuckets();
    setChartData(bucketOrders(filtered, buckets));
  }, []);

  // Poll audit log → derive human-readable notifications
  const pollAuditLog = useCallback(async () => {
    try {
      const [logs, spareParts] = await Promise.all([
        api.getAuditLogs(),
        api.getSpareParts()
      ]);
      if (!logs.length) return;

      const nameMap = machineNameMapRef.current;
      const sparePartsMap = new Map(spareParts.map(p => [p.id, p]));

      // Parse and filter the logs
      const parsedLogs = logs
        .map(log => {
          const parsed = parseAuditLog(log, nameMap, sparePartsMap);
          if (!parsed) return null;
          return {
            logId: log.id,
            notif: {
              type: parsed.type as any,
              machineId: log.entityId,
              machineName: parsed.title,
              message: parsed.message,
              timestamp: log.createdAt,
            }
          };
        })
        .filter((n): n is Exclude<typeof n, null> => n !== null);

      const newOnes = lastAuditIdRef.current
        ? parsedLogs.filter(l => Number(l.logId) > Number(lastAuditIdRef.current!))
        : parsedLogs.slice(0, 10);

      lastAuditIdRef.current = String(logs[0]?.id ?? '');

      if (newOnes.length > 0) {
        // Filter out any notifications that already exist in store (by machineName/message/timestamp)
        const existing = useGmaoStore.getState().notifications;
        const filteredNewOnes = newOnes
          .map(o => o.notif)
          .filter(n => {
            return !existing.some(ext => 
              ext.machineName === n.machineName && 
              ext.message === n.message && 
              ext.timestamp === n.timestamp
            );
          });
        if (filteredNewOnes.length > 0) {
          prependNotifications(filteredNewOnes);
        }
      }
    } catch (e) { /* silent */ }
  }, [prependNotifications]);

  useEffect(() => {
    fetchMachines();
    fetchOrders();
    pollAuditLog();
  }, [fetchMachines, fetchOrders, pollAuditLog]);

  useEffect(() => {
    buildChartData(orders, dateStart, dateEnd);
  }, [orders, dateStart, dateEnd, buildChartData]);

  useEffect(() => {
    const t1 = setInterval(fetchMachines, 30_000);
    const t2 = setInterval(fetchOrders, 30_000);
    const t3 = setInterval(pollAuditLog, 30_000);
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); };
  }, [fetchMachines, fetchOrders, pollAuditLog]);

  // Dismiss banner
  const dismissBanner = (key: string) => {
    const next = new Set(dismissedBanners).add(key);
    setDismissedBanners(next);
    sessionStorage.setItem('dash-dismissed', JSON.stringify([...next]));
  };

  // PM hours list (from store)
  const pmMachines = machines
    .filter(m => m.nextMaintenanceHours)
    .map(m => {
      const live = machineHours[m.id] ?? calculateMachineLiveHours(m);
      const remaining = (m.nextMaintenanceHours || 0) - live;
      return { machine: m, live, remaining };
    })
    .sort((a, b) => a.remaining - b.remaining);

  // ─── Render ───────────────────────────────────────────────────────────────
  const s: React.CSSProperties = { fontFamily: 'Inter, system-ui, sans-serif' };

  const card: React.CSSProperties = {
    background: 'var(--color-background-primary)',
    border: '0.5px solid var(--color-border-tertiary)',
    borderRadius: 12,
  };

  return (
    <div style={{ ...s, background: 'var(--color-background-tertiary)', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 32 }}>

      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <div style={{ ...card, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Settings size={16} color="var(--color-text-secondary)" />
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>Maintenance dashboard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>From</span>
          <input
            type="date"
            value={dateStart}
            onChange={e => setDateStart(e.target.value)}
            style={{
              fontSize: 12, padding: '5px 10px', borderRadius: 8,
              border: '0.5px solid var(--color-border-tertiary)',
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
              outline: 'none', cursor: 'pointer',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>To</span>
          <input
            type="date"
            value={dateEnd}
            onChange={e => setDateEnd(e.target.value)}
            style={{
              fontSize: 12, padding: '5px 10px', borderRadius: 8,
              border: '0.5px solid var(--color-border-tertiary)',
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
              outline: 'none', cursor: 'pointer',
            }}
          />
          {(dateStart || dateEnd) && (
            <button
              onClick={() => { setDateStart(''); setDateEnd(''); }}
              style={{
                fontSize: 11, padding: '5px 10px', borderRadius: 8,
                border: '0.5px solid var(--color-border-tertiary)',
                background: 'transparent',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button style={{
              width: 32, height: 32, borderRadius: 8,
              border: '0.5px solid var(--color-border-tertiary)',
              background: 'var(--color-background-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--color-text-secondary)',
            }}>
              <Bell size={15} />
            </button>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                background: C.red, color: '#fff',
                fontSize: 9, fontWeight: 700,
                borderRadius: '50%', minWidth: 16, height: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px',
              }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Alert Banners ──────────────────────────────────────────────────── */}
      {downList.length > 0 && !dismissedBanners.has('down') && (
        <AlertBanner
          severity="down"
          machines={downList}
          onDismiss={() => dismissBanner('down')}
          onNavigate={() => setActiveTab('machines')}
        />
      )}
      {maintList.length > 0 && !dismissedBanners.has('maintenance') && (
        <AlertBanner
          severity="maintenance"
          machines={maintList}
          onDismiss={() => dismissBanner('maintenance')}
          onNavigate={() => setActiveTab('machines')}
        />
      )}

      {/* ── KPI Grid ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }} className="max-sm:grid-cols-2 max-xs:grid-cols-1">
        <KpiCard
          label="Total machines"
          value={total}
          accentColor={C.blue}
          icon={<Settings size={14} />}
          delta={{ text: `${total} registered`, direction: 'neutral', positive: true }}
        />
        <KpiCard
          label="Machines down"
          value={downList.length}
          accentColor={C.red}
          icon={<AlertTriangle size={14} />}
          delta={downList.length > 0
            ? { text: `${downList.length} critical`, direction: 'down', positive: false }
            : { text: 'All running', direction: 'up', positive: true }}
        />
        <KpiCard
          label="Pending orders"
          value={pendingOrders}
          accentColor={C.amber}
          icon={<Clipboard size={14} />}
          delta={{ text: `${orders.filter(o => o.status === 'completed').length} completed`, direction: 'neutral', positive: true }}
        />
        <KpiCard
          label="MTTR avg"
          value={`${avgMttr}h`}
          accentColor={C.teal}
          icon={<Clock size={14} />}
          delta={{ text: 'Mean time to repair', direction: 'neutral', positive: true }}
        />
      </div>

      {/* ── Mid Grid ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }} className="max-lg:grid-cols-1">

        {/* Col 1 — Interventions bar chart */}
        <div style={{ ...card, padding: '20px 20px 16px' }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 4 }}>Interventions</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {dateStart || dateEnd
                ? `${dateStart || '…'} → ${dateEnd || '…'}`
                : 'All time'}
            </div>
          </div>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap="30%" barGap={2}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: C.gray }} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-background-tertiary)' }} />
                <Bar dataKey="corrective" fill={C.blue} radius={[3, 3, 0, 0]} maxBarSize={16} />
                <Bar dataKey="preventive" fill={C.teal} radius={[3, 3, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Corrective', color: C.blue },
              { label: 'Preventive', color: C.teal },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--color-text-secondary)' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>

        {/* Col 2 — Machine status donut */}
        <div style={{ ...card, padding: '20px' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 16 }}>Machine status</div>
          <SvgDonut
            total={total}
            segments={[
              { label: 'Operational', value: operational, color: C.teal },
              { label: 'Down', value: downList.length, color: C.red },
              { label: 'Maintenance', value: maintList.length, color: C.amber },
              { label: 'Idle', value: idle, color: C.gray },
            ]}
          />
        </div>

        {/* Col 3 — PM hours remaining */}
        <div style={{ ...card, padding: '20px' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 16 }}>PM hours remaining</div>
          {pmMachines.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', paddingTop: 24 }}>No PM thresholds set</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 260, overflowY: 'auto' }}>
              {pmMachines.slice(0, 10).map(({ machine, remaining }) => {
                const isOverdue = remaining <= 0;
                const isWarning = !isOverdue && remaining <= 50;
                const barColor = isOverdue ? C.red : isWarning ? C.amber : C.teal;
                const maxHours = machine.nextMaintenanceHours || 1;
                const barPct = isOverdue ? 100 : Math.max(0, Math.min(100, ((maxHours - remaining) / maxHours) * 100));
                return (
                  <div key={machine.id} style={{ width: '100%' }}>
                    {/* Name + value on one line above the bar */}
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5, gap: 6 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)',
                        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        minWidth: 0,
                      }}>
                        {machine.name}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: isOverdue ? C.red : 'var(--color-text-muted)', flexShrink: 0 }}>
                        {isOverdue ? 'Overdue' : `${Math.round(remaining)}h left`}
                      </span>
                    </div>
                    {/* Full-width bar below */}
                    <div style={{ height: 4, borderRadius: 99, background: 'var(--color-border-tertiary)', overflow: 'hidden', width: '100%' }}>
                      <div style={{ height: '100%', width: `${barPct}%`, background: barColor, borderRadius: 99, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Grid ────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, minWidth: 0 }} className="max-lg:grid-cols-1">

        {/* Work orders table */}
        <div style={{ ...card, padding: '20px', overflow: 'hidden', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>Recent work orders</div>
            <button
              onClick={() => setActiveTab('work-orders-list')}
              style={{ fontSize: 11, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 3 }}
            >
              View all <ChevronRight size={12} />
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '28%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                  {['Order', 'Machine', 'Technician', 'Priority', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ paddingBottom: 10, fontSize: 10, fontWeight: 500, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: h === 'Actions' ? 'right' : 'left' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentOrders.map(order => {
                  const mStatus = machineStatus[order.machineId];
                  const isDown = mStatus === 'down';
                  const isMaint = mStatus === 'maintenance';
                  return (
                    <tr
                      key={order.id}
                      onClick={() => setActiveTab('work-orders-list')}
                      style={{ cursor: 'pointer', borderBottom: '0.5px solid var(--color-border-tertiary)', transition: 'background 0.12s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-tertiary)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ padding: '10px 0' }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.title}</div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{order.type}</div>
                      </td>
                      <td style={{ padding: '10px 8px 10px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>{order.machineName}</span>
                          {isDown && <WoBadge label="DOWN" color={C.red} />}
                          {isMaint && !isDown && <WoBadge label="MAINT" color={C.amber} />}
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px 10px 0' }}>
                        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 90 }}>
                          {order.assignedName || order.assignedTo || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px 10px 0' }}>
                        <PriorityPill priority={order.priority} />
                      </td>
                      <td style={{ padding: '10px 8px 10px 0' }}>
                        <StatusDot status={order.status} />
                      </td>
                      <td style={{ padding: '10px 0', textAlign: 'right' }}>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                          <ArrowUpRight size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                      No work orders yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notifications panel */}
        <div style={{ ...card, padding: '20px', display: 'flex', flexDirection: 'column', height: 480, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>Notifications</span>
              {unreadCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, background: C.red, color: '#fff', borderRadius: 99, padding: '1px 6px' }}>{unreadCount}</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 11, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                Mark all read
              </button>
            )}
          </div>
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {notifications.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: 'var(--color-text-muted)' }}>No notifications</div>
            )}
            {notifications.slice(0, 10).map(n => (
              <NotifItem
                key={n.id}
                n={n}
                onCreateWO={() => setActiveTab('work-orders-list')}
                onSchedulePM={() => setActiveTab('calendar')}
                onGoToPurchaseRequests={() => setActiveTab('purchase-requests')}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Alert Banner ─────────────────────────────────────────────────────────────
function AlertBanner({ severity, machines, onDismiss, onNavigate }: {
  severity: 'down' | 'maintenance';
  machines: Machine[];
  onDismiss: () => void;
  onNavigate: () => void;
}) {
  const isDown = severity === 'down';
  const accentColor = isDown ? '#E24B4A' : '#EF9F27';
  const bgColor = isDown ? '#FCEBEB' : '#FAEEDA';
  const textColor = isDown ? '#9B2020' : '#8B5A00';
  const chipBg = isDown ? '#FAD5D5' : '#F9E4BE';

  return (
    <div style={{
      borderRadius: 12, background: bgColor,
      borderLeft: `3px solid ${accentColor}`,
      border: `0.5px solid ${accentColor}30`,
      borderLeftWidth: 3, borderLeftColor: accentColor,
      padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flexShrink: 0, color: accentColor }}>
        {isDown ? <AlertCircle size={16} /> : <Wrench size={16} />}
      </div>
      <span style={{ fontSize: 12, fontWeight: 500, color: textColor, flexShrink: 0, whiteSpace: 'nowrap' }}>
        {isDown
          ? `${machines.length} machine${machines.length > 1 ? 's' : ''} down`
          : `${machines.length} in maintenance`}
      </span>
      {/* Scrollable chips */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1, scrollbarWidth: 'none' }}>
        {machines.map(m => (
          <button
            key={m.id}
            onClick={onNavigate}
            style={{
              flexShrink: 0, cursor: 'pointer',
              background: chipBg, color: textColor,
              border: `0.5px solid ${accentColor}40`,
              borderRadius: 20, padding: '3px 10px',
              fontSize: 11, fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            {m.name}
          </button>
        ))}
      </div>
      {/*<button
        onClick={onNavigate}
        style={{ fontSize: 11, fontWeight: 500, color: textColor, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
      >
        View all
      </button>*/}
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: accentColor, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <X size={14} />
      </button>
    </div>
  );
}

// ─── WO Table helpers ─────────────────────────────────────────────────────────
function WoBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, color, background: color + '20',
      border: `0.5px solid ${color}40`, borderRadius: 4, padding: '1px 4px',
      textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
    }}>{label}</span>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    high: { bg: '#FAD5D5', color: '#9B2020' },
    critical: { bg: '#FAD5D5', color: '#9B2020' },
    medium: { bg: '#FAEEDA', color: '#8B5A00' },
    low: { bg: '#D5F5E3', color: '#1A7A40' },
  };
  const c = cfg[priority] || { bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{ fontSize: 10, fontWeight: 500, background: c.bg, color: c.color, borderRadius: 99, padding: '2px 8px', whiteSpace: 'nowrap' }}>
      {priority}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'completed' ? C.teal : status === 'in-progress' ? C.amber : status === 'pending' ? C.amber : '#9ca3af';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>{status.replace('-', ' ')}</span>
    </div>
  );
}

// ─── Notification item ────────────────────────────────────────────────────────
function NotifItem({ n, onCreateWO, onSchedulePM, onGoToPurchaseRequests }: {
  n: any;
  onCreateWO: () => void;
  onSchedulePM: () => void;
  onGoToPurchaseRequests: () => void;
}) {
  const isUnread = !n.read;
  const isCritical = n.type === 'machine_down';
  const isWarning = n.type === 'machine_maintenance' || n.type === 'pm_warning' || n.type === 'inventory_alert';

  let borderColor = 'transparent';
  if (isUnread && isCritical) borderColor = C.red;
  if (isUnread && isWarning) borderColor = C.amber;

  const iconCfg: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
    machine_down: { bg: C.red + '20', color: C.red, icon: <AlertCircle size={13} /> },
    machine_maintenance: { bg: C.amber + '20', color: C.amber, icon: <Clock size={13} /> },
    pm_warning: { bg: C.amber + '20', color: C.amber, icon: <Clock size={13} /> },
    wo_completed: { bg: C.teal + '20', color: C.teal, icon: <CheckCircle2 size={13} /> },
    hours_updated: { bg: C.blue + '20', color: C.blue, icon: <Edit2 size={13} /> },
    wo_created: { bg: C.blue + '20', color: C.blue, icon: <Clipboard size={13} /> },
    inventory_alert: { bg: C.amber + '20', color: C.amber, icon: <AlertTriangle size={13} /> },
  };
  const ic = iconCfg[n.type] || iconCfg.hours_updated;

  return (
    <div style={{
      borderLeft: `2px solid ${borderColor}`,
      paddingLeft: borderColor !== 'transparent' ? 10 : 12,
      paddingTop: 8, paddingBottom: 8, paddingRight: 4,
      borderRadius: 6,
      background: isUnread ? 'var(--color-background-tertiary)' : 'transparent',
      transition: 'background 0.2s',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: ic.bg, color: ic.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {ic.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {n.machineName && <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.machineName}</div>}
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.message}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <Clock size={9} color="var(--color-text-muted)" />
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{relativeTime(n.timestamp)}</span>
          </div>
          {isUnread && isCritical && (
            <button onClick={onCreateWO} style={{ marginTop: 4, fontSize: 10, color: C.red, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}>
              + Create work order
            </button>
          )}
          {isUnread && n.type === 'pm_warning' && (
            <button onClick={onSchedulePM} style={{ marginTop: 4, fontSize: 10, color: C.amber, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}>
              + Schedule PM
            </button>
          )}
          {isUnread && n.type === 'inventory_alert' && (
            <button onClick={onGoToPurchaseRequests} style={{ marginTop: 4, fontSize: 10, color: C.amber, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}>
              + Create purchase request
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

