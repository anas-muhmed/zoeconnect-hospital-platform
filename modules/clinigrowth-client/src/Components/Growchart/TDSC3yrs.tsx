import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { useGrowchart } from "./GrowchartContext";
import { gsap } from "gsap";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TDSCItem {
  id: number;
  label: string;
  startMonth: number;
  endMonth: number;
}

interface TDSCChartProps {
  patientName?: string;
  items?: TDSCItem[];
  onChartChange?: (chart: "0-3" | "3-6" | "0-6") => void;
}

// ─── Chart constants ────────────────────────────────────────────────────────
const AGE_MIN = 1;
const AGE_MAX = 36;
const MONTH_WIDTH = 26;
const ROW_HEIGHT = 30;
const BAR_HEIGHT = 15;
const CHART_LEFT_PAD = 20;
const LABEL_GAP = 6;
const RIGHT_EDGE_CUTOFF = 30;
const SLIDER_HEIGHT = 40;
const HTML2CANVAS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const JSPDF_SRC = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

const TDSC_ITEMS: TDSCItem[] = [
  { id: 1,  label: "Social smile",                                            startMonth: 1,  endMonth: 2 },
  { id: 2,  label: "Eyes follow pen/pencil",                                  startMonth: 1,  endMonth: 3 },
  { id: 3,  label: "Hold head steady",                                        startMonth: 1,  endMonth: 4 },
  { id: 4,  label: "Rolls from back to stomach",                              startMonth: 3,    endMonth: 5 },
  { id: 5,  label: "Turns head to sound of bell/rattle",                      startMonth: 3,    endMonth: 6 },
  { id: 6,  label: "Transfers objects hand to hand",                         startMonth: 4,    endMonth: 7 },
  { id: 7,  label: "Raises self to sitting position",                        startMonth: 5.8,    endMonth: 11 },
  { id: 8,  label: "Standing up by furniture",                               startMonth: 6.3,  endMonth: 11 },
  { id: 9,  label: "Fine prehension pellet",                                 startMonth: 7,    endMonth: 11 },
  { id: 10, label: "Pat a cake",                                             startMonth: 7,    endMonth: 13 },
  { id: 11, label: "Walks with help",                                        startMonth: 8,    endMonth: 13 },
  { id: 12, label: "Throws ball",                                            startMonth: 9.5,   endMonth: 17 },
  { id: 13, label: "Walks alone",                                            startMonth: 9.9,   endMonth: 17 },
  { id: 14, label: "Says two words",                                         startMonth: 11.1,   endMonth: 19 },
  { id: 15, label: "Walks backwards",                                        startMonth: 11.1,   endMonth: 20.5 },
  { id: 16, label: "Walks upstairs with help",                               startMonth: 12.1,   endMonth: 25.5 },
  { id: 17, label: "Points to parts of doll (3 parts)",                      startMonth: 15.2,   endMonth: 25.5 },
  { id: 18, label: "Removes garments",                                       startMonth: 21,   endMonth: 25 },
  { id: 19, label: "Uses words for personal needs",                          startMonth: 24,   endMonth: 27 },
  { id: 20, label: "Jumps in place",                                         startMonth: 26,   endMonth: 29 },
  { id: 21, label: "Differentiates big & small",                             startMonth: 27,   endMonth: 30 },
  { id: 22, label: "Points to 7 common objects",                             startMonth: 26,   endMonth: 31 },
  { id: 23, label: "Brush teeth with help",                                  startMonth: 23,   endMonth: 32 },
  { id: 24, label: "Tells gender when asked",                                startMonth: 30,   endMonth: 33 },
  { id: 25, label: "On instruction places objects 'IN', 'ON', & 'UNDER'",    startMonth: 23,   endMonth: 35 },
  { id: 26, label: "Asks simple questions",                                  startMonth: 33,   endMonth: 36 },
  { id: 27, label: "Answers at least half understandable to others",         startMonth: 30,   endMonth: 36 },
];

