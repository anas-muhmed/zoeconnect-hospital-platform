import React, { useRef, useState } from 'react';

export const SignatureRenderer: React.FC<any> = ({ fieldKey, props, value, error, onChange, onBlur }) => {
  const [hasDrawn, setHasDrawn] = useState(!!value);

  // Simplified canvas signature capture for the RC
  // Real implementation would use an external provider if props.provider === 'external'
  const handleCanvasClick = () => {
    if (props.provider === 'external') {
      alert('External provider requested. Mocking successful signature...');
    }
    const fakeSignatureData = 'data:image/png;base64,...mock-signature...';
    setHasDrawn(true);
    onChange(fakeSignatureData);
    onBlur();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHasDrawn(false);
    onChange(null);
    onBlur();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
        {props.label} {props.provider === 'external' ? '(External)' : ''}
      </div>
      <div
        style={{
          flex: 1,
          border: error ? '1px solid #c62828' : '1px solid #ccc',
          backgroundColor: '#fafafa',
          cursor: hasDrawn ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}
        onClick={!hasDrawn ? handleCanvasClick : undefined}
      >
        {hasDrawn ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 24, fontStyle: 'italic', fontFamily: 'cursive' }}>Signed</span>
            <button
              onClick={handleClear}
              type="button"
              style={{ position: 'absolute', top: 4, right: 4, fontSize: 10, padding: '2px 4px' }}
            >
              Clear
            </button>
          </div>
        ) : (
          <span style={{ color: '#999', fontSize: 12 }}>Click to Sign</span>
        )}
      </div>
      {error && <div style={{ color: '#c62828', fontSize: 11, marginTop: 4 }}>{error}</div>}
    </div>
  );
};
