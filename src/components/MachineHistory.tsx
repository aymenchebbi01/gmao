import React, { useState, useEffect } from 'react';
import { WorkOrder, Machine, MachineConditionHistory } from '../types';
import { format } from 'date-fns';
import { toDate, cn, calculateMachineLiveHours } from '../lib/utils';
import { RECOMMENDED_TASKS } from '../constants/maintenanceTasks';
import { api } from '../services/api';
import { 
  History, 
  Calendar, 
  User, 
  Wrench, 
  CheckCircle2, 
  Clock,
  FileText,
  ChevronRight,
  ExternalLink,
  Activity,
  Zap,
  ShieldCheck,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';

interface MachineHistoryProps {
  machineId: string;
  machineName: string;
}

export default function MachineHistory({ machineId, machineName }: MachineHistoryProps) {
  const [history, setHistory] = useState<WorkOrder[]>([]);
  const [conditionHistory, setConditionHistory] = useState<MachineConditionHistory[]>([]);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMetric, setActiveMetric] = useState<'mttr' | 'mtbf' | 'availability' | null>(null);

  useEffect(() => {
    if (!machineId) return;

    const fetchData = async () => {
      try {
        const [machines, orders, condHistory] = await Promise.all([
          api.getMachines(),
          api.getWorkOrders(),
          api.getMachineConditionHistory(machineId)
        ]);
        
        const machineData = machines.find(m => m.id === machineId);
        if (machineData) {
          setMachine(machineData);
        }

        const machineHistory = orders
          .filter(o => o.machineId === machineId && o.status === 'completed')
          .sort((a, b) => new Date(b.completedAt || '').getTime() - new Date(a.completedAt || '').getTime());
        
        setHistory(machineHistory);
        setConditionHistory(condHistory);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching machine history:", error);
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [machineId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm text-gray-500">Loading history...</p>
      </div>
    );
  }

  // Calculate Metrics
  const currentHours = machine ? calculateMachineLiveHours(machine) : 0;
  
  // Calculate live operating time and live downtime
  let liveOperatingTime = machine?.totalOperatingTime || 0; // in minutes
  let liveDownTime = machine?.totalDownTime || 0; // in minutes
  
  // Refine total downtime using completed work orders for more accuracy if needed
  const totalInterventionTime = history.reduce((acc, order) => acc + (order.intervention?.durationMinutes || 0), 0);
  // Use the larger of the two to be conservative, or just use machine.totalDownTime if it's already being updated correctly
  // For this refinement, we'll use the machine's recorded downtime but ensure it's at least the sum of interventions
  liveDownTime = Math.max(liveDownTime, totalInterventionTime);

  if (machine) {
    const now = new Date();
    if (machine.status === 'operational' && machine.operationalStartTime) {
      const start = new Date(machine.operationalStartTime);
      const diffMin = (now.getTime() - start.getTime()) / (1000 * 60);
      if (diffMin > 0) liveOperatingTime += diffMin;
    } else if (machine.status === 'down' && machine.lastHoursUpdate) {
      const start = new Date(machine.lastHoursUpdate);
      const diffMin = (now.getTime() - start.getTime()) / (1000 * 60);
      if (diffMin > 0) liveDownTime += diffMin;
    }
  }

  const failureCount = machine?.failureCount || 0;
  const mtbfVal = failureCount > 0 ? (liveOperatingTime / failureCount / 60) : 0;
  const mttrVal = failureCount > 0 ? (liveDownTime / failureCount) : 0;
  
  const mtbf = failureCount > 0 ? mtbfVal.toFixed(1) : 'N/A'; // in hours
  const mttr = failureCount > 0 ? mttrVal.toFixed(0) : 'N/A'; // in minutes
  const availabilityVal = (liveOperatingTime + liveDownTime) > 0 
    ? (liveOperatingTime / (liveOperatingTime + liveDownTime)) * 100 
    : 100;
  const availability = availabilityVal.toFixed(1);

  // Benchmarks & Color Coding
  const getMtbfColor = (val: number) => {
    if (val === 0) return "text-gray-400";
    if (val >= 500) return "text-emerald-600";
    if (val >= 200) return "text-amber-600";
    return "text-red-600";
  };

  const getMttrColor = (val: number) => {
    if (val === 0) return "text-gray-400";
    if (val <= 60) return "text-emerald-600";
    if (val <= 180) return "text-amber-600";
    return "text-red-600";
  };

  const getAvailabilityColor = (val: number) => {
    if (val >= 95) return "text-emerald-600";
    if (val >= 85) return "text-amber-600";
    return "text-red-600";
  };

  const getMtbfBg = (val: number, active: boolean) => {
    if (active) return "bg-blue-600 border-blue-600 shadow-lg shadow-blue-200";
    if (val === 0) return "bg-white border-gray-100";
    if (val >= 500) return "bg-white border-emerald-100 hover:border-emerald-200 hover:shadow-emerald-50 shadow-sm";
    if (val >= 200) return "bg-white border-amber-100 hover:border-amber-200 hover:shadow-amber-50 shadow-sm";
    return "bg-white border-red-100 hover:border-red-200 hover:shadow-red-50 shadow-sm";
  };

  const getMttrBg = (val: number, active: boolean) => {
    if (active) return "bg-amber-600 border-amber-600 shadow-lg shadow-amber-200";
    if (val === 0) return "bg-white border-gray-100";
    if (val <= 60) return "bg-white border-emerald-100 hover:border-emerald-200 hover:shadow-emerald-50 shadow-sm";
    if (val <= 180) return "bg-white border-amber-100 hover:border-amber-200 hover:shadow-amber-50 shadow-sm";
    return "bg-white border-red-100 hover:border-red-200 hover:shadow-red-50 shadow-sm";
  };

  // Get recommended tasks based on current hours
  const nextTask = RECOMMENDED_TASKS.find(t => t.hours > currentHours) || RECOMMENDED_TASKS[RECOMMENDED_TASKS.length - 1];
  const currentThreshold = RECOMMENDED_TASKS.slice().reverse().find(t => t.hours <= currentHours) || RECOMMENDED_TASKS[0];

  return (
    <div className="space-y-8">
      {/* Mini Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button 
          onClick={() => setActiveMetric(activeMetric === 'mtbf' ? null : 'mtbf')}
          className={cn(
            "p-6 rounded-2xl border transition-all text-left group relative overflow-hidden",
            getMtbfBg(mtbfVal, activeMetric === 'mtbf')
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              "p-2 rounded-xl",
              activeMetric === 'mtbf' ? "bg-white/20 text-white" : 
              mtbfVal >= 500 ? "bg-emerald-50 text-emerald-600" :
              mtbfVal >= 200 ? "bg-amber-50 text-amber-600" :
              mtbfVal > 0 ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
            )}>
              <Zap size={20} />
            </div>
            <TrendingUp className={activeMetric === 'mtbf' ? "text-white/40" : "text-gray-300"} size={16} />
          </div>
          <p className={cn("text-xs font-bold uppercase tracking-wider mb-1", activeMetric === 'mtbf' ? "text-blue-100" : "text-gray-400")}>MTBF</p>
          <h3 className={cn("text-3xl font-black", activeMetric === 'mtbf' ? "text-white" : getMtbfColor(mtbfVal))}>
            {mtbf} <span className="text-sm font-normal">hrs</span>
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <p className={cn("text-[10px]", activeMetric === 'mtbf' ? "text-blue-100" : "text-gray-500")}>Mean Time Between Failures</p>
            {mtbfVal > 0 && !activeMetric && (
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                mtbfVal >= 500 ? "bg-emerald-100 text-emerald-700" :
                mtbfVal >= 200 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
              )}>
                {mtbfVal >= 500 ? "Excellent" : mtbfVal >= 200 ? "Good" : "Poor"}
              </span>
            )}
          </div>
        </button>

        <button 
          onClick={() => setActiveMetric(activeMetric === 'mttr' ? null : 'mttr')}
          className={cn(
            "p-6 rounded-2xl border transition-all text-left group relative overflow-hidden",
            getMttrBg(mttrVal, activeMetric === 'mttr')
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              "p-2 rounded-xl",
              activeMetric === 'mttr' ? "bg-white/20 text-white" : 
              mttrVal > 0 && mttrVal <= 60 ? "bg-emerald-50 text-emerald-600" :
              mttrVal > 60 && mttrVal <= 180 ? "bg-amber-50 text-amber-600" :
              mttrVal > 180 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
            )}>
              <Clock size={20} />
            </div>
            <Activity className={activeMetric === 'mttr' ? "text-white/40" : "text-gray-300"} size={16} />
          </div>
          <p className={cn("text-xs font-bold uppercase tracking-wider mb-1", activeMetric === 'mttr' ? "text-amber-100" : "text-gray-400")}>MTTR</p>
          <h3 className={cn("text-3xl font-black", activeMetric === 'mttr' ? "text-white" : getMttrColor(mttrVal))}>
            {mttr} <span className="text-sm font-normal">min</span>
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <p className={cn("text-[10px]", activeMetric === 'mttr' ? "text-amber-100" : "text-gray-500")}>Mean Time To Repair</p>
            {mttrVal > 0 && !activeMetric && (
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                mttrVal <= 60 ? "bg-emerald-100 text-emerald-700" :
                mttrVal <= 180 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
              )}>
                {mttrVal <= 60 ? "Efficient" : mttrVal <= 180 ? "Average" : "Inefficient"}
              </span>
            )}
          </div>
        </button>

        <button 
          onClick={() => setActiveMetric(activeMetric === 'availability' ? null : 'availability')}
          className={cn(
            "p-6 rounded-2xl border transition-all text-left group relative overflow-hidden",
            activeMetric === 'availability' ? "bg-emerald-600 border-emerald-600 shadow-lg shadow-emerald-200" : 
            availabilityVal >= 95 ? "bg-white border-emerald-100 hover:border-emerald-200 hover:shadow-emerald-50 shadow-sm" :
            availabilityVal >= 85 ? "bg-white border-amber-100 hover:border-amber-200 hover:shadow-amber-50 shadow-sm" :
            "bg-white border-red-100 hover:border-red-200 hover:shadow-red-50 shadow-sm"
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              "p-2 rounded-xl",
              activeMetric === 'availability' ? "bg-white/20 text-white" : 
              availabilityVal >= 95 ? "bg-emerald-50 text-emerald-600" :
              availabilityVal >= 85 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
            )}>
              <ShieldCheck size={20} />
            </div>
            <div className="flex items-center gap-1">
              <span className={cn("text-[10px] font-bold", activeMetric === 'availability' ? "text-emerald-100" : getAvailabilityColor(availabilityVal))}>
                {availability}%
              </span>
              <TrendingUp className={activeMetric === 'availability' ? "text-white/40" : "text-gray-300"} size={16} />
            </div>
          </div>
          <p className={cn("text-xs font-bold uppercase tracking-wider mb-1", activeMetric === 'availability' ? "text-emerald-100" : "text-gray-400")}>Availability Rate</p>
          <h3 className={cn("text-3xl font-black", activeMetric === 'availability' ? "text-white" : getAvailabilityColor(availabilityVal))}>{availability}%</h3>
          <div className="mt-2 w-full h-1 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className={cn("h-full transition-all duration-1000", activeMetric === 'availability' ? "bg-white" : availabilityVal >= 95 ? "bg-emerald-500" : availabilityVal >= 85 ? "bg-amber-500" : "bg-red-500")}
              style={{ width: `${availability}%` }}
            ></div>
          </div>
          <p className={cn("text-[10px] mt-2", activeMetric === 'availability' ? "text-emerald-100" : "text-gray-500")}>Operational Uptime Ratio</p>
        </button>
      </div>

      {/* Metric Details / Interface */}
      {activeMetric && (
        <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
              {activeMetric === 'mtbf' && <Zap className="text-blue-600" size={20} />}
              {activeMetric === 'mttr' && <Clock className="text-amber-600" size={20} />}
              {activeMetric === 'availability' && <ShieldCheck className="text-emerald-600" size={20} />}
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-tight">
                {activeMetric === 'mtbf' ? 'Mean Time Between Failures Analysis' : 
                 activeMetric === 'mttr' ? 'Mean Time To Repair Analysis' : 
                 'Availability & Performance Rate'}
              </h4>
              <p className="text-xs text-gray-500">Detailed breakdown for {machineName}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Key Data Points</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Total Operating Time</span>
                    <span className="font-mono font-bold">{(liveOperatingTime / 60).toFixed(1)} hrs</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Total Down Time</span>
                    <span className="font-mono font-bold">{(liveDownTime / 60).toFixed(1)} hrs</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Failure Count</span>
                    <span className="font-mono font-bold text-red-600">{failureCount}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs text-blue-800 font-medium leading-relaxed">
                  {activeMetric === 'mtbf' && "MTBF measures the average time between inherent failures of a system. A higher MTBF indicates a more reliable machine."}
                  {activeMetric === 'mttr' && "MTTR is the average time required to repair a failed component or device. A lower MTTR indicates more efficient maintenance processes."}
                  {activeMetric === 'availability' && "Availability is the probability that a system is operational at a given time. It is calculated as Uptime / (Uptime + Downtime)."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recommended Tasks Section */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-gray-50/50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Activity size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Recommended Maintenance</h3>
              <p className="text-[10px] text-gray-500">Based on current operational hours: <span className="font-mono font-bold text-blue-600">{currentHours} hrs</span></p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-gray-400 uppercase">Next Major Check</span>
            <span className="text-xs font-bold text-blue-600">{nextTask.hours} hrs ({nextTask.frequency})</span>
          </div>
        </div>
        
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 transition-all duration-1000" 
                style={{ width: `${Math.min((currentHours / nextTask.hours) * 100, 100)}%` }}
              ></div>
            </div>
            <span className="text-xs font-bold text-gray-600">{Math.round((currentHours / nextTask.hours) * 100)}%</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center">
                <AlertTriangle size={14} className="mr-2 text-amber-500" />
                Tasks for {currentThreshold.hours} hrs threshold
              </h4>
              <ul className="space-y-2">
                {currentThreshold.tasks.map((task, i) => (
                  <li key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100/50 text-xs text-gray-700">
                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"></div>
                    {task}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-blue-50/30 rounded-2xl p-6 border border-blue-100/50 flex flex-col justify-center items-center text-center">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                <Clock className="text-blue-600" size={32} />
              </div>
              <h4 className="text-sm font-bold text-gray-900 mb-2">Next Maintenance Cycle</h4>
              <p className="text-xs text-gray-500 mb-4">The machine will reach the next maintenance threshold in approximately</p>
              <div className="text-2xl font-black text-blue-600">
                {Math.max(nextTask.hours - currentHours, 0).toFixed(1)} <span className="text-sm font-normal">hrs</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900 flex items-center">
            <Activity className="w-4 h-4 mr-2 text-emerald-600" />
            Condition Evolution ({conditionHistory.length})
          </h3>
        </div>

        {conditionHistory.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {conditionHistory.map((log) => (
              <div key={log.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 uppercase font-bold">Previous</span>
                    <span className="text-xs font-medium text-gray-500 line-through">{log.previousCondition || 'N/A'}</span>
                  </div>
                  <ChevronRight size={16} className="text-gray-300" />
                  <div className="flex flex-col">
                    <span className="text-[10px] text-emerald-600 uppercase font-bold">New Condition</span>
                    <span className="text-sm font-bold text-gray-900">{log.newCondition}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end text-[10px] text-gray-400 font-medium">
                    <Clock size={10} className="mr-1" />
                    {format(toDate(log.timestamp), 'MMM d, yyyy HH:mm')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl p-6 text-center border border-dashed border-gray-200">
            <p className="text-xs text-gray-500 italic">No condition changes recorded yet.</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900 flex items-center">
            <History className="w-4 h-4 mr-2 text-blue-600" />
            Completed Interventions ({history.length})
          </h3>
        </div>

      <div className="relative">
        {/* Timeline Line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-100 ml-[1px]"></div>

        <div className="space-y-6">
          {history.map((order, index) => (
            <div key={order.id} className="relative pl-10 group">
              {/* Timeline Dot */}
              <div className="absolute left-0 top-1 w-9 h-9 flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-blue-50 z-10"></div>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group-hover:border-blue-100">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                        order.type === 'preventive' ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
                      )}>
                        {order.type}
                      </span>
                      <h4 className="text-sm font-bold text-gray-900">{order.title}</h4>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">{order.description}</p>
                  </div>
                  
                  <div className="flex flex-col items-end text-right shrink-0">
                    <div className="flex items-center text-xs font-medium text-gray-900">
                      <Calendar size={12} className="mr-1.5 text-gray-400" />
                      {order.completedAt ? format(toDate(order.completedAt), 'MMM d, yyyy') : 'N/A'}
                    </div>
                    <div className="flex items-center text-[10px] text-gray-500 mt-1">
                      <Clock size={10} className="mr-1 text-gray-400" />
                      {order.intervention?.durationMinutes || 0} min duration
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center text-xs text-gray-600">
                      <User size={12} className="mr-1.5 text-gray-400" />
                      {order.assignedName || 'Technician'}
                    </div>
                    {order.intervention?.partsUsed && order.intervention.partsUsed.length > 0 && (
                      <div className="flex items-center text-xs text-gray-600">
                        <Wrench size={12} className="mr-1.5 text-gray-400" />
                        {order.intervention.partsUsed.length} parts used
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-gray-400">#{order.id}</span>
                  </div>
                </div>

                {/* Intervention Details (Expandable or just summary) */}
                {order.intervention && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100/50">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Actions Taken</p>
                    <p className="text-xs text-gray-600 italic">"{order.intervention.actions}"</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
  );
}
