'use client';

/**
 * AI Form Import — Milestone 8.
 *
 * Multi-step wizard:
 *  1. Upload    — drag-and-drop PDF/image upload zone
 *  2. Processing — animated AI pipeline visualization (OCR → Layout → AI → Schema → Suggestions)
 *  3. Review    — side-by-side: original document | generated designer canvas + AI suggestions
 *  4. Finalize  — name the form, open in designer
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useMediaQuery from '@mui/material/useMediaQuery';
import { apiClient } from '@/lib/api/client';

// ── Types ─────────────────────────────────────────────────────────────────

type WizardStep = 'upload' | 'processing' | 'review' | 'finalize';

type PipelineStatus =
  | 'pending' | 'ocr' | 'layout' | 'classifying' | 'generating' | 'suggestions' | 'review' | 'failed';

const PIPELINE_STEPS: { key: PipelineStatus; label: string; detail: string; icon: string }[] = [
  { key: 'ocr',          label: 'OCR Extraction',       detail: 'Reading text and bounding boxes from every page…',          icon: '👁' },
  { key: 'layout',       label: 'Layout Analysis',       detail: 'Detecting rows, columns, tables, and form regions…',        icon: '📐' },
  { key: 'classifying',  label: 'AI Classification',     detail: 'Gemini is identifying every field type and label…',         icon: '🤖' },
  { key: 'generating',   label: 'Schema Generation',     detail: 'Converting detected fields into a FormSchema…',             icon: '⚙️' },
  { key: 'suggestions',  label: 'AI Suggestions',        detail: 'Generating validation rules and smart field enhancements…', icon: '✨' },
];

const STATUS_TO_STEP: Partial<Record<PipelineStatus, number>> = {
  ocr: 0, layout: 1, classifying: 2, generating: 3, suggestions: 4, review: 5,
};

// ── Processing Animation ──────────────────────────────────────────────────

function ProcessingAnimation({ status, fileName, overallConfidence, aiProvider }: {
  status: PipelineStatus;
  fileName: string;
  overallConfidence?: number;
  aiProvider?: string;
}) {
  const currentStepIdx = STATUS_TO_STEP[status] ?? 0;
  const isDone = status === 'review';
  const isFailed = status === 'failed';
  const [tick, setTick] = useState(0);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; dx: number; dy: number; life: number; color: string }[]>([]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(interval);
  }, []);

  // Add new particles on each step
  useEffect(() => {
    const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981'];
    const newParticles = Array.from({ length: 12 }, (_, i) => ({
      id: Date.now() + i,
      x: 50 + Math.random() * 400,
      y: 50 + Math.random() * 200,
      dx: (Math.random() - 0.5) * 3,
      dy: (Math.random() - 0.5) * 3,
      life: 1,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    setParticles((prev) => [...prev.slice(-50), ...newParticles]);
  }, [currentStepIdx]);

  // Animate particles
  useEffect(() => {
    setParticles((prev) =>
      prev.map((p) => ({ ...p, x: p.x + p.dx, y: p.y + p.dy, life: p.life - 0.03 })).filter((p) => p.life > 0)
    );
  }, [tick]);

  const progressPct = isDone ? 100 : Math.round((currentStepIdx / PIPELINE_STEPS.length) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', color: '#e2e8f0', padding: 40 }}>
      {/* Central orb animation */}
      <div style={{ position: 'relative', width: 200, height: 200, marginBottom: 48 }}>
        {/* Particle canvas */}
        <svg width={200} height={200} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
          {particles.map((p) => (
            <circle key={p.id} cx={p.x - 100} cy={p.y - 60} r={3} fill={p.color} opacity={p.life} />
          ))}
        </svg>

        {/* Outer pulsing ring */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `conic-gradient(from ${tick * 2}deg, #3b82f6, #8b5cf6, #06b6d4, #3b82f6)`,
          animation: 'none', opacity: isDone ? 0.6 : 0.3,
          filter: 'blur(2px)',
        }} />

        {/* Middle ring */}
        <div style={{
          position: 'absolute', inset: 12, borderRadius: '50%',
          background: `conic-gradient(from ${-tick * 3}deg, #8b5cf6, #3b82f6, #10b981, #8b5cf6)`,
          opacity: isDone ? 0.8 : 0.5,
        }} />

        {/* Inner core */}
        <div style={{
          position: 'absolute', inset: 24, borderRadius: '50%',
          background: '#0f0f1a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 4,
        }}>
          <div style={{ fontSize: 32 }}>
            {isDone ? '✅' : isFailed ? '❌' : PIPELINE_STEPS[Math.min(currentStepIdx, PIPELINE_STEPS.length - 1)]?.icon ?? '⚙️'}
          </div>
          {!isDone && !isFailed && (
            <div style={{ fontSize: 11, color: '#4a5568', fontWeight: 700 }}>{progressPct}%</div>
          )}
        </div>

        {/* Rotating dots */}
        {!isDone && !isFailed && Array.from({ length: 8 }).map((_, i) => {
          const angle = ((i / 8) * 360 + tick * 2) * (Math.PI / 180);
          const r = 90;
          return (
            <div key={i} style={{
              position: 'absolute',
              left: 100 + r * Math.cos(angle) - 3,
              top: 100 + r * Math.sin(angle) - 3,
              width: 6, height: 6, borderRadius: '50%',
              background: i % 2 === 0 ? '#3b82f6' : '#8b5cf6',
              opacity: 0.3 + 0.7 * ((i + Math.floor(tick / 4)) % 8 === 0 ? 1 : 0),
            }} />
          );
        })}
      </div>

      {/* File name */}
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24, maxWidth: 440, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        📄 {fileName}
      </div>

      {/* Step list */}
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {PIPELINE_STEPS.map((step, i) => {
          const isActive = i === currentStepIdx && !isDone;
          const isDoneStep = isDone || i < currentStepIdx;
          const isPending = i > currentStepIdx && !isDone;

          return (
            <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '10px 0', position: 'relative' }}>
              {/* Connector line */}
              {i < PIPELINE_STEPS.length - 1 && (
                <div style={{
                  position: 'absolute', left: 15, top: 36, width: 2, height: 20,
                  background: isDoneStep ? '#3b82f6' : '#1e1e3a',
                  transition: 'background 0.4s',
                }} />
              )}

              {/* Step indicator */}
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: isDoneStep ? '#1d4ed8' : isActive ? '#1e3a8a' : '#1e1e3a',
                border: `2px solid ${isDoneStep ? '#3b82f6' : isActive ? '#3b82f6' : '#2d2d4e'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.4s',
                boxShadow: isActive ? '0 0 12px rgba(59,130,246,0.6)' : 'none',
              }}>
                {isDoneStep ? (
                  <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="#3b82f6" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <span style={{ fontSize: 13 }}>{step.icon}</span>
                )}
              </div>

              {/* Step info */}
              <div style={{ flex: 1, paddingTop: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: isDoneStep || isActive ? '#e2e8f0' : '#374151', transition: 'color 0.4s' }}>
                  {step.label}
                  {isActive && (
                    <span style={{ marginLeft: 8 }}>
                      <span style={{ display: 'inline-block', animation: 'bounce 1s infinite' }}>.</span>
                      <span style={{ display: 'inline-block', animation: 'bounce 1s 0.2s infinite' }}>.</span>
                      <span style={{ display: 'inline-block', animation: 'bounce 1s 0.4s infinite' }}>.</span>
                    </span>
                  )}
                </div>
                {(isActive || isDoneStep) && (
                  <div style={{ fontSize: 11, color: '#4a5568', marginTop: 2 }}>{step.detail}</div>
                )}
              </div>

              {/* Time indicator for done steps */}
              {isDoneStep && !isActive && (
                <div style={{ fontSize: 11, color: '#374151', paddingTop: 4 }}>✓</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div style={{ width: '100%', maxWidth: 480, marginTop: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, color: '#4a5568' }}>
          <span>{isDone ? 'Analysis complete' : 'Analyzing your form…'}</span>
          <span>{progressPct}%</span>
        </div>
        <div style={{ height: 6, background: '#1e1e3a', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: isDone ? 'linear-gradient(90deg, #3b82f6, #10b981)' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
            borderRadius: 3,
            transition: 'width 0.6s ease',
          }} />
        </div>
        {isDone && aiProvider && (
          <div style={{ marginTop: 12, fontSize: 11, color: '#374151', textAlign: 'center' }}>
            Classified by {aiProvider}
            {typeof overallConfidence === 'number' && (
              <> • Overall confidence: <span style={{ color: overallConfidence > 0.75 ? '#34d399' : '#f59e0b', fontWeight: 700 }}>{Math.round(overallConfidence * 100)}%</span></>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      `}</style>
    </div>
  );
}

