import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Filter,
  Wrench,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  User,
  ArrowRight,
  ChevronRight,
  Calendar,
  HardDrive,
  Download
} from 'lucide-react';
import { WorkOrder, Machine, FaultType, SparePart, UserProfile } from '../types';
import { cn, toDate, calculateMachineLiveHours } from '../lib/utils';
import { RECOMMENDED_TASKS } from '../constants/maintenanceTasks';
import { format, differenceInMinutes } from 'date-fns';
import Modal from './ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { Trash2, Edit2, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { api } from '../services/api';
import { exportToCSV } from '../lib/exportUtils';
import { THERMOPLASTICS_LOGO } from '../constants/logo';
import TableFooter from './ui/TableFooter';

interface WorkOrderListProps {
  view?: 'list' | 'reports';
}

export default function WorkOrderList({ view = 'list' }: WorkOrderListProps) {
  const { user } = useAuth();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [faultTypes, setFaultTypes] = useState<FaultType[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isInterventionModalOpen, setIsInterventionModalOpen] = useState(false);
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(13);

  const generateWorkOrderId = () => {
    const year = new Date().getFullYear();
    const prefix = `WO-${year}-`;
    const yearOrders = orders.filter(o => o.id.startsWith(prefix));

    if (yearOrders.length === 0) {
      return `${prefix}0001`;
    }

    const maxNum = Math.max(...yearOrders.map(o => {
      const parts = o.id.split('-');
      return parseInt(parts[parts.length - 1]) || 0;
    }));

    return `${prefix}${(maxNum + 1).toString().padStart(4, '0')}`;
  };

  // Form state for new work order
  const [formData, setFormData] = useState({
    id: '',
    title: '',
    description: '',
    machineId: '',
    priority: 'medium' as WorkOrder['priority'],
    type: 'corrective' as WorkOrder['type'],
    parentFaultId: '',
    childFaultIds: [] as string[],
    assignedTo: '',
    // Initial intervention fields
    issuerName: '',
    issuerSector: '',
    requesterName: '',
    requestDate: format(new Date(), 'yyyy-MM-dd'),
    location: '',
    malfunctionDescription: '',
  });

  // Form state for intervention report
  const [interventionData, setInterventionData] = useState({
    issuerName: '',
    issuerSector: '',
    requesterName: '',
    requestDate: format(new Date(), 'yyyy-MM-dd'),
    location: '',
    malfunctionDescription: '',
    technicians: '',
    operations: {
      replacement: false,
      diagnostic: false,
      improvement: false,
      control: false,
    },
    maintenanceType: 'corrective' as 'corrective' | 'preventive',
    failureCause: 'wear' as 'wear' | 'user' | 'product' | 'other',
    relatedCause: '',
    interventionTime: '',
    actions: '',
    difficulties: '',
    partsUsed: [] as { partId: string; name: string; quantity: number }[],
    startTime: '',
    endTime: '',
    comments: '',
    currentHours: 0,
  });

  const [selectedPartId, setSelectedPartId] = useState('');
  const [partQuantity, setPartQuantity] = useState(1);

  // Auto-calculate intervention time from start and end times
  useEffect(() => {
    if (interventionData.startTime && interventionData.endTime) {
      const start = new Date(interventionData.startTime);
      const end = new Date(interventionData.endTime);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const diff = differenceInMinutes(end, start);
        if (diff >= 0) {
          const h = Math.floor(diff / 60);
          const m = diff % 60;
          const timeStr = h > 0 ? `${h}h ${m}min` : `${m}min`;
          if (interventionData.interventionTime !== timeStr) {
            setInterventionData(prev => ({ ...prev, interventionTime: timeStr }));
          }
        }
      }
    }
  }, [interventionData.startTime, interventionData.endTime, interventionData.interventionTime]);

  useEffect(() => {
    setFilterStatus('all');
  }, [view]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ordersData, machinesData, usersData, sparePartsData] = await Promise.all([
          api.getWorkOrders(),
          api.getMachines(),
          api.getUsers(),
          api.getSpareParts()
        ]);
        setOrders(ordersData);
        setMachines(machinesData);
        setUsers(usersData);
        setSpareParts(sparePartsData);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const handleAddWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const selectedMachine = machines.find(m => m.id === formData.machineId);
      const assignedUser = users.find(u => u.uid === formData.assignedTo);

      if (isEditMode && formData.id) {
        const { id, ...updateData } = formData;
        await api.updateWorkOrder(id, {
          ...updateData,
          title: formData.id, // Ensure title matches ID if we removed title field
          machineName: selectedMachine?.name || 'Unknown',
          assignedName: assignedUser?.displayName || assignedUser?.username || null,
          updatedAt: new Date().toISOString()
        });
        toast.success('Work order updated successfully');
      } else {
        const ordersData = await api.getWorkOrders();
        if (ordersData.some(o => o.id === formData.id.trim())) {
          toast.error('Work Order ID already exists. Please use a unique ID.');
          setLoading(false);
          return;
        }
        await api.createWorkOrder({
          ...formData,
          id: formData.id.trim(),
          title: formData.id, // Use ID as title
          machineName: selectedMachine?.name || 'Unknown',
          status: 'pending',
          createdAt: new Date().toISOString(),
          createdBy: user?.uid,
          createdByName: user?.displayName || user?.username,
          assignedName: assignedUser?.displayName || assignedUser?.username || null,
        } as WorkOrder);
        toast.success('Work order created successfully');
      }

      setIsModalOpen(false);
      setIsEditMode(false);
      setFormData({
        id: '',
        title: '',
        description: '',
        machineId: '',
        priority: 'medium',
        type: 'corrective',
        parentFaultId: '',
        childFaultIds: [],
        assignedTo: '',
        issuerName: '',
        issuerSector: '',
        requesterName: '',
        requestDate: format(new Date(), 'yyyy-MM-dd'),
        location: '',
        malfunctionDescription: '',
      });
    } catch (error) {
      console.error("Error saving work order:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (order: WorkOrder) => {
    setFormData({
      id: order.id || '',
      title: order.title || '',
      description: order.description || '',
      machineId: order.machineId || '',
      priority: order.priority || 'medium',
      type: order.type || 'corrective',
      parentFaultId: order.parentFaultId || '',
      childFaultIds: order.childFaultIds || [],
      assignedTo: order.assignedTo || '',
      issuerName: order.issuerName || '',
      issuerSector: order.issuerSector || '',
      requesterName: order.requesterName || '',
      requestDate: order.requestDate || format(new Date(), 'yyyy-MM-dd'),
      location: order.location || '',
      malfunctionDescription: order.malfunctionDescription || '',
    });
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleDeleteWorkOrder = async (id: string) => {
    try {
      await api.deleteWorkOrder(id);
      toast.success('Work order deleted successfully');
    } catch (error) {
      console.error("Error deleting work order:", error);
      toast.error('Failed to delete work order');
    }
  };

  const generateStartPDF = (order: WorkOrder) => {
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text('Work Order - Start Notification', 20, 20);

    doc.setFontSize(12);
    doc.text(`Order ID: ${order.id}`, 20, 35);
    doc.text(`Title: ${order.title}`, 20, 45);
    doc.text(`Machine: ${order.machineName}`, 20, 55);
    doc.text(`Priority: ${order.priority.toUpperCase()}`, 20, 65);
    doc.text(`Type: ${order.type.toUpperCase()}`, 20, 75);
    doc.text(`Started By: ${user?.displayName || user?.username}`, 20, 85);
    doc.text(`Start Date: ${format(new Date(), 'PPP p')}`, 20, 95);

    doc.text('Description:', 20, 110);
    doc.setFontSize(10);
    const splitDescription = doc.splitTextToSize(order.description, 170);
    doc.text(splitDescription, 20, 115);

    doc.save(`work_order_start_${order.id}.pdf`);
  };

  const generateReportPDF = async (order: WorkOrder, report: any) => {
    const doc = new jsPDF();

    // Header with Logo
    const logoUrl = THERMOPLASTICS_LOGO;

    try {
      // Use the logo image
      doc.addImage(logoUrl, 'PNG', 12, 12, 50, 15);
    } catch (e) {
      // Fallback if image fails
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text('Thermoplastics', 15, 22);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('Design & Manufacture', 15, 26);
    }

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0);
    doc.setLineWidth(0.1);
    doc.rect(10, 10, 190, 277); // Main border

    // Title
    doc.setFontSize(16);
    doc.setTextColor(0, 51, 102);
    doc.setFont("helvetica", "bold");
    doc.text('MAINTENANCE INTERVENTION FORM', 75, 24);
    doc.line(75, 25, 175, 25);

    // Section: Intervention Report
    doc.setFillColor(31, 73, 125);
    doc.rect(10, 30, 190, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('Intervention Report', 105, 34, { align: 'center' });

    doc.setTextColor(0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text('Issuer (Assigned To)', 55, 42, { align: 'center' });
    doc.text('Requester (Created By)', 150, 42, { align: 'center' });
    doc.line(10, 44, 200, 44);
    doc.line(105, 36, 105, 64); // Vertical separator

    doc.setFont("helvetica", "normal");
    doc.text(`Name : ${report.issuerName || ''}`, 12, 48);
    doc.text(`Name : ${report.requesterName || ''}`, 107, 48);
    doc.text(`Sector : ${report.issuerSector || ''}`, 12, 54);
    doc.text(`Date : ${report.requestDate || ''}`, 107, 54);
    doc.text(`Technicians : ${report.technicians || ''}`, 12, 60);
    doc.line(10, 64, 200, 64);

    // Section: Machine Information
    const machine = machines.find(m => m.id === order.machineId);
    doc.setFillColor(31, 73, 125);
    doc.rect(10, 64, 190, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('Machine Information', 105, 68, { align: 'center' });

    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text('Machine Name:', 12, 76);
    doc.text('Serial Number:', 107, 76);
    doc.text('Machine Type:', 12, 82);
    doc.text('Location:', 107, 82);

    doc.setFont("helvetica", "normal");
    doc.text(`${machine?.name || order.machineName || 'N/A'}`, 45, 76);
    doc.text(`${machine?.serialNumber || 'N/A'}`, 140, 76);
    doc.text(`${machine?.type || 'N/A'}`, 45, 82);
    doc.text(`${machine?.location || report.location || 'N/A'}`, 140, 82);

    // Add Machine Image if available
    let currentY = 88;
    if (machine?.imageUrl) {
      try {
        doc.addImage(machine.imageUrl, 'JPEG', 150, 88, 40, 30);
        currentY = 120;
      } catch (e) {
        console.error("Error adding machine image to PDF:", e);
      }
    }

    doc.line(10, currentY, 200, currentY);

    // Section: Malfunction Description
    doc.setFillColor(31, 73, 125);
    doc.rect(10, currentY, 190, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('Malfunction Description', 105, currentY + 4, { align: 'center' });

    doc.setTextColor(0);
    const splitDesc = doc.splitTextToSize(report.malfunctionDescription || order.description || '', 185);
    doc.text(splitDesc, 12, currentY + 12);
    currentY += 27;
    doc.line(10, currentY, 200, currentY);

    // Section: Operations
    doc.setFillColor(31, 73, 125);
    doc.rect(10, currentY, 190, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('Operations', 105, currentY + 4, { align: 'center' });

    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text('Operations', 45, currentY + 10, { align: 'center' });
    doc.text('Maintenance Type', 105, currentY + 10, { align: 'center' });
    doc.text('Failure Cause', 165, currentY + 10, { align: 'center' });
    doc.line(10, currentY + 12, 200, currentY + 12);
    doc.line(80, currentY + 6, 80, currentY + 40);
    doc.line(130, currentY + 6, 130, currentY + 40);

    doc.setFont("helvetica", "normal");
    doc.text('Replacement', 12, currentY + 17);
    doc.text('Diagnostic', 12, currentY + 23);
    doc.text('Improvement', 12, currentY + 29);
    doc.text('Control', 12, currentY + 35);

    doc.text('Corrective', 82, currentY + 17);
    doc.text('Preventive', 82, currentY + 23);

    doc.text('Normal wear', 132, currentY + 17);
    doc.text('User error', 132, currentY + 23);
    doc.text('Product defect', 132, currentY + 29);
    doc.text('Other', 132, currentY + 35);

    // Checkmarks for operations
    if (report.operations?.replacement) doc.text('X', 75, currentY + 17);
    if (report.operations?.diagnostic) doc.text('X', 75, currentY + 23);
    if (report.operations?.improvement) doc.text('X', 75, currentY + 29);
    if (report.operations?.control) doc.text('X', 75, currentY + 35);

    if (report.maintenanceType === 'corrective') doc.text('X', 125, currentY + 17);
    if (report.maintenanceType === 'preventive') doc.text('X', 125, currentY + 23);

    if (report.failureCause === 'wear') doc.text('X', 195, currentY + 17);
    if (report.failureCause === 'user') doc.text('X', 195, currentY + 23);
    if (report.failureCause === 'product') doc.text('X', 195, currentY + 29);
    if (report.failureCause === 'other') doc.text('X', 195, currentY + 35);

    currentY += 40;
    doc.line(10, currentY, 200, currentY);

    // Section: Cause related to failure | Intervention time
    doc.setFillColor(31, 73, 125);
    doc.rect(10, currentY, 190, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('Cause related to failure', 65, currentY + 4, { align: 'center' });
    doc.text('Intervention time', 160, currentY + 4, { align: 'center' });
    doc.line(120, currentY, 120, currentY + 30);

    doc.setTextColor(0);
    doc.text(`${report.relatedCause || ''}`, 12, currentY + 12);
    doc.text(`${report.interventionTime || report.durationMinutes + ' min'}`, 122, currentY + 12);
    currentY += 30;
    doc.line(10, currentY, 200, currentY);

    // Section: Intervention Report (Actions)
    doc.setFillColor(31, 73, 125);
    doc.rect(10, currentY, 190, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('Intervention Report (Actions)', 105, currentY + 4, { align: 'center' });

    doc.setTextColor(0);
    const splitActions = doc.splitTextToSize(report.actions || '', 185);
    doc.text(splitActions, 12, currentY + 12);
    currentY += 20;
    doc.line(10, currentY, 200, currentY);

    // Section: Difficulties encountered
    doc.setFillColor(31, 73, 125);
    doc.rect(10, currentY, 190, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('Difficulties encountered', 105, currentY + 4, { align: 'center' });

    doc.setTextColor(0);
    const splitDiff = doc.splitTextToSize(report.difficulties || '', 185);
    doc.text(splitDiff, 12, currentY + 12);
    currentY += 20;
    doc.line(10, currentY, 200, currentY);

    // Section: Spare parts and consumables
    doc.setFillColor(31, 73, 125);
    doc.rect(10, currentY, 190, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('Spare parts and consumables', 105, currentY + 4, { align: 'center' });

    doc.setTextColor(0);
    autoTable(doc, {
      startY: currentY + 6,
      head: [['Designation', 'Quantity']],
      body: (report.partsUsed || []).map((p: any) => [p.name, p.quantity]),
      theme: 'grid',
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
      styles: { fontSize: 8, cellPadding: 1 },
      columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'center' } },
      margin: { left: 10, right: 10 }
    });

    doc.save(`fiche_intervention_${order.id}.pdf`);
  };

  const handleCompleteIntervention = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setLoading(true);

    try {
      const duration = differenceInMinutes(new Date(interventionData.endTime), new Date(interventionData.startTime));

      const report = {
        ...interventionData,
        durationMinutes: duration,
        completedAt: isEditingReport ? (selectedOrder.intervention?.completedAt || new Date().toISOString()) : new Date().toISOString(),
      };

      // Update Work Order
      await api.updateWorkOrder(selectedOrder.id, {
        status: 'completed',
        completedAt: isEditingReport ? (selectedOrder.completedAt || new Date().toISOString()) : new Date().toISOString(),
        intervention: report as any
      });

      if (!isEditingReport) {
        // Update Machine Metrics only if it's a new report
        const machinesData = await api.getMachines();
        const machineData = machinesData.find(m => m.id === selectedOrder.machineId);
        if (!machineData) return;

        const updateData: any = {
          status: 'operational',
          operationalStartTime: new Date().toISOString(),
          lastHoursUpdate: new Date().toISOString(),
          lastMaintenance: new Date().toISOString(),
          currentHours: interventionData.currentHours || machineData.currentHours || 0,
        };

        if (selectedOrder.type === 'corrective') {
          updateData.failureCount = (machineData.failureCount || 0) + 1;
          updateData.totalDownTime = (machineData.totalDownTime || 0) + duration;
        }

        // Update total operating time based on current hours
        if (interventionData.currentHours > (machineData.currentHours || 0)) {
          updateData.totalOperatingTime = interventionData.currentHours * 60; // Convert hours to minutes for consistency

          // Recalculate next maintenance hours
          const hourTasks = machineData.preventivePlan?.filter(t => t.frequency === 'hours' && t.frequencyHours > 0) || [];
          if (hourTasks.length > 0) {
            const smallestFreq = Math.min(...hourTasks.map(t => t.frequencyHours));
            updateData.nextMaintenanceHours = interventionData.currentHours + smallestFreq;
          } else {
            // Use recommended thresholds
            const nextThreshold = RECOMMENDED_TASKS.find(t => t.hours > interventionData.currentHours);
            if (nextThreshold) {
              updateData.nextMaintenanceHours = nextThreshold.hours;
            }
          }
        }

        await api.updateMachine(selectedOrder.machineId, updateData);

        // Update Stock for each part used
        for (const part of interventionData.partsUsed) {
          const spareParts = await api.getSpareParts();
          const partData = spareParts.find(p => p.id === part.partId);
          if (partData) {
            await api.updateSparePart(part.partId, {
              stock: (partData.stock || 0) - part.quantity
            });
          }
        }
      }

      await generateReportPDF(selectedOrder, report);

      setIsInterventionModalOpen(false);
      setIsEditingReport(false);
      setSelectedOrder(null);
      setInterventionData({
        issuerName: '',
        issuerSector: '',
        requesterName: '',
        requestDate: format(new Date(), 'yyyy-MM-dd'),
        technicians: '',
        location: '',
        malfunctionDescription: '',
        operations: {
          replacement: false,
          diagnostic: false,
          improvement: false,
          control: false,
        },
        maintenanceType: 'corrective',
        failureCause: 'wear',
        relatedCause: '',
        interventionTime: '',
        actions: '',
        difficulties: '',
        partsUsed: [],
        startTime: '',
        endTime: '',
        comments: '',
        currentHours: 0,
      });
    } catch (error) {
      console.error("Error completing intervention:", error);
    } finally {
      setLoading(false);
    }
  };

  const parentFaults = faultTypes.filter(f => f.parentId === null);
  const childFaults = faultTypes.filter(f => f.parentId === formData.parentFaultId);

  const handleExport = () => {
    exportToCSV(orders, `work_orders_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    toast.success('Work orders exported successfully');
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.machineName?.toLowerCase().includes(searchTerm.toLowerCase());

    // Handle sub-tabs filtering
    let matchesFilter = filterStatus === 'all' || order.status === filterStatus;

    if (view === 'reports') {
      // In reports view, show in-progress and completed orders by default
      if (filterStatus === 'all') {
        matchesFilter = order.status === 'completed' || order.status === 'in-progress';
      }
    } else {
      // In list view, show pending, in-progress, and completed orders by default
      if (filterStatus === 'all') {
        matchesFilter = order.status === 'pending' || order.status === 'in-progress' || order.status === 'completed';
      }
    }

    return matchesSearch && matchesFilter;
  });

  // Reset to page 1 whenever search/filter/view changes
  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterStatus, view]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const pagedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-700 bg-red-50 border-red-100';
      case 'high': return 'text-orange-700 bg-orange-50 border-orange-100';
      case 'medium': return 'text-blue-700 bg-blue-50 border-blue-100';
      default: return 'text-gray-700 bg-gray-50 border-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="text-green-500" size={18} />;
      case 'in-progress': return <Clock className="text-blue-500" size={18} />;
      case 'pending': return <AlertCircle className="text-amber-500" size={18} />;
      default: return <AlertCircle className="text-gray-400" size={18} />;
    }
  };

  return (
    <div className="relative min-h-[600px]">
      {/* Main Content with Blur Effect */}
      <div className={cn(
        "space-y-6 transition-all duration-500 ease-in-out",
        (isModalOpen || isInterventionModalOpen) ? "blur-xl opacity-20 scale-95 pointer-events-none" : "blur-0 opacity-100 scale-100"
      )}>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {view === 'reports' ? 'Intervention Reports' : 'Maintenance Orders'}
            </h1>

          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              <Download size={18} />
              Export CSV
            </button>
            {view === 'list' && (
              <button
                onClick={() => {
                  setIsEditMode(false);
                  const newId = generateWorkOrderId();
                  setFormData({
                    id: newId,
                    title: newId,
                    description: '',
                    machineId: '',
                    priority: 'medium',
                    type: 'corrective',
                    parentFaultId: '',
                    childFaultIds: [],
                    assignedTo: '',
                    issuerName: '',
                    issuerSector: '',
                    requesterName: '',
                    requestDate: format(new Date(), 'yyyy-MM-dd'),
                    location: '',
                    malfunctionDescription: '',
                  });
                  setIsModalOpen(true);
                }}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Work Order
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 p-4 bg-white border border-gray-100 shadow-sm sm:flex-row sm:items-center rounded-xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search orders or machines..."
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
              {view === 'list' ? (
                <>
                  <option value="pending">Pending</option>
                </>
              ) : (
                <>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                </>
              )}
            </select>
          </div>
        </div>

        {/* MTTR Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 flex items-center justify-center rounded-lg">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Average MTTR</p>
              <p className="text-lg font-black text-gray-900">
                {(() => {
                  const completedWithIntervention = orders.filter(o => o.status === 'completed' && o.intervention);
                  if (completedWithIntervention.length === 0) return 'N/A';
                  const totalMinutes = completedWithIntervention.reduce((acc, curr) => acc + (curr.intervention?.durationMinutes || 0), 0);
                  return (totalMinutes / completedWithIntervention.length / 60).toFixed(1);
                })()} <span className="text-xs font-normal text-gray-500">hrs</span>
              </p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 flex items-center justify-center rounded-lg">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Completed Orders</p>
              <p className="text-lg font-black text-gray-900">
                {orders.filter(o => o.status === 'completed').length}
              </p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 flex items-center justify-center rounded-lg">
              <AlertCircle size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pending Orders</p>
              <p className="text-lg font-black text-gray-900">
                {orders.filter(o => o.status === 'pending').length}
              </p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 flex items-center justify-center rounded-lg">
              <Wrench size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">In Progress</p>
              <p className="text-lg font-black text-gray-900">
                {orders.filter(o => o.status === 'in-progress').length}
              </p>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  {view === 'list' ? (
                    <>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Order Details</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Machine</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Priority</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Assigned To</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    </>
                  ) : (
                    <>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">WO Number</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Report Number</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Machine</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Priority</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    </>
                  )}
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagedOrders.map((order) => (
                  <tr key={order.id} className="group hover:bg-gray-50/50 transition-colors">
                    {view === 'list' ? (
                      <>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className={cn(
                              "p-2 mr-3 rounded-lg",
                              order.type === 'preventive' ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"
                            )}>
                              <Wrench size={18} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900">{order.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="text-xs text-gray-500">Created {format(toDate(order.createdAt), 'MMM d, yyyy')}</p>
                                {order.type === 'corrective' && order.parentFaultId && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-200">
                                    {faultTypes.find(f => f.id === order.parentFaultId)?.name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                              {machines.find(m => m.id === order.machineId)?.imageUrl ? (
                                <img
                                  src={machines.find(m => m.id === order.machineId)?.imageUrl}
                                  alt={order.machineName}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                  <HardDrive size={14} />
                                </div>
                              )}
                            </div>
                            <span className="text-sm text-gray-600 font-medium">{order.machineName || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                            getPriorityColor(order.priority)
                          )}>
                            {order.priority.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center text-sm text-gray-600">
                            <User size={14} className="mr-2 text-gray-400" />
                            {order.assignedName || 'Unassigned'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(order.status)}
                            <span className="text-sm text-gray-600 capitalize">{order.status.replace('-', ' ')}</span>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4">
                          <span className="text-sm font-bold text-gray-900">{order.id}</span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              const report = order.intervention;
                              setInterventionData({
                                issuerName: report?.issuerName || order.issuerName || order.assignedName || '',
                                issuerSector: report?.issuerSector || order.issuerSector || '',
                                requesterName: report?.requesterName || order.requesterName || order.createdByName || '',
                                requestDate: report?.requestDate || order.requestDate || format(new Date(), 'yyyy-MM-dd'),
                                technicians: report?.technicians || '',
                                location: report?.location || order.location || '',
                                malfunctionDescription: report?.malfunctionDescription || order.malfunctionDescription || order.description || '',
                                currentHours: report?.currentHours || machines.find(m => m.id === order.machineId)?.currentHours || 0,
                                operations: report?.operations || {
                                  replacement: false,
                                  diagnostic: false,
                                  improvement: false,
                                  control: false,
                                },
                                maintenanceType: report?.maintenanceType || order.type || 'corrective',
                                failureCause: report?.failureCause || 'wear',
                                relatedCause: report?.relatedCause || '',
                                interventionTime: report?.interventionTime || '',
                                actions: report?.actions || '',
                                difficulties: report?.difficulties || '',
                                partsUsed: report?.partsUsed || [],
                                startTime: report?.startTime || '',
                                endTime: report?.endTime || '',
                                comments: report?.comments || '',
                              });
                              setIsEditingReport(order.status === 'completed');
                              setIsInterventionModalOpen(true);
                            }}
                            className="text-sm font-bold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                          >
                            {order.reportNumber || 'N/A'}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                              {machines.find(m => m.id === order.machineId)?.imageUrl ? (
                                <img
                                  src={machines.find(m => m.id === order.machineId)?.imageUrl}
                                  alt={order.machineName}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                  <HardDrive size={14} />
                                </div>
                              )}
                            </div>
                            <span className="text-sm text-gray-600 font-medium">{order.machineName || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                            getPriorityColor(order.priority)
                          )}>
                            {order.priority.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(order.status)}
                            <span className="text-sm text-gray-600 capitalize">{order.status.replace('-', ' ')}</span>
                          </div>
                        </td>
                      </>
                    )}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {view === 'reports' ? (
                          <>
                            {order.status === 'completed' && order.intervention && (
                              <button
                                onClick={() => generateReportPDF(order, order.intervention)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-all"
                                title="Export PDF"
                              >
                                <Download size={14} />
                                PDF
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setSelectedOrder(order);
                                const report = order.intervention;
                                setInterventionData({
                                  issuerName: report?.issuerName || order.issuerName || '',
                                  issuerSector: report?.issuerSector || order.issuerSector || '',
                                  requesterName: report?.requesterName || order.requesterName || order.createdByName || '',
                                  requestDate: report?.requestDate || order.requestDate || format(new Date(), 'yyyy-MM-dd'),
                                  technicians: report?.technicians || '',
                                  location: report?.location || order.location || '',
                                  malfunctionDescription: report?.malfunctionDescription || order.malfunctionDescription || order.description || '',
                                  currentHours: report?.currentHours || machines.find(m => m.id === order.machineId)?.currentHours || 0,
                                  operations: report?.operations || {
                                    replacement: false,
                                    diagnostic: false,
                                    improvement: false,
                                    control: false,
                                  },
                                  maintenanceType: report?.maintenanceType || order.type || 'corrective',
                                  failureCause: report?.failureCause || 'wear',
                                  relatedCause: report?.relatedCause || '',
                                  interventionTime: report?.interventionTime || '',
                                  actions: report?.actions || '',
                                  difficulties: report?.difficulties || '',
                                  partsUsed: report?.partsUsed || [],
                                  startTime: report?.startTime || '',
                                  endTime: report?.endTime || '',
                                  comments: report?.comments || '',
                                });
                                setIsEditingReport(order.status === 'completed');
                                setIsInterventionModalOpen(true);
                              }}
                              className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                              title="Edit Report"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDeleteWorkOrder(order.id)}
                              className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete Report"
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        ) : (
                          <>
                            {(order.status === 'pending' || order.status === 'completed') && (
                              <button
                                onClick={async () => {
                                  // Fetch latest machine data to calculate live hours
                                  const machinesData = await api.getMachines();
                                  const machineData = machinesData.find(m => m.id === order.machineId);

                                  if (!machineData) return;
                                  const liveHours = calculateMachineLiveHours(machineData);

                                  await api.updateWorkOrder(order.id, {
                                    status: 'in-progress',
                                    assignedTo: user?.uid,
                                    assignedName: user?.displayName || user?.username,
                                    reportNumber: order.id.replace('WO', 'REP'),
                                    intervention: undefined, // Replace deleteField()
                                    completedAt: undefined // Replace deleteField()
                                  });

                                  // Update Machine Status to maintenance and update hours
                                  await api.updateMachine(order.machineId, {
                                    status: 'maintenance',
                                    currentHours: liveHours,
                                    operationalStartTime: undefined, // Replace null
                                    totalOperatingTime: liveHours * 60
                                  });

                                  toast.success(order.status === 'completed' ? 'Report reset and work order restarted' : 'Work order started');
                                }}
                                className="inline-flex items-center px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                              >
                                {order.status === 'completed' ? 'Restart' : 'Start'}
                              </button>
                            )}
                            <button
                              onClick={() => handleEditClick(order)}
                              className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                              title="Edit"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDeleteWorkOrder(order.id)}
                              className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredOrders.length === 0 && (
            <div className="py-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-gray-100 rounded-full">
                <Wrench className="text-gray-400" size={32} />
              </div>
              <h3 className="text-lg font-medium text-gray-900">No work orders found</h3>
              <p className="text-gray-500">Everything is running smoothly.</p>
            </div>
          )}
          <TableFooter
            totalItems={filteredOrders.length}
            pageSize={pageSize}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>

      {/* Form Overlay */}
      {isModalOpen && (
        <div className="absolute inset-x-0 top-0 z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{isEditMode ? "Edit Work Order" : "Create New Work Order"}</h1>
              <p className="text-gray-500">Fill in the details below to {isEditMode ? "update" : "schedule"} a maintenance task.</p>
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
            <form onSubmit={handleAddWorkOrder} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Work Order ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. WO-2024-001"
                    disabled={true}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-50"
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Machine</label>
                  <div className="relative">
                    <HardDrive className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <select
                      required
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all appearance-none"
                      value={formData.machineId}
                      onChange={(e) => setFormData({ ...formData, machineId: e.target.value })}
                    >
                      <option value="">Select Machine</option>
                      {machines.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.location})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Priority</label>
                  <select
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Type</label>
                  <select
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                  >
                    <option value="corrective">Corrective (Breakdown)</option>
                    <option value="preventive">Preventive</option>
                  </select>
                </div>
              </div>

              {/* Section 1: Intervention Report */}
              <div className="space-y-4 p-6 bg-gray-50/50 rounded-2xl border border-gray-100">
                <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-blue-100 pb-2">Intervention Report</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4 p-4 bg-white rounded-xl border border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase">Issuer (Assigned To)</p>
                    <input
                      type="text"
                      placeholder="Issuer Name"
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                      value={formData.issuerName}
                      onChange={(e) => setFormData({ ...formData, issuerName: e.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="Sector"
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                      value={formData.issuerSector}
                      onChange={(e) => setFormData({ ...formData, issuerSector: e.target.value })}
                    />
                  </div>
                  <div className="space-y-4 p-4 bg-white rounded-xl border border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase">Requester (Created By)</p>
                    <input
                      type="text"
                      placeholder="Requester Name"
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                      value={formData.requesterName}
                      onChange={(e) => setFormData({ ...formData, requesterName: e.target.value })}
                    />
                    <input
                      type="date"
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                      value={formData.requestDate}
                      onChange={(e) => setFormData({ ...formData, requestDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Location & Description */}
              <div className="space-y-4 p-6 bg-gray-50/50 rounded-2xl border border-gray-100">
                <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-blue-100 pb-2">Location & Description</h3>
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Intervention Location</label>
                    <input
                      type="text"
                      placeholder="e.g. Workshop A, Line 3"
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Malfunction Description</label>
                    <textarea
                      rows={2}
                      placeholder="Describe the initial problem..."
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none resize-none"
                      value={formData.malfunctionDescription}
                      onChange={(e) => setFormData({ ...formData, malfunctionDescription: e.target.value, description: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/*{formData.type === 'corrective' && (
                <div className="space-y-4 p-6 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                  <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Fault Analysis
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-blue-400 uppercase tracking-wider mb-2 ml-1">Category</label>
                      <select
                        className="w-full px-4 py-3 bg-white border border-blue-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                        value={formData.parentFaultId}
                        onChange={(e) => setFormData({ ...formData, parentFaultId: e.target.value, childFaultIds: [] })}
                      >
                        <option value="">Select Category</option>
                        {parentFaults.map(f => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-blue-400 uppercase tracking-wider mb-2 ml-1">Specific Faults</label>
                      <div className="space-y-2 max-h-40 overflow-y-auto p-3 bg-white rounded-xl border border-blue-100">
                        {childFaults.length > 0 ? childFaults.map(f => (
                          <label key={f.id} className="flex items-center gap-3 p-2 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer text-sm text-gray-700">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-blue-200"
                              checked={formData.childFaultIds.includes(f.id)}
                              onChange={(e) => {
                                const ids = e.target.checked
                                  ? [...formData.childFaultIds, f.id]
                                  : formData.childFaultIds.filter(id => id !== f.id);
                                setFormData({ ...formData, childFaultIds: ids });
                              }}
                            />
                            {f.name}
                          </label>
                        )) : (
                          <p className="text-xs text-gray-400 italic p-2">Select a category first</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}*/}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Assigned To</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <select
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all appearance-none"
                      value={formData.assignedTo}
                      onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                    >
                      <option value="">Unassigned</option>
                      {users.map(u => (
                        <option key={u.uid} value={u.uid}>{u.displayName || u.username} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Description</label>
                  <textarea
                    required
                    rows={1}
                    placeholder="Describe the issue or task..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="pt-6 flex gap-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-6 py-3 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-[2] px-6 py-3 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  {loading ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Changes' : 'Create Work Order')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Intervention Report Overlay */}
      {isInterventionModalOpen && selectedOrder && (
        <div className="absolute inset-x-0 top-0 z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Intervention Report</h1>
              <p className="text-gray-500">Document the maintenance actions for {selectedOrder.id}.</p>
            </div>
            <button
              onClick={() => {
                setIsInterventionModalOpen(false);
                setSelectedOrder(null);
              }}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Back to List
            </button>
          </div>

          <div className="bg-white/90 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-2xl p-8 max-h-[80vh] overflow-y-auto">
            <form onSubmit={handleCompleteIntervention} className="space-y-8">
              {/* Section 3: Operations & Analysis */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-blue-100 pb-2">Operations & Analysis</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Operations</p>
                    {Object.keys(interventionData.operations || {}).map((op) => (
                      <label key={op} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                          checked={!!(interventionData.operations as any)?.[op]}
                          onChange={(e) => setInterventionData({
                            ...interventionData,
                            operations: {
                              replacement: false, diagnostic: false, improvement: false, control: false,
                              ...(interventionData.operations as any),
                              [op]: e.target.checked
                            }
                          })}
                        />
                        <span className="text-sm text-gray-600 capitalize">{op}</span>
                      </label>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Maintenance Type</p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="maintenanceType"
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                        checked={interventionData.maintenanceType === 'corrective'}
                        onChange={() => setInterventionData({ ...interventionData, maintenanceType: 'corrective' })}
                      />
                      <span className="text-sm text-gray-600">Corrective</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="maintenanceType"
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                        checked={interventionData.maintenanceType === 'preventive'}
                        onChange={() => setInterventionData({ ...interventionData, maintenanceType: 'preventive' })}
                      />
                      <span className="text-sm text-gray-600">Preventive</span>
                    </label>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Failure Cause</p>
                    {['wear', 'user', 'product', 'other'].map((cause) => (
                      <label key={cause} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="failureCause"
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                          checked={interventionData.failureCause === cause}
                          onChange={() => setInterventionData({ ...interventionData, failureCause: cause as any })}
                        />
                        <span className="text-sm text-gray-600 capitalize">
                          {cause === 'wear' ? 'Normal wear' :
                            cause === 'user' ? 'User error' :
                              cause === 'product' ? 'Product defect' : 'Other'}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="md:col-span-3 space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Technicians (Comma separated)</p>
                    <input
                      type="text"
                      placeholder="e.g. John Doe, Jane Smith"
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                      value={interventionData.technicians}
                      onChange={(e) => setInterventionData({ ...interventionData, technicians: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Cause related to failure</label>
                    <input
                      type="text"
                      placeholder="Specify cause..."
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                      value={interventionData.relatedCause}
                      onChange={(e) => setInterventionData({ ...interventionData, relatedCause: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">
                      Intervention Time {interventionData.interventionTime && <span className="text-blue-600 ml-2">(Calculated: {interventionData.interventionTime})</span>}
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <input
                        type="datetime-local"
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                        value={interventionData.startTime}
                        onChange={(e) => setInterventionData({ ...interventionData, startTime: e.target.value })}
                      />
                      <input
                        type="datetime-local"
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                        value={interventionData.endTime}
                        onChange={(e) => setInterventionData({ ...interventionData, endTime: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Current Meter Reading (Hours)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                    value={interventionData.currentHours}
                    onChange={(e) => setInterventionData({ ...interventionData, currentHours: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              {/* Section 4: Report & Difficulties */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-blue-100 pb-2">Report & Difficulties</h3>
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Intervention Report (Actions)</label>
                    <textarea
                      rows={3}
                      placeholder="Details of actions performed..."
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none resize-none"
                      value={interventionData.actions}
                      onChange={(e) => setInterventionData({ ...interventionData, actions: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Difficulties Encountered</label>
                    <textarea
                      rows={2}
                      placeholder="Problems, missing parts, etc..."
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none resize-none"
                      value={interventionData.difficulties}
                      onChange={(e) => setInterventionData({ ...interventionData, difficulties: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Section 5: Spare Parts */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-blue-100 pb-2">Spare Parts</h3>
                <div className="space-y-3">
                  {(interventionData.partsUsed || []).map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <span className="text-sm text-gray-700">{p.name} (x{p.quantity})</span>
                      <button
                        type="button"
                        onClick={() => setInterventionData({
                          ...interventionData,
                          partsUsed: (interventionData.partsUsed || []).filter((_, i) => i !== idx)
                        })}
                        className="text-red-500 hover:bg-red-50 p-1 rounded"
                      >
                        <Plus className="w-4 h-4 rotate-45" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <select
                      className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none"
                      value={selectedPartId}
                      onChange={(e) => setSelectedPartId(e.target.value)}
                    >
                      <option value="">Choose a part...</option>
                      {spareParts.map(p => (
                        <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      className="w-20 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none"
                      value={partQuantity}
                      onChange={(e) => setPartQuantity(parseInt(e.target.value) || 1)}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const part = spareParts.find(p => p.id === selectedPartId);
                        if (part) {
                          setInterventionData({
                            ...interventionData,
                            partsUsed: [...(interventionData.partsUsed || []), { partId: part.id, name: part.name, quantity: partQuantity }]
                          });
                          setSelectedPartId('');
                          setPartQuantity(1);
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-6 flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsInterventionModalOpen(false);
                    setSelectedOrder(null);
                  }}
                  className="flex-1 px-6 py-3 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all active:scale-95"
                >
                  Cancel
                </button>
                {isEditingReport && (
                  <button
                    type="button"
                    onClick={async () => await generateReportPDF(selectedOrder, interventionData)}
                    className="flex-1 px-6 py-3 text-sm font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Download size={18} />
                    Export PDF
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-[2] px-6 py-3 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 shadow-lg shadow-green-500/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : (isEditingReport ? 'Update Report' : 'Complete Intervention')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
