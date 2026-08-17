import React, { useState } from 'react';
import { Activity, Sparkles, Printer, Save, Copy, Check, TestTube, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { PDFExporter } from './PDFExporter';
import { useConsultationStore } from '../../store/consultationStore';
import { aiService } from '../../services/aiService';
import { consultationService } from '../../services/consultationService';
import { useToast } from '../ui/Toast';
import { Progress } from '../ui/Progress';
import { parseConfidenceNumber } from '../../lib/utils';
import { useLayoutStore } from '../../store/layoutStore';

export function DiagnosisGrid() {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const { sidebarOpen } = useLayoutStore();

  const {
    symptoms, observations, diagnoses, transcript,
    patientName, patientAge, patientGender,
    audioFileName, audioDuration, audioUrl,
    isGeneratingDiagnosis, isSaving,
    setDiagnoses, setProcessingState
  } = useConsultationStore();

  const handleGenerateDiagnosis = async () => {
    if (symptoms.length === 0) { showToast('Please extract or add symptoms before generating diagnosis.', 'error'); return; }
    try {
      setProcessingState('isGeneratingDiagnosis', true);
      showToast('Generating AI differential diagnosis...', 'info');
      const data = await aiService.generateDiagnosis(symptoms, observations);
      setDiagnoses(data.diagnoses || []);
      showToast('Top 3 differential diagnoses generated!', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to generate diagnosis', 'error');
    } finally {
      setProcessingState('isGeneratingDiagnosis', false);
    }
  };

  const handleSaveConsultation = async () => {
    if (!transcript.trim()) { showToast('Consultation cannot be saved without transcript content.', 'error'); return; }
    try {
      setProcessingState('isSaving', true);
      await consultationService.saveConsultation({ patientName: patientName.trim() || 'Anonymous Patient', patientAge: patientAge ? parseInt(patientAge, 10) : null, patientGender: patientGender || 'Unspecified', audioPath: audioUrl, audioFileName, duration: audioDuration, transcript, symptoms, observations, diagnoses });
      showToast('Consultation saved successfully!', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to save consultation', 'error');
    } finally {
      setProcessingState('isSaving', false);
    }
  };

  const handleCopyDiagnosis = () => {
    if (diagnoses.length === 0) return;
    navigator.clipboard.writeText(diagnoses.map((d, i) => `${i + 1}. ${d.name} (Confidence: ${d.confidence})\nTests: ${d.recommendedTests.join(', ')}`).join('\n\n'));
    setCopied(true);
    showToast('Diagnosis copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80 flex flex-col overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-3.5">
        <h3 className={`font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 transition-all duration-300 ${sidebarOpen ? 'text-base' : 'text-lg'}`}>
          <Activity className={`text-teal-600 dark:text-teal-400 transition-all duration-300 ${sidebarOpen ? 'h-5 w-5' : 'h-6 w-6'}`} />
          AI Differential Diagnosis
        </h3>
        <Button size={sidebarOpen ? 'sm' : 'md'} onClick={handleGenerateDiagnosis} isLoading={isGeneratingDiagnosis} disabled={symptoms.length === 0} leftIcon={<Sparkles className="h-3.5 w-3.5" />}>
          Generate Diagnosis
        </Button>
      </div>

      {/* Body */}
      <div className="p-5 flex-1 space-y-4">
        {diagnoses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center space-y-3 dark:border-slate-800 dark:bg-slate-950/50">
            <div className={`flex items-center justify-center rounded-full bg-slate-100 text-teal-600 mx-auto border border-slate-200 dark:bg-slate-800 dark:text-teal-400 dark:border-slate-700 transition-all duration-300 ${sidebarOpen ? 'h-12 w-12' : 'h-16 w-16'}`}>
              <Activity className={`transition-all duration-300 ${sidebarOpen ? 'h-6 w-6' : 'h-8 w-8'}`} />
            </div>
            <h4 className={`font-semibold text-slate-700 dark:text-slate-200 transition-all duration-300 ${sidebarOpen ? 'text-sm' : 'text-base'}`}>No Diagnosis Generated Yet</h4>
            <p className={`text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
              Once symptoms and clinical observations are extracted, click "Generate Diagnosis" to run our state-of-the-art disease prediction AI.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Top 3 Diagnoses</span>
              <button onClick={handleCopyDiagnosis} className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Summary'}</span>
              </button>
            </div>

            {diagnoses.map((diag, index) => {
              const score = parseConfidenceNumber(diag.confidence);
              const color: 'emerald' | 'amber' | 'sky' = score >= 80 ? 'emerald' : score >= 50 ? 'amber' : 'sky';

              return (
                <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 space-y-3 hover:border-teal-300 dark:hover:border-slate-600 transition-all duration-300">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <span className={`flex shrink-0 mt-0.5 items-center justify-center rounded-full bg-teal-100 font-bold text-teal-700 border border-teal-200 dark:bg-slate-800 dark:text-teal-300 dark:border-slate-700 transition-all duration-300 ${sidebarOpen ? 'h-6 w-6 text-xs' : 'h-7 w-7 text-sm'}`}>
                        #{index + 1}
                      </span>
                      <h4 className={`font-bold text-slate-900 dark:text-slate-100 leading-snug transition-all duration-300 ${sidebarOpen ? 'text-sm' : 'text-base'}`}>{diag.name}</h4>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 font-semibold transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'} ${
                      score >= 80 ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30'
                      : score >= 50 ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30'
                      : 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30'
                    }`}>
                      {diag.confidence}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className={`flex justify-between font-medium text-slate-500 dark:text-slate-400 transition-all duration-300 ${sidebarOpen ? 'text-[11px]' : 'text-xs'}`}>
                      <span>Match Likelihood</span>
                      <span>{score}%</span>
                    </div>
                    <Progress value={score} color={color} />
                  </div>

                  {diag.recommendedTests?.length > 0 && (
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
                      <div className={`flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300 transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
                        <TestTube className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                        <span>Recommended Tests:</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {diag.recommendedTests.map((test, idx) => (
                          <span key={idx} className={`inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 transition-all duration-300 ${sidebarOpen ? 'text-[11px]' : 'text-xs'}`}>
                            <CheckCircle2 className="h-3 w-3 text-teal-500 dark:text-teal-400" />
                            {test}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {diagnoses.length > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-800 p-5 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <PDFExporter patientName={patientName || 'Anonymous Patient'} patientAge={patientAge} patientGender={patientGender} transcript={transcript} symptoms={symptoms} observations={observations} diagnoses={diagnoses} />
            <Button variant="outline" size={sidebarOpen ? 'sm' : 'md'} onClick={() => window.print()} leftIcon={<Printer className="h-3.5 w-3.5" />}>Print Report</Button>
          </div>
          <Button variant="primary" size={sidebarOpen ? 'md' : 'lg'} className="w-full" onClick={handleSaveConsultation} isLoading={isSaving} leftIcon={<Save className="h-4 w-4" />}>
            Save Consultation Record
          </Button>
        </div>
      )}
    </div>
  );
}
