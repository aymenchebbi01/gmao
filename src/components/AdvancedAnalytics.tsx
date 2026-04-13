import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { DowntimeTrend, PartConsumption, TechnicianPerformance, MttrTrend, MtbfTrend } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingDown, Package, Users, BarChart3, Clock, CheckCircle2, Zap, Activity } from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AdvancedAnalytics() {
  const [downtimeTrends, setDowntimeTrends] = useState<DowntimeTrend[]>([]);
  const [partConsumption, setPartConsumption] = useState<PartConsumption[]>([]);
  const [techPerformance, setTechPerformance] = useState<TechnicianPerformance[]>([]);
  const [mttrTrends, setMttrTrends] = useState<MttrTrend[]>([]);
  const [mtbfTrends, setMtbfTrends] = useState<MtbfTrend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const [d, p, t, mttr, mtbf] = await Promise.all([
          api.getDowntimeTrends(),
          api.getPartConsumption(),
          api.getTechnicianPerformance(),
          api.getMttrTrends(),
          api.getMtbfTrends()
        ]);
        setDowntimeTrends(d);
        setPartConsumption(p);
        setTechPerformance(t);
        setMttrTrends(mttr);
        setMtbfTrends(mtbf);
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) return <div className="p-8 text-center">Loading analytics...</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-blue-600 text-white flex items-center justify-center rounded-2xl shadow-lg shadow-blue-600/20">
          <BarChart3 size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* MTBF Trends */}
        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Zap size={20} />
            </div>
            <h2 className="text-lg font-bold text-gray-900">MTBF (Hours)</h2>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mtbfTrends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#1e293b' }}
                />
                <Line type="monotone" dataKey="mtbfHours" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* MTTR Trends */}
        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Clock size={20} />
            </div>
            <h2 className="text-lg font-bold text-gray-900">MTTR (Minutes)</h2>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mttrTrends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#1e293b' }}
                />
                <Line type="monotone" dataKey="mttrMinutes" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Downtime Trends */}
        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-red-50 text-red-600 rounded-xl">
              <TrendingDown size={20} />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Downtime (Last 30 Days)</h2>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={downtimeTrends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#1e293b' }}
                />
                <Line type="monotone" dataKey="downtimeMinutes" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Spare Part Consumption */}
        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Package size={20} />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Spare Part Consumption</h2>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={partConsumption}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="quantity"
                  nameKey="partName"
                >
                  {partConsumption.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Technician Performance */}
        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100 lg:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Users size={20} />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Technician Performance</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {techPerformance.map((tech, i) => (
              <div key={i} className="p-6 bg-gray-50/50 rounded-2xl border border-gray-100 hover:border-emerald-200 transition-all group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm group-hover:shadow-md transition-all">
                    <Users size={20} />
                  </div>
                  <h3 className="font-bold text-gray-900">{tech.technicianName}</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">
                      <CheckCircle2 size={12} className="text-emerald-500" />
                      Orders
                    </div>
                    <p className="text-xl font-bold text-gray-900">{tech.completedOrders}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">
                      <Clock size={12} className="text-blue-500" />
                      Avg Time
                    </div>
                    <p className="text-xl font-bold text-gray-900">{Math.round(tech.avgDurationMinutes)}m</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
