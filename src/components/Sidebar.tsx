import React from 'react';
import {
  LayoutDashboard,
  Settings,
  Wrench,
  Package,
  Users,
  LogOut,
  Menu,
  X,
  Bell,
  HardDrive,
  MapPin,
  ChevronRight,
  Calendar,
  History,
  BarChart3,
  Factory
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { THERMOPLASTICS_LOGO } from '../constants/logo';

interface SidebarItemProps {
  icon: React.ElementType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
  collapsed?: boolean;
  key?: string;
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

export default function Sidebar({
  activeTab,
  setActiveTab,
  isCollapsed,
  setIsCollapsed
}: {
  activeTab: string,
  setActiveTab: (tab: string) => void,
  isCollapsed: boolean,
  setIsCollapsed: (collapsed: boolean) => void
}) {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = React.useState(false);

  const currentUser = user;

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'technician'] },
    { id: 'layout', label: 'Factory Layout', icon: Factory, roles: ['admin', 'manager', 'technician'] },
    { id: 'machines', label: 'Machines', icon: HardDrive, roles: ['admin', 'manager', 'technician'] },
    { id: 'calendar', label: 'Calendar', icon: Calendar, roles: ['admin', 'manager', 'technician'] },
    {
      id: 'work-orders',
      label: 'Work Orders',
      icon: Wrench,
      roles: ['admin', 'manager', 'technician'],
      subItems: [
        { id: 'work-orders-list', label: 'Work Orders List' },
        { id: 'intervention-reports', label: 'Intervention Reports' }
      ]
    },
    { id: 'inventory', label: 'Inventory', icon: Package, roles: ['admin', 'manager'] },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'manager'] },
    { id: 'audit-logs', label: 'Audit Logs', icon: History, roles: ['admin', 'manager'] },
    { id: 'users', label: 'Users', icon: Users, roles: ['admin', 'manager'] },
  ];

  const filteredItems = menuItems.filter(item => item.roles.includes(currentUser?.role || ''));

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed z-50 p-2 text-gray-600 bg-white rounded-md shadow-md lg:hidden top-4 left-4"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 bg-white border-r border-gray-200 transition-all duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
        isCollapsed ? "w-20" : "w-64"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className={cn(
            "flex items-center h-20 border-b border-gray-100 transition-all duration-300",
            isCollapsed ? "px-2 justify-center" : "px-4"
          )}>
            <div className={cn(
              "flex items-center justify-center bg-white rounded-lg flex-shrink-0 overflow-hidden transition-all duration-300",
              isCollapsed ? "w-18 h-12" : "w-full h-14"
            )}>
              <img
                src={THERMOPLASTICS_LOGO}
                alt="Thermoplastics Logo"
                className={cn(
                  "h-full object-contain transition-all duration-300",
                  isCollapsed ? "w-auto scale-150 -translate-x-1/4" : "w-full"
                )}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  // Fallback to a simple icon if image fails
                  (e.target as HTMLImageElement).style.display = 'none';
                  const parent = (e.target as HTMLElement).parentElement;
                  if (parent) {
                    parent.innerHTML = '<div class="w-full h-full bg-blue-600 flex items-center justify-center text-white font-bold text-xl">T</div>';
                  }
                }}
              />
            </div>
          </div>

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
                    setActiveTab(item.id);
                    setIsOpen(false);
                  }}
                />
                {!isCollapsed && item.subItems && (activeTab === item.id || item.subItems.some(si => activeTab === si.id)) && (
                  <div className="ml-9 space-y-1 animate-in slide-in-from-top-2 duration-200">
                    {item.subItems.map((subItem) => (
                      <button
                        key={subItem.id}
                        onClick={() => {
                          setActiveTab(subItem.id);
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
            "p-4 border-t border-gray-200 transition-all duration-300",
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
              onClick={logout}
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
      </aside>
    </>
  );
}