// ── Upload Zone ───────────────────────────────────────────────────────────

function UploadZone({ onUpload }: { onUpload: (file: File) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelected(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: 40 }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          AI Form Import
        </h2>
        <p style={{ margin: '8px 0 0', color: '#4a5568', fontSize: 14 }}>
          Upload a hospital paper form — our AI will detect every field automatically.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          width: '100%', maxWidth: 520, height: 260, borderRadius: 20,
          border: `2px dashed ${dragOver ? '#3b82f6' : selected ? '#34d399' : '#2d2d4e'}`,
          background: dragOver ? 'rgba(59,130,246,0.05)' : selected ? 'rgba(52,211,153,0.05)' : '#0f0f1a',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.2s', gap: 16,
        }}
      >
        <div style={{ fontSize: 56 }}>{selected ? '📄' : '☁️'}</div>
        {selected ? (
          <>
            <div style={{ fontWeight: 700, color: '#34d399', fontSize: 15 }}>{selected.name}</div>
            <div style={{ fontSize: 12, color: '#4a5568' }}>{(selected.size / 1024 / 1024).toFixed(2)} MB • {selected.type || 'unknown type'}</div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 600, color: '#94a3b8', fontSize: 15 }}>Drag & drop a file here</div>
            <div style={{ fontSize: 13, color: '#374151' }}>Supports PDF, PNG, JPEG, TIFF</div>
          </>
        )}
        <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0]) setSelected(e.target.files[0]); }} />
      </div>

      {/* Feature chips */}
      <div style={{ display: 'flex', gap: 10, marginTop: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['🔍 OCR Extraction', '🤖 Gemini AI Classification', '⚠️ Confidence Scoring', '📋 FormSchema Generation', '✅ Human Review Required'].map((chip) => (
          <span key={chip} style={{ background: '#0f0f1a', border: '1px solid #1e1e3a', borderRadius: 20, padding: '6px 14px', fontSize: 12, color: '#64748b' }}>{chip}</span>
        ))}
      </div>

      {/* Upload button */}
      <button
        disabled={!selected}
        onClick={() => selected && onUpload(selected)}
        style={{
          marginTop: 32, padding: '14px 48px', borderRadius: 12, border: 'none',
          background: selected ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : '#1e1e3a',
          color: selected ? '#fff' : '#374151', fontSize: 15, fontWeight: 700, cursor: selected ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s', boxShadow: selected ? '0 8px 32px rgba(59,130,246,0.3)' : 'none',
        }}
      >
        Analyze with AI →
      </button>
    </div>
  );
}

