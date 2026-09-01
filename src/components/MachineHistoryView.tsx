import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Clock,
  Wrench,
  AlertCircle,
  CheckCircle2,
  User,
  MapPin,
  Calendar,
  Activity,
  ClipboardList,
  Package,
} from 'lucide-react';
import { Machine, WorkOrder } from '../types';
import { api } from '../services/api';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import TableFooter from './ui/TableFooter';
import { FAILURE_CAUSE_CATEGORIES } from './WorkOrderList';

// ── helpers ───────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: WorkOrder['status'] }) {
  const map: Record<string, string> = {
    completed: 'bg-emerald-500',
    'in-progress': 'bg-amber-400',
    pending: 'bg-blue-400',
    cancelled: 'bg-gray-400',
  };
  return (
    <span className={cn('inline-block w-2 h-2 rounded-full mr-1.5 flex-shrink-0', map[status] ?? 'bg-gray-400')} />
  );
}

function MachineDot({ status }: { status: Machine['status'] }) {
  const map: Record<string, string> = {
    operational: 'bg-emerald-500',
    down: 'bg-red-500',
    maintenance: 'bg-amber-400',
    idle: 'bg-purple-400',
    retired: 'bg-gray-400',
  };
  return (
    <span className={cn('inline-block w-2.5 h-2.5 rounded-full flex-shrink-0', map[status] ?? 'bg-gray-400')} />
  );
}

function PriorityPill({ priority }: { priority: WorkOrder['priority'] }) {
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold uppercase', map[priority] ?? 'bg-gray-100 text-gray-600')}>
      {priority}
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={cn('h-1 w-full', accent)} />
      <div className="p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5 truncate" title={sub}>{sub}</p>}
      </div>
    </div>
  );
}

/** Resolve failure cause label from WorkOrder fields */
function resolveCauseLabel(wo: WorkOrder): string {
  const intervention = wo.intervention;
  if (!intervention) return '—';
  const causeId = intervention.failureCause;
  if (!causeId) return intervention.relatedCause || '—';
  for (const cat of FAILURE_CAUSE_CATEGORIES) {
    const found = cat.causes.find(c => c.id === causeId);
    if (found) return found.labelFr;
  }
  return causeId;
}

function fmtDuration(minutes: number | undefined): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ── Row detail panel ─────────────────────────────────────────────────────────

