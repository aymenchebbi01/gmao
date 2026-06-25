import React, { useState, useEffect, useMemo } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  parseISO,
  differenceInDays,
  isValid,
  addWeeks,
  subWeeks,
  addDays,
  subDays
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  AlertTriangle,
  Wrench,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Settings,
  ExternalLink,
  X
} from 'lucide-react';
import { api } from '../services/api';
import { Machine, WorkOrder, UserProfile } from '../types';
import { toast } from 'sonner';
import { useGmaoStore } from '../store/gmaoStore';

// ─── Accent Colors ────────────────────────────────────────────────────────────
const C = {
  blue:  '#185FA5',
  teal:  '#27500A',
  red:   '#791F1F',
  amber: '#633806',
  gray:  '#9ca3af',
  blueBg: '#E6F1FB',
  tealBg: '#EAF3DE',
  redBg: '#FCEBEB',
  amberBg: '#FAEEDA',
  overdueRedBg: '#F7C1C1'
};

interface MaintenanceCalendarProps {
  setActiveTab?: (tab: string) => void;
}

export default function MaintenanceCalendar({ setActiveTab }: MaintenanceCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [interventions, setInterventions] = useState<any[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalFormData, setModalFormData] = useState({
    id: '',
    machineId: '',
    type: 'corrective' as 'corrective' | 'preventive',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    assignedTo: '',
    scheduledAt: '',
    description: '',
    issuerName: '',
    issuerSector: '',
    requesterName: '',
    location: '',
    malfunctionDescription: ''
  });

  // Zustand Store
  const machineHours = useGmaoStore(s => s.machineHours);

  // Estimated average daily hours per machine lookup
  const avgDailyHoursMap = useMemo<Record<string, number>>(() => ({
    'MACH-1782310853331': 24, // test machine / high usage
    'MACH-01': 16,
    'MACH-02': 18
  }), []);

  // Fetch metadata once on mount
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [mList, uList] = await Promise.all([
          api.getMachines(),
          api.getUsers()
        ]);
        setMachines(mList);
        setUsers(uList);
      } catch (err) {
        toast.error('Failed to load calendar metadata.');
      }
    };
    loadMetadata();
  }, []);

  // Calculate active date range based on currentDate and selected view
  const dateRange = useMemo(() => {
    let start: Date;
    let end: Date;
    if (view === 'month') {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      start = startOfWeek(monthStart, { weekStartsOn: 1 });
      end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    } else if (view === 'week') {
      start = startOfWeek(currentDate, { weekStartsOn: 1 });
      end = endOfWeek(currentDate, { weekStartsOn: 1 });
    } else {
      start = currentDate;
      end = currentDate;
    }
    return {
      from: format(start, 'yyyy-MM-dd'),
      to: format(end, 'yyyy-MM-dd'),
      start,
      end
    };
  }, [currentDate, view]);

  // Fetch interventions inside visible range
  const fetchInterventions = async () => {
    setLoading(true);
    try {
      const data = await api.getInterventions(dateRange.from, dateRange.to);
      setInterventions(data);
    } catch {
      toast.error('Failed to load interventions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInterventions();
  }, [dateRange.from, dateRange.to]);

  // Client-side PM events calculation with 300ms debounce on store update
  const [pmEvents, setPmEvents] = useState<any[]>([]);
  useEffect(() => {
    const handler = setTimeout(() => {
      const computed: any[] = [];
      machines.forEach(m => {
        if (!m.nextMaintenanceHours) return;
        const current = machineHours[m.id] ?? m.currentHours ?? 0;
        const remaining = m.nextMaintenanceHours - current;

        if (remaining <= 0) {
          computed.push({
            id: `pm-overdue-${m.id}`,
            type: 'pm_overdue',
            machineId: m.id,
            machineName: m.name,
            scheduledAt: format(new Date(), 'yyyy-MM-dd'),
            status: 'overdue',
            technicianName: 'System',
            title: `PM overdue — ${m.name}`
          });
        } else {
          const avgDaily = avgDailyHoursMap[m.id] || 16;
          const daysRemaining = remaining / avgDaily;
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + daysRemaining);
          computed.push({
            id: `pm-due-${m.id}`,
            type: 'pm_due',
            machineId: m.id,
            machineName: m.name,
            scheduledAt: format(dueDate, 'yyyy-MM-dd'),
            status: 'planned',
            technicianName: 'System',
            title: `PM due — ${m.name}`,
            daysRemaining: Math.round(daysRemaining)
          });
        }
      });
      setPmEvents(computed);
    }, 300);

    return () => clearTimeout(handler);
  }, [machineHours, machines, avgDailyHoursMap]);

  // Merge and normalize all visible events
  const allEvents = useMemo(() => {
    const visiblePm = pmEvents.filter(e => e.scheduledAt >= dateRange.from && e.scheduledAt <= dateRange.to);

    const normalizedInterventions = interventions.map(i => {
      let type: 'corrective' | 'preventive_done' | 'pm_due' | 'pm_overdue' = 'corrective';
      if (i.type === 'preventive') {
        type = i.status === 'completed' ? 'preventive_done' : 'pm_due';
      }
      return {
        id: i.id,
        type,
        machineId: i.machineId,
        machineName: i.machineName,
        technicianId: i.technicianId,
        technicianName: i.technicianName || '—',
        scheduledAt: i.scheduledAt ? i.scheduledAt.substring(0, 10) : '',
        completedAt: i.completedAt,
        status: i.status,
        woId: i.id,
        title: `${type === 'corrective' ? 'Corrective' : 'Preventive'} — ${i.machineName}`
      };
    });

    const normalizedPm = visiblePm.map(p => ({
      id: p.id,
      type: p.type as 'pm_due' | 'pm_overdue',
      machineId: p.machineId,
      machineName: p.machineName,
      technicianId: '',
      technicianName: 'System',
      scheduledAt: p.scheduledAt,
      completedAt: null,
      status: p.status,
      woId: null,
      title: p.title
    }));

    return [...normalizedInterventions, ...normalizedPm];
  }, [interventions, pmEvents, dateRange.from, dateRange.to]);

  // Sidebar — Day details filtering
  const dayDetailEvents = useMemo(() => {
    const dayStr = format(selectedDate, 'yyyy-MM-dd');
    return allEvents.filter(e => e.scheduledAt === dayStr);
  }, [allEvents, selectedDate]);

  // Sidebar — PMs due in the next 7 days
  const upcomingPMsNext7Days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return pmEvents
      .map(e => {
        const d = parseISO(e.scheduledAt);
        const diff = differenceInDays(d, today);
        return { ...e, diff };
      })
      .filter(e => e.diff >= 0 && e.diff <= 7)
      .sort((a, b) => a.diff - b.diff);
  }, [pmEvents]);

  // Bottom Summary Stats
  const summaryStats = useMemo(() => {
    let corrective = 0;
    let preventiveDone = 0;
    let pmOverdue = 0;
    let pmDue = 0;

    allEvents.forEach(e => {
      if (e.type === 'corrective') corrective++;
      else if (e.type === 'preventive_done') preventiveDone++;
      else if (e.type === 'pm_overdue') pmOverdue++;
      else if (e.type === 'pm_due') pmDue++;
    });

    return { corrective, preventiveDone, pmOverdue, pmDue };
  }, [allEvents]);

  // Navigation handlers
  const handlePrev = () => {
    if (view === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const handleNext = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now);
  };

  // Open WO Creation modal
  const openWoModal = (dateToPreFill?: Date) => {
    const d = dateToPreFill || selectedDate;
    const year = new Date().getFullYear();
    const prefix = `WO-${year}-`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    
    setModalFormData({
      id: `${prefix}${rand}`,
      machineId: machines[0]?.id || '',
      type: 'corrective',
      priority: 'medium',
      assignedTo: users[0]?.uid || '',
      scheduledAt: format(d, 'yyyy-MM-dd'),
      description: '',
      issuerName: '',
      issuerSector: '',
      requesterName: '',
      location: '',
      malfunctionDescription: ''
    });
    setIsModalOpen(true);
  };

  const handleCreateWo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedMachine = machines.find(m => m.id === modalFormData.machineId);
      const assignedUser = users.find(u => u.uid === modalFormData.assignedTo);

      await api.createWorkOrder({
        id: modalFormData.id.trim(),
        title: modalFormData.id,
        description: modalFormData.description,
        machineId: modalFormData.machineId,
        machineName: selectedMachine?.name || 'Unknown',
        type: modalFormData.type,
        priority: modalFormData.priority,
        status: 'pending',
        assignedTo: modalFormData.assignedTo,
        assignedName: assignedUser?.displayName || assignedUser?.username || null,
        createdAt: new Date().toISOString(),
        date: modalFormData.scheduledAt,
        issuerName: modalFormData.issuerName,
        issuerSector: modalFormData.issuerSector,
        requesterName: modalFormData.requesterName,
        location: modalFormData.location,
        malfunctionDescription: modalFormData.malfunctionDescription
      } as any);

      toast.success('Work order created successfully');
      setIsModalOpen(false);
      fetchInterventions();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create work order.');
    }
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--color-background-primary)',
    border: '0.5px solid var(--color-border-tertiary)',
    borderRadius: 12,
  };

  // Grid Month calculations
  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  // Hours array for week/day views (07:00 to 19:00)
  const hourSlots = Array.from({ length: 13 }, (_, i) => 7 + i);

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', background: 'var(--color-background-tertiary)', display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      
      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            border: '0.5px solid var(--color-border-tertiary)',
            background: 'var(--color-background-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-secondary)',
          }}>
            <CalendarIcon size={16} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
              {format(currentDate, view === 'day' ? 'MMMM d, yyyy' : 'MMMM yyyy')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Intervention calendar</div>
          </div>
          {/* Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 16 }}>
            <button onClick={handlePrev} style={{ width: 28, height: 28, borderRadius: 8, border: '0.5px solid var(--color-border-tertiary)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              <ChevronLeft size={14} />
            </button>
            <button onClick={handleToday} style={{ fontSize: 11, fontWeight: 500, padding: '5px 12px', borderRadius: 8, border: '0.5px solid var(--color-border-tertiary)', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              Today
            </button>
            <button onClick={handleNext} style={{ width: 28, height: 28, borderRadius: 8, border: '0.5px solid var(--color-border-tertiary)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* View Toggle */}
          <div style={{ display: 'flex', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 20, padding: 2, background: 'var(--color-background-primary)' }}>
            {(['month', 'week', 'day'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  fontSize: 11,
                  fontWeight: view === v ? 500 : 400,
                  padding: '5px 14px',
                  borderRadius: 18,
                  border: 'none',
                  background: view === v ? 'var(--color-background-secondary)' : 'transparent',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {v}
              </button>
            ))}
          </div>

          <button onClick={() => openWoModal()} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#185FA5', fontSize: 12, fontWeight: 500 }}>
            <Plus size={15} /> New WO
          </button>
        </div>
      </div>

      {/* ── Main Layout Grid ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 260px', gap: 12 }} className="max-lg:grid-cols-1">
        
        {/* Left Column: Calendar Body */}
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {loading ? (
            <div style={{ height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <div style={{ width: 28, height: 28, border: '3px solid #185FA5', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Loading calendar...</span>
            </div>
          ) : (
            <>
              {/* MONTH VIEW */}
              {view === 'month' && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* Mon-Sun Headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(h => (
                      <div key={h} style={{ padding: '8px 0', textAlign: 'center', fontSize: 10, fontWeight: 500, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {h}
                      </div>
                    ))}
                  </div>

                  {/* Month Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: 'minmax(90px, auto)' }}>
                    {monthDays.map((day, idx) => {
                      const dayStr = format(day, 'yyyy-MM-dd');
                      const inMonth = format(day, 'yyyy-MM') === format(currentDate, 'yyyy-MM');
                      const isToday = isSameDay(day, new Date());
                      const isSelected = isSameDay(day, selectedDate);
                      const dayEvents = allEvents.filter(e => e.scheduledAt === dayStr);

                      // Cell background priority
                      let cellBg = 'var(--color-background-primary)';
                      if (isSelected) cellBg = '#EAF3DE';
                      else if (isToday) cellBg = '#E6F1FB';

                      // Borders
                      const isLastCol = idx % 7 === 6;
                      const isLastRow = idx >= monthDays.length - 7;

                      return (
                        <div
                          key={dayStr}
                          onClick={() => setSelectedDate(day)}
                          style={{
                            background: cellBg,
                            padding: '8px',
                            minHeight: 90,
                            display: 'flex',
                            flexDirection: 'column',
                            cursor: 'pointer',
                            borderRight: isLastCol ? 'none' : '0.5px solid var(--color-border-tertiary)',
                            borderBottom: isLastRow ? 'none' : '0.5px solid var(--color-border-tertiary)',
                            boxSizing: 'border-box',
                            transition: 'background 0.15s'
                          }}
                        >
                          {/* Date Number Label */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                            {isToday ? (
                              <span style={{
                                width: 22, height: 22, borderRadius: '50%',
                                background: '#185FA5', color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 11, fontWeight: 500
                              }}>
                                {format(day, 'd')}
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: inMonth ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
                                {format(day, 'd')}
                              </span>
                            )}
                          </div>

                          {/* Events Pills */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                            {dayEvents.slice(0, 2).map(e => {
                              let pillBg = C.gray + '20';
                              let pillColor = 'var(--color-text-primary)';
                              if (e.type === 'corrective') { pillBg = C.redBg; pillColor = C.red; }
                              else if (e.type === 'preventive_done') { pillBg = C.tealBg; pillColor = C.teal; }
                              else if (e.type === 'pm_due') { pillBg = C.amberBg; pillColor = C.amber; }
                              else if (e.type === 'pm_overdue') { pillBg = C.overdueRedBg; pillColor = C.red; }

                              return (
                                <div
                                  key={e.id}
                                  title={e.title}
                                  style={{
                                    fontSize: 9, padding: '2px 5px', borderRadius: 3,
                                    fontWeight: 500, background: pillBg, color: pillColor,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    display: 'flex', alignItems: 'center', gap: 3
                                  }}
                                >
                                  {e.type === 'corrective' && <AlertCircle size={9} />}
                                  {e.type === 'preventive_done' && <CheckCircle2 size={9} />}
                                  {e.type === 'pm_due' && <Clock size={9} />}
                                  {e.type === 'pm_overdue' && <AlertTriangle size={9} />}
                                  {e.machineName}
                                </div>
                              );
                            })}
                            {dayEvents.length > 2 && (
                              <div style={{ fontSize: 9, color: 'var(--color-text-muted)', fontWeight: 500, paddingLeft: 4, marginTop: 1 }}>
                                +{dayEvents.length - 2} more
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Legend Bar */}
                  <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', padding: '10px 14px', display: 'flex', gap: 14, flexWrap: 'wrap', background: 'var(--color-background-primary)' }}>
                    {[
                      { label: 'Corrective', color: '#E24B4A' },
                      { label: 'Preventive done', color: '#1D9E75' },
                      { label: 'PM due', color: '#EF9F27' },
                      { label: 'PM overdue', color: '#A32D2D' }
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--color-text-secondary)' }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: item.color }} />
                        {item.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* WEEK VIEW */}
              {view === 'week' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: 600, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', borderBottom: '0.5px solid var(--color-border-tertiary)', flexShrink: 0 }}>
                    {/* Corner Space */}
                    <div style={{ width: 60, borderRight: '0.5px solid var(--color-border-tertiary)' }} />
                    {/* Day Headers */}
                    {eachDayOfInterval({ start: dateRange.start, end: dateRange.end }).map(day => {
                      const isToday = isSameDay(day, new Date());
                      return (
                        <div key={day.toISOString()} style={{ flex: 1, padding: '8px 4px', textAlign: 'center', borderRight: '0.5px solid var(--color-border-tertiary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{format(day, 'E')}</span>
                          <span style={{
                            fontSize: 12, fontWeight: 600, marginTop: 2,
                            width: 24, height: 24, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isToday ? '#185FA5' : 'transparent',
                            color: isToday ? '#fff' : 'var(--color-text-primary)'
                          }}>{format(day, 'd')}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Grid Rows Container */}
                  <div style={{ display: 'flex', position: 'relative', height: hourSlots.length * 52 }}>
                    
                    {/* Time Column labels */}
                    <div style={{ width: 60, display: 'flex', flexDirection: 'column', borderRight: '0.5px solid var(--color-border-tertiary)', flexShrink: 0 }}>
                      {hourSlots.map(h => (
                        <div key={h} style={{ height: 52, paddingRight: 8, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', fontSize: 10, color: 'var(--color-text-muted)', paddingTop: 4 }}>
                          {h.toString().padStart(2, '0')}:00
                        </div>
                      ))}
                    </div>

                    {/* Columns grid */}
                    <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
                      {eachDayOfInterval({ start: dateRange.start, end: dateRange.end }).map((day, dIdx) => {
                        const dayStr = format(day, 'yyyy-MM-dd');
                        const isToday = isSameDay(day, new Date());
                        const dayEvents = allEvents.filter(e => e.scheduledAt === dayStr);

                        return (
                          <div
                            key={day.toISOString()}
                            onClick={() => setSelectedDate(day)}
                            style={{
                              flex: 1,
                              borderRight: dIdx === 6 ? 'none' : '0.5px solid var(--color-border-tertiary)',
                              background: isToday ? '#E6F1FB30' : 'transparent',
                              position: 'relative',
                              height: '100%'
                            }}
                          >
                            {/* Grid Horizontal Rows */}
                            {hourSlots.map(h => (
                              <div key={h} style={{ height: 52, borderBottom: '0.5px solid var(--color-border-tertiary)30' }} />
                            ))}

                            {/* Absolute Event blocks */}
                            {dayEvents.map(e => {
                              // Estimate vertical position
                              let hour = 8;
                              let duration = 1.0;
                              if (e.id && !e.id.startsWith('pm-')) {
                                // Real WO, try to parse its scheduled date time or default
                                const parsed = parseISO(e.scheduledAt);
                                if (isValid(parsed)) {
                                  const hrs = parsed.getHours();
                                  if (hrs >= 7 && hrs <= 19) hour = hrs;
                                }
                              } else {
                                // PM due/overdue placeholder, staggered defaults
                                hour = 9 + (parseInt(e.machineId?.replace(/\D/g, '') || '0') % 4);
                              }

                              const top = (hour - 7) * 52 + 2;
                              const height = duration * 52 - 4;

                              let bg = C.gray + '20';
                              let color = 'var(--color-text-primary)';
                              let accent = C.gray;
                              if (e.type === 'corrective') { bg = C.redBg; color = C.red; accent = '#E24B4A'; }
                              else if (e.type === 'preventive_done') { bg = C.tealBg; color = C.teal; accent = '#1D9E75'; }
                              else if (e.type === 'pm_due') { bg = C.amberBg; color = C.amber; accent = '#EF9F27'; }
                              else if (e.type === 'pm_overdue') { bg = C.overdueRedBg; color = C.red; accent = '#A32D2D'; }

                              return (
                                <div
                                  key={e.id}
                                  onClick={(evt) => {
                                    evt.stopPropagation();
                                    setSelectedDate(day);
                                  }}
                                  style={{
                                    position: 'absolute',
                                    top, height, left: 4, right: 4,
                                    borderRadius: 6, padding: '4px 6px',
                                    background: bg, color: color,
                                    borderLeft: `3px solid ${accent}`,
                                    fontSize: 9, fontWeight: 500,
                                    overflow: 'hidden', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', gap: 2,
                                    boxSizing: 'border-box'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                                    {e.type === 'corrective' && <AlertCircle size={9} />}
                                    {e.type === 'preventive_done' && <CheckCircle2 size={9} />}
                                    {e.type === 'pm_due' && <Clock size={9} />}
                                    {e.type === 'pm_overdue' && <AlertTriangle size={9} />}
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.machineName}</span>
                                  </div>
                                  <div style={{ fontSize: 8, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {e.technicianName}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>

                    {/* Red Current Time Line */}
                    {(() => {
                      const now = new Date();
                      const currentHr = now.getHours();
                      if (currentHr >= 7 && currentHr < 20) {
                        const top = (currentHr - 7) * 52 + (now.getMinutes() / 60) * 52;
                        return (
                          <div style={{
                            position: 'absolute', left: 60, right: 0, top,
                            height: 2, background: '#E24B4A', pointerEvents: 'none', zIndex: 10
                          }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#E24B4A', position: 'absolute', left: -3, top: -2 }} />
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              )}

              {/* DAY VIEW */}
              {view === 'day' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: 600, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', position: 'relative', height: hourSlots.length * 52 }}>
                    
                    {/* Time Column */}
                    <div style={{ width: 60, display: 'flex', flexDirection: 'column', borderRight: '0.5px solid var(--color-border-tertiary)', flexShrink: 0 }}>
                      {hourSlots.map(h => (
                        <div key={h} style={{ height: 52, paddingRight: 8, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', fontSize: 10, color: 'var(--color-text-muted)', paddingTop: 4 }}>
                          {h.toString().padStart(2, '0')}:00
                        </div>
                      ))}
                    </div>

                    {/* Single day column */}
                    <div style={{ display: 'flex', flex: 1, position: 'relative', flexDirection: 'column' }}>
                      {hourSlots.map(h => (
                        <div key={h} style={{ height: 52, borderBottom: '0.5px solid var(--color-border-tertiary)30' }} />
                      ))}

                      {dayDetailEvents.map(e => {
                        let hour = 8;
                        let duration = 1.0;
                        if (e.id && !e.id.startsWith('pm-')) {
                          const parsed = parseISO(e.scheduledAt);
                          if (isValid(parsed)) {
                            const hrs = parsed.getHours();
                            if (hrs >= 7 && hrs <= 19) hour = hrs;
                          }
                        } else {
                          hour = 9 + (parseInt(e.machineId?.replace(/\D/g, '') || '0') % 4);
                        }

                        const top = (hour - 7) * 52 + 2;
                        const height = duration * 52 - 4;

                        let bg = C.gray + '20';
                        let color = 'var(--color-text-primary)';
                        let accent = C.gray;
                        if (e.type === 'corrective') { bg = C.redBg; color = C.red; accent = '#E24B4A'; }
                        else if (e.type === 'preventive_done') { bg = C.tealBg; color = C.teal; accent = '#1D9E75'; }
                        else if (e.type === 'pm_due') { bg = C.amberBg; color = C.amber; accent = '#EF9F27'; }
                        else if (e.type === 'pm_overdue') { bg = C.overdueRedBg; color = C.red; accent = '#A32D2D'; }

                        return (
                          <div
                            key={e.id}
                            onClick={() => {
                              if (e.woId && setActiveTab) {
                                setActiveTab('work-orders-list');
                              }
                            }}
                            style={{
                              position: 'absolute',
                              top, height, left: 10, right: 10,
                              borderRadius: 8, padding: '8px 12px',
                              background: bg, color: color,
                              borderLeft: `4px solid ${accent}`,
                              fontSize: 10, fontWeight: 500,
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              boxSizing: 'border-box'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {e.type === 'corrective' && <AlertCircle size={12} />}
                              {e.type === 'preventive_done' && <CheckCircle2 size={12} />}
                              {e.type === 'pm_due' && <Clock size={12} />}
                              {e.type === 'pm_overdue' && <AlertTriangle size={12} />}
                              <div>
                                <strong style={{ fontSize: 11 }}>{e.woId ? e.woId : 'PM Threshold'}</strong>
                                <span style={{ marginLeft: 8, color: 'var(--color-text-secondary)' }}>{e.machineName}</span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Tech: {e.technicianName}</span>
                              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#ffffff80', border: '0.5px solid var(--color-border-tertiary)' }}>{e.type.replace('_', ' ')}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Column: Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          
          {/* Day Detail Panel */}
          <div style={{ ...cardStyle, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '0.5px solid var(--color-border-tertiary)', paddingBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CalendarIcon size={14} color="var(--color-text-secondary)" />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                  {format(selectedDate, 'MMM d, yyyy')}
                </span>
              </div>
              <button onClick={() => openWoModal()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#185FA5', fontSize: 10, fontWeight: 500 }}>
                + Add WO
              </button>
            </div>

            {dayDetailEvents.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <CalendarIcon size={24} color="var(--color-text-tertiary)" />
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Select a day to see interventions</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                {dayDetailEvents.map(e => {
                  let accent = C.gray;
                  if (e.type === 'corrective') accent = '#E24B4A';
                  else if (e.type === 'preventive_done') accent = '#1D9E75';
                  else if (e.type === 'pm_due' || e.type === 'pm_overdue') accent = '#EF9F27';

                  return (
                    <div
                      key={e.id}
                      style={{
                        padding: '6px 8px', borderRadius: 6, background: 'var(--color-background-secondary)',
                        borderLeft: `3px solid ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.machineName}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Settings size={9} /> {e.technicianName}
                        </div>
                      </div>
                      {e.woId && setActiveTab && (
                        <button
                          onClick={() => setActiveTab('work-orders-list')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 2 }}
                        >
                          <ExternalLink size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 7-day Upcoming PMs Warning Box */}
            {upcomingPMsNext7Days.length > 0 && (
              <div style={{ background: '#FAEEDA', border: '0.5px solid #FAC775', borderRadius: 8, padding: 8, marginTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: '#633806', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={11} /> Upcoming PM — next 7 days
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {upcomingPMsNext7Days.slice(0, 3).map(up => (
                    <div key={up.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#633806' }}>
                      <span style={{ fontWeight: 500 }}>{up.machineName}</span>
                      <span>{up.scheduledAt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* PM Hours Remaining */}
          <div style={{ ...cardStyle, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>PM hours remaining</span>
              <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--color-background-secondary)', padding: '2px 6px', borderRadius: 8 }}>
                {machines.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 180, overflowY: 'auto' }}>
              {machines.filter(m => m.nextMaintenanceHours).map(m => {
                const current = machineHours[m.id] ?? m.currentHours ?? 0;
                const remaining = (m.nextMaintenanceHours || 0) - current;
                const isOverdue = remaining <= 0;
                const isWarning = !isOverdue && remaining <= 50;

                const barColor = isOverdue ? '#E24B4A' : isWarning ? '#EF9F27' : '#1D9E75';
                const pct = isOverdue ? 100 : Math.max(0, Math.min(100, (current / (m.nextMaintenanceHours || 1)) * 100));

                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                        {(isOverdue || isWarning) && <AlertTriangle size={10} color={isOverdue ? '#E24B4A' : '#EF9F27'} />}
                        <span style={{ fontSize: 10, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.name}
                        </span>
                      </div>
                      <span style={{
                        fontSize: 9, fontWeight: 600,
                        color: isOverdue ? '#E24B4A' : isWarning ? '#EF9F27' : 'var(--color-text-muted)'
                      }}>
                        {isOverdue ? 'Overdue' : `${Math.round(remaining)}h left`}
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div style={{ height: 4, borderRadius: 4, background: 'var(--color-border-tertiary)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Month Summary */}
          <div style={{ ...cardStyle, padding: '16px' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 10 }}>Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              
              <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 8, color: 'var(--color-text-muted)' }}>Corrective</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#A32D2D', marginTop: 2 }}>{summaryStats.corrective}</div>
              </div>

              <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 8, color: 'var(--color-text-muted)' }}>Preventive done</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#0F6E56', marginTop: 2 }}>{summaryStats.preventiveDone}</div>
              </div>

              <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 8, color: 'var(--color-text-muted)' }}>PM overdue</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#854F0B', marginTop: 2 }}>{summaryStats.pmOverdue}</div>
              </div>

              <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 8, color: 'var(--color-text-muted)' }}>Upcoming PMs</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#185FA5', marginTop: 2 }}>{summaryStats.pmDue}</div>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* ── New Work Order Modal ───────────────────────────────────────────── */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 16
        }}>
          <div style={{
            background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 12, width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column',
            maxHeight: '90vh', overflow: 'hidden', boxSizing: 'border-box'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>New work order</span>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                <X size={15} />
              </button>
            </div>

            {/* Scrollable Form */}
            <form onSubmit={handleCreateWo} style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flex: 1 }}>
              
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Order ID</label>
                  <input
                    type="text"
                    required
                    value={modalFormData.id}
                    onChange={e => setModalFormData(prev => ({ ...prev, id: e.target.value }))}
                    style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Scheduled date</label>
                  <input
                    type="date"
                    required
                    value={modalFormData.scheduledAt}
                    onChange={e => setModalFormData(prev => ({ ...prev, scheduledAt: e.target.value }))}
                    style={{ padding: '5px 10px', fontSize: 11, borderRadius: 6, border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Machine</label>
                  <select
                    required
                    value={modalFormData.machineId}
                    onChange={e => setModalFormData(prev => ({ ...prev, machineId: e.target.value }))}
                    style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  >
                    {machines.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Type</label>
                  <select
                    required
                    value={modalFormData.type}
                    onChange={e => setModalFormData(prev => ({ ...prev, type: e.target.value as any }))}
                    style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  >
                    <option value="corrective">Corrective</option>
                    <option value="preventive">Preventive</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Priority</label>
                  <select
                    required
                    value={modalFormData.priority}
                    onChange={e => setModalFormData(prev => ({ ...prev, priority: e.target.value as any }))}
                    style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Assigned Technician</label>
                  <select
                    required
                    value={modalFormData.assignedTo}
                    onChange={e => setModalFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
                    style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  >
                    {users.map(u => (
                      <option key={u.uid} value={u.uid}>{u.displayName || u.username}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Description</label>
                <textarea
                  rows={2}
                  value={modalFormData.description}
                  onChange={e => setModalFormData(prev => ({ ...prev, description: e.target.value }))}
                  style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)30', margin: '6px 0' }} />

              {/* Initial intervention info fields */}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Issuer Name</label>
                  <input
                    type="text"
                    value={modalFormData.issuerName}
                    onChange={e => setModalFormData(prev => ({ ...prev, issuerName: e.target.value }))}
                    style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Issuer Sector</label>
                  <input
                    type="text"
                    value={modalFormData.issuerSector}
                    onChange={e => setModalFormData(prev => ({ ...prev, issuerSector: e.target.value }))}
                    style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Requester Name</label>
                  <input
                    type="text"
                    value={modalFormData.requesterName}
                    onChange={e => setModalFormData(prev => ({ ...prev, requesterName: e.target.value }))}
                    style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Location</label>
                  <input
                    type="text"
                    value={modalFormData.location}
                    onChange={e => setModalFormData(prev => ({ ...prev, location: e.target.value }))}
                    style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Malfunction Description</label>
                <textarea
                  rows={2}
                  value={modalFormData.malfunctionDescription}
                  onChange={e => setModalFormData(prev => ({ ...prev, malfunctionDescription: e.target.value }))}
                  style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontFamily: 'inherit' }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '6px 14px', borderRadius: 8, border: '0.5px solid var(--color-border-tertiary)',
                    background: 'transparent', fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '6px 14px', borderRadius: 8, border: 'none',
                    background: '#185FA5', fontSize: 11, fontWeight: 500, color: '#fff', cursor: 'pointer'
                  }}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
