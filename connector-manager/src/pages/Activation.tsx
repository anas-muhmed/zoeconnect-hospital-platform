import { useEffect, useState } from 'react';
import { api, ActivationState } from '../api';

export default function Activation() {
  const [activation, setActivation] = useState<ActivationState | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getActivation().then(setActivation).catch(() => setActivation(null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.activate(code.trim());
      const fresh = await api.getActivation();
      setActivation(fresh);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!activation) {
    return <div><h1>Activation</h1><div className="card empty">Loading…</div></div>;
  }

  if (activation.activated) {
    return (
      <div>
        <h1>Activation</h1>
        <div className="card">
          <div className="status-row"><span className="label">Tenant</span><span>{activation.tenantId}</span></div>
          <div className="status-row"><span className="label">Hostname</span><span>{activation.hostname}</span></div>
          <div className="status-row"><span className="label">Status</span><span>Connected</span></div>
        </div>
        <p className="empty">
          This Connector is already activated. The Activation Code is not shown again after first use --
          if you need to re-pair this machine, contact ZoeConnect support for a new code.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Activation</h1>
      <div className="card">
        <form onSubmit={submit}>
          <label htmlFor="activation-code">Activation Code</label>
          <input
            id="activation-code"
            className="activation-code-input"
            placeholder="ABCD-EFGH-JKLM"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={busy}
            autoFocus
          />
          <button type="submit" disabled={busy || code.trim().length === 0}>
            {busy ? 'Activating…' : 'Activate'}
          </button>
        </form>
        {error && <p className="msg fail">{error}</p>}
      </div>
      <p className="empty">
        Enter the Activation Code your ZoeConnect account manager generated for this hospital. Nothing else is needed --
        the Connector will register itself and connect automatically.
      </p>
    </div>
  );
}
