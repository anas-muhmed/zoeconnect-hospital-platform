import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useGrowchart } from "./GrowchartContext";

type SidebarProps = {
  onWidthChange?: (width: number) => void;
};

type MenuItem = {
  label: string;
  icon: React.ReactNode;
  path?: string;
  disabled?: boolean;
  submenu?: { label: string; path: string }[];
};

// SVG Icon Components
const UsersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const ChartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const BarChartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="16" />
  </svg>
);

const TrendDownIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </svg>
);

const ChevronRight = ({ rotated = false }: { rotated?: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    style={{ transform: rotated ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
  >
    <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MenuIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

export default function Sidebar({ onWidthChange }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { patient, patientWho } = useGrowchart();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const sidebarWidth = collapsed ? 64 : 260;

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setMobileOpen(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (onWidthChange) {
      onWidthChange(sidebarWidth);
    }
  }, [sidebarWidth, onWidthChange]);

  const menuItems: MenuItem[] = [
    {
      label: "Fenton Chart",
      icon: <ChartIcon />,
      submenu: [
        { label: "View Chart", path: "/" },
        patient ? { label: "Edit Patient", path: "/edit-patient" } : { label: "Add Patient", path: "/add-patient" },
      ],
    },
    {
      label: "WHO Chart",
      icon: <BarChartIcon />,
      disabled: !patientWho,
      submenu: patientWho ? [
        { label: "View Chart", path: "/detail" },
        { label: "Edit Patient", path: "/edit-patient" },
      ] : undefined,
    },
    {
      label: "TDSC Chart",
      icon: <TrendDownIcon />,
      path: "/TDSC3yrs",
    },
  ];

  const toggleSubmenu = (label: string) => {
    if (collapsed) return;
    setExpandedMenu(expandedMenu === label ? null : label);
  };

  const handleNavigate = (path: string) => {
    // Set chart type before navigating to edit patient
    if (path === "/edit-patient") {
      const chartType = location.pathname === "/detail" ? "who" : "fenton";
      localStorage.setItem("gc_chartType", chartType);
    }
    navigate(path);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  return (
    <>
      {/* Mobile hamburger button */}
      {isMobile && (
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          style={s.mobileMenuBtn}
        >
          <MenuIcon />
        </button>
      )}

      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div style={s.overlay} onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <div style={{
        ...s.sidebar,
        width: isMobile ? 260 : `${sidebarWidth}px`,
        transform: isMobile ? (mobileOpen ? 'translateX(0)' : 'translateX(-100%)') : 'translateX(0)',
      }}>
        <div style={s.header}>
          <div style={s.brand} onClick={() => handleNavigate("/")}>
            <span style={{ ...s.brandIcon, color: "#3b82f6" }}><ChartIcon /></span>
            {!collapsed && !isMobile && <span style={s.brandName}>CliniGrowth</span>}
          </div>
          {!isMobile && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              style={s.toggleBtn}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <ChevronRight rotated={collapsed} />
            </button>
          )}
          {isMobile && (
            <button
              onClick={() => setMobileOpen(false)}
              style={s.closeBtn}
            >
              ✕
            </button>
          )}
        </div>

      <div style={s.menu}>
        {menuItems.map((item) => {
          const hasSubmenu = item.submenu && item.submenu.length > 0;
          const isExpanded = expandedMenu === item.label;
          const disabled = item.disabled;
          const isActive = item.path ? location.pathname === item.path : false;

          return (
            <div key={item.label}>
              <button
                onClick={() => {
                  if (disabled) return;
                  if (hasSubmenu) {
                    toggleSubmenu(item.label);
                  } else if (item.path) {
                    handleNavigate(item.path);
                  }
                }}
                style={{
                  ...s.menuItem,
                  ...(isActive ? s.menuItemActive : {}),
                  ...(disabled ? s.menuItemDisabled : {}),
                }}
                title={disabled ? "Plot a chart first to access this page" : item.label}
              >
                <span style={{ ...s.menuIcon, color: isActive ? "#3b82f6" : "#64748b" }}>{item.icon}</span>
                {!collapsed && <span style={s.menuLabel}>{item.label}</span>}
                {!collapsed && hasSubmenu && (
                  <span style={s.expandIcon}>
                    <ChevronRight rotated={isExpanded} />
                  </span>
                )}
              </button>

              {!collapsed && hasSubmenu && isExpanded && (
                <div style={s.submenu}>
                  {item.submenu!.map((subItem) => {
                    const active = location.pathname === subItem.path;
                    return (
                      <button
                        key={subItem.path}
                        onClick={() => handleNavigate(subItem.path)}
                        style={{
                          ...s.submenuItem,
                          ...(active ? s.submenuItemActive : {}),
                        }}
                      >
                        <span style={s.submenuLabel}>{subItem.label}</span>
                        {active && <span style={s.activeIndicator} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  sidebar: {
    position: "fixed",
    left: 0,
    top: 0,
    height: "100vh",
    width: "260px",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    backdropFilter: "blur(10px)",
    display: "flex",
    flexDirection: "column",
    boxShadow: "2px 0 8px rgba(0,0,0,0.1)",
    zIndex: 1000,
    transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    fontFamily: "'Segoe UI', sans-serif",
    overflow: "hidden",
  },
  mobileMenuBtn: {
    position: "fixed",
    top: 16,
    left: 16,
    zIndex: 1001,
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 8,
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#64748b",
  },
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 999,
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 4,
    borderRadius: 6,
    fontSize: 18,
    color: "#64748b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    whiteSpace: "nowrap",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    flex: 1,
    minWidth: 0,
  },
  brandIcon: { fontSize: 20, flexShrink: 0 },
  brandName: { 
    fontSize: 16, 
    fontWeight: 800, 
    color: "#1e293b", 
    letterSpacing: "-0.3px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    transition: "opacity 0.2s ease",
  },
  toggleBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 4,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.2s",
    flexShrink: 0,
  },
  menu: {
    flex: 1,
    padding: "12px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    overflow: "hidden",
  },
  menuItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "transparent",
    color: "#475569",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s ease",
    textAlign: "left",
    position: "relative",
    whiteSpace: "nowrap",
  },
  menuItemActive: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    color: "#3b82f6",
    fontWeight: 600,
  },
  menuItemDisabled: {
    opacity: 0.35,
    cursor: "not-allowed",
  },
  menuIcon: { fontSize: 18, flexShrink: 0 },
  menuLabel: { 
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
  },
  expandIcon: {
    fontSize: 10,
    color: "#94a3b8",
    transition: "transform 0.2s ease",
    flexShrink: 0,
  },
  submenu: {
    paddingLeft: 36,
    marginTop: 4,
    marginBottom: 4,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    overflow: "hidden",
  },
  submenuItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 6,
    border: "none",
    backgroundColor: "transparent",
    color: "#64748b",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s ease",
    textAlign: "left",
    position: "relative",
    whiteSpace: "nowrap",
  },
  submenuItemActive: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    color: "#3b82f6",
    fontWeight: 600,
  },
  submenuLabel: { 
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
  },
  activeIndicator: {
    position: "absolute",
    right: 8,
    width: 4,
    height: 4,
    borderRadius: "50%",
    backgroundColor: "#3b82f6",
    flexShrink: 0,
  },
};
