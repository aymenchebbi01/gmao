import React from 'react';
import {
  LayoutDashboard,
  LineChart,
  Settings,
  Wrench,
  Package,
  Users,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Calendar,
  HardDrive,
  BarChart3,
  ShoppingCart,
  Layers,
  Upload,
  Database,
  FileText
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { THERMOPLASTICS_LOGO } from '../constants/logo';

interface SidebarItemProps {
  icon: React.ElementType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
  collapsed?: boolean;
}

const SidebarItem = ({ icon: Icon, label, active, onClick, collapsed }: SidebarItemProps) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center w-full px-4 py-3 text-sm font-medium transition-colors rounded-lg group relative",
      active
        ? "bg-blue-50 text-blue-700"
        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
      collapsed && "justify-center px-2"
    )}
    title={collapsed ? label : undefined}
  >
    <Icon className={cn("w-5 h-5", active ? "text-blue-700" : "text-gray-400 group-hover:text-gray-500", !collapsed && "mr-3")} />
    {!collapsed && <span>{label}</span>}
    {collapsed && active && (
      <div className="absolute left-0 w-1 h-6 bg-blue-600 rounded-r-full" />
    )}
  </button>
);

interface SubMenuItem {
  id: string;
  label: string;
  roles?: string[];
}

interface MenuItem {
  id: string;
  label: string;
  icon?: any;
  roles: string[];
  subItems?: SubMenuItem[];
}

