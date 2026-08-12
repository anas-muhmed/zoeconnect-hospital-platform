import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

// HashRouter (not BrowserRouter) -- Task #103, 2026-07-22. This app is
// served as static files by a bare `express.static()` + SPA-fallback
// route (see local-api-server.ts). A hash-based route (`/#/oracle`) needs
// no server-side rewrite support at all, which keeps that server as
// simple as it already is; a path-based route would work too given the
// existing `app.get('*', ...)` fallback, but hash routing has zero
// dependency on that fallback continuing to exist exactly as written.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
