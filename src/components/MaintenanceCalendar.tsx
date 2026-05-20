import React, { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, addDays, isBefore, parseISO, isAfter } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, AlertTriangle, Bell, TrendingUp } from 'lucide-react';
import { api } from '../services/api';
import { Machine, WorkOrder, MachineRendement } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function MaintenanceCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [machines, setMachines] = useState<Machine[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [rendements, setRendements] = useState<MachineRendement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [mList, wList, rList] = await Promise.all([
          api.getMachines(),
          api.getWorkOrders(),
          api.getRendement()
        ]);
        setMachines(mList);
        setWorkOrders(wList);
        setRendements(rList);
      } catch (error) {
        console.error('Error fetching calendar data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const today = new Date();
  const nextWeek = addDays(today, 7);

  const upcomingMaintenance = machines.filter(m => {
    let dateUpcoming = false;
    if (m.nextMaintenance && m.nextMaintenance.trim() !== '') {
      try {
        const mDate = parseISO(m.nextMaintenance);
        if (!isNaN(mDate.getTime())) {
          dateUpcoming = isBefore(mDate, nextWeek) && !isBefore(mDate, today);
        }
      } catch (e) {}
    }

    let hourUpcoming = false;
    if (m.nextMaintenanceHours && m.currentHours) {
      const remainingHours = m.nextMaintenanceHours - m.currentHours;
      // ONLY upcoming: between 0 and 50 hours remaining
      hourUpcoming = remainingHours <= 50 && remainingHours > 0;
    }

    return dateUpcoming || hourUpcoming;
  });

  const predictions = useMemo(() => {
    const map = new Map<string, { date: Date, avgHours: number }>();
    
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
            const predictedDate = addDays(today, daysRemaining);
            map.set(m.id, { date: predictedDate, avgHours: safeAvgHours });
          }
        }
      }
    });

    return map;
  }, [rendements, machines, today]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const getEventsForDay = (day: Date) => {
    const events: any[] = [];
    
    machines.forEach(m => {
      if (m.nextMaintenance && isSameDay(new Date(m.nextMaintenance), day)) {
        events.push({ type: 'preventive', title: `PM: ${m.name}`, machine: m.name });
      }
      
      const prediction = predictions.get(m.id);
      if (prediction && isSameDay(prediction.date, day)) {
        events.push({ type: 'predicted-pm', title: `Pred: ${m.name}`, machine: m.name });
      }
    });

    workOrders.forEach(w => {
      if (w.createdAt && isSameDay(new Date(w.createdAt), day)) {
        events.push({ type: w.type, title: w.title, status: w.status });
      }
    });

    if (isSameDay(day, today)) {
      upcomingMaintenance.forEach(m => {
        const remainingHours = m.nextMaintenanceHours ? m.nextMaintenanceHours - m.currentHours : 0;
        events.push({ 
          type: 'upcoming-alert', 
          title: `Soon: ${m.name}`, 
          machine: m.name,
          isUrgent: m.nextMaintenance ? isBefore(parseISO(m.nextMaintenance), addDays(today, 2)) : remainingHours < 10
        });
      });
    }

    return events;
  };

  if (loading) return <div className="p-8 text-center">Loading calendar...</div>;

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 text-white flex items-center justify-center rounded-xl shadow-lg shadow-blue-600/20">
            <CalendarIcon size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{format(currentDate, 'MMMM yyyy')}</h2>
            <p className="text-xs text-gray-500 font-medium">Maintenance Schedule</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-gray-200 transition-all">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
            Today
          </button>
          <button onClick={nextMonth} className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-gray-200 transition-all">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {upcomingMaintenance.length > 0 && (
        <div className="px-6 py-4 bg-amber-50/50 border-b border-amber-100/50">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={16} className="text-amber-600" />
            <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Upcoming in next 7 days</h3>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {upcomingMaintenance.map(m => {
              const remainingHours = m.nextMaintenanceHours ? m.nextMaintenanceHours - (m.currentHours || 0) : null;
              const isOverdue = remainingHours !== null && remainingHours <= 0;
              
              return (
                <div key={m.id} className={cn(
                  "flex-shrink-0 border rounded-xl p-3 shadow-sm min-w-[200px]",
                  isOverdue ? "bg-red-50 border-red-200" : "bg-white border-amber-200"
                )}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate text-gray-900">{m.name}</p>
                      <p className="text-[10px] font-medium mt-0.5 text-amber-700">
                        {m.nextMaintenance ? format(parseISO(m.nextMaintenance), 'MMM d') : `${Math.round(remainingHours || 0)}h remaining`}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-7 border-b border-gray-100">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-[120px]">
        {Array.from({ length: monthStart.getDay() }).map((_, i) => (
          <div key={`pad-${i}`} className="border-r border-b border-gray-50 bg-gray-50/30" />
        ))}
        
        {days.map(day => {
          const events = getEventsForDay(day);
          const isToday = isSameDay(day, new Date());
          
          return (
            <div key={day.toString()} className={cn(
              "border-r border-b border-gray-100 p-2 transition-colors hover:bg-gray-50/50",
              isToday && "bg-blue-50/30"
            )}>
              <div className="flex justify-between items-start mb-1">
                <span className={cn(
                  "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full",
                  isToday ? "bg-blue-600 text-white shadow-md shadow-blue-600/20" : "text-gray-500"
                )}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="space-y-1 overflow-y-auto max-h-[80px] scrollbar-hide">
                {events.map((event, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-md font-bold truncate border",
                      event.type === 'preventive' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : 
                      event.type === 'corrective' ? "bg-red-50 text-red-700 border-red-100" :
                      event.type === 'upcoming-alert' ? (
                        event.title.includes('OVERDUE') 
                          ? "bg-red-50 text-red-700 border-red-200 border-dashed animate-pulse" 
                          : "bg-amber-50 text-amber-700 border-amber-100 border-dashed"
                      ) :
                      event.type === 'predicted-pm' ? "bg-purple-50 text-purple-700 border-purple-100 border-dotted" :
                      "bg-blue-50 text-blue-700 border-blue-100"
                    )}
                  >
                    {event.type === 'upcoming-alert' ? (
                      <Clock size={10} className="mr-1 inline-block" />
                    ) : event.type === 'predicted-pm' ? (
                      <TrendingUp size={10} className="mr-1 inline-block" />
                    ) : null}
                    {event.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