// ── Suggestion Card ───────────────────────────────────────────────────────

function SuggestionCard({ sug, onRespond }: { sug: any; onRespond: (id: string, accepted: boolean) => void }) {
  const typeColors: Record<string, string> = {
    required: '#f59e0b', validation: '#3b82f6', options: '#8b5cf6',
    fieldType: '#06b6d4', lookup: '#10b981',
  };
  return (
    <div style={{ background: '#0f0f1a', border: `1px solid ${sug.accepted === null ? '#1e1e3a' : sug.accepted ? '#064e3b' : '#450a0a'}`, borderRadius: 8, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ background: typeColors[sug.suggestionType] ?? '#374151', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
          {sug.suggestionType}
        </span>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{sug.fieldKey}</span>
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{sug.reason}</div>
      {sug.accepted === null && (
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Phase 3 polish: 6px padding around 12px text left these well under the ~40px touch-target guideline. */}
          <button onClick={() => onRespond(sug.id, true)} style={{ flex: 1, padding: '10px 6px', minHeight: 40, borderRadius: 6, border: 'none', background: '#064e3b', color: '#34d399', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✓ Accept</button>
          <button onClick={() => onRespond(sug.id, false)} style={{ flex: 1, padding: '10px 6px', minHeight: 40, borderRadius: 6, border: 'none', background: '#450a0a', color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✗ Reject</button>
        </div>
      )}
      {sug.accepted === true && <div style={{ fontSize: 11, color: '#34d399' }}>✓ Accepted</div>}
      {sug.accepted === false && <div style={{ fontSize: 11, color: '#f87171' }}>✗ Rejected</div>}
    </div>
  );
}

// ── Review Step ───────────────────────────────────────────────────────────

function ReviewStep({ jobId, jobData, onFinalize }: { jobId: string; jobData: any; onFinalize: (name: string) => void }) {
  const [suggestions, setSuggestions] = useState<any[]>(jobData.suggestions ?? []);
  const [formName, setFormName] = useState(jobData.classifiedFields?.[0]?.label ? `${jobData.classifiedFields[0].label} Form` : 'Imported Form');
  const fieldsNeedingReview = (jobData.classifiedFields ?? []).filter((f: any) => f.needsReview);

  const respondToSuggestion = async (suggId: string, accepted: boolean) => {
    await apiClient.patch(`/forms/import/jobs/${jobId}/suggestions/${suggId}`, { accepted });
    setSuggestions((prev) => prev.map((s) => s.id === suggId ? { ...s, accepted } : s));
  };

  const pendingCount = suggestions.filter((s) => s.accepted === null).length;
  const acceptedCount = suggestions.filter((s) => s.accepted === true).length;

  // Phase 3 polish: this two-pane review (original doc | AI suggestions) used
  // a bare `display:flex` row with a fixed 340px right pane and no
  // responsive breakpoint at all -- below ~768px the suggestions pane was
  // being crushed to near-zero width while the iframe pane refused to
  // shrink. Below `isMobile`, stack the panes vertically instead: each pane
  // sizes to its own content and the whole step scrolls as one page, rather
  // than fighting to keep two independently-scrolling nested regions inside
  // a viewport too narrow for both.
  const isMobile = useMediaQuery('(max-width:768px)');

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: isMobile ? 'auto' : '100%', gap: 0, color: '#e2e8f0' }}>
      {/* Left: Original document */}
      <div style={{ flex: isMobile ? 'none' : 1, display: 'flex', flexDirection: 'column', borderRight: isMobile ? 'none' : '1px solid #1e1e3a', borderBottom: isMobile ? '1px solid #1e1e3a' : 'none', overflow: isMobile ? 'visible' : 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1e3a', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Original Document
        </div>
        <div style={{ flex: isMobile ? 'none' : 1, overflow: isMobile ? 'visible' : 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, background: '#111827' }}>
          <iframe
            src={`/api/v1/forms/import/jobs/${jobId}/original`}
            style={{ width: '100%', maxWidth: 600, height: isMobile ? 500 : 800, border: 'none', borderRadius: 8 }}
            title="Original uploaded document"
          />
        </div>
      </div>

      {/* Right: Suggestions + summary */}
      <div style={{ width: isMobile ? '100%' : 340, display: 'flex', flexDirection: 'column', overflow: isMobile ? 'visible' : 'hidden' }}>
        {/* Stats */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1e3a' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            AI Review
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <StatChip label="Fields Detected" value={(jobData.classifiedFields ?? []).length} color="#3b82f6" />
            <StatChip label="Needs Review" value={fieldsNeedingReview.length} color={fieldsNeedingReview.length > 0 ? '#f59e0b' : '#34d399'} />
            <StatChip label="Confidence" value={`${Math.round((jobData.overallConfidence ?? 0) * 100)}%`} color={jobData.overallConfidence > 0.75 ? '#34d399' : '#f59e0b'} />
            <StatChip label="Suggestions" value={suggestions.length} color="#8b5cf6" />
          </div>
        </div>

        {/* AI suggestions */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Suggestions ({pendingCount} pending · {acceptedCount} accepted)
          </div>
          {suggestions.length === 0 ? (
            <div style={{ color: '#374151', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>No suggestions generated.</div>
          ) : (
            suggestions.map((s) => (
              <SuggestionCard key={s.id} sug={s} onRespond={respondToSuggestion} />
            ))
          )}
        </div>

        {/* Finalize */}
        <div style={{ padding: 16, borderTop: '1px solid #1e1e3a' }}>
          <input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Form name…"
            style={{ width: '100%', boxSizing: 'border-box', background: '#1a1a2e', border: '1px solid #2d2d4e', borderRadius: 6, color: '#e2e8f0', padding: '8px 12px', fontSize: 13, outline: 'none', marginBottom: 10 }}
          />
          <button
            onClick={() => onFinalize(formName)}
            style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            Open in Designer →
          </button>
          <div style={{ marginTop: 8, fontSize: 11, color: '#374151', textAlign: 'center' }}>
            This will create a Draft — AI never publishes automatically.
          </div>
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: '#1a1a2e', borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: '#374151' }}>{label}</div>
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────

export default function FormImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>('upload');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<any>(null);
  const [fileName, setFileName] = useState('');
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleUpload = useCallback(async (file: File) => {
    setFileName(file.name);
    setStep('processing');

    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post('/forms/import/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const id = res.data.jobId;
    setJobId(id);

    // Start polling
    pollInterval.current = setInterval(async () => {
      const jr = await apiClient.get(`/forms/import/jobs/${id}`);
      const data = jr.data;
      setJobData(data);
      if (data.status === 'review' || data.status === 'failed') {
        if (pollInterval.current) clearInterval(pollInterval.current);
        if (data.status === 'review') setStep('review');
      }
    }, 1500);
  }, []);

  useEffect(() => () => { if (pollInterval.current) clearInterval(pollInterval.current); }, []);

  const handleFinalize = useCallback(async (formName: string) => {
    if (!jobId) return;
    const res = await apiClient.post(`/forms/import/jobs/${jobId}/finalize`, { formName });
    router.push(`/forms/designer/${res.data.documentId}`);
  }, [jobId, router]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0a0a1a', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid #1e1e3a', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <button onClick={() => router.push('/forms/designer')} style={{ background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          My Forms
        </button>
        <div style={{ width: 1, height: 20, background: '#1e1e3a' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>AI Form Import</span>

        {/* Step indicator */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {(['upload', 'processing', 'review'] as const).map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <div style={{ width: 24, height: 1, background: '#1e1e3a' }} />}
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step === s ? '#3b82f6' : ['upload', 'processing', 'review'].indexOf(s) < ['upload', 'processing', 'review'].indexOf(step) ? '#1d4ed8' : '#1e1e3a',
                fontSize: 11, fontWeight: 700, color: step === s || ['upload', 'processing', 'review'].indexOf(s) < ['upload', 'processing', 'review'].indexOf(step) ? '#fff' : '#374151',
              }}>
                {i + 1}
              </div>
              <span style={{ fontSize: 12, color: step === s ? '#e2e8f0' : '#374151', fontWeight: step === s ? 600 : 400 }}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {step === 'upload' && <UploadZone onUpload={handleUpload} />}
        {step === 'processing' && (
          <ProcessingAnimation
            status={jobData?.status ?? 'ocr'}
            fileName={fileName}
            overallConfidence={jobData?.overallConfidence}
            aiProvider={jobData?.aiProvider}
          />
        )}
        {step === 'review' && jobId && jobData && (
          <ReviewStep jobId={jobId} jobData={jobData} onFinalize={handleFinalize} />
        )}
      </div>
    </div>
  );
}
