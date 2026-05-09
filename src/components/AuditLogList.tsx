import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { AuditLog } from '../types';
import { format } from 'date-fns';
import { History, User, Tag, Info, Calendar } from 'lucide-react';
import TableFooter from './ui/TableFooter';

export default function AuditLogList() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);
  const [filterDate, setFilterDate] = useState('');
  const [searchUser, setSearchUser] = useState('');

  const [machines, setMachines] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [spareParts, setSpareParts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [logsData, machinesData, workOrdersData, sparePartsData, usersData] = await Promise.all([
          api.getAuditLogs(filterDate || undefined, searchUser || undefined),
          api.getMachines(),
          api.getWorkOrders(),
          api.getSpareParts(),
          api.getUsers()
        ]);
        setLogs(logsData);
        setMachines(machinesData);
        setWorkOrders(workOrdersData);
        setSpareParts(sparePartsData);
        setUsers(usersData);
        setCurrentPage(1); // Reset to first page on filter change
      } catch (error) {
        console.error('Error fetching audit logs:', error);
      } finally {
        setLoading(false);
      }
    };

    // Add a small debounce for user search
    const timer = setTimeout(() => {
      fetchData();
    }, filterDate ? 0 : 300); // No debounce for date, 300ms for user text

    return () => clearTimeout(timer);
  }, [filterDate, searchUser]);

  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
  const pagedLogs = logs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (loading && logs.length === 0) return <div className="p-8 text-center">Loading audit logs...</div>;

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 text-white flex items-center justify-center rounded-xl shadow-lg shadow-indigo-600/20">
            <History size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Audit Logs</h2>
            <p className="text-xs text-gray-500 font-medium">System activity and change history</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-gray-100 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all ${loading ? 'opacity-70' : ''}`}>
            <User size={16} className={`${loading ? 'animate-pulse text-indigo-400' : 'text-indigo-500'}`} />
            <input
              type="text"
              placeholder="Search user..."
              value={searchUser}
              onChange={(e) => setSearchUser(e.target.value)}
              className="text-sm font-medium text-gray-700 border-none bg-transparent focus:ring-0 p-0 outline-none w-32"
            />
            {loading && <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />}
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-gray-100 shadow-sm">
            <Calendar size={16} className="text-indigo-500" />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="text-sm font-medium text-gray-700 border-none bg-transparent focus:ring-0 p-0 outline-none w-32"
            />
            {filterDate && (
              <button
                onClick={() => setFilterDate('')}
                className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors"
                title="Clear filter"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Timestamp</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">User</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Action</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Entity</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {pagedLogs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                {(() => {
                  const typeLower = log.entityType.toLowerCase();
                  let displayId = log.entityId;

                  if (typeLower === 'machine') {
                    const machine = machines.find(m => m.id === log.entityId);
                    if (machine) displayId = machine.name || machine.serialNumber;
                  } else if (typeLower === 'workorder') {
                    const workOrder = workOrders.find(wo => wo.id === log.entityId);
                    if (workOrder) displayId = workOrder.title;
                  } else if (typeLower === 'sparepart') {
                    const part = spareParts.find(sp => sp.id === log.entityId);
                    if (part) displayId = part.name;
                  } else if (typeLower === 'user') {
                    const user = users.find(u => u.uid === log.entityId);
                    if (user) displayId = user.displayName || user.username;
                  }

                  const isRawId = displayId === log.entityId;
                  const displayDetails = log.details;

                  return (
                    <>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar size={14} className="text-gray-400" />
                          {format(new Date(log.createdAt), 'MMM d, HH:mm:ss')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600">
                            <User size={14} />
                          </div>
                          <span className="text-sm font-bold text-gray-900">{log.username}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          const actionStyles: Record<string, string> = {
                            Create: 'bg-emerald-50 text-emerald-700 border-emerald-100',
                            Update: 'bg-indigo-50 text-indigo-700 border-indigo-100',
                            Delete: 'bg-red-50 text-red-700 border-red-100',
                            Login: 'bg-blue-50 text-blue-700 border-blue-100',
                            Signup: 'bg-purple-50 text-purple-700 border-purple-100',
                            SCAN_QR: 'bg-cyan-50 text-cyan-700 border-cyan-100',
                            ACCESS_MACHINE: 'bg-sky-50 text-sky-700 border-sky-100',
                            CHANGE_STATUS: 'bg-amber-50 text-amber-700 border-amber-100',
                            ASSIGN_MACHINE: 'bg-violet-50 text-violet-700 border-violet-100',
                            START_MACHINE: 'bg-green-50 text-green-700 border-green-100',
                            STOP_MACHINE: 'bg-orange-50 text-orange-700 border-orange-100',
                          };
                          const cls = actionStyles[log.action] || 'bg-gray-50 text-gray-700 border-gray-200';
                          const label = log.action.replace(/_/g, ' ');
                          return (
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${cls}`}>
                              {label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Tag size={14} className="text-gray-400" />
                          <span className="font-medium text-gray-700 capitalize">
                            {log.entityType.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          <span className="text-xs text-gray-500 font-medium">
                            {isRawId ? `#${displayId.substring(0, 8)}` : displayId}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-500 italic">
                          <Info size={14} className="text-gray-400" />
                          {displayDetails}
                        </div>
                      </td>
                    </>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {logs.length === 500 && (
        <div className="px-6 py-2 bg-amber-50 text-amber-700 text-xs font-medium border-t border-amber-100 flex items-center gap-2">
          <Info size={12} />
          Search results are limited to the most recent 500 events for performance.
        </div>
      )}
      <TableFooter
        totalItems={logs.length}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
