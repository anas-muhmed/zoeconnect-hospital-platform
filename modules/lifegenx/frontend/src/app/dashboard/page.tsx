'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../components/layout/Navbar';
import { Sidebar } from '../../components/layout/Sidebar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Stethoscope, FilePlus, Activity, Headphones, FileText, ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { consultationService } from '../../services/consultationService';
import { DashboardMetrics } from '../../types';
import { formatDate } from '../../lib/utils';
import { useLayoutStore } from '../../store/layoutStore';

export default function DashboardPage() {
  const { sidebarOpen } = useLayoutStore();

  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalConsultations: 24,
    todayDiagnoses: 8,
    todayAudioUploaded: 6,
    recentConsultations: [
      {
        id: 'c1',
        patientName: 'David Miller',
        patientAge: 56,
        patientGender: 'Male',
        duration: '03:15',
        transcript: 'Patient reports fever, dry cough, severe headache...',
        symptoms: ['Fever', 'Dry Cough', 'Headache'],
        observations: ['Age 56', 'Diabetic', 'Smoker'],
        diagnoses: [{ name: 'Acute Respiratory Tract Infection', confidence: '87%', recommendedTests: ['CBC', 'CRP'] }],
        doctorId: 'd1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'c2',
        patientName: 'Sarah Connor',
        patientAge: 42,
        patientGender: 'Female',
        duration: '01:50',
        transcript: 'Patient presents with acute epigastric pain and heartburn...',
        symptoms: ['Epigastric pain', 'Heartburn', 'Nausea'],
        observations: ['No vomiting', 'NSAID use'],
        diagnoses: [{ name: 'Acute Gastritis / GERD', confidence: '82%', recommendedTests: ['H. pylori Test', 'Endoscopy'] }],
        doctorId: 'd1',
        createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        updatedAt: new Date(Date.now() - 3600000 * 2).toISOString()
      }
    ]
  });

  useEffect(() => {
    consultationService.getDashboardMetrics().then((res) => { if (res) setMetrics(res); }).catch(() => {});
  }, []);

  const metricCards = [
    { label: 'Total Consultations', value: metrics.totalConsultations, icon: Stethoscope, color: 'teal', note: 'All records saved in EMR', noteIcon: CheckCircle2 },
    { label: "Today's Diagnoses", value: metrics.todayDiagnoses, icon: Activity, color: 'emerald', note: 'State-of-the-art Disease Prediction AI', noteIcon: Clock },
    { label: 'Audio Uploaded Today', value: metrics.todayAudioUploaded, icon: Headphones, color: 'sky', note: 'Incredible Audio Transcription Engine', noteIcon: CheckCircle2 }
  ];

  const colorMap: Record<string, string> = {
    teal: 'bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-500/15 dark:border-teal-500/30 dark:text-teal-400',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/30 dark:text-emerald-400',
    sky: 'bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-500/15 dark:border-sky-500/30 dark:text-sky-400'
  };

  const noteColorMap: Record<string, string> = {
    teal: 'text-teal-600 dark:text-teal-300',
    emerald: 'text-emerald-600 dark:text-emerald-300',
    sky: 'text-sky-600 dark:text-sky-300'
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-200">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 min-w-0 p-6 space-y-6 overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-all duration-300">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h2 className={`font-bold text-slate-900 dark:text-slate-100 transition-all duration-300 ${sidebarOpen ? 'text-xl' : 'text-2xl'}`}>
                Clinical Overview Dashboard
              </h2>
              <p className={`text-slate-500 dark:text-slate-400 mt-0.5 transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
                Real-time status of doctor-patient AI consultation workflow
              </p>
            </div>
            <Link href="/consultation">
              <Button size={sidebarOpen ? 'md' : 'lg'} variant="primary" leftIcon={<FilePlus className="h-4 w-4" />}>
                Start New Consultation
              </Button>
            </Link>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {metricCards.map((card) => {
              const Icon = card.icon;
              const NoteIcon = card.noteIcon;
              return (
                <div
                  key={card.label}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 transition-all duration-300"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
                        {card.label}
                      </p>
                      <h3 className={`font-extrabold text-slate-900 dark:text-white mt-1 transition-all duration-300 ${sidebarOpen ? 'text-3xl' : 'text-4xl'}`}>
                        {card.value}
                      </h3>
                    </div>
                    <div className={`flex items-center justify-center rounded-xl border transition-all duration-300 ${colorMap[card.color]} ${sidebarOpen ? 'h-12 w-12' : 'h-14 w-14'}`}>
                      <Icon className={`transition-all duration-300 ${sidebarOpen ? 'h-6 w-6' : 'h-7 w-7'}`} />
                    </div>
                  </div>
                  <div className={`mt-3 flex items-center gap-1 transition-all duration-300 ${noteColorMap[card.color]} ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
                    <NoteIcon className="h-3.5 w-3.5" />
                    <span>{card.note}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recent Consultations Table */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
              <h3 className={`font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 transition-all duration-300 ${sidebarOpen ? 'text-base' : 'text-lg'}`}>
                <FileText className={`text-teal-600 dark:text-teal-400 transition-all duration-300 ${sidebarOpen ? 'h-5 w-5' : 'h-6 w-6'}`} />
                Recent Patient Consultations
              </h3>
              <Link href="/history" className="text-xs text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1">
                View Full History <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                  <tr className={`transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
                    <th className="py-3 px-5">Patient</th>
                    <th className="py-3 px-5">Time</th>
                    <th className="py-3 px-5">Symptoms</th>
                    <th className="py-3 px-5">Top AI Diagnosis</th>
                    <th className="py-3 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {metrics.recentConsultations.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className={`py-3.5 px-5 font-semibold text-slate-900 dark:text-slate-100 transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
                        {item.patientName}
                        <span className="text-slate-400 font-normal block" style={{ fontSize: sidebarOpen ? '11px' : '12px' }}>
                          {item.patientAge ? `${item.patientAge} Yrs` : ''} {item.patientGender || ''}
                        </span>
                      </td>
                      <td className={`py-3.5 px-5 text-slate-600 dark:text-slate-400 whitespace-nowrap transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
                        {formatDate(item.createdAt)}
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex flex-wrap gap-1">
                          {item.symptoms.slice(0, 3).map((s, idx) => (
                            <Badge key={idx} variant="teal" size={sidebarOpen ? 'sm' : 'md'}>{s}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className={`py-3.5 px-5 font-medium text-slate-900 dark:text-slate-200 transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
                        {item.diagnoses?.[0]?.name || 'N/A'}
                        <span className={`text-emerald-600 dark:text-emerald-400 block font-normal transition-all duration-300 ${sidebarOpen ? 'text-[11px]' : 'text-xs'}`}>
                          Confidence: {item.diagnoses?.[0]?.confidence || 'N/A'}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <Link href="/history">
                          <Button variant="ghost" size={sidebarOpen ? 'sm' : 'md'}>View Record</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
