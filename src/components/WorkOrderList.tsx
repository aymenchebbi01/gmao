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
  Download,
  RotateCw
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

export interface CauseOption {
  id: string;
  labelFr: string;
  labelEn: string;
}

export interface CategoryOption {
  id: string;
  labelFr: string;
  labelEn: string;
  causes: CauseOption[];
}

export const FAILURE_CAUSE_CATEGORIES: CategoryOption[] = [
  {
    id: 'mechanical',
    labelFr: 'Mécanique',
    labelEn: 'Mechanical',
    causes: [
      { id: 'mech_lubrication', labelFr: 'Manque de lubrification', labelEn: 'Lack of Lubrication' },
      { id: 'mech_overload', labelFr: 'Surcharge / Surutilisation', labelEn: 'Overload / Overuse' },
      { id: 'mech_misalignment', labelFr: 'Désalignement / Pièces desserrées', labelEn: 'Misalignment / Loose Parts' },
      { id: 'mech_fatigue', labelFr: 'Rupture par fatigue', labelEn: 'Fatigue Failure' },
    ]
  },
  {
    id: 'environmental',
    labelFr: 'Environnemental',
    labelEn: 'Environmental',
    causes: [
      { id: 'env_contamination', labelFr: 'Contamination', labelEn: 'Contamination' },
      { id: 'env_temp_humidity', labelFr: 'Températures / Humidité extrêmes', labelEn: 'Temperature / Humidity Extremes' },
    ]
  },
  {
    id: 'electrical',
    labelFr: 'Électrique',
    labelEn: 'Electrical',
    causes: [
      { id: 'elec_fault', labelFr: 'Défaut électrique', labelEn: 'Electrical Fault' },
      { id: 'elec_sensor_control', labelFr: 'Défaillance capteur / commande', labelEn: 'Sensor / Control Failure' },
    ]
  },
  {
    id: 'human_process',
    labelFr: 'Humain / Process',
    labelEn: 'Human / Process',
    causes: [
      { id: 'human_user_error', labelFr: 'Erreur utilisateur / Mauvaise utilisation', labelEn: 'User Error / Misuse' },
      { id: 'human_poor_maint', labelFr: 'Maintenance insuffisante / Omission', labelEn: 'Poor / Missed Maintenance' },
      { id: 'human_setup', labelFr: 'Installation / Réglage incorrect', labelEn: 'Incorrect Installation / Setup' },
    ]
  },
  {
    id: 'equipment',
    labelFr: 'Équipement',
    labelEn: 'Equipment',
    causes: [
      { id: 'equip_product_defect', labelFr: 'Défaut de fabrication / Vice caché', labelEn: 'Product Defect' },
      { id: 'equip_end_life', labelFr: 'Fin de vie du composant', labelEn: 'End of Service Life' },
    ]
  },
  {
    id: 'other',
    labelFr: 'Autre',
    labelEn: 'Other',
    causes: [
      { id: 'other_custom', labelFr: 'Autre (à préciser)', labelEn: 'Other (Specify)' },
    ]
  }
];

export const getCategoryForCause = (cause?: string, category?: string): string => {
  if (category) return category;
  if (!cause) return '';
  for (const cat of FAILURE_CAUSE_CATEGORIES) {
    if (cat.id === cause || cat.causes.some(c => c.id === cause)) return cat.id;
  }
  if (cause === 'wear') return 'mechanical';
  if (cause === 'user') return 'human_process';
  if (cause === 'product') return 'equipment';
  if (cause === 'other') return 'other';
  return 'other';
};

interface WorkOrderListProps {
  view?: 'list' | 'reports';
}

