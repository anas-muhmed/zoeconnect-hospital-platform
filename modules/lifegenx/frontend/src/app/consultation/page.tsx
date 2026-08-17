'use client';

import React from 'react';
import { Navbar } from '../../components/layout/Navbar';
import { Sidebar } from '../../components/layout/Sidebar';
import { AudioUploader } from '../../components/consultation/AudioUploader';
import { AudioPlayer } from '../../components/consultation/AudioPlayer';
import { TranscriptEditor } from '../../components/consultation/TranscriptEditor';
import { SymptomChips } from '../../components/consultation/SymptomChips';
import { ObservationEditor } from '../../components/consultation/ObservationEditor';
import { DiagnosisGrid } from '../../components/consultation/DiagnosisGrid';
import { Button } from '../../components/ui/Button';
import { User, RotateCcw, Stethoscope } from 'lucide-react';
import { useConsultationStore } from '../../store/consultationStore';
import { useLayoutStore } from '../../store/layoutStore';

export default function ConsultationPage() {
  const { patientName, patientAge, patientGender, setPatientDetails, resetWorkspace } = useConsultationStore();
  const { sidebarOpen } = useLayoutStore();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-200">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 min-w-0 p-6 space-y-5 overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-all duration-300">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className={`font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 transition-all duration-300 ${sidebarOpen ? 'text-xl' : 'text-2xl'}`}>
                <Stethoscope className={`text-teal-600 dark:text-teal-400 transition-all duration-300 ${sidebarOpen ? 'h-6 w-6' : 'h-7 w-7'}`} />
                Clinical Symptom Extraction & AI Diagnosis Workspace
              </h2>
              <p className={`text-slate-500 dark:text-slate-400 mt-0.5 transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
                Upload consultation audio, verify extracted symptoms, and generate differential diagnosis recommendations
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={resetWorkspace} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>
              Reset Workspace
            </Button>
          </div>

          {/* Patient Meta Input Bar */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={`block font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 transition-all duration-300 ${sidebarOpen ? 'text-[11px]' : 'text-xs'}`}>
                  Patient Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientDetails({ patientName: e.target.value })}
                    placeholder="e.g. David Miller"
                    className={`w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 transition-all duration-300 ${sidebarOpen ? 'text-sm' : 'text-base'}`}
                  />
                </div>
              </div>
              <div>
                <label className={`block font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 transition-all duration-300 ${sidebarOpen ? 'text-[11px]' : 'text-xs'}`}>
                  Age (Years)
                </label>
                <input
                  type="number"
                  value={patientAge}
                  onChange={(e) => setPatientDetails({ patientAge: e.target.value })}
                  placeholder="e.g. 56"
                  className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 transition-all duration-300 ${sidebarOpen ? 'text-sm' : 'text-base'}`}
                />
              </div>
              <div>
                <label className={`block font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 transition-all duration-300 ${sidebarOpen ? 'text-[11px]' : 'text-xs'}`}>
                  Biological Gender
                </label>
                <select
                  value={patientGender}
                  onChange={(e) => setPatientDetails({ patientGender: e.target.value })}
                  className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 transition-all duration-300 ${sidebarOpen ? 'text-sm' : 'text-base'}`}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other / Unspecified</option>
                </select>
              </div>
            </div>
          </div>

          {/* 3-Panel Layout — switches from col-span-4 to col-span-4 but larger when no sidebar */}
          <div className={`grid grid-cols-1 gap-5 items-start transition-all duration-300 ${sidebarOpen ? 'lg:grid-cols-12' : 'lg:grid-cols-12'}`}>
            {/* Left Panel */}
            <div className={`space-y-4 transition-all duration-300 ${sidebarOpen ? 'lg:col-span-4' : 'lg:col-span-4'}`}>
              <AudioUploader />
              <AudioPlayer />
              <TranscriptEditor />
            </div>

            {/* Middle Panel */}
            <div className={`space-y-4 transition-all duration-300 ${sidebarOpen ? 'lg:col-span-4' : 'lg:col-span-4'}`}>
              <SymptomChips />
              <ObservationEditor />
            </div>

            {/* Right Panel */}
            <div className={`space-y-4 transition-all duration-300 ${sidebarOpen ? 'lg:col-span-4' : 'lg:col-span-4'}`}>
              <DiagnosisGrid />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
