import React from 'react';
import { ClipboardList } from 'lucide-react';
import { useConsultationStore } from '../../store/consultationStore';
import { useLayoutStore } from '../../store/layoutStore';

export function ObservationEditor() {
  const { observations, setObservations } = useConsultationStore();
  const { sidebarOpen } = useLayoutStore();

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setObservations(e.target.value.split('\n'));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80 overflow-hidden transition-all duration-300">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-3.5">
        <h3 className={`font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 transition-all duration-300 ${sidebarOpen ? 'text-base' : 'text-lg'}`}>
          <ClipboardList className={`text-teal-600 dark:text-teal-400 transition-all duration-300 ${sidebarOpen ? 'h-5 w-5' : 'h-6 w-6'}`} />
          Clinical Observations & History
        </h3>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {observations.filter((o) => o.trim()).length} parameters
        </span>
      </div>

      <div className="p-5 space-y-2">
        <textarea
          value={observations.join('\n')}
          onChange={handleTextChange}
          placeholder="Enter clinical observations, medical history, lifestyle factors, or denied symptoms (one per line)..."
          className={`w-full resize-none rounded-lg border border-slate-300 bg-white p-3.5 text-slate-800 font-mono leading-relaxed placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 transition-all duration-300 ${sidebarOpen ? 'h-44 text-xs' : 'h-56 text-sm'}`}
        />
        <div className="flex justify-between text-[11px] text-slate-400 px-1">
          <span>Editable multiline observations</span>
        </div>
      </div>
    </div>
  );
}
