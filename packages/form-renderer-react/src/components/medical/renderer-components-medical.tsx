import React, { useState } from 'react';

const containerStyle: React.CSSProperties = {
  width: '100%',
  position: 'relative',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  overflow: 'hidden',
  backgroundColor: '#f8fafc',
};

const labelStyle: React.CSSProperties = {
  padding: '8px 12px',
  backgroundColor: '#f1f5f9',
  borderBottom: '1px solid #e2e8f0',
  fontWeight: 600,
  fontSize: '14px',
  color: '#334155'
};

const contentStyle: React.CSSProperties = {
  padding: '16px',
  minHeight: '200px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'column'
};

export const BodyDiagramRenderer: React.FC<any> = ({ node, value, onChange }) => {
  return (
    <div style={containerStyle}>
      <div style={labelStyle}>{node.props.label || 'Body Diagram'}</div>
      <div style={contentStyle}>
        {node.props.assetId ? (
          <img src={`/api/v1/assets/${node.props.assetId}`} alt="Body Diagram" style={{ maxWidth: '100%', maxHeight: '400px' }} />
        ) : (
          <div style={{ color: '#94a3b8' }}>No background asset selected</div>
        )}
      </div>
    </div>
  );
};

export const DentalChartRenderer: React.FC<any> = ({ node, value, onChange }) => {
  return (
    <div style={containerStyle}>
      <div style={labelStyle}>{node.props.label || 'Dental Chart'} ({node.props.chartType || 'Adult'})</div>
      <div style={contentStyle}>
        <div style={{ color: '#94a3b8' }}>Dental Chart Placeholder</div>
      </div>
    </div>
  );
};

export const BurnAssessmentRenderer: React.FC<any> = ({ node, value, onChange }) => {
  return (
    <div style={containerStyle}>
      <div style={labelStyle}>{node.props.label || 'Burn Assessment'}</div>
      <div style={contentStyle}>
        <div style={{ color: '#94a3b8' }}>Burn Assessment Placeholder</div>
        <div style={{ marginTop: '16px', padding: '8px', backgroundColor: '#e0f2fe', borderRadius: '4px', width: '100%', textAlign: 'center' }}>
          Rule of Nines Total: 0%
        </div>
      </div>
    </div>
  );
};

export const SvgAnnotationLayerRenderer: React.FC<any> = ({ node, value, onChange }) => {
  return (
    <div style={containerStyle}>
      <div style={labelStyle}>{node.props.label || 'Annotation Layer'}</div>
      <div style={contentStyle}>
        {node.props.assetId ? (
          <img src={`/api/v1/assets/${node.props.assetId}`} alt="Annotation Background" style={{ maxWidth: '100%', maxHeight: '400px' }} />
        ) : (
          <div style={{ color: '#94a3b8' }}>No background asset selected</div>
        )}
      </div>
    </div>
  );
};
