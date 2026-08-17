import { useNavigate, useLocation } from "react-router-dom";
import { useGrowchart } from "./GrowchartContext";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { patient } = useGrowchart();

  const links = [
    { path: "/",       label: "Fenton Chart" },
    { path: "/detail", label: "WHO chart" },
    { path: "/TDSC3yrs", label: "TDSC Chart" },
    // { path: "/DevelopmentScreen", label: "TDSC Chart" },
    // { path: "/TDS0-6", label: "TDSC Chart 0-6" },
    
  ];

  return (
    <nav style={s.nav}>
      <div style={s.brand} onClick={() => navigate("/")}>
        <span style={s.brandIcon}>📈</span>
        <span style={s.brandName}>CliniGrowth</span>
      </div>

      <div style={s.links}>
        {links.map(link => {
          const active = location.pathname === link.path;
          const disabled = link.path === "/detail" && !patient;
          return (
            <button
              key={link.path}
              onClick={() => !disabled && navigate(link.path)}
              style={{
                ...s.link,
                ...(active ? s.linkActive : {}),
                ...(disabled ? s.linkDisabled : {}),
              }}
              title={disabled ? "Plot a chart first to access this page" : ""}
            >
              {link.label}
              {active && <span style={s.activeDot} />}
            </button>
          );
        })}
      </div>

      {/* Patient badge if data exists */}
      {patient?.patientName && (
        <div style={s.patientChip}>
          <span style={{ fontSize: 12, color: patient.gender === "male" ? "#3b82f6" : patient.gender === "female" ? "#ec4899" : "#64748b" }}>
            {patient.gender === "male" ? "♂" : patient.gender === "female" ? "♀" : ""}
          </span>
          <span style={s.patientChipName}>{patient.patientName}</span>
          {patient.gaAtBirth && (
            <span style={s.patientChipSub}>GA {patient.gaAtBirth}w</span>
          )}
        </div>
      )}
    </nav>
  );
}

const s: Record<string, React.CSSProperties> = {
  nav: {
    position: "sticky",
    top: 0,
    zIndex: 100,
    backgroundColor: "#1e293b",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 24px",
    height: 52,
    width: "100%",
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    fontFamily: "'Segoe UI', sans-serif",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    marginRight: 24,
    flexShrink: 0,
  },
  brandIcon: { fontSize: 18 },
  brandName: { fontSize: 16, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.3px" },
  links: { display: "flex", gap: 4, flex: 1 },
  link: {
    position: "relative",
    padding: "6px 14px",
    borderRadius: 6,
    border: "none",
    backgroundColor: "transparent",
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  linkActive: {
    backgroundColor: "rgba(255,255,255,0.1)",
    color: "#f8fafc",
    fontWeight: 700,
  },
  linkDisabled: {
    opacity: 0.35,
    cursor: "not-allowed",
  },
  activeDot: {
    position: "absolute",
    bottom: 2,
    left: "50%",
    transform: "translateX(-50%)",
    width: 4,
    height: 4,
    borderRadius: "50%",
    backgroundColor: "#3b82f6",
  },
  patientChip: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 20,
    padding: "4px 12px",
    flexShrink: 0,
  },
  patientChipName: { fontSize: 12, fontWeight: 700, color: "#f1f5f9" },
  patientChipSub:  { fontSize: 11, color: "#94a3b8" },
};
