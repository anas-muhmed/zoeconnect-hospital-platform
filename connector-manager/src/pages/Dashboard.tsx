import { useCallback, useEffect, useState } from 'react';
import { api, ConnectorStatus } from '../api';
import StatusBadge from '../components/StatusBadge';

export default function Dashboard() {
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  async function run(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setMsg(null);
    try {
      await fn();
      setMsg(`${action} succeeded`);
    } catch (err) {
      setMsg(`${action} failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
      load();
    }
  }

  if (!status) {
    return (
      <div>
        <h1>Dashboard</h1>
        <div className="card empty">Connecting to the Connector Service on this machine...</div>
      </div>
    );
  }

  const overallOk = status.activated && status.cloud.connected;

  return (
    <div>
      <h1>Dashboard</h1>

      <div className="card">
        <div style={{ marginBottom: 16 }}>
          <StatusBadge ok={overallOk} okLabel="Connected" failLabel={status.activated ? 'Disconnected' : 'Not Activated'} />
        </div>

        <div className="status-row">
          <span className="label">Cloud</span>
          <StatusBadge ok={status.cloud.connected} okLabel="Connected" failLabel="Not Connected" />
        </div>
        <div className="status-row">
          <span className="label">Oracle</span>
          <StatusBadge ok={status.oracle.connected} okLabel="Connected" failLabel="Not Connected" />
        </div>
        <div className="status-row">
          <span className="label">Definitions</span>
          <span>{status.definitions.count} Loaded</span>
        </div>
        <div className="status-row">
          <span className="label">Version</span>
          <span>{status.version}</span>
        </div>
        <div className="status-row">
          <span className="label">Last Sync</span>
          <span>{status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Never'}</span>
        </div>
      </div>

      {!status.activated && (
        <div className="card">
          <p className="empty">
            This Connector has not been activated yet. Go to the <strong>Activation</strong> page and enter the
            Activation Code from your ZoeConnect account manager.
          </p>
        </div>
      )}

      <div className="toolbar">
        <button disabled={busy !== null || !status.activated} onClick={() => run('Reconnect', api.reconnect)}>
          {busy === 'Reconnect' ? 'Reconnecting…' : 'Reconnect'}
        </button>
        <a href="#/diagnostics"><button className="secondary" type="button">Run Diagnostics</button></a>
        <a href="#/logs"><button className="secondary" type="button">View Logs</button></a>
      </div>
      {msg && <p className={`msg ${msg.includes('failed') ? 'fail' : 'ok'}`}>{msg}</p>}
    </div>
  );
}
