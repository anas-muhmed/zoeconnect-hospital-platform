import React from 'react';

export const TableDesigner: React.FC<any> = ({ node }) => (
  <div style={{ border: '1px solid #999', padding: 8, height: '100%', width: '100%', boxSizing: 'border-box' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {(node.props.columns || []).map((c: string, i: number) => (
            <th key={i} style={{ borderBottom: '2px solid #999', padding: 4, textAlign: 'left', fontSize: 12 }}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td colSpan={node.props.columns?.length || 1} style={{ padding: 16, textAlign: 'center', color: '#999', fontSize: 12 }}>
            [ Table Cells ]
          </td>
        </tr>
      </tbody>
    </table>
  </div>
);

export const RepeatSectionDesigner: React.FC<any> = ({ node }) => (
  <div style={{ border: '2px dashed #4caf50', padding: 16, height: '100%', width: '100%', boxSizing: 'border-box', backgroundColor: '#e8f5e9' }}>
    <div style={{ color: '#2e7d32', fontWeight: 'bold', fontSize: 12, marginBottom: 8 }}>Repeat Section (Min: {node.props.minCount}, Max: {node.props.maxCount})</div>
  </div>
);

export const VariablesDesigner: React.FC<any> = ({ node }) => (
  <div style={{ border: '1px solid #ff9800', padding: 8, height: '100%', width: '100%', boxSizing: 'border-box', backgroundColor: '#fff3e0' }}>
    <div style={{ color: '#e65100', fontWeight: 'bold', fontSize: 12 }}>Variables Data (Hidden in Runtime)</div>
  </div>
);

export const RulesDesigner: React.FC<any> = ({ node }) => (
  <div style={{ border: '1px solid #f44336', padding: 8, height: '100%', width: '100%', boxSizing: 'border-box', backgroundColor: '#ffebee' }}>
    <div style={{ color: '#c62828', fontWeight: 'bold', fontSize: 12 }}>Rules Data (Hidden in Runtime)</div>
  </div>
);

export const SignatureDesigner: React.FC<any> = ({ node }) => (
  <div style={{ border: '1px solid #999', padding: 16, height: '100%', width: '100%', boxSizing: 'border-box', backgroundColor: '#f9f9f9', display: 'flex', flexDirection: 'column' }}>
    <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>{node.props.label}</div>
    <div style={{ flex: 1, border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>
      [{node.props.provider} signature area]
    </div>
  </div>
);
