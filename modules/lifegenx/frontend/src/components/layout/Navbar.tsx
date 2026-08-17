import React from 'react';
import { useRouter } from 'next/navigation';
import { Stethoscope, User, LogOut, Sparkles, Activity, Sun, Moon, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useLayoutStore } from '../../store/layoutStore';

export function Navbar() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const { sidebarOpen, toggleSidebar } = useLayoutStore();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/90 px-4 sm:px-6 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80 transition-colors duration-200">
      {/* Left: Sidebar Toggle + Brand */}
      <div className="flex items-center gap-3">
        {/* Sidebar Toggle Button */}
        <button
          onClick={toggleSidebar}
          title={sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
          className="flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-slate-100 text-slate-600 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-400 transition-all"
        >
          {sidebarOpen ? (
            <PanelLeftClose className="h-4.5 w-4.5" />
          ) : (
            <PanelLeftOpen className="h-4.5 w-4.5" />
          )}
        </button>

        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-md shadow-teal-200 dark:shadow-teal-950/50 text-white">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              MedAI Clinical Assistant
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-300 border border-teal-500/30">
                <Sparkles className="h-3 w-3" /> Zoi.AI
              </span>
            </h1>
            <p className="hidden sm:block text-[10px] text-slate-500 dark:text-slate-400">Hospital EMR Symptom Extraction & Differential Diagnosis System</p>
          </div>
        </div>
      </div>

      {/* Right: Status, Theme Toggle, Doctor Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Night Mode'}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 transition-all shadow-sm"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden sm:inline">Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="h-3.5 w-3.5 text-indigo-500" />
              <span className="hidden sm:inline">Night Mode</span>
            </>
          )}
        </button>

        {/* Status Indicator */}
        <div className="hidden lg:flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300">
          <Activity className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
          <span>Powered By Camerin</span>
        </div>

        {/* Doctor Info */}
        {user ? (
          <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-teal-600 dark:bg-slate-800 dark:text-teal-400 border border-slate-200 dark:border-slate-700">
              <User className="h-4 w-4" />
            </div>
            <div className="hidden lg:block">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">{user.name}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">{user.department}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800 dark:hover:text-rose-400 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
