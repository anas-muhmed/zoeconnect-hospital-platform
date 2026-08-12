import React from 'react';

export const ContainerRenderer = ({ props, children }: any) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: props.direction || 'column',
        gap: props.gap || 8,
        padding: props.padding || 8,
        border: props.border ? '1px solid #ccc' : 'none',
        borderRadius: 4,
        width: '100%',
        height: '100%',
        position: 'relative'
      }}
    >
      {children}
    </div>
  );
};

export const SectionRenderer = ({ props, children }: any) => {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>{props.title || 'Section'}</h3>
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
};

export const FallbackContainer = ({ children }: any) => (
  <div style={{ position: 'relative', width: '100%', height: '100%' }}>{children}</div>
);
