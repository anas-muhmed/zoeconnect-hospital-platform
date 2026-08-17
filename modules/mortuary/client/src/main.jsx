import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App.jsx'
import './index.css'
import { BrowserRouter } from 'react-router-dom'
import { MortuaryNameProvider } from './context/MortuaryNameContext.jsx'

// If the server ever rejects the token (expired/invalid), send the user
// back to the right login screen instead of leaving them stuck looking at
// a broken dashboard.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const role = localStorage.getItem('role');
      localStorage.removeItem('role');
      localStorage.removeItem('admin');
      localStorage.removeItem('username');

      // Absolute paths here are real browser navigations (not React Router),
      // so they must include the /mortuary mount prefix -- a bare '/' or
      // '/admin-login' lands on the platform's root landing page (or a
      // 404) instead of back inside this SPA.
      const loginPath = role === 'SuperAdmin' ? '/mortuary/superadmin-login'
        : role === 'Admin' ? '/mortuary/admin-login'
        : '/mortuary/';
      if (window.location.pathname !== loginPath) {
        window.location.href = loginPath;
      }
    }
    return Promise.reject(error);
  }
);

// A number input keeps responding to the scroll wheel even with its
// spinner arrows hidden via CSS -- an accidental scroll over one while
// focused silently changes its value. Blur it on wheel so scrolling the
// page never edits a field the user didn't mean to touch.
document.addEventListener('wheel', () => {
  const active = document.activeElement;
  if (active && active.tagName === 'INPUT' && active.type === 'number') {
    active.blur();
  }
}, { passive: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/mortuary">
      <MortuaryNameProvider>
        <App />
      </MortuaryNameProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