function RowDetail({ wo }: { wo: WorkOrder }) {
  const iv = wo.intervention;
  return (
    <div className="bg-gray-50/80 border-t border-gray-100 px-6 py-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Left */}
        <div className="space-y-3">
          {wo.description && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Description</p>
              <p className="text-sm text-gray-700">{wo.description}</p>
            </div>
          )}
          {iv?.malfunctionDescription && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Dysfonctionnement</p>
              <p className="text-sm text-gray-700">{iv.malfunctionDescription}</p>
            </div>
          )}
          {iv?.actions && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Actions effectuées</p>
              <p className="text-sm text-gray-700">{iv.actions}</p>
            </div>
          )}
          {iv?.difficulties && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Difficultés</p>
              <p className="text-sm text-gray-700">{iv.difficulties}</p>
            </div>
          )}
          {iv?.comments && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Commentaires</p>
              <p className="text-sm text-gray-700">{iv.comments}</p>
            </div>
          )}
        </div>

        {/* Right */}
        <div className="space-y-3">
          {iv?.operations && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Opérations</p>
              <div className="flex flex-wrap gap-1.5">
                {iv.operations.replacement && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">Remplacement</span>}
                {iv.operations.diagnostic && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">Diagnostic</span>}
                {iv.operations.improvement && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">Amélioration</span>}
                {iv.operations.control && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">Contrôle</span>}
              </div>
            </div>
          )}

          {iv?.partsUsed && iv.partsUsed.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                Pièces utilisées
              </p>
              <div className="space-y-1">
                {iv.partsUsed.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Package size={12} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-700">{p.name}</span>
                    <span className="text-gray-400">×{p.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            {iv?.issuerName && (
              <div>
                <span className="text-gray-400 font-bold uppercase tracking-widest text-[9px] block">Émetteur</span>
                <span className="text-gray-700">{iv.issuerName}</span>
              </div>
            )}
            {iv?.requesterName && (
              <div>
                <span className="text-gray-400 font-bold uppercase tracking-widest text-[9px] block">Demandeur</span>
                <span className="text-gray-700">{iv.requesterName}</span>
              </div>
            )}
            {wo.reportNumber && (
              <div>
                <span className="text-gray-400 font-bold uppercase tracking-widest text-[9px] block">N° Rapport</span>
                <span className="text-gray-700 font-mono">{wo.reportNumber}</span>
              </div>
            )}
            {iv?.currentHours && (
              <div>
                <span className="text-gray-400 font-bold uppercase tracking-widest text-[9px] block">Heures machine</span>
                <span className="text-gray-700">{iv.currentHours}h</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MachineHistoryView() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [searchMachine, setSearchMachine] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [mList, woList] = await Promise.all([api.getMachines(), api.getWorkOrders()]);
        setMachines(mList);
        setWorkOrders(woList);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Filtered machine list ─────────────────────────────────────────────────
  const filteredMachines = useMemo(() =>
    machines.filter(m =>
      m.name.toLowerCase().includes(searchMachine.toLowerCase()) ||
      (m.siteNumber || '').toLowerCase().includes(searchMachine.toLowerCase()) ||
      m.serialNumber.toLowerCase().includes(searchMachine.toLowerCase())
    ),
    [machines, searchMachine]
  );

  // ── Work orders for selected machine ─────────────────────────────────────
  const machineWOs = useMemo(() => {
    if (!selectedMachine) return [];
    return workOrders
      .filter(wo => wo.machineId === selectedMachine.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [workOrders, selectedMachine]);

  // ── KPI stats ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = machineWOs.length;

    // Most frequent failure cause
    const causeCounts: Record<string, number> = {};
    machineWOs.forEach(wo => {
      const label = resolveCauseLabel(wo);
      if (label !== '—') causeCounts[label] = (causeCounts[label] || 0) + 1;
    });
    const topCause = Object.entries(causeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

    // Last intervention date
    const completed = machineWOs.filter(wo => wo.completedAt || wo.status === 'completed');
    const lastDate = completed.length > 0
      ? format(new Date(completed[0].completedAt || completed[0].createdAt), 'dd/MM/yyyy')
      : '—';

    return { total, topCause, lastDate };
  }, [machineWOs]);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(machineWOs.length / pageSize));
  const pagedWOs = machineWOs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Historique des Interventions</h1>
        <p className="text-sm text-gray-500 mt-0.5">Sélectionnez une machine pour voir toutes ses interventions</p>
      </div>

      {/* Machine picker */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Rechercher une machine</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Nom, N° site, N° série..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            value={searchMachine}
            onChange={e => { setSearchMachine(e.target.value); setSelectedMachine(null); }}
          />
        </div>

        {searchMachine && (
          <div className="mt-2 border border-gray-100 rounded-xl overflow-hidden shadow-sm max-h-48 overflow-y-auto">
            {filteredMachines.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-400">Aucune machine trouvée</div>
            ) : (
              filteredMachines.map(m => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedMachine(m); setSearchMachine(''); setCurrentPage(1); setExpandedRows(new Set()); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-gray-50 last:border-0"
                >
                  <MachineDot status={m.status} />
                  <span className="text-sm font-medium text-gray-900">{m.name}</span>
                  <span className="text-xs text-gray-400">#{m.siteNumber || 'N/A'}</span>
                  <span className="text-xs text-gray-400 ml-auto">{m.location}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Machine header card */}
      {selectedMachine && (
        <>
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                {selectedMachine.imageUrl ? (
                  <img
                    src={selectedMachine.imageUrl}
                    alt={selectedMachine.name}
                    className="w-14 h-14 rounded-xl object-cover border border-gray-100"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100">
                    <Wrench className="text-blue-600" size={22} />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900">{selectedMachine.name}</h2>
                    <MachineDot status={selectedMachine.status} />
                    <span className="text-xs text-gray-500 capitalize">{selectedMachine.status}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-gray-500 font-mono">#{selectedMachine.siteNumber || selectedMachine.id}</span>
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <MapPin size={11} /> {selectedMachine.location}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Activity size={11} /> {selectedMachine.type}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedMachine(null)}
                className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Changer
              </button>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              label="Total interventions"
              value={stats.total}
              accent="bg-blue-500"
            />
            <KpiCard
              label="Cause la plus fréquente"
              value={stats.topCause === '—' ? <span className="text-gray-400 text-base">—</span> : stats.topCause}
              accent="bg-amber-400"
            />
            <KpiCard
              label="Dernière intervention"
              value={stats.lastDate}
              accent="bg-emerald-500"
            />
          </div>

          {/* Intervention table */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
            {machineWOs.length === 0 ? (
              <div className="py-16 text-center">
                <ClipboardList className="mx-auto text-gray-300 mb-3" size={40} />
                <p className="text-sm font-medium text-gray-500">Aucune intervention enregistrée pour cette machine</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50/50 border-b border-gray-100">
                        <th className="px-4 py-3 w-8" />
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Cause de défaillance</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Technicien(s)</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Durée</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedWOs.map(wo => {
                        const expanded = expandedRows.has(wo.id);
                        const causeLabel = resolveCauseLabel(wo);
                        const duration = wo.intervention?.durationMinutes;
                        const technicians = wo.intervention?.technicians || wo.assignedName || '—';
                        return (
                          <React.Fragment key={wo.id}>
                            <tr
                              className={cn(
                                'border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer',
                                expanded && 'bg-blue-50/30'
                              )}
                              onClick={() => toggleRow(wo.id)}
                            >
                              <td className="px-4 py-3">
                                {expanded
                                  ? <ChevronDown size={14} className="text-blue-600" />
                                  : <ChevronRight size={14} className="text-gray-400" />
                                }
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <Calendar size={12} className="text-gray-400 flex-shrink-0" />
                                  <span className="text-sm text-gray-700 whitespace-nowrap">
                                    {format(new Date(wo.createdAt), 'dd/MM/yyyy')}
                                  </span>
                                </div>
                                {wo.reportNumber && (
                                  <span className="text-[10px] text-gray-400 font-mono ml-5">#{wo.reportNumber}</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className={cn(
                                  'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                                  wo.type === 'corrective' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                )}>
                                  {wo.type === 'corrective' ? 'Corrective' : 'Préventive'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-sm text-gray-700">{causeLabel}</span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <User size={12} className="text-gray-400 flex-shrink-0" />
                                  <span className="text-sm text-gray-700 truncate max-w-[140px]" title={technicians}>
                                    {technicians}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <Clock size={12} className="text-gray-400 flex-shrink-0" />
                                  <span className="text-sm text-gray-700">{fmtDuration(duration)}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={cn(
                                  'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border',
                                  wo.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                    wo.status === 'in-progress' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                      wo.status === 'cancelled' ? 'bg-gray-50 text-gray-500 border-gray-100' :
                                        'bg-blue-50 text-blue-700 border-blue-100'
                                )}>
                                  <StatusDot status={wo.status} />
                                  {wo.status === 'completed' ? 'Terminé' :
                                    wo.status === 'in-progress' ? 'En cours' :
                                      wo.status === 'cancelled' ? 'Annulé' : 'En attente'}
                                </span>
                              </td>
                            </tr>
                            {expanded && (
                              <tr className="border-b border-gray-100">
                                <td colSpan={7} className="p-0">
                                  <RowDetail wo={wo} />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <TableFooter
                  totalItems={machineWOs.length}
                  pageSize={pageSize}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageSizeChange={s => { setPageSize(s); setCurrentPage(1); }}
                  onPageChange={setCurrentPage}
                />
              </>
            )}
          </div>
        </>
      )}

      {!selectedMachine && !searchMachine && !loading && (
        <div className="py-20 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-2xl mb-4">
            <Search className="text-blue-400" size={28} />
          </div>
          <p className="text-base font-medium text-gray-600">Recherchez une machine pour commencer</p>
          <p className="text-sm text-gray-400 mt-1">Tapez le nom, le numéro de site ou le numéro de série</p>
        </div>
      )}
    </div>
  );
}
