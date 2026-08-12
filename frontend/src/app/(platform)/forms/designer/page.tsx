'use client';

/**
 * My Forms — the Document Studio landing page.
 * Lists all saved form templates with status badges, thumbnails, and actions.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';

interface FormDoc {
  id: string;
  name: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  latestStatus?: string;
}

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    draft: { bg: '#1e293b', color: '#94a3b8', label: 'Draft' },
    published: { bg: '#064e3b', color: '#34d399', label: 'Published' },
    in_review: { bg: '#1c1917', color: '#f59e0b', label: 'In Review' },
    import_review: { bg: '#1e1b4b', color: '#818cf8', label: 'Imported' },
  };
  const s = map[status ?? 'draft'] ?? map['draft'];
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

export default function MyFormsPage() {
  const router = useRouter();
  const [forms, setForms] = useState<FormDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/forms/designer/documents?limit=100').then((r) => {
      setForms(r.data?.data ?? r.data ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0a1a', color: '#e2e8f0', padding: 32 }}>
      {/* Header. Phase 3 polish: no flexWrap meant the title block + 3-button
          row would overflow horizontally with no scroll affordance below
          ~700px -- wrapping lets the buttons drop to their own row. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Document Studio
          </h1>
          <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 14 }}>Design, publish, and manage clinical forms</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => router.push('/forms/designer/templates')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, border: '1px solid #2d2d4e', background: 'transparent', color: '#e2e8f0', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >
            <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            Template Gallery
          </button>
          <button
            onClick={() => router.push('/forms/import')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, border: '1px solid #2d2d4e', background: 'transparent', color: '#e2e8f0', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >
            <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            AI Import
          </button>
          <button
            onClick={() => router.push('/forms/designer/new')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Form
          </button>
        </div>
      </div>

      {/* Stats strip. Phase 3 polish: a hardcoded `repeat(4, 1fr)` forced 4
          tight columns at any viewport width, clipping on mobile --
          auto-fit/minmax lets the grid reflow to fewer columns on its own,
          matching the pattern already used on the Template Gallery page. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total Forms', value: forms.length, icon: '📋', color: '#3b82f6' },
          { label: 'Published', value: forms.filter((f) => f.latestStatus === 'published').length, icon: '✅', color: '#34d399' },
          { label: 'Drafts', value: forms.filter((f) => !f.latestStatus || f.latestStatus === 'draft').length, icon: '📝', color: '#94a3b8' },
          { label: 'In Review', value: forms.filter((f) => f.latestStatus === 'in_review').length, icon: '🔍', color: '#f59e0b' },
        ].map((s) => (
          <div key={s.label} style={{ background: '#0f0f1a', border: '1px solid #1e1e3a', borderRadius: 12, padding: '20px 24px' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: '#4a5568' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Form grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ background: '#0f0f1a', border: '1px solid #1e1e3a', borderRadius: 12, height: 160, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : forms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 32px' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>No forms yet</div>
          <div style={{ color: '#4a5568', marginBottom: 24 }}>Create your first clinical form or import from a PDF.</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => router.push('/forms/designer/new')} style={{ padding: '12px 28px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              New Form
            </button>
            <button onClick={() => router.push('/forms/import')} style={{ padding: '12px 28px', borderRadius: 8, border: '1px solid #2d2d4e', background: 'transparent', color: '#e2e8f0', fontWeight: 600, cursor: 'pointer' }}>
              Import from PDF
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {forms.map((form) => (
            <FormCard key={form.id} form={form} onOpen={() => router.push(`/forms/designer/${form.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FormCard({ form, onOpen }: { form: FormDoc; onOpen: () => void }) {
  const [hovered, setHovered] = useState(false);
  const date = new Date(form.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#0f0f1a', border: `1px solid ${hovered ? '#3b82f6' : '#1e1e3a'}`,
        borderRadius: 12, padding: 20, cursor: 'pointer',
        transition: 'all 0.2s', transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 8px 32px rgba(59,130,246,0.15)' : 'none',
      }}
    >
      {/* Thumbnail placeholder */}
      <div style={{ height: 80, background: '#1a1a2e', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <svg width={40} height={40} fill="none" viewBox="0 0 24 24" stroke="#2d2d4e" strokeWidth={1}>
          <rect x={3} y={3} width={18} height={18} rx={2} />
          <path d="M7 8h10M7 12h10M7 16h6" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f0', lineHeight: 1.3 }}>{form.name}</div>
        <StatusBadge status={form.latestStatus} />
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#374151' }}>{form.category} • Updated {date}</div>
    </div>
  );
}
