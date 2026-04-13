import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { api } from '../services/api';
import { Machine, WorkOrder } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function MaintenanceCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [machines, setMachines] = useState<Machine[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [m, w] = await Promise.all([api.getMachines(), api.getWorkOrders()]);
        setMachines(m);
        setWorkOrders(w);
      } catch (error) {
        console.error('Error fetching calendar data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const getEventsForDay = (day: Date) => {
    const events: any[] = [];
    
    // Preventive maintenance from machines
    machines.forEach(m => {
      if (m.nextMaintenance && isSameDay(new Date(m.nextMaintenance), day)) {
        events.push({ type: 'preventive', title: `PM: ${m.name}`, machine: m.name });
      }
    });

    // Work orders
    workOrders.forEach(w => {
      if (w.createdAt && isSameDay(new Date(w.createdAt), day)) {
        events.push({ type: w.type, title: w.title, status: w.status });
      }
    });

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

      <div className="grid grid-cols-7 border-b border-gray-100">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-[120px]">
        {/* Padding for start of month */}
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
                      "bg-blue-50 text-blue-700 border-blue-100"
                    )}
                  >
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
