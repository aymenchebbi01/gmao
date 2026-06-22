import React, { useState, useEffect, useMemo } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  addDays,
  subDays,
  startOfWeek,
  endOfWeek,
  parseISO,
  isWithinInterval,
  isBefore,
  isAfter,
  isValid,
  differenceInDays
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  Bell,
  TrendingUp,
  Plus,
  Search,
  Filter,
  Download,
  Trash2,
  Edit3,
  X,
  Check,
  Wrench,
  ClipboardCheck,
  PowerOff,
  FileText,
  MapPin,
  User,
  SlidersHorizontal,
  Info
} from 'lucide-react';
import { api } from '../services/api';
import { formatHoursToDays } from '../lib/utils';
import { Machine, WorkOrder, MachineRendement, CalendarEvent } from '../types';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Overdue helper
const isEventOverdue = (evt: any) => {
  if (!evt) return false;
  if (evt.status === 'done' || evt.status === 'completed') return false;
  if (evt.status === 'overdue') return true;
  if (evt.startDate) {
    const start = new Date(evt.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    return start < today;
  }
  return false;
};

// Event UI coloring helper
const getEventColorClasses = (type: string, status: string, isOverdue: boolean, isPrediction?: boolean) => {
  // 1. Completed Interventions -> Color: GREY
  if (status === 'done' || status === 'completed') {
    return 'bg-gray-100 text-gray-800 border-gray-300 shadow-sm';
  }

  // 2. Overdue intervals -> Color: RED (pulsing)
  if (isOverdue || status === 'overdue') {
    return 'bg-red-100 text-red-850 border-red-300 shadow-[0_0_8px_rgba(239,68,68,0.45)] animate-pulse';
  }

  // 3. AI predictions (purple / dashed)
  if (isPrediction) {
    return 'bg-purple-50 text-purple-700 border-purple-200 border-dashed';
  }

  switch (type) {
    case 'preventive':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200'; // GREEN
    case 'corrective':
      return 'bg-red-50 text-red-800 border-red-200'; // RED
    case 'inspection':
      return 'bg-blue-50 text-blue-800 border-blue-200'; // BLUE
    case 'downtime':
      return 'bg-gray-650/10 text-gray-800 border-gray-400'; // DARK GREY
    default:
      return 'bg-blue-50 text-blue-800 border-blue-200';
  }
};

const getEventColorBadgeClasses = (type: string, status?: string) => {
  if (status === 'done' || status === 'completed') {
    return 'bg-gray-500 text-white';
  }
  switch (type) {
    case 'preventive':
      return 'bg-emerald-500 text-white';
    case 'corrective':
      return 'bg-red-500 text-white';
    case 'inspection':
      return 'bg-blue-500 text-white';
    case 'downtime':
      return 'bg-gray-700 text-white';
    default:
      return 'bg-blue-500 text-white';
  }
};

const getEventIcon = (type: string, size = 12) => {
  switch (type) {
    case 'preventive':
      return <Wrench size={size} />;
    case 'corrective':
      return <AlertTriangle size={size} />;
    case 'inspection':
      return <ClipboardCheck size={size} />;
    case 'downtime':
      return <PowerOff size={size} />;
    default:
      return <Wrench size={size} />;
  }
};

export default function MaintenanceCalendar() {
  // Navigation & View States
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<'month' | 'week' | 'day' | 'timeline'>('month');
  
  // Data States
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [rendements, setRendements] = useState<MachineRendement[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedEquipment, setSelectedEquipment] = useState<string>('all');
  const [technicianSearch, setTechnicianSearch] = useState<string>('');
  const [showFilters, setShowFilters] = useState<boolean>(true);
  const [alertThresholdDays, setAlertThresholdDays] = useState<number>(15);

  // Drag & Drop feedback
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'create' | 'edit'>('view');
  const [selectedEvent, setSelectedEvent] = useState<Partial<CalendarEvent> | null>(null);

  // Form Fields State (Modal)
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<'preventive' | 'corrective' | 'inspection' | 'downtime'>('preventive');
  const [formEquipmentId, setFormEquipmentId] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formTechnicians, setFormTechnicians] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formEstimatedDuration, setFormEstimatedDuration] = useState(60);
  const [formPriority, setFormPriority] = useState<'critical' | 'high' | 'medium' | 'low'>('medium');
  const [formStatus, setFormStatus] = useState<'planned' | 'in-progress' | 'done' | 'overdue'>('planned');
  const [formWorkOrderNumber, setFormWorkOrderNumber] = useState('');
  const [formRecurrence, setFormRecurrence] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually'>('none');
  const [formNotes, setFormNotes] = useState('');

  // PM Reset Form Fields State (Modal)
  const [formCompletionDate, setFormCompletionDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [pmResetInterval, setPmResetInterval] = useState<'weekly' | 'monthly' | 'quarterly' | 'biannually' | 'annually'>('monthly');

  // Fetch all calendar records
  const fetchData = async () => {
    setLoading(true);
    try {
      const [eventsList, mList, wList, rList] = await Promise.all([
        api.getCalendarEvents(),
        api.getMachines(),
        api.getWorkOrders(),
        api.getRendement()
      ]);
      setCalendarEvents(eventsList);
      setMachines(mList);
      setWorkOrders(wList);
      setRendements(rList);
    } catch (error) {
      console.error('Error fetching calendar data:', error);
      toast.error('Failed to load maintenance calendar data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Overdue count calculated dynamically from machine list
  const overdueMachinesCount = useMemo(() => {
    const todayZero = new Date();
    todayZero.setHours(0, 0, 0, 0);
    return machines.filter(m => {
      if (!m.nextMaintenance) return false;
      const nextDate = new Date(m.nextMaintenance);
      nextDate.setHours(0, 0, 0, 0);
      return nextDate < todayZero;
    }).length;
  }, [machines]);

  // Upcoming maintenance checklist in next 7 days
  const upcomingMaintenance = useMemo(() => {
    const todayVal = new Date();
    const nextWeekVal = addDays(todayVal, 7);
    return machines.filter(m => {
      let dateUpcoming = false;
      if (m.nextMaintenance && m.nextMaintenance.trim() !== '') {
        try {
          const mDate = parseISO(m.nextMaintenance);
          if (!isNaN(mDate.getTime())) {
            dateUpcoming = isBefore(mDate, nextWeekVal) && !isBefore(mDate, todayVal);
          }
        } catch (e) {}
      }

      let hourUpcoming = false;
      if (m.nextMaintenanceHours && m.currentHours) {
        const remainingHours = m.nextMaintenanceHours - m.currentHours;
        hourUpcoming = remainingHours <= 50 && remainingHours > 0;
      }

      return dateUpcoming || hourUpcoming;
    });
  }, [machines]);

  // AI predictions based on throughput / rendement
  const predictions = useMemo(() => {
    const map = new Map<string, { date: Date; avgHours: number }>();
    const totalHoursMap = new Map<string, number>();
    const dayCountsMap = new Map<string, number>();

    rendements.forEach(r => {
      const siteNum = String(r.machineNumber || '').trim();
      if (!siteNum) return;

      const target = r.targetQty || 1;
      const totalQty = (r.qtyShift1 || 0) + (r.qtyShift2 || 0) + (r.qtyShift3 || 0);
      const dailyHours = 24 * (totalQty / (target * 3));
      
      totalHoursMap.set(siteNum, (totalHoursMap.get(siteNum) || 0) + dailyHours);
      dayCountsMap.set(siteNum, (dayCountsMap.get(siteNum) || 0) + 1);
    });

    machines.forEach(m => {
      const siteNum = String(m.siteNumber || '').trim();
      const count = dayCountsMap.get(siteNum) || 0;
      const total = totalHoursMap.get(siteNum) || 0;
      
      const avgHours = count > 0 ? (total / count) : 8;
      const safeAvgHours = Math.max(avgHours, 0.5); 

      if (m.nextMaintenanceHours && m.currentHours) {
        const remainingHours = m.nextMaintenanceHours - m.currentHours;
        if (remainingHours > 0) {
          const daysRemaining = Math.ceil(remainingHours / safeAvgHours);
          if (daysRemaining < 730) {
            const predictedDate = addDays(new Date(), daysRemaining);
            map.set(m.id, { date: predictedDate, avgHours: safeAvgHours });
          }
        }
      }
    });

    return map;
  }, [rendements, machines]);

  // --- Dynamic overlays ---
  // Interventions Log: displays completed & ongoing work orders
  const workOrderEvents = useMemo(() => {
    return workOrders.map(wo => {
      const woDate = wo.date || (wo.createdAt ? wo.createdAt.split('T')[0] : '');
      const machineObj = machines.find(m => m.id === wo.machineId);

      const lastMaintenanceDate = machineObj ? (machineObj.lastMaintenance || 'Never') : 'N/A';
      const nextDueDate = machineObj ? (machineObj.nextMaintenance || 'N/A') : 'N/A';
      let daysDiff = 0;
      if (machineObj && machineObj.nextMaintenance) {
        const nextDate = new Date(machineObj.nextMaintenance);
        const todayZero = new Date();
        todayZero.setHours(0, 0, 0, 0);
        nextDate.setHours(0, 0, 0, 0);
        daysDiff = differenceInDays(nextDate, todayZero);
      }

      const status = wo.status === 'completed' ? 'done' : (wo.status === 'in-progress' ? 'in-progress' : 'planned');

      return {
        id: `wo-${wo.id}`,
        title: `WO: ${wo.title}`,
        eventType: wo.type === 'corrective' ? 'corrective' : 'preventive',
        equipmentId: wo.machineId,
        equipmentName: wo.machineName || '',
        location: wo.location || '',
        technicians: wo.technicians || '',
        priority: wo.priority,
        status: status,
        startDate: woDate,
        endDate: woDate,
        isReadOnly: true,
        workOrderNumber: wo.id,
        notes: wo.description || '',
        source: 'from intervention log',
        lastMaintenanceDate,
        nextDueDate,
        daysRemainingOrOverdue: daysDiff,
        estimatedDuration: 60
      };
    });
  }, [workOrders, machines]);

  // Machine nextMaintenance schedule mapping
  const machineMaintenanceEvents = useMemo(() => {
    const events: any[] = [];
    const todayZero = new Date();
    todayZero.setHours(0, 0, 0, 0);

    machines.forEach(m => {
      if (m.nextMaintenance && m.nextMaintenance.trim() !== '') {
        const nextDate = new Date(m.nextMaintenance);
        nextDate.setHours(0, 0, 0, 0);
        const daysDiff = differenceInDays(nextDate, todayZero);
        const cleanDate = m.nextMaintenance.split('T')[0];

        let title = `PM - ${m.name}`;
        let status: 'planned' | 'overdue' = 'planned';
        let badge = '';

        if (daysDiff < 0) {
          status = 'overdue';
          badge = 'OVERDUE';
          title = `PM - ${m.name} - OVERDUE`;
        } else if (daysDiff <= alertThresholdDays) {
          badge = `Due in ${daysDiff} days`;
          title = `PM - ${m.name} - PM Due Soon (${badge})`;
        } else {
          badge = `Due in ${daysDiff} days`;
          title = `PM - ${m.name} - Scheduled`;
        }

        events.push({
          id: `maint-${m.id}`,
          title: title,
          eventType: 'preventive',
          equipmentId: m.id,
          equipmentName: m.name,
          location: m.location || '',
          priority: daysDiff < 0 ? 'critical' : (daysDiff <= 7 ? 'high' : 'medium'),
          status: status,
          startDate: cleanDate,
          endDate: cleanDate,
          isReadOnly: true,
          badge: badge,
          lastMaintenanceDate: m.lastMaintenance || 'Never',
          nextDueDate: cleanDate,
          daysRemainingOrOverdue: daysDiff,
          source: 'auto-predicted',
          notes: `Auto-generated PM schedule. Last maintenance was completed on ${m.lastMaintenance || 'Never'}.`
        });
      }
    });
    return events;
  }, [machines, alertThresholdDays]);

  // Machine predictive nextMaintenance schedule mapping
  const machinePredictionEvents = useMemo(() => {
    const events: any[] = [];
    machines.forEach(m => {
      const pred = predictions.get(m.id);
      if (pred && pred.date) {
        const predDateStr = format(pred.date, 'yyyy-MM-dd');
        events.push({
          id: `pred-${m.id}`,
          title: `Pred PM: ${m.name}`,
          eventType: 'inspection',
          equipmentId: m.id,
          equipmentName: m.name,
          location: m.location || '',
          priority: 'low',
          status: 'planned',
          startDate: predDateStr,
          endDate: predDateStr,
          isReadOnly: true,
          isPrediction: true,
          notes: `AI Predictive Maintenance schedule. Calculated using shift logs (${pred.avgHours.toFixed(1)} hrs/day).`,
          source: 'auto-predicted',
          lastMaintenanceDate: m.lastMaintenance || 'Never',
          nextDueDate: predDateStr,
          daysRemainingOrOverdue: differenceInDays(pred.date, new Date())
        });
      }
    });
    return events;
  }, [machines, predictions]);

  // Expand recurrence occurrences within the visible range (approx. sub 3 months to add 6 months for safety)
  const expandedCalendarEvents = useMemo(() => {
    const startRange = subMonths(currentDate, 3);
    const endRange = addMonths(currentDate, 6);
    const expandedList: any[] = [];

    calendarEvents.forEach(evt => {
      expandedList.push(evt);

      if (!evt.recurrence || evt.recurrence === 'none') return;

      const baseStart = new Date(evt.startDate);
      const baseEnd = new Date(evt.endDate);
      if (isNaN(baseStart.getTime()) || isNaN(baseEnd.getTime())) return;
      const durationMs = baseEnd.getTime() - baseStart.getTime();

      let current = new Date(baseStart);
      let safetyCount = 0;

      while (safetyCount < 100) {
        safetyCount++;
        if (evt.recurrence === 'daily') {
          current = addDays(current, 1);
        } else if (evt.recurrence === 'weekly') {
          current = addDays(current, 7);
        } else if (evt.recurrence === 'monthly') {
          current = addMonths(current, 1);
        } else if (evt.recurrence === 'quarterly') {
          current = addMonths(current, 3);
        } else if (evt.recurrence === 'annually') {
          current = addMonths(current, 12);
        } else {
          break;
        }

        if (current > endRange) break;

        const occurrenceStart = format(current, 'yyyy-MM-dd');
        const occurrenceEnd = format(new Date(current.getTime() + durationMs), 'yyyy-MM-dd');

        expandedList.push({
          ...evt,
          id: `${evt.id}-occurrence-${occurrenceStart}`,
          startDate: occurrenceStart,
          endDate: occurrenceEnd,
          isRecurringInstance: true,
          originalEventId: evt.id
        });
      }
    });

    return expandedList;
  }, [calendarEvents, currentDate]);

  // Combine and Apply Filters
  const filteredAllEvents = useMemo(() => {
    const mappedCalendarEvents = expandedCalendarEvents.map(evt => {
      const machineObj = machines.find(m => m.id === evt.equipmentId);
      
      let lastMaintenanceDate = 'N/A';
      let nextDueDate = 'N/A';
      let daysDiff = 0;
      if (machineObj) {
        lastMaintenanceDate = machineObj.lastMaintenance || 'Never';
        nextDueDate = machineObj.nextMaintenance || 'N/A';
        if (machineObj.nextMaintenance) {
          const nextDate = new Date(machineObj.nextMaintenance);
          const todayZero = new Date();
          todayZero.setHours(0, 0, 0, 0);
          nextDate.setHours(0, 0, 0, 0);
          daysDiff = differenceInDays(nextDate, todayZero);
        }
      }

      return {
        ...evt,
        source: evt.source || 'manually scheduled',
        lastMaintenanceDate,
        nextDueDate,
        daysRemainingOrOverdue: daysDiff
      };
    });

    const combined = [
      ...mappedCalendarEvents,
      ...workOrderEvents,
      ...machineMaintenanceEvents,
      ...machinePredictionEvents
    ];

    return combined.filter(evt => {
      // Type Filter
      if (selectedType !== 'all' && evt.eventType !== selectedType) return false;
      
      // Priority Filter
      if (selectedPriority !== 'all' && evt.priority !== selectedPriority) return false;
      
      // Status Filter
      if (selectedStatus !== 'all') {
        const isOverdue = isEventOverdue(evt);
        if (selectedStatus === 'overdue' && !isOverdue) return false;
        if (selectedStatus !== 'overdue' && evt.status !== selectedStatus) return false;
      }
      
      // Equipment Filter
      if (selectedEquipment !== 'all' && evt.equipmentId !== selectedEquipment) return false;
      
      // Technician Search Filter
      if (technicianSearch.trim() !== '') {
        const search = technicianSearch.toLowerCase();
        if (!evt.technicians || !evt.technicians.toLowerCase().includes(search)) return false;
      }

      return true;
    });
  }, [
    expandedCalendarEvents,
    workOrderEvents,
    machineMaintenanceEvents,
    machinePredictionEvents,
    selectedType,
    selectedPriority,
    selectedStatus,
    selectedEquipment,
    technicianSearch,
    machines
  ]);

  // HTML5 Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, eventObj: any) => {
    if (eventObj.isReadOnly) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', eventObj.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetDayStr: string) => {
    e.preventDefault();
    setDragOverDay(null);
    const eventId = e.dataTransfer.getData('text/plain');
    if (!eventId) return;

    // Find the original editable event
    const originalEvent = calendarEvents.find(evt => evt.id === eventId);
    if (!originalEvent) {
      toast.error('Cannot reschedule auto-generated overlays or read-only logs.');
      return;
    }

    try {
      const originalStart = new Date(originalEvent.startDate);
      const originalEnd = new Date(originalEvent.endDate);
      const durationDays = differenceInDays(originalEnd, originalStart);

      const newStart = new Date(targetDayStr);
      const newEnd = addDays(newStart, durationDays);

      const newStartDateStr = format(newStart, 'yyyy-MM-dd');
      const newEndDateStr = format(newEnd, 'yyyy-MM-dd');

      // Optimistic update
      setCalendarEvents(prev =>
        prev.map(evt =>
          evt.id === eventId
            ? { ...evt, startDate: newStartDateStr, endDate: newEndDateStr }
            : evt
        )
      );

      await api.updateCalendarEvent(eventId, {
        startDate: newStartDateStr,
        endDate: newEndDateStr
      });
      
      toast.success(`Rescheduled event "${originalEvent.title}" to ${newStartDateStr}`);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update scheduled dates.');
      fetchData(); // Rollback
    }
  };

  // Export handlers
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('GMAO Maintenance Calendar Export', 14, 20);
      doc.setFontSize(10);
      doc.text(`Generated on: ${format(new Date(), 'yyyy-MM-dd HH:mm')} | Filters: Type=${selectedType}, Priority=${selectedPriority}`, 14, 26);
      
      const columns = ["Title", "Type", "Asset Name", "Start Date", "End Date", "Priority", "Status", "Technicians", "Source"];
      const rows = filteredAllEvents.map(evt => [
        evt.title,
        evt.eventType.toUpperCase(),
        evt.equipmentName || 'N/A',
        evt.startDate,
        evt.endDate,
        evt.priority?.toUpperCase() || 'MEDIUM',
        evt.status?.toUpperCase() || 'PLANNED',
        evt.technicians || 'Unassigned',
        evt.source || 'manually scheduled'
      ]);

      autoTable(doc, {
        head: [columns],
        body: rows,
        startY: 32,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 8 }
      });

      doc.save(`gmao-maintenance-calendar-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('Successfully downloaded PDF.');
    } catch (e) {
      console.error(e);
      toast.error('Failed to compile PDF document.');
    }
  };

  const handleExportExcel = () => {
    try {
      const exportRows = filteredAllEvents.map(evt => ({
        Title: evt.title,
        Type: evt.eventType.toUpperCase(),
        'Asset Name': evt.equipmentName || '',
        'Equipment ID': evt.equipmentId || '',
        Location: evt.location || '',
        'Start Date': evt.startDate,
        'End Date': evt.endDate,
        'Duration (Minutes)': evt.estimatedDuration || 60,
        Priority: evt.priority?.toUpperCase() || 'MEDIUM',
        Status: evt.status?.toUpperCase() || 'PLANNED',
        'Linked Work Order': evt.workOrderNumber || '',
        'Assigned Techs': evt.technicians || '',
        Source: evt.source || 'manually scheduled',
        'Last Maintenance': evt.lastMaintenanceDate || 'Never',
        'Next Due Date': evt.nextDueDate || 'N/A',
        'Days Remaining / Overdue': evt.daysRemainingOrOverdue ?? '',
        Notes: evt.notes || ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Maintenance Log');
      XLSX.writeFile(workbook, `gmao-maintenance-calendar-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success('Successfully downloaded Excel sheet.');
    } catch (e) {
      console.error(e);
      toast.error('Failed to compile Excel spreadsheet.');
    }
  };

  // Navigation callbacks
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextWeekNav = () => setCurrentDate(addDays(currentDate, 7));
  const prevWeekNav = () => setCurrentDate(subDays(currentDate, 7));
  const nextDayNav = () => setCurrentDate(addDays(currentDate, 1));
  const prevDayNav = () => setCurrentDate(subDays(currentDate, 1));

  const navigateToToday = () => setCurrentDate(new Date());

  // Modal Open Handlers
  const handleOpenCreateModal = (initialDateStr?: string) => {
    const start = initialDateStr || format(new Date(), 'yyyy-MM-dd');
    setSelectedEvent(null);
    setFormTitle('');
    setFormType('preventive');
    setFormEquipmentId('');
    setFormLocation('');
    setFormTechnicians('');
    setFormStartDate(start);
    setFormEndDate(start);
    setFormEstimatedDuration(60);
    setFormPriority('medium');
    setFormStatus('planned');
    setFormWorkOrderNumber('');
    setFormRecurrence('none');
    setFormNotes('');
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleOpenViewModal = (evt: any) => {
    const rawId = evt.originalEventId || evt.id;
    const isOverlay = String(evt.id).startsWith('wo-') || String(evt.id).startsWith('maint-') || String(evt.id).startsWith('pred-');
    
    let dbEvent = calendarEvents.find(e => e.id === rawId);
    if (!dbEvent && isOverlay) {
      dbEvent = evt;
    }

    if (!dbEvent) {
      toast.error('Could not load event details.');
      return;
    }

    setSelectedEvent(dbEvent);
    setFormTitle(dbEvent.title || '');
    setFormType(dbEvent.eventType || 'preventive');
    setFormEquipmentId(dbEvent.equipmentId || '');
    setFormLocation(dbEvent.location || '');
    setFormTechnicians(dbEvent.technicians || '');
    setFormStartDate(dbEvent.startDate || '');
    setFormEndDate(dbEvent.endDate || '');
    setFormEstimatedDuration(dbEvent.estimatedDuration || 60);
    setFormPriority(dbEvent.priority || 'medium');
    setFormStatus(dbEvent.status || 'planned');
    setFormWorkOrderNumber(dbEvent.workOrderNumber || '');
    setFormRecurrence(dbEvent.recurrence || 'none');
    setFormNotes(dbEvent.notes || '');

    // Reset PM Reset Inputs
    setFormCompletionDate(format(new Date(), 'yyyy-MM-dd'));
    setPmResetInterval('monthly');

    setModalMode('view');
    setIsModalOpen(true);
  };

  const handleEditClick = () => {
    setModalMode('edit');
  };

  // Submit / Delete Event handlers
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      toast.error('Please enter an event title.');
      return;
    }
    if (!formStartDate || !formEndDate) {
      toast.error('Please enter start and end dates.');
      return;
    }

    const machineObj = machines.find(m => m.id === formEquipmentId);
    const equipmentName = machineObj ? machineObj.name : '';

    const payload: Partial<CalendarEvent> = {
      title: formTitle,
      eventType: formType,
      equipmentId: formEquipmentId || null,
      equipmentName,
      location: formLocation,
      technicians: formTechnicians,
      startDate: formStartDate,
      endDate: formEndDate,
      estimatedDuration: Number(formEstimatedDuration),
      priority: formPriority,
      status: formStatus,
      workOrderNumber: formWorkOrderNumber,
      recurrence: formRecurrence,
      notes: formNotes
    };

    try {
      if (modalMode === 'create') {
        await api.createCalendarEvent(payload);
        toast.success(`Event "${formTitle}" created successfully!`);
      } else if (modalMode === 'edit' && selectedEvent?.id) {
        await api.updateCalendarEvent(selectedEvent.id, payload);
        toast.success(`Event "${formTitle}" updated successfully!`);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save calendar event.');
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent?.id) return;
    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
      await api.deleteCalendarEvent(selectedEvent.id);
      toast.success('Event deleted successfully.');
      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete calendar event.');
    }
  };

  // Confirm PM completion helper & scheduler reset
  const handleConfirmPM = async () => {
    if (!selectedEvent?.equipmentId) return;
    try {
      const machineId = selectedEvent.equipmentId;
      const completionDateStr = formCompletionDate;
      const compDateObj = new Date(completionDateStr);
      let nextDateObj;

      switch (pmResetInterval) {
        case 'weekly':
          nextDateObj = addDays(compDateObj, 7);
          break;
        case 'monthly':
          nextDateObj = addMonths(compDateObj, 1);
          break;
        case 'quarterly':
          nextDateObj = addMonths(compDateObj, 3);
          break;
        case 'biannually':
          nextDateObj = addMonths(compDateObj, 6);
          break;
        case 'annually':
          nextDateObj = addMonths(compDateObj, 12);
          break;
        default:
          nextDateObj = addMonths(compDateObj, 1);
      }

      const nextDateStr = format(nextDateObj, 'yyyy-MM-dd');

      // Update Database
      await api.updateMachine(machineId, {
        lastMaintenance: completionDateStr,
        nextMaintenance: nextDateStr
      });

      // Audit logs
      await api.logMachineAction(
        'CHANGE_STATUS',
        machineId,
        `PM intervention confirmed as done. Last maintenance date: ${completionDateStr}. Next schedule offset reset to: ${nextDateStr}.`
      );

      toast.success(`Machine PM log verified! Next schedule is updated to ${nextDateStr}`);
      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update machine scheduling dates.');
    }
  };

  // ---------------------------------------------------------------------------
  // ─── RENDERING SUBVIEWS ────────────────────────────────────────────────────
  // ---------------------------------------------------------------------------

  // MONTH VIEW IMPLEMENTATION
  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDateRange = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDateRange = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const allDays = eachDayOfInterval({ start: startDateRange, end: endDateRange });

    return (
      <div>
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div key={day} className="py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 auto-rows-[140px] bg-gray-100 gap-[1px]">
          {allDays.map(day => {
            const dayString = format(day, 'yyyy-MM-dd');
            const isToday = isSameDay(day, new Date());
            const isCurrentMonth = isSameDay(startOfMonth(day), monthStart);

            // Filter events for this day
            const dayEvents = filteredAllEvents.filter(evt => {
              const start = parseISO(evt.startDate);
              const end = parseISO(evt.endDate);
              const test = day;
              test.setHours(0, 0, 0, 0);
              start.setHours(0, 0, 0, 0);
              end.setHours(0, 0, 0, 0);
              return test >= start && test <= end;
            });

            // Limit list to prevent overflow
            const displayLimit = 3;
            const overflowCount = dayEvents.length - displayLimit;

            return (
              <div
                key={dayString}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverDay(dayString);
                }}
                onDragLeave={() => setDragOverDay(null)}
                onDrop={(e) => handleDrop(e, dayString)}
                className={`bg-white p-2 transition-all flex flex-col group relative ${
                  !isCurrentMonth ? 'bg-gray-50/60 text-gray-400' : 'text-gray-700'
                } ${isToday ? 'bg-blue-50/40 ring-1 ring-blue-400/55 z-10' : ''} ${
                  dragOverDay === dayString ? 'bg-blue-100/70 border border-blue-500' : ''
                }`}
              >
                {/* Date header & + button */}
                <div className="flex justify-between items-center mb-1">
                  <span
                    className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                        : 'text-gray-700 font-bold group-hover:bg-gray-100'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>
                  
                  <button
                    onClick={() => handleOpenCreateModal(dayString)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition-all"
                    title="Add Event"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* Event Pills */}
                <div className="flex-1 space-y-1 overflow-y-auto min-h-0 scrollbar-thin">
                  {dayEvents.slice(0, displayLimit).map(evt => {
                    const isOverdue = isEventOverdue(evt);
                    const pillColor = getEventColorClasses(evt.eventType, evt.status, isOverdue, evt.isPrediction);
                    
                    return (
                      <div
                        key={evt.id}
                        draggable={!evt.isReadOnly}
                        onDragStart={(e) => handleDragStart(e, evt)}
                        onClick={() => handleOpenViewModal(evt)}
                        className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold truncate border cursor-pointer select-none flex items-center gap-1 transition-all hover:brightness-95 hover:translate-x-[1px] ${pillColor}`}
                        title={`${evt.title}${evt.isReadOnly ? ' (Read-Only Overlay)' : ''}`}
                      >
                        {getEventIcon(evt.eventType, 9)}
                        <span className="truncate">{evt.title}</span>
                      </div>
                    );
                  })}

                  {overflowCount > 0 && (
                    <button
                      onClick={() => {
                        setCurrentDate(day);
                        setCurrentView('day');
                      }}
                      className="text-[10px] font-bold text-blue-600 block text-center w-full hover:bg-blue-50 py-0.5 rounded-md transition-colors"
                    >
                      +{overflowCount} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // WEEK VIEW IMPLEMENTATION
  const renderWeekView = () => {
    const startOfWeekDay = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startOfWeekDay, i));

    return (
      <div className="grid grid-cols-7 gap-4 bg-gray-50/50 p-4 min-h-[500px]">
        {weekDays.map((day, idx) => {
          const dayString = format(day, 'yyyy-MM-dd');
          const isToday = isSameDay(day, new Date());

          const dayEvents = filteredAllEvents.filter(evt => {
            const start = parseISO(evt.startDate);
            const end = parseISO(evt.endDate);
            const test = day;
            test.setHours(0, 0, 0, 0);
            start.setHours(0, 0, 0, 0);
            end.setHours(0, 0, 0, 0);
            return test >= start && test <= end;
          });

          return (
            <div key={idx} className="flex flex-col h-full bg-white rounded-2xl border border-gray-100 p-3 shadow-sm min-w-0">
              {/* Header */}
              <div className="text-center pb-2 mb-3 border-b border-gray-100 flex flex-col items-center">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">
                  {format(day, 'EEE')}
                </span>
                <span className={`text-lg font-bold w-9 h-9 flex items-center justify-center rounded-full mt-1 ${
                  isToday ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-gray-800'
                }`}>
                  {format(day, 'd')}
                </span>
              </div>

              {/* Stacked Event Cards */}
              <div className="flex-1 space-y-2 overflow-y-auto max-h-[480px]">
                {dayEvents.length === 0 ? (
                  <div className="h-full flex items-center justify-center py-8">
                    <p className="text-[10px] text-gray-400 italic text-center">No scheduled events</p>
                  </div>
                ) : (
                  dayEvents.map(evt => {
                    const isOverdue = isEventOverdue(evt);
                    const pillColor = getEventColorClasses(evt.eventType, evt.status, isOverdue, evt.isPrediction);

                    return (
                      <div
                        key={evt.id}
                        onClick={() => handleOpenViewModal(evt)}
                        className={`p-2 rounded-xl border cursor-pointer flex flex-col transition-all hover:shadow-md hover:scale-[1.01] ${pillColor}`}
                      >
                        <div className="flex items-center gap-1 font-bold text-[10px] mb-1">
                          {getEventIcon(evt.eventType, 10)}
                          <span className="uppercase text-[9px] tracking-wide">{evt.eventType}</span>
                        </div>
                        <span className="text-xs font-bold text-gray-800 leading-tight truncate mb-1">
                          {evt.title}
                        </span>
                        
                        {evt.equipmentName && (
                          <span className="text-[9px] text-gray-500 font-bold mb-1 bg-gray-100/50 px-1 py-0.5 rounded w-max">
                            {evt.equipmentName}
                          </span>
                        )}

                        <div className="flex justify-between items-center text-[9px] text-gray-500 mt-1 pt-1 border-t border-gray-200/50">
                          <span className="truncate max-w-[50px]">{evt.technicians || 'Unassigned'}</span>
                          <span>{evt.estimatedDuration ? `${evt.estimatedDuration}m` : '60m'}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // DAY VIEW IMPLEMENTATION
  const renderDayView = () => {
    const dayEvents = filteredAllEvents.filter(evt => {
      const start = parseISO(evt.startDate);
      const end = parseISO(evt.endDate);
      const test = currentDate;
      test.setHours(0, 0, 0, 0);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      return test >= start && test <= end;
    });

    return (
      <div className="max-w-4xl mx-auto p-4 bg-gray-50/50 rounded-3xl border border-gray-100/60 shadow-sm mt-4">
        <h3 className="text-lg font-bold text-gray-800 px-2 mb-4 flex items-center justify-between">
          <span>Scheduled interventions for {format(currentDate, 'MMMM d, yyyy')}</span>
          <button
            onClick={() => handleOpenCreateModal(format(currentDate, 'yyyy-MM-dd'))}
            className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-xl shadow-lg shadow-blue-500/10 transition-all"
          >
            <Plus size={12} /> Add Event
          </button>
        </h3>

        {dayEvents.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarIcon size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-400 font-medium">No maintenance tasks scheduled for today.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dayEvents.map(evt => {
              const isOverdue = isEventOverdue(evt);
              const pillColor = getEventColorClasses(evt.eventType, evt.status, isOverdue, evt.isPrediction);
              
              return (
                <div
                  key={evt.id}
                  onClick={() => handleOpenViewModal(evt)}
                  className={`p-4 bg-white rounded-2xl border flex flex-col md:flex-row justify-between gap-4 cursor-pointer hover:shadow-md transition-all ${pillColor}`}
                >
                  <div className="flex gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${getEventColorBadgeClasses(evt.eventType, evt.status)}`}>
                      {getEventIcon(evt.eventType, 18)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        {evt.title}
                        {evt.isReadOnly && (
                          <span className="text-[9px] bg-gray-200/80 text-gray-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                            Read-Only
                          </span>
                        )}
                        {evt.isPrediction && (
                          <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                            AI Prediction
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-gray-500 font-medium mt-1 flex flex-wrap items-center gap-y-1 gap-x-3">
                        {evt.equipmentName && <span><strong>Equipment:</strong> {evt.equipmentName}</span>}
                        {evt.location && <span><strong>Location:</strong> {evt.location}</span>}
                        <span><strong>Duration:</strong> {evt.estimatedDuration || 60} minutes</span>
                      </p>
                      {evt.notes && (
                        <p className="text-xs text-gray-500 italic mt-2 border-l-2 border-gray-300 pl-2">
                          {evt.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex md:flex-col justify-between md:items-end gap-2 border-t md:border-t-0 border-gray-200/50 pt-2 md:pt-0">
                    <div className="flex gap-1.5">
                      {evt.priority && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          evt.priority === 'critical' ? 'bg-red-200 text-red-800' :
                          evt.priority === 'high' ? 'bg-amber-200 text-amber-800' :
                          evt.priority === 'medium' ? 'bg-blue-200 text-blue-800' :
                          'bg-gray-200 text-gray-800'
                        }`}>
                          {evt.priority}
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        isOverdue ? 'bg-red-600 text-white animate-pulse' :
                        evt.status === 'done' || evt.status === 'completed' ? 'bg-emerald-200 text-emerald-800' :
                        evt.status === 'in-progress' ? 'bg-blue-200 text-blue-800' :
                        'bg-gray-200 text-gray-800'
                      }`}>
                        {isOverdue ? 'Overdue' : evt.status || 'Planned'}
                      </span>
                    </div>

                    <div className="text-[11px] text-gray-500 font-bold flex items-center gap-1">
                      <User size={12} />
                      <span>{evt.technicians || 'No tech assigned'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // TIMELINE / GANTT VIEW IMPLEMENTATION
  const renderTimelineView = () => {
    const monthStart = startOfMonth(currentDate);
    const timelineDays = Array.from({ length: 30 }).map((_, i) => addDays(monthStart, i));
    const rangeEnd = timelineDays[29];

    // Filter events overlapping this 30-day range
    const timelineEvents = filteredAllEvents.filter(evt => {
      const start = parseISO(evt.startDate);
      const end = parseISO(evt.endDate);
      return start <= rangeEnd && end >= monthStart;
    });

    return (
      <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="min-w-[1200px] grid grid-cols-[180px_repeat(30,1fr)] bg-gray-50 border-b border-gray-100">
          {/* Header Row */}
          <div className="p-3 font-bold text-xs text-gray-500 border-r border-gray-100">
            Equipment / Machine
          </div>
          {timelineDays.map((day, idx) => {
            const isToday = isSameDay(day, new Date());
            return (
              <div
                key={idx}
                className={`py-2 text-center border-r border-gray-100 flex flex-col items-center justify-center ${
                  isToday ? 'bg-blue-50/80 font-bold ring-1 ring-blue-500/20' : ''
                }`}
              >
                <span className="text-[9px] text-gray-400 font-bold uppercase">{format(day, 'EE').charAt(0)}</span>
                <span className={`text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-blue-600 text-white' : 'text-gray-700'
                }`}>{format(day, 'd')}</span>
              </div>
            );
          })}
        </div>

        {/* Machine Rows */}
        <div className="divide-y divide-gray-100 min-w-[1200px]">
          {machines.length === 0 ? (
            <div className="p-8 text-center text-gray-400 italic">No machines registered.</div>
          ) : (
            machines.map(m => {
              // Get events matching this machine
              const machineEvents = timelineEvents.filter(evt => evt.equipmentId === m.id);

              return (
                <div key={m.id} className="grid grid-cols-[180px_repeat(30,1fr)] relative min-h-[56px] items-center">
                  {/* Left row header */}
                  <div className="p-3 border-r border-gray-100 bg-white font-bold text-xs text-gray-800 z-10 flex flex-col sticky left-0 shadow-[4px_0_8px_rgba(0,0,0,0.02)]">
                    <span className="truncate">{m.name}</span>
                    <span className="text-[9px] text-gray-400 font-medium truncate">{m.serialNumber}</span>
                  </div>

                  {/* Empty cell grids */}
                  {timelineDays.map((_, idx) => (
                    <div key={idx} className="h-full border-r border-gray-50 bg-white/20" />
                  ))}

                  {/* Absolute overlay bars spanning multiple columns */}
                  <div className="absolute inset-y-0 left-[180px] right-0 grid grid-cols-30 pointer-events-none p-1.5 gap-y-1 overflow-y-auto">
                    {machineEvents.map(evt => {
                      const evtStart = parseISO(evt.startDate);
                      const evtEnd = parseISO(evt.endDate);

                      // Clamped range
                      const displayStart = evtStart < monthStart ? monthStart : evtStart;
                      const displayEnd = evtEnd > rangeEnd ? rangeEnd : evtEnd;

                      const startIndex = differenceInDays(displayStart, monthStart);
                      const span = differenceInDays(displayEnd, displayStart) + 1;

                      if (startIndex < 0 || startIndex >= 30) return null;

                      const isOverdue = isEventOverdue(evt);
                      const pillColor = getEventColorClasses(evt.eventType, evt.status, isOverdue, evt.isPrediction);

                      return (
                        <div
                          key={evt.id}
                          onClick={() => handleOpenViewModal(evt)}
                          style={{
                            gridColumnStart: startIndex + 1,
                            gridColumnEnd: `span ${span}`
                          }}
                          className={`pointer-events-auto h-7 px-2 rounded-lg border font-bold text-[10px] flex items-center gap-1 cursor-pointer select-none truncate hover:shadow-sm hover:brightness-95 transition-all ${pillColor}`}
                          title={`${evt.title} (${evt.startDate} to ${evt.endDate})`}
                        >
                          {getEventIcon(evt.eventType, 9)}
                          <span className="truncate">{evt.title}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  if (loading) return <div className="p-8 text-center text-sm font-medium text-gray-500">Loading Maintenance Calendar...</div>;

  return (
    <div className="space-y-6">
      {/* ────────────────────────────────────────────────────────────────────────
          OVERDUE MACHINES BANNER
          ──────────────────────────────────────────────────────────────────────── */}
      {overdueMachinesCount > 0 && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-3xl flex items-center justify-between gap-4 animate-pulse shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 text-white flex items-center justify-center rounded-2xl shadow-md shadow-red-500/20">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-955 uppercase tracking-wide">Overdue Preventive Maintenance Warning</h3>
              <p className="text-xs text-red-700 font-medium">{overdueMachinesCount} machine(s) are currently OVERDUE for scheduled maintenance intervals. Action is required.</p>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TOP ACTIONS BAR
          ──────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100/60">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-600 text-white flex items-center justify-center rounded-2xl shadow-lg shadow-blue-500/20">
            <CalendarIcon size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {currentView === 'month' && format(currentDate, 'MMMM yyyy')}
              {currentView === 'week' && `Week of ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'MMM d, yyyy')}`}
              {currentView === 'day' && format(currentDate, 'MMMM d, yyyy')}
              {currentView === 'timeline' && `Timeline: ${format(startOfMonth(currentDate), 'MMMM yyyy')}`}
            </h2>
            <p className="text-xs text-gray-500 font-medium">GMAO Maintenance Scheduler</p>
          </div>
        </div>

        {/* View Switchers & Add button */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Controls */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => {
                if (currentView === 'month' || currentView === 'timeline') prevMonth();
                else if (currentView === 'week') prevWeekNav();
                else prevDayNav();
              }}
              className="p-1.5 hover:bg-white rounded-lg transition-all text-gray-600"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={navigateToToday}
              className="px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-white rounded-lg transition-all"
            >
              Today
            </button>
            <button
              onClick={() => {
                if (currentView === 'month' || currentView === 'timeline') nextMonth();
                else if (currentView === 'week') nextWeekNav();
                else nextDayNav();
              }}
              className="p-1.5 hover:bg-white rounded-lg transition-all text-gray-600"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* View Tab triggers */}
          <div className="flex bg-gray-100 p-1 rounded-xl">
            {(['month', 'week', 'day', 'timeline'] as const).map(v => (
              <button
                key={v}
                onClick={() => setCurrentView(v)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all capitalize ${
                  currentView === v ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <button
            onClick={() => setShowFilters(prev => !prev)}
            className={`p-2 rounded-xl border transition-all flex items-center justify-center ${
              showFilters ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
            title="Toggle Filters"
          >
            <SlidersHorizontal size={18} />
          </button>

          {/* Export Dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-gray-600 bg-white hover:bg-gray-50 rounded-xl border border-gray-200 transition-all">
              <Download size={14} /> Export
            </button>
            <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-100 rounded-xl shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all z-50">
              <button
                onClick={handleExportPDF}
                className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-100"
              >
                <FileText size={12} className="text-red-500" /> PDF Table
              </button>
              <button
                onClick={handleExportExcel}
                className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <FileText size={12} className="text-emerald-500" /> Excel Sheet
              </button>
            </div>
          </div>

          <button
            onClick={() => handleOpenCreateModal()}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/10 transition-all"
          >
            <Plus size={14} /> Create Event
          </button>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          COLLAPSIBLE SEARCH & FILTER PANEL
          ──────────────────────────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4">
          {/* Type Filter */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Event Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value="all">All Types</option>
              <option value="preventive">Preventive (PM)</option>
              <option value="corrective">Corrective (CM)</option>
              <option value="inspection">Inspection & Audits</option>
              <option value="downtime">Equipment Downtime</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Priority Level</label>
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value="all">All Statuses</option>
              <option value="planned">Planned</option>
              <option value="in-progress">In Progress</option>
              <option value="done">Completed</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>

          {/* Equipment Filter */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Machine / Asset</label>
            <select
              value={selectedEquipment}
              onChange={(e) => setSelectedEquipment(e.target.value)}
              className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value="all">All Equipment</option>
              {machines.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* PM Alert Config Threshold */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">PM Alert Threshold</label>
            <select
              value={alertThresholdDays}
              onChange={(e) => setAlertThresholdDays(Number(e.target.value))}
              className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value={7}>7 Days</option>
              <option value={15}>15 Days</option>
              <option value={30}>30 Days</option>
            </select>
          </div>

          {/* Tech search */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Technician Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={14} />
              <input
                type="text"
                placeholder="Search name..."
                value={technicianSearch}
                onChange={(e) => setTechnicianSearch(e.target.value)}
                className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-9 pr-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          UPCOMING 7-DAY CRITICAL ALERT SLIDER
          ──────────────────────────────────────────────────────────────────────── */}
      {upcomingMaintenance.length > 0 && (
        <div className="bg-amber-50/60 p-4 rounded-3xl border border-amber-100 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-500/10 text-amber-600 flex items-center justify-center rounded-xl">
              <Bell size={18} className="animate-bounce" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Critical Maintenance Alerts</h3>
              <p className="text-[11px] text-amber-700 font-medium">{upcomingMaintenance.length} machine(s) have upcoming scheduling in next 7 days.</p>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 max-w-full">
            {upcomingMaintenance.map(m => {
              const remainingHours = m.nextMaintenanceHours ? m.nextMaintenanceHours - m.currentHours : 0;
              return (
                <div
                  key={m.id}
                  className="bg-white px-3 py-1.5 rounded-xl border border-amber-200/50 shadow-sm flex items-center gap-2 whitespace-nowrap"
                >
                  <span className="text-xs font-bold text-gray-800">{m.name}</span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-lg">
                    {m.nextMaintenance ? format(parseISO(m.nextMaintenance), 'MMM d') : `${formatHoursToDays(remainingHours, true)} left`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          CALENDAR MAIN GRID VIEWS
          ──────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100/60 overflow-hidden">
        {currentView === 'month' && renderMonthView()}
        {currentView === 'week' && renderWeekView()}
        {currentView === 'day' && renderDayView()}
        {currentView === 'timeline' && renderTimelineView()}
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          RIGHT SLIDE-IN SLIDEOVER / DIALOG MODAL (CRUD)
          ──────────────────────────────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex justify-end transition-all">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col animate-slide-in relative border-l border-gray-100">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {modalMode === 'view' ? 'Event Details' : modalMode === 'edit' ? 'Edit Event' : 'Create Event'}
                </h3>
                <p className="text-xs text-gray-500 font-medium">
                  {modalMode === 'view' && selectedEvent?.isReadOnly ? 'Read-only synchronized event' : 'Management Form'}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-800 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {modalMode === 'view' ? (
                <div className="space-y-6">
                  {/* Header banner showing event type and priority */}
                  <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-lg text-white ${getEventColorBadgeClasses(formType, formStatus)}`}>
                        {formType}
                      </span>
                      {selectedEvent?.priority && (
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-lg ${
                          formPriority === 'critical' ? 'bg-red-100 text-red-800' :
                          formPriority === 'high' ? 'bg-amber-100 text-amber-800' :
                          formPriority === 'medium' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {formPriority} Priority
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-lg ${
                      isEventOverdue(selectedEvent) || formStatus === 'overdue' ? 'bg-red-655 text-red-600 bg-red-100 animate-pulse font-extrabold' :
                      formStatus === 'done' ? 'bg-gray-200 text-gray-800' : 'bg-blue-600 text-white'
                    }`}>
                      {isEventOverdue(selectedEvent) || formStatus === 'overdue' ? 'Overdue' : formStatus === 'done' ? 'Completed' : formStatus}
                    </span>
                  </div>

                  {/* Title */}
                  <div>
                    <h2 className="text-base font-bold text-gray-900 leading-snug">{formTitle}</h2>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      <span className="bg-gray-100 px-2 py-0.5 rounded-lg">Source: {selectedEvent?.source || 'manually scheduled'}</span>
                      <span>•</span>
                      <span>Estimated: {formEstimatedDuration} mins</span>
                    </div>
                  </div>

                  {/* Location & Schedule Card */}
                  <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100/60">
                    <div>
                      <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wide mb-0.5">Start Date</span>
                      <span className="text-xs font-bold text-gray-800">{formStartDate}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wide mb-0.5">End Date</span>
                      <span className="text-xs font-bold text-gray-800">{formEndDate}</span>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-gray-200/50">
                      <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wide mb-0.5">Location / Site</span>
                      <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5 mt-0.5">
                        <MapPin size={12} className="text-gray-400" /> {formLocation || 'No location specified'}
                      </span>
                    </div>
                  </div>

                  {/* Equipment Section */}
                  {formEquipmentId && (
                    <div className="p-4 bg-blue-50/30 rounded-2xl border border-blue-100/40">
                      <span className="block text-[9px] uppercase font-bold text-blue-600/70 tracking-wide mb-1.5">Asset / Equipment Details</span>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-gray-900">
                            {selectedEvent?.equipmentName || machines.find(m => m.id === formEquipmentId)?.name || 'Unknown Machine'}
                          </h4>
                          <p className="text-[10px] text-gray-500 font-bold mt-0.5">ID: {formEquipmentId}</p>
                        </div>
                        {machines.find(m => m.id === formEquipmentId)?.serialNumber && (
                          <span className="text-[9px] bg-blue-100/50 text-blue-800 px-2 py-0.5 rounded font-bold">
                            SN: {machines.find(m => m.id === formEquipmentId)?.serialNumber}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* PM Scheduling Info (from history) */}
                  {formType === 'preventive' && selectedEvent?.equipmentId && (
                    <div className="p-4 bg-emerald-50/20 rounded-2xl border border-emerald-100/40 space-y-2">
                      <span className="block text-[9px] uppercase font-bold text-emerald-700/70 tracking-wide mb-1">Preventive Maintenance (PM) Status</span>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="block text-[9px] text-gray-400 font-bold">Last PM Date</span>
                          <span className="font-bold text-gray-700">{selectedEvent?.lastMaintenanceDate || 'Never'}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] text-gray-400 font-bold">Next Due Date</span>
                          <span className="font-bold text-gray-700">{selectedEvent?.nextDueDate || 'N/A'}</span>
                        </div>
                        <div className="col-span-2 pt-2 border-t border-emerald-100/40">
                          <span className="block text-[9px] text-gray-400 font-bold">Days Remaining / Overdue Count</span>
                          {selectedEvent?.daysRemainingOrOverdue !== undefined && (
                            <span className={`font-bold ${selectedEvent.daysRemainingOrOverdue < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                              {selectedEvent.daysRemainingOrOverdue < 0 
                                ? `OVERDUE by ${Math.abs(selectedEvent.daysRemainingOrOverdue)} days` 
                                : `${selectedEvent.daysRemainingOrOverdue} days remaining`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Assigned Technicians */}
                  <div>
                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Assigned Technicians</span>
                    <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200/60 rounded-xl">
                      <User size={16} className="text-gray-400" />
                      <span className="text-xs font-bold text-gray-800">{formTechnicians || 'No technicians assigned'}</span>
                    </div>
                  </div>

                  {/* Linked Work Order */}
                  {formWorkOrderNumber && (
                    <div>
                      <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Linked Work Order</span>
                      <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200/60 rounded-xl text-xs font-bold">
                        <span className="text-blue-600 hover:underline">{formWorkOrderNumber}</span>
                        <span className="text-[10px] text-gray-400 font-medium">Auto-synced</span>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {formNotes && (
                    <div>
                      <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Intervention Notes</span>
                      <div className="p-3 bg-gray-50 border border-gray-200/60 rounded-xl text-xs text-gray-600 italic whitespace-pre-wrap leading-relaxed">
                        {formNotes}
                      </div>
                    </div>
                  )}

                  {/* Recurrence Pattern */}
                  {formRecurrence !== 'none' && (
                    <div className="text-[10px] font-bold text-gray-400">
                      Recurrence Pattern: <span className="text-blue-600 capitalize font-extrabold">{formRecurrence}</span>
                    </div>
                  )}

                  {/* Confirm PM Form Section */}
                  {formType === 'preventive' && selectedEvent?.equipmentId && (
                    <div className="mt-6 pt-6 border-t border-gray-100 space-y-4">
                      <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                        <Check size={16} className="text-emerald-600" /> Confirm PM Completion
                      </h4>
                      <p className="text-[11px] text-gray-500 font-medium">Reset next scheduling calculation in machine file based on this completion details.</p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-gray-400 mb-1.5">Completion Date</label>
                          <input
                            type="date"
                            value={formCompletionDate}
                            onChange={(e) => setFormCompletionDate(e.target.value)}
                            className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-gray-400 mb-1.5">Next Reset Frequency</label>
                          <select
                            value={pmResetInterval}
                            onChange={(e) => setPmResetInterval(e.target.value as any)}
                            className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="weekly">+7 Days (Weekly)</option>
                            <option value="monthly">+30 Days (Monthly)</option>
                            <option value="quarterly">+90 Days (Quarterly)</option>
                            <option value="biannually">+180 Days (Bi-Annually)</option>
                            <option value="annually">+365 Days (Annually)</option>
                          </select>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleConfirmPM}
                        className="w-full py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-500/10 transition-all flex items-center justify-center gap-1.5"
                      >
                        <Check size={14} /> Confirm PM and Reset Machine Schedule
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSaveEvent} className="space-y-4">
                  {/* Event Type & Colors */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Event Classification</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(['preventive', 'corrective', 'inspection', 'downtime'] as const).map(type => (
                        <label
                          key={type}
                          className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 text-center cursor-pointer transition-all ${
                            formType === type
                              ? 'border-blue-600 bg-blue-50/30'
                              : 'border-gray-100 bg-gray-50/50 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="eventType"
                            value={type}
                            checked={formType === type}
                            onChange={(e) => setFormType(e.target.value as any)}
                            className="sr-only"
                          />
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1 text-white ${getEventColorBadgeClasses(type)}`}>
                            {getEventIcon(type, 16)}
                          </div>
                          <span className="text-[10px] font-bold capitalize text-gray-700">{type}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., PM - Compressor #3 - Oil Change"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>

                  {/* Equipment Link */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Target Equipment</label>
                      <select
                        value={formEquipmentId}
                        onChange={(e) => setFormEquipmentId(e.target.value)}
                        className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      >
                        <option value="">None (General Event)</option>
                        {machines.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Location / Sector</label>
                      <input
                        type="text"
                        placeholder="e.g., Workshop B"
                        value={formLocation}
                        onChange={(e) => setFormLocation(e.target.value)}
                        className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Start Date</label>
                      <input
                        type="date"
                        required
                        value={formStartDate}
                        onChange={(e) => setFormStartDate(e.target.value)}
                        className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">End Date</label>
                      <input
                        type="date"
                        required
                        value={formEndDate}
                        onChange={(e) => setFormEndDate(e.target.value)}
                        className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  {/* Priority & Status */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Priority Level</label>
                      <select
                        value={formPriority}
                        onChange={(e) => setFormPriority(e.target.value as any)}
                        className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Status</label>
                      <select
                        value={formStatus}
                        onChange={(e) => setFormStatus(e.target.value as any)}
                        className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      >
                        <option value="planned">Planned</option>
                        <option value="in-progress">In Progress</option>
                        <option value="done">Completed</option>
                        <option value="overdue">Overdue</option>
                      </select>
                    </div>
                  </div>

                  {/* Techs & Recurrence */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Assigned Technicians</label>
                      <input
                        type="text"
                        placeholder="e.g., John Doe, Alice Smith"
                        value={formTechnicians}
                        onChange={(e) => setFormTechnicians(e.target.value)}
                        className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Estimated Duration (min)</label>
                      <input
                        type="number"
                        min="1"
                        value={formEstimatedDuration}
                        onChange={(e) => setFormEstimatedDuration(Number(e.target.value))}
                        className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  {/* Recurrence & Work Order link */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Recurrence Pattern</label>
                      <select
                        value={formRecurrence}
                        onChange={(e) => setFormRecurrence(e.target.value as any)}
                        className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      >
                        <option value="none">No Recurrence</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="annually">Annually</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Linked Work Order #</label>
                      <input
                        type="text"
                        placeholder="e.g., WO-1234"
                        value={formWorkOrderNumber}
                        onChange={(e) => setFormWorkOrderNumber(e.target.value)}
                        className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Intervention Notes / Details</label>
                    <textarea
                      rows={3}
                      placeholder="Describe maintenance instructions, part replacements, or failure indicators..."
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                </form>
              )}

              {/* Metadata log info */}
              {selectedEvent && (
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-[10px] font-bold text-gray-400 space-y-1">
                  {selectedEvent.createdAt && <div>Created: {format(parseISO(selectedEvent.createdAt), 'yyyy-MM-dd HH:mm')}</div>}
                  {selectedEvent.updatedAt && <div>Last Updated: {format(parseISO(selectedEvent.updatedAt), 'yyyy-MM-dd HH:mm')}</div>}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
              <div>
                {modalMode === 'view' && !selectedEvent?.isReadOnly && (
                  <button
                    type="button"
                    onClick={handleEditClick}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-xl border border-blue-200 transition-all"
                  >
                    <Edit3 size={14} /> Edit Event
                  </button>
                )}
                {modalMode === 'view' && selectedEvent?.isReadOnly && (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase bg-gray-200/50 px-3 py-1.5 rounded-xl">
                    <Info size={14} /> Synced Read-Only Data
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {modalMode === 'view' && !selectedEvent?.isReadOnly && (
                  <button
                    type="button"
                    onClick={handleDeleteEvent}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-lg shadow-red-500/10 transition-all"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                )}
                
                {modalMode !== 'view' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (modalMode === 'create') setIsModalOpen(false);
                        else setModalMode('view');
                      }}
                      className="px-4 py-2.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEvent}
                      className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/10 transition-all font-bold"
                    >
                      <Check size={14} /> Save Changes
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
