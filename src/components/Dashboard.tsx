import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  MapPin
} from 'lucide-react';
import { Machine, WorkOrder } from '../types';
import { cn, toDate } from '../lib/utils';
import { toast } from 'sonner';
import MaintenanceAlerts from './MaintenanceAlerts';
import { api } from '../services/api';

// COLORS for charts
const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6'];

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: string; positive: boolean };
  color: string;
}

const StatCard = ({ title, value, icon: Icon, trend, color }: StatCardProps) => (
  <div className="p-6 bg-white border border-gray-100 rounded-2xl shadow-sm">
    <div className="flex items-center justify-between mb-4">
      <div className={cn("p-2 rounded-lg", color)}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      {trend && (
        <div className={cn(
          "flex items-center text-xs font-medium px-2 py-1 rounded-full",
          trend.positive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        )}>
          {trend.positive ? <ArrowUpRight size={14} className="mr-1" /> : <ArrowDownRight size={14} className="mr-1" />}
          {trend.value}
        </div>
      )}
    </div>
    <p className="text-sm font-medium text-gray-500">{title}</p>
    <h3 className="mt-1 text-2xl font-bold text-gray-900">{value}</h3>
  </div>
);

export default function Dashboard({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const prevStatuses = useRef<Record<string, string>>({});
  const [stats, setStats] = useState({
    totalMachines: 0,
    downMachines: 0,
    maintenanceMachines: 0,
    pendingOrders: 0,
    completedOrders: 0,
    mttr: '0h',
    mtbf: '0h'
  });

  const [recentOrders, setRecentOrders] = useState<WorkOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [machinesData, ordersData] = await Promise.all([
          api.getMachines(),
          api.getWorkOrders()
        ]);

        // Machines logic
        machinesData.forEach(machine => {
          const prevStatus = prevStatuses.current[machine.id];
          if (prevStatus && prevStatus !== machine.status) {
            if (machine.status === 'down') {
              toast.error(`CRITICAL: Machine "${machine.name}" is DOWN!`, {
                description: `Location: ${machine.location}`,
                duration: 8000,
              });
            } else if (machine.status === 'maintenance') {
              toast.warning(`Machine "${machine.name}" moved to maintenance.`, {
                description: `Location: ${machine.location}`,
              });
            }
          }
          prevStatuses.current[machine.id] = machine.status;
        });

        setMachines(machinesData);
        const total = machinesData.length;
        const down = machinesData.filter(i => i.status === 'down').length;
        const operational = machinesData.filter(i => i.status === 'operational').length;
        const maintenance = machinesData.filter(i => i.status === 'maintenance').length;
        const idle = machinesData.filter(i => i.status === 'idle').length;

        setStats(prev => ({ 
          ...prev, 
          totalMachines: total, 
          downMachines: down,
          maintenanceMachines: maintenance 
        }));
        setStatusData([
          { name: 'Operational', value: operational },
          { name: 'Down', value: down },
          { name: 'Maintenance', value: maintenance },
          { name: 'Idle', value: idle },
        ]);

        // Orders logic
        const sortedOrders = [...ordersData].sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
        const pending = sortedOrders.filter(i => i.status !== 'completed').length;
        const completed = sortedOrders.filter(i => i.status === 'completed');

        let totalDuration = 0;
        let completedWithReport = 0;
        completed.forEach(order => {
          if (order.intervention?.durationMinutes) {
            totalDuration += order.intervention.durationMinutes;
            completedWithReport++;
          }
        });

        const avgMttr = completedWithReport > 0 ? (totalDuration / completedWithReport / 60).toFixed(1) : '0';

        setStats(prev => ({
          ...prev,
          pendingOrders: pending,
          completedOrders: completed.length,
          mttr: `${avgMttr}h`
        }));

        setRecentOrders(sortedOrders.slice(0, 5));

        // Simple chart data (last 7 days)
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const last7Days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          return {
            name: days[d.getDay()],
            corrective: 0,
            preventive: 0,
            date: d.toISOString().split('T')[0]
          };
        }).reverse();

        sortedOrders.forEach(order => {
          let orderDate = '';
          if (order.createdAt) {
            const date = toDate(order.createdAt);
            orderDate = date.toISOString().split('T')[0];
          }
          const day = last7Days.find(d => d.date === orderDate);
          if (day) {
            if (order.type === 'corrective') day.corrective++;
            else day.preventive++;
          }
        });
        setChartData(last7Days);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Maintenance Dashboard</h1>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Machines" value={stats.totalMachines} icon={Activity} color="bg-blue-500" />
        <StatCard title="Machines Down" value={stats.downMachines} icon={AlertTriangle} color="bg-red-500" />
        <StatCard title="Pending Orders" value={stats.pendingOrders} icon={Clock} color="bg-amber-500" />
        <StatCard title="MTTR (Avg)" value={stats.mttr} icon={TrendingUp} color="bg-emerald-500" />
      </div>

      {/* Maintenance Alerts */}
      <MaintenanceAlerts />

      {/* Critical & Maintenance Alerts Section */}
      {(stats.downMachines > 0 || stats.maintenanceMachines > 0) && (
        <div className={cn(
          "p-6 rounded-2xl flex flex-col gap-4 border",
          stats.downMachines > 0 ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"
        )}>
          <div className="flex items-start gap-4">
            <div className={cn(
              "p-2 rounded-lg animate-pulse",
              stats.downMachines > 0 ? "bg-red-500" : "bg-amber-500"
            )}>
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className={cn(
                "text-sm font-bold",
                stats.downMachines > 0 ? "text-red-900" : "text-amber-900"
              )}>
                {stats.downMachines > 0 ? `Critical Alert: ${stats.downMachines} Machine(s) Currently Down` : `Maintenance Alert: ${stats.maintenanceMachines} Machine(s) in Maintenance`}
              </h4>
              {stats.downMachines > 0 && stats.maintenanceMachines > 0 && (
                <p className="text-xs text-red-700 mt-1">Also {stats.maintenanceMachines} machine(s) in maintenance.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
            {machines.filter(m => m.status === 'down' || m.status === 'maintenance').map(machine => (
              <div
                key={machine.id}
                onClick={() => setActiveTab('machines')}
                className={cn(
                  "flex items-center p-3 bg-white border rounded-xl shadow-sm cursor-pointer transition-colors",
                  machine.status === 'down' ? "border-red-200 hover:bg-red-50" : "border-amber-200 hover:bg-amber-50"
                )}
              >
                <div className={cn(
                  "w-2 h-2 rounded-full mr-3 animate-ping",
                  machine.status === 'down' ? "bg-red-500" : "bg-amber-500"
                )}></div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-900">{machine.name}</p>
                    <span className={cn(
                      "text-[8px] px-1.5 py-0.5 rounded uppercase font-bold",
                      machine.status === 'down' ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {machine.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 font-mono">{machine.serialNumber}</p>
                  {machine.statusReason && (
                    <p className="text-[9px] text-gray-400 italic mt-1 truncate">"{machine.statusReason}"</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main Chart */}
        <div className="p-6 bg-white border border-gray-100 shadow-sm lg:col-span-2 rounded-2xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900">Interventions</h3>
            <div className="flex items-center space-x-4 text-xs">
              <div className="flex items-center"><div className="w-3 h-3 mr-1 bg-blue-500 rounded-full"></div> Corrective</div>
              <div className="flex items-center"><div className="w-3 h-3 mr-1 bg-emerald-500 rounded-full"></div> Preventive</div>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f9fafb' }}
                />
                <Bar dataKey="corrective" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="preventive" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="p-6 bg-white border border-gray-100 shadow-sm rounded-2xl">
          <h3 className="mb-6 text-lg font-bold text-gray-900">Machine Status</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-3">
            {statusData.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 mr-2 rounded-full" style={{ backgroundColor: COLORS[index] }}></div>
                  <span className="text-sm text-gray-600">{item.name}</span>
                </div>
                <span className="text-sm font-bold text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="p-6 bg-white border border-gray-100 shadow-sm rounded-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900">Recent Maintenance Orders</h3>
          <button
            onClick={() => setActiveTab('work-orders-list')}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            View all
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="pb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Order</th>
                <th className="pb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Machine</th>
                <th className="pb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Priority</th>
                <th className="pb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="pb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentOrders.map((order) => {
                const machine = machines.find(m => m.id === order.machineId);
                const isMachineDown = machine?.status === 'down';

                return (
                  <tr
                    key={order.id}
                    onClick={() => setActiveTab('work-orders-list')}
                    className={cn(
                      "group hover:bg-gray-50 transition-colors border-l-4 cursor-pointer",
                      isMachineDown ? "bg-red-50/30 border-red-500" : "border-transparent"
                    )}
                  >
                    <td className="py-4 px-4">
                      <p className="text-sm font-medium text-gray-900">{order.title}</p>
                      <p className="text-xs text-gray-500 capitalize">{order.type}</p>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center">
                        <span className="text-sm text-gray-600">{order.machineName}</span>
                        {isMachineDown && (
                          <span className="ml-2 px-1.5 py-0.5 bg-red-100 text-red-700 text-[8px] font-bold rounded uppercase animate-pulse">
                            Machine Down
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                        order.priority === 'high' || order.priority === 'critical' ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
                      )}>
                        {order.priority}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center">
                        <div className={cn(
                          "w-2 h-2 mr-2 rounded-full",
                          order.status === 'completed' ? "bg-green-500" : order.status === 'in-progress' ? "bg-blue-500" : "bg-amber-500"
                        )}></div>
                        <span className="text-sm text-gray-600 capitalize">{order.status}</span>
                      </div>
                    </td>
                    <td className="py-4 text-right pr-4">
                      <button className="p-2 text-gray-400 hover:text-blue-600 transition-colors">
                        <ArrowUpRight size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
