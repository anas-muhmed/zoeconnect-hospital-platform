'use client';

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

export default function TemplateGalleryPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<FormDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloning, setCloning] = useState<string | null>(null);

  useEffect(() => {
    // Fetch all published forms to use as templates
    apiClient.get('/forms/designer/documents?limit=100').then((r) => {
      const allForms = r.data?.data ?? r.data ?? [];
      // Only show forms that are published as templates
      const published = allForms.filter((f: FormDoc) => f.latestStatus === 'published');
      setTemplates(published);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleUseTemplate = async (templateId: string, templateName: string) => {
    setCloning(templateId);
    try {
      // Fetch template versions to get the schema
      const versRes = await apiClient.get(`/forms/designer/documents/${templateId}/versions`);
      const versions = versRes.data ?? [];
      if (versions.length === 0) throw new Error('No versions found');
      const latest = versions[versions.length - 1];
      
      // Create a new document
      const docRes = await apiClient.post('/forms/designer/documents', { 
        name: `Copy of ${templateName}`, 
        category: 'clinical' 
      });
      const newDocId = docRes.data.id;
      
      // Create initial version with cloned schema
      await apiClient.post(`/forms/designer/documents/${newDocId}/versions`, { 
        schema: latest.payload 
      });
      
      // Redirect to the new form in designer
      router.push(`/forms/designer/${newDocId}`);
    } catch (e) {
      console.error('Failed to clone template', e);
      setCloning(null);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0a1a', color: '#e2e8f0', padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <button 
          onClick={() => router.push('/forms/designer')}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <svg width={24} height={24} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#fff' }}>
            Template Gallery
          </h1>
          <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 14 }}>Choose a template to jumpstart your design</p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: '#0f0f1a', border: '1px solid #1e1e3a', borderRadius: 12, height: 220, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 32px' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎨</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>No templates found</div>
          <div style={{ color: '#4a5568' }}>Publish a form to make it available as a template.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
          {/* Blank option */}
          <div
            onClick={() => router.push('/forms/designer/new')}
            style={{
              background: '#0f0f1a', border: '1px dashed #3b82f6', borderRadius: 12, padding: 20, 
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s', minHeight: 220
            }}
          >
            <div style={{ width: 48, height: 48, background: 'rgba(59,130,246,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <svg width={24} height={24} fill="none" viewBox="0 0 24 24" stroke="#3b82f6" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div style={{ fontWeight: 600, color: '#3b82f6' }}>Blank Form</div>
          </div>
          
          {templates.map((template) => (
            <div
              key={template.id}
              onClick={() => handleUseTemplate(template.id, template.name)}
              style={{
                background: '#0f0f1a', border: '1px solid #1e1e3a', borderRadius: 12, padding: 20, 
                cursor: 'pointer', display: 'flex', flexDirection: 'column', position: 'relative',
                transition: 'all 0.2s', minHeight: 220, overflow: 'hidden'
              }}
            >
              {cloning === template.id && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(15, 15, 26, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                  <div style={{ color: '#3b82f6', fontWeight: 600 }}>Cloning...</div>
                </div>
              )}
              <div style={{ height: 120, background: '#1a1a2e', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width={48} height={48} fill="none" viewBox="0 0 24 24" stroke="#2d2d4e" strokeWidth={1}>
                  <rect x={3} y={3} width={18} height={18} rx={2} />
                  <path d="M7 8h10M7 12h10M7 16h6" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{template.name}</div>
              <div style={{ color: '#4a5568', fontSize: 13 }}>{template.category}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
