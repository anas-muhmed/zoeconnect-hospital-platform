import { Outlet } from "react-router-dom";
import React, { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { BrowserRouter, Routes, Route, NavLink, Navigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useMortuaryName } from '../context/MortuaryNameContext.jsx';
import { getUploadUrl } from '../config.js';
import {
  LayoutDashboard,
  Users,
  Bed,
  UserPlus,
  Receipt,
  LogOut,
  FileText,
  Settings,
  TrendingUp,
  Calendar,
  AlertCircle,
  CheckCircle,
  List,
  ClipboardCheck,
  Tag,
  History,
  UserCheck,
  Menu,
  X,
  Building2,
  KeyRound
} from 'lucide-react';

export default function Dashboard_Base() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const role = localStorage.getItem("role");
  const admin = localStorage.getItem("admin");
  const { mortuaryName, mortuaryLogo } = useMortuaryName();

  const navigotor = useNavigate();
  let navItems = [];

  const handleLogout = async () => {
    try {
      await axios.post(`${import.meta.env.VITE_API_BASE || '/api'}/logout`, {}, { withCredentials: true });
    } catch (error) {
      console.error('Logout error:', error);
    }
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('admin');
    navigotor("/");
  };

  if (role != "House Keeping" && role != "Admin" && role != "SuperAdmin") {
    navItems = [
      { path: '/dashboard/body-registration', icon: UserPlus, label: 'Body Registration' },
      { path: '/dashboard/cabin-allocation', icon: Bed, label: 'Cabin Allocation' },
      { path: '/dashboard/body-release', icon: LogOut, label: 'Body Release' },
      { path: '/dashboard/billing', icon: Receipt, label: 'Billing' },
      { path: '/dashboard/release-history', icon: History, label: 'Release History' },
      { path: '/dashboard/housekeeping', icon: ClipboardCheck, label: 'Housekeeping' },
    ];
  }
  else if (role === "House Keeping") {
    navItems = [
      { path: '/dashboard/housekeeping', icon: ClipboardCheck, label: 'Housekeeping' },
    ];
  }
  else if (role === "SuperAdmin") {
    // SuperAdmin sidebar minimal.
    // Note: these navigate to the same page; modals should be triggered from inside the page.
    navItems = [
      { path: '/dashboard/superadmin-dashboard', icon: LayoutDashboard, label: 'SuperAdmin Dashboard' },
      { path: '/dashboard/superadmin-dashboard?tab=hospital', icon: Building2, label: 'Add Hospital' },
    ];
  }
  else if (role === "Admin") {
    navItems = [
      { path: '/dashboard/admin',                    icon: LayoutDashboard, label: 'Admin Dashboard' },
      { path: '/dashboard/admin/user-approvals',     icon: UserCheck,        label: 'User Approvals' },
      { path: '/dashboard/admin/cabin-master',       icon: Settings,         label: 'Masters' },
      { path: '/dashboard/admin/service-master',     icon: Tag,              label: 'Service Master' },
      { path: '/dashboard/admin/billing-settings',   icon: Settings,         label: 'Billing Settings' },
      { path: '/dashboard/admin/reports',            icon: FileText,         label: 'Reports' },
      { path: '/dashboard/admin/reset-password',     icon: KeyRound,         label: 'Reset Password' },
    ];
  }

  return (
    <>
      <div className="flex h-screen bg-gray-50">
        {/* Mobile backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar — off-canvas drawer on mobile, static column on lg+ */}
        <aside className={`fixed inset-y-0 left-0 z-40 ${sidebarOpen ? 'w-64' : 'w-20'}
          bg-white border-r border-gray-200 transition-all duration-300 flex flex-col
          transform ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static`}>

          {/* Logo - links to this role's own dashboard home (always the
              first entry in their own navItems), same basic expectation as
              any real app: clicking the brand mark takes you home. */}
          <div className="h-16 flex items-center justify-between border-b border-gray-200 bg-blue-600 px-4">
            <Link to={navItems[0]?.path || '/dashboard'} className="min-w-0">
              {sidebarOpen ? (
                <div className="text-center flex items-center gap-2">
                  {role === "SuperAdmin" ? (
                    <Building2 className="text-white" size={28} />
                  ) : mortuaryLogo ? (
                    <img src={getUploadUrl(mortuaryLogo)} alt="Logo" className="h-10 w-10 object-contain" />
                  ) : (
                    <Building2 className="text-white" size={28} />
                  )}
                  <div className="min-w-0">
                    {role === "SuperAdmin" ? (
                      <>
                        <h1 className="text-white font-bold text-lg truncate">SuperAdmin</h1>
                        <p className="text-blue-200 text-xs">Control Center</p>
                      </>
                    ) : (
                      <>
                        <h1 className="text-white font-bold text-lg truncate" title={mortuaryName}>{mortuaryName}</h1>
                        <p className="text-blue-200 text-xs">Mortuary Management</p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                role === "SuperAdmin" ? (
                  <Building2 className="text-white" size={28} />
                ) : mortuaryLogo ? (
                  <img src={getUploadUrl(mortuaryLogo)} alt="Logo" className="h-10 w-10 object-contain" />
                ) : (
                  <Building2 className="text-white" size={28} />
                )
              )}
            </Link>
            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden text-white/80 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>


          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
            {
              role == "House Keeping" && admin == null ? (
                <>
                  {navItems.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `sidebar-link ${isActive ? 'active' : ''}`
                      }
                    >
                      <item.icon size={20} />
                      {sidebarOpen && <span>{item.label}</span>}
                    </NavLink>
                  ))}
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-all duration-150 mt-2"
                  >
                    <LogOut size={20} />
                    {sidebarOpen && <span>Logout</span>}
                  </button>
                </>
              ) : (
                <>
                  {navItems.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `sidebar-link ${isActive ? 'active' : ''}`
                      }
                    >
                      <item.icon size={20} />
                      {sidebarOpen && <span>{item.label}</span>}
                    </NavLink>
                  ))}
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-all duration-150 mt-2"
                  >
                    <LogOut size={20} />
                    {sidebarOpen && <span>Logout</span>}
                  </button>
                </>
              )
            }
          </nav>

          {/* Toggle Button — desktop collapse only */}
          <div className="p-4 border-t border-gray-200 hidden lg:block">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 rounded-xl transition-all duration-150"
            >
              <TrendingUp size={18} className={`transform transition-transform duration-200 ${sidebarOpen ? '' : 'rotate-180'}`} />
              {sidebarOpen && <span>Collapse</span>}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto min-w-0">
          {/* Header */}
          <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden text-gray-600 hover:text-gray-900 shrink-0"
              >
                <Menu size={22} />
              </button>

              {role !== "SuperAdmin" && mortuaryLogo && (
                <img src={getUploadUrl(mortuaryLogo)} alt="Logo" className="h-10 w-10 object-contain hidden sm:block shrink-0" />
              )}
              <div className="min-w-0">
                <h2 className="text-base sm:text-xl font-semibold text-gray-800 truncate">Mortuary Management System</h2>
                {role === "SuperAdmin" ? null : (
                  <p className="text-xs sm:text-sm text-gray-500 truncate">{mortuaryName}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <span className="text-sm text-gray-500 hidden md:block">

                {new Date().toLocaleDateString('en-IN', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </span>
            </div>
          </header>

          {/* Page Content */}
          <div className="p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </>
  )
}