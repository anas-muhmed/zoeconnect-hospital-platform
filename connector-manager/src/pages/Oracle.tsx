import { useEffect, useState } from 'react';
import { api, OracleConfigInput } from '../api';

const EMPTY: OracleConfigInput = { host: '', port: 1521, serviceName: '', username: '', password: '', mode: 'thin' };

export default function Oracle() {
  const [form, setForm] = useState<OracleConfigInput>(EMPTY);
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);

  useEffect(() => {
    api.getOracleConfig().then((config) => {
      if (config) {
        setForm({ host: config.host, port: config.port, serviceName: config.serviceName, username: config.username, password: '', mode: config.mode ?? 'thin' });
        setHasSavedPassword(true);
      }
    }).catch(() => {});
  }, []);

  function update<K extends keyof OracleConfigInput>(key: K, value: OracleConfigInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function test() {
    setBusy('test');
    setTestResult(null);
    try {
      const result = await api.testOracleConnection(form);
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    setSaveResult(null);
    try {
      const result = await api.saveOracleConfig(form);
      setSaveResult(result);
      if (result.ok) setHasSavedPassword(true);
    } catch (err) {
      setSaveResult({ ok: false, message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const canSubmit = Boolean(form.host && form.serviceName && form.username && form.password);

  return (
    <div>
      <h1>Oracle</h1>
      <div className="card">
        <label htmlFor="ora-host">Host</label>
        <input id="ora-host" value={form.host} onChange={(e) => update('host', e.target.value)} placeholder="db.hospital.local" />

        <label htmlFor="ora-port">Port</label>
        <input id="ora-port" type="number" value={form.port} onChange={(e) => update('port', Number(e.target.value))} />

        <label htmlFor="ora-service">Service Name</label>
        <input id="ora-service" value={form.serviceName} onChange={(e) => update('serviceName', e.target.value)} placeholder="ORCL" />

        <label htmlFor="ora-user">Username</label>
        <input id="ora-user" value={form.username} onChange={(e) => update('username', e.target.value)} />

        <label htmlFor="ora-pass">Password</label>
        <input
          id="ora-pass"
          type="password"
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
          placeholder={hasSavedPassword ? 'Re-enter password to change/re-save connection settings' : ''}
        />

        <div className="toolbar">
          <button className="secondary" disabled={busy !== null} onClick={test}>
            {busy === 'test' ? 'Testing…' : 'Test Connection'}
          </button>
          <button disabled={busy !== null || !canSubmit} onClick={save}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
        </div>

        {testResult && <p className={`msg ${testResult.ok ? 'ok' : 'fail'}`}>{testResult.message}</p>}
        {saveResult && <p className={`msg ${saveResult.ok ? 'ok' : 'fail'}`}>{saveResult.message}</p>}
      </div>
      <p className="empty">
        Credentials are encrypted at rest on this machine (Windows DPAPI) and are never sent anywhere except
        directly to your Oracle server -- the ZoeConnect cloud never sees them.
      </p>
    </div>
  );
}
