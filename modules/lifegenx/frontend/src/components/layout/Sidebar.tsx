import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FilePlus, History, Stethoscope, MessageSquare } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLayoutStore } from '../../store/layoutStore';

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen } = useLayoutStore();

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'New Consultation', href: '/consultation', icon: FilePlus },
    { name: 'Consultation History', href: '/history', icon: History },
    { name: 'Zoi Bot Chat', href: '/zoibot', icon: MessageSquare }
  ];


  return (
    <aside
      className={cn(
        'sticky top-16 z-30 h-[calc(100vh-4rem)] flex-col justify-between border-r border-slate-200 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90 transition-all duration-300 ease-in-out overflow-hidden',
        sidebarOpen ? 'w-64 flex p-4' : 'w-0 hidden'
      )}
    >
      <div className="space-y-6">
        <div className="px-3 py-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Clinical Navigation
          </h2>
        </div>
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all duration-150 whitespace-nowrap',
                  isActive
                    ? 'bg-teal-50 text-teal-700 border border-teal-200 dark:bg-gradient-to-r dark:from-teal-500/20 dark:to-emerald-500/10 dark:text-teal-300 dark:border-teal-500/30 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400')} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Clinical Notice Box */}
      <div className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
          <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-200 mb-1 whitespace-nowrap">
            <Stethoscope className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
            Clinical AI Assist
          </div>
          <p className="leading-relaxed">
            Extracts patient symptoms & generates differential diagnosis recommendations for physician review.
          </p>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 text-[11px] text-slate-400 flex justify-between px-1">
          <span>v1.0.0</span>
          <span>Advanced AI Engine</span>
        </div>
      </div>
    </aside>
  );
}
