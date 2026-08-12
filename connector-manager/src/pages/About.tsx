import { useEffect, useState } from 'react';
import { api, AboutInfo } from '../api';

export default function About() {
  const [about, setAbout] = useState<AboutInfo | null>(null);

  useEffect(() => {
    api.getAbout().then(setAbout).catch(() => setAbout(null));
  }, []);

  if (!about) return <div><h1>About</h1><div className="card empty">Loading…</div></div>;

  return (
    <div>
      <h1>About</h1>
      <div className="card">
        <div className="status-row"><span className="label">Connector Version</span><span>{about.version}</span></div>
        <div className="status-row"><span className="label">Protocol Version</span><span>{about.protocolVersion}</span></div>
        <div className="status-row"><span className="label">Local API</span><span>{about.apiVersion}</span></div>
        <div className="status-row">
          <span className="label">Windows Service</span>
          <span>{about.windowsService.managed ? `Running (${about.windowsService.name})` : 'Not yet installed as a Windows Service'}</span>
        </div>
        <div className="status-row"><span className="label">Update Channel</span><span>{about.updateChannel}</span></div>
      </div>
      <p className="empty">
        Auto-update is not available in this release -- check the ZoeConnect support portal for the latest installer.
      </p>
    </div>
  );
}