// ─── Component ──────────────────────────────────────────────────────────────
export default function TDSC3yrs({ patientName, items = TDSC_ITEMS, onChartChange }: TDSCChartProps) {
  const { patient, setPatient } = useGrowchart();
  const displayName = patientName || patient?.patientName;

  const visits = patient?.visits || [];
  const tdscMarks = patient?.tdscMarks || [];

  const [sessionSavedIds, setSessionSavedIds] = useState<Set<string>>(new Set());
  const savedVisitIds = useMemo(() => {
    const fromContext = tdscMarks.filter(m => (m.markedItems?.length ?? 0) > 0).map(m => m.visitId);
    return new Set([...fromContext, ...sessionSavedIds]);
  }, [tdscMarks, sessionSavedIds]);

  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);
  const [localMarks, setLocalMarks] = useState<{ [visitId: string]: Set<number> }>(
    () => {
      const marks: { [visitId: string]: Set<number> } = {};
      tdscMarks.forEach(mark => {
        marks[mark.visitId] = new Set(mark.markedItems);
      });
      return marks;
    }
  );

  const [sliderPositions, setSliderPositions] = useState<{ [visitId: string]: number }>(() => {
    const positions: { [visitId: string]: number } = {};
    visits.forEach(visit => {
      const stored = localStorage.getItem(`tdsc-slider-${visit.id}`);
      positions[visit.id] = stored ? parseInt(stored) : AGE_MIN;
    });
    return positions;
  });

  useEffect(() => {
    setSliderPositions(prev => {
      let changed = false;
      const next = { ...prev };
      visits.forEach(visit => {
        if (!(visit.id in next)) {
          const stored = localStorage.getItem(`tdsc-slider-${visit.id}`);
          next[visit.id] = stored ? parseInt(stored) : AGE_MIN;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [visits]);

  useEffect(() => {
    if (!activeVisitId) return;

    const sliderMonth = sliderPositions[activeVisitId] ?? AGE_MIN;
    const itemsInRange = items.filter(
      item => sliderMonth >= item.startMonth && sliderMonth <= item.endMonth
    );

    setLocalMarks(prev => {
      const newMarks = { ...prev };
      if (!newMarks[activeVisitId]) {
        newMarks[activeVisitId] = new Set();
      }

      const newSet = new Set<number>();
      itemsInRange.forEach(item => {
        newSet.add(item.id);
      });

      const oldSet = newMarks[activeVisitId];
      if (newSet.size !== oldSet.size || [...newSet].some(id => !oldSet.has(id))) {
        return {
          ...prev,
          [activeVisitId]: newSet,
        };
      }
      return prev;
    });
  }, [sliderPositions, activeVisitId, items]);

  const toggleItemMark = (visitId: string, itemId: number) => {
    setLocalMarks(prev => {
      const newMarks = { ...prev };
      if (!newMarks[visitId]) {
        newMarks[visitId] = new Set();
      } else {
        newMarks[visitId] = new Set(newMarks[visitId]);
      }
      if (newMarks[visitId].has(itemId)) {
        newMarks[visitId].delete(itemId);
      } else {
        newMarks[visitId].add(itemId);
      }
      return newMarks;
    });
  };

  const handleSliderChange = (visitId: string, newMonth: number) => {
    setSliderPositions(prev => ({
      ...prev,
      [visitId]: newMonth,
    }));
    localStorage.setItem(`tdsc-slider-${visitId}`, String(newMonth));
  };

  const [showSavedToast, setShowSavedToast] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveMarks = () => {
    if (!patient || !activeVisitId) return;
    
    const newTdscMarks = Object.entries(localMarks).map(([visitId, markedItems]) => ({
      visitId,
      markedItems: Array.from(markedItems),
    }));
    
    setPatient({
      ...patient,
      tdscMarks: newTdscMarks,
    });

    setSessionSavedIds(prev => {
      const next = new Set(prev);
      Object.entries(localMarks).forEach(([visitId, marks]) => {
        if (marks.size > 0) next.add(visitId);
        else next.delete(visitId);
      });
      return next;
    });

    setActiveVisitId(null);

    setJustSaved(true);
    setShowSavedToast(true);
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    savedTimeoutRef.current = setTimeout(() => {
      setJustSaved(false);
      setShowSavedToast(false);
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  const months = useMemo(
    () => Array.from({ length: AGE_MAX - AGE_MIN + 1 }, (_, i) => AGE_MIN + i),
    []
  );

  const orderedItems = useMemo(
    () => [...items].sort((a, b) => b.id - a.id),
    [items]
  );

  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = exportRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const monthSpan = AGE_MAX - AGE_MIN;
  const RIGHT_LABEL_ROOM = 60;
  const fittedMonthWidth = containerWidth > 0
    ? Math.max(MONTH_WIDTH, (containerWidth - CHART_LEFT_PAD - RIGHT_LABEL_ROOM) / monthSpan)
    : MONTH_WIDTH;

  const monthToX = (m: number) => CHART_LEFT_PAD + (m - AGE_MIN) * fittedMonthWidth;
  const trackWidth = Math.max(
    containerWidth,
    CHART_LEFT_PAD + monthSpan * fittedMonthWidth + RIGHT_LABEL_ROOM
  );
  const chartHeight = orderedItems.length * ROW_HEIGHT;

  const [isDragging, setIsDragging] = useState(false);
  const [draggingVisitId, setDraggingVisitId] = useState<string | null>(null);
  const sliderTrackRef = useRef<HTMLDivElement>(null);
  const sliderBtnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const monthFromClientX = useCallback((clientX: number) => {
    const el = sliderTrackRef.current;
    if (!el) return AGE_MIN;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const raw = AGE_MIN + (x - CHART_LEFT_PAD) / fittedMonthWidth;
    return Math.min(AGE_MAX, Math.max(AGE_MIN, Math.round(raw)));
  }, [fittedMonthWidth]);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const newMonth = monthFromClientX(e.clientX);
    if (activeVisitId) {
      handleSliderChange(activeVisitId, newMonth);
    }
  };

  const handleSliderButtonDown = (e: React.PointerEvent<HTMLDivElement>, visitId: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActiveVisitId(visitId);
    setDraggingVisitId(visitId);
    setIsDragging(true);
    const btn = sliderBtnRefs.current[visitId];
    if (btn) {
      gsap.to(btn, { scaleX: 1.25, scaleY: 0.88, duration: 0.18, ease: "back.out(2)" });
    }
  };

  const handleSliderButtonMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !draggingVisitId) return;
    const newMonth = monthFromClientX(e.clientX);
    handleSliderChange(draggingVisitId, newMonth);
  };

  const handleSliderButtonUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingVisitId) {
      const btn = sliderBtnRefs.current[draggingVisitId];
      if (btn) {
        gsap.to(btn, { scaleX: 1, scaleY: 1, duration: 0.32, ease: "elastic.out(1.2, 0.5)" });
      }
    }
    setIsDragging(false);
    setDraggingVisitId(null);
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
  };

  const exportRef = useRef<HTMLDivElement>(null);
  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const ensureLibraries = useCallback((): Promise<any> => {
    return new Promise((resolve, reject) => {
      const w = window as any;
      let html2canvasLoaded = false;
      let jspdfLoaded = false;

      const checkAllLoaded = () => {
        if (html2canvasLoaded && jspdfLoaded) {
          resolve({ html2canvas: w.html2canvas, jsPDF: w.jspdf.jsPDF });
        }
      };

      if (w.html2canvas) {
        html2canvasLoaded = true;
      } else {
        const script1 = document.createElement("script");
        script1.src = HTML2CANVAS_SRC;
        script1.onload = () => {
          html2canvasLoaded = true;
          checkAllLoaded();
        };
        script1.onerror = () => reject(new Error("Failed to load html2canvas"));
        document.body.appendChild(script1);
      }

      if (w.jspdf?.jsPDF) {
        jspdfLoaded = true;
      } else {
        const script2 = document.createElement("script");
        script2.src = JSPDF_SRC;
        script2.onload = () => {
          jspdfLoaded = true;
          checkAllLoaded();
        };
        script2.onerror = () => reject(new Error("Failed to load jsPDF"));
        document.body.appendChild(script2);
      }

      checkAllLoaded();
    });
  }, []);

  const handleGeneratePDF = async () => {
    if (!exportRef.current || !scrollWrapperRef.current) return;
    setIsExporting(true);
    const sw = scrollWrapperRef.current;
    const prevWidth = sw.style.width;
    const prevOverflowX = sw.style.overflowX;
    
    try {
      const { html2canvas, jsPDF } = await ensureLibraries();
      
      sw.style.width = `${trackWidth}px`;
      sw.style.overflowX = "visible";
      
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      
      sw.style.width = prevWidth;
      sw.style.overflowX = prevOverflowX;

      const imgData = canvas.toDataURL("image/png");
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF({
        orientation: imgHeight > imgWidth ? "portrait" : "landscape",
        unit: "mm",
        format: "a4",
      });

      const pageHeight = pdf.internal.pageSize.getHeight();
      const pageWidth = pdf.internal.pageSize.getWidth();
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const namePart = displayName ? `-${displayName.trim().replace(/\s+/g, "_")}` : "";
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `TDSC-0-3-chart${namePart}-${timestamp}.pdf`;
      
      pdf.save(filename);
    } catch (err) {
      sw.style.width = prevWidth;
      sw.style.overflowX = prevOverflowX;
      console.error("Failed to export TDSC chart as PDF:", err);
      alert("Sorry, the PDF couldn't be generated. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={s.container} ref={exportRef}>
      {showSavedToast && (
        <div style={s.globalToast}>
          <span style={s.toastIcon}>✓</span>
          <span style={s.toastMessage}>Marks saved successfully!</span>
        </div>
      )}

      {/* HERO HEADER WITH CHART SELECTOR */}
      <div style={s.heroHeader}>
        <div style={s.headerContent}>
          <div style={s.headerTitleGroup}>
            <h1 style={s.mainTitle}>TDSC 0–3 Years</h1>
            <p style={s.headerSubtitle}>Trivandrum Developmental Screening Chart</p>
          </div>

          {/* CHART SELECTOR DROPDOWN */}
          <div style={s.chartSelectorBox}>
            <label style={s.chartSelectorLabel}>Switch Chart:</label>
            <select
  value="0-3"
  onChange={(e) => {
    console.log("RAW select change fired:", e.target.value);
    onChartChange && onChartChange(e.target.value as "0-3" | "3-6" | "0-6");
  }}
  style={s.chartSelectorSelect}
>
              <option value="0-3"> 0–3 Years (Current)</option>
              <option value="3-6"> 3–6 Years</option>
              <option value="0-6"> 0–6 Years (Full)</option>
            </select>
          </div>

          {displayName && (
            <div style={s.patientCardCompact}>
              <span style={s.patientLabel}>Patient</span>
              <span style={s.patientName}>{displayName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions Bar */}
      <div style={s.quickActionsBar}>
        <div style={s.actionGroup}>
          {visits.length > 0 && (
            <div style={s.visitStatusSummary}>
              <div style={s.statusBadge}>
                <span style={s.statusDot} />
                <span style={s.statusText}>
                  {visits.length} visit{visits.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div style={s.statusBadge}>
                <span style={{ ...s.statusDot, backgroundColor: "#3b82f6" }} />
                <span style={s.statusText}>
                  {savedVisitIds.size} saved
                </span>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          style={{...s.downloadBtn, ...(isExporting ? s.downloadBtnDisabled : {})}}
          onClick={handleGeneratePDF}
          disabled={isExporting || activeVisitId !== null}
        >
          {isExporting ? "Generating…" : "📄 Get PDF"}
        </button>
      </div>

      {/* Visit Selection Panel */}
      {visits.length > 0 && (
        <div style={s.visitPanelRedesigned}>
          <div style={s.visitPanelHeader}>
            <h3 style={s.visitPanelTitle}>Select Visit to Mark Items</h3>
            <p style={s.visitPanelHint}>
              Choose a visit, drag the slider button — items auto-select, then save
            </p>
          </div>

          <div style={s.visitControlsGrid}>
            <div style={s.visitSelectContainer}>
              <label style={s.visitSelectLabel}>Visit:</label>
              <select
                value={activeVisitId ?? ""}
                onChange={(e) => {
                  setActiveVisitId(e.target.value || null);
                }}
                style={s.visitSelectDropdown}
              >
                <option value="">-- Choose a visit --</option>
                {visits.map((visit) => {
                  const visitDate = visit.date
                    ? new Date(visit.date).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "No date";
                  const markedItems = localMarks[visit.id] || new Set<number>();
                  const sliderPos = sliderPositions[visit.id] ?? AGE_MIN;
                  const isLocked =
                    savedVisitIds.has(visit.id) && visit.id !== activeVisitId;
                  return (
                    <option key={visit.id} value={visit.id} disabled={isLocked}>
                      {visitDate} · {sliderPos}m ({markedItems.size} marked)
                      {isLocked ? " — Saved" : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            {activeVisitId && (
              <button
                type="button"
                style={{
                  ...s.saveBtnCompact,
                  ...(justSaved ? s.saveBtnCompactSaved : {}),
                }}
                onClick={saveMarks}
              >
                {justSaved ? (
                  <>
                    <span style={s.saveTick}>✓</span> Saved
                  </>
                ) : (
                  "Save"
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Items at active visit slider age */}
      {activeVisitId && (
        <div style={s.itemsAtAgePanel}>
          <h4 style={s.itemsAtAgeTitle}>
            Items achieved by <strong>{sliderPositions[activeVisitId] ?? AGE_MIN} months</strong>
          </h4>
          <p style={s.itemsAtAgeSubtitle}>These items are automatically selected and will be saved</p>
          <div style={s.itemsGrid}>
            {items
              .filter((item) => {
                const sliderMonth = sliderPositions[activeVisitId] ?? AGE_MIN;
                return (
                  sliderMonth >= item.startMonth &&
                  sliderMonth <= item.endMonth
                );
              })
              .map((item) => {
                const isMarked = (
                  localMarks[activeVisitId] || new Set()
                ).has(item.id);
                return (
                  <div
                    key={item.id}
                    style={{
                      ...s.markableItem,
                      ...(isMarked
                        ? s.markableItemMarked
                        : s.markableItemInRange),
                    }}
                    onClick={() => toggleItemMark(activeVisitId, item.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <span style={s.itemNumber}>{item.id}</span>
                    <span style={s.itemLabelText}>{item.label}</span>
                    {isMarked && <span style={s.checkmark}>✓</span>}
                  </div>
                );
              })}
          </div>
          {items.filter((item) => {
            const sliderMonth = sliderPositions[activeVisitId] ?? AGE_MIN;
            return (
              sliderMonth >= item.startMonth &&
              sliderMonth <= item.endMonth
            );
          }).length === 0 && (
            <p style={{ color: "#6b7280", fontSize: 12 }}>
              No items at this age. Adjust the slider.
            </p>
          )}
        </div>
      )}

      {/* Chart */}
      <div style={s.scrollWrapperOuter} ref={scrollWrapperRef}>
        <div
          ref={sliderTrackRef}
          onClick={handleTrackClick}
          style={{
            position: "relative",
            width: trackWidth,
            height: SLIDER_HEIGHT,
            cursor: "pointer",
            backgroundColor: "#eef2f7",
            borderBottom: "2px solid #111827",
          }}
        >
          {months.map((m) => (
            <div
              key={m}
              style={{
                position: "absolute",
                left: monthToX(m),
                top: 0,
                bottom: 0,
                borderLeft: m % 5 === 0 ? "1px solid #9ca3af" : "1px solid #e2e5e9",
                pointerEvents: "none",
              }}
            />
          ))}

          {months
            .filter((m) => m % 5 === 0)
            .map((m) => (
              <div
                key={`slider-label-${m}`}
                style={{
                  position: "absolute",
                  left: monthToX(m),
                  bottom: 2,
                  transform: "translateX(-50%)",
                  fontSize: 8.5,
                  color: "#6b7280",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {m}
              </div>
            ))}

          {visits.map((visit) => {
            const sliderPos = sliderPositions[visit.id] ?? AGE_MIN;
            const isActive = activeVisitId === visit.id;
            const isSaved = savedVisitIds.has(visit.id);
            const isDraggingThis = isDragging && draggingVisitId === visit.id;
            const visitDate = visit.date
              ? new Date(visit.date).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "No date";
            const buttonColor = (isSaved && !isDraggingThis) ? "#111827" : "#ef4444";

            return (
              <div
                key={`slider-${visit.id}`}
                style={{
                  position: "absolute",
                  left: monthToX(sliderPos),
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  zIndex: isActive ? 12 : isSaved ? 10 : 8,
                }}
              >
                <div
                  ref={el => { sliderBtnRefs.current[visit.id] = el; }}
                  onPointerDown={(e) => handleSliderButtonDown(e, visit.id)}
                  onPointerMove={handleSliderButtonMove}
                  onPointerUp={handleSliderButtonUp}
                  onPointerCancel={handleSliderButtonUp}
                  title={`${visitDate} · ${sliderPos} months`}
                  style={{
                    width: 22,
                    height: 36,
                    borderRadius: 5,
                    backgroundColor: buttonColor,
                    boxShadow: isDraggingThis
                      ? `0 4px 16px ${buttonColor}80`
                      : `0 2px 6px ${buttonColor}60`,
                    cursor: isDraggingThis ? "grabbing" : "grab",
                    pointerEvents: "auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transformOrigin: "center center",
                    // 3 grip lines
                    backgroundImage: `repeating-linear-gradient(
                      to bottom,
                      transparent,
                      transparent 4px,
                      rgba(255,255,255,0.35) 4px,
                      rgba(255,255,255,0.35) 5px
                    )`,
                  }}
                />

                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: buttonColor,
                    marginTop: 4,
                    pointerEvents: "none",
                  }}
                >
                  {sliderPos}m
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ position: "relative", width: trackWidth, height: chartHeight }}>
          {orderedItems.map((item, idx) =>
            idx % 2 === 1 ? (
              <div
                key={`stripe-${item.id}`}
                style={{
                  position: "absolute",
                  top: idx * ROW_HEIGHT,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT,
                  backgroundColor: "#eef0f2",
                  zIndex: 0,
                }}
              />
            ) : null
          )}

          {months.map((m) => (
            <div
              key={m}
              style={{
                position: "absolute",
                left: monthToX(m),
                top: 0,
                bottom: 0,
                borderLeft: m % 5 === 0 ? "1px solid #9ca3af" : "1px solid #e5e7eb",
              }}
            />
          ))}

          {orderedItems.map((item, idx) => {
            const barLeft =
              item.id === 1 ? 0 : monthToX(item.startMonth);
            const barWidth = Math.max(2, monthToX(item.endMonth) - barLeft);
            const labelAfterBar = item.endMonth < RIGHT_EDGE_CUTOFF;

            const isMarkedInCurrent =
              activeVisitId && (localMarks[activeVisitId] || new Set()).has(item.id);

            const markedInVisits = visits.filter((visit) => {
              return (localMarks[visit.id] || new Set()).has(item.id);
            });

            return (
              <div
                key={item.id}
                style={{
                  position: "absolute",
                  top: idx * ROW_HEIGHT,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT,
                  borderBottom: "1px solid #f1f1f1",
                }}
              >
                {/* visit position markers removed */}

                <div
                  style={{
                    position: "absolute",
                    left: barLeft,
                    top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                    width: barWidth,
                    height: BAR_HEIGHT,
                    backgroundColor: idx % 2 === 0 ? "#9ca3af" : "#000000",
                    border: isMarkedInCurrent
                      ? "2px solid #22c55e"
                      : "1px solid #111827",
                    zIndex: 1,
                  }}
                />

                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    height: ROW_HEIGHT,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                    fontSize: 10.5,
                    color: "#1f2937",
                    zIndex: 2,
                    ...(labelAfterBar
                      ? { left: barLeft + barWidth + LABEL_GAP }
                      : { right: trackWidth - barLeft + LABEL_GAP }),
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{item.id}</span>
                  <span>{item.label}</span>
                </div>
              </div>
            );
          })}

          {visits.map((visit) => {
            const sliderPos = sliderPositions[visit.id] ?? AGE_MIN;
            const isActive = activeVisitId === visit.id;
            const isSaved = savedVisitIds.has(visit.id);
            const visitDate = visit.date
              ? new Date(visit.date).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "No date";
            const labelColor = isActive ? "#10b981" : isSaved ? "#3b82f6" : "#64748b";
            
            return (
              <div
                key={`date-label-${visit.id}`}
                style={{
                  position: "absolute",
                  left: monthToX(sliderPos) + 6,
                  top: "50%",
                  transform: "translate(0, -50%)",
                  pointerEvents: "none",
                  zIndex: isActive ? 11 : isSaved ? 9 : 4,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: labelColor,
                    writingMode: "vertical-rl",
                    textOrientation: "mixed",
                    transform: "rotate(180deg)",
                    whiteSpace: "nowrap",
                    letterSpacing: "0.5px",
                    padding: "4px 2px",
                    backgroundColor: "rgba(255, 255, 255, 0.9)",
                    borderRadius: "2px",
                  }}
                >
                  {visitDate}
                </div>
              </div>
            );
          })}

          {visits.map((visit) => {
            const sliderPos = sliderPositions[visit.id] ?? AGE_MIN;
            const isActive = activeVisitId === visit.id;
            const isSaved = savedVisitIds.has(visit.id);
            const isDraggingThis = isDragging && draggingVisitId === visit.id;
            const lineColor = (isSaved && !isDraggingThis) ? "#111827" : "#ef4444";
            const lineWidth = (isSaved && !isDraggingThis) ? 3 : 2;
            return (
              <div
                key={`line-${visit.id}`}
                style={{
                  position: "absolute",
                  left: monthToX(sliderPos),
                  top: 0,
                  bottom: 0,
                  width: lineWidth,
                  backgroundColor: lineColor,
                  boxShadow: isSaved
                    ? "0 0 0 1px rgba(0,0,0,0.3)"
                    : "0 0 0 1px rgba(239,68,68,0.25)",
                  zIndex: isActive ? 7 : isSaved ? 5 : 3,
                  pointerEvents: "none",
                  opacity: isActive || isSaved ? 1 : 0.5,
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            position: "relative",
            borderTop: "2px solid #111827",
            width: trackWidth,
            height: 20,
          }}
        >
          {months.map((m) => (
            <div
              key={m}
              style={{
                position: "absolute",
                left: monthToX(m),
                top: 0,
                transform: "translateX(-50%)",
                textAlign: "center",
                fontSize: 9,
                fontWeight: 600,
                color: "#1f2937",
                paddingTop: 4,
                whiteSpace: "nowrap",
              }}
            >
              {m}
            </div>
          ))}
          {visits.map((visit) => {
            const sliderPos = sliderPositions[visit.id] ?? AGE_MIN;
            const isActive = activeVisitId === visit.id;
            const isSaved = savedVisitIds.has(visit.id);
            const isDraggingThis = isDragging && draggingVisitId === visit.id;
            const lineColor = (isSaved && !isDraggingThis) ? "#111827" : "#ef4444";
            return (
              <div
                key={`axis-line-${visit.id}`}
                style={{
                  position: "absolute",
                  left: monthToX(sliderPos),
                  top: 0,
                  bottom: 0,
                  width: (isSaved && !isDraggingThis) ? 3 : 2,
                  backgroundColor: lineColor,
                  zIndex: isActive ? 7 : isSaved ? 5 : 3,
                  pointerEvents: "none",
                  opacity: isActive || isSaved ? 1 : 0.5,
                }}
              />
            );
          })}
        </div>
        <p style={s.axisLabel}>AGE IN MONTHS</p>
      </div>
    </div>
  );
}

// ─── COMPLETE STYLES ──────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  container: {
    width: "100%",
    boxSizing: "border-box",
    padding: "0",
    backgroundColor: "#fff",
    fontFamily: "system-ui, -apple-system, sans-serif",
    position: "relative",
  },

  globalToast: {
    position: "fixed",
    top: 20,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 24px",
    backgroundColor: "#dcfce7",
    border: "2px solid #4ade80",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    color: "#166534",
    zIndex: 1000,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  },
  toastIcon: {
    fontSize: 18,
    fontWeight: 800,
  },
  toastMessage: {
    fontSize: 14,
  },

  triangleButton: {
    width: 0,
    height: 0,
    borderLeft: "6px solid transparent",
    borderRight: "6px solid transparent",
    borderBottom: "10px solid #64748b",
    cursor: "grab",
    transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
  },

  heroHeader: {
    padding: "28px 24px",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    color: "#fff",
    borderBottom: "1px solid #334155",
  },
  headerContent: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    maxWidth: "100%",
    flexWrap: "wrap",
  },
  headerTitleGroup: {
    flex: 1,
    minWidth: 200,
  },
  mainTitle: {
    margin: "0 0 4px 0",
    fontSize: 28,
    fontWeight: 800,
    color: "#fff",
    letterSpacing: "-0.5px",
  },
  headerSubtitle: {
    margin: 0,
    fontSize: 13,
    color: "#cbd5e1",
    fontWeight: 400,
  },

  // CHART SELECTOR STYLES
  chartSelectorBox: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "10px 14px",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.15)",
    backdropFilter: "blur(10px)",
  },
  chartSelectorLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#cbd5e1",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  chartSelectorSelect: {
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #7dd3fc",
    backgroundColor: "#0c4a6e",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    color: "#e0f2fe",
    transition: "all 0.2s",
  },

  patientCardCompact: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
    padding: "12px 16px",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.2)",
    minWidth: 180,
  },
  patientLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#cbd5e1",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  patientName: {
    fontSize: 15,
    fontWeight: 700,
    color: "#fff",
  },

  quickActionsBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "12px 24px",
    backgroundColor: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
    flexWrap: "wrap",
  },
  actionGroup: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  visitStatusSummary: {
    display: "flex",
    gap: 12,
    alignItems: "center",
  },
  statusBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    backgroundColor: "#f1f5f9",
    borderRadius: 20,
    border: "1px solid #e2e8f0",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#64748b",
  },
  statusText: {
    fontSize: 12,
    fontWeight: 600,
    color: "#475569",
  },
  downloadBtn: {
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 16px",
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    backgroundColor: "#f1f5f9",
    color: "#1e293b",
    cursor: "pointer",
    transition: "all 0.2s",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  downloadBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },

  visitPanelRedesigned: {
    margin: 0,
    padding: "16px 24px",
    backgroundColor: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 0,
  },
  visitPanelHeader: {
    marginBottom: 12,
  },
  visitPanelTitle: {
    margin: "0 0 4px 0",
    fontSize: 14,
    fontWeight: 700,
    color: "#0c4a6e",
  },
  visitPanelHint: {
    margin: 0,
    fontSize: 12,
    color: "#0369a1",
  },
  visitControlsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    alignItems: "flex-end",
  },
  visitSelectContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  visitSelectLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#0c4a6e",
  },
  visitSelectDropdown: {
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #7dd3fc",
    backgroundColor: "#fff",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    color: "#1f2937",
    transition: "all 0.2s",
  },
  ageReadoutCompact: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  ageReadoutLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#0c4a6e",
  },
  ageReadoutValue: {
    fontSize: 16,
    fontWeight: 700,
    color: "#0c4a6e",
    padding: "8px 12px",
    backgroundColor: "#e0f2fe",
    borderRadius: 6,
    border: "1px solid #7dd3fc",
  },
  saveBtnCompact: {
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 16px",
    borderRadius: 6,
    border: "1px solid #22c55e",
    backgroundColor: "#22c55e",
    color: "#fff",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "all 0.2s",
  },
  saveBtnCompactSaved: {
    backgroundColor: "#16a34a",
    borderColor: "#16a34a",
  },
  saveTick: {
    fontSize: 14,
    fontWeight: 800,
  },

  legendRedesigned: {
    padding: "16px 24px",
    backgroundColor: "#faf5ff",
    borderBottom: "1px solid #e9d5ff",
  },
  legendContent: {
    display: "flex",
    gap: 20,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  legendItemNew: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "#374151",
    fontWeight: 500,
  },
  legendGlyph: {
    display: "inline-block",
    width: 12,
    height: 12,
    backgroundColor: "#111827",
  },
  warningBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 12px",
    backgroundColor: "#fef3c7",
    border: "1px solid #fcd34d",
    borderRadius: 6,
    fontSize: 11,
    color: "#92400e",
  },
  warningIcon: {
    fontSize: 14,
    minWidth: 16,
    display: "flex",
  },
  warningText: {
    fontWeight: 500,
  },

  itemsAtAgePanel: {
    marginTop: 0,
    marginBottom: 16,
    marginLeft: 24,
    marginRight: 24,
    padding: 16,
    backgroundColor: "#f0fdf4",
    border: "1px solid #86efac",
    borderRadius: 8,
  },
  itemsAtAgeTitle: {
    margin: "0 0 4px 0",
    fontSize: 14,
    fontWeight: 700,
    color: "#166534",
  },
  itemsAtAgeSubtitle: {
    margin: "0 0 12px 0",
    fontSize: 12,
    color: "#4b5563",
    fontWeight: 500,
  },
  itemsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
    gap: 8,
  },
  markableItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    backgroundColor: "#fff",
    cursor: "pointer",
    transition: "all 0.2s",
    userSelect: "none" as const,
  },
  markableItemInRange: {
    backgroundColor: "#dbeafe",
    borderColor: "#93c5fd",
  },
  markableItemMarked: {
    backgroundColor: "#86efac",
    borderColor: "#4ade80",
    fontWeight: 600,
  },
  itemNumber: {
    fontSize: 12,
    fontWeight: 700,
    color: "#1f2937",
    minWidth: 24,
  },
  itemLabelText: {
    fontSize: 12,
    color: "#374151",
    flex: 1,
  },
  checkmark: {
    fontSize: 16,
    color: "#16a34a",
    fontWeight: 700,
  },

  scrollWrapperOuter: {
    margin: "0 24px 24px 24px",
    overflowX: "auto",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    backgroundColor: "#fafafa",
  },
  axisLabel: {
    textAlign: "center",
    fontSize: 10,
    fontWeight: 700,
    color: "#1f2937",
    margin: "4px 0",
  },

  warningFooter: {
    marginTop: 0,
    marginLeft: 24,
    marginRight: 24,
    marginBottom: 16,
    fontSize: 12,
    color: "#92400e",
    backgroundColor: "#fef3c7",
    border: "1px solid #fcd34d",
    borderRadius: 6,
    padding: "8px 12px",
  },
};