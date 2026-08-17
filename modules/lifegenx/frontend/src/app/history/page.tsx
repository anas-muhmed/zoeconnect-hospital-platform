'use client';

import React from 'react';
import { Navbar } from '../../components/layout/Navbar';
import { Sidebar } from '../../components/layout/Sidebar';
import { ConsultationHistoryTable } from '../../components/consultation/ConsultationHistoryTable';
import { History } from 'lucide-react';
import { useLayoutStore } from '../../store/layoutStore';

export default function HistoryPage() {
  const { sidebarOpen } = useLayoutStore();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-200">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 min-w-0 p-6 space-y-6 overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-all duration-300">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className={`font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 transition-all duration-300 ${sidebarOpen ? 'text-xl' : 'text-2xl'}`}>
              <History className={`text-teal-600 dark:text-teal-400 transition-all duration-300 ${sidebarOpen ? 'h-6 w-6' : 'h-7 w-7'}`} />
              Patient Consultation History & Clinical Archive
            </h2>
            <p className={`text-slate-500 dark:text-slate-400 mt-0.5 transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
              Filter, review, re-listen, and download reports for all past patient interactions
            </p>
          </div>

          <ConsultationHistoryTable />
        </main>
      </div>
    </div>
  );
}
