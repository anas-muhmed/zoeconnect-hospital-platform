import { useRef, useState } from "react";
import { gsap } from "gsap";

const SIDEBAR_OPEN_W = 300; // px
const SIDEBAR_CLOSED_W = 44; // px

type CollapsibleSidebarProps = {
  children: React.ReactNode;
  title?: string;
  defaultOpen?: boolean;
};


export default function CollapsibleSidebar({
  children,
  title = "Patient Info",
  defaultOpen = true,
}: CollapsibleSidebarProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  function toggle() {
    const next = !open;
    setOpen(next);

    if (panelRef.current) {
      gsap.to(panelRef.current, {
        width: next ? SIDEBAR_OPEN_W : SIDEBAR_CLOSED_W,
        duration: 0.35,
        ease: "power3.inOut",
      });
    }

    if (contentRef.current) {
      gsap.to(contentRef.current, {
        opacity: next ? 1 : 0,
        duration: next ? 0.25 : 0.15,
        delay: next ? 0.18 : 0,
        pointerEvents: next ? "auto" : "none",
      });
    }
  }

  return (
    <div
      ref={panelRef}
      style={{
        width: defaultOpen ? SIDEBAR_OPEN_W : SIDEBAR_CLOSED_W,
        flexShrink: 0,
        backgroundColor: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        transition: "box-shadow 0.2s",
      }}
    >
      <button
        onClick={toggle}
        title={open ? "Collapse panel" : "Expand panel"}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: SIDEBAR_CLOSED_W,
          height: "100%",
          background: open ? "transparent" : "#f8fafc",
          border: "none",
          borderLeft: "1px solid #e2e8f0",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          zIndex: 10,
          padding: 0,
          borderRadius: open ? "0 12px 12px 0" : 12,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = open ? "transparent" : "#f8fafc")
        }
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={{
            transform: open ? "rotate(0deg)" : "rotate(180deg)",
            transition: "transform 0.35s",
          }}
        >
          <path
            d="M10 12L6 8l4-4"
            stroke="#475569"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {!open && (
          <span
            style={{
              writingMode: "vertical-rl",
              fontSize: 11,
              fontWeight: 700,
              color: "#64748b",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginTop: 8,
              userSelect: "none",
            }}
          >
            {title}
          </span>
        )}
      </button>

      <div
        ref={contentRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: 20,
          paddingRight: SIDEBAR_CLOSED_W + 8,
          opacity: 1,
          pointerEvents: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

