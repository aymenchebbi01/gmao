import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import MachineList from './components/MachineList';
import MachineConsultation from './components/MachineConsultation';
import ProductManagement from './components/ProductManagement';
import WorkOrderList from './components/WorkOrderList';
import Inventory from './components/Inventory';
import UserManagement from './components/UserManagement';
import MaintenanceCalendar from './components/MaintenanceCalendar';
import AuditLogList from './components/AuditLogList';
import AdvancedAnalytics from './components/AdvancedAnalytics';
import FactoryLayout from './components/FactoryLayout';
import Login from './components/Login';
import MobileStatusUpdater from './components/MobileStatusUpdater';
import PurchaseRequests from './components/PurchaseRequests';
import { Toaster } from 'sonner';
import { Machine } from './types';
import { cn, calculateMachineLiveHours } from './lib/utils';
import { api } from './services/api';

function AppContent() {
  const { user, loading, isAdmin, isManager } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [historyMachineId, setHistoryMachineId] = useState<string | null>(null);
  const [deepLinkMachineId, setDeepLinkMachineId] = useState<string | null>(null);

  // Parse deep links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get('tab');
    const machineId = params.get('id');

    if (machineId) {
      setDeepLinkMachineId(machineId);
    }
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, []);

  // Global background task to sync machine hours to DB every 10 minutes
  useEffect(() => {
    if (!user) return;

    const syncMachineHours = async () => {
      try {
        const machines = await api.getMachines();
        const operationalMachines = machines.filter(m => m.status === 'operational');

        const now = new Date();
        const promises = operationalMachines.map(async (machine) => {
          // Only update if it's been at least 5 minutes since last sync to avoid excessive writes
          const lastUpdate = machine.lastHoursUpdate ? new Date(machine.lastHoursUpdate) : null;
          if (!lastUpdate || (now.getTime() - lastUpdate.getTime()) > 5 * 60 * 1000) {
            const liveHours = calculateMachineLiveHours(machine);
            await api.updateMachine(machine.id, {
              currentHours: liveHours,
              lastHoursUpdate: now.toISOString(),
              totalOperatingTime: liveHours * 60
            });
          }
        });

        await Promise.all(promises);
      } catch (error) {
        console.error("Error syncing machine hours:", error);
      }
    };

    // Run every 10 minutes
    const interval = setInterval(syncMachineHours, 10 * 60 * 1000);

    // Also run once on mount
    syncMachineHours();

    return () => clearInterval(interval);
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-500 font-medium">Loading GMAO...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard setActiveTab={setActiveTab} />;
      case 'layout': return <FactoryLayout setActiveTab={setActiveTab} setHistoryMachineId={setHistoryMachineId} />;
      case 'machines': return <MachineList historyMachineId={historyMachineId} onHistoryClose={() => setHistoryMachineId(null)} />;
      case 'consultation': return <MachineConsultation />;
      case 'products': return <ProductManagement />;
      case 'work-orders':
      case 'work-orders-list': return <WorkOrderList view="list" />;
      case 'intervention-reports': return <WorkOrderList view="reports" />;
      case 'inventory': return <Inventory />;
      case 'purchase-requests': return isManager ? <PurchaseRequests /> : <div className="p-8 text-center text-gray-500">Access Denied</div>;
      case 'calendar': return <MaintenanceCalendar />;
      case 'audit-logs': return isAdmin ? <AuditLogList /> : <div className="p-8 text-center text-gray-500">Access Denied</div>;
      case 'analytics': return <AdvancedAnalytics />;
      case 'users': return isManager ? <UserManagement /> : <div className="p-8 text-center text-gray-500">Access Denied</div>;
      case 'mobile-status': return <MobileStatusUpdater machineId={deepLinkMachineId} />;
      default: return <Dashboard setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Toaster position="top-right" richColors />
      {activeTab !== 'mobile-status' && (
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
        />
      )}

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        {activeTab !== 'mobile-status' && (
          <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 flex-shrink-0">
            <div className="flex-1 max-w-xl hidden md:block">
              <div className="relative">

              </div>
            </div>

            <div className="flex items-center space-x-4">

              <div className="h-8 w-px bg-gray-200 mx-2"></div>
              <div className="flex items-center">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 flex items-center justify-center rounded-lg font-bold text-xs">
                  {(user?.displayName || user?.username || 'U').charAt(0).toUpperCase()}
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className={cn(
            "mx-auto transition-all duration-500",
            activeTab === 'layout' ? "max-w-[1600px] w-full" : "max-w-7xl"
          )}>
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
