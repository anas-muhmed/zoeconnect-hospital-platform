import React from 'react';
import type { SceneNode } from '@hdsp/canvas-engine';
import { AssetManager } from '../asset-manager';

export const MedicalCustomInspector: React.FC<{ node: SceneNode; onChange: (props: Record<string, unknown>) => void }> = ({ node, onChange }) => {
  const [showAssetManager, setShowAssetManager] = React.useState(false);

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4 }}>Custom Settings</div>
      <button 
        style={{ width: '100%', padding: '4px 8px', fontSize: 12, border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}
        onClick={() => setShowAssetManager(true)}
      >
        Select Background Asset
      </button>
      
      {showAssetManager && (
        <AssetManager 
          onClose={() => setShowAssetManager(false)}
          onSelectAsset={(assetId) => {
            onChange({ ...node.props, assetId });
            setShowAssetManager(false);
          }}
        />
      )}
      
      {/* Basic region editor stub */}
      <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
        Region selection matrix will appear here when an asset is loaded.
      </div>
    </div>
  );
};