export default function WorkOrderList({ view = 'list' }: WorkOrderListProps) {
  const { user, isAdmin } = useAuth();
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
  const [refreshing, setRefreshing] = useState(false);
  const [machineSearch, setMachineSearch] = useState('');
  const [machineDropdownOpen, setMachineDropdownOpen] = useState(false);
  const machineDropdownRef = React.useRef<HTMLDivElement>(null);

  // Close machine dropdown on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (machineDropdownRef.current && !machineDropdownRef.current.contains(e.target as Node)) {
        setMachineDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);


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
    status: 'pending' as WorkOrder['status'],
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
    failureCategory: '',
    failureCause: '',
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

  const formatForDateTimeInput = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return format(d, "yyyy-MM-dd'T'HH:mm");
      }
    } catch (e) {
      // fallback
    }
    return dateStr.length > 16 ? dateStr.slice(0, 16) : dateStr;
  };

  const getInterventionStartEnd = (report?: any) => {
    let startVal = formatForDateTimeInput(report?.startTime);
    let endVal = formatForDateTimeInput(report?.endTime);

    if (report?.durationMinutes) {
      if (endVal && startVal) {
        const diff = differenceInMinutes(new Date(endVal), new Date(startVal));
        if (Math.abs(diff - report.durationMinutes) > 2) {
          const endD = new Date(endVal);
          const startD = new Date(endD.getTime() - report.durationMinutes * 60 * 1000);
          startVal = format(startD, "yyyy-MM-dd'T'HH:mm");
        }
      } else if (endVal && !startVal) {
        const endD = new Date(endVal);
        const startD = new Date(endD.getTime() - report.durationMinutes * 60 * 1000);
        startVal = format(startD, "yyyy-MM-dd'T'HH:mm");
      } else if (!endVal && !startVal) {
        const nowD = new Date();
        const startD = new Date(nowD.getTime() - report.durationMinutes * 60 * 1000);
        startVal = format(startD, "yyyy-MM-dd'T'HH:mm");
        endVal = format(nowD, "yyyy-MM-dd'T'HH:mm");
      }
    }
    return { startTime: startVal, endTime: endVal };
  };

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

  const fetchData = async (showToast = false) => {
    if (showToast) setRefreshing(true);
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
      if (showToast) toast.success('Data refreshed');
    } catch (error) {
      console.error("Error fetching data:", error);
      if (showToast) toast.error('Failed to refresh data');
    } finally {
      if (showToast) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(false), 30000); // Poll every 30 seconds
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
          status: formData.status || 'pending',
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
        status: 'pending',
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
      status: order.status || 'pending',
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

  const handleDeleteReport = async (workOrderId: string) => {
    if (!confirm('Are you sure you want to delete this intervention report? The maintenance work order will NOT be deleted.')) return;
    try {
      await api.deleteInterventionReport(workOrderId);
      toast.success('Intervention report deleted successfully (Work order preserved)');
      fetchData();
    } catch (error) {
      console.error("Error deleting intervention report:", error);
      toast.error('Failed to delete intervention report');
    }
  };

  const handleDeleteWorkOrder = async (id: string) => {
    if (!confirm("Are you sure you want to delete this maintenance work order?")) return;
    try {
      await api.deleteWorkOrder(id);
      toast.success('Work order deleted successfully');
      fetchData();
    } catch (error) {
      console.error("Error deleting work order:", error);
      toast.error('Failed to delete work order');
    }
  };

  const generateWorkOrderPDF = (order: WorkOrder) => {
    const doc = new jsPDF();
    const logoUrl = THERMOPLASTICS_LOGO;

    try {
      doc.addImage(logoUrl, 'PNG', 12, 12, 50, 15);
    } catch (e) {
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
    doc.rect(10, 10, 190, 277);

    // Title
    doc.setFontSize(16);
    doc.setTextColor(0, 51, 102);
    doc.setFont("helvetica", "bold");
    doc.text('WORK ORDER / ORDRE DE TRAVAIL', 65, 24);
    doc.line(65, 25, 185, 25);

    // Section: Work Order Overview
    doc.setFillColor(31, 73, 125);
    doc.rect(10, 30, 190, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('Work Order Details', 105, 34, { align: 'center' });

    doc.setTextColor(0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");

    doc.text('WO Number:', 12, 43);
    doc.text('Creation Date:', 107, 43);
    doc.text('Priority:', 12, 50);
    doc.text('Status:', 107, 50);
    doc.text('Type:', 12, 57);
    doc.text('Assigned To:', 107, 57);

    doc.setFont("helvetica", "normal");
    doc.text(`${order.id}`, 45, 43);
    doc.text(`${order.createdAt ? format(toDate(order.createdAt), 'PPP p') : 'N/A'}`, 140, 43);
    doc.text(`${order.priority ? order.priority.toUpperCase() : 'MEDIUM'}`, 45, 50);
    doc.text(`${order.status ? order.status.toUpperCase() : 'PENDING'}`, 140, 50);
    doc.text(`${order.type ? order.type.toUpperCase() : 'CORRECTIVE'}`, 45, 57);
    doc.text(`${order.assignedName || order.assignedTo || 'Unassigned'}`, 140, 57);

    doc.line(10, 62, 200, 62);

    // Section: Machine Information
    const machine = machines.find(m => m.id === order.machineId);
    doc.setFillColor(31, 73, 125);
    doc.rect(10, 62, 190, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('Machine Information', 105, 66, { align: 'center' });

    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text('Machine Name:', 12, 74);
    doc.text('Serial Number:', 107, 74);
    doc.text('Machine Type:', 12, 80);
    doc.text('Location:', 107, 80);

    doc.setFont("helvetica", "normal");
    doc.text(`${machine?.name || order.machineName || 'N/A'}`, 45, 74);
    doc.text(`${machine?.serialNumber || 'N/A'}`, 140, 74);
    doc.text(`${machine?.type || 'N/A'}`, 45, 80);
    doc.text(`${machine?.location || order.location || 'N/A'}`, 140, 80);

    let currentY = 86;
    if (machine?.imageUrl) {
      try {
        doc.addImage(machine.imageUrl, 'JPEG', 150, 86, 40, 30);
        currentY = 118;
      } catch (e) {
        console.error("Error adding machine image to PDF:", e);
      }
    }

    doc.line(10, currentY, 200, currentY);

    // Section: Issue / Description
    doc.setFillColor(31, 73, 125);
    doc.rect(10, currentY, 190, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('Issue / Description', 105, currentY + 4, { align: 'center' });

    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
    const descriptionText = order.description || order.malfunctionDescription || 'No description provided.';
    const splitDesc = doc.splitTextToSize(descriptionText, 185);
    doc.text(splitDesc, 12, currentY + 12);

    currentY += Math.max(30, splitDesc.length * 6 + 12);
    doc.line(10, currentY, 200, currentY);

    // Section: Requester & Notes
    doc.setFillColor(31, 73, 125);
    doc.rect(10, currentY, 190, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('Requester & Instructions for Technician', 105, currentY + 4, { align: 'center' });

    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text('Created By / Requester:', 12, currentY + 14);
    doc.setFont("helvetica", "normal");
    doc.text(`${order.createdByName || order.requesterName || 'N/A'}`, 60, currentY + 14);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.text('* Please complete the maintenance intervention and fill out the Intervention Report upon job completion.', 12, currentY + 24);

    doc.save(`work_order_${order.id}.pdf`);
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
    doc.text('Created By', 55, 42, { align: 'center' });
    doc.text('Assigned To', 150, 42, { align: 'center' });
    doc.line(10, 44, 200, 44);
    doc.line(105, 36, 105, 64); // Vertical separator

    doc.setFont("helvetica", "normal");
    doc.text(`Name : ${report.requesterName || ''}`, 12, 48);
    doc.text(`Sector : ${report.issuerSector || ''}`, 107, 48);
    doc.text(`Date : ${report.requestDate || ''}`, 12, 54);
    doc.text(`Technicians : ${report.technicians || ''}`, 107, 54);
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

    // Checkmarks for operations
    if (report.operations?.replacement) doc.text('X', 75, currentY + 17);
    if (report.operations?.diagnostic) doc.text('X', 75, currentY + 23);
    if (report.operations?.improvement) doc.text('X', 75, currentY + 29);
    if (report.operations?.control) doc.text('X', 75, currentY + 35);

    if (report.maintenanceType === 'corrective') doc.text('X', 125, currentY + 17);
    if (report.maintenanceType === 'preventive') doc.text('X', 125, currentY + 23);

    // Failure Cause details
    const catId = getCategoryForCause(report.failureCause, report.failureCategory);
    const catObj = FAILURE_CAUSE_CATEGORIES.find(c => c.id === catId);
    const causeObj = catObj?.causes.find(c => c.id === report.failureCause);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(31, 73, 125);
    doc.text('Category:', 132, currentY + 17);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    doc.text(`${catObj ? catObj.labelFr : 'N/A'}`, 150, currentY + 17);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(31, 73, 125);
    doc.text('Cause:', 132, currentY + 24);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    const causeText = causeObj ? `${causeObj.labelFr} (${causeObj.labelEn})` : (report.failureCause || 'N/A');
    const splitCauseText = doc.splitTextToSize(causeText, 62);
    doc.text(splitCauseText, 132, currentY + 29);

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
    if (!selectedOrder) {
      toast.error('Please select a Maintenance Order to link this report to');
      return;
    }
    if (!interventionData.failureCategory) {
      toast.error('Veuillez sélectionner une catégorie de cause de défaillance / Please select a failure cause category');
      return;
    }
    if (!interventionData.failureCause) {
      toast.error('Veuillez sélectionner une cause spécifique de défaillance / Please select a specific failure cause');
      return;
    }
    if ((interventionData.failureCategory === 'other' || interventionData.failureCause === 'other_custom') && !interventionData.relatedCause.trim()) {
      toast.error('Veuillez préciser la cause dans le champ "Préciser la cause" / Please specify cause details');
      return;
    }
    setLoading(true);

    try {
      const duration = differenceInMinutes(new Date(interventionData.endTime), new Date(interventionData.startTime));

      const report = {
        ...interventionData,
        durationMinutes: duration,
        completedAt: isEditingReport ? (selectedOrder.intervention?.completedAt || new Date().toISOString()) : new Date().toISOString(),
      };

      const repNum = selectedOrder.reportNumber || selectedOrder.id.replace('WO', 'REP');

      // Update Work Order
      await api.updateWorkOrder(selectedOrder.id, {
        status: 'completed',
        reportNumber: repNum,
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
        failureCategory: '',
        failureCause: '',
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

  const technicians = users.filter(u => u.role?.toLowerCase() === 'technician');

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
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className={cn(
                "p-2 text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all",
                refreshing && "animate-spin text-blue-600"
              )}
              title="Refresh Data"
            >
              <RotateCw size={18} />
            </button>
            {view === 'list' ? (
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
                    status: 'pending',
                    parentFaultId: '',
                    childFaultIds: [],
                    assignedTo: '',
                    issuerName: '',
                    issuerSector: '',
                    requesterName: user?.displayName || user?.username || '',
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
            ) : (
              <button
                onClick={() => {
                  setSelectedOrder(null);
                  setIsEditingReport(false);
                  setInterventionData({
                    issuerName: user?.displayName || user?.username || '',
                    issuerSector: '',
                    requesterName: '',
                    requestDate: format(new Date(), 'yyyy-MM-dd'),
                    technicians: user?.displayName || user?.username || '',
                    location: '',
                    malfunctionDescription: '',
                    currentHours: 0,
                    operations: {
                      replacement: false,
                      diagnostic: false,
                      improvement: false,
                      control: false,
                    },
                    maintenanceType: 'corrective',
                    failureCategory: '',
                    failureCause: '',
                    relatedCause: '',
                    interventionTime: '',
                    actions: '',
                    difficulties: '',
                    partsUsed: [],
                    startTime: '',
                    endTime: '',
                    comments: '',
                  });
                  setIsInterventionModalOpen(true);
                }}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Intervention Report
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
                              const { startTime, endTime } = getInterventionStartEnd(report);
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
                                failureCategory: getCategoryForCause(report?.failureCause, report?.failureCategory),
                                failureCause: report?.failureCause || '',
                                relatedCause: report?.relatedCause || '',
                                interventionTime: report?.interventionTime || '',
                                actions: report?.actions || '',
                                difficulties: report?.difficulties || '',
                                partsUsed: report?.partsUsed || [],
                                startTime: startTime,
                                endTime: endTime,
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
                                const { startTime, endTime } = getInterventionStartEnd(report);
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
                                  failureCategory: getCategoryForCause(report?.failureCause, report?.failureCategory),
                                  failureCause: report?.failureCause || '',
                                  relatedCause: report?.relatedCause || '',
                                  interventionTime: report?.interventionTime || '',
                                  actions: report?.actions || '',
                                  difficulties: report?.difficulties || '',
                                  partsUsed: report?.partsUsed || [],
                                  startTime: startTime,
                                  endTime: endTime,
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
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteReport(order.id)}
                                className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                                title="Delete Report"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => generateWorkOrderPDF(order)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-all"
                              title="Download Work Order PDF"
                            >
                              <Download size={14} />
                              PDF
                            </button>
                            <button
                              onClick={() => handleEditClick(order)}
                              className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                              title="Edit"
                            >
                              <Edit2 size={18} />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteWorkOrder(order.id)}
                                className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
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
                    placeholder="e.g. WO-2026-001"
                    disabled={true}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-50"
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Machine</label>
                  <div className="relative" ref={machineDropdownRef}>
                    {/* Trigger button */}
                    <button
                      type="button"
                      onClick={() => {
                        setMachineDropdownOpen(v => !v);
                        setMachineSearch('');
                      }}
                      className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-left"
                    >
                      <HardDrive className="text-gray-400 flex-shrink-0" size={16} />
                      <span className={formData.machineId ? 'text-gray-900 truncate' : 'text-gray-400'}>
                        {formData.machineId
                          ? (() => { const m = machines.find(m => m.id === formData.machineId); return m ? `${m.name} (${m.location})` : 'Select Machine'; })()
                          : 'Select Machine'}
                      </span>
                      <svg className="ml-auto flex-shrink-0 text-gray-400" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>

                    {/* Hidden required input for form validation */}
                    <input
                      type="text"
                      required
                      readOnly
                      tabIndex={-1}
                      value={formData.machineId}
                      className="absolute inset-0 opacity-0 pointer-events-none w-full"
                    />

                    {/* Dropdown panel */}
                    {machineDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full min-w-[280px] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                        {/* Search input */}
                        <div className="p-2 border-b border-gray-100">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                            <input
                              type="text"
                              autoFocus
                              placeholder="Search by name, location or serial no..."
                              className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                              value={machineSearch}
                              onChange={(e) => setMachineSearch(e.target.value)}
                            />
                          </div>
                        </div>
                        {/* Option list */}
                        <ul className="max-h-52 overflow-y-auto py-1">
                          {(() => {
                            const q = machineSearch.toLowerCase();
                            const filtered = machines.filter(m =>
                              m.name?.toLowerCase().includes(q) ||
                              m.location?.toLowerCase().includes(q) ||
                              m.siteNumber?.toLowerCase().includes(q) ||
                              (`#${m.siteNumber}`).toLowerCase().includes(q) ||
                              m.id?.toLowerCase().includes(q)
                            );
                            if (filtered.length === 0) return (
                              <li className="px-4 py-3 text-sm text-gray-400 italic">No machines found</li>
                            );
                            return filtered.map(m => (
                              <li key={m.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData({ ...formData, machineId: m.id });
                                    setMachineDropdownOpen(false);
                                  }}
                                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex items-center gap-3 ${formData.machineId === m.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-800'}`}
                                >
                                  {m.siteNumber && (
                                    <span className="flex-shrink-0 w-8 text-center text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1 py-0.5">#{m.siteNumber}</span>
                                  )}
                                  <span className="truncate flex-1">{m.name}</span>
                                  <span className="flex-shrink-0 text-xs text-gray-400">{m.location}</span>
                                </button>
                              </li>
                            ));
                          })()}
                        </ul>
                      </div>
                    )}
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
                    <option value="corrective">Corrective</option>
                    <option value="preventive">Preventive</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Status</label>
                  <select
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  >
                    <option value="pending">Pending</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Assigned To</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <select
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all appearance-none"
                      value={formData.assignedTo}
                      onChange={(e) => {
                        const uid = e.target.value;
                        const tech = technicians.find(t => t.uid === uid);
                        setFormData({
                          ...formData,
                          assignedTo: uid,
                          issuerName: tech ? (tech.displayName || tech.username) : ''
                        });
                      }}
                    >
                      <option value="">Unassigned</option>
                      {technicians.map(u => (
                        <option key={u.uid} value={u.uid}>{u.displayName || u.username}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Workshop A, Line 3"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Request Date</label>
                  <input
                    type="date"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={formData.requestDate}
                    onChange={(e) => setFormData({ ...formData, requestDate: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Description / Problem Statement</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe the issue or task to be performed..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value, malfunctionDescription: e.target.value })}
                />
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
                  {loading ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Changes' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Intervention Report Overlay */}
      {isInterventionModalOpen && (
        <div className="absolute inset-x-0 top-0 z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Intervention Report</h1>
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
              {/* Section 0: Select Maintenance Order */}
              <div className="space-y-4 p-6 bg-blue-50/50 rounded-2xl border border-blue-100">
                <div className="flex items-center justify-between border-b border-blue-100 pb-2">
                  <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wider">
                    Maintenance Order (WO) Selection
                  </h3>
                  {selectedOrder && (
                    <span className="text-xs font-bold text-blue-700 bg-blue-100/80 px-2.5 py-1 rounded-md">
                      WO Number: {selectedOrder.id}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
                    Select Maintenance Order *
                  </label>
                  <select
                    required
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={selectedOrder?.id || ''}
                    onChange={(e) => {
                      const woId = e.target.value;
                      const found = orders.find(o => o.id === woId);
                      if (found) {
                        setSelectedOrder(found);
                        const report = found.intervention;
                        const machineObj = machines.find(m => m.id === found.machineId);
                        setInterventionData(prev => ({
                          ...prev,
                          issuerName: report?.issuerName || found.issuerName || found.assignedName || user?.displayName || user?.username || '',
                          issuerSector: report?.issuerSector || found.issuerSector || '',
                          requesterName: report?.requesterName || found.requesterName || found.createdByName || '',
                          requestDate: report?.requestDate || found.requestDate || format(new Date(), 'yyyy-MM-dd'),
                          technicians: report?.technicians || found.assignedName || '',
                          location: report?.location || found.location || machineObj?.location || '',
                          malfunctionDescription: report?.malfunctionDescription || found.malfunctionDescription || found.description || '',
                          currentHours: report?.currentHours || machineObj?.currentHours || 0,
                          maintenanceType: report?.maintenanceType || found.type || 'corrective',
                          failureCategory: getCategoryForCause(report?.failureCause, report?.failureCategory),
                          failureCause: report?.failureCause || '',
                        }));
                      } else {
                        setSelectedOrder(null);
                      }
                    }}
                  >
                    <option value="">-- Choose a Maintenance Order to Link --</option>
                    {orders.filter(o => o.status !== 'completed' || o.id === selectedOrder?.id).map(o => (
                      <option key={o.id} value={o.id}>
                        {o.id} — {o.machineName || 'Unknown Machine'} ({o.priority.toUpperCase()}) | Status: {o.status}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedOrder && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 text-xs text-gray-600 bg-white p-3 rounded-xl border border-blue-100">
                    <div><span className="text-gray-400 font-bold block">WO ID:</span> {selectedOrder.id}</div>
                    <div><span className="text-gray-400 font-bold block">MACHINE:</span> {selectedOrder.machineName || 'Unknown'}</div>
                    <div><span className="text-gray-400 font-bold block">PRIORITY:</span> {selectedOrder.priority.toUpperCase()}</div>
                    <div><span className="text-gray-400 font-bold block">ASSIGNED TO:</span> {selectedOrder.assignedName || 'Unassigned'}</div>
                  </div>
                )}
              </div>

              {/* Section 3: Operations & Analysis */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-blue-100 pb-2">Operations & Analysis</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

                {/* Categorized Two-Step Failure Cause Selector */}
                <div className="space-y-4 p-5 bg-gray-50/80 rounded-2xl border border-gray-200/80">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Cause de la défaillance / Failure Cause *
                      </h4>
                      {interventionData.failureCategory && (
                        <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-100">
                          Catégorie: {FAILURE_CAUSE_CATEGORIES.find(c => c.id === interventionData.failureCategory)?.labelFr}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      Étape 1 : Choisissez la catégorie de la défaillance / Step 1: Select the cause category
                    </p>

                    {/* Step 1: Category Selection */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                      {FAILURE_CAUSE_CATEGORIES.map((cat) => {
                        const isCatSelected = interventionData.failureCategory === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              const firstCause = cat.causes[0]?.id || '';
                              setInterventionData({
                                ...interventionData,
                                failureCategory: cat.id,
                                failureCause: firstCause,
                              });
                            }}
                            className={cn(
                              "p-3 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[76px]",
                              isCatSelected
                                ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20"
                                : "bg-white border-gray-200 text-gray-800 hover:border-blue-300 hover:bg-blue-50/50"
                            )}
                          >
                            <span className="text-xs font-bold leading-tight">{cat.labelFr}</span>
                            <span className={cn(
                              "text-[10px] mt-1 font-medium",
                              isCatSelected ? "text-blue-100" : "text-gray-400"
                            )}>
                              {cat.labelEn}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 2: Specific Cause Selection */}
                  {(() => {
                    const currentCatObj = FAILURE_CAUSE_CATEGORIES.find(c => c.id === interventionData.failureCategory);
                    if (!currentCatObj) return null;
                    return (
                      <div className="space-y-3 pt-3 border-t border-gray-200/60 animate-in fade-in slide-in-from-top-1 duration-200">
                        <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Étape 2 : Sélectionnez la cause précise / Step 2: Select specific cause ({currentCatObj.labelFr}) *
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {currentCatObj.causes.map((cause) => {
                            const isCauseSelected = interventionData.failureCause === cause.id;
                            return (
                              <label
                                key={cause.id}
                                className={cn(
                                  "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                                  isCauseSelected
                                    ? "bg-white border-blue-500 text-blue-900 shadow-sm ring-2 ring-blue-500/20"
                                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                                )}
                              >
                                <input
                                  type="radio"
                                  name="failureCauseSpecific"
                                  className="mt-0.5 w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                  checked={isCauseSelected}
                                  onChange={() => setInterventionData({ ...interventionData, failureCause: cause.id })}
                                />
                                <div>
                                  <span className="text-xs font-bold block text-gray-900">{cause.labelFr}</span>
                                  <span className="text-[11px] text-gray-500">{cause.labelEn}</span>
                                </div>
                              </label>
                            );
                          })}
                        </div>

                        {/* Free text field if Category is Other or Cause is Other */}
                        {(interventionData.failureCategory === 'other' || interventionData.failureCause === 'other_custom') && (
                          <div className="pt-2">
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                              Préciser la cause / Specify cause details *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Veuillez détailler la cause exacte / Please describe the exact cause..."
                              className="w-full px-4 py-2.5 bg-white border border-blue-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                              value={interventionData.relatedCause}
                              onChange={(e) => setInterventionData({ ...interventionData, relatedCause: e.target.value })}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
