import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Activation from './pages/Activation';
import Oracle from './pages/Oracle';
import Diagnostics from './pages/Diagnostics';
import Logs from './pages/Logs';
import About from './pages/About';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/activation', label: 'Activation' },
  { to: '/oracle', label: 'Oracle' },
  { to: '/diagnostics', label: 'Diagnostics' },
  { to: '/logs', label: 'Logs' },
  { to: '/about', label: 'About' },
];

export default function App() {
  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="brand">ZoeConnect Connector Manager</div>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/activation" element={<Activation />} />
          <Route path="/oracle" element={<Oracle />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </div>
  );
}
