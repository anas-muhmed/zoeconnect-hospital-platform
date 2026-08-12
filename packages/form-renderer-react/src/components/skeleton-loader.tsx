import React from 'react';

export const SkeletonLoader: React.FC<{ rows?: number; width?: string }> = ({ rows = 3, width = '100%' }) => {
  return (
    <div style={{ width, padding: 20 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 24,
            marginBottom: 12,
            backgroundColor: '#e0e0e0',
            borderRadius: 4,
            animation: 'pulse 1.5s infinite ease-in-out'
          }}
        />
      ))}
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 0.3; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};
