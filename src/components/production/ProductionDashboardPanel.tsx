import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Layers, Package, Award, Calendar, ArrowUpRight } from 'lucide-react';
import { productionDashboardService } from '../../services/productionApi';
import { ProductionDashboardStats } from '../../types';
import { useNavigate } from 'react-router-dom';

export default function ProductionDashboardPanel() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<ProductionDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    productionDashboardService.getStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-4 text-xs text-slate-400 animate-pulse">Loading production metrics...</div>;
  }

  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Production Output & Orders</h2>
        </div>

        <button
          onClick={() => navigate('/production-dashboard')}
          className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
        >
          <span>Production Dashboard</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Today's Output</span>
            <Layers className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono">{(stats?.todayTotal || 0).toLocaleString()}</p>
          <span className="text-[10px] text-slate-400">Total units produced today</span>
        </div>

        <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Pending Orders</span>
            <Package className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-600 font-mono">{stats?.pendingOrders || 0}</p>
          <span className="text-[10px] text-slate-400">Supplier orders in progress</span>
        </div>

        <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Top Worker (30d)</span>
            <Award className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-lg font-bold text-slate-900 truncate">{stats?.topWorker || 'N/A'}</p>
          <span className="text-[10px] text-slate-400">Highest volume producer</span>
        </div>

        <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Planned Sets</span>
            <Calendar className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono">{stats?.planningItems || 0}</p>
          <span className="text-[10px] text-slate-400">Active planning entries</span>
        </div>
      </div>
    </div>
  );
}
