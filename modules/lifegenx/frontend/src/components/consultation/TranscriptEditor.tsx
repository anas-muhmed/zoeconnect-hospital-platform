import React, { useState, useEffect } from 'react';
import { FileText, Loader2, Sparkles, Languages } from 'lucide-react';
import { Button } from '../ui/Button';
import { useConsultationStore } from '../../store/consultationStore';
import { aiService } from '../../services/aiService';
import { useToast } from '../ui/Toast';
import { useLayoutStore } from '../../store/layoutStore';

export function TranscriptEditor() {
  const { 
    transcript, 
    malayalamTranscript, 
    isTranscribing, 
    isExtracting, 
    setTranscript, 
    setMalayalamTranscript,
    setSymptoms, 
    setObservations, 
    setProcessingState 
  } = useConsultationStore();

  const { showToast } = useToast();
  const { sidebarOpen } = useLayoutStore();

  // Selected tab for bilingual mode: 'malayalam' | 'english'
  const [activeTab, setActiveTab] = useState<'malayalam' | 'english'>('english');

  // Auto-switch to Malayalam tab if Malayalam transcription comes in
  useEffect(() => {
    if (malayalamTranscript) {
      setActiveTab('malayalam');
    } else {
      setActiveTab('english');
    }
  }, [malayalamTranscript]);

  const handleExtract = async () => {
    if (!transcript.trim()) {
      showToast('Transcript is empty. Please enter or transcribe audio first.', 'error');
      return;
    }
    try {
      setProcessingState('isExtracting', true);
      showToast('Analyzing transcript with state-of-the-art disease prediction AI...', 'info');
      const data = await aiService.extractSymptoms(transcript);
      setSymptoms(data.symptoms || []);
      setObservations(data.observations || []);
      showToast('Symptoms & Observations extracted successfully!', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to extract symptoms', 'error');
    } finally {
      setProcessingState('isExtracting', false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80 overflow-hidden transition-all duration-300">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-3.5">
        <h3 className={`font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 transition-all duration-300 ${sidebarOpen ? 'text-base' : 'text-lg'}`}>
          <FileText className={`text-teal-600 dark:text-teal-400 transition-all duration-300 ${sidebarOpen ? 'h-5 w-5' : 'h-6 w-6'}`} />
          Interaction Transcript
        </h3>
        <Button 
          size={sidebarOpen ? 'sm' : 'md'} 
          onClick={handleExtract} 
          isLoading={isExtracting} 
          disabled={!transcript.trim()} 
          leftIcon={<Sparkles className="h-3.5 w-3.5" />}
        >
          Extract Symptoms
        </Button>
      </div>

      {/* Sub-Tab Selector for Malayalam Flow */}
      {malayalamTranscript && (
        <div className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800 px-5 py-2 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
            <Languages className="h-3 w-3 text-teal-500" />
            Bilingual Transcript Views
          </span>
          <div className="flex rounded-md bg-slate-200/60 p-0.5 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => setActiveTab('malayalam')}
              className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-all ${
                activeTab === 'malayalam'
                  ? 'bg-white text-slate-800 shadow dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              Original Malayalam
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('english')}
              className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-all ${
                activeTab === 'english'
                  ? 'bg-white text-slate-800 shadow dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              Translated English
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="p-5">
        {isTranscribing ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50 space-y-2">
            <Loader2 className="h-7 w-7 animate-spin text-teal-600 dark:text-teal-400" />
            <p className={`text-slate-700 dark:text-slate-300 font-medium transition-all duration-300 ${sidebarOpen ? 'text-sm' : 'text-base'}`}>
              Advanced Audio Transcription Model Processing...
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Converting speech to clinical transcript</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeTab === 'malayalam' && malayalamTranscript ? (
              <textarea
                value={malayalamTranscript}
                onChange={(e) => setMalayalamTranscript(e.target.value)}
                placeholder="Malayalam transcription will show here..."
                className={`w-full resize-none rounded-lg border border-slate-300 bg-white p-3.5 text-slate-800 font-mono leading-relaxed placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 transition-all duration-300 ${sidebarOpen ? 'h-56 text-xs' : 'h-72 text-sm'}`}
              />
            ) : (
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Doctor-patient interaction transcript will appear here after audio upload, or type/paste transcript manually..."
                className={`w-full resize-none rounded-lg border border-slate-300 bg-white p-3.5 text-slate-800 font-mono leading-relaxed placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 transition-all duration-300 ${sidebarOpen ? 'h-56 text-xs' : 'h-72 text-sm'}`}
              />
            )}
            
            <div className="flex justify-between text-[11px] text-slate-400 px-1">
              <span>
                {activeTab === 'malayalam' && malayalamTranscript 
                  ? `${malayalamTranscript.length} characters (Original Malayalam)` 
                  : `${transcript.length} characters (English Translation)`
                }
              </span>
              <span>Editable text block</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