export default function Sidebar({
  isCollapsed,
  setIsCollapsed
}: {
  isCollapsed: boolean,
  setIsCollapsed: (collapsed: boolean) => void
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = React.useState(false);
  const [expandedGroups, setExpandedGroups] = React.useState<string[]>([]);

  const activeTab = location.pathname.replace(/^\//, '') || 'dashboard';
  const currentUser = user;

  const menuItems: MenuItem[] = [
    {
      id: 'dashboard-mgmt',
      label: 'Dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'manager', 'technician', 'production'],
      subItems: [
        { id: 'dashboard', label: 'Maintenance Dashboard', roles: ['admin', 'manager', 'technician'] },
        { id: 'production-dashboard', label: 'Production Dashboard', roles: ['admin', 'manager', 'production'] },
        { id: 'analytics', label: 'Analytics', roles: ['admin', 'manager'] }
      ]
    },
    {
      id: 'machine-mgmt',
      label: 'Machine Management',
      icon: HardDrive,
      roles: ['admin', 'manager', 'technician'],
      subItems: [
        { id: 'layout', label: 'Factory Layout' },
        { id: 'machines', label: 'Machines' },
        { id: 'consultation', label: 'Consultation' },
      ]
    },
    {
      id: 'maintenance-mgmt',
      label: 'Maintenance',
      icon: Wrench,
      roles: ['admin', 'manager', 'technician'],
      subItems: [
        { id: 'work-orders-list', label: 'Maintenance Orders' },
        { id: 'intervention-reports', label: 'Intervention Reports' },
        { id: 'calendar', label: 'Calendar' }
      ]
    },

    { id: 'inventory', label: 'Stock', icon: Package, roles: ['admin', 'manager', 'technician'] },

    {
      id: 'production-mgmt',
      label: 'Rendement',
      icon: Layers,
      roles: ['admin', 'manager', 'production', 'technician'],
      subItems: [
        { id: 'rendement', label: 'Rendement Machines' },
        { id: 'production-rendement-overview', label: 'Rendement Overview' },
        { id: 'production-rendement-analysis', label: 'Rendement Analysis' },
      ]
    },

    {
      id: 'production-of-mgmt',
      label: 'OF Follow-up',
      icon: FileText,
      roles: ['admin', 'manager', 'production'],
      subItems: [
        { id: 'production-orders', label: 'Orders' },
        { id: 'production-planning', label: 'Planning' },
      ]
    },

    { id: 'purchase-requests', label: "Demande d'Achat", icon: ShoppingCart, roles: ['admin', 'manager', 'technician', 'accounting'] },
    { id: 'production-imports', label: 'Import', icon: Upload, roles: ['admin', 'manager', 'production'] },

    {
      id: 'data-mgmt',
      label: 'Data Management',
      icon: Database,
      roles: ['admin', 'manager', 'production', 'technician'],
      subItems: [
        { id: 'products', label: 'Items Data', roles: ['admin', 'manager', 'technician', 'production'] },
        { id: 'production-lines', label: 'Production Lines', roles: ['admin', 'manager', 'production'] },
        { id: 'production-employees', label: 'Employees', roles: ['admin', 'manager', 'production'] },
        { id: 'production-management', label: 'Production Records', roles: ['admin', 'manager', 'production'] },
      ]
    },

    {
      id: 'user-mgmt',
      label: 'User Management',
      icon: Users,
      roles: ['admin'],
      subItems: [
        { id: 'audit-logs', label: 'Audit Logs' },
        { id: 'users', label: 'Users' },
        { id: 'backups', label: 'Sauvegardes DB' },
      ]
    },
  ];

  // Auto-expand the group that contains the active tab
  React.useEffect(() => {
    const activeGroup = menuItems.find(item =>
      item.subItems?.some(si => si.id === activeTab)
    );
    if (activeGroup && !expandedGroups.includes(activeGroup.id)) {
      setExpandedGroups(prev => [...prev, activeGroup.id]);
    }
  }, [activeTab]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const filteredItems = menuItems.filter(item => item.roles.includes(currentUser?.role || ''));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-30 lg:hidden transition-opacity animate-in fade-in duration-200"
        />
      )}

      {/* Mobile Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-blue-50 flex items-center justify-center">
            <span className="text-blue-600 font-bold text-lg font-inter">T</span>
          </div>
          <span className="font-bold text-sm text-gray-900 font-inter">Thermoplastics</span>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 text-gray-500 hover:bg-gray-50 rounded-xl transition-all"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Sidebar Container */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col bg-white border-r border-gray-200 transition-all duration-300 lg:static lg:translate-x-0",
        isOpen ? "translate-x-0 w-64 shadow-2xl" : "-translate-x-full lg:w-64",
        isCollapsed ? "lg:w-20" : "lg:w-64"
      )}>
        {/* Logo Section */}
        <div className={cn(
          "flex items-center gap-2 px-6 py-6 border-b border-gray-100 transition-all duration-300",
          isCollapsed ? "lg:px-4 lg:justify-center" : "lg:px-6"
        )}>
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-blue-50 flex items-center justify-center shrink-0">
            <span className="text-blue-600 font-bold text-xl font-inter">T</span>
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-base text-gray-900 leading-tight font-inter">Thermoplastics</span>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-inter">GMAO</span>
            </div>
          )}
        </div>

        {/* User Card (Mobile) */}
        {!isCollapsed && (
          <div className="p-4 mx-4 mt-6 bg-slate-50 border border-slate-100 rounded-2xl lg:hidden">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center uppercase shadow-md shadow-blue-500/20">
                {currentUser?.displayName?.substring(0, 2) || currentUser?.username?.substring(0, 2) || 'US'}
              </div>
              <div className="flex flex-col min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{currentUser?.displayName || currentUser?.username}</p>
                <p className="text-xs text-gray-500 capitalize">{currentUser?.role}</p>
              </div>
            </div>
          </div>
        )}

        {/* Toggle Button (Desktop) */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex items-center justify-center w-8 h-8 mx-auto mt-4 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          {isCollapsed ? <ChevronRight size={18} /> : <Menu size={18} />}
        </button>

        {/* Navigation */}
        <nav className={cn(
          "flex-1 py-6 space-y-1 overflow-y-auto transition-all duration-300",
          isCollapsed ? "px-2" : "px-4"
        )}>
          {filteredItems.map((item) => (
            <div key={item.id} className="space-y-1">
              <SidebarItem
                icon={item.icon}
                label={item.label}
                active={activeTab === item.id || (item.subItems?.some(si => activeTab === si.id))}
                collapsed={isCollapsed}
                onClick={() => {
                  if (item.subItems && item.subItems.length > 0) {
                    toggleGroup(item.id);
                  } else {
                    navigate(`/${item.id}`);
                  }
                  setIsOpen(false);
                }}
              />
              {!isCollapsed && item.subItems && expandedGroups.includes(item.id) && (
                <div className="ml-9 space-y-1 animate-in slide-in-from-top-2 duration-200">
                  {item.subItems.filter(si => !si.roles || si.roles.includes(currentUser?.role || '')).map((subItem) => (
                    <button
                      key={subItem.id}
                      onClick={() => {
                        navigate(`/${subItem.id}`);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors",
                        activeTab === subItem.id
                          ? "bg-blue-50 text-blue-700"
                          : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                      )}
                    >
                      {subItem.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* User Profile */}
        <div className={cn(
          "p-4 border-t border-gray-200 transition-all duration-300 mt-auto pt-6",
          isCollapsed ? "items-center" : ""
        )}>
          <div className={cn(
            "flex items-center mb-4",
            isCollapsed ? "justify-center px-0" : "px-2"
          )}>
            <div className="flex items-center justify-center w-10 h-10 bg-gray-100 rounded-full flex-shrink-0">
              <Users className="text-gray-500" size={20} />
            </div>
            {!isCollapsed && (
              <div className="ml-3 overflow-hidden">
                <p className="text-sm font-medium text-gray-900 truncate">{currentUser?.displayName || 'User'}</p>
                <p className="text-xs text-gray-500 capitalize">{currentUser?.role}</p>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className={cn(
              "flex items-center w-full py-2 text-sm font-medium text-red-600 transition-colors rounded-lg hover:bg-red-50",
              isCollapsed ? "justify-center px-0" : "px-4"
            )}
            title={isCollapsed ? "Sign Out" : undefined}
          >
            <LogOut className={cn("w-5 h-5", !isCollapsed && "mr-3")} />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </div>
    </>
  );
}
