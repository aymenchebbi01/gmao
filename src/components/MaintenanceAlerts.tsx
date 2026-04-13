import React, { useEffect, useState } from 'react';
import { Machine } from '../types';
import { Bell, Calendar, AlertTriangle } from 'lucide-react';
import { format, isBefore, addDays, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { api } from '../services/api';

export default function MaintenanceAlerts() {
  const [upcomingMaintenance, setUpcomingMaintenance] = useState<Machine[]>([]);
  const [notifiedIds, setNotifiedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchMaintenance = async () => {
      try {
        const machines = await api.getMachines();

        const today = new Date();
        const nextWeek = addDays(today, 7);

        const upcoming = machines.filter(m => {
          // Date-based check
          let dateUpcoming = false;
          if (m.nextMaintenance) {
            try {
              const maintenanceDate = parseISO(m.nextMaintenance);
              dateUpcoming = isBefore(maintenanceDate, nextWeek) && !isBefore(maintenanceDate, today);
            } catch (e) { }
          }

          // Hour-based check
          let hourUpcoming = false;
          if (m.nextMaintenanceHours && m.currentHours) {
            // If within 50 hours of threshold
            hourUpcoming = (m.nextMaintenanceHours - m.currentHours) <= 50 && (m.nextMaintenanceHours - m.currentHours) > 0;
          }

          return dateUpcoming || hourUpcoming;
        });

        setUpcomingMaintenance(upcoming);

        // Notify for very urgent ones
        const urgent = upcoming.filter(m => {
          // Urgent date check (within 2 days)
          let dateUrgent = false;
          if (m.nextMaintenance) {
            const maintenanceDate = parseISO(m.nextMaintenance);
            dateUrgent = isBefore(maintenanceDate, addDays(today, 2));
          }

          // Urgent hour check (within 10 hours)
          let hourUrgent = false;
          if (m.nextMaintenanceHours && m.currentHours) {
            hourUrgent = (m.nextMaintenanceHours - m.currentHours) <= 10 && (m.nextMaintenanceHours - m.currentHours) > 0;
          }

          return dateUrgent || hourUrgent;
        });

        urgent.forEach(m => {
          if (!notifiedIds.has(m.id)) {
            const isHourBased = m.nextMaintenanceHours && (m.nextMaintenanceHours - m.currentHours) <= 10;
            toast.warning(`Maintenance Due Soon: ${m.name}`, {
              description: isHourBased
                ? `Machine is at ${m.currentHours}h. Maintenance threshold: ${m.nextMaintenanceHours}h`
                : `Scheduled for ${format(parseISO(m.nextMaintenance!), 'PPP')}`,
              duration: 10000,
            });
            setNotifiedIds(prev => new Set(prev).add(m.id));
          }
        });
      } catch (error) {
        console.error("Error fetching maintenance alerts:", error);
      }
    };

    fetchMaintenance();
    const interval = setInterval(fetchMaintenance, 60000);
    return () => clearInterval(interval);
  }, [notifiedIds]);

  if (upcomingMaintenance.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 text-amber-600 flex items-center justify-center rounded-xl">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-900">Upcoming Maintenance</h3>
            </div>
          </div>
          <span className="px-2.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
            {upcomingMaintenance.length} Pending
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {upcomingMaintenance.map((machine) => (
            <div key={machine.id} className="bg-white/60 backdrop-blur-sm border border-amber-200/50 rounded-xl p-4 flex items-start gap-3">
              <div className="mt-1 p-2 bg-amber-100/50 rounded-lg">
                <Calendar className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{machine.name}</p>
                <p className="text-xs text-amber-700 font-medium">
                  {machine.nextMaintenanceHours && (machine.nextMaintenanceHours - machine.currentHours) <= 50
                    ? `Due at ${Math.round(machine.nextMaintenanceHours * 100) / 100}h (Current: ${Math.round(machine.currentHours * 100) / 100}h)`
                    : machine.nextMaintenance ? format(parseISO(machine.nextMaintenance), 'MMM d, yyyy') : 'N/A'}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {machine.preventivePlan?.slice(0, 2).map(task => (
                    <span key={task.id} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] uppercase font-bold">
                      {task.type}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
