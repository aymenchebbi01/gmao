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

  const [machines, setMachines] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [logsData, machinesData] = await Promise.all([
          api.getAuditLogs(),
          api.getMachines()
        ]);
        setLogs(logsData);
        setMachines(machinesData);
      } catch (error) {
        console.error('Error fetching audit logs:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
  const pagedLogs = logs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (loading) return <div className="p-8 text-center">Loading audit logs...</div>;

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
                  const machine = log.entityType === 'machine' ? machines.find(m => m.id === log.entityId) : null;
                  const displayId = machine ? (machine.serialNumber || machine.name) : log.entityId.substring(0, 8);

                  // Helper to clean up details string if it contains the raw ID
                  let displayDetails = log.details;
                  if (displayDetails.includes(log.entityId)) {
                    displayDetails = displayDetails.replace(log.entityId, machine ? (machine.serialNumber || machine.name) : log.entityId.substring(0, 8));
                  }

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
                        <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-100">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Tag size={14} className="text-gray-400" />
                          <span className="font-medium text-gray-700 capitalize">{log.entityType}</span>
                          <span className="text-xs text-gray-400 font-mono">#{displayId}</span>
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
