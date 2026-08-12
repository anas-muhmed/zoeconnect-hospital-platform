import { useEffect, useState } from 'react';
import { api, LogEntry, LogLevel } from '../api';

const FILTERS: Array<{ value: LogLevel | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'error', label: 'Errors' },
  { value: 'warn', label: 'Warnings' },
  { value: 'info', label: 'Information' },
];

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');

  useEffect(() => {
    const load = () => api.getLogs(filter === 'all' ? {} : { level: filter }).then(setLogs).catch(() => {});
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [filter]);

  return (
    <div>
      <h1>Logs</h1>
      <div className="toolbar">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={filter === f.value ? '' : 'secondary'}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="card">
        {logs.length === 0 && <p className="empty">No recent events.</p>}
        {logs.map((entry, i) => (
          <div key={i} className={`log-line ${entry.level}`}>
            <span className="time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
            <span>{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
