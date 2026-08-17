import React, { useState } from 'react';
import { Check, Plus, X, Stethoscope, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { useConsultationStore } from '../../store/consultationStore';
import { aiService } from '../../services/aiService';
import { useToast } from '../ui/Toast';
import { useLayoutStore } from '../../store/layoutStore';

export function SymptomChips() {
  const [newSymptom, setNewSymptom] = useState('');
  const { showToast } = useToast();
  const { sidebarOpen } = useLayoutStore();

  const { symptoms, transcript, isExtracting, addSymptom, removeSymptom, setSymptoms, setObservations, setProcessingState } =
    useConsultationStore();

  const handleAddSymptom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymptom.trim()) return;
    addSymptom(newSymptom.trim());
    setNewSymptom('');
    showToast(`Added symptom: ${newSymptom.trim()}`, 'success');
  };

  const handleExtractAgain = async () => {
    if (!transcript.trim()) { showToast('Transcript is empty', 'error'); return; }
    try {
      setProcessingState('isExtracting', true);
      const data = await aiService.extractSymptoms(transcript);
      setSymptoms(data.symptoms || []);
      setObservations(data.observations || []);
      showToast('Re-extracted symptoms & observations', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to re-extract symptoms', 'error');
    } finally {
      setProcessingState('isExtracting', false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80 overflow-hidden transition-all duration-300">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-3.5">
        <h3 className={`font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 transition-all duration-300 ${sidebarOpen ? 'text-base' : 'text-lg'}`}>
          <Stethoscope className={`text-teal-600 dark:text-teal-400 transition-all duration-300 ${sidebarOpen ? 'h-5 w-5' : 'h-6 w-6'}`} />
          Extracted Symptoms
          <span className={`flex items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300 font-bold transition-all duration-300 ${sidebarOpen ? 'h-5 w-5 text-[11px]' : 'h-6 w-6 text-xs'}`}>
            {symptoms.length}
          </span>
        </h3>
        <Button size={sidebarOpen ? 'sm' : 'md'} variant="outline" onClick={handleExtractAgain} isLoading={isExtracting} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
          Extract Again
        </Button>
      </div>

      <div className="p-5 space-y-4">
        {symptoms.length === 0 ? (
          <div className={`rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400 transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
            No symptoms extracted yet. Click "Extract Symptoms" from transcript or add manually below.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {symptoms.map((symptom, index) => (
              <div
                key={index}
                className={`group flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 font-semibold text-teal-800 shadow-sm transition-all hover:border-teal-400 hover:bg-teal-100 dark:border-teal-500/40 dark:bg-teal-950/60 dark:text-teal-300 dark:hover:border-teal-400 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}
              >
                <Check className={`text-teal-600 dark:text-teal-400 transition-all duration-300 ${sidebarOpen ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
                <span>{symptom}</span>
                <button
                  type="button"
                  onClick={() => removeSymptom(index)}
                  className="ml-1 text-teal-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400 transition-colors p-0.5 rounded-full"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddSymptom} className="flex gap-2">
          <input
            type="text"
            value={newSymptom}
            onChange={(e) => setNewSymptom(e.target.value)}
            placeholder="Add custom symptom (e.g. Chest tightness)..."
            className={`flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}
          />
          <Button type="submit" size={sidebarOpen ? 'sm' : 'md'} variant="secondary" leftIcon={<Plus className="h-3.5 w-3.5" />}>
            Add Chip
          </Button>
        </form>
      </div>
    </div>
  );
}
