import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  HardDrive,
  MapPin,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  Wrench,
  QrCode,
  Printer,
  History,
  Download,
  Camera,
  Upload,
  RotateCw,
  X
} from 'lucide-react';
import { Machine } from '../types';
import { cn, toDate, calculateMachineLiveHours, formatHoursToDays } from '../lib/utils';
import { RECOMMENDED_TASKS } from '../constants/maintenanceTasks';
import Modal from './ui/Modal';
import MachineHistory from './MachineHistory';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'sonner';
import { Trash2, Edit2 } from 'lucide-react';
import { api } from '../services/api';
import { exportToCSV } from '../lib/exportUtils';
import { format } from 'date-fns';
import TableFooter from './ui/TableFooter';
import { useGmaoStore } from '../store/gmaoStore';
import { useAuth } from '../contexts/AuthContext';

interface MachineListProps {
  historyMachineId?: string | null;
  onHistoryClose?: () => void;
}

export default function MachineList({ historyMachineId, onHistoryClose }: MachineListProps = {}) {
  const { user, isAdmin } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'manager';
  const [machines, setMachines] = useState<Machine[]>([]);
  const prevStatuses = useRef<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [serverLanUrl, setServerLanUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [newHours, setNewHours] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);
  const [refreshing, setRefreshing] = useState(false);

  // Update current time every minute to refresh live hours display
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Fetch server LAN IP when opening QR Code modal to ensure mobile scanning works
  useEffect(() => {
    if (isQrModalOpen && selectedMachine) {
      if (
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1' &&
        !window.location.hostname.includes('192.168.237.')
      ) {
        setServerLanUrl(`${window.location.origin}/mobile-status?id=${selectedMachine.id}`);
      } else {
        api.getServerIp()
          .then((res) => {
            const port = window.location.port || res.port || 5033;
            setServerLanUrl(`http://${res.ip}:${port}/mobile-status?id=${selectedMachine.id}`);
          })
          .catch((err) => {
            console.error("Failed to fetch server IP:", err);
            setServerLanUrl(`http://localhost:5033/mobile-status?id=${selectedMachine.id}`);
          });
      }
    }
  }, [isQrModalOpen, selectedMachine]);

  const calculateLiveHours = (machine: Machine) => {
    return calculateMachineLiveHours(machine);
  };

  const generateRecommendedPlan = (): any[] => {
    return RECOMMENDED_TASKS.flatMap(group =>
      group.tasks.map(taskDesc => ({
        id: Math.random().toString(36).substr(2, 9),
        type: 'inspection',
        frequency: 'hours',
        frequencyHours: group.hours,
        description: taskDesc
      }))
    );
  };

  // Form state
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    serialNumber: '',
    injectingProduct: '',
    type: 'Simple Injection',
    manufacturingYear: new Date().getFullYear(),
    location: '',
    siteNumber: '',
    clampingForce: 0,
    condition: 'Excellent',
    status: 'operational' as Machine['status'],
    nextMaintenance: '',
    installationDate: '',
    currentHours: 0,
    imageUrl: '',
    preventivePlan: [] as any[]
  });

  // Auto-update hours in form if operational
  useEffect(() => {
    if (isModalOpen && isEditMode && selectedMachine && formData.status === 'operational') {
      const live = calculateLiveHours(selectedMachine);
      if (Math.abs(live - formData.currentHours) > 0.01) {
        setFormData(prev => ({ ...prev, currentHours: live }));
      }
    }
  }, [currentTime, isModalOpen, isEditMode, selectedMachine, formData.status]);

  const [newTask, setNewTask] = useState({
    type: 'inspection' as const,
    frequency: 'monthly' as const,
    frequencyHours: 0,
    description: ''
  });

  const { setMachineStatuses, setMachineHours: setMachineHoursStore, updateMachineHour } = useGmaoStore.getState();

  const fetchMachines = async (showToast = false) => {
    if (showToast) setRefreshing(true);
    try {
      const items = await api.getMachines();

      // Check for status changes to trigger notifications
      items.forEach(machine => {
        const prevStatus = prevStatuses.current[machine.id];
        if (prevStatus && prevStatus !== machine.status) {
          if (machine.status === 'down') {
            toast.error(`Machine "${machine.name}" is DOWN!`, {
              description: `Location: ${machine.location}`,
              duration: 5000,
            });
          } else if (machine.status === 'maintenance') {
            toast.warning(`Machine "${machine.name}" is now in maintenance.`, {
              description: `Location: ${machine.location}`,
            });
          }
        }
        prevStatuses.current[machine.id] = machine.status;
      });

      setMachines(items);
      // Propagate to global store so Dashboard updates reactively
      setMachineStatuses(items);
      setMachineHoursStore(items);
      if (showToast) toast.success('Machine list refreshed');
    } catch (error) {
      console.error("Error fetching machines:", error);
      if (showToast) toast.error('Failed to refresh machines');
    } finally {
      if (showToast) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMachines();
    const interval = setInterval(() => fetchMachines(false), 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Handle opening history from another tab
  useEffect(() => {
    if (historyMachineId && machines.length > 0) {
      const machine = machines.find((m) => m.id === historyMachineId);
      if (machine) {
        setSelectedMachine(machine);
        setIsHistoryModalOpen(true);
      }
    }
  }, [historyMachineId, machines]);

  const handleUpdateHours = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachine) return;
    setLoading(true);
    try {
      const updateData: any = {
        currentHours: newHours,
        updatedAt: new Date().toISOString()
      };

      if (selectedMachine.status === 'operational') {
        updateData.operationalStartTime = new Date().toISOString();
        updateData.lastHoursUpdate = new Date().toISOString();
      }

      await api.updateMachine(selectedMachine.id, updateData);
      // Update store immediately so Dashboard PM panel reacts without waiting for poll
      updateMachineHour(selectedMachine.id, newHours);
      toast.success('Operational hours updated');
      setIsHoursModalOpen(false);
      fetchMachines();
    } catch (error) {
      console.error("Error updating hours:", error);
      toast.error('Failed to update hours');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Calculate next maintenance hours automatically
      let nextHours = 0;
      const hourTasks = formData.preventivePlan.filter(t => t.frequency === 'hours' && t.frequencyHours > 0);

      if (hourTasks.length > 0) {
        const smallestFreq = Math.min(...hourTasks.map(t => t.frequencyHours));
        nextHours = formData.currentHours + smallestFreq;
      } else {
        // Fallback to recommended thresholds if no specific hour tasks
        const nextThreshold = RECOMMENDED_TASKS.find(t => t.hours > formData.currentHours);
        if (nextThreshold) {
          nextHours = nextThreshold.hours;
        }
      }

      if (isEditMode && formData.id) {
        const { id, ...updateData } = formData;
        const oldMachine = machines.find(m => m.id === id);

        const finalUpdateData: any = {
          ...updateData,
          nextMaintenanceHours: nextHours,
          updatedAt: new Date().toISOString()
        };

        // Handle status change logic for hours
        if (oldMachine) {
          if (oldMachine.status === 'operational' && formData.status !== 'operational') {
            // Stopping operational session
            const liveHours = calculateLiveHours(oldMachine);
            finalUpdateData.currentHours = liveHours;
            finalUpdateData.operationalStartTime = null;
            finalUpdateData.totalOperatingTime = (oldMachine.totalOperatingTime || 0) + (liveHours - oldMachine.currentHours) * 60;
            finalUpdateData.lastHoursUpdate = new Date().toISOString();

            if (formData.status === 'down') {
              finalUpdateData.failureCount = (oldMachine.failureCount || 0) + 1;
            }
          } else if (oldMachine.status === 'operational' && formData.status === 'operational') {
            // Staying operational - use whichever is greater: auto live hours or user-entered value
            const liveHours = calculateLiveHours(oldMachine);
            // BUG FIX: if user manually entered a higher value in the form, honour it
            const resolvedHours = formData.currentHours > liveHours ? formData.currentHours : liveHours;
            finalUpdateData.currentHours = resolvedHours;
            finalUpdateData.operationalStartTime = new Date().toISOString();
            finalUpdateData.totalOperatingTime = (oldMachine.totalOperatingTime || 0) + (resolvedHours - oldMachine.currentHours) * 60;
            finalUpdateData.lastHoursUpdate = new Date().toISOString();
            // Propagate to store immediately
            updateMachineHour(id, resolvedHours);
          } else if (oldMachine.status === 'down' && formData.status !== 'down') {
            // Leaving down state
            if (oldMachine.lastHoursUpdate) {
              const start = new Date(oldMachine.lastHoursUpdate);
              const now = new Date();
              const diffMin = (now.getTime() - start.getTime()) / (1000 * 60);
              if (diffMin > 0) {
                finalUpdateData.totalDownTime = (oldMachine.totalDownTime || 0) + diffMin;
              }
            }
            finalUpdateData.lastHoursUpdate = new Date().toISOString();
          } else if (oldMachine.status !== 'operational' && formData.status === 'operational') {
            // Starting operational session
            finalUpdateData.operationalStartTime = new Date().toISOString();
            finalUpdateData.lastHoursUpdate = new Date().toISOString();
          }
        }

        await api.updateMachine(id, finalUpdateData);
      } else {
        const { id, ...newData } = formData;
        const finalNewData: any = {
          ...newData,
          id: `MACH-${Date.now()}`,
          nextMaintenanceHours: nextHours,
          totalOperatingTime: newData.currentHours * 60,
          totalDownTime: 0,
          failureCount: 0,
          createdAt: new Date().toISOString(),
          lastMaintenance: null
        };

        if (newData.status === 'operational') {
          finalNewData.operationalStartTime = new Date().toISOString();
          finalNewData.lastHoursUpdate = new Date().toISOString();
        }

        await api.createMachine(finalNewData);
        toast.success('Machine registered successfully');
      }
      fetchMachines();
      setIsModalOpen(false);
      setIsEditMode(false);
      setFormData({
        id: '',
        name: '',
        serialNumber: '',
        injectingProduct: '',
        type: 'Simple Injection',
        manufacturingYear: new Date().getFullYear(),
        location: '',
        siteNumber: '',
        condition: 'Excellent',
        clampingForce: 0,
        status: 'operational',
        nextMaintenance: '',
        installationDate: '',
        currentHours: 0,
        imageUrl: '',
        preventivePlan: []
      });
    } catch (error) {
      console.error("Error saving machine:", error);
      toast.error('Failed to save machine');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (machine: Machine) => {
    const liveHours = calculateLiveHours(machine);
    setFormData({
      id: machine.id || '',
      name: machine.name || '',
      serialNumber: machine.serialNumber || '',
      injectingProduct: machine.injectingProduct || '',
      type: machine.type || 'Simple Injection',
      manufacturingYear: machine.manufacturingYear || new Date().getFullYear(),
      location: machine.location || '',
      siteNumber: machine.siteNumber || '',
      clampingForce: machine.clampingForce || 0,
      condition: machine.condition || 'Excellent',
      status: machine.status || 'operational',
      nextMaintenance: machine.nextMaintenance || '',
      installationDate: machine.installationDate || '',
      currentHours: liveHours,
      imageUrl: machine.imageUrl || '',
      preventivePlan: machine.preventivePlan || []
    });
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleDeleteMachine = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this machine? This action cannot be undone.')) {
      return;
    }
    try {
      await api.deleteMachine(id);
      toast.success('Machine deleted successfully');
      fetchMachines();
    } catch (error) {
      console.error("Error deleting machine:", error);
      toast.error('Failed to delete machine');
    }
  };

  const handleClearAllMachines = async () => {
    if (!window.confirm('WARNING: Are you sure you want to delete ALL machines? This will clear all machine records and their product/mold change histories. This action is IRREVERSIBLE!')) {
      return;
    }
    try {
      setLoading(true);
      await api.clearAllMachines();
      toast.success('All machines cleared successfully');
      fetchMachines();
    } catch (error) {
      console.error("Error clearing machines:", error);
      toast.error('Failed to clear machines');
    } finally {
      setLoading(false);
    }
  };

  const addPreventiveTask = () => {
    if (!newTask.description) return;
    setFormData({
      ...formData,
      preventivePlan: [...formData.preventivePlan, { ...newTask, id: Math.random().toString(36).substr(2, 9) }]
    });
    setNewTask({ type: 'inspection', frequency: 'monthly', frequencyHours: 0, description: '' });
  };

  const removePreventiveTask = (id: string) => {
    setFormData({
      ...formData,
      preventivePlan: formData.preventivePlan.filter(t => t.id !== id)
    });
  };

  const handleExport = () => {
    exportToCSV(machines, `machines_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    toast.success('Machine list exported successfully');
  };

  const filteredItems = machines.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.serialNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || item.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  // Reset to first page whenever filters change
  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pagedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational': return 'bg-green-50 text-green-700 border-green-100';
      case 'down': return 'bg-red-50 text-red-700 border-red-100';
      case 'maintenance': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'idle': return 'bg-purple-50 text-purple-700 border-purple-100';
      default: return 'bg-gray-50 text-gray-700 border-gray-100';
    }
  };

  return (
    <div className="space-y-6 relative min-h-[800px]">
      {/* List View (Blurred when form is open) */}
      <div className={cn(
        "transition-all duration-500 ease-in-out",
        (isModalOpen || isHistoryModalOpen) ? "blur-xl opacity-20 scale-95 pointer-events-none" : "blur-0 opacity-100 scale-100"
      )}>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Machine Management</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              <Download size={18} />
              Export CSV
            </button>
            <button
              onClick={() => fetchMachines(true)}
              disabled={refreshing}
              className={cn(
                "p-2 text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all",
                refreshing && "animate-spin text-blue-600"
              )}
              title="Refresh Machines"
            >
              <RotateCw size={18} />
            </button>
            {/*machines.length > 0 && isAdmin && (
              <button
                onClick={handleClearAllMachines}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-all"
              >
                <Trash2 size={18} />
                Clear All
              </button>
            )*/}
            {canEdit && (
              <button
                onClick={() => {
                  setIsEditMode(false);
                  setFormData({
                    id: '',
                    name: '',
                    serialNumber: '',
                    injectingProduct: '',
                    type: 'Simple Injection',
                    manufacturingYear: new Date().getFullYear(),
                    location: '',
                    siteNumber: '',
                    condition: 'Excellent',
                    clampingForce: 0,
                    status: 'operational',
                    nextMaintenance: '',
                    installationDate: '',
                    currentHours: 0,
                    imageUrl: '',
                    preventivePlan: generateRecommendedPlan()
                  });
                  setIsModalOpen(true);
                }}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Machine
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 p-4 bg-white border border-gray-100 shadow-sm sm:flex-row sm:items-center rounded-xl mt-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search machines..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="text-gray-400" size={18} />
            <select
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="operational">Operational</option>
              <option value="down">Down</option>
              <option value="maintenance">Maintenance</option>
              <option value="idle">Standby / Idle</option>
            </select>
          </div>
        </div>

        {/* List View */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden mt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Machine</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Year</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Force (T)</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagedItems.map((item) => (
                  <tr
                    key={item.id}
                    className={cn(
                      "group hover:bg-gray-50/50 transition-colors",
                      item.status === 'down' ? "bg-red-50/5" :
                        item.status === 'maintenance' ? "bg-amber-50/5" : ""
                    )}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className={cn(
                          "p-0 rounded-lg mr-3 w-12 h-12 overflow-hidden flex items-center justify-center border border-gray-100",
                          item.status === 'down' ? "bg-red-100" :
                            item.status === 'maintenance' ? "bg-amber-100" : "bg-blue-50"
                        )}>
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <HardDrive className={cn(
                              "w-5 h-5",
                              item.status === 'down' ? "text-red-600" :
                                item.status === 'maintenance' ? "text-amber-600" : "text-blue-600"
                            )} />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-500 font-mono">{item.serialNumber}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{item.type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{item.manufacturingYear}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <div className="flex items-center text-sm text-gray-600">
                          <MapPin size={14} className="mr-1.5 text-gray-400" />
                          {item.location}
                        </div>
                        {item.siteNumber && (
                          <div className="text-xs text-blue-600 ml-5 font-medium mt-0.5">#{item.siteNumber}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{item.clampingForce}T</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase w-fit",
                          getStatusColor(item.status)
                        )}>
                          {item.status}
                        </span>
                        {item.statusReason && (item.status === 'down' || item.status === 'maintenance') && (
                          <span className="text-[10px] text-red-600 font-bold italic max-w-[150px] truncate" title={item.statusReason}>
                            Reason: {item.statusReason}
                          </span>
                        )}
                        <div className="flex flex-col mt-1 gap-0.5">
                          {item.nextMaintenanceHours && (
                            <span className="text-[10px] text-blue-600 font-bold">
                              Next: {formatHoursToDays(item.nextMaintenanceHours)}
                            </span>
                          )}
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-500 font-medium">
                              Current: {formatHoursToDays(calculateLiveHours(item))}
                            </span>
                            {canEdit && (
                              <button
                                onClick={() => {
                                  setSelectedMachine(item);
                                  setNewHours(item.currentHours || 0);
                                  setIsHoursModalOpen(true);
                                }}
                                className="p-0.5 text-gray-400 hover:text-blue-600 transition-colors"
                                title="Update Hours"
                              >
                                <Edit2 size={10} />
                              </button>
                            )}
                          </div>
                          {item.failureCount > 0 ? (
                            <span className={cn(
                              "text-[10px] font-bold",
                              (item.totalOperatingTime / 60 / item.failureCount) >= 500 ? "text-emerald-600" :
                                (item.totalOperatingTime / 60 / item.failureCount) >= 200 ? "text-amber-600" : "text-red-600"
                            )}>
                              MTBF: {((item.totalOperatingTime / 60) / item.failureCount).toFixed(1)}h
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-500 font-medium">
                              MTBF: N/A
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => {
                            setSelectedMachine(item);
                            setIsHistoryModalOpen(true);
                          }}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Maintenance History"
                        >
                          <History size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedMachine(item);
                            setIsQrModalOpen(true);
                          }}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="QR Code"
                        >
                          <QrCode size={18} />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => handleEditClick(item)}
                            className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                            title="Edit"
                          >
                            <Edit2 size={18} />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteMachine(item.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredItems.length === 0 && (
            <div className="py-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-gray-100 rounded-full">
                <HardDrive className="text-gray-400" size={32} />
              </div>
              <h3 className="text-lg font-medium text-gray-900">No machines found</h3>
              <p className="text-gray-500">Try adjusting your search or filters.</p>
            </div>
          )}
          <TableFooter
            totalItems={filteredItems.length}
            pageSize={pageSize}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>

      {/* Form View (Overlay) */}
      {isModalOpen && (
        <div className="absolute inset-x-0 top-0 z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{isEditMode ? "Edit Machine" : "Add New Machine"}</h1>
              <p className="text-gray-500">Fill in the details below to {isEditMode ? "update" : "register"} the asset.</p>
            </div>
            <button
              onClick={() => {
                setIsModalOpen(false);
                setIsEditMode(false);
              }}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Back to List
            </button>
          </div>

          <div className="bg-white/90 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-2xl p-8">
            <form onSubmit={handleAddMachine} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Machine Image</label>
                  <div className="relative group">
                    <div className={cn(
                      "w-full aspect-square rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center overflow-hidden transition-all group-hover:border-blue-400 bg-gray-50/50",
                      formData.imageUrl && "border-solid border-blue-100 bg-blue-50/10"
                    )}>
                      {formData.imageUrl ? (
                        <>
                          <img
                            src={formData.imageUrl}
                            alt="Preview"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, imageUrl: '' })}
                            className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur-sm rounded-full text-red-500 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <div className="flex flex-col items-center text-center p-4">
                          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mb-2">
                            <Camera className="text-blue-600" size={20} />
                          </div>
                          <p className="text-xs font-medium text-gray-500">Click to upload image</p>
                          <p className="text-[10px] text-gray-400 mt-1">PNG, JPG up to 10MB</p>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 10 * 1024 * 1024) {
                              toast.error("Image too large", { description: "Max size is 10MB" });
                              return;
                            }
                            try {
                              const result = await api.uploadFile(file);
                              setFormData({ ...formData, imageUrl: result.url });
                              toast.success("Image uploaded successfully");
                            } catch (error) {
                              toast.error("Upload failed", { description: (error as Error).message });
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Machine Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Hydraulic Press A1"
                        className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Serial Number</label>
                      <input
                        type="text"
                        required
                        placeholder="SN-123456"
                        className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        value={formData.serialNumber}
                        onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Injecting Product</label>
                      <input
                        type="text"
                        placeholder="e.g. Plastic Casing"
                        className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        value={formData.injectingProduct || ''}
                        onChange={(e) => setFormData({ ...formData, injectingProduct: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Machine Type</label>
                  <select
                    required
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  >
                    <option value="Simple Injection">Simple Injection</option>
                    <option value="Double Injection">Double Injection</option>
                    <option value="Triple Injection">Triple Injection</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Manufacturing Year</label>
                  <input
                    type="number"
                    required
                    min="1900"
                    max={new Date().getFullYear()}
                    placeholder="e.g. 2022"
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.manufacturingYear}
                    onChange={(e) => setFormData({ ...formData, manufacturingYear: parseInt(e.target.value) || new Date().getFullYear() })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Installation Date in Tunisia</label>
                  <input
                    type="date"
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.installationDate}
                    onChange={(e) => setFormData({ ...formData, installationDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Location</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        type="text"
                        required
                        placeholder="Site Name"
                        className="w-full pl-10 pr-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      />
                    </div>
                    <div className="relative w-1/3">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">#</span>
                      <input
                        type="text"
                        placeholder="M-01"
                        className="w-full pl-8 pr-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        value={formData.siteNumber}
                        onChange={(e) => setFormData({ ...formData, siteNumber: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Clamping Force (Tons)</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 150"
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.clampingForce}
                    onChange={(e) => setFormData({ ...formData, clampingForce: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Status</label>
                  <select
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  >
                    <option value="operational">Operational</option>
                    <option value="down">Down</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="idle">Standby / Idle</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Current Operational Hours</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 500"
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.currentHours}
                    onChange={(e) => setFormData({ ...formData, currentHours: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-bold text-gray-900">Preventive Maintenance Plan</h4>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, preventivePlan: generateRecommendedPlan() })}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 uppercase tracking-wider"
                  >
                    Reset to Recommended
                  </button>
                </div>
                <div className="space-y-3 mb-6 max-h-60 overflow-y-auto pr-2">
                  {formData.preventivePlan.map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-4 bg-gray-50/50 rounded-xl border border-gray-100">
                      <div>
                        <p className="text-sm font-medium text-gray-900 capitalize">
                          {task.type} - {task.frequency === 'hours' ? `Every ${task.frequencyHours}h` : task.frequency}
                        </p>
                        <p className="text-xs text-gray-500">{task.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePreventiveTask(task.id)}
                        className="text-red-500 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4 rotate-45" />
                      </button>
                    </div>
                  ))}
                  {formData.preventivePlan.length === 0 && (
                    <div className="text-center py-6 border-2 border-dashed border-gray-100 rounded-xl">
                      <p className="text-sm text-gray-400">No maintenance tasks scheduled.</p>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, preventivePlan: generateRecommendedPlan() })}
                        className="mt-2 text-xs font-bold text-blue-600 hover:underline"
                      >
                        Apply recommended plan
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Next Maintenance</label>
                  <input
                    type="date"
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.nextMaintenance || ''}
                    onChange={(e) => setFormData({ ...formData, nextMaintenance: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Machine Condition</label>
                  <select
                    className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.condition || 'Excellent'}
                    onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                  >
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Poor">Poor</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>
              <div className="pt-6 flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsEditMode(false);
                  }}
                  className="flex-1 px-6 py-3 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-lg shadow-blue-500/20"
                >
                  {loading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Save' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Hours Modal */}
      <Modal
        isOpen={isHoursModalOpen}
        onClose={() => setIsHoursModalOpen(false)}
        title="Update Operational Hours"
      >
        <form onSubmit={handleUpdateHours} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
              Current Hours for {selectedMachine?.name}
            </label>
            <input
              type="number"
              required
              min="0"
              step="0.1"
              className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              value={newHours}
              onChange={(e) => setNewHours(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setIsHoursModalOpen(false)}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Hours'}
            </button>
          </div>
        </form>
      </Modal>

      {/* QR Code Modal */}
      <Modal
        isOpen={isQrModalOpen}
        onClose={() => {
          setIsQrModalOpen(false);
          setSelectedMachine(null);
        }}
        title="Machine QR Code"
      >
        {selectedMachine && (
          <div className="flex flex-col items-center p-6 space-y-6">
            <div className="p-4 bg-white border-2 border-gray-100 rounded-2xl shadow-sm">
              {serverLanUrl ? (
                <QRCodeCanvas
                  id="machine-qr-code"
                  value={serverLanUrl}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              ) : (
                <div className="w-[200px] h-[200px] flex items-center justify-center text-xs text-gray-400">
                  Generating QR...
                </div>
              )}
            </div>

            <div className="text-center">
              <h3 className="text-lg font-bold text-gray-900">{selectedMachine.name}</h3>
              <p className="text-sm text-gray-500 font-mono">SN: {selectedMachine.serialNumber}</p>
            </div>

            <div className="w-full flex gap-3">
              <button
                onClick={() => {
                  const canvas = document.getElementById('machine-qr-code') as HTMLCanvasElement;
                  if (canvas) {
                    const url = canvas.toDataURL('image/png');
                    const link = document.createElement('a');
                    link.download = `qr-${selectedMachine.serialNumber}.png`;
                    link.href = url;
                    link.click();
                  }
                }}
                className="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
              >
                <QrCode className="w-4 h-4 mr-2" />
                Download PNG
              </button>
              <button
                onClick={() => {
                  const canvas = document.getElementById('machine-qr-code') as HTMLCanvasElement;
                  if (canvas) {
                    const dataUrl = canvas.toDataURL();
                    const windowContent = `
                      <!DOCTYPE html>
                      <html>
                        <head><title>Print QR Code - ${selectedMachine.name}</title></head>
                        <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
                          <div style="border: 1px solid #eee; padding: 40px; border-radius: 20px; text-align: center;">
                            <h1 style="margin-bottom: 10px;">${selectedMachine.name}</h1>
                            <p style="color: #666; font-family: monospace; margin-bottom: 30px;">SN: ${selectedMachine.serialNumber}</p>
                            <img src="${dataUrl}" style="width: 300px; height: 300px;" />
                            <p style="margin-top: 30px; font-size: 12px; color: #999;">Scan to access machine details</p>
                          </div>
                          <script>
                            window.onload = () => {
                              window.print();
                              window.onafterprint = () => window.close();
                            };
                          </script>
                        </body>
                      </html>
                    `;
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      printWindow.document.open();
                      printWindow.document.write(windowContent);
                      printWindow.document.close();
                    }
                  }
                }}
                className="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print Label
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Maintenance History View (Overlay) */}
      {isHistoryModalOpen && selectedMachine && (
        <div className="absolute inset-x-0 top-0 z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Maintenance History</h1>
              <p className="text-gray-500">{selectedMachine.name} - {selectedMachine.serialNumber}</p>
            </div>
            <button
              onClick={() => {
                setIsHistoryModalOpen(false);
                setSelectedMachine(null);
                if (onHistoryClose) onHistoryClose();
              }}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Back to List
            </button>
          </div>

          <div className="bg-white/90 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-2xl p-8">
            <MachineHistory
              machineId={selectedMachine.id}
              machineName={selectedMachine.name}
            />
          </div>
        </div>
      )}
    </div>
  );
}
