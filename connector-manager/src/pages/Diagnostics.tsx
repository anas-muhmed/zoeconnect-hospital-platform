import { useState } from 'react';
import { api, DiagnosticsReport } from '../api';

const ICON: Record<string, string> = { ok: '✔', warn: '⚠', fail: '✘' };

export default function Diagnostics() {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      setReport(await api.getDiagnostics());
    } finally {
      setBusy(false);
    }
  }

  function exportReport() {
    window.open('/api/diagnostics/export', '_blank');
  }

  return (
    <div>
      <h1>Diagnostics</h1>
      <div className="toolbar">
        <button onClick={run} disabled={busy}>{busy ? 'Running…' : 'Run Diagnostics'}</button>
        <button className="secondary" onClick={exportReport} disabled={!report}>Export Report</button>
      </div>

      {report && (
        <div className="card">
          <p className="empty" style={{ marginTop: 0 }}>Generated {new Date(report.generatedAt).toLocaleString()}</p>
          {report.checks.map((check) => (
            <div key={check.id} className="status-row">
              <span className="label">{ICON[check.status]} {check.label}</span>
              <span className={check.status === 'ok' ? '' : check.status === 'warn' ? 'msg fail' : 'msg fail'}>{check.message}</span>
            </div>
          ))}
        </div>
      )}
      {!report && !busy && <div className="card empty">Click "Run Diagnostics" for a full connectivity check.</div>}
    </div>
  );
}
