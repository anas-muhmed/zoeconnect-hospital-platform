import React from 'react';

const containerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  border: '1px solid #ccc',
  backgroundColor: '#f9f9f9',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#888',
  fontSize: '14px',
  position: 'relative'
};

export const BodyDiagramDesigner: React.FC<any> = ({ node }) => (
  <div style={containerStyle}>
    {node.props.assetId ? (
      <img src={`/api/v1/assets/${node.props.assetId}/content`} alt="Body Diagram" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
    ) : (
      `[Body Diagram: ${node.props.label || 'Unlabeled'}]`
    )}
    {node.props.assetId && <div style={{position: 'absolute', bottom: 4, right: 4, fontSize: 10, background: 'rgba(255,255,255,0.8)', padding: '2px 4px', borderRadius: 2}}>Asset: {node.props.assetId}</div>}
  </div>
);

export const DentalChartDesigner: React.FC<any> = ({ node }) => (
  <div style={containerStyle}>
    [Dental Chart: {node.props.chartType || 'Adult'}]
  </div>
);

export const BurnAssessmentDesigner: React.FC<any> = ({ node }) => (
  <div style={containerStyle}>
    {node.props.assetId ? (
      <img src={`/api/v1/assets/${node.props.assetId}/content`} alt="Burn Assessment" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
    ) : (
      '[Burn Assessment (Rule of Nines)]'
    )}
    {node.props.assetId && <div style={{position: 'absolute', bottom: 4, right: 4, fontSize: 10, background: 'rgba(255,255,255,0.8)', padding: '2px 4px', borderRadius: 2}}>Asset: {node.props.assetId}</div>}
  </div>
);

export const SvgAnnotationLayerDesigner: React.FC<any> = ({ node }) => (
  <div style={containerStyle}>
    {node.props.assetId ? (
      <img src={`/api/v1/assets/${node.props.assetId}/content`} alt="SVG Annotation Layer" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
    ) : (
      '[SVG Annotation Layer]'
    )}
    {node.props.assetId && <div style={{position: 'absolute', bottom: 4, right: 4, fontSize: 10, background: 'rgba(255,255,255,0.8)', padding: '2px 4px', borderRadius: 2}}>Asset: {node.props.assetId}</div>}
  </div>
);
