import React, { useState, useEffect } from 'react';

export interface Asset {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

interface AssetManagerProps {
  onSelectAsset?: (assetId: string) => void;
  onClose?: () => void;
}

export const AssetManager: React.FC<AssetManagerProps> = ({ onSelectAsset, onClose }) => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      setError(null);
      const res = await fetch('/api/v1/assets');
      if (res.ok) {
        setAssets(await res.json());
      } else {
        setError(`Failed to fetch assets: ${res.status} ${res.statusText}`);
      }
    } catch (e) {
      console.error('Failed to fetch assets', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      try {
        setError(null);
        const res = await fetch('/api/v1/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            base64Data,
          }),
        });
        if (!res.ok) {
          throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
        }
        await fetchAssets();
      } catch (err: any) {
        console.error('Upload failed', err);
        setError(err.message || 'Upload failed');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[80vh]">
        <div className="px-4 py-3 border-b flex justify-between items-center bg-slate-50 rounded-t-lg">
          <h2 className="text-lg font-semibold text-slate-800">Asset Manager</h2>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <span className="text-xl">&times;</span>
            </button>
          )}
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Upload New Asset</label>
            <input type="file" accept="image/*,.svg" onChange={handleUpload} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            <div className="text-xs text-slate-500 mt-1">Supported formats: SVG, PNG, JPEG. Max size: 1MB.</div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <h3 className="text-md font-medium text-slate-700 mb-3">Available Assets</h3>
          {loading ? (
            <div className="text-sm text-slate-500">Loading assets...</div>
          ) : assets.length === 0 ? (
            <div className="text-sm text-slate-500 italic">No assets found. Upload one above.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {assets.map(asset => (
                <div key={asset.id} className="border rounded-lg p-3 hover:border-blue-400 cursor-pointer transition-colors" onClick={() => onSelectAsset?.(asset.id)}>
                  <div className="aspect-square bg-slate-100 rounded mb-2 flex items-center justify-center overflow-hidden">
                    <img src={`/api/v1/assets/${asset.id}/content`} alt={asset.filename} className="object-contain w-full h-full" />
                  </div>
                  <div className="text-xs font-medium text-slate-700 truncate" title={asset.filename}>{asset.filename}</div>
                  <div className="text-[10px] text-slate-400">{Math.round(asset.sizeBytes / 1024)} KB</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
