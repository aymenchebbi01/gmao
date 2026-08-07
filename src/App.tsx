import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
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
import MobileStockUpdater from './components/MobileStockUpdater';
import PurchaseRequests from './components/PurchaseRequests';
import MachineRendement from './components/MachineRendement';
import BackupManager from './components/BackupManager';
import ProductionRendementOverview from './components/production/ProductionRendementOverview';
import ProductionRendementAnalysis from './components/production/ProductionRendementAnalysis';
import ProductionDashboardView from './components/production/ProductionDashboardView';
import ProductionOrdersView from './components/production/ProductionOrdersView';
import ProductionPlanningView from './components/production/ProductionPlanningView';
import ProductionLinesMgmt from './components/production/ProductionLinesMgmt';
import ProductionWorkersMgmt from './components/production/ProductionWorkersMgmt';
import ProductionManagement from './components/production/ProductionManagement';
import ProductionImportCenter from './components/production/ProductionImportCenter';
import { Toaster } from 'sonner';
import { cn, calculateMachineLiveHours } from './lib/utils';
import { api } from './services/api';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function LoginRoute() {
  const { user } = useAuth();
  const location = useLocation();

  if (user) {
    const from = (location.state as any)?.from;
    const fallbackPath = from ? `${from.pathname}${from.search || ''}` : '/dashboard';
    return <Navigate to={fallbackPath} replace />;
  }

  return <Login />;
}

function RequireRole({ children, allowed }: { children: React.ReactNode, allowed: string | string[] }) {
  const { user } = useAuth();
  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];
  
  const effectiveRoles = [...allowedRoles];
  if (effectiveRoles.includes('technician')) {
    if (!effectiveRoles.includes('manager')) effectiveRoles.push('manager');
    if (!effectiveRoles.includes('admin')) effectiveRoles.push('admin');
  }
  if (effectiveRoles.includes('manager')) {
    if (!effectiveRoles.includes('admin')) effectiveRoles.push('admin');
  }

  if (!user || !effectiveRoles.includes(user.role)) {
    return <div className="p-8 text-center text-gray-500">Access Denied</div>;
  }
  return <>{children}</>;
}

function MobileStatusWrapper() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  return <MobileStatusUpdater machineId={id} />;
}

function MobileStockWrapper() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  return <MobileStockUpdater partId={id} />;
}

function AppContent() {
  const { user, loading } = useAuth();

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

  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      
      {/* Mobile status and stock routes without Sidebar and Top Header */}
      <Route
        path="/mobile-status"
        element={
          <RequireAuth>
            <div className="p-4 sm:p-8 overflow-y-auto h-screen bg-gray-50">
              <MobileStatusWrapper />
            </div>
          </RequireAuth>
        }
      />
      <Route
        path="/mobile-stock"
        element={
          <RequireAuth>
            <div className="p-4 sm:p-8 overflow-y-auto h-screen bg-gray-50">
              <MobileStockWrapper />
            </div>
          </RequireAuth>
        }
      />

      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

function AppLayout() {
  const { user } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [historyMachineId, setHistoryMachineId] = React.useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const activePath = location.pathname.replace(/^\//, '') || 'dashboard';

  const setActiveTab = (tab: string) => navigate(`/${tab}`);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Toaster position="top-right" richColors />
      
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50/60">
        {/* Top Header */}
        <header className="h-16 bg-white/90 backdrop-blur-md border-b border-gray-200/80 flex items-center justify-between px-4 sm:px-8 flex-shrink-0 z-10 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100 hidden sm:inline-block font-inter">
              GMAO Thermoplastics
            </span>
          </div>

          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center rounded-xl font-bold text-xs shadow-sm">
                {(user?.displayName || user?.username || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-bold text-gray-900 leading-tight">
                  {user?.displayName || user?.username}
                </span>
                <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                  {user?.role}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8">
          <div className={cn(
            "mx-auto transition-all duration-500",
            activePath === 'layout' ? "max-w-[1600px] w-full" : "max-w-7xl"
          )}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard setActiveTab={setActiveTab} />} />
              <Route path="/layout" element={<FactoryLayout setActiveTab={setActiveTab} setHistoryMachineId={setHistoryMachineId} />} />
              <Route path="/machines" element={<MachineList historyMachineId={historyMachineId} onHistoryClose={() => setHistoryMachineId(null)} />} />
              <Route path="/consultation" element={<MachineConsultation />} />
              <Route path="/products" element={<ProductManagement />} />
              <Route path="/work-orders" element={<WorkOrderList view="list" />} />
              <Route path="/work-orders-list" element={<WorkOrderList view="list" />} />
              <Route path="/intervention-reports" element={<WorkOrderList view="reports" />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/purchase-requests" element={<PurchaseRequests />} />
              <Route path="/calendar" element={<MaintenanceCalendar setActiveTab={setActiveTab} />} />
              <Route path="/audit-logs" element={<RequireRole allowed="admin"><AuditLogList /></RequireRole>} />
              <Route path="/analytics" element={<AdvancedAnalytics />} />
              <Route path="/users" element={<RequireRole allowed="manager"><UserManagement /></RequireRole>} />
              <Route path="/rendement" element={<MachineRendement />} />
              <Route path="/backups" element={<RequireRole allowed="admin"><BackupManager /></RequireRole>} />
              
              {/* Production Module Routes */}
              <Route path="/production-dashboard" element={<ProductionDashboardView />} />
              <Route path="/production-rendement-overview" element={<ProductionRendementOverview />} />
              <Route path="/production-rendement-analysis" element={<ProductionRendementAnalysis />} />
              <Route path="/production-orders" element={<ProductionOrdersView />} />
              <Route path="/production-planning" element={<ProductionPlanningView />} />
              <Route path="/production-lines" element={<ProductionLinesMgmt />} />
              <Route path="/production-employees" element={<ProductionWorkersMgmt />} />
              <Route path="/production-management" element={<ProductionManagement />} />
              <Route path="/production-imports" element={<ProductionImportCenter />} />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
