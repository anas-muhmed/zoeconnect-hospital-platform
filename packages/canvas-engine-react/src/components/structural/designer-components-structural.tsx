import React from 'react';

export const ContainerDesigner: React.FC<any> = ({ node }) => (
  <div style={{ border: '1px dashed #666', padding: 8, height: '100%', width: '100%', boxSizing: 'border-box' }}>
    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Container: {node.props.label}</div>
  </div>
);

export const SectionDesigner: React.FC<any> = ({ node }) => (
  <div style={{ border: '2px solid #ccc', padding: 16, height: '100%', width: '100%', boxSizing: 'border-box' }}>
    <h3 style={{ margin: '0 0 16px 0', fontSize: 18 }}>{node.props.title}</h3>
  </div>
);

export const CardDesigner: React.FC<any> = ({ node }) => (
  <div style={{ boxShadow: `0 ${node.props.elevation}px ${node.props.elevation * 2}px rgba(0,0,0,0.2)`, padding: 16, height: '100%', width: '100%', boxSizing: 'border-box', backgroundColor: '#fff' }}>
    <h4 style={{ margin: '0 0 16px 0', fontSize: 16 }}>{node.props.title}</h4>
  </div>
);

export const ColumnsDesigner: React.FC<any> = ({ node }) => (
  <div style={{ border: '1px dotted #999', padding: 8, height: '100%', width: '100%', boxSizing: 'border-box', display: 'flex' }}>
    <div style={{ fontSize: 12, color: '#999' }}>Columns ({node.props.count})</div>
  </div>
);

export const TabsDesigner: React.FC<any> = ({ node }) => {
  const tabsList = Array.isArray(node.props.tabs) 
    ? node.props.tabs 
    : typeof node.props.tabs === 'string' 
      ? node.props.tabs.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];
      
  return (
    <div style={{ border: '1px solid #ddd', height: '100%', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd', backgroundColor: '#f5f5f5' }}>
        {tabsList.map((t: string, i: number) => (
          <div key={i} style={{ padding: '8px 16px', borderRight: '1px solid #ddd', fontSize: 14 }}>{t}</div>
        ))}
      </div>
    </div>
  );
};

export const AccordionDesigner: React.FC<any> = ({ node }) => {
  const panelsList = Array.isArray(node.props.panels) 
    ? node.props.panels 
    : typeof node.props.panels === 'string' 
      ? node.props.panels.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

  return (
    <div style={{ border: '1px solid #ddd', height: '100%', width: '100%', boxSizing: 'border-box' }}>
      {panelsList.map((p: string, i: number) => (
        <div key={i} style={{ padding: 12, borderBottom: '1px solid #ddd', backgroundColor: '#fafafa', fontSize: 14, fontWeight: 'bold' }}>
          {p} {node.props.multiple ? '(Multi)' : ''}
        </div>
      ))}
    </div>
  );
};
